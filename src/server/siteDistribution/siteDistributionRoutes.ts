import { Router } from "express";
import { getEmsCachedRawStrings, getEmsCachedBlock, getEmsStringIpMap, getEmsConnectionStatus } from "../emsTurtleClient";
import { getCommunicating, getOutRotation, getContactorsClosed } from "../../lib/stringClassifier";
import * as prizmCache from "../cache/prizmCache";

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
    const arrayIndex = parseSafeNum(row.arrayIndex ?? row.arrayNumber ?? row.array ?? row.ArrayIndex ?? row.ArrayNumber) ?? 1;
    const stringIndex = parseSafeNum(row.stringIndex ?? row.stringNumber ?? row.string ?? row.StringIndex ?? row.StringNumber) ?? 1;
    
    const ipInfo = ipMap.find((ip: any) => ip.array === arrayIndex && ip.string === stringIndex);
    const dashRow = dashboardByKey.get(`${arrayIndex}:${stringIndex}`);
    const ipAddress = row.ipAddress || row.ip || ipInfo?.ip || dashRow?.stringControllerIp || "Unknown";

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
      dashRow?.stackVoltage,
      dashRow?.stackVoltageVdc,
      dashRow?.dcVoltage,
      dashRow?.measuredVoltage,
      dashRow?.calculatedVoltage,
      dashRow?.busVoltage,
      dashRow?.dcBusVoltage,
      dashRow?.voltageMeasured,
      dashRow?.voltageCalculated
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
      dashRow?.stackTemperatureC,
      dashRow?.temperatureC
    );

    const socPct = parseSafeNum(row.soc ?? row.Soc ?? row.powerSoc ?? dashRow?.socPct);

    const communicating = getCommunicating(row);
    const outRotation = getOutRotation(row);
    const inRotation = !outRotation;
    const contactorsClosed = getContactorsClosed(row);

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

export default router;
