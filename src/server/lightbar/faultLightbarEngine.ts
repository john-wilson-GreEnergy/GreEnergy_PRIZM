import { FaultLightbarState, FaultLightbarSeverity, LastAppliedLightbarState } from "./faultLightbarTypes";
import { getEmsCachedRawStrings } from "../emsTurtleClient";
import { describeBessStatusCode } from "../../lib/bessStatusCodes";

export const FAULT_LIGHTBAR_DEFAULTS = {
  warningColor: { red: 255, green: 255, blue: 0, white: 0 }, // yellow
  alarmColor: { red: 255, green: 0, blue: 0, white: 0 },     // red
  clearColor: { red: 0, green: 0, blue: 0, white: 255 },     // white clear
  clearDurationSeconds: 1,
  activeFaultDurationSeconds: 50400, // 14 hours
  pollIntervalSeconds: 30,
  dryRunDefault: true
};

export const DEFAULT_IGNORED_PATTERNS = [
  "out of rotation",
  "rotation",
  "contactor open",
  "contactors open",
  "open contactor",
  "string disabled due to rotation",
  "out of service due to rotation"
];

// In-memory runtime state for the Fault Visualizer Engine
export class FaultLightbarEngineState {
  public static enabled = false;
  public static dryRun = true;
  public static liveModeActive = false;
  public static lastRunTime: string | null = null;
  public static pollIntervalSeconds = 30;
  
  public static warningColor = { ...FAULT_LIGHTBAR_DEFAULTS.warningColor };
  public static alarmColor = { ...FAULT_LIGHTBAR_DEFAULTS.alarmColor };
  public static clearColor = { ...FAULT_LIGHTBAR_DEFAULTS.clearColor };
  public static clearDurationSeconds = 1;
  public static activeFaultDurationSeconds = 50400;

  public static ignoredPatterns = [...DEFAULT_IGNORED_PATTERNS];
  public static clearOnResolved = true;
  public static refreshOnChange = true;
  
  // Maps target key (e.g., "arrayIndex-stringIndex") to its last active lightbar state
  public static activeManagedLightbars = new Map<string, LastAppliedLightbarState>();

  public static lastSummary: {
    alarmCount: number;
    warningCount: number;
    ignoredOnlyCount: number;
    clearPendingCount: number;
    commandCount: number;
  } | null = null;

  public static lastError: string | null = null;
  public static pollTimer: NodeJS.Timeout | null = null;
}

/**
 * Builds the current preview of active string states and computes desired lightbar actions.
 */
export function computeFaultLightbarStates(config: {
  warningColor?: { red: number; green: number; blue: number; white: number };
  alarmColor?: { red: number; green: number; blue: number; white: number };
  clearColor?: { red: number; green: number; blue: number; white: number };
  ignoredPatterns?: string[];
  clearOnResolved?: boolean;
  refreshOnChange?: boolean;
}): FaultLightbarState[] {
  const warnColor = config.warningColor || FaultLightbarEngineState.warningColor;
  const alrColor = config.alarmColor || FaultLightbarEngineState.alarmColor;
  const clrColor = config.clearColor || FaultLightbarEngineState.clearColor;
  const ignored = config.ignoredPatterns || FaultLightbarEngineState.ignoredPatterns;
  const clearOnRes = config.clearOnResolved !== undefined ? config.clearOnResolved : FaultLightbarEngineState.clearOnResolved;

  const rawStrings = getEmsCachedRawStrings().data || [];
  const results: FaultLightbarState[] = [];

  for (const row of rawStrings) {
    const arrayIndex = Number(row.ArrayIndex ?? row.arrayIndex ?? row.arrayNumber ?? 0);
    const stringIndex = Number(row.StringIndex ?? row.stringIndex ?? row.stringNumber ?? 0);
    if (!arrayIndex || !stringIndex) continue;

    const rowIp = row.StringIp ?? row.stringIp ?? row.ip ?? undefined;

    // Retrieve active alarms and warnings lists
    let rawWarnings: string[] = [];
    let rawAlarms: string[] = [];

    const warnVal = row.warns || row.warningslist || row.warnings || row.warningList || row.warninglist || [];
    const alarmVal = row.alarms || row.alarmslist || row.alarmList || row.alarmlist || [];

    if (typeof warnVal === "string") {
      rawWarnings = warnVal.split(",").map((s: string) => s.trim()).filter(Boolean);
    } else if (Array.isArray(warnVal)) {
      rawWarnings = warnVal.map(String).map((s: string) => s.trim()).filter(Boolean);
    } else if (typeof warnVal === "number") {
      rawWarnings = [String(warnVal)];
    }

    if (typeof alarmVal === "string") {
      rawAlarms = alarmVal.split(",").map((s: string) => s.trim()).filter(Boolean);
    } else if (Array.isArray(alarmVal)) {
      rawAlarms = alarmVal.map(String).map((s: string) => s.trim()).filter(Boolean);
    } else if (typeof alarmVal === "number") {
      rawAlarms = [String(alarmVal)];
    }

    // Translate numeric strings using describeBessStatusCode
    const formatNotif = (codeStr: string) => {
      if (codeStr.match(/^\d+$/)) {
        return `${codeStr} - ${describeBessStatusCode(codeStr)}`;
      }
      return codeStr;
    };

    const formattedWarnings = rawWarnings.map(formatNotif);
    const formattedAlarms = rawAlarms.map(formatNotif);

    // Filter using case-insensitive matching in configured patterns
    const effectiveWarnings: string[] = [];
    const ignoredWarnings: string[] = [];
    for (const w of formattedWarnings) {
      const lowerW = w.toLowerCase();
      const isIgnored = ignored.some(pattern => lowerW.includes(pattern.toLowerCase()));
      if (isIgnored) {
        ignoredWarnings.push(w);
      } else {
        effectiveWarnings.push(w);
      }
    }

    const effectiveAlarms: string[] = [];
    const ignoredAlarms: string[] = [];
    for (const a of formattedAlarms) {
      const lowerA = a.toLowerCase();
      const isIgnored = ignored.some(pattern => lowerA.includes(pattern.toLowerCase()));
      if (isIgnored) {
        ignoredAlarms.push(a);
      } else {
        effectiveAlarms.push(a);
      }
    }

    // Determine target severity
    let severity: FaultLightbarSeverity = "none";
    let desiredColor = { ...clrColor };
    let desiredAction: "none" | "set-warning" | "set-alarm" | "clear" = "none";

    if (effectiveAlarms.length > 0) {
      severity = "alarm";
      desiredColor = { ...alrColor };
      desiredAction = "set-alarm";
    } else if (effectiveWarnings.length > 0) {
      severity = "warning";
      desiredColor = { ...warnColor };
      desiredAction = "set-warning";
    }

    const key = `${arrayIndex}-${stringIndex}`;
    const lastApplied = FaultLightbarEngineState.activeManagedLightbars.get(key);

    if (severity === "none") {
      // If we previously managed this lightbar and severity resolved
      if (lastApplied && lastApplied.severity !== "none") {
        desiredAction = clearOnRes ? "clear" : "none";
      } else {
        desiredAction = "none";
      }
    }

    results.push({
      arrayIndex,
      stringIndex,
      ip: rowIp,
      severity,
      rawWarnings: formattedWarnings,
      rawAlarms: formattedAlarms,
      ignoredWarnings,
      ignoredAlarms,
      effectiveWarnings,
      effectiveAlarms,
      desiredColor,
      desiredAction
    });
  }

  return results;
}
