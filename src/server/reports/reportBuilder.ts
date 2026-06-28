import { getLatestSnapshot, PrizmSiteSnapshot } from '../prizmDataCoordinator';
import { SiteHealthSnapshot, SiteReportPayload, ReportType } from './reportTypes';
import { ProfileStore } from '../profiles/profileStore';
import { v4 as uuidv4 } from 'uuid';

export async function buildSiteSnapshot(label: string, notes?: string): Promise<SiteHealthSnapshot> {
  const latest = getLatestSnapshot();
  if (!latest) {
    throw new Error('No normalized data available to capture snapshot.');
  }

  const activeProfile = ProfileStore.getActiveProfile();
  
  return {
    snapshotId: uuidv4(),
    label,
    capturedAt: new Date().toISOString(),
    notes,
    site: {
      stationCode: latest.siteIdentity.stationCode || undefined,
      blockIndex: latest.siteIdentity.blockIndex || undefined,
      siteName: activeProfile?.siteName
    },
    topologyProfileId: latest.siteIdentity.activeProfileId || undefined,
    topologyFamily: activeProfile?.topologyModel?.layoutFamily || undefined,
    normalizedData: {
      blockSummary: latest.rawSources?.block,
      stringSummary: latest.rollups?.stringSummary,
      fleetCapacity: latest.rollups?.fleetCapacity,
      cellMetrics: latest.normalized?.strings,
      pcs: latest.normalized?.pcs,
      emsApps: latest.normalized?.emsApps,
      featherHvac: latest.normalized?.feather,
      siteSensors: latest.normalized?.sensors,
      correctiveActions: latest.normalized?.correctiveActions,
      sourceHealth: latest.rollups?.sourceHealth,
    },
    keyMetrics: {
      warningCount: latest.normalized?.correctiveActions?.filter(a => a.severity === "warning").length || 0,
      alarmCount: latest.normalized?.correctiveActions?.filter(a => a.severity === "fault" || a.severity === "alarm").length || 0,
      onlineStrings: latest.rollups?.stringSummary?.buckets?.online || 0,
      nearlineStrings: latest.rollups?.stringSummary?.buckets?.nearline || 0,
      offlineStrings: latest.rollups?.stringSummary?.buckets?.offline || 0,
      notCommunicatingStrings: latest.rollups?.stringSummary?.buckets?.notCommunicating || 0,
      storedEnergyKWh: latest.rollups?.fleetCapacity?.availableStoredKWh || 0,
      socPct: latest.rollups?.bessFleetSummary?.systemSocPct || 0,
      maxVoltageDeltaMv: latest.rollups?.stringSummary?.rollups?.online?.maxCellVoltageDeltaMv || 0,
      minCellVoltageMv: latest.rollups?.stringSummary?.rollups?.online?.minCellVoltageMv || 0,
      maxCellVoltageMv: latest.rollups?.stringSummary?.rollups?.online?.maxCellVoltageMv || 0,
      maxCellTempF: latest.rollups?.stringSummary?.rollups?.online?.highCellTempC || 0,
      maxTempDeltaF: latest.rollups?.stringSummary?.rollups?.online?.maxCellTempDeltaC || 0,
      hvacMismatchCount: latest.normalized?.feather?.filter(f => f.hasMismatch).length || 0,
      directDeviceFailureCount: latest.rollups?.sourceHealth?.filter(s => s.status === 'failed' && s.sourceType === 'direct-ip').length || 0,
    },
    freshness: latest.liveStatus,
    mockOrFallbackDetected: latest.liveStatus?.source === "offline" || latest.liveStatus?.source === "cache"
  };
}

export async function buildReportPayload(
  reportType: ReportType,
  options: {
    titleOverride?: string;
    notes?: string;
    snapshots?: SiteHealthSnapshot[];
  }
): Promise<SiteReportPayload> {
  const latest = getLatestSnapshot();
  if (!latest) {
    throw new Error('No normalized data available to generate report.');
  }

  const activeProfile = ProfileStore.getActiveProfile();
  
  const payload: SiteReportPayload = {
    reportId: `${reportType}-${Date.now()}`,
    reportType,
    title: options.titleOverride || getDefaultTitle(reportType),
    generatedAt: new Date().toISOString(),
    site: {
      siteName: activeProfile?.siteName || "Unknown Site",
      stationCode: latest.siteIdentity.stationCode || "-",
      blockIndex: latest.siteIdentity.blockIndex || 1,
    },
    topology: {
      profileId: latest.siteIdentity.activeProfileId || "none",
      profileName: latest.siteIdentity.activeProfileName || "None",
      layoutFamily: activeProfile?.topologyModel?.layoutFamily || "standard",
    },
    freshness: {
      overallStatus: latest.liveStatus?.state === "LIVE" ? "fresh" : (latest.liveStatus?.state === "PARTIAL" ? "partial" : (latest.liveStatus?.state === "CACHED" ? "stale" : "failed")),
      sources: latest.rollups?.sourceHealth || [],
      mockOrFallbackDetected: latest.liveStatus?.source === "offline" || latest.liveStatus?.source === "cache",
      warnings: latest.liveStatus?.warnings || []
    }
  };

  if (reportType === "site-snapshot" || reportType === "custom") {
    populateExecutiveSummary(payload, latest);
    populateEnergyHealth(payload, latest);
    populateThermalHealth(payload, latest);
    populateCorrectiveActions(payload, latest);
  }

  if (reportType === "thermal-health") {
    populateExecutiveSummary(payload, latest);
    populateThermalHealth(payload, latest);
  }

  if (reportType === "energy-health") {
    populateExecutiveSummary(payload, latest);
    populateEnergyHealth(payload, latest);
  }

  if (reportType === "corrective-actions") {
    populateExecutiveSummary(payload, latest);
    populateCorrectiveActions(payload, latest);
  }

  if (reportType === "comparison" && options.snapshots && options.snapshots.length === 2) {
    populateComparison(payload, options.snapshots[0], options.snapshots[1]);
  }

  if (options.notes) {
    payload.appendix = { ...payload.appendix, notes: options.notes };
  }

  return payload;
}

function getDefaultTitle(type: ReportType) {
  const map: Record<ReportType, string> = {
    "site-snapshot": "Full Site Snapshot",
    "thermal-health": "Thermal Health Report",
    "energy-health": "Energy & Electrical Health Report",
    "corrective-actions": "Corrective Actions Report",
    "comparison": "Before / After Site Health Comparison",
    "custom": "Custom Report"
  };
  return map[type] || "Report";
}

function populateExecutiveSummary(payload: SiteReportPayload, latest: PrizmSiteSnapshot) {
  payload.executiveSummary = {
    systemStatus: latest.liveStatus.state === "LIVE" ? "Online" : "Degraded",
    warningCount: latest.normalized?.correctiveActions?.filter(a => a.severity === "warning").length || 0,
    alarmCount: latest.normalized?.correctiveActions?.filter(a => a.severity === "fault" || a.severity === "alarm").length || 0,
    onlineStrings: latest.rollups?.stringSummary?.buckets?.online || 0,
    nearlineStrings: latest.rollups?.stringSummary?.buckets?.nearline || 0,
    offlineStrings: latest.rollups?.stringSummary?.buckets?.offline || 0,
    notCommunicatingStrings: latest.rollups?.stringSummary?.buckets?.notCommunicating || 0,
    installedCapacityKWh: latest.rollups?.fleetCapacity?.installedCapacityKWh || 0,
    storedEnergyKWh: latest.rollups?.fleetCapacity?.availableStoredKWh || 0,
    socPct: latest.rollups?.bessFleetSummary?.systemSocPct || 0,
    pcsStatus: latest.normalized?.pcs?.some(p => p.status !== 'Online' && p.status !== 'Running') ? 'Warning' : 'Online',
    emsStatus: latest.liveStatus.state === "LIVE" ? "Connected" : "Offline",
  };
}

function populateEnergyHealth(payload: SiteReportPayload, latest: PrizmSiteSnapshot) {
  payload.energyHealth = {
    stringAvailabilityByArray: latest.rollups?.arraySummary || [],
    fleetCapacity: latest.rollups?.fleetCapacity || {},
    socByArray: latest.rollups?.arraySummary?.map(a => ({ array: a.arrayIndex, soc: a.onlineSOC })) || [],
    kWhByArray: latest.rollups?.arraySummary?.map(a => ({ array: a.arrayIndex, kWh: a.onlineAvailableKWh })) || [],
    voltageMetricsByArray: latest.rollups?.arraySummary?.map(a => ({ array: a.arrayIndex, min: a.measuredMinCellVoltage, max: a.measuredMaxCellVoltage, delta: a.cellVoltageDelta })) || [],
    voltageOutliers: { lowest: [], highest: [], largestDelta: [] }, // simplified
    pcs: latest.normalized?.pcs || []
  };
}

function populateThermalHealth(payload: SiteReportPayload, latest: PrizmSiteSnapshot) {
  payload.thermalHealth = {
    hvacSummary: latest.rollups?.featherSummary || {},
    deviceStatus: latest.normalized?.feather || [],
    tempMetricsByArray: latest.rollups?.arraySummary?.map(a => ({ array: a.arrayIndex, min: a.measuredMinCellTemperature, max: a.measuredMaxCellTemperature, delta: a.cellTemperatureDelta })) || [],
    tempOutliers: { hottest: [], coldest: [], largestDelta: [] }, // simplified
    sensors: latest.normalized?.sensors || []
  };
}

function populateCorrectiveActions(payload: SiteReportPayload, latest: PrizmSiteSnapshot) {
  const rawActions = latest.normalized?.correctiveActions || [];
  
  // Group actions
  const grouped: Record<string, any> = {};
  for (const a of rawActions) {
    const key = `${a.faultCode}-${a.source}`;
    if (!grouped[key]) {
      grouped[key] = {
        severity: a.severity,
        fault: a.faultCode,
        faultName: a.faultName || a.title || a.message || a.faultCode,
        affectedCount: 0,
        suggestedAction: a.suggestedAction || a.repairAction || "Check physical connections and confirm parameters",
        source: a.source,
        firstSeen: a.firstSeen,
        lastSeen: a.timestamp
      };
    }
    grouped[key].affectedCount++;
  }

  payload.correctiveActions = {
    summary: { activeAlarms: payload.executiveSummary?.alarmCount || 0, activeWarnings: payload.executiveSummary?.warningCount || 0 },
    groupedActions: Object.values(grouped),
    expandedTargets: rawActions
  };
}

function populateComparison(payload: SiteReportPayload, before: SiteHealthSnapshot, after: SiteHealthSnapshot) {
  payload.comparison = {
    beforeSnapshotId: before.snapshotId,
    afterSnapshotId: after.snapshotId,
    deltas: {
      alarms: (after.keyMetrics.alarmCount || 0) - (before.keyMetrics.alarmCount || 0),
      warnings: (after.keyMetrics.warningCount || 0) - (before.keyMetrics.warningCount || 0),
      onlineStrings: (after.keyMetrics.onlineStrings || 0) - (before.keyMetrics.onlineStrings || 0),
    },
    resolvedFaults: [],
    newFaults: [],
    persistentFaults: []
  };
}
