import { Router } from "express";
import { getEmsCachedRawStrings, getEmsCachedBlock, getEmsStringIpMap, getEmsConnectionStatus } from "../emsTurtleClient";
import { getCommunicating, getOutRotation, getContactorsClosed } from "../../lib/stringClassifier";
import * as prizmCache from "../cache/prizmCache";
import { ProfileStore } from "../profiles/profileStore";

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

export function buildSiteDistributionRows(): SiteStringDistributionRow[] {
  const rawStringsWrapper = getEmsCachedRawStrings();
  const blockWrapper = getEmsCachedBlock();
  const ipMapWrapper = getEmsStringIpMap();
  const conn: any = getEmsConnectionStatus() || {};

  let rawData: any[] = [];
  let metaWrapper = rawStringsWrapper;

  if (rawStringsWrapper.data && rawStringsWrapper.data.length > 0) {
    rawData = rawStringsWrapper.data;
  } else if (blockWrapper.data && blockWrapper.data.strings && blockWrapper.data.strings.length > 0) {
    rawData = blockWrapper.data.strings;
    metaWrapper = blockWrapper;
  } else {
    const blockData = blockWrapper.data || {};
    rawData = blockData.strings || blockData.stringSummary?.tableRows || [];
    metaWrapper = blockWrapper;
  }

  let ipMap: any[] = [];
  if (ipMapWrapper && Array.isArray(ipMapWrapper.data)) {
    ipMap = ipMapWrapper.data;
  }

  // Fallback merge from PRIZM string dashboard cache
  const dashboardCacheBase = prizmCache.get<any>("string_dashboard_base_ALL");
  const dashboardCacheEnriched = prizmCache.get<any>("string_dashboard_enriched_ALL");
  const dashboardRows =
    dashboardCacheEnriched?.data?.strings ||
    dashboardCacheBase?.data?.strings ||
    [];

  const dashboardByKey = new Map<string, any>();
  for (const s of dashboardRows) {
    const a = Number(s.arrayNumber ?? s.arrayIndex ?? s.array);
    const st = Number(s.stringNumber ?? s.stringIndex ?? s.string);
    if (Number.isFinite(a) && Number.isFinite(st)) {
      dashboardByKey.set(`${a}:${st}`, s);
    }
  }

  return rawData.map((row: any) => {
    const normalizedObject: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) {
      normalizedObject[normalizeHeader(k)] = v;
    }

    const arrayIndex = pN(tryGetField(row, normalizedObject, ["array", "arrayindex", "arr", "arraynumber"]), 1) ?? 1;
    const stringIndex = pN(tryGetField(row, normalizedObject, ["string", "stringindex", "str", "stringnumber"]), 1) ?? 1;
    
    const ipInfo = ipMap.find((ip: any) => pN(ip.array) === arrayIndex && pN(ip.string) === stringIndex);
    const dashRow = dashboardByKey.get(`${arrayIndex}:${stringIndex}`);
    const ipAddress = tryGetField(row, normalizedObject, ["ip", "ipaddress", "stringcontrollerip", "controllerip"]) || ipInfo?.ip || dashRow?.stringControllerIp || "Unknown";

    const label = row.displayLabel || row.label || row.location || `A${arrayIndex}-S${stringIndex}`;

    // Best-available voltage selection
    const stackVoltage = firstNumeric(
      row.stackVoltage,
      row.stackVoltageVdc,
      row.stackVoltageVDC,
      row.dcVoltage,
      row.dcVoltageVdc,
      row.vStack,
      row.stringVoltage,
      row.voltageCalculated,
      row.voltageCalc,
      row.calculatedVoltage,
      row.calculatedStringVoltage,
      row.voltageMeasured,
      row.voltageMeas,
      row.measuredVoltage,
      row.measuredStringVoltage,
      row.voltageDcBus,
      row.voltageBus,
      row.dcBusVoltage,
      row.busVoltage,
      tryGetField(row, normalizedObject, [
        "measuredvoltage", "voltagemeasured", "voltagemeas", "voltage_measured", "measuredstringvoltage",
        "calculatedvoltage", "voltagecalculated", "voltagecalc", "voltage_calculated", "calculatedstringvoltage",
        "busvoltage", "voltagedcbus", "voltagebus", "voltage_bus", "dcbusvoltage",
        "stackvoltage", "stackvoltagevdc", "dcvoltage"
      ]),
      dashRow?.measuredVoltage,
      dashRow?.calculatedVoltage,
      dashRow?.busVoltage,
      dashRow?.stackVoltage,
      dashRow?.dcVoltage
    );

    // Best-available temperature selection
    const maxCellTempC = normalizeTemp(
      row.maxCellTempC,
      row.maxCellTemperatureC,
      row.maxCellTemp,
      row.cellMaxTemp,
      row.maximumCellTemperature,
      row.cellGroupTempMax,
      row.cellTempMax,
      row.maxCellGroupTemp,
      tryGetField(row, normalizedObject, [
        "maxcelltemperature", "maxcelltemp", "cellgrouptempmax", "celltempmax", "maxcellgrouptemp", "maxcelltempc"
      ]),
      dashRow?.maxCellTemperature,
      dashRow?.maxCellTemp,
      dashRow?.maxCellTempC,
      dashRow?.maxCellGroupTemp,
      dashRow?.maxCellTemperatureC
    );

    const avgCellTempC = normalizeTemp(
      row.avgCellTempC,
      row.averageCellTemperature,
      row.avgCellTemp,
      row.averageCellTemp,
      row.cellGroupTempAvg,
      row.avgCellGroupTemp,
      tryGetField(row, normalizedObject, [
        "avgcelltemperature", "avgcelltemp", "cellgrouptempavg", "avgcellgrouptemp", "averagecelltemp", "avgcelltempc"
      ]),
      dashRow?.avgCellTemperature,
      dashRow?.avgCellTemp,
      dashRow?.averageCellTemperature,
      dashRow?.avgCellTempC,
      dashRow?.avgCellGroupTemp
    );

    const minCellTempC = normalizeTemp(
      row.minCellTempC,
      row.minCellTemperatureC,
      row.minCellTemp,
      row.cellMinTemp,
      row.minimumCellTemperature,
      row.cellGroupTempMin,
      row.cellTempMin,
      row.minCellGroupTemp,
      tryGetField(row, normalizedObject, [
        "mincelltemperature", "mincelltemp", "cellgrouptempmin", "celltempmin", "mincellgrouptemp", "mincelltempc"
      ]),
      dashRow?.minCellTemperature,
      dashRow?.minCellTemp,
      dashRow?.minimumCellTemperature,
      dashRow?.minCellTempC,
      dashRow?.minCellGroupTemp
    );

    const stackTemperatureC = normalizeTemp(
      row.stackTemperatureC,
      row.stackTempC,
      row.stackTemperature,
      row.tempC,
      row.temperatureC,
      tryGetField(row, normalizedObject, ["stacktemperaturec", "stacktemp", "stacktemperature", "tempc", "temperaturec"]),
      dashRow?.stackTemperatureC,
      dashRow?.temperatureC
    );

    const socPct = pN(row.soc ?? row.Soc ?? row.powerSoc ?? tryGetField(row, normalizedObject, ["soc", "powersoc", "socpct"]) ?? dashRow?.socPct);

    let communicating = getCommunicating(row);
    if (communicating === undefined || communicating === null) {
      if (dashRow?.operationalState !== undefined) {
         communicating = dashRow.operationalState !== "OFFLINE";
      } else {
         communicating = true;
      }
    }

    let outRotation = getOutRotation(row);
    if (outRotation === undefined || outRotation === null) {
      outRotation = dashRow?.outRotation ?? false;
    }
    const inRotation = !outRotation;

    let contactorsClosed = getContactorsClosed(row);
    if (contactorsClosed === undefined || contactorsClosed === null) {
      contactorsClosed = dashRow?.contactorClosed ?? false;
    }

    const explicitDisconnected = (
      row.connected === false || 
      row.connected === "false" ||
      String(row.connectionState || row.StringConnectionState || '').toLowerCase().includes('offline') ||
      String(row.connectionState || row.StringConnectionState || '').toLowerCase().includes('disconnected')
    );

    let statusColor: "green" | "red" | "yellow" | "gray" = "gray";
    let statusLabel = "Not Communicating";

    if (!communicating) {
      statusColor = "gray";
      statusLabel = "Not Communicating";
    } else if (inRotation && explicitDisconnected) {
      statusColor = "red";
      statusLabel = "Disconnected and In Rotation";
    } else if (!inRotation || outRotation) {
      statusColor = "yellow";
      statusLabel = "Out of Rotation";
    } else if (communicating && inRotation) {
      statusColor = "green";
      statusLabel = "Connected and In Rotation";
    } else {
      statusColor = "gray";
      statusLabel = "Unknown";
    }

    return {
      stationCode: conn.discoveredStationCode || conn.stationCode || "BHE0021",
      blockIndex: conn.blockIndex || 1,
      arrayIndex,
      stringIndex,
      ip: ipAddress,
      displayLabel: label,
      stackVoltage,
      stackVoltageVdc: stackVoltage,
      dcVoltage: stackVoltage,
      maxCellTempC,
      minCellTempC,
      avgCellTempC,
      stackTemperatureC,
      socPct,
      communicating,
      inRotation,
      outRotation,
      contactorsClosed,
      statusColor,
      statusLabel,
      sourcePath: dashRow ? "strings-dashboard-cache + live" : (row.sourcePath || metaWrapper.source || "live"),
      metricSource: {
        voltage: stackVoltage !== undefined
          ? (dashRow ? "strings-dashboard-cache" : "site-distribution-source")
          : "unavailable",
        temperature: (maxCellTempC !== undefined || avgCellTempC !== undefined || stackTemperatureC !== undefined)
          ? (dashRow ? "strings-dashboard-cache" : "site-distribution-source")
          : "unavailable"
      }
    };
  });
}

router.get("/strings", (req, res) => {
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

  const rows = buildSiteDistributionRows();

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

  const responsePayload: any = {
    success: true,
    timestamp: new Date().toISOString(),
    source: sourceLabel,
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
  baseMap: Map<string, any>
): { value: number | undefined; source: string } {
  const key = `${arrayIndex}:${stringIndex}`;
  const sources = [
    { name: "stringviewer-sampled", data: sampleMap.get(key) },
    { name: "string-dashboard-cache", data: enrichedMap.get(key) },
    { name: "string-dashboard-cache", data: baseMap.get(key) },
    { name: "site-distribution", data: row }
  ];

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

  return { value: undefined, source: "unavailable" };
}

function resolveTemperature(
  arrayIndex: number,
  stringIndex: number,
  row: any,
  sampleMap: Map<string, any>,
  enrichedMap: Map<string, any>,
  baseMap: Map<string, any>
): { value: number | undefined; source: string } {
  const key = `${arrayIndex}:${stringIndex}`;
  const sources = [
    { name: "stringviewer-sampled", data: sampleMap.get(key) },
    { name: "string-dashboard-cache", data: enrichedMap.get(key) },
    { name: "string-dashboard-cache", data: baseMap.get(key) },
    { name: "site-distribution", data: row }
  ];

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
  return { value: undefined, source: "unavailable" };
}

function getPointStatus(
  v: number | undefined,
  t: number | undefined,
  communicating: boolean,
  inRotation: boolean,
  lowVolt: number = 900,
  warningVolt: number = 1200,
  alarmVolt: number = 1400,
  lowTemp: number = 5,
  warningTemp: number = 45,
  alarmTemp: number = 55
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

  const isVoltageAlarm = v !== undefined && v >= alarmVolt;
  const isTempAlarm = t !== undefined && t >= alarmTemp;

  if (isVoltageAlarm || isTempAlarm) {
    const reasons: string[] = [];
    if (isVoltageAlarm) reasons.push(`Overvoltage Alarm (>= ${alarmVolt}V)`);
    if (isTempAlarm) reasons.push(`Overtemp Alarm (>= ${alarmTemp}°C)`);
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
    if (isVoltageWarningHigh) reasons.push(`Voltage Warning High (>= ${warningVolt}V)`);
    if (isVoltageWarningLow) reasons.push(`Voltage Warning Low (<= ${lowVolt}V)`);
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
  const refreshRequested = req.query.refresh === "true" || req.query.sample === "true";
  const sampleRequested = req.query.sample === "true";

  const rows = buildSiteDistributionRows();

  const baseVoltageRows = rows.filter(r => r.stackVoltage !== undefined && r.stackVoltage !== null).length;
  const baseTempRows = rows.filter(r => r.maxCellTempC !== undefined && r.maxCellTempC !== null).length;

  let isSampled = false;
  let cacheHit = true;

  const sampleParamsExist = req.query.refresh === "true" || req.query.sample === "true";
  const needsSampling = baseVoltageRows === 0 && baseTempRows === 0 && sampleParamsExist;

  const cacheKey = "site_health_graph_sample_ALL";

  if (needsSampling) {
    isSampled = true;
    cacheHit = false;

    const profile = ProfileStore.getActiveProfile();
    const baseUrl = profile ? `http://${profile.emsHost}:${profile.emsPort}${profile.turtlePath}` : "unknown";

    if (baseUrl !== "unknown") {
      let targets: { arrayIndex: number; stringIndex: number }[] = [];
      const arrayParam = req.query.array ? Number(req.query.array) : undefined;

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
                outRotation: sv.outRotation ?? sv.outRotationState
              });
            }
          }
        } catch (e) {
          // Ignore fetch error
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

      prizmCache.set(cacheKey, sampledResults, { ttlMs: 60000 });
      if (arrayParam !== undefined && Number.isFinite(arrayParam)) {
        prizmCache.set(`site_health_graph_sample_ARRAY_${arrayParam}`, sampledResults, { ttlMs: 60000 });
      }
    }
  }

  const dashboardCacheEnriched = prizmCache.get<any>("string_dashboard_enriched_ALL");
  const dashboardCacheBase = prizmCache.get<any>("string_dashboard_base_ALL");
  const enrichedStrings = dashboardCacheEnriched?.data?.strings || [];
  const baseStrings = dashboardCacheBase?.data?.strings || [];

  const enrichedMap = new Map<string, any>();
  for (const s of enrichedStrings) {
    const a = s.arrayIndex ?? s.arrayNumber ?? s.array;
    const st = s.stringIndex ?? s.stringNumber ?? s.string;
    if (a !== undefined && st !== undefined) {
      enrichedMap.set(`${a}:${st}`, s);
    }
  }

  const baseMap = new Map<string, any>();
  for (const s of baseStrings) {
    const a = s.arrayIndex ?? s.arrayNumber ?? s.array;
    const st = s.stringIndex ?? s.stringNumber ?? s.string;
    if (a !== undefined && st !== undefined) {
      baseMap.set(`${a}:${st}`, s);
    }
  }

  const sampleCache = prizmCache.get<any>(cacheKey);
  const sampleMap = new Map<string, any>();
  if (sampleCache && Array.isArray(sampleCache.data)) {
    for (const s of sampleCache.data) {
      sampleMap.set(`${s.arrayIndex}:${s.stringIndex}`, s);
    }
  }

  const lowVolt = req.query.lowVolt ? Number(req.query.lowVolt) : 900;
  const warningVolt = req.query.warningVolt ? Number(req.query.warningVolt) : 1200;
  const alarmVolt = req.query.alarmVolt ? Number(req.query.alarmVolt) : 1400;

  const lowTemp = req.query.lowTemp ? Number(req.query.lowTemp) : 5;
  const warningTemp = req.query.warningTemp ? Number(req.query.warningTemp) : 45;
  const alarmTemp = req.query.alarmTemp ? Number(req.query.alarmTemp) : 55;

  const points: any[] = [];

  let sourceCountSampled = 0;
  let sourceCountDashboard = 0;
  let sourceCountDist = 0;

  for (const row of rows) {
    const { arrayIndex, stringIndex } = row;

    const voltRes = resolveVoltage(arrayIndex, stringIndex, row, sampleMap, enrichedMap, baseMap);
    const tempRes = resolveTemperature(arrayIndex, stringIndex, row, sampleMap, enrichedMap, baseMap);

    if (voltRes.source.includes("sampled") || tempRes.source.includes("sampled")) {
      sourceCountSampled++;
    } else if (voltRes.source.includes("dashboard") || tempRes.source.includes("dashboard")) {
      sourceCountDashboard++;
    } else if (voltRes.source.includes("distribution") || tempRes.source.includes("distribution")) {
      sourceCountDist++;
    }

    const dSample = sampleMap.get(`${arrayIndex}:${stringIndex}`);
    const dEnriched = enrichedMap.get(`${arrayIndex}:${stringIndex}`);
    const dBase = baseMap.get(`${arrayIndex}:${stringIndex}`);
    const socPct = firstNumeric(dSample?.socPct, dEnriched?.socPct, dBase?.socPct, row.socPct);

    const communicating = dSample?.operationalState !== undefined
      ? dSample.operationalState !== "OFFLINE"
      : row.communicating;

    const outRotation = dSample?.outRotation !== undefined
      ? dSample.outRotation
      : row.outRotation ?? !row.inRotation;

    const inRotation = !outRotation;

    const style = getPointStatus(
      voltRes.value,
      tempRes.value,
      communicating,
      inRotation,
      lowVolt,
      warningVolt,
      alarmVolt,
      lowTemp,
      warningTemp,
      alarmTemp
    );

    const pt: any = {
      id: row.displayLabel || `A${arrayIndex}-S${stringIndex}`,
      arrayIndex,
      stringIndex,
      displayLabel: row.displayLabel || `A${arrayIndex}-S${stringIndex}`,
      ip: row.ip || dEnriched?.stringControllerIp || dBase?.stringControllerIp || "Unknown",
      voltage: voltRes.value,
      temperature: tempRes.value,
      socPct,
      communicating,
      inRotation,
      statusColor: style.statusColor,
      statusLabel: style.statusLabel,
      metricSource: {
        voltage: voltRes.source,
        temperature: tempRes.source
      },
      sourcePath: row.sourcePath
    };

    if (req.query.includeRaw === "true") {
      pt.raw = {
        row,
        sample: dSample,
        enriched: dEnriched,
        base: dBase
      };
    }

    points.push(pt);
  }

  let sourceMode = "hybrid";
  if (isSampled) {
    sourceMode = "stringviewer-sampled";
  } else if (sourceCountSampled > sourceCountDashboard && sourceCountSampled > sourceCountDist) {
    sourceMode = "stringviewer-sampled";
  } else if (sourceCountDashboard > sourceCountSampled && sourceCountDashboard > sourceCountDist) {
    sourceMode = "string-dashboard-cache";
  } else if (sourceCountDist > sourceCountSampled && sourceCountDashboard > sourceCountDashboard) {
    sourceMode = "site-distribution";
  }

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

router.get("/graph/debug", (req, res) => {
  const dashboardCacheBase = prizmCache.get<any>("string_dashboard_base_ALL");
  const dashboardCacheEnriched = prizmCache.get<any>("string_dashboard_enriched_ALL");
  const sampleCache = prizmCache.get<any>("site_health_graph_sample_ALL");

  const baseStrings = dashboardCacheBase?.data?.strings || [];
  const enrichedStrings = dashboardCacheEnriched?.data?.strings || [];

  const rows = buildSiteDistributionRows();
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
