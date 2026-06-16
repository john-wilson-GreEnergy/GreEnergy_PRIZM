import { Router } from "express";
import { getEmsCachedRawStrings, getEmsCachedBlock, getEmsStringIpMap, getEmsConnectionStatus } from "../emsTurtleClient";
import { getCommunicating, getOutRotation, getContactorsClosed } from "../../lib/stringClassifier";

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
}

function parseSafeNum(v: any): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function cleanTemp(val: any): number | undefined {
  let numVal = parseSafeNum(val);
  if (numVal === undefined) return undefined;
  if (Math.abs(numVal) > 100) {
    numVal = numVal / 10;
  }
  return numVal;
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

  return rawData.map((row: any) => {
    const arrayIndex = parseSafeNum(row.arrayIndex ?? row.arrayNumber ?? row.array ?? row.ArrayIndex ?? row.ArrayNumber) ?? 1;
    const stringIndex = parseSafeNum(row.stringIndex ?? row.stringNumber ?? row.string ?? row.StringIndex ?? row.StringNumber) ?? 1;
    
    const ipInfo = ipMap.find((ip: any) => ip.array === arrayIndex && ip.string === stringIndex);
    const ipAddress = row.ipAddress || row.ip || ipInfo?.ip || "Unknown";

    const label = row.displayLabel || row.label || row.location || `A${arrayIndex}-S${stringIndex}`;

    // Voltage field mapping:
    // Search and normalize from: stackVoltage, stackVoltageVdc, stackVoltageVDC, dcVoltage, dcVoltageVdc, vStack, stringVoltage
    const rawVolt = row.stackVoltage ?? row.stackVoltageVdc ?? row.stackVoltageVDC ?? row.dcVoltage ?? row.dcVoltageVdc ?? row.vStack ?? row.stringVoltage ?? row.voltageCalculated ?? row.voltageCalc ?? row.voltageMeasured ?? row.voltageMeas ?? row.calculatedVoltage ?? row.measuredVoltage ?? row.dcBusVoltage ?? row.voltage;
    const cleanVoltage = parseSafeNum(rawVolt);

    // Temperature field mapping:
    // Search and normalize from: maxCellTempC, maxCellTemperatureC, maxCellTemp, cellMaxTemp, maximumCellTemperature, avgCellTempC, averageCellTemperature, stackTemperatureC
    const rawMaxTemp = row.maxCellTempC ?? row.maxCellTemperatureC ?? row.maxCellTemp ?? row.cellMaxTemp ?? row.maximumCellTemperature ?? row.cellGroupTempMax ?? row.cellTempMax ?? row.maxCellGroupTemp;
    const rawAvgTemp = row.avgCellTempC ?? row.averageCellTemperature ?? row.cellGroupTempAvg ?? row.avgCellTemp ?? row.averageCellTemp ?? row.cellGroupTempMavg;
    const rawMinTemp = row.minCellTempC ?? row.minCellTemperatureC ?? row.minCellTemp ?? row.cellMinTemp ?? row.minimumCellTemperature ?? row.cellGroupTempMin ?? row.cellTempMin ?? row.minCellGroupTemp;
    const rawStackTemp = row.stackTemperatureC ?? row.stackTempC ?? row.stackTemperature ?? row.tempC ?? row.temperatureC;

    const maxCellTempC = cleanTemp(rawMaxTemp);
    const avgCellTempC = cleanTemp(rawAvgTemp);
    const minCellTempC = cleanTemp(rawMinTemp);
    const stackTemperatureC = cleanTemp(rawStackTemp);

    const socPct = parseSafeNum(row.soc ?? row.Soc ?? row.powerSoc);

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
      stackVoltage: cleanVoltage,
      stackVoltageVdc: cleanVoltage,
      dcVoltage: cleanVoltage,
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
      sourcePath: row.sourcePath || metaWrapper.source || "/tools/report/ems/strings.csv",
      raw: row
    };
  });
}

router.get("/strings", (req, res) => {
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

  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    source: sourceLabel,
    voltageMetric: "Stack Voltage Vdc",
    temperatureMetric,
    rows,
    rollups: {
      stringCount,
      communicatingCount,
      outOfRotationCount,
      notCommunicatingCount,
      voltageMin,
      voltageMax,
      voltageAvg,
      temperatureMin,
      temperatureMax,
      temperatureAvg
    }
  });
});

export default router;
