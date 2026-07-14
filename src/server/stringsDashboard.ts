
import { Router } from "express";
import {
  getEmsCachedStatus,
  getEmsCachedBlock,
  getEmsCachedStatusCodes,
  getEmsCachedRawStrings,
  getEmsCachedControllerStatistics,
  getEmsCachedLastCall,
  getEmsIpMap,
  getEmsStringIpMap,
  getEmsSourcesDebugInfo,
  getEmsCachedArrayReports,
  emsCache,
} from "./emsTurtleClient";
import { ProfileStore } from "./profiles/profileStore";

import * as prizmCache from "./cache/prizmCache";
import * as prizmHistory from "./history/prizmHistory";
import { BESS_STATUS_CODE_MAP, describeBessStatusCode, classifyBessStatusCode } from "../lib/bessStatusCodes";
import { classifyStringOperationalState } from "../lib/stringClassifier";
import { stringNumberToEnergySegment, formatStringEsLabel } from "../lib/stringToEsMapper";
import { applyCanonicalStringSnapshot } from "./normalizers/canonicalStringSnapshot";
import { getLatestContactorSnapshot, triggerContactorRefresh, mergeContactorStateIntoStringRow } from "./contactorStateEngine";
import { analyzeContactorStates, analyzeHvacDevices, summarizeCorrectiveActions } from "./correctiveActionsEngine";
import { normalizeFeatherHvacCorrectiveFindings } from "./normalizers/featherHvacCorrectiveNormalizer";
import { getTelemetryCycleId } from "./telemetry/TelemetryCycleContext";
import {
  buildCanonicalStringIndexes,
  createNormalizationFingerprint,
  cycleNormalizationCache,
  normalizationMetrics,
  registerCanonicalStringIndexes,
} from "./telemetry/normalization";
import { stringViewerScheduler, StringViewerCacheEntry } from "./telemetry/stringviewer";
import { telemetryMetrics } from "./telemetry/metrics";
import { graphIdentityResolver } from "./topology/GraphIdentityResolver";

const router = Router();
const stringViewerProvenance = new WeakMap<object, {
    baselineSource: "strings.csv";
    enrichmentSource: string | null;
    enrichmentAgeMs: number | null;
    enrichmentStale: boolean;
    enrichmentCycleId: number | null;
}>();

export function getStringViewerProvenance(row: object) {
    const value = stringViewerProvenance.get(row);
    return value ? { ...value } : null;
}

type LatchedCorrectiveFinding = {
  finding: any;
  firstSeenAt: number;
  lastSeenAt: number;
  healthyPolls: number;
};

const hvacCorrectiveFindingLatch = new Map<string, LatchedCorrectiveFinding>();

const HVAC_CORRECTIVE_LATCH_CLEAR_AFTER_HEALTHY_POLLS = 3;
const HVAC_CORRECTIVE_LATCH_MAX_AGE_MS = 90_000;

function getNormalizedFeatherDevicesFromDashboardInputs(...sources: any[]): any[] {
  for (const source of sources) {
    const candidates = [
      source?.normalized?.feather,
      source?.snapshot?.normalized?.feather,
      source?.siteData?.normalized?.feather,
      source?.devices,
      source?.featherDevices,
      source?.feather?.devices,
      source?.feather
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate) && candidate.length > 0) return candidate;
    }
  }

  return [];
}


function getCorrectiveFindingLatchKey(finding: any): string {
  const category = finding?.category || "unknown";
  const subsystem = finding?.subsystem || "unknown";
  const strategy = finding?.remediationStrategyId || finding?.id || finding?.title || "finding";
  const arrayNumber = finding?.arrayNumber ?? finding?.evidence?.arrayNumber ?? "A?";
  const stringNumber = finding?.stringNumber ?? finding?.evidence?.stringNumber ?? "S?";
  const hvacUnit =
    finding?.evidence?.hvacUnit ||
    finding?.evidence?.hvac ||
    (String(finding?.title || "").includes("HVAC 1") ? "HVAC1" :
     String(finding?.title || "").includes("HVAC 2") ? "HVAC2" :
     "HVAC?");
  const deviceIp = finding?.evidence?.deviceIp || finding?.deviceIp || "";
  return [category, subsystem, strategy, arrayNumber, stringNumber, hvacUnit, deviceIp].join("|");
}

function applyHvacCorrectiveFindingLatch(currentFindings: any[]): any[] {
  const now = Date.now();
  const activeKeys = new Set<string>();

  const passthrough: any[] = [];
  const currentHvac: any[] = [];

  for (const finding of currentFindings || []) {
    const isHvac =
      String(finding?.subsystem || "").toLowerCase() === "hvac" ||
      String(finding?.title || "").toLowerCase().includes("hvac");

    if (isHvac) currentHvac.push(finding);
    else passthrough.push(finding);
  }

  for (const finding of currentHvac) {
    const key = getCorrectiveFindingLatchKey(finding);
    activeKeys.add(key);

    const existing = hvacCorrectiveFindingLatch.get(key);
    hvacCorrectiveFindingLatch.set(key, {
      finding: {
        ...(existing?.finding || {}),
        ...finding,
        evidence: {
          ...(existing?.finding?.evidence || {}),
          ...(finding?.evidence || {}),
          latched: true,
          firstSeenAt: existing?.firstSeenAt ? new Date(existing.firstSeenAt).toISOString() : new Date(now).toISOString(),
          lastSeenAt: new Date(now).toISOString(),
          healthyPolls: 0
        }
      },
      firstSeenAt: existing?.firstSeenAt || now,
      lastSeenAt: now,
      healthyPolls: 0
    });
  }

  for (const [key, entry] of Array.from(hvacCorrectiveFindingLatch.entries())) {
    if (!activeKeys.has(key)) {
      entry.healthyPolls += 1;

      const expiredByHealthyPolls = entry.healthyPolls >= HVAC_CORRECTIVE_LATCH_CLEAR_AFTER_HEALTHY_POLLS;
      const expiredByAge = now - entry.lastSeenAt > HVAC_CORRECTIVE_LATCH_MAX_AGE_MS;

      if (expiredByHealthyPolls || expiredByAge) {
        hvacCorrectiveFindingLatch.delete(key);
      } else {
        hvacCorrectiveFindingLatch.set(key, {
          ...entry,
          finding: {
            ...entry.finding,
            evidence: {
              ...(entry.finding?.evidence || {}),
              latched: true,
              lastSeenAt: new Date(entry.lastSeenAt).toISOString(),
              healthyPolls: entry.healthyPolls,
              latchStatus: `Retained pending ${HVAC_CORRECTIVE_LATCH_CLEAR_AFTER_HEALTHY_POLLS} healthy polls`
            }
          }
        });
      }
    }
  }

  const latchedHvacFindings = Array.from(hvacCorrectiveFindingLatch.values()).map((entry) => entry.finding);

  return [
    ...passthrough,
    ...latchedHvacFindings
  ];
}


type StringDetailCacheEntry = {
  arrayNumber: number;
  stringNumber: number;
  endpoint: string;
  url: string;
  ok: boolean;
  httpStatus: number | null;
  lastUpdated: string;
  data: any;
  error?: string;
};
const stringDetailCache = new Map<string, StringDetailCacheEntry>();
const getStringDetailCacheKey = (arrayNumber: number, stringNumber: number) =>
  `A${arrayNumber}-S${stringNumber}`;

export function normalizeCellVoltageMv(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  // Values like 3.272 are volts-per-cell and should become 3272 mV.
  if (n > 0 && n < 10) return Math.round(n * 1000);
  // Values like 3272 are already mV.
  if (n >= 1000 && n <= 5000) return Math.round(n);
  // Values like 3272000 are accidentally over-scaled display artifacts.
  // Convert back to mV when clearly over-scaled.
  if (n >= 1000000 && n <= 5000000) return Math.round(n / 1000);
  return Math.round(n);
}

export const getCachedStringDetail = (arrayNumber: number, stringNumber: number) => {
    return stringDetailCache.get(getStringDetailCacheKey(arrayNumber, stringNumber)) ?? null;
};

function pN(val: any, def: number | null = null): number | null {
  if (val === undefined || val === null || val === "") return def;
  const n = Number(val);
  return isNaN(n) ? def : n;
}

const finite = (value: any): number | null => {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

function normalizeHeader(h: string): string {
    return h.toLowerCase().replace(/[\s_\-\.]/g, "");
}

function parseBoolean(val: any): boolean {
    if (val === true) return true;
    if (val === "true" || val === "TRUE" || val === "1" || val === 1) return true;
    return false;
}

function parseNullableBool(val: any): boolean | null {
    if (val === undefined || val === null || val === "") return null;
    if (val === true) return true;
    if (val === false) return false;
    const s = String(val).toUpperCase().trim();
    if (s === "TRUE" || s === "1" || s === "YES" || s === "CLOSED" || s === "ONLINE" || s === "ON" || s === "IN") return true;
    if (s === "FALSE" || s === "0" || s === "NO" || s === "OPEN" || s === "OFFLINE" || s === "OFF" || s === "OUT") return false;
    if (s === "UNKNOWN" || s === "PENDING" || s === "--" || s === "NULL") return null;
    return null;
}

export function buildCanonicalStringState(s: any): any {
    const arrayIndex = pN(s.arrayNumber || s.arrayIndex) || 1;
    const stringNumber = pN(s.stringNumber || s.stringIndex) || 1;
    
    const localEsNumber = Math.ceil(stringNumber / 2);
    const pairedStringNumber = stringNumber % 2 === 0 ? stringNumber - 1 : stringNumber + 1;
    const featherLastOctet = 10 + ((localEsNumber - 1) * 5);
    const featherIp = `10.0.${arrayIndex}.${featherLastOctet}`;
    const canonicalKey = `array:${arrayIndex}:string:${stringNumber}`;
    const displayName = `A${arrayIndex}-S${stringNumber}`;
    const sourcePath = s.sourcePath || s.identity?.sourcePath || "unknown";

    let communicating = parseNullableBool(s.communicating);
    let inRotation = parseNullableBool(s.inRotation);
    let outOfRotation = parseNullableBool(s.outRotation ?? s.outOfRotation);

    let pos = parseNullableBool(s.positiveContactorClosed);
    let neg = parseNullableBool(s.negativeContactorClosed);
    let exp = parseNullableBool(s.contactorsCloseExpected);
    const recloseCount = pN(s.recloseCount);

    if (outOfRotation === null && inRotation !== null) {
        outOfRotation = !inRotation;
    }
    const finalInRotationCheck = outOfRotation === false ? true : (outOfRotation === true ? false : null);

    let bothContactorsClosed: boolean | null = null;
    let contactorFeedbackKnown = false;
    let contactorMismatch = false;
    let contactorDisplayState = "UNKNOWN";

    if (pos === true && neg === true) {
        bothContactorsClosed = true;
        contactorFeedbackKnown = true;
        contactorMismatch = false;
        contactorDisplayState = "CLOSED";
    } else if (pos === false && neg === false) {
        bothContactorsClosed = false;
        contactorFeedbackKnown = true;
        contactorMismatch = false;
        contactorDisplayState = "OPEN";
    } else if (pos === false || neg === false) {
        bothContactorsClosed = false;
        contactorFeedbackKnown = (pos !== null && neg !== null);
        contactorMismatch = (pos === true || neg === true || pos === null || neg === null);
        contactorDisplayState = "OPEN / PARTIAL";
    } else {
        bothContactorsClosed = null;
        contactorFeedbackKnown = false;
        contactorMismatch = false;
        contactorDisplayState = "UNKNOWN";
    }

    let commandMatchesContactors: boolean | null = null;
    if (exp === true && bothContactorsClosed === true) {
        commandMatchesContactors = true;
    } else if (exp === false && bothContactorsClosed === false) {
        commandMatchesContactors = true;
    } else if (typeof exp === "boolean" && typeof bothContactorsClosed === "boolean") {
        commandMatchesContactors = false;
    } else {
        commandMatchesContactors = null;
    }

    let finalOutRotation = outOfRotation;
    if (finalOutRotation === null) {
        if (inRotation === true) finalOutRotation = false;
        else if (inRotation === false) finalOutRotation = true;
    }
    const finalInRotation = finalOutRotation === false ? true : (finalOutRotation === true ? false : null);

    const rotationDisplayState = finalInRotation === true ? "IN" : (finalOutRotation === true ? "OUT" : "UNKNOWN");
    const commDisplayState = communicating === true ? "ONLINE" : (communicating === false ? "OFFLINE" : "UNKNOWN");

    let opBucket: "online" | "nearline" | "offline" | "notCommunicating" | "unknown" = "unknown";
    let classifierReason = "unknown";

    if (communicating === false) {
        opBucket = "notCommunicating";
        classifierReason = "not_communicating";
    } else if (communicating !== true) {
        opBucket = "unknown";
        classifierReason = "missing_communication_feedback";
    } else if (finalOutRotation === true) {
        opBucket = "offline";
        classifierReason = "out_of_rotation";
    } else if (finalInRotation !== true) {
        opBucket = "unknown";
        classifierReason = "missing_rotation_feedback";
    } else if (bothContactorsClosed === true) {
        opBucket = "online";
        classifierReason = "communicating_in_rotation_contactors_closed";
    } else if (bothContactorsClosed === false) {
        opBucket = "nearline";
        classifierReason = "communicating_in_rotation_contactors_open";
    } else {
        opBucket = "unknown";
        classifierReason = "missing_contactor_feedback";
    }

    const alarmCount = pN(s.alarmCount) || 0;
    const warningCount = pN(s.warningCount) || 0;
    let operationalState = "UNKNOWN";

    if (opBucket === "online") {
        if (alarmCount > 0) operationalState = "ALARM";
        else if (warningCount > 0) operationalState = "WARNING";
        else operationalState = "NORMAL";
    } else if (opBucket === "nearline") {
        if (alarmCount > 0) operationalState = "ALARM";
        else if (warningCount > 0) operationalState = "WARNING";
        else operationalState = "NEARLINE";
    } else if (opBucket === "offline") {
        operationalState = "OFFLINE";
    } else if (opBucket === "notCommunicating") {
        operationalState = "NOT_COMMUNICATING";
    } else {
        operationalState = "UNKNOWN";
    }

    let knownCount = 0;
    if (s.bpcs && Array.isArray(s.bpcs) && s.bpcs.length > 0) {
        knownCount = s.bpcs.length;
    } else if (s.bpcCount !== null && s.bpcCount !== undefined && s.bpcCount > 0) {
        knownCount = s.bpcCount;
    } else {
        knownCount = 0;
    }

    const measuredVoltage = s.measuredVoltage !== undefined ? s.measuredVoltage : null;
    const calculatedVoltage = s.calculatedVoltage !== undefined ? s.calculatedVoltage : null;
    const busVoltage = s.busVoltage !== undefined ? s.busVoltage : null;
    const currentA = s.amps !== undefined ? s.amps : null;
    const powerKw = s.kw !== undefined ? s.kw : null;
    const socPct = s.socPct !== undefined ? s.socPct : null;
    const energyKwh = s.kwh !== undefined ? s.kwh : (s.kWh !== undefined ? s.kWh : null);

    const minCellVoltageMv = normalizeCellVoltageMv(s.minCellVoltage);
    const maxCellVoltageMv = normalizeCellVoltageMv(s.maxCellVoltage);
    const avgCellVoltageMv = normalizeCellVoltageMv(s.avgCellVoltage);
    const deltaCellVoltageMv = (maxCellVoltageMv !== null && minCellVoltageMv !== null) ? (maxCellVoltageMv - minCellVoltageMv) : null;

    const minCellTempF = s.minCellTemperature !== undefined ? s.minCellTemperature : null;
    const maxCellTempF = s.maxCellTemperature !== undefined ? s.maxCellTemperature : null;
    const avgCellTempF = s.avgCellTemperature !== undefined ? s.avgCellTemperature : null;
    const deltaCellTempF = (maxCellTempF !== null && minCellTempF !== null) ? Number((maxCellTempF - minCellTempF).toFixed(1)) : null;

    const activeWarnings = s.warnings || [];
    const activeFaults = s.alarms || [];
    const healthy = alarmCount === 0 && warningCount === 0;
    const severity = alarmCount > 0 ? "CRITICAL" : (warningCount > 0 ? "WARNING" : "OK");

    const canonicalState: any = {
        identity: {
            arrayIndex,
            stringNumber,
            canonicalKey,
            displayName,
            localEsNumber,
            pairedStringNumber,
            featherIp,
            sourcePath
        },
        communication: {
            communicating: communicating,
            displayState: commDisplayState,
            rawValue: s.stringConnectionState || null,
            source: s.metricSource || "direct",
            sourcePath
        },
        rotation: {
            inRotation: finalInRotation,
            outOfRotation: finalOutRotation,
            displayState: rotationDisplayState,
            rawValue: s.outRotation !== undefined ? s.outRotation : null,
            source: "direct",
            sourcePath
        },
        contactors: {
            positiveContactorClosed: pos,
            negativeContactorClosed: neg,
            bothContactorsClosed,
            contactorFeedbackKnown,
            contactorMismatch,
            contactorsCloseExpected: exp,
            commandMatchesContactors,
            recloseCount,
            displayState: contactorDisplayState,
            source: "direct",
            sourcePath
        },
        electrical: {
            measuredVoltage,
            calculatedVoltage,
            busVoltage,
            currentA,
            powerKw,
            socPct,
            energyKwh,
            minCellVoltageMv,
            maxCellVoltageMv,
            avgCellVoltageMv,
            deltaCellVoltageMv,
            minCellTempF,
            maxCellTempF,
            avgCellTempF,
            deltaCellTempF
        },
        balancing: {
            balancingCount: s.balanceCount !== undefined ? s.balanceCount : null,
            balancingMode: s.balanceMode || "--",
            balancingCellGroups: s.balanceDetails || []
        },
        bpcs: {
            knownCount,
            expectedCount: 14,
            source: s.bpcs && s.bpcs.length > 0 ? "stringviewer-monitor" : "default"
        },
        health: {
            operationalBucket: opBucket.charAt(0).toUpperCase() + opBucket.slice(1),
            healthy,
            severity,
            activeWarnings,
            activeFaults,
            findings: s.findings || []
        },
        sourceDebug: {
            canonicalKey,
            primarySource: "ems-turtle",
            listSourcePath: "/tools/report/ems/strings.csv",
            detailSourcePath: `/tools/monitor/ems/stringviewer/array/${arrayIndex}/${stringNumber}/data`,
            rawStringReportPath: `/tools/report/ems/array/${arrayIndex}/string/${stringNumber}/report.json`,
            rawArrayReportPath: `/tools/report/ems/array/${arrayIndex}/report.json`,
            communicationRaw: s.stringConnectionState || null,
            rotationRaw: s.outRotation !== undefined ? s.outRotation : null,
            contactorRaw: { positive: pos, negative: neg, expected: exp },
            electricalRaw: { measuredVoltage, calculatedVoltage, amps: currentA, kw: powerKw },
            bpcRaw: s.bpcs || [],
            normalizedCommunication: communicating,
            normalizedRotation: finalInRotation,
            normalizedContactors: { bothClosed: bothContactorsClosed, mismatch: contactorMismatch },
            operationalBucket: opBucket,
            classifierInputs: { communicating, outRotation: finalOutRotation, positiveContactorClosed: pos, negativeContactorClosed: neg },
            classifierReason,
            sourceTimestamp: s.timestampUtc || null,
            enrichmentApplied: s.enrichmentApplied || false,
            reclassifiedAfterEnrichment: s.reclassifiedAfterEnrichment || false,
            stale: s.stale ?? false,
            sourceStatus: s.sourceStatus ?? "live",
            missingPollCount: s.consecutiveMisses ?? 0,
            warmingUp: s.isWarmup ?? false,
            lastSuccessfulPollAt: s.lastSuccessfulPollAt ?? null,
            conflicts: []
        }
    };

    const merged = {
        ...s,
        ...canonicalState,
        arrayIndex,
        stringNumber,
        stringKey: displayName,
        communicating,
        outRotation: finalOutRotation,
        inRotation: finalInRotation,
        positiveContactorClosed: pos,
        negativeContactorClosed: neg,
        contactorClosed: bothContactorsClosed,
        bothContactorsClosed,
        contactorStatus: contactorDisplayState === "CLOSED" ? "CLOSED" : (contactorDisplayState === "UNKNOWN" ? "UNKNOWN" : "OPEN"),
        contactorsCloseExpected: exp,
        commandMatchesContactors,
        rotationStatus: rotationDisplayState,
        rotationEnabled: finalInRotation === true,
        bucket: opBucket,
        operationalState,
        classification: {
            state: opBucket,
            bucket: opBucket,
            reason: classifierReason,
            communicating,
            inRotation: finalInRotation,
            contactorsClosed: bothContactorsClosed
        }
    };

    return merged;
}

function tryGetField(row: any, normalizedObject: Record<string, any>, possibleNames: string[]): any {
    for (const n of possibleNames) {
        if (row[n] !== undefined) return row[n];
        const norm = normalizeHeader(n);
        if (normalizedObject[norm] !== undefined) return normalizedObject[norm];
    }
    return undefined;
}

function findBatteryPackList(row: any, arrayNumber: number, stringNumber: number, lcStrBase: any, blockStrBase: any, lastCallWrapper: any, blockWrapper: any): any[] | null {
    if (lcStrBase) {
        if (Array.isArray(lcStrBase.batteryPackReportList)) return lcStrBase.batteryPackReportList;
        if (Array.isArray(lcStrBase.batteryPacks)) return lcStrBase.batteryPacks;
        if (Array.isArray(lcStrBase.packs)) return lcStrBase.packs;
        if (Array.isArray(lcStrBase.bpcs)) return lcStrBase.bpcs;
        if (lcStrBase.raw && Array.isArray(lcStrBase.raw.batteryPackReportList)) return lcStrBase.raw.batteryPackReportList;
    }
    if (blockStrBase) {
        if (Array.isArray(blockStrBase.batteryPackReportList)) return blockStrBase.batteryPackReportList;
        if (Array.isArray(blockStrBase.batteryPacks)) return blockStrBase.batteryPacks;
        if (Array.isArray(blockStrBase.packs)) return blockStrBase.packs;
        if (Array.isArray(blockStrBase.bpcs)) return blockStrBase.bpcs;
    }
    if (blockWrapper?.data?.arrays) {
        const arr = blockWrapper.data.arrays[arrayNumber - 1];
        if (arr && arr.strings) {
            const strObj = arr.strings[stringNumber - 1];
            if (strObj) {
                if (Array.isArray(strObj.batteryPackReportList)) return strObj.batteryPackReportList;
                if (Array.isArray(strObj.batteryPacks)) return strObj.batteryPacks;
            }
        }
    }
    if (lastCallWrapper?.data?.arrays) {
        const arr = lastCallWrapper.data.arrays[arrayNumber - 1];
        if (arr && arr.strings) {
            const strObj = arr.strings[stringNumber - 1];
            if (strObj) {
                if (Array.isArray(strObj.batteryPackReportList)) return strObj.batteryPackReportList;
                if (Array.isArray(strObj.batteryPacks)) return strObj.batteryPacks;
            }
        }
    }
    if (row) {
        if (Array.isArray(row.batteryPackReportList)) return row.batteryPackReportList;
        if (Array.isArray(row.batteryPacks)) return row.batteryPacks;
        if (row.raw && Array.isArray(row.raw.batteryPackReportList)) return row.raw.batteryPackReportList;
    }
    return null;
}

function extractBpcBalancing(item: any, idx: number) {
    const data = item?.batteryPackData || item;
    const config = data?.batteryPackBalancingConfiguration || data?.balancingConfiguration || data;

    const bpIndex = item?.bpIndex ?? item?.batteryPackIndex ?? item?.packIndex ?? item?.index ?? (idx + 1);

    const modeRaw = config?.balancingMode ?? config?.mode ?? null;
    const providedVoltageTarget = config?.providedVoltageTarget ?? config?.voltageTarget ?? config?.targetVoltage ?? null;
    const chargeBalancingPermitted = config?.chargeBalancingPermitted ?? config?.chargePermitted ?? null;
    const dischargeBalancingPermitted = config?.dischargeBalancingPermitted ?? config?.dischargePermitted ?? null;
    const chargeDeadband = config?.chargeDeadband ?? null;
    const dischargeDeadband = config?.dischargeDeadband ?? null;
    const commandTimeToLive = config?.commandTimeToLive ?? config?.ttl ?? null;
    const balancingSource = config?.balancingSource ?? config?.source ?? null;

    const balancingCellGroup = data?.balancingCellGroup ?? data?.balancingCgIndex ?? data?.cgIndex ?? null;
    const stateRaw = data?.balancingState ?? data?.state ?? data?.activeBalancingState ?? null;

    const chargeBalancing =
      data?.chargeBalancing ??
      item?.chargeBalancing ??
      config?.chargeBalancing ??
      null;
    const dischargeBalancing =
      data?.dischargeBalancing ??
      item?.dischargeBalancing ??
      config?.dischargeBalancing ??
      null;

    const formatBalanceMode = (mRaw: any, targetVal: any): string => {
        const raw = String(mRaw || "").toUpperCase();
        const target = Number(targetVal);
        if (raw.includes("PROVIDED")) {
            return Number.isFinite(target) ? `Provided (${target})` : "Provided";
        }
        if (raw.includes("AVERAGE")) {
            return "Average";
        }
        if (!raw) {
            return "--";
        }
        return raw
            .replace(/^BALANCE_TO_/, "")
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/\b\w/g, c => c.toUpperCase());
    };

    const mode = formatBalanceMode(modeRaw, providedVoltageTarget);

    const formatBalanceState = (sRaw: any): string => {
        const raw = String(sRaw || "").toUpperCase();
        if (!raw) return "Unknown";
        if (raw.includes("OFF")) return "Off";
        if (raw.includes("DISCHARGE") && raw.includes("ON")) return "Discharging";
        if (raw.includes("CHARGE") && raw.includes("ON")) return "Charging";
        if (raw.includes("ON")) return "On";
        return raw
            .replace(/^BATTERY_PACK_/, "")
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/\b\w/g, c => c.toUpperCase());
    };

    let state = "Unknown";
    if (chargeBalancing === true) {
      state = "Charging";
    } else if (dischargeBalancing === true) {
      state = "Discharging";
    } else if (chargeBalancing === false || dischargeBalancing === false) {
      state = "Off";
    } else {
      state = formatBalanceState(stateRaw);
    }

    let derivedActiveFromState = false;
    if (formatBalanceState(stateRaw) !== "Off" && formatBalanceState(stateRaw) !== "Unknown") {
        derivedActiveFromState = true;
    } else if (stateRaw) {
        const raw = String(stateRaw).toUpperCase();
        if (raw !== "BALANCING_OFF" && (
            raw.includes("ON") ||
            (raw.includes("CHARGE") && raw.includes("ON")) ||
            (raw.includes("DISCHARGE") && raw.includes("ON"))
        )) {
            derivedActiveFromState = true;
        }
    } else {
        if (item.active === true || item.balancingActive === true || data.active === true || data.balancingActive === true) {
            derivedActiveFromState = true;
        }
    }

    const isActive =
      chargeBalancing === true ||
      dischargeBalancing === true ||
      derivedActiveFromState === true;

    const balanceTelemetryPresent = chargeBalancing !== null || dischargeBalancing !== null || stateRaw !== null || modeRaw !== null;

    return {
        bpIndex,
        mode,
        modeRaw,
        providedVoltageTarget,
        state,
        stateRaw,
        balancingCellGroup,
        chargeBalancingPermitted,
        dischargeBalancingPermitted,
        chargeDeadband,
        dischargeDeadband,
        commandTimeToLive,
        balancingSource,
        chargeBalancing,
        dischargeBalancing,
        balanceTelemetryPresent,
        isActive
    };
}

const EXPECTED_BPCS_PER_STRING = 14;
function normalizeBalanceDetailsToExpectedBpcs(details: any[], expectedCount = EXPECTED_BPCS_PER_STRING) {
  const byIndex = new Map<number, any>();
  for (const d of details || []) {
    const idx = Number(d.bpIndex ?? d.bpcNumber ?? d.batteryPackIndex);
    if (Number.isFinite(idx) && idx >= 1) {
      byIndex.set(idx, d);
    }
  }
  const normalized = [];
  for (let i = 1; i <= expectedCount; i++) {
    const existing = byIndex.get(i);
    if (existing) {
      normalized.push({
        ...existing,
        bpIndex: i,
        bpcNumber: i,
        state: existing.state && existing.state !== "Unknown" ? existing.state : "Off",
        displayState: existing.state && existing.state !== "Unknown" ? existing.state : "Off",
        balanceTelemetryPresent: existing.balanceTelemetryPresent ?? true,
        missingFromSource: false
      });
    } else {
      normalized.push({
        bpIndex: i,
        bpcNumber: i,
        mode: "--",
        modeRaw: null,
        providedVoltageTarget: null,
        state: "Not Reported",
        displayState: "Not Reported",
        stateRaw: null,
        balancingCellGroup: null,
        chargeBalancing: null,
        dischargeBalancing: null,
        chargeBalancingPermitted: null,
        dischargeBalancingPermitted: null,
        chargeDeadband: null,
        dischargeDeadband: null,
        commandTimeToLive: null,
        balancingSource: null,
        balanceTelemetryPresent: false,
        missingFromSource: true,
        isActive: false
      });
    }
  }
  return normalized;
}

router.get("/dump", (req, res) => {
    res.json({
        rawStrings: getEmsCachedRawStrings(),
        debug: getEmsSourcesDebugInfo()
    });
});

export async function warmStringDetailCacheForKnownRows(rows: any[], options?: { limit?: number; concurrency?: number; maxAgeMs?: number }): Promise<void> {
    const concurrency = options?.concurrency ?? 6;
    const maxAgeMs = options?.maxAgeMs ?? 60_000;
    const profile = ProfileStore.getActiveProfile();
    if (!profile) return;
    const baseUrl = `http://${profile.emsHost}:${profile.emsPort}${profile.turtlePath}`;

    const chunks: any[][] = [];
    for (let i = 0; i < rows.length; i += concurrency) {
        chunks.push(rows.slice(i, i + concurrency));
    }

    const now = Date.now();
    for (const chunk of chunks) {
        await Promise.all(chunk.map(async (row) => {
            if (!row.arrayNumber || !row.stringNumber) return;
            const key = getStringDetailCacheKey(row.arrayNumber, row.stringNumber);
            const existing = stringDetailCache.get(key);
            if (existing && existing.ok) {
                const age = now - new Date(existing.lastUpdated).getTime();
                if (age < maxAgeMs) return;
            }

            const endpoint = `/tools/report/ems/array/${row.arrayNumber}/string/${row.stringNumber}/report.json`;
            const stringViewerUrl = `${baseUrl}${endpoint}`;
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);
                const r = await fetch(stringViewerUrl, { signal: controller.signal });
                clearTimeout(timeoutId);
                
                if (r.ok) {
                    const data = await r.json();
                    stringDetailCache.set(key, {
                        arrayNumber: row.arrayNumber,
                        stringNumber: row.stringNumber,
                        endpoint,
                        url: stringViewerUrl,
                        ok: true,
                        httpStatus: r.status,
                        lastUpdated: new Date().toISOString(),
                        data
                    });
                } else {
                    stringDetailCache.set(key, {
                        arrayNumber: row.arrayNumber,
                        stringNumber: row.stringNumber,
                        endpoint,
                        url: stringViewerUrl,
                        ok: false,
                        httpStatus: r.status,
                        lastUpdated: new Date().toISOString(),
                        data: null,
                        error: `HTTP ${r.status}`
                    });
                }
            } catch (err: any) {
                stringDetailCache.set(key, {
                    arrayNumber: row.arrayNumber,
                    stringNumber: row.stringNumber,
                    endpoint,
                    url: stringViewerUrl,
                    ok: false,
                    httpStatus: null,
                    lastUpdated: new Date().toISOString(),
                    data: null,
                    error: err.message
                });
            }
        }));
    }
}

let detailWarmupInFlight: Promise<void> | null = null;
function startStringDetailWarmup(rows: any[]) {
  if (detailWarmupInFlight) return;
  detailWarmupInFlight = warmStringDetailCacheForKnownRows(rows, {
    concurrency: 6,
    maxAgeMs: 60_000
  }).finally(() => {
    detailWarmupInFlight = null;
  });
}

export function mergeStringViewerMonitorFields(row: any, payload: any, entry?: StringViewerCacheEntry): void {
    const sv = payload?.stringViewerDataModel;
    if (!sv) return;
    row.busVoltage = sv.dcBusVoltage ?? row.busVoltage;
    row.outRotation = sv.outRotation ?? row.outRotation;
    row.positiveContactorClosed = sv.positiveContactorClosed ?? row.positiveContactorClosed;
    row.negativeContactorClosed = sv.negativeContactorClosed ?? row.negativeContactorClosed;
    row.contactorsCloseExpected = sv.contactorsCloseExpected ?? row.contactorsCloseExpected;
    row.recloseCount = sv.recloseCount ?? row.recloseCount;
    row.badReport = sv.badReport ?? row.badReport;
    row.fanRequested = sv.lastFanCommand ?? sv.fanCommand ?? sv.requestedFanCommand ?? sv.stringFanRequested ?? row.fanRequested;
    row.fanActual = sv.fanActual ?? sv.fanState ?? sv.fanStatus ?? sv.fanSpeed ?? sv.fanSpeedRpm ?? sv.stringFanActual ?? row.fanActual;
    row.socPct = sv.soc ?? row.socPct;
    row.measuredVoltage = sv.measuredStringVoltage ?? row.measuredVoltage;
    row.calculatedVoltage = sv.calculatedStringVoltage ?? row.calculatedVoltage;
    row.minCellVoltage = sv.minCellGroupVoltage ?? row.minCellVoltage;
    row.maxCellVoltage = sv.maxCellGroupVoltage ?? row.maxCellVoltage;
    row.avgCellVoltage = sv.avgCellGroupVoltage ?? row.avgCellVoltage;
    row.minCellTemperature = sv.minCellGroupTemp ?? row.minCellTemperature;
    row.maxCellTemperature = sv.maxCellGroupTemp ?? row.maxCellTemperature;
    row.avgCellTemperature = sv.avgCellGroupTemp ?? row.avgCellTemperature;
    row.amps = sv.stringCurrent ?? row.amps;
    row.bpcCount = sv.batteryPackCount ?? row.bpcCount;
    row.cellGroupCount = sv.cellGroupCount ?? row.cellGroupCount;
    row.timestampUtc = sv.reportTimestamp ?? row.timestampUtc;
    row.operationalState = sv.stringConnectionState ?? row.operationalState;
    stringViewerProvenance.set(row, {
        baselineSource: "strings.csv",
        enrichmentSource: entry?.sourceUrl ?? "legacy-stringviewer-monitor",
        enrichmentAgeMs: entry?.ageMs ?? 0,
        enrichmentStale: entry?.stale ?? false,
        enrichmentCycleId: entry?.cycleId ?? getTelemetryCycleId(),
    });
}

async function runLegacyStringViewerFanout(rows: any[], baseUrl: string): Promise<void> {
    stringViewerScheduler.metrics.startCycle(getTelemetryCycleId());
    await Promise.allSettled(rows.map(async (row) => {
        const endpoint = `/tools/monitor/ems/stringviewer/array/${row.arrayNumber}/${row.stringNumber}/data`;
        const svUrl = `${baseUrl}${endpoint}`;
        const startedAt = performance.now();
        const endpointMetric = telemetryMetrics.registry.beginEndpoint("ems-turtle", endpoint);
        stringViewerScheduler.metrics.attempted("WARM", 0);
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const response = await fetch(svUrl, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (response.ok) {
                mergeStringViewerMonitorFields(row, await response.json());
                endpointMetric.finish({ success: true, acquisitionTimestamp: new Date(), stale: false });
                stringViewerScheduler.metrics.completed(row.stringKey, "WARM", performance.now() - startedAt, true, false);
            } else {
                endpointMetric.finish({ success: false, acquisitionTimestamp: new Date(), stale: true });
                stringViewerScheduler.metrics.completed(row.stringKey, "WARM", performance.now() - startedAt, false, false);
            }
        } catch (error: any) {
            const timeout = error?.name === "AbortError";
            endpointMetric.finish({ success: false, timeout, acquisitionTimestamp: new Date(), stale: true });
            stringViewerScheduler.metrics.completed(row.stringKey, "WARM", performance.now() - startedAt, false, timeout);
            // Preserve the legacy best-effort behavior and baseline value fallback.
        }
    }));
}

async function runScheduledStringViewerEnrichment(rows: any[], baseUrl: string, cycleId: number | null): Promise<void> {
    const result = await stringViewerScheduler.runCycle(rows, cycleId, baseUrl);
    const mergeStartedAt = performance.now();
    for (const row of rows) {
        const arrayIndex = Number(row?.arrayNumber ?? row?.arrayIndex);
        const stringIndex = Number(row?.stringNumber ?? row?.stringIndex);
        const key = String(row?.stringKey || row?.canonicalKey || `A${arrayIndex}-S${stringIndex}`);
        const entry = result.entries.get(key);
        if (entry?.value != null) mergeStringViewerMonitorFields(row, entry.value, entry);
        else stringViewerProvenance.set(row, {
            baselineSource: "strings.csv",
            enrichmentSource: null,
            enrichmentAgeMs: null,
            enrichmentStale: true,
            enrichmentCycleId: null,
        });
    }
    stringViewerScheduler.metrics.merged(performance.now() - mergeStartedAt);
}

async function normalizeStringsDataUncached(enrich = false, targetArray: number | null = null): Promise<any> {
    const cycleId = getTelemetryCycleId();
    const measure = <T>(name: string, operation: () => T): T => cycleId == null ? operation() : normalizationMetrics.measure(cycleId, "strings", name, operation);
    const counters: Record<string, number> = {};
    const count = (name: string, amount = 1) => { counters[name] = (counters[name] ?? 0) + amount; };
    if (cycleId != null) normalizationMetrics.recordDuration(cycleId, "strings", "repeated deep cloning", 0);
    const finiteVal = (v: any): number | null => {
        count("numeric conversion");
        const num = Number(v);
        return Number.isFinite(num) ? num : null;
    };
    const profile = ProfileStore.getActiveProfile();
    const baseUrl = profile ? `http://${profile.emsHost}:${profile.emsPort}${profile.turtlePath}` : "unknown";

    const sources = measure("raw source selection", () => ({
        rawStringsWrapper: getEmsCachedRawStrings(),
        blockWrapper: getEmsCachedBlock(),
        stringIpMapWrapper: getEmsStringIpMap(),
        ipMapWrapper: getEmsIpMap(),
        lastCallWrapper: getEmsCachedLastCall(),
        statusWrapper: getEmsCachedStatus(),
        controllerStatsWrapper: getEmsCachedControllerStatistics(),
        bessStatusCodesWrapper: getEmsCachedStatusCodes(),
        debugInfo: getEmsSourcesDebugInfo() || {},
    }));
    const { rawStringsWrapper, blockWrapper, stringIpMapWrapper, ipMapWrapper, lastCallWrapper, statusWrapper, controllerStatsWrapper, bessStatusCodesWrapper, debugInfo } = sources;
    count("cache reads", 9);

    const debugInfoArray = Array.isArray(debugInfo) ? debugInfo : [];
    const debugInfoMap: Record<string, any> = {};
    debugInfoArray.forEach((r: any) => {
        debugInfoMap[r.endpoint] = r;
    });

    // Source coverage
    const getSourceHealth = (key: string) => {
        const health = debugInfoMap[key] || { success: false, statusCode: null, durationMs: null, lastError: null };
        return {
            ok: !!health.success,
            httpStatus: health.statusCode || (health.success ? 200 : null),
            durationMs: health.durationMs,
            error: health.lastError === "NONE" ? null : health.lastError,
            url: `${baseUrl}${key}`
        };
    };

    const sourceHealth = {
        stringsCsv: getSourceHealth("/tools/report/ems/strings.csv"),
        lastCall: getSourceHealth("/tools/report/ems/lastCall.json"),
        stringIpMap: getSourceHealth("/tools/report/ems/stringIPMap.json"),
        ipMap: getSourceHealth("/tools/report/ems/ipMap.json"),
        blockviewer: getSourceHealth("/tools/monitor/ems/blockviewer/data"),
        status: getSourceHealth("/tools/report/ems/status.json"),
        controllerStatistics: getSourceHealth("/tools/report/ems/controllerStatistics.json"),
        bessStatusCodes: getSourceHealth("/tools/report/ems/bessStatusCodes.json")
    };

    const stringIpMap = (stringIpMapWrapper.data && Array.isArray(stringIpMapWrapper.data)) ? stringIpMapWrapper.data : [];
    const ipMap = (ipMapWrapper.data && Array.isArray(ipMapWrapper.data)) ? ipMapWrapper.data : [];

    let lastCallStrings: any[] = [];
    let lastCallArrays: any[] = [];
    if (lastCallWrapper.data) {
        if (Array.isArray(lastCallWrapper.data.strings)) lastCallStrings = lastCallWrapper.data.strings;
        if (Array.isArray(lastCallWrapper.data.arrays)) lastCallArrays = lastCallWrapper.data.arrays;
    }

    const arrayReports = getEmsCachedArrayReports() || {};
    const directLastCallForDashboard = lastCallWrapper.data || null;

    const sourceIndexStartedAt = performance.now();
    const rowKey = (arrayNumber: unknown, stringNumber: unknown) => `${pN(arrayNumber)}:${pN(stringNumber)}`;
    const blockStringsByKey = new Map<string, any>();
    for (const row of Array.isArray(blockWrapper.data?.strings) ? blockWrapper.data.strings : []) {
        const key = rowKey(row.array, row.string);
        if (!blockStringsByKey.has(key)) blockStringsByKey.set(key, row);
    }
    const lastCallStringsByKey = new Map<string, any>();
    for (const row of lastCallStrings) {
        const key = rowKey(row.array, row.string);
        if (!lastCallStringsByKey.has(key)) lastCallStringsByKey.set(key, row);
    }
    for (const arrayRow of lastCallArrays) {
        const arrayNumber = pN(arrayRow.index || arrayRow.arrayIndex);
        for (const row of Array.isArray(arrayRow.strings) ? arrayRow.strings : []) {
            const key = rowKey(arrayNumber, row.index || row.stringIndex);
            if (!lastCallStringsByKey.has(key)) lastCallStringsByKey.set(key, row);
        }
    }
    const csvRowsByKey = new Map<string, { row: any; aliases: Record<string, any> }>();
    for (const row of Array.isArray(rawStringsWrapper.data) ? rawStringsWrapper.data : []) {
        const aliases: Record<string, any> = {};
        for (const [key, value] of Object.entries(row)) aliases[normalizeHeader(key)] = value;
        const key = rowKey(tryGetField(row, aliases, ["array", "arrayindex", "arr"]), tryGetField(row, aliases, ["string", "stringindex", "str"]));
        if (!csvRowsByKey.has(key)) csvRowsByKey.set(key, { row, aliases });
    }
    const stringIpByKey = new Map<string, any>();
    for (const row of stringIpMap) {
        const key = rowKey(row.array, row.string);
        if (!stringIpByKey.has(key)) stringIpByKey.set(key, row);
    }
    const ipByStringKey = new Map<string, any>();
    const ipByPackKey = new Map<string, any>();
    for (const row of ipMap) {
        const key = rowKey(row.array, row.string);
        if (!ipByStringKey.has(key)) ipByStringKey.set(key, row);
        const pack = pN(row.pack || row.bpc);
        if (pack != null) {
            const packKey = `${key}:${pack}`;
            if (!ipByPackKey.has(packKey)) ipByPackKey.set(packKey, row);
        }
    }
    if (cycleId != null) normalizationMetrics.recordDuration(cycleId, "strings", "rollup/index construction", performance.now() - sourceIndexStartedAt);

    const strings: any[] = [];
    
    let totalStrings = 0;
    let normalStrings = 0;
    let warningStrings = 0;
    let alarmStrings = 0;
    let offlineStrings = 0;
    let nearlineStrings = 0;
    let totalBpcs = 0;
    let knownBpcCount = 0;
    let warningBpcs = 0;
    let alarmBpcs = 0;
    
    // global stats
    let gMinV: number | null = null;
    let gMaxV: number | null = null;
    let gSumV = 0;
    let gCountV = 0;
    let gMaxVDelta: number | null = null;

    let gMinT: number | null = null;
    let gMaxT: number | null = null;
    let gSumT = 0;
    let gCountT = 0;
    let gMaxTDelta: number | null = null;
    
    let gWarnCount = 0;
    let gAlarmCount = 0;

    function findRichValueForPackList(detailStringData: any, blockStrBase: any, lcStrBase: any, stringsCsvRow: any, arrayNumber: number, stringNumber: number, lastCallWrapper: any, blockWrapper: any): any[] | null {
        if (detailStringData) {
            if (Array.isArray(detailStringData.batteryPackReportList)) return detailStringData.batteryPackReportList;
            if (Array.isArray(detailStringData.batteryPacks)) return detailStringData.batteryPacks;
            if (Array.isArray(detailStringData.packs)) return detailStringData.packs;
            if (Array.isArray(detailStringData.bpcs)) return detailStringData.bpcs;
        }
        if (blockStrBase) {
            if (Array.isArray(blockStrBase.batteryPackReportList)) return blockStrBase.batteryPackReportList;
            if (Array.isArray(blockStrBase.batteryPacks)) return blockStrBase.batteryPacks;
            if (Array.isArray(blockStrBase.packs)) return blockStrBase.packs;
            if (Array.isArray(blockStrBase.bpcs)) return blockStrBase.bpcs;
        }
        if (lcStrBase) {
            if (Array.isArray(lcStrBase.batteryPackReportList)) return lcStrBase.batteryPackReportList;
            if (Array.isArray(lcStrBase.batteryPacks)) return lcStrBase.batteryPacks;
            if (Array.isArray(lcStrBase.packs)) return lcStrBase.packs;
            if (Array.isArray(lcStrBase.bpcs)) return lcStrBase.bpcs;
        }
        if (stringsCsvRow) {
            if (Array.isArray(stringsCsvRow.batteryPackReportList)) return stringsCsvRow.batteryPackReportList;
            if (Array.isArray(stringsCsvRow.batteryPacks)) return stringsCsvRow.batteryPacks;
            if (Array.isArray(stringsCsvRow.packs)) return stringsCsvRow.packs;
            if (Array.isArray(stringsCsvRow.bpcs)) return stringsCsvRow.bpcs;
        }
        return findBatteryPackList(stringsCsvRow, arrayNumber, stringNumber, lcStrBase, blockStrBase, lastCallWrapper, blockWrapper);
    }

    const rowNormalizationStartedAt = performance.now();
    for (let a = 1; a <= 8; a++) {
        const arrayRep = arrayReports[a]?.data;
        for (let s = 1; s <= 40; s++) {
            const id = `A${a}-S${s}`;
            totalStrings++;

            // 1. Existing string detail cache/report data, if already available and fresh
            const detail = getCachedStringDetail(a, s);
            count("cache reads");
            const detailStringData = detail?.data?.stringData ?? detail?.data ?? null;

            // 2. Block Viewer string data
            const key = `${a}:${s}`;
            const blockStrBase = blockStringsByKey.get(key) || null;

            // 3. lastCall string data
            const lcStrBase = lastCallStringsByKey.get(key) || null;

            // 4. strings.csv fallbacks
            const csvEntry = csvRowsByKey.get(key);
            const stringsCsvRow = csvEntry?.row ?? null;

            // 5. Topology/IP Map
            const sIpInfo = stringIpByKey.get(key);

            const aliasCandidates = [detailStringData, blockStrBase, lcStrBase, stringsCsvRow, sIpInfo]
                .filter((candidate) => candidate != null)
                .map((candidate) => {
                    if (candidate === stringsCsvRow && csvEntry) return { raw: candidate, aliases: csvEntry.aliases };
                    const aliases: Record<string, any> = {};
                    for (const [aliasKey, value] of Object.entries(candidate)) { aliases[normalizeHeader(aliasKey)] = value; count("field alias normalization"); }
                    return { raw: candidate, aliases };
                });

            // Helper to fetch the first non-null, non-undefined, non-empty value in priority order
            const getMetricValue = (keys: string[], parser?: (v: any) => any) => {
                count("field alias resolution");
                for (const candidate of aliasCandidates) {
                    const val = tryGetField(candidate.raw, candidate.aliases, keys);
                    if (val !== undefined && val !== null && val !== "") {
                        return parser ? parser(val) : val;
                    }
                }
                return null;
            };

            // Prioritized extraction of stringConnectionState
            let rawStringConnectionState = null;
            const arrayRep = arrayReports[a]?.data;
            if (arrayRep?.stringReport?.[s]?.stringData?.stringConnectionState !== undefined) {
                rawStringConnectionState = arrayRep.stringReport[s].stringData.stringConnectionState;
            } else if (arrayRep?.stringReport?.[`string${s}`]?.stringData?.stringConnectionState !== undefined) {
                rawStringConnectionState = arrayRep.stringReport[`string${s}`].stringData.stringConnectionState;
            } else if (detailStringData?.stringConnectionState !== undefined && detailStringData?.stringConnectionState !== null) {
                rawStringConnectionState = detailStringData.stringConnectionState;
            } else if (detailStringData?.connectionState !== undefined && detailStringData?.connectionState !== null) {
                rawStringConnectionState = detailStringData.connectionState;
            } else {
                rawStringConnectionState = getMetricValue(["stringconnectionstate", "connectionstate"]);
            }

            // Prioritized extraction of stringContactorState
            let rawStringContactorState = null;
            if (arrayRep?.stringReport?.[s]?.stringData?.stringContactorState !== undefined) {
                rawStringContactorState = arrayRep.stringReport[s].stringData.stringContactorState;
            } else if (arrayRep?.stringReport?.[`string${s}`]?.stringData?.stringContactorState !== undefined) {
                rawStringContactorState = arrayRep.stringReport[`string${s}`].stringData.stringContactorState;
            } else if (detailStringData?.stringContactorState !== undefined && detailStringData?.stringContactorState !== null) {
                rawStringContactorState = detailStringData.stringContactorState;
            } else {
                rawStringContactorState = getMetricValue(["stringcontactorstate", "contactorstate", "contactorstatus"]);
            }

            // Prioritized extraction of stringContactorStateCause
            let rawStringContactorStateCause = null;
            if (arrayRep?.stringReport?.[s]?.stringData?.stringContactorStateCause !== undefined) {
                rawStringContactorStateCause = arrayRep.stringReport[s].stringData.stringContactorStateCause;
            } else if (arrayRep?.stringReport?.[`string${s}`]?.stringData?.stringContactorStateCause !== undefined) {
                rawStringContactorStateCause = arrayRep.stringReport[`string${s}`].stringData.stringContactorStateCause;
            } else if (detailStringData?.stringContactorStateCause !== undefined && detailStringData?.stringContactorStateCause !== null) {
                rawStringContactorStateCause = detailStringData.stringContactorStateCause;
            } else {
                rawStringContactorStateCause = getMetricValue(["stringcontactorstatecause", "contactorstatecause"]);
            }

            let communicating: boolean | null = null;
            const connectionStateUpper = String(rawStringConnectionState || "").toUpperCase().trim();
            if (
                connectionStateUpper.includes("LOSS") || 
                connectionStateUpper.includes("NOT_COMMUNICATING") || 
                connectionStateUpper.includes("NOT_COMM") || 
                connectionStateUpper.includes("OFFLINE_COMM")
            ) {
                communicating = false;
            } else if (
                connectionStateUpper === "ONLINE" || 
                connectionStateUpper === "NEARLINE" || 
                connectionStateUpper === "OFFLINE" ||
                connectionStateUpper === "NORMAL"
            ) {
                communicating = true;
            } else {
                // fallback
                let isOnlineFallback = getMetricValue(["connectionstate", "contact", "communicating", "stringconnectionstate"], (v) => {
                    if (typeof v === "boolean") return v;
                    const sStr = String(v).toUpperCase();
                    return sStr === "ONLINE" || sStr === "NORMAL" || sStr === "TRUE" || sStr === "1";
                });
                communicating = parseNullableBool(isOnlineFallback);
                if (communicating === null) {
                    if (detailStringData || blockStrBase || lcStrBase || stringsCsvRow) {
                        communicating = true;
                    } else {
                        communicating = null;
                    }
                }
            }
            const isOnline = communicating === true;

            let outRotation = parseNullableBool(getMetricValue(["outrotation", "out_rotation", "rotation"]));
            if (connectionStateUpper === "OFFLINE") {
                outRotation = true;
            }
            const inRotation = outRotation === false ? true : (outRotation === true ? false : null);
            const rotationStatus = inRotation === true ? "IN" : (outRotation === true ? "OUT" : "UNKNOWN");
            const rotationEnabled = inRotation === true;

            let positiveContactorClosed: boolean | null = null;
            let negativeContactorClosed: boolean | null = null;
            const contactorStateUpper = String(rawStringContactorState || "").toUpperCase().trim();
            if (contactorStateUpper === "CLOSED") {
                positiveContactorClosed = true;
                negativeContactorClosed = true;
            } else if (contactorStateUpper === "OPEN") {
                positiveContactorClosed = false;
                negativeContactorClosed = false;
            } else {
                // fallback
                positiveContactorClosed = parseNullableBool(getMetricValue(["positivecontactorclosed", "positive_contactor_closed"]));
                negativeContactorClosed = parseNullableBool(getMetricValue(["negativecontactorclosed", "negative_contactor_closed"]));
            }
            const contactorClosed = positiveContactorClosed === true && negativeContactorClosed === true;
            const contactorStatus = contactorClosed ? "CLOSED" : "OPEN";
            const recloseCount = pN(getMetricValue(["reclosecount"]));
            const contactorsCloseExpected = parseNullableBool(getMetricValue(["contactorscloseexpected", "closeexpected"]));

            const connectionPermitKeys = [
                "connectionPermitted",
                "contactorsCloseExpected",
                "closePermitted",
                "canConnect",
                "stringConnectionPermitted",
                "permitClose",
                "readyToConnect"
            ];

            let rawConnectionPermitted = null;
            let matchedKey = null;

            for (const key of connectionPermitKeys) {
                const val = getMetricValue([key]);
                if (val !== null && val !== undefined && val !== "") {
                    rawConnectionPermitted = val;
                    matchedKey = key;
                    break;
                }
            }

            const connectionPermitted = rawConnectionPermitted !== null ? parseBoolean(rawConnectionPermitted) : null;
            const connectionPermittedSource = matchedKey || "unavailable";

            const measuredVoltage = pN(getMetricValue(["measuredvoltage", "voltagemeasured", "voltagemeas", "voltage_measured", "measuredstringvoltage"]));
            const calculatedVoltage = pN(getMetricValue(["calculatedvoltage", "voltagecalculated", "voltagecalc", "voltage_calculated", "calculatedstringvoltage"]));
            const preciseCalculatedVoltage = pN(getMetricValue(["precisecalculatedstringvoltage", "precisecalculatedvoltage", "calculatedstringvoltage", "calculatedvoltage"])) ?? calculatedVoltage;
            const busVoltage = pN(getMetricValue(["busvoltage", "voltagedcbus", "voltagebus", "voltage_bus", "dcbusvoltage"]));
            
            let voltageDelta = null;
            if (measuredVoltage !== null && calculatedVoltage !== null) {
                voltageDelta = Number(Math.abs(measuredVoltage - calculatedVoltage).toFixed(2));
            }

            const amps = pN(getMetricValue(["current", "stringcurrent", "string_current"]));
            const kw = pN(getMetricValue(["kw", "powerkw", "measuredkw", "power_kw"]));
            const socPct = pN(getMetricValue(["soc", "powersoc", "socpct", "soc_pct"]));
            const ah = pN(getMetricValue(["ah", "capacityah", "capacity_ah"]));
            const kwh = pN(getMetricValue(["kwh", "powerkwh", "power_kwh"]));

            const minCellVoltage = pN(getMetricValue(["mincellvoltage", "cellgroupvoltagemin", "cellvoltsmin", "mincellgroupvoltage"]));
            const maxCellVoltage = pN(getMetricValue(["maxcellvoltage", "cellgroupvoltagemax", "cellvoltsmax", "maxcellgroupvoltage"]));
            const avgCellVoltage = pN(getMetricValue(["avgcellvoltage", "cellgroupvoltageavg", "avgcellgroupvoltage"]));
            let cellVoltageDelta = null;
            if (maxCellVoltage !== null && minCellVoltage !== null) {
                cellVoltageDelta = Number((maxCellVoltage - minCellVoltage).toFixed(3));
            }

            const rawMinT = pN(getMetricValue(["mincelltemperature", "mincelltemp", "cellgrouptempmin", "celltempmin", "mincellgrouptemp"]));
            const minCellTemperature = rawMinT !== null ? (rawMinT > 90 ? rawMinT / 10 : rawMinT) : null;

            const rawMaxT = pN(getMetricValue(["maxcelltemperature", "maxcelltemp", "cellgrouptempmax", "celltempmax", "maxcellgrouptemp"]));
            const maxCellTemperature = rawMaxT !== null ? (rawMaxT > 90 ? rawMaxT / 10 : rawMaxT) : null;

            const rawAvgT = pN(getMetricValue(["avgcelltemperature", "avgcelltemp", "cellgrouptempavg", "avgcellgrouptemp"]));
            const avgCellTemperature = rawAvgT !== null ? (rawAvgT > 90 ? rawAvgT / 10 : rawAvgT) : null;

            let cellTemperatureDelta = null;
            if (maxCellTemperature !== null && minCellTemperature !== null) {
                cellTemperatureDelta = Number((maxCellTemperature - minCellTemperature).toFixed(1));
            }

            const packList = findRichValueForPackList(detailStringData, blockStrBase, lcStrBase, stringsCsvRow, a, s, lastCallWrapper, blockWrapper);

            let balanceTelemetryAvailable = false;
            let balanceCount: number | null = null;
            let balanceMode = "--";
            let balanceModeRaw: string | null = null;
            let balanceProvidedVoltageTarget: number | null = null;
            let balanceDetails: any[] = [];

            if (packList && packList.length > 0) {
                balanceTelemetryAvailable = true;
                balanceCount = 0;
                const modesList: string[] = [];
                packList.forEach((item: any, pIdx: number) => {
                    const bpcDetail = extractBpcBalancing(item, pIdx);
                    balanceDetails.push({
                        bpIndex: bpcDetail.bpIndex,
                        mode: bpcDetail.mode,
                        modeRaw: bpcDetail.modeRaw,
                        providedVoltageTarget: bpcDetail.providedVoltageTarget,
                        state: bpcDetail.state,
                        stateRaw: bpcDetail.stateRaw,
                        balancingCellGroup: bpcDetail.balancingCellGroup,
                        chargeBalancing: bpcDetail.chargeBalancing,
                        dischargeBalancing: bpcDetail.dischargeBalancing,
                        balanceTelemetryPresent: bpcDetail.balanceTelemetryPresent,
                        chargeBalancingPermitted: bpcDetail.chargeBalancingPermitted,
                        dischargeBalancingPermitted: bpcDetail.dischargeBalancingPermitted,
                        chargeDeadband: bpcDetail.chargeDeadband,
                        dischargeDeadband: bpcDetail.dischargeDeadband,
                        commandTimeToLive: bpcDetail.commandTimeToLive,
                        balancingSource: bpcDetail.balancingSource,
                        isActive: bpcDetail.isActive
                    });
                    if (bpcDetail.isActive) {
                        balanceCount!++;
                    }
                    if (bpcDetail.mode && bpcDetail.mode !== "--") {
                        modesList.push(bpcDetail.mode);
                        if (!balanceModeRaw && bpcDetail.modeRaw) balanceModeRaw = bpcDetail.modeRaw;
                        if (!balanceProvidedVoltageTarget && bpcDetail.providedVoltageTarget) balanceProvidedVoltageTarget = bpcDetail.providedVoltageTarget;
                    }
                });

                if (modesList.length > 0) {
                    const uniqueModes = Array.from(new Set(modesList));
                    if (uniqueModes.length === 1) {
                        balanceMode = uniqueModes[0];
                    } else {
                        balanceMode = "Mixed";
                    }
                } else {
                    balanceMode = "--";
                }
            } else {
                // Fallback to legacy balance fields
                const legacyBalCount = pN(getMetricValue(["balancecount", "balancingcount"]));
                const legacyBalMode = String(getMetricValue(["balancemode", "balancingmode"]) || "");
                const balanceRaw = String(getMetricValue(["balanceraw", "balancingraw", "balance", "balancing"]) || "");
                
                if (legacyBalCount !== null || (legacyBalMode && legacyBalMode !== "undefined" && legacyBalMode !== "") || (balanceRaw && balanceRaw !== "undefined" && balanceRaw !== "")) {
                    balanceTelemetryAvailable = true;
                    balanceCount = legacyBalCount ?? 0;
                    if (legacyBalMode && legacyBalMode !== "undefined" && legacyBalMode !== "") {
                        balanceMode = legacyBalMode;
                    } else {
                        if (balanceRaw.includes("Provided") || legacyBalMode.includes("Provided")) {
                            balanceMode = "Provided";
                        } else if (balanceRaw && balanceRaw.includes("-")) {
                            balanceMode = balanceRaw.split("-")[1]?.trim() || balanceMode;
                        }
                    }
                } else {
                    balanceTelemetryAvailable = false;
                    balanceCount = null;
                    balanceMode = "--";
                }
            }

            const normalizedBalanceDetails = normalizeBalanceDetailsToExpectedBpcs(balanceDetails, 14);
            balanceDetails = normalizedBalanceDetails;
            balanceCount = normalizedBalanceDetails.filter(d => d.isActive === true).length;
            balanceTelemetryAvailable = normalizedBalanceDetails.some(d => d.balanceTelemetryPresent === true);
            if (!balanceTelemetryAvailable) {
                balanceMode = "--";
            } else if (balanceCount === 0) {
                balanceMode = "Off";
            }

            const container = String(detailStringData?.enclosureIndex ?? blockStrBase?.enclosureIndex ?? lcStrBase?.enclosureIndex ?? stringsCsvRow?.enclosureIndex ?? sIpInfo?.container ?? tryGetField(stringsCsvRow || {}, {}, ["container", "enclosure"]) ?? "");
            const location = String(detailStringData?.enclosureLocation ?? blockStrBase?.enclosureLocation ?? lcStrBase?.enclosureLocation ?? stringsCsvRow?.enclosureLocation ?? sIpInfo?.location ?? tryGetField(stringsCsvRow || {}, {}, ["location"]) ?? "");

            // Resolve Fan fields
            let fanCommandRpm: number | null = null;
            let fanSettingRpm: number | null = null;
            let fanCommandPercent: number | null = null;
            let fanSettingPercent: number | null = null;
            let fanStatusPercent: number | null = null;
            let fanRatedRpm: number = 7500;
            let fanStatusRpmValues: number[] = [];
            let fanStatusAvgRpm: number | null = null;
            let fanCount: number = 1;
            let fanState: "no-command" | "unknown" | "match" | "mismatch" = "no-command";
            let fanLastCommandTime: any = null;

            const fanReport =
                detailStringData?.stringFanReport ??
                blockStrBase?.stringFanReport ??
                lcStrBase?.stringFanReport ??
                stringsCsvRow?.stringFanReport ??
                stringsCsvRow?.stringData?.stringFanReport;
                
            const lastFanCommandValue =
                detailStringData?.lastFanCommand ??
                blockStrBase?.lastFanCommand ??
                lcStrBase?.lastFanCommand ??
                stringsCsvRow?.lastFanCommand ??
                stringsCsvRow?.stringData?.lastFanCommand ??
                null;
                
            const lastFanCommandTimeValue =
                detailStringData?.lastFanCommandTime ??
                blockStrBase?.lastFanCommandTime ??
                lcStrBase?.lastFanCommandTime ??
                stringsCsvRow?.lastFanCommandTime ??
                stringsCsvRow?.stringData?.lastFanCommandTime ??
                null;

            if (fanReport) {
                const FAN_MATCH_TOLERANCE_PERCENT = 5;
                const finiteVal = (v: any): number | null => {
                    const num = Number(v);
                    return Number.isFinite(num) ? num : null;
                };
                const avg = (values: any[]): number | null => {
                    const nums = values.map(finiteVal).filter((num): num is number => num !== null);
                    if (!nums.length) return null;
                    return nums.reduce((a, b) => a + b, 0) / nums.length;
                };
                const clampPercent = (v: number): number =>
                    Math.max(0, Math.min(100, Math.round(v)));
                  
                fanRatedRpm = finiteVal(fanReport.fanRatedRPM) ?? finiteVal(fanReport.fanRatedRpm) ?? 7500;
                fanCommandPercent = finiteVal(fanReport.fanCommand);
                fanSettingPercent = finiteVal(fanReport.fanSetting);
                fanStatusRpmValues = Array.isArray(fanReport.fanStatusRPM) 
                    ? fanReport.fanStatusRPM.map(finiteVal).filter((num): num is number => num !== null) 
                    : (Array.isArray(fanReport.fanStatusRpm) ? fanReport.fanStatusRpm.map(finiteVal).filter((num): num is number => num !== null) : []);
                
                fanStatusAvgRpm = fanStatusRpmValues.length ? avg(fanStatusRpmValues) : null;
                
                fanStatusPercent =
                    fanStatusAvgRpm !== null && fanRatedRpm > 0
                        ? clampPercent((fanStatusAvgRpm / fanRatedRpm) * 100)
                        : fanSettingPercent;
                
                if (fanStatusPercent !== null) {
                    fanStatusPercent = clampPercent(fanStatusPercent);
                }

                fanCount = Number(fanReport.fanCount) || fanStatusRpmValues.length || 1;
                fanLastCommandTime = lastFanCommandTimeValue;

                const hasCommand = fanCommandPercent !== null && fanCommandPercent > 0;
                const hasStatus = fanStatusPercent !== null;
                if (!hasCommand) fanState = "no-command";
                else if (!hasStatus) fanState = "unknown";
                else if (Math.abs(fanCommandPercent - fanStatusPercent) <= FAN_MATCH_TOLERANCE_PERCENT) fanState = "match";
                else fanState = "mismatch";
            } else {
                const fanCommandCandidates = [
                    detailStringData?.fanCommand,
                    detailStringData?.stringFanReport?.fanCommand,
                    blockStrBase?.fanCommand,
                    blockStrBase?.stringFanReport?.fanCommand,
                    lcStrBase?.fanCommand,
                    lcStrBase?.stringFanReport?.fanCommand,
                    stringsCsvRow?.fanCommand,
                    stringsCsvRow?.stringFanReport?.fanCommand,
                    stringsCsvRow?.fanRequested,
                    blockStrBase?.fanRequested,
                    lcStrBase?.fanRequested,
                ];
                for (const val of fanCommandCandidates) {
                    if (val !== undefined && val !== null && typeof val !== 'boolean') {
                        const num = Number(val);
                        if (!isNaN(num)) {
                            fanCommandRpm = num;
                            break;
                        }
                    }
                }

                const fanSettingCandidates = [
                    detailStringData?.fanSetting,
                    detailStringData?.stringFanReport?.fanSetting,
                    blockStrBase?.fanSetting,
                    blockStrBase?.stringFanReport?.fanSetting,
                    lcStrBase?.fanSetting,
                    lcStrBase?.stringFanReport?.fanSetting,
                    stringsCsvRow?.fanSetting,
                    stringsCsvRow?.stringFanReport?.fanSetting,
                    stringsCsvRow?.fanActual,
                    blockStrBase?.fanActual,
                    lcStrBase?.fanActual,
                ];
                for (const val of fanSettingCandidates) {
                    if (val !== undefined && val !== null && typeof val !== 'boolean') {
                        const num = Number(val);
                        if (!isNaN(num)) {
                            fanSettingRpm = num;
                            break;
                        }
                    }
                }

                const lastFanCommandTimeCandidates = [
                    detailStringData?.lastFanCommandTime,
                    blockStrBase?.lastFanCommandTime,
                    lcStrBase?.lastFanCommandTime,
                    stringsCsvRow?.lastFanCommandTime,
                    stringsCsvRow?.LastFanCommandTime,
                ];
                for (const val of lastFanCommandTimeCandidates) {
                    if (val !== undefined && val !== null) {
                        fanLastCommandTime = val;
                        break;
                    }
                }

                const MAX_FAN_RPM = 7500;
                const toFanPercent = (rpm: any): number | null => {
                    const num = Number(rpm);
                    if (!Number.isFinite(num) || isNaN(num)) return null;
                    return Math.max(0, Math.min(100, Math.round((num / MAX_FAN_RPM) * 100)));
                };

                fanCommandPercent = null;
                fanSettingPercent = null;

                if (fanCommandRpm !== null) {
                    if (fanCommandRpm <= 100) fanCommandPercent = fanCommandRpm;
                    else fanCommandPercent = toFanPercent(fanCommandRpm);
                }
                if (fanSettingRpm !== null) {
                    if (fanSettingRpm <= 100) fanStatusPercent = fanSettingRpm;
                    else fanStatusPercent = toFanPercent(fanSettingRpm);
                    fanSettingPercent = fanStatusPercent;
                }
                fanRatedRpm = MAX_FAN_RPM;
                fanStatusRpmValues = fanSettingRpm !== null ? [fanSettingRpm] : [];
                fanStatusAvgRpm = fanSettingRpm;
                fanCount = 1;
                
                const hasCommand = fanCommandPercent !== null && fanCommandPercent > 0;
                const hasStatus = fanStatusPercent !== null;
                if (!hasCommand) fanState = "no-command";
                else if (!hasStatus) fanState = "unknown";
                else if (Math.abs(fanCommandPercent - fanStatusPercent) <= 5) fanState = "match";
                else fanState = "mismatch";
            }

            const lastFanCommand = lastFanCommandValue !== null ? parseBoolean(lastFanCommandValue) : parseBoolean(getMetricValue(["lastfancommand"]));
            const lastFanCommandTime = fanLastCommandTime || lastFanCommandTimeValue || getMetricValue(["lastfancommandtime"]);
            const fanCommandRequested = lastFanCommand;
            const fanHealthy = true;

            function safeParseDate(val: any): string {
                if (!val) return new Date().toISOString();
                const ts = new Date(val);
                if (isNaN(ts.getTime())) {
                    if (typeof val === 'string' && val.includes('/')) {
                        const parts = val.split(/[\s/:]+/);
                        if (parts.length >= 3) {
                            const d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T${parts[3]||'00'}:${parts[4]||'00'}:${parts[5]||'00'}Z`);
                            if (!isNaN(d.getTime())) return d.toISOString();
                        }
                    }
                    return new Date().toISOString();
                }
                return ts.toISOString();
            }

            const timestampUtc = safeParseDate(getMetricValue(["timestamp", "datetime"]));

            const warningCount = pN(getMetricValue(["warningcount", "warncount", "warnings"]), 0) || 0;
            const alarmCount = pN(getMetricValue(["alarmcount", "alarms"]), 0) || 0;
            
            gWarnCount += warningCount;
            gAlarmCount += alarmCount;
            
            let warnings: string[] = getMetricValue(["warns", "warningslist"]) || [];
            let alarms: string[] = getMetricValue(["alarmslist"]) || [];
            
            if (typeof warnings === "string") warnings = (warnings as string).split(",").map(v=>v.trim()).filter(Boolean);
            if (typeof alarms === "string") alarms = (alarms as string).split(",").map(v=>v.trim()).filter(Boolean);
            
            if (Array.isArray(warnings)) warnings = warnings.map(w => w.match(/^\d+$/) ? `${w} - ${describeBessStatusCode(w)}` : w);
            if (Array.isArray(alarms)) alarms = alarms.map(a => a.match(/^\d+$/) ? `${a} - ${describeBessStatusCode(a)}` : a);

            // Extract BPC data
            let bpcs: any[] = [];
            const rawSources: any = { stringsCsv: stringsCsvRow, lastCall: lcStrBase, stringIpMap: sIpInfo, blockviewer: blockStrBase };

            let bpcSourceData: any[] = [];
            if (lcStrBase && Array.isArray(lcStrBase.packs)) bpcSourceData = lcStrBase.packs;
            else if (lcStrBase && Array.isArray(lcStrBase.bpcs)) bpcSourceData = lcStrBase.bpcs;

            const bpcFirmwares = new Set<string>();

            bpcSourceData.forEach((bpcBase: any, bpcIdx: number) => {
                const bpcNum = pN(bpcBase.index || bpcBase.bpcIndex, bpcIdx + 1) || (bpcIdx + 1);
                
                let bpcIp = null;
                const bpcIpMatch = ipByPackKey.get(`${key}:${bpcNum}`);
                if (bpcIpMatch) bpcIp = bpcIpMatch.ip;

                const cgs: any[] = [];
                let bpcWarns = bpcBase.warnings || bpcBase.warningList || [];
                let bpcAlarms = bpcBase.alarms || bpcBase.alarmList || [];
                
                if (typeof bpcWarns === "string") bpcWarns = (bpcWarns as string).split(",").map(v=>v.trim()).filter(Boolean);
                if (typeof bpcAlarms === "string") bpcAlarms = (bpcAlarms as string).split(",").map(v=>v.trim()).filter(Boolean);
                if (Array.isArray(bpcWarns)) bpcWarns = bpcWarns.map(w => w.match(/^\d+$/) ? `${w} - ${describeBessStatusCode(w)}` : w);
                if (Array.isArray(bpcAlarms)) bpcAlarms = bpcAlarms.map(a => a.match(/^\d+$/) ? `${a} - ${describeBessStatusCode(a)}` : a);
                
                if (bpcBase.firmwareVersion) bpcFirmwares.add(String(bpcBase.firmwareVersion));

                let cellVolts = Array.isArray(bpcBase.cellVoltages) ? bpcBase.cellVoltages : [];
                let cellTemps = Array.isArray(bpcBase.cellTemperatures) ? bpcBase.cellTemperatures : [];
                let cellNotes = Array.isArray(bpcBase.notifications || bpcBase.cgStatus) ? (bpcBase.notifications || bpcBase.cgStatus) : [];
                let balData = Array.isArray(bpcBase.balancing) ? bpcBase.balancing : [];

                const maxCgCount = Math.max(cellVolts.length, cellTemps.length, cellNotes.length, balData.length);
                for (let cgi = 0; cgi < maxCgCount; cgi++) {
                     const cv = typeof cellVolts[cgi] === 'number' ? cellVolts[cgi] : undefined;
                     const cgT = typeof cellTemps[cgi] === 'number' ? cellTemps[cgi] : undefined;
                     const cN = typeof cellNotes[cgi] === 'string' ? cellNotes[cgi] : (typeof cellNotes[cgi] === 'object' ? cellNotes[cgi].level : undefined);
                     const cBal = typeof balData[cgi] === 'boolean' ? balData[cgi] : (typeof balData[cgi] === 'object' ? balData[cgi].active : undefined);
                     
                     cgs.push({
                         id: `A${a}-S${s}-B${bpcNum}-C${cgi + 1}`,
                         arrayNumber: a, stringNumber: s, bpcNumber: bpcNum, cellGroupNumber: cgi + 1,
                         voltage: cv,
                         temperature: cgT,
                         notificationLevel: cN,
                         balancingActive: cBal
                     });
                }

                bpcs.push({
                    id: `A${a}-S${s}-B${bpcNum}`,
                    arrayNumber: a, stringNumber: s, bpcNumber: bpcNum,
                    bpcIp,
                    firmwareVersion: bpcBase.firmwareVersion,
                    minCellVoltage: pN(bpcBase.minCellVoltage),
                    maxCellVoltage: pN(bpcBase.maxCellVoltage),
                    avgCellVoltage: pN(bpcBase.avgCellVoltage),
                    minCellTemperature: pN(bpcBase.minCellTemp || bpcBase.minCellTemperature),
                    maxCellTemperature: pN(bpcBase.maxCellTemp || bpcBase.maxCellTemperature),
                    avgCellTemperature: pN(bpcBase.avgCellTemp || bpcBase.avgCellTemperature),
                    warningCount: bpcWarns.length,
                    alarmCount: bpcAlarms.length,
                    warnings: bpcWarns,
                    alarms: bpcAlarms,
                    cellGroups: cgs,
                    raw: bpcBase
                });

                totalBpcs++;
                if (bpcAlarms.length > 0) alarmBpcs++;
                else if (bpcWarns.length > 0) warningBpcs++;
            });

            let bpcCount = pN(getMetricValue(["bpccount", "packcount"]));
            if (bpcSourceData.length > 0) bpcCount = bpcSourceData.length;
            if (bpcCount !== null) knownBpcCount += bpcCount;

            let bpcFirmwareSummary = "Unknown";
            if (bpcFirmwares.size === 1) bpcFirmwareSummary = Array.from(bpcFirmwares)[0];
            else if (bpcFirmwares.size > 1) bpcFirmwareSummary = "Mixed";

            const classifierInput = {
                stringConnectionState: rawStringConnectionState,
                stringContactorState: rawStringContactorState,
                stringContactorStateCause: rawStringContactorStateCause,
                communicating: communicating,
                outRotation: outRotation,
                positiveContactorClosed: positiveContactorClosed,
                negativeContactorClosed: negativeContactorClosed
            };
            const classification = classifyStringOperationalState(classifierInput);
            let operationalState = "OFFLINE";
            if (classification.state === "online") {
                if (alarmCount > 0) operationalState = "ALARM";
                else if (warningCount > 0) operationalState = "WARNING";
                else operationalState = "NORMAL";
            } else if (classification.state === "nearline") {
                if (alarmCount > 0) operationalState = "ALARM";
                else if (warningCount > 0) operationalState = "WARNING";
                else operationalState = "NEARLINE";
            } else {
                operationalState = "OFFLINE";
            }
            
            if (operationalState === "NORMAL") normalStrings++;
            if (operationalState === "WARNING") warningStrings++;
            if (operationalState === "ALARM") alarmStrings++;
            if (operationalState === "OFFLINE") offlineStrings++;
            if (operationalState === "NEARLINE") nearlineStrings++;

            if (minCellVoltage !== null) {
                if (gMinV === null || minCellVoltage < gMinV) gMinV = minCellVoltage;
            }
            if (maxCellVoltage !== null) {
                if (gMaxV === null || maxCellVoltage > gMaxV) gMaxV = maxCellVoltage;
            }
            if (avgCellVoltage !== null) {
                gSumV += avgCellVoltage; gCountV++;
            }
            if (cellVoltageDelta !== null) {
                if (gMaxVDelta === null || cellVoltageDelta > gMaxVDelta) gMaxVDelta = cellVoltageDelta;
            }
            if (minCellTemperature !== null) {
                if (gMinT === null || minCellTemperature < gMinT) gMinT = minCellTemperature;
            }
            if (maxCellTemperature !== null) {
                if (gMaxT === null || maxCellTemperature > gMaxT) gMaxT = maxCellTemperature;
            }
            if (avgCellTemperature !== null) {
                gSumT += avgCellTemperature; gCountT++;
            }
            if (cellTemperatureDelta !== null) {
                if (gMaxTDelta === null || cellTemperatureDelta > gMaxTDelta) gMaxTDelta = cellTemperatureDelta;
            }

            const stringNumValue = pN(s);
            const energySegmentNumber = stringNumberToEnergySegment(stringNumValue);
            count("string-to-Energy-Segment mapping");
            const containerNumber = energySegmentNumber;
            const containerLabel = energySegmentNumber !== null ? `ES ${energySegmentNumber}` : "--";

            const measuredStringVoltage = measuredVoltage;
            const calculatedStringVoltage = calculatedVoltage;

            const cellVoltageMin = minCellVoltage;
            const cellVoltageMax = maxCellVoltage;
            const cellVoltageAvg = avgCellVoltage;

            const cellTempMin = minCellTemperature;
            const cellTempMax = maxCellTemperature;
            const cellTempAvg = avgCellTemperature;
            const cellTempDelta = cellTemperatureDelta;

            const computedBpcCount = finiteVal(bpcCount) ?? (Array.isArray(bpcs) ? bpcs.length : null);

            const measuredVoltageVdc = measuredVoltage !== null ? Number(measuredVoltage) : null;
            const calculatedVoltageVdc = calculatedVoltage !== null ? Number(calculatedVoltage) : null;
            const busVoltageVdc = busVoltage !== null ? Number(busVoltage) : null;
            const stackVoltageVdc = measuredVoltageVdc !== null
                ? measuredVoltageVdc
                : (calculatedVoltageVdc !== null
                    ? calculatedVoltageVdc
                    : (busVoltageVdc !== null ? busVoltageVdc : null));

            const minCellVoltageMv = normalizeCellVoltageMv(minCellVoltage);
            const avgCellVoltageMv = normalizeCellVoltageMv(avgCellVoltage);
            const maxCellVoltageMv = normalizeCellVoltageMv(maxCellVoltage);
            const deltaCellVoltageMv = (maxCellVoltageMv !== null && minCellVoltageMv !== null)
                ? (maxCellVoltageMv - minCellVoltageMv)
                : null;

            const minCellTempC = minCellTemperature;
            const avgCellTempC = avgCellTemperature;
            const maxCellTempC = maxCellTemperature;
            const deltaCellTempC = (maxCellTempC !== null && minCellTempC !== null)
                ? Number((maxCellTempC - minCellTempC).toFixed(1))
                : null;

            const sourceTimestampUtc = timestampUtc;

            strings.push({
                id, arrayNumber: a, stringNumber: s,
                stringKey: `A${a}-S${s}`,
                arrayIndex: a,
                stringIndex: s,
                stringConnectionState: rawStringConnectionState,
                connectionState: rawStringConnectionState,
                stringContactorState: rawStringContactorState,
                stringContactorStateCause: rawStringContactorStateCause,
                communicating,
                stringControllerIp: ipByStringKey.get(key)?.ip || sIpInfo?.ip || tryGetField(stringsCsvRow || {}, csvEntry?.aliases || {}, ["ip", "ipaddress"]),
                stringControllerEntityKey: sIpInfo?.entityKey,
                stringControllerEntityKeyToken: sIpInfo?.entityKeyToken,
                contactorStatus,
                contactorClosed,
                contactorsCloseExpected,
                positiveContactorClosed,
                negativeContactorClosed,
                connectionPermitted,
                connectionPermittedSource,
                recloseCount,
                rotationStatus,
                outRotation,
                rotationEnabled,
                measuredVoltage, calculatedVoltage, busVoltage, voltageDelta,
                measuredStringVoltage, calculatedStringVoltage, preciseCalculatedStringVoltage: preciseCalculatedVoltage,
                amps, kw, socPct, ah, kwh, kWh: kwh, storedKWh: kwh,
                minCellVoltage, maxCellVoltage, avgCellVoltage, cellVoltageDelta,
                cellVoltageMin, cellVoltageMax, cellVoltageAvg,
                minCellTemperature, maxCellTemperature, avgCellTemperature, cellTemperatureDelta,
                cellTempMin, cellTempMax, cellTempAvg, cellTempDelta,
                measuredVoltageVdc,
                calculatedVoltageVdc,
                busVoltageVdc,
                stackVoltageVdc,
                minCellVoltageMv,
                avgCellVoltageMv,
                maxCellVoltageMv,
                deltaCellVoltageMv,
                minCellTempC,
                avgCellTempC,
                maxCellTempC,
                deltaCellTempC,
                ampHours: ah,
                currentA: amps,
                powerKw: kw,
                inRotation: !outRotation,
                metricSource: "site-distribution",
                sourceTimestampUtc,
                balanceTelemetryAvailable,
                balanceCount,
                balanceMode,
                balanceModeRaw,
                balanceProvidedVoltageTarget,
                balanceDetails,
                fanCommandRpm,
                fanSettingRpm,
                fanCommandPercent,
                fanSettingPercent,
                fanStatusPercent,
                fanRatedRpm,
                fanStatusRpmValues,
                fanStatusAvgRpm,
                fanCount,
                fanLastCommandTime: fanLastCommandTime || lastFanCommandTime,
                container, location,
                fanCommandRequested,
                lastFanCommandTime,
                fanHealthy,
                fanState,
                fanSourceAvailable: !!fanReport,
                fanSourceEndpoint: detail?.endpoint || null,
                fanSourceUrl: detail?.url || null,
                fanSourceHttpStatus: detail?.httpStatus || null,
                fanSourceKeys: fanReport ? Object.keys(fanReport) : [],
                rawFanReport: fanReport,
                rawStringDataFanReport: detailStringData?.stringFanReport ?? null,
                timestampUtc,
                lastUpdatedUtc: new Date().toISOString(),
                stringControllerFirmware: sIpInfo?.firmwareVersion || tryGetField(stringsCsvRow || {}, {}, ["firmware", "firmwareversion"]),
                bpcCount: computedBpcCount,
                energySegmentNumber,
                containerNumber,
                containerLabel,
                bpcFirmwareSummary,
                bpcs,
                operationalState,
                bucket: classification.state,
                warningCount, alarmCount, warnings, alarms,
                sourceCoverage: {
                    stringsCsv: !!stringsCsvRow,
                    lastCall: !!lcStrBase,
                    stringIpMap: !!sIpInfo,
                    ipMap: !!ipMapWrapper.data,
                    blockviewer: !!blockStrBase,
                    controllerStatistics: false,
                    bessStatusCodes: false,
                },
                raw: rawSources
            });
            count("string-key construction");
            count("string-to-array mapping");
        }
    }
    if (cycleId != null) normalizationMetrics.recordDuration(cycleId, "strings", "CSV/object normalization", performance.now() - rowNormalizationStartedAt);

    const featherEnrichmentStartedAt = performance.now();
    if (enrich) {
        const arrayFilter = targetArray;
        const targetStrings = arrayFilter ? strings.filter(s => s.arrayNumber === arrayFilter) : strings;
        if (stringViewerScheduler.config.mode === "scheduled") {
            await runScheduledStringViewerEnrichment(targetStrings, baseUrl, cycleId);
        } else {
            await runLegacyStringViewerFanout(targetStrings, baseUrl);
        }
    }
    if (cycleId != null) normalizationMetrics.recordDuration(cycleId, "strings", "Feather enrichment", performance.now() - featherEnrichmentStartedAt);

    const canonicalStringSnapshot = measure("sorting/deduplication", () => applyCanonicalStringSnapshot(strings, {
        lastCall: directLastCallForDashboard || lastCallWrapper.data,
        blockviewer: blockWrapper.data
    }));
    strings.length = 0;
    strings.push(...canonicalStringSnapshot.strings);
    const rollupStartedAt = performance.now();

    // Recompute all summary counters from final canonical strings!
    let finalNormalStrings = 0;
    let finalWarningStrings = 0;
    let finalAlarmStrings = 0;
    let finalOfflineStrings = 0;
    let finalNearlineStrings = 0;
    let finalUnknownStrings = 0;
    let finalNotCommunicatingStrings = 0;

    let finalTotalBpcs = 0;
    let finalKnownBpcCount = 0;
    let finalWarningBpcs = 0;
    let finalAlarmBpcs = 0;

    let finalGMinV: number | null = null;
    let finalGMaxV: number | null = null;
    let finalGSumV = 0;
    let finalGCountV = 0;
    let finalGMaxVDelta: number | null = null;

    let finalGMinT: number | null = null;
    let finalGMaxT: number | null = null;
    let finalGSumT = 0;
    let finalGCountT = 0;
    let finalGMaxTDelta: number | null = null;

    let finalGWarnCount = 0;
    let finalGAlarmCount = 0;

    strings.forEach((s) => {
        const canonical = buildCanonicalStringState(s);
        Object.assign(s, canonical);

        const opState = s.operationalState || "UNKNOWN";

        if (opState === "NORMAL") finalNormalStrings++;
        else if (opState === "WARNING") finalWarningStrings++;
        else if (opState === "ALARM") finalAlarmStrings++;
        else if (opState === "OFFLINE") finalOfflineStrings++;
        else if (opState === "NEARLINE") finalNearlineStrings++;
        else if (opState === "NOT_COMMUNICATING") finalNotCommunicatingStrings++;
        else finalUnknownStrings++;

        finalGWarnCount += (s.warningCount || 0);
        finalGAlarmCount += (s.alarmCount || 0);

        const bpcCount = s.bpcs?.knownCount || s.bpcCount || 0;
        finalKnownBpcCount += bpcCount;
        finalTotalBpcs += bpcCount;

        if (s.bpcs && Array.isArray(s.bpcs)) {
            s.bpcs.forEach((b: any) => {
                if (b.alarmCount > 0) finalAlarmBpcs++;
                else if (b.warningCount > 0) finalWarningBpcs++;
            });
        }

        // Voltages and Temps stats
        if (s.minCellVoltage !== null) {
            if (finalGMinV === null || s.minCellVoltage < finalGMinV) finalGMinV = s.minCellVoltage;
        }
        if (s.maxCellVoltage !== null) {
            if (finalGMaxV === null || s.maxCellVoltage > finalGMaxV) finalGMaxV = s.maxCellVoltage;
        }
        if (s.avgCellVoltage !== null) {
            finalGSumV += s.avgCellVoltage;
            finalGCountV++;
        }
        if (s.cellVoltageDelta !== null) {
            if (finalGMaxVDelta === null || s.cellVoltageDelta > finalGMaxVDelta) finalGMaxVDelta = s.cellVoltageDelta;
        }

        if (s.minCellTemperature !== null) {
            if (finalGMinT === null || s.minCellTemperature < finalGMinT) finalGMinT = s.minCellTemperature;
        }
        if (s.maxCellTemperature !== null) {
            if (finalGMaxT === null || s.maxCellTemperature > finalGMaxT) finalGMaxT = s.maxCellTemperature;
        }
        if (s.avgCellTemperature !== null) {
            finalGSumT += s.avgCellTemperature;
            finalGCountT++;
        }
        if (s.cellTemperatureDelta !== null) {
            if (finalGMaxTDelta === null || s.cellTemperatureDelta > finalGMaxTDelta) finalGMaxTDelta = s.cellTemperatureDelta;
        }
    });

    const forceLastCallStringConnectionState = (() => {
        const directArrayReport = directLastCallForDashboard?.blockReport?.arrayReport;
        const cachedArrayReport = lastCallWrapper?.data?.blockReport?.arrayReport;
        const arrayReport = directArrayReport || cachedArrayReport;
        if (!arrayReport || typeof arrayReport !== "object") return null;

        const bucketFromConnectionState = (value: any) => {
            const state = String(value ?? "").trim().toUpperCase();
            if (state === "ONLINE") return "online";
            if (state === "NEARLINE") return "nearline";
            if (state === "OFFLINE") return "offline";
            if (
                state === "NOT_COMMUNICATING" ||
                state === "NOT COMMUNICATING" ||
                state.includes("NOT_COMM") ||
                state.includes("COMM_LOSS") ||
                state.includes("LOST_COMMS")
            ) return "notCommunicating";
            return null;
        };

        const bucketsByKey = new Map<string, string>();
        const rawStateByKey = new Map<string, string>();

        for (let arrayNumber = 1; arrayNumber <= 8; arrayNumber++) {
            const stringReport = arrayReport[String(arrayNumber)]?.stringReport || {};
            for (let stringNumber = 1; stringNumber <= 40; stringNumber++) {
                const stringData =
                    stringReport[String(stringNumber)]?.stringData ||
                    stringReport[stringNumber]?.stringData ||
                    stringReport[String(stringNumber)] ||
                    null;

                const rawState = stringData?.stringConnectionState;
                const bucket = bucketFromConnectionState(rawState);
                if (!bucket) continue;

                const key = `${arrayNumber}-${stringNumber}`;
                bucketsByKey.set(key, bucket);
                rawStateByKey.set(key, String(rawState));
            }
        }

        if (bucketsByKey.size === 0) return null;

        // Harden lost-communication detection:
        // Some upstream payloads report array-level notCommunicatingStackCount correctly,
        // but do not expose a clean per-string stringConnectionState for the affected row.
        // In that case, preserve explicit ONLINE/NEARLINE/OFFLINE states first, then assign
        // the array-level communication deficit to the most likely string rows in that array.
        for (let arrayNumber = 1; arrayNumber <= 8; arrayNumber++) {
            const arrayPayload = arrayReport[String(arrayNumber)];
            const expectedNotComm = Number(arrayPayload?.arrayData?.notCommunicatingStackCount ?? 0);
            if (!Number.isFinite(expectedNotComm) || expectedNotComm <= 0) continue;

            let alreadyNotComm = 0;
            for (let stringNumber = 1; stringNumber <= 40; stringNumber++) {
                if (bucketsByKey.get(`${arrayNumber}-${stringNumber}`) === "notCommunicating") {
                    alreadyNotComm++;
                }
            }

            const deficit = Math.max(0, expectedNotComm - alreadyNotComm);
            if (deficit <= 0) continue;

            const stringReport = arrayPayload?.stringReport || {};
            const candidates: any[] = [];

            for (let stringNumber = 1; stringNumber <= 40; stringNumber++) {
                const key = `${arrayNumber}-${stringNumber}`;
                const currentBucket = bucketsByKey.get(key);

                // Do not steal strings already explicitly classified as NEARLINE/OFFLINE.
                if (currentBucket === "nearline" || currentBucket === "offline" || currentBucket === "notCommunicating") {
                    continue;
                }

                const raw =
                    stringReport[String(stringNumber)]?.stringData ||
                    stringReport[stringNumber]?.stringData ||
                    stringReport[String(stringNumber)] ||
                    {};

                const rawText = JSON.stringify(raw).toUpperCase();

                let score = 0;

                if (rawText.includes("NOT_COMM") || rawText.includes("NOT COMM")) score += 100;
                if (rawText.includes("LOST_COMM") || rawText.includes("LOST COMM")) score += 100;
                if (rawText.includes("COMM_LOSS") || rawText.includes("COMM LOSS")) score += 100;
                if (rawText.includes("COMMUNICATION_LOST") || rawText.includes("COMMUNICATION LOST")) score += 100;
                if (rawText.includes("NO_COMM") || rawText.includes("NO COMM")) score += 80;
                if (rawText.includes("TIMEOUT") || rawText.includes("STALE")) score += 50;

                const measuredVoltage = Number(raw.measuredVoltage ?? raw.measV ?? raw.measuredV ?? raw.stackVoltage ?? raw.busVoltage ?? NaN);
                const calculatedVoltage = Number(raw.calculatedVoltage ?? raw.calcV ?? raw.calculatedV ?? NaN);
                const maxCellVoltage = Number(raw.maxCellVoltage ?? raw.maxCellVoltageMv ?? raw.measuredMaxCellVoltage ?? NaN);
                const minCellVoltage = Number(raw.minCellVoltage ?? raw.minCellVoltageMv ?? raw.measuredMinCellVoltage ?? NaN);
                const soc = Number(raw.soc ?? raw.socPct ?? raw.stateOfCharge ?? NaN);

                if (Number.isFinite(measuredVoltage) && measuredVoltage === 0) score += 25;
                if (Number.isFinite(calculatedVoltage) && calculatedVoltage === 0) score += 15;
                if (Number.isFinite(maxCellVoltage) && maxCellVoltage === 0) score += 20;
                if (Number.isFinite(minCellVoltage) && minCellVoltage === 0) score += 20;
                if (Number.isFinite(soc) && soc === 0) score += 10;

                // Rows missing from stringReport are strong candidates when the array reports not-comm.
                if (!raw || Object.keys(raw).length === 0) score += 60;

                candidates.push({
                    key,
                    stringNumber,
                    score,
                    rawState: raw?.stringConnectionState ?? raw?.communicationState ?? raw?.status ?? "array-not-communicating-deficit"
                });
            }

            candidates
                .sort((a, b) => b.score - a.score || a.stringNumber - b.stringNumber)
                .slice(0, deficit)
                .forEach((candidate) => {
                    bucketsByKey.set(candidate.key, "notCommunicating");
                    rawStateByKey.set(candidate.key, String(candidate.rawState || "array-not-communicating-deficit"));
                });
        }

        for (const s of strings) {
            const arrayNumber = Number(s.arrayNumber ?? s.arrayIndex);
            const stringNumber = Number(s.stringNumber ?? s.stringIndex);
            const key = `${arrayNumber}-${stringNumber}`;
            const bucket = bucketsByKey.get(key);
            if (!bucket) continue;

            s.bucket = bucket;
            s.stringConnectionState = rawStateByKey.get(key) || s.stringConnectionState;
            s.connectionState = s.stringConnectionState;

            if (bucket === "online") {
                s.operationalState = s.alarmCount > 0 ? "ALARM" : s.warningCount > 0 ? "WARNING" : "NORMAL";
                s.communicating = true;
            } else if (bucket === "nearline") {
                s.operationalState = "NEARLINE";
                s.communicating = true;
            } else if (bucket === "offline") {
                s.operationalState = "OFFLINE";
                s.communicating = true;
            } else if (bucket === "notCommunicating") {
                s.operationalState = "NOT_COMMUNICATING";
                s.communicating = false;
            }

            s.sourceDebug = {
                ...(s.sourceDebug || {}),
                forcedLastCallStringConnectionState: {
                    source: "lastCall.blockReport.arrayReport.stringReport.stringData.stringConnectionState",
                    rawState: rawStateByKey.get(key),
                    finalBucket: s.bucket,
                    arrayNumber,
                    stringNumber
                }
            };
        }

        return true;
    })();

    const finalBucketCounts = {
        online: strings.filter((s: any) => s.bucket === "online").length,
        nearline: strings.filter((s: any) => s.bucket === "nearline").length,
        offline: strings.filter((s: any) => s.bucket === "offline").length,
        notCommunicating: strings.filter((s: any) => s.bucket === "notCommunicating").length,
        unknown: strings.filter((s: any) => s.bucket === "unknown").length
    };

    finalNormalStrings = finalBucketCounts.online;
    finalNearlineStrings = finalBucketCounts.nearline;
    finalOfflineStrings = finalBucketCounts.offline;
    finalNotCommunicatingStrings = finalBucketCounts.notCommunicating;

    const finalStringWarningCount = strings.reduce((sum: number, s: any) => sum + (Number(s.warningCount) || 0), 0);
    const finalStringAlarmCount = strings.reduce((sum: number, s: any) => sum + (Number(s.alarmCount) || 0), 0);

    const finalConnectionPermitted = strings.filter((s: any) =>
        s.connectionPermitted === true ||
        s.contactorsCloseExpected === true ||
        (s.positiveContactorClosed === true && s.negativeContactorClosed === true)
    ).length;

    const finalTotalStrings = strings.length;

    const normalizeStringAlerts = (row: any) => {
        const raw = row?.raw || row?.sourceRaw || row?.sourceDebug?.raw || {};
        const sourceWarnings =
            row?.warnings ||
            row?.warningDetails ||
            row?.activeWarnings ||
            raw?.warnings ||
            raw?.warningDetails ||
            raw?.activeWarnings ||
            [];

        const sourceAlarms =
            row?.alarms ||
            row?.alarmDetails ||
            row?.activeAlarms ||
            raw?.alarms ||
            raw?.alarmDetails ||
            raw?.activeAlarms ||
            [];

        const normalizeList = (value: any): any[] => {
            if (!value) return [];
            if (Array.isArray(value)) return value.filter(Boolean);
            if (typeof value === "object") {
                return Object.entries(value)
                    .filter(([, v]) => Boolean(v))
                    .map(([key, v]) => {
                        if (typeof v === "object" && v !== null) return { code: key, ...v as any };
                        return { code: key, value: v };
                    });
            }
            if (typeof value === "string") {
                return value.split(/[;,|]/).map(v => v.trim()).filter(Boolean);
            }
            return [];
        };

        const warnings = normalizeList(sourceWarnings);
        const alarms = normalizeList(sourceAlarms);

        const dedupeAlertList = (items: any[]) => {
            const seen = new Set<string>();
            const deduped: any[] = [];

            for (const item of items) {
                const key = typeof item === "string"
                    ? item.trim()
                    : String(item?.code ?? item?.name ?? item?.description ?? JSON.stringify(item));

                if (!key || seen.has(key)) continue;
                seen.add(key);
                deduped.push(item);
            }

            return deduped;
        };

        const uniqueWarnings = dedupeAlertList(warnings);
        const uniqueAlarms = dedupeAlertList(alarms);

        const explicitWarningCount = Number(row?.warningCount ?? raw?.warningCount ?? raw?.warningsCount);
        const explicitAlarmCount = Number(row?.alarmCount ?? raw?.alarmCount ?? raw?.alarmsCount);

        row.warnings = uniqueWarnings;
        row.alarms = uniqueAlarms;

        row.warningCount = Number.isFinite(explicitWarningCount)
            ? explicitWarningCount
            : warnings.length;

        row.alarmCount = Number.isFinite(explicitAlarmCount)
            ? explicitAlarmCount
            : alarms.length;

        row.uniqueWarningCount = uniqueWarnings.length;
        row.uniqueAlarmCount = uniqueAlarms.length;

        row.alertSummary = {
            warningCount: row.warningCount,
            alarmCount: row.alarmCount,
            uniqueWarningCount: row.uniqueWarningCount,
            uniqueAlarmCount: row.uniqueAlarmCount,
            warnings: uniqueWarnings,
            alarms: uniqueAlarms
        };

        return row;
    };

    const notificationEnrichmentStartedAt = performance.now();
    strings.forEach((row: any) => normalizeStringAlerts(row));

    const applyAggregateContactorState = (row: any) => {
        const aggregate = String(row?.stringContactorState ?? row?.contactorState ?? "").trim().toUpperCase();
        if (!aggregate) return row;

        const requestedClosed =
            row?.contactorsCloseExpected === true ||
            row?.connectionPermitted === true ||
            row?.contactorRequestedClosed === true ||
            String(row?.requestedContactorState ?? "").trim().toUpperCase() === "CLOSED";

        const alertText = [
            ...(Array.isArray(row?.warnings) ? row.warnings : []),
            ...(Array.isArray(row?.alarms) ? row.alarms : []),
            row?.operationalState,
            row?.statusLabel,
            row?.alertSummary ? JSON.stringify(row.alertSummary) : ""
        ].join(" ").toUpperCase();

        const hasExplicitOpenMismatchEvidence =
            requestedClosed &&
            aggregate === "OPEN" &&
            (
                alertText.includes("CONTACTORS OPEN") ||
                alertText.includes("CONTACTOR OPEN") ||
                alertText.includes("CONTACTOR MISMATCH") ||
                alertText.includes("DOESN'T MATCH") ||
                alertText.includes("DOES NOT MATCH")
            );

        // Do not globally treat aggregate OPEN as both actual contactors open.
        // Some rows report aggregate OPEN while positive/negative feedback remains healthy.
        // Only force the visual actual state open when row-level alert evidence confirms mismatch.
        if (hasExplicitOpenMismatchEvidence) {
            row.positiveContactorClosed = false;
            row.negativeContactorClosed = false;
            row.contactorsClosed = false;
            row.contactorMismatch = true;
        } else {
            const pos = row?.positiveContactorClosed === true;
            const neg = row?.negativeContactorClosed === true;
            row.contactorsClosed = pos && neg;
            row.contactorMismatch = requestedClosed ? !(pos && neg) : (pos || neg);
        }

        row.sourceDebug = {
            ...(row.sourceDebug || {}),
            aggregateContactorStateApplied: {
                aggregate,
                requestedClosed,
                explicitOpenMismatchEvidence: hasExplicitOpenMismatchEvidence,
                positiveContactorClosed: row.positiveContactorClosed,
                negativeContactorClosed: row.negativeContactorClosed,
                contactorMismatch: row.contactorMismatch,
                source: "stringContactorState + row-level alert evidence"
            }
        };

        return row;
    };

    const contactorEnrichmentStartedAt = performance.now();
    strings.forEach((row: any) => applyAggregateContactorState(row));
    if (cycleId != null) normalizationMetrics.recordDuration(cycleId, "strings", "contactor enrichment", performance.now() - contactorEnrichmentStartedAt);

    // Normalize alert detail aliases for the string detail drawer/panels.
    const applyRotationStateFromAlerts = (row: any) => {
        const alertText = [
            ...(Array.isArray(row?.warnings) ? row.warnings : []),
            ...(Array.isArray(row?.alarms) ? row.alarms : []),
            row?.operationalState,
            row?.statusLabel,
            row?.alertSummary ? JSON.stringify(row.alertSummary) : ""
        ].join(" ").toUpperCase();

        const explicitOutOfRotation =
            alertText.includes("STRING OOR") ||
            alertText.includes("OUT OF ROTATION") ||
            alertText.includes("OUT-OF-ROTATION") ||
            alertText.includes("OOR WARNING") ||
            String(row?.balanceMode || row?.balMode || "").trim().toUpperCase() === "OFF";

        if (explicitOutOfRotation) {
            row.inRotation = false;
            row.outRotation = true;
            row.rotationStatus = "OUT";
            row.rotationState = "OUT";
            row.stringRotationState = "OUT";
            row.rotation = {
                ...(row.rotation || {}),
                inRotation: false,
                outOfRotation: true,
                displayState: "OUT",
                source: "alert-normalized",
                sourcePath: "warnings/String OOR"
            };
            row.sourceDebug = {
                ...(row.sourceDebug || {}),
                rotationForcedFromAlert: true
            };
        }

        return row;
    };

    strings.forEach((row: any) => applyRotationStateFromAlerts(row));

    strings.forEach((row: any) => {
        const warnings = Array.isArray(row.warnings) ? row.warnings : [];
        const alarms = Array.isArray(row.alarms) ? row.alarms : [];

        row.notificationList = [
            ...warnings.map((item: any) => ({
                severity: "warning",
                level: "warning",
                code: typeof item === "string" ? item.split(" - ")[0] : item?.code,
                name: typeof item === "string" ? item : (item?.name || item?.description || item?.code || "Warning"),
                description: typeof item === "string" ? item : (item?.description || item?.name || item?.code || "Warning")
            })),
            ...alarms.map((item: any) => ({
                severity: "alarm",
                level: "alarm",
                code: typeof item === "string" ? item.split(" - ")[0] : item?.code,
                name: typeof item === "string" ? item : (item?.name || item?.description || item?.code || "Alarm"),
                description: typeof item === "string" ? item : (item?.description || item?.name || item?.code || "Alarm")
            }))
        ];

        row.activeNotifications = row.notificationList;
        row.faults = row.notificationList;
        row.notificationCount = row.notificationList.length;
    });
    if (cycleId != null) normalizationMetrics.recordDuration(cycleId, "strings", "notification enrichment", performance.now() - notificationEnrichmentStartedAt);

    // Prevent global/rollup alarm counts from appearing as string-level alarms when no actual
    // alarm details are attached to the affected row.
    strings.forEach((row: any) => {
        if ((!row.alarms || row.alarms.length === 0) && Number(row.alarmCount || 0) > 0) {
            row.sourceDebug = {
                ...(row.sourceDebug || {}),
                alarmCountSuppressedWithoutDetails: row.alarmCount
            };
            row.alarmCount = 0;
            row.alertSummary = {
                ...(row.alertSummary || {}),
                alarmCount: 0,
                alarms: []
            };
        }
    });

    const finalBucketMetricRollups = (() => {
        const finite = (value: any): number | null => {
            if (value === null || value === undefined || value === "") return null;
            const n = Number(value);
            return Number.isFinite(n) ? n : null;
        };

        const sum = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) : 0;
        const avg = (values: number[]) => values.length ? sum(values) / values.length : null;
        const min = (values: number[]) => values.length ? Math.min(...values) : null;
        const max = (values: number[]) => values.length ? Math.max(...values) : null;

        const readFirst = (row: any, keys: string[]): number | null => {
            for (const key of keys) {
                const value = finite(row?.[key]);
                if (value !== null) return value;
            }
            return null;
        };

        const toCellMillivolts = (value: any): number | null => {
            const n = finite(value);
            if (n === null) return null;
            // Cell voltage sometimes arrives as volts, e.g. 3.245, and sometimes as mV, e.g. 3245.
            if (n > 0 && n < 10) return n * 1000;
            return n;
        };

        const readCellMv = (row: any, keys: string[]): number | null => {
            for (const key of keys) {
                const value = toCellMillivolts(row?.[key]);
                if (value !== null) return value;
            }
            return null;
        };

        const toCellDeltaMillivolts = (value: any): number | null => {
            const n = finite(value);
            if (n === null) return null;
            // Delta values can arrive as volts, e.g. 0.04, or mV, e.g. 9/14/40.
            // Only sub-1 values are volts. Do not multiply normal mV deltas like 9.
            if (n > 0 && n < 1) return n * 1000;
            return n;
        };

        const readCellDeltaMv = (row: any, keys: string[]): number | null => {
            for (const key of keys) {
                const value = toCellDeltaMillivolts(row?.[key]);
                if (value !== null) return value;
            }
            return null;
        };

        const readKwh = (row: any): number | null => {
            return readFirst(row, [
                "kwh",
                "kWh",
                "availableKWh",
                "availableKwh",
                "storedKWh",
                "energyKWh",
                "energykWh",
                "socKWh",
                "socKwh",
                "ah"
            ]);
        };

        const readSocPct = (row: any): number | null => {
            const raw = readFirst(row, ["socPct", "soc", "SOC", "stateOfCharge", "stateOfChargePct"]);
            if (raw === null) return null;
            if (raw >= 0 && raw <= 1) return raw * 100;
            if (raw >= 0 && raw <= 100) return raw;
            return null;
        };

        const readConnectionPermitted = (row: any): boolean | null => {
            const values = [
                row?.connectionPermitted,
                row?.contactorsCloseExpected,
                row?.closePermitted,
                row?.canConnect,
                row?.stringConnectionPermitted,
                row?.permitClose,
                row?.readyToConnect
            ];

            for (const value of values) {
                if (value === true || value === 1 || value === "1") return true;
                if (String(value).toLowerCase() === "true") return true;
                if (value === false || value === 0 || value === "0") return false;
                if (String(value).toLowerCase() === "false") return false;
            }

            if (row?.positiveContactorClosed === true && row?.negativeContactorClosed === true) return true;
            return null;
        };

        const buildBucket = (bucket: string) => {
            const rows = strings.filter((s: any) => s.bucket === bucket);
            const socs = rows.map(readSocPct).filter((v: any) => v !== null) as number[];
            const kwhs = rows.map(readKwh).filter((v: any) => v !== null) as number[];

            const currents = rows.map((r: any) => readFirst(r, ["amps", "currentA", "currentAmp", "stringCurrent"])).filter((v: any) => v !== null) as number[];
            const minVoltages = rows.map((r: any) => readCellMv(r, ["minCellVoltage", "minCellVoltageMv", "measuredMinCellVoltage"])).filter((v: any) => v !== null) as number[];
            const avgVoltages = rows.map((r: any) => readCellMv(r, ["avgCellVoltage", "avgCellVoltageMv", "averageCellVoltage"])).filter((v: any) => v !== null) as number[];
            const maxVoltages = rows.map((r: any) => readCellMv(r, ["maxCellVoltage", "maxCellVoltageMv", "measuredMaxCellVoltage"])).filter((v: any) => v !== null) as number[];
            const voltageDeltas = rows.map((r: any) => {
                const explicit = readCellDeltaMv(r, ["cellVoltageDelta", "cellVoltageDeltaMv", "maxCellVoltageDelta"]);
                if (explicit !== null) return explicit;
                const hi = readCellMv(r, ["maxCellVoltage", "maxCellVoltageMv", "measuredMaxCellVoltage"]);
                const lo = readCellMv(r, ["minCellVoltage", "minCellVoltageMv", "measuredMinCellVoltage"]);
                return hi !== null && lo !== null ? hi - lo : null;
            }).filter((v: any) => v !== null) as number[];

            const minTemps = rows.map((r: any) => readFirst(r, ["minCellTemperature", "minCellTempC", "lowCellTempC"])).filter((v: any) => v !== null) as number[];
            const avgTemps = rows.map((r: any) => readFirst(r, ["avgCellTemperature", "avgCellTempC", "averageCellTempC"])).filter((v: any) => v !== null) as number[];
            const maxTemps = rows.map((r: any) => readFirst(r, ["maxCellTemperature", "maxCellTempC", "highCellTempC"])).filter((v: any) => v !== null) as number[];
            const tempDeltas = rows.map((r: any) => {
                const explicit = readFirst(r, ["cellTempDelta", "cellTempDeltaC", "maxCellTempDelta"]);
                if (explicit !== null) return explicit;
                const hi = readFirst(r, ["maxCellTemperature", "maxCellTempC", "highCellTempC"]);
                const lo = readFirst(r, ["minCellTemperature", "minCellTempC", "lowCellTempC"]);
                return hi !== null && lo !== null ? hi - lo : null;
            }).filter((v: any) => v !== null) as number[];

            const permitted = rows
                .map(readConnectionPermitted)
                .filter((v: any) => v === true).length;

            return {
                count: rows.length,
                connectionPermittedCount: permitted,
                connectionPermittedKnownCount: rows.map(readConnectionPermitted).filter((v: any) => v !== null).length,
                connectionPermittedSource: "final-string-bucket-rollup",

                socPctAvg: avg(socs),
                storedKWhTotal: sum(kwhs),
                storedKWhAvg: avg(kwhs),
                socKwhAvg: sum(kwhs),
                kWhAvg: avg(kwhs),

                maxCurrentA: max(currents),
                minCurrentA: min(currents),

                maxCellVoltageMv: max(maxVoltages),
                avgCellVoltageMv: avg(avgVoltages),
                minCellVoltageMv: min(minVoltages),
                maxCellVoltageDeltaMv: max(voltageDeltas),

                highCellTempC: max(maxTemps),
                avgCellTempC: avg(avgTemps),
                lowCellTempC: min(minTemps),
                maxCellTempDeltaC: max(tempDeltas)
            };
        };

        return {
            online: buildBucket("online"),
            nearline: buildBucket("nearline"),
            offline: buildBucket("offline"),
            notCommunicating: buildBucket("notCommunicating"),
            unknown: buildBucket("unknown")
        };
    })();

    const applyFinalBucketMetricRollups = (target: any) => {
        if (!target) return;
        target.online = { ...(target.online || {}), ...finalBucketMetricRollups.online };
        target.nearline = { ...(target.nearline || {}), ...finalBucketMetricRollups.nearline };
        target.offline = { ...(target.offline || {}), ...finalBucketMetricRollups.offline };
        target.notCommunicating = { ...(target.notCommunicating || {}), ...finalBucketMetricRollups.notCommunicating };
        target.unknown = { ...(target.unknown || {}), ...finalBucketMetricRollups.unknown };
    };

    startStringDetailWarmup(strings);

    const result = {
        profileId: profile?.id,
        emsBaseUrl: baseUrl,
        generatedAt: new Date().toISOString(),
        scanStartedAt: rawStringsWrapper.lastUpdated,
        scanCompletedAt: new Date().toISOString(),
        durationMs: debugInfoMap["/tools/report/ems/strings.csv"]?.durationMs || 0,
        cacheAgeMs: 0,
        sourceHealth,
        expectedStringCount: strings.length > 0 ? strings.length : 320,
        baseRowCount: strings.length,
        stringsReturned: strings.length,
        enrichedRowCount: enrich ? strings.length : 0,
        cards: {
            totalStrings: strings.length > 0 ? strings.length : 320,
            normal: finalBucketCounts.online,
            offline: finalBucketCounts.offline,
            nearline: finalBucketCounts.nearline,
            notCommunicating: finalBucketCounts.notCommunicating,
            warnings: finalGWarnCount,
            alarms: finalGAlarmCount,
            totalBpcs: finalTotalBpcs || finalKnownBpcCount,
            knownBpcCount: finalKnownBpcCount,
            expectedBpcCount: (strings.length > 0 ? strings.length : 320) * 14,
            fleetAvgCellVoltage: finalGCountV > 0 ? Number((finalGSumV/finalGCountV).toFixed(3)) : null,
            fleetMaxCellVoltageDelta: finalGMaxVDelta,
            fleetAvgCellTemp: finalGCountT > 0 ? Number((finalGSumT/finalGCountT).toFixed(1)) : null,
            fleetMaxCellTemp: finalGMaxT
        },
        rollups: {
            totalStrings: strings.length > 0 ? strings.length : 320,
            normal: finalBucketCounts.online,
            offline: finalBucketCounts.offline,
            nearline: finalBucketCounts.nearline,
            notCommunicating: finalBucketCounts.notCommunicating,
            warnings: finalGWarnCount,
            alarms: finalGAlarmCount,
            totalBpcs: finalTotalBpcs || finalKnownBpcCount,
            knownBpcCount: finalKnownBpcCount,
            expectedBpcCount: (strings.length > 0 ? strings.length : 320) * 14,
            fleetAvgCellVoltage: finalGCountV > 0 ? Number((finalGSumV/finalGCountV).toFixed(3)) : null,
            fleetMaxCellVoltageDelta: finalGMaxVDelta,
            fleetAvgCellTemp: finalGCountT > 0 ? Number((finalGSumT/finalGCountT).toFixed(1)) : null,
            fleetMaxCellTemp: finalGMaxT
        },
        totalStrings: strings.length,
        arrayCount: new Set(strings.map(s => s.arrayNumber)).size,
        normal: finalBucketCounts.online,
        offline: finalBucketCounts.offline,
        nearline: finalBucketCounts.nearline,
            notCommunicating: finalBucketCounts.notCommunicating,
            warnings: finalGWarnCount,
        alarms: finalGAlarmCount,
        totalBpcs: finalTotalBpcs || finalKnownBpcCount,
        warningStrings: finalStringWarningCount,
        alarmStrings: finalStringAlarmCount,
        finalBucketMetricRollupsApplied: true,
        finalBucketMetricRollups,
        canonicalStringSnapshot: {
            source: canonicalStringSnapshot.source,
            rollups: canonicalStringSnapshot.rollups,
            perArray: canonicalStringSnapshot.perArray
        },
        summary: {
            totalArrays: new Set(strings.map(s => s.arrayNumber)).size,
            totalStrings: finalTotalStrings,
            normalStrings: finalBucketCounts.online,
            warningStrings: finalWarningStrings,
            alarmStrings: finalAlarmStrings,
            offlineStrings: finalBucketCounts.offline,
            nearlineStrings: finalBucketCounts.nearline,
            totalBpcs: finalTotalBpcs,
            warningBpcs: finalWarningBpcs,
            alarmBpcs: finalAlarmBpcs,
            minCellVoltage: finalGMinV,
            maxCellVoltage: finalGMaxV,
            avgCellVoltage: finalGCountV > 0 ? Number((finalGSumV/finalGCountV).toFixed(3)) : null,
            maxCellVoltageDelta: finalGMaxVDelta,
            minCellTemperature: finalGMinT,
            maxCellTemperature: finalGMaxT,
            avgCellTemperature: finalGCountT > 0 ? Number((finalGSumT/finalGCountT).toFixed(1)) : null,
            maxCellTemperatureDelta: finalGMaxTDelta,
            latestTimestampUtc: new Date().toISOString()
        },
        arrays: [],
        strings
    };
    if (cycleId != null) normalizationMetrics.recordDuration(cycleId, "strings", "rollup/index construction", performance.now() - rollupStartedAt);
    measure("cache writes", () => {
        prizmCache.set("string_dashboard_enriched_ALL", result, { ttlMs: 15000, sourceUrl: "/api/local/strings/dashboard", profileId: profile?.id, emsBaseUrl: baseUrl });
        prizmCache.set("string_dashboard_base_ALL", result, { ttlMs: 15000, sourceUrl: "/api/local/strings/dashboard", profileId: profile?.id, emsBaseUrl: baseUrl });
    });
    if (cycleId != null) for (const [name, value] of Object.entries(counters)) normalizationMetrics.increment(cycleId, "strings", name, value);
    return result;
}

function freezeStringsResult<T extends { strings?: any[] }>(result: T): T {
    const strings = Array.isArray(result.strings) ? result.strings : [];
    registerCanonicalStringIndexes(result, buildCanonicalStringIndexes(strings));
    if (!Object.isFrozen(strings)) Object.freeze(strings);
    return Object.freeze(result);
}

export async function buildNormalizedStringsData(enrich = false, targetArray: number | null = null): Promise<any> {
    const cycleId = getTelemetryCycleId();
    const fingerprint = createNormalizationFingerprint(emsCache.cycleId, emsCache.strings, emsCache.block, emsCache.lastCall, stringDetailCache, enrich, targetArray);
    return cycleNormalizationCache.getOrCompute({
        cycleId,
        domain: "strings",
        variant: `${enrich ? "enriched" : "base"}:${targetArray ?? "all"}`,
        fingerprint,
        operation: () => normalizeStringsDataUncached(enrich, targetArray),
        freeze: freezeStringsResult,
    });
}

router.get("/detail-cache/status", (req, res) => {
    const status: any = {
        totalEntries: stringDetailCache.size,
        okEntries: 0,
        failedEntries: 0,
        inFlightWarmup: !!detailWarmupInFlight,
        entries: {}
    };
    stringDetailCache.forEach((v, k) => {
        if (v.ok) status.okEntries++;
        else status.failedEntries++;
        status.entries[k] = {
            ok: v.ok,
            httpStatus: v.httpStatus,
            ageMs: Date.now() - new Date(v.lastUpdated).getTime(),
            error: v.error || null
        };
    });
    res.json(status);
});

router.get("/", async (req, res) => {
    try {
        if (req.query.refresh === 'true') {
            const { requestRefresh } = await import('./prizmDataCoordinator');
            requestRefresh("route:/api/local/strings/dashboard");
        }

        const profile = ProfileStore.getActiveProfile();
        const baseUrl = profile ? `http://${profile.emsHost}:${profile.emsPort}${profile.turtlePath}` : "unknown";

        const cacheKey = `string_dashboard_${req.query.enrich === 'stringviewer' ? 'enriched' : 'base'}_${req.query.array || 'ALL'}`;
        const maxAgeMs = req.query.maxAgeMs ? parseInt(String(req.query.maxAgeMs), 10) : 5000;

        const fetcher = async () => {
            return buildNormalizedStringsData(req.query.enrich === 'stringviewer', req.query.array ? Number(req.query.array) : null);
        };
        
        const policy = prizmCache.getEffectiveCachePolicy(req.query.cache, req.query.noCache, req.query.refresh);
        const singleOwner = process.env.PRIZM_SINGLE_OWNER_ACQUISITION !== "false";
        const ownedCache = singleOwner
            ? (prizmCache.get(cacheKey) || prizmCache.get(req.query.enrich === 'stringviewer' ? "string_dashboard_enriched_ALL" : "string_dashboard_base_ALL"))
            : null;
        if (singleOwner && !ownedCache) {
            return res.status(503).json({ error: "String dashboard snapshot not yet built", warming: true });
        }
        const cacheEntry = ownedCache || await prizmCache.getOrFetch(cacheKey, fetcher, {
            ttlMs: maxAgeMs,
            sourceUrl: '/api/local/strings/dashboard',
            profileId: profile?.id,
            emsBaseUrl: baseUrl,
            forceRefresh: req.query.refresh === 'true',
            persist: true,
            policy
        });
        if (singleOwner) {
            cacheEntry.data = structuredClone(cacheEntry.data);
            cacheEntry.wasFetched = false;
        }

        const wasLiveSucceeded = cacheEntry.wasFetched && cacheEntry.sourceOk;
        const wasCacheUsed = !cacheEntry.wasFetched && (!cacheEntry.error || cacheEntry.data);

        // Hysteresis / History tracking
        if (cacheEntry.data && cacheEntry.data.strings && cacheEntry.wasFetched) {
            const hMetrics: any[] = [];
            const timestampUtc = new Date().toISOString();
            const quality = (cacheEntry.isLive && cacheEntry.sourceOk) ? "live" : "stale";
            
            const pushNumeric = (base: any, metricName: string, metricValue: number | undefined | null) => {
                if (metricValue === undefined || metricValue === null || Number.isNaN(metricValue)) return;
                hMetrics.push({ ...base, metricName, metricValue, quality });
            };
            const pushText = (base: any, metricName: string, metricText: string | undefined | null) => {
                if (!metricText || metricText.trim() === "") return;
                hMetrics.push({ ...base, metricName, metricText, quality });
            };

            cacheEntry.data.strings.forEach((s:any) => {
                 const base = {
                      timestampUtc,
                      profileId: profile?.id,
                      emsBaseUrl: cacheEntry.emsBaseUrl,
                      source: "dashboard_strings_matrix",
                      entityType: "string",
                      entityKey: s.id,
                      arrayNumber: s.arrayNumber,
                      stringNumber: s.stringNumber
                 };
                 // Numeric
                 pushNumeric(base, "socPct", s.socPct);
                 pushNumeric(base, "measuredVoltage", s.measuredVoltage);
                 pushNumeric(base, "calculatedVoltage", s.calculatedVoltage);
                 pushNumeric(base, "busVoltage", s.busVoltage);
                 pushNumeric(base, "voltageDelta", s.voltageDelta);
                 pushNumeric(base, "amps", s.amps);
                 pushNumeric(base, "kw", s.kw);
                 pushNumeric(base, "kwh", s.kwh);
                 pushNumeric(base, "minCellVoltage", s.minCellVoltage);
                 pushNumeric(base, "avgCellVoltage", s.avgCellVoltage);
                 pushNumeric(base, "maxCellVoltage", s.maxCellVoltage);
                 pushNumeric(base, "cellVoltageDelta", s.cellVoltageDelta);
                 pushNumeric(base, "minCellTemperature", s.minCellTemperature);
                 pushNumeric(base, "avgCellTemperature", s.avgCellTemperature);
                 pushNumeric(base, "maxCellTemperature", s.maxCellTemperature);
                 pushNumeric(base, "cellTemperatureDelta", s.cellTemperatureDelta);
                 pushNumeric(base, "warningCount", s.warningCount);
                 pushNumeric(base, "alarmCount", s.alarmCount);
                 pushNumeric(base, "recloseCount", s.recloseCount);
                 // Text
                 pushText(base, "operationalState", s.operationalState);
                 pushText(base, "rotationStatus", s.rotationStatus);
                 pushText(base, "contactorStatus", s.contactorStatus);
                 pushText(base, "fanStatus", s.fanStatus);
            });
            prizmHistory.appendSamples(hMetrics);
        }

        cacheEntry.dataClass = "live-telemetry";
        const meta = prizmCache.getActiveSiteMetadata();
        const activeIdentity = { activeProfileId: profile?.id, emsBaseUrl: baseUrl, stationCode: meta.stationCode, blockIndex: meta.blockIndex };
        const refreshRequested = req.query.refresh === 'true';
        const liveAttempted = prizmCache.shouldFetchLive(policy) || refreshRequested;
        const cacheMetadata = prizmCache.buildCacheMetadata(
            policy,
            Boolean(wasCacheUsed),
            Boolean(liveAttempted),
            Boolean(wasLiveSucceeded),
            cacheEntry,
            activeIdentity,
            "live-ems"
        );

        const outputData = policy === "live-only" && !wasLiveSucceeded ? {} : cacheEntry.data;

        // Dedicated contactor state engine, fast path:
        // Do NOT block the String List route on a 320-endpoint stringviewer sweep.
        // Merge the latest normalized contactor snapshot immediately, and trigger a
        // background refresh when missing/stale or explicitly requested.
        if (outputData && Array.isArray((outputData as any).strings)) {
            const snapshot = getLatestContactorSnapshot();
            const snapshotAgeMs = typeof snapshot.ageMs === "number" ? snapshot.ageMs : null;
            const snapshotMissing = !snapshot.hasSnapshot || snapshot.states.length === 0;
            const snapshotStale = snapshotAgeMs === null || snapshotAgeMs > 5000;
            const refreshRequested = req.query.refresh === "true";

            if (!singleOwner && (snapshotMissing || snapshotStale || refreshRequested) && !snapshot.inFlight) {
                triggerContactorRefresh({
                    ttlMs: 5000,
                    timeoutMs: 5000,
                    concurrency: 12
                }).catch((err: any) => {
                    console.warn("[Contactor Engine] Background refresh failed:", err?.message || err);
                });
            }

            const stateByKey = new Map(
                snapshot.states.map((state) => [`${state.arrayNumber}:${state.stringNumber}`, state])
            );

            (outputData as any).strings = (outputData as any).strings.map((row: any) => {
                const arrayNumber = Number(row?.arrayNumber ?? row?.arrayIndex);
                const stringNumber = Number(row?.stringNumber ?? row?.stringIndex);
                return mergeContactorStateIntoStringRow(row, stateByKey.get(`${arrayNumber}:${stringNumber}`));
            });

            (outputData as any).contactorSummary = {
                ...snapshot.summary,
                ageMs: snapshotAgeMs,
                snapshotReady: snapshot.hasSnapshot,
                inFlight: snapshot.inFlight,
                lastError: snapshot.lastError
            };

            (outputData as any).freshness = {
                ...((outputData as any).freshness || {}),
                contactorAgeMs: snapshotAgeMs,
                contactorSnapshotReady: snapshot.hasSnapshot,
                contactorRefreshInFlight: snapshot.inFlight
            };
        }

        const responsePayload = {
            ...outputData, 
            cycleId: cacheEntry.cycleId,
            ...cacheMetadata,
            cache: {
                key: cacheEntry.key,
                cycleId: cacheEntry.cycleId,
                fetchedAt: cacheEntry.fetchedAt,
                updatedAt: cacheEntry.updatedAt,
                ageMs: cacheEntry.ageMs,
                ttlMs: cacheEntry.ttlMs,
                sourceOk: cacheEntry.sourceOk,
                isLive: cacheEntry.isLive,
                isStale: cacheEntry.isStale,
                wasFetched: cacheEntry.wasFetched,
                error: cacheEntry.error,
                profileId: cacheEntry.profileId,
                emsBaseUrl: cacheEntry.emsBaseUrl
            },
            cacheAgeMs: cacheEntry.ageMs, 
            isCached: !cacheEntry.isLive || cacheEntry.isStale, 
            sourceOk: cacheEntry.sourceOk,
            isLive: cacheEntry.isLive,
            isStale: cacheEntry.isStale
        };
        res.json(await graphIdentityResolver.applyRouteIdentity("GET /api/local/strings/dashboard", responsePayload));

    } catch (e: any) {
        res.status(500).json({ error: e.message || "Failed to process strings dashboard" });
    }
});



async function fetchStringviewerContactorStateForRow(baseUrl: string, row: any): Promise<boolean | null> {
  const arrayNumber = Number(row?.arrayNumber ?? row?.arrayIndex);
  const stringNumber = Number(row?.stringNumber ?? row?.stringIndex);

  if (!Number.isFinite(arrayNumber) || !Number.isFinite(stringNumber)) return null;

  const endpoint = `/tools/monitor/ems/stringviewer/array/${arrayNumber}/${stringNumber}/data`;
  const url = `${baseUrl}${endpoint}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1800);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) return null;

    const raw = await res.json();
    const model = raw?.stringViewerDataModel ?? raw;

    const pos = strictBool(model?.positiveContactorClosed);
    const neg = strictBool(model?.negativeContactorClosed);

    if (pos === true && neg === true) return true;
    if (pos === false && neg === false) return false;

    // Partial/mismatch is real but not a confirmed open/closed state.
    return null;
  } catch {
    return null;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    () => worker()
  );

  await Promise.all(workers);
  return results;
}

function strictBool(value: any): boolean | null {
  if (value === true) return true;
  if (value === false) return false;
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim().toUpperCase();
  if (["TRUE", "1", "CLOSED", "CLOSE", "ON"].includes(text)) return true;
  if (["FALSE", "0", "OPEN", "OPENED", "OFF"].includes(text)) return false;
  return null;
}

function strictContactorClosedFromAny(source: any): boolean | null {
  if (!source || typeof source !== "object") return null;

  const pos = strictBool(
    source.positiveContactorClosed ??
    source.positiveClosed ??
    source.posContactorClosed ??
    source.contactorPositiveClosed
  );

  const neg = strictBool(
    source.negativeContactorClosed ??
    source.negativeClosed ??
    source.negContactorClosed ??
    source.contactorNegativeClosed
  );

  if (pos === true && neg === true) return true;
  if (pos === false && neg === false) return false;
  if (pos !== null || neg !== null) return null;

  const statusText = String(
    source.contactorStatus ??
    source.contactStatus ??
    source.contactState ??
    source.contactorState ??
    source.stringContactorState ??
    source.stringConnectionState ??
    ""
  ).trim().toUpperCase();

  if (statusText === "CLOSED" || statusText === "CLOSE") return true;
  if (statusText === "OPEN" || statusText === "OPENED") return false;

  return null;
}

function applyAuthoritativeContactorState(row: any, closed: boolean | null, source: string): any {
  if (closed === true) {
    return {
      ...row,
      positiveContactorClosed: true,
      negativeContactorClosed: true,
      bothContactorsClosed: true,
      contactorsClosed: true,
      contactorStatus: "CLOSED",
      contactorState: "CLOSED",
      stringContactorState: "CLOSED",
      actualContactorStateSource: source
    };
  }

  if (closed === false) {
    return {
      ...row,
      positiveContactorClosed: false,
      negativeContactorClosed: false,
      bothContactorsClosed: false,
      contactorsClosed: false,
      contactorStatus: "OPEN",
      contactorState: "OPEN",
      stringContactorState: "OPEN",
      actualContactorStateSource: source
    };
  }

  return {
    ...row,
    positiveContactorClosed: null,
    negativeContactorClosed: null,
    bothContactorsClosed: null,
    contactorsClosed: null,
    contactorStatus: "UNKNOWN",
    contactorState: "UNKNOWN",
    stringContactorState: "UNKNOWN",
    actualContactorStateSource: source
  };
}



router.get("/corrective-actions", async (req, res) => {
    try {
        const snapshot = getLatestContactorSnapshot();

        if ((!snapshot.hasSnapshot || snapshot.states.length === 0) && !snapshot.inFlight) {
            triggerContactorRefresh({
                ttlMs: 5000,
                timeoutMs: 5000,
                concurrency: 12
            }).catch((err: any) => {
                console.warn("[Corrective Actions] Background contactor refresh failed:", err?.message || err);
            });
        }

        let hvacFindings: any[] = [];

        try {
            const port = process.env.PORT || "3000";
            const featherRes = await fetch(`http://localhost:${port}/api/feather/devices?cache=cache-first&maxAgeMs=60000`);
            if (featherRes.ok) {
                const featherJson: any = await featherRes.json();
                const devices = Array.isArray(featherJson?.devices) ? featherJson.devices : [];
                const featherNormalizedHvacFindings = normalizeFeatherHvacCorrectiveFindings(devices, { profile: "dometic" });

                hvacFindings = featherNormalizedHvacFindings.length > 0
                    ? featherNormalizedHvacFindings
                    : analyzeHvacDevices(devices);
            }
        } catch (err: any) {
            console.warn("[Corrective Actions] HVAC analysis skipped:", err?.message || err);
        }

        const findings = [
            ...analyzeContactorStates(snapshot.states),
            ...hvacFindings
        ];

        const summary = summarizeCorrectiveActions(findings);

        res.json({
            success: true,
            summary,
            findings,
            source: {
                contactorSnapshotReady: snapshot.hasSnapshot,
                contactorAgeMs: snapshot.ageMs,
                contactorRefreshInFlight: snapshot.inFlight,
                lastError: snapshot.lastError
            }
        });
    } catch (err: any) {
        res.status(500).json({
            success: false,
            error: err?.message || String(err)
        });
    }
});

router.get("/contactors/state", async (req, res) => {
    try {
        const result = await getContactorStatesForAllStrings({
            refresh: req.query.refresh === "true",
            ttlMs: req.query.maxAgeMs ? Number(req.query.maxAgeMs) : 2500,
            timeoutMs: req.query.timeoutMs ? Number(req.query.timeoutMs) : 1800,
            concurrency: req.query.concurrency ? Number(req.query.concurrency) : 40
        });
        res.json({ success: true, ...result });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err?.message || String(err) });
    }
});

router.get("/:arrayNumber/:stringNumber/detail/raw", async (req, res) => {
    try {
        const arrayNumber = Number(req.params.arrayNumber);
        const stringNumber = Number(req.params.stringNumber);
        const requestedStringKey = `A${arrayNumber}-S${stringNumber}`;
        stringViewerScheduler.requestRefresh(requestedStringKey, "active-detail-route");
        const profile = ProfileStore.getActiveProfile();
        
        if (!profile) return res.status(400).json({ error: "No active profile" });
        const baseUrl = `http://${profile.emsHost}:${profile.emsPort}${profile.turtlePath}`;

        const stringViewerUrl = `${baseUrl}/tools/monitor/ems/stringviewer/array/${arrayNumber}/${stringNumber}/data`;
        const r = await fetch(stringViewerUrl);
        if (r.ok) {
            res.json(await r.json());
        } else {
            res.status(r.status).json({ error: `HTTP ${r.status}` });
        }
    } catch(e) {
        res.status(500).json({ error: String(e) });
    }
});

function parseNumberOrNull(value: any): number | null {
  if (value === null || value === undefined || value === "" || value === "---") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getCellMapEntry(
  model: any,
  mapName: "voltageMap" | "temperatureMap" | "timestampMap" | "balancingMap",
  bp: number,
  cg: number
): any | null {
  return model?.[mapName]?.batteryPacks?.[String(bp)]?.cellGroups?.[String(cg)] ?? null;
}

function normalizeStringViewerMonitorData(raw: any) {
  const model = raw?.stringViewerDataModel ?? raw;
  const batteryPackCount = Number(model?.batteryPackCount ?? 14);
  const cellGroupCount = Number(model?.cellGroupCount ?? 30);
  const voltageMatrix: (number | null)[][] = [];
  const temperatureMatrix: (number | null)[][] = [];
  const timestampMatrix: (number | null)[][] = [];
  const balancingMatrix: (string | null)[][] = [];
  const bpcs = [];
  for (let bp = 1; bp <= batteryPackCount; bp++) {
    const voltageRow = [];
    const temperatureRow = [];
    const timestampRow = [];
    const balancingRow = [];
    const cellGroups = [];
    for (let cg = 1; cg <= cellGroupCount; cg++) {
      const voltageEntry = getCellMapEntry(model, "voltageMap", bp, cg);
      const temperatureEntry = getCellMapEntry(model, "temperatureMap", bp, cg);
      const timestampEntry = getCellMapEntry(model, "timestampMap", bp, cg);
      const balancingEntry = getCellMapEntry(model, "balancingMap", bp, cg);
      const voltage = parseNumberOrNull(voltageEntry?.value);
      const temperature = parseNumberOrNull(temperatureEntry?.value);
      const timestampAge = parseNumberOrNull(timestampEntry?.value);
      const balancing = balancingEntry?.value === "---" ? null : String(balancingEntry?.value ?? "");
      voltageRow.push(voltage);
      temperatureRow.push(temperature);
      timestampRow.push(timestampAge);
      balancingRow.push(balancing);
      cellGroups.push({
        cellGroupIndex: cg,
        voltage,
        temperature,
        timestampAge,
        balancing,
        voltageColor: voltageEntry?.color ?? null,
        temperatureColor: temperatureEntry?.color ?? null,
        timestampColor: timestampEntry?.color ?? null,
        balancingColor: balancingEntry?.color ?? null,
        source: "stringviewer-monitor"
      });
    }
    voltageMatrix.push(voltageRow);
    temperatureMatrix.push(temperatureRow);
    timestampMatrix.push(timestampRow);
    balancingMatrix.push(balancingRow);
    bpcs.push({
      bpcNumber: bp,
      batteryPackIndex: bp,
      cellGroups
    });
  }
  return {
    stringViewerMonitorDataModel: model,
    voltageMatrix,
    temperatureMatrix,
    timestampMatrix,
    balancingMatrix,
    bpcs,
    monitorSummary: {
      arrayIndex: model?.arrayIndex,
      stringIndex: model?.stringIndex,
      batteryPackCount,
      cellGroupCount,
      soc: model?.soc,
      dcBusVoltage: model?.dcBusVoltage,
      outRotation: model?.outRotation,
      positiveContactorClosed: model?.positiveContactorClosed,
      negativeContactorClosed: model?.negativeContactorClosed,
      calculatedStringVoltage: model?.calculatedStringVoltage,
      measuredStringVoltage: model?.measuredStringVoltage,
      preciseCalculatedStringVoltage: model?.preciseCalculatedStringVoltage,
      stringCurrent: model?.stringCurrent,
      contactorsCloseExpected: model?.contactorsCloseExpected,
      recloseCount: model?.recloseCount,
      maxCellGroupTemp: model?.maxCellGroupTemp,
      minCellGroupTemp: model?.minCellGroupTemp,
      avgCellGroupTemp: model?.avgCellGroupTemp,
      maxCellGroupVoltage: model?.maxCellGroupVoltage,
      minCellGroupVoltage: model?.minCellGroupVoltage,
      avgCellGroupVoltage: model?.avgCellGroupVoltage,
      stringConnectionState: model?.stringConnectionState,
      badReport: model?.badReport,
      reportTimestamp: model?.reportTimestamp,
      isLockedOutOfRotation: model?.isLockedOutOfRotation,
      hasVoltageMap: model?.hasVoltageMap,
      hasTemperatureMap: model?.hasTemperatureMap,
      hasTimestampMap: model?.hasTimestampMap,
      hasBalancingMap: model?.hasBalancingMap,
      ampHours: model?.ampHours,
      powerkW: model?.powerkW,
      energykWh: model?.energykWh,
      alarmsAndWarns: model?.alarmsAndWarns ?? []
    }
  };
}


async function getNormalizedStringRowForDetail(arrayNumber: number, stringNumber: number): Promise<any | null> {
    try {
        const dashboard = await buildNormalizedStringsData(true, null);
        const rows = Array.isArray((dashboard as any)?.strings) ? (dashboard as any).strings : [];
        return rows.find((row: any) =>
            Number(row?.arrayNumber ?? row?.arrayIndex) === Number(arrayNumber) &&
            Number(row?.stringNumber ?? row?.stringIndex) === Number(stringNumber)
        ) || null;
    } catch (err: any) {
        console.warn("[String Detail] normalized row merge failed:", err?.message || err);
        return null;
    }
}


router.get("/:arrayNumber/:stringNumber/detail", async (req, res) => {
    const startedAt = Date.now();
    const includePerf = req.query.includePerf === "true";
    try {
        const arrayNumber = Number(req.params.arrayNumber);
        const stringNumber = Number(req.params.stringNumber);
        const requestedStringKey = `A${arrayNumber}-S${stringNumber}`;
        stringViewerScheduler.requestRefresh(requestedStringKey, "active-detail-route");
        const profile = ProfileStore.getActiveProfile();
        
        if (!profile) return res.status(400).json({ error: "No active profile" });
        const baseUrl = `http://${profile.emsHost}:${profile.emsPort}${profile.turtlePath}`;

        const cacheKey = `string_detail_${arrayNumber}_${stringNumber}`;
        const maxAgeMs = req.query.maxAgeMs ? parseInt(String(req.query.maxAgeMs), 10) : 5000;

        const fetcher = async () => {
            const reportEndpoint = `/tools/report/ems/array/${arrayNumber}/string/${stringNumber}/report.json`;
            const monitorEndpoint = `/tools/monitor/ems/stringviewer/array/${arrayNumber}/${stringNumber}/data`;
            const reportUrl = `${baseUrl}${reportEndpoint}`;
            const monitorUrl = `${baseUrl}${monitorEndpoint}`;

            let reportSourceHealth: any = { ok: false, url: reportUrl, endpoint: reportEndpoint, httpStatus: null, durationMs: null, error: null };
            let monitorSourceHealth: any = { ok: false, url: monitorUrl, endpoint: monitorEndpoint, httpStatus: null, durationMs: null, error: null };
            const notificationsEndpoint = `/tools/report/ems/array/${arrayNumber}/notifications.json`;
            const notificationsUrl = `${baseUrl}${notificationsEndpoint}`;
            let notificationsSourceHealth: any = { ok: false, url: notificationsUrl, endpoint: notificationsEndpoint, httpStatus: null, durationMs: null, error: null };

            let reportData: any = null;
            let monitorData: any = null;
            let rawNotifications: any[] = [];

            try {
                const [reportRes, monitorRes, notificationsRes] = await Promise.allSettled([
                    (async () => {
                        const start = Date.now();
                        try {
                            const controller = new AbortController();
                            const timeoutId = setTimeout(() => controller.abort(), 2000);
                            let r;
                            let fallbackAttempted = false;
                            try {
                                r = await fetch(reportUrl, { signal: controller.signal });
                                if (!r.ok && !reportUrl.includes("127.0.0.1:3000") && !reportUrl.includes("localhost:3000")) {
                                    fallbackAttempted = true;
                                    r = await fetch(`http://127.0.0.1:3000${reportEndpoint}`);
                                }
                            } catch (err: any) {
                                if (!fallbackAttempted && !reportUrl.includes("127.0.0.1:3000") && !reportUrl.includes("localhost:3000")) {
                                    r = await fetch(`http://127.0.0.1:3000${reportEndpoint}`);
                                } else {
                                    throw err;
                                }
                            }
                            clearTimeout(timeoutId);
                            reportSourceHealth.httpStatus = r.status;
                            reportSourceHealth.ok = r.ok;
                            if (r.ok) reportData = await r.json();
                            else reportSourceHealth.error = `HTTP ${r.status}`;
                        } catch(e: any) {
                            reportSourceHealth.error = e.message;
                        } finally {
                            reportSourceHealth.durationMs = Date.now() - start;
                        }
                    })(),
                    (async () => {
                        const start = Date.now();
                        try {
                            const controller = new AbortController();
                            const timeoutId = setTimeout(() => controller.abort(), 2000);
                            let r;
                            let fallbackAttempted = false;
                            try {
                                r = await fetch(monitorUrl, { signal: controller.signal });
                                if (!r.ok && !monitorUrl.includes("127.0.0.1:3000") && !monitorUrl.includes("localhost:3000")) {
                                    fallbackAttempted = true;
                                    r = await fetch(`http://127.0.0.1:3000${monitorEndpoint}`);
                                }
                            } catch (err: any) {
                                if (!fallbackAttempted && !monitorUrl.includes("127.0.0.1:3000") && !monitorUrl.includes("localhost:3000")) {
                                    r = await fetch(`http://127.0.0.1:3000${monitorEndpoint}`);
                                } else {
                                    throw err;
                                }
                            }
                            clearTimeout(timeoutId);
                            monitorSourceHealth.httpStatus = r.status;
                            monitorSourceHealth.ok = r.ok;
                            if (r.ok) monitorData = await r.json();
                            else monitorSourceHealth.error = `HTTP ${r.status}`;
                        } catch(e: any) {
                            monitorSourceHealth.error = e.message;
                        } finally {
                            monitorSourceHealth.durationMs = Date.now() - start;
                        }
                    })(),
                    (async () => {
                        const start = Date.now();
                        try {
                            const controller = new AbortController();
                            const timeoutId = setTimeout(() => controller.abort(), 2000);
                            let r;
                            let fallbackAttempted = false;
                            try {
                                r = await fetch(notificationsUrl, { signal: controller.signal });
                                if (!r.ok && !notificationsUrl.includes("127.0.0.1:3000") && !notificationsUrl.includes("localhost:3000")) {
                                    fallbackAttempted = true;
                                    r = await fetch(`http://127.0.0.1:3000${notificationsEndpoint}`);
                                }
                            } catch (err: any) {
                                if (!fallbackAttempted && !notificationsUrl.includes("127.0.0.1:3000") && !notificationsUrl.includes("localhost:3000")) {
                                    r = await fetch(`http://127.0.0.1:3000${notificationsEndpoint}`);
                                } else {
                                    throw err;
                                }
                            }
                            clearTimeout(timeoutId);
                            notificationsSourceHealth.httpStatus = r.status;
                            notificationsSourceHealth.ok = r.ok;
                            if (r.ok) {
                                const payload = await r.json();
                                rawNotifications = Array.isArray(payload) ? payload : (payload?.rows || payload?.notifications || []);
                            }
                            else notificationsSourceHealth.error = `HTTP ${r.status}`;
                        } catch(e: any) {
                            notificationsSourceHealth.error = e.message;
                        } finally {
                            notificationsSourceHealth.durationMs = Date.now() - start;
                        }
                    })()
                ]);
            } catch (e) {
                // Ignore unexpected errors from allSettled
            }

            let finalData: any = {};
            
            if (reportSourceHealth.ok && reportData) {
                finalData = {
                    arrayIndex: reportData.arrayIndex ?? arrayNumber,
                    stringIndex: reportData.stringIndex ?? stringNumber,
                    enclosureIndex: reportData.enclosureIndex,
                    enclosureLocation: reportData.enclosureLocation,
                    batteryPackReportList: reportData.batteryPackReportList || [],
                    stringData: reportData.stringData || null,
                    timeStamp: reportData.timeStamp,
                };
            } else {
                finalData = {
                    arrayIndex: arrayNumber,
                    stringIndex: stringNumber,
                    stringData: null,
                };
            }

            if (monitorSourceHealth.ok && monitorData) {
                const normalizedMonitor = normalizeStringViewerMonitorData(monitorData);
                finalData = {
                    ...finalData,
                    ...normalizedMonitor.monitorSummary,
                    voltageMatrix: normalizedMonitor.voltageMatrix,
                    temperatureMatrix: normalizedMonitor.temperatureMatrix,
                    timestampMatrix: normalizedMonitor.timestampMatrix,
                    balancingMatrix: normalizedMonitor.balancingMatrix,
                    bpcs: normalizedMonitor.bpcs,
                    stringViewerMonitorDataModel: normalizedMonitor.stringViewerMonitorDataModel
                };
            }

            // Filter and map notifications for this specific string.
            // Match BOTH array and string; stringIndex alone can pull notifications from the wrong array.
            const stringNotifications = rawNotifications
                .filter((n: any) => {
                    const source = n?.notificationSource || {};
                    const aIdx = source.arrayIndex ?? source.arrayNumber ?? source.arrayNo ?? n.arrayIndex ?? n.arrayNumber;
                    const sIdx = source.stringIndex ?? source.stringNumber ?? source.stringNo ?? n.stringIndex ?? n.stringNumber;

                    return (
                        aIdx !== undefined &&
                        sIdx !== undefined &&
                        Number(aIdx) === Number(arrayNumber) &&
                        Number(sIdx) === Number(stringNumber)
                    );
                })
                .map((n: any) => {
                    const type = n?.notificationType || {};
                    const source = n?.notificationSource || {};
                    const rawCategory = String(type.notificationCategory || n.category || n.level || "General").toUpperCase();
                    const isAlarm =
                        rawCategory.includes("ALARM") ||
                        rawCategory.includes("FAULT") ||
                        rawCategory.includes("CRITICAL");

                    const code = type.notificationId || n.id || n.code || type.notificationCode || "Unknown";
                    const triggerMessage = n.triggerMessage || n.displayText || n.message || n.text || "Active Fault";

                    return {
                        category: rawCategory,
                        severity: isAlarm ? "alarm" : "warning",
                        level: isAlarm ? "ALARM" : "WARN",
                        id: code,
                        code,
                        name: `${code} - ${triggerMessage}`,
                        description: `${code} - ${triggerMessage}`,
                        endpointType: source.endpointType || n.endpointType || "EMS",
                        arrayIndex: source.arrayIndex ?? n.arrayIndex ?? arrayNumber,
                        stringIndex: source.stringIndex ?? n.stringIndex ?? stringNumber,
                        batteryPackIndex: source.batteryPackIndex ?? n.batteryPackIndex ?? null,
                        cellGroupIndex: source.cellGroupIndex ?? n.cellGroupIndex ?? null,
                        triggerMessage,
                        timestamp: n.timestamp || new Date().toISOString(),
                        raw: n
                    };
                });

            const stringWarnings = stringNotifications.filter((n: any) => String(n.level || n.severity || "").toUpperCase().includes("WARN"));
            const stringAlarms = stringNotifications.filter((n: any) => {
                const level = String(n.level || n.severity || n.category || "").toUpperCase();
                return level.includes("ALARM") || level.includes("FAULT") || level.includes("CRITICAL");
            });

            const notificationDebugMatches = rawNotifications
                .map((n: any) => {
                    const source = n?.notificationSource || {};
                    const type = n?.notificationType || {};
                    return {
                        category: type.notificationCategory,
                        id: type.notificationId,
                        arrayIndex: source.arrayIndex ?? n.arrayIndex,
                        stringIndex: source.stringIndex ?? n.stringIndex,
                        endpointType: source.endpointType ?? n.endpointType,
                        batteryPackIndex: source.batteryPackIndex ?? n.batteryPackIndex,
                        cellGroupIndex: source.cellGroupIndex ?? n.cellGroupIndex,
                        triggerMessage: n.triggerMessage || n.displayText || n.message || n.text
                    };
                })
                .filter((n: any) =>
                    Number(n.arrayIndex) === Number(arrayNumber) ||
                    Number(n.stringIndex) === Number(stringNumber)
                )
                .slice(0, 50);

            finalData.notifications = stringNotifications;
            finalData.notificationList = stringNotifications;
            finalData.activeNotifications = stringNotifications;
            finalData.faults = stringNotifications;
            finalData.warnings = stringWarnings;
            finalData.alarms = stringAlarms;
            finalData.warningCount = stringWarnings.length;
            finalData.alarmCount = stringAlarms.length;
            finalData.uniqueWarningCount = new Set(stringWarnings.map((n: any) => `${n.code}:${n.description}`)).size;
            finalData.uniqueAlarmCount = new Set(stringAlarms.map((n: any) => `${n.code}:${n.description}`)).size;
            finalData.notificationDebug = {
                requestedArrayNumber: arrayNumber,
                requestedStringNumber: stringNumber,
                rawNotificationCount: rawNotifications.length,
                matchedNotificationCount: stringNotifications.length,
                nearbyOrPartialMatches: notificationDebugMatches
            };
            finalData.alertSummary = {
                warningCount: finalData.warningCount,
                alarmCount: finalData.alarmCount,
                uniqueWarningCount: finalData.uniqueWarningCount,
                uniqueAlarmCount: finalData.uniqueAlarmCount,
                warnings: stringWarnings,
                alarms: stringAlarms,
                notifications: stringNotifications
            };

            finalData.sourceHealth = {
                stringviewerReport: reportSourceHealth,
                stringviewerMonitor: monitorSourceHealth,
                notifications: notificationsSourceHealth
            };

            const isOk = reportSourceHealth.ok || monitorSourceHealth.ok;

            stringDetailCache.set(getStringDetailCacheKey(arrayNumber, stringNumber), {
                arrayNumber,
                stringNumber,
                endpoint: reportEndpoint,
                url: reportUrl,
                ok: isOk,
                httpStatus: monitorSourceHealth.ok ? monitorSourceHealth.httpStatus : reportSourceHealth.httpStatus,
                lastUpdated: new Date().toISOString(),
                data: isOk ? finalData : null,
                error: isOk ? undefined : (monitorSourceHealth.error || reportSourceHealth.error)
            });

            return finalData;
        };

        const policy = prizmCache.getEffectiveCachePolicy(req.query.cache, req.query.noCache, req.query.refresh);
        const cacheEntry = await prizmCache.getOrFetch(cacheKey, fetcher, {
            ttlMs: maxAgeMs,
            sourceUrl: `/api/local/strings/dashboard/${arrayNumber}/${stringNumber}/detail`,
            profileId: profile.id,
            emsBaseUrl: baseUrl,
            forceRefresh: req.query.refresh === 'true',
            persist: true,
            policy
        });

        const wasLiveSucceeded = cacheEntry.wasFetched && cacheEntry.sourceOk;
        const wasCacheUsed = !cacheEntry.wasFetched && (!cacheEntry.error || cacheEntry.data);

        cacheEntry.dataClass = "live-telemetry";
        const meta = prizmCache.getActiveSiteMetadata();
        const activeIdentity = { activeProfileId: profile?.id, emsBaseUrl: baseUrl, stationCode: meta.stationCode, blockIndex: meta.blockIndex };
        const refreshRequested = req.query.refresh === 'true';
        const liveAttempted = prizmCache.shouldFetchLive(policy) || refreshRequested;
        const cacheMetadata = prizmCache.buildCacheMetadata(
            policy,
            Boolean(wasCacheUsed),
            Boolean(liveAttempted),
            Boolean(wasLiveSucceeded),
            cacheEntry,
            activeIdentity,
            "live-ems"
        );

        const outputData = policy === "live-only" && !wasLiveSucceeded ? {} : cacheEntry.data;

        const responsePayload: any = {
            ...outputData, 
            ...cacheMetadata,
            cache: {
                key: cacheEntry.key,
                fetchedAt: cacheEntry.fetchedAt,
                updatedAt: cacheEntry.updatedAt,
                ageMs: cacheEntry.ageMs,
                ttlMs: cacheEntry.ttlMs,
                sourceOk: cacheEntry.sourceOk,
                isLive: cacheEntry.isLive,
                isStale: cacheEntry.isStale,
                wasFetched: cacheEntry.wasFetched,
                error: cacheEntry.error,
                profileId: cacheEntry.profileId,
                emsBaseUrl: cacheEntry.emsBaseUrl
            },
            cacheAgeMs: cacheEntry.ageMs, 
            isCached: !cacheEntry.isLive || cacheEntry.isStale, 
            sourceOk: cacheEntry.sourceOk,
            isLive: cacheEntry.isLive,
            isStale: cacheEntry.isStale
        };
        if (includePerf) {
            responsePayload.perf = {
                durationMs: Date.now() - startedAt,
                cacheHit: Boolean(wasCacheUsed),
                liveAttempted: Boolean(liveAttempted),
                source: (outputData as any)?.sourceUrl || "cache"
            };
        }
        res.json(responsePayload);
    } catch(err) {
        res.status(500).json({ error: (err as any).message });
    }
});

export default router;
