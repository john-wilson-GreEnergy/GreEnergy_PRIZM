import * as prizmCache from "./src/server/cache/prizmCache";
import AdmZip from "adm-zip";
import PDFDocument from "pdfkit";
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
import { contactorControlRouter } from "./src/server/contactorControlRoutes";
import { externalTelemetryRouter } from "./src/server/demo/externalTelemetryMock";
import emsAppRoutes from "./src/server/ems/emsAppRoutes";
import { startModbusScheduler } from "./src/server/telemetry/modbusProfileManager";
import storageRouter from "./src/server/storage/storageRoutes";
import { initLocalStorageMaintenance } from "./src/server/storage/storageMaintenance";
import { siteDataRouter } from "./src/server/siteDataRoutes";
import { reportRoutes } from "./src/server/reports/reportRoutes";

import { emsCache, bootstrapEmsAndSeedCache, getExtendedConnectionStatus, DEMO_TEMPLATES, OFFLINE_TEMPLATES } from "./src/server/emsTurtleClient";
import { bootstrapFeatherDiscoveryAndSeedCache } from "./src/server/feather/featherClient";
import express from "express";
import { recordTelemetrySample, getSiteTelemetryHistory, getLatestSiteMetrics } from "./src/server/telemetry/siteTelemetryAggregator";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { BessDevice, ReportConfig, SmartDiagnosticResponse } from "./src/types";
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
import siteDistributionRouter from "./src/server/siteDistribution/siteDistributionRoutes";
import siteSensorsRouter from "./src/server/siteSensors/siteSensorsRoutes";
import diagnosticSessionRouter from "./src/server/diagnosticSession/diagnosticSessionRoutes";
import provisioningRoutes from "./src/server/deviceProvisioning/provisioningRoutes";
import balancerTestRouter from "./src/server/balancerTest/balancerTestRoutes";
import fanControlRouter from "./src/server/fanControl/fanControlRoutes";
import debugSourceScanRouter from "./src/server/debugSourceScan";
import { troubleshootingRouter } from "./src/server/troubleshooting/troubleshootingRoutes";
import { formatAffectedTargetForDisplay, shouldShowTargetIp } from "./src/server/troubleshooting/troubleshootingResolver";
import { getBootStatus, initializePrizmBootFlow, startBackgroundPolling, handleProfileChange } from "./src/server/startup/prizmBootOrchestrator";
import * as prizmDataCoordinator from "./src/server/prizmDataCoordinator";
import { fetchEnrichedDevices } from "./src/server/feather/deviceEnrichment";
import { getCommunicating, getOutRotation, getContactorsClosed, classifyStringOperationalState } from "./src/lib/stringClassifier";
import { resolveCorrectiveAction } from "./src/server/correctiveActions/correctiveActionResolver";
import { STACK750_FAULT_MATRIX, MATRIX_METADATA } from "./src/server/correctiveActions/correctiveActionMatrix";




const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '50mb' }));

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
app.use("/api/local/strings/contactors", contactorControlRouter);
app.use("/api/local/balancing", balancingRouter);
app.use("/api/local/ems-apps", emsAppRoutes);
app.use("/api/local/hvac-simulation", hvacSimulationRouter);
app.use("/api/local/storage", storageRouter);
app.use("/api/local/site-distribution", siteDistributionRouter);
app.use("/api/local/site-health", siteDistributionRouter);
app.use("/api/local/site-sensors", siteSensorsRouter);
app.use("/api/local/diagnostic-session", diagnosticSessionRouter);
app.use("/api/local/site-data", siteDataRouter);
app.use("/api/local/reports", reportRoutes);
app.use("/api/local/provisioning", provisioningRoutes);

app.use("/api/local/balancer-test", balancerTestRouter);

app.use("/api/local/fan-control", fanControlRouter);

app.use("/api/local/troubleshooting", troubleshootingRouter);

app.use("/api/local", debugSourceScanRouter);

app.get("/api/local/snapshot", async (req, res) => {
  if (req.query.refresh === "true") {
    try {
      await prizmDataCoordinator.triggerImmediatePoll();
    } catch (err: any) {
      console.error("[Snapshot Route] Synchronous refresh failed", err);
    }
  }
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

app.get("/api/local/pcs/dashboard", (req, res) => {
  const startedAt = Date.now();
  const includePerf = req.query.includePerf === "true";
  const snapshot = prizmDataCoordinator.getLatestSnapshot();
  if (!snapshot) return res.status(503).json({ error: "Snapshot not yet built" });
  if (includePerf) {
    res.setHeader("X-PRIZM-Duration-Ms", String(Date.now() - startedAt));
  }
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

app.get("/api/local/corrective-actions/matrix", (req, res) => {
  res.json({
    metadata: MATRIX_METADATA,
    totalEntries: STACK750_FAULT_MATRIX.length,
    systemCounts: STACK750_FAULT_MATRIX.reduce((acc: any, curr) => {
      acc[curr.system] = (acc[curr.system] || 0) + 1;
      return acc;
    }, {})
  });
});

app.post("/api/local/corrective-actions/resolve", (req, res) => {
  const { items } = req.body || { items: [] };
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: "items must be an array" });
  }
  const resolved = items.map(item => resolveCorrectiveAction(item));
  res.json({
    success: true,
    resolved
  });
});

app.get("/api/local/system/boot-status", (req, res) => {
  res.json(getBootStatus());
});

app.post("/api/local/system/reinitialize", (req, res) => {
  handleProfileChange();
  res.json(getBootStatus());
});

app.post("/api/local/system/refresh-live", async (req, res) => {
  try {
    await prizmDataCoordinator.triggerImmediatePoll();
    res.json({ success: true, message: "Live EMS refresh completed" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Live EMS refresh failed" });
  }
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

// --- MODULARIZED EXTERNAL TELEMETRY INTERCEPTOR ---
import { 
  populateInitialHistory, 
  setBlockFetcher
} from "./src/server/demo/externalTelemetryMock";



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

// GET /api/local/ems/mode
app.get("/api/local/ems/mode", (req, res) => {
  res.json(getEmsMode());
});

// GET /api/local/ems/sources
app.get("/api/local/ems/sources", (req, res) => {
  res.json(getEmsSourcesDebugInfo());
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

// -----------------------------------------------------------------------------
// Raw EMS/Turtle cache compatibility endpoints.
// These endpoints expose direct cached EMS/Turtle payloads or lightly normalized
// compatibility views for diagnostics and older components.
//
// Canonical production dashboard APIs are:
// - /api/local/site-operations/summary
// - /api/local/strings/dashboard
// - /api/local/strings/dashboard/:arrayNumber/:stringNumber/detail
// - /api/local/pcs/dashboard
// - /api/local/site-distribution/strings
// - /api/local/site-sensors/summary
//
// Do not build new dashboard UI against these raw compatibility endpoints unless
// the feature explicitly requires raw source inspection.
// -----------------------------------------------------------------------------
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


// Site Distribution Endpoint is modularized under /src/server/siteDistribution/siteDistributionRoutes.ts

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


// 6. GET /api/local/snapshot/pcses: Derived from blockviewer arrays/pcs data
app.get("/api/local/snapshot/pcses", (req, res) => {
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

// Backward compatibility redirect or alias
app.get("/api/local/pcses", (req, res) => {
  res.status(410).json({
    success: false,
    deprecated: true,
    canonicalPath: "/api/local/pcs/dashboard",
    snapshotPath: "/api/local/snapshot/pcses",
    message: "Deprecated route. Use /api/local/pcs/dashboard for normalized PCS dashboard rows. Use /api/local/snapshot/pcses only for raw cached PCS snapshots."
  });
});

// 7. GET /api/local/snapshot/topology: Derived from blockviewer topology
app.get("/api/local/snapshot/topology", (req, res) => {
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

// Backward compatibility redirect or alias
app.get("/api/local/topology", (req, res) => {
  res.status(410).json({
    success: false,
    deprecated: true,
    canonicalPath: "/api/local/topology/...",
    snapshotPath: "/api/local/snapshot/topology",
    message: "Deprecated route. Use the topology router namespace for active topology workflows, or /api/local/snapshot/topology for raw cached topology snapshots."
  });
});

// 8. GET /api/local/first-responder: Combine /firstresponder/data and /v2/firstresponder/data
app.get("/api/local/first-responder", (req, res) => {
  res.json(getEmsCachedFirstResponder());
});

// Site Sensors endpoints are modularized under /src/server/siteSensors/siteSensorsRoutes.ts


// 9. GET /api/local/status-codes: Use /tools/report/ems/bessStatusCodes.json

// Optional Helper for safely parsing numbers
// (Ensure we don't declare pN again if it already exists, let's just make it local)
app.get("/api/local/strings/:arrayIndex/:stringIndex/detail", (req, res) => {
  res.redirect(`/api/local/strings/dashboard/${req.params.arrayIndex}/${req.params.stringIndex}/detail`);
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
      topologyModel: profileToValidate.topologyModel,
      sensorMonitoringProfile: req.body.sensorMonitoringProfile
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

app.post("/api/settings/profiles/test-action", async (req, res) => {
  const isDemo = process.env.ENABLE_DEMO_TOGGLE === "true" || process.env.DEMO_MODE === "true";
  
  if (!isDemo) {
    return res.json({
      success: false,
      error: "Profile test-action is demo-only. Use real connection test endpoint instead."
    });
  }

  res.json({
    success: true,
    source: "demo",
    warning: "Demo response only. This is not field validation.",
    message: "Simulation active: action passed locally."
  });
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
    if (body.sensorMonitoringProfile !== undefined) updates.sensorMonitoringProfile = body.sensorMonitoringProfile;

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
    const direct = (await queryFeatherDevice(deviceIp, sourceMethod, timeout)) as any;
    const snapshot: any = prizmDataCoordinator.getLatestSnapshot();

    const existing: any =
      snapshot?.normalized?.feather?.find((d: any) =>
        d.ip === deviceIp || d.deviceIp === deviceIp
      ) ||
      lastEnrichedCache?.devices?.find((d: any) =>
        d.ip === deviceIp || d.deviceIp === deviceIp
      );

    const merged = {
      ...(existing || {}),
      ...(direct || {}),

      ip: direct?.ip || existing?.ip || deviceIp,
      deviceIp: direct?.deviceIp || existing?.deviceIp || deviceIp,

      arrayIndex: direct?.arrayIndex !== undefined && direct?.arrayIndex !== null ? direct.arrayIndex : existing?.arrayIndex,
      stringIndex: direct?.stringIndex !== undefined && direct?.stringIndex !== null ? direct.stringIndex : existing?.stringIndex,
      segmentLabel: direct?.segmentLabel !== undefined && direct?.segmentLabel !== null ? direct.segmentLabel : existing?.segmentLabel,
      entityDescription: direct?.entityDescription !== undefined && direct?.entityDescription !== null ? direct.entityDescription : existing?.entityDescription,
      entityKey: direct?.entityKey !== undefined && direct?.entityKey !== null ? direct.entityKey : existing?.entityKey,
      entityKeyToken: direct?.entityKeyToken !== undefined && direct?.entityKeyToken !== null ? direct.entityKeyToken : existing?.entityKeyToken,
      displayKey: direct?.displayKey !== undefined && direct?.displayKey !== null ? direct.displayKey : existing?.displayKey,

      firmwareVersion: direct?.firmwareVersion !== undefined && direct?.firmwareVersion !== null ? direct.firmwareVersion : existing?.firmwareVersion,
      softwareVersion: direct?.softwareVersion !== undefined && direct?.softwareVersion !== null ? direct.softwareVersion : existing?.softwareVersion,

      thermostatStage: direct?.thermostatStage !== undefined && direct?.thermostatStage !== null ? direct.thermostatStage : existing?.thermostatStage,
      hvacRuntimeState: direct?.hvacRuntimeState !== undefined && direct?.hvacRuntimeState !== null ? direct.hvacRuntimeState : existing?.hvacRuntimeState,
      hvacMode: direct?.hvacMode !== undefined && direct?.hvacMode !== null ? direct.hvacMode : existing?.hvacMode,
      hvacStatus: direct?.hvacStatus !== undefined && direct?.hvacStatus !== null ? direct.hvacStatus : existing?.hvacStatus,

      hvac1: (direct?.hvac1 !== undefined && direct?.hvac1 !== null) ? direct.hvac1 : existing?.hvac1,
      hvac2: (direct?.hvac2 !== undefined && direct?.hvac2 !== null) ? direct.hvac2 : existing?.hvac2,
      doors: (direct?.doors !== undefined && direct?.doors !== null) ? direct.doors : existing?.doors,
      fssSignals: (direct?.fssSignals !== undefined && direct?.fssSignals !== null) ? direct.fssSignals : existing?.fssSignals,

      sourceCoverage: {
        ...(existing?.sourceCoverage || {}),
        ...(direct?.sourceCoverage || {}),
        directFeather: true
      },

      doorApplicability: {
        ...(existing?.doorApplicability || {}),
        ...(direct?.doorApplicability || {})
      },

      raw: {
        ...(existing?.raw || {}),
        directPoll: direct?.raw || direct
      }
    };

    res.json({
      success: true,
      device: merged,
      directStatusMerged: !!existing,
      mergedFromSnapshot: !!snapshot?.normalized?.feather,
      source: "direct-feather-status"
    });
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

const demoTelemetryEnabled =
  process.env.ENABLE_DEMO_TOGGLE === "true" ||
  process.env.DEMO_MODE === "true";
if (demoTelemetryEnabled) {
  populateInitialHistory();
  setBlockFetcher(getEmsCachedBlock);
  app.use("/api/external-telemetry", externalTelemetryRouter);
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


function compactCorrectivePdfNumberRanges(values: any[]): string {
  const nums = Array.from(
    new Set(
      (values || [])
        .map((v: any) => Number(v))
        .filter((v: number) => Number.isFinite(v))
    )
  ).sort((a, b) => a - b);

  if (!nums.length) return "--";

  const ranges: string[] = [];
  let start = nums[0];
  let prev = nums[0];

  for (let i = 1; i <= nums.length; i += 1) {
    const current = nums[i];

    if (current === prev + 1) {
      prev = current;
      continue;
    }

    ranges.push(start === prev ? String(start) : `${start}-${prev}`);
    start = current;
    prev = current;
  }

  return ranges.join(", ");
}

function pickCorrectivePdfTargetPart(target: any, keys: string[], fallback: any = null): any {
  for (const key of keys) {
    const value = target?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return fallback;
}

function condenseCorrectivePdfTargets(targets: any[]): any[] {
  const groups = new Map<string, any>();

  for (const target of targets || []) {
    const block = pickCorrectivePdfTargetPart(target, ["blockIndex", "block", "blockNumber"], 1);
    const array = pickCorrectivePdfTargetPart(target, ["arrayIndex", "arrayNumber", "array"], null);
    const es = pickCorrectivePdfTargetPart(target, ["energySegmentIndex", "energySegmentNumber", "energySegment", "es"], null);
    const string = pickCorrectivePdfTargetPart(target, ["stringIndex", "stringNumber", "string"], null);
    const side = pickCorrectivePdfTargetPart(target, ["side"], null);
    const bpc = pickCorrectivePdfTargetPart(target, ["batteryPackIndex", "bpcIndex", "bpc", "batteryPack"], null);

    const key = [block, array, es, string, side, bpc].join("|");

    if (!groups.has(key)) {
      groups.set(key, {
        block,
        array,
        es,
        string,
        side,
        bpc,
        cgs: [],
        rawTargets: [],
        representative: target
      });
    }

    const group = groups.get(key);
    group.rawTargets.push(target);

    const cg = pickCorrectivePdfTargetPart(target, ["cellGroupIndex", "cellGroupNumber", "cell", "cg"], null);
    if (cg !== null && cg !== undefined) group.cgs.push(cg);
  }

  return Array.from(groups.values()).map((group) => {
    const parts = [
      group.block !== null && group.block !== undefined ? `Block ${group.block}` : null,
      group.array !== null && group.array !== undefined ? `Array ${group.array}` : null,
      group.es !== null && group.es !== undefined ? `ES${group.es}` : null,
      group.string !== null && group.string !== undefined ? `String ${group.string}` : null,
      group.side ? `${group.side}` : null,
      group.bpc !== null && group.bpc !== undefined ? `BPC ${group.bpc}` : null,
      group.cgs.length ? `CG ${compactCorrectivePdfNumberRanges(group.cgs)}` : null
    ].filter(Boolean);

    return {
      ...group.representative,
      condensedLabel: parts.join(" / "),
      condensedCount: group.rawTargets.length,
      condensedRawTargets: group.rawTargets
    };
  });
}

async function generateCorrectiveActionsPdf(
  filePath: string,
  stationCode: string,
  activeProfile: any,
  correctiveActions: any[]
): Promise<void> {
  // Let's resolve the actions with the matrix first to ensure we have enriched data
  const enrichedActions = correctiveActions.map(act => {
    const resolved = resolveCorrectiveAction(act);
    return {
      ...act,
      resolved
    };
  });

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: "A4", bufferPages: true });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      const BRAND_GREEN = "#32A97B";
      const TEXT_MAIN = "#1e293b";
      const TEXT_MUTED = "#64748b";
      const BORDER_LIGHT = "#e2e8f0";
      const BG_ALT = "#f8fafc";
      const DANGER = "#ef4444";     // Alarm/Critical
      const WARNING = "#f59e0b";    // Warning
      const INFO = "#3b82f6";       // Info

      // Draw Top Accent bar on page 1
      doc.rect(50, 40, 495, 4).fill(BRAND_GREEN);
      doc.y = 60;

      // Title & Subtitle
      doc.fontSize(10).font("Helvetica-Bold").fillColor(BRAND_GREEN).text("GREENERGY PRIZM", 50, 60);
      doc.fontSize(18).font("Helvetica-Bold").fillColor(TEXT_MAIN).text("PRIZM CORRECTIVE ACTION SUMMARY", 50, 75);
      
      doc.moveTo(50, 100).lineTo(545, 100).strokeColor(BORDER_LIGHT).stroke();

      // Metadata Panel (Executive Summary Info)
      const metaY = 115;
      doc.rect(50, metaY, 495, 75).fillAndStroke(BG_ALT, BORDER_LIGHT);
      
      doc.fontSize(9).font("Helvetica").fillColor(TEXT_MUTED);
      doc.text("Station Code:", 70, metaY + 15).font("Helvetica-Bold").fillColor(TEXT_MAIN).text(stationCode, 160, metaY + 15);
      doc.font("Helvetica").fillColor(TEXT_MUTED).text("Generated At:", 70, metaY + 32).font("Helvetica-Bold").fillColor(TEXT_MAIN).text(new Date().toUTCString(), 160, metaY + 32);
      doc.font("Helvetica").fillColor(TEXT_MUTED).text("Active Profile:", 70, metaY + 49).font("Helvetica-Bold").fillColor(TEXT_MAIN).text(activeProfile.profileName || "Active-Live Profile", 160, metaY + 49);

      const openCount = enrichedActions.length;
      const criticalCount = enrichedActions.filter(a => a.level === "ALARM").length;
      const warningCount = enrichedActions.filter(a => a.level === "WARNING").length;
      const matchedCount = enrichedActions.filter(a => a.resolved?.matched).length;

      doc.font("Helvetica").fillColor(TEXT_MUTED).text("Total Open Issues:", 330, metaY + 15).font("Helvetica-Bold").fillColor(TEXT_MAIN).text(`${openCount} active`, 460, metaY + 15);
      doc.font("Helvetica").fillColor(TEXT_MUTED).text("Severity Breakdown:", 330, metaY + 32).font("Helvetica-Bold").fillColor(criticalCount > 0 ? DANGER : BRAND_GREEN).text(`${criticalCount} Critical, ${warningCount} Warning`, 460, metaY + 32);
      doc.font("Helvetica").fillColor(TEXT_MUTED).text("Troubleshooting Guidance status:", 330, metaY + 49).font("Helvetica-Bold").fillColor(TEXT_MAIN).text(`${matchedCount} matched, ${openCount - matchedCount} fallback`, 460, metaY + 49);

      doc.y = metaY + 110;

      // Draw Executive Summary Cards/Bento Panel
      doc.fontSize(11).font("Helvetica-Bold").fillColor(TEXT_MAIN).text("EXECUTIVE SUMMARY OVERVIEW", 50, doc.y);
      doc.moveDown(0.4);

      const summaryBoxY = doc.y;
      doc.rect(50, summaryBoxY, 155, 55).fillAndStroke(BG_ALT, BORDER_LIGHT);
      doc.rect(220, summaryBoxY, 155, 55).fillAndStroke(BG_ALT, BORDER_LIGHT);
      doc.rect(390, summaryBoxY, 155, 55).fillAndStroke(BG_ALT, BORDER_LIGHT);

      // Card 1
      doc.fontSize(7.5).font("Helvetica").fillColor(TEXT_MUTED).text("OPEN CORRECTIVE ACTIONS", 60, summaryBoxY + 10);
      doc.fontSize(18).font("Helvetica-Bold").fillColor(openCount > 0 ? DANGER : BRAND_GREEN).text(String(openCount), 60, summaryBoxY + 24);

      // Card 2
      doc.fontSize(7.5).font("Helvetica").fillColor(TEXT_MUTED).text("CRITICAL ALERTS", 230, summaryBoxY + 10);
      doc.fontSize(18).font("Helvetica-Bold").fillColor(criticalCount > 0 ? DANGER : BRAND_GREEN).text(String(criticalCount), 230, summaryBoxY + 24);

      // Card 3
      doc.fontSize(7.5).font("Helvetica").fillColor(TEXT_MUTED).text("TROUBLESHOOTING LIBRARY MATCHES", 400, summaryBoxY + 10);
      doc.fontSize(18).font("Helvetica-Bold").fillColor(BRAND_GREEN).text(String(matchedCount), 400, summaryBoxY + 24);

      doc.y = summaryBoxY + 70;

      if (openCount === 0) {
        doc.rect(50, doc.y, 495, 45).fillAndStroke("#ecfdf5", "#a7f3d0");
        doc.fontSize(10).font("Helvetica-Bold").fillColor("#065f46").text("✔ SYSTEM STATUS NOMINAL: No open corrective actions or active faults detected.", 70, doc.y + 16);
      } else {
        // Section 1: PRIORITY CORRECTIVE ACTIONS
        doc.fontSize(12).font("Helvetica-Bold").fillColor(TEXT_MAIN).text("PRIORITY CORRECTIVE ACTIONS", 50, doc.y);
        doc.moveDown(0.5);

        enrichedActions.forEach((act, idx) => {
          // Check for page break before starting a new item card
          if (doc.y > 650) {
            doc.addPage();
            doc.rect(50, 40, 495, 3).fill(BRAND_GREEN);
            doc.fontSize(8).font("Helvetica-Bold").fillColor(BRAND_GREEN).text("GreEnergy PRIZM - Corrective Action Summary (Cont.)", 50, 50);
            doc.moveTo(50, 62).lineTo(545, 62).strokeColor(BORDER_LIGHT).stroke();
            doc.y = 80;
          }

          let itemStartY = doc.y;
          const severityColor = act.level === "ALARM" ? DANGER : (act.level === "WARNING" ? WARNING : INFO);
          const resolved = act.resolved;

          // Padding inside the card
          doc.y = itemStartY + 12;

          // 1. Fault header
          const issueName = resolved?.resolvedTroubleshooting?.issueName || act.fault;
          doc.fontSize(10).font("Helvetica-Bold").fillColor(TEXT_MAIN).text(`${idx + 1}. [${act.level}] ${issueName}`, 70);
          doc.moveDown(0.4);

          // 2. Metadata / metrics in dynamic layout
          doc.fontSize(8).font("Helvetica").fillColor(TEXT_MUTED).text("Target Class:", 70);
          doc.font("Helvetica-Bold").fillColor(TEXT_MAIN).text(act.object || "System Component", 170, doc.y - 11);

          doc.font("Helvetica").fillColor(TEXT_MUTED).text("Source Component:", 70);
          doc.font("Helvetica-Bold").fillColor(TEXT_MAIN).text(act.source || "Unknown", 170, doc.y - 11);

          doc.font("Helvetica").fillColor(TEXT_MUTED).text("Resolution Source:", 70);
          const resolutionSource = resolved?.matched 
            ? `PRIZM Troubleshooting Library - ${issueName}` 
            : "PRIZM Troubleshooting Library - Default Advisory Fallback";
          doc.font("Helvetica-Bold").fillColor(resolved?.matched ? BRAND_GREEN : WARNING).text(resolutionSource, 170, doc.y - 11);

          doc.moveDown(0.5);

          // Matrix Enhanced Remediation Guidance Block
          doc.fontSize(8.5).font("Helvetica-Bold").fillColor(TEXT_MAIN).text("REMEDIATION & TROUBLESHOOTING GUIDANCE:", 70);
          doc.moveDown(0.2);

          // Power Checks, when applicable
          const isBpcPowerIssue = resolved?.system === "balancing" || resolved?.system === "bpc" || resolved?.resolvedTroubleshooting?.id === "bpc-not-balancing" || resolved?.resolvedTroubleshooting?.id === "bpc-disconnect";
          if (isBpcPowerIssue) {
            doc.fontSize(8).font("Helvetica-Bold").fillColor(TEXT_MAIN).text("  Power Checks:", 70);
            doc.fontSize(7.5).font("Helvetica").fillColor(TEXT_MAIN).text("  • 24VDC balancing power", 80);
            doc.fontSize(7.5).font("Helvetica").fillColor(TEXT_MAIN).text("  • 12VDC BPC control / logic power", 80);
            doc.moveDown(0.2);
          }

          // Bullet points of recommended actions
          if (resolved?.recommendedActions?.length) {
            doc.fontSize(8).font("Helvetica-Bold").fillColor(BRAND_GREEN).text("  Recommended Actions:", 70);
            resolved.recommendedActions.forEach((action: string) => {
              doc.fontSize(7.5).font("Helvetica").fillColor(TEXT_MAIN).text(`  • ${action}`, 80);
            });
            doc.moveDown(0.2);
          }

          // Validation Checks
          if (resolved?.validationChecks?.length) {
            doc.fontSize(8).font("Helvetica-Bold").fillColor(TEXT_MAIN).text("  Validation Checks:", 70);
            resolved.validationChecks.forEach((check: string) => {
              doc.fontSize(7.5).font("Helvetica").fillColor(TEXT_MAIN).text(`  • ${check}`, 80);
            });
            doc.moveDown(0.2);
          }

          // Clearing Criteria
          if (resolved?.clearingCriteria?.length) {
            doc.fontSize(8).font("Helvetica-Bold").fillColor(TEXT_MAIN).text("  Clearing Criteria:", 70);
            resolved.clearingCriteria.forEach((crit: string) => {
              doc.fontSize(7.5).font("Helvetica").fillColor(TEXT_MAIN).text(`  • ${crit}`, 80);
            });
            doc.moveDown(0.2);
          }

          // Field Notes / Escalation Guidance
          const technicianDetail = resolved?.resolvedTroubleshooting?.technicianDetail;
          if (technicianDetail) {
            doc.fontSize(8).font("Helvetica-Bold").fillColor(TEXT_MAIN).text("  Field Notes / Escalation Guidance:", 70);
            doc.fontSize(7.5).font("Helvetica").fillColor(TEXT_MAIN).text(`  • ${technicianDetail}`, 80);
            doc.moveDown(0.3);
          } else if (resolved?.escalationGuidance?.length) {
            doc.fontSize(8).font("Helvetica-Bold").fillColor(TEXT_MAIN).text("  Field Notes / Escalation Guidance:", 70);
            resolved.escalationGuidance.forEach((gStr: string) => {
              doc.fontSize(7.5).font("Helvetica").fillColor(TEXT_MAIN).text(`  • ${gStr}`, 80);
            });
            doc.moveDown(0.3);
          }

          // Condensed list of affected targets
          const affList = act.affected || [];
          if (affList.length > 0) {
            const condensedTargets = condenseCorrectivePdfTargets(affList);

            doc.fontSize(8).font("Helvetica-Bold").fillColor(TEXT_MAIN).text(
              `Affected Targets (${affList.length} raw / ${condensedTargets.length} grouped):`,
              70
            );
            doc.moveDown(0.2);

            condensedTargets.forEach((aff: any) => {
              const countSuffix =
                Number(aff.condensedCount || 1) > 1
                  ? `  x${aff.condensedCount}`
                  : "";

              const affText = `• ${aff.condensedLabel || formatAffectedTargetForDisplay(aff, resolved?.system, resolved?.resolvedTroubleshooting?.detailView)}${countSuffix}`;
              doc.fontSize(7.5).font("Helvetica").fillColor(TEXT_MAIN).text(affText, 90);
            });

            doc.moveDown(0.4);
          }

          // Quick Technician Notes line inside card (No signatures!)
          doc.moveTo(70, doc.y).lineTo(525, doc.y).strokeColor(BORDER_LIGHT).stroke();
          doc.moveDown(0.3);
          doc.fontSize(7.5).font("Helvetica-Oblique").fillColor(TEXT_MUTED).text("Field Repair Notes: ____________________________________________________________________", 70);
          
          doc.moveDown(0.4);
          const itemEndY = doc.y;
          const itemHeight = itemEndY - itemStartY;

          // Draw card outline & left accent bar
          doc.rect(50, itemStartY, 495, itemHeight).strokeColor(BORDER_LIGHT).stroke();
          doc.rect(51, itemStartY + 1, 6, itemHeight - 2).fill(severityColor);

          doc.y = itemEndY + 8;
        });
      }

      // Footer/page-number pass intentionally disabled.
      // PDFKit text written during a buffered second pass was creating footer-only trailing pages.
      // The field-tech export formats will reintroduce footers using a safer renderer.
      doc.end();

      stream.on("finish", () => resolve());
      stream.on("error", (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

// 6. POST: Generate Report
app.post("/api/local/reports/generate", async (req, res) => {
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
    const snapshot = prizmDataCoordinator.getLatestSnapshot();
    const rawCorrectiveActions = snapshot?.normalized?.correctiveActions && snapshot.normalized.correctiveActions.length > 0
      ? snapshot.normalized.correctiveActions
      : (getCorrectiveActionsFromNormalizedFaults() || []).map(act => {
          const firstAffected = act.affected[0];
          return {
            level: act.severity === "alarm" ? "ALARM" : act.severity === "warning" ? "WARNING" : "FAULT",
            source: firstAffected?.source === "ems" ? "String Controller" : firstAffected?.source === "feather" ? "Feather/HVAC" : "System",
            faultName: act.faultLabel,
            suggestedAction: act.suggestedAction,
            affected: act.affected.map(aff => ({
              blockIndex: aff.blockIndex || 1,
              arrayIndex: aff.arrayIndex || 1,
              stringIndex: aff.stringIndex,
              energySegmentIndex: aff.segmentIndex,
              side: aff.stringIndex ? (aff.stringIndex % 2 === 1 ? "A-Side" : "B-Side") : "",
              batteryPackIndex: (aff as any).bpcIndex ?? (aff as any).batteryPackIndex ?? null,
              cellGroupIndex: (aff as any).cellGroupIndex ?? (aff as any).cgIndex ?? null,
              deviceIp: aff.ip,
              label: aff.label
            }))
          };
        });

    const correctiveActions = rawCorrectiveActions.map((act: any) => {
      const level = String(act.level || act.severity || "warning").toUpperCase();
      const firstAffected = act.affected?.[0] || {};
      const source = act.source || (firstAffected?.source === "EMS" || firstAffected?.source === "ems" ? "String Controller" : firstAffected?.source === "feather" ? "Feather/HVAC" : "System");
      const count = act.affected?.length || 0;

      const affectedMapped = (act.affected || []).map((aff: any) => {
        const sNum = aff.stringIndex ?? aff.stringNumber ?? null;
        const esNum = sNum ? Math.ceil(sNum / 2) : (aff.energySegmentIndex ?? aff.segmentIndex ?? null);
        const side = aff.side || aff.stringSide || (sNum ? (sNum % 2 === 1 ? "A-Side" : "B-Side") : "");
        const bpcVal = aff.batteryPackIndex ?? aff.bpcIndex ?? null;
        const cgVal = aff.cellGroupIndex ?? aff.cgIndex ?? null;

        return {
          blockIndex: aff.blockIndex ?? 1,
          arrayIndex: aff.arrayIndex ?? 1,
          stringIndex: sNum,
          energySegmentIndex: esNum,
          side: side,
          batteryPackIndex: bpcVal,
          cellGroupIndex: cgVal,
          ip: aff.deviceIp ?? aff.ip,
          label: aff.label ?? aff.callout ?? `Block ${aff.blockIndex ?? 1} / Array ${aff.arrayIndex ?? 1} / ES${esNum ?? 1}`
        };
      });

      let object = "Multiple";
      if (count === 1 && affectedMapped[0]) {
        const aff = affectedMapped[0];
        const bIdx = aff.blockIndex ?? 1;
        const aIdx = aff.arrayIndex ?? 1;
        const sNum = aff.stringIndex;
        let esLabel = "";
        let stringDetail = "";
        if (sNum && sNum > 0) {
          const esNum = Math.ceil(sNum / 2);
          esLabel = `ES${esNum}`;
          const side = aff.side || (sNum % 2 === 1 ? "A-Side" : "B-Side");
          stringDetail = ` / String ${sNum} / ${side}`;
        } else {
          esLabel = aff.energySegmentIndex ? `ES${aff.energySegmentIndex}` : "ES1";
        }
        const bpcVal = aff.batteryPackIndex;
        const cgVal = aff.cellGroupIndex;
        let bpcCgDetail = "";
        if (bpcVal !== null && bpcVal !== undefined && bpcVal !== "") {
          bpcCgDetail += ` / BPC ${bpcVal}`;
          if (cgVal !== null && cgVal !== undefined && cgVal !== "") {
            bpcCgDetail += ` / CG ${cgVal}`;
          }
        } else if (cgVal !== null && cgVal !== undefined && cgVal !== "") {
          bpcCgDetail += ` / CG ${cgVal}`;
        }
        object = `Block ${bIdx} / Array ${aIdx} / ${esLabel}${stringDetail}${bpcCgDetail}`;
      }

      return {
        level,
        source,
        fault: act.faultName || act.faultLabel || act.fault || "Unknown Fault",
        object,
        details: "Affected: " + count + " unit(s)",
        firstSeen: act.firstSeen || new Date().toISOString(),
        count,
        suggestedAction: act.suggestedAction || "Inspect status and verify parameters",
        status: "Open - Field Check Required",
        notes: "Diagnostic state auto-locked via Prizm active loop analysis",
        affected: affectedMapped
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
        // PDF Summary output (rendered as an elegant PDF binary file)
        const filename = `${prefix}.pdf`;
        const filePath = path.join(reportsDir, filename);
        
        try {
          await generateCorrectiveActionsPdf(filePath, stationCode, activeProfile, correctiveActions);
          const stat = fs.statSync(filePath);
          return res.json({
            success: true,
            reportId: filename,
            filename,
            sizeBytes: stat.size,
            downloadUrl: `/api/local/reports/download/${filename}`
          });
        } catch (pdfErr: any) {
          console.error("Failed to generate real PDF, falling back to text file", pdfErr);
          // Fallback to text file so that it at least completes
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
          fs.writeFileSync(filePath, content, "utf-8");
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

// 0. Compatibility Fallback endpoints for offline simulation
app.get("/turtle/status", (req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.send("OK");
});

app.get("/turtle/tools/monitor/ems/blockviewer/data", (req, res) => {
  res.json(DEMO_TEMPLATES.block);
});

app.get("/turtle/firstresponder/data", (req, res) => {
  res.json(DEMO_TEMPLATES.firstResponder.v1);
});

app.get("/turtle/v2/firstresponder/data", (req, res) => {
  res.json(DEMO_TEMPLATES.firstResponder.v2);
});

app.get("/turtle/tools/report/ems/array/:arrayId/pcs/:pcsId/report.json", (req, res) => {
  const arrayId = Number(req.params.arrayId) || 1;
  const pcsId = Number(req.params.pcsId) || 1;
  res.json({
    timeStamp: String(Date.now()),
    arrayPcsData: {
      state: "Stop",
      dcVoltageVolt: 1375 + pcsId,
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
          acVoltageVolt: 692,
          acRealPowerKW: 0,
          acReactivePowerKVAR: 0
        },
        {
          arrayPcsPhase: "PHASE_B",
          acCurrentAmp: 0,
          acVoltageVolt: 689,
          acRealPowerKW: 0,
          acReactivePowerKVAR: 0
        },
        {
          arrayPcsPhase: "PHASE_C",
          acCurrentAmp: 0,
          acVoltageVolt: 691,
          acRealPowerKW: 0,
          acReactivePowerKVAR: 0
        }
      ]
    }
  });
});

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

const mockFanSpeeds = new Map<string, number>();
const mockContactorStates = new Map<string, { pos: boolean; neg: boolean; closeExpected: boolean }>();

app.get([
  "/turtle/tools/controls/bms/array/:arrayId/contactors/:act",
  "/tools/controls/bms/array/:arrayId/contactors/:act"
], (req, res) => {
  const arrayId = Number(req.params.arrayId);
  const act = String(req.params.act).toLowerCase();
  const closed = act === "close";

  for (let s = 1; s <= 40; s++) {
    mockContactorStates.set(`A${arrayId}-S${s}`, {
      pos: closed,
      neg: closed,
      closeExpected: closed
    });
  }
  res.send("S");
});

app.get([
  "/turtle/tools/controls/bms/array/:arrayId/string/:stringId/contactors/:act",
  "/tools/controls/bms/array/:arrayId/string/:stringId/contactors/:act"
], (req, res) => {
  const arrayId = Number(req.params.arrayId);
  const stringId = Number(req.params.stringId);
  const act = String(req.params.act).toLowerCase();
  const closed = act === "close";

  mockContactorStates.set(`A${arrayId}-S${stringId}`, {
    pos: closed,
    neg: closed,
    closeExpected: closed
  });
  res.send("S");
});

app.get([
  "/turtle/tools/controls/ems/array/:arrayId/string/:stringId/fanCtlAll/:fanSpeed",
  "/turtle/tools/controls/bms/array/:arrayId/string/:stringId/fanCtlAll/:fanSpeed",
  "/tools/controls/ems/array/:arrayId/string/:stringId/fanCtlAll/:fanSpeed",
  "/tools/controls/bms/array/:arrayId/string/:stringId/fanCtlAll/:fanSpeed"
], (req, res) => {
  const arrayId = Number(req.params.arrayId);
  const stringId = Number(req.params.stringId);
  const fanSpeed = Number(req.params.fanSpeed);
  mockFanSpeeds.set(`A${arrayId}-S${stringId}`, fanSpeed);
  res.json({ status: "success", detail: `Fan speed set to ${fanSpeed}% on Array ${arrayId} String ${stringId}` });
});

app.get("/turtle/tools/report/ems/strings.csv", (req, res) => {
  res.setHeader("Content-Type", "text/csv");
  let csv = "Array,String,Status,SoC,Ah,MeasuredStringVoltage,CalculatedStringVoltage,DcBusVoltage,StringCurrent,KW,MinCellGroupVoltage,MaxCellGroupVoltage,AvgCellGroupVoltage,MinCellGroupTemp,MaxCellGroupTemp,AvgCellGroupTemp,BalancingCount,BalancingMode,FanCommand,FanSetting,FanActual,LastFanCommandTime,FanHealthy,PositiveContactorClosed,NegativeContactorClosed,OutRotation,TimestampUtc,Location,ContactorsCloseExpected\r\n";
  for (let a = 1; a <= 8; a++) {
    for (let s = 1; s <= 40; s++) {
      const isFaulted = (a === 3 && s === 1);
      const status = isFaulted ? "FAULTED" : "ONLINE";
      const soc = isFaulted ? "18.4" : (65.5 + a * 1.5 + (s % 5) * 0.5).toFixed(1);
      const ah = "280";
      
      const measV = (1280 + a * 5 + s * 0.2).toFixed(1);
      const calcV = (1280 + a * 5 + s * 0.2 + 0.1).toFixed(1);
      const busV = (1280 + a * 5 + s * 0.2 + 1.5).toFixed(1);
      const current = isFaulted ? "0.0" : (12.5 + a * 0.5).toFixed(1);
      const kw = (Number(measV) * Number(current) / 1000).toFixed(2);
      
      const minCellV = "3.245";
      const maxCellV = "3.285";
      const avgCellV = "3.265";
      const minCellT = "24.5";
      const maxCellT = "27.2";
      const avgCellT = "25.8";
      
      const balCount = s % 7 === 0 ? "3" : "0";
      const balMode = "Auto";
      
      // Look up our mock fan speed!
      const commandedSpeed = mockFanSpeeds.get(`A${a}-S${s}`) ?? 0;
      const fanCommand = String(commandedSpeed);
      const fanSetting = String(commandedSpeed);
      const fanActual = String(commandedSpeed);
      
      const lastFanCmdTime = new Date().toISOString();
      const fanHealthy = "true";

      const state = mockContactorStates.get(`A${a}-S${s}`) || { pos: true, neg: true, closeExpected: true };
      const posContClosed = state.pos ? "true" : "false";
      const negContClosed = state.neg ? "true" : "false";
      const closeExp = state.closeExpected ? "true" : "false";

      const outRotation = "false";
      const timestampUtc = new Date().toISOString();
      const location = `A${a}-S${s}`;
      
      csv += `${a},${s},${status},${soc},${ah},${measV},${calcV},${busV},${current},${kw},${minCellV},${maxCellV},${avgCellV},${minCellT},${maxCellT},${avgCellT},${balCount},${balMode},${fanCommand},${fanSetting},${fanActual},${lastFanCmdTime},${fanHealthy},${posContClosed},${negContClosed},${outRotation},${timestampUtc},${location},${closeExp}\r\n`;
    }
  }
  res.send(csv);
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
    
    // Set realistic mock variables for SunSpec / EMS keys
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
