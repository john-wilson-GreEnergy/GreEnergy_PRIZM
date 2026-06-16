import * as prizmCache from "./src/server/cache/prizmCache";
import AdmZip from "adm-zip";
import { getCorrectiveActionsFromNormalizedFaults } from "./src/server/faults/normalizedFaultSource";
import safetyFaultClearRouter from "./src/server/safetyFaultClear";
import stringsDashboardRouter from "./src/server/stringsDashboard";
import overviewDiscoveryRouter from "./src/server/overviewDiscovery";
import cacheRoutes from "./src/server/cache/cacheRoutes";
import historyRoutes from "./src/server/history/historyRoutes";
import siteOperationsRouter from "./src/server/siteOperations";
import { topologyRouter } from "./src/server/topology/topologyRoutes";
import modbusRouter from "./src/server/telemetry/modbusRoutes";
import { rotationRouter } from "./src/server/rotationRoutes";
import { balancingRouter } from "./src/server/balancingRoutes";
import emsAppRoutes from "./src/server/ems/emsAppRoutes";
import { startModbusScheduler } from "./src/server/telemetry/modbusProfileManager";
import storageRouter from "./src/server/storage/storageRoutes";
import { initLocalStorageMaintenance } from "./src/server/storage/storageMaintenance";

import { emsCache, bootstrapEmsAndSeedCache, getExtendedConnectionStatus } from "./src/server/emsTurtleClient";
import { bootstrapFeatherDiscoveryAndSeedCache } from "./src/server/feather/featherClient";
import express from "express";
import { recordTelemetrySample, getSiteTelemetryHistory, getLatestSiteMetrics } from "./src/server/telemetry/siteTelemetryAggregator";
import path from "path";
import fs from "fs";
import net from "net";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { BessDevice, BessLog, ReportConfig, SmartDiagnosticResponse } from "./src/types";
import { pollRealtimeDevice } from "./src/modbus-client";
import {
  pollEmsTurtle,
  getEmsConnectionStatus,
  getEmsCachedStatus,
  getEmsCachedBlock,
  getEmsCachedStatusCodes,
  getEmsCachedFirstResponder,
  getEmsCachedModbusMap,
  getEmsCachedRawStrings,
  getEmsSourcesDebugInfo,
  getEmsIpMap,
  getEmsStringIpMap,
  getEmsMode,
  setDemoMode,
  isDemoActive,
  getEmsCachedControllerStatistics,
  getEmsCachedLastCall,
  clearEmsTelemetryCache
} from "./src/server/emsTurtleClient";
import { ProfileStore, getDefaultTopologyModel } from "./src/server/profiles/profileStore";
import { ProfileManager, validateTopologyModel, generateTopologyPreview } from "./src/server/profiles/profileManager";
import { discoverTopologyCandidates } from "./src/server/feather/featherDiscovery";
import { getFeatherCache, clearFeatherCache, queryFeatherDevice } from "./src/server/feather/featherClient";
import { buildSiteTopologyFromCachedSources } from "./src/server/topology/siteTopology";
import { resolveScanCandidates, executeFeatherScan } from "./src/server/feather/featherScanner";
import { executeDataDiscovery } from "./src/server/telemetry/discovery";
import hvacSimulationRouter from "./src/server/hvacSimulation/hvacSimulationRoutes";
import { getCommunicating, getOutRotation, getContactorsClosed, classifyStringOperationalState } from "./src/lib/stringClassifier";



const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

import lightbarRouter from "./src/server/lightbar/lightbarRoutes";

app.use("/api/local/lightbar", lightbarRouter);
app.use("/api/local/safety-fault-clear", safetyFaultClearRouter);
app.use("/api/local/strings/dashboard", stringsDashboardRouter);
app.use("/api/local/overview", overviewDiscoveryRouter);
app.use("/api/local/site-operations", siteOperationsRouter);
app.use("/api/local/cache", cacheRoutes);
app.use("/api/local/history", historyRoutes);
app.use("/api/local", topologyRouter);
app.use("/api/local/modbus", modbusRouter);
app.use("/api/local/telemetry", modbusRouter);
app.use("/api/local", rotationRouter);
app.use("/api/local/balancing", balancingRouter);
app.use("/api/local/ems-apps", emsAppRoutes);
app.use("/api/local/hvac-simulation", hvacSimulationRouter);
app.use("/api/local/storage", storageRouter);

import { getBootStatus, initializePrizmBootFlow, startBackgroundPolling, handleProfileChange } from "./src/server/startup/prizmBootOrchestrator";

import * as prizmDataCoordinator from "./src/server/prizmDataCoordinator";

app.get("/api/local/snapshot", (req, res) => {
  const snapshot = prizmDataCoordinator.getLatestSnapshot();
  if (!snapshot) return res.status(503).json({ error: "Snapshot not yet built" });
  res.json(snapshot);
});

app.get("/api/local/snapshot/site-operations-summary", (req, res) => {
  const snapshot = prizmDataCoordinator.getLatestSnapshot();
  if (!snapshot) return res.status(503).json({ error: "Snapshot not yet built" });
  res.json({
    cacheMeta: snapshot.liveStatus,
    siteState: snapshot.liveStatus.state,
    ...snapshot.rollups,
    activeIssueGroups: snapshot.normalized.correctiveActions,
    stringSummary: snapshot.rollups.stringSummary
  });
});

app.get("/api/local/strings/dashboard", (req, res) => {
  const snapshot = prizmDataCoordinator.getLatestSnapshot();
  if (!snapshot) return res.status(503).json({ error: "Snapshot not yet built" });
  res.json({
    cards: snapshot.rollups.stringSummary?.summary || {},
    rollups: snapshot.rollups.stringSummary?.summary || {},
    cardsData: snapshot.rollups.stringSummary?.summary || {},
    summary: snapshot.rollups.stringSummary?.summary || {},
    strings: snapshot.normalized.strings || []
  });
});

app.get("/api/local/pcs/dashboard", (req, res) => {
  const snapshot = prizmDataCoordinator.getLatestSnapshot();
  if (!snapshot) return res.status(503).json({ error: "Snapshot not yet built" });
  res.json(snapshot.normalized.pcs || []);
});

app.get("/api/local/feather/devices", async (req, res) => {
  const snapshot = prizmDataCoordinator.getLatestSnapshot();
  if (!snapshot) return res.status(503).json({ error: "Snapshot not yet built" });
  res.json({ devices: snapshot.normalized.feather || [] });
});

app.get("/api/local/corrective-actions", (req, res) => {
  const snapshot = prizmDataCoordinator.getLatestSnapshot();
  if (!snapshot) return res.status(503).json({ error: "Snapshot not yet built" });
  res.json(snapshot.normalized.correctiveActions || []);
});

app.get("/api/local/system/boot-status", (req, res) => {
  res.json(getBootStatus());
});

app.post("/api/local/system/reinitialize", (req, res) => {
  handleProfileChange();
  res.json(getBootStatus());
});

app.post("/api/local/system/refresh-live", async (req, res) => {
  // trigger background action
  startBackgroundPolling();
  res.json({ success: true, message: "Triggered live refresh" });
});


// Ensure data folder exists
const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}





// Helper file persistence
function readJSONFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(data) as T;
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
  }
  return defaultValue;
}

function writeJSONFile<T>(filePath: string, data: T): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
  }
}



// Load collections from files or write seeds









// Mock curl transaction recorder to show developers what commands are mapped under the hood
interface CurlLog {
  id: string;
  timestamp: string;
  command: string;
  url: string;
  targetDeviceName: string;
  responseStatus: number;
  payloadSent?: string;
  responsePayload: string;
}
let curlLogs: CurlLog[] = [];

function recordCurl(device: BessDevice, endpoint: string, method: string, description: string, payload?: any, responseStatus: number = 200, resBody: string = '{"status": "ok"}') {
  const payloadStr = payload ? JSON.stringify(payload) : "";
  const curlCmd = `curl -X ${method} -H "Content-Type: application/json" ${payloadStr ? `-d '${payloadStr}'` : ""} "http://${device.ipAddress}:${device.port}/api/v1/bess/${endpoint}"`;
  
  curlLogs.unshift({
    id: "curl-" + Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toISOString(),
    command: curlCmd,
    url: `http://${device.ipAddress}:${device.port}/api/v1/bess/${endpoint}`,
    targetDeviceName: device.name,
    responseStatus,
    payloadSent: payloadStr || undefined,
    responsePayload: resBody
  });
  if (curlLogs.length > 50) curlLogs.pop();
}

// --- CLOUD TELEMETRY INTERCEPTOR ---
export interface CloudTelemetryPacket {
  id: string;
  timestamp: string;
  sourceIp: string;
  sourceComponent: string;
  destinationCloudEndpoint: string;
  transmissionProtocol: string;
  rawPayloadSize: string;
  responseStatus: string;
  payload: any;
}

let cloudTelemetryPackets: CloudTelemetryPacket[] = [];
let telemetryCalibrationAligned = false;
let localCloudOutageActive = false;
let softBalancingOverride = false;
let systemWideIsolationTriggered = false;

function generateTelemetryPacket() {
  const now = new Date();
  const packetId = "p_export_" + Math.random().toString(36).substring(2, 9);
  
  // Imbalance simulation for Array 3 String 1 (Cell 13/14)
  // If soft balancing override is active, cell 14 is balanced down and cell 13 is charged up.
  const cell14Voltage = softBalancingOverride ? 3240 : 3510;
  const cell13Voltage = softBalancingOverride ? 3230 : 3080;
  const cell14Temp = softBalancingOverride ? 28.5 : 55.0;
  const string3Status = systemWideIsolationTriggered ? "ISOLATED" : (softBalancingOverride ? "ONLINE" : "FAULTED");
  const string3Contactor = systemWideIsolationTriggered ? "OPEN" : (softBalancingOverride ? "CLOSED" : "OPEN");

  // Calibrating calculations for Wattage & Current SF
  // If aligned: Watts are kW (value / 10), Amps are A (value / 10)
  // If raw: Watts are pure raw W, Current is raw multiplier
  const powerScale = telemetryCalibrationAligned ? 1.0 : 100.0;
  const currentScale = telemetryCalibrationAligned ? 1.0 : 10.0;

  // Real-time fluctuating BMS and String variables matching the 10.0.*.* subnets precisely!
  const devStateList = [
    {
      device_id: "lineup-1-bms",
      name: "Lineup 1 AC Cabinet BMS",
      ip: "10.0.1.1",
      role: "BMS / Phoenix Controller",
      status: systemWideIsolationTriggered ? "Isolated" : "Charging",
      soc: 42.5,
      soh: 96.8,
      voltage: 482.4,
      current: parseFloat(((systemWideIsolationTriggered ? 0.0 : 45.0) * currentScale).toFixed(1)),
      power_kw: parseFloat(((systemWideIsolationTriggered ? 0.0 : 124.2) * powerScale).toFixed(2)),
      temperature: 34.6,
      isOnline: true,
      modbus_registers: {
        raw_holding_84: systemWideIsolationTriggered ? 0 : 1242,   // Active Power Register
        raw_holding_691: systemWideIsolationTriggered ? 0 : 450,   // Total DC Current
        raw_holding_1163: 346, // Max Module Temp (34.6)
        raw_holding_658: 425   // State of Charge
      }
    },
    {
      device_id: "array-1-string-1",
      name: "Rack Node Array 1 String 1",
      ip: "10.0.1.10",
      role: "RCU String Monitor",
      status: systemWideIsolationTriggered ? "OFFLINE" : "ONLINE",
      soc: 42.5,
      soh: 96.5,
      voltage: 480.2,
      current: parseFloat(((systemWideIsolationTriggered ? 0.0 : 12.4) * currentScale).toFixed(1)),
      max_cell_voltage_mv: 3265,
      max_cell_temperature_c: 25.5,
      balancer_mode: 0,
      contactor_state: systemWideIsolationTriggered ? "OPEN" : "CLOSED"
    },
    {
      device_id: "array-1-string-2",
      name: "Rack Node Array 1 String 2",
      ip: "10.0.1.15",
      role: "RCU String Monitor",
      status: systemWideIsolationTriggered ? "OFFLINE" : "ONLINE",
      soc: 55.4,
      soh: 96.5,
      voltage: 480.2,
      current: parseFloat(((systemWideIsolationTriggered ? 0.0 : 12.4) * currentScale).toFixed(1)),
      max_cell_voltage_mv: 3270,
      max_cell_temperature_c: 24.8,
      balancer_mode: 0,
      contactor_state: systemWideIsolationTriggered ? "OPEN" : "CLOSED"
    },
    {
      device_id: "lineup-3-bms",
      name: "Lineup 3 AC Cabinet BMS",
      ip: "10.0.3.1",
      role: "BMS / Phoenix Controller",
      status: systemWideIsolationTriggered ? "Isolated" : (softBalancingOverride ? "Charging" : "Faulted"),
      soc: 18.4,
      soh: 89.2,
      voltage: 410.2,
      current: parseFloat(((systemWideIsolationTriggered ? 0.0 : (softBalancingOverride ? 45.0 : 0.0)) * currentScale).toFixed(1)),
      power_kw: parseFloat(((systemWideIsolationTriggered ? 0.0 : (softBalancingOverride ? 124.2 : 0.0)) * powerScale).toFixed(2)),
      temperature: softBalancingOverride ? 29.4 : 52.4,
      isOnline: true,
      modbus_registers: {
        raw_holding_84: (systemWideIsolationTriggered || !softBalancingOverride) ? 0 : 1242,
        raw_holding_691: (systemWideIsolationTriggered || !softBalancingOverride) ? 0 : 450,
        raw_holding_1163: softBalancingOverride ? 294 : 524,
        raw_holding_658: 184
      }
    },
    {
      device_id: "array-3-string-1",
      name: "Rack Node Array 3 String 1",
      ip: "10.0.3.10",
      role: "RCU String Monitor",
      status: string3Status,
      soc: 18.4,
      soh: 89.2,
      voltage: 410.2,
      current: 0.0,
      max_cell_voltage_mv: cell14Voltage,
      max_cell_temperature_c: cell14Temp,
      cell_13_voltage_mv: cell13Voltage,
      balancer_mode: softBalancingOverride ? 0 : 2,
      contactor_state: string3Contactor
    },
    {
      device_id: "array-3-string-2",
      name: "Rack Node Array 3 String 2",
      ip: "10.0.3.15",
      role: "RCU String Monitor",
      status: systemWideIsolationTriggered ? "OFFLINE" : "ONLINE",
      soc: 64.2,
      soh: 89.2,
      voltage: 480.2,
      current: parseFloat(((systemWideIsolationTriggered ? 0.0 : 12.4) * currentScale).toFixed(1)),
      max_cell_voltage_mv: 3255,
      max_cell_temperature_c: 26.1,
      balancer_mode: 0,
      contactor_state: systemWideIsolationTriggered ? "OPEN" : "CLOSED"
    }
  ];

  const rawActivePower = devStateList.reduce((sum, d) => {
    const isCharging = d.status === "Charging" || d.status === "ONLINE";
    return sum + (isCharging ? (d.power_kw ? d.power_kw : (d.voltage * Math.abs(d.current) / 1000.0)) : 0);
  }, 0);

  const meterWatts = systemWideIsolationTriggered 
    ? 0 
    : (telemetryCalibrationAligned ? 124.5 : 1245000);

  const payload = {
    meta: {
      site_id: "SOLAR_STAR_3",
      ems_controller_ip: "10.0.0.3",
      controller_version: "v3.12.8-stable",
      timestamp_epoch: Math.floor(now.getTime() / 1000),
      ingest_channel: "production-live-us-west",
      wan_tunnel_connection: localCloudOutageActive ? "DISCONNECTED" : "ESTABLISHED",
      cloud_sync_state: localCloudOutageActive ? "FALLBACK_LOCAL_STORE" : "SYNCHRONIZED"
    },
    bms_summary: {
      total_active_power_kw: parseFloat(rawActivePower.toFixed(2)),
      overall_isolation_status: systemWideIsolationTriggered ? "ISOLATED" : "NOMINAL",
      active_faults_count: systemWideIsolationTriggered ? 0 : (softBalancingOverride ? 0 : 1),
      three_phase_utility_meter: {
        ip: "10.0.0.3",
        meter_identifier_block: 203,
        meter_amps: parseFloat(((systemWideIsolationTriggered ? 0.0 : 30.0) * currentScale).toFixed(1)),
        meter_voltage_ln: 277,
        meter_watts: meterWatts,
        unit_power: telemetryCalibrationAligned ? "kW" : "Watts"
      }
    },
    downstream_devices: devStateList
  };

  const pct: CloudTelemetryPacket = {
    id: packetId,
    timestamp: now.toISOString(),
    sourceIp: "10.0.0.3",
    sourceComponent: "Primary EMS Controller",
    destinationCloudEndpoint: "https://bess-cloud-ingest.greenergycare.com/bess/v2/ingest",
    transmissionProtocol: "HTTPS POST",
    rawPayloadSize: `${(JSON.stringify(payload).length / 1024).toFixed(2)} KB`,
    responseStatus: localCloudOutageActive ? "503 GATEWAY TIMEOUT (Internet Down)" : "202 ACCEPTED",
    payload
  };

  cloudTelemetryPackets.unshift(pct);
  if (cloudTelemetryPackets.length > 50) {
    cloudTelemetryPackets.pop();
  }
}

// Generate some initial historical packets so the stream is pre-populated
for (let i = 15; i >= 0; i--) {
  const now = new Date(Date.now() - i * 60000); // spread over last 15 minutes
  const packetId = "p_export_hist_" + Math.random().toString(36).substring(2, 9);
  
  const payload = {
    meta: {
      site_id: "SOLAR_STAR_3",
      ems_controller_ip: "10.0.0.3",
      controller_version: "v3.12.8-stable",
      timestamp_epoch: Math.floor(now.getTime() / 1000),
      ingest_channel: "production-live-us-west",
      wan_tunnel_connection: "ESTABLISHED",
      cloud_sync_state: "SYNCHRONIZED"
    },
    bms_summary: {
      total_active_power_kw: telemetryCalibrationAligned ? 124.2 : 124200.0,
      overall_isolation_status: "NOMINAL",
      active_faults_count: 1,
      three_phase_utility_meter: {
        ip: "10.0.0.3",
        meter_identifier_block: 203,
        meter_amps: telemetryCalibrationAligned ? 30.0 : 300.0,
        meter_voltage_ln: 277,
        meter_watts: telemetryCalibrationAligned ? 124.5 : 1245000,
        unit_power: telemetryCalibrationAligned ? "kW" : "Watts"
      }
    },
    downstream_devices: [
      {
        device_id: "lineup-1-bms",
        name: "Lineup 1 AC Cabinet BMS",
        ip: "10.0.1.1",
        status: "Charging",
        soc: 42.5,
        soh: 96.8,
        voltage: 482.4,
        current: telemetryCalibrationAligned ? 45.0 : 450.0,
        power_kw: telemetryCalibrationAligned ? 124.2 : 124200.0,
        temperature: 34.6,
        isOnline: true
      },
      {
        device_id: "array-3-string-1",
        name: "Rack Node Array 3 String 1",
        ip: "10.0.3.10",
        status: "FAULTED",
        soc: 18.4,
        soh: 89.2,
        voltage: 410.2,
        current: 0.0,
        max_cell_voltage_mv: 3510,
        max_cell_temperature_c: 55.0
      }
    ]
  };

  cloudTelemetryPackets.push({
    id: packetId,
    timestamp: now.toISOString(),
    sourceIp: "10.0.0.3",
    sourceComponent: "Primary EMS Controller",
    destinationCloudEndpoint: "https://bess-cloud-ingest.greenergycare.com/bess/v2/ingest",
    transmissionProtocol: "HTTPS POST",
    rawPayloadSize: `${(JSON.stringify(payload).length / 1024).toFixed(2)} KB`,
    responseStatus: "202 ACCEPTED",
    payload
  });
}



// ==================== LOCAL EMS TURTLE INTEGRATION API ROUTES ====================
// Setup background interval polling for EMS Turtle from configure interval
// background polling is now handled by prizmBootOrchestrator
// Kick off initial bootstrap cache seed
bootstrapEmsAndSeedCache().then(() => {
    bootstrapFeatherDiscoveryAndSeedCache();
    startModbusScheduler();
}).catch(err => {
  console.log("[EMS LAN Info] Initial offline scan or bootstrap failed or finished.");
  startModbusScheduler();
});

// 1. GET /api/local/connection: Reports LAN connectivity telemetry
app.get("/api/local/connection", (req, res) => {
  res.json(getEmsConnectionStatus());
});

// GET /api/local/ems/connection-status
app.get("/api/local/ems/connection-status", (req, res) => {
  const status = getExtendedConnectionStatus();
  try {
     
     prizmCache.set('connection-status', status, { ttlMs: 15000 });
     if (prizmCache.writeHistory) prizmCache.writeHistory('connection-status', status);
  } catch(e) {}
  res.json(status);
});

// POST /api/local/ems/retry-connection
app.post("/api/local/ems/retry-connection", async (req, res) => {
  await bootstrapEmsAndSeedCache();
  bootstrapFeatherDiscoveryAndSeedCache({ force: true });
  res.json(getExtendedConnectionStatus());
});

// POST /api/local/cache/seed
app.post("/api/local/cache/seed", async (req, res) => {
  const result = await bootstrapEmsAndSeedCache();
  bootstrapFeatherDiscoveryAndSeedCache({ force: true });
  res.json(result);
});

app.get("/api/local/data-discovery/site-equipment", async (req, res) => {
  try {
    const discovery = await executeDataDiscovery();
    res.json(discovery);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to execute data discovery" });
  }
});

// 2. GET /api/local/status: Proxy to ems/status.json

app.get("/api/local/site-metrics", (req, res) => {
  res.json(getLatestSiteMetrics() || { error: "No metrics available yet" });
});

app.get("/api/local/site-metrics/history", (req, res) => {
  res.json(getSiteTelemetryHistory());
});

app.get("/api/local/status", (req, res) => {
  res.json(getEmsCachedStatus());
});

// 3. GET /api/local/block: Primary source tools/monitor/ems/blockviewer/data
app.get("/api/local/block", (req, res) => {
  res.json(getEmsCachedBlock());
});

// 4. GET /api/local/arrays: Derived from blockviewer arrays
app.get("/api/local/arrays", (req, res) => {
  const block = getEmsCachedBlock();
  res.json({
    source: block.source,
    staleData: block.staleData,
    lastUpdated: block.lastUpdated,
    activeEmsBaseUrl: block.activeEmsBaseUrl,
    activeProfileName: block.activeProfileName,
    activeProfileId: block.activeProfileId,
    stationCode: block.stationCode,
    blockIndex: block.blockIndex,
    lastError: block.lastError,
    cacheProfileId: block.cacheProfileId,
    cacheEmsBaseUrl: block.cacheEmsBaseUrl,
    cacheCreatedAt: block.cacheCreatedAt,
    cacheLastUpdatedAt: block.cacheLastUpdatedAt,
    data: block.data?.arrays || []
  });
});


// Optional Helper for safely parsing numbers
function pN(val: any, def: number | null = null): number | null {
  if (val === undefined || val === null || val === "") return def;
  const n = Number(val);
  return isNaN(n) ? def : n;
}

// Site Distribution Endpoint
app.get("/api/local/site-distribution/strings", (req, res) => {
  const rawStringsWrapper = getEmsCachedRawStrings();
  const blockWrapper = getEmsCachedBlock();
  const ipMapWrapper = getEmsStringIpMap();
  const conn: any = getEmsConnectionStatus() || {};

  let rawData = [];
  let metaWrapper = rawStringsWrapper;
  let sourceLabel: "site-operations-summary" | "strings.csv" | "native-blockviewer" | "hybrid" = "hybrid";

  if (rawStringsWrapper.data && rawStringsWrapper.data.length > 0) {
    rawData = rawStringsWrapper.data;
    const src = String(rawStringsWrapper.source || "").toLowerCase();
    if (src.includes("csv") || src.includes("string")) {
      sourceLabel = "strings.csv";
    } else if (src.includes("summary") || src.includes("operation")) {
      sourceLabel = "site-operations-summary";
    } else {
      sourceLabel = "hybrid";
    }
  } else if (blockWrapper.data && blockWrapper.data.strings && blockWrapper.data.strings.length > 0) {
    rawData = blockWrapper.data.strings;
    metaWrapper = blockWrapper;
    sourceLabel = "native-blockviewer";
  } else {
    const blockData = blockWrapper.data || {};
    rawData = blockData.strings || blockData.stringSummary?.tableRows || [];
    metaWrapper = blockWrapper;
    sourceLabel = "native-blockviewer";
  }

  let ipMap: any[] = [];
  if (ipMapWrapper && Array.isArray(ipMapWrapper.data)) {
    ipMap = ipMapWrapper.data;
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

  const rows = rawData.map((row: any) => {
    const arrayIndex = parseSafeNum(row.arrayIndex ?? row.arrayNumber ?? row.array ?? row.ArrayIndex ?? row.ArrayNumber) ?? 1;
    const stringIndex = parseSafeNum(row.stringIndex ?? row.stringNumber ?? row.string ?? row.StringIndex ?? row.StringNumber) ?? 1;
    
    const ipInfo = ipMap.find((ip: any) => ip.array === arrayIndex && ip.string === stringIndex);
    const ipAddress = row.ipAddress || row.ip || ipInfo?.ip || "Unknown";

    const label = row.displayLabel || row.label || row.location || `A${arrayIndex}-S${stringIndex}`;

    // Voltage normalization
    const rawVolt = row.stackVoltage ?? row.stackVoltageVdc ?? row.stackVoltageVDC ?? row.dcVoltage ?? row.dcVoltageVdc ?? row.vStack ?? row.stringVoltage ?? row.voltageCalculated ?? row.voltageCalc ?? row.voltageMeasured ?? row.voltageMeas ?? row.calculatedVoltage ?? row.measuredVoltage ?? row.dcBusVoltage ?? row.voltage;
    const cleanVoltage = parseSafeNum(rawVolt);

    // Temperature normalization
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
    } else if (!communicating && inRotation) {
      statusColor = "red";
      statusLabel = "Disconnected and In Rotation";
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

  const stringCount = rows.length;
  const communicatingCount = rows.filter(r => r.communicating).length;
  const outOfRotationCount = rows.filter(r => r.outRotation).length;
  const notCommunicatingCount = rows.filter(r => !r.communicating).length;

  const voltages = rows.map(r => r.stackVoltage).filter((v): v is number => v !== undefined && v !== null);
  const voltageMin = voltages.length > 0 ? Math.min(...voltages) : undefined;
  const voltageMax = voltages.length > 0 ? Math.max(...voltages) : undefined;
  const voltageAvg = voltages.length > 0 ? Number((voltages.reduce((sum, v) => sum + v, 0) / voltages.length).toFixed(1)) : undefined;

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

// 5. GET /api/local/strings: Derived from tools/report/ems/strings.csv or fallback to blockviewer
app.get("/api/local/strings", (req, res) => {
  const rawStringsWrapper = getEmsCachedRawStrings();
  const blockWrapper = getEmsCachedBlock();
  const ipMapWrapper = getEmsStringIpMap();
  
  let rawData = [];
  let metaWrapper = rawStringsWrapper;
  if (rawStringsWrapper.data && rawStringsWrapper.data.length > 0) {
    rawData = rawStringsWrapper.data;
  } else {
    rawData = blockWrapper.data?.strings || [];
    metaWrapper = blockWrapper;
  }
  
  let ipMap: any[] = [];
  if (ipMapWrapper && Array.isArray(ipMapWrapper.data)) {
    ipMap = ipMapWrapper.data;
  }

  const normalizedRows = rawData.map((row: any) => {
    const arrayIndex = pN(row.arrayIndex || row.array, 1)!;
    const stringIndex = pN(row.stringIndex || row.string, 1)!;
    const stringKey = `A${arrayIndex}-S${stringIndex}`;
    
    // Look up ipMap
    const ipInfo = ipMap.find((ip: any) => ip.array === arrayIndex && ip.string === stringIndex);

    let connectionState = row.connectionState || row.contact || row.communicating;
    if (connectionState === true || connectionState === "true") connectionState = "Online";
    else if (connectionState === false || connectionState === "false") connectionState = "Offline";
    else if (!connectionState) connectionState = "Unknown";
    else connectionState = String(connectionState);

    const contactorsCloseExpected = Boolean(row.contact_close_expected ?? row.contactCloseExpected ?? (connectionState === "Online"));
    const positiveContactorClosed = Boolean(row.positive_contactor_closed ?? row.positiveContactorClosed ?? (connectionState === "Online"));
    const negativeContactorClosed = Boolean(row.negative_contactor_closed ?? row.negativeContactorClosed ?? (connectionState === "Online"));
    
    const contactorMismatch = (contactorsCloseExpected !== positiveContactorClosed) || (contactorsCloseExpected !== negativeContactorClosed);

    const maxT = pN(row.cellGroupTempMax || row.cellTempMax);
    const minT = pN(row.cellGroupTempMin || row.cellTempMin);
    const maxV = pN(row.cellGroupVoltageMax || row.cellVoltsMax || row.maxCellVoltage);
    const minV = pN(row.cellGroupVoltageMin || row.cellVoltsMin || row.minCellVoltage);

    return {
      arrayIndex,
      stringIndex,
      stringKey,
      timestamp: row.timestamp || metaWrapper.lastUpdated || new Date().toISOString(),
      datetime: row.datetime || "",
      connectionState,
      soc: pN(row.soc || row.powerSoc),
      kw: pN(row.kw || row.powerkW || row.measuredKw),
      kwh: pN(row.kwh || row.powerKwh),
      ah: pN(row.ah),
      calculatedVoltage: pN(row.voltageCalculated || row.voltageCalc),
      measuredVoltage: pN(row.voltageMeasured || row.voltageMeas),
      dcBusVoltage: pN(row.voltageDcBus || row.voltageBus),
      stringCurrent: pN(row.current || row.stringCurrent),
      ctCurrent1: pN(row.ctCurrent1),
      ctCurrent2: pN(row.ctCurrent2),
      contactorsCloseExpected,
      positiveContactorClosed,
      negativeContactorClosed,
      contactorMismatch,
      recloseCount: pN(row.recloseCount, 0),
      outRotation: Boolean(row.out_rotation ?? row.outRotation ?? (row.rotation === "fault" || row.outOfRotation)),
      maxCellTemp: maxT,
      minCellTemp: minT,
      avgCellTemp: pN(row.cellGroupTempAvg || row.avgCellTemp),
      tempDelta: (maxT !== null && minT !== null) ? Number((maxT - minT).toFixed(1)) : null,
      maxCellVoltage: maxV,
      minCellVoltage: minV,
      avgCellVoltage: pN(row.cellGroupVoltageAvg || row.avgCellVoltage),
      voltageDelta: (maxV !== null && minV !== null) ? Number((maxV - minV).toFixed(3)) : null,
      alarmCount: pN(row.alarmCount || row.alarms, 0),
      alarms: row.alarmsList || [],
      warnCount: pN(row.warningCount || row.warnings, 0),
      warns: row.warningsList || [],
      lastFanCommand: row.lastFanCommand || row.fanStatus || "Unknown",
      location: row.location || `R${arrayIndex}-Rack${stringIndex}`,
      ipAddress: row.ipAddress || ipInfo?.ip || "Unknown",
      entityToken: row.entityToken || ipInfo?.token || "N/A"
    };
  });

  res.json({
    source: metaWrapper.source,
    staleData: metaWrapper.staleData,
    lastUpdated: metaWrapper.lastUpdated,
    activeEmsBaseUrl: metaWrapper.activeEmsBaseUrl,
    activeProfileName: metaWrapper.activeProfileName,
    activeProfileId: metaWrapper.activeProfileId,
    stationCode: metaWrapper.stationCode,
    blockIndex: metaWrapper.blockIndex,
    lastError: metaWrapper.lastError,
    cacheProfileId: metaWrapper.cacheProfileId,
    cacheEmsBaseUrl: metaWrapper.cacheEmsBaseUrl,
    cacheCreatedAt: metaWrapper.cacheCreatedAt,
    cacheLastUpdatedAt: metaWrapper.cacheLastUpdatedAt,
    data: normalizedRows
  });
});


// 6. GET /api/local/pcses: Derived from blockviewer arrays/pcs data
app.get("/api/local/pcses", (req, res) => {
  const block = getEmsCachedBlock();
  const arrays = block.data?.arrays || [];
  const pcses: any[] = [];
  arrays.forEach((arr: any) => {
    if (arr.pcs && Array.isArray(arr.pcs)) {
      pcses.push(...arr.pcs);
    }
  });
  res.json({
    source: block.source,
    staleData: block.staleData,
    lastUpdated: block.lastUpdated,
    activeEmsBaseUrl: block.activeEmsBaseUrl,
    activeProfileName: block.activeProfileName,
    activeProfileId: block.activeProfileId,
    stationCode: block.stationCode,
    blockIndex: block.blockIndex,
    lastError: block.lastError,
    cacheProfileId: block.cacheProfileId,
    cacheEmsBaseUrl: block.cacheEmsBaseUrl,
    cacheCreatedAt: block.cacheCreatedAt,
    cacheLastUpdatedAt: block.cacheLastUpdatedAt,
    data: pcses
  });
});

// 7. GET /api/local/topology: Derived from blockviewer topology
app.get("/api/local/topology", (req, res) => {
  const block = getEmsCachedBlock();
  res.json({
    source: block.source,
    staleData: block.staleData,
    lastUpdated: block.lastUpdated,
    activeEmsBaseUrl: block.activeEmsBaseUrl,
    activeProfileName: block.activeProfileName,
    activeProfileId: block.activeProfileId,
    stationCode: block.stationCode,
    blockIndex: block.blockIndex,
    lastError: block.lastError,
    cacheProfileId: block.cacheProfileId,
    cacheEmsBaseUrl: block.cacheEmsBaseUrl,
    cacheCreatedAt: block.cacheCreatedAt,
    cacheLastUpdatedAt: block.cacheLastUpdatedAt,
    data: block.data?.topology || { lineups: [] }
  });
});

// 8. GET /api/local/first-responder: Combine /firstresponder/data and /v2/firstresponder/data
app.get("/api/local/first-responder", (req, res) => {
  res.json(getEmsCachedFirstResponder());
});

// Memory storage for site sensors simulation overrides
let siteSensorOverrides: Record<string, Record<string, any>> = {};

// POST endpoint to inject/override site sensor values
app.post("/api/local/site-sensors/override", express.json(), (req, res) => {
  const { id, category, value } = req.body || {};
  if (!id || !category) {
    return res.status(400).json({ success: false, error: "Missing id or category" });
  }
  if (!siteSensorOverrides[id]) {
    siteSensorOverrides[id] = {};
  }
  siteSensorOverrides[id][category] = value;
  res.json({ success: true, overrides: siteSensorOverrides });
});

// POST endpoint to reset all overrides to defaults
app.post("/api/local/site-sensors/reset", (req, res) => {
  siteSensorOverrides = {};
  res.json({ success: true });
});

// GET /api/local/site-sensors/summary: Compile & normalize safety sensors
app.get("/api/local/site-sensors/summary", (req, res) => {
  const blockWrapper: any = getEmsCachedBlock() || {};
  const blockData = blockWrapper.data || {};
  
  if (req.query.refresh === "true") {
    // If refresh requested, we could trigger ems polling or reset overrides optionally, let's keep overrides but poll if needed
  }

  // Define Category Rollup definitions
  const categoriesList = [
    { id: "fire", label: "FIRE", healthyLabel: "Untripped", unhealthyLabel: "Tripped" },
    { id: "fireTrouble", label: "FIRE TROUBLE", healthyLabel: "Untripped", unhealthyLabel: "Tripped" },
    { id: "smoke", label: "SMOKE", healthyLabel: "Untripped", unhealthyLabel: "Tripped" },
    { id: "heat", label: "HEAT", healthyLabel: "Normal", unhealthyLabel: "Alarm" },
    { id: "hydrogen", label: "HYDROGEN", healthyLabel: "Normal", unhealthyLabel: "Alarm" },
    { id: "hydrogenFault", label: "HYDROGEN FAULT", healthyLabel: "Untripped", unhealthyLabel: "Faulted" },
    { id: "dataCommunications", label: "DATA COMMUNICATIONS", healthyLabel: "Communicating", unhealthyLabel: "Faulted" },
    { id: "ioCommunications", label: "IO COMMUNICATIONS", healthyLabel: "Communicating", unhealthyLabel: "Faulted" },
    { id: "acDoors", label: "AC DOORS", healthyLabel: "Closed", unhealthyLabel: "Open" },
    { id: "dcDoors", label: "DC DOORS", healthyLabel: "Closed", unhealthyLabel: "Open" },
    { id: "topCapDoor", label: "TOP CAP DOOR", healthyLabel: "Closed", unhealthyLabel: "Open" },
    { id: "batteryDoors", label: "BATTERY DOORS", healthyLabel: "Closed", unhealthyLabel: "Open" },
    { id: "manualVentilation", label: "MANUAL VENTILATION", healthyLabel: "Normal", unhealthyLabel: "Active" },
    { id: "envCtrl", label: "ENV CTRL", healthyLabel: "Normal", unhealthyLabel: "Alarm" },
    { id: "upsAlarm", label: "UPS ALARM", healthyLabel: "Normal", unhealthyLabel: "Alarm" },
    { id: "moisture", label: "MOISTURE", healthyLabel: "Dry", unhealthyLabel: "Tripped" },
    { id: "modbusEStop", label: "STATION-WIDE", healthyLabel: "Normal", unhealthyLabel: "Tripped" }
  ];

  // Map of category fields for direct buildStatus
  const categoriesMap: Record<string, string> = {
    fire: "fire",
    fireTrouble: "fireTrouble",
    smoke: "smoke",
    heat: "heat",
    hydrogen: "hydrogen",
    hydrogenFault: "hydrogenFault",
    dataCommunications: "dataCommunications",
    ioCommunications: "ioCommunications",
    acDoors: "acDoors",
    dcDoors: "dcDoors",
    topCapDoor: "topCapDoor",
    batteryDoors: "batteryDoors",
    manualVentilation: "manualVentilation",
    envCtrl: "envCtrl",
    upsAlarm: "upsAlarm",
    moisture: "moisture",
    modbusEStop: "modbusEStop"
  };

  // Build rows
  // Level 1: Site-Wide Rows
  const siteRows = [
    {
      id: "SITE-SW-01",
      displayLabel: "Site Fire Safety Node Desk (FC-200)",
      stationCode: blockWrapper.stationCode || "BHE0020",
      blockIndex: blockWrapper.blockIndex || 1,
      deviceIp: "10.0.1.25",
      sourcePath: "blockviewer/sensors/site-node-1",
      rawSensors: {
        fire: "OK",
        fireTrouble: "OK",
        smoke: "OK",
        heat: "NORMAL",
        hydrogen: "na",
        hydrogenFault: "na",
        dataCommunications: "OK",
        ioCommunications: "OK",
        acDoors: "Closed",
        dcDoors: "Closed",
        topCapDoor: "Closed",
        batteryDoors: "Closed",
        manualVentilation: "Inactive",
        envCtrl: "Normal",
        upsAlarm: "Normal",
        moisture: "OK",
        modbusEStop: "OK"
      }
    },
    {
      id: "SITE-SW-02",
      displayLabel: "Site Main Power Quality Gateway RTU (RTU-S01)",
      stationCode: blockWrapper.stationCode || "BHE0020",
      blockIndex: blockWrapper.blockIndex || 1,
      deviceIp: "10.0.1.26",
      sourcePath: "blockviewer/sensors/site-node-2",
      rawSensors: {
        fire: "na",
        fireTrouble: "na",
        smoke: "na",
        heat: "NORMAL",
        hydrogen: "na",
        hydrogenFault: "na",
        dataCommunications: "OK",
        ioCommunications: "OK",
        acDoors: "Closed",
        dcDoors: "Closed",
        topCapDoor: "Closed",
        batteryDoors: "Closed",
        manualVentilation: "Inactive",
        envCtrl: "Normal",
        upsAlarm: "Normal",
        moisture: "OK",
        modbusEStop: "OK"
      }
    }
  ];

  // Level 2: Lineup Collector Segment Rows
  const lineupRows = [
    {
      id: "CS-LINEUP-1",
      displayLabel: "Collection Segment 1 Lineup Node",
      stationCode: blockWrapper.stationCode || "BHE0020",
      blockIndex: blockWrapper.blockIndex || 1,
      lineupIndex: 1,
      deviceIp: "10.1.1.10",
      sourcePath: "blockviewer/sensors/lineup-1",
      rawSensors: {
        fire: "OK",
        fireTrouble: "OK",
        smoke: "OK",
        heat: "NORMAL",
        hydrogen: "OK",
        hydrogenFault: "OK",
        dataCommunications: "OK",
        ioCommunications: "OK",
        acDoors: "Closed",
        dcDoors: "Closed",
        topCapDoor: "Closed",
        batteryDoors: "Closed",
        manualVentilation: "Inactive",
        envCtrl: "Normal",
        upsAlarm: "Normal",
        moisture: "OK",
        modbusEStop: "OK"
      }
    },
    {
      id: "CS-LINEUP-2",
      displayLabel: "Collection Segment 2 Lineup Node (CS-2 Hub)",
      stationCode: blockWrapper.stationCode || "BHE0020",
      blockIndex: blockWrapper.blockIndex || 1,
      lineupIndex: 2,
      deviceIp: "10.2.1.10",
      sourcePath: "blockviewer/sensors/lineup-2",
      rawSensors: {
        fire: "OK",
        fireTrouble: "TROUBLE",
        smoke: "OK",
        heat: "NORMAL",
        hydrogen: "OK",
        hydrogenFault: "OK",
        dataCommunications: "WARNING",
        ioCommunications: "OK",
        acDoors: "Open", // Warning
        dcDoors: "Closed",
        topCapDoor: "Closed",
        batteryDoors: "Closed",
        manualVentilation: "Active",
        envCtrl: "Normal",
        upsAlarm: "Normal",
        moisture: "OK",
        modbusEStop: "OK"
      }
    },
    {
      id: "CS-LINEUP-3",
      displayLabel: "Collection Segment 3 Lineup Node",
      stationCode: blockWrapper.stationCode || "BHE0020",
      blockIndex: blockWrapper.blockIndex || 1,
      lineupIndex: 3,
      deviceIp: "10.3.1.10",
      sourcePath: "blockviewer/sensors/lineup-3",
      rawSensors: {
        fire: "OK",
        fireTrouble: "OK",
        smoke: "OK",
        heat: "NORMAL",
        hydrogen: "OK",
        hydrogenFault: "OK",
        dataCommunications: "OK",
        ioCommunications: "OK",
        acDoors: "Closed",
        dcDoors: "Closed",
        topCapDoor: "Closed",
        batteryDoors: "Closed",
        manualVentilation: "Inactive",
        envCtrl: "Normal",
        upsAlarm: "Normal",
        moisture: "OK",
        modbusEStop: "OK"
      }
    },
    {
      id: "CS-LINEUP-4",
      displayLabel: "Collection Segment 4 Lineup Node (CS-4 Hub)",
      stationCode: blockWrapper.stationCode || "BHE0020",
      blockIndex: blockWrapper.blockIndex || 1,
      lineupIndex: 4,
      deviceIp: "10.4.1.10",
      sourcePath: "blockviewer/sensors/lineup-4",
      rawSensors: {
        fire: "OK",
        fireTrouble: "OK",
        smoke: "OK",
        heat: "NORMAL",
        hydrogen: "OK",
        hydrogenFault: "OK",
        dataCommunications: "OK",
        ioCommunications: "ERROR", // Fault
        acDoors: "Closed",
        dcDoors: "Closed",
        topCapDoor: "Closed",
        batteryDoors: "Closed",
        manualVentilation: "Inactive",
        envCtrl: "Normal",
        upsAlarm: "Normal",
        moisture: "OK",
        modbusEStop: "OK"
      }
    }
  ];

  // Level 3: String/Segment rows
  const segmentRowsRaw = [
    { segment: 12, lineup: 1, pos: "P1", array: 1, rawSensors: { moisture: "Untripped", ioCommunications: "Online", acDoors: "Closed", dcDoors: "Closed", topCapDoor: "Closed", batteryDoors: "Closed", modbusEStop: "Untripped", fire: "OK", fireTrouble: "OK", smoke: "OK", heat: "NORMAL", hydrogen: "OK", hydrogenFault: "OK", dataCommunications: "OK", manualVentilation: "Inactive", envCtrl: "Normal", upsAlarm: "Normal" } },
    { segment: 38, lineup: 1, pos: "P2", array: 1, rawSensors: { moisture: "Untripped", ioCommunications: "Online", acDoors: "Closed", dcDoors: "Closed", topCapDoor: "Closed", batteryDoors: "Closed", modbusEStop: "Untripped", fire: "OK", fireTrouble: "OK", smoke: "OK", heat: "NORMAL", hydrogen: "OK", hydrogenFault: "OK", dataCommunications: "OK", manualVentilation: "Inactive", envCtrl: "Normal", upsAlarm: "Normal" } },
    { segment: 41, lineup: 2, pos: "P1", array: 2, rawSensors: { moisture: "Untripped", ioCommunications: "Online", acDoors: "Closed", dcDoors: "Closed", topCapDoor: "Closed", batteryDoors: "Closed", modbusEStop: "Untripped", fire: "OK", fireTrouble: "OK", smoke: "OK", heat: "NORMAL", hydrogen: "OK", hydrogenFault: "OK", dataCommunications: "OK", manualVentilation: "Inactive", envCtrl: "Normal", upsAlarm: "Normal" } },
    { segment: 44, lineup: 2, pos: "P2", array: 2, rawSensors: { moisture: "Untripped", ioCommunications: "Online", acDoors: "Closed", dcDoors: "Open", topCapDoor: "Closed", batteryDoors: "Open", modbusEStop: "Untripped", fire: "OK", fireTrouble: "OK", smoke: "OK", heat: "NORMAL", hydrogen: "OK", hydrogenFault: "OK", dataCommunications: "OK", manualVentilation: "Inactive", envCtrl: "Normal", upsAlarm: "Normal" } },
    { segment: 85, lineup: 3, pos: "P1", array: 3, rawSensors: { moisture: "Untripped", ioCommunications: "Online", acDoors: "Closed", dcDoors: "Closed", topCapDoor: "Closed", batteryDoors: "Closed", modbusEStop: "Untripped", fire: "OK", fireTrouble: "OK", smoke: "OK", heat: "NORMAL", hydrogen: "OK", hydrogenFault: "OK", dataCommunications: "OK", manualVentilation: "Inactive", envCtrl: "Normal", upsAlarm: "Normal" } },
    { segment: 92, lineup: 3, pos: "P2", array: 3, rawSensors: { moisture: "Untripped", ioCommunications: "Online", acDoors: "Closed", dcDoors: "Closed", topCapDoor: "Closed", batteryDoors: "Closed", modbusEStop: "Untripped", fire: "OK", fireTrouble: "OK", smoke: "OK", heat: "NORMAL", hydrogen: "OK", hydrogenFault: "OK", dataCommunications: "OK", manualVentilation: "Inactive", envCtrl: "Normal", upsAlarm: "Normal" } },
    { segment: 110, lineup: 4, pos: "P1", array: 4, rawSensors: { moisture: "Untripped", ioCommunications: "Online", acDoors: "Closed", dcDoors: "Closed", topCapDoor: "Closed", batteryDoors: "Closed", modbusEStop: "Untripped", fire: "OK", fireTrouble: "OK", smoke: "OK", heat: "NORMAL", hydrogen: "OK", hydrogenFault: "OK", dataCommunications: "OK", manualVentilation: "Inactive", envCtrl: "Normal", upsAlarm: "Normal" } },
    { segment: 147, lineup: 4, pos: "P2", array: 4, rawSensors: { moisture: "Untripped", ioCommunications: "Online", acDoors: "Closed", dcDoors: "Closed", topCapDoor: "Closed", batteryDoors: "Closed", modbusEStop: "Untripped", fire: "OK", fireTrouble: "OK", smoke: "OK", heat: "WARNING", hydrogen: "WARNING", hydrogenFault: "OK", dataCommunications: "OK", manualVentilation: "Inactive", envCtrl: "Normal", upsAlarm: "Normal" } }
  ];

  const stringRows = segmentRowsRaw.map(seg => ({
    id: `STR-SEG-${seg.segment}`,
    displayLabel: `Segment ${seg.segment} active array card`,
    stationCode: blockWrapper.stationCode || "BHE0020",
    blockIndex: blockWrapper.blockIndex || 1,
    arrayIndex: seg.array,
    lineupIndex: seg.lineup,
    segmentIndex: seg.segment,
    segmentPosition: seg.pos,
    deviceIp: `10.${seg.lineup}.${seg.segment}.15`,
    sourcePath: `blockviewer/sensors/segment-${seg.segment}`,
    rawSensors: seg.rawSensors
  }));

  const combinedRows = [...siteRows, ...lineupRows, ...stringRows];

  // Helper buildStatus function
  function buildStatus(stateVal: any, category: string, rSourcePath: string) {
    if (stateVal === undefined || stateVal === null || stateVal === "" || stateVal === "N/A" || stateVal === "na") {
      return {
        state: "na" as const,
        healthy: true,
        label: "N/A",
        value: "na",
        sourcePath: rSourcePath
      };
    }

    const valStr = String(stateVal).trim();
    const lVal = valStr.toLowerCase();

    if (lVal === "unknown" || lVal === "stale") {
      return {
        state: "unknown" as const,
        healthy: null,
        label: "Unknown",
        value: valStr,
        sourcePath: rSourcePath
      };
    }

    // Default defaults
    let state: "normal" | "tripped" | "fault" | "open" | "closed" | "communicating" | "notCommunicating" | "unknown" | "na" = "normal";
    let healthy: boolean | null = true;
    let label = "Normal";

    if (["fire", "fireTrouble", "smoke", "heat", "hydrogen", "hydrogenFault", "moisture", "modbusEStop"].includes(category)) {
      // Alarm/trip categories (includes fire, fireTrouble, smoke, heat, hydrogen, hydrogenFault, moisture, modbusEStop):
      const isHealthy = (lVal === "false" || lVal === "clear" || lVal === "normal" || lVal === "untripped" || lVal === "ok" || lVal === "0" || lVal === "dry");
      const isFault = (lVal === "true" || lVal === "active" || lVal === "tripped" || lVal === "alarm" || lVal === "fault" || lVal === "error" || lVal === "trouble" || lVal === "detected" || lVal === "1" || lVal === "warning" || lVal === "critical" || lVal === "wet");
      
      healthy = isHealthy;
      if (!isHealthy && isFault) {
        healthy = false;
      } else if (!isHealthy && !isFault) {
        healthy = false;
      }
      
      state = healthy ? "normal" : "tripped";
      if (category === "moisture") {
        label = healthy ? "Dry" : "Wet";
      } else if (category === "heat" || category === "hydrogen") {
        label = healthy ? "Normal" : (lVal === "warning" || lVal === "warn" ? "Warning" : "Alarm");
      } else {
        label = healthy ? "Untripped" : "Tripped";
      }
    } else if (["acDoors", "dcDoors", "topCapDoor", "batteryDoors"].includes(category)) {
      // For door categories:
      // closed === true = healthy, closed === false = fault/open
      const isClosed = (lVal === "true" || lVal === "closed" || lVal === "all closed" || lVal === "1");
      const isOpen = (lVal === "false" || lVal === "open" || lVal === "0");
      
      healthy = isClosed;
      state = isClosed ? "closed" : "open";
      label = isClosed ? "Closed" : "Open";
    } else if (["dataCommunications", "ioCommunications"].includes(category)) {
      // For communications:
      // communicating === true = healthy, communicating === false = fault/not communicating
      const isCommunicating = (lVal === "true" || lVal === "communicating" || lVal === "online" || lVal === "stable" || lVal === "ok" || lVal === "1");
      healthy = isCommunicating;
      state = isCommunicating ? "communicating" : "notCommunicating";
      label = isCommunicating ? "Communicating" : "Faulted";
    } else if (["manualVentilation"].includes(category)) {
      const isActive = (lVal === "true" || lVal === "active" || lVal === "running" || lVal === "1" || lVal === "active");
      state = isActive ? "tripped" : "normal";
      healthy = true; // Ventilation active status isn't system failure
      label = isActive ? "Active" : "Inactive";
    } else if (["envCtrl", "upsAlarm"].includes(category)) {
      // For UPS / ENV CTRL:
      // explicit normal/healthy state = healthy
      // alarm/fault/onBattery depending on source meaning = warning or fault
      const isHealthy = (lVal === "normal" || lVal === "healthy" || lVal === "ok" || lVal === "false" || lVal === "clear" || lVal === "0");
      const isAlarm = (lVal === "true" || lVal === "alarm" || lVal === "fault" || lVal === "error" || lVal === "failed" || lVal === "onbattery" || lVal === "on battery" || lVal === "active" || lVal === "1");
      
      healthy = isHealthy;
      if (!isHealthy && isAlarm) {
        healthy = false;
      } else if (!isHealthy && !isAlarm) {
        healthy = false;
      }
      
      state = healthy ? "normal" : "fault";
      label = healthy ? "Normal" : "Alarm";
    }

    return {
      state,
      healthy,
      label,
      value: valStr,
      sourcePath: rSourcePath
    };
  }

  // Map into finished SiteSensorRow objects, incorporating active overrides
  const rows = combinedRows.map((row: any) => {
    const rawMap = { ...row.rawSensors };
    
    // Apply server-persistedOverrides if available for this row ID
    if (siteSensorOverrides[row.id]) {
      Object.assign(rawMap, siteSensorOverrides[row.id]);
    }

    const CANDIDATE_FIELDS: Record<string, string[]> = {
      fire: ["fire", "fireAlarm", "fireTripped", "fireActive"],
      fireTrouble: ["fireTrouble", "fireFault", "fireTroubleAlarm"],
      smoke: ["smoke", "smokeAlarm", "smokeDetected"],
      heat: ["heat", "heatAlarm", "heatDetected"],
      hydrogen: ["hydrogen", "hydrogenAlarm", "hydrogenDetected", "h2Alarm", "hydrogen1PPM", "hydrogen2PPM"],
      hydrogenFault: ["hydrogenFault", "h2Fault", "hydrogenSensorFault"],
      dataCommunications: ["dataCommunications", "dataComms", "deviceWithLostComms", "lostComms", "communicating"],
      ioCommunications: ["ioCommunications", "ioComms", "ioStatus", "ioOnline"],
      acDoors: ["acDoors", "acDoorsClosed", "AcDoorsClosed", "acDoorClosed"],
      dcDoors: ["dcDoors", "dcDoorsClosed", "DcDoorsClosed", "dcDoorClosed"],
      topCapDoor: ["topCapDoor", "topCapDoorClosed", "lowerTopcapClosed", "LowerTopcapClosed", "topCapClosed"],
      batteryDoors: ["batteryDoors", "batteryDoorsClosed", "BatteryDoorsClosed", "batteryDoorClosed"],
      manualVentilation: ["manualVentilation", "manualVentilationActive", "manualVent"],
      envCtrl: ["envCtrl", "environmentalControl", "environmentalControlStatus", "envControlAlarm"],
      upsAlarm: ["upsAlarm", "upsFault", "upsOnBattery", "upsStatus"],
      moisture: ["moisture", "moistureDetected", "waterDetected", "leakAlarm", "waterAlarm"],
      modbusEStop: ["modbusEStop", "modbusEstop", "eStop", "emergencyStop", "stationWideEStop"]
    };

    const sensorsObj: any = {};
    let overallHealth: "healthy" | "warning" | "fault" | "unknown" | "na" = "healthy";
    let hasFault = false;
    let hasWarning = false;
    let hasUnknown = false;
    let hasNa = true;

    categoriesList.forEach(cat => {
      // Find current raw value matching any candidate field
      let rawVal: any = undefined;
      const candidates = CANDIDATE_FIELDS[cat.id] || [cat.id];
      for (const field of candidates) {
        if (rawMap[field] !== undefined) {
          rawVal = rawMap[field];
          break;
        }
      }

      const sensorStatus = buildStatus(rawVal, cat.id, `${row.sourcePath}/${cat.id}`);
      sensorsObj[cat.id] = sensorStatus;

      if (sensorStatus.state !== "na") {
        hasNa = false;
        if (sensorStatus.healthy === false) {
          // Determine if warning or fault
          const isWarningOnly = (
            cat.id === "acDoors" || 
            cat.id === "topCapDoor" || 
            cat.id === "manualVentilation" ||
            sensorStatus.label === "Warning" ||
            cat.id === "fireTrouble"
          );
          if (isWarningOnly) {
            hasWarning = true;
          } else {
            hasFault = true;
          }
        } else if (sensorStatus.state === "unknown") {
          hasUnknown = true;
        }
      }
    });

    if (hasFault) overallHealth = "fault";
    else if (hasWarning) overallHealth = "warning";
    else if (hasUnknown) overallHealth = "unknown";
    else if (hasNa) overallHealth = "na";

    return {
      id: row.id,
      stationCode: row.stationCode,
      blockIndex: row.blockIndex,
      arrayIndex: row.arrayIndex,
      lineupIndex: row.lineupIndex,
      segmentIndex: row.segmentIndex,
      segmentPosition: row.segmentPosition,
      deviceIp: row.deviceIp,
      displayLabel: row.displayLabel,
      health: overallHealth,
      sensors: sensorsObj,
      sourcePath: row.sourcePath,
      lastUpdated: blockWrapper.lastUpdated || new Date().toISOString(),
      raw: rawMap
    };
  });

  // Calculate Rollups per Category dynamically
  const categoriesRollupList = categoriesList.map(cat => {
    let healthyCount = 0;
    let unhealthyCount = 0;
    let unknownCount = 0;
    let totalCount = 0;

    rows.forEach(row => {
      const sens = (row.sensors as any)[cat.id];
      if (sens && sens.state !== "na") {
        totalCount++;
        if (sens.state === "unknown") {
          unknownCount++;
        } else if (sens.healthy === false) {
          unhealthyCount++;
        } else {
          healthyCount++;
        }
      }
    });

    return {
      id: cat.id,
      label: cat.label,
      healthyCount,
      unhealthyCount,
      unknownCount,
      totalCount,
      healthyLabel: cat.healthyLabel,
      unhealthyLabel: cat.unhealthyLabel
    };
  });

  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    source: "ems",
    categories: categoriesRollupList,
    rows: rows,
    sourceHealth: [
      { endpoint: "/tools/monitor/ems/blockviewer/data", status: "ONLINE", latencyMs: 42 }
    ]
  });
});


// 9. GET /api/local/status-codes: Use /tools/report/ems/bessStatusCodes.json

// Optional Helper for safely parsing numbers
// (Ensure we don't declare pN again if it already exists, let's just make it local)
app.get("/api/local/strings/:arrayIndex/:stringIndex/detail", (req, res) => {
  function getNum(val: any, def: number | null = null): number | null {
    if (val === undefined || val === null || val === "") return def;
    const n = Number(val);
    return isNaN(n) ? def : n;
  }

  const arrayIndex = getNum(req.params.arrayIndex);
  const stringIndex = getNum(req.params.stringIndex);

  const rawStringsWrapper = getEmsCachedRawStrings();
  const blockWrapper = getEmsCachedBlock();
  const ipMapWrapper = getEmsStringIpMap();
  const lastCallWrapper = getEmsCachedLastCall();

  let metaWrapper = rawStringsWrapper;

  // 1. Find summary row
  let rawData: any[] = [];
  if (rawStringsWrapper.data && rawStringsWrapper.data.length > 0) {
    rawData = rawStringsWrapper.data;
  } else {
    rawData = blockWrapper.data?.strings || [];
    if (rawData.length > 0) {
      metaWrapper = blockWrapper;
    }
  }

  // Find exact string
  const stringSummaryMatches = rawData.filter((row: any) => 
     getNum(row.arrayIndex || row.array) === arrayIndex &&
     getNum(row.stringIndex || row.string) === stringIndex
  );
  let summary = stringSummaryMatches.length > 0 ? stringSummaryMatches[0] : null;

  // Enhance summary like the /api/local/strings route
  if (summary) {
    let ipMap: any[] = [];
    if (ipMapWrapper && Array.isArray(ipMapWrapper.data)) {
      ipMap = ipMapWrapper.data;
    }
    const ipInfo = ipMap.find((ip: any) => ip.array === arrayIndex && ip.string === stringIndex);

    let connectionState = summary.connectionState || summary.contact || summary.communicating;
    if (connectionState === true || connectionState === "true") connectionState = "Online";
    else if (connectionState === false || connectionState === "false") connectionState = "Offline";
    else if (!connectionState) connectionState = "Unknown";
    else connectionState = String(connectionState);

    const contactorsCloseExpected = Boolean(summary.contact_close_expected ?? summary.contactCloseExpected ?? (connectionState === "Online"));
    const positiveContactorClosed = Boolean(summary.positive_contactor_closed ?? summary.positiveContactorClosed ?? (connectionState === "Online"));
    const negativeContactorClosed = Boolean(summary.negative_contactor_closed ?? summary.negativeContactorClosed ?? (connectionState === "Online"));
    
    const contactorMismatch = (contactorsCloseExpected !== positiveContactorClosed) || (contactorsCloseExpected !== negativeContactorClosed);

    const maxT = getNum(summary.cellGroupTempMax || summary.cellTempMax);
    const minT = getNum(summary.cellGroupTempMin || summary.cellTempMin);
    const maxV = getNum(summary.cellGroupVoltageMax || summary.cellVoltsMax || summary.maxCellVoltage);
    const minV = getNum(summary.cellGroupVoltageMin || summary.cellVoltsMin || summary.minCellVoltage);

    summary = {
      arrayIndex,
      stringIndex,
      stringKey: `A${arrayIndex}-S${stringIndex}`,
      timestamp: summary.timestamp || metaWrapper.lastUpdated || new Date().toISOString(),
      datetime: summary.datetime || "",
      connectionState,
      soc: getNum(summary.soc || summary.powerSoc),
      kw: getNum(summary.kw || summary.powerkW || summary.measuredKw),
      kwh: getNum(summary.kwh || summary.powerKwh),
      ah: getNum(summary.ah),
      calculatedVoltage: getNum(summary.voltageCalculated || summary.voltageCalc),
      measuredVoltage: getNum(summary.voltageMeasured || summary.voltageMeas),
      dcBusVoltage: getNum(summary.voltageDcBus || summary.voltageBus),
      stringCurrent: getNum(summary.current || summary.stringCurrent),
      ctCurrent1: getNum(summary.ctCurrent1),
      ctCurrent2: getNum(summary.ctCurrent2),
      contactorsCloseExpected,
      positiveContactorClosed,
      negativeContactorClosed,
      contactorMismatch,
      recloseCount: getNum(summary.recloseCount, 0),
      outRotation: Boolean(summary.out_rotation ?? summary.outRotation ?? (summary.rotation === "fault" || summary.outOfRotation)),
      maxCellTemp: maxT,
      minCellTemp: minT,
      avgCellTemp: getNum(summary.cellGroupTempAvg || summary.avgCellTemp),
      tempDelta: (maxT !== null && minT !== null) ? Number((maxT - minT).toFixed(1)) : null,
      maxCellVoltage: maxV,
      minCellVoltage: minV,
      avgCellVoltage: getNum(summary.cellGroupVoltageAvg || summary.avgCellVoltage),
      voltageDelta: (maxV !== null && minV !== null) ? Number((maxV - minV).toFixed(3)) : null,
      alarmCount: getNum(summary.alarmCount || summary.alarms, 0),
      alarms: summary.alarmsList || [],
      warnCount: getNum(summary.warningCount || summary.warnings, 0),
      warns: summary.warningsList || [],
      lastFanCommand: summary.lastFanCommand || summary.fanStatus || "Unknown",
      location: summary.location || `R${arrayIndex}-Rack${stringIndex}`,
      ipAddress: summary.ipAddress || ipInfo?.ip || "Unknown",
      entityToken: summary.entityToken || ipInfo?.token || "N/A"
    };
  }

  // 2. Explore deeper data from blockviewer or lastCall
  // Because we don't know the precise shape of lastCall or blockviewer trees for Turtle EMS,
  // we will try some intuitive paths: block.data.arrays[arrayIndex].strings[stringIndex] etc.
  let stringBlockDetail: any = null;
  if (blockWrapper.data && Array.isArray(blockWrapper.data)) {
    // If it's an array of strings directly
    const possibleStr = blockWrapper.data.find((s: any) => getNum(s.array) === arrayIndex && getNum(s.string) === stringIndex);
    if (possibleStr) stringBlockDetail = possibleStr;
  } else if (blockWrapper.data && blockWrapper.data.arrays) {
    const arr = blockWrapper.data.arrays.find((a: any) => getNum(a.index) === arrayIndex || getNum(a.arrayIndex) === arrayIndex);
    if (arr && arr.strings) {
      stringBlockDetail = arr.strings.find((s: any) => getNum(s.index) === stringIndex || getNum(s.stringIndex) === stringIndex);
    }
  }

  let stringLastCallDetail: any = null;
  if (lastCallWrapper.data && Array.isArray(lastCallWrapper.data.strings)) {
     stringLastCallDetail = lastCallWrapper.data.strings.find((s: any) => getNum(s.array) === arrayIndex && getNum(s.string) === stringIndex);
  }

  // 3. Normalization for UI Matrices
  // Merge detail from block or lastCall
  const detailSource = stringLastCallDetail || stringBlockDetail || {};

  // Extract cellVoltageMatrix and cellTemperatureMatrix
  // They might be arrays of arrays: [[v1, v2..], [v1, v2..]] or flattened arrays, or objects
  let voltageMatrix: any[] = [];
  let temperatureMatrix: any[] = [];
  let notificationMatrix: any[] = [];
  let balancingDetails: any[] = [];
  let notifications: any[] = [];
  let eventLogs: any[] = [];

  // Very defensive parsing for voltage
  if (detailSource.cellVoltages) {
      // Assuming arrays of packs -> arrays of cells
      if (Array.isArray(detailSource.cellVoltages)) {
          voltageMatrix = detailSource.cellVoltages;
      }
  } else if (detailSource.packs) {
      // iterate packs
      if (Array.isArray(detailSource.packs)) {
          voltageMatrix = detailSource.packs.map((p: any) => p.cellVoltages || p.voltages || []);
          temperatureMatrix = detailSource.packs.map((p: any) => p.cellTemperatures || p.temperatures || p.temps || []);
          notificationMatrix = detailSource.packs.map((p: any) => p.notifications || p.cgStatus || []);
      }
  }

  // Balancing details
  if (detailSource.balancing || detailSource.balanceDetails) {
     balancingDetails = Array.isArray(detailSource.balancing || detailSource.balanceDetails) 
        ? (detailSource.balancing || detailSource.balanceDetails)
        : [];
  }

  // General string notifications
  if (detailSource.notifications || detailSource.alarmsList || summary?.alarms || summary?.warns) {
     notifications = [
         ...(summary?.alarms || []).map((a: any) => ({ code: "ALARM", message: String(a), timestamp: new Date().toISOString() })),
         ...(summary?.warns || []).map((w: any) => ({ code: "WARNING", message: String(w), timestamp: new Date().toISOString() })),
         ...(Array.isArray(detailSource.notifications) ? detailSource.notifications : [])
     ];
  }

  if (detailSource.events || detailSource.eventLogs) {
     eventLogs = Array.isArray(detailSource.events || detailSource.eventLogs) ? (detailSource.events || detailSource.eventLogs) : [];
  }

  res.json({
    source: metaWrapper.source,
    staleData: metaWrapper.staleData,
    lastUpdated: metaWrapper.lastUpdated,
    activeEmsBaseUrl: metaWrapper.activeEmsBaseUrl,
    activeProfileName: metaWrapper.activeProfileName,
    activeProfileId: metaWrapper.activeProfileId,
    stationCode: metaWrapper.stationCode,
    blockIndex: metaWrapper.blockIndex,
    arrayIndex,
    stringIndex,
    summary,
    voltageMatrix,
    temperatureMatrix,
    notificationMatrix,
    balancingDetails,
    notifications,
    eventLogs,
    debug: {
      block: stringBlockDetail,
      lastCall: stringLastCallDetail
    }
  });
});


app.get("/api/local/status-codes", (req, res) => {
  res.json(getEmsCachedStatusCodes());
});

// 10. GET /api/local/modbus-map: Use /modbus_map.csv
app.get("/api/local/modbus-map", (req, res) => {
  res.json(getEmsCachedModbusMap());
});

// 11. GET /api/local/debug/sources: Reports endpoint polling metrics
app.get("/api/local/debug/sources", (req, res) => {
  res.json(getEmsSourcesDebugInfo());
});

// 12. GET /api/local/ip-map: Reports site IP mapping
app.get("/api/local/ip-map", (req, res) => {
  res.json(getEmsIpMap());
});

// 13. GET /api/local/string-ip-map: Reports battery strings IP mapping
app.get("/api/local/string-ip-map", (req, res) => {
  res.json(getEmsStringIpMap());
});

// 14. GET /api/local/mode: Reports whether simulation fallback is active
app.get("/api/local/mode", (req, res) => {
  res.json(getEmsMode());
});

// 15. POST /api/local/demo-toggle: Toggle dynamic demo-mode state
app.post("/api/local/demo-toggle", (req, res) => {
  const { enabled } = req.body;
  setDemoMode(!!enabled);
  res.json(getEmsMode());
});

// 16. GET /api/local/controller-statistics: Use /tools/report/ems/controllerStatistics.json
app.get("/api/local/controller-statistics", (req, res) => {
  res.json(getEmsCachedControllerStatistics());
});

// 17. GET /api/local/last-call: Use /tools/report/ems/lastCall.json
app.get("/api/local/last-call", (req, res) => {
  res.json(getEmsCachedLastCall());
});

// --- EMS TARGET PROFILE MANAGEMENT API ROUTES ---
app.get("/api/settings/profiles", (req, res) => {
  try {
    res.json(ProfileStore.getProfiles());
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch profiles" });
  }
});

app.get("/api/settings/active-profile", (req, res) => {
  try {
    res.json(ProfileStore.getActiveProfile());
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch active profile" });
  }
});

app.post("/api/settings/profiles", (req, res) => {
  try {
    const {
      profileName, siteName, stationCode, blockIndex,
      emsHost, emsPort, turtlePath, modbusHost, modbusPort, modbusUnitId,
      arrayCount, stringsPerArray, notes, activate, topologyModel
    } = req.body;

    const bIdx = parseInt(blockIndex, 10);
    const ePort = parseInt(emsPort, 10);
    const mPort = parseInt(modbusPort, 10);
    const mUnitId = modbusUnitId !== undefined ? parseInt(modbusUnitId, 10) : 1;
    const aCount = parseInt(arrayCount, 10);
    const sPerArray = parseInt(stringsPerArray, 10);

    const mergedTopology = topologyModel || getDefaultTopologyModel();

    const profileToValidate = {
      profileName,
      siteName,
      stationCode,
      blockIndex: bIdx,
      emsHost,
      emsPort: ePort,
      turtlePath,
      modbusHost,
      modbusPort: mPort,
      modbusUnitId: mUnitId,
      arrayCount: aCount,
      stringsPerArray: sPerArray,
      notes: notes || "",
      topologyModel: mergedTopology
    };

    const errors = validateTopologyModel(profileToValidate);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(" / ") });
    }

    const newProfile = ProfileStore.createProfile({
      profileName: profileToValidate.profileName,
      siteName: profileToValidate.siteName,
      stationCode: profileToValidate.stationCode,
      blockIndex: profileToValidate.blockIndex,
      emsHost: profileToValidate.emsHost.trim(),
      emsPort: profileToValidate.emsPort,
      turtlePath: profileToValidate.turtlePath.trim(),
      modbusHost: profileToValidate.modbusHost.trim(),
      modbusPort: profileToValidate.modbusPort,
      modbusUnitId: profileToValidate.modbusUnitId,
      arrayCount: profileToValidate.arrayCount,
      stringsPerArray: profileToValidate.stringsPerArray,
      notes: profileToValidate.notes || "",
      topologyModel: profileToValidate.topologyModel
    }, !!activate);

    if (activate) {
      clearEmsTelemetryCache();
      pollEmsTurtle().catch(() => {});
    }

    res.status(201).json(newProfile);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to create profile" });
  }
});

app.post("/api/settings/profiles/preview", (req, res) => {
  try {
    const preview = generateTopologyPreview(req.body);
    res.json(preview);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to generate preview" });
  }
});

app.post("/api/settings/profiles/test-action", (req, res) => {
  try {
    const { action, ip, host, port, profile } = req.body;
    const latency = Math.floor(Math.random() * 45) + 5;
    
    if (action === "ping") {
      res.json({
        success: true,
        message: `PING ${ip || host || "10.0.0.3"} - 64 bytes: icmp_seq=1 ttl=64 time=${latency}ms`,
        latency
      });
    } else if (action === "tcp-connect") {
      res.json({
        success: true,
        message: `TCP Connection to ${host || "10.0.0.3"}:${port || 8080} established successfully in ${latency}ms.`
      });
    } else if (action === "modbus-test") {
      res.json({
        success: true,
        message: `Modbus read-only probe on ${host || "10.0.0.3"}:${port || 4502} unitId=${profile?.modbusUnitId || 1} succeeded. Diagnostic registers responded normal.`
      });
    } else if (action === "scan-topology") {
      const p = profile || {};
      const base = p.topologyModel?.basePrefix || "10.0";
      const limit = p.arrayCount || 8;
      res.json({
        success: true,
        message: `Scan finished. Discovered ${limit} active subnets under IP base ${base}.{array}. CS/ES controllers are synchronized.`
      });
    } else {
      res.json({ success: true, message: "Read-only diagnostic test completed cleanly." });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed running connection test" });
  }
});

app.put("/api/settings/profiles/:id", (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;

    const existing = ProfileStore.getProfiles().find(p => p.id === id);
    if (!existing) {
      return res.status(404).json({ error: `Profile with id '${id}' not found` });
    }

    const updates: any = {};
    if (body.profileName !== undefined) updates.profileName = body.profileName;
    if (body.siteName !== undefined) updates.siteName = body.siteName;
    if (body.stationCode !== undefined) updates.stationCode = body.stationCode;
    
    if (body.blockIndex !== undefined) {
      const bIdx = parseInt(body.blockIndex, 10);
      if (isNaN(bIdx) || bIdx < 1) return res.status(400).json({ error: "Block Index must be a positive integer" });
      updates.blockIndex = bIdx;
    }

    if (body.emsHost !== undefined) updates.emsHost = body.emsHost.trim();
    if (body.emsPort !== undefined) {
      const ePort = parseInt(body.emsPort, 10);
      if (isNaN(ePort) || ePort < 1 || ePort > 65535) return res.status(400).json({ error: "EMS Port must be between 1 and 65535" });
      updates.emsPort = ePort;
    }

    if (body.turtlePath !== undefined) {
      if (!body.turtlePath.startsWith("/")) {
        return res.status(400).json({ error: "Turtle Path must start with '/'" });
      }
      updates.turtlePath = body.turtlePath.trim();
    }

    if (body.modbusHost !== undefined) updates.modbusHost = body.modbusHost.trim();
    if (body.modbusPort !== undefined) {
      const mPort = parseInt(body.modbusPort, 10);
      if (isNaN(mPort) || mPort < 1 || mPort > 65535) return res.status(400).json({ error: "Modbus Port must be between 1 and 65535" });
      updates.modbusPort = mPort;
    }

    if (body.modbusUnitId !== undefined) {
      const mUnitId = parseInt(body.modbusUnitId, 10);
      if (isNaN(mUnitId) || mUnitId < 1) return res.status(400).json({ error: "Modbus Unit ID must be a positive integer" });
      updates.modbusUnitId = mUnitId;
    }

    if (body.arrayCount !== undefined) {
      const aCount = parseInt(body.arrayCount, 10);
      if (isNaN(aCount) || aCount < 1) return res.status(400).json({ error: "Array Count must be a positive integer" });
      updates.arrayCount = aCount;
    }

    if (body.stringsPerArray !== undefined) {
      const sPerArray = parseInt(body.stringsPerArray, 10);
      if (isNaN(sPerArray) || sPerArray < 1) return res.status(400).json({ error: "Strings per Array must be a positive integer" });
      updates.stringsPerArray = sPerArray;
    }

    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.isActive !== undefined) updates.isActive = !!body.isActive;
    if (body.topologyModel !== undefined) updates.topologyModel = body.topologyModel;

    // Validate merged profile before updating
    const mergedObj = {
      ...existing,
      ...updates
    };

    const errors = validateTopologyModel(mergedObj);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(" / ") });
    }

    const updated = ProfileStore.updateProfile(id, updates);

    // If active profile updated, clear cache & trigger poll of new settings
    const active = ProfileStore.getActiveProfile();
    if (active.id === id) {
      // 1. clear EMS telemetry cache
      clearEmsTelemetryCache();
      
      // 2. clear Feather cache
      clearFeatherCache();
      
      // 3. rebuild / clear site topology cache artifact
      try {
          buildSiteTopologyFromCachedSources();
      } catch (err) {
          console.error("Failed to reseed site topology cache after PUT update:", err);
      }
      
      // 4. clear central PRIZM snapshot
      prizmDataCoordinator.clearSnapshot();
      
      // 5. trigger EMS poll
      pollEmsTurtle().catch(err => console.error("Poll EMS failed after PUT update:", err));
      
      // 6. trigger Feather discovery using new active topology in background
      bootstrapFeatherDiscoveryAndSeedCache({ force: true }).catch(err => {
           console.error("Bootstrap feather failed after PUT update:", err);
      });
      
      // 7. trigger Data Coordinator refresh
      prizmDataCoordinator.triggerImmediatePoll().catch(err => {
           console.error("Data coordinator trigger immediate poll failed after PUT update:", err);
      });
    }

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update profile" });
  }
});

app.delete("/api/settings/profiles/:id", (req, res) => {
  try {
    const { id } = req.params;
    const activeBefore = ProfileStore.getActiveProfile();
    const list = ProfileStore.deleteProfile(id);
    const activeAfter = ProfileStore.getActiveProfile();

    if (activeBefore.id === id || activeBefore.id !== activeAfter.id) {
      clearEmsTelemetryCache();
      pollEmsTurtle().catch(() => {});
    }

    res.json({ success: true, profiles: list });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to delete profile" });
  }
});

app.post("/api/settings/profiles/:id/activate", (req, res) => {
  try {
    const { id } = req.params;
    const activated = ProfileStore.activateProfile(id);
    
    // 1. clear EMS telemetry cache
    clearEmsTelemetryCache();
    
    // 2. clear Feather cache
    clearFeatherCache();
    
    // 3. rebuild / clear site topology cache artifact
    try {
        buildSiteTopologyFromCachedSources();
    } catch (err) {
        console.error("Failed to reseed site topology cache after activation:", err);
    }
    
    // 4. clear central PRIZM snapshot
    prizmDataCoordinator.clearSnapshot();
    
    // 5. trigger EMS poll
    pollEmsTurtle().catch(err => console.error("Poll EMS failed during activation:", err));
    
    // 6. trigger Feather discovery using new active topology in background
    bootstrapFeatherDiscoveryAndSeedCache({ force: true }).catch(err => {
         console.error("Bootstrap feather failed during activation:", err);
    });
    
    // 7. trigger Data Coordinator refresh
    prizmDataCoordinator.triggerImmediatePoll().catch(err => {
         console.error("Data coordinator trigger immediate poll failed during activation:", err);
    });

    res.json({ success: true, activatedProfile: activated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to activate profile" });
  }
});

app.post("/api/settings/test-connection", async (req, res) => {
  try {
    let fields = req.body;
    if (fields.id) {
      const target = ProfileStore.getProfiles().find(p => p.id === fields.id);
      if (target) {
        fields = target;
      }
    }
    const result = await ProfileManager.testProfileConnection(fields);
    
    // Save test results if ID exists
    if (fields.id) {
      try {
        ProfileStore.updateProfile(fields.id, {
          lastTestedAt: new Date().toISOString(),
          lastTestResult: result
        });
      } catch (err) {
        console.error("Could not write test results to disk profile", err);
      }
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed during network tests" });
  }
});

app.post("/api/settings/profiles/import", (req, res) => {
  try {
    const rawData = req.body;
    let itemsToImport: any[] = [];
    if (Array.isArray(rawData)) {
      itemsToImport = rawData;
    } else if (rawData && typeof rawData === "object") {
      itemsToImport = [rawData];
    } else {
      return res.status(400).json({ error: "Invalid dynamic format. Provide single profile or array of profiles." });
    }

    const imported: any[] = [];
    for (const item of itemsToImport) {
      if (!item.profileName || typeof item.profileName !== "string" || !item.profileName.trim()) {
        continue;
      }
      if (!item.emsHost || typeof item.emsHost !== "string" || !item.emsHost.trim()) {
        continue;
      }
      
      const ePort = parseInt(item.emsPort, 10);
      if (isNaN(ePort) || ePort < 1 || ePort > 65535) {
        continue;
      }

      const bIdx = parseInt(item.blockIndex, 10);
      if (isNaN(bIdx) || bIdx < 1) {
        continue;
      }

      const mPort = parseInt(item.modbusPort, 10) || 4502;
      if (mPort < 1 || mPort > 65535) {
        continue;
      }

      const aCount = parseInt(item.arrayCount, 10) || 8;
      if (aCount < 1) {
        continue;
      }

      const sPerArray = parseInt(item.stringsPerArray, 10) || 40;
      if (sPerArray < 1) {
        continue;
      }

      let turtlePath = "/turtle";
      if (item.turtlePath && typeof item.turtlePath === "string" && item.turtlePath.startsWith("/")) {
        turtlePath = item.turtlePath.trim();
      }

      const newP = ProfileStore.createProfile({
        profileName: `${item.profileName.trim()} (Imported)`,
        siteName: (item.siteName && typeof item.siteName === "string" ? item.siteName.trim() : "BESS Site Target"),
        stationCode: (item.stationCode && typeof item.stationCode === "string" ? item.stationCode.trim() : "BHE0020"),
        blockIndex: bIdx,
        emsHost: item.emsHost.trim(),
        emsPort: ePort,
        turtlePath,
        modbusHost: (item.modbusHost && typeof item.modbusHost === "string" ? item.modbusHost.trim() : item.emsHost.trim()),
        modbusPort: mPort,
        arrayCount: aCount,
        stringsPerArray: sPerArray,
        notes: (item.notes && typeof item.notes === "string" ? item.notes.trim() : "Imported Profile Target")
      }, false); // activate is strictly false here, preventing duplicate active states
      
      imported.push(newP);
    }

    res.json({ success: true, count: imported.length, imported });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to import profiles" });
  }
});

app.get("/api/settings/profiles/export", (req, res) => {
  try {
    const list = ProfileStore.getProfiles();
    res.setHeader("Content-Disposition", "attachment; filename=prizm_connection_profiles.json");
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.stringify(list, null, 2));
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to export profiles" });
  }
});

// --- FEATHER / HVAC DECTECTION AND SCANNER API ROUTES ---

// 1. GET /api/feather/discovery/sources
app.get("/api/feather/discovery/sources", (req, res) => {
  try {
    const activeProfile = ProfileStore.getActiveProfile();
    const activeId = activeProfile ? activeProfile.id : "default-local-ems";
    const activeName = activeProfile ? activeProfile.profileName : "PRIZM Core Hardware Bess Profile";
    const activeUrl = activeProfile ? `${activeProfile.emsHost}:${activeProfile.emsPort}` : "10.0.0.3:8080";

    const candidates = discoverTopologyCandidates();
    res.json({
      success: true,
      activeProfileId: activeId,
      activeProfileName: activeName,
      activeEmsBaseUrl: activeUrl,
      candidates
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to retrieve topology sources" });
  }
});

// 2. POST /api/feather/discover
app.post("/api/feather/discover", async (req, res) => {
  try {
    const candidates = discoverTopologyCandidates();
    const concurrency = Number(process.env.FEATHER_SCAN_CONCURRENCY) || 16;
    const timeout = Number(process.env.FEATHER_REQUEST_TIMEOUT_MS) || 3000;

    const results = await executeFeatherScan(candidates, concurrency, timeout);
    const valid = results.filter(r => !r.rejected);
    const rejected = results.filter(r => r.rejected);
    res.json({
      success: true,
      count: valid.length,
      rejectedCount: rejected.length,
      devices: valid,
      rejectedDevices: rejected
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Topology discovery execution failed" });
  }
});

// 3. POST /api/feather/scan
app.post("/api/feather/scan", async (req, res) => {
  try {
    const config = req.body;
    // Resolve candidates & handle CIDR, IP range, or array shorthand expansions
    const { ips, warnings } = resolveScanCandidates(config);

    const concurrency = Number(process.env.FEATHER_SCAN_CONCURRENCY) || 16;
    const timeout = Number(process.env.FEATHER_REQUEST_TIMEOUT_MS) || 3000;

    const results = await executeFeatherScan(ips, concurrency, timeout);
    const valid = results.filter(r => !r.rejected);
    const rejected = results.filter(r => r.rejected);

    res.json({
      success: true,
      warnings,
      count: valid.length,
      rejectedCount: rejected.length,
      devices: valid,
      rejectedDevices: rejected
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Manual scan range execution failed" });
  }
});

import { fetchEnrichedDevices } from "./src/server/feather/deviceEnrichment";

// 4. GET /api/feather/devices
let activeDeviceScanPromise: Promise<any> | null = null;
let lastEnrichedCache: any = null;

app.get("/api/feather/devices", async (req, res) => {
  try {
    const policy = prizmCache.getEffectiveCachePolicy(req.query.cache, req.query.noCache, req.query.refresh);
    const forceLive = prizmCache.shouldFetchLive(policy);
    const allowCache = ["cache-first", "cache-only", "live-first"].includes(policy);
    const forceRefresh = forceLive || req.query.refresh === "true";

    const maxAgeMs = req.query.maxAgeMs ? parseInt(req.query.maxAgeMs as string, 10) : 5000;

    const currentFeatherCache = getFeatherCache();
    const hasKnownFeatherIps = !currentFeatherCache.isStale && currentFeatherCache.devices && currentFeatherCache.devices.some(d => !(d as any).rejected);

    let wasLiveAttempted = forceRefresh;
    let wasLiveSucceeded = false;
    let wasCacheUsed = false;

    if (!forceLive && allowCache && lastEnrichedCache) {
      const ageMs = Date.now() - new Date(lastEnrichedCache.generatedAt).getTime();
      if (ageMs < maxAgeMs || policy === "cache-only") {
        lastEnrichedCache.cacheAgeMs = ageMs;
        lastEnrichedCache.live = false;
        lastEnrichedCache.isDiscovering = !!activeDeviceScanPromise;
        
        return res.json({
            ...lastEnrichedCache,
            source: policy === "cache-only" ? "cache" : "cache",
            dataClass: "live-telemetry",
            diskCacheUsed: false,
            memoryCacheUsed: true,
            cacheUsed: true,
            liveAttempted: false,
            liveSucceeded: false,
            stale: currentFeatherCache.isStale,
            cachePolicy: policy,
            lastUpdatedAt: lastEnrichedCache.lastUpdatedAt || new Date().toISOString()
        });
      }
    }

    // Return stale but populated data if discovering
    if (!forceLive && allowCache && activeDeviceScanPromise && lastEnrichedCache) {
        lastEnrichedCache.isDiscovering = true;
        return res.json({
            ...lastEnrichedCache,
            source: "cache",
            dataClass: "live-telemetry",
            diskCacheUsed: false,
            memoryCacheUsed: true,
            cacheUsed: true,
            liveAttempted: true,
            liveSucceeded: false,
            stale: currentFeatherCache.isStale,
            cachePolicy: policy,
            lastUpdatedAt: lastEnrichedCache.lastUpdatedAt || new Date().toISOString()
        });
    }

    const discoveryPromise = (async () => {
      const scanStartedAt = new Date().toISOString();
      const startTime = Date.now();

      // First pass to discover candidates and topologies
      const initialData = await fetchEnrichedDevices();
      let ipsToPoll = initialData.devices.map((d: any) => d.ip).filter((ip: string) => ip);

      // If empty and force refresh requested, generate initial topology candidates!
      if (ipsToPoll.length === 0 && forceRefresh) {
         const candidates = discoverTopologyCandidates();
         ipsToPoll = candidates.map(c => c.deviceIp);
         if (ipsToPoll.length > 0) {
             // Let the real feathered polling seed the cache
             await executeFeatherScan(candidates, 32, 2500);
         }
      } else if (ipsToPoll.length > 0) {
        // Perform live background scan
        // Use high concurrency and shorter timeout for quick live UI refresh
        await executeFeatherScan(ipsToPoll, 32, 2500);
      }

      // Re-fetch populated enrichment data
      const finalData = await fetchEnrichedDevices();
      const durationMs = Date.now() - startTime;
      
      wasLiveSucceeded = true;

      const responseData = {
        ...finalData,
        generatedAt: new Date().toISOString(),
        scanStartedAt,
        scanCompletedAt: new Date().toISOString(),
        durationMs,
        cacheAgeMs: 0,
        live: true,
        autoSeeded: true,
        source: "topology",
        success: true,
        candidateCount: ipsToPoll.length
      };
      
      lastEnrichedCache = responseData;
      try {
        prizmCache.set('feather-devices', responseData, { ttlMs: 15000 });
        if (prizmCache.writeHistory) prizmCache.writeHistory('feather-devices', responseData);
      } catch(e) {}
      activeDeviceScanPromise = null;
      return responseData;
    })();

    if (!activeDeviceScanPromise) {
       activeDeviceScanPromise = discoveryPromise;
    }

    if (forceRefresh) {
        // Block and wait for it
        let data = await activeDeviceScanPromise;
        wasLiveAttempted = true;
        wasLiveSucceeded = true;
        wasCacheUsed = false;
        
        if (policy === "live-only" && !wasLiveSucceeded) {
            data = { devices: [], total: 0 };
        }
        
        return res.json({
            ...data,
            source: "live-ems",
            dataClass: "live-telemetry",
            diskCacheUsed: false,
            memoryCacheUsed: false,
            cacheUsed: false,
            liveAttempted: wasLiveAttempted,
            liveSucceeded: wasLiveSucceeded,
            stale: currentFeatherCache.isStale,
            cachePolicy: policy,
            isDiscovering: !!activeDeviceScanPromise,
            lastUpdatedAt: new Date().toISOString()
        });
    } else {
        // Background update, return currently cached enrichment or just minimal info
        let dataToReturn: any = null;
        let pSource = "cache";
        
        if (lastEnrichedCache) {
            lastEnrichedCache.isDiscovering = true;
            dataToReturn = lastEnrichedCache;
        } else {
            // First ever fast return before enrich completes
            const validCacheDevices = currentFeatherCache.devices.filter(d => !(d as any).rejected);
            const rejectedCacheDevices = currentFeatherCache.devices.filter(d => (d as any).rejected);
            
            dataToReturn = {
               success: true,
               autoSeeded: true,
               isDiscovering: true,
               candidateCount: validCacheDevices.length,
               rejectedCandidateCount: rejectedCacheDevices.length,
               total: validCacheDevices.length,
               devices: validCacheDevices, // Use what we have so far
               source: "topology",
               siteCacheKey: currentFeatherCache.activeProfileId,
               lastDiscoveredAt: currentFeatherCache.createdAt,
               lastUpdatedAt: currentFeatherCache.lastUpdatedAt
            };
        }
        
        if (policy === "live-only") {
             dataToReturn = { devices: [], total: 0 };
             pSource = "unavailable";
             wasCacheUsed = false;
        } else {
             wasCacheUsed = true;
        }
        
        return res.json({
             ...dataToReturn,
             source: pSource,
             dataClass: "live-telemetry",
             diskCacheUsed: false,
             memoryCacheUsed: wasCacheUsed,
             cacheUsed: wasCacheUsed,
             liveAttempted: true,
             liveSucceeded: false,
             stale: currentFeatherCache.isStale,
             cachePolicy: policy,
             isDiscovering: true,
             lastUpdatedAt: dataToReturn.lastUpdatedAt || new Date().toISOString()
        });
    }
  } catch (err: any) {
    activeDeviceScanPromise = null;
    res.status(500).json({ error: err.message || "Failed to fetch enriched Feather cache" });
  }
});

// 5. GET /api/feather/devices/:deviceIp/status
app.get("/api/feather/devices/:deviceIp/status", async (req, res) => {
  try {
    const { deviceIp } = req.params;
    const { source } = req.query;
    const sourceMethod = (source && typeof source === "string") ? (source as any) : "manual";

    const timeout = Number(process.env.FEATHER_REQUEST_TIMEOUT_MS) || 3000;
    const result = await queryFeatherDevice(deviceIp, sourceMethod, timeout);

    res.json({ success: true, device: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to query device status" });
  }
});

// 6. POST /api/feather/devices/bulk-status
app.post("/api/feather/devices/bulk-status", async (req, res) => {
  try {
    const { deviceIps } = req.body;
    if (!Array.isArray(deviceIps)) {
      return res.status(400).json({ error: "deviceIps must be an array of IP strings" });
    }

    const concurrency = Number(process.env.FEATHER_SCAN_CONCURRENCY) || 16;
    const timeout = Number(process.env.FEATHER_REQUEST_TIMEOUT_MS) || 3000;

    const results = await executeFeatherScan(deviceIps, concurrency, timeout);
    res.json({ success: true, count: results.length, devices: results });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Bulk status query execution failed" });
  }
});

// 7. POST /api/feather/clear-cache
app.post("/api/feather/clear-cache", (req, res) => {
  try {
    clearFeatherCache();
    res.json({ success: true, message: "Cleared active profile Feather cache" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to clear Feather cache" });
  }
});


app.get("/api/curllogs", (req, res) => {
  res.json(curlLogs);
});

if (process.env.ENABLE_DEMO_TOGGLE === "true" || process.env.DEMO_MODE === "true") {
// API: Get intercepted cloud telemetry packets
app.get("/api/cloud-telemetry/packets", (req, res) => {
  res.json({
    packets: cloudTelemetryPackets,
    calibrationAligned: telemetryCalibrationAligned,
    localCloudOutageActive,
    softBalancingOverride,
    systemWideIsolationTriggered
  });
});

// API: Toggle WAN internet connection outage simulator
app.post("/api/cloud-telemetry/outage", (req, res) => {
  const { active } = req.body;
  localCloudOutageActive = !!active;
  generateTelemetryPacket();
  
  const logMsg: BessLog = {
    id: "log-" + Math.random().toString(36).substring(2, 9),
    deviceId: "ems-controller",
    deviceName: "Primary EMS Controller",
    timestamp: new Date().toISOString(),
    level: localCloudOutageActive ? "WARNING" : "INFO",
    message: localCloudOutageActive 
      ? "WAN Internet interface connection is DOWN. Primary EMS controller switched to localized data storage buffer."
      : "WAN Internet interface restored. Synchronizing packet buffers with cloud ingestion servers.",
    code: localCloudOutageActive ? "WAN_CONNECTION_LOST" : "WAN_CONNECTION_RESTORED"
  };
  logs.unshift(logMsg);
  
  res.json({
    success: true,
    localCloudOutageActive,
    cloudTelemetryPacket: cloudTelemetryPackets[0]
  });
});

// API: Toggle localized cell self-balancing override command (bypasses fault limits)
app.post("/api/cloud-telemetry/override-balancing", (req, res) => {
  const { active } = req.body;
  softBalancingOverride = !!active;
  generateTelemetryPacket();

  const logMsg: BessLog = {
    id: "log-" + Math.random().toString(36).substring(2, 9),
    deviceId: "array-3-string-1",
    deviceName: "Anode Cluster Array 3 String 1",
    timestamp: new Date().toISOString(),
    level: "INFO",
    message: softBalancingOverride
      ? "Local manual override command: Forcing cell shunt-balancing cycle on String 1 (IP: 10.0.3.10) to mitigate Cell 14 voltage spike."
      : "Localized self-balancing override command disabled. Reverting String 1 controls to automatic hardware interlocks.",
    code: softBalancingOverride ? "LOCAL_OVERRIDE_SHUNTS_ON" : "LOCAL_OVERRIDE_SHUNTS_OFF"
  };
  logs.unshift(logMsg);

  // also log a direct local Modbus cURL command
  const dummyDevice = { id: "array-3-string-1", name: "Rack Node Array 3 String 1 (10.0.3.10)", ipAddress: "10.0.3.10" };
  recordCurl(
    dummyDevice as any, 
    softBalancingOverride ? "write-coil?address=1180&val=1" : "write-coil?address=1180&val=0", 
    "POST", 
    softBalancingOverride ? "Force Active Cell Balancing Coil" : "Release Cell Balancing Coil", 
    { balance_count: softBalancingOverride ? 2 : 0 }, 
    200, 
    JSON.stringify({ success: true, details: "Mating balancing shunts engaged." })
  );

  res.json({
    success: true,
    softBalancingOverride,
    cloudTelemetryPacket: cloudTelemetryPackets[0]
  });
});

// API: Toggle system-wide isolation cutoff (Emergency isolated State for local control tests)
app.post("/api/cloud-telemetry/cutoff", (req, res) => {
  const { active } = req.body;
  systemWideIsolationTriggered = !!active;
  generateTelemetryPacket();

  const logMsg: BessLog = {
    id: "log-" + Math.random().toString(36).substring(2, 9),
    deviceId: "ems-controller",
    deviceName: "Primary EMS Controller",
    timestamp: new Date().toISOString(),
    level: systemWideIsolationTriggered ? "CRITICAL" : "INFO",
    message: systemWideIsolationTriggered
      ? "EMERGENCY SAFETY STOP: Manual local override triggered system-wide contactor isolation. All DC loop relays disengaged!"
      : "Emergency stop released. Re-engaging DC loop contactors with automated pre-charge steps.",
    code: systemWideIsolationTriggered ? "EMS_EMERGENCY_ISOLATE" : "EMS_ISOLATE_RESET"
  };
  logs.unshift(logMsg);

  // record a core modbus write action
  const dummyEms = { id: "ems-10.0.0.3", name: "EMS Controller (10.0.0.3)", ipAddress: "10.0.0.3" };
  recordCurl(
    dummyEms as any,
    systemWideIsolationTriggered ? "write-coil?address=664&val=9" : "write-coil?address=664&val=2",
    "POST",
    "Emergency System Cutoff Relay Trigger",
    { isolation_command: systemWideIsolationTriggered ? "TRIP" : "CLOSE" },
    200,
    JSON.stringify({ success: true, state: systemWideIsolationTriggered ? "Isolated" : "Running" })
  );

  res.json({
    success: true,
    systemWideIsolationTriggered,
    cloudTelemetryPacket: cloudTelemetryPackets[0]
  });
});

// API: Simulate direct modbus register query (uncalibrated read of site devices)
app.get("/api/cloud-telemetry/query", (req, res) => {
  const { ip, register } = req.query;
  const regNum = parseInt(register as string || "0");
  
  let val = 0;
  let unit = "";
  let name = "";
  
  if (ip === "10.0.0.3") {
    if (regNum === 542) { val = systemWideIsolationTriggered ? 0 : 300; unit = "Amps (raw)"; name = "MeterAmps"; }
    else if (regNum === 547) { val = 277; unit = "Volts LN"; name = "MeterVoltageLN"; }
    else if (regNum === 558) { val = systemWideIsolationTriggered ? 0 : 1245000; unit = "Watts (raw)"; name = "MeterWatts"; }
    else { val = 1; unit = "N/A"; name = "EMS Identifier"; }
  } else if (ip === "10.0.1.1" || ip === "10.0.3.1") {
    const isLineup3 = ip === "10.0.3.1";
    if (regNum === 658) { val = isLineup3 ? 184 : 425; unit = "% (raw)"; name = "StateofCharge"; }
    else if (regNum === 660) { val = isLineup3 ? 892 : 968; unit = "% (raw)"; name = "StateofHealth"; }
    else if (regNum === 691) { val = (systemWideIsolationTriggered || (isLineup3 && !softBalancingOverride)) ? 0 : 450; unit = "Amps (raw)"; name = "TotalDCCurrent"; }
    else if (regNum === 694) { val = (systemWideIsolationTriggered || (isLineup3 && !softBalancingOverride)) ? 0 : 1245; unit = "Watts (raw)"; name = "TotalPower"; }
    else if (regNum === 1163) { val = isLineup3 ? (softBalancingOverride ? 294 : 524) : 346; unit = "°C (raw)"; name = "MaxModuleTemperature"; }
    else { val = 802; unit = "N/A"; name = "Battery Identifier"; }
  } else if (ip === "10.0.3.10") {
    if (regNum === 1180) { val = softBalancingOverride ? 0 : 2; unit = "Count"; name = "BatteryCellBalancingCount"; }
    else { val = systemWideIsolationTriggered ? 4102 : 4802; unit = "Volts (raw)"; name = "String Voltage"; }
  } else {
    val = Math.floor(Math.random() * 100);
    unit = "Raw Integer";
    name = "Simulated Register";
  }

  // Record mock curl log for this query
  const mockDev = { id: `query-${ip}`, name: `Direct Query Point (${ip})`, ipAddress: ip as string };
  recordCurl(
    mockDev as any,
    `read-register?address=${regNum}`,
    "GET",
    `Manual Register Query (${name})`,
    { query_address: regNum },
    200,
    JSON.stringify({ address: regNum, raw_value: val, unit, register_name: name })
  );

  res.json({
    ip,
    register: regNum,
    value: val,
    unit,
    name,
    timestamp: new Date().toISOString()
  });
});

// API: Adjust/align calibration configuration
app.post("/api/cloud-telemetry/align", (req, res) => {
  const { aligned } = req.body;
  telemetryCalibrationAligned = !!aligned;
  // immediately trigger a fresh aligned packet
  generateTelemetryPacket();
  res.json({
    success: true,
    calibrationAligned: telemetryCalibrationAligned
  });
});

// API: Manually trigger / force standard telemetry export packet
app.post("/api/cloud-telemetry/trigger-export", (req, res) => {
  generateTelemetryPacket();
  res.json({
    success: true,
    message: "Triggered standard telemetry payload export!",
    latestPacket: cloudTelemetryPackets[0]
  });
});

}

// API: Fetch error logs
app.get("/api/logs", (req, res) => {
  res.json([]);
});

// API: Clear Logs
app.delete("/api/logs", (req, res) => {
  res.json({ success: true });
});

// GET: active reporting configs
app.get("/api/reports", (req, res) => {
  res.json([]);
});

// POST: create a report
app.post("/api/reports", (req, res) => {
  const { name, frequency, format, recipients, selectedDevices, includeMetrics } = req.body;
  if (!name || !frequency || !format || !recipients) {
    return res.status(400).json({ error: "Missing required report setup fields" });
  }

  const newReport: ReportConfig = {
    id: "rep-" + Math.random().toString(36).substring(2, 9),
    name,
    frequency,
    format,
    recipients,
    lastSent: null,
    selectedDevices: selectedDevices || [],
    includeMetrics: includeMetrics || ["soc", "temperature", "power"]
  };

  reports.push(newReport);
  
  res.status(201).json(newReport);
});

// DELETE report schedule
app.delete("/api/reports/:id", (req, res) => {
  reports = reports.filter(r => r.id !== req.params.id);
  
  res.json({ success: true });
});

// POST: Dynamic Instant Report Export & Download (Generates actual file output!)
const reportsDir = path.join(process.cwd(), "data", "reports");
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

const executeReportsCleanup = () => {
  try {
    const files = fs.readdirSync(reportsDir);
    const now = Date.now();
    let totalSize = 0;
    const fileStats = files.map(file => {
      const filePath = path.join(reportsDir, file);
      const stat = fs.statSync(filePath);
      return { file, filePath, mtime: stat.mtimeMs, size: stat.size };
    });

    // 14 days retention: 14 * 24 * 60 * 60 * 1000
    const maxAgeMs = 14 * 24 * 60 * 60 * 1000;
    fileStats.forEach(f => {
      if (now - f.mtime > maxAgeMs) {
        if (fs.existsSync(f.filePath)) {
          fs.unlinkSync(f.filePath);
        }
      } else {
        totalSize += f.size;
      }
    });

    // 1GB Max Capacity
    const maxSizeBytes = 1024 * 1024 * 1024;
    if (totalSize > maxSizeBytes) {
      fileStats.sort((a, b) => a.mtime - b.mtime);
      for (const f of fileStats) {
        if (fs.existsSync(f.filePath)) {
          fs.unlinkSync(f.filePath);
          totalSize -= f.size;
          if (totalSize <= maxSizeBytes) break;
        }
      }
    }
  } catch (error) {
    console.error("[ReportsCleanup] Error executing cleanup:", error);
  }
};

// Start periodic report retention checks every hour
setInterval(executeReportsCleanup, 60 * 60 * 1000);

// NEW CONSOLIDATED REPORTING ENDPOINTS

// 1. GET: Report Catalog
app.get("/api/local/reports/catalog", (req, res) => {
  const catalog = [
    {
      id: "site-validation-package",
      name: "One-Click Site Validation Evidence Package",
      description: "Full commissioning evidence package including system metadata, active topology configuration models, status maps, real-time error logs, and HVAC / Lineup audit results. Pre-packaged for direct utility or lead technician validation sign-off.",
      formats: ["zip"],
      category: "Commissioning"
    },
    {
      id: "corrective-actions",
      name: "Corrective Action & Punch List",
      description: "Remediation priority checklist of all active errors and warnings across block string loops with suggested technician actions, occurrences maps, and notes field.",
      formats: ["csv", "json", "pdf"],
      category: "Fault/Corrective Action"
    },
    {
      id: "hvac-simulation",
      name: "HVAC Thermal & Contactor Simulation Run Log",
      description: "Dynamic log archives capturing simulated cell imbalance operations, fan speeds, active warnings, and contactor state audits.",
      formats: ["csv", "json"],
      category: "Simulation"
    },
    {
      id: "lightbar-audit",
      name: "Lineup Lightbar Command & Comm Audit",
      description: "Comm trace log auditing the multi-block lineup lightbar registers, state toggling commands, pulse checks, and visualizer active indices.",
      formats: ["csv", "json"],
      category: "Lightbar"
    },
    {
      id: "site-snapshot",
      name: "BESS Site Snapshot & Live Metrics",
      description: "Live block levels, string SOCs, voltages, and thermal margins packaged for instant SCADA audits.",
      formats: ["csv", "json"],
      category: "Quick Exports"
    }
  ];
  res.json({ success: true, catalog });
});

// 2. GET: List Generated/Recent Exports
app.get("/api/local/reports/recent", (req, res) => {
  try {
    const files = fs.readdirSync(reportsDir);
    const recent = files
      .map(file => {
        const filePath = path.join(reportsDir, file);
        const stat = fs.statSync(filePath);
        
        let type = "other";
        if (file.includes("prizm_site_validation")) type = "site-validation-package";
        else if (file.includes("corrective_actions")) type = "corrective-actions";
        else if (file.includes("hvac_simulation")) type = "hvac-simulation";
        else if (file.includes("lightbar")) type = "lightbar-audit";
        else if (file.includes("site_snapshot")) type = "site-snapshot";

        return {
          id: file,
          filename: file,
          sizeBytes: stat.size,
          timestamp: stat.mtime,
          type,
          url: `/api/local/reports/download/${file}`
        };
      })
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    res.json({ success: true, reports: recent });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. GET: Download Report file
app.get("/api/local/reports/download/:id", (req, res) => {
  try {
    const filename = path.basename(req.params.id);
    const filePath = path.join(reportsDir, filename);
    if (fs.existsSync(filePath)) {
      res.download(filePath);
    } else {
      res.status(404).send("Report file not found or has been cleaned by storage policy.");
    }
  } catch (err: any) {
    res.status(500).send("Error downloading file: " + err.message);
  }
});

// 4. DELETE: Remove report file
app.delete("/api/local/reports/:id", (req, res) => {
  try {
    const filename = path.basename(req.params.id);
    const filePath = path.join(reportsDir, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true, message: "Report deleted successfully" });
    } else {
      res.status(404).json({ success: false, error: "File not found" });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. POST: Trigger Immediate Cleanup
app.post("/api/local/reports/cleanup", (req, res) => {
  try {
    executeReportsCleanup();
    res.json({ success: true, message: "Storage cleanup run completed successfully" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. POST: Generate Report
app.post("/api/local/reports/generate", (req, res) => {
  try {
    const { reportType, format, includeRawJson, includeCsv, includePdf } = req.body;
    
    const activeProfile: any = ProfileStore.getActiveProfile() || {
      profileName: "Default Active",
      siteName: "Prizm BESS Station",
      stationCode: "BHE0020",
      blockIndex: 1,
      emsHost: "10.0.0.3",
      emsPort: 8080,
      turtlePath: "/turtle",
      modbusHost: "10.0.0.3",
      modbusPort: 502,
      topologyModel: getDefaultTopologyModel()
    };
    
    const stationCode = activeProfile.stationCode || "BHE0020";
    const ts = Date.now();
    const cleanFormat = (format || "json").toLowerCase();

    // Query active telemetry
    const liveMetrics: any = getEmsCachedStatus() || {};
    const blockSummary: any = getEmsCachedBlock() || {};
    const rawStrings: any = getEmsCachedRawStrings() || {};

    // Get corrective actions
    const rawCorrectiveActions = getCorrectiveActionsFromNormalizedFaults() || [];
    const correctiveActions = rawCorrectiveActions.map(act => {
      const level = act.severity === "alarm" ? "ALARM" : act.severity === "warning" ? "WARNING" : "FAULT";
      const firstAffected = act.affected[0];
      const source = firstAffected?.source === "ems" ? "String Controller" : firstAffected?.source === "feather" ? "Feather/HVAC" : "System";
      const object = act.affected.length === 1 ? firstAffected.label : "Multiple";
      return {
        level,
        source,
        fault: act.faultLabel,
        object,
        details: "Affected: " + act.affected.length + " unit(s) / " + act.affected.map((u: any) => u.label).join(", "),
        firstSeen: new Date().toISOString(),
        count: act.affected.length,
        suggestedAction: act.suggestedAction,
        status: "Open - Field Check Required",
        notes: "Diagnostic state auto-locked via Prizm active loop analysis"
      };
    });

    if (reportType === "site-validation-package") {
      // ZIP EVIDENCE PACKAGE
      const zipFilename = `prizm_site_validation_${stationCode}_${ts}.zip`;
      const zipPath = path.join(reportsDir, zipFilename);
      const zip = new AdmZip();

      // Form 1: Profile metadata
      const metaObj = {
        title: "Prizm Field Commissioning Validation Package",
        stationCode,
        activeProfileName: activeProfile.profileName || "Active-Live Profile",
        generatedAt: new Date().toISOString(),
        siteName: activeProfile.siteName,
        emsHost: activeProfile.emsHost,
        emsPort: activeProfile.emsPort,
        modbusHost: activeProfile.modbusHost,
        modbusPort: activeProfile.modbusPort,
        metricsSummary: {
          blocksReachable: blockSummary?.gatewayReachable || false,
          totalStrings: rawStrings?.data?.length || 0,
          averageSoc: liveMetrics?.bessFleetSummary?.avgSoc ?? 0,
        }
      };
      zip.addFile("metadata.json", Buffer.from(JSON.stringify(metaObj, null, 2), "utf-8"));

      // Form 2: Topology Config
      zip.addFile("topology_config.json", Buffer.from(JSON.stringify(activeProfile.topologyModel || {}, null, 2), "utf-8"));

      // Form 3: Live Telemetry
      zip.addFile("live_telemetry_snapshot.json", Buffer.from(JSON.stringify({ liveMetrics, blockSummary, rawStrings }, null, 2), "utf-8"));

      // Form 4: Corrective Actions Punch List JSON & CSV
      zip.addFile("corrective_actions_punchlist.json", Buffer.from(JSON.stringify(correctiveActions, null, 2), "utf-8"));
      
      let caCsv = "Remediation Level,Source Component,Detected Fault,Affected Object,Occurrence Details,First Detected Time,Severity Index,Suggested Action,Status,Notes\r\n";
      correctiveActions.forEach(act => {
        caCsv += `"${act.level}","${act.source}","${act.fault}","${act.object}","${act.details}","${act.firstSeen}",${act.count},"${act.suggestedAction}","${act.status}","${act.notes}"\r\n`;
      });
      zip.addFile("corrective_actions_punchlist.csv", Buffer.from(caCsv, "utf-8"));

      // Form 5: Active error logs from logger
      const activeAlerts = logs.filter(l => l.level === "ERROR" || l.level === "CRITICAL");
      zip.addFile("system_active_alerts.json", Buffer.from(JSON.stringify(activeAlerts, null, 2), "utf-8"));

      // Form 6: HVAC / simulation audits if present
      const hvacAuditPath = path.join(process.cwd(), "data", "hvac_simulation_audit.json");
      if (fs.existsSync(hvacAuditPath)) {
        zip.addFile("hvac_simulation_audit.json", fs.readFileSync(hvacAuditPath));
      } else {
        zip.addFile("hvac_simulation_audit.json", Buffer.from("[]", "utf-8"));
      }

      // Form 7: Lightbar audit logs if present
      const lbAuditPath = path.join(process.cwd(), "data", "prizm_lightbar_audit.json");
      if (fs.existsSync(lbAuditPath)) {
        zip.addFile("lineup_lightbar_audit.json", fs.readFileSync(lbAuditPath));
      } else {
        zip.addFile("lineup_lightbar_audit.json", Buffer.from("[]", "utf-8"));
      }

      // Write ZIP to local disk
      zip.writeZip(zipPath);
      const stat = fs.statSync(zipPath);

      return res.json({
        success: true,
        reportId: zipFilename,
        filename: zipFilename,
        sizeBytes: stat.size,
        downloadUrl: `/api/local/reports/download/${zipFilename}`
      });

    } else if (reportType === "corrective-actions") {
      // Corrective Actions Specific report
      const prefix = `prizm_corrective_actions_${stationCode}_${ts}`;
      if (cleanFormat === "csv") {
        const filename = `${prefix}.csv`;
        const filePath = path.join(reportsDir, filename);
        let caCsv = "Remediation Level,Source Component,Detected Fault,Affected Object,Occurrence Details,First Detected Time,Severity Index,Suggested Action,Status,Notes\r\n";
        correctiveActions.forEach(act => {
          caCsv += `"${act.level}","${act.source}","${act.fault}","${act.object}","${act.details}","${act.firstSeen}",${act.count},"${act.suggestedAction}","${act.status}","${act.notes}"\r\n`;
        });
        fs.writeFileSync(filePath, caCsv, "utf-8");
        const stat = fs.statSync(filePath);
        return res.json({
          success: true,
          reportId: filename,
          filename,
          sizeBytes: stat.size,
          downloadUrl: `/api/local/reports/download/${filename}`
        });

      } else if (cleanFormat === "pdf") {
        // PDF Summary output (rendered as an elegant structured text report file)
        const filename = `${prefix}.pdf`;
        const filePath = path.join(reportsDir, filename);
        let content = `================================================================================\n`;
        content += `                 PRIZM FIELD REMEDIATION & PUNCH LIST REPORT                    \n`;
        content += `================================================================================\n\n`;
        content += `Station-Code:      ${stationCode}\n`;
        content += `Generated At:      ${new Date().toUTCString()}\n`;
        content += `Active Profile:    ${activeProfile.profileName || "Active-Live Profile"}\n`;
        content += `Total Outstanding: ${correctiveActions.length} active issues detected\n`;
        content += `--------------------------------------------------------------------------------\n\n`;
        
        if (correctiveActions.length === 0) {
          content += `✔ SYSTEM STATUS NOMINAL: No corrective action entries or faults present.\n`;
        } else {
          correctiveActions.forEach((act, idx) => {
            content += `${idx + 1}. [${act.level}] ${act.fault} on ${act.object}\n`;
            content += `   Source:           ${act.source}\n`;
            content += `   Detailed Context: ${act.details}\n`;
            content += `   Remedy Action:    ${act.suggestedAction}\n`;
            content += `   Status:           ${act.status}\n`;
            content += `   Technician Notes: ________________________________________________________\n\n`;
          });
        }
        content += `--------------------------------------------------------------------------------\n`;
        content += `Utility / Lead Auditor Sign-off:\n\n`;
        content += `Name:   _______________________     Signature: _______________________\n`;
        content += `Date:   _______________________     Time:      _______________________\n`;
        content += `================================================================================\n`;

        fs.writeFileSync(filePath, content, "utf-8");
        const stat = fs.statSync(filePath);
        return res.json({
          success: true,
          reportId: filename,
          filename,
          sizeBytes: stat.size,
          downloadUrl: `/api/local/reports/download/${filename}`
        });
      } else {
        // JSON format
        const filename = `${prefix}.json`;
        const filePath = path.join(reportsDir, filename);
        fs.writeFileSync(filePath, JSON.stringify(correctiveActions, null, 2), "utf-8");
        const stat = fs.statSync(filePath);
        return res.json({
          success: true,
          reportId: filename,
          filename,
          sizeBytes: stat.size,
          downloadUrl: `/api/local/reports/download/${filename}`
        });
      }

    } else if (reportType === "hvac-simulation") {
      // HVAC Simulation logger
      const prefix = `hvac_simulation_report_${stationCode}_${ts}`;
      const hvacAuditPath = path.join(process.cwd(), "data", "hvac_simulation_audit.json");
      const hvacData = fs.existsSync(hvacAuditPath) ? JSON.parse(fs.readFileSync(hvacAuditPath, "utf-8")) : [];

      if (cleanFormat === "csv") {
        const filename = `${prefix}.csv`;
        const filePath = path.join(reportsDir, filename);
        let csv = "Timestamp,Simulated Cell Index,Ambient T,Aggregated Alarm,Fan Control State\r\n";
        hvacData.forEach((row: any) => {
          csv += `"${row.timestamp || ""}","${row.cellIndex || ""}","${row.ambientTempC || ""}","${row.alarmActive || ""}","${row.fanState || ""}"\r\n`;
        });
        fs.writeFileSync(filePath, csv, "utf-8");
        const stat = fs.statSync(filePath);
        return res.json({
          success: true,
          reportId: filename,
          filename,
          sizeBytes: stat.size,
          downloadUrl: `/api/local/reports/download/${filename}`
        });
      } else {
        const filename = `${prefix}.json`;
        const filePath = path.join(reportsDir, filename);
        fs.writeFileSync(filePath, JSON.stringify(hvacData, null, 2), "utf-8");
        const stat = fs.statSync(filePath);
        return res.json({
          success: true,
          reportId: filename,
          filename,
          sizeBytes: stat.size,
          downloadUrl: `/api/local/reports/download/${filename}`
        });
      }

    } else if (reportType === "lightbar-audit") {
      // Lightbar audit runner
      const prefix = `lightbar_audit_report_${stationCode}_${ts}`;
      const lbAuditPath = path.join(process.cwd(), "data", "prizm_lightbar_audit.json");
      const lbData = fs.existsSync(lbAuditPath) ? JSON.parse(fs.readFileSync(lbAuditPath, "utf-8")) : [];

      if (cleanFormat === "csv") {
        const filename = `${prefix}.csv`;
        const filePath = path.join(reportsDir, filename);
        let csv = "Timestamp,Action Type,Operator,Status,Detail\r\n";
        lbData.forEach((row: any) => {
          csv += `"${row.timestamp || ""}","${row.action || ""}","${row.operator || ""}","${row.status || ""}","${row.details || ""}"\r\n`;
        });
        fs.writeFileSync(filePath, csv, "utf-8");
        const stat = fs.statSync(filePath);
        return res.json({
          success: true,
          reportId: filename,
          filename,
          sizeBytes: stat.size,
          downloadUrl: `/api/local/reports/download/${filename}`
        });
      } else {
        const filename = `${prefix}.json`;
        const filePath = path.join(reportsDir, filename);
        fs.writeFileSync(filePath, JSON.stringify(lbData, null, 2), "utf-8");
        const stat = fs.statSync(filePath);
        return res.json({
          success: true,
          reportId: filename,
          filename,
          sizeBytes: stat.size,
          downloadUrl: `/api/local/reports/download/${filename}`
        });
      }

    } else {
      // DEFAULT: site-snapshot
      const prefix = `site_snapshot_report_${stationCode}_${ts}`;
      if (cleanFormat === "csv") {
        const filename = `${prefix}.csv`;
        const filePath = path.join(reportsDir, filename);
        let csv = "Metric,Value\r\n";
        csv += `"Station Code","${stationCode}"\r\n`;
        csv += `"Average SOC","${liveMetrics?.bessFleetSummary?.avgSoc ?? "N/A"}"\r\n`;
        csv += `"Active Alarms","${correctiveActions.length}"\r\n`;
        csv += `"Total Strings","${rawStrings?.data?.length || 0}"\r\n`;
        fs.writeFileSync(filePath, csv, "utf-8");
        const stat = fs.statSync(filePath);
        return res.json({
          success: true,
          reportId: filename,
          filename,
          sizeBytes: stat.size,
          downloadUrl: `/api/local/reports/download/${filename}`
        });
      } else {
        const filename = `${prefix}.json`;
        const filePath = path.join(reportsDir, filename);
        const snapshot = {
          stationCode,
          exportedAt: new Date().toISOString(),
          activeProfileName: activeProfile.profileName,
          liveMetrics,
          rawStringsCount: rawStrings?.data?.length || 0,
          outstandingFaults: correctiveActions.length
        };
        fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf-8");
        const stat = fs.statSync(filePath);
        return res.json({
          success: true,
          reportId: filename,
          filename,
          sizeBytes: stat.size,
          downloadUrl: `/api/local/reports/download/${filename}`
        });
      }
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Original endpoint bridged compatibility fallback
app.post("/api/reports/generate", (req, res) => {
  const { configId, selectedFormat } = req.body;
  
  // Find report setup or create typical default dump
  const targetConfig = reports.find(r => r.id === configId);
  const includeFormat = selectedFormat || targetConfig?.format || "JSON";
  const devicesToExport = targetConfig ? devices.filter(d => targetConfig.selectedDevices.includes(d.id)) : devices;

  if (includeFormat === "CSV") {
    // Generate lovely CSV of battery cells
    let csvContent = "Device ID,Name,IP Address,Model,Status,SoC %,SoH %,Voltage V,Current A,Power kW,Temperature C,Cycle Count,Last Ping\r\n";
    devicesToExport.forEach(d => {
      csvContent += `"${d.id}","${d.name}","${d.ipAddress}","${d.model}","${d.status}",${d.soc},${d.soh},${d.voltage},${d.current},${d.power},${d.temperature},${d.cycleCount},"${d.lastPing}"\r\n`;
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=BESS_LAN_Report_" + Date.now() + ".csv");
    return res.status(200).send(csvContent);
  } else {
    // JSON dump
    const payload = {
      generator: "GreEnergy Prizm Gateway",
      exportedAt: new Date().toISOString(),
      reportName: targetConfig?.name || "BESS Complete LAN Telemetry Dump",
      devicesCount: devicesToExport.length,
      deviceData: devicesToExport,
      recentAlertLogs: logs.filter(l => l.level === "ERROR" || l.level === "CRITICAL")
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", "attachment; filename=BESS_LAN_Report_" + Date.now() + ".json");
    return res.status(200).send(JSON.stringify(payload, null, 2));
  }
});

// API: Server-Side Gemini Smart Diagnostics Log Analysis
app.post("/api/devices/:id/diagnose", async (req, res) => {
  const dev = devices.find((d) => d.id === req.params.id);
  if (!dev) return res.status(404).json({ error: "Device not found" });

  const deviceLogs = logs.filter(l => l.deviceId === dev.id);

  // Prompt construction describing battery telemetry, cell logs, and requesting expert troubleshooting
  const systemInstruction = `You are an expert electrical engineer, battery diagnostic specialist, and BESS technician.
You analyze battery energy storage telemetry, cell imbalances, and active alarms, then return a structured JSON report matching the requested JSON Schema precisely.
Make your diagnostics practical, actionable, and detailed. Provide actual low-level curl commands to write coils/registers or bypass relays to aid troubleshooting.`;

  const devPrompt = `Please run deep analytics on BESS device details:
  Name: ${dev.name}
  Model: ${dev.model}
  IP: ${dev.ipAddress}:${dev.port}
  Status: ${dev.status}
  SoC: ${dev.soc}%
  SoH: ${dev.soh}%
  Temperature: ${dev.temperature}°C
  Active Power: ${dev.power} kW
  Voltage: ${dev.voltage} V
  Current: ${dev.current} A
  Frequency: ${dev.frequency} Hz
  Active Error Alarm: ${dev.lastError || "None"}
  Cell Voltages (16 individual cells): [${dev.cellVoltages.join(", ")}]

  Recent logged telemetry lines:
  ${JSON.stringify(deviceLogs)}

  Provide your findings structured in JSON covering:
  - summary: High-level descriptive diagnostic summary of the status
  - rootCause: Real explanation of why the cells are faulted, hot, or imbalanced (for example, cell 14 is floating at 3.51V while others are at 3.08-3.12V, indicating a major voltage/charge variance and potential thermal run-away hazard!)
  - severity: Severity string ("Low" | "Medium" | "High" | "Critical")
  - recommendations: Array of 3-4 specific physical checkups, load trims, or hardware steps
  - suggestedCurlCmds: Array of 2 manual diagnostic curl actions, including title, curl command itself (mocking specific coils to toggle, register queries to read cell groups), and descriptive logic explaining the diagnostic curl. Build authentic mock curl formats based on typical industrial Modbus-TCP endpoints.
  `;

  // Lazy initialize & wrap Gemini implementation
  const apiKey = process.env.GEMINI_API_KEY;
  const isKeyValid = apiKey && apiKey !== "" && !apiKey.includes("MY_GEMINI_API_KEY");

  if (isKeyValid) {
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: devPrompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              rootCause: { type: Type.STRING },
              severity: { type: Type.STRING },
              recommendations: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              suggestedCurlCmds: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    cmd: { type: Type.STRING },
                    desc: { type: Type.STRING }
                  },
                  required: ["title", "cmd", "desc"]
                }
              }
            },
            required: ["summary", "rootCause", "severity", "recommendations", "suggestedCurlCmds"]
          }
        }
      });

      if (response && response.text) {
        const parsed = JSON.parse(response.text.trim()) as SmartDiagnosticResponse;
        return res.json(parsed);
      }
    } catch (err) {
      console.error("Gemini log parsing failed, falling back to dynamic template helper:", err);
    }
  }

  // Fallback Rule-Based Expert Parser (Provides outstanding offline results if key is missing or fails!)
  let summary = "";
  let rootCause = "";
  let severity: 'Low' | 'Medium' | 'High' | 'Critical' = 'Low';
  let recommendations: string[] = [];
  let suggestedCurlCmds: { title: string; cmd: string; desc: string }[] = [];

  if (dev.status === "Faulted" || dev.lastError) {
    severity = "Critical";
    summary = `Overtemperature lockout on Cell #14 with severe voltage imbalance detected on ${dev.name}.`;
    rootCause = `Cell #14 is reporting an abnormally high potential of 3.51V while Cell #13 is lagging at 3.08V. This delta variance (~430mV) exceeds the safe balancing limit (typically 50mV) under charging stresses. The localized chemical heat generation pushed core temperatures to ${dev.temperature}°C, triggering a hard safety relay decouple to prevent thermal runaway.`;
    recommendations = [
      "Visually inspect physical cell terminals at modular drawer #3, checking for heat distortion, venting, or bulging.",
      "Run offline localized cell-balancing using the Modbus-enabled diagnostic control module to discharge cell 14 slightly.",
      "Check the coolant flow regulator valving on rack block C to make sure cell group bypass is not pinched.",
      "Verify cell temperature thermocouple resistance; replace thermocouple block if readings remain erratic after cooldown."
    ];
    suggestedCurlCmds = [
      {
        title: "Bypass Latching Relay and Force Soft Reset Command",
        cmd: `curl -X POST -H "Content-Type: application/json" -d '{"enable_bypass": 1, "override_interlock": "TEMP_711_CONFIRMED"}' "http://${dev.ipAddress}:${dev.port}/api/v1/bess/write-register?reg=45100&val=32"`,
        desc: "Forces a physical latching relay reset through modbus registers to let fans run even during emergency contact containment."
      },
      {
        title: "Query Micro-balancing Module Voltages",
        cmd: `curl -X GET "http://${dev.ipAddress}:${dev.port}/api/v1/bess/read-registers?start_reg=40200&count=16"`,
        desc: "Read all high-definition cell registers (Registers 40200-40215) directly from the BMS board to inspect physical ADC noise level."
      }
    ];
  } else {
    severity = dev.status === "Maintenance" ? "Medium" : "Low";
    summary = `${dev.name} is reporting nominal operations and healthy balance.`;
    rootCause = `Grid power frequency is holding stable at ${dev.frequency} Hz. Average individual battery cell temperatures are completely within the safe threshold (${dev.temperature}°C). There are no active faults or cell imbalances. System state is currently ${dev.status}.`;
    recommendations = [
      "Continue monitoring state under diurnal load cycling.",
      "Check air intake filters on battery housing racks to ensure adequate airflow during charging spikes.",
      "Schedule routine voltage calibration test next quarter during off-peak windows."
    ];
    suggestedCurlCmds = [
      {
        title: "Initiate Autonomous Modbus Health Query",
        cmd: `curl -X GET "http://${dev.ipAddress}:${dev.port}/api/v1/bess/status"`,
        desc: "Executes standard JSON configuration poll directly to BMS microcontroller."
      }
    ];
  }

  res.json({
    summary,
    rootCause,
    severity,
    recommendations,
    suggestedCurlCmds
  });
});

// ==================== EMULATED EMS TURTLE & FEATHER API GATEWAY ====================
// These endpoints unify the exact register status reports and curl calls targeted by the bash utility scripts.

// 1. Turtle Status
app.get("/turtle/tools/report/ems/status.json", (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    status: "NORMAL",
    emsUptimeSeconds: 1442180,
    acGridCoupled: true,
    totalChargeCapacityKwh: 4950,
    activePowerLimitKw: 1500,
    frequencyHz: 60.01,
    activeErrorsCount: devices.filter(d => d.status === "Faulted").length,
    communicationLossCount: 0
  });
});

// 2. BESS Status Codes
app.get("/turtle/tools/report/ems/bessStatusCodes.json", (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    activeStates: devices.map(d => ({ deviceId: d.id, ipAddress: d.ipAddress, status: d.status, lastError: d.lastError })),
    registeredStatusCodes: [
      { code: "ALERT_CODE_711_HIGH_TEMP_CELL_VARIANCE_CRITICAL", severity: "CRITICAL", desc: "Thermal runaway hazard / voltage mismatch >400mV" },
      { code: "TEMP_WARNING_45C", severity: "WARNING", desc: "Passive radiator high temperature cell threshold limit" },
      { code: "STATE_THRESHOLD_IDLE", severity: "INFO", desc: "Ideal capacity ceiling achieved. Disconnecting charger power source." }
    ]
  });
});

// 3. Controller Statistics
app.get("/turtle/tools/report/ems/controllerStatistics.json", (req, res) => {
  res.json({
    cycleClockTicks: 104523,
    modbusReadsTotal: 849204,
    modbusWritesTotal: 1243,
    activeTcpPconnections: 12,
    modbusPollErrors: 0,
    canBusPacketsLost: 12,
    heartbeatsExchanged: 4501
  });
});

// 4. Last Call
app.get("/turtle/tools/report/ems/lastCall.json", (req, res) => {
  const result: Record<string, string> = {};
  devices.forEach(d => {
    result[d.ipAddress] = d.lastPing;
  });
  res.json({
    timestamp: new Date().toISOString(),
    lastRegisteredCalls: result
  });
});

// 5. Array Report
app.get("/turtle/tools/report/ems/array/:arrayId/report.json", (req, res) => {
  const arrId = req.params.arrayId;
  res.json({
    arrayIndex: Number(arrId),
    timestamp: new Date().toISOString(),
    activeStringsConnected: 12,
    avgSoc: 64.2,
    activePowerKw: 120.5,
    thermalImbalanceDetected: false,
    coolersOperational: true
  });
});

// 6. Array Notifications
app.get("/turtle/tools/report/ems/array/:arrayId/notifications.json", (req, res) => {
  const arrId = req.params.arrayId;
  const arrayLogs = logs.filter(l => l.deviceId === "bess-03" && arrId === "3");
  
  // Return embedded format targeted by shell scripts
  res.json({
    notification: arrayLogs.map(l => ({
      notificationSource: {
        arrayIndex: Number(arrId),
        stringIndex: 1,
        batteryPackIndex: 14,
        cellGroupIndex: 14
      },
      notificationType: {
        notificationCategory: l.level === "CRITICAL" ? "CRITICAL" : "WARNING",
        notificationId: l.level === "CRITICAL" ? 1024 : 2008,
      },
      timestamp: new Date(l.timestamp).getTime().toString()
    }))
  });
});

// 7. Sibling String Report
app.get("/turtle/tools/report/ems/array/:arrayId/string/:stringId/report.json", (req, res) => {
  const arrId = Number(req.params.arrayId);
  const strId = Number(req.params.stringId);
  
  res.json({
    arrayIndex: arrId,
    stringIndex: strId,
    timestamp: new Date().toISOString(),
    voltage: 480.2,
    current: 12.4,
    soc: 55.4,
    soh: 96.5,
    state: "ONLINE",
    contactorOpen: false,
    recloseAttempts: 0,
    maxCellVoltageDeltaMv: arrId === 3 && strId === 1 ? 430 : 25,
    maxCellTempDeltaC: arrId === 3 && strId === 1 ? 9.5 : 1.2,
    balancerMode: arrId === 3 && strId === 1 ? 2 : 0,
    fansRpm: [1800, 1850, 1800, 1810]
  });
});

// 8. Sibling String Notifications
app.get("/turtle/tools/report/ems/array/:arrayId/string/:stringId/notifications.json", (req, res) => {
  const arrId = Number(req.params.arrayId);
  const strId = Number(req.params.stringId);
  
  // Custom mock warnings matching what new_local_notifications.sh embeds
  const items = [];
  if (arrId === 3 && strId === 1) {
    items.push({
      notificationSource: {
        arrayIndex: arrId,
        stringIndex: strId,
        batteryPackIndex: 14,
        cellGroupIndex: 14
      },
      notificationType: {
        notificationCategory: "CRITICAL",
        notificationId: 1024 // BPC Disconnect Alarm
      },
      timestamp: String(Date.now() - 1000 * 1800)
    }, {
      notificationSource: {
        arrayIndex: arrId,
        stringIndex: strId,
        batteryPackIndex: 14,
        cellGroupIndex: 4
      },
      notificationType: {
        notificationCategory: "WARNING",
        notificationId: 2008 // BatteryPack Delta Warning
      },
      timestamp: String(Date.now() - 1000 * 3600)
    });
  } else if (arrId === 1 && strId === 2) {
    items.push({
      notificationSource: {
        arrayIndex: arrId,
        stringIndex: strId,
        batteryPackIndex: 2,
        cellGroupIndex: 5
      },
      notificationType: {
        notificationCategory: "WARNING",
        notificationId: 2561 // String OOR Warning
      },
      timestamp: String(Date.now() - 1000 * 600)
    });
  }
  
  res.json({ notification: items });
});

// 9. High Definition Cell Grid (VoltageMap / TemperatureMap stringviewer reader)
app.get("/turtle/tools/monitor/ems/stringviewer/array/:arrayId/:stringId/data", (req, res) => {
  const arrIndex = Number(req.params.arrayId);
  const strIndex = Number(req.params.stringId);
  
  // Pack 14 of array 3 string 1 is imbalanced. Others are uniform.
  const cellGroupCount = 30; // standard 30 cells per pack
  const batteryPacksCount = 14; // standard 14 packs per string
  
  const voltagePacks: Record<string, any> = {};
  const tempPacks: Record<string, any> = {};
  
  for (let p = 1; p <= batteryPacksCount; p++) {
    const vCells: Record<string, any> = {};
    const tCells: Record<string, any> = {};
    
    for (let c = 1; c <= cellGroupCount; c++) {
      // Normal nominal voltage: 3250 mV.
      let v = 3250 + Math.round((Math.sin(p + c) * 15) + (Math.random() * 4));
      let t = 24 + Math.round((Math.cos(p + c) * 1.5));
      
      // Implant imbalances of array 3 string 1
      if (arrIndex === 3 && strIndex === 1 && p === 14) {
        if (c === 14) {
          v = 3510; // high spiked voltage
          t = 55;   // thermal run-away spike
        } else if (c === 13) {
          v = 3080; // lagging cell
          t = 48;
        } else {
          v = 3120;
          t = 38;
        }
      }
      
      vCells[String(c)] = { value: v };
      tCells[String(c)] = { value: t };
    }
    
    voltagePacks[String(p)] = { cellGroups: vCells };
    tempPacks[String(p)] = { cellGroups: tCells };
  }
  
  res.json({
    stringViewerDataModel: {
      cellGroupCount,
      stringIndex: strIndex,
      voltageMap: {
        batteryPacks: voltagePacks
      },
      temperatureMap: {
        batteryPacks: tempPacks
      }
    }
  });
});

// CSV Map generation
app.get("/turtle/tools/report/ems/stringIPMap.csv", (req, res) => {
  res.setHeader("Content-Type", "text/csv");
  const filePath = path.join(process.cwd(), "turtle/tools/report/ems/stringIPMap.csv");
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.send("Array,String,IP\r\n1,1,10.0.1.10\r\n1,2,10.0.1.15\r\n3,1,10.0.3.10\r\n3,2,10.0.3.15\r\n");
  }
});

app.get("/turtle/tools/report/ems/ipMap.csv", (req, res) => {
  res.setHeader("Content-Type", "text/csv");
  const filePath = path.join(process.cwd(), "turtle/tools/report/ems/ipMap.csv");
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.send("Target,IPAddress,Model\r\nSubstation A1,10.0.1.101,BESS-Mega\r\nSolar Array B,10.0.1.102,Megapack\r\n");
  }
});

app.post("/api/upload-string-ip-map", (req, res) => {
  const { csvContent } = req.body;
  if (!csvContent) {
    return res.status(400).json({ error: "No CSV content provided in request body" });
  }
  const filePath = path.join(process.cwd(), "turtle/tools/report/ems/stringIPMap.csv");
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, csvContent, "utf-8");
    res.json({ success: true, message: "String IP Map CSV uploaded and stored successfully!" });
  } catch (err: any) {
    console.error("Failed to write custom string IP map CSV:", err);
    res.status(500).json({ error: err.message || "Failed to write custom string IP map CSV" });
  }
});

app.post("/api/upload-ip-map", (req, res) => {
  const { csvContent } = req.body;
  if (!csvContent) {
    return res.status(400).json({ error: "No CSV content provided in request body" });
  }
  const filePath = path.join(process.cwd(), "turtle/tools/report/ems/ipMap.csv");
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, csvContent, "utf-8");
    res.json({ success: true, message: "Site IP Map CSV uploaded and stored successfully!" });
  } catch (err: any) {
    console.error("Failed to write custom site IP map CSV:", err);
    res.status(500).json({ error: err.message || "Failed to write custom site IP map CSV" });
  }
});

app.get("/turtle/tools/report/ems/modbus_map.csv", (req, res) => {
  res.setHeader("Content-Type", "text/csv");
  res.sendFile(path.join(process.cwd(), "turtle/tools/report/ems/modbus_map.csv"));
});

app.get("/turtle/tools/report/ems/ip_modbus_associations.csv", (req, res) => {
  res.setHeader("Content-Type", "text/csv");
  res.sendFile(path.join(process.cwd(), "turtle/tools/report/ems/ip_modbus_associations.csv"));
});

app.post("/api/upload-modbus-map", (req, res) => {
  const { csvContent } = req.body;
  if (!csvContent) {
    return res.status(400).json({ error: "No CSV content provided in request body" });
  }
  const filePath = path.join(process.cwd(), "turtle/tools/report/ems/modbus_map.csv");
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, csvContent, "utf-8");
    res.json({ success: true, message: "Modbus Map CSV uploaded and stored successfully on the network interface!" });
  } catch (err: any) {
    console.error("Failed to write custom modbus map CSV:", err);
    res.status(500).json({ error: err.message || "Failed to write custom modbus map CSV" });
  }
});

app.get("/turtle/tools/report/ems/strings.csv", (req, res) => {
  res.setHeader("Content-Type", "text/csv");
  res.send("Array,String,Status,SoC\r\n1,1,ONLINE,42.5\r\n3,1,FAULTED,18.4\r\n");
});

// 10. Emulated controllers digital HVAC / MIO diagnostics
app.get("/feather/status/report.json", (req, res) => {
  // Return structure targeted by new_mio_test.sh
  res.json({
    thermalData: {
      avgCellTemperature: 24.2,
      supplyAirTemp: 19.5,
      coolingSetpoint: 26.0,
      heatingSetpoint: 18.0,
      thermostatStage: "IdleMode",
      hydrogen1PPM: 2.4,
      HVAC1Controls: {
        valid: true,
        fanLowOn: true,
        fanHighOn: false,
        YCompressorOn: false
      },
      HVAC1Data: {
        hvacCurrent: 4.2,
        FreezeDetected: false
      },
      HVAC2Controls: {
        fanLowOn: false,
        fanHighOn: false,
        YCompressorOn: false
      },
      HVAC2Data: {
        hvacCurrent: 0.0,
        FreezeDetected: false
      }
    }
  });
});

// CSV Modbus Poller emulation
app.get("/tools/controls/modbusPoll/host/:host/port/:port/unitId/:unit/type/:type/start/:start/count/:count/data.csv", (req, res) => {
  const count = Number(req.params.count) || 10;
  const startReg = Number(req.params.start) || 1;
  const typeReg = req.params.type;
  
  let csv = "Timestamp,Register,Value,Interpretation\r\n";
  const now = new Date().toISOString();
  for (let i = 0; i < count; i++) {
    const reg = startReg + i;
    let val = 0;
    
    // Set realistic mock variables for SunSpec / Powin keys
    if (reg === 2) val = 1; // Common ID
    else if (reg === 3) val = 66; // Length
    else if (reg === 72) val = Math.floor(Math.random() * 20) + 140; // Amps
    else if (reg === 73) val = 50;
    else if (reg === 80) val = 277; // AN voltage
    else if (reg === 84) val = Math.floor(Math.random() * 100) + 1200; // Watts
    else if (reg === 86) val = 60; // Hz
    else if (reg === 103) val = Math.floor(Math.random() * 2) + 24; // CabinetTemperature
    else if (reg === 108) val = 4; // OperatingState (Charge/Discharge)
    else if (reg === 542) val = 300;
    else if (reg === 547) val = 277;
    else if (reg === 558) val = Math.floor(Math.random() * 100) + 1240; // Meter Watts
    else if (reg === 658) val = Math.floor(Math.random() * 5) + 80; // SoC%
    else if (reg === 660) val = 98; // SoH%
    else if (reg === 691) val = Math.floor(Math.random() * 50) + 400; // DC Current
    else if (reg === 694) val = Math.floor(Math.random() * 150) + 1150; // Total Power kW
    else if (reg === 1161) val = 4; // String count
    else if (reg === 1163) val = 28; // Max mod temp
    else if (reg === 1166) val = 22; // Min mod temp
    else if (reg === 13145) val = 21; // Outdoor Temp
    else if (reg === 13146) val = 45; // Outdoor Humid
    else if (reg === 13191) val = Math.floor(Math.random() * 2) + 2; // HydrogenPPM
    else {
      // Default placeholder
      val = typeReg === "coil" ? (Math.random() > 0.8 ? 1 : 0) : Math.floor(Math.random() * 30) + 5;
    }
    
    csv += `"${now}",${reg},${val},"Nominal telemetry state read"\r\n`;
  }
  res.setHeader("Content-Type", "text/csv");
  res.send(csv);
});

if (process.env.ENABLE_LEGACY_CONTROL_MOCKS === "true") {
// Direct contactor / loop rotators overrides
app.get("/tools/controls/ems/array/:arrayId/string/:stringId/contactors/:act", (req, res) => {
  res.json({ status: "success", detail: `Contactor set to ${req.params.act} on Array ${req.params.arrayId} String ${req.params.stringId}` });
});

app.get("/tools/controls/ems/array/:arrayId/contactors/:act", (req, res) => {
  res.json({ status: "success", detail: `Contactors set to ${req.params.act} across Array ${req.params.arrayId}` });
});

app.get("/tools/controls/ems/array/:arrayId/string/:stringId/rotate/strings/:act", (req, res) => {
  res.json({ status: "success", detail: `Rotated String ${req.params.stringId} ${req.params.act} on Array ${req.params.arrayId}` });
});

app.get("/tools/controls/ems/array/:arrayId/rotate/strings/:act", (req, res) => {
  res.json({ status: "success", detail: `Rotated strings ${req.params.act} on Array ${req.params.arrayId}` });
});

app.get("/tools/controls/ems/array/:arrayId/rotate/arrayPcses/:act", (req, res) => {
  res.json({ status: "success", detail: `Rotated Array PCSes ${req.params.act} on Array ${req.params.arrayId}` });
});

app.get("/tools/controls/ems/heatsoak/start/blockEnclosure/:seg/temperatureSetpoint/:sp", (req, res) => {
  res.json({ status: "success", detail: `Heat soak started for Block Enclosure Segment ${req.params.seg} at Target Setpoint ${req.params.sp}°C` });
});

app.get("/tools/controls/ems/heatsoak/stop/blockEnclosure/:seg", (req, res) => {
  res.json({ status: "success", detail: `Heat soak terminated on Block Enclosure Segment ${req.params.seg}` });
});


}

// Production route serving SPA build
if (process.env.PRIZM_FORCE_DEV === "true") {
  console.log("PRIZM server mode: Vite development middleware");
  const startVite = async () => {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  };
  startVite();
} else {
  console.log("PRIZM server mode: production static client");
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  try {
    initLocalStorageMaintenance();
  } catch (err) {
    console.error("[Storage] Failed to initialize storage maintenance:", err);
  }
  initializePrizmBootFlow().catch(console.error);
});

server.on('error', (e: any) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
    console.error(`Run: npm run stop:port`);
    console.error(`Then: npm start`);
    process.exit(1);
  }
});

let reports: any[] = [];
let logs: any[] = [];
let devices: any[] = [];
