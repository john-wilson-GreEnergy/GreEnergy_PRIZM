export type ReportType = 
  | "site-snapshot"
  | "thermal-health"
  | "energy-health"
  | "corrective-actions"
  | "comparison"
  | "custom";

export interface SiteReportPayload {
  reportId: string;
  reportType: ReportType;
  title: string;
  generatedAt: string;
  generatedBy?: string;

  site: {
    siteName?: string;
    stationCode?: string;
    blockIndex?: number;
    customer?: string;
    location?: string;
  };

  topology: {
    profileId?: string;
    profileName?: string;
    layoutFamily?: string;
    uiMode?: string;
    source?: string;
  };

  freshness: {
    overallStatus: "fresh" | "stale" | "partial" | "failed" | "unknown";
    sources: Array<{
      name: string;
      sourceType: "direct-ip" | "turtle-report" | "ems-cache" | "imported-metadata" | "generated-reference" | "manual" | "unknown";
      required: boolean;
      status: "fresh" | "stale" | "missing" | "failed" | "not-applicable" | "unknown";
      lastUpdated?: string;
      ageSeconds?: number;
      warning?: string;
    }>;
    mockOrFallbackDetected: boolean;
    warnings: string[];
  };

  executiveSummary?: {
    systemStatus?: string;
    warningCount?: number;
    alarmCount?: number;
    onlineStrings?: number;
    nearlineStrings?: number;
    offlineStrings?: number;
    notCommunicatingStrings?: number;
    installedCapacityKWh?: number;
    storedEnergyKWh?: number;
    socPct?: number;
    pcsStatus?: string;
    emsStatus?: string;
  };

  energyHealth?: {
    stringAvailabilityByArray: any[];
    fleetCapacity: any;
    socByArray: any[];
    kWhByArray: any[];
    voltageMetricsByArray: any[];
    voltageOutliers: {
      lowest: any[];
      highest: any[];
      largestDelta: any[];
    };
    pcs: any[];
  };

  thermalHealth?: {
    hvacSummary: any;
    deviceStatus: any[];
    tempMetricsByArray: any[];
    tempOutliers: {
      hottest: any[];
      coldest: any[];
      largestDelta: any[];
    };
    sensors: any[];
    maxCellTemp?: number;
    avgCellTemp?: number;
    minCellTemp?: number;
    maxTempDelta?: number;
    hvacMismatchCount?: number;
  };

  controlsHealth?: {
    ems: any;
    turtleSources: any[];
    directIpSources: any[];
    sourceCoverage: any[];
    topologyWarnings: string[];
  };

  correctiveActions?: {
    summary: any;
    groupedActions: any[];
    expandedTargets: any[];
  };

  comparison?: {
    beforeSnapshotId: string;
    afterSnapshotId: string;
    deltas: any;
    resolvedFaults: any[];
    newFaults: any[];
    persistentFaults: any[];
  };

  appendix?: {
    sourceHealth?: any[];
    rawSummary?: any;
    notes?: string;
  };
}

export interface ReportIndexEntry {
  reportId: string;
  reportType: ReportType;
  title: string;
  createdAt: string;
  stationCode?: string;
  blockIndex?: number;
  topologyFamily?: string;
  pdfPath?: string;
  jsonPath?: string;
  csvPaths?: string[];
  sourceFreshnessStatus: string;
  warnings: string[];
}
