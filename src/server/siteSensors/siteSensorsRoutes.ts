import express, { Router } from "express";
import { getEmsCachedBlock } from "../emsTurtleClient";

const router = Router();

export interface SensorStatus {
  state: "normal" | "tripped" | "fault" | "open" | "closed" | "communicating" | "notCommunicating" | "unknown" | "na";
  healthy: boolean | null;
  label: string;
  value?: any;
  sourcePath?: string;
}

export interface SiteSensorRow {
  id: string;
  stationCode?: string;
  blockIndex?: number;
  arrayIndex?: number;
  lineupIndex?: number;
  segmentIndex?: number;
  segmentPosition?: string;
  stringIndex?: number;
  deviceIp?: string;
  displayLabel: string;
  health: "healthy" | "warning" | "fault" | "unknown" | "na";
  sensors: {
    fire?: SensorStatus;
    fireTrouble?: SensorStatus;
    smoke?: SensorStatus;
    heat?: SensorStatus;
    hydrogen?: SensorStatus;
    hydrogenFault?: SensorStatus;
    dataCommunications?: SensorStatus;
    ioCommunications?: SensorStatus;
    acDoors?: SensorStatus;
    dcDoors?: SensorStatus;
    topCapDoor?: SensorStatus;
    batteryDoors?: SensorStatus;
    manualVentilation?: SensorStatus;
    envCtrl?: SensorStatus;
    upsAlarm?: SensorStatus;
    moisture?: SensorStatus;
    modbusEStop?: SensorStatus;
  };
  sourcePath: string;
  lastUpdated?: string;
  raw?: any;
}

export interface SensorCategoryRollup {
  id: string;
  label: string;
  healthyCount: number;
  unhealthyCount: number;
  unknownCount: number;
  totalCount: number;
  healthyLabel: string;
  unhealthyLabel: string;
}

export interface SiteSensorSummaryResponse {
  success: true;
  timestamp: string;
  source: "ems" | "stackos" | "blockviewer" | "strings" | "hybrid";
  categories: SensorCategoryRollup[];
  rows: SiteSensorRow[];
  sourceHealth: any[];
}

// Persisted overrides in this module
let siteSensorOverrides: Record<string, Record<string, any>> = {};

function buildStatus(stateVal: any, category: string, rSourcePath: string): SensorStatus {
  if (stateVal === undefined || stateVal === null || stateVal === "" || stateVal === "N/A" || stateVal === "na") {
    return {
      state: "na",
      healthy: null,
      label: "N/A",
      value: "na",
      sourcePath: rSourcePath
    };
  }

  const valStr = String(stateVal).trim();
  const lVal = valStr.toLowerCase();

  if (lVal === "unknown" || lVal === "stale") {
    return {
      state: "unknown",
      healthy: null,
      label: "Unknown",
      value: valStr,
      sourcePath: rSourcePath
    };
  }

  let state: SensorStatus["state"] = "normal";
  let healthy: boolean | null = true;
  let label = "Normal";

  if (["fire", "fireTrouble", "smoke", "heat", "hydrogen", "hydrogenFault", "moisture", "modbusEStop"].includes(category)) {
    // Alarm/trip true = fault. Alarm/trip false = healthy.
    const isFault = (lVal === "true" || lVal === "active" || lVal === "tripped" || lVal === "alarm" || lVal === "fault" || lVal === "error" || lVal === "trouble" || lVal === "detected" || lVal === "1" || lVal === "warning" || lVal === "critical" || lVal === "wet" || lVal === "open" || lVal === "leak" || lVal === "failed");
    const isHealthy = (lVal === "false" || lVal === "clear" || lVal === "normal" || lVal === "untripped" || lVal === "ok" || lVal === "0" || lVal === "dry" || lVal === "closed" || lVal === "healthy" || lVal === "inactive");

    if (isFault) {
      healthy = false;
      state = "tripped";
    } else if (isHealthy) {
      healthy = true;
      state = "normal";
    } else {
      healthy = null;
      state = "unknown";
    }

    if (category === "moisture") {
      label = state === "normal" ? "Dry" : (state === "unknown" ? "Unknown" : "Wet");
    } else if (category === "heat" || category === "hydrogen") {
      label = state === "normal" ? "Normal" : (lVal === "warning" || lVal === "warn" ? "Warning" : "Alarm");
    } else {
      label = state === "normal" ? "Untripped" : "Tripped";
    }
  } else if (["acDoors", "dcDoors", "topCapDoor", "batteryDoors"].includes(category)) {
    // Door closed true = healthy. Door closed false = fault.
    const isClosed = (lVal === "true" || lVal === "closed" || lVal === "all closed" || lVal === "1" || lVal === "healthy" || lVal === "ok");
    const isOpen = (lVal === "false" || lVal === "open" || lVal === "0" || lVal === "active" || lVal === "unlocked");

    if (isClosed) {
      healthy = true;
      state = "closed";
      label = "Closed";
    } else if (isOpen) {
      healthy = false;
      state = "open";
      label = "Open";
    } else {
      healthy = null;
      state = "unknown";
      label = "Unknown";
    }
  } else if (["dataCommunications", "ioCommunications"].includes(category)) {
    // Communicating true = healthy. Communicating false = fault.
    const isCommunicating = (lVal === "true" || lVal === "communicating" || lVal === "online" || lVal === "stable" || lVal === "ok" || lVal === "1" || lVal === "healthy");
    const isNotCommunicating = (lVal === "false" || lVal === "offline" || lVal === "error" || lVal === "lost" || lVal === "failed" || lVal === "0" || lVal === "warning" || lVal === "trouble" || lVal === "fault" || lVal === "not communicating" || lVal === "notcommunicating" || lVal === "no_comm");

    if (isCommunicating) {
      healthy = true;
      state = "communicating";
      label = "Communicating";
    } else if (isNotCommunicating) {
      healthy = false;
      state = "notCommunicating";
      label = "Faulted";
    } else {
      healthy = null;
      state = "unknown";
      label = "Unknown";
    }
  } else if (["manualVentilation"].includes(category)) {
    const isActive = (lVal === "true" || lVal === "active" || lVal === "running" || lVal === "1" || lVal === "active");
    state = isActive ? "tripped" : "normal";
    healthy = true;
    label = isActive ? "Active" : "Inactive";
  } else if (["envCtrl", "upsAlarm"].includes(category)) {
    const isHealthy = (lVal === "normal" || lVal === "healthy" || lVal === "ok" || lVal === "false" || lVal === "clear" || lVal === "0" || lVal === "inactive");
    const isAlarm = (lVal === "true" || lVal === "alarm" || lVal === "fault" || lVal === "error" || lVal === "failed" || lVal === "onbattery" || lVal === "on battery" || lVal === "active" || lVal === "1");

    if (isHealthy) {
      healthy = true;
      state = "normal";
      label = "Normal";
    } else if (isAlarm) {
      healthy = false;
      state = "fault";
      label = "Alarm";
    } else {
      healthy = null;
      state = "unknown";
      label = "Unknown";
    }
  }

  return {
    state,
    healthy,
    label,
    value: valStr,
    sourcePath: rSourcePath
  };
}

export function buildSiteSensorSummary(): SiteSensorSummaryResponse {
  const blockWrapper: any = getEmsCachedBlock() || {};
  
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
        acDoors: "Open",
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
        ioCommunications: "ERROR",
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

  const rows = combinedRows.map((row: any) => {
    const rawMap = { ...row.rawSensors };
    
    // Apply server-persisted overrides
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

    // We must return the exact expected label (uppercase for key names, standard for labels as required)
    // Actually, "curl -sS ... | jq '.categories[].label'" expected labels:
    // FIRE, FIRE TROUBLE, SMOKE, HEAT, HYDROGEN, HYDROGEN FAULT, DATA COMMUNICATIONS, IO COMMUNICATIONS,
    // AC DOORS, DC DOORS, TOP CAP DOOR, BATTERY DOORS, MANUAL VENTILATION, ENV CTRL, UPS ALARM, MOISTURE, STATION-WIDE
    return {
      id: cat.id,
      label: cat.label, // This is already in UPPERCASE (e.g. FIRE, FIRE TROUBLE, SMOKE, etc.)
      healthyCount,
      unhealthyCount,
      unknownCount,
      totalCount,
      healthyLabel: cat.healthyLabel,
      unhealthyLabel: cat.unhealthyLabel
    };
  });

  return {
    success: true,
    timestamp: new Date().toISOString(),
    source: "ems",
    categories: categoriesRollupList,
    rows: rows,
    sourceHealth: [
      { endpoint: "/tools/monitor/ems/blockviewer/data", status: "ONLINE", latencyMs: 42 }
    ]
  };
}

// GET /api/local/site-sensors/summary
router.get("/summary", (req, res) => {
  const summary = buildSiteSensorSummary();
  res.json(summary);
});

// POST /api/local/site-sensors/override
router.post("/override", express.json(), (req, res) => {
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

// POST /api/local/site-sensors/reset
router.post("/reset", (req, res) => {
  siteSensorOverrides = {};
  res.json({ success: true });
});

export default router;
