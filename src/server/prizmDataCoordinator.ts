import { getEmsConnectionStatus, getEmsCachedBlock, getEmsCachedStatus, getEmsCachedLastCall, getEmsCachedRawStrings, getEmsCachedStatusCodes, getEmsSourcesDebugInfo, pollEmsTurtle, isDemoActive, getEmsCachedArrayPcsReports, getEmsCachedArrayReports, getEmsCachedArrayNotifications } from "./emsTurtleClient";
import { getFeatherCache, refreshFeatherCache } from "./feather/featherClient";
import { fetchLiveEmsApps } from "./ems/emsAppsService";
import { buildSiteOperationsSummaryFromCache, NormalizedStringRow } from "./siteOperations";
import { recordTelemetrySample } from "./telemetry/siteTelemetryAggregator";
import * as prizmCache from "./cache/prizmCache";
import { ProfileStore } from "./profiles/profileStore";
import { buildNormalizedResponderSummary } from "./siteSensors/siteSensorsRoutes";
import { fetchEnrichedDevices } from "./feather/deviceEnrichment";
import { getSegmentName } from "./siteData/segmentTranslator";
import { buildNormalizedStringsData } from "./stringsDashboard";
import { stringNumberToEnergySegment } from "../lib/stringToEsMapper";


export type NormalizedArraySummary = any;
export type NormalizedPcsSummary = any;
export type NormalizedFeatherDevice = any;
export type CorrectiveAction = any;

export type PrizmSiteSnapshot = {
  siteIdentity: {
    activeProfileId: string | null;
    activeProfileName: string | null;
    stationCode: string | null;
    blockIndex: number | null;
    emsBaseUrl: string | null;
  };
  liveStatus: {
    state: "LIVE" | "PARTIAL" | "CACHED" | "OFFLINE";
    source: "live-ems" | "cache" | "offline" | "partial";
    liveAttempted: boolean;
    liveSucceeded: boolean;
    stale: boolean;
    cacheUsed: boolean;
    lastUpdated: string | null;
    ageMs: number | null;
    warnings: string[];
    errors: string[];
  };
  rawSources: {
    block: any;
    status: any;
    lastCall: any;
    strings: any[];
    statusCodes: any;
    featherDevices: any[];
    emsApps: any[];
    arrayPcsReports?: any;
    arrayReports?: any;
    arrayNotifications?: any;
  };
  normalized: {
    strings: NormalizedStringRow[];
    arrays: NormalizedArraySummary[];
    pcs: NormalizedPcsSummary[];
    feather: NormalizedFeatherDevice[];
    correctiveActions: CorrectiveAction[];
    sensors?: any[];
    arrayDetailsByArray?: Record<string, any>;
  };
  rollups: {
    stringSummary: any;
    arraySummary: any[];
    pcsSummary: any;
    bessFleetSummary: any;
    featherSummary: any;
    sourceHealth: any[];
    sensorsSummary?: any;
  };
  debug: {
    coordinatorStartedAt: string;
    lastPollStartedAt: string | null;
    lastPollFinishedAt: string | null;
    lastPollDurationMs: number | null;
    normalizedStringRowCount: number;
    arraySummarySource: "native" | "synthesized-from-strings" | "native-merged-with-strings";
    correctiveActionsCount: number;
    featherCellTempExcludedCollectionSegments: number;
    errors: string[];
    arrayNotifications?: any;
    correctiveActionsRepair?: any;
  };
}

function countArrayDetailStrings(snapshot: any): number {
  return (Object.values(snapshot?.normalized?.arrayDetailsByArray || {}) as any[])
    .reduce((sum: number, arr: any) => sum + ((arr?.strings || []).length), 0);
}

function getSnapshotQuality(snapshot: any) {
  return {
    normalizedStrings: snapshot?.normalized?.strings?.length || 0,
    stringSummaryRows: snapshot?.rollups?.stringSummary?.tableRows?.length || 0,
    arraySummaryRows: snapshot?.rollups?.arraySummary?.length || 0,
    arrayDetailStringTotal: countArrayDetailStrings(snapshot),
    hasNormalized: !!snapshot?.normalized,
    hasRollups: !!snapshot?.rollups,
    hasStringSummary: !!snapshot?.rollups?.stringSummary
  };
}

function isRenderableSnapshot(snapshot: any): boolean {
  const q = getSnapshotQuality(snapshot);
  return q.hasNormalized && q.hasRollups && q.hasStringSummary && q.normalizedStrings > 0;
}

export function deriveArrayNumberFromRow(row: any): number | null {
  if (typeof row.arrayNumber === 'number' && row.arrayNumber >= 1 && row.arrayNumber <= 8) {
    return row.arrayNumber;
  }
  if (typeof row.arrayIndex === 'number' && row.arrayIndex >= 1 && row.arrayIndex <= 8) {
    return row.arrayIndex;
  }
  const idStr = row.id || row.stringKey || "";
  if (typeof idStr === 'string' && idStr.length > 0) {
    const match = idStr.match(/^A([1-8])[-_]/i) || idStr.match(/Array[-_ ]*([1-8])/i);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  return null;
}

export function hasArrayZeroFallback(snapshot: any): boolean {
  const summary = snapshot?.rollups?.arraySummary || snapshot?.arrays || [];
  if (
    summary.length === 1 &&
    (summary[0]?.arrayIndex === 0 || summary[0]?.arrayNumber === 0 || summary[0]?.friendlyString === "Array 0") &&
    (summary[0]?.stringCount || 0) >= 100 &&
    summary[0]?.sourcePath === "synthesized"
  ) {
    return true;
  }
  return false;
}

export function isValidArraySummary(rows: any[]): boolean {
  return Array.isArray(rows)
    && rows.length > 0
    && rows.some(row => {
      const n = Number(row.arrayNumber ?? row.arrayIndex);
      return n >= 1 && n <= 8;
    })
    && !(
      rows.length === 1 &&
      Number(rows[0].arrayNumber ?? rows[0].arrayIndex) === 0
    );
}

export function shouldRepairArraySummary(snapshot: any): boolean {
  const rows = snapshot?.rollups?.arraySummary || snapshot?.arraySummary || snapshot?.normalized?.arrays || [];
  const strings = snapshot?.normalized?.strings || [];
  if (!strings.length) return false;
  if (!Array.isArray(rows) || rows.length === 0) return true;
  if (!isValidArraySummary(rows)) return true;
  return false;
}

export function repairArraySummaryFromNormalizedStrings(snapshot: any): boolean {
  if (!snapshot) return false;
  
  const arraySummary = snapshot.rollups?.arraySummary || snapshot.arraySummary || snapshot.normalized?.arrays || [];
  const strings = snapshot.normalized?.strings || [];
  
  if (!shouldRepairArraySummary(snapshot)) {
    if (!snapshot.debug) {
      snapshot.debug = {};
    }
    snapshot.debug.arraySummaryRepair = {
      used: false,
      reason: strings.length === 0 ? "no normalized strings available" : "valid native array summary present"
    };
    return false;
  }
  
  // Detect invalid Array 0 fallback
  const isInvalidArrayZero = 
    arraySummary.length === 1 &&
    (arraySummary[0]?.arrayIndex === 0 || arraySummary[0]?.arrayNumber === 0 || arraySummary[0]?.friendlyString === "Array 0") &&
    (arraySummary[0]?.stringCount || 0) >= 100 &&
    arraySummary[0]?.sourcePath === "synthesized";
    
  const reason = isInvalidArrayZero 
    ? "replaced invalid synthesized Array 0 fallback" 
    : "rollups.arraySummary was empty or invalid; rebuilt from normalized.strings";
  
  const stringsByArray: Record<number, any[]> = {};
  for (let i = 1; i <= 8; i++) {
    stringsByArray[i] = [];
  }
  
  let unknownArrayRows = 0;
  const derivedArrayCounts: Record<number, number> = {};
  
  for (const str of strings) {
    const arrNum = deriveArrayNumberFromRow(str);
    if (arrNum !== null && arrNum >= 1 && arrNum <= 8) {
      stringsByArray[arrNum].push(str);
      derivedArrayCounts[arrNum] = (derivedArrayCounts[arrNum] || 0) + 1;
      str.arrayNumber = arrNum;
    } else {
      unknownArrayRows++;
    }
  }
  
  const derivedCount = Object.keys(derivedArrayCounts).length;
  if (derivedCount === 0) {
    if (!snapshot.debug) {
      snapshot.debug = {};
    }
    snapshot.debug.arraySummaryRepair = {
      used: false,
      failed: true,
      reason: "unable to derive array numbers from normalized strings",
      normalizedStringCount: strings.length,
      unknownArrayRows
    };
    
    // Repair failed, clear the invalid Array 0 fallback if present
    if (isInvalidArrayZero) {
      if (snapshot.rollups) snapshot.rollups.arraySummary = [];
      if (snapshot.normalized) snapshot.normalized.arrays = [];
      snapshot.arraySummary = [];
    }
    return false;
  }
  
  const repairedArrays: any[] = [];
  
  const getNum = (val: any): number | null => {
    if (val === null || val === undefined) return null;
    const numVal = Number(val);
    return isNaN(numVal) ? null : numVal;
  };
  
  for (let arrNum = 1; arrNum <= 8; arrNum++) {
    const arrStrings = stringsByArray[arrNum];
    if (arrStrings.length === 0) {
      continue;
    }
    
    let onlineStringCount = 0;
    let nearlineStringCount = 0;
    let offlineStringCount = 0;
    let notCommunicationStringCount = 0;

    const onlineSOCs: number[] = [];
    const nearlineSOCs: number[] = [];
    const offlineSOCs: number[] = [];

    const onlineAvailableKWhs: number[] = [];
    const nearlineAvailableKWhs: number[] = [];
    const offlineAvailableKWhs: number[] = [];

    const powerkWs: number[] = [];
    const currentAmps: number[] = [];

    const minCellVoltages: number[] = [];
    const maxCellVoltages: number[] = [];
    const minCellTemps: number[] = [];
    const maxCellTemps: number[] = [];
    
    for (const str of arrStrings) {
      const bucket = str.bucket;
      let resolvedBucket = bucket;
      if (!resolvedBucket) {
        if (str.status === "online" || str.state === "online") resolvedBucket = "online";
        else if (str.status === "nearline" || str.state === "nearline") resolvedBucket = "nearline";
        else if (str.status === "offline" || str.state === "offline") resolvedBucket = "offline";
        else if (str.communicating === false || str.status === "notCommunicating") resolvedBucket = "notCommunicating";
        else resolvedBucket = "online";
      }

      const kw = getNum(str.kw) ?? getNum(str.powerKw) ?? getNum(str.powerkW);
      if (kw !== null) powerkWs.push(kw);

      const amps = getNum(str.amps) ?? getNum(str.currentA) ?? getNum(str.currentAmp);
      if (amps !== null) currentAmps.push(amps);

      const soc = getNum(str.socPct) ?? getNum(str.soc) ?? getNum(str.SOC);
      const kwh = getNum(str.kwh) ?? getNum(str.kWh) ?? getNum(str.availableKWh) ?? getNum(str.availableKwh);

      if (resolvedBucket === "online") {
        onlineStringCount++;
        if (soc !== null) onlineSOCs.push(soc);
        if (kwh !== null) onlineAvailableKWhs.push(kwh);
      } else if (resolvedBucket === "nearline") {
        nearlineStringCount++;
        if (soc !== null) nearlineSOCs.push(soc);
        if (kwh !== null) nearlineAvailableKWhs.push(kwh);
      } else if (resolvedBucket === "offline") {
        offlineStringCount++;
        if (soc !== null) offlineSOCs.push(soc);
        if (kwh !== null) offlineAvailableKWhs.push(kwh);
      } else {
        notCommunicationStringCount++;
      }

      const minCellV = getNum(str.minCellVoltage) ?? getNum(str.cellVoltageMin);
      if (minCellV !== null) minCellVoltages.push(minCellV);

      const maxCellV = getNum(str.maxCellVoltage) ?? getNum(str.cellVoltageMax);
      if (maxCellV !== null) maxCellVoltages.push(maxCellV);

      const minCellT = getNum(str.minCellTemperature) ?? getNum(str.cellTempMin);
      if (minCellT !== null) minCellTemps.push(minCellT);

      const maxCellT = getNum(str.maxCellTemperature) ?? getNum(str.cellTempMax);
      if (maxCellT !== null) maxCellTemps.push(maxCellT);
    }
    
    const avgOrNull = (vals: number[]) => vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    const sumOrNull = (vals: number[]) => vals.length > 0 ? vals.reduce((a, b) => a + b, 0) : null;
    const minOrNull = (vals: number[]) => vals.length > 0 ? Math.min(...vals) : null;
    const maxOrNull = (vals: number[]) => vals.length > 0 ? Math.max(...vals) : null;

    const measuredMinCellVoltage = minOrNull(minCellVoltages);
    const measuredMaxCellVoltage = maxOrNull(maxCellVoltages);
    const cellVoltageDelta = (measuredMaxCellVoltage !== null && measuredMinCellVoltage !== null)
      ? Number((measuredMaxCellVoltage - measuredMinCellVoltage).toFixed(3))
      : null;

    const measuredMinCellTemperature = minOrNull(minCellTemps);
    const measuredMaxCellTemperature = maxOrNull(maxCellTemps);
    const cellTemperatureDelta = (measuredMaxCellTemperature !== null && measuredMinCellTemperature !== null)
      ? Number((measuredMaxCellTemperature - measuredMinCellTemperature).toFixed(1))
      : null;

    const communicating = notCommunicationStringCount < arrStrings.length || arrStrings.length === 0;

    const station = snapshot.siteIdentity?.stationCode;
    const block = snapshot.siteIdentity?.blockIndex;
    const friendlyString = (station && block !== undefined && block !== null)
      ? `Array ${station}:${block}:${arrNum}`
      : `Array ${arrNum}`;

    repairedArrays.push({
      arrayIndex: arrNum,
      arrayNumber: arrNum,
      communicating,
      stringCount: arrStrings.length,
      onlineStringCount,
      nearlineStringCount,
      offlineStringCount,
      notCommunicationStringCount,
      onlineSOC: avgOrNull(onlineSOCs),
      nearlineSOC: avgOrNull(nearlineSOCs),
      offlineSOC: avgOrNull(offlineSOCs),
      onlineAvailableKWh: sumOrNull(onlineAvailableKWhs),
      nearlineAvailableKWh: sumOrNull(nearlineAvailableKWhs),
      offlineAvailableKWh: sumOrNull(offlineAvailableKWhs),
      powerkW: sumOrNull(powerkWs),
      currentAmp: sumOrNull(currentAmps),
      measuredkW: sumOrNull(powerkWs),
      commandedkW: null,
      measuredMinCellVoltage,
      measuredMaxCellVoltage,
      cellVoltageDelta,
      measuredMinCellTemperature,
      measuredMaxCellTemperature,
      cellTemperatureDelta,
      friendlyString,
      sourcePath: "repaired-from-normalized-strings",
      raw: {
        strings: arrStrings,
        onlineSOCs,
        nearlineSOCs,
        offlineSOCs,
        powerkWs,
        currentAmps
      }
    });
  }
  
  repairedArrays.sort((a, b) => a.arrayIndex - b.arrayIndex);
  
  if (!snapshot.rollups) {
    snapshot.rollups = {};
  }
  snapshot.rollups.arraySummary = repairedArrays;
  
  if (!snapshot.normalized) {
    snapshot.normalized = {};
  }
  snapshot.normalized.arrays = repairedArrays;
  snapshot.arraySummary = repairedArrays;
  
  if (!snapshot.debug) {
    snapshot.debug = {};
  }
  
  snapshot.debug.arraySummaryRepair = {
    used: true,
    reason,
    inputArraySummary: {
      length: arraySummary.length,
      firstRow: arraySummary[0] ? {
        arrayIndex: arraySummary[0].arrayIndex,
        friendlyString: arraySummary[0].friendlyString,
        sourcePath: arraySummary[0].sourcePath,
        stringCount: arraySummary[0].stringCount
      } : null
    },
    normalizedStringCount: strings.length,
    derivedArrayCounts,
    emittedArrayCount: repairedArrays.length,
    unknownArrayRows
  };
  
  // Clean liveStatus warnings
  if (snapshot.liveStatus && Array.isArray(snapshot.liveStatus.warnings)) {
    snapshot.liveStatus.warnings = snapshot.liveStatus.warnings.filter(
      (w: string) => w !== "Array grouping is warming up or unavailable. No valid arrays (1-8) mapped."
    );
  }
  
  return true;
}

export function repairFinalArraySummary(snapshot: any, previousSnapshot?: any): boolean {
  return repairArraySummaryFromNormalizedStrings(snapshot);
}

export function finiteNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeSocPercent(value: any): number | null {
  const n = finiteNumber(value);
  if (n === null) return null;
  if (n >= 0 && n <= 1) return n * 100;
  if (n >= 0 && n <= 100) return n;
  return null;
}

export function readSocPct(row: any): number | null {
  if (!row) return null;
  const val = row.socPct ?? row.soc ?? row.SOC ?? row.stateOfCharge ?? row.stateOfChargePct ?? row.onlineSOC ?? row.raw?.socPct ?? row.raw?.soc ?? row.raw?.SOC;
  if (val !== undefined && val !== null) {
      const res = normalizeSocPercent(val);
      if (res !== null) return res;
  }
  if (Array.isArray(row.socs) && row.socs.length > 0) {
      const res = normalizeSocPercent(row.socs[0]);
      if (res !== null) return res;
  }
  return null;
}

export function readStoredKWh(row: any): number | null {
  if (!row) return null;
  const val = row.kwh ?? row.kWh ?? row.availableKWh ?? row.availableKwh ?? row.storedKWh ?? row.energyKWh ?? row.socKwh ?? row.socKWh ?? row.raw?.kwh ?? row.raw?.kWh ?? row.raw?.availableKWh ?? row.raw?.storedKWh;
  const n = finiteNumber(val);
  if (n !== null && n >= 0) return n;
  return null;
}

export function resolveStringBucket(row: any): string {
  if (!row) return "online";
  
  if (row.bucket && ["online", "nearline", "offline", "notCommunicating"].includes(row.bucket)) {
    return row.bucket;
  }
  
  if (row.communicating === false) return "notCommunicating";
  
  const status = String(row.status || row.state || "").toLowerCase();
  if (status.includes("nearline")) return "nearline";
  if (status.includes("offline")) return "offline";
  if (status.includes("not") && status.includes("communicat")) return "notCommunicating";
  if (status.includes("online")) return "online";
  
  return row.communicating !== false ? "online" : "notCommunicating";
}

function average(vals: number[]): number | null {
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function sum(vals: number[]): number | null {
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0);
}

export function repairFinalFleetRollupsFromStringsAndArrays(snapshot: any): boolean {
  if (!snapshot) return false;
  if (!snapshot.debug) snapshot.debug = {};
  
  const strings = snapshot.normalized?.strings || [];
  
  if (!strings.length) {
    snapshot.debug.fleetRollupRepair = {
      used: false,
      reason: "no normalized strings available",
      inputStringCount: 0
    };
    return false;
  }
  
  if (!snapshot.rollups) snapshot.rollups = {};
  if (!snapshot.rollups.stringSummary) snapshot.rollups.stringSummary = {};
  if (!snapshot.rollups.stringSummary.rollups) snapshot.rollups.stringSummary.rollups = {};
  if (!snapshot.rollups.bessFleetSummary) snapshot.rollups.bessFleetSummary = {};
  if (!snapshot.rollups.fleetCapacity) snapshot.rollups.fleetCapacity = {};

  const totalStrings = strings.length;
  let onlineStrings = 0;
  let nearlineStrings = 0;
  let offlineStrings = 0;
  let notCommunicatingStrings = 0;
  
  const fleetSocValues: number[] = [];
  const onlineSocValues: number[] = [];
  const nearlineSocValues: number[] = [];
  const offlineSocValues: number[] = [];
  const notCommunicatingSocValues: number[] = [];
  
  const onlineStoredKWhs: number[] = [];
  const nearlineStoredKWhs: number[] = [];
  const offlineStoredKWhs: number[] = [];
  const notCommunicatingStoredKWhs: number[] = [];
  
  const perArray = new Map<number, any>();
  
  for (const row of strings) {
    const arrNum = deriveArrayNumberFromRow(row);
    const bucket = resolveStringBucket(row);
    const soc = readSocPct(row);
    const kwh = readStoredKWh(row);
    
    if (bucket === "online") onlineStrings++;
    else if (bucket === "nearline") nearlineStrings++;
    else if (bucket === "offline") offlineStrings++;
    else if (bucket === "notCommunicating") notCommunicatingStrings++;
    
    if (arrNum !== null) {
      if (!perArray.has(arrNum)) {
        perArray.set(arrNum, {
          stringCount: 0,
          onlineStringCount: 0,
          nearlineStringCount: 0,
          offlineStringCount: 0,
          notCommunicationStringCount: 0,
          onlineSocs: [],
          nearlineSocs: [],
          offlineSocs: [],
          onlineKwhs: [],
          nearlineKwhs: [],
          offlineKwhs: [],
          powerkW: 0,
          currentAmp: 0
        });
      }
      const agg = perArray.get(arrNum);
      agg.stringCount++;
      if (bucket === "online") agg.onlineStringCount++;
      else if (bucket === "nearline") agg.nearlineStringCount++;
      else if (bucket === "offline") agg.offlineStringCount++;
      else if (bucket === "notCommunicating") agg.notCommunicationStringCount++;
      
      if (soc !== null) {
        if (bucket === "online") agg.onlineSocs.push(soc);
        else if (bucket === "nearline") agg.nearlineSocs.push(soc);
        else if (bucket === "offline") agg.offlineSocs.push(soc);
      }
      
      if (kwh !== null) {
        if (bucket === "online") agg.onlineKwhs.push(kwh);
        else if (bucket === "nearline") agg.nearlineKwhs.push(kwh);
        else if (bucket === "offline") agg.offlineKwhs.push(kwh);
      }
      
      const kw = finiteNumber(row.kw) ?? finiteNumber(row.powerKw) ?? finiteNumber(row.powerkW);
      if (kw !== null) agg.powerkW += kw;
      
      const amps = finiteNumber(row.amps) ?? finiteNumber(row.currentA) ?? finiteNumber(row.currentAmp);
      if (amps !== null) agg.currentAmp += amps;
    }
    
    if (soc !== null) {
      fleetSocValues.push(soc);
      if (bucket === "online") onlineSocValues.push(soc);
      else if (bucket === "nearline") nearlineSocValues.push(soc);
      else if (bucket === "offline") offlineSocValues.push(soc);
      else if (bucket === "notCommunicating") notCommunicatingSocValues.push(soc);
    }
    
    if (kwh !== null) {
      if (bucket === "online") onlineStoredKWhs.push(kwh);
      else if (bucket === "nearline") nearlineStoredKWhs.push(kwh);
      else if (bucket === "offline") offlineStoredKWhs.push(kwh);
      else if (bucket === "notCommunicating") notCommunicatingStoredKWhs.push(kwh);
    }
  }
  
  const fleetSocPct = average(fleetSocValues);
  const onlineSocPct = average(onlineSocValues);
  const nearlineSocPct = average(nearlineSocValues);
  const offlineSocPct = average(offlineSocValues);
  const notCommunicatingSocPct = average(notCommunicatingSocValues);
  
  const onlineStoredKWh = sum(onlineStoredKWhs);
  const nearlineStoredKWh = sum(nearlineStoredKWhs);
  const offlineStoredKWh = sum(offlineStoredKWhs);
  const notCommunicatingStoredKWh = sum(notCommunicatingStoredKWhs);
  
  let availableStoredKWh: number | null = null;
  if (onlineStoredKWh !== null || nearlineStoredKWh !== null) {
    availableStoredKWh = (onlineStoredKWh || 0) + (nearlineStoredKWh || 0);
  }

  // PART 3 - Fleet SOC write targets
  if (fleetSocPct !== null) {
    snapshot.rollups.bessFleetSummary.systemSocPct = fleetSocPct;
    snapshot.rollups.stringSummary.rollups.averageSoc = fleetSocPct;
    snapshot.rollups.stringSummary.rollups.socPctAvg = fleetSocPct;
  }
  
  if (onlineSocPct !== null) {
    if (!snapshot.rollups.stringSummary.rollups.online) snapshot.rollups.stringSummary.rollups.online = {};
    snapshot.rollups.stringSummary.rollups.online.socPctAvg = onlineSocPct;
    snapshot.rollups.stringSummary.rollups.onlineSocPctAvg = onlineSocPct;
  }
  
  if (nearlineSocPct !== null) snapshot.rollups.stringSummary.rollups.nearlineSocPctAvg = nearlineSocPct;
  if (offlineSocPct !== null) snapshot.rollups.stringSummary.rollups.offlineSocPctAvg = offlineSocPct;

  // PART 4 - Fleet kWh / capacity write targets
  snapshot.rollups.fleetCapacity.onlineStoredKWh = onlineStoredKWh;
  snapshot.rollups.fleetCapacity.nearlineStoredKWh = nearlineStoredKWh;
  snapshot.rollups.fleetCapacity.offlineStoredKWh = offlineStoredKWh;
  snapshot.rollups.fleetCapacity.notCommunicatingStoredKWh = notCommunicatingStoredKWh;
  snapshot.rollups.fleetCapacity.availableStoredKWh = availableStoredKWh;
  
  // Calculate installed capacity based on profile
  const activeProfile = ProfileStore.getActiveProfile();
  const capacityProfile = activeProfile?.capacityProfile || {
    energySegmentCapacityKWh: 750,
    stringsPerEnergySegment: 2
  };
  
  const esCapacity = capacityProfile.energySegmentCapacityKWh || 750;
  const stringsPerES = capacityProfile.stringsPerEnergySegment || 2;
  
  // Default installed capacity calculation
  const esCount = Math.floor(totalStrings / stringsPerES);
  const installedMWh = esCount * esCapacity;
  
  // Only set if not already defined from EMS
  if (snapshot.rollups.fleetCapacity.installedCapacityKWh == null) {
    snapshot.rollups.fleetCapacity.installedCapacityKWh = installedMWh;
    snapshot.debug.capacityProfile = {
       used: true,
       source: activeProfile?.capacityProfile ? "activeProfile" : "defaultFallback",
       energySegmentCapacityKWh: esCapacity,
       stringsPerEnergySegment: stringsPerES,
       esCount
    };
  }

  snapshot.rollups.stringSummary.rollups.fleetCapacity = {
    ...snapshot.rollups.stringSummary.rollups.fleetCapacity,
    onlineStoredKWh,
    nearlineStoredKWh,
    offlineStoredKWh,
    notCommunicatingStoredKWh,
    availableStoredKWh,
    installedCapacityKWh: snapshot.rollups.fleetCapacity.installedCapacityKWh
  };
  
  snapshot.rollups.fleetCapacity.source = {
    ...(snapshot.rollups.fleetCapacity.source || {}),
    storedEnergy: "normalized.strings.kwh",
    fleetSoc: "normalized.strings.socPct",
    canonicalRollup: "prizmDataCoordinator.finalFleetRollupRepair"
  };

  // PART 5 - Canonical string counters
  snapshot.rollups.stringSummary.rollups.totalStrings = totalStrings;
  
  if (typeof snapshot.rollups.stringSummary.rollups.online === "object") {
    snapshot.rollups.stringSummary.rollups.online.count = onlineStrings;
  } else {
    snapshot.rollups.stringSummary.rollups.online = { count: onlineStrings };
  }
  
  if (typeof snapshot.rollups.stringSummary.rollups.nearline === "object") {
    snapshot.rollups.stringSummary.rollups.nearline.count = nearlineStrings;
  } else {
    snapshot.rollups.stringSummary.rollups.nearline = { count: nearlineStrings };
  }
  
  if (typeof snapshot.rollups.stringSummary.rollups.offline === "object") {
    snapshot.rollups.stringSummary.rollups.offline.count = offlineStrings;
  } else {
    snapshot.rollups.stringSummary.rollups.offline = offlineStrings;
  }
  
  if (typeof snapshot.rollups.stringSummary.rollups.notCommunicating === "object") {
    snapshot.rollups.stringSummary.rollups.notCommunicating.count = notCommunicatingStrings;
  } else {
    snapshot.rollups.stringSummary.rollups.notCommunicating = { count: notCommunicatingStrings };
  }
  
  snapshot.rollups.stringSummary.rollups.normal = onlineStrings;
  snapshot.rollups.stringSummary.rollups.onlineCount = onlineStrings;
  snapshot.rollups.stringSummary.rollups.nearlineCount = nearlineStrings;
  snapshot.rollups.stringSummary.rollups.offlineCount = offlineStrings;
  snapshot.rollups.stringSummary.rollups.notCommunicatingCount = notCommunicatingStrings;

  // PART 6 - Canonical BESS fleet summary
  snapshot.rollups.bessFleetSummary.totalStrings = totalStrings;
  snapshot.rollups.bessFleetSummary.onlineStrings = onlineStrings;
  snapshot.rollups.bessFleetSummary.nearlineStrings = nearlineStrings;
  snapshot.rollups.bessFleetSummary.offlineStrings = offlineStrings;
  snapshot.rollups.bessFleetSummary.notCommunicatingStrings = notCommunicatingStrings;
  if (fleetSocPct !== null) snapshot.rollups.bessFleetSummary.systemSocPct = fleetSocPct;

  // PART 7 - Per-array consistency
  const applyToArray = (arr: any) => {
    const num = arr.arrayNumber ?? arr.arrayIndex;
    if (num && perArray.has(num)) {
      const agg = perArray.get(num);
      arr.stringCount = agg.stringCount;
      arr.onlineStringCount = agg.onlineStringCount;
      arr.nearlineStringCount = agg.nearlineStringCount;
      arr.offlineStringCount = agg.offlineStringCount;
      arr.notCommunicationStringCount = agg.notCommunicationStringCount;
      
      const onSoc = average(agg.onlineSocs);
      if (onSoc !== null) arr.onlineSOC = onSoc;
      const nearSoc = average(agg.nearlineSocs);
      if (nearSoc !== null) arr.nearlineSOC = nearSoc;
      const offSoc = average(agg.offlineSocs);
      if (offSoc !== null) arr.offlineSOC = offSoc;
      
      const onKwh = sum(agg.onlineKwhs);
      if (onKwh !== null) arr.onlineAvailableKWh = onKwh;
      const nearKwh = sum(agg.nearlineKwhs);
      if (nearKwh !== null) arr.nearlineAvailableKWh = nearKwh;
      const offKwh = sum(agg.offlineKwhs);
      if (offKwh !== null) arr.offlineAvailableKWh = offKwh;
      
      if (!finiteNumber(arr.powerkW)) arr.powerkW = agg.powerkW;
      if (!finiteNumber(arr.currentAmp)) arr.currentAmp = agg.currentAmp;
    }
  };
  
  if (Array.isArray(snapshot.rollups.arraySummary)) {
    snapshot.rollups.arraySummary.forEach(applyToArray);
  }
  if (Array.isArray(snapshot.normalized?.arrays)) {
    snapshot.normalized.arrays.forEach(applyToArray);
  }

  // PART 8 - Debug output
  const perArraySocCounts: Record<string, number> = {};
  const perArrayKwhCounts: Record<string, number> = {};
  
  perArray.forEach((agg, arrNum) => {
    perArraySocCounts[arrNum.toString()] = agg.onlineSocs.length + agg.nearlineSocs.length + agg.offlineSocs.length;
    perArrayKwhCounts[arrNum.toString()] = agg.onlineKwhs.length + agg.nearlineKwhs.length + agg.offlineKwhs.length;
  });

  if (fleetSocValues.length === 0 && onlineStoredKWhs.length === 0 && nearlineStoredKWhs.length === 0 && offlineStoredKWhs.length === 0) {
    snapshot.debug.fleetRollupRepair = {
      used: false,
      reason: "no valid SOC or kWh fields in normalized strings",
      inputStringCount: totalStrings,
      validSocCount: 0,
      validKwhCount: 0
    };
  } else {
    snapshot.debug.fleetRollupRepair = {
      used: true,
      source: "normalized.strings + repaired arraySummary",
      inputStringCount: totalStrings,
      validSocCount: fleetSocValues.length,
      validKwhCount: onlineStoredKWhs.length + nearlineStoredKWhs.length + offlineStoredKWhs.length + notCommunicatingStoredKWhs.length,
      fleetSocPct,
      counts: {
        totalStrings,
        onlineStrings,
        nearlineStrings,
        offlineStrings,
        notCommunicatingStrings
      },
      storedKWh: {
        onlineStoredKWh,
        nearlineStoredKWh,
        offlineStoredKWh,
        notCommunicatingStoredKWh,
        availableStoredKWh
      },
      perArraySocCounts,
      perArrayKwhCounts
    };
  }

  return true;
}

function isDegradedComparedToPrevious(next: any, previous: any): { degraded: boolean; reason: string; previousQuality: any; nextQuality: any } {
  const previousQuality = getSnapshotQuality(previous);
  const nextQuality = getSnapshotQuality(next);

  if (hasArrayZeroFallback(next)) {
    return { degraded: true, reason: "Rejected synthesized Array 0 fallback; preserving last-known-good array summary.", previousQuality, nextQuality };
  }

  if (!previous || !isRenderableSnapshot(previous)) {
    return { degraded: false, reason: "no previous renderable snapshot", previousQuality, nextQuality };
  }

  if (!isRenderableSnapshot(next)) {
    return { degraded: true, reason: "next snapshot is not renderable", previousQuality, nextQuality };
  }

  if (previousQuality.normalizedStrings >= 100 && nextQuality.normalizedStrings < previousQuality.normalizedStrings * 0.5) {
    return { degraded: true, reason: "normalized string count collapsed", previousQuality, nextQuality };
  }

  if (previousQuality.stringSummaryRows >= 100 && nextQuality.stringSummaryRows < previousQuality.stringSummaryRows * 0.5) {
    return { degraded: true, reason: "string summary rows collapsed", previousQuality, nextQuality };
  }

  if (previousQuality.arrayDetailStringTotal > 0 && nextQuality.arrayDetailStringTotal === 0) {
    return { degraded: true, reason: "array detail strings collapsed to zero", previousQuality, nextQuality };
  }

  if (previousQuality.arraySummaryRows > 0 && nextQuality.arraySummaryRows === 0) {
    return { degraded: true, reason: "array summary rows collapsed to zero", previousQuality, nextQuality };
  }

  return { degraded: false, reason: "snapshot accepted", previousQuality, nextQuality };
}

let centralSnapshot: PrizmSiteSnapshot | null = null;
const coordinatorStartedAt = new Date().toISOString();
let lastPollStartedAt: string | null = null;
let lastPollFinishedAt: string | null = null;
let lastPollDurationMs: number | null = null;

let isPolling = false;
let pollingInterval: NodeJS.Timeout | null = null;
let featherInterval: NodeJS.Timeout | null = null;

async function doBackgroundPoll() {
  if (isPolling) return;
  isPolling = true;
  lastPollStartedAt = new Date().toISOString();
  const startTime = Date.now();
  let latestError = null;
  try {
      await pollEmsTurtle();
  } catch (err: any) {
      latestError = err;
      console.error("[Data Coordinator] EMS Turtle poll failed", err.message);
  }
  
  try {
      console.time("buildSiteOperationsSummaryFromCache");
      // 2. We use the existing siteOperations logic to build everything
      const parsed = await buildSiteOperationsSummaryFromCache();
      console.timeEnd("buildSiteOperationsSummaryFromCache");
      
      const connStatus = getEmsConnectionStatus();
      
      let state: "LIVE" | "PARTIAL" | "CACHED" | "OFFLINE" = "OFFLINE";
      if (!latestError && connStatus.source === "live") state = "LIVE";
      else if (!latestError && connStatus.source === "partial") state = "PARTIAL";
      else if (connStatus.source === "cached") state = "CACHED";

      let sourceOk = true;
      if (state === "OFFLINE" || latestError) sourceOk = false;
      
      const rawConn = getEmsConnectionStatus();
      const stNow = Date.now();
      const updatedTime = rawConn.lastUpdated ? new Date(rawConn.lastUpdated).getTime() : stNow;
      const capturedAt = rawConn.lastUpdated || new Date().toISOString();

      let featherCellTempExcludedCollectionSegments = 0;
      const featherNodes = parsed.featherSummary?.devices || [];
      featherNodes.forEach((f: any) => {
         const ip = String(f.deviceIp || f.ip || "");
         if (ip.endsWith('.3')) {
            featherCellTempExcludedCollectionSegments++;
         }
      });

      // 1. Enrich PCS rows with explicit lineage metadata
      const enrichedPcsRows = (parsed.pcsSummary || []).map((p: any) => {
          const arrIdx = p.arrayIndex !== null && p.arrayIndex !== undefined ? Number(p.arrayIndex) : null;
          const pcsIdx = p.pcsIndex !== null && p.pcsIndex !== undefined ? Number(p.pcsIndex) : null;
          const rawKey = p.displayKey || p.rawKey || (arrIdx !== null && pcsIdx !== null ? `Array ${arrIdx} PCS ${pcsIdx}` : null);
          return {
              ...p,
              sourcePath: "blockviewer.data.arrays[].pcses[]",
              source: {
                  domain: "pcs",
                  sourceName: "blockviewer",
                  sourceEndpoint: "/tools/monitor/ems/blockviewer/data",
                  sourcePath: "data.arrays[].pcses[]",
                  arrayIndex: arrIdx,
                  pcsIndex: pcsIdx,
                  rawKey,
                  capturedAt
              }
          };
      });

      // 2. Poll and parse enriched HVAC segment device models
      const enrichedFeatherResult = await fetchEnrichedDevices().catch((err: any) => {
         console.warn("[Data Coordinator] Enriched feather device query failed, utilizing base cache:", err.message);
         return { devices: getFeatherCache().devices || [] };
      });

      const enrichedFeatherRows = (enrichedFeatherResult?.devices || []).map((d: any) => {
         const isCS = d.isCollectionSegment ?? (d.ip ? d.ip.endsWith('.3') : false);
         return {
            ...d,
            segmentName: getSegmentName({
                lineupId: d.lineupId,
                arrayIndex: d.arrayIndex,
                segmentId: d.stringIndex,
                ipAddress: d.ip,
                isCollectionSegment: isCS,
                enclosureName: d.displayKey || d.entityName || d.entityDescription || d.segmentLabel
            })
         };
      });

      // 3. Query safety firstresponder telemetry structure
      const sensorsData = await buildNormalizedResponderSummary(false).catch((err: any) => {
         console.error("[Data Coordinator] Site safety analysis execution failed:", err.message);
         return { rows: [], totalCentipedeLineups: 8, totalHealthyLineups: 8, totalFaultyLineups: 0 };
      });

      // Fetch UI-ready normalized string details
      const stringsResult = await buildNormalizedStringsData(false).catch((err: any) => {
         console.error("[Data Coordinator] Strings normalization fell back due to error:", err.message);
         return null;
      });

      // Normalization Stage 2 additions
      const rawPcsReports = getEmsCachedArrayPcsReports() || {};
      const normalizedPcs: any[] = [];
      const rawPcsKeys = Object.keys(rawPcsReports).sort((a,b) => Number(a) - Number(b));
      
      for (const arrKey of rawPcsKeys) {
        const arrNum = Number(arrKey);
        const pcsMap = rawPcsReports[arrKey] || {};
        const pcsKeys = Object.keys(pcsMap).sort((a,b) => Number(a) - Number(b));
        for (const pcsKey of pcsKeys) {
          const pcsNum = Number(pcsKey);
          const item = pcsMap[pcsKey];
          if (!item) continue;
          const response = item.data;
          const arrayPcsData = response?.arrayPcsData;

          const parseBoolean = (value: any): boolean | null => {
            if (value === true || value === "true" || value === 1 || value === "1") return true;
            if (value === false || value === "false" || value === 0 || value === "0") return false;
            return null;
          };

          const outRotation = parseBoolean(arrayPcsData?.outRotation);
          const inRotation = outRotation === null ? null : !outRotation;
          const rotationStatus = outRotation === null ? "UNKNOWN" : outRotation ? "OUT" : "IN";

          const phaseData = Array.isArray(arrayPcsData?.arrayPcsPhaseData) 
            ? arrayPcsData.arrayPcsPhaseData.map((ph: any) => ({
                phase: ph.arrayPcsPhase || "UNKNOWN",
                acCurrentAmp: ph.acCurrentAmp !== undefined ? Number(ph.acCurrentAmp) : null,
                acVoltageVolt: ph.acVoltageVolt !== undefined ? Number(ph.acVoltageVolt) : null,
                voltageMeasurementType: ph.arrayPcsPhaseVoltageMeasuremeantType || ph.voltageMeasurementType || null
              }))
            : [];

          normalizedPcs.push({
            id: `A${arrNum}-PCS${pcsNum}`,
            arrayNumber: arrNum,
            pcsNumber: pcsNum,
            state: arrayPcsData?.state !== undefined ? String(arrayPcsData.state) : null,
            isReady: arrayPcsData?.isReady !== undefined ? parseBoolean(arrayPcsData.isReady) : null,
            dcVoltageVolt: arrayPcsData?.dcVoltageVolt !== undefined ? Number(arrayPcsData.dcVoltageVolt) : null,
            dcCurrentAmp: arrayPcsData?.dcCurrentAmp !== undefined ? Number(arrayPcsData.dcCurrentAmp) : null,
            acCmdRealPowerKW: arrayPcsData?.acCmdRealPowerKW !== undefined ? Number(arrayPcsData.acCmdRealPowerKW) : null,
            acCmdReactivePowerKVAR: arrayPcsData?.acCmdReactivePowerKVAR !== undefined ? Number(arrayPcsData.acCmdReactivePowerKVAR) : null,
            acRealPowerSettingKW: arrayPcsData?.acRealPowerSettingKW !== undefined ? Number(arrayPcsData.acRealPowerSettingKW) : null,
            acReactivePowerSettingKVAR: arrayPcsData?.acReactivePowerSettingKVAR !== undefined ? Number(arrayPcsData.acReactivePowerSettingKVAR) : null,
            acRealPowerKW: arrayPcsData?.acRealPowerKW !== undefined ? Number(arrayPcsData.acRealPowerKW) : null,
            acReactivePowerKVAR: arrayPcsData?.acReactivePowerKVAR !== undefined ? Number(arrayPcsData.acReactivePowerKVAR) : null,
            acApparentPowerKVA: arrayPcsData?.acApparentPowerKVA !== undefined ? Number(arrayPcsData.acApparentPowerKVA) : null,
            acFrequencyHz: arrayPcsData?.acFrequencyHz !== undefined ? Number(arrayPcsData.acFrequencyHz) : null,
            phaseData,
            eventVendor1: arrayPcsData?.eventVendor1 !== undefined ? Number(arrayPcsData.eventVendor1) : null,
            eventVendor2: arrayPcsData?.eventVendor2 !== undefined ? Number(arrayPcsData.eventVendor2) : null,
            eventVendor3: arrayPcsData?.eventVendor3 !== undefined ? Number(arrayPcsData.eventVendor3) : null,
            eventVendor4: arrayPcsData?.eventVendor4 !== undefined ? Number(arrayPcsData.eventVendor4) : null,
            outRotation,
            inRotation,
            rotationStatus,
            timestamp: response?.timeStamp || null,
            sourceOk: item.ok,
            sourceEndpoint: item.endpoint,
            raw: response
          });
        }
      }

      // Arrays normalization Stage 2
      const rawArrayReports = getEmsCachedArrayReports() || {};
      const arrayDetailsByArray: Record<string, any> = {};
      const preferNonNull = (val1: any, val2: any) => {
        return (val1 !== null && val1 !== undefined) ? val1 : val2;
      };
      
      for (let arrNum = 1; arrNum <= 8; arrNum++) {
        const arrKey = String(arrNum);
        const item = rawArrayReports[arrKey];
        const response = item?.data;
        const condCellRep = response?.cellGroupReportForArray?.condensedCellReportForString || {};

        const strings: any[] = [];
        const richStringsForArray = (stringsResult?.strings || []).filter((s: any) => s.arrayNumber === arrNum);

        if (richStringsForArray.length > 0) {
          for (const rs of richStringsForArray) {
            const strNum = rs.stringNumber;
            const sKey = Object.keys(condCellRep).find(k => Number(condCellRep[k]?.stringIndex || k) === strNum);
            const sData = sKey ? condCellRep[sKey] : null;

            if (sData) {
              const mv = Array.isArray(sData.millivolts) ? sData.millivolts.map(Number) : [];
              const temps = Array.isArray(sData.temperatures) ? sData.temperatures.map(Number) : [];

              const cellVoltageMin = mv.length ? Math.min(...mv) : null;
              const cellVoltageMax = mv.length ? Math.max(...mv) : null;
              const cellVoltageAvg = mv.length ? mv.reduce((sum, val) => sum + val, 0) / mv.length : null;
              const cellVoltageDelta = (cellVoltageMin !== null && cellVoltageMax !== null) ? (cellVoltageMax - cellVoltageMin) : null;

              const cellTempMin = temps.length ? Math.min(...temps) : null;
              const cellTempMax = temps.length ? Math.max(...temps) : null;
              const cellTempAvg = temps.length ? temps.reduce((sum, val) => sum + val, 0) / temps.length : null;
              const cellTempDelta = (cellTempMin !== null && cellTempMax !== null) ? (cellTempMax - cellTempMin) : null;

              const ignoredTempSensorCount = Array.isArray(sData.ignoredTempSensors) ? sData.ignoredTempSensors.length : 0;
              const balancingStatusCount = Array.isArray(sData.cellGroupBalancingStatusPerBpIndexes) ? sData.cellGroupBalancingStatusPerBpIndexes.length : 0;
              const balancingSettingCount = Array.isArray(sData.cellGroupBalancingSettingPerBpIndexes) ? sData.cellGroupBalancingSettingPerBpIndexes.length : 0;

              const calculatedSocPct = (Array.isArray(sData.socs) && sData.socs.length > 0) ? Number(sData.socs[0]) : null;

              strings.push({
                ...rs,
                id: rs.id || `A${arrNum}-S${strNum}`,
                stringKey: rs.stringKey || `A${arrNum}-S${strNum}`,
                arrayNumber: arrNum,
                stringNumber: strNum,
                energySegmentNumber: preferNonNull(rs.energySegmentNumber, stringNumberToEnergySegment(strNum)),
                physicalStringNumber: preferNonNull(rs.physicalStringNumber, strNum),
                
                batteryPackCount: preferNonNull(rs.batteryPackCount, sData.batteryPackCount !== undefined ? Number(sData.batteryPackCount) : null),
                cellGroupPerBatteryPackCount: preferNonNull(rs.cellGroupPerBatteryPackCount, sData.cellGroupPerBatteryPackCount !== undefined ? Number(sData.cellGroupPerBatteryPackCount) : null),
                millivolts: mv.length ? mv : (rs.millivolts || []),
                temperatures: temps.length ? temps : (rs.temperatures || []),
                timestamps: Array.isArray(sData.timestamps) ? sData.timestamps.map(Number) : (rs.timestamps || []),
                socs: Array.isArray(sData.socs) ? sData.socs.map(Number) : (rs.socs || []),
                ignoredTempSensors: Array.isArray(sData.ignoredTempSensors) ? sData.ignoredTempSensors : (rs.ignoredTempSensors || []),
                balancingStatusPerBpIndexes: Array.isArray(sData.cellGroupBalancingStatusPerBpIndexes) ? sData.cellGroupBalancingStatusPerBpIndexes : (rs.balancingStatusPerBpIndexes || []),
                balancingSettingPerBpIndexes: Array.isArray(sData.cellGroupBalancingSettingPerBpIndexes) ? sData.cellGroupBalancingSettingPerBpIndexes : (rs.balancingSettingPerBpIndexes || []),
                
                cellVoltageMin: preferNonNull(rs.cellVoltageMin, cellVoltageMin),
                cellVoltageMax: preferNonNull(rs.cellVoltageMax, cellVoltageMax),
                cellVoltageAvg: preferNonNull(rs.cellVoltageAvg, cellVoltageAvg),
                cellVoltageDelta: preferNonNull(rs.cellVoltageDelta, cellVoltageDelta),
                
                cellTempMin: preferNonNull(rs.cellTempMin, cellTempMin),
                cellTempMax: preferNonNull(rs.cellTempMax, cellTempMax),
                cellTempAvg: preferNonNull(rs.cellTempAvg, cellTempAvg),
                cellTempDelta: preferNonNull(rs.cellTempDelta, cellTempDelta),
                
                staleCellGroupCount: preferNonNull(rs.staleCellGroupCount, null),
                ignoredTempSensorCount: preferNonNull(rs.ignoredTempSensorCount, ignoredTempSensorCount),
                balancingStatusCount: preferNonNull(rs.balancingStatusCount, balancingStatusCount),
                balancingSettingCount: preferNonNull(rs.balancingSettingCount, balancingSettingCount),
                socPct: preferNonNull(rs.socPct, calculatedSocPct)
              });
            } else {
              strings.push({
                ...rs,
                id: rs.id || `A${arrNum}-S${strNum}`,
                stringKey: rs.stringKey || `A${arrNum}-S${strNum}`,
                arrayNumber: arrNum,
                stringNumber: strNum,
                energySegmentNumber: preferNonNull(rs.energySegmentNumber, stringNumberToEnergySegment(strNum)),
                physicalStringNumber: preferNonNull(rs.physicalStringNumber, strNum),
                millivolts: rs.millivolts || [],
                temperatures: rs.temperatures || [],
                timestamps: rs.timestamps || [],
                socs: rs.socs || [],
                ignoredTempSensors: rs.ignoredTempSensors || [],
                balancingStatusPerBpIndexes: rs.balancingStatusPerBpIndexes || [],
                balancingSettingPerBpIndexes: rs.balancingSettingPerBpIndexes || [],
                cellVoltageMin: rs.cellVoltageMin ?? null,
                cellVoltageMax: rs.cellVoltageMax ?? null,
                cellVoltageAvg: rs.cellVoltageAvg ?? null,
                cellVoltageDelta: rs.cellVoltageDelta ?? null,
                cellTempMin: rs.cellTempMin ?? null,
                cellTempMax: rs.cellTempMax ?? null,
                cellTempAvg: rs.cellTempAvg ?? null,
                cellTempDelta: rs.cellTempDelta ?? null,
                ignoredTempSensorCount: rs.ignoredTempSensorCount ?? 0,
                balancingStatusCount: rs.balancingStatusCount ?? 0,
                balancingSettingCount: rs.balancingSettingCount ?? 0
              });
            }
          }
        } else {
          // No rich strings from stringsResult! Build from condensed report instead
          const strKeys = Object.keys(condCellRep).sort((a, b) => Number(a) - Number(b));
          for (const sKey of strKeys) {
            const sData = condCellRep[sKey];
            if (!sData) continue;
            const strNum = Number(sData.stringIndex || sKey);

            const mv = Array.isArray(sData.millivolts) ? sData.millivolts.map(Number) : [];
            const temps = Array.isArray(sData.temperatures) ? sData.temperatures.map(Number) : [];

            const cellVoltageMin = mv.length ? Math.min(...mv) : null;
            const cellVoltageMax = mv.length ? Math.max(...mv) : null;
            const cellVoltageAvg = mv.length ? mv.reduce((sum, val) => sum + val, 0) / mv.length : null;
            const cellVoltageDelta = (cellVoltageMin !== null && cellVoltageMax !== null) ? (cellVoltageMax - cellVoltageMin) : null;

            const cellTempMin = temps.length ? Math.min(...temps) : null;
            const cellTempMax = temps.length ? Math.max(...temps) : null;
            const cellTempAvg = temps.length ? temps.reduce((sum, val) => sum + val, 0) / temps.length : null;
            const cellTempDelta = (cellTempMin !== null && cellTempMax !== null) ? (cellTempMax - cellTempMin) : null;

            const ignoredTempSensorCount = Array.isArray(sData.ignoredTempSensors) ? sData.ignoredTempSensors.length : 0;
            const balancingStatusCount = Array.isArray(sData.cellGroupBalancingStatusPerBpIndexes) ? sData.cellGroupBalancingStatusPerBpIndexes.length : 0;
            const balancingSettingCount = Array.isArray(sData.cellGroupBalancingSettingPerBpIndexes) ? sData.cellGroupBalancingSettingPerBpIndexes.length : 0;

            const calculatedSocPct = (Array.isArray(sData.socs) && sData.socs.length > 0) ? Number(sData.socs[0]) : null;

            strings.push({
              id: `A${arrNum}-S${strNum}`,
              stringKey: `A${arrNum}-S${strNum}`,
              arrayNumber: arrNum,
              stringNumber: strNum,
              energySegmentNumber: stringNumberToEnergySegment(strNum),
              physicalStringNumber: strNum,
              batteryPackCount: sData.batteryPackCount !== undefined ? Number(sData.batteryPackCount) : null,
              cellGroupPerBatteryPackCount: sData.cellGroupPerBatteryPackCount !== undefined ? Number(sData.cellGroupPerBatteryPackCount) : null,
              millivolts: mv,
              temperatures: temps,
              timestamps: Array.isArray(sData.timestamps) ? sData.timestamps.map(Number) : [],
              socs: Array.isArray(sData.socs) ? sData.socs.map(Number) : [],
              ignoredTempSensors: Array.isArray(sData.ignoredTempSensors) ? sData.ignoredTempSensors : [],
              balancingStatusPerBpIndexes: Array.isArray(sData.cellGroupBalancingStatusPerBpIndexes) ? sData.cellGroupBalancingStatusPerBpIndexes : [],
              balancingSettingPerBpIndexes: Array.isArray(sData.cellGroupBalancingSettingPerBpIndexes) ? sData.cellGroupBalancingSettingPerBpIndexes : [],
              cellVoltageMin,
              cellVoltageMax,
              cellVoltageAvg,
              cellVoltageDelta,
              cellTempMin,
              cellTempMax,
              cellTempAvg,
              cellTempDelta,
              staleCellGroupCount: null,
              ignoredTempSensorCount,
              balancingStatusCount,
              balancingSettingCount,
              socPct: calculatedSocPct
            });
          }
        }

        // Calculate rollups
        const validMvMins = strings.map(s => s.cellVoltageMin).filter((v): v is number => v !== null);
        const validMvMaxs = strings.map(s => s.cellVoltageMax).filter((v): v is number => v !== null);
        const validMvAvgs = strings.map(s => s.cellVoltageAvg).filter((v): v is number => v !== null);

        const arrayMvMin = validMvMins.length ? Math.min(...validMvMins) : null;
        const arrayMvMax = validMvMaxs.length ? Math.max(...validMvMaxs) : null;
        const arrayMvAvg = validMvAvgs.length ? validMvAvgs.reduce((sum, val) => sum + val, 0) / validMvAvgs.length : null;
        const arrayMvDelta = (arrayMvMin !== null && arrayMvMax !== null) ? (arrayMvMax - arrayMvMin) : null;

        const validTempMins = strings.map(s => s.cellTempMin).filter((v): v is number => v !== null);
        const validTempMaxs = strings.map(s => s.cellTempMax).filter((v): v is number => v !== null);
        const validTempAvgs = strings.map(s => s.cellTempAvg).filter((v): v is number => v !== null);

        const arrayTempMin = validTempMins.length ? Math.min(...validTempMins) : null;
        const arrayTempMax = validTempMaxs.length ? Math.max(...validTempMaxs) : null;
        const arrayTempAvg = validTempAvgs.length ? validTempAvgs.reduce((sum, val) => sum + val, 0) / validTempAvgs.length : null;
        const arrayTempDelta = (arrayTempMin !== null && arrayTempMax !== null) ? (arrayTempMax - arrayTempMin) : null;

        const totalIgnored = strings.reduce((sum, s) => sum + s.ignoredTempSensorCount, 0);
        const totalBalStatus = strings.reduce((sum, s) => sum + s.balancingStatusCount, 0);
        const totalBalSetting = strings.reduce((sum, s) => sum + s.balancingSettingCount, 0);

        arrayDetailsByArray[arrNum] = {
          arrayNumber: arrNum,
          id: `A${arrNum}`,
          timestamp: response?.timeStamp || null,
          stringCount: strings.length,
          totalBatteryPackCount: strings.reduce((sum, s) => sum + (s.batteryPackCount || 0), 0) || null,
          cellGroupPerBatteryPackCount: strings[0]?.cellGroupPerBatteryPackCount || null,
          strings,
          rollups: {
            cellVoltageMin: arrayMvMin,
            cellVoltageMax: arrayMvMax,
            cellVoltageAvg: arrayMvAvg,
            cellVoltageDelta: arrayMvDelta,
            cellTempMin: arrayTempMin,
            cellTempMax: arrayTempMax,
            cellTempAvg: arrayTempAvg,
            cellTempDelta: arrayTempDelta,
            ignoredTempSensorCount: totalIgnored,
            balancingStatusCount: totalBalStatus,
            balancingSettingCount: totalBalSetting
          },
          sourceOk: item ? item.ok : false,
          sourceEndpoint: item ? item.endpoint : `/tools/report/ems/array/${arrNum}/report.json`,
          raw: response || null
        };
      }

      const pcsListToUse = normalizedPcs.length ? normalizedPcs : enrichedPcsRows;
      const readyPcs = pcsListToUse.filter((p: any) => p.isReady).length;
      const stoppedPcs = pcsListToUse.filter((p: any) => p.state === "Stop" || p.state === "STOP" || p.state === "stopped" || p.state === "Stopped").length;
      const faultedPcs = pcsListToUse.filter((p: any) => p.state === "Fault" || p.state === "FAULT" || p.state === "faulted" || p.state === "Faulted").length;
      const inRotation = pcsListToUse.filter((p: any) => p.rotationStatus === "IN").length;
      const outRotationCount = pcsListToUse.filter((p: any) => p.rotationStatus === "OUT").length;
      const unknownRotation = pcsListToUse.filter((p: any) => p.rotationStatus === "UNKNOWN").length;

      const pcsSummaryObj = {
        totalPcsCount: pcsListToUse.length,
        readyPcsCount: readyPcs,
        stoppedPcsCount: stoppedPcs,
        faultedPcsCount: faultedPcs,
        inRotationCount: inRotation,
        outRotationCount: outRotationCount,
        unrecognizedRotationCount: unknownRotation
      };

      const flatMergedStrings: any[] = [];
      for (let arrNum = 1; arrNum <= 8; arrNum++) {
          const arrD = arrayDetailsByArray[arrNum];
          if (arrD && Array.isArray(arrD.strings)) {
              flatMergedStrings.push(...arrD.strings);
          }
      }

      const newSnap: PrizmSiteSnapshot = {
          siteIdentity: {
              activeProfileId: rawConn.activeProfileId,
              activeProfileName: rawConn.activeProfileName,
              stationCode: parsed.stationCode,
              blockIndex: rawConn.blockIndex,
              emsBaseUrl: rawConn.activeEmsBaseUrl
          },
          liveStatus: {
              state,
              source: rawConn.source as any,
              liveAttempted: true,
              liveSucceeded: state === "LIVE" || state === "PARTIAL",
              stale: !!rawConn.staleData,
              cacheUsed: state === "CACHED",
              lastUpdated: rawConn.lastUpdated || new Date().toISOString(),
              ageMs: stNow - updatedTime,
              warnings: [],
              errors: []
          },
          rawSources: {
              block: getEmsCachedBlock().data,
              status: getEmsCachedStatus().data,
              lastCall: getEmsCachedLastCall().data,
              strings: getEmsCachedRawStrings().data || [],
              statusCodes: getEmsCachedStatusCodes().data,
              featherDevices: getFeatherCache().devices || [],
              emsApps: parsed.emsApps || [],
              arrayPcsReports: rawPcsReports,
              arrayReports: rawArrayReports,
              arrayNotifications: getEmsCachedArrayNotifications()
          },
          normalized: {
              strings: flatMergedStrings.length > 0 ? flatMergedStrings : (() => {
                  const isNonEmptyArray = (arr: any) => Array.isArray(arr) && arr.length > 0;
                  if (stringsResult && isNonEmptyArray(stringsResult.strings)) return stringsResult.strings;
                  const legacyStr = (parsed.stringSummary || {}) as any;
                  if (isNonEmptyArray(legacyStr.tableRows)) return legacyStr.tableRows;
                  if (isNonEmptyArray(legacyStr.strings)) return legacyStr.strings;
                  return [];
              })(),
              arrays: parsed.arraySummary || [],
              pcs: pcsListToUse,
              feather: enrichedFeatherRows,
              correctiveActions: parsed.correctiveActions || [],
              sensors: sensorsData.rows,
              arrayDetailsByArray
          },
          rollups: {
              stringSummary: (() => {
                  const legacyStringSummary = (parsed.stringSummary || {}) as any;
                  const isNonEmptyArray = (arr: any) => Array.isArray(arr) && arr.length > 0;
                  const isNonEmptyObject = (obj: any) => obj !== null && typeof obj === 'object' && Object.keys(obj).length > 0;
                  
                  return {
                      ...legacyStringSummary,
                      tableRows: flatMergedStrings.length > 0
                          ? flatMergedStrings
                          : (isNonEmptyArray(stringsResult?.strings)
                              ? stringsResult.strings
                              : (isNonEmptyArray(legacyStringSummary.tableRows)
                                  ? legacyStringSummary.tableRows
                                  : (isNonEmptyArray(legacyStringSummary.strings) ? legacyStringSummary.strings : []))),
                      rollups: {
                          ...(legacyStringSummary.rollups || {}),
                          ...(stringsResult?.rollups || {})
                      },
                      buckets: isNonEmptyObject(legacyStringSummary.buckets) && Object.values(legacyStringSummary.buckets).some(v => typeof v === 'number' && v > 0)
                          ? legacyStringSummary.buckets
                          : (isNonEmptyObject(stringsResult?.buckets) ? stringsResult.buckets : (legacyStringSummary.buckets || {})),
                      summary: {
                          ...(legacyStringSummary.summary || {}),
                          ...(stringsResult?.summary || {})
                      },
                      cards: {
                          ...(legacyStringSummary.cards || {}),
                          ...(stringsResult?.cards || {})
                      },
                      enhanced: stringsResult || undefined
                  };
              })(),
              arraySummary: parsed.arraySummary || [],
              pcsSummary: pcsSummaryObj,
              bessFleetSummary: parsed.bessFleetSummary || {},
              featherSummary: {
                 ...parsed.featherSummary,
                 devices: enrichedFeatherRows
              },
              sourceHealth: parsed.sourceHealth || [],
              sensorsSummary: {
                 totalRows: sensorsData.rows.length,
                 totalLineups: sensorsData.totalCentipedeLineups,
                 healthyLineups: sensorsData.totalHealthyLineups,
                 faultyLineups: sensorsData.totalFaultyLineups,
                 abnormalSegments: sensorsData.totalAbnormalSegments,
                 highTempSegments: sensorsData.totalHighTempSegments,
                 trippedSensors: sensorsData.totalTrippedSensors,
                 nonCommunicating: sensorsData.totalNonCommunicating,
                 sourcePrimary: "firstresponder_v1",
                 sourceSupplemental: "firstresponder_v2"
              }
          },
          debug: {
              coordinatorStartedAt,
              lastPollStartedAt,
              lastPollFinishedAt: new Date().toISOString(),
              lastPollDurationMs: Date.now() - startTime,
              normalizedStringRowCount: (parsed.stringSummary?.tableRows || []).length,
              arraySummarySource: parsed.debug?.arraySummarySource as any,
              correctiveActionsCount: (parsed.correctiveActions || []).length,
              featherCellTempExcludedCollectionSegments,
              errors: latestError ? [latestError.message] : [],
              arrayNotifications: (() => {
                  const arrNotifs = getEmsCachedArrayNotifications() || {};
                  const keys = Object.keys(arrNotifs);
                  const arraysPolled = keys.map(k => parseInt(k, 10));
                  let okCount = 0;
                  let failedCount = 0;
                  let notificationCount = 0;
                  let lastUpdated: string | null = null;
                  for (const entry of Object.values(arrNotifs) as any[]) {
                      if (entry.ok) {
                          okCount++;
                      } else {
                          failedCount++;
                      }
                      if (entry.data && Array.isArray(entry.data.notification)) {
                          notificationCount += entry.data.notification.length;
                      }
                      if (entry.lastUpdated) {
                          lastUpdated = entry.lastUpdated;
                      }
                  }
                  return {
                      arraysPolled,
                      okCount,
                      failedCount,
                      notificationCount,
                      lastUpdated
                  };
              })()
          }
      };

      // 2 & 3. Generate detailed source health rows & summary
      const healthRows = getSourceHealthRows(newSnap);
      const healthSummary = getSourceHealthSummary(healthRows);
      newSnap.rollups.sourceHealth = healthRows;
      (newSnap.rollups as any).sourceHealthSummary = healthSummary;
      (newSnap.rollups as any).topologyCounts = parsed.topologyCounts || {};
      (newSnap.rollups as any).safetySummary = parsed.safetySummary || {};

      // Part 1 & 4 & 5: Repair array summary
      const repairSuccess = repairFinalArraySummary(newSnap, centralSnapshot);
      if (repairSuccess) {
          if (newSnap.debug) {
              (newSnap.debug as any).arraySummarySource = "repaired-from-normalized-strings";
          }
      } else {
          if (hasArrayZeroFallback(newSnap)) {
              if (!newSnap.liveStatus.warnings.includes("Array grouping is warming up or unavailable. No valid arrays (1-8) mapped.")) {
                  newSnap.liveStatus.warnings.push("Array grouping is warming up or unavailable. No valid arrays (1-8) mapped.");
              }
          }
      }

      repairFinalFleetRollupsFromStringsAndArrays(newSnap);
      repairFinalCorrectiveActionsFromSnapshot(newSnap);

      let acceptSnapshot = true;
      let rejectionReason = "";
      if (centralSnapshot) {
          const { degraded, reason } = isDegradedComparedToPrevious(newSnap, centralSnapshot);
          if (degraded) {
              acceptSnapshot = false;
              rejectionReason = reason;
          }
      }

      if (acceptSnapshot) {
          centralSnapshot = newSnap;
          prizmCache.set('prizm-site-snapshot', centralSnapshot, { ttlMs: 15000 });
          if (prizmCache.writeTelemetryHistoryIfEnabled) prizmCache.writeTelemetryHistoryIfEnabled('prizm-site-snapshot', centralSnapshot);
      } else {
          console.warn(`[Data Coordinator] Rejected degraded snapshot. Reason: ${rejectionReason}`);
          if (centralSnapshot) {
              if (!centralSnapshot.liveStatus) {
                  centralSnapshot.liveStatus = {
                      state: "LIVE",
                      source: "live-ems",
                      liveAttempted: true,
                      liveSucceeded: true,
                      stale: true,
                      cacheUsed: false,
                      lastUpdated: new Date().toISOString(),
                      ageMs: 0,
                      warnings: [],
                      errors: []
                  };
              }
              const warnings = Array.isArray(centralSnapshot.liveStatus.warnings) ? centralSnapshot.liveStatus.warnings : [];
              if (!warnings.includes("Latest poll from EMS was degraded. Displaying last-known-good snapshot.")) {
                  warnings.push("Latest poll from EMS was degraded. Displaying last-known-good snapshot.");
              }
              centralSnapshot.liveStatus.warnings = warnings;
              centralSnapshot.liveStatus.stale = true;
              (centralSnapshot.liveStatus as any).lastAttemptedAt = new Date().toISOString();

              if (!centralSnapshot.debug) {
                  centralSnapshot.debug = {
                      coordinatorStartedAt,
                      lastPollStartedAt,
                      lastPollFinishedAt: new Date().toISOString(),
                      lastPollDurationMs: Date.now() - startTime,
                      normalizedStringRowCount: 0,
                      arraySummarySource: "native",
                      correctiveActionsCount: 0,
                      featherCellTempExcludedCollectionSegments: 0,
                      errors: []
                  };
              }
              (centralSnapshot.debug as any).snapshotRejected = true;
              (centralSnapshot.debug as any).snapshotRejectionReason = rejectionReason;
              
              prizmCache.set('prizm-site-snapshot', centralSnapshot, { ttlMs: 15000 });
          }
      }
      
      const emsCacheRaw = prizmCache.get('ems-turtle') as any;
      const featherCacheRaw = getFeatherCache();
      recordTelemetrySample(emsCacheRaw || {}, featherCacheRaw);

  } catch (err: any) {
      console.error("[Data Coordinator] Dashboard aggregation failed", err.message);
  } finally {
      lastPollFinishedAt = new Date().toISOString();
      lastPollDurationMs = Date.now() - startTime;
      isPolling = false;
  }
}

export function startCoordinator() {
    console.log("[Prizm Data Coordinator] Starting central data coordinator...");
    
    doBackgroundPoll(); // initial background poll
    
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(() => {
        doBackgroundPoll();
    }, 5000);

    if (featherInterval) clearInterval(featherInterval);
    featherInterval = setInterval(() => {
        refreshFeatherCache({ force: true }).catch(console.error);
    }, 15000); // 15 seconds feather refresh
}

export function stopCoordinator() {
    if (pollingInterval) clearInterval(pollingInterval);
    if (featherInterval) clearInterval(featherInterval);
}

export function getLatestSnapshot(): PrizmSiteSnapshot | null {
    return centralSnapshot;
}

export function getSnapshotOrNull(): PrizmSiteSnapshot | null {
    return centralSnapshot;
}

export function getSourceHealthRows(snap: any): any[] {
    const emsDebug = getEmsSourcesDebugInfo() || [];
    const fCache = getFeatherCache();
    
    // Helper to extract diagnostic debug info
    const getDbg = (endpoints: string[]) => {
        return emsDebug.find((d: any) => endpoints.includes(d.endpoint));
    };

    const buildRow = (
        name: string,
        sourceLabel: string,
        endpoints: string[],
        getRecordCount: () => number | null
    ) => {
        const dbg = getDbg(endpoints);
        if (!dbg) {
            return {
                name,
                ok: null,
                state: "unknown" as const,
                lastUpdated: null,
                ageMs: null,
                stale: null,
                recordCount: null,
                endpoint: endpoints[0] || null,
                sourceLabel,
                error: null
            };
        }

        const ok = dbg.success ?? null;
        const stale = dbg.stale ?? null;
        let state: "healthy" | "stale" | "failed" | "unknown" = "unknown";
        if (ok === false) {
            state = "failed";
        } else if (ok === true) {
            state = stale ? "stale" : "healthy";
        }

        const lastUpdated = dbg.lastSuccessAt || (ok ? snap?.liveStatus?.lastUpdated : null) || null;
        const ageMs = lastUpdated ? Math.max(0, Date.now() - new Date(lastUpdated).getTime()) : null;

        return {
            name,
            ok,
            state,
            lastUpdated,
            ageMs,
            stale,
            recordCount: getRecordCount(),
            endpoint: dbg.endpoint || null,
            sourceLabel,
            error: dbg.lastError && dbg.lastError !== "NONE" ? dbg.lastError : (ok ? null : "Endpoint unreachable")
        };
    };

    // 1. blockviewer
    const blockHealth = buildRow(
        "blockviewer",
        "Blockviewer Data Stream",
        ["/tools/monitor/ems/blockviewer/data"],
        () => snap?.normalized?.pcs?.length ?? 0
    );

    // 2. status
    const statusHealth = buildRow(
        "status",
        "Direct Status JSON Feed",
        ["/tools/report/ems/status.json", "/status"],
        () => snap?.normalized?.arrays?.length ?? 0
    );

    // 3. lastCall
    const lastCallHealth = buildRow(
        "lastCall",
        "LastCall Backup Stream",
        ["/tools/report/ems/lastCall.json"],
        () => null
    );

    // 4. strings
    const stringsHealth = buildRow(
        "strings",
        "Strings CSV Report",
        ["/tools/report/ems/strings.csv"],
        () => snap?.normalized?.strings?.length ?? 0
    );

    // 5. statusCodes
    const statusCodesHealth = buildRow(
        "statusCodes",
        "BESS Status Codes Definitions",
        ["/tools/report/ems/bessStatusCodes.json"],
        () => null
    );

    // 6. feather
    let featherHealth;
    const fOk = fCache ? fCache.success : false;
    const fStale = fCache ? fCache.isStale : true;
    let fState: "healthy" | "stale" | "failed" | "unknown" = "failed";
    if (fCache) {
        fState = fOk ? (fStale ? "stale" : "healthy") : "failed";
    } else {
        fState = "unknown";
    }
    const featherLastUpdated = (fCache && fCache.lastUpdatedAt) || (fOk ? snap?.liveStatus?.lastUpdated : null) || null;
    const featherAgeMs = featherLastUpdated ? Math.max(0, Date.now() - new Date(featherLastUpdated).getTime()) : null;
    featherHealth = {
        name: "feather",
        ok: fCache ? fOk : null,
        state: fState,
        lastUpdated: featherLastUpdated,
        ageMs: featherAgeMs,
        stale: fCache ? fStale : null,
        recordCount: snap?.normalized?.feather?.length ?? 0,
        endpoint: "/api/local/feather",
        sourceLabel: "Feather HVAC & Balance Clients",
        error: fOk ? null : ((fCache as any)?.error || "Feather cache connection offline")
    };

    // 7. emsApps
    let emsAppsHealth;
    const eaOk = lastCallHealth.ok;
    const eaStale = lastCallHealth.stale;
    let eaState: "healthy" | "stale" | "failed" | "unknown" = "unknown";
    if (eaOk === false) {
        eaState = "failed";
    } else if (eaOk === true) {
        eaState = eaStale ? "stale" : "healthy";
    }
    emsAppsHealth = {
        name: "emsApps",
        ok: eaOk,
        state: eaState,
        lastUpdated: lastCallHealth.lastUpdated,
        ageMs: lastCallHealth.ageMs,
        stale: eaStale,
        recordCount: snap?.rawSources?.emsApps?.length ?? 0,
        endpoint: "/tools/report/ems/lastCall.json -> emsApps",
        sourceLabel: "EMS Integrated Applications",
        error: lastCallHealth.error
    };

    const resultRows = [
        blockHealth,
        statusHealth,
        lastCallHealth,
        stringsHealth,
        statusCodesHealth,
        featherHealth,
        emsAppsHealth
    ];

    // Append individual array reports health rows
    const rawArrayReportsObj = snap?.rawSources?.arrayReports || {};
    const arrayKeys = Object.keys(rawArrayReportsObj).sort((a,b) => Number(a) - Number(b));
    for (const arrKey of arrayKeys) {
        const arrNum = Number(arrKey);
        const item = rawArrayReportsObj[arrKey];
        if (!item) continue;
        resultRows.push(buildRow(
            `array-${arrNum}-report`,
            `Array ${arrNum} Condensed Report`,
            [item.endpoint],
            () => {
                const stringsMap = item.data?.cellGroupReportForArray?.condensedCellReportForString || {};
                return Object.keys(stringsMap).length;
            }
        ));
    }

    // Append individual PCS reports health rows
    const rawPcsReportsObj = snap?.rawSources?.arrayPcsReports || {};
    const pArrKeys = Object.keys(rawPcsReportsObj).sort((a,b) => Number(a) - Number(b));
    for (const arrKey of pArrKeys) {
        const arrNum = Number(arrKey);
        const pcsMap = rawPcsReportsObj[arrKey] || {};
        const pcsKeys = Object.keys(pcsMap).sort((a,b) => Number(a) - Number(b));
        for (const pcsKey of pcsKeys) {
            const pcsNum = Number(pcsKey);
            const item = pcsMap[pcsKey];
            if (!item) continue;
            resultRows.push(buildRow(
                `array-${arrNum}-pcs-${pcsNum}-report`,
                `Array ${arrNum} PCS ${pcsNum} Operational Report`,
                [item.endpoint],
                () => item.ok ? 1 : 0
            ));
        }
    }

    return resultRows;
}

export function getSourceHealthSummary(rows: any[]): any {
    let healthySources = 0;
    let staleSources = 0;
    let failedSources = 0;
    let unknownSources = 0;

    rows.forEach(r => {
        if (r.state === "healthy") {
            healthySources++;
        } else if (r.state === "stale") {
            staleSources++;
        } else if (r.state === "failed") {
            failedSources++;
        } else {
            unknownSources++;
        }
    });

    return {
        totalSources: rows.length,
        healthySources,
        staleSources,
        failedSources,
        unknownSources
    };
}

export function getSiteDataStatusView(): any {
    const snap = centralSnapshot;
    if (!snap) return { warming: true };
    const healthRows = getSourceHealthRows(snap);
    const summary = getSourceHealthSummary(healthRows);
    return {
        siteIdentity: snap.siteIdentity,
        liveStatus: snap.liveStatus,
        sourceHealthSummary: summary,
        sourceHealth: healthRows,
        debug: {
            ...snap.debug,
            sourceHealthSummary: summary
        },
        freshness: snap.liveStatus.lastUpdated ? {
            lastUpdated: snap.liveStatus.lastUpdated,
            ageMs: snap.liveStatus.ageMs,
            stale: snap.liveStatus.stale
        } : null
    };
}

export function getBlockSummaryView(): any {
    const snap = centralSnapshot;
    if (!snap) return { warming: true };

    const htsSummary: any[] = [];
    const fDevices = snap.normalized.feather || [];
    fDevices.forEach((f: any) => {
         const rt = f.rawResponse?.thermalData || f.rawResponse || {};
         const tempC = f.spaceTemp ?? f.spaceTemperature ?? f.temperature ?? rt.spaceTemperature ?? rt.spaceTemp ?? rt.airTemp ?? rt.temperature ?? null;
         const hum = f.spaceHumidity ?? f.humidity ?? rt.spaceHumidity ?? rt.humidity ?? rt.relativeHumidity ?? null;
         if (tempC !== null || hum !== null) {
             const srcIp = f.deviceIp || f.ip;
             let enc = f.enclosureLabel || f.entityDescription || f.entityName;
             if (!enc && f.arrayIndex != null && f.stringIndex != null) {
                enc = `Array ${f.arrayIndex} ES${f.stringIndex}`;
             }
             const ct = f.cellTemp ?? f.avgCellTemperature ?? f.avgCellTemp ?? rt.cellTemp ?? rt.avgCellTemperature ?? null;
             htsSummary.push({
                 enclosureLabel: enc || "Unknown Enclosure",
                 sensorId: srcIp,
                 sourceIp: srcIp,
                 deviceName: f.deviceType || "Feather",
                 entityDescription: f.entityName || null,
                 arrayIndex: f.arrayIndex ?? null,
                 stringIndex: f.stringIndex ?? null,
                 temperatureC: tempC,
                 humidityPct: hum,
                 cellTemperatureC: ct,
                 supplyAirTempC: f.supplyAirTempC ?? f.supplyAirTemp ?? rt.supplyAirTemp ?? rt.supplyAirTempC ?? null,
                 coolingSetpointC: f.coolingSetpointC ?? f.coolingSetpoint ?? rt.coolingSetpoint ?? rt.coolingSetpointC ?? null,
                 heatingSetpointC: f.heatingSetpointC ?? f.heatingSetpoint ?? rt.heatingSetpoint ?? rt.heatingSetpointC ?? null,
                 source: "feather"
             });
         }
    });

    const healthRows = getSourceHealthRows(snap);
    const healthSummary = getSourceHealthSummary(healthRows);

    const siteObj = {
        stationCode: snap.siteIdentity.stationCode,
        discoveredStationCode: snap.siteIdentity.stationCode,
        siteCodeSource: "topology",
        blockIndex: snap.siteIdentity.blockIndex,
        profileId: snap.siteIdentity.activeProfileId,
        profileName: snap.siteIdentity.activeProfileName,
        emsBaseUrl: snap.siteIdentity.emsBaseUrl,
        connectionState: snap.liveStatus.state === "OFFLINE" ? "disconnected" : "connected",
        source: snap.liveStatus.source,
        staleData: snap.liveStatus.stale,
        lastUpdated: snap.liveStatus.lastUpdated
    };

    return {
        // Uniform unified models
        siteIdentity: snap.siteIdentity,
        liveStatus: snap.liveStatus,
        debug: {
            ...snap.debug,
            sourceHealthSummary: healthSummary
        },

        // Backward compatible legacy structures
        site: siteObj,
        source: snap.liveStatus.state === "OFFLINE" ? "offline" : snap.liveStatus.source,
        stale: snap.liveStatus.stale,
        cacheUsed: snap.liveStatus.cacheUsed,
        correctiveActions: snap.normalized.correctiveActions,
        activeIssueGroups: snap.normalized.correctiveActions, // activeIssueGroups maps directly to correctiveActions array in modern snapshot
        bessFleetSummary: snap.rollups.bessFleetSummary,
        stringSummary: snap.rollups.stringSummary,
        arraySummary: snap.normalized.arrays,
        pcsSummary: enrichedPcsRowsInBlockView(snap),
        featherSummary: snap.rollups.featherSummary,
        humidityTemperatureSensors: htsSummary,
        safetySummary: (snap.rollups as any).safetySummary || {},
        emsApps: snap.rawSources.emsApps || [],
        sourceHealth: healthRows,
        sourceHealthSummary: healthSummary,
        topologyCounts: (snap.rollups as any).topologyCounts || {},
        fleetCapacity: snap.rollups.stringSummary?.rollups?.fleetCapacity || null
    };
}

function enrichedPcsRowsInBlockView(snap: any): any[] {
    const capturedAt = snap?.liveStatus?.lastUpdated || new Date().toISOString();
    return (snap?.normalized?.pcs || []).map((p: any) => {
        const arrIdx = p.arrayIndex !== null && p.arrayIndex !== undefined ? Number(p.arrayIndex) : null;
        const pcsIdx = p.pcsIndex !== null && p.pcsIndex !== undefined ? Number(p.pcsIndex) : null;
        const rawKey = p.displayKey || p.rawKey || (arrIdx !== null && pcsIdx !== null ? `Array ${arrIdx} PCS ${pcsIdx}` : null);
        return {
            ...p,
            sourcePath: "blockviewer.data.arrays[].pcses[]",
            source: {
                domain: "pcs",
                sourceName: "blockviewer",
                sourceEndpoint: "/tools/monitor/ems/blockviewer/data",
                sourcePath: "data.arrays[].pcses[]",
                arrayIndex: arrIdx,
                pcsIndex: pcsIdx,
                rawKey,
                capturedAt
            }
        };
    });
}

export function getStringsView(): any {
    const snap = centralSnapshot;
    if (!snap) return { warming: true };
    return {
        strings: snap.normalized.strings,
        stringSummary: snap.rollups.stringSummary
    };
}

export function getPcsView(): any {
    const snap = centralSnapshot;
    if (!snap) return { warming: true };
    return {
        pcs: snap.normalized.pcs,
        pcsSummary: snap.rollups.pcsSummary || {},
        arrayDetailsByArray: (snap.normalized as any).arrayDetailsByArray || {},
        sourceHealth: snap.rollups.sourceHealth,
        source: "Coordinator Site Data Engine",
        cache: snap.liveStatus
    };
}

export function getFeatherView(): any {
    const snap = centralSnapshot;
    if (!snap) return { warming: true };
    return {
        feather: snap.normalized.feather,
        featherSummary: snap.rollups.featherSummary
    };
}

export function getArraysView(): any {
    const snap = centralSnapshot;
    if (!snap) return { warming: true };
    return {
        arrays: snap.normalized.arrays,
        arraySummary: snap.rollups.arraySummary
    };
}

export function getCorrectiveActionsView(): any {
    const snap = centralSnapshot;
    if (!snap) return { warming: true };
    return snap.normalized.correctiveActions;
}

export function getSourceHealthView(): any {
    const snap = centralSnapshot;
    if (!snap) return { warming: true };
    const healthRows = getSourceHealthRows(snap);
    const summary = getSourceHealthSummary(healthRows);
    return {
        sourceHealth: healthRows,
        sourceHealthSummary: summary,
        debug: {
            ...snap.debug,
            sourceHealthSummary: summary
         }
    };
}

export function getSensorsView(): any {
    const snap = centralSnapshot;
    if (!snap) return { warming: true };
    const sensors = (snap.normalized as any).sensors || [];
    const summary = (snap.rollups as any).sensorsSummary || {
        totalRows: sensors.length,
        totalLineups: 8,
        healthyLineups: 8,
        faultyLineups: 0,
        abnormalSegments: 0,
        highTempSegments: 0,
        trippedSensors: 0,
        nonCommunicating: 0,
        sourcePrimary: "firstresponder_v1",
        sourceSupplemental: "firstresponder_v2"
    };
    const healthRows = getSourceHealthRows(snap);
    const healthSummary = getSourceHealthSummary(healthRows);
    return {
        sensors,
        summary,
        sourceHealth: healthRows,
        sourceHealthSummary: healthSummary
    };
}

export function clearSnapshot() {
    centralSnapshot = null;
    prizmCache.set('prizm-site-snapshot', null, { ttlMs: 0 });
}

export function triggerImmediatePoll() {
    isPolling = false; // Break any locks to force immediate poll
    return doBackgroundPoll();
}

function isCollectionSegmentDevice(device: any) {
  const ip = device?.deviceIp || device?.ip;
  if (ip && String(ip).endsWith(".3")) return true;
  if (device?.isCollectionSegment) return true;
  if (device?.stringIndex === null || device?.stringIndex === undefined) {
    if (device?.arrayIndex !== undefined && device?.arrayIndex !== null) return true;
  }
  return false;
}

function isEnergySegmentDevice(device: any) {
  return !isCollectionSegmentDevice(device);
}

function normalizeFaultText(text: string) {
  return (text || "").trim().replace(/\s+/g, " ");
}

function extractFaultMessagesFromDevice(device: any) {
  const messages: any[] = [];
  if (Array.isArray(device?.activeAlarms)) {
    device.activeAlarms.forEach((msg: string) => messages.push({ text: msg, severity: "alarm" }));
  }
  if (Array.isArray(device?.activeWarnings)) {
    device.activeWarnings.forEach((msg: string) => messages.push({ text: msg, severity: "warning" }));
  }
  if (device?.reachable === false || device?.lostComms === true || device?.operationalState === "OFFLINE") {
    messages.push({ text: "Lost Comms with Feather", severity: "alarm" });
  }
  return messages;
}

function extractFaultMessagesFromStringRow(row: any) {
  const messages: any[] = [];
  if (Array.isArray(row?.alarmMessages)) {
    row.alarmMessages.forEach((msg: string) => messages.push({ text: msg, severity: "alarm" }));
  } else if (Array.isArray(row?.activeAlarms)) {
    row.activeAlarms.forEach((msg: string) => messages.push({ text: msg, severity: "alarm" }));
  }
  
  if (Array.isArray(row?.warningMessages)) {
    row.warningMessages.forEach((msg: string) => messages.push({ text: msg, severity: "warning" }));
  } else if (Array.isArray(row?.activeWarnings)) {
    row.activeWarnings.forEach((msg: string) => messages.push({ text: msg, severity: "warning" }));
  }
  return messages;
}

function extractBpcIndex(source: any): number | null {
  if (!source) return null;
  const direct = source.bpc ?? source.bpcIndex ?? source.bpcNumber ?? source.batteryPackIndex ?? source.batteryPackNumber ?? source.bpIndex ?? source.packIndex ?? source.packNumber ?? source.raw?.bpcIndex ?? source.raw?.batteryPackIndex;
  if (direct != null) return Number(direct);
  
  const text = String(source.text || source.label || source.id || "");
  const m = text.match(/(?:BPC|BP|Battery Pack)\s*(\d+)/i);
  if (m) return Number(m[1]);
  return null;
}

function extractCellGroupIndex(source: any): number | null {
  if (!source) return null;
  const direct = source.cg ?? source.cgIndex ?? source.cellGroup ?? source.cellGroupIndex ?? source.cellGroupNumber ?? source.cgc ?? source.cgcIndex ?? source.raw?.cgIndex ?? source.raw?.cellGroupIndex;
  if (direct != null) return Number(direct);
  
  const text = String(source.text || source.label || source.id || "");
  const m = text.match(/(?:CG|Cell Group|CGC)\s*(\d+)/i);
  if (m) return Number(m[1]);
  return null;
}

function extractNumericFaultCode(messageOrObject: any): number | null {
  if (typeof messageOrObject === "number") return messageOrObject;
  const text = typeof messageOrObject === "string" ? messageOrObject : String(messageOrObject?.text || "");
  const m = text.match(/^(\d{4})\b/);
  if (m) return Number(m[1]);
  return null;
}

function getFaultFamilyKey(code: number | null, label: string): string {
  if (code !== null && code >= 1000 && code <= 2999) {
    const codeStr = String(code);
    return codeStr.substring(1);
  }
  return label.toLowerCase();
}

function shouldIgnoreFaultForDevice(faultLabel: string, deviceType: "CS" | "ES", ip: string | null, device: any): boolean {
  const lower = faultLabel.toLowerCase();
  
  if (lower.match(/out of rotation|rotation|contactor open|contactors open|string disabled due to rotation/)) return true;
  const code = extractNumericFaultCode(faultLabel);
  if (code === 2534 || code === 2561) return true;

  if (deviceType === "CS") {
    if (lower.match(/battery enclosure door open|battery door open/)) return true;
  }
  
  if (deviceType === "ES") {
    if (lower.match(/dc cabinet door open/)) return true;
    if (lower.match(/ac cabinet door open/)) return true;
  }
  
  return false;
}

function determineSeverity(faultLabel: string, sourceSeverity: string | null): string {
  const code = extractNumericFaultCode(faultLabel);
  if (code !== null) {
    const codeStr = String(code);
    if (codeStr.startsWith("1")) return "alarm";
    if (codeStr.startsWith("2")) return "warning";
  }
  
  const lower = faultLabel.toLowerCase();
  if (lower.match(/fss invalid|lost comms|door open|leak detector|communication|disconnect/)) return "alarm";
  
  if (sourceSeverity) return sourceSeverity;
  
  if (lower.match(/mio invalid|hvac/)) return "warning";
  
  return "warning";
}

function makeAffectedLabel(target: any): string {
  let label = "";
  if (target.arrayIndex != null) {
    label += `Array ${target.arrayIndex}`;
  }
  if (target.stringIndex != null) {
    if (label) label += " / ";
    const es = Math.ceil(Number(target.stringIndex) / 2);
    label += `ES${es} / String ${target.stringIndex}`;
  } else if (target.segmentIndex != null) {
    if (label) label += " / ";
    label += `Segment ${target.segmentIndex}`;
  } else if (target.energySegmentIndex != null) {
    if (label) label += " / ";
    label += `ES${target.energySegmentIndex}`;
  }
  
  const bpc = target.bpcIndex ?? target.batteryPackIndex;
  if (bpc != null && Number(bpc) > 0) {
    if (label) label += " / ";
    label += `BPC ${bpc}`;
  }
  
  const cg = target.cellGroupIndex;
  if (cg != null && Number(cg) > 0) {
    if (label) label += " / ";
    label += `CG ${cg}`;
  }
  
  if (!label && target.ip) return target.ip;
  return label || "Unknown Target";
}

function getSuggestedAction(label: string): string {
  const lower = label.toLowerCase();
  if (lower.match(/door/)) return "Inspect and secure enclosure door; verify door switch state, latch alignment, and input status.";
  if (lower.match(/leak/)) return "Inspect leak detector circuit and affected enclosure for moisture or fluid intrusion.";
  if (lower.match(/comms|communication|reachable|lost comms|disconnect/)) return "Check device power, network path, switch port, and local controller communication.";
  if (lower.match(/fss|fire/)) return "Inspect fire safety signal chain, FSS/FDM inputs, and associated interlocks.";
  if (lower.match(/hvac/)) return "Inspect HVAC controller, power, enable state, and local controls.";
  if (lower.match(/mio/)) return "Inspect MIO controller validity, communication, and I/O mapping.";
  if (lower.match(/top cap/)) return "Inspect lower top cap switch, harness, and local input status.";
  if (lower.match(/balance/)) return "Inspect BPC balancing circuit status and cell group telemetry.";
  if (lower.match(/cell group|cgc|bpc/)) return "Inspect BPC/cell group communication and battery pack telemetry.";
  
  return "Open Feather/HVAC or String List details and inspect affected device.";
}

export function repairFinalCorrectiveActionsFromSnapshot(snapshot: any) {
  if (!snapshot) return;
  if (!snapshot.debug) snapshot.debug = {};
  
  const existingActions = snapshot.normalized?.correctiveActions || [];
  
  const devicesWithIssues = snapshot.rollups?.featherSummary?.devicesWithIssues || snapshot.normalized?.feather?.filter((d: any) => d.hasActiveIssue) || [];
  const stringRows = snapshot.normalized?.strings || snapshot.rollups?.stringSummary?.tableRows || [];
  
  let featherEventsExtracted = 0;
  let featherEventsIgnored = 0;
  let stringEventsExtracted = 0;
  let stringEventsIgnored = 0;
  let arrayNotificationEventsExtracted = 0;
  let arrayNotificationEventsIgnored = 0;
  let warningEventsSuppressedByAlarm = 0;
  let invalidExistingActionsDropped = 0;
  let existingActionCount = existingActions.length;
  let existingEventsNormalized = 0;
  const ignoredCodeCounts: Record<string, number> = {};
  
  const rawEvents: any[] = [];
  
  function makeTargetKey(target: any): string {
    return `${target.arrayIndex || ""}|${target.stringIndex || ""}|${target.bpcIndex || ""}|${target.cellGroupIndex || ""}|${target.ip || ""}`;
  }
  
  // 1. Process Existing Actions
  for (const action of existingActions) {
    const label = action.faultLabel || action.faultName || action.fault;
    if (!label) {
      invalidExistingActionsDropped++;
      continue;
    }
    existingEventsNormalized++;
    
    const severity = action.severity || "warning";
    const code = extractNumericFaultCode(label);
    const familyKey = getFaultFamilyKey(code, label);
    
    const targets = Array.isArray(action.affected) ? action.affected : [action.target || {}];
    for (const t of targets) {
      rawEvents.push({
        faultLabel: label,
        code: code ? String(code) : "",
        familyKey,
        severity,
        target: {
          ip: t.ip || null,
          arrayIndex: t.arrayIndex || null,
          stringIndex: t.stringIndex || null,
          bpcIndex: t.bpcIndex ?? t.batteryPackIndex ?? null,
          cellGroupIndex: t.cellGroupIndex ?? null
        },
        source: "existing"
      });
    }
  }
  
  // 2. Process Feather Events
  for (const device of devicesWithIssues) {
    const isCS = isCollectionSegmentDevice(device);
    const ip = device.deviceIp || device.ip;
    const messages = extractFaultMessagesFromDevice(device);
    
    for (const msg of messages) {
      const faultLabel = normalizeFaultText(msg.text);
      if (shouldIgnoreFaultForDevice(faultLabel, isCS ? "CS" : "ES", ip, device)) {
        featherEventsIgnored++;
        continue;
      }
      
      const code = extractNumericFaultCode(faultLabel);
      const severity = determineSeverity(faultLabel, msg.severity);
      
      rawEvents.push({
        faultLabel,
        code: code ? String(code) : "",
        familyKey: getFaultFamilyKey(code, faultLabel),
        severity,
        target: {
          ip,
          arrayIndex: device.arrayIndex,
          stringIndex: device.stringIndex,
          bpcIndex: extractBpcIndex(device) ?? extractBpcIndex(msg) ?? null,
          cellGroupIndex: extractCellGroupIndex(device) ?? extractCellGroupIndex(msg) ?? null
        },
        source: "feather"
      });
      featherEventsExtracted++;
    }
  }
  
  // 3. Process String Events
  for (const row of stringRows) {
    const messages = extractFaultMessagesFromStringRow(row);
    
    for (const msg of messages) {
      const faultLabel = normalizeFaultText(msg.text);
      if (shouldIgnoreFaultForDevice(faultLabel, "ES", null, row)) {
        stringEventsIgnored++;
        continue;
      }
      
      const code = extractNumericFaultCode(faultLabel);
      const severity = determineSeverity(faultLabel, msg.severity);
      
      rawEvents.push({
        faultLabel,
        code: code ? String(code) : "",
        familyKey: getFaultFamilyKey(code, faultLabel),
        severity,
        target: {
          arrayIndex: row.arrayNumber || row.arrayIndex || null,
          stringIndex: row.stringNumber || row.stringIndex || null,
          bpcIndex: extractBpcIndex(row) ?? extractBpcIndex(msg) ?? null,
          cellGroupIndex: extractCellGroupIndex(row) ?? extractCellGroupIndex(msg) ?? null
        },
        source: "strings"
      });
      stringEventsExtracted++;
    }
  }
  
  // 4. Process Array Notifications (from EMS Cache)
  const arrayNotificationsByArray = snapshot.rawSources?.arrayNotifications || {};
  let arrayNotificationsArraysPolled = 0;
  let arrayNotificationsRawCount = 0;
  
  for (const [arrNumStr, cache] of Object.entries(arrayNotificationsByArray)) {
    arrayNotificationsArraysPolled++;
    const arrayNumberFromEndpoint = parseInt(arrNumStr, 10);
    const cacheAny = cache as any;
    const notifications = cacheAny && cacheAny.data && Array.isArray(cacheAny.data.notification)
      ? cacheAny.data.notification
      : [];
    
    arrayNotificationsRawCount += notifications.length;
    
    for (const row of notifications) {
      const category = row.notificationType?.notificationCategory;
      const code = String(row.notificationType?.notificationId ?? "");
      
      if (code === "2534") {
        arrayNotificationEventsIgnored++;
        ignoredCodeCounts[code] = (ignoredCodeCounts[code] || 0) + 1;
        continue;
      }
      
      const source = row.notificationSource || {};
      const endpointType = source.endpointType;
      
      const arrayIndex = source.arrayIndex || arrayNumberFromEndpoint || null;
      const stringIndex = source.stringIndex || null;
      const bpcIndex = (source.batteryPackIndex && source.batteryPackIndex > 0) ? source.batteryPackIndex : null;
      const cellGroupIndex = (source.cellGroupIndex && source.cellGroupIndex > 0) ? source.cellGroupIndex : null;
      
      const target = {
        arrayIndex,
        stringIndex,
        bpcIndex,
        cellGroupIndex,
        ip: source.ipAddress || null
      };
      
      let severity: "alarm" | "warning" = "warning";
      if (category === "ALARM" || code.startsWith("1")) {
        severity = "alarm";
      } else if (category === "WARNING" || code.startsWith("2")) {
        severity = "warning";
      }
      
      let faultLabel = `${category || "WARNING"} Code ${code}`;
      if (code === "2074") {
        faultLabel = "CellGroup Charge Balancer Warning";
      } else if (code === "2073") {
        faultLabel = "CellGroup Discharge Balancer Warning";
      } else if (code === "1024") {
        faultLabel = "BPC Disconnect Alarm";
      } else if (code === "2024") {
        faultLabel = "BPC Disconnect Warning";
      } else {
        const registeredStatusCodes = snapshot.rawSources?.statusCodes?.registeredStatusCodes || [];
        let found = registeredStatusCodes.find((sc: any) => {
          if (!sc.code) return false;
          if (sc.code === code) return true;
          const matches = sc.code.match(/\d+/g);
          return matches && matches.includes(code);
        });
        if (!found) {
          found = registeredStatusCodes.find((sc: any) => sc.code?.includes(code) || sc.desc?.includes(code));
        }
        if (found) {
          faultLabel = found.desc || found.code;
        }
      }
      
      let familyKey = `code-${code}`;
      if (code.length === 4) {
        const family = code.slice(1);
        familyKey = `family-${family}`;
      }
      
      rawEvents.push({
        faultLabel,
        code,
        familyKey,
        severity,
        target,
        source: "array-notifications"
      });
      arrayNotificationEventsExtracted++;
    }
  }
  
  // 5. Apply Suppression (1xxx alarm suppresses 2xxx warning on the same target/family)
  const alarmsOnTargets = new Set<string>();
  for (const event of rawEvents) {
    if (event.severity === "alarm" && event.code && event.code.length === 4) {
      const family = event.code.slice(1);
      const targetKey = makeTargetKey(event.target);
      alarmsOnTargets.add(`${targetKey}|${family}`);
    }
  }
  
  const filteredEvents = rawEvents.filter(event => {
    if (event.severity === "warning" && event.code && event.code.length === 4) {
      const family = event.code.slice(1);
      const targetKey = makeTargetKey(event.target);
      if (alarmsOnTargets.has(`${targetKey}|${family}`)) {
        warningEventsSuppressedByAlarm++;
        return false;
      }
    }
    return true;
  });
  
  // 6. Source priority & deduplication: array-notifications > feather > strings > existing
  const sourcePriority: Record<string, number> = {
    "array-notifications": 4,
    "feather": 3,
    "strings": 2,
    "existing": 1
  };
  
  const deduplicatedEventsMap = new Map<string, any>();
  for (const event of filteredEvents) {
    const targetKey = makeTargetKey(event.target);
    const eventKey = `${targetKey}|${event.familyKey}`;
    
    const existingEvent = deduplicatedEventsMap.get(eventKey);
    if (!existingEvent) {
      deduplicatedEventsMap.set(eventKey, event);
    } else {
      const currentPri = sourcePriority[event.source] || 0;
      const existingPri = sourcePriority[existingEvent.source] || 0;
      if (currentPri > existingPri) {
        deduplicatedEventsMap.set(eventKey, event);
      }
    }
  }
  
  const finalFilteredEvents = Array.from(deduplicatedEventsMap.values());
  
  // 7. Group by familyKey + severity
  const groupsMap = new Map<string, any>();
  for (const event of finalFilteredEvents) {
    const groupKey = `${event.severity}|${event.familyKey}`;
    if (!groupsMap.has(groupKey)) {
      groupsMap.set(groupKey, {
        severity: event.severity,
        faultLabel: event.faultLabel,
        familyKey: event.familyKey,
        affectedMap: new Map<string, any>(),
        suggestedAction: getSuggestedAction(event.faultLabel),
        source: event.source
      });
    }
    const group = groupsMap.get(groupKey);
    const targetKey = makeTargetKey(event.target);
    if (!group.affectedMap.has(targetKey)) {
      group.affectedMap.set(targetKey, event.target);
    }
  }
  
  // 8. Build final actions
  const finalActions = Array.from(groupsMap.values()).map(group => {
    const affected = Array.from(group.affectedMap.values());
    const affectedLabel = makeAffectedLabel(affected[0]);
    const affectedSummary = affected.length > 1 ? `${affectedLabel} (+${affected.length - 1} more)` : affectedLabel;
    const groupKey = `${group.severity}|${group.familyKey}`;
    const id = `action-${groupKey.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
    
    return {
      id,
      severity: group.severity,
      level: group.severity === "alarm" ? "ALARM" : "WARNING",
      source: group.source === "existing" ? "EMS" : group.source,
      faultLabel: group.faultLabel,
      faultName: group.faultLabel,
      fault: group.faultLabel,
      details: `Affected: ${affectedSummary}`,
      count: affected.length,
      affectedCount: affected.length,
      affectedSummary,
      suggestedAction: group.suggestedAction,
      affected: affected.map(target => Object.assign({}, target, {
         label: makeAffectedLabel(target)
      })),
      affectedTargets: affected.map(target => Object.assign({}, target, {
         label: makeAffectedLabel(target)
      }))
    };
  });
  
  if (!snapshot.normalized) snapshot.normalized = {};
  snapshot.normalized.correctiveActions = finalActions;
  
  if (!snapshot.rollups) snapshot.rollups = {};
  snapshot.rollups.correctiveActions = finalActions;
  snapshot.correctiveActions = finalActions;
  
  snapshot.debug.correctiveActionsCount = finalActions.length;
  
  snapshot.debug.correctiveActionsRepair = {
    used: true,
    existingActionCount,
    existingEventsNormalized,
    invalidExistingActionsDropped,
    arrayNotificationsArraysPolled,
    arrayNotificationsRawCount,
    arrayNotificationEventsExtracted,
    arrayNotificationEventsIgnored,
    ignoredCodeCounts,
    featherDevicesScanned: devicesWithIssues.length,
    featherDevicesWithIssuesCount: devicesWithIssues.length,
    featherEventsExtracted,
    featherEventsIgnored,
    stringRowsScanned: stringRows.length,
    stringEventsExtracted,
    stringEventsIgnored,
    warningEventsSuppressedByAlarm,
    finalActionCount: finalActions.length,
    sampleFaultLabels: finalActions.slice(0, 5).map((a: any) => a.faultLabel)
  };
}
