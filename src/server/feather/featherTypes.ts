export interface FeatherNormalizedStatus {
  deviceIp: string;
  reachable: boolean;
  responseDurationMs: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  activeProfileId: string;
  activeProfileName: string;
  activeEmsBaseUrl: string;
  sourceDiscoveryMethod: "string-ip-map" | "ip-map" | "blockviewer" | "manual";

  // Identifiers / derived indexes
  arrayIndex: number | null;
  stringIndex: number | null;
  entityName: string | null;
  entityKeyToken: string | null;

  // Normalized firmware / identity
  firmwareVersion: string | null;
  deviceType: string | null;
  operationalState: string | null;
  warningCount: number;
  alarmCount: number;
  activeWarnings: string[];
  activeAlarms: string[];

  // FSS / Leak / Louver details
  fssValid: boolean | null;
  leakAlarm: boolean | null;
  louverOpen: boolean | null;

  // Door details
  doorsValid: boolean | null;
  batteryDoorsClosed: boolean | null;
  lowerTopcapClosed: boolean | null;
  dcDoorsClosed: boolean | null;
  acDoorsClosed: boolean | null;

  // Thermal readings
  spaceTemperature: number | null;
  avgCellTemperature: number | null;
  supplyAirTemp: number | null;
  coolingSetpoint: number | null;
  heatingSetpoint: number | null;

  // HVAC/MIO / HVAC Control states
  mioValid: boolean | null;
  thermostatStage: string | null;
  hvacCurrent1: number | null;
  fanLowOn1: boolean | null;
  fanHighOn1: boolean | null;
  YCompressorOn1: boolean | null;
  freezeDetected1: boolean | null;
  hvacCurrent2: number | null;
  fanLowOn2: boolean | null;
  fanHighOn2: boolean | null;
  YCompressorOn2: boolean | null;
  freezeDetected2: boolean | null;
  hydrogen1PPM: number | null; // Senva

  // Lost communication
  lostComms: string | null;

  // Raw response summary or full JSON
  rawResponse?: any;
}

export interface FeatherCacheEntry {
  activeProfileId: string;
  activeProfileName: string;
  activeEmsBaseUrl: string;
  createdAt: string;
  lastUpdatedAt: string;
  devices: FeatherNormalizedStatus[];
}

export interface DiscoveryCandidate {
  deviceIp: string;
  sourceDiscoveryMethod: "string-ip-map" | "ip-map" | "blockviewer" | "manual";
  arrayIndex?: number | null;
  stringIndex?: number | null;
  entityName?: string | null;
  entityKeyToken?: string | null;
}

export interface ManualScanConfig {
  cidr?: string;
  startIp?: string;
  endIp?: string;
  arrayIndex?: number;
  startHost?: number;
  endHost?: number;
  arrayRanges?: string; // e.g. "1-8"
  hostRanges?: string; // e.g. "3-75"
}
