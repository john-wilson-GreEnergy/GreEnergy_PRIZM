export function sanitizeStatusForTripCheck(status: string): string {
  if (!status) return "";
  let s = status.toLowerCase().trim();

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

  return s;
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
