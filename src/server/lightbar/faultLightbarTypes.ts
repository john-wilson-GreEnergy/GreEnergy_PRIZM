export type FaultLightbarSeverity = "none" | "warning" | "alarm";

export interface FaultLightbarState {
  arrayIndex: number;
  stringIndex: number;
  ip?: string;
  severity: FaultLightbarSeverity;
  rawWarnings: string[];
  rawAlarms: string[];
  ignoredWarnings: string[];
  ignoredAlarms: string[];
  effectiveWarnings: string[];
  effectiveAlarms: string[];
  desiredColor: {
    red: number;
    green: number;
    blue: number;
    white: number;
  };
  desiredAction: "none" | "set-warning" | "set-alarm" | "clear";
}

export interface LastAppliedLightbarState {
  key: string; // block-array-string or array-string
  blockId?: string;
  arrayIndex: number;
  stringIndex: number;
  severity: FaultLightbarSeverity;
  color: {
    red: number;
    green: number;
    blue: number;
    white: number;
  };
  lastAppliedAt: string;
  activeFaultSignature: string;
}

export interface FaultVisualizerStatusResponse {
  enabled: boolean;
  dryRun: boolean;
  liveModeActive: boolean;
  lastRunTime: string | null;
  pollIntervalSeconds: number;
  warningColor: { red: number; green: number; blue: number; white: number };
  alarmColor: { red: number; green: number; blue: number; white: number };
  ignoredPatterns: string[];
  activeManagedLightbars: LastAppliedLightbarState[];
  lastSummary: {
    alarmCount: number;
    warningCount: number;
    ignoredOnlyCount: number;
    clearPendingCount: number;
    commandCount: number;
  } | null;
  lastError: string | null;
}
