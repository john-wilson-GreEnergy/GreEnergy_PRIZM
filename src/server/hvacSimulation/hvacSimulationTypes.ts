export type HvacSimulationMode =
  | "cooling"
  | "ldcool"
  | "bcool"
  | "heating"
  | "dehumidification"
  | "lowerTopCap"
  | "leakAlarm"
  | "acDoor"
  | "emergencyVentilation"
  | "clearAll";

export type HvacValidationStatus =
  | "PASS"
  | "WARNING"
  | "FAIL"
  | "NOT_RESPONDING"
  | "SIMULATION_EXPIRED"
  | "STALE";

export interface HvacSimulationTarget {
  ip: string;
  blockId?: string;
  blockName?: string;
  blockIndex?: number;
  arrayIndex?: number;
  stringIndex?: number;
  segment?: number;
  isCollectionSegment?: boolean;
  entityName?: string;
  reachable?: boolean;
  lastUpdatedAt?: string;
  source: "active-topology" | "feather-cache" | "manual";
}

export interface HvacStatusDetails {
  currentA: number | null;
  fanLowOn: boolean | null;
  fanHighOn: boolean | null;
  compressorOn: boolean | null;
  reversingValveOn: boolean | null;
  electricHeatOn: boolean | null;
  freezeDetected: boolean | null;
  expected: boolean;
  passed: boolean;
  flags: string[];
}

export interface HvacMetrics {
  spaceTempC: number | null;
  supplyAirTempC: number | null;
  avgCellTempC: number | null;
  spaceHumidityPct: number | null;
  outsideHumidityPct: number | null;
  hydrogenPpm: number | null;
}

export interface HvacValidationResult {
  ip: string;
  mode: HvacSimulationMode;
  status: HvacValidationStatus;
  flags: string[];
  message: string;
  reportTimestamp: string | null;
  simulationRemainingMinutes: number | null;
  hvac1: HvacStatusDetails;
  hvac2: HvacStatusDetails;
  metrics: HvacMetrics;
}

export interface HvacValidationDefaults {
  fanCurrentMinA: number;
  fanCurrentExpectedA: number;
  compressorCurrentMinA: number;
  responseGracePeriodSec: number;
  pollIntervalSec: number;
  staleReportMaxAgeSec: number;
}

export interface HvacAuditEntry {
  timestamp: string;
  mode: HvacSimulationMode;
  targetIps: string[];
  timeoutMinutes: number;
  success: boolean;
  validationStatus?: HvacValidationStatus;
  flags?: string[];
  payload?: any;
  message?: string;
  operator?: string;
  profileName?: string;
}
