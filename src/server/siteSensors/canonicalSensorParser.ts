import { EmsProfile } from "../profiles/profileTypes";
import { getFeatherCache } from "../feather/featherClient";
import { normalizeSensorEnclosureIdentity } from "../../lib/enclosureIdentity";

export function sanitizeStatusForTripCheck(status: string): string {
  if (!status) return "";
  let s = status.toLowerCase().trim().replace(/_/g, " ");

  const termsToStrip = [
    "status",
    "ishealthy",
    "communicating",
    "enabled",
    "ready",
    "valid",
    "healthy",
    "applicable",
    "present"
  ];

  for (const term of termsToStrip) {
    const regex = new RegExp(term, "gi");
    s = s.replace(regex, " ");
  }

  return s.replace(/\s+/g, " ").trim();
}

export function parseActiveState(entity: any, pointRole?: string): { 
  activeState: boolean | null; 
  activeStateSource: string | null; 
  rawValue: any; 
  valueFieldUsed: string | null;
} {
  const role = (pointRole || entity.pointRole || "").toLowerCase();
  const entityType = String(entity.entityType || "").toLowerCase();
  const entitySubType = String(entity.entitySubType || "").toLowerCase();

  const isEnvSensor = role.includes("environment") || 
                      entityType.includes("humidity") || 
                      entityType.includes("environment") || 
                      entitySubType.includes("hts");

  const isOpenClosedDetector = entityType.includes("opencloseddetector") || entityType.includes("ocd");

  // Determine status message and check if it means Normal
  const rawStatusMsg = String(entity.statusMessage || entity.status || "").toLowerCase().trim();
  const statusMessage = sanitizeStatusForTripCheck(rawStatusMsg);

  // If statusMessage contains Normal, Clear, Untripped, Not Tripped, Closed, OK, Ready, Device online,
  // then activeState must be false.
  const isNormalStatus = statusMessage.includes("normal") ||
                         statusMessage.includes("clear") ||
                         statusMessage.includes("untripped") ||
                         statusMessage.includes("not tripped") ||
                         statusMessage.includes("closed") ||
                         statusMessage.includes("ok") ||
                         statusMessage.includes("ready") ||
                         statusMessage.includes("device online") ||
                         rawStatusMsg.includes("allowfaultreset") ||
                         rawStatusMsg.includes("allowfaultoverridereset");

  if (isNormalStatus) {
    return {
      activeState: false,
      activeStateSource: "statusMessageOverride",
      rawValue: entity.statusMessage || entity.status,
      valueFieldUsed: "statusMessage"
    };
  }

  // Explicit active trip fields allowed:
  const explicitTripFields = [
    "tripped",
    "isTripped",
    "active",
    "isActive",
    "alarm",
    "inAlarm",
    "fault",
    "faulted",
    "isFaulted",
    "open",
    "doorOpen",
    "alarmActive",
    "activeAlarm",
    "activeState"
  ];

  // First, check explicit trip fields on the entity.
  for (const field of explicitTripFields) {
    if (entity[field] !== undefined && entity[field] !== null) {
      const val = entity[field];
      if (typeof val === "boolean") {
        return { 
          activeState: val, 
          activeStateSource: field, 
          rawValue: val, 
          valueFieldUsed: field 
        };
      }
      if (typeof val === "string") {
        const lowerVal = val.toLowerCase().trim();
        if (["true", "active", "tripped", "alarm", "alarmed", "fault", "faulted", "open", "trouble", "lost communication", "unavailable"].includes(lowerVal)) {
          return { 
            activeState: true, 
            activeStateSource: field, 
            rawValue: val, 
            valueFieldUsed: field 
          };
        }
        if (["false", "normal", "inactive", "untripped", "clear", "ok", "ready", "closed"].includes(lowerVal)) {
          return { 
            activeState: false, 
            activeStateSource: field, 
            rawValue: val, 
            valueFieldUsed: field 
          };
        }
      }
    }
  }

  // Allowed semantic active strings for value, status, state, statusMessage
  const allowedSemanticActiveStrings = ["tripped", "active", "alarm", "fault", "open", "trouble", "lost communication", "unavailable"];
  const allowedSemanticNormalStrings = ["false", "normal", "inactive", "untripped", "clear", "ok", "ready", "closed"];

  // Generic value fields
  const genericValueFields = [
    "value",
    "currentValue",
    "presentValue",
    "statusValue",
    "stateValue",
    "booleanValue",
    "status",
    "state"
  ];

  for (const field of genericValueFields) {
    if (entity[field] !== undefined && entity[field] !== null) {
      const val = entity[field];

      // For Humidity/Temperature/Environment, do not treat as critical unless explicit status message matches
      if (isEnvSensor) {
        const isExplicitAlarm = statusMessage.includes("alarm") ||
                                statusMessage.includes("fault") ||
                                statusMessage.includes("trouble") ||
                                statusMessage.includes("tripped");
        if (isExplicitAlarm) {
          return {
            activeState: true,
            activeStateSource: "envStatusMessage",
            rawValue: val,
            valueFieldUsed: field
          };
        }
        return {
          activeState: false,
          activeStateSource: "envDefault",
          rawValue: val,
          valueFieldUsed: field
        };
      }

      if (typeof val === "boolean") {
        if (isOpenClosedDetector) {
          // OpenClosedDetector boolean values must NEVER create active faults!
          continue;
        }

        const isAbnormalRole = !["datacommunications", "communicating", "enabled", "ready"].includes(role);
        
        if (val === true) {
          if (!isAbnormalRole) {
            return {
              activeState: false,
              activeStateSource: field,
              rawValue: val,
              valueFieldUsed: field
            };
          }
          return { 
            activeState: true, 
            activeStateSource: field, 
            rawValue: val, 
            valueFieldUsed: field 
          };
        } else {
          return {
            activeState: false,
            activeStateSource: field,
            rawValue: val,
            valueFieldUsed: field
          };
        }
      }

      if (typeof val === "string") {
        const lowerVal = val.toLowerCase().trim();
        if (allowedSemanticActiveStrings.includes(lowerVal)) {
          const isAbnormalRole = !["datacommunications", "communicating", "enabled", "ready"].includes(role);
          if (!isAbnormalRole && ["true", "active"].includes(lowerVal)) {
            return {
              activeState: false,
              activeStateSource: field,
              rawValue: val,
              valueFieldUsed: field
            };
          }
          return { 
            activeState: true, 
            activeStateSource: field, 
            rawValue: val, 
            valueFieldUsed: field 
          };
        }
        if (allowedSemanticNormalStrings.includes(lowerVal)) {
          return { 
            activeState: false, 
            activeStateSource: field, 
            rawValue: val, 
            valueFieldUsed: field 
          };
        }
      }

      if (typeof val === "number" && !isOpenClosedDetector) {
        const isAbnormalRole = !["datacommunications", "communicating", "enabled", "ready"].includes(role);
        if (val !== 0 && isAbnormalRole) {
          return { 
            activeState: true, 
            activeStateSource: field, 
            rawValue: val, 
            valueFieldUsed: field 
          };
        } else {
          return {
            activeState: false,
            activeStateSource: field,
            rawValue: val,
            valueFieldUsed: field
          };
        }
      }
    }
  }

  return { activeState: null, activeStateSource: null, rawValue: null, valueFieldUsed: null };
}

export function getPointMapping(code: number, segmentKind: "CS" | "ES"): { pointRole: string; pointLabel: string } {
  if (segmentKind === "CS") {
    switch (code) {
      case 1:  return { pointRole: "dataCommunications", pointLabel: "Data Communications" };
      case 2:  return { pointRole: "acDoors", pointLabel: "AC Doors" };
      case 3:  return { pointRole: "dcDoors", pointLabel: "DC Doors" };
      case 4:  return { pointRole: "topCapDoors", pointLabel: "Top Cap Doors" };
      case 5:  return { pointRole: "manualVentilation", pointLabel: "Manual Ventilation" };
      case 6:  return { pointRole: "smoke", pointLabel: "Smoke Detector" };
      case 7:  return { pointRole: "fireTrouble", pointLabel: "Fire Trouble" };
      case 8:  return { pointRole: "fire", pointLabel: "Fire Alarm" };
      case 9:  return { pointRole: "io", pointLabel: "IO Communications" };
      case 10: return { pointRole: "heat", pointLabel: "Heat Detector" };
      case 11: return { pointRole: "moisture", pointLabel: "Moisture Detector" };
      case 31: return { pointRole: "upsAlarm", pointLabel: "UPS Alarm Relay 1" };
      case 32: return { pointRole: "upsAlarm", pointLabel: "UPS Alarm Relay 2" };
      case 33: return { pointRole: "upsAlarm", pointLabel: "UPS Alarm Relay 3" };
      case 34: return { pointRole: "upsAlarm", pointLabel: "UPS Alarm Relay 4" };
      default: return { pointRole: "unknown", pointLabel: `Unknown CS point ${code}` };
    }
  } else {
    switch (code) {
      case 1:  return { pointRole: "dataCommunications", pointLabel: "Data Communications" };
      case 2:  return { pointRole: "batteryDoors", pointLabel: "Battery Doors" };
      case 3:  return { pointRole: "topCapDoors", pointLabel: "Top Cap Doors" };
      case 4:  return { pointRole: "envControllerVent", pointLabel: "Env Controller Ventilation" };
      case 5:  return { pointRole: "smoke", pointLabel: "Smoke Detector" };
      case 6:  return { pointRole: "hydrogenFault", pointLabel: "Hydrogen Detector Fault" };
      case 7:  return { pointRole: "hydrogen", pointLabel: "Hydrogen Sensor" };
      case 8:  return { pointRole: "io", pointLabel: "IO Communications" };
      case 9:  return { pointRole: "heat", pointLabel: "Heat Detector" };
      case 10: return { pointRole: "fireTrouble", pointLabel: "Fire Trouble" };
      case 11: return { pointRole: "moisture", pointLabel: "Moisture Detector" };
      default: return { pointRole: "unknown", pointLabel: `Unknown ES point ${code}` };
    }
  }
}

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
 * Consolidates blockviewer point data and direct Feather status report data paths.
 */
export function resolveMatrixRows(rows: any[], activeProfile: EmsProfile | null): any[] {
  const fCache = getFeatherCache();
  const fDevices = fCache?.devices || [];

  const physicalRows = rows.filter((row) => {
    if (!row || !row.location) return false;
    const isPhysical = row.location.enclosureType === "CollectionSegment" || 
                       row.location.enclosureType === "EnergySegment" ||
                       row.topology?.enclosureType === "CollectionSegment" ||
                       row.topology?.enclosureType === "EnergySegment";
    if (!isPhysical) return false;

    const name = String(row.location.displayName || "").toLowerCase();
    if (name.includes("string modules") || name.includes("header") || name.includes("group")) {
      return false;
    }
    return true;
  });

  return physicalRows.map((row) => {
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

      const canonicalKey = mapToCanonicalProfileKey(key);

      // Determine default raw properties
      const displayVal = cell.displayValue || "";
      const lowerDisplay = displayVal.toLowerCase().trim();
      const rawLowerStatus = (cell.status || "").toLowerCase().trim();
      const rawStatusMsg = (cell.statusMessage || "").toLowerCase().trim();
      
      const lowerStatus = sanitizeStatusForTripCheck(rawLowerStatus);
      const statusMsg = sanitizeStatusForTripCheck(rawStatusMsg);

      // Fix 2: Explicit unavailable indicators on blockviewer
      const isExplicitUnavailable = 
        ["offline", "disabled", "not ready", "unavailable"].includes(lowerDisplay) ||
        rawLowerStatus === "offline" ||
        rawLowerStatus === "disabled" ||
        cell.communicating === false ||
        cell.enabled === false ||
        cell.ready === false ||
        rawStatusMsg.includes("lost") ||
        rawStatusMsg.includes("unavailable") ||
        rawStatusMsg.includes("offline") ||
        statusMsg.includes("lost") ||
        statusMsg.includes("unavailable");

      let isMissing = isExplicitUnavailable;

      let isTripped = cell.tripped === true || 
                       (typeof cell.value === "string" && ["true", "active", "tripped", "alarm", "alarmed", "fault", "faulted", "open", "trouble"].includes(cell.value.toLowerCase().trim())) ||
                       lowerDisplay === "tripped";

      if (cell.tripped === null || cell.tripped === undefined) {
        const hasFaultStatusMsg = ["fault", "alarm", "trouble", "open"].some(word => statusMsg.includes(word));
        isTripped = hasFaultStatusMsg;
      }

      // -------------------------------------------------------------
      // CORE REFACTOR REQUIREMENT: Prioritize direct Feather fields as the live source
      // -------------------------------------------------------------
      let sourceConflict = false;
      let rawBlockviewerState = isTripped ? "TRIPPED" : "NORMAL";
      let directFeatherState = isTripped ? "TRIPPED" : "NORMAL";
      let activeStateSource = "blockviewer";
      let isDirectUnavailable = false;

      if (directDevice && directDevice.reachable) {
        const fss =
          directDevice.fssSignals ||
          directDevice.rawResponse?.thermalData?.fssSignals ||
          directDevice.rawResponse?.fssSignals ||
          directDevice.raw?.directFeather?.rawResponse?.thermalData?.fssSignals ||
          directDevice.raw?.directFeather?.rawResponse?.fssSignals ||
          null;
        const doors = directDevice.doors || directDevice.rawResponse?.doors || null;
        const fssValid = fss ? (fss.valid !== false) : false;
        const doorsValid = doors ? (doors.valid !== false) : false;

        let directTripped = false;
        let hasDirectField = false;

        if (canonicalKey === "hydrogen") {
          if (fssValid && fss) {
            const ppm = directDevice.hydrogen1PPM ?? directDevice.rawResponse?.thermalData?.hydrogen1PPM;
            if (ppm !== undefined && ppm !== null) {
              directTripped = ppm > 50;
              hasDirectField = true;
            } else if (fss.hydrogenAlarm !== undefined) {
              directTripped = fss.hydrogenAlarm === true;
              hasDirectField = true;
            } else {
              directTripped = false;
              hasDirectField = true;
            }
          } else {
            isDirectUnavailable = true;
          }
        } else if (canonicalKey === "hydrogenFault") {
          if (fssValid && fss) {
            if (fss.hydrogenFault !== undefined) {
              directTripped = fss.hydrogenFault === true;
              hasDirectField = true;
            } else {
              directTripped = false;
              hasDirectField = true;
            }
          } else {
            isDirectUnavailable = true;
          }
        } else if (canonicalKey === "smoke") {
          if (fssValid && fss) {
            if (fss.smokeAlarm !== undefined) {
              directTripped = fss.smokeAlarm === true;
              hasDirectField = true;
            } else {
              directTripped = false;
              hasDirectField = true;
            }
          } else {
            isDirectUnavailable = true;
          }
        } else if (canonicalKey === "fireTrouble" || canonicalKey === "fireSuppressionTrouble") {
          if (fssValid && fss) {
            if (fss.fireTrouble !== undefined) {
              directTripped = fss.fireTrouble === true;
              hasDirectField = true;
            } else if (fss.smokeAlarmTrouble !== undefined) {
              directTripped = fss.smokeAlarmTrouble === true;
              hasDirectField = true;
            } else {
              directTripped = false;
              hasDirectField = true;
            }
          } else {
            isDirectUnavailable = true;
          }
        } else if (canonicalKey === "fire") {
          if (fssValid && fss) {
            if (fss.fireAlarm !== undefined) {
              directTripped = fss.fireAlarm === true;
              hasDirectField = true;
            } else {
              directTripped = false;
              hasDirectField = true;
            }
          } else {
            isDirectUnavailable = true;
          }
        } else if (canonicalKey === "heat") {
          if (fssValid && fss) {
            if (fss.heatSensor !== undefined) {
              directTripped = fss.heatSensor === true;
              hasDirectField = true;
            } else {
              directTripped = false;
              hasDirectField = true;
            }
          } else {
            isDirectUnavailable = true;
          }
        } else if (canonicalKey === "moisture" || canonicalKey === "leakDetector") {
          if (fssValid && fss) {
            if (fss.leakAlarm !== undefined) {
              directTripped = fss.leakAlarm === true;
              hasDirectField = true;
            } else {
              directTripped = false;
              hasDirectField = true;
            }
          } else {
            isDirectUnavailable = true;
          }
        } else if (canonicalKey === "dcDoors") {
          if (doorsValid && doors) {
            if (doors.dcDoorsClosed !== undefined) {
              directTripped = doors.dcDoorsClosed === false;
              hasDirectField = true;
            } else {
              directTripped = false;
              hasDirectField = true;
            }
          } else {
            isDirectUnavailable = true;
          }
        } else if (canonicalKey === "acDoors") {
          if (doorsValid && doors) {
            if (doors.acDoorsClosed !== undefined) {
              directTripped = doors.acDoorsClosed === false;
              hasDirectField = true;
            } else {
              directTripped = false;
              hasDirectField = true;
            }
          } else {
            isDirectUnavailable = true;
          }
        } else if (canonicalKey === "batteryDoors") {
          if (doorsValid && doors) {
            if (doors.batteryDoorsClosed !== undefined) {
              directTripped = doors.batteryDoorsClosed === false;
              hasDirectField = true;
            } else {
              directTripped = false;
              hasDirectField = true;
            }
          } else {
            isDirectUnavailable = true;
          }
        } else if (canonicalKey === "topCapDoors") {
          if (doorsValid && doors) {
            if (doors.lowerTopcapClosed !== undefined) {
              directTripped = doors.lowerTopcapClosed === false;
              hasDirectField = true;
            } else if (doors.lowerTopCapClosed !== undefined) {
              directTripped = doors.lowerTopCapClosed === false;
              hasDirectField = true;
            } else {
              directTripped = false;
              hasDirectField = true;
            }
          } else {
            isDirectUnavailable = true;
          }
        } else if (canonicalKey === "io") {
          const lostComms = directDevice.rawResponse?.devicesWithLostComms || directDevice.rawResponse?.deviceWithLostComms || [];
          directTripped = lostComms.length > 0;
          hasDirectField = true;
        } else if (canonicalKey === "dataUnavailable") {
          directTripped = !directDevice.reachable;
          hasDirectField = true;
        }

        if (hasDirectField) {
          activeStateSource = "direct-feather";
          directFeatherState = directTripped ? "TRIPPED" : "NORMAL";
          isMissing = false; // direct source is alive and active
          if (isTripped !== directTripped) {
            sourceConflict = true;
            isTripped = directTripped;
          }
        } else if (isDirectUnavailable) {
          // If the FSS or Doors is invalid or missing, do NOT infer fault from missing fields!
          // Fallback to blockviewer ONLY if it has an explicit active trip field.
          // Otherwise, treat as Clear.
          activeStateSource = "none";
          directFeatherState = "UNAVAILABLE";
          
          const blockHasExplicitTrip = cell.tripped === true || 
                                       (typeof cell.value === "string" && ["true", "active", "tripped", "alarm", "alarmed", "fault", "faulted", "open", "trouble"].includes(cell.value.toLowerCase().trim()));
          if (blockHasExplicitTrip) {
            isTripped = true;
            isMissing = false;
          } else {
            isTripped = false;
            isMissing = false;
          }
        }
      }

      // Profile mapping
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

      // Special physical exception mappings per site inventory constraints:
      if (enclosureType === "ES") {
        if (canonicalKey === "heat" || canonicalKey === "acDoors" || canonicalKey === "dcDoors") {
          monitoredByProfile = false;
          contributesToHealth = false;
        }
      }

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
    let isDirectUnavailable = false;

    if (directDevice && directDevice.reachable) {
      const fss =
        directDevice.fssSignals ||
        directDevice.rawResponse?.thermalData?.fssSignals ||
        directDevice.rawResponse?.fssSignals ||
        directDevice.raw?.directFeather?.rawResponse?.thermalData?.fssSignals ||
        directDevice.raw?.directFeather?.rawResponse?.fssSignals ||
        null;
      const doors = directDevice.doors || directDevice.rawResponse?.doors || null;
      const fssValid = fss ? (fss.valid !== false) : false;
      const doorsValid = doors ? (doors.valid !== false) : false;

      let directTripped = false;
      let hasDirectField = false;

      if (canonicalKey === "hydrogen") {
        if (fssValid && fss) {
          const ppm = directDevice.hydrogen1PPM ?? directDevice.rawResponse?.thermalData?.hydrogen1PPM;
          if (ppm !== undefined && ppm !== null) {
            directTripped = ppm > 50;
            hasDirectField = true;
          } else if (fss.hydrogenAlarm !== undefined) {
            directTripped = fss.hydrogenAlarm === true;
            hasDirectField = true;
          } else {
            directTripped = false;
            hasDirectField = true;
          }
        } else {
          isDirectUnavailable = true;
        }
      } else if (canonicalKey === "hydrogenFault") {
        if (fssValid && fss) {
          if (fss.hydrogenFault !== undefined) {
            directTripped = fss.hydrogenFault === true;
            hasDirectField = true;
          } else {
            directTripped = false;
            hasDirectField = true;
          }
        } else {
          isDirectUnavailable = true;
        }
      } else if (canonicalKey === "smoke") {
        if (fssValid && fss) {
          if (fss.smokeAlarm !== undefined) {
            directTripped = fss.smokeAlarm === true;
            hasDirectField = true;
          } else {
            directTripped = false;
            hasDirectField = true;
          }
        } else {
          isDirectUnavailable = true;
        }
      } else if (canonicalKey === "fireTrouble" || canonicalKey === "fireSuppressionTrouble") {
        if (fssValid && fss) {
          if (fss.fireTrouble !== undefined) {
            directTripped = fss.fireTrouble === true;
            hasDirectField = true;
          } else if (fss.smokeAlarmTrouble !== undefined) {
            directTripped = fss.smokeAlarmTrouble === true;
            hasDirectField = true;
          } else {
            directTripped = false;
            hasDirectField = true;
          }
        } else {
          isDirectUnavailable = true;
        }
      } else if (canonicalKey === "fire") {
        if (fssValid && fss) {
          if (fss.fireAlarm !== undefined) {
            directTripped = fss.fireAlarm === true;
            hasDirectField = true;
          } else {
            directTripped = false;
            hasDirectField = true;
          }
        } else {
          isDirectUnavailable = true;
        }
      } else if (canonicalKey === "heat") {
        if (fssValid && fss) {
          if (fss.heatSensor !== undefined) {
            directTripped = fss.heatSensor === true;
            hasDirectField = true;
          } else {
            directTripped = false;
            hasDirectField = true;
          }
        } else {
          isDirectUnavailable = true;
        }
      } else if (canonicalKey === "moisture" || canonicalKey === "leakDetector") {
        if (fssValid && fss) {
          if (fss.leakAlarm !== undefined) {
            directTripped = fss.leakAlarm === true;
            hasDirectField = true;
          } else {
            directTripped = false;
            hasDirectField = true;
          }
        } else {
          isDirectUnavailable = true;
        }
      } else if (canonicalKey === "dcDoors") {
        if (doorsValid && doors) {
          if (doors.dcDoorsClosed !== undefined) {
            directTripped = doors.dcDoorsClosed === false;
            hasDirectField = true;
          } else {
            directTripped = false;
            hasDirectField = true;
          }
        } else {
          isDirectUnavailable = true;
        }
      } else if (canonicalKey === "acDoors") {
        if (doorsValid && doors) {
          if (doors.acDoorsClosed !== undefined) {
            directTripped = doors.acDoorsClosed === false;
            hasDirectField = true;
          } else {
            directTripped = false;
            hasDirectField = true;
          }
        } else {
          isDirectUnavailable = true;
        }
      } else if (canonicalKey === "batteryDoors") {
        if (doorsValid && doors) {
          if (doors.batteryDoorsClosed !== undefined) {
            directTripped = doors.batteryDoorsClosed === false;
            hasDirectField = true;
          } else {
            directTripped = false;
            hasDirectField = true;
          }
        } else {
          isDirectUnavailable = true;
        }
      } else if (canonicalKey === "topCapDoors") {
        if (doorsValid && doors) {
          if (doors.lowerTopcapClosed !== undefined) {
            directTripped = doors.lowerTopcapClosed === false;
            hasDirectField = true;
          } else if (doors.lowerTopCapClosed !== undefined) {
            directTripped = doors.lowerTopCapClosed === false;
            hasDirectField = true;
          } else {
            directTripped = false;
            hasDirectField = true;
          }
        } else {
          isDirectUnavailable = true;
        }
      } else if (canonicalKey === "io") {
        const lostComms = directDevice.rawResponse?.devicesWithLostComms || directDevice.rawResponse?.deviceWithLostComms || [];
        directTripped = lostComms.length > 0;
        hasDirectField = true;
      } else if (canonicalKey === "dataUnavailable") {
        directTripped = !directDevice.reachable;
        hasDirectField = true;
      }

      if (hasDirectField) {
        activeStateSource = "direct-feather";
        directFeatherState = directTripped ? "TRIPPED" : "NORMAL";
        if (activeState !== directTripped) {
          sourceConflict = true;
          activeState = directTripped;
        }
      } else if (isDirectUnavailable) {
        activeStateSource = "none";
        directFeatherState = "UNAVAILABLE";
        const blockHasExplicitTrip = point.tripped === true || 
                                     (typeof point.value === "string" && ["true", "active", "tripped", "alarm", "alarmed", "fault", "faulted", "open", "trouble"].includes(point.value.toLowerCase().trim()));
        if (blockHasExplicitTrip) {
          activeState = true;
        } else {
          activeState = false;
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

    let contributesToHealth = monitoredByProfile;
    if (enclosureType === "ES") {
      if (canonicalKey === "heat" || canonicalKey === "acDoors" || canonicalKey === "dcDoors") {
        monitoredByProfile = false;
        contributesToHealth = false;
      }
    }

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
