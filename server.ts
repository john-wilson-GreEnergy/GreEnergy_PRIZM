import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { BessDevice, BessLog, ReportConfig, SmartDiagnosticResponse } from "./src/types";

const app = express();
const PORT = 3000;

app.use(express.json());

// Ensure data folder exists
const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEVICES_FILE = path.join(DATA_DIR, "bess_devices.json");
const LOGS_FILE = path.join(DATA_DIR, "bess_logs.json");
const REPORTS_FILE = path.join(DATA_DIR, "bess_reports.json");

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

// Initial seed devices
const initialDevices: BessDevice[] = [
  {
    id: "bess-01",
    name: "Substation Alpha-1 Core",
    ipAddress: "192.168.1.101",
    port: 502,
    model: "Greenergy BESS-Mega 1000",
    status: "Charging",
    soc: 42.5,
    soh: 96.8,
    voltage: 482.4,
    current: 207.3,
    frequency: 60.02,
    temperature: 34.6,
    power: 100.0, // kW
    capacityKwh: 1200,
    cycleCount: 247,
    lastPing: new Date().toISOString(),
    isOnline: true,
    firmwareVersion: "v2.5.14",
    lastError: null,
    cellVoltages: [3.21, 3.22, 3.21, 3.23, 3.22, 3.21, 3.22, 3.23, 3.21, 3.21, 3.22, 3.22, 3.21, 3.23, 3.22, 3.21]
  },
  {
    id: "bess-02",
    name: "Solar Array B Buffer",
    ipAddress: "192.168.1.102",
    port: 502,
    model: "Tesla Megapack 2XL",
    status: "Discharging",
    soc: 81.2,
    soh: 98.1,
    voltage: 812.5,
    current: -153.8,
    frequency: 59.98,
    temperature: 31.2,
    power: -125.0, // kW
    capacityKwh: 3000,
    cycleCount: 112,
    lastPing: new Date().toISOString(),
    isOnline: true,
    firmwareVersion: "v2025.12.3",
    lastError: null,
    cellVoltages: [3.31, 3.32, 3.31, 3.30, 3.31, 3.32, 3.32, 3.31, 3.31, 3.30, 3.31, 3.32, 3.31, 3.30, 3.32, 3.31]
  },
  {
    id: "bess-03",
    name: "Anode Storage Cluster C",
    ipAddress: "192.168.1.103",
    port: 502,
    model: "Greenergy BESS-Eco 500",
    status: "Faulted",
    soc: 18.4,
    soh: 89.2,
    voltage: 410.2,
    current: 0.0,
    frequency: 60.00,
    temperature: 52.4, // Overheating!
    power: 0.0,
    capacityKwh: 500,
    cycleCount: 684,
    lastPing: new Date().toISOString(),
    isOnline: true,
    firmwareVersion: "v1.12.2",
    lastError: "ALERT_CODE_711_HIGH_TEMP_CELL_VARIANCE_CRITICAL",
    cellVoltages: [3.12, 3.14, 3.12, 3.42, 3.11, 3.10, 3.12, 3.14, 3.09, 3.10, 3.11, 3.15, 3.08, 3.51, 3.12, 3.11] // voltage imbalance in cell 14 and 4!
  },
  {
    id: "bess-04",
    name: "Office Peak-Shaving Unit",
    ipAddress: "192.168.1.104",
    port: 502,
    model: "Greenergy BESS-Eco 250",
    status: "Idle",
    soc: 94.1,
    soh: 93.5,
    voltage: 240.1,
    current: 0.0,
    frequency: 60.01,
    temperature: 24.5,
    power: 0.0,
    capacityKwh: 250,
    cycleCount: 412,
    lastPing: new Date().toISOString(),
    isOnline: true,
    firmwareVersion: "v2.1.0-rc1",
    lastError: null,
    cellVoltages: [3.28, 3.28, 3.29, 3.28, 3.29, 3.28, 3.28, 3.29, 3.28, 3.28, 3.29, 3.29, 3.28, 3.28, 3.29, 3.28]
  }
];

const initialLogs: BessLog[] = [
  {
    id: "log-1",
    deviceId: "bess-03",
    deviceName: "Anode Storage Cluster C",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    level: "WARNING",
    message: "Cell temperature has exceeded caution limit (45°C). Current sensor read: 46.2°C.",
    code: "TEMP_WARNING_45C"
  },
  {
    id: "log-2",
    deviceId: "bess-03",
    deviceName: "Anode Storage Cluster C",
    timestamp: new Date(Date.now() - 1800000).toISOString(),
    level: "CRITICAL",
    message: "Overtemperature Trip Activated: Cell #14 is reporting 55.1°C with voltage variance of +390mV. Contactors decoupled automatically.",
    code: "ALERT_CODE_711_HIGH_TEMP_CELL_VARIANCE_CRITICAL"
  },
  {
    id: "log-3",
    deviceId: "bess-01",
    deviceName: "Substation Alpha-1 Core",
    timestamp: new Date(Date.now() - 600000).toISOString(),
    level: "INFO",
    message: "Remote API Command received: Set Active Charge Mode to 100.0kW.",
    code: "CMD_CHARGE_OK"
  },
  {
    id: "log-4",
    deviceId: "bess-04",
    deviceName: "Office Peak-Shaving Unit",
    timestamp: new Date().toISOString(),
    level: "INFO",
    message: "State of Charge reached target threshold (94.1%). Transitioning to Idle Mode.",
    code: "STATE_THRESHOLD_IDLE"
  }
];

const initialReports: ReportConfig[] = [
  {
    id: "rep-1",
    name: "Substation Daily Efficiency & Cycle Log",
    frequency: "Daily",
    format: "JSON",
    recipients: ["john.wilson@greenergyresources.com", "ops-alerts@greenergyresources.com"],
    lastSent: new Date(Date.now() - 86400000).toISOString(),
    selectedDevices: ["bess-01", "bess-02"],
    includeMetrics: ["soc", "temperature", "cycleCount", "power"]
  },
  {
    id: "rep-2",
    name: "Facility Integrity Weekly Summary",
    frequency: "Weekly",
    format: "CSV",
    recipients: ["john.wilson@greenergyresources.com"],
    lastSent: new Date(Date.now() - 432000000).toISOString(),
    selectedDevices: ["bess-01", "bess-02", "bess-03", "bess-04"],
    includeMetrics: ["soh", "temperature", "lastError", "voltage", "current"]
  }
];

// Load collections from files or write seeds
let devices = readJSONFile<BessDevice[]>(DEVICES_FILE, initialDevices);
if (!fs.existsSync(DEVICES_FILE)) writeJSONFile(DEVICES_FILE, devices);

let logs = readJSONFile<BessLog[]>(LOGS_FILE, initialLogs);
if (!fs.existsSync(LOGS_FILE)) writeJSONFile(LOGS_FILE, logs);

let reports = readJSONFile<ReportConfig[]>(REPORTS_FILE, initialReports);
if (!fs.existsSync(REPORTS_FILE)) writeJSONFile(REPORTS_FILE, reports);

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

function generateTelemetryPacket() {
  const now = new Date();
  const packetId = "p_export_" + Math.random().toString(36).substring(2, 9);
  
  // Downstream device values matching the active device states with simulated scale mismatch
  const devStateList = devices.map(d => {
    // scale factor discrepancies when not aligned
    const currentScale = telemetryCalibrationAligned ? 1.0 : 10.0;
    const powerScale = telemetryCalibrationAligned ? 1.0 : 100.0;
    
    return {
      device_id: d.id,
      name: d.name,
      ip: d.ipAddress,
      status: d.status,
      soc: d.soc,
      soh: d.soh,
      voltage: d.voltage,
      current: parseFloat((d.current * currentScale).toFixed(1)), // raw vs scaled current
      power: parseFloat((d.power * powerScale).toFixed(2)), // raw watts vs scaled kW
      temperature: d.temperature,
      isOnline: d.isOnline,
      cellVoltages: d.cellVoltages
    };
  });

  const rawActivePower = devices.reduce((sum, d) => sum + (d.isOnline ? d.power : 0), 0);
  const powerMult = telemetryCalibrationAligned ? 1.0 : 100.0;

  const payload = {
    meta: {
      site_id: "SOLAR_STAR_3",
      ems_controller_ip: "10.0.0.3",
      controller_version: "v3.12.8-stable",
      timestamp_epoch: Math.floor(now.getTime() / 1000),
      ingest_channel: "production-live-us-west"
    },
    bms_summary: {
      total_active_power_kw: parseFloat((rawActivePower * powerMult).toFixed(2)),
      overall_isolation_status: "NOMINAL",
      active_faults_count: devices.filter(d => d.status === "Faulted").length
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
    responseStatus: "202 ACCEPTED",
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
      ingest_channel: "production-live-us-west"
    },
    bms_summary: {
      total_active_power_kw: telemetryCalibrationAligned ? -25.0 : -2500.0,
      overall_isolation_status: "NOMINAL",
      active_faults_count: 1
    },
    downstream_devices: [
      {
        device_id: "bess-01",
        name: "Substation Alpha-1 Core",
        ip: "192.168.1.101",
        status: "Charging",
        soc: 38.5,
        soh: 96.8,
        voltage: 482.4,
        current: telemetryCalibrationAligned ? 207.3 : 2073,
        power: telemetryCalibrationAligned ? 100.0 : 10000,
        temperature: 34.2,
        isOnline: true,
        cellVoltages: [3.21, 3.22, 3.21, 3.23, 3.22, 3.21, 3.22, 3.23, 3.21, 3.21, 3.22, 3.22, 3.21, 3.23, 3.22, 3.21]
      },
      {
        device_id: "bess-02",
        name: "Solar Array B Buffer",
        ip: "192.168.1.102",
        status: "Discharging",
        soc: 82.1,
        soh: 98.1,
        voltage: 812.5,
        current: telemetryCalibrationAligned ? -153.8 : -1538,
        power: telemetryCalibrationAligned ? -125.0 : -12500,
        temperature: 31.2,
        isOnline: true,
        cellVoltages: [3.31, 3.32, 3.31, 3.30, 3.31, 3.32, 3.32, 3.31, 3.31, 3.30, 3.31, 3.32, 3.31, 3.30, 3.32, 3.31]
      },
      {
        device_id: "bess-03",
        name: "Anode Storage Cluster C",
        ip: "192.168.1.103",
        status: "Faulted",
        soc: 18.4,
        soh: 89.2,
        voltage: 410.2,
        current: 0.0,
        power: 0.0,
        temperature: 42.5,
        isOnline: true,
        cellVoltages: [3.12, 3.12, 3.13, 3.35, 3.12, 3.12, 3.13, 3.12, 3.12, 3.13, 3.12, 3.12, 3.12, 3.34, 3.12, 3.12]
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

// SIMULATOR UPDATE INTERVAL (triggers every 3 seconds to keep real-time values fluctuating)
setInterval(() => {
  let changed = false;
  devices = devices.map((dev) => {
    if (!dev.isOnline) return dev;

    changed = true;
    let { soc, temperature, power, voltage, current } = dev;

    // SoC updates
    if (dev.status === "Charging") {
      // increase SoC
      // capacity is in kWh. Power is in kW.
      // 3 seconds tick is 3/3600 hour = 1/1200 hour.
      // kWh charged in 1 tick = power * (3 / 3600)
      const chargedKwh = power * (3 / 3600);
      const addedSoc = (chargedKwh / dev.capacityKwh) * 100;
      soc = Math.min(100, parseFloat((soc + addedSoc).toFixed(3)));

      // Temp rises based on power load
      temperature = parseFloat((temperature + 0.05 * (power / 100) + (Math.random() - 0.45) * 0.1).toFixed(2));
      
      // Voltage aligns with charge
      voltage = parseFloat((400 + (soc / 100) * 100 + (Math.random() - 0.5) * 0.5).toFixed(1));
      current = parseFloat((power * 1000 / voltage).toFixed(1));

      if (soc >= 100) {
        dev.status = "Idle";
        dev.power = 0;
        const logMsg: BessLog = {
          id: "log-" + Math.random().toString(36).substring(2, 9),
          deviceId: dev.id,
          deviceName: dev.name,
          timestamp: new Date().toISOString(),
          level: "INFO",
          message: `${dev.name} reached State of Charge threshold (100%). Switched to Idle mode.`,
          code: "CHARGE_COMPLETE_IDLE"
        };
        logs.unshift(logMsg);
        if (logs.length > 200) logs.pop();
        writeJSONFile(LOGS_FILE, logs);
      }
    } else if (dev.status === "Discharging") {
      // power is negative
      const dischargedKwh = Math.abs(power) * (3 / 3600);
      const subtractedSoc = (dischargedKwh / dev.capacityKwh) * 100;
      soc = Math.max(0, parseFloat((soc - subtractedSoc).toFixed(3)));

      // Temp rises based on heat load
      temperature = parseFloat((temperature + 0.07 * (Math.abs(power) / 100) + (Math.random() - 0.45) * 0.1).toFixed(2));
      
      // Voltage sags with discharge
      voltage = parseFloat((400 + (soc / 100) * 100 - 15 + (Math.random() - 0.5) * 0.5).toFixed(1));
      current = parseFloat((power * 1000 / voltage).toFixed(1));

      if (soc <= 0) {
        dev.status = "Idle";
        dev.power = 0;
        const logMsg: BessLog = {
          id: "log-" + Math.random().toString(36).substring(2, 9),
          deviceId: dev.id,
          deviceName: dev.name,
          timestamp: new Date().toISOString(),
          level: "INFO",
          message: `${dev.name} is fully depleted (SoC 0%). Switched to Idle mode.`,
          code: "DISCHARGE_DEPLETED_IDLE"
        };
        logs.unshift(logMsg);
        if (logs.length > 200) logs.pop();
        writeJSONFile(LOGS_FILE, logs);
      }
    } else if (dev.status === "Idle") {
      // passive cool back to ambient (23C)
      if (temperature > 23.5) {
        temperature = parseFloat((temperature - 0.08).toFixed(2));
      } else if (temperature < 22.5) {
        temperature = parseFloat((temperature + 0.05).toFixed(2));
      }
      voltage = parseFloat((400 + (soc / 100) * 100 + (Math.random() - 0.5) * 0.1).toFixed(1));
      current = 0;
      power = 0;
    } else if (dev.status === "Faulted") {
      // Critical overheat simulator BESS-03
      if (dev.id === "bess-03" && temperature > 42.0) {
        // slowly cooling down since power was terminated
        temperature = parseFloat((temperature - 0.25).toFixed(2));
      }
      power = 0;
      current = 0;
    }

    // Fluctuate cell voltages slightly for charging / discharging
    const updatedCellVoltages = dev.cellVoltages.map((cell, idx) => {
      // Keep variance higher on faulted Bess-03, otherwise balanced
      const baseCellVolts = dev.status === "Faulted" ? 3.12 : (voltage / 16 / 10); // nominal zoom
      const multiplier = dev.id === "bess-03" && (idx === 13 || idx === 3) ? 1.05 : 1.0;
      const noise = (Math.random() - 0.5) * 0.004;
      return parseFloat((baseCellVolts * multiplier + noise).toFixed(3));
    });

    return {
      ...dev,
      soc,
      temperature,
      power,
      voltage,
      current,
      cellVoltages: updatedCellVoltages,
      lastPing: new Date().toISOString()
    };
  });

  if (changed) {
    writeJSONFile(DEVICES_FILE, devices);
  }
  
  // Also push a live telemetry export packet from the controller
  if (typeof generateTelemetryPacket === "function") {
    generateTelemetryPacket();
  }
}, 3000);

// API: List BESS devices
app.get("/api/devices", (req, res) => {
  res.json(devices);
});

// API: Get BESS device
app.get("/api/devices/:id", (req, res) => {
  const dev = devices.find((d) => d.id === req.params.id);
  if (!dev) return res.status(404).json({ error: "Device not found" });
  res.json(dev);
});

// API: Add device manually
app.post("/api/devices", (req, res) => {
  const { name, ipAddress, port, model, capacityKwh } = req.body;
  if (!name || !ipAddress || !model || !capacityKwh) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const newDevice: BessDevice = {
    id: "bess-" + Math.random().toString(36).substring(2, 9),
    name,
    ipAddress,
    port: port || 502,
    model,
    status: "Idle",
    soc: 50.0,
    soh: 100.0,
    voltage: 450.0,
    current: 0.0,
    frequency: 60.00,
    temperature: 23.0,
    power: 0.0,
    capacityKwh: Number(capacityKwh),
    cycleCount: 0,
    lastPing: new Date().toISOString(),
    isOnline: true,
    firmwareVersion: "v1.0.0",
    lastError: null,
    cellVoltages: Array(16).fill(3.25)
  };

  devices.push(newDevice);
  writeJSONFile(DEVICES_FILE, devices);

  const newLog: BessLog = {
    id: "log-" + Math.random().toString(36).substring(2, 9),
    deviceId: newDevice.id,
    deviceName: newDevice.name,
    timestamp: new Date().toISOString(),
    level: "INFO",
    message: `New manual BESS added: ${name} [${ipAddress}:${newDevice.port}]`,
    code: "DEVICE_REGISTERED"
  };
  logs.unshift(newLog);
  writeJSONFile(LOGS_FILE, logs);

  recordCurl(newDevice, "status", "GET", "Fetch device initial status register", null, 200, JSON.stringify({ status: "Success", details: newDevice }));

  res.status(201).json(newDevice);
});

// API: Edit IP / Port / Name
app.put("/api/devices/:id", (req, res) => {
  const { name, ipAddress, port, model, capacityKwh, status, soh, cycleCount } = req.body;
  const idx = devices.findIndex((d) => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Device not found" });

  devices[idx] = {
    ...devices[idx],
    name: name || devices[idx].name,
    ipAddress: ipAddress || devices[idx].ipAddress,
    port: port ? Number(port) : devices[idx].port,
    model: model || devices[idx].model,
    capacityKwh: capacityKwh ? Number(capacityKwh) : devices[idx].capacityKwh,
    status: status || devices[idx].status,
    soh: soh ? Number(soh) : devices[idx].soh,
    cycleCount: cycleCount ? Number(cycleCount) : devices[idx].cycleCount,
  };

  writeJSONFile(DEVICES_FILE, devices);
  res.json(devices[idx]);
});

// API: Delete device
app.delete("/api/devices/:id", (req, res) => {
  const index = devices.findIndex((d) => d.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Device not found" });

  const deleted = devices[index];
  devices.splice(index, 1);
  writeJSONFile(DEVICES_FILE, devices);

  const logMsg: BessLog = {
    id: "log-" + Math.random().toString(36).substring(2, 9),
    deviceId: deleted.id,
    deviceName: deleted.name,
    timestamp: new Date().toISOString(),
    level: "INFO",
    message: `BESS connection removed: ${deleted.name} (${deleted.ipAddress})`,
    code: "DEVICE_REMOVED"
  };
  logs.unshift(logMsg);
  writeJSONFile(LOGS_FILE, logs);

  res.json({ success: true, id: req.params.id });
});

// API: Device controller command routing
app.post("/api/devices/:id/control", (req, res) => {
  const dev = devices.find((d) => d.id === req.params.id);
  if (!dev) return res.status(404).json({ error: "Device not found" });

  const { command, value } = req.body; // value can be kW target, etc.
  if (!command) return res.status(400).json({ error: "Missing command parameter" });

  let responsePayload = { status: "success", detail: "" };

  if (command === "charge") {
    const rate = Math.min(250, Number(value || 100)); // Charge rate up to 250kW
    dev.status = "Charging";
    dev.power = rate;
    responsePayload.detail = `Grid charging set to target rate of ${rate} kW.`;
    
    const newLog: BessLog = {
      id: "log-" + Math.random().toString(36).substring(2, 9),
      deviceId: dev.id,
      deviceName: dev.name,
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: `Direct Charge Target instruction sent to ${dev.name}: ${rate} kW`,
      code: "CMD_CHARGE_SET_KW"
    };
    logs.unshift(newLog);
    
    recordCurl(dev, "write-register?reg=40012&val=" + rate, "POST", "Set charging power limit in coils", { active_power_limit: rate }, 200, JSON.stringify(responsePayload));
  } else if (command === "discharge") {
    const rate = Math.min(250, Number(value || 100)); // Discharge rate up to 250kW
    dev.status = "Discharging";
    dev.power = -rate;
    responsePayload.detail = `Grid discharge rate set to target of -${rate} kW.`;

    const newLog: BessLog = {
      id: "log-" + Math.random().toString(36).substring(2, 9),
      deviceId: dev.id,
      deviceName: dev.name,
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: `Direct Discharge Target instruction sent to ${dev.name}: -${rate} kW`,
      code: "CMD_DISCHARGE_SET_KW"
    };
    logs.unshift(newLog);

    recordCurl(dev, "write-register?reg=40013&val=" + rate, "POST", "Set discharging power limit in coils", { discharge_power_limit: rate }, 200, JSON.stringify(responsePayload));
  } else if (command === "idle") {
    dev.status = "Idle";
    dev.power = 0;
    dev.current = 0;
    responsePayload.detail = "BESS set to passive idle buffer state.";

    const newLog: BessLog = {
      id: "log-" + Math.random().toString(36).substring(2, 9),
      deviceId: dev.id,
      deviceName: dev.name,
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: `Passive mode command received. Disabling contacts on ${dev.name}.`,
      code: "CMD_SET_IDLE"
    };
    logs.unshift(newLog);

    recordCurl(dev, "write-register?reg=40001&val=0", "POST", "Clear inverter enable coils", { enable: 0 }, 200, JSON.stringify(responsePayload));
  } else if (command === "reset_fault") {
    if (dev.status === "Faulted") {
      dev.status = "Idle";
      dev.lastError = null;
      dev.temperature = 28.5; // clear temperature trip
      responsePayload.detail = "Interlock bypassed and battery relay faults cleared.";

      const newLog: BessLog = {
        id: "log-" + Math.random().toString(36).substring(2, 9),
        deviceId: dev.id,
        deviceName: dev.name,
        timestamp: new Date().toISOString(),
        level: "INFO",
        message: `Remote fault reset request cleared battery latching relays on ${dev.name}.`,
        code: "CMD_RESET_FAULT"
      };
      logs.unshift(newLog);

      recordCurl(dev, "write-register?reg=40002&val=1", "POST", "Latch electronic safety reset coils", { reset_faults: 1 }, 200, JSON.stringify(responsePayload));
    } else {
      return res.status(400).json({ error: "Device is not currently in Faulted state." });
    }
  } else if (command === "shutdown") {
    dev.status = "Maintenance";
    dev.power = 0;
    dev.current = 0;
    responsePayload.detail = "Contactors open. System secured for hot maintenance check.";

    const newLog: BessLog = {
      id: "log-" + Math.random().toString(36).substring(2, 9),
      deviceId: dev.id,
      deviceName: dev.name,
      timestamp: new Date().toISOString(),
      level: "CRITICAL",
      message: `Emergency Remote Command: Secured and disabled entire dc bank for maintenance on ${dev.name}.`,
      code: "CMD_EMERGENCY_SHUTDOWN"
    };
    logs.unshift(newLog);

    recordCurl(dev, "write-register?reg=40009&val=1", "POST", "Emergency Trip coil override", { trip_contactor: 1 }, 200, JSON.stringify(responsePayload));
  } else {
    return res.status(400).json({ error: "Command not recognized." });
  }

  writeJSONFile(DEVICES_FILE, devices);
  writeJSONFile(LOGS_FILE, logs);

  res.json({ success: true, updatedDevice: dev, detail: responsePayload.detail });
});

// API: Simulate LAN Scanner finding devices on subnet
app.post("/api/scan", (req, res) => {
  // Let's search standard solar substation blocks and return a dynamic discovery alert
  const scanResults = [
    {
      ipAddress: "192.168.1.115",
      port: 502,
      model: "Greenergy BESS-Mega 1000",
      pingMs: 14,
      isRegistered: devices.some(d => d.ipAddress === "192.168.1.115"),
      suggestedName: "Substation Block-C Buffer"
    },
    {
      ipAddress: "192.168.1.120",
      port: 502,
      model: "Tesla Megapack XL",
      isRegistered: devices.some(d => d.ipAddress === "192.168.1.120"),
      pingMs: 22,
      suggestedName: "Feeder 4 Load Leveler"
    }
  ];

  setTimeout(() => {
    res.json({
      timestamp: new Date().toISOString(),
      scannedRange: "192.168.1.1/24",
      activeDevicesFound: scanResults
    });
  }, 1200); // Simulate network round-trip ping latency
});

// API: Fetch curl logs to verify console bindings
app.get("/api/curllogs", (req, res) => {
  res.json(curlLogs);
});

// API: Get intercepted cloud telemetry packets
app.get("/api/cloud-telemetry/packets", (req, res) => {
  res.json({
    packets: cloudTelemetryPackets,
    calibrationAligned: telemetryCalibrationAligned
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

// API: Fetch error logs
app.get("/api/logs", (req, res) => {
  res.json(logs);
});

// API: Clear Logs
app.delete("/api/logs", (req, res) => {
  logs = [];
  writeJSONFile(LOGS_FILE, logs);
  res.json({ success: true });
});

// GET: active reporting configs
app.get("/api/reports", (req, res) => {
  res.json(reports);
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
  writeJSONFile(REPORTS_FILE, reports);
  res.status(201).json(newReport);
});

// DELETE report schedule
app.delete("/api/reports/:id", (req, res) => {
  reports = reports.filter(r => r.id !== req.params.id);
  writeJSONFile(REPORTS_FILE, reports);
  res.json({ success: true });
});

// POST: Dynamic Instant Report Export & Download (Generates actual file output!)
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


// Production route serving SPA build
if (process.env.NODE_ENV !== "production") {
  const startVite = async () => {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  };
  startVite();
} else {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
