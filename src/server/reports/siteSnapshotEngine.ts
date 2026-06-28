import { v4 as uuidv4 } from 'uuid';
import { getLatestSnapshot } from '../prizmDataCoordinator';
import { ProfileStore } from '../profiles/profileStore';
import { 
  SiteDataSnapshot, 
  BuildSiteSnapshotOptions, 
  SourceCoverageRow,
  SourceCoverageSummary,
  ReportCoverageSummary,
  ExecutiveSnapshotSection,
  EnergySnapshotSection,
  ThermalSnapshotSection,
  CorrectiveActionsSnapshotSection,
  EmsAppsSnapshotSection,
  PcsSnapshotSection,
  ControlsSnapshotSection
} from './siteSnapshotTypes';
import { saveSnapshot } from './siteSnapshotStorage';

function inferLegacyTopologyFamily(topologyModel: any): string {
  if (!topologyModel) return "unknown";
  if (
    topologyModel.type === "standard-array-segment" ||
    topologyModel.includeCollectionSegment === true ||
    topologyModel.csSegment !== undefined ||
    topologyModel.esSegmentStart !== undefined
  ) {
    return "stack750_800";
  }
  if (topologyModel.type === "custom-manual") {
    return "custom";
  }
  return "unknown";
}

function getTopologyFamily(activeProfile: any): string {
  return (
    activeProfile?.topologyProfile?.layoutFamily ||
    activeProfile?.activeTopologyProfile?.layoutFamily ||
    activeProfile?.layoutFamily ||
    activeProfile?.topologyFamily ||
    inferLegacyTopologyFamily(activeProfile?.topologyModel) ||
    "stack750_800"
  );
}

function buildSourceCoverage(latest: any): SourceCoverageSummary {
  const sources: SourceCoverageRow[] = [];
  let requiredFresh = 0, requiredMissing = 0, optionalMissing = 0, stale = 0, failed = 0;
  
  const rawSources = latest?.rollups?.sourceHealth || [];
  
  // Basic mock mapping for source coverage rows based on current sourceHealth
  for (const s of rawSources) {
    const isRequired = s.required || s.name?.toLowerCase().includes("blockviewer") || s.name?.toLowerCase().includes("ems");
    const status = (s.status || "unknown") as any;
    
    sources.push({
      key: s.name || "unknown",
      label: s.name || "Unknown Source",
      sourceType: s.sourceType === "direct-ip" ? "direct-ip" : "ems-turtle",
      required: isRequired,
      status: status,
      usedFor: [],
      lastUpdated: new Date().toISOString() // mock for now
    });
    
    if (isRequired && status === 'fresh') requiredFresh++;
    else if (isRequired && (status === 'missing' || status === 'unknown')) requiredMissing++;
    else if (!isRequired && (status === 'missing' || status === 'unknown')) optionalMissing++;
    else if (status === 'stale') stale++;
    else if (status === 'failed') failed++;
  }
  
  let confidence: "high" | "medium" | "low" | "invalid" | "unknown" = "unknown";
  if (latest?.liveStatus?.source === "offline" || latest?.liveStatus?.source === "cache") {
    confidence = "invalid";
  } else if (requiredMissing > 0 || stale > 0 || failed > 0) {
    confidence = "low";
  } else if (optionalMissing > 0) {
    confidence = "medium";
  } else if (requiredFresh > 0) {
    confidence = "high";
  }

  return {
    overallStatus: latest?.liveStatus?.state === "LIVE" ? "fresh" : (latest?.liveStatus?.state === "PARTIAL" ? "partial" : (latest?.liveStatus?.state === "CACHED" ? "stale" : "failed")),
    confidence,
    rows: sources,
    requiredSourcesFresh: requiredFresh,
    requiredSourcesMissing: requiredMissing,
    optionalSourcesMissing: optionalMissing,
    staleSources: stale,
    failedSources: failed
  };
}

function buildReportCoverage(): ReportCoverageSummary {
  return {
    rows: [],
    availableSections: 0,
    partialSections: 0,
    missingSections: 0,
    failedSections: 0
  };
}

export async function buildSiteDataSnapshot(options: BuildSiteSnapshotOptions): Promise<SiteDataSnapshot> {
  const latest = getLatestSnapshot();
  if (!latest) {
    throw new Error('No normalized data available to capture snapshot.');
  }

  const activeProfile = ProfileStore.getActiveProfile();
  
  const sourceCoverage = buildSourceCoverage(latest);
  const reportCoverage = buildReportCoverage();
  
  const bess = latest.rollups?.bessFleetSummary || {};
  const fleetCapacity = {
    installedCapacityKWh: bess.installedCapacityKWh ?? bess.totalInstalledKWh ?? bess.installedKWh ?? 0,
    storedEnergyKWh: bess.availableStoredKWh ?? bess.storedEnergyKWh ?? bess.totalStoredKWh ?? bess.onlineEnergyKWh ?? 0,
    onlineStoredKWh: bess.onlineStoredKWh ?? 0,
    nearlineStoredKWh: bess.nearlineStoredKWh ?? 0,
    offlineStoredKWh: bess.offlineStoredKWh ?? 0,
    notCommunicatingStoredKWh: bess.notCommunicatingStoredKWh ?? 0,
    systemSocPct: bess.systemSocPct ?? bess.socPct ?? 0,
    availableChargeKW: bess.availableChargeKW ?? bess.chargeLimitKW ?? null,
    availableDischargeKW: bess.availableDischargeKW ?? bess.dischargeLimitKW ?? null
  };
  
  const executive: ExecutiveSnapshotSection = {
    siteReadiness: "unknown",
    alarmCount: latest.normalized?.correctiveActions?.filter(a => a.severity === "fault" || a.severity === "alarm").length || 0,
    warningCount: latest.normalized?.correctiveActions?.filter(a => a.severity === "warning").length || 0,
    onlineStrings: latest.rollups?.stringSummary?.buckets?.online || 0,
    nearlineStrings: latest.rollups?.stringSummary?.buckets?.nearline || 0,
    offlineStrings: latest.rollups?.stringSummary?.buckets?.offline || 0,
    notCommunicatingStrings: latest.rollups?.stringSummary?.buckets?.notCommunicating || 0,
    installedCapacityKWh: fleetCapacity.installedCapacityKWh,
    storedEnergyKWh: fleetCapacity.storedEnergyKWh,
    systemSocPct: fleetCapacity.systemSocPct,
    pcsOnline: latest.normalized?.pcs?.filter(p => p.status === 'Online' || p.status === 'Running').length || 0,
    pcsTotal: latest.normalized?.pcs?.length || 0,
    emsStatus: latest.liveStatus.state === "LIVE" ? "Connected" : "Offline",
    sourceConfidence: sourceCoverage.confidence,
    summaryText: "Snapshot generated.",
    recommendedActions: []
  };
  
  if (executive.alarmCount > 0) {
    executive.siteReadiness = "action-required";
  } else if (executive.warningCount > 0 || sourceCoverage.confidence === "low" || sourceCoverage.confidence === "medium") {
    executive.siteReadiness = "limited";
  } else if (executive.alarmCount === 0 && executive.warningCount === 0 && sourceCoverage.confidence === "high") {
    executive.siteReadiness = "ready";
  }

  const energy: EnergySnapshotSection = {
    fleetCapacity,
    stringAvailability: {
      total: executive.onlineStrings + executive.nearlineStrings + executive.offlineStrings + executive.notCommunicatingStrings,
      online: executive.onlineStrings,
      nearline: executive.nearlineStrings,
      offline: executive.offlineStrings,
      notCommunicating: executive.notCommunicatingStrings
    },
    byArray: latest.rollups?.arraySummary?.map(a => ({
      arrayIndex: a.arrayIndex,
      totalStrings: a.totalStrings || 0,
      online: a.onlineStrings || 0,
      nearline: a.nearlineStrings || 0,
      offline: a.offlineStrings || 0,
      notCommunicating: a.notCommunicatingStrings || 0,
      storedKWh: a.onlineAvailableKWh || 0,
      socPct: a.onlineSOC || 0,
      status: "normal"
    })) || [],
    voltageByArray: latest.rollups?.arraySummary?.map(a => ({
      arrayIndex: a.arrayIndex,
      minCellMv: a.measuredMinCellVoltage || 0,
      maxCellMv: a.measuredMaxCellVoltage || 0,
      deltaMv: a.cellVoltageDelta || 0,
      status: "normal"
    })) || [],
    voltageOutliers: { lowest: [], highest: [], largestDelta: [] }
  };
  
  const thermal: ThermalSnapshotSection = {
    thermalReadiness: "normal",
    metrics: {
      minCellTempF: latest.rollups?.stringSummary?.rollups?.online?.lowCellTempC || 0,
      avgCellTempF: latest.rollups?.stringSummary?.rollups?.online?.avgCellTempC || 0,
      maxCellTempF: latest.rollups?.stringSummary?.rollups?.online?.highCellTempC || 0,
      maxTempDeltaF: latest.rollups?.stringSummary?.rollups?.online?.maxCellTempDeltaC || 0,
      hvacFeedbackMismatches: latest.normalized?.feather?.filter(f => f.hasMismatch).length || 0
    },
    tempByArray: latest.rollups?.arraySummary?.map(a => ({
      arrayIndex: a.arrayIndex,
      minTempF: a.measuredMinCellTemperature || 0,
      maxTempF: a.measuredMaxCellTemperature || 0,
      deltaF: a.cellTemperatureDelta || 0,
      status: "normal"
    })) || [],
    thermalOutliers: { hottest: [], coldest: [], largestDelta: [] },
    hvacDevices: latest.normalized?.feather?.map(f => ({
      deviceLabel: f.name || "HVAC",
      status: f.status || "Unknown",
      hvac1CommandSummary: f.hvac1CommandSummary,
      hvac1FeedbackSummary: f.hvac1FeedbackSummary,
      hvac2CommandSummary: f.hvac2CommandSummary,
      hvac2FeedbackSummary: f.hvac2FeedbackSummary
    })) || []
  };

  const correctiveActions: CorrectiveActionsSnapshotSection = {
    summary: {
      alarmGroups: executive.alarmCount,
      warningGroups: executive.warningCount,
      affectedTargets: latest.normalized?.correctiveActions?.length || 0,
      highestSeverity: executive.alarmCount > 0 ? "alarm" : (executive.warningCount > 0 ? "warning" : "none")
    },
    groupedActions: []
  };
  
  const rawActions = latest.normalized?.correctiveActions || [];
  const grouped: Record<string, any> = {};
  for (const a of rawActions) {
    const key = `${a.faultCode}-${a.source}`;
    if (!grouped[key]) {
      grouped[key] = {
        id: key,
        severity: (a.severity === "fault" || a.severity === "alarm") ? "alarm" : a.severity,
        code: a.faultCode,
        faultName: a.faultName || a.title || a.message || a.faultCode,
        affectedCount: 0,
        suggestedAction: a.suggestedAction || a.repairAction || "Check physical connections and confirm parameters",
        source: a.source,
        firstSeen: a.firstSeen,
        lastSeen: a.timestamp,
        targets: []
      };
    }
    grouped[key].affectedCount++;
    grouped[key].targets.push(a);
  }
  correctiveActions.groupedActions = Object.values(grouped);

  const pcs: PcsSnapshotSection = {
    total: executive.pcsTotal,
    online: executive.pcsOnline,
    rows: latest.normalized?.pcs?.map(p => ({
      pcsIndex: p.pcsIndex,
      arrayIndex: p.arrayIndex,
      status: p.status,
      realPowerKW: p.realPowerKW,
      reactivePowerKVAR: p.reactivePowerKVAR,
      chargeLimitKW: p.chargeLimitKW,
      dischargeLimitKW: p.dischargeLimitKW,
      gridMode: p.gridMode
    })) || []
  };

  const controls: ControlsSnapshotSection = {
    emsConnection: {
      status: latest.liveStatus.state === "LIVE" ? "Connected" : "Offline",
      lastPoll: new Date().toISOString()
    },
    turtleSources: [],
    directIpSources: [],
    polling: {
      active: true,
      lastRefresh: new Date().toISOString()
    },
    topologyWarnings: []
  };

  const emsApps: EmsAppsSnapshotSection = {
    total: latest.normalized?.emsApps?.length || 0,
    rows: latest.normalized?.emsApps?.map(e => ({
      appCode: e.appCode,
      appName: e.appName,
      status: e.status
    })) || []
  };

  const snapshot: SiteDataSnapshot = {
    snapshotId: uuidv4(),
    snapshotType: options.snapshotType || "manual",
    label: options.label || "Snapshot",
    notes: options.notes,
    capturedAt: new Date().toISOString(),
    site: {
      siteName: activeProfile?.siteName || "Unknown Site",
      stationCode: latest.siteIdentity.stationCode || undefined,
      blockIndex: latest.siteIdentity.blockIndex || undefined,
    },
    connection: {
      connectionStatus: latest.liveStatus.state === "LIVE" ? "connected" : "unknown"
    },
    topology: {
      activeProfileId: latest.siteIdentity.activeProfileId || undefined,
      activeProfileName: latest.siteIdentity.activeProfileName || undefined,
      topologyFamily: getTopologyFamily(activeProfile) as any,
    },
    sourceCoverage,
    reportCoverage,
    sections: {
      executive,
      energy,
      thermal,
      correctiveActions,
      pcs,
      controls,
      emsApps
    },
    warnings: [],
    errors: [],
    mockOrFallbackDetected: latest.liveStatus?.source === "offline" || latest.liveStatus?.source === "cache"
  };

  if (["manual", "report", "before", "after", "scheduled"].includes(snapshot.snapshotType)) {
    saveSnapshot(snapshot);
  }

  return snapshot;
}

export function compareSiteSnapshots(before: SiteDataSnapshot, after: SiteDataSnapshot) {
  const bEx = before.sections?.executive;
  const aEx = after.sections?.executive;
  return {
    deltas: {
      alarms: (aEx?.alarmCount || 0) - (bEx?.alarmCount || 0),
      warnings: (aEx?.warningCount || 0) - (bEx?.warningCount || 0),
      onlineStrings: (aEx?.onlineStrings || 0) - (bEx?.onlineStrings || 0),
      nearlineStrings: (aEx?.nearlineStrings || 0) - (bEx?.nearlineStrings || 0),
      offlineStrings: (aEx?.offlineStrings || 0) - (bEx?.offlineStrings || 0),
      notCommunicatingStrings: (aEx?.notCommunicatingStrings || 0) - (bEx?.notCommunicatingStrings || 0),
      storedEnergyKWh: (aEx?.storedEnergyKWh || 0) - (bEx?.storedEnergyKWh || 0),
      systemSocPct: (aEx?.systemSocPct || 0) - (bEx?.systemSocPct || 0),
      maxVoltageDelta: 0,
      maxTemp: 0,
      maxTempDelta: 0,
    },
    resolvedFaults: [],
    newFaults: [],
    persistentFaults: [],
    pcsStatusDelta: 0,
    sourceConfidenceDelta: "unknown"
  };
}
