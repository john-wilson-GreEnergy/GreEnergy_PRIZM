import { EmsProfile } from "../profiles/profileTypes";
import { NormalizedSensorCell } from "./siteSensorsRoutes";
import { ResolvedSensorDisplay, getSensorCapability, SensorCapability, SensorDisplayState } from "./sensorCapabilityMatrix";

export function resolveSensorDisplayStatus(params: {
  rawCell: NormalizedSensorCell;
  sensorKey: string;
  enclosureType: "CS" | "ES" | "UNKNOWN";
  activeProfile: EmsProfile | null;
}): ResolvedSensorDisplay {
  const { rawCell, sensorKey, enclosureType, activeProfile } = params;

  // 1. Determine if telemetry is present and what raw value it contains
  const displayVal = rawCell.displayValue || "";
  const isMissing = !rawCell.applicable || 
                    rawCell.tripped === null || 
                    ["offline", "disabled", "not ready", "unavailable"].includes(displayVal.toLowerCase()) ||
                    rawCell.status === "Offline" ||
                    rawCell.status === "Disabled";

  const isTripped = rawCell.tripped === true || 
                    (typeof rawCell.value === "string" && ["true", "active", "tripped", "alarm", "alarmed", "fault", "faulted", "open"].includes(rawCell.value.toLowerCase().trim())) ||
                    displayVal.toUpperCase() === "TRIPPED";

  const isNormal = !isMissing && !isTripped;

  // 2. Resolve capability
  const { capability, reason: capabilityReason } = getSensorCapability(
    sensorKey,
    enclosureType,
    activeProfile,
    !isMissing
  );

  // 3. Setup default display values
  let label = rawCell.friendlyName || rawCell.label || sensorKey;
  let rawState: string | null = null;
  if (isMissing) {
    rawState = "UNAVAILABLE";
  } else if (isTripped) {
    rawState = "TRIPPED";
  } else {
    rawState = "NORMAL";
  }

  let displayState: SensorDisplayState = "unknown";
  let shouldDisplay = true;
  let badgeTone: "green" | "yellow" | "red" | "gray" | "blue" = "gray";
  let reason = "";

  // Helper to determine active state for expected/optional sensors
  const getActiveStateForSensor = (key: string): SensorDisplayState => {
    const k = key.toLowerCase();
    if (k.includes("door")) return "open";
    if (k.includes("fire") || k.includes("smoke")) return "alarm";
    if (k.includes("leak") || k.includes("moisture") || k.includes("hydrogen")) return "fault";
    return "fault";
  };

  // 4. Resolve capability & telemetry status matrix
  if (capability === "unsupported") {
    if (isTripped) {
      shouldDisplay = true;
      displayState = "unexpected-active-signal";
      badgeTone = "red";
      reason = "Unexpected active signal on unsupported sensor channel; check site profile or EMS mapping.";
    } else {
      shouldDisplay = false;
      displayState = "not-applicable";
      badgeTone = "gray";
      reason = "Sensor not configured for this enclosure type; EMS normal appears to be default telemetry.";
    }
  } else if (capability === "expected") {
    if (isMissing) {
      shouldDisplay = true;
      displayState = "unavailable";
      badgeTone = "yellow";
      reason = `Sensor is expected but telemetry is currently unavailable. (${capabilityReason})`;
    } else if (isTripped) {
      shouldDisplay = true;
      displayState = getActiveStateForSensor(sensorKey);
      badgeTone = "red";
      reason = `Expected sensor is active/tripped! Status: ${rawCell.status || "Alarm Triggered"}`;
    } else {
      shouldDisplay = true;
      displayState = "normal";
      badgeTone = "green";
      reason = "Expected sensor is present and reporting normal status.";
    }
  } else if (capability === "optional") {
    if (isMissing) {
      shouldDisplay = false;
      displayState = "not-installed";
      badgeTone = "gray";
      reason = "Sensor is optional and no live telemetry is available.";
    } else if (isTripped) {
      shouldDisplay = true;
      displayState = getActiveStateForSensor(sensorKey);
      badgeTone = "red";
      reason = `Optional sensor is present and reporting active trip signal! Status: ${rawCell.status || "Alarm Triggered"}`;
    } else {
      shouldDisplay = true;
      displayState = "normal";
      badgeTone = "green";
      reason = "Optional sensor is present and reporting normal status.";
    }
  } else {
    // unknown/fallback
    shouldDisplay = true;
    displayState = isTripped ? "fault" : (isMissing ? "unavailable" : "normal");
    badgeTone = isTripped ? "red" : (isMissing ? "yellow" : "green");
    reason = "Sensor capability is unknown; displaying raw reported state.";
  }

  return {
    sensorKey,
    label,
    enclosureType,
    capability,
    rawState,
    displayState,
    shouldDisplay,
    badgeTone,
    source: rawCell.sourcePath || "EMS",
    reason,
    raw: rawCell
  };
}

/**
 * Resolves all sensor cells in a list of BlockSensorMatrixRows under the active site profile.
 */
export function resolveMatrixRows(rows: any[], activeProfile: EmsProfile | null): any[] {
  return rows.map((row) => {
    const isCS = row.location?.enclosureType === "CollectionSegment" || row.topology?.enclosureType === "CollectionSegment";
    const enclosureType = isCS ? "CS" : "ES";

    const resolveCell = (cell: any, key: string) => {
      if (!cell) return cell;
      const resolved = resolveSensorDisplayStatus({
        rawCell: cell,
        sensorKey: key,
        enclosureType,
        activeProfile
      });

      return {
        ...cell,
        applicable: resolved.shouldDisplay,
        capability: resolved.capability,
        shouldDisplay: resolved.shouldDisplay,
        displayState: resolved.displayState,
        reason: resolved.reason,
        badgeTone: resolved.badgeTone,
        rawState: resolved.rawState
      };
    };

    // Resolve emergencySensors
    const emergencySensors = { ...row.emergencySensors };
    Object.keys(emergencySensors).forEach((k) => {
      emergencySensors[k] = resolveCell(emergencySensors[k], k);
    });

    // Resolve comStatus
    const comStatus = { ...row.comStatus };
    Object.keys(comStatus).forEach((k) => {
      comStatus[k] = resolveCell(comStatus[k], k);
    });

    // Resolve doorSensors
    const doorSensors = { ...row.doorSensors };
    Object.keys(doorSensors).forEach((k) => {
      doorSensors[k] = resolveCell(doorSensors[k], k);
    });

    // Resolve otherSensors
    const otherSensors = { ...row.otherSensors };
    Object.keys(otherSensors).forEach((k) => {
      otherSensors[k] = resolveCell(otherSensors[k], k);
    });

    // Recalculate row health based on the RESOLVED/APPLICABLE cells
    let rowHealthy = true;
    let severity: "OK" | "Warning" | "Critical" = "OK";
    const findings: string[] = [];

    const checkCellHealth = (cell: any, label: string) => {
      if (!cell || !cell.applicable) return;
      
      const isCellHealthy = cell.healthy && cell.displayState !== "unavailable" && cell.displayState !== "unexpected-active-signal";
      const isCellTripped = cell.tripped === true || ["alarm", "fault", "open", "unexpected-active-signal"].includes(cell.displayState);

      if (!isCellHealthy || isCellTripped) {
        rowHealthy = false;
        if (isCellTripped) {
          severity = "Critical";
          findings.push(`${label} sensor tripped / active`);
        } else {
          if (severity !== "Critical") {
            severity = "Warning";
          }
          findings.push(`${label} sensor reporting unhealthy/unavailable status (${cell.status || "Unavailable"})`);
        }
      }
    };

    // Check all resolved applicable cells
    Object.keys(emergencySensors).forEach(k => checkCellHealth(emergencySensors[k], emergencySensors[k]?.label || k));
    Object.keys(comStatus).forEach(k => checkCellHealth(comStatus[k], comStatus[k]?.label || k));
    Object.keys(doorSensors).forEach(k => checkCellHealth(doorSensors[k], doorSensors[k]?.label || k));
    Object.keys(otherSensors).forEach(k => checkCellHealth(otherSensors[k], otherSensors[k]?.label || k));

    return {
      ...row,
      emergencySensors,
      comStatus,
      doorSensors,
      otherSensors,
      rowHealthy,
      actionHealthy: rowHealthy,
      severity,
      findings
    };
  });
}

