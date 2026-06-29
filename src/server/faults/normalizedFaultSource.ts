import { getEmsCachedRawStrings, getEmsCachedStatusCodes, getEmsSourcesDebugInfo } from "../emsTurtleClient";
import { getFeatherCache } from "../feather/featherClient";
import { ProfileStore } from "../profiles/profileStore";
import { describeBessStatusCode } from "../../lib/bessStatusCodes";
import { classifyStringOperationalState } from "../../lib/stringClassifier";

export type StringAvailabilityClass = "online" | "nearline" | "offline";

export interface StringClassificationInput {
  communicating: boolean | null | undefined;
  inRotation: boolean | null | undefined;
  contactorsClosed: boolean | null | undefined;
}

export function classifyStringAvailability(input: StringClassificationInput): StringAvailabilityClass {
  const result = classifyStringOperationalState({
    communicating: input.communicating,
    inRotation: input.inRotation,
    outRotation: input.inRotation === false,
    positiveContactorClosed: input.contactorsClosed,
    negativeContactorClosed: input.contactorsClosed
  });
  if (result.state === "online") return "online";
  if (result.state === "nearline") return "nearline";
  return "offline";
}

export interface CorrectiveActionAffectedTarget {
  blockId?: string;
  blockIndex?: number;
  arrayIndex?: number;
  stringIndex?: number;
  segmentIndex?: number;
  ip?: string;
  label: string;
  source: "ems" | "feather" | "modbus" | "site-operations" | "unknown";
  rawFault?: string;
  rawCode?: string;
}

export interface CorrectiveActionItem {
  id: string;
  severity: "warning" | "alarm" | "info";
  faultLabel: string;
  faultCode?: string;
  suggestedAction: string;
  affectedSummary: string;
  affected: CorrectiveActionAffectedTarget[];
}

export interface NormalizedStringFault {
  blockId?: string;
  blockIndex?: number;
  arrayIndex: number;
  stringIndex: number;
  segmentIndex?: number;
  ip?: string;
  communicating: boolean;
  inRotation: boolean;
  contactorsClosed: boolean | null;
  availabilityClass: StringAvailabilityClass;
  rawWarnings: string[];
  rawAlarms: string[];
  normalizedWarnings: string[];
  normalizedAlarms: string[];
  ignoredWarnings?: string[];
  ignoredAlarms?: string[];
  effectiveWarnings?: string[];
  effectiveAlarms?: string[];
  source: "site-operations" | "string-dashboard" | "ems-cache" | "unknown";
  sourceTimestamp?: string;
}

// Default ignored pattern helpers (matching case-insensitive)
export const DEFAULT_IGNORED_PATTERNS = [
  "out of rotation",
  "rotation",
  "contactor open",
  "contactors open",
  "open contactor",
  "string disabled due to rotation",
  "out of service due to rotation"
];

function bool(v: any): boolean {
  if (v === true || v === false) return v;
  if (typeof v === "string") return v.toLowerCase() === "true" || v.toLowerCase() === "1" || v.toLowerCase() === "yes";
  if (typeof v === "number") return v === 1;
  return false;
}

function num(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function extractCodes(value: any): string[] {
  let rawCodes: string[] = [];
  if (!value) return [];
  if (Array.isArray(value)) {
    for (const v of value) {
      if (typeof v === "object" && v.code) rawCodes.push(String(v.code));
      else rawCodes.push(String(v));
    }
  } else if (typeof value === "string") {
    rawCodes.push(...value.split(","));
  } else if (typeof value === "object" && value.code) {
    rawCodes.push(String(value.code));
  }
  return rawCodes.map(c => String(c).trim()).filter(c => c.length > 0);
}

function buildStatusCodeDescriptionMap(raw: any): Record<string, string> {
  const defaultMap: Record<string, string> = {};
  if (!raw) return defaultMap;

  let target = raw.bessStatusCodes || raw.statusCodes || raw.registeredStatusCodes || raw;
  if (Array.isArray(target)) {
    for (const item of target) {
      if (typeof item === "object" && item.code) {
        defaultMap[String(item.code)] = item.description || item.desc || `Code ${item.code}`;
      } else if (typeof item === "string" && item.includes(":")) {
        const [k, v] = item.split(":");
        defaultMap[k.trim()] = v.trim();
      }
    }
  } else if (typeof target === "object") {
    for (const [k, v] of Object.entries(target)) {
      defaultMap[String(k)] = String(v);
    }
  }
  return defaultMap;
}

function cleanFaultString(fault: string): string {
  if (!fault) return fault;
  if (fault.includes("Lost Comms with:")) {
    const prefixMatch = fault.match(/(Lost Comms with:\s*)(.*)/i);
    if (prefixMatch) {
      const prefix = prefixMatch[1];
      let rest = prefixMatch[2].trim();
      if (rest.startsWith("{")) {
        try {
          const parsed = JSON.parse(rest);
          const name = parsed.device || parsed.deviceName || parsed.name || parsed.label || parsed.id || rest;
          return prefix + name;
        } catch (e) {
          // fall back
        }
      }
    }
  }
  if (fault.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(fault);
      const name = parsed.device || parsed.deviceName || parsed.name || parsed.label || parsed.id || fault;
      return name;
    } catch (e) {
      // fall back
    }
  }
  return fault;
}

function formatFeatherIssue(item: any): string {
  if (typeof item === "string") {
    if (item.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(item);
        const name = parsed.device || parsed.deviceName || parsed.name || parsed.label || parsed.id || item;
        return "Lost Comms with: " + name;
      } catch (e) {
        return item;
      }
    }
    return cleanFaultString(item);
  }
  if (item && typeof item === "object") {
    const name =
      item.device ||
      item.deviceName ||
      item.deviceType ||
      item.name ||
      item.label ||
      item.description ||
      item.entityDescription ||
      item.entityName ||
      item.component ||
      item.componentName ||
      item.source ||
      item.sourceName ||
      item.ip ||
      item.deviceIp ||
      item.address ||
      item.lastKnownIp ||
      item.device?.name ||
      item.device?.type ||
      item.device?.ip ||
      item.status?.deviceName ||
      item.status?.deviceType;

    if (name) {
      return "Lost Comms with: " + name;
    }

    const str = JSON.stringify(item);
    if (str.length < 120) return str;
    return "Unknown Device";
  }
  return "Unknown Issue";
}

/**
 * Builds the centralized, normalized source of all faults and connection/rotation statuses per string.
 */
export function getNormalizedStringFaults(ignoredPatterns: string[] = DEFAULT_IGNORED_PATTERNS): NormalizedStringFault[] {
  const profile = ProfileStore.getActiveProfile();
  const rawCache = getEmsCachedRawStrings();
  const rawStrings = rawCache.data || [];
  const sourceTimestamp = rawCache.lastUpdated || new Date().toISOString();

  const fCache = getFeatherCache();
  const fDevices = (fCache.devices || []).filter(d => !(d as any).rejected);

  const scMap = buildStatusCodeDescriptionMap(getEmsCachedStatusCodes().data || {});

  // Map to hold merged data, keyed by block-array-string
  const targetMap = new Map<string, NormalizedStringFault>();

  // Helper to check if a specific message or code description is ignored
  const isIgnored = (msg: string) => {
    const m = msg.toLowerCase();
    return ignoredPatterns.some(pat => m.includes(pat.toLowerCase()));
  };

  // 1. Process BESS raw strings (Primary source of string indices & core statuses)
  for (const st of rawStrings) {
    const arrayIndex = Number(st.ArrayIndex ?? st.arrayIndex ?? st.arrayNumber ?? 0);
    const stringIndex = Number(st.StringIndex ?? st.stringIndex ?? st.stringNumber ?? 0);
    if (!arrayIndex || !stringIndex) continue;

    const blockIndex = Number(st.BlockIndex ?? st.blockIndex ?? st.blockNumber ?? profile?.blockIndex ?? 1);
    const blockId = String(st.BlockId ?? st.blockId ?? profile?.topologyModel?.blocks?.find((b: any) => b.blockIndex === blockIndex)?.blockId ?? `block-${blockIndex}`);
    const key = `${blockIndex}-${arrayIndex}-${stringIndex}`;

    const ip = st.StringIp ?? st.stringIp ?? st.ip ?? undefined;

    const outRotation = bool(st.OutRotation ?? st.outRotation ?? st.outOfRotation);
    const posClosed = bool(st.PositiveContactorClosed ?? st.positiveContactorClosed);
    const negClosed = bool(st.NegativeContactorClosed ?? st.negativeContactorClosed);
    const contactorsClosed = posClosed && negClosed;
    const commFalse = st.communicating === false || st.lossComms || st.LossComms;
    const connectionState = String(st.StringConnectionState ?? st.stringConnectionState ?? st.connectionState ?? "").toUpperCase();
    const communicating = !(connectionState.includes("LOSS") || connectionState.includes("NO_COMM") || connectionState.includes("NOT_COMM") || commFalse);

    const inRotation = !outRotation;
    const availabilityClass = classifyStringAvailability({ communicating, inRotation, contactorsClosed });

    // Extract alarms & warnings
    let rawAlarms: string[] = [];
    let rawWarnings: string[] = [];

    const alarmValStr = String(st.Alarms || st.alarms || st.alarmCodes || st.alarmsList || st.alarmList || "");
    const warnValStr = String(st.Warns || st.warns || st.warningCodes || st.warnCodes || st.warningsList || st.warningList || "");

    let alarmsList = extractCodes(alarmValStr.split(","));
    let warningsList = extractCodes(warnValStr.split(","));

    if (alarmsList.length === 0 && Array.isArray(st.alarms)) alarmsList = extractCodes(st.alarms);
    if (warningsList.length === 0 && Array.isArray(st.warns)) warningsList = extractCodes(st.warns);

    rawAlarms = Array.from(new Set(alarmsList));
    rawWarnings = Array.from(new Set(warningsList));

    const normalizedWarnings: string[] = [];
    const normalizedAlarms: string[] = [];

    // Translate BPC codes to normalized human labels
    rawAlarms.forEach(ac => {
      const desc = scMap[ac] || describeBessStatusCode(ac) || "";
      const codeDesc = desc ? `Alarm Code ${ac}: ${desc}` : `Alarm Code ${ac}`;
      normalizedAlarms.push(codeDesc);
    });

    rawWarnings.forEach(wc => {
      const desc = scMap[wc] || describeBessStatusCode(wc) || "";
      const codeDesc = desc ? `Warning Code ${wc}: ${desc}` : `Warning Code ${wc}`;
      normalizedWarnings.push(codeDesc);
    });

    // Add generic alarm/warning summaries if flags are set but codes are missing
    if (normalizedAlarms.length === 0 && Number(st.alarmCount || st.alarmsCount || 0) > 0) {
      normalizedAlarms.push("String alarms present - codes unavailable");
    }
    if (normalizedWarnings.length === 0 && Number(st.warningCount || st.warnCount || 0) > 0) {
      normalizedWarnings.push("String warnings present - codes unavailable");
    }

    targetMap.set(key, {
      blockId,
      blockIndex,
      arrayIndex,
      stringIndex,
      segmentIndex: stringIndex,
      ip,
      communicating,
      inRotation,
      contactorsClosed,
      availabilityClass,
      rawWarnings,
      rawAlarms,
      normalizedWarnings,
      normalizedAlarms,
      source: "ems-cache",
      sourceTimestamp
    });
  }

  // 2. Process Feather/HVAC devices (Union active alarms/warnings)
  for (const fRaw of fDevices) {
    const f = fRaw as any;
    const arrayIndex = Number(f.arrayIndex ?? f.arrayNumber ?? 0);
    const stringIndex = Number(f.stringIndex ?? f.stringNumber ?? f.segmentIndex ?? f.segmentNumber ?? 0);
    if (!arrayIndex || !stringIndex) continue;

    const blockIndex = Number(f.blockIndex ?? f.blockNumber ?? profile?.blockIndex ?? 1);
    const blockId = String(f.blockId ?? profile?.topologyModel?.blocks?.find((b: any) => b.blockIndex === blockIndex)?.blockId ?? `block-${blockIndex}`);
    const key = `${blockIndex}-${arrayIndex}-${stringIndex}`;

    let record = targetMap.get(key);
    if (!record) {
      // Fallback representing an HVAC/Feather target string not explicitly seen in raw BESS strings
      record = {
        blockId,
        blockIndex,
        arrayIndex,
        stringIndex,
        segmentIndex: stringIndex,
        ip: f.ip || f.deviceIp || undefined,
        communicating: f.lossComms !== true && f.LossComms !== true,
        inRotation: true,
        contactorsClosed: null,
        availabilityClass: f.lossComms === true ? "offline" : "nearline", // Conservative default fallback
        rawWarnings: [],
        rawAlarms: [],
        normalizedWarnings: [],
        normalizedAlarms: [],
        source: "site-operations",
        sourceTimestamp
      };
      targetMap.set(key, record);
    }

    const activeWarnings = f.activeWarnings || f.warningMessages || [];
    if (Array.isArray(activeWarnings)) {
      activeWarnings.forEach((awRaw: any) => {
        const aw = formatFeatherIssue(awRaw);
        if (aw && !record!.normalizedWarnings.includes(aw)) {
          record!.normalizedWarnings.push(aw);
          record!.rawWarnings.push(String(awRaw.code || awRaw));
        }
      });
    }

    const activeAlarms = f.activeAlarms || f.alarmMessages || f.faultMessages || [];
    if (Array.isArray(activeAlarms)) {
      activeAlarms.forEach((aaRaw: any) => {
        const aa = formatFeatherIssue(aaRaw);
        if (aa && !record!.normalizedAlarms.includes(aa)) {
          record!.normalizedAlarms.push(aa);
          record!.rawAlarms.push(String(aaRaw.code || aaRaw));
        }
      });
    }
  }

  // 3. Post-process to divide normalized warnings/alarms into ignored vs effective
  const results = Array.from(targetMap.values());
  for (const r of results) {
    const effW: string[] = [];
    const ignW: string[] = [];
    r.normalizedWarnings.forEach(w => {
      if (isIgnored(w)) ignW.push(w);
      else effW.push(w);
    });

    const effA: string[] = [];
    const ignA: string[] = [];
    r.normalizedAlarms.forEach(a => {
      if (isIgnored(a)) ignA.push(a);
      else effA.push(a);
    });

    r.effectiveWarnings = effW;
    r.ignoredWarnings = ignW;
    r.effectiveAlarms = effA;
    r.ignoredAlarms = ignA;
  }

  return results;
}

/**
 * Generates modular and unified corrective actions list from normalized string faults.
 */
export function getCorrectiveActionsFromNormalizedFaults(ignoredPatterns: string[] = DEFAULT_IGNORED_PATTERNS): CorrectiveActionItem[] {
  const faults = getNormalizedStringFaults(ignoredPatterns);
  const actionGroupMap = new Map<string, CorrectiveActionItem>();

  const isIgnored = (msg: string) => {
    const m = msg.toLowerCase();
    return ignoredPatterns.some(pat => m.includes(pat.toLowerCase()));
  };

  const getSuggestedAction = (faultName: string): string => {
    if (/door/i.test(faultName)) return "Inspect and secure enclosure door";
    if (/comms|communication|reachable|lost comms/i.test(faultName)) return "Check device power/network path";
    if (/fss|fire/i.test(faultName)) return "Inspect fire safety signal chain";
    if (/hvac|mio/i.test(faultName)) return "Inspect HVAC controller and MIO status";
    if (/high cell temp|thermal/i.test(faultName)) return "Inspect affected string/enclosure thermal conditions";
    if (/cell voltage|imbalance|balance/i.test(faultName)) return "Inspect BPC balancing circuit status, and cell group telemetry";
    return "Open String List details and inspect BPC status";
  };

  // Process alarms & warnings on each normalized fault
  for (const f of faults) {
    const arrayNum = f.arrayIndex;
    const stringNum = f.stringIndex;
    const label = `Block ${f.blockIndex} / Array ${arrayNum} / ES${stringNum}`;

    // Skip faults matching structural OOR codes in corrective actions
    const hasIgnoredFilterCode = (msg: string) => /oor|out of rotation|outrotation|contactor open|contactors open/i.test(msg) || msg.includes("2534") || msg.includes("2561");

    rAlarmsLoop:
    for (const rawA of f.normalizedAlarms) {
      if (isIgnored(rawA) || hasIgnoredFilterCode(rawA)) continue rAlarmsLoop;

      const key = `alarm_${rawA}`;
      let actionItem = actionGroupMap.get(key);
      if (!actionItem) {
        actionItem = {
          id: key,
          severity: "alarm",
          faultLabel: rawA,
          suggestedAction: getSuggestedAction(rawA),
          affectedSummary: "",
          affected: []
        };
        actionGroupMap.set(key, actionItem);
      }

      actionItem.affected.push({
        blockId: f.blockId,
        blockIndex: f.blockIndex,
        arrayIndex: f.arrayIndex,
        stringIndex: f.stringIndex,
        segmentIndex: f.stringIndex,
        ip: f.ip,
        label,
        source: f.source === "ems-cache" ? "ems" : f.source === "site-operations" ? "feather" : "unknown",
        rawFault: rawA
      });
    }

    rWarnsLoop:
    for (const rawW of f.normalizedWarnings) {
      if (isIgnored(rawW) || hasIgnoredFilterCode(rawW)) continue rWarnsLoop;

      const key = `warning_${rawW}`;
      let actionItem = actionGroupMap.get(key);
      if (!actionItem) {
        actionItem = {
          id: key,
          severity: "warning",
          faultLabel: rawW,
          suggestedAction: getSuggestedAction(rawW),
          affectedSummary: "",
          affected: []
        };
        actionGroupMap.set(key, actionItem);
      }

      actionItem.affected.push({
        blockId: f.blockId,
        blockIndex: f.blockIndex,
        arrayIndex: f.arrayIndex,
        stringIndex: f.stringIndex,
        segmentIndex: f.stringIndex,
        ip: f.ip,
        label,
        source: f.source === "ems-cache" ? "ems" : f.source === "site-operations" ? "feather" : "unknown",
        rawFault: rawW
      });
    }
  }

  // Populate affected summaries
  const actionItemsList = Array.from(actionGroupMap.values());
  for (const act of actionItemsList) {
    const count = act.affected.length;
    if (count === 1) {
      const single = act.affected[0];
      act.affectedSummary = `Feather ${single.ip || `A${single.arrayIndex} S${single.stringIndex}`}`;
    } else {
      const first = act.affected[0];
      const extra = count - 1;
      act.affectedSummary = `Feather ${first.ip || `A${first.arrayIndex} S${first.stringIndex}`} (+${extra} more)`;
    }
  }

  return actionItemsList;
}
