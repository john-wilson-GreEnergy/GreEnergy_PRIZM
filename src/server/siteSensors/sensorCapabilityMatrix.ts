import { EmsProfile } from "../profiles/profileTypes";

export type SensorCapability = "expected" | "optional" | "unsupported" | "unknown";

export type SensorDisplayState =
  | "normal"
  | "fault"
  | "alarm"
  | "warning"
  | "open"
  | "closed"
  | "unavailable"
  | "not-installed"
  | "not-applicable"
  | "unexpected-active-signal"
  | "unknown";

export interface ResolvedSensorDisplay {
  sensorKey: string;
  label: string;
  enclosureType: "CS" | "ES" | "UNKNOWN";
  capability: SensorCapability;
  rawState: string | null;
  displayState: SensorDisplayState;
  shouldDisplay: boolean;
  badgeTone: "green" | "yellow" | "red" | "gray" | "blue";
  source: string;
  reason: string;
  raw: any;
}

/**
 * Returns the capability of a sensor key for a specific enclosure type and active profile.
 */
export function getSensorCapability(
  sensorKey: string,
  enclosureType: "CS" | "ES" | "UNKNOWN",
  activeProfile: EmsProfile | null,
  hasTelemetry: boolean
): { capability: SensorCapability; reason: string } {
  const notes = (activeProfile?.notes || "").toLowerCase();
  const name = (activeProfile?.profileName || "").toLowerCase();
  const site = (activeProfile?.siteName || "").toLowerCase();

  // Helper helpers to detect configured capabilities from profile name, notes or site name
  const isLeakEnabled = notes.includes("leak") || notes.includes("water") || name.includes("leak") || site.includes("leak");
  const isHeatEnabledCS = notes.includes("cs heat") || notes.includes("enable heat") || name.includes("cs heat") || site.includes("cs heat");
  const isHeatEnabledES = notes.includes("es heat") || notes.includes("enable heat") || name.includes("es heat") || site.includes("es heat");
  const isFireEnabledES = notes.includes("es fire") || notes.includes("enable fire") || name.includes("es fire") || site.includes("es fire");
  const isHydrogenEnabled = notes.includes("hydrogen") || notes.includes("h2") || name.includes("hydrogen") || site.includes("hydrogen") || hasTelemetry;

  if (enclosureType === "CS") {
    switch (sensorKey) {
      case "fire":
      case "smoke":
        return {
          capability: "expected",
          reason: "Fire and smoke safety systems are expected on the Collection Segment."
        };
      case "fireTrouble":
        return {
          capability: "expected",
          reason: "Fire trouble monitoring is expected on the Collection Segment."
        };
      case "acDoors":
      case "dcDoors":
      case "topCapDoors":
        return {
          capability: "expected",
          reason: "Enclosure entry/door detectors are expected on the Collection Segment."
        };
      case "batteryDoors":
        return {
          capability: "unsupported",
          reason: "Battery door sensors are unsupported on the Collection Segment."
        };
      case "modbusEStop":
      case "safetyLoop":
      case "interlock":
        if (hasTelemetry || notes.includes("interlock") || notes.includes("safety")) {
          return {
            capability: "expected",
            reason: "Interlock and safety loops are expected on this Collection Segment."
          };
        }
        return {
          capability: "unsupported",
          reason: "Interlock / safety loop is not present in telemetry or site profile configuration."
        };
      case "moisture":
        return {
          capability: "optional",
          reason: "Water condensate and moisture sensors are optional on the Collection Segment."
        };
      case "leakDetector":
        if (isLeakEnabled) {
          return {
            capability: "expected",
            reason: "Leak detector is expected as configured in the active site profile."
          };
        }
        return {
          capability: "unsupported",
          reason: "Leak detector is unsupported on the Collection Segment for this site profile."
        };
      case "heat":
        if (isHeatEnabledCS) {
          return {
            capability: "expected",
            reason: "Heat detector is expected as configured in the active site profile."
          };
        }
        return {
          capability: "unsupported",
          reason: "Heat detector is unsupported on the Collection Segment for this site profile."
        };
      case "dataCommunications":
      case "io":
        return {
          capability: "expected",
          reason: "Communication loop is expected on the Collection Segment."
        };
      case "manualVentilation":
        return {
          capability: "optional",
          reason: "Manual ventilation status is optional on the Collection Segment."
        };
      case "envControllerVent":
      case "hydrogen":
      case "hydrogenFault":
        return {
          capability: "unsupported",
          reason: "This environmental/gas channel is unsupported on the Collection Segment."
        };
      default:
        return {
          capability: "unknown",
          reason: `Sensor key '${sensorKey}' has an unknown capability for Collection Segment.`
        };
    }
  } else if (enclosureType === "ES") {
    switch (sensorKey) {
      case "batteryDoors":
      case "topCapDoors":
        return {
          capability: "expected",
          reason: "Enclosure entry/door detectors are expected on the Energy Segment."
        };
      case "acDoors":
      case "dcDoors":
        return {
          capability: "unsupported",
          reason: "AC and DC door sensors are unsupported on the Energy Segment."
        };
      case "envControllerVent":
        if (notes.includes("env vent") || notes.includes("controller vent")) {
          return {
            capability: "expected",
            reason: "Environmental Controller Ventilation is expected based on site profile notes."
          };
        }
        return {
          capability: "optional",
          reason: "Environmental Controller Ventilation is optional on the Energy Segment."
        };
      case "hydrogenFault":
      case "hydrogen":
        if (isHydrogenEnabled) {
          return {
            capability: "expected",
            reason: "Hydrogen gas monitoring is expected as configured or active in telemetry."
          };
        }
        return {
          capability: "unsupported",
          reason: "Hydrogen detection is unsupported or not present on this Energy Segment."
        };
      case "io":
      case "dataCommunications":
        return {
          capability: "expected",
          reason: "IO communication loop is expected on the Energy Segment."
        };
      case "moisture":
      case "leakDetector":
        return {
          capability: "optional",
          reason: "Moisture and leak sensors are optional on the Energy Segment."
        };
      case "heat":
        if (isHeatEnabledES) {
          return {
            capability: "expected",
            reason: "Heat detector is expected as configured in the active site profile."
          };
        }
        return {
          capability: "unsupported",
          reason: "Heat detector is unsupported on the Energy Segment for this site profile."
        };
      case "fire":
      case "smoke":
      case "fireTrouble":
        if (isFireEnabledES) {
          return {
            capability: "expected",
            reason: "Fire and smoke monitoring is expected on the Energy Segment as configured in the site profile."
          };
        }
        return {
          capability: "unsupported",
          reason: "Fire safety monitoring is unsupported on the Energy Segment for this site profile."
        };
      case "manualVentilation":
        return {
          capability: "unsupported",
          reason: "Manual ventilation channel is unsupported on the Energy Segment."
        };
      default:
        return {
          capability: "unknown",
          reason: `Sensor key '${sensorKey}' has an unknown capability for Energy Segment.`
        };
    }
  }

  return {
    capability: "unknown",
    reason: "Enclosure type is unknown; capability cannot be resolved."
  };
}
