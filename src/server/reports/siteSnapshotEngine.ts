import { v4 as uuidv4 } from 'uuid';
import { getLatestSnapshot, triggerImmediatePoll } from '../prizmDataCoordinator';
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
  ControlsSnapshotSection,
  FirmwareSnapshotSection,
  TopologySnapshotSection,
  SensorsSnapshotSection,
  SourceHealthSnapshotSection
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

function cToF(value: any): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return (n * 9) / 5 + 32;
}

function deltaCToDeltaF(value: any): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return n * 9 / 5;
}

function getSnapshotFleetCapacity(latest: any) {
  const fromStringSummary =
    latest.rollups?.stringSummary?.rollups?.fleetCapacity ||
    latest.rollups?.stringSummary?.fleetCapacity;

  if (fromStringSummary) {
    return {
      installedCapacityKWh:
        fromStringSummary.installedCapacityKWh ?? 0,
      storedEnergyKWh:
        fromStringSummary.availableStoredKWh ??
        fromStringSummary.storedEnergyKWh ??
        0,
      availableStoredKWh:
        fromStringSummary.availableStoredKWh ??
        fromStringSummary.storedEnergyKWh ??
        0,
      onlineStoredKWh:
        fromStringSummary.onlineStoredKWh ?? 0,
      nearlineStoredKWh:
        fromStringSummary.nearlineStoredKWh ?? 0,
      offlineStoredKWh:
        fromStringSummary.offlineStoredKWh ?? 0,
      notCommunicatingStoredKWh:
        fromStringSummary.notCommunicatingStoredKWh ?? 0,
      systemSocPct:
        fromStringSummary.systemSocPct ??
        fromStringSummary.socPct ??
        0,
      availableChargeKW:
        fromStringSummary.availableChargeKW ?? null,
      availableDischargeKW:
        fromStringSummary.availableDischargeKW ?? null
    };
  }

  const bess = latest.rollups?.bessFleetSummary || {};

  return {
    installedCapacityKWh:
      bess.installedCapacityKWh ??
      bess.totalInstalledKWh ??
      bess.installedKWh ??
      0,
    storedEnergyKWh:
      bess.availableStoredKWh ??
      bess.storedEnergyKWh ??
      bess.totalStoredKWh ??
      bess.onlineEnergyKWh ??
      0,
    availableStoredKWh:
      bess.availableStoredKWh ??
      bess.storedEnergyKWh ??
      bess.totalStoredKWh ??
      bess.onlineEnergyKWh ??
      0,
    onlineStoredKWh:
      bess.onlineStoredKWh ?? 0,
    nearlineStoredKWh:
      bess.nearlineStoredKWh ?? 0,
    offlineStoredKWh:
      bess.offlineStoredKWh ?? 0,
    notCommunicatingStoredKWh:
      bess.notCommunicatingStoredKWh ?? 0,
    systemSocPct:
      bess.systemSocPct ??
      bess.socPct ??
      0,
    availableChargeKW:
      bess.availableChargeKW ??
      bess.chargeLimitKW ??
      null,
    availableDischargeKW:
      bess.availableDischargeKW ??
      bess.dischargeLimitKW ??
      null
  };
}

function buildSourceCoverage(latest: any, options: BuildSiteSnapshotOptions, refreshError: Error | null): SourceCoverageSummary {
  const sources: SourceCoverageRow[] = [];
  let requiredFresh = 0, requiredMissing = 0, optionalMissing = 0, stale = 0, failed = 0;
  
  const rawSources = latest?.rollups?.sourceHealth || [];
  
  for (const s of rawSources) {
    const isRequired = s.required || s.name?.toLowerCase().includes("blockviewer") || s.name?.toLowerCase().includes("ems") || s.name?.toLowerCase().includes("array");
    let status = (s.status || "unknown") as any;
    if (status === 'fresh' && s.stalenessMs && s.stalenessMs > 60000) {
      status = 'stale';
    }
    
    sources.push({
      key: s.name || "unknown",
      label: s.name || "Unknown Source",
      sourceType: s.sourceType === "direct-ip" ? "direct-ip" : "ems-turtle",
      required: isRequired,
      status: status,
      usedFor: s.usedFor || [],
      lastUpdated: s.lastUpdated ? new Date(s.lastUpdated).toISOString() : undefined,
      endpoint: s.endpoint,
      ageSeconds: s.stalenessMs ? Math.round(s.stalenessMs / 1000) : undefined,
      error: s.error
    });
    
    if (isRequired && status === 'fresh') requiredFresh++;
    else if (isRequired && (status === 'missing' || status === 'unknown')) requiredMissing++;
    else if (!isRequired && (status === 'missing' || status === 'unknown')) optionalMissing++;
    else if (status === 'stale') stale++;
    else if (status === 'failed') failed++;
  }

  if (options.includeFirmware) {
    sources.push({
      key: 'firmware',
      label: 'Firmware Capture',
      sourceType: 'triggered-ems-report',
      required: false,
      status: 'missing',
      usedFor: ['Firmware'],
    });
    optionalMissing++;
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
    overallStatus: refreshError ? "failed" : (latest?.liveStatus?.state === "LIVE" ? "fresh" : (latest?.liveStatus?.state === "PARTIAL" ? "partial" : (latest?.liveStatus?.state === "CACHED" ? "stale" : "failed"))),
    confidence,
    rows: sources,
    requiredSourcesFresh: requiredFresh,
    requiredSourcesMissing: requiredMissing,
    optionalSourcesMissing: optionalMissing,
    staleSources: stale,
    failedSources: failed
  };
}

function buildReportCoverage(sections: any, includeFirmware?: boolean): ReportCoverageSummary {
  const rows: any[] = [];
  
  rows.push({
    section: 'executive',
    label: 'Executive Summary',
    status: sections.executive ? 'available' : 'missing',
    sourceKeys: []
  });

  const hasEnergyString = sections.energy?.stringAvailability?.total > 0;
  const hasEnergyFleet = sections.energy?.fleetCapacity?.installedCapacityKWh > 0;
  rows.push({
    section: 'energy',
    label: 'Energy & Electrical',
    status: (hasEnergyString && hasEnergyFleet) ? 'available' : ((hasEnergyString || hasEnergyFleet) ? 'partial' : 'missing'),
    sourceKeys: []
  });

  const hasThermalCells = sections.thermal?.metrics?.maxCellTempF !== undefined;
  const hasThermalHvac = sections.thermal?.hvacDevices?.length > 0;
  rows.push({
    section: 'thermal',
    label: 'Thermal & HVAC',
    status: (hasThermalCells || hasThermalHvac) ? 'available' : 'missing',
    sourceKeys: []
  });

  rows.push({
    section: 'correctiveActions',
    label: 'Corrective Actions',
    status: sections.correctiveActions ? 'available' : 'missing',
    sourceKeys: []
  });

  rows.push({
    section: 'pcs',
    label: 'PCS',
    status: (sections.pcs?.rows?.length > 0) ? 'available' : 'partial',
    sourceKeys: []
  });

  rows.push({
    section: 'emsApps',
    label: 'EMS Apps',
    status: sections.emsApps?.total > 0 ? 'available' : 'missing',
    sourceKeys: []
  });

  rows.push({
    section: 'firmware',
    label: 'Firmware',
    status: !includeFirmware ? 'not-applicable' : (sections.firmware?.included ? 'available' : 'missing'),
    sourceKeys: []
  });

  rows.push({
    section: 'sourceHealth',
    label: 'Source Health',
    status: 'available',
    sourceKeys: []
  });

  let available = 0, partial = 0, missing = 0, failed = 0;
  for (const r of rows) {
    if (r.status === 'available') available++;
    if (r.status === 'partial') partial++;
    if (r.status === 'missing') missing++;
    if (r.status === 'failed') failed++;
  }

  return {
    rows,
    availableSections: available,
    partialSections: partial,
    missingSections: missing,
    failedSections: failed
  };
}

export async function buildSiteDataSnapshot(options: BuildSiteSnapshotOptions): Promise<SiteDataSnapshot> {
  let refreshError: Error | null = null;
  if (options.refresh) {
    try {
      await triggerImmediatePoll();
    } catch (err: any) {
      refreshError = err;
    }
  }

  const latest = getLatestSnapshot();
  if (!latest) {
    throw new Error('No normalized data available to capture snapshot.');
  }

  const activeProfile = ProfileStore.getActiveProfile();
  
  const sourceCoverage = buildSourceCoverage(latest, options, refreshError);
  
  const fleetCapacity = getSnapshotFleetCapacity(latest);
  
  const onlineStrings = latest.rollups?.stringSummary?.buckets?.online || 0;
  const nearlineStrings = latest.rollups?.stringSummary?.buckets?.nearline || 0;
  const offlineStrings = latest.rollups?.stringSummary?.buckets?.offline || 0;
  const notCommunicatingStrings = latest.rollups?.stringSummary?.buckets?.notCommunicating || 0;

  const summaryText = `Site ${activeProfile?.siteName || 'Unknown'} Block ${latest.siteIdentity.blockIndex || 1} snapshot captured with ${nearlineStrings} strings reporting nearline, ${onlineStrings} online, ${offlineStrings} offline, and ${notCommunicatingStrings} not communicating. Stored energy is ${(fleetCapacity.storedEnergyKWh / 1000).toFixed(2)} MWh with system SOC at ${fleetCapacity.systemSocPct.toFixed(1)}%. Source confidence is ${sourceCoverage.confidence}.`;

  const executive: ExecutiveSnapshotSection = {
    siteReadiness: "unknown",
    alarmCount: latest.normalized?.correctiveActions?.filter(a => a.severity === "fault" || a.severity === "alarm").length || 0,
    warningCount: latest.normalized?.correctiveActions?.filter(a => a.severity === "warning").length || 0,
    onlineStrings,
    nearlineStrings,
    offlineStrings,
    notCommunicatingStrings,
    installedCapacityKWh: fleetCapacity.installedCapacityKWh,
    storedEnergyKWh: fleetCapacity.storedEnergyKWh,
    systemSocPct: fleetCapacity.systemSocPct,
    pcsOnline: latest.normalized?.pcs?.filter(p => p.status === 'Online' || p.status === 'Running').length || 0,
    pcsTotal: latest.normalized?.pcs?.length || 0,
    emsStatus: latest.liveStatus.state === "LIVE" ? "Connected" : "Offline",
    sourceConfidence: sourceCoverage.confidence,
    summaryText,
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
      total: onlineStrings + nearlineStrings + offlineStrings + notCommunicatingStrings,
      online: onlineStrings,
      nearline: nearlineStrings,
      offline: offlineStrings,
      notCommunicating: notCommunicatingStrings
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
      avgCellMv: a.measuredAvgCellVoltage || 0,
      maxCellMv: a.measuredMaxCellVoltage || 0,
      deltaMv: a.cellVoltageDelta || 0,
      status: "normal"
    })) || [],
    voltageOutliers: { lowest: [], highest: [], largestDelta: [] }
  };
  
  const thermal: ThermalSnapshotSection = {
    thermalReadiness: "normal",
    metrics: {
      minCellTempF: cToF(latest.rollups?.stringSummary?.rollups?.online?.lowCellTempC),
      avgCellTempF: cToF(latest.rollups?.stringSummary?.rollups?.online?.avgCellTempC),
      maxCellTempF: cToF(latest.rollups?.stringSummary?.rollups?.online?.highCellTempC),
      maxTempDeltaF: deltaCToDeltaF(latest.rollups?.stringSummary?.rollups?.online?.maxCellTempDeltaC),
      hvacFeedbackMismatches: latest.normalized?.feather?.filter(f => f.hasMismatch).length || 0
    },
    tempByArray: latest.rollups?.arraySummary?.map(a => ({
      arrayIndex: a.arrayIndex,
      minTempF: cToF(a.measuredMinCellTemperature),
      maxTempF: cToF(a.measuredMaxCellTemperature),
      deltaF: deltaCToDeltaF(a.cellTemperatureDelta),
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
      alarmGroups: 0,
      warningGroups: 0,
      affectedTargets: latest.normalized?.correctiveActions?.length || 0,
      highestSeverity: executive.alarmCount > 0 ? "alarm" : (executive.warningCount > 0 ? "warning" : "none")
    },
    groupedActions: []
  };
  
  const rawActions = latest.normalized?.correctiveActions || [];
  const grouped: Record<string, any> = {};
  for (const a of rawActions) {
    const sev = (a.severity === "fault" || a.severity === "alarm") ? "alarm" : a.severity;
    let targetIdentity = 'unknown';
    if (a.arrayIndex !== undefined) {
      targetIdentity = `Array ${a.arrayIndex}`;
      if (a.stringIndex !== undefined) targetIdentity += ` String ${a.stringIndex}`;
    }
    const faultFamily = a.faultName || a.title || a.message || a.faultCode;
    const key = `${sev}-${a.faultCode || 'nocode'}-${faultFamily}`;
    
    if (!grouped[key]) {
      grouped[key] = {
        id: key,
        severity: sev,
        code: a.faultCode,
        faultName: faultFamily,
        affectedCount: 0,
        suggestedAction: a.suggestedAction || a.repairAction || "Check physical connections and confirm parameters",
        source: a.source,
        firstSeen: a.firstSeen,
        lastSeen: a.timestamp,
        targets: []
      };
    }
    
    // Avoid exact duplicates
    const isDup = grouped[key].targets.some((t: any) => 
      t.arrayIndex === a.arrayIndex && 
      t.stringIndex === a.stringIndex &&
      t.deviceIp === a.deviceIp
    );
    
    if (!isDup) {
      grouped[key].affectedCount++;
      grouped[key].targets.push(a);
    }
  }
  
  correctiveActions.groupedActions = Object.values(grouped);
  for (const g of correctiveActions.groupedActions) {
    if (g.severity === 'alarm') correctiveActions.summary.alarmGroups++;
    if (g.severity === 'warning') correctiveActions.summary.warningGroups++;
  }

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

  const firmware: FirmwareSnapshotSection = {
    included: !!options.includeFirmware,
    source: "unavailable",
    summary: {
      turtleVersions: {},
      scVersions: {},
      bpcVersions: {},
      featherVersions: {},
      mismatchCount: 0,
      missingCount: 0
    },
    details: []
  };

  const topology: TopologySnapshotSection = {
    topologyFamily: getTopologyFamily(activeProfile),
    arrays: latest.rollups?.arraySummary?.length || 0,
    strings: energy.stringAvailability.total,
    pcsUnits: pcs.total,
  };

  const sensors: SensorsSnapshotSection = {
    rows: latest.normalized?.sensors || []
  };

  const sourceHealth: SourceHealthSnapshotSection = {
    rows: sourceCoverage.rows
  };
  
  const sectionsObj = {
      executive,
      energy,
      thermal,
      correctiveActions,
      pcs,
      controls,
      emsApps,
      firmware,
      topology,
      sensors,
      sourceHealth
  };

  const reportCoverage = buildReportCoverage(sectionsObj, options.includeFirmware);
  
  const warnings = [];
  if (refreshError) {
    warnings.push("Fresh refresh failed; snapshot generated from cached normalized data.");
  }

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
    sections: sectionsObj,
    warnings,
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
  const bTh = before.sections?.thermal;
  const aTh = after.sections?.thermal;
  const bCa = before.sections?.correctiveActions;
  const aCa = after.sections?.correctiveActions;
  
  const resolvedFaults: any[] = [];
  const newFaults: any[] = [];
  const persistentFaults: any[] = [];
  
  if (bCa && aCa) {
      const bMap = new Map(bCa.groupedActions.map(g => [g.id, g]));
      const aMap = new Map(aCa.groupedActions.map(g => [g.id, g]));
      
      for (const [id, bg] of bMap.entries()) {
          if (!aMap.has(id)) resolvedFaults.push(bg);
          else persistentFaults.push(bg);
      }
      for (const [id, ag] of aMap.entries()) {
          if (!bMap.has(id)) newFaults.push(ag);
      }
  }
  
  let sourceConfidenceDelta = "unknown";
  if (before.sourceCoverage?.confidence === after.sourceCoverage?.confidence) {
      sourceConfidenceDelta = "no-change";
  } else if (before.sourceCoverage?.confidence === 'high' && after.sourceCoverage?.confidence !== 'high') {
      sourceConfidenceDelta = "degraded";
  } else if (before.sourceCoverage?.confidence !== 'high' && after.sourceCoverage?.confidence === 'high') {
      sourceConfidenceDelta = "improved";
  }
  
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
      maxTemp: (aTh?.metrics?.maxCellTempF || 0) - (bTh?.metrics?.maxCellTempF || 0),
      maxTempDelta: (aTh?.metrics?.maxTempDeltaF || 0) - (bTh?.metrics?.maxTempDeltaF || 0),
    },
    resolvedFaults,
    newFaults,
    persistentFaults,
    pcsStatusDelta: 0,
    sourceConfidenceDelta
  };
}

