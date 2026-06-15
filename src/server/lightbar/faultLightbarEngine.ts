import { FaultLightbarState, FaultLightbarSeverity, LastAppliedLightbarState } from "./faultLightbarTypes";
import { describeBessStatusCode } from "../../lib/bessStatusCodes";
import { ProfileStore } from "../profiles/profileStore";
import { getNormalizedStringFaults } from "../faults/normalizedFaultSource";

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

  const faults = getNormalizedStringFaults(ignored);
  const results: FaultLightbarState[] = [];

  for (const row of faults) {
    const arrayIndex = row.arrayIndex;
    const stringIndex = row.stringIndex;

    const effectiveWarnings = row.effectiveWarnings || [];
    const ignoredWarnings = row.ignoredWarnings || [];
    const effectiveAlarms = row.effectiveAlarms || [];
    const ignoredAlarms = row.ignoredAlarms || [];

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

    const blockIndex = row.blockIndex ?? 1;
    const blockId = row.blockId ?? `block-${blockIndex}`;
    const key = `${blockIndex}-${arrayIndex}-${stringIndex}`;
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
      blockId,
      blockIndex,
      arrayIndex,
      stringIndex,
      ip: row.ip,
      severity,
      rawWarnings: row.normalizedWarnings || [],
      rawAlarms: row.normalizedAlarms || [],
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
