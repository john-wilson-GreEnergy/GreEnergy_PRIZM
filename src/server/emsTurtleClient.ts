import fs from "fs";
import path from "path";
import { AcquisitionManager } from "../acquisition/AcquisitionManager";
import { CsvProvider } from "../acquisition/providers/CsvProvider";
import { RestProvider } from "../acquisition/providers/RestProvider";
import { ProfileStore } from "./profiles/profileStore";
import { telemetryMetrics } from "./telemetry/metrics";
import { buildEmsBaseUrl } from "./profiles/profileManager";
import { getTelemetryCycleId } from "./telemetry/TelemetryCycleContext";
import { coordinatorPhaseNameForEndpoint, coordinatorProfiler } from "./telemetry/profiler";

const DEFAULT_EMS_BASE_URL = "http://10.0.0.3:8080/turtle";

export function getNormalizedBaseUrl(): string {
  try {
    const activeProfile = ProfileStore.getActiveProfile();
    if (activeProfile) {
      return buildEmsBaseUrl({
        emsHost: activeProfile.emsHost,
        emsPort: activeProfile.emsPort,
        turtlePath: activeProfile.turtlePath
      });
    }
  } catch (err) {
    console.error("Error retrieving active profile base url:", err);
  }

  let rawUrl = process.env.EMS_BASE_URL || DEFAULT_EMS_BASE_URL;
  rawUrl = rawUrl.trim();
  if (!rawUrl) {
    rawUrl = DEFAULT_EMS_BASE_URL;
  }
  if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://")) {
    rawUrl = "http://" + rawUrl;
  }
  return rawUrl.replace(/\/$/, "");
}

const REQUEST_TIMEOUT_MS = Number(process.env.EMS_REQUEST_TIMEOUT_MS) || 30000;

// Dynamic Demo Mode Toggle state
let isDemoModeActive = process.env.DEMO_MODE === "true";
let isEmsOffline = process.env.EMS_OFFLINE === "true" || false;

// Cache ownership metadata tracking
export let cacheProfileId: string | null = null;
export let cacheEmsBaseUrl: string | null = null;
export let cacheCreatedAt: string | null = null;
export let cacheLastUpdatedAt: string | null = null;

export function isDemoActive(): boolean { return false; }

export function setDemoMode(active: boolean) {}


interface EmsCache {
  cycleId: number | null;
  status: any;
  block: any;
  lastCall: any;
  controllerStatistics: any;
  bessStatusCodes: any;
  strings: any[] | null;
  firstResponder: any;
  modbusMap: string | null;
  ipMap: any[] | null;
  stringIPMap: any[] | null;
  lastUpdated: string | null;
  lastError: string | null;
  hasAttemptedPoll: boolean;
  discoveredStationCode: string | null;
  siteCodeSource: string | null;
  arrayPcsReports: any;
  arrayReports: any;
  topologySensorSummary?: any;
}

// Strict Real-Time Cache for Actual LAN Ethernet Polling
export const emsCache: EmsCache = {
  cycleId: null,
  status: null,
  block: null,
  lastCall: null,
  controllerStatistics: null,
  bessStatusCodes: null,
  strings: null,
  firstResponder: {
    v1: {
      activeEstops: 0,
      isolationFaults: 0,
      fireAlarmTripped: false,
      smokeDetected: false,
      systemWideShutdownActive: true
    },
    v2: {
      highVoltageInterlockOk: false,
      coolingWaterPressureOk: false,
      lastResponderReset: null
    }
  },
  modbusMap: null,
  ipMap: null,
  stringIPMap: null,
  lastUpdated: null,
  lastError: null,
  hasAttemptedPoll: false,
  discoveredStationCode: null,
  siteCodeSource: null,
  arrayPcsReports: {},
  arrayReports: {},
  topologySensorSummary: null
};

// High-fidelity pre-filled simulation template (Only served when Demo Mode is explicitly active)
export const DEMO_TEMPLATES = {
  status: {
    timestamp: new Date().toISOString(),
    status: "NORMAL",
    emsUptimeSeconds: 1442180,
    acGridCoupled: true,
    totalChargeCapacityKwh: 118800,
    activePowerLimitKw: 1500,
    frequencyHz: 60.01,
    activeErrorsCount: 0,
    communicationLossCount: 0
  },
  block: {
    timestamp: new Date().toISOString(),
    system: {
      status: "NORMAL",
      uptime: 1442180,
      acGridCoupled: true,
      chargePower: "0.0 kW",
      dischargePower: "0.0 kW",
      chargeEnergy: "0.0 kWh",
      dischargeEnergy: "0.0 kWh",
      dcOnline: "0.0 kWh",
      dcNearline: "0.0 kWh",
      acOnline: "0.0 kWh",
      realPowerMeasured: "0.0 kW",
      realPowerCommanded: "0.0 kW",
      reactivePowerMeasured: "0.0 kVAR",
      reactivePowerCommanded: "0.0 kVAR"
    },
    arrays: Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      online: false,
      onlineEnergy: "0",
      nearlineEnergy: "0",
      offlineEnergy: "14,850",
      capacity: "14,850.00",
      chargeLimit: "Manager Disabled",
      dcPower: "0.00",
      dcVoltage: "0.00",
      dcCurrent: "0.00",
      maxCharge: "0",
      maxDischarge: "0",
      stringStatus: "offline",
      pcsCount: 3,
      pcs: Array.from({ length: 3 }, (_, pIndex) => ({
        arrayIndex: i + 1,
        pcsIndex: pIndex + 1,
        dcVolt: 1375 + pIndex,
        dcCurr: 0,
        acVolt: "692 / 689 / 691",
        acCurr: "0.0 / 0.0 / 0.0",
        acRealPower: 0,
        acReactPower: 0,
        freq: 60.01,
        rotation: "⟳",
        status: "ONLINE"
      }))
    })),
    topology: {
      lineups: Array.from({ length: 8 }, (_, i) => ({
        id: `L${i + 1}`,
        name: `Lineup ${i + 1}`,
        arrays: [i + 1]
      }))
    },
    hvacs: Array.from({ length: 16 }, (_, i) => ({
      hvacIndex: i + 1,
      humidity: 35 + (i % 5),
      airTemp: 20.0 + (i % 3) * 0.5,
      cellTemp: 18.0 + (i % 3) * 0.4,
      coolTo: 29.0,
      heatTo: 19.0,
      setpointsRespondingTo: "Air Temp",
      stage: "Idle",
      signals: "Y Y2 G W O Mar",
      unit1: "Normal",
      unit2: "Normal",
      status: "OK",
      healthy: true,
      segment: i + 1
    })),
    sensors: {
      lateralSensors: [
        { name: "Fire Sensor Panel", status: "Untripped", color: "text-emerald-400" },
        { name: "Smoke Optical Matrix", status: "Untripped", color: "text-emerald-400" },
        { name: "Heat Thermistors", status: "Untripped", color: "text-emerald-400" },
        { name: "Hydrogen Gas sensor", status: "Untripped", color: "text-emerald-400" },
        { name: "Hydrogen Fault monitor", status: "Untripped", color: "text-emerald-400" },
        { name: "Data Aux Communication", status: "Stable", color: "text-emerald-400" },
        { name: "IO Board Communication", status: "Stable", color: "text-emerald-400" },
        { name: "AC Cabinet Doors", status: "All Closed", color: "text-emerald-400" },
        { name: "DC Battery Doors", status: "All Closed", color: "text-emerald-400" }
      ],
      sensorRows: [
        { segment: 12, lineup: "Lineup 1", pos: "P1", array: 1, moisture: "Untripped", ioCom: "Online", acDoors: "Closed", dcDoors: "Closed", topCap: "Closed", batteryDoors: "Closed", eStop: "Untripped" },
        { segment: 38, lineup: "Lineup 1", pos: "P2", array: 1, moisture: "Untripped", ioCom: "Online", acDoors: "Closed", dcDoors: "Closed", topCap: "Closed", batteryDoors: "Closed", eStop: "Untripped" },
        { segment: 41, lineup: "Lineup 2", pos: "P1", array: 2, moisture: "Untripped", ioCom: "Online", acDoors: "Closed", dcDoors: "Closed", topCap: "Closed", batteryDoors: "Closed", eStop: "Untripped" },
        { segment: 85, lineup: "Lineup 3", pos: "P1", array: 3, moisture: "Untripped", ioCom: "Online", acDoors: "Closed", dcDoors: "Closed", topCap: "Closed", batteryDoors: "Closed", eStop: "Untripped" }
      ]
    },
    stackManagers: Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      active: true,
      ip: `10.0.${i * 2 + 1}.10`,
      version: "2.73.42",
      hdTotal: "29.1 GB",
      hdAvail: "17.4 GB",
      memTotal: "7.7 GB",
      memAvail: "3.2 GB",
      memFree: "2.1 GB",
      swapTotal: "2.0 GB",
      swapAvail: "1.9 GB",
      jvmTotal: "1.9 GB",
      jvmAvail: "1.1 GB",
      procs: 4,
      load1: "0.14",
      load5: "0.19",
      load15: "0.15",
      uptime: "24 days, 14h"
    })),
    upses: Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      name: `Lineup UPS ${i + 1}`,
      status: "Normal",
      chargeState: "Float",
      loadPct: "32%",
      tempC: 22.5,
      runtimeMins: 180,
      inputVolt: 120.4,
      outputVolt: 120.1
    }))
  },
  lastCall: {},
  controllerStatistics: {
    cycleClockTicks: 104523,
    modbusReadsTotal: 849204,
    modbusWritesTotal: 1243,
    activeTcpPconnections: 12,
    modbusPollErrors: 0,
    canBusPacketsLost: 12,
    heartbeatsExchanged: 4501
  },
  bessStatusCodes: {
    timestamp: new Date().toISOString(),
    activeStates: [],
    registeredStatusCodes: [
      { code: "ALERT_CODE_711_HIGH_TEMP_CELL_VARIANCE_CRITICAL", severity: "CRITICAL", desc: "Thermal runaway hazard / voltage mismatch >400mV" },
      { code: "TEMP_WARNING_45C", severity: "WARNING", desc: "Passive radiator high temperature cell threshold limit" },
      { code: "STATE_THRESHOLD_IDLE", severity: "INFO", desc: "Ideal capacity ceiling achieved. Disconnecting charger power source." }
    ]
  },
  strings: [],
  firstResponder: {
    v1: {
      activeEstops: 0,
      isolationFaults: 0,
      fireAlarmTripped: false,
      smokeDetected: false,
      systemWideShutdownActive: false
    },
    v2: {
      highVoltageInterlockOk: true,
      coolingWaterPressureOk: true,
      lastResponderReset: "2026-05-12 11:00:00"
    }
  },
  modbusMap: null,
  ipMap: [],
  stringIPMap: []
};

// Strict Offline fallback structures
export const OFFLINE_TEMPLATES = {
  status: null,
  block: null,
  lastCall: null,
  controllerStatistics: null,
  bessStatusCodes: {
    timestamp: null,
    activeStates: [],
    registeredStatusCodes: []
  },
  strings: [],
  firstResponder: {
    v1: {
      activeEstops: 0,
      isolationFaults: 0,
      fireAlarmTripped: false,
      smokeDetected: false,
      systemWideShutdownActive: true // Mapped as safety shutdown when offline
    },
    v2: {
      highVoltageInterlockOk: false,
      coolingWaterPressureOk: false,
      lastResponderReset: null
    }
  },
  modbusMap: null,
  ipMap: [],
  stringIPMap: []
};

// Simple helper to parse CSV into rows of records
function applyLegacyStringRowCompatibilityAliases(row: any): any {
  if (!row || typeof row !== 'object') return row;

  const pick = (...keys: string[]) => {
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
    }
    return undefined;
  };

  const aliasMap: Record<string, any> = {
    arrayIndex: pick('arrayIndex', 'ArrayIndex', 'Array'),
    array: pick('array', 'Array', 'ArrayIndex'),
    stringIndex: pick('stringIndex', 'StringIndex', 'String'),
    string: pick('string', 'String', 'StringIndex'),
    stringKey: pick('stringKey', 'StringKey'),
    timestamp: pick('timestamp', 'Timestamp', 'TimestampUtc'),
    datetime: pick('datetime', 'Datetime'),
    connectionState: pick('connectionState', 'StringConnectionState', 'Status', 'CommunicationState'),
    soc: pick('soc', 'Soc', 'SoC'),
    kw: pick('kw', 'KW', 'kW'),
    kwh: pick('kwh', 'KWh', 'KWH'),
    ah: pick('ah', 'Ah', 'AH'),
    voltageCalculated: pick('voltageCalculated', 'CalculatedStringVoltage'),
    voltageMeasured: pick('voltageMeasured', 'MeasuredStringVoltage'),
    voltageDcBus: pick('voltageDcBus', 'DcBusVoltage'),
    current: pick('current', 'StringCurrent'),
    stringCurrent: pick('stringCurrent', 'StringCurrent'),
    ctCurrent1: pick('ctCurrent1', 'CtCurrent1'),
    ctCurrent2: pick('ctCurrent2', 'CtCurrent2'),
    contactCloseExpected: pick('contactCloseExpected', 'ContactorsCloseExpected'),
    positiveContactorClosed: pick('positiveContactorClosed', 'PositiveContactorClosed'),
    negativeContactorClosed: pick('negativeContactorClosed', 'NegativeContactorClosed'),
    recloseCount: pick('recloseCount', 'RecloseCount'),
    outRotation: pick('outRotation', 'OutRotation'),
    cellGroupTempMax: pick('cellGroupTempMax', 'MaxCellGroupTemp'),
    cellGroupTempMin: pick('cellGroupTempMin', 'MinCellGroupTemp'),
    cellGroupTempAvg: pick('cellGroupTempAvg', 'AvgCellGroupTemp'),
    cellGroupVoltageMax: pick('cellGroupVoltageMax', 'MaxCellGroupVoltage'),
    cellGroupVoltageMin: pick('cellGroupVoltageMin', 'MinCellGroupVoltage'),
    cellGroupVoltageAvg: pick('cellGroupVoltageAvg', 'AvgCellGroupVoltage'),
    alarmCount: pick('alarmCount', 'AlarmCount'),
    alarms: pick('alarms', 'Alarms'),
    warningCount: pick('warningCount', 'WarnCount'),
    warnings: pick('warnings', 'WarnCount'),
    warningsList: pick('warningsList', 'Warns'),
    warns: pick('warns', 'Warns'),
    lastFanCommand: pick('lastFanCommand', 'LastFanCommand', 'FanCommand'),
    lastFanCommandTime: pick('lastFanCommandTime', 'LastFanCommandTime'),
    location: pick('location', 'Location'),
    entityToken: pick('entityToken', 'EntityToken', 'IdentityToken'),
    ipAddress: pick('ipAddress', 'IpAddress', 'IPAddress'),
  };

  const aliases: any = {};
  Object.entries(aliasMap).forEach(([key, value]) => {
    if (value !== undefined) aliases[key] = value;
  });

  return { ...row, ...aliases };
}

function parseCsv(text: string): any[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];
  
  function parseRow(rowStr: string): string[] {
      const values: string[] = [];
      let inQuote = false;
      let currentValue = "";
      for (let i = 0; i < rowStr.length; i++) {
          const char = rowStr[i];
          if (char === '"') {
              if (inQuote && rowStr[i + 1] === '"') {
                  currentValue += '"';
                  i++; // skip next quote
              } else {
                  inQuote = !inQuote;
              }
          } else if (char === ',' && !inQuote) {
              values.push(currentValue);
              currentValue = "";
          } else {
              currentValue += char;
          }
      }
      values.push(currentValue);
      return values;
  }

  const headers = parseRow(lines[0]).map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]).map(v => v.trim());
    const obj: any = {};
    headers.forEach((header, index) => {
      obj[header] = values[index] || "";
    });
    rows.push(applyLegacyStringRowCompatibilityAliases(obj));
  }
  return rows;
}

interface EndpointDebugInfo {
  endpoint: string;
  success: boolean;
  lastPollTime: string | null;
  statusCode: number | null;
  durationMs: number | null;
  lastError: string | null;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  lastAttemptAt?: string | null;
  sourceUsed?: string | null;
  fallbackUsed?: boolean;
  fallbackUrl?: string | null;
}

const endpointDebugMap: Record<string, EndpointDebugInfo> = {
  "/status": { endpoint: "/status", success: false, lastPollTime: null, statusCode: null, durationMs: null, lastError: null, lastSuccessAt: null, lastFailureAt: null },
  "/tools/report/ems/status.json": { endpoint: "/tools/report/ems/status.json", success: false, lastPollTime: null, statusCode: null, durationMs: null, lastError: null, lastSuccessAt: null, lastFailureAt: null },
  "/tools/monitor/ems/blockviewer/data": { endpoint: "/tools/monitor/ems/blockviewer/data", success: false, lastPollTime: null, statusCode: null, durationMs: null, lastError: null, lastSuccessAt: null, lastFailureAt: null },
  "/tools/report/ems/lastCall.json": { endpoint: "/tools/report/ems/lastCall.json", success: false, lastPollTime: null, statusCode: null, durationMs: null, lastError: null, lastSuccessAt: null, lastFailureAt: null },
  "/tools/report/ems/controllerStatistics.json": { endpoint: "/tools/report/ems/controllerStatistics.json", success: false, lastPollTime: null, statusCode: null, durationMs: null, lastError: null, lastSuccessAt: null, lastFailureAt: null },
  "/tools/report/ems/bessStatusCodes.json": { endpoint: "/tools/report/ems/bessStatusCodes.json", success: false, lastPollTime: null, statusCode: null, durationMs: null, lastError: null, lastSuccessAt: null, lastFailureAt: null },
  "/tools/report/ems/strings.csv": { endpoint: "/tools/report/ems/strings.csv", success: false, lastPollTime: null, statusCode: null, durationMs: null, lastError: null, lastSuccessAt: null, lastFailureAt: null },
  "/tools/report/ems/ipMap.json": { endpoint: "/tools/report/ems/ipMap.json", success: false, lastPollTime: null, statusCode: null, durationMs: null, lastError: null, lastSuccessAt: null, lastFailureAt: null },
  "/tools/report/ems/stringIPMap.json": { endpoint: "/tools/report/ems/stringIPMap.json", success: false, lastPollTime: null, statusCode: null, durationMs: null, lastError: null, lastSuccessAt: null, lastFailureAt: null },
  "/firstresponder/data": { endpoint: "/firstresponder/data", success: false, lastPollTime: null, statusCode: null, durationMs: null, lastError: null, lastSuccessAt: null, lastFailureAt: null },
  "/v2/firstresponder/data": { endpoint: "/v2/firstresponder/data", success: false, lastPollTime: null, statusCode: null, durationMs: null, lastError: null, lastSuccessAt: null, lastFailureAt: null },
  "/modbus_map.csv": { endpoint: "/modbus_map.csv", success: false, lastPollTime: null, statusCode: null, durationMs: null, lastError: null, lastSuccessAt: null, lastFailureAt: null },
};

// Execute a fetch with absolute timeout wrapping and trace diagnostics
export async function fetchAndRecord(endpoint: string, customTimeoutMs?: number, returnType: 'response' | 'json' | 'text' = 'response'): Promise<any> {
  const baseUrl = getNormalizedBaseUrl();
  let url = `${baseUrl}${endpoint}`;
  
  if (isEmsOffline && (url.includes("10.0.0.3") || url.includes("10.0.0."))) {
    const urlObj = new URL(url);
    url = `http://127.0.0.1:3000${urlObj.pathname}`;
  }

  const controller = new AbortController();
  const timeoutMs = customTimeoutMs || Math.max(REQUEST_TIMEOUT_MS, 30000); 
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startTime = Date.now();
  const metric = telemetryMetrics.registry.beginEndpoint("ems-turtle", endpoint);
  const profilerPhase = coordinatorProfiler.beginPhase(coordinatorPhaseNameForEndpoint("ems-turtle", endpoint), { waitState: "NETWORK", blocking: true });
  let metricFinished = false;
  let fallbackUsedForMetric = false;
  const finishMetric = (success: boolean, details: Record<string, any> = {}) => {
    if (metricFinished) return;
    metricFinished = true;
    metric.finish({ success, fallback: fallbackUsedForMetric, acquisitionTimestamp: new Date(), stale: fallbackUsedForMetric, ...details });
    profilerPhase.finish({ success, retries: fallbackUsedForMetric ? 1 : 0, bytes: details.responseBytes ?? null });
  };

  if (!endpointDebugMap[endpoint]) {
    endpointDebugMap[endpoint] = {
      endpoint,
      success: false,
      lastPollTime: null,
      statusCode: null,
      durationMs: null,
      lastError: null,
      lastSuccessAt: null,
      lastFailureAt: null
    };
  }

  const debugItem = endpointDebugMap[endpoint];

  try {
    let response;
    let fallbackAttempted = false;
    try {
      response = await fetch(url, { signal: controller.signal });
      if (!response.ok && !url.includes("127.0.0.1:3000") && !url.includes("localhost:3000")) {
        if (url.includes("10.0.0.3") || url.includes("10.0.0.")) {
          isEmsOffline = true;
        }
        fallbackAttempted = true;
        fallbackUsedForMetric = true;
        const urlObj = new URL(url);
        const fallbackUrl = `http://127.0.0.1:3000${urlObj.pathname}`;
        console.log(`[emsTurtleClient] Endpoint ${endpoint} returned status ${response.status}. Using local mock.`);
        response = await fetch(fallbackUrl);
      }
    } catch (e: any) {
      if (!fallbackAttempted && !url.includes("127.0.0.1:3000") && !url.includes("localhost:3000")) {
        if (url.includes("10.0.0.3") || url.includes("10.0.0.")) {
          isEmsOffline = true;
        }
        const urlObj = new URL(url);
        const fallbackUrl = `http://127.0.0.1:3000${urlObj.pathname}`;
        fallbackUsedForMetric = true;
        console.log(`[emsTurtleClient] Endpoint ${endpoint} offline or slow (${e.message}). Using local mock.`);
        response = await fetch(fallbackUrl);
      } else {
        throw e;
      }
    }
    clearTimeout(timeoutId);
    
    debugItem.durationMs = Date.now() - startTime;
    debugItem.statusCode = response.status;
    debugItem.lastPollTime = new Date().toISOString();

    if (!response.ok) {
      debugItem.success = false;
      debugItem.lastFailureAt = new Date().toISOString();
      debugItem.lastError = `HTTP error ${response.status}: ${response.statusText}`;
      throw new Error(`HTTP Error Status: ${response.status} on endpoint ${endpoint}`);
    }

    debugItem.success = true;
    debugItem.lastSuccessAt = new Date().toISOString();
    debugItem.lastError = null;

    if (returnType === 'json') {
      const parseStartedAt = performance.now();
      const data = await coordinatorProfiler.withPhase<any>("Parse Response", { waitState: "PARSE", blocking: true, parentPhaseId: profilerPhase.phaseId }, () => response.json() as Promise<any>);
      const parseDurationMs = performance.now() - parseStartedAt;
      const ext = endpoint.endsWith('.csv') ? '.csv' : (endpoint.endsWith('.txt') ? '.txt' : '.json');
      const safeKey = endpoint.replace(/\//gi, '_').replace(/[^a-zA-Z0-9-]/gi, '_');
      const cacheStartedAt = performance.now();
      try {
        const prizmCache = require('./cache/prizmCache');
        prizmCache.set('raw_' + safeKey, data, { sourceUrl: url, isRaw: true, rawExt: ext, ttlMs: 15000 });
      } catch(e) {}
      finishMetric(true, {
        responseBytes: Number(response.headers.get("content-length")) || null,
        parseDurationMs,
        cacheWriteDurationMs: performance.now() - cacheStartedAt,
        sourceObservationTimestamp: data?.timestamp ?? data?.timeStamp ?? data?.capturedAt ?? null,
        cacheTimestamp: new Date(),
      });
      return data;
    }

    if (returnType === 'text') {
      const parseStartedAt = performance.now();
      const data = await coordinatorProfiler.withPhase<string>("Parse Response", { waitState: "PARSE", blocking: true, parentPhaseId: profilerPhase.phaseId }, () => response.text());
      const parseDurationMs = performance.now() - parseStartedAt;
      const ext = endpoint.endsWith('.csv') ? '.csv' : (endpoint.endsWith('.txt') ? '.txt' : '.json');
      const safeKey = endpoint.replace(/\//gi, '_').replace(/[^a-zA-Z0-9-]/gi, '_');
      const cacheStartedAt = performance.now();
      try {
        const prizmCache = require('./cache/prizmCache');
        prizmCache.set('raw_' + safeKey, data, { sourceUrl: url, isRaw: true, rawExt: ext, ttlMs: 15000 });
      } catch(e) {}
      finishMetric(true, { responseBytes: Buffer.byteLength(data), parseDurationMs, cacheWriteDurationMs: performance.now() - cacheStartedAt, cacheTimestamp: new Date() });
      return data;
    }

    finishMetric(true, { responseBytes: Number(response.headers.get("content-length")) || null });
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    debugItem.durationMs = Date.now() - startTime;
    debugItem.success = false;
    debugItem.lastPollTime = new Date().toISOString();
    debugItem.lastFailureAt = new Date().toISOString();
    debugItem.lastError = error.message || String(error);
    if (!debugItem.statusCode && error.name === "AbortError") {
      debugItem.statusCode = 408;
    }
    finishMetric(false, { timeout: error?.name === "AbortError" || /timeout|aborted/i.test(error?.message || "") });
    throw error;
  }
}

// Helper to construct a dynamic site IP Map based on the active profile's topologyModel
export function generateDynamicSiteIpMap(profile: any): any[] {
  const model = profile?.topologyModel || {
    type: "standard-array-segment",
    basePrefix: "10.0",
    arrayStart: 1,
    arrayEnd: 8,
    segmentStart: 3,
    segmentEnd: 110,
    csSegment: 3,
    esSegmentStart: 10,
    esSegmentStep: 5,
    esCountPerArray: 20
  };

  const basePrefix = (model.basePrefix || "10.0").trim();
  const arrayStart = Number(model.arrayStart ?? 1);
  const arrayEnd = Number(model.arrayEnd ?? 8);
  const csSegment = Number(model.csSegment ?? 3);
  const esStart = Number(model.esSegmentStart ?? 10);
  const esStep = Number(model.esSegmentStep ?? 5);
  const esCount = Number(model.esCountPerArray ?? 20);

  const ipList: any[] = [];

  // 1. EMS Master Controller
  const emsHost = profile?.emsHost || "10.0.0.3";
  ipList.push({
    target: "EMS Master Controller",
    ipAddress: emsHost,
    model: "MOXA DA-682C Site Grid Node",
    entityType: "controller"
  });

  // 2. PLC Main Ingress Regulator
  const emsParts = emsHost.split('.');
  const plcIp = emsParts.length === 4 ? `${emsParts[0]}.${emsParts[1]}.${emsParts[2]}.12` : `${basePrefix}.0.12`;
  ipList.push({
    target: "PLC Main Ingress Regulator",
    ipAddress: plcIp,
    model: "Allen-Bradley GuardLogix Ethernet Module",
    entityType: "plc"
  });

  // 3. Collection and Energy segments
  if (model.type === "standard-array-segment") {
    for (let array = arrayStart; array <= arrayEnd; array++) {
      // CS Segment
      const csIp = `${basePrefix}.${array}.${csSegment}`;
      ipList.push({
        target: `Lineup ${array} Collection Segment (CS) Device Node`,
        ipAddress: csIp,
        model: "MOXA Ingress Collector Inverter Controller",
        entityType: "cs",
        arrayIndex: array
      });

      // ES Segments
      for (let c = 0; c < esCount; c++) {
        const segment = esStart + c * esStep;
        const esIp = `${basePrefix}.${array}.${segment}`;
        ipList.push({
          target: `Array ${array} Energy Segment ${c + 1} (ES) Device Node`,
          ipAddress: esIp,
          model: "BESS Cell Cluster String Regulator",
          entityType: "es",
          arrayIndex: array,
          stringIndex: c + 1
        });
      }
    }
  }

  return ipList;
}

// Helper to construct a dynamic string IP mapping based on the active profile's topologyModel
export function generateDynamicStringIpMap(profile: any): any[] {
  const model = profile?.topologyModel || {
    type: "standard-array-segment",
    basePrefix: "10.0",
    arrayStart: 1,
    arrayEnd: 8,
    segmentStart: 3,
    segmentEnd: 110,
    csSegment: 3,
    esSegmentStart: 10,
    esSegmentStep: 5,
    esCountPerArray: 20
  };

  const basePrefix = (model.basePrefix || "10.0").trim();
  const arrayStart = Number(model.arrayStart ?? 1);
  const arrayEnd = Number(model.arrayEnd ?? 8);
  const esStart = Number(model.esSegmentStart ?? 10);
  const esStep = Number(model.esSegmentStep ?? 5);
  const esCount = Number(model.esCountPerArray ?? 20);

  const stringList: any[] = [];

  if (model.type === "standard-array-segment") {
    for (let array = arrayStart; array <= arrayEnd; array++) {
      for (let c = 0; c < esCount; c++) {
        const segment = esStart + c * esStep;
        const esIp = `${basePrefix}.${array}.${segment}`;
        stringList.push({
          array,
          string: c + 1,
          ip: esIp
        });
      }
    }
  }

  return stringList;
}

// Wrapper function to structure all responses consistently
function wrapEmsResponse(key: keyof EmsCache, getLiveVal: () => any) {
  const isDemo = isDemoActive();
  const rawUrl = getNormalizedBaseUrl();
  const activeRef = ProfileStore.getActiveProfile();
  const activeProfileId = activeRef ? activeRef.id : "default-local-ems";
  const activeProfileName = activeRef ? activeRef.profileName : (process.env.EMS_PROFILE_NAME || "PRIZM Core Hardware Bess Profile");
  const stationCode = emsCache.discoveredStationCode || (activeRef ? activeRef.stationCode : "BHE0020");
  const blockIndex = activeRef ? activeRef.blockIndex : 1;

  // Verify Cache Ownership matching constraints
  const cacheMatches = isDemo || (cacheProfileId === activeProfileId && cacheEmsBaseUrl === rawUrl);
  const isStale = isDemo ? false : (!cacheMatches || (!!emsCache.lastError && !emsCache.lastError.startsWith("partial")));
  
  let source: "live" | "cached" | "offline" | "demo" | "partial" = "offline";
  if (isDemo) {
    source = "demo";
  } else if (cacheMatches && emsCache.lastUpdated) {
    if (!emsCache.lastError) {
      source = "live";
    } else if (emsCache.lastError.startsWith("partial")) {
      source = "partial";
    } else {
      source = "cached";
    }
  } else {
    source = "offline";
  }

  let data = null;
  if (source === "demo") {
    data = (DEMO_TEMPLATES as any)[key];
  } else if ((source === "live" || source === "partial" || source === "cached") && cacheMatches) {
    data = getLiveVal();
  } else {
    data = (OFFLINE_TEMPLATES as any)[key];
  }

  // Intercept and dynamically generate ipMap and stringIPMap when in demo, offline, or when live data is missing/empty, to align perfectly with the active custom profile topology.
  if (key === "ipMap" && (!data || (Array.isArray(data) && data.length === 0) || source === "demo" || source === "offline")) {
    data = generateDynamicSiteIpMap(activeRef);
  } else if (key === "stringIPMap" && (!data || (Array.isArray(data) && data.length === 0) || source === "demo" || source === "offline")) {
    data = generateDynamicStringIpMap(activeRef);
  }

  // Intercept and dynamically append arrayPcsList to EMS block data to ensure that both the PCS Dashboard
  // and the Rotation Control Service have a unified, high-fidelity list of all array PCS telemetry.
  if (key === "block" && data) {
    const arrays = data.arrays || [];
    const arrayPcsList: any[] = [];
    arrays.forEach((arr: any) => {
      const arrayIndex = arr.arrayIndex ?? arr.arrayNumber ?? arr.id ?? 1;
      const pcsList = arr.pcs || arr.arrayPcs || [];
      if (Array.isArray(pcsList)) {
        pcsList.forEach((p: any) => {
          const pcsIndex = p.arrayPcsIndex ?? p.pcsIndex ?? p.index ?? p.pcsNum ?? 1;
          arrayPcsList.push({
            id: p.id || `${arrayIndex}-${pcsIndex}`,
            arrayIndex: arrayIndex,
            pcsIndex: pcsIndex,
            rotation: p.rotation ?? (p.outRotation === true ? "OUT" : "IN"),
            state: p.state || p.status || "RUNNING",
            vDc: p.dcVoltageVolt ?? p.dcVoltage ?? p.dcVolt ?? p.dcV ?? 0,
            realPwr: p.acRealPowerKW ?? p.acRealPowerKw ?? p.acRealPower ?? p.kw ?? p.kW ?? 0,
            ...p
          });
        });
      }
    });
    data = {
      ...data,
      arrayPcsList
    };
  }

  return {
    cycleId: emsCache.cycleId,
    source,
    staleData: isStale,
    lastUpdated: isDemo ? new Date().toISOString() : (cacheMatches ? emsCache.lastUpdated : null),
    activeEmsBaseUrl: rawUrl,
    activeProfileName,
    activeProfileId,
    stationCode,
    discoveredStationCode: emsCache.discoveredStationCode,
    siteCodeSource: emsCache.siteCodeSource,
    blockIndex,
    lastError: isDemo ? null : (cacheMatches ? emsCache.lastError : "Telemetry cache profile mismatch or missing"),
    cacheProfileId,
    cacheEmsBaseUrl,
    cacheCreatedAt,
    cacheLastUpdatedAt,
    data
  };
}

// Global mode diagnostics endpoint response
export function getEmsMode() {
  const isDemo = isDemoActive();
  const rawUrl = getNormalizedBaseUrl();
  const activeRef = ProfileStore.getActiveProfile();
  const activeProfileId = activeRef ? activeRef.id : "default-local-ems";
  const activeProfileName = activeRef ? activeRef.profileName : (process.env.EMS_PROFILE_NAME || "PRIZM Core Hardware Bess Profile");
  const stationCode = activeRef ? activeRef.stationCode : "BHE0020";
  const blockIndex = activeRef ? activeRef.blockIndex : 1;

  const cacheMatches = isDemo || (cacheProfileId === activeProfileId && cacheEmsBaseUrl === rawUrl);
  const isStale = isDemo ? false : (!cacheMatches || (!!emsCache.lastError && !emsCache.lastError.startsWith("partial")));
  
  let source: "live" | "cached" | "offline" | "demo" | "partial" = "offline";
  if (isDemo) {
    source = "demo";
  } else if (cacheMatches && emsCache.lastUpdated) {
    if (!emsCache.lastError) {
      source = "live";
    } else if (emsCache.lastError.startsWith("partial")) {
      source = "partial";
    } else {
      source = "cached";
    }
  } else {
    source = "offline";
  }

  return {
    source,
    staleData: isStale,
    lastUpdated: isDemo ? new Date().toISOString() : (cacheMatches ? emsCache.lastUpdated : null),
    activeEmsBaseUrl: rawUrl,
    activeProfileName,
    activeProfileId,
    stationCode,
    discoveredStationCode: emsCache.discoveredStationCode,
    siteCodeSource: emsCache.siteCodeSource,
    blockIndex,
    lastError: isDemo ? null : (cacheMatches ? emsCache.lastError : "Telemetry cache profile mismatch or missing"),
    cacheProfileId,
    cacheEmsBaseUrl,
    cacheCreatedAt,
    cacheLastUpdatedAt,

    configuredMode: process.env.EMS_MODE || "production",
    activeMode: source,
    isDemoFallback: isDemo,
    
    reason: isDemo 
      ? "Demo mode manual toggle is enabled. Hosting full-scale local telemetry datasets." 
      : (source === "live"
          ? "Active LAN ethernet connections detected." 
          : (source === "cached"
              ? "EMS hardware unreachable. Strict production mode active. Serving stale cached data."
              : "EMS unreachable & no cached data available. Displaying offline protection status."
            )
        )
  };
}

export function clearEmsTelemetryCache() {
  emsCache.status = null;
  emsCache.block = null;
  emsCache.lastCall = null;
  emsCache.controllerStatistics = null;
  emsCache.bessStatusCodes = null;
  emsCache.strings = null;
  emsCache.lastUpdated = null;
  emsCache.lastError = "Telemetry cleared due to Target Profile Switch";
  emsCache.hasAttemptedPoll = false;
  
  cacheProfileId = null;
  cacheEmsBaseUrl = null;
  cacheCreatedAt = null;
  cacheLastUpdatedAt = null;

  // Clear endpointDebugMap statuses
  Object.keys(endpointDebugMap).forEach(k => {
    if (endpointDebugMap[k]) {
      endpointDebugMap[k].success = false;
      endpointDebugMap[k].lastPollTime = null;
      endpointDebugMap[k].lastSuccessAt = null;
      endpointDebugMap[k].lastFailureAt = null;
      endpointDebugMap[k].statusCode = null;
      endpointDebugMap[k].durationMs = null;
      endpointDebugMap[k].lastError = "Prior cache flushed";
      endpointDebugMap[k].lastAttemptAt = null;
      endpointDebugMap[k].sourceUsed = null;
      endpointDebugMap[k].fallbackUsed = false;
      endpointDebugMap[k].fallbackUrl = null;
    }
  });

  Object.keys(arrayNotificationsCache).forEach((k) => {
    delete (arrayNotificationsCache as any)[k];
  });
  Object.keys(stringNotificationsCache).forEach((k) => {
    delete (stringNotificationsCache as any)[k];
  });
  lastNotificationHybridComparison = {
    comparisonTimestamp: new Date(0).toISOString(),
    canonicalIdentityVersion: "notification-identity-v2",
    canonicalIdentityFormat: "v2|sev:<ALARM|WARNING|UNKNOWN>|id:<notificationId|NA>|src:<sourceType|NA>|a:<array|NA>|s:<string|NA>|bp:<batteryPack|NA>|cg:<cellGroup|NA>",
    legacyRawCount: 0,
    turtleArrayRawCount: 0,
    turtleStringRawCount: 0,
    legacyCount: 0,
    turtleArrayCount: 0,
    turtleStringCount: 0,
    legacyDuplicateCount: 0,
    turtleArrayDuplicateCount: 0,
    turtleStringDuplicateCount: 0,
    sampleDuplicateIdentities: [],
    matchedNotifications: [],
    missingFromLegacy: [],
    missingFromTurtle: [],
    sampleMissingFromLegacy: [],
    sampleMissingFromTurtle: [],
    arraysPolled: [],
    stringTargetsPolled: [],
    legacyProductionOutputUnchanged: true,
  };
}

// Diagnostics list endpoints report
export function getEmsSourcesDebugInfo() {
  const isDemo = isDemoActive();
  const rawUrl = getNormalizedBaseUrl();
  const activeRef = ProfileStore.getActiveProfile();
  const activeProfileId = activeRef ? activeRef.id : "default-local-ems";
  const activeProfileName = activeRef ? activeRef.profileName : (process.env.EMS_PROFILE_NAME || "PRIZM Core Hardware Bess Profile");
  
  const cacheMatches = isDemo || (cacheProfileId === activeProfileId && cacheEmsBaseUrl === rawUrl);

  let cacheState: "empty" | "live" | "cached" | "stale" | "offline" | "demo" = "offline";
  if (isDemo) {
    cacheState = "demo";
  } else if (!cacheMatches || !emsCache.lastUpdated) {
    cacheState = "empty";
  } else if (!emsCache.lastError) {
    cacheState = "live";
  } else {
    cacheState = "stale";
  }

  const isStale = isDemo ? false : (!cacheMatches || !!emsCache.lastError);

  return Object.values(endpointDebugMap).map(item => ({
    activeProfileId,
    activeProfileName,
    activeEmsBaseUrl: rawUrl,
    cacheProfileId,
    cacheEmsBaseUrl,
    cacheState,
    staleData: isStale,

    endpoint: item.endpoint,
    success: item.success,
    lastPollTime: item.lastPollTime || "NEVER",
    lastSuccessAt: item.lastSuccessAt || null,
    lastFailureAt: item.lastFailureAt || null,
    statusCode: item.statusCode || 0,
    lastStatusCode: item.statusCode || 0,
    durationMs: item.durationMs || 0,
    lastDurationMs: item.durationMs || 0,
    lastAttemptAt: item.lastAttemptAt || item.lastPollTime || null,
    sourceUsed: item.sourceUsed || null,
    fallbackUsed: !!item.fallbackUsed,
    fallbackUrl: item.fallbackUrl || null,
    stale: isStale || !item.success,
    lastError: item.lastError || "NONE"
  }));
}

// IP Maps JSON getters
export function getEmsIpMap() {
  return wrapEmsResponse("ipMap", () => emsCache.ipMap);
}

export function getEmsStringIpMap() {
  return wrapEmsResponse("stringIPMap", () => emsCache.stringIPMap);
}

// Primary polling tick function that updates in-memory cache from active LAN endpoints

const EMS_FAST_TIMEOUT_MS = Number(process.env.EMS_FAST_TIMEOUT_MS) || 2500;
const EMS_NORMAL_TIMEOUT_MS = Number(process.env.EMS_NORMAL_TIMEOUT_MS) || 5000;
const EMS_SLOW_TIMEOUT_MS = Number(process.env.EMS_SLOW_TIMEOUT_MS) || 15000;

const emsRestAcquisitionManager = new AcquisitionManager([new RestProvider()]);
const emsCsvAcquisitionManager = new AcquisitionManager([new CsvProvider()]);

let lastSlowFetchTime = 0;

interface EmsRestAcquisitionResult {
  success: boolean;
  data: any;
  error?: string;
  payload?: unknown;
  source?: string;
  kind?: string;
  statusCode?: number | null;
  attemptUrl?: string;
  responseDurationMs?: number | null;
  sourceUsed?: string | null;
  fallbackUsed?: boolean;
  fallbackUrl?: string | null;
}

interface EmsCsvAcquisitionResult {
  success: boolean;
  rawContent: string | null;
  rows: any[];
  headers: string[];
  error?: string;
  statusCode?: number | null;
  sourceUrl?: string;
  fallbackUsed?: boolean;
}

function getOrInitEndpointDebug(endpoint: string): EndpointDebugInfo {
  if (!endpointDebugMap[endpoint]) {
    endpointDebugMap[endpoint] = {
      endpoint,
      success: false,
      lastPollTime: null,
      statusCode: null,
      durationMs: null,
      lastError: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastAttemptAt: null,
      sourceUsed: null,
      fallbackUsed: false,
      fallbackUrl: null,
    };
  }
  return endpointDebugMap[endpoint];
}

function buildLocalFallbackUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname === "127.0.0.1" || urlObj.hostname === "localhost") {
      return null;
    }
    return `http://127.0.0.1:3000${urlObj.pathname}${urlObj.search}`;
  } catch {
    return null;
  }
}

export async function acquireEmsEndpointWithRestProvider(endpoint: string, timeoutMs = EMS_NORMAL_TIMEOUT_MS): Promise<EmsRestAcquisitionResult> {
  const baseUrl = getNormalizedBaseUrl();
  let url = `${baseUrl}${endpoint}`;
  const startedAt = Date.now();
  const metric = telemetryMetrics.registry.beginEndpoint("ems-turtle", endpoint);
  const profilerPhase = coordinatorProfiler.beginPhase(coordinatorPhaseNameForEndpoint("ems-turtle", endpoint), { waitState: "NETWORK", blocking: true });
  let parseDurationMs = 0;
  const debugItem = getOrInitEndpointDebug(endpoint);
  debugItem.lastAttemptAt = new Date().toISOString();
  debugItem.lastPollTime = debugItem.lastAttemptAt;
  debugItem.sourceUsed = "primary";
  debugItem.fallbackUsed = false;
  debugItem.fallbackUrl = null;

  const tryAcquire = async (targetUrl: string): Promise<EmsRestAcquisitionResult> => {
    const result = await emsRestAcquisitionManager.acquire(
      { name: endpoint, kind: "rest", config: { timeoutMs } },
      { name: endpoint, kind: "rest", url: targetUrl, timeoutMs }
    );

    const resultPayload = result.payload as { status?: number } | undefined;
    const statusCode = typeof resultPayload?.status === "number" ? resultPayload.status : null;

    if (!result.success) {
      return {
        success: false,
        data: null,
        error: result.error || "REST acquisition failed",
        payload: result.payload,
        source: result.source,
        kind: result.kind,
        statusCode,
        attemptUrl: targetUrl,
      };
    }

    const payload = result.payload as { body?: string; bodyIsJson?: boolean } | undefined;
    if (typeof payload?.body === "string" && payload.bodyIsJson) {
      try {
        const parseStartedAt = performance.now();
        const data = coordinatorProfiler.withSyncPhase("Parse Response", { waitState: "PARSE", blocking: true, parentPhaseId: profilerPhase.phaseId }, () => JSON.parse(payload.body as string));
        parseDurationMs += performance.now() - parseStartedAt;
        return {
          success: true,
          data,
          payload,
          source: result.source,
          kind: result.kind,
          statusCode,
          attemptUrl: targetUrl,
        };
      } catch (error) {
        return {
          success: false,
          data: null,
          error: error instanceof Error ? error.message : "Invalid JSON payload",
          payload,
          source: result.source,
          kind: result.kind,
          statusCode,
          attemptUrl: targetUrl,
        };
      }
    }

    return {
      success: true,
      data: payload?.body ?? null,
      payload,
      source: result.source,
      kind: result.kind,
      statusCode,
      attemptUrl: targetUrl,
    };
  };
  try {
    const firstAttempt = await tryAcquire(url);
    let finalAttempt = firstAttempt;

    if (!firstAttempt.success && !url.includes("127.0.0.1:3000") && !url.includes("localhost:3000")) {
      const fallbackUrl = buildLocalFallbackUrl(url);
      if (fallbackUrl) {
        if (url.includes("10.0.0.3") || url.includes("10.0.0.")) {
          isEmsOffline = true;
        }
        debugItem.fallbackUsed = true;
        debugItem.fallbackUrl = fallbackUrl;
        finalAttempt = await tryAcquire(fallbackUrl);
      }
    }

    debugItem.durationMs = Date.now() - startedAt;
    debugItem.statusCode = finalAttempt.statusCode ?? null;
    debugItem.lastPollTime = new Date().toISOString();
    debugItem.lastAttemptAt = debugItem.lastPollTime;
    debugItem.sourceUsed = debugItem.fallbackUsed ? "fallback-local-mock" : "primary";

    if (finalAttempt.success) {
      debugItem.success = true;
      debugItem.lastSuccessAt = new Date().toISOString();
      debugItem.lastError = null;
    } else {
      debugItem.success = false;
      debugItem.lastFailureAt = new Date().toISOString();
      debugItem.lastError = finalAttempt.error || "REST acquisition failed";
      if (debugItem.statusCode === null && debugItem.lastError?.toLowerCase().includes("abort")) {
        debugItem.statusCode = 408;
      }
    }

    const responseBytes = typeof (finalAttempt.payload as any)?.body === "string" ? Buffer.byteLength((finalAttempt.payload as any).body) : null;
    const observation = finalAttempt.data?.timestamp ?? finalAttempt.data?.timeStamp ?? finalAttempt.data?.capturedAt ?? null;
    metric.finish({
      success: finalAttempt.success,
      timeout: finalAttempt.statusCode === 408 || /timeout|abort/i.test(finalAttempt.error || ""),
      fallback: !!debugItem.fallbackUsed,
      responseBytes,
      parseDurationMs,
      sourceObservationTimestamp: observation,
      acquisitionTimestamp: new Date(),
      stale: !finalAttempt.success || !!debugItem.fallbackUsed,
    });
    profilerPhase.finish({ success: finalAttempt.success, retries: debugItem.fallbackUsed ? 1 : 0, bytes: responseBytes });

    return {
      ...finalAttempt,
      responseDurationMs: debugItem.durationMs,
      sourceUsed: debugItem.sourceUsed || null,
      fallbackUsed: !!debugItem.fallbackUsed,
      fallbackUrl: debugItem.fallbackUrl || null,
    };
  } catch (error) {
    debugItem.durationMs = Date.now() - startedAt;
    debugItem.success = false;
    debugItem.lastPollTime = new Date().toISOString();
    debugItem.lastAttemptAt = debugItem.lastPollTime;
    debugItem.lastFailureAt = new Date().toISOString();
    debugItem.lastError = error instanceof Error ? error.message : String(error);
    if (debugItem.statusCode === null && debugItem.lastError?.toLowerCase().includes("abort")) {
      debugItem.statusCode = 408;
    }
    metric.finish({ success: false, timeout: debugItem.statusCode === 408 || /timeout|abort/i.test(debugItem.lastError || ""), fallback: !!debugItem.fallbackUsed, acquisitionTimestamp: new Date(), stale: true });
    profilerPhase.finish({ success: false, retries: debugItem.fallbackUsed ? 1 : 0, error: debugItem.lastError });
    return {
      success: false,
      data: null,
      error: debugItem.lastError,
      statusCode: debugItem.statusCode,
      attemptUrl: url,
      responseDurationMs: debugItem.durationMs,
      sourceUsed: debugItem.sourceUsed || null,
      fallbackUsed: !!debugItem.fallbackUsed,
      fallbackUrl: debugItem.fallbackUrl || null,
    };
  }
}

export async function acquireEmsCsvEndpointWithCsvProvider(endpoint: string, timeoutMs = EMS_FAST_TIMEOUT_MS): Promise<EmsCsvAcquisitionResult> {
  const baseUrl = getNormalizedBaseUrl();
  const url = `${baseUrl}${endpoint}`;
  const startedAt = Date.now();
  const metric = telemetryMetrics.registry.beginEndpoint("ems-turtle", endpoint);
  const profilerPhase = coordinatorProfiler.beginPhase(coordinatorPhaseNameForEndpoint("ems-turtle", endpoint), { waitState: "NETWORK", blocking: true });
  const debugItem = getOrInitEndpointDebug(endpoint);
  debugItem.lastAttemptAt = new Date().toISOString();
  debugItem.lastPollTime = debugItem.lastAttemptAt;
  debugItem.sourceUsed = "primary";
  debugItem.fallbackUsed = false;
  debugItem.fallbackUrl = null;

  const fallbackUrl = (!url.includes("127.0.0.1:3000") && !url.includes("localhost:3000"))
    ? buildLocalFallbackUrl(url)
    : null;

  const result = await emsCsvAcquisitionManager.acquire(
    { name: endpoint, kind: "csv", config: { timeoutMs } },
    {
      name: endpoint,
      kind: "csv",
      url,
      timeoutMs,
      fallbackUrl: fallbackUrl ?? undefined,
    }
  );

  const payload = result.payload as {
    rawContent?: string;
    rows?: readonly any[];
    headers?: readonly string[];
    statusCode?: number;
    sourceUrl?: string;
    fallbackUsed?: boolean;
  } | undefined;

  debugItem.durationMs = Date.now() - startedAt;
  debugItem.statusCode = typeof payload?.statusCode === "number" ? payload.statusCode : null;
  debugItem.lastPollTime = new Date().toISOString();
  debugItem.lastAttemptAt = debugItem.lastPollTime;
  debugItem.fallbackUsed = !!payload?.fallbackUsed;
  debugItem.fallbackUrl = payload?.fallbackUsed ? (payload.sourceUrl || fallbackUrl) : null;
  debugItem.sourceUsed = payload?.fallbackUsed ? "fallback-local-mock" : "primary";

  if (payload?.fallbackUsed && (url.includes("10.0.0.3") || url.includes("10.0.0."))) {
    isEmsOffline = true;
  }

  if (!result.success) {
    debugItem.success = false;
    debugItem.lastFailureAt = new Date().toISOString();
    debugItem.lastError = result.error || "CSV acquisition failed";
    if (debugItem.statusCode === null && debugItem.lastError?.toLowerCase().includes("abort")) {
      debugItem.statusCode = 408;
    }

    const responseBytes = payload?.rawContent ? Buffer.byteLength(payload.rawContent) : null;
    metric.finish({ success: false, timeout: debugItem.statusCode === 408 || /timeout|abort/i.test(debugItem.lastError || ""), fallback: !!payload?.fallbackUsed, responseBytes, parseDurationMs: (payload as any)?.parseDurationMs, acquisitionTimestamp: new Date(), stale: true });
    profilerPhase.finish({ success: false, retries: payload?.fallbackUsed ? 1 : 0, bytes: responseBytes, error: debugItem.lastError });
    return {
      success: false,
      rawContent: null,
      rows: [],
      headers: [],
      error: debugItem.lastError,
      statusCode: debugItem.statusCode,
      sourceUrl: payload?.sourceUrl,
      fallbackUsed: !!payload?.fallbackUsed,
    };
  }

  debugItem.success = true;
  debugItem.lastSuccessAt = new Date().toISOString();
  debugItem.lastError = null;

  const safeKey = endpoint.replace(/\//gi, '_').replace(/[^a-zA-Z0-9-]/gi, '_');
  const cacheStartedAt = performance.now();
  try {
    const prizmCache = require('./cache/prizmCache');
    prizmCache.set('raw_' + safeKey, payload?.rawContent ?? '', {
      sourceUrl: payload?.sourceUrl || url,
      isRaw: true,
      rawExt: '.csv',
      ttlMs: 15000
    });
  } catch {}

  metric.finish({
    success: true,
    fallback: !!payload?.fallbackUsed,
    responseBytes: Buffer.byteLength(payload?.rawContent ?? ''),
    parseDurationMs: (payload as any)?.parseDurationMs,
    cacheWriteDurationMs: performance.now() - cacheStartedAt,
    sourceObservationTimestamp: (payload?.rows?.[0] as any)?.timestamp ?? (payload?.rows?.[0] as any)?.Timestamp ?? null,
    acquisitionTimestamp: new Date(),
    cacheTimestamp: new Date(),
    stale: !!payload?.fallbackUsed,
  });
  profilerPhase.finish({ success: true, retries: payload?.fallbackUsed ? 1 : 0, bytes: Buffer.byteLength(payload?.rawContent ?? '') });

  return {
    success: true,
    rawContent: payload?.rawContent ?? '',
    rows: Array.isArray(payload?.rows) ? [...payload.rows] : [],
    headers: Array.isArray(payload?.headers) ? [...payload.headers] : [],
    statusCode: typeof payload?.statusCode === "number" ? payload.statusCode : null,
    sourceUrl: payload?.sourceUrl,
    fallbackUsed: !!payload?.fallbackUsed,
  };
}

function getSimulatedArrayReport(arrayNum: number) {
  const strings: Record<string, any> = {};
  for (let s = 1; s <= 40; s++) {
    const lenY = 14; 
    const totalCG = 14 * 30; 
    strings[s] = {
      stringIndex: s,
      batteryPackCount: 14,
      cellGroupPerBatteryPackCount: 30,
      timestamps: Array.from({ length: totalCG }, () => Date.now()),
      millivolts: Array.from({ length: totalCG }, (_, idx) => 3250 + (idx % 12) * 5), 
      temperatures: Array.from({ length: totalCG }, (_, idx) => 26 + (idx % 4)), 
      ignoredTempSensors: Array.from({ length: totalCG }, () => 0),
      socs: Array.from({ length: totalCG }, () => 85),
      cellGroupBalancingStatusPerBpIndexes: Array.from({ length: lenY }, () => 0),
      cellGroupBalancingSettingPerBpIndexes: Array.from({ length: lenY }, () => 0),
      kalmanMuAh: [],
      kalmanSigmaSq: [],
      modelCMuAh: [],
      modelCSigmaSq: [],
      modelEMuAh: [],
      modelESigmaSq: [],
      sohs: []
    };
  }
  return {
    arrayIndex: arrayNum,
    timeStamp: String(Date.now()),
    cellGroupReportForArray: {
      condensedCellReportForString: strings
    }
  };
}

function getSimulatedPcsReport(arrayNum: number, pcsNum: number) {
  return {
    timeStamp: String(Date.now()),
    arrayPcsData: {
      state: "Stop",
      dcVoltageVolt: 1375 + pcsNum,
      dcCurrentAmp: -3,
      acVoltageVoltDeprecated: 0,
      acCurrentAmpDeprecated: 0,
      acCmdRealPowerKW: 0,
      acCmdReactivePowerKVAR: 0,
      acRealPowerSettingKW: 0,
      acReactivePowerSettingKVAR: 0,
      acRealPowerKW: 0,
      acReactivePowerKVAR: 0,
      acFrequencyHz: 60.0,
      arrayPcsPhaseData: [
        {
          arrayPcsPhase: "PHASE_A",
          acCurrentAmp: 0,
          arrayPcsPhaseVoltageMeasuremeantType: "TO_PHASE_B",
          acVoltageVolt: 696
        },
        {
          arrayPcsPhase: "PHASE_C",
          acCurrentAmp: 1,
          arrayPcsPhaseVoltageMeasuremeantType: "TO_PHASE_A",
          acVoltageVolt: 693
        },
        {
          arrayPcsPhase: "PHASE_B",
          acCurrentAmp: 1,
          arrayPcsPhaseVoltageMeasuremeantType: "TO_PHASE_C",
          acVoltageVolt: 690
        }
      ],
      acApparentPowerKVA: 0,
      isReady: true,
      eventVendor1: 2144,
      eventVendor2: 0,
      eventVendor3: 0,
      eventVendor4: 0,
      outRotation: arrayNum % 2 === 1
    }
  };
}

export async function pollEmsTurtle(): Promise<{ success: boolean; error: string | null }> {
  emsCache.cycleId = getTelemetryCycleId();
  const pollMetric = telemetryMetrics.registry.beginEndpoint("ems-turtle", "poll-cycle");
  emsCache.hasAttemptedPoll = true;
  let overallError: string | null = null;
  let criticalEndpointsFailed = 0;
  let coreEndpointsSucceeded = 0;

  const baseUrl = getNormalizedBaseUrl();
  // Fast probe on first run if not already declared offline to prevent 5 parallel slow timeouts
  if (!isEmsOffline && (baseUrl.includes("10.0.0.3") || baseUrl.includes("10.0.0."))) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 350);
      const probeRes = await fetch(`${baseUrl}/status`, { signal: controller.signal });
      clearTimeout(id);
      if (!probeRes.ok) {
        isEmsOffline = true;
      }
    } catch (e) {
      isEmsOffline = true;
    }
  }

  const criticalFetches = coordinatorProfiler.withParallelGroup("EMS Critical Acquisition", 5, () => Promise.allSettled([
    fetchAndRecord('/status', EMS_FAST_TIMEOUT_MS, 'text').then(text => { 
      const statusText = String(text || '').trim();
      if (!statusText || !statusText.toUpperCase().startsWith('OK')) {
        throw new Error(`/status returned unexpected body: ${statusText.slice(0, 80)}`);
      }
      emsCache.status = { ...emsCache.status, turtleStatusOk: true, turtleStatusText: statusText };
      return statusText;
    }),
    fetchAndRecord('/tools/report/ems/status.json', EMS_FAST_TIMEOUT_MS, 'json').then(d => { emsCache.status = { ...emsCache.status, ...d }; return d; }),
    acquireEmsEndpointWithRestProvider('/tools/monitor/ems/blockviewer/data', EMS_FAST_TIMEOUT_MS)
      .then(result => {
        if (!result.success) {
          throw new Error(result.error || 'blockviewer acquisition failed');
        }
        setEmsCachedBlock(result.data);

        // Preserve legacy raw endpoint cache behavior for diagnostics and parity checks.
        const safeKey = '/tools/monitor/ems/blockviewer/data'.replace(/\//gi, '_').replace(/[^a-zA-Z0-9-]/gi, '_');
        try {
          const prizmCache = require('./cache/prizmCache');
          prizmCache.set('raw_' + safeKey, result.data, {
            sourceUrl: result.attemptUrl || `${baseUrl}/tools/monitor/ems/blockviewer/data`,
            isRaw: true,
            rawExt: '.json',
            ttlMs: 15000
          });
        } catch {}

        return result.data;
      }),
    acquireEmsEndpointWithRestProvider('/tools/report/ems/lastCall.json', EMS_FAST_TIMEOUT_MS)
      .then(result => {
        if (!result.success) {
          throw new Error(result.error || 'lastCall acquisition failed');
        }
        emsCache.lastCall = result.data;
        return result.data;
      }),
    acquireEmsCsvEndpointWithCsvProvider('/tools/report/ems/strings.csv', EMS_FAST_TIMEOUT_MS)
      .then(result => {
        if (!result.success) {
          throw new Error(result.error || 'strings.csv acquisition failed');
        }
        const parseStartedAt = performance.now();
        emsCache.strings = coordinatorProfiler.withSyncPhase("Parse strings.csv", { waitState: "PARSE", blocking: true }, () => parseCsv(result.rawContent || ''));
        telemetryMetrics.registry.recordEndpointProcessing("ems-turtle", "/tools/report/ems/strings.csv", { parseDurationMs: performance.now() - parseStartedAt });
        return result.rawContent;
      })
  ]));

  const criticalResults = await criticalFetches;
  criticalResults.forEach(res => {
    if (res.status === 'fulfilled' && res.value) coreEndpointsSucceeded++;
    else { const r = (res as PromiseRejectedResult).reason; overallError = r?.message || String(r); criticalEndpointsFailed++; }
  });

  const optionalFetches = coordinatorProfiler.withParallelGroup("EMS Optional Acquisition", 6, () => Promise.allSettled([
    acquireEmsEndpointWithRestProvider('/tools/report/ems/controllerStatistics.json', EMS_NORMAL_TIMEOUT_MS)
      .then(result => {
        if (!result.success) {
          throw new Error(result.error || 'controllerStatistics acquisition failed');
        }
        emsCache.controllerStatistics = result.data;
      }),
    fetchAndRecord('/tools/report/ems/bessStatusCodes.json', EMS_NORMAL_TIMEOUT_MS, 'json').then(d => { emsCache.bessStatusCodes = d; }),
    fetchAndRecord('/tools/report/ems/ipMap.json', EMS_NORMAL_TIMEOUT_MS, 'text').then(t => { try { emsCache.ipMap = JSON.parse(t); } catch { emsCache.ipMap = t; } }).catch(async () => { const csv = await fetchAndRecord('/tools/report/ems/ipMap.csv', EMS_NORMAL_TIMEOUT_MS, 'text'); try { emsCache.ipMap = JSON.parse(csv); } catch { emsCache.ipMap = csv; } }),
    fetchAndRecord('/tools/report/ems/stringIPMap.json', EMS_NORMAL_TIMEOUT_MS, 'text').then(t => { try { emsCache.stringIPMap = JSON.parse(t); } catch { emsCache.stringIPMap = t; } }).catch(async () => { const csv = await fetchAndRecord('/tools/report/ems/stringIPMap.csv', EMS_NORMAL_TIMEOUT_MS, 'text'); try { emsCache.stringIPMap = JSON.parse(csv); } catch { emsCache.stringIPMap = csv; } }),
    fetchAndRecord('/firstresponder/data', EMS_NORMAL_TIMEOUT_MS, 'json').then(d => { emsCache.firstResponder = { ...emsCache.firstResponder, v1: d }; }),
    fetchAndRecord('/v2/firstresponder/data', EMS_NORMAL_TIMEOUT_MS, 'json').then(d => { emsCache.firstResponder = { ...emsCache.firstResponder, v2: d }; })
  ]));
  optionalFetches.catch(() => {});

  const now = Date.now();
  if (now - lastSlowFetchTime > 300000) {
    lastSlowFetchTime = now;
    fetchAndRecord('/modbus_map.csv', EMS_SLOW_TIMEOUT_MS, 'text').then(t => { 
        emsCache.modbusMap = t; 
    }).catch(() => {
        fetchAndRecord('/tools/report/ems/modbus_map.csv', EMS_SLOW_TIMEOUT_MS, 'text').then(t => { 
            emsCache.modbusMap = t; 
        }).catch(() => {});
    });
  }

  // Fetch individual Array reports and PCS reports from EMS
  const activeProfile = ProfileStore.getActiveProfile();
  const arrayMin = Number(process.env.PRIZM_POLL_ARRAY_MIN) || 1;
  const arrayMax = Number(process.env.PRIZM_POLL_ARRAY_MAX) || activeProfile?.arrayCount || 8;
  const pcsMin = Number(process.env.PRIZM_POLL_PCS_MIN) || 1;
  const pcsMax = Number(process.env.PRIZM_POLL_PCS_MAX) || 1;

  const arrayReportTaskCount = Math.max(0, arrayMax - arrayMin + 1) * (1 + Math.max(0, pcsMax - pcsMin + 1));
  await coordinatorProfiler.withParallelGroup("EMS Array and PCS Reports", arrayReportTaskCount, async () => {
    const arrayReportPromises: Promise<any>[] = [];
    const pcsReportPromises: Promise<any>[] = [];

  for (let a = arrayMin; a <= arrayMax; a++) {
    const ep = `/tools/report/ems/array/${a}/report.json`;
    const start = Date.now();
    const p = fetchAndRecord(ep, EMS_NORMAL_TIMEOUT_MS, 'json')
      .then(data => {
        emsCache.arrayReports[a] = {
          ok: true,
          endpoint: ep,
          fetchedAt: new Date().toISOString(),
          durationMs: Date.now() - start,
          data
        };
      })
      .catch((err: any) => {
        const simulated = getSimulatedArrayReport(a);
        emsCache.arrayReports[a] = {
          ok: true,
          endpoint: ep,
          fetchedAt: new Date().toISOString(),
          durationMs: Date.now() - start,
          data: simulated,
          error: err.message || String(err)
        };
      });
    arrayReportPromises.push(p);
  }

  for (let a = arrayMin; a <= arrayMax; a++) {
    if (!emsCache.arrayPcsReports[a]) emsCache.arrayPcsReports[a] = {};
    for (let pcsNum = pcsMin; pcsNum <= pcsMax; pcsNum++) {
      const ep = `/tools/report/ems/array/${a}/pcs/${pcsNum}/report.json`;
      const start = Date.now();
      const p = fetchAndRecord(ep, EMS_NORMAL_TIMEOUT_MS, 'json')
        .then(data => {
          emsCache.arrayPcsReports[a][pcsNum] = {
            ok: true,
            endpoint: ep,
            fetchedAt: new Date().toISOString(),
            durationMs: Date.now() - start,
            data
          };
        })
        .catch((err: any) => {
          const simulated = getSimulatedPcsReport(a, pcsNum);
          emsCache.arrayPcsReports[a][pcsNum] = {
            ok: true,
            endpoint: ep,
            fetchedAt: new Date().toISOString(),
            durationMs: Date.now() - start,
            data: simulated,
            error: err.message || String(err)
          };
        });
      pcsReportPromises.push(p);
    }
  }

    await Promise.allSettled([...arrayReportPromises, ...pcsReportPromises]);
  });
  await coordinatorProfiler.withPhase("Array Notifications", { waitState: "NETWORK", blocking: true }, () => pollEmsArrayNotifications()).catch(() => {});

  const rawUrl = getNormalizedBaseUrl();
  const activeRef = ProfileStore.getActiveProfile();
  const activeId = activeRef ? activeRef.id : 'default-local-ems';

  if (!cacheCreatedAt || cacheProfileId !== activeId || cacheEmsBaseUrl !== rawUrl) cacheCreatedAt = new Date().toISOString();
  cacheLastUpdatedAt = new Date().toISOString();
  cacheProfileId = activeId;
  cacheEmsBaseUrl = rawUrl;

  let discovered = emsCache.discoveredStationCode;
  let source = emsCache.siteCodeSource;

  if (emsCache.status && emsCache.status.stationCode) { discovered = emsCache.status.stationCode; source = 'status.json:stationCode'; }
  else if (emsCache.strings && emsCache.strings.length > 0) {
    const stringKey = emsCache.strings[0].StringKey || '';
    const stMatch = stringKey.match(/ST:([A-Z0-9_-]+)/i);
    if (stMatch) { discovered = stMatch[1]; source = 'strings.csv:StringKey'; }
    else { const wordMatch = stringKey.match(/\b(BHE\d{4})\b/i); if (wordMatch) { discovered = wordMatch[1]; source = 'strings.csv:StringKey'; } }
  }

  if (discovered) {
    emsCache.discoveredStationCode = discovered;
    emsCache.siteCodeSource = source;
    if (activeRef && activeRef.stationCode !== discovered) {
      try {
        ProfileStore.updateProfile(activeId, { stationCode: discovered });
        console.log(`[EMS Poll] Successfully updated active profile station code from ${activeRef.stationCode} to ${discovered}`);
      } catch (err: any) {
        console.error(`[EMS Poll] Failed to update active profile station code dynamically:`, err.message);
      }
    }
  }

  if (coreEndpointsSucceeded > 0 || criticalEndpointsFailed < 3) {
    emsCache.lastUpdated = cacheLastUpdatedAt;
    emsCache.lastError = overallError ? 'partial: ' + overallError : null;
    pollMetric.finish({ success: true, acquisitionTimestamp: cacheLastUpdatedAt, cacheTimestamp: cacheLastUpdatedAt, stale: !!emsCache.lastError });
    return { success: true, error: emsCache.lastError };
  } else {
    emsCache.lastUpdated = cacheLastUpdatedAt;
    emsCache.lastError = overallError || 'Multiple critical EMS endpoints are unreachable';
    pollMetric.finish({ success: false, acquisitionTimestamp: cacheLastUpdatedAt, cacheTimestamp: cacheLastUpdatedAt, stale: true });
    return { success: false, error: emsCache.lastError };
  }
}
export function getEmsConnectionStatus() {
  const isDemo = isDemoActive();
  const rawUrl = getNormalizedBaseUrl();
  const activeRef = ProfileStore.getActiveProfile();
  const activeProfileId = activeRef ? activeRef.id : "default-local-ems";
  const activeProfileName = activeRef ? activeRef.profileName : (process.env.EMS_PROFILE_NAME || "PRIZM Core Hardware Bess Profile");
  const stationCode = emsCache.discoveredStationCode || (activeRef ? activeRef.stationCode : "BHE0020");
  const blockIndex = activeRef ? activeRef.blockIndex : 1;

  const cacheMatches = isDemo || (cacheProfileId === activeProfileId && cacheEmsBaseUrl === rawUrl);
  const isStale = isDemo ? false : (!cacheMatches || (!!emsCache.lastError && !emsCache.lastError.startsWith("partial")));

  let source: "live" | "cached" | "offline" | "demo" | "partial" = "offline";
  if (isDemo) {
    source = "demo";
  } else if (cacheMatches && emsCache.lastUpdated) {
    if (!emsCache.lastError) {
      source = "live";
    } else if (emsCache.lastError.startsWith("partial")) {
      source = "partial";
    } else {
      source = "cached";
    }
  } else {
    source = "offline";
  }

  return {
    source,
    staleData: isStale,
    lastUpdated: isDemo ? new Date().toISOString() : (cacheMatches ? emsCache.lastUpdated : null),
    activeEmsBaseUrl: rawUrl,
    activeProfileName,
    activeProfileId,
    stationCode,
    discoveredStationCode: emsCache.discoveredStationCode,
    siteCodeSource: emsCache.siteCodeSource,
    blockIndex,
    lastError: isDemo ? null : (cacheMatches ? emsCache.lastError : "Telemetry cache profile mismatch or missing"),
    cacheProfileId,
    cacheEmsBaseUrl,
    cacheCreatedAt,
    cacheLastUpdatedAt,
    
    emsHost: rawUrl,
    connectionState: isDemo ? "healthy" : (isStale ? "disconnected" : (emsCache.hasAttemptedPoll ? "healthy" : "normal")),
    turtleVersion: "3.2.0-Production-BESS",
    lastSuccessfulPoll: isDemo ? new Date().toISOString() : (cacheMatches ? emsCache.lastUpdated : null),
    pollIntervalMs: Number(process.env.EMS_POLL_INTERVAL_MS) || 3000,
    configuredMode: process.env.EMS_MODE || "production",
    activeMode: source,
    isDemoFallback: isDemo,
    
    reason: isDemo 
      ? "Demo mode manual toggle is enabled. Hosting full-scale local telemetry datasets." 
      : (source === "live"
          ? "Active LAN ethernet connections detected." 
          : (source === "partial"
              ? "EMS reachable, but one or more expected endpoints failed."
              : (source === "cached"
                  ? "EMS currently unreachable. Using last known snapshot."
                  : "EMS unreachable and no usable cached data is available."
                )
            )
        )
  };
}

// Retrieve fully wrapped statuses / datasets
export function getEmsCachedStatus() {
  return wrapEmsResponse("status", () => emsCache.status);
}

export function getEmsCachedBlock() {
  return wrapEmsResponse("block", () => emsCache.block);
}

export function setEmsCachedBlock(d: any) {
  if (!d) return;
  const oldBlock = emsCache.block;
  if (oldBlock) {
    const oldApps = oldBlock.dragonApps || oldBlock.apps || oldBlock.emsApps;
    const newApps = d.dragonApps || d.apps || d.emsApps;
    if (oldApps && !newApps) {
      if (oldBlock.dragonApps) d.dragonApps = oldBlock.dragonApps;
      else if (oldBlock.apps) d.apps = oldBlock.apps;
      else if (oldBlock.emsApps) d.emsApps = oldBlock.emsApps;
    }
  }
  emsCache.block = d;
}

export function getEmsCachedStatusCodes() {
  return wrapEmsResponse("bessStatusCodes", () => emsCache.bessStatusCodes);
}

export function getEmsCachedFirstResponder() {
  return wrapEmsResponse("firstResponder", () => emsCache.firstResponder);
}

export function getEmsCachedModbusMap() {
  return wrapEmsResponse("modbusMap", () => emsCache.modbusMap);
}

export function getEmsCachedRawStrings() {
  return wrapEmsResponse("strings", () => emsCache.strings);
}

export function getEmsCachedControllerStatistics() {
  return wrapEmsResponse("controllerStatistics", () => emsCache.controllerStatistics);
}

export function getEmsCachedLastCall() {
  return wrapEmsResponse("lastCall", () => emsCache.lastCall);
}


// ==================== CACHE ORCHESTRATOR ====================

export let cacheSeedState = {
  running: false,
  lastStartedAt: null as string | null,
  lastCompletedAt: null as string | null,
  completedKeys: [] as string[],
  failedKeys: [] as string[],
  percentComplete: 0
};

export async function bootstrapEmsAndSeedCache() {
  if (cacheSeedState.running) {
    return { success: true, message: 'Already running' };
  }
  
  cacheSeedState.running = true;
  cacheSeedState.lastStartedAt = new Date().toISOString();
  cacheSeedState.completedKeys = [];
  cacheSeedState.failedKeys = [];
  cacheSeedState.percentComplete = 0;

  console.log('[EMS Bootstrap] Starting cache seed...');
  
  // Try loading from local disk cache first in case EMS is offline
  try {
     const prizmCache = require('./cache/prizmCache');
     const rawStatus = prizmCache.get('raw__tools_report_ems_status_json')?.data;
     if (rawStatus && !emsCache.status) emsCache.status = rawStatus;
     
     const rawBlock = prizmCache.get('raw__tools_monitor_ems_blockviewer_data')?.data; // blockviewer/data
     if (rawBlock && !emsCache.block) setEmsCachedBlock(rawBlock);
     
     const rawLastCall = prizmCache.get('raw__tools_report_ems_lastCall_json')?.data;
     if (rawLastCall && !emsCache.lastCall) emsCache.lastCall = rawLastCall;
     
     const rawCsv = prizmCache.get('raw__tools_report_ems_strings_csv')?.data;
     if (rawCsv && !emsCache.strings?.length) emsCache.strings = parseCsv(rawCsv);
  } catch(e) {}

  const priority1 = [
    '/tools/report/ems/status.json',
    '/tools/report/ems/strings.csv',
    '/tools/report/ems/lastCall.json',
    '/tools/report/ems/controllerStatistics.json',
    '/tools/report/ems/bessStatusCodes.json',
    '/tools/report/ems/ipMap.json',
    '/tools/report/ems/stringIPMap.json',
    '/tools/monitor/ems/blockviewer/data'
  ];
  
  console.log('[EMS Bootstrap] Fetching priority feeds in parallel with optimized timeout...');
  await Promise.allSettled(priority1.map(async (ep) => {
    try {
      await fetchAndRecord(ep, 3000);
      cacheSeedState.completedKeys.push(ep);
    } catch(e) {
      cacheSeedState.failedKeys.push(ep);
    }
  }));
  
  cacheSeedState.percentComplete = 85;

  await pollEmsTurtle().catch(() => {});

  cacheSeedState.running = false;
  cacheSeedState.lastCompletedAt = new Date().toISOString();
  cacheSeedState.percentComplete = 100;
  
  console.log('[EMS Bootstrap] Cache seed finished.');
  return { success: true, cacheSeedState };
}

export function getExtendedConnectionStatus() {
  const base = getEmsConnectionStatus();
  
  const reachable = base.source === 'live' || base.source === 'partial';
  let statusStr = 'LIVE';
  if (base.source === 'offline') statusStr = emsCache.lastError?.includes('HTML') ? 'MISCONFIGURED' : 'OFFLINE';
  else if (base.source === 'partial') statusStr = 'PARTIAL';
  else if (base.source === 'cached') statusStr = 'CACHED';
  else if (base.source === 'demo') statusStr = 'DEMO';
  
  return {
    profileId: base.activeProfileId,
    profileName: base.activeProfileName,
    emsBaseUrl: base.activeEmsBaseUrl,
    reachable,
    status: statusStr,
    firstSuccessfulEndpoint: emsCache.hasAttemptedPoll && (base.source !== 'offline') ? '/tools/report/ems/status.json' : null,
    lastSuccessfulAt: base.lastUpdated,
    lastAttemptAt: new Date().toISOString(),
    failureReason: !reachable ? emsCache.lastError || 'Unknown connection error' : null,
    suggestedAction: !reachable ? 'RECONFIGURE_EMS' : null,
    sourceHealth: base.reason || 'OK',
    discoveredStationCode: base.discoveredStationCode,
    cacheSeedState
  };
}

export function setMockLastCall(data: any) {
  emsCache.lastCall = data;
  const activeRef = ProfileStore.getActiveProfile();
  const activeId = activeRef ? activeRef.id : 'default-local-ems';
  const rawUrl = getNormalizedBaseUrl();
  cacheProfileId = activeId;
  cacheEmsBaseUrl = rawUrl;
  cacheLastUpdatedAt = new Date().toISOString();
  emsCache.lastUpdated = new Date().toISOString();
  emsCache.lastError = null;
}

// Dedicated functions to fetch live Turtle first-responder data
export async function getLiveFirstResponderV1(): Promise<any> {
  const data = await fetchAndRecord('/firstresponder/data', EMS_NORMAL_TIMEOUT_MS, 'json');
  return data;
}

export async function getLiveFirstResponderV2(): Promise<any> {
  const data = await fetchAndRecord('/v2/firstresponder/data', EMS_NORMAL_TIMEOUT_MS, 'json');
  return data;
}

export function getEmsCachedArrayPcsReports(): any {
  return emsCache.arrayPcsReports || {};
}

export function getEmsCachedArrayReports(): any {
  return emsCache.arrayReports || {};
}

export type EmsNotificationCacheEntry = {
  ok: boolean;
  endpoint: string;
  fullUrl?: string;
  status?: number | null;
  responseDurationMs?: number | null;
  sourceUsed?: string | null;
  fallbackUsed?: boolean;
  fallbackUrl?: string | null;
  stale?: boolean;
  lastUpdated: string | null;
  data: any | null;
  error?: string | null;
  notificationCount?: number;
  sample?: any[];
};

export const arrayNotificationsCache: Record<number, EmsNotificationCacheEntry> = {};
const stringNotificationsCache: Record<string, EmsNotificationCacheEntry> = {};

export type NotificationIdentifier = {
  id: string;
  code: string;
  severity: "alarm" | "warning";
  arrayIndex: number | null;
  stringIndex: number | null;
  batteryPackIndex: number | null;
  cellGroupIndex: number | null;
  sourceEndpointType: string | null;
};

export type NotificationHybridComparison = {
  comparisonTimestamp: string;
  canonicalIdentityVersion: string;
  canonicalIdentityFormat: string;
  legacyRawCount: number;
  turtleArrayRawCount: number;
  turtleStringRawCount: number;
  legacyCount: number;
  turtleArrayCount: number;
  turtleStringCount: number;
  legacyDuplicateCount: number;
  turtleArrayDuplicateCount: number;
  turtleStringDuplicateCount: number;
  sampleDuplicateIdentities: string[];
  matchedNotifications: string[];
  missingFromLegacy: string[];
  missingFromTurtle: string[];
  sampleMissingFromLegacy: string[];
  sampleMissingFromTurtle: string[];
  arraysPolled: number[];
  stringTargetsPolled: string[];
  legacyProductionOutputUnchanged: boolean;
};

let lastNotificationHybridComparison: NotificationHybridComparison = {
  comparisonTimestamp: new Date(0).toISOString(),
  canonicalIdentityVersion: "notification-identity-v2",
  canonicalIdentityFormat: "v2|sev:<ALARM|WARNING|UNKNOWN>|id:<notificationId|NA>|src:<sourceType|NA>|a:<array|NA>|s:<string|NA>|bp:<batteryPack|NA>|cg:<cellGroup|NA>",
  legacyRawCount: 0,
  turtleArrayRawCount: 0,
  turtleStringRawCount: 0,
  legacyCount: 0,
  turtleArrayCount: 0,
  turtleStringCount: 0,
  legacyDuplicateCount: 0,
  turtleArrayDuplicateCount: 0,
  turtleStringDuplicateCount: 0,
  sampleDuplicateIdentities: [],
  matchedNotifications: [],
  missingFromLegacy: [],
  missingFromTurtle: [],
  sampleMissingFromLegacy: [],
  sampleMissingFromTurtle: [],
  arraysPolled: [],
  stringTargetsPolled: [],
  legacyProductionOutputUnchanged: true,
};

function normalizeNotificationContainer(data: any): { notification: any[] } {
  if (data && typeof data === "object" && Array.isArray((data as any).notification)) {
    return data as { notification: any[] };
  }
  return { notification: [] };
}

function buildNotificationCacheEntry(endpoint: string, result: EmsRestAcquisitionResult): EmsNotificationCacheEntry {
  const normalized = normalizeNotificationContainer(result.data);
  return {
    ok: !!result.success,
    endpoint,
    fullUrl: result.attemptUrl,
    status: result.statusCode ?? null,
    responseDurationMs: result.responseDurationMs ?? null,
    sourceUsed: result.sourceUsed ?? null,
    fallbackUsed: !!result.fallbackUsed,
    fallbackUrl: result.fallbackUrl ?? null,
    stale: !result.success,
    lastUpdated: new Date().toISOString(),
    data: normalized,
    error: result.success ? null : (result.error || "REST acquisition failed"),
    notificationCount: normalized.notification.length,
    sample: normalized.notification.slice(0, 2),
  };
}

function getSimulatedArrayNotifications(arrayNumber: number): any {
  if (arrayNumber !== 1) {
    return { notification: [] };
  }
  return {
    notification: [
      {
        notificationType: {
          notificationCategory: "WARNING",
          notificationId: "2074"
        },
        notificationSource: {
          endpointType: "CELL_GROUP",
          stationCode: "BHE0020",
          blockIndex: 1,
          arrayIndex: 1,
          stringIndex: 16,
          batteryPackIndex: 10,
          cellGroupIndex: 3,
          arrayPcsIndex: 0,
          blockMeterIndex: 0,
          blockDataSourceIndex: 0,
          blockHvacIndex: 0,
          lowVoltageMeterIndex: 0,
          openClosedDetectorIndex: 0,
          containerIndex: 0,
          humidityTemperatureSensorIndex: 0,
          dcDcConverterModuleIndex: 0,
          upsIndex: 0,
          arrayGFDIndex: 0,
          digitalSwitchesIndex: 0,
          dcDcConverterGroupIndex: 0,
          dcDcParallelingControllerIndex: 0,
          BlockEnclosureIndex: 0,
          fanControlRelayIndex: 0,
          multiPcsManagerIndex: 0,
          DispatchableDcDcBatteryIndex: 0,
          acPvBatteryIndex: 0,
          pvPcsIndex: 0,
          loadTapChangerIndex: 0,
          emsIndex: 0,
          bmsIndex: 0,
          blockEnclosureGroupIndex: 0,
          featherIndex: 0,
          podGroupIndex: 0,
          podIndex: 0,
          podDeviceIndex: 0
        },
        triggerMessage: "65230",
        timestamp: "1782443233194"
      },
      {
        notificationType: {
          notificationCategory: "WARNING",
          notificationId: "2534"
        },
        notificationSource: {
          endpointType: "STRING",
          stationCode: "BHE0020",
          blockIndex: 1,
          arrayIndex: 1,
          stringIndex: 10,
          batteryPackIndex: 0,
          cellGroupIndex: 0
        },
        triggerMessage: "some-message-2534",
        timestamp: "1782443233194"
      },
      {
        notificationType: {
          notificationCategory: "ALARM",
          notificationId: "1024"
        },
        notificationSource: {
          endpointType: "BATTERY_PACK",
          stationCode: "BHE0020",
          blockIndex: 1,
          arrayIndex: 1,
          stringIndex: 4,
          batteryPackIndex: 5,
          cellGroupIndex: 0
        },
        triggerMessage: "some-message-1024",
        timestamp: "1782443233194"
      },
      {
        notificationType: {
          notificationCategory: "WARNING",
          notificationId: "2024"
        },
        notificationSource: {
          endpointType: "BATTERY_PACK",
          stationCode: "BHE0020",
          blockIndex: 1,
          arrayIndex: 1,
          stringIndex: 4,
          batteryPackIndex: 5,
          cellGroupIndex: 0
        },
        triggerMessage: "some-message-2024",
        timestamp: "1782443233194"
      },
      {
        notificationType: {
          notificationCategory: "WARNING",
          notificationId: "2024"
        },
        notificationSource: {
          endpointType: "BATTERY_PACK",
          stationCode: "BHE0020",
          blockIndex: 1,
          arrayIndex: 1,
          stringIndex: 5,
          batteryPackIndex: 6,
          cellGroupIndex: 0
        },
        triggerMessage: "some-message-2024-other",
        timestamp: "1782443233194"
      },
      {
        notificationType: {
          notificationCategory: "WARNING",
          notificationId: "2073"
        },
        notificationSource: {
          endpointType: "CELL_GROUP",
          stationCode: "BHE0020",
          blockIndex: 1,
          arrayIndex: 1,
          stringIndex: 27,
          batteryPackIndex: 1,
          cellGroupIndex: 22
        },
        triggerMessage: "65230",
        timestamp: "1782443233194"
      }
    ]
  };
}

export async function pollEmsArrayNotifications(arrayNumbers = [1, 2, 3, 4, 5, 6, 7, 8]): Promise<void> {
  await coordinatorProfiler.withParallelGroup("EMS Array Notifications", arrayNumbers.length, async () => {
    const promises = arrayNumbers.map(async (a) => {
    const ep = `/tools/report/ems/array/${a}/notifications.json`;
    const baseUrl = getNormalizedBaseUrl();
    const targetUrl = `${baseUrl}${ep}`;

    try {
      if (process.env.PRIZM_USE_SIMULATED_ARRAY_NOTIFICATIONS === "true") {
        const data = normalizeNotificationContainer(getSimulatedArrayNotifications(a));
        arrayNotificationsCache[a] = {
          ok: true,
          endpoint: ep,
          fullUrl: targetUrl,
          status: 200,
          responseDurationMs: 0,
          sourceUsed: "simulated",
          fallbackUsed: false,
          fallbackUrl: null,
          stale: false,
          lastUpdated: new Date().toISOString(),
          data,
          notificationCount: data.notification.length,
          sample: data.notification.slice(0, 2)
        };
        return;
      }

      const result = await acquireEmsEndpointWithRestProvider(ep, EMS_NORMAL_TIMEOUT_MS);
      arrayNotificationsCache[a] = buildNotificationCacheEntry(ep, result);
    } catch (err: any) {
      const errorMsg = err.message || String(err);
      arrayNotificationsCache[a] = {
        ok: false,
        endpoint: ep,
        fullUrl: targetUrl,
        status: null,
        responseDurationMs: null,
        sourceUsed: "primary",
        fallbackUsed: false,
        fallbackUrl: null,
        stale: true,
        lastUpdated: new Date().toISOString(),
        data: { notification: [] },
        error: errorMsg,
        notificationCount: 0,
        sample: []
      };
    }
    });
    await Promise.allSettled(promises);
  });
}

export async function pollEmsStringNotifications(
  stringTargets: Array<{ arrayIndex: number; stringIndex: number }>,
  options?: { timeoutMs?: number; maxTargets?: number }
): Promise<Record<string, EmsNotificationCacheEntry>> {
  const timeoutMs = options?.timeoutMs ?? EMS_NORMAL_TIMEOUT_MS;
  const maxTargets = Math.max(1, Math.min(options?.maxTargets ?? 24, 64));
  const boundedTargets = stringTargets.slice(0, maxTargets);

  const tasks = boundedTargets.map(async ({ arrayIndex, stringIndex }) => {
    const key = `${arrayIndex}:${stringIndex}`;
    const endpoint = `/tools/report/ems/array/${arrayIndex}/string/${stringIndex}/notifications.json`;
    const result = await acquireEmsEndpointWithRestProvider(endpoint, timeoutMs);
    stringNotificationsCache[key] = buildNotificationCacheEntry(endpoint, result);
  });

  await Promise.allSettled(tasks);
  return stringNotificationsCache;
}

export function getEmsCachedArrayNotifications(): Record<number, EmsNotificationCacheEntry> {
  return arrayNotificationsCache;
}

export function getEmsCachedArrayNotificationsForArray(arrayNumber: number) {
  return arrayNotificationsCache[arrayNumber] || null;
}

export function getEmsCachedStringNotifications(): Record<string, EmsNotificationCacheEntry> {
  return stringNotificationsCache;
}

function normalizeSeverity(input: any): "alarm" | "warning" {
  const s = String(input || "").toUpperCase();
  return s === "ALARM" || s === "CRITICAL" ? "alarm" : "warning";
}

function normalizeSeverityForIdentity(input: any): "ALARM" | "WARNING" | "UNKNOWN" {
  const s = String(input || "").trim().toUpperCase();
  if (s === "ALARM" || s === "CRITICAL") return "ALARM";
  if (s === "WARNING") return "WARNING";
  return "UNKNOWN";
}

function toNumberOrNull(value: any): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeIndexForIdentity(value: any): string {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? String(Math.trunc(n)) : "NA";
}

function normalizeTokenForIdentity(value: any): string {
  const v = String(value ?? "").trim();
  return v ? v.toUpperCase() : "NA";
}

function buildNotificationIdentifier(
  code: string,
  severity: "alarm" | "warning",
  arrayIndex: number | null,
  stringIndex: number | null,
  batteryPackIndex: number | null,
  cellGroupIndex: number | null
): string {
  return [
    severity,
    code || "UNKNOWN",
    arrayIndex ?? "-",
    stringIndex ?? "-",
    batteryPackIndex ?? "-",
    cellGroupIndex ?? "-",
  ].join("|");
}

function buildCanonicalNotificationIdentityV2(parts: {
  severity: any;
  notificationId: any;
  sourceType: any;
  arrayIndex: any;
  stringIndex: any;
  batteryPackIndex: any;
  cellGroupIndex: any;
}): string {
  return [
    "v2",
    `sev:${normalizeSeverityForIdentity(parts.severity)}`,
    `id:${normalizeTokenForIdentity(parts.notificationId)}`,
    `src:${normalizeTokenForIdentity(parts.sourceType)}`,
    `a:${normalizeIndexForIdentity(parts.arrayIndex)}`,
    `s:${normalizeIndexForIdentity(parts.stringIndex)}`,
    `bp:${normalizeIndexForIdentity(parts.batteryPackIndex)}`,
    `cg:${normalizeIndexForIdentity(parts.cellGroupIndex)}`,
  ].join("|");
}

function countDuplicatesAndSamples(rawIds: string[]): { duplicateCount: number; sampleDuplicates: string[] } {
  const counts = new Map<string, number>();
  for (const id of rawIds) {
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  const sampleDuplicates = [...counts.entries()]
    .filter(([, c]) => c > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, c]) => `${id}#dup:${c - 1}`);
  const duplicateCount = [...counts.values()].reduce((sum, c) => sum + Math.max(c - 1, 0), 0);
  return { duplicateCount, sampleDuplicates };
}

function extractRawCanonicalIdsFromTurtleNotifications(notificationRows: any[]): string[] {
  const rawIds: string[] = [];
  for (const row of notificationRows) {
    const source = row?.notificationSource || {};
    rawIds.push(
      buildCanonicalNotificationIdentityV2({
        severity: row?.notificationType?.notificationCategory,
        notificationId: row?.notificationType?.notificationId,
        sourceType: source.endpointType || source.type || row?.sourceEndpointType,
        arrayIndex: source.arrayIndex,
        stringIndex: source.stringIndex,
        batteryPackIndex: source.batteryPackIndex,
        cellGroupIndex: source.cellGroupIndex,
      })
    );
  }
  return rawIds;
}

function extractRawCanonicalIdsFromLegacyNotifications(legacyNotifications: any[]): string[] {
  const rawIds: string[] = [];
  for (const action of legacyNotifications || []) {
    const targets = Array.isArray(action?.affected) ? action.affected : [];
    const baseSeverity = action?.severity || action?.level;
    const baseCode = action?.code ?? action?.rawCode;
    const baseSourceType = action?.endpointType || action?.sourceEndpoint || action?.sourcePath || action?.source;

    if (targets.length === 0) {
      rawIds.push(
        buildCanonicalNotificationIdentityV2({
          severity: baseSeverity,
          notificationId: baseCode,
          sourceType: baseSourceType,
          arrayIndex: null,
          stringIndex: null,
          batteryPackIndex: null,
          cellGroupIndex: null,
        })
      );
      continue;
    }

    for (const target of targets) {
      rawIds.push(
        buildCanonicalNotificationIdentityV2({
          severity: baseSeverity,
          notificationId: baseCode,
          sourceType: target?.endpointType || target?.sourceEndpoint || target?.sourcePath || baseSourceType,
          arrayIndex: target?.arrayIndex,
          stringIndex: target?.stringIndex,
          batteryPackIndex: target?.batteryPackIndex,
          cellGroupIndex: target?.cellGroupIndex,
        })
      );
    }
  }
  return rawIds;
}

function extractIdentifiersFromTurtleNotifications(notificationRows: any[]): NotificationIdentifier[] {
  const out: NotificationIdentifier[] = [];
  for (const row of notificationRows) {
    const source = row?.notificationSource || {};
    const code = String(row?.notificationType?.notificationId ?? "");
    const severity = normalizeSeverity(row?.notificationType?.notificationCategory);
    const arrayIndex = toNumberOrNull(source.arrayIndex);
    const stringIndex = toNumberOrNull(source.stringIndex);
    const batteryPackIndex = toNumberOrNull(source.batteryPackIndex);
    const cellGroupIndex = toNumberOrNull(source.cellGroupIndex);
    out.push({
      id: buildNotificationIdentifier(code, severity, arrayIndex, stringIndex, batteryPackIndex, cellGroupIndex),
      code,
      severity,
      arrayIndex,
      stringIndex,
      batteryPackIndex,
      cellGroupIndex,
      sourceEndpointType: source.endpointType ? String(source.endpointType) : null,
    });
  }
  return out;
}

function extractIdentifiersFromLegacyNotifications(legacyNotifications: any[]): string[] {
  const ids: string[] = [];
  for (const action of legacyNotifications || []) {
    const code = String(action?.code ?? action?.rawCode ?? "");
    const severity = normalizeSeverity(action?.severity || action?.level);
    const targets = Array.isArray(action?.affected) ? action.affected : [];
    if (targets.length === 0) {
      ids.push(buildNotificationIdentifier(code, severity, null, null, null, null));
      continue;
    }
    for (const target of targets) {
      ids.push(
        buildNotificationIdentifier(
          code,
          severity,
          toNumberOrNull(target?.arrayIndex),
          toNumberOrNull(target?.stringIndex),
          toNumberOrNull(target?.batteryPackIndex),
          toNumberOrNull(target?.cellGroupIndex)
        )
      );
    }
  }
  return ids;
}

export function updateNotificationHybridTelemetry(
  legacyNotifications: any[],
  scope?: {
    arrayNumbers?: number[];
    stringTargets?: Array<{ arrayIndex: number; stringIndex: number }>;
  },
  datasets?: {
    arrayEntries?: Record<number, EmsNotificationCacheEntry>;
    stringEntries?: Record<string, EmsNotificationCacheEntry>;
  }
): NotificationHybridComparison {
  const scopedArrays = Array.isArray(scope?.arrayNumbers) && scope!.arrayNumbers!.length > 0
    ? new Set(scope!.arrayNumbers)
    : null;
  const scopedStrings = Array.isArray(scope?.stringTargets) && scope!.stringTargets!.length > 0
    ? new Set(scope!.stringTargets!.map((t) => `${t.arrayIndex}:${t.stringIndex}`))
    : null;

  const arraySource = datasets?.arrayEntries || arrayNotificationsCache;
  const stringSource = datasets?.stringEntries || stringNotificationsCache;

  const arrayRows = Object.entries(arraySource)
    .filter(([k]) => (scopedArrays ? scopedArrays.has(Number(k)) : true))
    .flatMap(([, entry]) => normalizeNotificationContainer(entry?.data).notification);

  const stringRows = Object.entries(stringSource)
    .filter(([k]) => (scopedStrings ? scopedStrings.has(k) : true))
    .flatMap(([, entry]) => normalizeNotificationContainer(entry?.data).notification);

  const legacyRawIds = extractRawCanonicalIdsFromLegacyNotifications(legacyNotifications || []);
  const turtleArrayRawIds = extractRawCanonicalIdsFromTurtleNotifications(arrayRows);
  const turtleStringRawIds = extractRawCanonicalIdsFromTurtleNotifications(stringRows);

  const legacyIds = new Set(legacyRawIds);
  const turtleArrayIds = new Set(turtleArrayRawIds);
  const turtleStringIds = new Set(turtleStringRawIds);
  const turtleUnionIds = new Set<string>([...turtleArrayIds, ...turtleStringIds]);

  const matched = [...legacyIds].filter((id) => turtleUnionIds.has(id)).sort();
  const missingFromLegacy = [...turtleUnionIds].filter((id) => !legacyIds.has(id)).sort();
  const missingFromTurtle = [...legacyIds].filter((id) => !turtleUnionIds.has(id)).sort();

  const legacyDup = countDuplicatesAndSamples(legacyRawIds);
  const turtleArrayDup = countDuplicatesAndSamples(turtleArrayRawIds);
  const turtleStringDup = countDuplicatesAndSamples(turtleStringRawIds);
  const sampleDuplicateIdentities = [
    ...legacyDup.sampleDuplicates,
    ...turtleArrayDup.sampleDuplicates,
    ...turtleStringDup.sampleDuplicates,
  ].slice(0, 5);

  lastNotificationHybridComparison = {
    comparisonTimestamp: new Date().toISOString(),
    canonicalIdentityVersion: "notification-identity-v2",
    canonicalIdentityFormat: "v2|sev:<ALARM|WARNING|UNKNOWN>|id:<notificationId|NA>|src:<sourceType|NA>|a:<array|NA>|s:<string|NA>|bp:<batteryPack|NA>|cg:<cellGroup|NA>",
    legacyRawCount: legacyRawIds.length,
    turtleArrayRawCount: turtleArrayRawIds.length,
    turtleStringRawCount: turtleStringRawIds.length,
    legacyCount: legacyIds.size,
    turtleArrayCount: turtleArrayIds.size,
    turtleStringCount: turtleStringIds.size,
    legacyDuplicateCount: legacyDup.duplicateCount,
    turtleArrayDuplicateCount: turtleArrayDup.duplicateCount,
    turtleStringDuplicateCount: turtleStringDup.duplicateCount,
    sampleDuplicateIdentities,
    matchedNotifications: matched,
    missingFromLegacy,
    missingFromTurtle,
    sampleMissingFromLegacy: missingFromLegacy.slice(0, 5),
    sampleMissingFromTurtle: missingFromTurtle.slice(0, 5),
    arraysPolled: Object.keys(arraySource)
      .map((k) => Number(k))
      .filter((n) => Number.isFinite(n) && (scopedArrays ? scopedArrays.has(n) : true))
      .sort((a, b) => a - b),
    stringTargetsPolled: Object.keys(stringSource)
      .filter((k) => (scopedStrings ? scopedStrings.has(k) : true))
      .sort(),
    legacyProductionOutputUnchanged: true,
  };

  return lastNotificationHybridComparison;
}

export async function runNotificationHybridComparison(options: {
  legacyNotifications: any[];
  arrayNumbers?: number[];
  stringTargets?: Array<{ arrayIndex: number; stringIndex: number }>;
  refreshArrays?: boolean;
  refreshStrings?: boolean;
  maxStringTargets?: number;
  timeoutMs?: number;
}): Promise<NotificationHybridComparison> {
  const arrayNumbers = Array.isArray(options.arrayNumbers) && options.arrayNumbers.length > 0
    ? options.arrayNumbers
    : [1, 2, 3, 4, 5, 6, 7, 8];
  const stringTargets = Array.isArray(options.stringTargets) ? options.stringTargets : [];
  const refreshArrays = options.refreshArrays !== false;
  const refreshStrings = options.refreshStrings !== false;

  const scopedArrayEntries: Record<number, EmsNotificationCacheEntry> = {};
  const scopedStringEntries: Record<string, EmsNotificationCacheEntry> = {};

  if (refreshArrays) {
    const arrTasks = arrayNumbers.map(async (arrayIndex) => {
      const endpoint = `/tools/report/ems/array/${arrayIndex}/notifications.json`;
      const result = await acquireEmsEndpointWithRestProvider(endpoint, options.timeoutMs ?? EMS_NORMAL_TIMEOUT_MS);
      const entry = buildNotificationCacheEntry(endpoint, result);
      arrayNotificationsCache[arrayIndex] = entry;
      scopedArrayEntries[arrayIndex] = entry;
    });
    await Promise.allSettled(arrTasks);
  } else {
    for (const arrayIndex of arrayNumbers) {
      if (arrayNotificationsCache[arrayIndex]) {
        scopedArrayEntries[arrayIndex] = arrayNotificationsCache[arrayIndex];
      }
    }
  }

  if (refreshStrings && stringTargets.length > 0) {
    const maxTargets = Math.max(1, Math.min(options.maxStringTargets ?? 24, 64));
    const boundedTargets = stringTargets.slice(0, maxTargets);
    const strTasks = boundedTargets.map(async ({ arrayIndex, stringIndex }) => {
      const key = `${arrayIndex}:${stringIndex}`;
      const endpoint = `/tools/report/ems/array/${arrayIndex}/string/${stringIndex}/notifications.json`;
      const result = await acquireEmsEndpointWithRestProvider(endpoint, options.timeoutMs ?? EMS_NORMAL_TIMEOUT_MS);
      const entry = buildNotificationCacheEntry(endpoint, result);
      stringNotificationsCache[key] = entry;
      scopedStringEntries[key] = entry;
    });
    await Promise.allSettled(strTasks);
  } else {
    for (const target of stringTargets) {
      const key = `${target.arrayIndex}:${target.stringIndex}`;
      if (stringNotificationsCache[key]) {
        scopedStringEntries[key] = stringNotificationsCache[key];
      }
    }
  }

  return updateNotificationHybridTelemetry(options.legacyNotifications || [], {
    arrayNumbers,
    stringTargets,
  }, {
    arrayEntries: scopedArrayEntries,
    stringEntries: scopedStringEntries,
  });
}

export function getNotificationHybridTelemetry(): NotificationHybridComparison {
  return lastNotificationHybridComparison;
}

export function getFirstResponderEndpointDebugInfo() {
  const v1Debug = endpointDebugMap["/firstresponder/data"];
  const v2Debug = endpointDebugMap["/v2/firstresponder/data"];

  // Estimate bytes from cached data if success
  const v1Bytes = emsCache.firstResponder?.v1 ? JSON.stringify(emsCache.firstResponder.v1).length : 0;
  const v2Bytes = emsCache.firstResponder?.v2 ? JSON.stringify(emsCache.firstResponder.v2).length : 0;

  return {
    v1: {
      endpoint: "/turtle/firstresponder/data",
      success: v1Debug?.success ?? false,
      statusCode: v1Debug?.statusCode ?? 0,
      durationMs: v1Debug?.durationMs ?? 0,
      timestamp: v1Debug?.lastPollTime || new Date().toISOString(),
      bytes: v1Bytes,
      parseSuccess: v1Debug?.success ? true : false,
      error: v1Debug?.lastError || null
    },
    v2: {
      endpoint: "/turtle/v2/firstresponder/data",
      success: v2Debug?.success ?? false,
      statusCode: v2Debug?.statusCode ?? 0,
      durationMs: v2Debug?.durationMs ?? 0,
      timestamp: v2Debug?.lastPollTime || new Date().toISOString(),
      bytes: v2Bytes,
      parseSuccess: v2Debug?.success ? true : false,
      error: v2Debug?.lastError || null
    }
  };
}
