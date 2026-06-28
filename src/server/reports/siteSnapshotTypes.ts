export type SourceCoverageRow = {
  key: string;
  label: string;
  sourceType:
    | "ems-turtle"
    | "direct-ip"
    | "triggered-ems-report"
    | "imported-metadata"
    | "calculated"
    | "manual"
    | "not-applicable";
  required: boolean;
  status:
    | "fresh"
    | "stale"
    | "missing"
    | "partial"
    | "failed"
    | "not-required"
    | "not-applicable"
    | "unknown";
  endpoint?: string;
  usedFor: string[];
  lastUpdated?: string;
  ageSeconds?: number;
  rowCount?: number;
  error?: string;
  notes?: string;
};

export type SourceCoverageSummary = {
  overallStatus: "fresh" | "partial" | "stale" | "failed" | "unknown";
  confidence: "high" | "medium" | "low" | "invalid" | "unknown";
  rows: SourceCoverageRow[];
  requiredSourcesFresh: number;
  requiredSourcesMissing: number;
  optionalSourcesMissing: number;
  staleSources: number;
  failedSources: number;
};

export type ReportCoverageRow = {
  section:
    | "executive"
    | "energy"
    | "thermal"
    | "controls"
    | "correctiveActions"
    | "emsApps"
    | "pcs"
    | "firmware"
    | "topology"
    | "sensors"
    | "sourceHealth";
  label: string;
  status: "available" | "partial" | "missing" | "not-applicable" | "failed";
  sourceKeys: string[];
  recordCount?: number;
  missingFields?: string[];
  notes?: string;
};

export type ReportCoverageSummary = {
  rows: ReportCoverageRow[];
  availableSections: number;
  partialSections: number;
  missingSections: number;
  failedSections: number;
};

export type ExecutiveSnapshotSection = {
  siteReadiness: "ready" | "limited" | "action-required" | "unknown";
  alarmCount: number;
  warningCount: number;
  onlineStrings: number;
  nearlineStrings: number;
  offlineStrings: number;
  notCommunicatingStrings: number;
  installedCapacityKWh?: number;
  storedEnergyKWh?: number;
  systemSocPct?: number;
  pcsOnline?: number;
  pcsTotal?: number;
  emsStatus?: string;
  sourceConfidence?: string;
  summaryText: string;
  recommendedActions: string[];
};

export type EnergySnapshotSection = {
  fleetCapacity: {
    installedCapacityKWh?: number;
    storedEnergyKWh?: number;
    onlineStoredKWh?: number;
    nearlineStoredKWh?: number;
    offlineStoredKWh?: number;
    notCommunicatingStoredKWh?: number;
    systemSocPct?: number;
    availableChargeKW?: number | null;
    availableDischargeKW?: number | null;
  };
  stringAvailability: {
    total: number;
    online: number;
    nearline: number;
    offline: number;
    notCommunicating: number;
  };
  byArray: Array<{
    arrayIndex: number;
    totalStrings: number;
    online: number;
    nearline: number;
    offline: number;
    notCommunicating: number;
    storedKWh?: number;
    socPct?: number;
    status: string;
  }>;
  voltageByArray: Array<{
    arrayIndex: number;
    minCellMv?: number;
    avgCellMv?: number;
    maxCellMv?: number;
    deltaMv?: number;
    status: "normal" | "warning" | "alarm" | "unknown";
  }>;
  voltageOutliers: {
    lowest: any[];
    highest: any[];
    largestDelta: any[];
  };
};

export type ThermalSnapshotSection = {
  thermalReadiness: "normal" | "watch" | "action-required" | "unknown";
  metrics: {
    minCellTempF?: number;
    avgCellTempF?: number;
    maxCellTempF?: number;
    maxTempDeltaF?: number;
    hvacDevicesOnline?: number;
    hvacFeedbackMismatches?: number;
    thermalWarnings?: number;
    thermalAlarms?: number;
  };
  tempByArray: Array<{
    arrayIndex: number;
    minTempF?: number;
    avgTempF?: number;
    maxTempF?: number;
    deltaF?: number;
    status: "normal" | "warning" | "alarm" | "unknown";
  }>;
  thermalOutliers: {
    hottest: any[];
    coldest: any[];
    largestDelta: any[];
  };
  hvacDevices: Array<{
    deviceLabel: string;
    deviceIp?: string;
    arrayIndex?: number;
    segmentIndex?: number;
    segmentLabel?: string;
    hvacStage?: string;
    hvac1CommandSummary?: string;
    hvac1FeedbackSummary?: string;
    hvac2CommandSummary?: string;
    hvac2FeedbackSummary?: string;
    currentA?: number;
    fanRpm?: number;
    status: string;
  }>;
};

export type ControlsSnapshotSection = {
  emsConnection: {
    status: string;
    baseUrl?: string;
    lastPoll?: string;
  };
  turtleSources: SourceCoverageRow[];
  directIpSources: SourceCoverageRow[];
  polling: {
    heartbeat?: string;
    active?: boolean;
    lastRefresh?: string;
  };
  topologyWarnings: string[];
};

export type CorrectiveActionsSnapshotSection = {
  summary: {
    alarmGroups: number;
    warningGroups: number;
    affectedTargets: number;
    highestSeverity?: string;
  };
  groupedActions: Array<{
    id: string;
    severity: "alarm" | "warning" | "info" | "unknown";
    code?: string | number;
    faultName?: string;
    affectedCount: number;
    affectedSummary?: string;
    suggestedAction?: string;
    source?: string;
    firstSeen?: string;
    lastSeen?: string;
    targets: any[];
  }>;
};

export type EmsAppsSnapshotSection = {
  total: number;
  enabled?: number;
  disabled?: number;
  active?: number;
  rows: Array<{
    appCode?: string;
    appName?: string;
    config?: string;
    status?: string;
    enabled?: boolean;
    active?: boolean;
    notes?: string;
  }>;
};

export type PcsSnapshotSection = {
  total: number;
  online?: number;
  rows: Array<{
    pcsIndex?: number;
    arrayIndex?: number;
    status?: string;
    realPowerKW?: number;
    reactivePowerKVAR?: number;
    chargeLimitKW?: number;
    dischargeLimitKW?: number;
    gridMode?: string;
    lastUpdated?: string;
  }>;
};

export type FirmwareSnapshotSection = {
  latestSnapshotId?: string;
  capturedAt?: string;
  included: boolean;
  source?: "triggered-ems-report" | "cached-snapshot" | "unavailable";
  turtleFirmware?: {
    version?: string;
    major?: number;
    minor?: number;
    revision?: number;
  };
  summary: {
    turtleVersions: Record<string, number>;
    scVersions: Record<string, number>;
    bpcVersions: Record<string, number>;
    featherVersions: Record<string, number>;
    mismatchCount: number;
    missingCount: number;
  };
  details: Array<{
    arrayIndex?: number;
    stringIndex?: number;
    deviceType: string;
    deviceIndex?: number;
    firmwareType?: string;
    version?: string;
    timestamp?: string;
    status?: string;
  }>;
};

export type TopologySnapshotSection = any;
export type SensorsSnapshotSection = any;
export type SourceHealthSnapshotSection = any;

export type SiteDataSnapshot = {
  snapshotId: string;
  snapshotType: "manual" | "report" | "before" | "after" | "scheduled";
  label?: string;
  notes?: string;

  capturedAt: string;
  capturedBy?: string;

  site: {
    siteName?: string;
    stationCode?: string;
    blockIndex?: number;
    customer?: string;
    location?: string;
  };

  connection: {
    emsBaseUrl?: string;
    turtleBaseUrl?: string;
    modbusTarget?: string;
    connected?: boolean;
    connectionStatus?: "connected" | "partial" | "failed" | "stale" | "unknown";
  };

  topology: {
    activeProfileId?: string;
    activeProfileName?: string;
    topologyFamily?: "stack750_800" | "stack360" | "stack225_230" | "custom" | "unknown";
    uiMode?: string;
    source?: "active-profile" | "inferred" | "manual" | "unknown";
    arrays?: number;
    strings?: number;
    pcsUnits?: number;
    directIpTargets?: number;
  };

  sourceCoverage: SourceCoverageSummary;
  reportCoverage: ReportCoverageSummary;

  sections: {
    executive?: ExecutiveSnapshotSection;
    energy?: EnergySnapshotSection;
    thermal?: ThermalSnapshotSection;
    controls?: ControlsSnapshotSection;
    correctiveActions?: CorrectiveActionsSnapshotSection;
    emsApps?: EmsAppsSnapshotSection;
    pcs?: PcsSnapshotSection;
    firmware?: FirmwareSnapshotSection;
    topology?: TopologySnapshotSection;
    sensors?: SensorsSnapshotSection;
    sourceHealth?: SourceHealthSnapshotSection;
  };

  rawRefs?: {
    blockSummary?: string;
    stringSummary?: string;
    siteHealth?: string;
    pcs?: string;
    feathers?: string;
    firmware?: string;
  };

  warnings: string[];
  errors: string[];

  mockOrFallbackDetected: boolean;
};

export type BuildSiteSnapshotOptions = {
  snapshotType?: "manual" | "report" | "before" | "after" | "scheduled";
  label?: string;
  notes?: string;
  refresh?: boolean;
  profileId?: "active" | string;
  includeFirmware?: boolean;
  triggerFirmwareCapture?: boolean;
  includeRawRefs?: boolean;
  reportIntent?:
    | "full-site"
    | "thermal-health"
    | "energy-health"
    | "corrective-actions"
    | "comparison"
    | "custom";
  sections?: string[];
};

export type SnapshotComparison = {
  deltas: {
    alarms: number;
    warnings: number;
    onlineStrings: number;
    nearlineStrings: number;
    offlineStrings: number;
    notCommunicatingStrings: number;
    storedEnergyKWh: number;
    systemSocPct: number;
    maxVoltageDelta: number;
    maxTemp: number;
    maxTempDelta: number;
  };
  resolvedFaults: any[];
  newFaults: any[];
  persistentFaults: any[];
  pcsStatusDelta: number;
  sourceConfidenceDelta: string;
};
