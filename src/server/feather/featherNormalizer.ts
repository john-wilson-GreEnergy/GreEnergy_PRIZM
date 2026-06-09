import { FeatherNormalizedStatus } from "./featherTypes";

/**
 * Normalizes a raw JSON response (from a direct Feather /feather/status/report.json endpoint)
 * into a structured FeatherNormalizedStatus record.
 */
export function normalizeFeatherStatus(
  deviceIp: string,
  reachable: boolean,
  durationMs: number,
  rawJson: any,
  lastError: string | null,
  activeProfileId: string,
  activeProfileName: string,
  activeEmsBaseUrl: string,
  sourceDiscoveryMethod: "string-ip-map" | "ip-map" | "blockviewer" | "manual",
  candidateInfo?: {
    arrayIndex?: number | null;
    stringIndex?: number | null;
    entityName?: string | null;
    entityKeyToken?: string | null;
  }
): FeatherNormalizedStatus {
  const lastSuccessAt = reachable ? new Date().toISOString() : null;
  const lastFailureAt = reachable ? null : new Date().toISOString();

  // Initialize with standard unreachable baseline
  const baseline: FeatherNormalizedStatus = {
    deviceIp,
    reachable,
    responseDurationMs: durationMs,
    lastSuccessAt,
    lastFailureAt,
    lastError,
    activeProfileId,
    activeProfileName,
    activeEmsBaseUrl,
    sourceDiscoveryMethod,
    arrayIndex: candidateInfo?.arrayIndex ?? null,
    stringIndex: candidateInfo?.stringIndex ?? null,
    entityName: candidateInfo?.entityName ?? null,
    entityKeyToken: candidateInfo?.entityKeyToken ?? null,

    firmwareVersion: null,
    deviceType: "Feather",
    operationalState: reachable ? "NORMAL" : "OFFLINE",
    warningCount: 0,
    alarmCount: 0,
    activeWarnings: [],
    activeAlarms: [],

    fssValid: null,
    leakAlarm: null,
    louverOpen: null,

    doorsValid: null,
    batteryDoorsClosed: null,
    lowerTopcapClosed: null,
    dcDoorsClosed: null,
    acDoorsClosed: null,

    spaceTemperature: null,
    avgCellTemperature: null,
    supplyAirTemp: null,
    coolingSetpoint: null,
    heatingSetpoint: null,

    mioValid: null,
    thermostatStage: null,
    hvacCurrent1: null,
    fanLowOn1: null,
    fanHighOn1: null,
    YCompressorOn1: null,
    freezeDetected1: null,
    hvacCurrent2: null,
    fanLowOn2: null,
    fanHighOn2: null,
    YCompressorOn2: null,
    freezeDetected2: null,
    hydrogen1PPM: null,

    lostComms: null,
    rawResponse: rawJson ?? null,
  };

  if (!reachable || !rawJson) {
    // If the diagnostic host octet maps to special hardware types, apply appropriate defaults even when offline
    applyHardcodedHardwareOverrides(deviceIp, baseline);
    return baseline;
  }

  try {
    // 1. Extract firmware version
    let fwMaj = rawJson.turtleVersion?.fwVersionMajor;
    let fwMin = rawJson.turtleVersion?.fwVersionMinor;
    let fwRev = rawJson.turtleVersion?.fwVersionRevision;

    if (fwMaj === undefined && rawJson.fromFeatherControllerStatistcsReport) {
      fwMaj = rawJson.fromFeatherControllerStatistcsReport.fwVersionMajor;
      fwMin = rawJson.fromFeatherControllerStatistcsReport.fwVersionMinor;
      fwRev = rawJson.fromFeatherControllerStatistcsReport.fwVersionRevision;
    }

    if (fwMaj !== undefined) {
      baseline.firmwareVersion = `${fwMaj}.${fwMin ?? 0}.${fwRev ?? 0}`;
    } else {
      baseline.firmwareVersion = rawJson.firmwareVersion ?? null;
    }

    // Determine device type
    if (rawJson.deviceType) {
      baseline.deviceType = rawJson.deviceType;
    }

    // 2. Extract operational state
    baseline.operationalState = rawJson.operationalState ?? "NORMAL";

    // 3. Thermal Data
    const thermal = rawJson.thermalData ?? {};
    baseline.spaceTemperature = thermal.spaceTemperature ?? thermal.spaceTemp ?? null;
    baseline.avgCellTemperature = thermal.avgCellTemperature ?? thermal.avgCellTemp ?? null;
    baseline.supplyAirTemp = thermal.supplyAirTemp ?? null;
    baseline.coolingSetpoint = thermal.coolingSetpoint ?? null;
    baseline.heatingSetpoint = thermal.heatingSetpoint ?? null;
    baseline.hydrogen1PPM = thermal.hydrogen1PPM ?? null;
    baseline.thermostatStage = thermal.thermostatStage ?? null;

    // 4. FSS / Leak / Louver Signals
    const fss = rawJson.fssSignals ?? {};
    baseline.fssValid = fss.valid ?? null;
    baseline.leakAlarm = fss.leakAlarm ?? null;
    baseline.louverOpen = fss.louverOpen ?? null;

    // 5. Doors Signals
    const doors = rawJson.doors ?? {};
    baseline.doorsValid = doors.valid ?? null;
    baseline.batteryDoorsClosed = doors.batteryDoorsClosed ?? null;
    baseline.lowerTopcapClosed = doors.lowerTopcapClosed ?? doors.lowerTopCapClosed ?? null;
    baseline.dcDoorsClosed = doors.dcDoorsClosed ?? null;
    baseline.acDoorsClosed = doors.acDoorsClosed ?? null;

    // 6. HVAC 1 & 2 controls mapping
    const hvac1Controls = thermal.HVAC1Controls ?? {};
    const hvac1Data = thermal.HVAC1Data ?? {};
    baseline.mioValid = hvac1Controls.valid ?? null;
    baseline.hvacCurrent1 = hvac1Data.hvacCurrent ?? null;
    baseline.fanLowOn1 = hvac1Controls.fanLowOn ?? null;
    baseline.fanHighOn1 = hvac1Controls.fanHighOn ?? null;
    baseline.YCompressorOn1 = hvac1Controls.YCompressorOn ?? null;
    baseline.freezeDetected1 = hvac1Data.FreezeDetected ?? null;

    const hvac2Controls = thermal.HVAC2Controls ?? {};
    const hvac2Data = thermal.HVAC2Data ?? {};
    baseline.hvacCurrent2 = hvac2Data.hvacCurrent ?? null;
    baseline.fanLowOn2 = hvac2Controls.fanLowOn ?? null;
    baseline.fanHighOn2 = hvac2Controls.fanHighOn ?? null;
    baseline.YCompressorOn2 = hvac2Controls.YCompressorOn ?? null;
    baseline.freezeDetected2 = hvac2Data.FreezeDetected ?? null;

    // 7. Lost Comms
    let lost = rawJson.devicesWithLostComms ?? rawJson.deviceWithLostComms ?? null;
    if (Array.isArray(lost)) {
      baseline.lostComms = lost.join(", ");
    } else if (lost !== null && typeof lost === "object") {
      baseline.lostComms = JSON.stringify(lost);
    } else {
      baseline.lostComms = lost ? String(lost) : null;
    }

    // 8. Warnings / Alarms evaluation
    const warnings: string[] = [];
    const alarms: string[] = [];

    // Evaluate basic alarm signals
    if (baseline.leakAlarm === true) {
      alarms.push("Liquid Leak Alarm Detected");
    }
    if (baseline.freezeDetected1 === true) {
      warnings.push("HVAC 1 Freeze Protected Loop Triggered");
    }
    if (baseline.freezeDetected2 === true) {
      warnings.push("HVAC 2 Freeze Protected Loop Triggered");
    }
    if (baseline.lostComms && baseline.lostComms !== "none") {
      warnings.push(`Lost Comms with: ${baseline.lostComms}`);
    }
    if (baseline.hydrogen1PPM && baseline.hydrogen1PPM > 50) {
      alarms.push(`Hydrogen gas buildup detected: ${baseline.hydrogen1PPM} PPM`);
    }

    if (baseline.doorsValid === true) {
      if (baseline.batteryDoorsClosed === false) alarms.push("Battery Enclosure Door Open");
      if (baseline.lowerTopcapClosed === false) alarms.push("Lower Topcap Panel Open");
      if (baseline.dcDoorsClosed === false) alarms.push("DC Cabinet Door Open");
      if (baseline.acDoorsClosed === false) alarms.push("AC Cabinet Door Open");
    }

    baseline.activeWarnings = warnings;
    baseline.activeAlarms = alarms;
    baseline.warningCount = warnings.length;
    baseline.alarmCount = alarms.length;

    // Apply special hardware override masks (e.g. .3 hosts don't have CellT, battDoor, louverOpen)
    applyHardcodedHardwareOverrides(deviceIp, baseline);

  } catch (error) {
    console.error(`Error normalizing raw json for ${deviceIp}:`, error);
    baseline.lastError = `Normalization Error: ${error instanceof Error ? error.message : String(error)}`;
  }

  return baseline;
}

/**
 * Replicates the precise ignore-rules from new_feather_comms.sh and new_mio_test.sh
 */
function applyHardcodedHardwareOverrides(deviceIp: string, status: FeatherNormalizedStatus) {
  const parts = deviceIp.split(".");
  const lastOctet = parseInt(parts[parts.length - 1], 10);

  if (isNaN(lastOctet)) return;

  // 1. .3 hosts are direct Array controllers (no cells, no louver, no battery door)
  if (lastOctet === 3) {
    status.avgCellTemperature = null;
    status.louverOpen = null;
    status.batteryDoorsClosed = null;
  }

  // 2. Only actual 10, 15, ..., 105 hosts are strings; other hosts don't report dcDoor and acDoor (or vice versa, don't penalize them as n/a)
  const isStringHost = lastOctet >= 10 && lastOctet <= 105 && lastOctet % 5 === 0;
  if (!isStringHost) {
    status.dcDoorsClosed = null;
    status.acDoorsClosed = null;
  }
}
