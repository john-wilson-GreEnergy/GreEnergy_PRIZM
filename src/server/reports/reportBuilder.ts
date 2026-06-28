import { SiteReportPayload, ReportType } from './reportTypes';
import { SiteDataSnapshot } from './siteSnapshotTypes';

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

export function buildReportPackageFromSnapshot(
  snapshot: SiteDataSnapshot,
  reportType: ReportType,
  options: {
    titleOverride?: string;
    notes?: string;
    comparisonSnapshot?: SiteDataSnapshot;
  }
): SiteReportPayload {
  const payload: SiteReportPayload = {
    reportId: `${reportType}-${Date.now()}`,
    reportType,
    title: options.titleOverride || getDefaultTitle(reportType),
    generatedAt: new Date().toISOString(),
    site: {
      siteName: snapshot.site?.siteName || "Unknown Site",
      stationCode: snapshot.site?.stationCode || "-",
      blockIndex: snapshot.site?.blockIndex || 1,
    },
    topology: {
      profileId: snapshot.topology?.activeProfileId || "none",
      profileName: snapshot.topology?.activeProfileName || "None",
      layoutFamily: snapshot.topology?.topologyFamily,
    },
    freshness: {
      overallStatus: snapshot.sourceCoverage?.overallStatus || "unknown",
      sources: snapshot.sourceCoverage?.rows?.map(r => ({
        name: r.key,
        sourceType: r.sourceType as any,
        required: r.required,
        status: r.status as any,
        lastUpdated: r.lastUpdated
      })) || [],
      mockOrFallbackDetected: snapshot.mockOrFallbackDetected,
      warnings: snapshot.warnings || []
    }
  };

  if (reportType === "site-snapshot" || reportType === "custom") {
    populateExecutiveSummary(payload, snapshot);
    populateEnergyHealth(payload, snapshot);
    populateThermalHealth(payload, snapshot);
    populateCorrectiveActions(payload, snapshot);
  }

  if (reportType === "thermal-health") {
    populateExecutiveSummary(payload, snapshot);
    populateThermalHealth(payload, snapshot);
  }

  if (reportType === "energy-health") {
    populateExecutiveSummary(payload, snapshot);
    populateEnergyHealth(payload, snapshot);
  }

  if (reportType === "corrective-actions") {
    populateExecutiveSummary(payload, snapshot);
    populateCorrectiveActions(payload, snapshot);
  }

  if (reportType === "comparison" && options.comparisonSnapshot) {
    populateComparison(payload, options.comparisonSnapshot, snapshot);
  }

  if (options.notes) {
    payload.appendix = { ...payload.appendix, notes: options.notes };
  }

  return payload;
}

function populateExecutiveSummary(payload: SiteReportPayload, snapshot: SiteDataSnapshot) {
  const ex = snapshot.sections?.executive;
  payload.executiveSummary = {
    systemStatus: ex?.siteReadiness === "ready" ? "Online" : "Degraded",
    warningCount: ex?.warningCount || 0,
    alarmCount: ex?.alarmCount || 0,
    onlineStrings: ex?.onlineStrings || 0,
    nearlineStrings: ex?.nearlineStrings || 0,
    offlineStrings: ex?.offlineStrings || 0,
    notCommunicatingStrings: ex?.notCommunicatingStrings || 0,
    installedCapacityKWh: ex?.installedCapacityKWh || 0,
    storedEnergyKWh: ex?.storedEnergyKWh || 0,
    socPct: ex?.systemSocPct || 0,
    pcsStatus: snapshot.sections?.pcs?.online === snapshot.sections?.pcs?.total ? 'Online' : 'Warning',
    emsStatus: ex?.emsStatus || "Offline",
  };
}

function populateEnergyHealth(payload: SiteReportPayload, snapshot: SiteDataSnapshot) {
  const en = snapshot.sections?.energy;
  payload.energyHealth = {
    stringAvailabilityByArray: en?.byArray || [],
    fleetCapacity: en?.fleetCapacity,
    socByArray: en?.byArray?.map(a => ({ array: a.arrayIndex, soc: a.socPct })) || [],
    kWhByArray: en?.byArray?.map(a => ({ array: a.arrayIndex, kWh: a.storedKWh })) || [],
    voltageMetricsByArray: en?.voltageByArray || [],
    voltageOutliers: en?.voltageOutliers || { lowest: [], highest: [], largestDelta: [] },
    pcs: snapshot.sections?.pcs?.rows || []
  };
}

function populateThermalHealth(payload: SiteReportPayload, snapshot: SiteDataSnapshot) {
  const th = snapshot.sections?.thermal;
  payload.thermalHealth = {
    hvacSummary: {},
    deviceStatus: th?.hvacDevices || [],
    tempMetricsByArray: th?.tempByArray || [],
    tempOutliers: th?.thermalOutliers || { hottest: [], coldest: [], largestDelta: [] },
    sensors: [],
    maxCellTemp: th?.metrics?.maxCellTempF,
    avgCellTemp: th?.metrics?.avgCellTempF,
    minCellTemp: th?.metrics?.minCellTempF,
    maxTempDelta: th?.metrics?.maxTempDeltaF,
    hvacMismatchCount: th?.metrics?.hvacFeedbackMismatches,
  };
}

function populateCorrectiveActions(payload: SiteReportPayload, snapshot: SiteDataSnapshot) {
  const ca = snapshot.sections?.correctiveActions;
  payload.correctiveActions = {
    summary: { 
      activeAlarms: ca?.summary?.alarmGroups || 0, 
      activeWarnings: ca?.summary?.warningGroups || 0 
    },
    groupedActions: ca?.groupedActions || [],
    expandedTargets: ca?.groupedActions?.flatMap(g => g.targets) || []
  };
}

function populateComparison(payload: SiteReportPayload, before: SiteDataSnapshot, after: SiteDataSnapshot) {
  const bEx = before.sections?.executive;
  const aEx = after.sections?.executive;
  
  payload.comparison = {
    beforeSnapshotId: before.snapshotId,
    afterSnapshotId: after.snapshotId,
    deltas: {
      alarms: (aEx?.alarmCount || 0) - (bEx?.alarmCount || 0),
      warnings: (aEx?.warningCount || 0) - (bEx?.warningCount || 0),
      onlineStrings: (aEx?.onlineStrings || 0) - (bEx?.onlineStrings || 0),
      maxTemp: (after.sections?.thermal?.metrics?.maxCellTempF || 0) - (before.sections?.thermal?.metrics?.maxCellTempF || 0),
    },
    resolvedFaults: [],
    newFaults: [],
    persistentFaults: []
  };
}
