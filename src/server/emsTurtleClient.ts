import fs from "fs";
import path from "path";
import { ProfileStore } from "./profiles/profileStore";
import { buildEmsBaseUrl } from "./profiles/profileManager";

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

// Cache ownership metadata tracking
export let cacheProfileId: string | null = null;
export let cacheEmsBaseUrl: string | null = null;
export let cacheCreatedAt: string | null = null;
export let cacheLastUpdatedAt: string | null = null;

export function isDemoActive(): boolean { return false; }

export function setDemoMode(active: boolean) {}


interface EmsCache {
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
}

// Strict Real-Time Cache for Actual LAN Ethernet Polling
export const emsCache: EmsCache = {
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
  siteCodeSource: null
};

// High-fidelity pre-filled simulation template (Only served when Demo Mode is explicitly active)
const DEMO_TEMPLATES = {
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
const OFFLINE_TEMPLATES = {
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
    rows.push(obj);
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
async function fetchAndRecord(endpoint: string, customTimeoutMs?: number, returnType: 'response' | 'json' | 'text' = 'response'): Promise<any> {
  const baseUrl = getNormalizedBaseUrl();
  const url = `${baseUrl}${endpoint}`;
  const controller = new AbortController();
  const timeoutMs = customTimeoutMs || Math.max(REQUEST_TIMEOUT_MS, 30000); 
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startTime = Date.now();

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
    const response = await fetch(url, { signal: controller.signal });
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
      const data = await response.json();
      const ext = endpoint.endsWith('.csv') ? '.csv' : (endpoint.endsWith('.txt') ? '.txt' : '.json');
      const safeKey = endpoint.replace(/\//gi, '_').replace(/[^a-zA-Z0-9-]/gi, '_');
      try {
        const prizmCache = require('./cache/prizmCache');
        prizmCache.set('raw_' + safeKey, data, { sourceUrl: url, isRaw: true, rawExt: ext, ttlMs: 15000 });
      } catch(e) {}
      return data;
    }

    if (returnType === 'text') {
      const data = await response.text();
      const ext = endpoint.endsWith('.csv') ? '.csv' : (endpoint.endsWith('.txt') ? '.txt' : '.json');
      const safeKey = endpoint.replace(/\//gi, '_').replace(/[^a-zA-Z0-9-]/gi, '_');
      try {
        const prizmCache = require('./cache/prizmCache');
        prizmCache.set('raw_' + safeKey, data, { sourceUrl: url, isRaw: true, rawExt: ext, ttlMs: 15000 });
      } catch(e) {}
      return data;
    }

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
  const stationCode = activeRef ? activeRef.stationCode : "BHE0020";
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
    }
  });
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

let lastSlowFetchTime = 0;

export async function pollEmsTurtle(): Promise<{ success: boolean; error: string | null }> {
  emsCache.hasAttemptedPoll = true;
  let overallError: string | null = null;
  let criticalEndpointsFailed = 0;
  let coreEndpointsSucceeded = 0;

  const criticalFetches = Promise.allSettled([
    fetchAndRecord('/status', EMS_FAST_TIMEOUT_MS, 'text').then(text => { 
      const statusText = String(text || '').trim();
      if (!statusText || !statusText.toUpperCase().startsWith('OK')) {
        throw new Error(`/status returned unexpected body: ${statusText.slice(0, 80)}`);
      }
      emsCache.status = { ...emsCache.status, turtleStatusOk: true, turtleStatusText: statusText };
      return statusText;
    }),
    fetchAndRecord('/tools/report/ems/status.json', EMS_FAST_TIMEOUT_MS, 'json').then(d => { emsCache.status = { ...emsCache.status, ...d }; return d; }),
    fetchAndRecord('/tools/monitor/ems/blockviewer/data', EMS_FAST_TIMEOUT_MS, 'json').then(d => { emsCache.block = d; return d; }),
    fetchAndRecord('/tools/report/ems/lastCall.json', EMS_FAST_TIMEOUT_MS, 'json').then(d => { emsCache.lastCall = d; return d; }),
    fetchAndRecord('/tools/report/ems/strings.csv', EMS_FAST_TIMEOUT_MS, 'text').then(text => { emsCache.strings = parseCsv(text); return text; })
  ]);

  const criticalResults = await criticalFetches;
  criticalResults.forEach(res => {
    if (res.status === 'fulfilled' && res.value) coreEndpointsSucceeded++;
    else { const r = (res as PromiseRejectedResult).reason; overallError = r?.message || String(r); criticalEndpointsFailed++; }
  });

  const optionalFetches = Promise.allSettled([
    fetchAndRecord('/tools/report/ems/controllerStatistics.json', EMS_NORMAL_TIMEOUT_MS, 'json').then(d => { emsCache.controllerStatistics = d; }),
    fetchAndRecord('/tools/report/ems/bessStatusCodes.json', EMS_NORMAL_TIMEOUT_MS, 'json').then(d => { emsCache.bessStatusCodes = d; }),
    fetchAndRecord('/tools/report/ems/ipMap.json', EMS_NORMAL_TIMEOUT_MS, 'text').then(t => { try { emsCache.ipMap = JSON.parse(t); } catch { emsCache.ipMap = t; } }).catch(async () => { const csv = await fetchAndRecord('/tools/report/ems/ipMap.csv', EMS_NORMAL_TIMEOUT_MS, 'text'); try { emsCache.ipMap = JSON.parse(csv); } catch { emsCache.ipMap = csv; } }),
    fetchAndRecord('/tools/report/ems/stringIPMap.json', EMS_NORMAL_TIMEOUT_MS, 'text').then(t => { try { emsCache.stringIPMap = JSON.parse(t); } catch { emsCache.stringIPMap = t; } }).catch(async () => { const csv = await fetchAndRecord('/tools/report/ems/stringIPMap.csv', EMS_NORMAL_TIMEOUT_MS, 'text'); try { emsCache.stringIPMap = JSON.parse(csv); } catch { emsCache.stringIPMap = csv; } }),
    fetchAndRecord('/firstresponder/data', EMS_NORMAL_TIMEOUT_MS, 'json').then(d => { emsCache.firstResponder = { ...emsCache.firstResponder, v1: d }; }),
    fetchAndRecord('/v2/firstresponder/data', EMS_NORMAL_TIMEOUT_MS, 'json').then(d => { emsCache.firstResponder = { ...emsCache.firstResponder, v2: d }; })
  ]);
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

  if (discovered) { emsCache.discoveredStationCode = discovered; emsCache.siteCodeSource = source; }

  if (coreEndpointsSucceeded > 0 || criticalEndpointsFailed < 3) {
    emsCache.lastUpdated = cacheLastUpdatedAt;
    emsCache.lastError = overallError ? 'partial: ' + overallError : null;
    return { success: true, error: emsCache.lastError };
  } else {
    emsCache.lastUpdated = cacheLastUpdatedAt;
    emsCache.lastError = overallError || 'Multiple critical EMS endpoints are unreachable';
    return { success: false, error: emsCache.lastError };
  }
}
export function getEmsConnectionStatus() {
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
     if (rawBlock && !emsCache.block) emsCache.block = rawBlock;
     
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


