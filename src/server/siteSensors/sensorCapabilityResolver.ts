import { EmsProfile } from "../profiles/profileTypes";
import { NormalizedSensorCell } from "./siteSensorsRoutes";
import { getFeatherCache } from "../feather/featherClient";
import { normalizeSensorEnclosureIdentity } from "../../lib/enclosureIdentity";
import { sanitizeStatusForTripCheck } from "../emsTopologySensorParser";

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
  const fCache = getFeatherCache();
  const fDevices = fCache?.devices || [];

  return rows.map((row) => {
    const isCS = row.location?.enclosureType === "CollectionSegment" || row.topology?.enclosureType === "CollectionSegment";
    const enclosureType = isCS ? "CS" : "ES";

    const parsedIdent = normalizeSensorEnclosureIdentity({
      enclosureIndex: row.location?.enclosureIndex,
      displayName: row.location?.displayName,
      enclosureType: row.location?.enclosureType,
      segmentPosition: row.location?.segmentPosition
    });

    let directDevice: any = null;
    if (parsedIdent.arrayIndex !== null) {
      const targetIp = parsedIdent.segmentType === "CS"
        ? `10.0.${parsedIdent.arrayIndex}.3`
        : `10.0.${parsedIdent.arrayIndex}.${10 + (parsedIdent.localEsNumber! - 1) * 5}`;
      
      directDevice = fDevices.find((d: any) => d.deviceIp === targetIp);
    }

    const resolveCell = (cell: any, key: string) => {
      if (!cell) return cell;

      // Determine isMissing and isTripped
      const displayVal = cell.displayValue || "";
      const lowerDisplay = displayVal.toLowerCase().trim();
      const rawLowerStatus = (cell.status || "").toLowerCase().trim();
      const rawStatusMsg = (cell.statusMessage || "").toLowerCase().trim();
      
      const lowerStatus = sanitizeStatusForTripCheck(rawLowerStatus);
      const statusMsg = sanitizeStatusForTripCheck(rawStatusMsg);

      // Fix 2: Explicit unavailable indicators
      const isExplicitUnavailable = 
        ["offline", "disabled", "not ready", "unavailable"].includes(lowerDisplay) ||
        rawLowerStatus === "offline" ||
        rawLowerStatus === "disabled" ||
        cell.communicating === false ||
        cell.enabled === false ||
        cell.ready === false ||
        rawStatusMsg.includes("lost") ||
        rawStatusMsg.includes("unavailable") ||
        rawStatusMsg.includes("offline");

      const isMissing = isExplicitUnavailable;

      // Fix 2: Determine isTripped
      let isTripped = cell.tripped === true || 
                       (typeof cell.value === "string" && ["true", "active", "tripped", "alarm", "alarmed", "fault", "faulted", "open"].includes(cell.value.toLowerCase().trim())) ||
                       lowerDisplay === "tripped";

      if (cell.tripped === null || cell.tripped === undefined) {
        // treat as normal unless statusMessage explicitly says fault/alarm/trouble/open/lost/unavailable
        const hasFaultStatusMsg = ["fault", "alarm", "trouble", "open", "lost", "unavailable"].some(word => statusMsg.includes(word));
        isTripped = hasFaultStatusMsg;
      }

      let sourceConflict = false;
      let rawBlockviewerState = isTripped ? "TRIPPED" : "NORMAL";
      let directFeatherState = isTripped ? "TRIPPED" : "NORMAL";
      let activeStateSource = "blockviewer";

      const canonicalKey = mapToCanonicalProfileKey(key);

      if (directDevice && directDevice.reachable) {
        const fss = directDevice.fssSignals || directDevice.rawResponse?.fssSignals || {};
        const doors = directDevice.doors || directDevice.rawResponse?.doors || {};

        let directTripped = false;
        let hasDirectField = false;

        if (canonicalKey === "hydrogen") {
          if (fss.hydrogenAlarm !== undefined) {
            directTripped = fss.hydrogenAlarm === true;
            hasDirectField = true;
          }
        } else if (canonicalKey === "hydrogenFault") {
          if (fss.hydrogenFault !== undefined) {
            directTripped = fss.hydrogenFault === true;
            hasDirectField = true;
          }
        } else if (canonicalKey === "smoke") {
          if (fss.smokeAlarm !== undefined) {
            directTripped = fss.smokeAlarm === true;
            hasDirectField = true;
          }
        } else if (canonicalKey === "fireTrouble" || canonicalKey === "fireSuppressionTrouble") {
          if (fss.fireTrouble !== undefined) {
            directTripped = fss.fireTrouble === true;
            hasDirectField = true;
          } else if (fss.smokeAlarmTrouble !== undefined) {
            directTripped = fss.smokeAlarmTrouble === true;
            hasDirectField = true;
          }
        } else if (canonicalKey === "fire") {
          if (fss.fireAlarm !== undefined) {
            directTripped = fss.fireAlarm === true;
            hasDirectField = true;
          }
        } else if (canonicalKey === "heat") {
          if (fss.heatSensor !== undefined) {
            directTripped = fss.heatSensor === true;
            hasDirectField = true;
          }
        } else if (canonicalKey === "moisture" || canonicalKey === "leakDetector") {
          if (fss.leakAlarm !== undefined) {
            directTripped = fss.leakAlarm === true;
            hasDirectField = true;
          }
        } else if (canonicalKey === "dcDoors") {
          if (doors.dcDoorsClosed !== undefined) {
            directTripped = doors.dcDoorsClosed === false;
            hasDirectField = true;
          }
        } else if (canonicalKey === "acDoors") {
          if (doors.acDoorsClosed !== undefined) {
            directTripped = doors.acDoorsClosed === false;
            hasDirectField = true;
          }
        } else if (canonicalKey === "batteryDoors") {
          if (doors.batteryDoorsClosed !== undefined) {
            directTripped = doors.batteryDoorsClosed === false;
            hasDirectField = true;
          }
        } else if (canonicalKey === "topCapDoors") {
          if (doors.lowerTopcapClosed !== undefined) {
            directTripped = doors.lowerTopcapClosed === false;
            hasDirectField = true;
          }
        }

        if (hasDirectField) {
          activeStateSource = "direct-feather";
          directFeatherState = directTripped ? "TRIPPED" : "NORMAL";
          if (isTripped !== directTripped) {
            sourceConflict = true;
            isTripped = directTripped;
          }
        }
      }

      const profile = activeProfile?.sensorMonitoringProfile;

      const defaultCS = {
        dataUnavailable: true, acDoors: true, dcDoors: true, topCapDoors: true,
        manualVentilation: true, smoke: true, fireTrouble: true, fire: true,
        io: true, heat: true, upsAlarm: true, moisture: false, leakDetector: false,
        hydrogen: false, hydrogenFault: false, envControllerVent: false
      };

      const defaultES = {
        dataUnavailable: true, batteryDoors: true, topCapDoors: true,
        envControllerVent: true, smoke: true, hydrogenFault: true, hydrogen: true,
        io: true, heat: false, fireTrouble: true, moisture: true, fire: false,
        acDoors: false, dcDoors: false, manualVentilation: false, upsAlarm: false
      };

      let monitoredByProfile = false;
      if (enclosureType === "CS") {
        if (profile?.collectionSegment) {
          monitoredByProfile = profile.collectionSegment[canonicalKey] === true;
        } else {
          monitoredByProfile = !!(defaultCS as any)[canonicalKey];
        }
      } else {
        if (profile?.energySegment) {
          monitoredByProfile = profile.energySegment[canonicalKey] === true;
        } else {
          monitoredByProfile = !!(defaultES as any)[canonicalKey];
        }
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

      let contributesToHealth = monitoredByProfile;
      const visibleInDefaultView = monitoredByProfile;

      let displayState: "normal" | "open" | "alarm" | "fault" | "warning" | "unavailable" | "not-monitored" | "unknown" = "unknown";
      let reason = "";

      if (!monitoredByProfile) {
        contributesToHealth = false;
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

      let finalDisplayValue = cell.displayValue;
      if (sourceConflict) {
        finalDisplayValue = isTripped ? "TRIPPED" : "NORMAL";
      } else if (displayState === "normal" && (!finalDisplayValue || ["n/a", "", "state unknown", "unknown"].includes(finalDisplayValue.trim().toLowerCase()))) {
        finalDisplayValue = "CLEAR";
      }

      return {
        ...cell,
        displayValue: finalDisplayValue,
        applicable: monitoredByProfile, // Hide from standard view if not in profile
        healthy: !contributesToHealth ? true : (!isTripped && !isMissing),
        tripped: contributesToHealth ? isTripped : false,

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
        capability: monitoredByProfile ? "expected" : "unsupported",
        sourceDebug: {
          sourceConflict,
          rawBlockviewerState,
          directFeatherState,
          activeStateSource,
          directFeatherIp: directDevice?.deviceIp || null,
          directFeatherReachable: !!directDevice?.reachable
        }
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

export function resolveTopologyPoints(points: any[], activeProfile: EmsProfile | null): any[] {
  const fCache = getFeatherCache();
  const fDevices = fCache?.devices || [];

  return points.map(point => {
    const isCS = point.segmentKind === "CS";
    const enclosureType = isCS ? "CS" : "ES";
    const canonicalKey = mapToCanonicalProfileKey(point.pointRole);
    const profile = activeProfile?.sensorMonitoringProfile;

    const parsedIdent = normalizeSensorEnclosureIdentity({
      enclosureIndex: point.enclosureIndex,
      displayName: point.displayName,
      enclosureType: point.segmentKind === "CS" ? "CollectionSegment" : point.segmentKind === "ES" ? "EnergySegment" : undefined,
      segmentPosition: point.segmentNumber
    });

    let directDevice: any = null;
    if (parsedIdent.arrayIndex !== null) {
      const targetIp = parsedIdent.segmentType === "CS"
        ? `10.0.${parsedIdent.arrayIndex}.3`
        : `10.0.${parsedIdent.arrayIndex}.${10 + (parsedIdent.localEsNumber! - 1) * 5}`;
      
      directDevice = fDevices.find((d: any) => d.deviceIp === targetIp);
    }

    let activeState = point.activeState;
    let sourceConflict = false;
    let rawBlockviewerState = activeState ? "TRIPPED" : "NORMAL";
    let directFeatherState = activeState ? "TRIPPED" : "NORMAL";
    let activeStateSource = "blockviewer";

    if (directDevice && directDevice.reachable) {
      const fss = directDevice.fssSignals || directDevice.rawResponse?.fssSignals || {};
      const doors = directDevice.doors || directDevice.rawResponse?.doors || {};

      let directTripped = false;
      let hasDirectField = false;

      if (canonicalKey === "hydrogen") {
        if (fss.hydrogenAlarm !== undefined) {
          directTripped = fss.hydrogenAlarm === true;
          hasDirectField = true;
        }
      } else if (canonicalKey === "hydrogenFault") {
        if (fss.hydrogenFault !== undefined) {
          directTripped = fss.hydrogenFault === true;
          hasDirectField = true;
        }
      } else if (canonicalKey === "smoke") {
        if (fss.smokeAlarm !== undefined) {
          directTripped = fss.smokeAlarm === true;
          hasDirectField = true;
        }
      } else if (canonicalKey === "fireTrouble" || canonicalKey === "fireSuppressionTrouble") {
        if (fss.fireTrouble !== undefined) {
          directTripped = fss.fireTrouble === true;
          hasDirectField = true;
        } else if (fss.smokeAlarmTrouble !== undefined) {
          directTripped = fss.smokeAlarmTrouble === true;
          hasDirectField = true;
        }
      } else if (canonicalKey === "fire") {
        if (fss.fireAlarm !== undefined) {
          directTripped = fss.fireAlarm === true;
          hasDirectField = true;
        }
      } else if (canonicalKey === "heat") {
        if (fss.heatSensor !== undefined) {
          directTripped = fss.heatSensor === true;
          hasDirectField = true;
        }
      } else if (canonicalKey === "moisture" || canonicalKey === "leakDetector") {
        if (fss.leakAlarm !== undefined) {
          directTripped = fss.leakAlarm === true;
          hasDirectField = true;
        }
      } else if (canonicalKey === "dcDoors") {
        if (doors.dcDoorsClosed !== undefined) {
          directTripped = doors.dcDoorsClosed === false;
          hasDirectField = true;
        }
      } else if (canonicalKey === "acDoors") {
        if (doors.acDoorsClosed !== undefined) {
          directTripped = doors.acDoorsClosed === false;
          hasDirectField = true;
        }
      } else if (canonicalKey === "batteryDoors") {
        if (doors.batteryDoorsClosed !== undefined) {
          directTripped = doors.batteryDoorsClosed === false;
          hasDirectField = true;
        }
      } else if (canonicalKey === "topCapDoors") {
        if (doors.lowerTopcapClosed !== undefined) {
          directTripped = doors.lowerTopcapClosed === false;
          hasDirectField = true;
        }
      }

      if (hasDirectField) {
        activeStateSource = "direct-feather";
        directFeatherState = directTripped ? "TRIPPED" : "NORMAL";
        if (activeState !== directTripped) {
          sourceConflict = true;
          activeState = directTripped;
        }
      }
    }

    const defaultCS = {
      dataUnavailable: true, acDoors: true, dcDoors: true, topCapDoors: true,
      manualVentilation: true, smoke: true, fireTrouble: true, fire: true,
      io: true, heat: true, upsAlarm: true, moisture: false, leakDetector: false,
      hydrogen: false, hydrogenFault: false, envControllerVent: false
    };

    const defaultES = {
      dataUnavailable: true, batteryDoors: true, topCapDoors: true,
      envControllerVent: true, smoke: true, hydrogenFault: true, hydrogen: true,
      io: true, heat: false, fireTrouble: true, moisture: true, fire: false,
      acDoors: false, dcDoors: false, manualVentilation: false, upsAlarm: false
    };

    let monitoredByProfile = false;
    if (enclosureType === "CS") {
      if (profile?.collectionSegment) {
        monitoredByProfile = profile.collectionSegment[canonicalKey] === true;
      } else {
        monitoredByProfile = !!(defaultCS as any)[canonicalKey];
      }
    } else {
      if (profile?.energySegment) {
        monitoredByProfile = profile.energySegment[canonicalKey] === true;
      } else {
        monitoredByProfile = !!(defaultES as any)[canonicalKey];
      }
    }

    const contributesToHealth = monitoredByProfile;

    const pointAvailable = point.pointAvailable;
    const pointHealthy = !contributesToHealth ? true : (pointAvailable && activeState !== true);
    
    let severity = point.severity;
    if (contributesToHealth) {
      if (activeState === true) {
        severity = "Critical";
      } else if (!pointAvailable) {
        severity = "Warning";
      } else {
        severity = "OK";
      }
    } else {
      severity = "OK";
    }

    return {
      ...point,
      activeState,
      pointHealthy,
      severity,
      monitoredByProfile,
      contributesToHealth,
      sourceDebug: {
        sourceConflict,
        rawBlockviewerState,
        directFeatherState,
        activeStateSource,
        directFeatherIp: directDevice?.deviceIp || null,
        directFeatherReachable: !!directDevice?.reachable
      }
    };
  });
}

export function calculateProfileAndRawCounts(resolvedRows: any[]): {
  profileActivePointCount: number;
  profileUnavailablePointCount: number;
  profileWarningCount: number;
  profileCriticalCount: number;
  profileHealthyCount: number;
  rawActivePointCount: number;
  rawUnavailablePointCount: number;
} {
  let profileActivePointCount = 0;
  let profileUnavailablePointCount = 0;
  let profileCriticalCount = 0;
  let profileWarningCount = 0;
  let profileHealthyCount = 0;
  let rawActivePointCount = 0;
  let rawUnavailablePointCount = 0;

  resolvedRows.forEach((row) => {
    // Row level counts
    if (row.severity === "Critical") {
      profileCriticalCount++;
    } else if (row.severity === "Warning") {
      profileWarningCount++;
    } else {
      profileHealthyCount++;
    }

    const processCell = (cell: any) => {
      if (!cell) return;

      // Raw counts (from raw state)
      if (cell.rawTripped === true || cell.rawState === "TRIPPED") {
        rawActivePointCount++;
      }
      if (cell.rawState === "UNAVAILABLE") {
        rawUnavailablePointCount++;
      }

      // Profile counts
      if (cell.contributesToHealth === true) {
        if (cell.tripped === true || ["alarm", "fault", "open"].includes(cell.displayState)) {
          profileActivePointCount++;
        }
        if (cell.displayState === "unavailable") {
          profileUnavailablePointCount++;
        }
      }
    };

    const emergencySensors = row.emergencySensors || {};
    Object.keys(emergencySensors).forEach(k => processCell(emergencySensors[k]));

    const comStatus = row.comStatus || {};
    Object.keys(comStatus).forEach(k => processCell(comStatus[k]));

    const doorSensors = row.doorSensors || {};
    Object.keys(doorSensors).forEach(k => processCell(doorSensors[k]));

    const otherSensors = row.otherSensors || {};
    Object.keys(otherSensors).forEach(k => {
      if (Array.isArray(otherSensors[k])) {
        otherSensors[k].forEach((item: any) => processCell(item));
      } else {
        processCell(otherSensors[k]);
      }
    });
  });

  return {
    profileActivePointCount,
    profileUnavailablePointCount,
    profileWarningCount,
    profileCriticalCount,
    profileHealthyCount,
    rawActivePointCount,
    rawUnavailablePointCount
  };
}
