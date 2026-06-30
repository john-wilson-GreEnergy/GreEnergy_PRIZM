import { Router } from "express";
import { getEmsCachedRawStrings, getEmsCachedBlock, getEmsStringIpMap, getEmsConnectionStatus } from "../emsTurtleClient";
import { getCommunicating, getOutRotation, getContactorsClosed } from "../../lib/stringClassifier";
import * as prizmCache from "../cache/prizmCache";
import { ProfileStore } from "../profiles/profileStore";
import { SITE_HEALTH_THRESHOLDS } from "../../lib/thresholds";
import { getLatestSnapshot } from "../prizmDataCoordinator";
import { buildNormalizedStringsData } from "../stringsDashboard";

const router = Router();

export interface SiteStringDistributionRow {
  stationCode?: string;
  blockIndex?: number;
  arrayIndex: number;
  stringIndex: number;
  ip?: string;
  displayLabel: string;
  stackVoltage?: number;
  stackVoltageVdc?: number;
  dcVoltage?: number;
  minCellVoltage?: number;
  maxCellVoltage?: number;
  avgCellVoltage?: number;
  maxCellTempC?: number;
  minCellTempC?: number;
  avgCellTempC?: number;
  stackTemperatureC?: number;
  socPct?: number;
  communicating: boolean;
  inRotation: boolean;
  outRotation?: boolean;
  contactorsClosed?: boolean;
  statusColor: "green" | "red" | "yellow" | "gray";
  statusLabel: string;
  sourcePath: string;
  raw?: any;
  metricSource?: {
    voltage: string;
    temperature: string;
    soc?: string;
    rowSourceTimestamp?: string;
  };
}

function parseSafeNum(v: any): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function firstNumeric(...values: any[]): number | undefined {
  for (const value of values) {
    if (value === null || value === undefined || value === "" || value === "--") continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function normalizeTemp(...values: any[]): number | undefined {
  const n = firstNumeric(...values);
  if (n === undefined) return undefined;
  if (Math.abs(n) > 100) return Number((n / 10).toFixed(1));
  return n;
}

function pN(val: any, def: number | null = null): number | null {
  if (val === undefined || val === null || val === "") return def;
  const n = Number(val);
  return isNaN(n) ? def : n;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_\-\.]/g, "");
}

function tryGetField(row: any, normalizedObject: Record<string, any>, possibleNames: string[]): any {
  for (const n of possibleNames) {
    if (row[n] !== undefined) return row[n];
    const norm = normalizeHeader(n);
    if (normalizedObject[norm] !== undefined) return normalizedObject[norm];
  }
  return undefined;
}

export async function buildSiteDistributionRows(): Promise<SiteStringDistributionRow[]> {
  const latestSnapshot = getLatestSnapshot();
  let normalizedStrings: any[] = [];
  if (latestSnapshot && latestSnapshot.normalized && Array.isArray(latestSnapshot.normalized.strings) && latestSnapshot.normalized.strings.length > 0) {
    normalizedStrings = latestSnapshot.normalized.strings;
  } else {
    const res = await buildNormalizedStringsData(false);
    normalizedStrings = res.strings || [];
  }

  const conn: any = getEmsConnectionStatus() || {};
  const stationCode = conn.discoveredStationCode || conn.stationCode || "BHE0021";
  const blockIndex = conn.blockIndex || 1;

  return normalizedStrings.map((s: any) => {
    const inRotation = !s.outRotation;
    const explicitDisconnected = (
      s.stringConnectionState === "OFFLINE" ||
      s.connectionState === "OFFLINE" ||
      s.stringConnectionState === "DISCONNECTED" ||
      s.connectionState === "DISCONNECTED"
    );

    let statusColor: "green" | "red" | "yellow" | "gray" = "gray";
    let statusLabel = "Not Communicating";

    if (!s.communicating) {
      statusColor = "gray";
      statusLabel = "Not Communicating";
    } else if (inRotation && explicitDisconnected) {
      statusColor = "red";
      statusLabel = "Disconnected and In Rotation";
    } else if (!inRotation || s.outRotation) {
      statusColor = "yellow";
      statusLabel = "Out of Rotation";
    } else if (s.communicating && inRotation) {
      statusColor = "green";
      statusLabel = "Connected and In Rotation";
    } else {
      statusColor = "gray";
      statusLabel = "Unknown";
    }

    return {
      stationCode: s.stationCode || stationCode,
      blockIndex: s.blockIndex || blockIndex,
      arrayIndex: s.arrayNumber,
      stringIndex: s.stringNumber,
      ip: s.stringControllerIp || "Unknown",
      displayLabel: s.stringKey,
      stackVoltage: s.stackVoltageVdc,
      stackVoltageVdc: s.stackVoltageVdc,
      dcVoltage: s.stackVoltageVdc,
      minCellVoltage: s.minCellVoltageMv,
      maxCellVoltage: s.maxCellVoltageMv,
      avgCellVoltage: s.avgCellVoltageMv,
      maxCellTempC: s.maxCellTempC,
      minCellTempC: s.minCellTempC,
      avgCellTempC: s.avgCellTempC,
      stackTemperatureC: s.maxCellTempC ?? s.avgCellTempC,
      socPct: s.socPct,
      communicating: s.communicating,
      inRotation,
      outRotation: s.outRotation,
      contactorsClosed: s.contactorClosed,
      statusColor,
      statusLabel,
      sourcePath: s.sourcePath || "normalized-strings",
      metricSource: {
        voltage: s.measuredVoltageVdc !== null ? "measured" : (s.calculatedVoltageVdc !== null ? "calculated" : (s.busVoltageVdc !== null ? "bus" : "unavailable")),
        temperature: s.maxCellTempC !== null ? "max-cell-temp" : (s.avgCellTempC !== null ? "avg-cell-temp" : "unavailable"),
        soc: s.socPct !== null ? "normalized" : "unavailable",
        rowSourceTimestamp: s.sourceTimestampUtc || s.lastUpdatedUtc,
      }
    };
  });
}

router.get("/strings", async (req, res) => {
  const startedAt = Date.now();
  const includePerf = req.query.includePerf === "true";
  const rawStringsWrapper = getEmsCachedRawStrings();
  const blockWrapper = getEmsCachedBlock();
  
  let sourceLabel: "site-operations" | "strings.csv" | "blockviewer" | "hybrid" = "hybrid";

  if (rawStringsWrapper.data && rawStringsWrapper.data.length > 0) {
    const src = String(rawStringsWrapper.source || "").toLowerCase();
    if (src.includes("csv") || src.includes("string")) {
      sourceLabel = "strings.csv";
    } else if (src.includes("summary") || src.includes("operation")) {
      sourceLabel = "site-operations";
    } else {
      sourceLabel = "hybrid";
    }
  } else if (blockWrapper.data && blockWrapper.data.strings && blockWrapper.data.strings.length > 0) {
    sourceLabel = "blockviewer";
  } else {
    sourceLabel = "blockviewer";
  }

  const rows = await buildSiteDistributionRows();

  const stringCount = rows.length;
  const communicatingCount = rows.filter(r => r.communicating).length;
  const outOfRotationCount = rows.filter(r => r.outRotation).length;
  const notCommunicatingCount = rows.filter(r => !r.communicating).length;

  const voltages = rows.map(r => r.stackVoltage).filter((v): v is number => v !== undefined && v !== null);
  const voltageMin = voltages.length > 0 ? Math.min(...voltages) : undefined;
  const voltageMax = voltages.length > 0 ? Math.max(...voltages) : undefined;
  const voltageAvg = voltages.length > 0 ? Number((voltages.reduce((sum, v) => sum + v, 0) / voltages.length).toFixed(1)) : undefined;

  // Preferred temperature metric: 1. max cell temperature, 2. average cell temperature, 3. any available stack/string temperature
  const temperatures = rows.map(r => r.maxCellTempC ?? r.avgCellTempC ?? r.stackTemperatureC).filter((t): t is number => t !== undefined && t !== null);
  const temperatureMin = temperatures.length > 0 ? Math.min(...temperatures) : undefined;
  const temperatureMax = temperatures.length > 0 ? Math.max(...temperatures) : undefined;
  const temperatureAvg = temperatures.length > 0 ? Number((temperatures.reduce((sum, v) => sum + v, 0) / temperatures.length).toFixed(1)) : undefined;

  const hasMaxCellTemp = rows.some(r => r.maxCellTempC !== undefined && r.maxCellTempC !== null);
  const temperatureMetric = hasMaxCellTemp ? "Max Cell Temperature C" : "Average Cell Temperature C";

  const voltageRows = rows.filter(r =>
    (r.stackVoltage !== undefined && r.stackVoltage !== null) ||
    (r.stackVoltageVdc !== undefined && r.stackVoltageVdc !== null) ||
    (r.dcVoltage !== undefined && r.dcVoltage !== null)
  ).length;

  const temperatureRows = rows.filter(r =>
    (r.maxCellTempC !== undefined && r.maxCellTempC !== null) ||
    (r.avgCellTempC !== undefined && r.avgCellTempC !== null) ||
    (r.stackTemperatureC !== undefined && r.stackTemperatureC !== null)
  ).length;

  let stationCode: string | null = null;
  let blockIndex: number | null = null;

  if (rows.length > 0) {
    if (rows[0].stationCode) stationCode = rows[0].stationCode;
    if (typeof rows[0].blockIndex === "number") blockIndex = rows[0].blockIndex;
  }

  const connStatus = getEmsConnectionStatus();
  if (!stationCode && connStatus?.stationCode) {
    stationCode = connStatus.stationCode;
  }
  if (blockIndex === null && connStatus && typeof connStatus.blockIndex === "number") {
    blockIndex = connStatus.blockIndex;
  }

  const activeProfile = ProfileStore.getActiveProfile();
  if (!stationCode && activeProfile?.stationCode) {
    stationCode = activeProfile.stationCode;
  }
  if (blockIndex === null && activeProfile && typeof activeProfile.blockIndex === "number") {
    blockIndex = activeProfile.blockIndex;
  }

  const responsePayload: any = {
    success: true,
    timestamp: new Date().toISOString(),
    source: sourceLabel,
    stationCode,
    blockIndex,
    cacheInfo: {
      sourcesUsed: [
        { name: 'ems-strings', hasData: Boolean(rawStringsWrapper.data && rawStringsWrapper.data.length > 0) },
        { name: 'ems-block', hasData: Boolean(blockWrapper.data && blockWrapper.data.strings && blockWrapper.data.strings.length > 0) }
      ]
    },
    metricAvailability: {
      totalRows: rows.length,
      voltageRows,
      temperatureRows,
      missingVoltageRows: rows.length - voltageRows,
      missingTemperatureRows: rows.length - temperatureRows
    },
    rollups: {
      stringCount,
      communicatingCount,
      notCommunicatingCount,
      outOfRotationCount,
      voltageMin,
      voltageMax,
      voltageAvg,
      temperatureMin,
      temperatureMax,
      temperatureAvg,
      temperatureMetric
    },
    rows
  };

  if (includePerf) {
    responsePayload.perf = {
      durationMs: Date.now() - startedAt,
      source: responsePayload.source || "unknown"
    };
  }

  res.json(responsePayload);
});

// Helper resolvers for best available voltage and temperature metrics across sources
function resolveVoltage(
  arrayIndex: number,
  stringIndex: number,
  row: any,
  sampleMap: Map<string, any>,
  enrichedMap: Map<string, any>,
  baseMap: Map<string, any>,
  sampleRequested: boolean
): { value: number | undefined; source: string } {
  const key = `${arrayIndex}:${stringIndex}`;

  const hasDistOrDashboard = 
    (row && firstNumeric(row.stackVoltage, row.measuredVoltage, row.calculatedVoltage) !== undefined) ||
    enrichedMap.has(key) ||
    baseMap.has(key);

  const sampleAllowed = sampleRequested || !hasDistOrDashboard;

  const sources: { name: string; data: any }[] = [];
  if (row) {
    sources.push({ name: "site-distribution", data: row });
  }
  if (enrichedMap.has(key)) {
    sources.push({ name: "string-dashboard-cache", data: enrichedMap.get(key) });
  }
  if (baseMap.has(key)) {
    sources.push({ name: "string-dashboard-cache", data: baseMap.get(key) });
  }
  if (sampleAllowed && sampleMap.has(key)) {
    sources.push({ name: "stringviewer-sampled", data: sampleMap.get(key) });
  }

  for (const src of sources) {
    if (!src.data) continue;
    const d = src.data;

    const mv = firstNumeric(d.measuredVoltage, d.measuredStringVoltage, d.voltageMeasured, d.voltageMeas);
    if (mv !== undefined) return { value: mv, source: src.name };

    const cv = firstNumeric(d.calculatedVoltage, d.calculatedStringVoltage, d.voltageCalculated, d.voltageCalc);
    if (cv !== undefined) return { value: cv, source: src.name };

    const bv = firstNumeric(d.busVoltage, d.dcBusVoltage, d.voltageDcBus, d.voltageBus);
    if (bv !== undefined) return { value: bv, source: src.name };

    const sv = firstNumeric(d.stackVoltage, d.stackVoltageVdc, d.dcVoltage);
    if (sv !== undefined) return { value: sv, source: src.name };

    const acv = firstNumeric(d.avgCellVoltage, d.avgCellGroupVoltage, d.cellVoltageAvg);
    if (acv !== undefined) return { value: acv, source: `${src.name}-cell-voltage-fallback` };
  }

  // Absolute fallback to stringviewer-sampled if we literally have nothing else
  if (sampleMap.has(key)) {
    const d = sampleMap.get(key);
    const mv = firstNumeric(d.measuredVoltage, d.measuredStringVoltage, d.voltageMeasured, d.voltageMeas);
    if (mv !== undefined) return { value: mv, source: "stringviewer-sampled-fallback" };

    const cv = firstNumeric(d.calculatedVoltage, d.calculatedStringVoltage, d.voltageCalculated, d.voltageCalc);
    if (cv !== undefined) return { value: cv, source: "stringviewer-sampled-fallback" };

    const bv = firstNumeric(d.busVoltage, d.dcBusVoltage, d.voltageDcBus, d.voltageBus);
    if (bv !== undefined) return { value: bv, source: "stringviewer-sampled-fallback" };

    const sv = firstNumeric(d.stackVoltage, d.stackVoltageVdc, d.dcVoltage);
    if (sv !== undefined) return { value: sv, source: "stringviewer-sampled-fallback" };
  }

  return { value: undefined, source: "unavailable" };
}

function resolveTemperature(
  arrayIndex: number,
  stringIndex: number,
  row: any,
  sampleMap: Map<string, any>,
  enrichedMap: Map<string, any>,
  baseMap: Map<string, any>,
  sampleRequested: boolean
): { value: number | undefined; source: string } {
  const key = `${arrayIndex}:${stringIndex}`;

  const hasDistOrDashboard = 
    (row && normalizeTemp(row.maxCellTempC, row.avgCellTempC) !== undefined) ||
    enrichedMap.has(key) ||
    baseMap.has(key);

  const sampleAllowed = sampleRequested || !hasDistOrDashboard;

  const sources: { name: string; data: any }[] = [];
  if (row) {
    sources.push({ name: "site-distribution", data: row });
  }
  if (enrichedMap.has(key)) {
    sources.push({ name: "string-dashboard-cache", data: enrichedMap.get(key) });
  }
  if (baseMap.has(key)) {
    sources.push({ name: "string-dashboard-cache", data: baseMap.get(key) });
  }
  if (sampleAllowed && sampleMap.has(key)) {
    sources.push({ name: "stringviewer-sampled", data: sampleMap.get(key) });
  }

  for (const src of sources) {
    if (!src.data) continue;
    const d = src.data;

    const mxt = normalizeTemp(d.maxCellTemperature, d.maxCellGroupTemp, d.maxCellTempC, d.maxCellTemp, d.maxCellTemperatureC);
    if (mxt !== undefined) return { value: mxt, source: src.name };

    const avt = normalizeTemp(d.avgCellTemperature, d.avgCellGroupTemp, d.avgCellTempC, d.avgCellTemp, d.averageCellTemperature);
    if (avt !== undefined) return { value: avt, source: src.name };

    const mnt = normalizeTemp(d.minCellTemperature, d.minCellGroupTemp, d.minCellTempC, d.minCellTemp, d.minCellTemperatureC);
    if (mnt !== undefined) return { value: mnt, source: src.name };

    const stt = normalizeTemp(d.stackTemperatureC, d.stackTempC, d.stackTemperature, d.tempC, d.temperatureC);
    if (stt !== undefined) return { value: stt, source: src.name };
  }

  // Absolute fallback
  if (sampleMap.has(key)) {
    const d = sampleMap.get(key);
    const mxt = normalizeTemp(d.maxCellTemperature, d.maxCellGroupTemp, d.maxCellTempC, d.maxCellTemp, d.maxCellTemperatureC);
    if (mxt !== undefined) return { value: mxt, source: "stringviewer-sampled-fallback" };
  }

  return { value: undefined, source: "unavailable" };
}

function resolveSOC(
  row: any,
  dSample: any,
  dEnriched: any,
  dBase: any,
  sampleAllowed: boolean
): { value: number | undefined; source: string } {
  if (row && row.socPct !== undefined && row.socPct !== null) {
    return { value: row.socPct, source: "site-distribution" };
  }
  if (dEnriched && dEnriched.socPct !== undefined && dEnriched.socPct !== null) {
    return { value: dEnriched.socPct, source: "string-dashboard-cache" };
  }
  if (dBase && dBase.socPct !== undefined && dBase.socPct !== null) {
    return { value: dBase.socPct, source: "string-dashboard-cache" };
  }
  if (sampleAllowed && dSample && dSample.socPct !== undefined && dSample.socPct !== null) {
    return { value: dSample.socPct, source: "stringviewer-sampled" };
  }
  if (dSample && dSample.socPct !== undefined && dSample.socPct !== null) {
    return { value: dSample.socPct, source: "stringviewer-sampled-fallback" };
  }
  return { value: undefined, source: "unavailable" };
}

function getPointStatus(
  v: number | undefined,
  t: number | undefined,
  communicating: boolean,
  inRotation: boolean,
  lowVolt: number = SITE_HEALTH_THRESHOLDS.voltageVdc.lowWarningMax,
  lowAlarmVolt: number = SITE_HEALTH_THRESHOLDS.voltageVdc.lowAlarmMax,
  warningVolt: number = SITE_HEALTH_THRESHOLDS.voltageVdc.highWarningMin,
  alarmVolt: number = SITE_HEALTH_THRESHOLDS.voltageVdc.highAlarmMin,
  lowTemp: number = SITE_HEALTH_THRESHOLDS.temperatureC.lowWarningMax,
  lowAlarmTemp: number = SITE_HEALTH_THRESHOLDS.temperatureC.lowAlarmMax,
  warningTemp: number = SITE_HEALTH_THRESHOLDS.temperatureC.highWarningMin,
  alarmTemp: number = SITE_HEALTH_THRESHOLDS.temperatureC.highAlarmMin
) {
  if (!communicating) {
    return {
      statusColor: "gray" as const,
      statusLabel: "Not Communicating"
    };
  }

  if (!inRotation) {
    return {
      statusColor: "yellow" as const,
      statusLabel: "Out of Rotation"
    };
  }

  const isVoltageAlarmHigh = v !== undefined && v >= alarmVolt;
  const isVoltageAlarmLow = v !== undefined && v <= lowAlarmVolt;
  const isTempAlarmHigh = t !== undefined && t >= alarmTemp;
  const isTempAlarmLow = t !== undefined && t <= lowAlarmTemp;

  if (isVoltageAlarmHigh || isVoltageAlarmLow || isTempAlarmHigh || isTempAlarmLow) {
    const reasons: string[] = [];
    if (isVoltageAlarmHigh) reasons.push(`Overvoltage Alarm (>= ${alarmVolt} Vdc)`);
    if (isVoltageAlarmLow) reasons.push(`Undervoltage Alarm (<= ${lowAlarmVolt} Vdc)`);
    if (isTempAlarmHigh) reasons.push(`Overtemp Alarm (>= ${alarmTemp}°C)`);
    if (isTempAlarmLow) reasons.push(`Low Temp Alarm (<= ${lowAlarmTemp}°C)`);
    return {
      statusColor: "red" as const,
      statusLabel: reasons.join(", ")
    };
  }

  const isVoltageWarningHigh = v !== undefined && v >= warningVolt;
  const isVoltageWarningLow = v !== undefined && v <= lowVolt;
  const isTempWarningHigh = t !== undefined && t >= warningTemp;
  const isTempWarningLow = t !== undefined && t <= lowTemp;

  if (isVoltageWarningHigh || isVoltageWarningLow || isTempWarningHigh || isTempWarningLow) {
    const reasons: string[] = [];
    if (isVoltageWarningHigh) reasons.push(`Voltage Warning High (>= ${warningVolt} Vdc)`);
    if (isVoltageWarningLow) reasons.push(`Voltage Warning Low (<= ${lowVolt} Vdc)`);
    if (isTempWarningHigh) reasons.push(`Temp Warning High (>= ${warningTemp}°C)`);
    if (isTempWarningLow) reasons.push(`Temp Warning Low (<= ${lowTemp}°C)`);
    return {
      statusColor: "amber" as const,
      statusLabel: reasons.join(", ")
    };
  }

  return {
    statusColor: "green" as const,
    statusLabel: "Connected and In Rotation"
  };
}

router.get("/graph", async (req, res) => {
  const startedAt = Date.now();
  const sampleRequested = req.query.sample === "true" || req.query.useSample === "true";
  const refreshRequested = req.query.refresh === "true" || sampleRequested;

  const rows = await buildSiteDistributionRows();

  const baseVoltageRows = rows.filter(r => r.stackVoltage !== undefined && r.stackVoltage !== null).length;
  const baseTempRows = rows.filter(r => r.maxCellTempC !== undefined && r.maxCellTempC !== null).length;

  let isSampled = false;
  let cacheHit = true;

  const profile = ProfileStore.getActiveProfile();
  const stationCode = profile?.stationCode || "default";
  const blockIndex = profile?.blockIndex ?? 0;
  const profileId = profile?.id || "no_profile";
  const arrayParam = req.query.array ? Number(req.query.array) : undefined;
  const arraySuffix = arrayParam !== undefined ? `_ARRAY_${arrayParam}` : "_ALL";
  const cacheKey = `site_health_graph_sample_${stationCode}_B${blockIndex}_P${profileId}${arraySuffix}`;

  let sampledResultsMap = new Map<string, any>();

  // If sample mode is explicitly enabled, try to fetch/get sampled data
  if (sampleRequested) {
    isSampled = true;
    let sampleCache: any = prizmCache.get<any>(cacheKey);

    if (!sampleCache && profile && profileId !== "no_profile") {
      cacheHit = false;
      const baseUrl = `http://${profile.emsHost}:${profile.emsPort}${profile.turtlePath}`;
      let targets: { arrayIndex: number; stringIndex: number }[] = [];

      if (arrayParam !== undefined && Number.isFinite(arrayParam)) {
        const arrRows = rows.filter(r => r.arrayIndex === arrayParam);
        targets = arrRows.map(r => ({ arrayIndex: r.arrayIndex, stringIndex: r.stringIndex }));
      } else {
        const arrays = Array.from(new Set(rows.map(r => r.arrayIndex))).sort((a, b) => a - b);
        for (const arr of arrays) {
          const arrRows = rows.filter(r => r.arrayIndex === arr);
          targets.push(...arrRows.slice(0, 5).map(r => ({ arrayIndex: r.arrayIndex, stringIndex: r.stringIndex })));
        }
      }

      const limit = req.query.sampleLimit ? Number(req.query.sampleLimit) : 40;
      if (targets.length > limit) {
        targets = targets.slice(0, limit);
      }

      const concurrency = Math.min(Number(req.query.concurrency || 4), 8);
      const sampledResults: any[] = [];

      async function sampleWorker(target: { arrayIndex: number; stringIndex: number }) {
        const svUrl = `${baseUrl}/tools/monitor/ems/stringviewer/array/${target.arrayIndex}/${target.stringIndex}/data`;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);
          const response = await fetch(svUrl, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (response.ok) {
            const svData: any = await response.json();
            if (svData && svData.stringViewerDataModel) {
              const sv = svData.stringViewerDataModel;
              sampledResults.push({
                arrayIndex: target.arrayIndex,
                stringIndex: target.stringIndex,
                measuredVoltage: parseSafeNum(sv.measuredStringVoltage),
                calculatedVoltage: parseSafeNum(sv.calculatedStringVoltage),
                busVoltage: parseSafeNum(sv.dcBusVoltage),
                maxCellVoltage: parseSafeNum(sv.maxCellGroupVoltage),
                minCellVoltage: parseSafeNum(sv.minCellGroupVoltage),
                avgCellVoltage: parseSafeNum(sv.avgCellGroupVoltage),
                maxCellTemperature: normalizeTemp(sv.maxCellGroupTemp),
                avgCellTemperature: normalizeTemp(sv.avgCellGroupTemp),
                minCellTemperature: normalizeTemp(sv.minCellGroupTemp),
                socPct: parseSafeNum(sv.soc),
                operationalState: sv.stringConnectionState,
                outRotation: sv.outRotation ?? sv.outRotationState,
                timestamp: Date.now()
              });
            }
          }
        } catch (e) {
          // Ignore
        }
      }

      const queue = [...targets];
      const workers = Array(concurrency).fill(null).map(async () => {
        while (queue.length > 0) {
          const item = queue.shift();
          if (item) {
            await sampleWorker(item);
          }
        }
      });
      await Promise.all(workers);

      const cachedObj = {
        data: sampledResults,
        timestamp: Date.now()
      };

      prizmCache.set(cacheKey, cachedObj, { ttlMs: 60000 });
      sampleCache = cachedObj;
    }

    if (sampleCache) {
      const rawData = Array.isArray(sampleCache) ? sampleCache : (Array.isArray(sampleCache.data) ? sampleCache.data : []);
      for (const s of rawData) {
        sampledResultsMap.set(`${s.arrayIndex}:${s.stringIndex}`, s);
      }
    }
  }

  const lowVolt = req.query.lowVolt ? Number(req.query.lowVolt) : SITE_HEALTH_THRESHOLDS.voltageVdc.lowWarningMax;
  const lowAlarmVolt = req.query.lowAlarmVolt ? Number(req.query.lowAlarmVolt) : SITE_HEALTH_THRESHOLDS.voltageVdc.lowAlarmMax;
  const warningVolt = req.query.warningVolt ? Number(req.query.warningVolt) : SITE_HEALTH_THRESHOLDS.voltageVdc.highWarningMin;
  const alarmVolt = req.query.alarmVolt ? Number(req.query.alarmVolt) : SITE_HEALTH_THRESHOLDS.voltageVdc.highAlarmMin;

  const lowTemp = req.query.lowTemp ? Number(req.query.lowTemp) : SITE_HEALTH_THRESHOLDS.temperatureC.lowWarningMax;
  const lowAlarmTemp = req.query.lowAlarmTemp ? Number(req.query.lowAlarmTemp) : SITE_HEALTH_THRESHOLDS.temperatureC.lowAlarmMax;
  const warningTemp = req.query.warningTemp ? Number(req.query.warningTemp) : SITE_HEALTH_THRESHOLDS.temperatureC.highWarningMin;
  const alarmTemp = req.query.alarmTemp ? Number(req.query.alarmTemp) : SITE_HEALTH_THRESHOLDS.temperatureC.highAlarmMin;

  const points: any[] = [];

  let sourceCountSampled = 0;
  let sourceCountDist = 0;

  for (const row of rows) {
    const { arrayIndex, stringIndex } = row;
    const key = `${arrayIndex}:${stringIndex}`;

    let point: any;

    if (sampleRequested && sampledResultsMap.has(key)) {
      sourceCountSampled++;
      const s = sampledResultsMap.get(key);
      const isOutRotation = s.outRotation ?? s.outRotationState ?? false;
      const communicating = s.operationalState !== undefined ? (s.operationalState !== "OFFLINE") : row.communicating;

      const explicitDisconnected = (
        s.operationalState === "OFFLINE" ||
        s.stringConnectionState === "OFFLINE" ||
        s.connectionState === "OFFLINE" ||
        s.operationalState === "DISCONNECTED" ||
        s.stringConnectionState === "DISCONNECTED"
      );

      let statusColor: "green" | "red" | "yellow" | "gray" = "gray";
      let statusLabel = "Not Communicating";

      if (!communicating) {
        statusColor = "gray";
        statusLabel = "Not Communicating";
      } else if (!isOutRotation && explicitDisconnected) {
        statusColor = "red";
        statusLabel = "Disconnected and In Rotation";
      } else if (isOutRotation) {
        statusColor = "yellow";
        statusLabel = "Out of Rotation";
      } else if (communicating && !isOutRotation) {
        statusColor = "green";
        statusLabel = "Connected and In Rotation";
      }

      const sampleAgeMs = s.timestamp ? Date.now() - s.timestamp : 0;
      const voltValue = s.measuredVoltage ?? s.calculatedVoltage ?? s.busVoltage ?? null;
      const tempValue = s.maxCellTemperature ?? null;

      point = {
        id: row.displayLabel,
        arrayIndex,
        stringIndex,
        displayLabel: row.displayLabel,
        ip: row.ip,
        voltage: voltValue,
        temperature: tempValue,
        socPct: s.socPct ?? null,
        communicating,
        inRotation: !isOutRotation,
        outRotation: isOutRotation,
        statusColor,
        statusLabel,
        minCellVoltage: s.minCellVoltage ?? null,
        avgCellVoltage: s.avgCellVoltage ?? null,
        maxCellVoltage: s.maxCellVoltage ?? null,
        minCellTempC: s.minCellTemperature ?? null,
        avgCellTempC: s.avgCellGroupTemp ?? s.avgCellTemperature ?? null,
        maxCellTempC: s.maxCellTemperature ?? null,
        stackVoltage: voltValue,
        metricSource: {
          voltage: "stringviewer-sampled",
          temperature: "stringviewer-sampled",
          soc: "stringviewer-sampled",
          primary: "stringviewer-sampled",
          sampleTimestampUtc: s.timestamp ? new Date(s.timestamp).toISOString() : new Date().toISOString(),
          sampleAgeMs
        },
        fieldSources: {
          voltage: "stringviewer-sampled",
          soc: "stringviewer-sampled",
          minCellVoltage: "stringviewer-sampled",
          avgCellVoltage: "stringviewer-sampled",
          maxCellVoltage: "stringviewer-sampled",
          minCellTempC: "stringviewer-sampled",
          avgCellTempC: "stringviewer-sampled",
          maxCellTempC: "stringviewer-sampled",
          communicating: "stringviewer-sampled",
          rotation: "stringviewer-sampled"
        }
      };
    } else {
      sourceCountDist++;
      point = {
        id: row.displayLabel,
        arrayIndex,
        stringIndex,
        displayLabel: row.displayLabel,
        ip: row.ip,
        voltage: row.stackVoltage ?? null,
        temperature: row.maxCellTempC ?? null,
        socPct: row.socPct ?? null,
        communicating: row.communicating,
        inRotation: row.inRotation,
        outRotation: row.outRotation ?? false,
        statusColor: row.statusColor,
        statusLabel: row.statusLabel,
        minCellVoltage: row.minCellVoltage ?? null,
        avgCellVoltage: row.avgCellVoltage ?? null,
        maxCellVoltage: row.maxCellVoltage ?? null,
        minCellTempC: row.minCellTempC ?? null,
        avgCellTempC: row.avgCellTempC ?? null,
        maxCellTempC: row.maxCellTempC ?? null,
        stackVoltage: row.stackVoltage ?? null,
        metricSource: {
          voltage: row.metricSource?.voltage || "normalized-strings",
          temperature: row.metricSource?.temperature || "normalized-strings",
          soc: row.metricSource?.soc || "normalized-strings",
          primary: "normalized-strings",
          rowSourceTimestamp: row.metricSource?.rowSourceTimestamp || new Date().toISOString()
        },
        fieldSources: {
          voltage: "normalized-strings",
          soc: "normalized-strings",
          minCellVoltage: "normalized-strings",
          avgCellVoltage: "normalized-strings",
          maxCellVoltage: "normalized-strings",
          minCellTempC: "normalized-strings",
          avgCellTempC: "normalized-strings",
          maxCellTempC: "normalized-strings",
          communicating: "normalized-strings",
          rotation: "normalized-strings"
        }
      };
    }

    points.push(point);
  }

  const sourceMode = isSampled ? "stringviewer-sampled" : "normalized-strings";

  const validVoltages = points.map(p => p.voltage).filter((v): v is number => v !== undefined && v !== null);
  const validTemps = points.map(p => p.temperature).filter((t): t is number => t !== undefined && t !== null);

  const voltageMin = validVoltages.length > 0 ? Math.min(...validVoltages) : undefined;
  const voltageMax = validVoltages.length > 0 ? Math.max(...validVoltages) : undefined;
  const voltageAvg = validVoltages.length > 0 ? Number((validVoltages.reduce((sum, v) => sum + v, 0) / validVoltages.length).toFixed(1)) : undefined;

  const temperatureMin = validTemps.length > 0 ? Math.min(...validTemps) : undefined;
  const temperatureMax = validTemps.length > 0 ? Math.max(...validTemps) : undefined;
  const temperatureAvg = validTemps.length > 0 ? Number((validTemps.reduce((sum, t) => sum + t, 0) / validTemps.length).toFixed(1)) : undefined;

  const anomalies = {
    voltageHigh: points.filter(p => p.voltage !== undefined && p.voltage >= warningVolt).map(p => p.id),
    voltageLow: points.filter(p => p.voltage !== undefined && p.voltage <= lowVolt).map(p => p.id),
    temperatureHigh: points.filter(p => p.temperature !== undefined && p.temperature >= warningTemp).map(p => p.id),
    temperatureLow: points.filter(p => p.temperature !== undefined && p.temperature <= lowTemp).map(p => p.id),
    offline: points.filter(p => !p.communicating).map(p => p.id),
    outOfRotation: points.filter(p => !p.inRotation).map(p => p.id)
  };

  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    source: sourceMode,
    sourceCounts: {
      sampled: sourceCountSampled,
      dashboard: 0,
      distribution: sourceCountDist
    },
    mode: "both",
    points,
    metricAvailability: {
      totalRows: points.length,
      voltageRows: validVoltages.length,
      temperatureRows: validTemps.length,
      missingVoltageRows: points.length - validVoltages.length,
      missingTemperatureRows: points.length - validTemps.length
    },
    rollups: {
      voltageMin,
      voltageMax,
      voltageAvg,
      temperatureMin,
      temperatureMax,
      temperatureAvg
    },
    anomalies,
    perf: {
      durationMs: Date.now() - startedAt,
      cacheHit,
      liveAttempted: isSampled
    }
  });
});

router.get("/graph/debug", async (req, res) => {
  const profile = ProfileStore.getActiveProfile();
  const stationCode = profile?.stationCode || "default";
  const blockIndex = profile?.blockIndex ?? 0;
  const profileId = profile?.id || "no_profile";
  const arrayParam = req.query.array ? Number(req.query.array) : undefined;
  const arraySuffix = arrayParam !== undefined ? `_ARRAY_${arrayParam}` : "_ALL";
  const cacheKey = `site_health_graph_sample_${stationCode}_B${blockIndex}_P${profileId}${arraySuffix}`;

  const dashboardCacheBase = prizmCache.get<any>("string_dashboard_base_ALL");
  const dashboardCacheEnriched = prizmCache.get<any>("string_dashboard_enriched_ALL");
  const sampleCache = prizmCache.get<any>(cacheKey) || prizmCache.get<any>("site_health_graph_sample_ALL");

  const baseStrings = dashboardCacheBase?.data?.strings || [];
  const enrichedStrings = dashboardCacheEnriched?.data?.strings || [];

  const rows = await buildSiteDistributionRows();
  const voltRows = rows.filter(r => r.stackVoltage !== undefined && r.stackVoltage !== null).length;
  const tempRows = rows.filter(r => r.maxCellTempC !== undefined && r.maxCellTempC !== null).length;

  res.json({
    stringDashboardCache: {
      baseExists: !!dashboardCacheBase,
      enrichedExists: !!dashboardCacheEnriched,
      rows: Math.max(baseStrings.length, enrichedStrings.length),
      voltageRows: (enrichedStrings.filter((s: any) => s.measuredVoltage !== undefined).length || baseStrings.filter((s: any) => s.measuredVoltage !== undefined).length),
      temperatureRows: (enrichedStrings.filter((s: any) => s.maxCellTemperature !== undefined).length || baseStrings.filter((s: any) => s.maxCellTemperature !== undefined).length),
      sampleKeys: ["string_dashboard_base_ALL", "string_dashboard_enriched_ALL"]
    },
    siteDistribution: {
      rows: rows.length,
      voltageRows: voltRows,
      temperatureRows: tempRows
    },
    sampleCache: {
      exists: !!sampleCache,
      rows: Array.isArray(sampleCache?.data) ? sampleCache.data.length : 0,
      ageMs: sampleCache ? Date.now() - new Date(sampleCache.fetchedAt).getTime() : 0
    }
  });
});

export default router;
