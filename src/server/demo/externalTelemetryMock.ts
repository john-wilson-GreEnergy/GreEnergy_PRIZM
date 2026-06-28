import { Router } from "express";

export interface ExternalTelemetryPacket {
  id: string;
  timestamp: string;
  sourceIp: string;
  sourceComponent: string;
  destinationExternalEndpoint: string;
  transmissionProtocol: string;
  rawPayloadSize: string;
  responseStatus: string;
  payload: any;
}

export let externalTelemetryPackets: ExternalTelemetryPacket[] = [];
export let telemetryCalibrationAligned = false;
export let localWanOutageActive = false;
export let softBalancingOverride = false;
export let systemWideIsolationTriggered = false;

export function setTelemetryCalibrationAligned(val: boolean) {
  telemetryCalibrationAligned = val;
}

export function setLocalWanOutageActive(val: boolean) {
  localWanOutageActive = val;
}

export function setSoftBalancingOverride(val: boolean) {
  softBalancingOverride = val;
}

export function setSystemWideIsolationTriggered(val: boolean) {
  systemWideIsolationTriggered = val;
}

// Global cached block fetch (can be passed dynamically from server or imported)
let getEmsCachedBlock: () => any = () => ({});
export function setBlockFetcher(fetcher: () => any) {
  getEmsCachedBlock = fetcher;
}

export function generateTelemetryPacket() {
  const now = new Date();
  const packetId = "p_export_" + Math.random().toString(36).substring(2, 9);
  
  // Imbalance simulation for Array 3 String 1 (Cell 13/14)
  const cell14Voltage = softBalancingOverride ? 3240 : 3510;
  const cell13Voltage = softBalancingOverride ? 3230 : 3080;
  const cell14Temp = softBalancingOverride ? 28.5 : 55.0;
  const string3Status = systemWideIsolationTriggered ? "ISOLATED" : (softBalancingOverride ? "ONLINE" : "FAULTED");
  const string3Contactor = systemWideIsolationTriggered ? "OPEN" : (softBalancingOverride ? "CLOSED" : "OPEN");

  const powerScale = telemetryCalibrationAligned ? 1.0 : 100.0;
  const currentScale = telemetryCalibrationAligned ? 1.0 : 10.0;

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
      wan_tunnel_connection: localWanOutageActive ? "DISCONNECTED" : "ESTABLISHED",
      wan_sync_state: localWanOutageActive ? "FALLBACK_LOCAL_STORE" : "SYNCHRONIZED"
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

  const pct: ExternalTelemetryPacket = {
    id: packetId,
    timestamp: now.toISOString(),
    sourceIp: "10.0.0.3",
    sourceComponent: "Primary EMS Controller",
    destinationExternalEndpoint: "https://bess-external-ingest.greenergycare.com/bess/v2/ingest",
    transmissionProtocol: "HTTPS POST",
    rawPayloadSize: `${(JSON.stringify(payload).length / 1024).toFixed(2)} KB`,
    responseStatus: localWanOutageActive ? "503 GATEWAY TIMEOUT (Internet Down)" : "202 ACCEPTED",
    payload
  };

  externalTelemetryPackets.unshift(pct);
  if (externalTelemetryPackets.length > 50) {
    externalTelemetryPackets.pop();
  }
}

// Generate starting historical logs
export function populateInitialHistory() {
  externalTelemetryPackets = [];
  for (let i = 15; i >= 0; i--) {
    const now = new Date(Date.now() - i * 60000);
    const packetId = "p_export_hist_" + Math.random().toString(36).substring(2, 9);
    
    const payload = {
      meta: {
        site_id: "SOLAR_STAR_3",
        ems_controller_ip: "10.0.0.3",
        controller_version: "v3.12.8-stable",
        timestamp_epoch: Math.floor(now.getTime() / 1000),
        ingest_channel: "production-live-us-west",
        wan_tunnel_connection: "ESTABLISHED",
        wan_sync_state: "SYNCHRONIZED"
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

    externalTelemetryPackets.push({
      id: packetId,
      timestamp: now.toISOString(),
      sourceIp: "10.0.0.3",
      sourceComponent: "Primary EMS Controller",
      destinationExternalEndpoint: "https://bess-external-ingest.greenergycare.com/bess/v2/ingest",
      transmissionProtocol: "HTTPS POST",
      rawPayloadSize: `${(JSON.stringify(payload).length / 1024).toFixed(2)} KB`,
      responseStatus: "202 ACCEPTED",
      payload
    });
  }
}

// Instantiate router
export const externalTelemetryRouter = Router();

externalTelemetryRouter.get("/packets", (req, res) => {
  res.json({
    packets: externalTelemetryPackets,
    calibrationAligned: telemetryCalibrationAligned,
    localWanOutageActive,
    softBalancingOverride,
    systemWideIsolationTriggered
  });
});

externalTelemetryRouter.post("/outage", (req, res) => {
  const { active } = req.body;
  localWanOutageActive = !!active;
  generateTelemetryPacket();
  
  const logMsg = {
    id: "log-" + Math.random().toString(36).substring(2, 9),
    deviceId: "ems-controller",
    deviceName: "Primary EMS Controller",
    timestamp: new Date().toISOString(),
    level: localWanOutageActive ? "WARNING" : "INFO",
    message: localWanOutageActive 
      ? "WAN Local Internet Link Dropped. Diverting telemetry packets to offline backup storage queue."
      : "WAN Internet interface restored. Synchronizing packet buffers with EMS ingestion servers.",
    code: localWanOutageActive ? "WAN_CONNECTION_LOST" : "WAN_CONNECTION_RESTORED"
  };

  res.json({
    success: true,
    localWanOutageActive,
    externalTelemetryPacket: externalTelemetryPackets[0],
    log: logMsg
  });
});

externalTelemetryRouter.post("/override-balancing", (req, res) => {
  const { active } = req.body;
  softBalancingOverride = !!active;
  generateTelemetryPacket();

  res.json({
    success: true,
    softBalancingOverride,
    externalTelemetryPacket: externalTelemetryPackets[0]
  });
});

externalTelemetryRouter.post("/cutoff", (req, res) => {
  const { active } = req.body;
  systemWideIsolationTriggered = !!active;
  generateTelemetryPacket();

  res.json({
    success: true,
    systemWideIsolationTriggered,
    externalTelemetryPacket: externalTelemetryPackets[0]
  });
});

externalTelemetryRouter.get("/query", (req, res) => {
  const { array } = req.query;
  const arrNum = Number(array);
  
  if (arrNum) {
    const devices = (externalTelemetryPackets[0]?.payload?.downstream_devices || [])
      .filter((d: any) => d.ip.startsWith(`10.0.${arrNum}.`));
    return res.json({ devices });
  }

  res.json({ devices: externalTelemetryPackets[0]?.payload?.downstream_devices || [] });
});

externalTelemetryRouter.post("/align", (req, res) => {
  const { active } = req.body;
  telemetryCalibrationAligned = !!active;
  generateTelemetryPacket();
  res.json({
    success: true,
    calibrationAligned: telemetryCalibrationAligned
  });
});

// Force export packet
externalTelemetryRouter.post("/trigger-export", (req, res) => {
  generateTelemetryPacket();
  res.json({
    success: true,
    message: "Triggered standard telemetry payload export!",
    latestPacket: externalTelemetryPackets[0]
  });
});
