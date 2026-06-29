import { EmsProfile } from "../profiles/profileTypes";
import { NormalizedSensorCell } from "./siteSensorsRoutes";

export function mapToCanonicalProfileKey(sensorKey: string): string {
  const k = sensorKey.trim();
  if (k === "dataCommunications" || k === "dataUnavailable" || k === "envControllerLostComms") {
    return "dataUnavailable";
  }
  if (k === "lostComms" || k === "io" || k === "ioLogic") {
    return "io";
  }
  return k;
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

      // Determine isMissing and isTripped
      const displayVal = cell.displayValue || "";
      const isMissing = !cell.applicable || 
                        cell.tripped === null || 
                        ["offline", "disabled", "not ready", "unavailable"].includes(displayVal.toLowerCase()) ||
                        cell.status === "Offline" ||
                        cell.status === "Disabled";

      const isTripped = cell.tripped === true || 
                        (typeof cell.value === "string" && ["true", "active", "tripped", "alarm", "alarmed", "fault", "faulted", "open"].includes(cell.value.toLowerCase().trim())) ||
                        displayVal.toUpperCase() === "TRIPPED";

      const canonicalKey = mapToCanonicalProfileKey(key);
      const profile = activeProfile?.sensorMonitoringProfile;

      let monitoredByProfile = false;
      if (enclosureType === "CS") {
        const csProfile = profile?.collectionSegment || {
          dataUnavailable: true, acDoors: true, dcDoors: true, topCapDoors: true,
          manualVentilation: true, smoke: true, fireTrouble: true, fire: true,
          io: true, heat: true, upsAlarm: true, moisture: false, leakDetector: false,
          hydrogen: false, hydrogenFault: false, envControllerVent: false
        };
        monitoredByProfile = !!csProfile[canonicalKey];
      } else {
        const esProfile = profile?.energySegment || {
          dataUnavailable: true, batteryDoors: true, topCapDoors: true,
          envControllerVent: true, smoke: true, hydrogenFault: true, hydrogen: true,
          io: true, heat: true, fireTrouble: true, moisture: true, fire: false,
          acDoors: false, dcDoors: false, manualVentilation: false, upsAlarm: false
        };
        monitoredByProfile = !!esProfile[canonicalKey];
      }

      const rawPresent = !isMissing;
      const rawApplicable = !!cell.applicable;
      const rawHealthy = !isTripped && !isMissing && (cell.healthy !== false);
      const rawTripped = isTripped;

      let rawState = "NORMAL";
      if (isMissing) {
        rawState = "UNAVAILABLE";
      } else if (isTripped) {
        rawState = "TRIPPED";
      }

      const contributesToHealth = monitoredByProfile;
      const visibleInDefaultView = monitoredByProfile;

      let displayState: "normal" | "open" | "alarm" | "fault" | "warning" | "unavailable" | "not-monitored" | "unknown" = "unknown";
      let reason = "";

      if (!monitoredByProfile) {
        displayState = "not-monitored";
        reason = `Unmonitored under active profile (${canonicalKey})`;
      } else if (isMissing) {
        displayState = "unavailable";
        reason = `Monitored sensor (${canonicalKey}) is unavailable`;
      } else if (isTripped) {
        const k = canonicalKey.toLowerCase();
        if (k.includes("door")) {
          displayState = "open";
        } else if (k.includes("fire") || k.includes("smoke") || k.includes("alarm")) {
          displayState = "alarm";
        } else if (k.includes("fault") || k.includes("leak") || k.includes("moisture") || k.includes("hydrogen")) {
          displayState = "fault";
        } else {
          displayState = "fault";
        }
        reason = `Monitored sensor (${canonicalKey}) is tripped!`;
      } else {
        displayState = "normal";
        reason = `Monitored sensor (${canonicalKey}) is normal`;
      }

      return {
        ...cell,
        applicable: monitoredByProfile, // Hide from standard view if not in profile
        healthy: !isTripped && !isMissing,
        tripped: isTripped,

        rawPresent,
        rawApplicable,
        rawState,
        rawHealthy,
        rawTripped,
        monitoredByProfile,
        visibleInDefaultView,
        contributesToHealth,
        displayState,
        healthState: displayState,
        reason,
        capability: monitoredByProfile ? "expected" : "unsupported"
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
      if (Array.isArray(otherSensors[k])) {
        otherSensors[k] = otherSensors[k].map((item: any) => resolveCell(item, k));
      } else {
        otherSensors[k] = resolveCell(otherSensors[k], k);
      }
    });

    // Recalculate row health based ONLY on contributesToHealth === true cells
    let rowHealthy = true;
    let severity: "OK" | "Warning" | "Critical" = "OK";
    const findings: string[] = [];

    const checkCellHealth = (cell: any, label: string) => {
      if (!cell || cell.contributesToHealth !== true) return;

      const isCellHealthy = cell.healthy && cell.displayState !== "unavailable";
      const isCellTripped = cell.tripped === true || ["alarm", "fault", "open"].includes(cell.displayState);

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
    Object.keys(otherSensors).forEach(k => {
      if (Array.isArray(otherSensors[k])) {
        otherSensors[k].forEach((item: any, idx: number) => checkCellHealth(item, `${item?.label || k} [${idx + 1}]`));
      } else {
        checkCellHealth(otherSensors[k], otherSensors[k]?.label || k);
      }
    });

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
