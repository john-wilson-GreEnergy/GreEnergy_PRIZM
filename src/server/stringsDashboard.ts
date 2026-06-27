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
  getEmsCachedArrayReports
} from "./emsTurtleClient";
import { ProfileStore } from "./profiles/profileStore";

import * as prizmCache from "./cache/prizmCache";
import * as prizmHistory from "./history/prizmHistory";
import { BESS_STATUS_CODE_MAP, describeBessStatusCode, classifyBessStatusCode } from "../lib/bessStatusCodes";
import { classifyStringOperationalState } from "../lib/stringClassifier";
import { stringNumberToEnergySegment, formatStringEsLabel } from "../lib/stringToEsMapper";

const router = Router();

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

export async function buildNormalizedStringsData(enrich = false, targetArray: number | null = null): Promise<any> {
    const finiteVal = (v: any): number | null => {
        const num = Number(v);
        return Number.isFinite(num) ? num : null;
    };
    const profile = ProfileStore.getActiveProfile();
    const baseUrl = profile ? `http://${profile.emsHost}:${profile.emsPort}${profile.turtlePath}` : "unknown";

    const rawStringsWrapper = getEmsCachedRawStrings();
    const blockWrapper = getEmsCachedBlock();
    const stringIpMapWrapper = getEmsStringIpMap();
    const ipMapWrapper = getEmsIpMap();
    const lastCallWrapper = getEmsCachedLastCall();
    const statusWrapper = getEmsCachedStatus();
    const controllerStatsWrapper = getEmsCachedControllerStatistics();
    const bessStatusCodesWrapper = getEmsCachedStatusCodes();
    const debugInfo = getEmsSourcesDebugInfo() || {};

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

    for (let a = 1; a <= 8; a++) {
        const arrayRep = arrayReports[a]?.data;
        for (let s = 1; s <= 40; s++) {
            const id = `A${a}-S${s}`;
            totalStrings++;

            // 1. Existing string detail cache/report data, if already available and fresh
            const detail = getCachedStringDetail(a, s);
            const detailStringData = detail?.data?.stringData ?? detail?.data ?? null;

            // 2. Block Viewer string data
            const blockStrBase = blockWrapper.data?.strings?.find((str: any) => pN(str.array) === a && pN(str.string) === s) || null;

            // 3. lastCall string data
            let lcStrBase = lastCallStrings?.find(str => pN(str.array) === a && pN(str.string) === s) || null;
            if (!lcStrBase && lastCallArrays) {
                const lcA = lastCallArrays.find(arr => pN(arr.index || arr.arrayIndex) === a);
                if (lcA && Array.isArray(lcA.strings)) {
                    lcStrBase = lcA.strings.find((str: any) => pN(str.index || str.stringIndex) === s) || null;
                }
            }

            // 4. strings.csv fallbacks
            const stringsCsvRow = (rawStringsWrapper.data && Array.isArray(rawStringsWrapper.data)) ? rawStringsWrapper.data.find((r: any) => {
                const normObj: Record<string, any> = {};
                for (const [k, v] of Object.entries(r)) { normObj[normalizeHeader(k)] = v; }
                const arrNum = pN(tryGetField(r, normObj, ["array", "arrayindex", "arr"]));
                const strNum = pN(tryGetField(r, normObj, ["string", "stringindex", "str"]));
                return arrNum === a && strNum === s;
            }) : null;

            // 5. Topology/IP Map
            const sIpInfo = stringIpMap.find(m => pN(m.array) === a && pN(m.string) === s);

            // Helper to fetch the first non-null, non-undefined, non-empty value in priority order
            const getMetricValue = (keys: string[], parser?: (v: any) => any) => {
                const candidates = [];
                if (detailStringData) candidates.push(detailStringData);
                if (blockStrBase) candidates.push(blockStrBase);
                if (lcStrBase) candidates.push(lcStrBase);
                if (stringsCsvRow) candidates.push(stringsCsvRow);
                if (sIpInfo) candidates.push(sIpInfo);

                for (const cand of candidates) {
                    const normCand: Record<string, any> = {};
                    for (const [k, v] of Object.entries(cand)) {
                        normCand[normalizeHeader(k)] = v;
                    }
                    const val = tryGetField(cand, normCand, keys);
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

            let communicating = true;
            const connectionStateUpper = String(rawStringConnectionState || "").toUpperCase();
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
                connectionStateUpper === "OFFLINE"
            ) {
                communicating = true;
            } else {
                // fallback
                let isOnlineFallback = getMetricValue(["connectionstate", "contact", "communicating", "stringconnectionstate"], (v) => {
                    if (typeof v === "boolean") return v;
                    const sStr = String(v).toUpperCase();
                    return sStr === "ONLINE" || sStr === "NORMAL" || sStr === "TRUE" || sStr === "1";
                });
                if (isOnlineFallback === null) {
                    isOnlineFallback = false;
                }
                communicating = isOnlineFallback;
            }
            const isOnline = communicating;

            let outRotation = parseBoolean(getMetricValue(["outrotation", "out_rotation", "rotation"]));
            if (connectionStateUpper === "OFFLINE") {
                outRotation = true;
            }
            const rotationStatus = outRotation ? "OUT" : "IN";
            const rotationEnabled = !outRotation;

            let positiveContactorClosed = false;
            let negativeContactorClosed = false;
            const contactorStateUpper = String(rawStringContactorState || "").toUpperCase();
            if (contactorStateUpper === "CLOSED") {
                positiveContactorClosed = true;
                negativeContactorClosed = true;
            } else if (contactorStateUpper === "OPEN") {
                positiveContactorClosed = false;
                negativeContactorClosed = false;
            } else {
                // fallback
                positiveContactorClosed = parseBoolean(getMetricValue(["positivecontactorclosed", "positive_contactor_closed"]));
                negativeContactorClosed = parseBoolean(getMetricValue(["negativecontactorclosed", "negative_contactor_closed"]));
            }
            const contactorClosed = positiveContactorClosed && negativeContactorClosed;
            const contactorStatus = contactorClosed ? "CLOSED" : "OPEN";
            const recloseCount = pN(getMetricValue(["reclosecount"]));
            const contactorsCloseExpected = parseBoolean(getMetricValue(["contactorscloseexpected", "closeexpected"]));

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
                const bpcIpMatch = ipMap.find(m => pN(m.array) === a && pN(m.string) === s && pN(m.pack || m.bpc) === bpcNum);
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

            strings.push({
                id, arrayNumber: a, stringNumber: s,
                stringKey: `A${a}-S${s}`,
                stringConnectionState: rawStringConnectionState,
                connectionState: rawStringConnectionState,
                stringContactorState: rawStringContactorState,
                stringContactorStateCause: rawStringContactorStateCause,
                communicating,
                stringControllerIp: ipMap.find(m => pN(m.array) === a && pN(m.string) === s)?.ip || sIpInfo?.ip || tryGetField(stringsCsvRow || {}, {}, ["ip", "ipaddress"]),
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
        }
    }

    if (enrich) {
        const arrayFilter = targetArray;
        const targetStrings = arrayFilter ? strings.filter(s => s.arrayNumber === arrayFilter) : strings;
        await Promise.allSettled(targetStrings.map(async (s) => {
            const svUrl = `${baseUrl}/tools/monitor/ems/stringviewer/array/${s.arrayNumber}/${s.stringNumber}/data`;
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);
                const r = await fetch(svUrl, { signal: controller.signal });
                clearTimeout(timeoutId);
                if (r.ok) {
                    const svData = await r.json();
                    if (svData && svData.stringViewerDataModel) {
                        const sv = svData.stringViewerDataModel;
                        s.busVoltage = sv.dcBusVoltage ?? s.busVoltage;
                        s.outRotation = sv.outRotation ?? s.outRotation;
                        s.positiveContactorClosed = sv.positiveContactorClosed ?? s.positiveContactorClosed;
                        s.negativeContactorClosed = sv.negativeContactorClosed ?? s.negativeContactorClosed;
                        s.contactorsCloseExpected = sv.contactorsCloseExpected ?? s.contactorsCloseExpected;
                        s.recloseCount = sv.recloseCount ?? s.recloseCount;
                        s.badReport = sv.badReport ?? s.badReport;
                        s.fanRequested = sv.lastFanCommand ?? sv.fanCommand ?? sv.requestedFanCommand ?? sv.stringFanRequested ?? s.fanRequested;
                        s.fanActual = sv.fanActual ?? sv.fanState ?? sv.fanStatus ?? sv.fanSpeed ?? sv.fanSpeedRpm ?? sv.stringFanActual ?? s.fanActual;
                        s.socPct = sv.soc ?? s.socPct;
                        s.measuredVoltage = sv.measuredStringVoltage ?? s.measuredVoltage;
                        s.calculatedVoltage = sv.calculatedStringVoltage ?? s.calculatedVoltage;
                        s.minCellVoltage = sv.minCellGroupVoltage ?? s.minCellVoltage;
                        s.maxCellVoltage = sv.maxCellGroupVoltage ?? s.maxCellVoltage;
                        s.avgCellVoltage = sv.avgCellGroupVoltage ?? s.avgCellVoltage;
                        s.minCellTemperature = sv.minCellGroupTemp ?? s.minCellTemperature;
                        s.maxCellTemperature = sv.maxCellGroupTemp ?? s.maxCellTemperature;
                        s.avgCellTemperature = sv.avgCellGroupTemp ?? s.avgCellTemperature;
                        s.amps = sv.stringCurrent ?? s.amps;
                        s.bpcCount = sv.batteryPackCount ?? s.bpcCount;
                        s.cellGroupCount = sv.cellGroupCount ?? s.cellGroupCount;
                        s.timestampUtc = sv.reportTimestamp ?? s.timestampUtc;
                        s.operationalState = sv.stringConnectionState ?? s.operationalState;
                    }
                }
            } catch(e) {}
        }));
    }

    startStringDetailWarmup(strings);

    return {
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
            normal: normalStrings,
            offline: offlineStrings,
            nearline: nearlineStrings,
            warnings: gWarnCount,
            alarms: gAlarmCount,
            totalBpcs: totalBpcs || knownBpcCount,
            knownBpcCount,
            expectedBpcCount: (strings.length > 0 ? strings.length : 320) * 14,
            fleetAvgCellVoltage: gCountV > 0 ? Number((gSumV/gCountV).toFixed(3)) : null,
            fleetMaxCellVoltageDelta: gMaxVDelta,
            fleetAvgCellTemp: gCountT > 0 ? Number((gSumT/gCountT).toFixed(1)) : null,
            fleetMaxCellTemp: gMaxT
        },
        rollups: {
            totalStrings: strings.length > 0 ? strings.length : 320,
            normal: normalStrings,
            offline: offlineStrings,
            nearline: nearlineStrings,
            warnings: gWarnCount,
            alarms: gAlarmCount,
            totalBpcs: totalBpcs || knownBpcCount,
            knownBpcCount,
            expectedBpcCount: (strings.length > 0 ? strings.length : 320) * 14,
            fleetAvgCellVoltage: gCountV > 0 ? Number((gSumV/gCountV).toFixed(3)) : null,
            fleetMaxCellVoltageDelta: gMaxVDelta,
            fleetAvgCellTemp: gCountT > 0 ? Number((gSumT/gCountT).toFixed(1)) : null,
            fleetMaxCellTemp: gMaxT
        },
        totalStrings: strings.length,
        arrayCount: new Set(strings.map(s => s.arrayNumber)).size,
        normal: normalStrings,
        offline: offlineStrings,
        nearline: nearlineStrings,
        warnings: gWarnCount,
        alarms: gAlarmCount,
        totalBpcs: totalBpcs || knownBpcCount,
        summary: {
            totalArrays: new Set(strings.map(s => s.arrayNumber)).size,
            totalStrings,
            normalStrings, warningStrings, alarmStrings, offlineStrings, nearlineStrings,
            totalBpcs, warningBpcs, alarmBpcs,
            minCellVoltage: gMinV, maxCellVoltage: gMaxV, avgCellVoltage: gCountV > 0 ? Number((gSumV/gCountV).toFixed(3)) : null,
            maxCellVoltageDelta: gMaxVDelta,
            minCellTemperature: gMinT, maxCellTemperature: gMaxT, avgCellTemperature: gCountT > 0 ? Number((gSumT/gCountT).toFixed(1)) : null,
            maxCellTemperatureDelta: gMaxTDelta,
            latestTimestampUtc: new Date().toISOString()
        },
        arrays: [],
        strings
    };
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
            await (await import('./emsTurtleClient')).pollEmsTurtle();
        }

        const profile = ProfileStore.getActiveProfile();
        const baseUrl = profile ? `http://${profile.emsHost}:${profile.emsPort}${profile.turtlePath}` : "unknown";

        const cacheKey = `string_dashboard_${req.query.enrich === 'stringviewer' ? 'enriched' : 'base'}_${req.query.array || 'ALL'}`;
        const maxAgeMs = req.query.maxAgeMs ? parseInt(String(req.query.maxAgeMs), 10) : 5000;

        const fetcher = async () => {
            return buildNormalizedStringsData(req.query.enrich === 'stringviewer', req.query.array ? Number(req.query.array) : null);
        };
        
        const policy = prizmCache.getEffectiveCachePolicy(req.query.cache, req.query.noCache, req.query.refresh);
        const cacheEntry = await prizmCache.getOrFetch(cacheKey, fetcher, {
            ttlMs: maxAgeMs,
            sourceUrl: '/api/local/strings/dashboard',
            profileId: profile?.id,
            emsBaseUrl: baseUrl,
            forceRefresh: req.query.refresh === 'true',
            persist: true,
            policy
        });

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

        res.json({ 
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
        });

    } catch (e: any) {
        res.status(500).json({ error: e.message || "Failed to process strings dashboard" });
    }
});

router.get("/:arrayNumber/:stringNumber/detail/raw", async (req, res) => {
    try {
        const arrayNumber = Number(req.params.arrayNumber);
        const stringNumber = Number(req.params.stringNumber);
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

router.get("/:arrayNumber/:stringNumber/detail", async (req, res) => {
    const startedAt = Date.now();
    const includePerf = req.query.includePerf === "true";
    try {
        const arrayNumber = Number(req.params.arrayNumber);
        const stringNumber = Number(req.params.stringNumber);
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

            // Filter and map notifications for this specific string
            const stringNotifications = rawNotifications
                .filter((n: any) => {
                    const source = n?.notificationSource || {};
                    const sIdx = source.stringIndex ?? source.stringNumber ?? source.stringNo ?? n.stringIndex ?? n.stringNumber;
                    return sIdx !== undefined && Number(sIdx) === stringNumber;
                })
                .map((n: any) => {
                    const type = n?.notificationType || {};
                    const source = n?.notificationSource || {};
                    return {
                        category: type.notificationCategory || n.category || "General",
                        id: type.notificationId || n.id || "Unknown",
                        code: type.notificationId || n.code || type.notificationCode || "Unknown",
                        endpointType: source.endpointType || n.endpointType || "EMS",
                        arrayIndex: source.arrayIndex ?? n.arrayIndex ?? arrayNumber,
                        stringIndex: source.stringIndex ?? n.stringIndex ?? stringNumber,
                        batteryPackIndex: source.batteryPackIndex ?? n.batteryPackIndex ?? null,
                        cellGroupIndex: source.cellGroupIndex ?? n.cellGroupIndex ?? null,
                        triggerMessage: n.triggerMessage || n.displayText || n.message || n.text || "Active Fault",
                        timestamp: n.timestamp || new Date().toISOString(),
                        level: n.level || (type.notificationCategory === "Fault" || type.notificationCategory === "Alarm" ? "ALARM" : "WARN"),
                        raw: n
                    };
                });

            finalData.notifications = stringNotifications;

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
