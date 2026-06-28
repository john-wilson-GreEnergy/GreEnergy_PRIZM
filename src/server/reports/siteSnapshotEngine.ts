import { v4 as uuidv4 } from 'uuid';
import { getLatestSnapshot, triggerImmediatePoll } from '../prizmDataCoordinator';
import { ProfileStore } from '../profiles/profileStore';
import { getLatestFirmwareSnapshot, triggerFirmwareCapture } from './firmwareReportService';
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

function getArrayStoredKWh(arrayRow: any, stringsForArray: any[]): number | undefined {
  if (arrayRow.availableStoredKWh !== undefined) return arrayRow.availableStoredKWh;
  if (arrayRow.storedEnergyKWh !== undefined) return arrayRow.storedEnergyKWh;
  if (arrayRow.totalStoredKWh !== undefined) return arrayRow.totalStoredKWh;
  
  if (arrayRow.nearlineStoredKWh !== undefined && arrayRow.onlineStoredKWh !== undefined) {
      return arrayRow.nearlineStoredKWh + arrayRow.onlineStoredKWh;
  }
  
  if (arrayRow.availableKWh !== undefined) return arrayRow.availableKWh;
  
  if (stringsForArray && stringsForArray.length > 0) {
      let sum = 0;
      let hasVal = false;
      for (const s of stringsForArray) {
          if (s.kWh !== undefined && Number.isFinite(s.kWh)) {
              sum += s.kWh;
              hasVal = true;
          }
      }
      if (hasVal) return sum;
  }
  
  return 0;
}

function getArraySocPct(arrayRow: any, stringsForArray: any[]): number | undefined {
  if (arrayRow.systemSocPct !== undefined) return arrayRow.systemSocPct;
  if (arrayRow.socPct !== undefined) return arrayRow.socPct;
  if (arrayRow.avgSocPct !== undefined) return arrayRow.avgSocPct;
  if (arrayRow.averageSoc !== undefined) return arrayRow.averageSoc;
  
  if ((arrayRow.onlineStrings === 0 || arrayRow.onlineStrings === undefined) && arrayRow.nearlineStrings > 0 && arrayRow.nearlineSOC !== undefined) {
      return arrayRow.nearlineSOC;
  }
  
  if (arrayRow.onlineStrings > 0 && arrayRow.onlineSOC !== undefined) return arrayRow.onlineSOC;
  
  if (stringsForArray && stringsForArray.length > 0) {
      let sum = 0;
      let count = 0;
      for (const s of stringsForArray) {
          if (s.socPct !== undefined && Number.isFinite(s.socPct)) {
              sum += s.socPct;
              count++;
          }
      }
      if (count > 0) return sum / count;
  }
  
  return undefined;
}

function getBestStringRollupForMetrics(stringSummary: any): any {
  if (!stringSummary || !stringSummary.rollups) return undefined;
  if (stringSummary.rollups.available && stringSummary.buckets?.available > 0) return stringSummary.rollups.available;
  if (stringSummary.rollups.all && stringSummary.buckets?.all > 0) return stringSummary.rollups.all;
  if (stringSummary.rollups.nearline && stringSummary.buckets?.nearline > 0) return stringSummary.rollups.nearline;
  if (stringSummary.rollups.online && stringSummary.buckets?.online > 0) return stringSummary.rollups.online;
  if (stringSummary.rollups.offline && stringSummary.buckets?.offline > 0) {
    const off = stringSummary.rollups.offline;
    if (off.lowCellTempC !== undefined || off.avgCellTempC !== undefined) return off;
  }
  return undefined;
}

function getCorrectiveTargetIdentity(action: any): string {
    const parts = [];
    if (action.blockIndex !== undefined) parts.push(`Block ${action.blockIndex}`);
    if (action.arrayIndex !== undefined || action.arrayNumber !== undefined) parts.push(`Array ${action.arrayIndex ?? action.arrayNumber}`);
    if (action.energySegmentIndex !== undefined || action.segmentIndex !== undefined) parts.push(`Segment ${action.energySegmentIndex ?? action.segmentIndex}`);
    if (action.stringIndex !== undefined || action.stringNumber !== undefined) parts.push(`String ${action.stringIndex ?? action.stringNumber}`);
    if (action.side) parts.push(`Side ${action.side}`);
    if (action.batteryPackIndex !== undefined || action.bpcIndex !== undefined || action.bpc !== undefined) parts.push(`BPC ${action.batteryPackIndex ?? action.bpcIndex ?? action.bpc}`);
    if (action.cellGroupIndex !== undefined || action.cgIndex !== undefined || action.cellGroup !== undefined) parts.push(`CG ${action.cellGroupIndex ?? action.cgIndex ?? action.cellGroup}`);
    if (action.deviceIp) parts.push(`IP ${action.deviceIp}`);
    if (parts.length === 0 && action.source) parts.push(`Source ${action.source}`);
    return parts.length > 0 ? parts.join(' ') : 'unknown';
}

function getCorrectiveGroupKey(action: any, sev: string): string {
    const faultFamily = action.faultName || action.title || action.message || action.faultCode || 'unknown';
    return `${sev}-${action.faultCode || 'nocode'}-${faultFamily}`;
}

function getMaxVoltageDelta(snapshot: SiteDataSnapshot): number {
    let max = 0;
    if (snapshot.sections?.energy?.voltageByArray) {
        for (const a of snapshot.sections.energy.voltageByArray) {
            if (a.deltaMv > max) max = a.deltaMv;
        }
    }
    if (snapshot.sections?.energy?.voltageOutliers?.largestDelta) {
        for (const o of snapshot.sections.energy.voltageOutliers.largestDelta) {
            if (o.deltaMv > max) max = o.deltaMv;
        }
    }
    return max;
}

function getPcsOnlineCount(snapshot: SiteDataSnapshot): number {
    return snapshot.sections?.pcs?.online || 0;
}

function getPcsTotalCount(snapshot: SiteDataSnapshot): number {
    return snapshot.sections?.pcs?.total || 0;
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
  const rawMap = new Map();
  for (const s of rawSources) {
      rawMap.set(s.name, s);
  }

  const expectedSources = [
      { name: 'ems-status', label: 'EMS Status', usedFor: ['connection', 'executive', 'controls'], req: true },
      { name: 'blockviewer', label: 'Blockviewer', usedFor: ['topology', 'arrays', 'pcs', 'controls'], req: true },
      { name: 'strings', label: 'String List / strings.csv', usedFor: ['string availability', 'SOC', 'kWh', 'cell voltage', 'cell temperature'], req: true },
      { name: 'array-reports', label: 'Array Reports', usedFor: ['array summaries', 'PCS association', 'notifications context'], req: false },
      { name: 'pcs-reports', label: 'PCS Reports', usedFor: ['PCS summary', 'power limits', 'PCS status'], req: false },
      { name: 'notifications', label: 'Notifications', usedFor: ['corrective actions'], req: true },
      { name: 'ems-apps', label: 'EMS Apps', usedFor: ['EMS app section', 'controls'], req: false },
      { name: 'status-codes', label: 'BESS Status Codes', usedFor: ['corrective actions and status labels'], req: false },
      { name: 'first-responder', label: 'First Responder', usedFor: ['sensors and safety data'], req: false },
      { name: 'controller-statistics', label: 'Controller Statistics', usedFor: ['source diagnostics', 'controls', 'telemetry'], req: false },
      { name: 'ip-map', label: 'IP Map', usedFor: ['metadata/topology reference'], req: false },
      { name: 'string-ip-map', label: 'String IP Map', usedFor: ['metadata/topology reference'], req: false },
      { name: 'modbus-map', label: 'Modbus Map', usedFor: ['controls/point validation'], req: false },
      { name: 'fleet-capacity', label: 'Fleet Capacity Calculation', usedFor: ['executive', 'energy'], req: true, type: 'calculated' },
      { name: 'corrective-grouping', label: 'Corrective Action Grouping', usedFor: ['corrective actions'], req: true, type: 'calculated' },
      { name: 'thermal-outliers', label: 'Thermal Outlier Calculation', usedFor: ['thermal'], req: true, type: 'calculated' },
      { name: 'voltage-outliers', label: 'Voltage Outlier Calculation', usedFor: ['energy'], req: true, type: 'calculated' },
  ];

  if (options.includeFirmware || options.triggerFirmwareCapture) {
      expectedSources.push({ name: 'firmware', label: 'Firmware Capture', usedFor: ['firmware summary/details'], req: true, type: 'triggered-ems-report' });
  }

  // Also include any raw sources that aren't in expectedSources
  for (const s of rawSources) {
      if (!expectedSources.some(e => e.name === s.name)) {
          expectedSources.push({ name: s.name, label: s.name, usedFor: s.usedFor || [], req: s.required, type: s.sourceType });
      }
  }

  for (const exp of expectedSources) {
      const s = rawMap.get(exp.name);
      
      let status = s?.status || 'unknown';
      if (status === 'fresh' && s?.stalenessMs && s.stalenessMs > 60000) {
          status = 'stale';
      }
      
      if (!s && (exp.type === 'calculated' || exp.type === 'triggered-ems-report')) {
          status = 'fresh'; // Unless it's a known failing calculation, assuming fresh for missing calculated
      } else if (!s) {
          status = 'missing';
      }

      // override calculated to missing if real inputs are missing
      if (exp.name === 'firmware' && !s && !options.triggerFirmwareCapture) {
          // If we didn't trigger, and there's no result, it's missing
          status = 'missing';
      }

      sources.push({
          key: exp.name,
          label: exp.label,
          sourceType: s?.sourceType || exp.type || 'ems-turtle',
          required: exp.req,
          status,
          usedFor: exp.usedFor,
          lastUpdated: s?.lastUpdated ? new Date(s.lastUpdated).toISOString() : undefined,
          endpoint: s?.endpoint,
          ageSeconds: s?.stalenessMs ? Math.round(s.stalenessMs / 1000) : undefined,
          error: s?.error
      });

      if (exp.req && status === 'fresh') requiredFresh++;
      else if (exp.req && (status === 'missing' || status === 'unknown')) requiredMissing++;
      else if (!exp.req && (status === 'missing' || status === 'unknown')) optionalMissing++;
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
    sourceKeys: ['ems-status', 'strings', 'fleet-capacity', 'corrective-grouping']
  });

  const hasEnergyString = sections.energy?.stringAvailability?.total > 0;
  const hasEnergyFleet = sections.energy?.fleetCapacity?.installedCapacityKWh > 0;
  rows.push({
    section: 'energy',
    label: 'Energy & Electrical',
    status: (hasEnergyString && hasEnergyFleet) ? 'available' : ((hasEnergyString || hasEnergyFleet) ? 'partial' : 'missing'),
    sourceKeys: ['strings', 'fleet-capacity', 'array-reports', 'voltage-outliers']
  });

  const hasThermalCells = sections.thermal?.metrics?.maxCellTempF !== undefined;
  const hasThermalHvac = sections.thermal?.hvacDevices?.length > 0;
  rows.push({
    section: 'thermal',
    label: 'Thermal & HVAC',
    status: (hasThermalCells || hasThermalHvac) ? 'available' : 'missing',
    sourceKeys: ['strings', 'feather-direct', 'thermal-outliers', 'first-responder']
  });

  rows.push({
    section: 'correctiveActions',
    label: 'Corrective Actions',
    status: sections.correctiveActions ? 'available' : 'missing',
    sourceKeys: ['notifications', 'status-codes', 'corrective-grouping']
  });

  rows.push({
    section: 'pcs',
    label: 'PCS',
    status: (sections.pcs?.rows?.length > 0) ? 'available' : 'partial',
    sourceKeys: ['pcs-reports', 'blockviewer']
  });

  rows.push({
    section: 'emsApps',
    label: 'EMS Apps',
    status: sections.emsApps?.total > 0 ? 'available' : 'missing',
    sourceKeys: ['ems-apps']
  });

  rows.push({
    section: 'firmware',
    label: 'Firmware',
    status: !includeFirmware ? 'not-applicable' : (sections.firmware?.included && sections.firmware?.source !== 'unavailable' ? 'available' : 'missing'),
    sourceKeys: ['firmware']
  });

  rows.push({
    section: 'topology',
    label: 'Topology',
    status: 'available',
    sourceKeys: ['blockviewer', 'active-profile', 'ip-map', 'string-ip-map']
  });

  rows.push({
    section: 'sensors',
    label: 'Sensors',
    status: 'available',
    sourceKeys: ['first-responder', 'feather-direct']
  });

  rows.push({
    section: 'sourceHealth',
    label: 'Source Health',
    status: 'available',
    sourceKeys: ['source-coverage']
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
  const warnings: string[] = [];
  if (options.refresh) {
    try {
      await triggerImmediatePoll();
    } catch (err: any) {
      refreshError = err;
      warnings.push("Fresh refresh failed; snapshot generated from cached normalized data.");
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
    byArray: latest.rollups?.arraySummary?.map((a: any) => {
      const arrayStrings = latest.normalized?.strings?.filter((s: any) => s.arrayNumber === a.arrayIndex || s.arrayIndex === a.arrayIndex) || [];
      return {
        arrayIndex: a.arrayIndex,
        totalStrings: a.totalStrings || 0,
        online: a.onlineStrings || 0,
        nearline: a.nearlineStrings || 0,
        offline: a.offlineStrings || 0,
        notCommunicating: a.notCommunicatingStrings || 0,
        storedKWh: getArrayStoredKWh(a, arrayStrings),
        socPct: getArraySocPct(a, arrayStrings),
        status: "normal"
      };
    }) || [],
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
  
  const bestStringRollup = getBestStringRollupForMetrics(latest.rollups?.stringSummary);

  const thermal: ThermalSnapshotSection = {
    thermalReadiness: "normal",
    metrics: {
      minCellTempF: cToF(bestStringRollup?.lowCellTempC),
      avgCellTempF: cToF(bestStringRollup?.avgCellTempC),
      maxCellTempF: cToF(bestStringRollup?.highCellTempC),
      maxTempDeltaF: deltaCToDeltaF(bestStringRollup?.maxCellTempDeltaC),
      hvacFeedbackMismatches: latest.normalized?.feather?.filter((f: any) => f.hasMismatch).length || 0
    },
    tempByArray: latest.rollups?.arraySummary?.map((a: any) => {
      const arrayStrings = latest.normalized?.strings?.filter((s: any) => s.arrayNumber === a.arrayIndex || s.arrayIndex === a.arrayIndex) || [];
      let minT = a.measuredMinCellTemperature;
      let maxT = a.measuredMaxCellTemperature;
      if (minT === undefined || maxT === undefined) {
         let stringMin, stringMax;
         for (const s of arrayStrings) {
             const mn = (s as any).minCellTemperatureC ?? (s as any).lowCellTempC ?? s.minCellTemperature;
             const mx = (s as any).maxCellTemperatureC ?? (s as any).highCellTempC ?? s.maxCellTemperature;
             if (mn !== undefined && mn !== null && (stringMin === undefined || mn < stringMin)) stringMin = mn;
             if (mx !== undefined && mx !== null && (stringMax === undefined || mx > stringMax)) stringMax = mx;
         }
         if (minT === undefined) minT = stringMin;
         if (maxT === undefined) maxT = stringMax;
      }
      return {
        arrayIndex: a.arrayIndex,
        minTempF: cToF(minT),
        maxTempF: cToF(maxT),
        deltaF: (minT !== undefined && maxT !== undefined) ? deltaCToDeltaF(maxT - minT) : deltaCToDeltaF(a.cellTemperatureDelta),
        status: "normal"
      };
    }) || [],
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
    const targetIdentity = getCorrectiveTargetIdentity(a);
    const key = getCorrectiveGroupKey(a, sev);
    
    if (!grouped[key]) {
      grouped[key] = {
        id: key,
        severity: sev,
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
    
    // Avoid exact duplicates
    const isDup = grouped[key].targets.some((t: any) => getCorrectiveTargetIdentity(t) === targetIdentity);
    
    if (!isDup) {
      grouped[key].affectedCount++;
      grouped[key].targets.push({ ...a, identity: targetIdentity });
      grouped[key].affectedSummary = grouped[key].targets[0].identity + (grouped[key].affectedCount > 1 ? ` (+${grouped[key].affectedCount - 1} more)` : '');
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

  const lastPollFinished = latest.debug?.lastPollFinishedAt || latest.liveStatus?.lastUpdated;
  const lastPollStarted = latest.debug?.lastPollStartedAt || latest.liveStatus?.lastUpdated;
  const maxSourceUpdate = sourceCoverage.rows.reduce((max: string | undefined, r) => {
      if (!max) return r.lastUpdated;
      if (!r.lastUpdated) return max;
      return new Date(r.lastUpdated) > new Date(max) ? r.lastUpdated : max;
  }, undefined);

  const controls: ControlsSnapshotSection = {
    emsConnection: {
      status: latest.liveStatus.state === "LIVE" ? "Connected" : "Offline",
      lastPoll: lastPollStarted || maxSourceUpdate
    },
    turtleSources: [],
    directIpSources: [],
    polling: {
      active: true,
      lastRefresh: lastPollFinished || maxSourceUpdate
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

  let firmwareIncluded = false;
  let firmwareSource: "unavailable" | "triggered-ems-report" | "cached-snapshot" = "unavailable";
  let fwSummary = { turtleVersions: {}, scVersions: {}, bpcVersions: {}, featherVersions: {}, mismatchCount: 0, missingCount: 0 };
  let fwDetails: any[] = [];
  
  if (options.includeFirmware) {
      if (options.triggerFirmwareCapture) {
          try {
              await triggerFirmwareCapture(options);
          } catch (e) {
              warnings.push("Firmware capture failed: " + (e as Error).message);
          }
      }
      const fwSnap = await getLatestFirmwareSnapshot();
      if (fwSnap) {
          firmwareIncluded = true;
          firmwareSource = options.triggerFirmwareCapture ? "triggered-ems-report" : "cached-snapshot";
          fwSummary = fwSnap.summary || fwSummary;
          fwDetails = fwSnap.details || fwDetails;
      } else {
          warnings.push("Firmware data was requested but no firmware snapshot is available.");
      }
  }

  const firmware: FirmwareSnapshotSection = {
    included: firmwareIncluded,
    source: firmwareSource,
    summary: fwSummary,
    details: fwDetails
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
      maxVoltageDelta: getMaxVoltageDelta(after) - getMaxVoltageDelta(before),
      maxTemp: (aTh?.metrics?.maxCellTempF || 0) - (bTh?.metrics?.maxCellTempF || 0),
      maxTempDelta: (aTh?.metrics?.maxTempDeltaF || 0) - (bTh?.metrics?.maxTempDeltaF || 0),
      pcsStatusDelta: getPcsOnlineCount(after) - getPcsOnlineCount(before),
    },
    resolvedFaults,
    newFaults,
    persistentFaults,
    sourceConfidenceDelta
  };
}

