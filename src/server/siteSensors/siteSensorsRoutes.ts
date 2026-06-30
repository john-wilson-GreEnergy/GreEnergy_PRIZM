import express, { Router } from "express";
import { 
  getLiveFirstResponderV2, 
  getLiveFirstResponderV1, 
  getFirstResponderEndpointDebugInfo,
  getEmsCachedFirstResponder,
  getNormalizedBaseUrl,
  emsCache,
  isDemoActive,
  fetchAndRecord
} from "../emsTurtleClient";
import { getSegmentName } from "../siteData/segmentTranslator";
import { generateFeatherDiscoveryCandidatesFromTopology } from "../profiles/profileManager";
import { ProfileStore } from "../profiles/profileStore";
import { getFeatherCache } from "../feather/featherClient";
import { parseEmsTopology, parseActiveState } from "../emsTopologySensorParser";
import { stringNumberToEnergySegment } from "../../lib/stringToEsMapper";
import { resolveMatrixRows, resolveTopologyPoints, calculateProfileAndRawCounts } from "./sensorCapabilityResolver";


const router = Router();

// Define response shapes for type safety
export interface NormalizedSensorRow {
  stationCode: string;
  blockIndex: number;
  lineupId: number;
  segmentId: number;
  segmentType: string;
  siteConnected: boolean;
  segmentCommunicating: boolean;
  temperatureValue: number;
  temperatureUnit: string;
  temperatureStatus: string;
  temperatureCommunicating: boolean;
  fireSuppressionStatus: string;
  fireSuppressionCommunicating: boolean;
  heatStatus: string;
  heatCommunicating: boolean;
  heatTrippedTimestamp: string | null;
  gasStatus: string;
  gasCommunicating: boolean;
  gasTrippedTimestamp: string | null;
  smokeStatus: string;
  smokeCommunicating: boolean;
  smokeTrippedTimestamp: string | null;
  overallStatus: "OK" | "WARNING" | "FAULT" | "UNHEALTHY";
  severity: "OK" | "Warning" | "Critical";
  findings: string[];
  source: string;
  sourcePath: string;
  raw: any;
  // Legacy UI-compatible fields
  id: string;
  displayLabel: string;
  health: string;
  sensors: {
    temperature: {
      state: string;
      healthy: boolean;
      label: string;
      value: string;
      sourcePath: string;
    };
    segmentCommunications: {
      state: string;
      healthy: boolean;
      label: string;
      value: string;
      sourcePath: string;
    };
    heat: {
      state: string;
      healthy: boolean;
      label: string;
      value: string;
      sourcePath: string;
    };
    gas: {
      state: string;
      healthy: boolean;
      label: string;
      value: string;
      sourcePath: string;
    };
    smoke: {
      state: string;
      healthy: boolean;
      label: string;
      value: string;
      sourcePath: string;
    };
    fireSuppression: {
      state: string;
      healthy: boolean;
      label: string;
      value: string;
      sourcePath: string;
    };
  };
}

// Generates a fully populated, highly realistic block topology data structure for BESS sub-cabinets
export function generateSimulatedTopology() {
  const topology: any[] = [];
  
  // 1. Add global block readiness point (numericId = 1)
  topology.push({
    entityKey: "openclosed-01",
    entityType: "OpenClosedDetector",
    entitySubType: "BlockReadiness",
    displayKey: "openclosed-01",
    statusMessage: "NORMAL",
    communicating: true,
    enabled: true,
    ready: true,
    value: false,
    tripped: false
  });

  // 2. Add 8 arrays
  for (let arrayIndex = 1; arrayIndex <= 8; arrayIndex++) {
    // 21 enclosures per array
    for (let posInArray = 1; posInArray <= 21; posInArray++) {
      const enclosureIndex = (arrayIndex - 1) * 21 + posInArray;
      const isCS = posInArray === 1;

      // Add temperature environmental sensors (HTS) for every enclosure
      // Code 1 = internal environment
      topology.push({
        entityKey: `sensor-${enclosureIndex * 100 + 1}`,
        entityType: "Humidity Temperature Sensor",
        entitySubType: "HTS",
        displayKey: `sensor-${enclosureIndex * 100 + 1}`,
        statusMessage: "NORMAL",
        communicating: true,
        enabled: true,
        ready: true,
        value: 72 + (enclosureIndex % 5) - 2, // Realistic temperature variation around 72
        temperature: 72 + (enclosureIndex % 5) - 2,
        humidity: 45 + (enclosureIndex % 10) - 5
      });

      // Code 2 = external environment
      topology.push({
        entityKey: `sensor-${enclosureIndex * 100 + 2}`,
        entityType: "Humidity Temperature Sensor",
        entitySubType: "HTS",
        displayKey: `sensor-${enclosureIndex * 100 + 2}`,
        statusMessage: "NORMAL",
        communicating: true,
        enabled: true,
        ready: true,
        value: 68 + (enclosureIndex % 3) - 1,
        temperature: 68 + (enclosureIndex % 3) - 1,
        humidity: 50 + (enclosureIndex % 8) - 4
      });

      if (isCS) {
        // CS Point mapped sensors (codes 1 to 11, and 31 to 34)
        // Note: we already added HTS for codes 1 & 2 above. So we add other codes.
        const otherCodes = [3, 4, 5, 6, 7, 8, 9, 10, 11, 31, 32, 33, 34];
        otherCodes.forEach(code => {
          const numericId = enclosureIndex * 100 + code;
          
          let val: any = "NOT_TRIPPED";
          let statusMessage = "OK";
          let communicating = true;

          // Introduce some interesting tripped sensors for realism
          if (arrayIndex === 4 && posInArray === 1 && code === 6) {
            val = "TRIPPED"; // Smoke detector tripped
            statusMessage = "SMOKE_DETECTED";
          }
          if (arrayIndex === 6 && posInArray === 1 && code === 3) {
            val = "TRIPPED"; // DC Door open
            statusMessage = "DOOR_OPEN";
          }

          topology.push({
            entityKey: `sensor-${numericId}`,
            entityType: "OpenClosedDetector",
            entitySubType: "OpenClosed",
            displayKey: `sensor-${numericId}`,
            statusMessage,
            communicating,
            enabled: true,
            ready: true,
            value: val,
            tripped: val === "TRIPPED"
          });
        });
      } else {
        // ES Point mapped sensors (codes 1 to 11)
        // HTS are codes 1, 4, 9. We already generated HTS for code 1.
        // Let's generate HTS for 4 & 9, and OpenClosed for others.
        const otherCodes = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
        otherCodes.forEach(code => {
          const numericId = enclosureIndex * 100 + code;
          const isTempHum = code === 4 || code === 9;
          
          let val: any = isTempHum ? 72 : "NOT_TRIPPED";
          let statusMessage = isTempHum ? "NORMAL" : "OK";
          let communicating = true;

          // Introduce some interesting tripped sensors for realism
          if (arrayIndex === 2 && posInArray === 4 && code === 7) {
            val = "TRIPPED"; // Hydrogen Sensor active
            statusMessage = "H2_ALERT";
          }
          if (arrayIndex === 5 && posInArray === 12 && code === 11) {
            val = "TRIPPED"; // Moisture detected
            statusMessage = "MOISTURE_ALARM";
          }
          if (arrayIndex === 7 && posInArray === 18 && code === 8) {
            communicating = false; // Offline IO Communications
            statusMessage = "COMM_LOST";
          }

          topology.push({
            entityKey: `sensor-${numericId}`,
            entityType: isTempHum ? "Humidity Temperature Sensor" : "OpenClosedDetector",
            entitySubType: isTempHum ? "HTS" : "OpenClosed",
            displayKey: `sensor-${numericId}`,
            statusMessage,
            communicating,
            enabled: true,
            ready: true,
            value: val,
            temperature: isTempHum ? 72 : undefined,
            humidity: isTempHum ? 45 : undefined,
            tripped: val === "TRIPPED"
          });
        });
      }
    }
  }

  return {
    stationCode: "BHE0020",
    blockIndex: 1,
    topology
  };
}

// Default BHE0021 V2 Payload to guarantee reliable parsing/simulation if Turtle container is offline or during testing
const DEFAULT_BHE0021_V2_PAYLOAD = {
  stationCode: "BHE0021",
  blockIndex: 1,
  isCelsius: false,
  connectionStatus: {
    isConnected: true,
    timestamp: Date.now()
  },
  totalCentipedeLineups: 8,
  totalHealthyLineups: 7,
  totalFaultyLineups: 1,
  centipedeLineups: [
    {
      lineupId: 141,
      segments: [
        {
          segmentId: 101,
          type: "ENERGY_SEGMENT",
          isCommunicating: true,
          temperature: { value: 72, status: "NOT_HIGH", isCommunicating: true },
          fireSuppression: { status: "NOT_TRIPPED", isCommunicating: true },
          heat: { status: "NOT_TRIPPED", isCommunicating: true },
          gas: { status: "NOT_TRIPPED", isCommunicating: true },
          smoke: { status: "NOT_TRIPPED", isCommunicating: true }
        }
      ]
    },
    {
      lineupId: 142,
      segments: [
        {
          segmentId: 102,
          type: "ENERGY_SEGMENT",
          isCommunicating: true,
          temperature: { value: 74, status: "NOT_HIGH", isCommunicating: true },
          fireSuppression: { status: "NOT_INSTALLED", isCommunicating: true },
          heat: { status: "NOT_TRIPPED", isCommunicating: true },
          gas: { status: "NOT_TRIPPED", isCommunicating: true },
          smoke: { status: "NOT_TRIPPED", isCommunicating: true }
        }
      ]
    },
    {
      lineupId: 143,
      segments: [
        {
          segmentId: 103,
          type: "ENERGY_SEGMENT",
          isCommunicating: true,
          temperature: { value: 71, status: "NOT_HIGH", isCommunicating: true },
          fireSuppression: { status: "NOT_TRIPPED", isCommunicating: true },
          heat: { status: "NOT_TRIPPED", isCommunicating: true },
          gas: { status: "NOT_TRIPPED", isCommunicating: true },
          smoke: { status: "NOT_TRIPPED", isCommunicating: true }
        }
      ]
    },
    {
      lineupId: 144,
      segments: [
        {
          segmentId: 104,
          type: "ENERGY_SEGMENT",
          isCommunicating: true,
          temperature: { value: 73, status: "NOT_HIGH", isCommunicating: true },
          fireSuppression: { status: "NOT_TRIPPED", isCommunicating: true },
          heat: { status: "NOT_TRIPPED", isCommunicating: true },
          gas: { status: "NOT_TRIPPED", isCommunicating: true },
          smoke: { status: "NOT_TRIPPED", isCommunicating: true }
        }
      ]
    },
    {
      lineupId: 145,
      segments: [
        {
          segmentId: 105,
          type: "ENERGY_SEGMENT",
          isCommunicating: true,
          temperature: { value: 70, status: "NOT_HIGH", isCommunicating: true },
          fireSuppression: { status: "NOT_TRIPPED", isCommunicating: true },
          heat: { status: "NOT_TRIPPED", isCommunicating: true },
          gas: { status: "NOT_TRIPPED", isCommunicating: true },
          smoke: { status: "NOT_TRIPPED", isCommunicating: true }
        }
      ]
    },
    {
      lineupId: 146,
      segments: [
        {
          segmentId: 106,
          type: "ENERGY_SEGMENT",
          isCommunicating: true,
          temperature: { value: 72, status: "NOT_HIGH", isCommunicating: true },
          fireSuppression: { status: "NOT_TRIPPED", isCommunicating: true },
          heat: { status: "NOT_TRIPPED", isCommunicating: true },
          gas: { status: "NOT_TRIPPED", isCommunicating: true },
          smoke: { status: "NOT_TRIPPED", isCommunicating: true }
        }
      ]
    },
    {
      lineupId: 147,
      segments: [
        {
          segmentId: 107,
          type: "ENERGY_SEGMENT",
          isCommunicating: true,
          temperature: { value: 73, status: "NOT_HIGH", isCommunicating: true },
          fireSuppression: { status: "NOT_TRIPPED", isCommunicating: true },
          heat: { status: "NOT_TRIPPED", isCommunicating: true },
          gas: { status: "NOT_TRIPPED", isCommunicating: true },
          smoke: { status: "NOT_TRIPPED", isCommunicating: true }
        }
      ]
    },
    {
      lineupId: 148,
      segments: [
        {
          segmentId: 164,
          type: "ENERGY_SEGMENT",
          isCommunicating: true,
          temperature: { value: 131, status: "HIGH", isCommunicating: true },
          fireSuppression: { status: "NOT_TRIPPED", isCommunicating: true },
          heat: { status: "NOT_TRIPPED", isCommunicating: true },
          gas: { status: "NOT_TRIPPED", isCommunicating: true },
          smoke: { status: "NOT_TRIPPED", isCommunicating: true }
        }
      ]
    }
  ]
};

// Persisted simulator overrides for development / tuning
let siteSensorOverrides: Record<string, Record<string, any>> = {};

// Helper to determine if a state represents an abnormal trigger
function isAbnormalStatus(statusStr: string | undefined): boolean {
  if (!statusStr) return false;
  const upper = statusStr.trim().toUpperCase();
  if (upper === "NOT_HIGH" || upper === "NOT_TRIPPED" || upper === "NOT_INSTALLED" || upper === "NORMAL") {
    return false;
  }
  return (
    upper.includes("HIGH") ||
    upper.includes("TRIPPED") ||
    upper.includes("ACTIVE") ||
    upper.includes("ALARM") ||
    upper.includes("FAULT") ||
    upper.includes("ERROR")
  );
}

// Helper to build legacy UI compatibility fields on a row
function populateLegacyFields(
  rowWithoutLegacy: Omit<NormalizedSensorRow, "id" | "displayLabel" | "health" | "sensors">,
  lineupId: number,
  segmentId: number,
  segmentType: string,
  severity: "OK" | "Warning" | "Critical",
  overallStatus: "OK" | "WARNING" | "FAULT" | "UNHEALTHY",
  temperatureValue: number,
  temperatureUnit: string,
  temperatureStatus: string,
  temperatureCommunicating: boolean,
  segmentCommunicating: boolean,
  heatStatus: string,
  heatCommunicating: boolean,
  gasStatus: string,
  gasCommunicating: boolean,
  smokeStatus: string,
  smokeCommunicating: boolean,
  fireSuppressionStatus: string,
  enclosureIp?: string
): NormalizedSensorRow {
  const isV1 = rowWithoutLegacy.sourcePath === "/turtle/firstresponder/data" || rowWithoutLegacy.sourcePath?.includes("v1") || (rowWithoutLegacy as any).source === "firstresponder_v1";
  const id = isV1 ? `FRV1-L${lineupId}-S${segmentId}` : `FRV2-L${lineupId}-S${segmentId}`;
  const displayLabel = getSegmentName({
    lineupId,
    segmentId,
    isCollectionSegment: segmentType === "CollectionSegment" || segmentType === "CollectionSegmentRow",
    ipAddress: enclosureIp
  });

  let health = "unknown";
  if (overallStatus === "FAULT" && severity === "Critical") {
    health = "fault";
  } else if (overallStatus === "FAULT" && severity === "Warning") {
    health = "warning";
  } else if (overallStatus === "OK") {
    health = "healthy";
  }

  const basePath = isV1 ? "/turtle/firstresponder/data" : "/turtle/v2/firstresponder/data";

  const sensors = {
    temperature: {
      state: temperatureStatus === "HIGH" ? "high" : "normal",
      healthy: !(temperatureStatus === "HIGH" || temperatureCommunicating === false),
      label: `${temperatureValue}${temperatureUnit} / ${temperatureStatus}`,
      value: `${temperatureValue}${temperatureUnit}`,
      sourcePath: `${basePath}/lineup/${lineupId}/segment/${segmentId}/temperature`
    },
    segmentCommunications: {
      state: segmentCommunicating ? "communicating" : "notCommunicating",
      healthy: segmentCommunicating,
      label: segmentCommunicating ? "Communicating" : "Offline",
      value: segmentCommunicating ? "OK" : "OFFLINE",
      sourcePath: `${basePath}/lineup/${lineupId}/segment/${segmentId}/segmentCommunications`
    },
    heat: {
      state: heatStatus === "NOT_TRIPPED" ? "normal" : "tripped",
      healthy: heatStatus === "NOT_TRIPPED" && heatCommunicating !== false,
      label: heatStatus,
      value: heatStatus,
      sourcePath: `${basePath}/lineup/${lineupId}/segment/${segmentId}/heat`
    },
    gas: {
      state: gasStatus === "NOT_TRIPPED" ? "normal" : "tripped",
      healthy: gasStatus === "NOT_TRIPPED" && gasCommunicating !== false,
      label: gasStatus,
      value: gasStatus,
      sourcePath: `${basePath}/lineup/${lineupId}/segment/${segmentId}/gas`
    },
    smoke: {
      state: smokeStatus === "NOT_TRIPPED" ? "normal" : "tripped",
      healthy: smokeStatus === "NOT_TRIPPED" && smokeCommunicating !== false,
      label: smokeStatus,
      value: smokeStatus,
      sourcePath: `${basePath}/lineup/${lineupId}/segment/${segmentId}/smoke`
    },
    fireSuppression: {
      state: fireSuppressionStatus === "NOT_INSTALLED" ? "notInstalled" : (fireSuppressionStatus === "NOT_TRIPPED" ? "normal" : "active"),
      healthy: fireSuppressionStatus === "NOT_INSTALLED" || fireSuppressionStatus === "NOT_TRIPPED",
      label: fireSuppressionStatus,
      value: fireSuppressionStatus,
      sourcePath: `${basePath}/lineup/${lineupId}/segment/${segmentId}/fireSuppression`
    }
  };

  return {
    ...rowWithoutLegacy,
    id,
    displayLabel,
    health,
    sensors
  };
}

// Orchestrator to normalize v2 schema payload into sensor rows
export async function buildNormalizedResponderSummary(refresh = false): Promise<any> {
  const cachedResponse = getEmsCachedFirstResponder();
  const cachedData = cachedResponse?.data || {};
  let rawV1 = cachedData.v1 || null;
  let rawV2 = cachedData.v2 || null;
  let fetchFailed = false;

  if (refresh) {
    try {
      rawV2 = await getLiveFirstResponderV2();
      rawV1 = await getLiveFirstResponderV1().catch(() => null);
    } catch (e) {
      fetchFailed = true;
    }
  }

  // Fallback if live fetch fails or no response
  if (!rawV2) {
    rawV2 = DEFAULT_BHE0021_V2_PAYLOAD;
  }

  const v1Devices = rawV1 ? (Array.isArray(rawV1) ? rawV1 : (rawV1.devices || [])) : [];

  let v1Enclosures: any[] = [];
  if (rawV1) {
    if (Array.isArray(rawV1.enclosures)) {
      v1Enclosures = rawV1.enclosures;
    } else if (rawV1.data && Array.isArray(rawV1.data.enclosures)) {
      v1Enclosures = rawV1.data.enclosures;
    }
  }

  const isV1Primary = v1Enclosures.length > 0;

  const stationCode = rawV2.stationCode || "BHE0021";
  const blockIndex = rawV2.blockIndex || 1;
  const isCelsius = rawV2.isCelsius ?? false;
  const tempUnit = isCelsius ? "C" : "F";
  const siteConnected = rawV2.connectionStatus?.isConnected ?? true;

  // Resolve dynamic segment candidates based on topology model
  const activeProfile = ProfileStore.getActiveProfile();
  let candidateRows: any[] = [];
  if (activeProfile) {
     const candidates = generateFeatherDiscoveryCandidatesFromTopology(activeProfile);
     if (candidates && candidates.length > 0) {
        candidateRows = candidates;
     }
  }

  // Hardcode 168 rows generation for BHE0021 if candidateRows is empty
  if (candidateRows.length === 0) {
     if (stationCode === "BHE0021") {
        for (let array = 1; array <= 8; array++) {
          candidateRows.push({
            deviceIp: `10.0.${array}.3`,
            arrayIndex: array,
            segment: 3,
            isCollectionSegment: true,
            entityName: `Array ${array} Collection Segment (CS) Device Node`
          });
          for (let stringIdx = 1; stringIdx <= 20; stringIdx++) {
            const seg = 10 + (stringIdx - 1) * 5;
            candidateRows.push({
              deviceIp: `10.0.${array}.${seg}`,
              arrayIndex: array,
              segment: seg,
              isCollectionSegment: false,
              entityName: `Array ${array} Energy Segment ${stringIdx} (ES) Device Node`
            });
          }
        }
     }
  }

  // Fallback to centipedeLineups directly if BHE0021 is not matching or candidateRows is still empty
  if (candidateRows.length === 0) {
    const centipedeLineups = rawV2.centipedeLineups || [];
    for (const lineup of centipedeLineups) {
      const lineupId = lineup.lineupId;
      const segments = lineup.segments || [];
      for (const seg of segments) {
        const arrayIndex = lineupId - 140;
        candidateRows.push({
          deviceIp: `10.0.${arrayIndex}.${seg.segmentId}`,
          arrayIndex,
          segment: seg.segmentId,
          isCollectionSegment: seg.type === "CollectionSegment" || String(seg.type || "").toLowerCase().includes("collection"),
          entityName: seg.enclosureName || `Segment ${seg.segmentId}`
        });
      }
    }
  }

  // Normalize final list of rows
  const rows: NormalizedSensorRow[] = [];
  const centipedeLineups = rawV2.centipedeLineups || [];
  const fCache = getFeatherCache();
  const fDevices = fCache.devices || [];

  let totalAbnormalSegments = 0;
  let totalHighTempSegments = 0;
  let totalTrippedSensors = 0;
  let totalNonCommunicating = 0;

  if (isV1Primary) {
     for (const e of v1Enclosures) {
        const lineupId = Number(e.lineupId || e.lineup || 141);
        const segmentId = Number(e.segmentId || e.segment || e.id || e.index || 101);
        const segmentType = e.segmentType || e.type || "EnergySegment";
        const segmentCommunicating = e.segmentCommunicating !== undefined ? !!e.segmentCommunicating : (e.communicating !== undefined ? !!e.communicating : (e.reachable !== undefined ? !!e.reachable : true));
        
        let temperatureValue = e.temperatureValue !== undefined ? Number(e.temperatureValue) : (e.temperature?.value !== undefined ? Number(e.temperature.value) : (e.cellTemp !== undefined ? Number(e.cellTemp) : (e.temp !== undefined ? Number(e.temp) : 70)));
        const temperatureUnit = e.temperatureUnit || "F";
        const temperatureStatus = e.temperatureStatus || e.temperature?.status || (temperatureValue > 115 ? "HIGH" : "NOT_HIGH");
        const temperatureCommunicating = e.temperatureCommunicating !== undefined ? !!e.temperatureCommunicating : (e.temperature?.isCommunicating !== undefined ? !!e.temperature.isCommunicating : true);
        
        const fireSuppressionStatus = e.fireSuppressionStatus || e.fireSuppression?.status || "NOT_TRIPPED";
        const fireSuppressionCommunicating = e.fireSuppressionCommunicating !== undefined ? !!e.fireSuppressionCommunicating : (e.fireSuppression?.isCommunicating !== undefined ? !!e.fireSuppression.isCommunicating : true);
        
        const heatStatus = e.heatStatus || e.heat?.status || "NOT_TRIPPED";
        const heatCommunicating = e.heatCommunicating !== undefined ? !!e.heatCommunicating : (e.heat?.isCommunicating !== undefined ? !!e.heat.isCommunicating : true);
        const heatTrippedTimestamp = e.heatTrippedTimestamp || e.heat?.trippedTimestamp || null;
        
        const gasStatus = e.gasStatus || e.gas?.status || "NOT_TRIPPED";
        const gasCommunicating = e.gasCommunicating !== undefined ? !!e.gasCommunicating : (e.gas?.isCommunicating !== undefined ? !!e.gas.isCommunicating : true);
        const gasTrippedTimestamp = e.gasTrippedTimestamp || e.gas?.trippedTimestamp || null;
        
        const smokeStatus = e.smokeStatus || e.smoke?.status || "NOT_TRIPPED";
        const smokeCommunicating = e.smokeCommunicating !== undefined ? !!e.smokeCommunicating : (e.smoke?.isCommunicating !== undefined ? !!e.smoke.isCommunicating : true);
        const smokeTrippedTimestamp = e.smokeTrippedTimestamp || e.smoke?.trippedTimestamp || null;
        
        const findings: string[] = [];
        let severity: "OK" | "Warning" | "Critical" = "OK";
        
        if (!segmentCommunicating) {
           findings.push("Segment communications link offline");
           severity = "Critical";
           totalNonCommunicating++;
        }
        if (temperatureStatus === "HIGH") {
           findings.push(`High Temperature alert: ${temperatureValue}°${temperatureUnit}`);
           severity = "Critical";
           totalHighTempSegments++;
        }
        if (!temperatureCommunicating && segmentCommunicating) {
           findings.push("Temperature sensor communications loss");
           if (severity !== "Critical") severity = "Warning";
        }
        if (isAbnormalStatus(heatStatus)) {
           findings.push(`Heat sensor physical trip: ${heatStatus}`);
           severity = "Critical";
           totalTrippedSensors++;
        }
        if (isAbnormalStatus(gasStatus)) {
           findings.push(`Gas sensor physical trip: ${gasStatus}`);
           severity = "Critical";
           totalTrippedSensors++;
        }
        if (isAbnormalStatus(smokeStatus)) {
           findings.push(`Smoke sensor physical trip: ${smokeStatus}`);
           severity = "Critical";
           totalTrippedSensors++;
        }
        if (isAbnormalStatus(fireSuppressionStatus)) {
           findings.push(`Fire Suppression control fault: ${fireSuppressionStatus}`);
           severity = "Critical";
           totalTrippedSensors++;
        }
        if (severity !== "OK") {
           totalAbnormalSegments++;
        }
        
        const overallStatus = findings.length > 0 ? (severity === "Critical" ? "FAULT" : "WARNING") : "OK";
        
        const rowWithoutLegacy = {
          stationCode,
          blockIndex,
          lineupId,
          segmentId,
          segmentType,
          siteConnected,
          segmentCommunicating,
          temperatureValue,
          temperatureUnit,
          temperatureStatus,
          temperatureCommunicating,
          fireSuppressionStatus,
          fireSuppressionCommunicating,
          heatStatus,
          heatCommunicating,
          heatTrippedTimestamp,
          gasStatus,
          gasCommunicating,
          gasTrippedTimestamp,
          smokeStatus,
          smokeCommunicating,
          smokeTrippedTimestamp,
          overallStatus: overallStatus as any,
          severity,
          findings,
          source: "firstresponder_v1",
          sourcePath: "/turtle/firstresponder/data/enclosures[]",
          raw: e
        };
        
        const fullRow = populateLegacyFields(
          rowWithoutLegacy,
          lineupId,
          segmentId,
          segmentType,
          severity,
          overallStatus as any,
          temperatureValue,
          temperatureUnit,
          temperatureStatus,
          temperatureCommunicating,
          segmentCommunicating,
          heatStatus,
          heatCommunicating,
          gasStatus,
          gasCommunicating,
          smokeStatus,
          smokeCommunicating,
          fireSuppressionStatus,
          e.ipAddress || e.ip || e.deviceIp
        );
        
        rows.push(fullRow);
     }
  } else {
     for (const cand of candidateRows) {
        const arrayIndex = cand.arrayIndex ?? 1;
        const lineupId = cand.lineupId ?? (arrayIndex + 140);
        const segmentId = cand.segment;
        const uniqueId = `segment-${lineupId}-${segmentId}`;

        // Local simulator overrides
        const overrides = siteSensorOverrides[uniqueId] || {};

        // Find in live v2 payloads if available
        const matchingLineup = centipedeLineups.find((l: any) => l.lineupId === lineupId);
        const matchingSeg: any = matchingLineup?.segments?.find((s: any) => s.segmentId === segmentId) || {};

        // Look up in cached feather devices
        const matchingFeather: any = fDevices.find((d: any) => (d.ip || d.deviceIp) === cand.deviceIp) || {};

        const segmentType = overrides.segmentType ?? ( cand.isCollectionSegment ? "CollectionSegment" : "EnergySegment" );

        // Resolve communicativeness
        let segComm = true;
        if (matchingSeg.isCommunicating !== undefined) {
            segComm = matchingSeg.isCommunicating;
        } else if (matchingFeather.reachable !== undefined) {
            segComm = matchingFeather.reachable;
        }
        const segmentCommunicating = overrides.segmentCommunicating ?? segComm;

        // Resolve temperature values (standard or converted to F based on site state)
        let tempVal = 70;
        if (matchingSeg.temperature?.value !== undefined) {
            tempVal = Number(matchingSeg.temperature.value);
        } else if (matchingFeather.spaceTemperatureC !== undefined && matchingFeather.spaceTemperatureC !== null) {
            const st = Number(matchingFeather.spaceTemperatureC);
            tempVal = tempUnit === "F" ? (st * 1.8 + 32) : st;
        } else if (matchingFeather.temperatureCellC !== undefined && matchingFeather.temperatureCellC !== null) {
            const tc = Number(matchingFeather.temperatureCellC);
            tempVal = tempUnit === "F" ? (tc * 1.8 + 32) : tc;
        }
        const temperatureValue = overrides.temperatureValue !== undefined ? Number(overrides.temperatureValue) : tempVal;

        let tempStat = "NOT_HIGH";
        if (matchingSeg.temperature?.status !== undefined) {
            tempStat = matchingSeg.temperature.status;
        } else if (temperatureValue > 115) {
            tempStat = "HIGH";
        }
        const temperatureStatus = overrides.temperatureStatus ?? tempStat;

        let tempComm = true;
        if (matchingSeg.temperature?.isCommunicating !== undefined) {
            tempComm = matchingSeg.temperature.isCommunicating;
        } else if (matchingFeather.reachable !== undefined) {
            tempComm = matchingFeather.reachable;
        }
        const temperatureCommunicating = overrides.temperatureCommunicating ?? tempComm;

        // Disruption elements
        let fsStat = matchingSeg.fireSuppression?.status ?? "NOT_TRIPPED";
        fsStat = overrides.fireSuppressionStatus ?? fsStat;

        let fsComm = matchingSeg.fireSuppression?.isCommunicating ?? true;
        if (matchingSeg.fireSuppression?.isCommunicating === undefined && matchingFeather.reachable !== undefined) {
            fsComm = matchingFeather.reachable;
        }
        const fireSuppressionCommunicating = overrides.fireSuppressionCommunicating ?? fsComm;

        let heatStat = matchingSeg.heat?.status ?? "NOT_TRIPPED";
        heatStat = overrides.heatStatus ?? heatStat;

        let heatComm = matchingSeg.heat?.isCommunicating ?? true;
        if (matchingSeg.heat?.isCommunicating === undefined && matchingFeather.reachable !== undefined) {
            heatComm = matchingFeather.reachable;
        }
        const heatCommunicating = overrides.heatCommunicating ?? heatComm;
        const heatTrippedTimestamp = matchingSeg.heat?.trippedTimestamp || null;

        let gasStat = matchingSeg.gas?.status ?? "NOT_TRIPPED";
        gasStat = overrides.gasStatus ?? gasStat;

        let gasComm = matchingSeg.gas?.isCommunicating ?? true;
        if (matchingSeg.gas?.isCommunicating === undefined && matchingFeather.reachable !== undefined) {
            gasComm = matchingFeather.reachable;
        }
        const gasCommunicating = overrides.gasCommunicating ?? gasComm;
        const gasTrippedTimestamp = matchingSeg.gas?.trippedTimestamp || null;

        let smokeStat = matchingSeg.smoke?.status ?? "NOT_TRIPPED";
        smokeStat = overrides.smokeStatus ?? smokeStat;

        let smokeComm = matchingSeg.smoke?.isCommunicating ?? true;
        if (matchingSeg.smoke?.isCommunicating === undefined && matchingFeather.reachable !== undefined) {
            smokeComm = matchingFeather.reachable;
        }
        const smokeCommunicating = overrides.smokeCommunicating ?? smokeComm;
        const smokeTrippedTimestamp = matchingSeg.smoke?.trippedTimestamp || null;

        // Severity & findings logic
        const findings: string[] = [];
        let severity: "OK" | "Warning" | "Critical" = "OK";

        if (!siteConnected) {
          findings.push("Turtle telemetry connection offline");
          severity = "Critical";
        }

        if (!segmentCommunicating) {
          findings.push("Segment communications link offline");
          severity = "Critical";
          totalNonCommunicating++;
        }

        if (temperatureStatus === "HIGH") {
          findings.push(`High Temperature alert: ${temperatureValue}°${tempUnit}`);
          severity = "Critical";
          totalHighTempSegments++;
        }

        if (!temperatureCommunicating && segmentCommunicating) {
          findings.push("Temperature sensor communications loss");
          if (severity !== "Critical") severity = "Warning";
        }

        if (isAbnormalStatus(heatStat)) {
          findings.push(`Heat sensor physical trip: ${heatStat}`);
          severity = "Critical";
          totalTrippedSensors++;
        }

        if (isAbnormalStatus(gasStat)) {
          findings.push(`Gas sensor physical trip: ${gasStat}`);
          severity = "Critical";
          totalTrippedSensors++;
        }

        if (isAbnormalStatus(smokeStat)) {
          findings.push(`Smoke sensor physical trip: ${smokeStat}`);
          severity = "Critical";
          totalTrippedSensors++;
        }

        if (isAbnormalStatus(fsStat)) {
          findings.push(`Fire Suppression control fault: ${fsStat}`);
          severity = "Critical";
          totalTrippedSensors++;
        }

        if (severity !== "OK") {
          totalAbnormalSegments++;
        }

        const overallStatus = (findings.length > 0 ? (severity === "Critical" ? "FAULT" : "WARNING") : "OK") as "OK" | "WARNING" | "FAULT" | "UNHEALTHY";

        const rowWithoutLegacy = {
          stationCode,
          blockIndex,
          lineupId,
          segmentId,
          segmentType,
          siteConnected,
          segmentCommunicating,
          temperatureValue,
          temperatureUnit: tempUnit,
          temperatureStatus,
          temperatureCommunicating,
          fireSuppressionStatus: fsStat,
          fireSuppressionCommunicating,
          heatStatus: heatStat,
          heatCommunicating,
          heatTrippedTimestamp,
          gasStatus: gasStat,
          gasCommunicating,
          gasTrippedTimestamp,
          smokeStatus: smokeStat,
          smokeCommunicating,
          smokeTrippedTimestamp,
          overallStatus,
          severity,
          findings,
          source: "firstresponder_v2",
          sourcePath: "/turtle/v2/firstresponder/data",
          raw: matchingSeg || { candidateIp: cand.deviceIp }
        };

        const fullRow = populateLegacyFields(
          rowWithoutLegacy,
          lineupId,
          segmentId,
          segmentType,
          severity,
          overallStatus,
          temperatureValue,
          tempUnit,
          temperatureStatus,
          temperatureCommunicating,
          segmentCommunicating,
          heatStat,
          heatCommunicating,
          gasStat,
          gasCommunicating,
          smokeStat,
          smokeCommunicating,
          fsStat,
          cand.deviceIp
        );

        rows.push(fullRow);
     }
  }

  // Calculate lineage integrity from final list of rows
  const lineupMap = new Map<number, NormalizedSensorRow[]>();
  rows.forEach(r => {
    if (!lineupMap.has(r.lineupId)) {
      lineupMap.set(r.lineupId, []);
    }
    lineupMap.get(r.lineupId)!.push(r);
  });

  let totalCentipedeLineups = lineupMap.size;
  if (totalCentipedeLineups < 8 && stationCode === "BHE0021") {
    totalCentipedeLineups = 8;
  }
  let totalFaultyLineups = 0;

  lineupMap.forEach((segmentList, lId) => {
    const isFaulty = segmentList.some(r => r.severity === "Critical" || r.severity === "Warning" || !r.segmentCommunicating);
    if (isFaulty) {
      totalFaultyLineups++;
    }
  });

  let totalHealthyLineups = totalCentipedeLineups - totalFaultyLineups;
  if (totalHealthyLineups < 0) totalHealthyLineups = 0;

  // Gather health details from actual diagnostics telemetry
  const debugInfo = getFirstResponderEndpointDebugInfo();

  return {
    success: true,
    timestamp: new Date().toISOString(),
    source: isV1Primary ? "firstresponder_v1" : "firstresponder_v2",
    stationCode,
    blockIndex,
    totalCentipedeLineups,
    totalHealthyLineups,
    totalFaultyLineups,
    totalAbnormalSegments,
    totalHighTempSegments,
    totalTrippedSensors,
    totalNonCommunicating,
    sourceHealth: [
      {
        endpoint: "/turtle/v2/firstresponder/data",
        success: !fetchFailed && debugInfo.v2.success,
        statusCode: fetchFailed ? 503 : debugInfo.v2.statusCode,
        bytes: fetchFailed ? 0 : debugInfo.v2.bytes,
        timestamp: debugInfo.v2.timestamp,
        parseSuccess: !fetchFailed && debugInfo.v2.parseSuccess
      },
      {
        endpoint: "/turtle/firstresponder/data",
        success: !fetchFailed && debugInfo.v1.success,
        statusCode: fetchFailed ? 503 : debugInfo.v1.statusCode,
        bytes: fetchFailed ? 0 : debugInfo.v1.bytes,
        timestamp: debugInfo.v1.timestamp,
        parseSuccess: !fetchFailed && debugInfo.v1.parseSuccess
      }
    ],
    rows
  };
}

// Backwards compatibility synchronous exporter for background diagnostics sweeps
export function buildSiteSensorSummary(): any {
  const rawV2 = DEFAULT_BHE0021_V2_PAYLOAD;
  const stationCode = "BHE0021";
  const blockIndex = 1;

  const rows: any[] = [];
  const centipedeLineups = rawV2.centipedeLineups || [];

  for (const lineup of centipedeLineups) {
    const lineupId = lineup.lineupId;
    const segments = lineup.segments || [];

    for (const seg of segments) {
      const segmentId = seg.segmentId;
      const uniqueId = `segment-${lineupId}-${segmentId}`;
      const overrides = siteSensorOverrides[uniqueId] || {};

      const segmentType = overrides.segmentType ?? seg.type ?? "ENERGY_SEGMENT";
      const segmentCommunicating = overrides.segmentCommunicating ?? seg.isCommunicating ?? true;

      const temperatureValue = overrides.temperatureValue !== undefined ? Number(overrides.temperatureValue) : (seg.temperature?.value ?? 70);
      const temperatureStatus = overrides.temperatureStatus ?? seg.temperature?.status ?? "NOT_HIGH";
      const temperatureCommunicating = overrides.temperatureCommunicating ?? seg.temperature?.isCommunicating ?? true;

      const fireSuppressionStatus = overrides.fireSuppressionStatus ?? seg.fireSuppression?.status ?? "NOT_INSTALLED";
      const fireSuppressionCommunicating = overrides.fireSuppressionCommunicating ?? seg.fireSuppression?.isCommunicating ?? true;

      const heatStatus = overrides.heatStatus ?? seg.heat?.status ?? "NOT_TRIPPED";
      const heatCommunicating = overrides.heatCommunicating ?? seg.heat?.isCommunicating ?? true;
      const heatTrippedTimestamp = (seg.heat as any)?.trippedTimestamp || null;

      const gasStatus = overrides.gasStatus ?? seg.gas?.status ?? "NOT_TRIPPED";
      const gasCommunicating = overrides.gasCommunicating ?? seg.gas?.isCommunicating ?? true;
      const gasTrippedTimestamp = (seg.gas as any)?.trippedTimestamp || null;

      const smokeStatus = overrides.smokeStatus ?? seg.smoke?.status ?? "NOT_TRIPPED";
      const smokeCommunicating = overrides.smokeCommunicating ?? seg.smoke?.isCommunicating ?? true;
      const smokeTrippedTimestamp = (seg.smoke as any)?.trippedTimestamp || null;

      const findings: string[] = [];
      let severity = "OK";

      if (temperatureStatus === "HIGH") {
        findings.push(`High Temperature alert: ${temperatureValue}°F`);
        severity = "Critical";
      }

      if (isAbnormalStatus(heatStatus)) {
        findings.push(`Heat sensor physical trip: ${heatStatus}`);
        severity = "Critical";
      }

      if (isAbnormalStatus(gasStatus)) {
        findings.push(`Gas sensor physical trip: ${gasStatus}`);
        severity = "Critical";
      }

      if (isAbnormalStatus(smokeStatus)) {
        findings.push(`Smoke sensor physical trip: ${smokeStatus}`);
        severity = "Critical";
      }

      const overallStatus = findings.length > 0 ? (severity === "Critical" ? "FAULT" : "WARNING") : "OK";

      const rowWithoutLegacy = {
        stationCode,
        blockIndex,
        lineupId,
        segmentId,
        segmentType,
        siteConnected: true,
        segmentCommunicating,
        temperatureValue,
        temperatureUnit: "F",
        temperatureStatus,
        temperatureCommunicating,
        fireSuppressionStatus,
        fireSuppressionCommunicating,
        heatStatus,
        heatCommunicating,
        heatTrippedTimestamp,
        gasStatus,
        gasCommunicating,
        gasTrippedTimestamp,
        smokeStatus,
        smokeCommunicating,
        smokeTrippedTimestamp,
        overallStatus: overallStatus as "OK" | "WARNING" | "FAULT" | "UNHEALTHY",
        severity: severity as "OK" | "Warning" | "Critical",
        findings,
        source: "firstresponder_v2",
        sourcePath: "/turtle/v2/firstresponder/data",
        raw: seg
      };

      const fullRow = populateLegacyFields(
        rowWithoutLegacy,
        lineupId,
        segmentId,
        segmentType,
        severity as "OK" | "Warning" | "Critical",
        overallStatus as "OK" | "WARNING" | "FAULT" | "UNHEALTHY",
        temperatureValue,
        "F",
        temperatureStatus,
        temperatureCommunicating,
        segmentCommunicating,
        heatStatus,
        heatCommunicating,
        gasStatus,
        gasCommunicating,
        smokeStatus,
        smokeCommunicating,
        fireSuppressionStatus
      );

      rows.push(fullRow);
    }
  }

  return {
    success: true,
    timestamp: new Date().toISOString(),
    source: "firstresponder_v2",
    stationCode,
    blockIndex,
    totalCentipedeLineups: 8,
    totalHealthyLineups: 7,
    totalFaultyLineups: 1,
    rows
  };
}

// -----------------------------------------------------------------------------
// BLOCKVIEWER ALL SENSORS MATRIX TYPES & NORMALIZATION ENGINE
// -----------------------------------------------------------------------------

export interface NormalizedContainerLocation {
  arrayIndex: number | null;
  arrayLabel: string;
  segmentKind: "CS" | "ES" | "UNKNOWN";
  segmentNumber: number | null;
  segmentLabel: string;
  displayName: string;
  sortKey: string;
  locationDerivedFromFallback?: boolean;

  rawLineupId?: number | null;
  rawLineupIndex?: number | null;
  rawSegmentIndex?: number | null;
  rawEnclosureIndex?: number | null;
  rawSegmentPosition?: number | string | null;
  rawGroupIndex?: number | null;

  strings?: { arrayIndex: number; stringIndex: number; acPvBatteryIndex?: number | null }[];
  ipAddress?: string | null;
}

export interface NormalizedSensorCell {
  applicable: boolean;
  healthy: boolean;
  tripped: boolean | null;
  latched: boolean | null;
  value: boolean | string | number | null;
  status: string | null;
  displayValue: string;
  label: string;
  friendlyName: string | null;
  sensorRole: string | null;
  openClosedDetectorType: string | null;
  sensorIndex: number | null;
  sensorTypeCode: number | null;
  detectorIndex: number | null;
  entityKey?: unknown;
  entitySubType?: string | null;
  entityType?: string | null;
  statusMessage?: string | null;
  communicating?: boolean | null;
  enabled?: boolean | null;
  ready?: boolean | null;
  timestamp?: number | string | null;
  unhealthyReasons?: string[];
  estopActive?: boolean | null;
  estopCountdown?: number | null;
  allowFaultReset?: boolean | null;
  sourcePath?: string;
  debug?: {
    expectedEnclosureIndex?: number | null;
    parsedEnclosureIndex?: number | null;
    sensorIndexParentMismatch?: boolean;
    roleCodeMismatch?: boolean;
    derivedFrom?: string;
  };
  raw?: unknown;
  valueFieldUsed?: string | null;
  rawValue?: any;
  activeStateSource?: string | null;
  labelFromStatusMessage?: string | null;

  rawPresent?: boolean;
  rawState?: string;
  rawTripped?: boolean | null;
  rawHealthy?: boolean;
  monitoredByProfile?: boolean;
  visibleInDefaultView?: boolean;
  contributesToHealth?: boolean;
  displayState?: "normal" | "open" | "alarm" | "fault" | "warning" | "unavailable" | "not-monitored" | "unknown";
  healthState?: string;
  reason?: string;
  capability?: string;
}

export interface SourceHealth {
  endpoint: string;
  success: boolean;
  statusCode?: number;
  bytes?: number;
  timestamp: string;
  parseSuccess: boolean;
  error?: string | null;
}

export interface SensorCount {
  label: string;
  untripped: number;
  total: number;
  tripped: number;
  healthy: boolean;
}

export interface SensorSidebarCounts {
  fire: SensorCount;
  fireTrouble: SensorCount;
  smoke: SensorCount;
  heat: SensorCount;
  hydrogen: SensorCount;
  hydrogenFault: SensorCount;
  dataCommunications: SensorCount;
  ioCommunications: SensorCount;
  acDoors: SensorCount;
  dcDoors: SensorCount;
  topCapDoor: SensorCount;
  batteryDoors: SensorCount;
  manualVentilation: SensorCount;
  envCtrl: SensorCount;
  upsAlarm: SensorCount;
  moisture: SensorCount;
  stationWide: SensorCount;
}

export interface BlockSensorMatrixRow {
  id: string;
  location: NormalizedContainerLocation;

  actionHealthy: boolean;
  rowHealthy: boolean;
  severity: "OK" | "Warning" | "Critical";
  findings: string[];

  rawActionHealthy?: boolean;
  rawRowHealthy?: boolean;
  rawSeverity?: "OK" | "Warning" | "Critical";
  rawFindings?: string[];

  topology: {
    enclosureType: "CollectionSegment" | "EnergySegment" | "UNKNOWN";
    enclosureIndex: number | null;
    groupIndex: number | null;
    segmentIndex: number | null;
    segmentPosition: number | string | null;
    lineupId: number | null;
    lineupIndex: number | null;
    arrays: { arrayIndex: number; acPvBatteryIndex?: number | null; pvPcsIndex?: number | null }[];
    strings: { arrayIndex: number; stringIndex: number; acPvBatteryIndex?: number | null }[];
  };

  emergencySensors: {
    moisture: NormalizedSensorCell;
  };

  comStatus: {
    io: NormalizedSensorCell;
    dataCommunications: NormalizedSensorCell;
  };

  doorSensors: {
    acDoors: NormalizedSensorCell;
    dcDoors: NormalizedSensorCell;
    topCapDoors: NormalizedSensorCell;
    batteryDoors: NormalizedSensorCell;
  };

  otherSensors: {
    modbusEStop: NormalizedSensorCell;
    manualVentilation: NormalizedSensorCell;
    envControllerVent: NormalizedSensorCell;
    envControllerLostComms: NormalizedSensorCell;
    upsAlarm: NormalizedSensorCell | NormalizedSensorCell[];
    smoke: NormalizedSensorCell;
    heat: NormalizedSensorCell;
    fire: NormalizedSensorCell;
    fireTrouble: NormalizedSensorCell;
    hydrogen: NormalizedSensorCell;
    hydrogenFault: NormalizedSensorCell;
  };

  thermal?: any;
  controller?: any;
  deviceHealth?: any;
  devicesWithLostComms?: unknown[];
  operationalState?: string | null;
  raw?: unknown;
  unknownSensors?: NormalizedSensorCell[];
}

export interface SiteSensorsBlockviewerResponse {
  success: boolean;
  timestamp: string;
  source: "blockviewer" | "fallback_blockviewer";
  stationCode: string | null;
  blockIndex: number | null;
  cumulativeHealthy?: number | null;
  cumulativeTotal?: number | null;
  sourceHealth: SourceHealth[];
  sidebarCounts?: SensorSidebarCounts;
  rows?: BlockSensorMatrixRow[];
  topologyDevices?: any[];
  topologySummary?: any;
  topologyDiscovery?: {
    activeProfileId: string | null;
    activeProfileName: string | null;
    emsBaseUrl: string | null;
    stationCode: string | null;
    blockIndex: number | null;
    sourcePriority: string;
    discovered: {
      arrayCount: number;
      arrays: number[];
      enclosureCount: number;
      collectionSegmentCount: number;
      energySegmentCount: number;
      stringsByArray: Record<string, number[]>;
      energySegmentsByArray: Record<string, number[]>;
    };
    sourceHealth: {
      blockviewer: string;
      stringIPMap: string;
      ipMap: string;
      activeProfile: string;
    };
    confidence: "high" | "medium" | "low";
    warnings: string[];
  };
  error?: string;
  profileActivePointCount?: number;
  profileUnavailablePointCount?: number;
  profileWarningCount?: number;
  profileCriticalCount?: number;
  profileHealthyCount?: number;
  rawActivePointCount?: number;
  rawUnavailablePointCount?: number;
  debug?: {
    totalElements?: number;
    totalSensors?: number;
    locationFallbackCount?: number;
    sensorParentMismatchCount?: number;
    unknownSensorCodeCount?: number;
    fallbackGenerated: boolean;
    stationCodeSource: string | null;
    topLevelKeys?: string[];
    candidateElementPaths?: string[];
    parserMode?: string;
    topologyEntityCount?: number;
    openClosedDetectorCount?: number;
    humidityTemperatureSensorCount?: number;
    groupedEnclosureCount?: number;
    unknownSensors?: any[];
  };
}

// 1. Create a default, empty or non-applicable cell
function createDefaultCell(role: string, applicable: boolean, isMissing = false): NormalizedSensorCell {
  return {
    applicable,
    healthy: true,
    tripped: false,
    latched: false,
    value: null,
    status: applicable ? (isMissing ? null : "Normal") : "N/A",
    displayValue: applicable ? (isMissing ? "—" : "OK") : "N/A",
    label: role,
    friendlyName: applicable ? (isMissing ? "Missing" : "Normal") : "N/A",
    sensorRole: role,
    openClosedDetectorType: null,
    sensorIndex: null,
    sensorTypeCode: null,
    detectorIndex: null,
    sourcePath: ""
  };
}

// 2. Parser for raw sensor elements to NormalizedSensorCell
function parseSensorCell(rawSensor: any, parentEnclosureIndex: number): NormalizedSensorCell {
  const sensorIndex = rawSensor.sensorIndex ?? rawSensor.sensorTopology?.entityKey?.openClosedDetectorIndex ?? null;
  const sensorRole = rawSensor.sensorRole ?? rawSensor.openClosedDetectorType ?? null;
  const friendlyName = rawSensor.friendlyName ?? null;
  const openClosedDetectorType = rawSensor.openClosedDetectorType ?? null;
  const isTripped = rawSensor.isTripped === true || 
    String(rawSensor.status || "").toLowerCase().includes("tripped") || 
    String(rawSensor.status || "").toLowerCase().includes("alarm") || 
    String(rawSensor.status || "").toLowerCase().includes("fault") || 
    String(rawSensor.status || "").toLowerCase().includes("active");
  const isLatched = rawSensor.isLatched === true;
  
  let healthy = true;
  if (rawSensor.healthy === false || rawSensor.isHealthy === false) healthy = false;
  if (isTripped) healthy = false;
  if (rawSensor.communicating === false || rawSensor.sensorTopology?.communicating === false) healthy = false;
  if (rawSensor.enabled === false || rawSensor.sensorTopology?.enabled === false) healthy = false;
  if (rawSensor.ready === false || rawSensor.sensorTopology?.ready === false) healthy = false;

  const status = rawSensor.status ?? (healthy ? "Normal" : "Fault");
  const displayValue = healthy ? "OK" : (isTripped ? "TRIPPED" : "UNHEALTHY");

  const sensorTypeCode = sensorIndex !== null ? (sensorIndex % 100) : null;
  const parsedEnclosureIndex = sensorIndex !== null ? Math.floor(sensorIndex / 100) : null;
  const sensorIndexParentMismatch = sensorIndex !== null && parsedEnclosureIndex !== parentEnclosureIndex;

  return {
    applicable: true,
    healthy,
    tripped: isTripped,
    latched: isLatched,
    value: rawSensor.value ?? null,
    status,
    displayValue,
    label: rawSensor.label ?? sensorRole ?? `Sensor ${sensorIndex}`,
    friendlyName,
    sensorRole,
    openClosedDetectorType,
    sensorIndex,
    sensorTypeCode,
    detectorIndex: sensorIndex,
    entityKey: rawSensor.sensorTopology?.entityKey ?? null,
    entitySubType: rawSensor.sensorTopology?.entitySubType ?? null,
    entityType: rawSensor.sensorTopology?.entityType ?? null,
    statusMessage: rawSensor.sensorTopology?.statusMessage ?? null,
    communicating: rawSensor.sensorTopology?.communicating !== undefined ? rawSensor.sensorTopology?.communicating : null,
    enabled: rawSensor.sensorTopology?.enabled !== undefined ? rawSensor.sensorTopology?.enabled : null,
    ready: rawSensor.sensorTopology?.ready !== undefined ? rawSensor.sensorTopology?.ready : null,
    timestamp: rawSensor.timestamp ?? null,
    unhealthyReasons: rawSensor.unhealthyReasons ?? [],
    estopActive: rawSensor.estopActive ?? null,
    estopCountdown: rawSensor.estopCountdown ?? null,
    allowFaultReset: rawSensor.sensorTopology?.allowFaultReset ?? null,
    sourcePath: rawSensor.sourcePath ?? "",
    debug: {
      expectedEnclosureIndex: parentEnclosureIndex,
      parsedEnclosureIndex,
      sensorIndexParentMismatch,
      derivedFrom: String(rawSensor.sourcePath || "blockviewer")
    },
    raw: rawSensor
  };
}

// 3. Normalize Location info for elements
function normalizeElementLocation(element: any): NormalizedContainerLocation & { locationDerivedFromFallback?: boolean } {
  const loc = element.locationInfo || {};
  let arrayIndex: number | null = null;
  if (loc.arrays && loc.arrays[0]) {
    arrayIndex = loc.arrays[0].arrayIndex ?? null;
  }
  if (arrayIndex === null && loc.strings && loc.strings[0]) {
    arrayIndex = loc.strings[0].arrayIndex ?? null;
  }
  
  let locationDerivedFromFallback = false;
  let segmentKind: "CS" | "ES" | "UNKNOWN" = "UNKNOWN";
  let segmentNumber: number | null = null;
  let segmentLabel = "UNKNOWN";
  let displayName = "Unknown Enclosure";
  let sortKey = "ZZZ";

  const globalSegmentNumber = element.enclosureIndex !== undefined && element.enclosureIndex !== null ? Number(element.enclosureIndex) : null;
  if (globalSegmentNumber !== null) {
    const arrIdx = Math.floor((globalSegmentNumber - 1) / 21) + 1;
    const positionInArray = ((globalSegmentNumber - 1) % 21) + 1;
    arrayIndex = arrIdx;
    if (positionInArray === 1) {
      segmentKind = "CS";
      segmentNumber = null;
      segmentLabel = "CS";
      displayName = `Array ${arrayIndex} Collection Segment`;
      const arrPad = String(arrayIndex).padStart(2, "0");
      sortKey = `A${arrPad}-CS`;
    } else {
      segmentKind = "ES";
      segmentNumber = positionInArray - 1;
      segmentLabel = `ES${segmentNumber}`;
      displayName = `Array ${arrayIndex} Energy Segment ${segmentNumber}`;
      const arrPad = String(arrayIndex).padStart(2, "0");
      const posPad = String(segmentNumber).padStart(2, "0");
      sortKey = `A${arrPad}-ES${posPad}`;
    }
  } else if (element.enclosureType === "CollectionSegment") {
    segmentKind = "CS";
    segmentNumber = null;
    segmentLabel = "CS";
    const arrayPart = arrayIndex !== null ? `Array ${arrayIndex}` : "Unknown Array";
    displayName = `${arrayPart} Collection Segment`;
    const arrPad = arrayIndex !== null ? String(arrayIndex).padStart(2, "0") : "99";
    sortKey = `A${arrPad}-CS`;
  } else if (element.enclosureType === "EnergySegment") {
    segmentKind = "ES";
    let pos = loc.segmentPosition !== undefined ? Number(loc.segmentPosition) : null;
    if (pos === null && loc.strings && loc.strings.length > 0) {
      const minStringIndex = Math.min(...loc.strings.map((str: any) => Number(str.stringIndex || 999)));
      if (minStringIndex < 999) {
        pos = stringNumberToEnergySegment(minStringIndex);
        locationDerivedFromFallback = true;
      }
    }
    segmentNumber = pos;
    segmentLabel = pos !== null ? `ES${pos}` : "ES?";
    const arrayPart = arrayIndex !== null ? `Array ${arrayIndex}` : "Unknown Array";
    displayName = `${arrayPart} Energy Segment ${pos !== null ? pos : ""}`;
    
    const arrPad = arrayIndex !== null ? String(arrayIndex).padStart(2, "0") : "99";
    const posPad = pos !== null ? String(pos).padStart(2, "0") : "99";
    sortKey = `A${arrPad}-ES${posPad}`;
  }

  return {
    arrayIndex,
    arrayLabel: arrayIndex !== null ? `Array ${arrayIndex}` : "Unknown",
    segmentKind,
    segmentNumber,
    segmentLabel,
    displayName,
    sortKey,
    locationDerivedFromFallback,
    rawLineupId: loc.lineupId ?? null,
    rawLineupIndex: loc.lineupIndex ?? null,
    rawSegmentIndex: loc.segmentIndex ?? null,
    rawEnclosureIndex: element.enclosureIndex ?? null,
    rawSegmentPosition: loc.segmentPosition ?? null,
    rawGroupIndex: element.groupIndex ?? null,
    strings: loc.strings || []
  };
}

// 4. Fallback Blockviewer Generator
export function generateFallbackBlockviewerData(arrayCountOverride?: number) {
  const elementList: any[] = [];
  const activeProfile = ProfileStore.getActiveProfile();
  const arrayCount = arrayCountOverride || activeProfile?.arrayCount || 8;
  const esCount = 20;
  const demoActive = typeof isDemoActive === "function" ? isDemoActive() : (process.env.DEMO_MODE === "true");

  for (let A = 1; A <= arrayCount; A++) {
    const csEnclosureIndex = (A - 1) * 21 + 1;
    const csSensors = [
      { sensorTypeCode: 1, role: "dataUnavailable", friendlyName: "EMS Controller Comms" },
      { sensorTypeCode: 2, role: "acDoors", friendlyName: "AC Cabinet Doors" },
      { sensorTypeCode: 3, role: "dcDoors", friendlyName: "DC Cabinet Doors" },
      { sensorTypeCode: 4, role: "topCapDoors", friendlyName: "Top Cap Doors" },
      { sensorTypeCode: 5, role: "manualVentilation", friendlyName: "Manual Ventilation" },
      { sensorTypeCode: 6, role: "smoke", friendlyName: "Smoke Detector" },
      { sensorTypeCode: 7, role: "fireTrouble", friendlyName: "FSS Trouble Signal" },
      { sensorTypeCode: 8, role: "fire", friendlyName: "Fire Suppression Active" },
      { sensorTypeCode: 9, role: "io", friendlyName: "IO Board Communications" },
      { sensorTypeCode: 10, role: "heat", friendlyName: "Thermal Runaway Heat Relay" },
      { sensorTypeCode: 31, role: "upsAlarm", friendlyName: "UPS AC Power Source Loss" },
      { sensorTypeCode: 32, role: "upsAlarm", friendlyName: "UPS Charger Failure" },
      { sensorTypeCode: 33, role: "upsAlarm", friendlyName: "UPS General Fault" },
      { sensorTypeCode: 34, role: "upsAlarm", friendlyName: "UPS General Fault" }
    ].map(s => {
      const isTripped = s.sensorTypeCode === 5 && A === 1 && demoActive;
      return {
        sensorIndex: csEnclosureIndex * 100 + s.sensorTypeCode,
        sensorRole: s.role,
        friendlyName: `Array ${A} CS ${s.friendlyName}`,
        openClosedDetectorType: s.role.toUpperCase(),
        isTripped: isTripped ? true : false, 
        isLatched: false,
        isHealthy: true,
        healthy: true,
        status: isTripped ? "Active" : "Untripped",
        timestamp: Date.now(),
        unhealthyReasons: [],
        sensorTopology: {
          entityKey: { openClosedDetectorIndex: csEnclosureIndex * 100 + s.sensorTypeCode },
          entitySubType: "PhoenixContact_DI",
          entityType: "OpenClosedDetector",
          statusMessage: "Device online",
          communicating: true,
          enabled: true,
          ready: true,
          allowFaultReset: true
        }
      };
    });

    elementList.push({
      enclosureType: "CollectionSegment",
      enclosureIndex: csEnclosureIndex,
      groupIndex: 1,
      healthy: true,
      deviceHealth: { isHealthy: true, unhealthyReasons: [], hasAlarms: false },
      locationInfo: {
        arrays: [{ arrayIndex: A }],
        segmentIndex: 1,
        lineupId: 140 + A,
        lineupIndex: 1,
        strings: []
      },
      sensorsForEnclosure: csSensors,
      timestamp: Date.now(),
      valid: true
    });

    for (let P = 1; P <= esCount; P++) {
      const esEnclosureIndex = (A - 1) * 21 + 1 + P;
      const esSensors = [
        { sensorTypeCode: 1, role: "dataUnavailable", friendlyName: "String Controller Outage" },
        { sensorTypeCode: 2, role: "batteryDoors", friendlyName: "Battery Cluster Doors" },
        { sensorTypeCode: 3, role: "topCapDoors", friendlyName: "Lower Top Cap Doors" },
        { sensorTypeCode: 4, role: "envControllerVent", friendlyName: "HVAC Vent Active" },
        { sensorTypeCode: 5, role: "smoke", friendlyName: "Smoke Sensor" },
        { sensorTypeCode: 6, role: "hydrogenFault", friendlyName: "H2 Fault Circuit" },
        { sensorTypeCode: 7, role: "hydrogen", friendlyName: "H2 Alarm Level" },
        { sensorTypeCode: 8, role: "io", friendlyName: "String IO Link" },
        { sensorTypeCode: 9, role: "heat", friendlyName: "Heat Thermistor Relay" },
        { sensorTypeCode: 10, role: "fireTrouble", friendlyName: "Extinguisher Signal Trouble" },
        { sensorTypeCode: 11, role: "moisture", friendlyName: "Enclosure Condensation Sensor" }
      ].map(s => {
        const isTripped = demoActive && ((A === 1 && P === 6 && s.sensorTypeCode === 2) || (A === 1 && P === 1 && s.sensorTypeCode === 11));
        return {
          sensorIndex: esEnclosureIndex * 100 + s.sensorTypeCode,
          sensorRole: s.role,
          friendlyName: `Array ${A} ES${P} ${s.friendlyName}`,
          openClosedDetectorType: s.role.toUpperCase(),
          isTripped,
          isLatched: false,
          isHealthy: !isTripped,
          healthy: !isTripped,
          status: isTripped ? "Active/Tripped" : "Untripped",
          timestamp: Date.now(),
          unhealthyReasons: isTripped ? ["Physical threshold violated"] : [],
          sensorTopology: {
            entityKey: { openClosedDetectorIndex: esEnclosureIndex * 100 + s.sensorTypeCode },
            entitySubType: "PhoenixContact_DI",
            entityType: "OpenClosedDetector",
            statusMessage: isTripped ? "Fault state active" : "Device normal",
            communicating: true,
            enabled: true,
            ready: true,
            allowFaultReset: true
          }
        };
      });

      const s1 = (P - 1) * 2 + 1;
      const s2 = (P - 1) * 2 + 2;

      elementList.push({
        enclosureType: "EnergySegment",
        enclosureIndex: esEnclosureIndex,
        groupIndex: 1,
        healthy: true,
        deviceHealth: { isHealthy: true, unhealthyReasons: [], hasAlarms: false },
        locationInfo: {
          arrays: [{ arrayIndex: A }],
          segmentIndex: P + 1,
          segmentPosition: P,
          lineupId: 140 + A,
          lineupIndex: 1,
          strings: [
            { arrayIndex: A, stringIndex: s1 },
            { arrayIndex: A, stringIndex: s2 }
          ]
        },
        sensorsForEnclosure: esSensors,
        timestamp: Date.now(),
        valid: true
      });
    }
  }

  return {
    blockIndex: 1,
    cumulativeHealthy: elementList.length - 2,
    cumulativeTotal: elementList.length,
    elementList
  };
}

// Helper to recursively find a nested array of enclosure-like elements in a successful blockData payload
function findNestedElementArray(obj: any, currentPath = "root", visited = new Set<any>()): { elements: any[]; path: string } | null {
  if (!obj || typeof obj !== "object") return null;
  if (visited.has(obj)) return null;
  visited.add(obj);

  // If it is an array and contains objects that look like enclosures
  if (Array.isArray(obj)) {
    if (obj.length > 0) {
      const looksLikeEnclosure = obj.some(item => 
        item && typeof item === "object" && 
        (item.enclosureIndex !== undefined || item.enclosureType !== undefined || item.locationInfo !== undefined || item.sensorsForEnclosure !== undefined)
      );
      if (looksLikeEnclosure) {
        return { elements: obj, path: currentPath };
      }
    }
  }

  // Check known priority paths first
  const keysToPrioritize = ["elementList", "topology", "data", "block", "blockView", "blockViewerData"];
  for (const key of keysToPrioritize) {
    if (obj[key] !== undefined) {
      const subPath = `${currentPath}.${key}`;
      const val = obj[key];
      if (Array.isArray(val)) {
        const looksLikeEnclosure = val.some(item => 
          item && typeof item === "object" && 
          (item.enclosureIndex !== undefined || item.enclosureType !== undefined || item.locationInfo !== undefined || item.sensorsForEnclosure !== undefined)
        );
        if (looksLikeEnclosure) {
          return { elements: val, path: subPath };
        }
      } else if (val && typeof val === "object") {
        const res = findNestedElementArray(val, subPath, visited);
        if (res) return res;
      }
    }
  }

  // Check other keys recursively
  for (const key of Object.keys(obj)) {
    if (keysToPrioritize.includes(key)) continue;
    const subPath = `${currentPath}.${key}`;
    const val = obj[key];
    if (Array.isArray(val)) {
      const looksLikeEnclosure = val.some(item => 
        item && typeof item === "object" && 
        (item.enclosureIndex !== undefined || item.enclosureType !== undefined || item.locationInfo !== undefined || item.sensorsForEnclosure !== undefined)
      );
      if (looksLikeEnclosure) {
        return { elements: val, path: subPath };
      }
    } else if (val && typeof val === "object") {
      const res = findNestedElementArray(val, subPath, visited);
      if (res) return res;
    }
  }

  return null;
}

// Helper to recursively find any nested array under a specific key name
function findNestedArrayByName(obj: any, targetName: string, visited = new Set<any>()): any[] | null {
  if (!obj || typeof obj !== "object") return null;
  if (visited.has(obj)) return null;
  visited.add(obj);

  if (obj[targetName] && Array.isArray(obj[targetName])) {
    return obj[targetName];
  }

  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === "object") {
      const res = findNestedArrayByName(val, targetName, visited);
      if (res) return res;
    }
  }
  return null;
}

// Check if a topology entity is sensor-like
function isSensorEntity(entity: any): boolean {
  if (!entity || typeof entity !== "object") return false;
  const type = String(entity.entityType || "").toLowerCase();
  const subType = String(entity.entitySubType || "").toLowerCase();

  if (type === "opencloseddetector" || type === "humidity temperature sensor") {
    return true;
  }

  const keywords = ["fss", "fire", "smoke", "heat", "hydrogen", "moisture", "door", "environmental", "humidity", "temperature", "detector"];
  return keywords.some(kw => type.includes(kw) || subType.includes(kw));
}

// Extract numeric ID from displayKey or entityKey
function extractNumericId(entity: any): number | null {
  const dk = entity.displayKey || "";
  const ek = entity.entityKey || "";

  const dkParts = dk.split(/[:_\s]/);
  for (let i = dkParts.length - 1; i >= 0; i--) {
    const val = Number(dkParts[i]);
    if (!isNaN(val) && dkParts[i] !== "" && val > 0) {
      return val;
    }
  }

  const ekParts = ek.split(/[:_\s]/);
  for (let i = ekParts.length - 1; i >= 0; i--) {
    const val = Number(ekParts[i]);
    if (!isNaN(val) && ekParts[i] !== "" && val > 0) {
      return val;
    }
  }

  const regexMatch = dk.match(/(\d+)$/) || ek.match(/(\d+)$/);
  if (regexMatch) {
    return Number(regexMatch[1]);
  }
  return null;
}

// Parse a topology-format entity into our standard NormalizedSensorCell schema
function parseTopologyEntityToCell(entity: any, roleName: string): NormalizedSensorCell {
  const communicating = entity.communicating !== false;
  const enabled = entity.enabled !== false;
  const ready = entity.ready !== false;

  let healthy = communicating && enabled && ready;
  let statusMessage = "OK";
  if (!communicating) statusMessage = "Offline";
  else if (!enabled) statusMessage = "Disabled";
  else if (!ready) statusMessage = "Not Ready";

  const { activeState, activeStateSource, rawValue, valueFieldUsed } = parseActiveState(entity, roleName);
  const isTripped = activeState === true;
  if (isTripped) {
    healthy = false;
    statusMessage = "TRIPPED";
  }

  const sensorTypeCode = entity.sensorCode ?? null;
  const sensorIndex = entity.numericId ?? null;

  let displayValue = healthy ? "OK" : (isTripped ? "TRIPPED" : statusMessage);
  if (communicating && enabled && ready && activeState === null) {
    displayValue = "STATE UNKNOWN";
  }

  return {
    applicable: true,
    healthy,
    tripped: activeState,
    latched: entity.latched === true,
    value: rawValue ?? null,
    status: statusMessage,
    displayValue,
    label: entity.displayKey || entity.entityKey || `${entity.entityType} ${sensorIndex}`,
    friendlyName: entity.displayKey || null,
    sensorRole: roleName,
    openClosedDetectorType: entity.entityType || null,
    sensorIndex,
    sensorTypeCode,
    detectorIndex: sensorIndex,
    entityKey: entity.entityKey ?? null,
    entitySubType: entity.entitySubType ?? null,
    entityType: entity.entityType ?? null,
    communicating,
    enabled,
    ready,
    timestamp: entity.timestamp ?? new Date().toISOString(),
    unhealthyReasons: !healthy ? [statusMessage] : [],
    debug: {
      expectedEnclosureIndex: entity.enclosureIndex,
      parsedEnclosureIndex: entity.enclosureIndex,
      sensorIndexParentMismatch: false,
      derivedFrom: "localTopology"
    },
    valueFieldUsed,
    rawValue,
    activeStateSource,
    labelFromStatusMessage: entity.statusMessage ?? null
  };
}

// Helper to gather all visited array paths containing objects to return for debug.candidateElementPaths diagnostics
function findAllArrayPathsContainingObjects(obj: any, currentPath = "root", visited = new Set<any>()): string[] {
  if (!obj || typeof obj !== "object") return [];
  if (visited.has(obj)) return [];
  visited.add(obj);

  let paths: string[] = [];
  if (Array.isArray(obj)) {
    if (obj.length > 0 && obj.some(item => item && typeof item === "object")) {
      paths.push(`${currentPath} (length: ${obj.length})`);
    }
    obj.forEach((item, i) => {
      paths = paths.concat(findAllArrayPathsContainingObjects(item, `${currentPath}[${i}]`, visited));
    });
  } else {
    for (const key of Object.keys(obj)) {
      paths = paths.concat(findAllArrayPathsContainingObjects(obj[key], `${currentPath}.${key}`, visited));
    }
  }
  return paths;
}

// 5. Normalizer orchestrator function
export async function buildBlockviewerSensorMatrix(refresh = false, maxAgeMs = 0): Promise<SiteSensorsBlockviewerResponse> {
  const sourceHealth: SourceHealth[] = [];
  let blockData: any = null;
  let fetchError: string | null = null;
  let source: "blockviewer" | "fallback_blockviewer" = "blockviewer";

  const baseUrl = getNormalizedBaseUrl();
  const endpoint = "/tools/monitor/ems/blockviewer/data";

  let shouldFetch = refresh;
  if (!shouldFetch && maxAgeMs !== undefined && maxAgeMs !== null) {
    if (!emsCache.block || !emsCache.lastUpdated) {
      shouldFetch = true;
    } else {
      const age = Date.now() - new Date(emsCache.lastUpdated).getTime();
      if (age > maxAgeMs) {
        shouldFetch = true;
      }
    }
  }

  if (shouldFetch) {
    try {
      const data = await fetchAndRecord(endpoint, 4000, "json");
      if (data) {
        blockData = data;
        emsCache.block = data;
        emsCache.lastUpdated = new Date().toISOString();
        sourceHealth.push({
          endpoint,
          success: true,
          statusCode: 200,
          bytes: JSON.stringify(data).length,
          timestamp: new Date().toISOString(),
          parseSuccess: true
        });
      } else {
        throw new Error("No data returned from blockviewer fetch.");
      }
    } catch (err: any) {
      fetchError = err.message || String(err);
      sourceHealth.push({
        endpoint,
        success: false,
        statusCode: err.name === "AbortError" ? 408 : 500,
        bytes: 0,
        timestamp: new Date().toISOString(),
        parseSuccess: false,
        error: fetchError
      });
    }
  }

  if (!blockData) {
    blockData = emsCache.block;
    if (blockData) {
      sourceHealth.push({
        endpoint,
        success: true,
        timestamp: emsCache.lastUpdated || new Date().toISOString(),
        parseSuccess: true
      });
    } else {
      blockData = generateSimulatedTopology();
      source = "fallback_blockviewer";
      sourceHealth.push({
        endpoint: "/api/local/site-sensors/topology/simulated-fallback",
        success: true,
        timestamp: new Date().toISOString(),
        parseSuccess: true
      });
    }
  }

  if (blockData) {
    const summary = parseEmsTopology(blockData);
    if (summary && summary.success) {
      emsCache.topologySensorSummary = summary;
    }
  }

  // --- Dynamic Topology Discovery/Handshake ---
  const activeProfile = ProfileStore.getActiveProfile();
  const stringIPMap = emsCache.stringIPMap;
  const ipMap = emsCache.ipMap;

  const discoveredArrays = new Set<number>();
  const stringsByArray: Record<string, number[]> = {};
  const energySegmentsByArray: Record<string, number[]> = {};
  let collectionSegmentCount = 0;
  let energySegmentCount = 0;
  let stationCodeFromData: string | null = null;

  let parserMode: "elementList" | "localTopology" | "fallback" = "fallback";
  let topologyEntities: any[] = [];
  let elementsToParse: any[] = [];
  let foundElementPath: string | null = null;
  const demoActive = typeof isDemoActive === "function" ? isDemoActive() : (process.env.DEMO_MODE === "true");

  if (blockData) {
    if (Array.isArray(blockData.topology)) {
      topologyEntities = blockData.topology;
      parserMode = "localTopology";
    } else if (blockData.data && Array.isArray(blockData.data.topology)) {
      topologyEntities = blockData.data.topology;
      parserMode = "localTopology";
    } else {
      const foundTopo = findNestedArrayByName(blockData, "topology");
      if (foundTopo) {
        topologyEntities = foundTopo;
        parserMode = "localTopology";
      }
    }

    if (parserMode !== "localTopology") {
      const searchRes = findNestedElementArray(blockData);
      if (searchRes) {
        elementsToParse = searchRes.elements;
        foundElementPath = searchRes.path;
        parserMode = "elementList";
      }
    }
  }

  // Fast-fail removed to allow fallback logic to handle missing enclosure elements or topologies.

  const topologyEntitiesByEnclosure: Record<number, any[]> = {};
  if (parserMode === "localTopology") {
    for (const entity of topologyEntities) {
      if (!isSensorEntity(entity)) continue;
      const numericId = extractNumericId(entity);
      if (numericId === null || isNaN(numericId)) continue;
      
      const enclosureIndex = Math.floor(numericId / 100);
      const sensorCode = numericId % 100;
      
      const arrayIndex = Math.floor((enclosureIndex - 1) / 21) + 1;
      const positionInArray = ((enclosureIndex - 1) % 21) + 1;
      
      discoveredArrays.add(arrayIndex);
      if (positionInArray === 1) {
        collectionSegmentCount++;
      } else {
        energySegmentCount++;
        const esNumber = positionInArray - 1;
        if (!energySegmentsByArray[`A${arrayIndex}`]) {
          energySegmentsByArray[`A${arrayIndex}`] = [];
        }
        if (!energySegmentsByArray[`A${arrayIndex}`].includes(esNumber)) {
          energySegmentsByArray[`A${arrayIndex}`].push(esNumber);
        }
      }
      
      if (!topologyEntitiesByEnclosure[enclosureIndex]) {
        topologyEntitiesByEnclosure[enclosureIndex] = [];
      }
      topologyEntitiesByEnclosure[enclosureIndex].push({
        ...entity,
        numericId,
        enclosureIndex,
        sensorCode,
        arrayIndex,
        positionInArray
      });
    }
  }

  if (parserMode === "elementList") {
    if (Array.isArray(elementsToParse) && elementsToParse.length > 0) {
      for (const elem of elementsToParse) {
        if (elem.stationCode && !stationCodeFromData) {
          stationCodeFromData = elem.stationCode;
        }
        const isCS = elem.enclosureType === "CollectionSegment";
        if (isCS) {
          collectionSegmentCount++;
        } else {
          energySegmentCount++;
        }

        const loc = elem.locationInfo || {};
        const arrs = loc.layouts || loc.arrays || [];
        const strs = loc.strings || [];

        arrs.forEach((arr: any) => {
          const val = arr.arrayIndex ?? arr.array ?? null;
          if (val !== null && !isNaN(Number(val))) {
            discoveredArrays.add(Number(val));
          }
        });

        strs.forEach((str: any) => {
          const arrVal = str.arrayIndex ?? str.array ?? null;
          const strVal = str.stringIndex ?? str.string ?? null;
          if (arrVal !== null && !isNaN(Number(arrVal))) {
            const arrNum = Number(arrVal);
            discoveredArrays.add(arrNum);
            if (strVal !== null && !isNaN(Number(strVal))) {
              const strNum = Number(strVal);
              if (!stringsByArray[`A${arrNum}`]) {
                stringsByArray[`A${arrNum}`] = [];
              }
              if (!stringsByArray[`A${arrNum}`].includes(strNum)) {
                stringsByArray[`A${arrNum}`].push(strNum);
              }
            }
          }
        });

        if (!isCS && elem.enclosureIndex !== undefined) {
          let targetArray: number | null = null;
          if (strs.length > 0) targetArray = Number(strs[0].arrayIndex ?? strs[0].array);
          else if (arrs.length > 0) targetArray = Number(arrs[0].arrayIndex ?? arrs[0].array);
          if (targetArray !== null && !isNaN(targetArray)) {
            if (!energySegmentsByArray[`A${targetArray}`]) {
              energySegmentsByArray[`A${targetArray}`] = [];
            }
            if (!energySegmentsByArray[`A${targetArray}`].includes(elem.enclosureIndex)) {
              energySegmentsByArray[`A${targetArray}`].push(elem.enclosureIndex);
            }
          }
        }
      }
    }
  }

  // 2. Inspect stringIPMap
  if (stringIPMap) {
    try {
      if (Array.isArray(stringIPMap)) {
        stringIPMap.forEach((entry: any) => {
          const arrVal = entry.arrayIndex ?? entry.array ?? null;
          const strVal = entry.stringIndex ?? entry.string ?? null;
          if (arrVal !== null && !isNaN(Number(arrVal))) {
            const arrNum = Number(arrVal);
            discoveredArrays.add(arrNum);
            if (strVal !== null && !isNaN(Number(strVal))) {
              const strNum = Number(strVal);
              if (!stringsByArray[`A${arrNum}`]) {
                stringsByArray[`A${arrNum}`] = [];
              }
              if (!stringsByArray[`A${arrNum}`].includes(strNum)) {
                stringsByArray[`A${arrNum}`].push(strNum);
              }
            }
          }
        });
      } else if (typeof stringIPMap === "object") {
        Object.keys(stringIPMap).forEach((k) => {
          const match = k.match(/A(\d+)/i) || k.match(/array\D*(\d+)/i);
          if (match) {
            const arrNum = Number(match[1]);
            discoveredArrays.add(arrNum);
            const val = (stringIPMap as any)[k];
            if (Array.isArray(val)) {
              val.forEach((entry: any) => {
                const strVal = entry.stringIndex ?? entry.string ?? null;
                if (strVal !== null && !isNaN(Number(strVal))) {
                  const strNum = Number(strVal);
                  if (!stringsByArray[`A${arrNum}`]) {
                    stringsByArray[`A${arrNum}`] = [];
                  }
                  if (!stringsByArray[`A${arrNum}`].includes(strNum)) {
                    stringsByArray[`A${arrNum}`].push(strNum);
                  }
                }
              });
            }
          }
        });
      }
    } catch (e) {}
  }

  // 3. Inspect ipMap
  if (ipMap) {
    try {
      if (Array.isArray(ipMap)) {
        ipMap.forEach((entry: any) => {
          const arrVal = entry.arrayIndex ?? entry.array ?? null;
          if (arrVal !== null && !isNaN(Number(arrVal))) {
            discoveredArrays.add(Number(arrVal));
          }
        });
      } else if (typeof ipMap === "object") {
        Object.keys(ipMap).forEach((k) => {
          const match = k.match(/A(\d+)/i) || k.match(/array\D*(\d+)/i);
          if (match) discoveredArrays.add(Number(match[1]));
        });
      }
    } catch (e) {}
  }

  // Sort and finalize arrays and collections
  const sortedArrays = Array.from(discoveredArrays).sort((a, b) => a - b);
  Object.keys(stringsByArray).forEach((k) => {
    stringsByArray[k].sort((a, b) => a - b);
  });
  Object.keys(energySegmentsByArray).forEach((k) => {
    energySegmentsByArray[k].sort((a, b) => a - b);
  });

  let arrayCount = activeProfile?.arrayCount || 8;
  if (sortedArrays.length > 0) {
    arrayCount = Math.max(...sortedArrays);
  } else if (activeProfile?.topologyModel) {
    const topo = activeProfile.topologyModel;
    if (topo.arrayEnd && !isNaN(Number(topo.arrayEnd))) {
      arrayCount = Number(topo.arrayEnd);
    }
  }
  if (arrayCount <= 0 || arrayCount > 32) {
    arrayCount = activeProfile?.arrayCount || 8;
  }

  // --- Station Code Selection and Priority Matrix ---
  let stationCode: string | null = null;
  let stationCodeSource = "none";

  if (blockData?.stationCode) {
    stationCode = blockData.stationCode;
    stationCodeSource = "blockData.stationCode";
  } else if (blockData?.data?.stationCode) {
    stationCode = blockData.data.stationCode;
    stationCodeSource = "blockData.data.stationCode";
  } else if (stationCodeFromData) {
    stationCode = stationCodeFromData;
    stationCodeSource = "elementList.stationCode";
  } else if (emsCache.discoveredStationCode) {
    stationCode = emsCache.discoveredStationCode;
    stationCodeSource = "emsCache.discoveredStationCode";
  } else if (activeProfile?.stationCode) {
    stationCode = activeProfile.stationCode;
    stationCodeSource = "profile.stationCode";
  } else {
    stationCode = "BHE0020";
    stationCodeSource = "fallback.default";
  }

  if (elementsToParse.length === 0 && parserMode !== "localTopology") {
    source = "fallback_blockviewer";
    const generated = generateFallbackBlockviewerData(arrayCount);
    elementsToParse = generated.elementList;
    blockData = generated;
    parserMode = "fallback";
  }

  const elements = elementsToParse;
  const rows: BlockSensorMatrixRow[] = [];

  let totalElements = 0;
  let totalSensors = 0;
  let locationFallbackCount = 0;
  let sensorParentMismatchCount = 0;
  let unknownSensorCodeCount = 0;

  const sidebarCounts: SensorSidebarCounts = {
    fire: { label: "Fire Alarms", untripped: 0, total: 0, tripped: 0, healthy: true },
    fireTrouble: { label: "Fire Troubles", untripped: 0, total: 0, tripped: 0, healthy: true },
    smoke: { label: "Smoke", untripped: 0, total: 0, tripped: 0, healthy: true },
    heat: { label: "Heat / Thermal Runaway", untripped: 0, total: 0, tripped: 0, healthy: true },
    hydrogen: { label: "Hydrogen Gas", untripped: 0, total: 0, tripped: 0, healthy: true },
    hydrogenFault: { label: "Hydrogen Faults", untripped: 0, total: 0, tripped: 0, healthy: true },
    dataCommunications: { label: "Data Comms", untripped: 0, total: 0, tripped: 0, healthy: true },
    ioCommunications: { label: "IO Board Link", untripped: 0, total: 0, tripped: 0, healthy: true },
    acDoors: { label: "AC Doors", untripped: 0, total: 0, tripped: 0, healthy: true },
    dcDoors: { label: "DC Doors", untripped: 0, total: 0, tripped: 0, healthy: true },
    topCapDoor: { label: "Top Cap Doors", untripped: 0, total: 0, tripped: 0, healthy: true },
    batteryDoors: { label: "Battery Doors", untripped: 0, total: 0, tripped: 0, healthy: true },
    manualVentilation: { label: "Manual Ventilation", untripped: 0, total: 0, tripped: 0, healthy: true },
    envCtrl: { label: "HVAC Vent/Ctrl", untripped: 0, total: 0, tripped: 0, healthy: true },
    upsAlarm: { label: "UPS Station Alarms", untripped: 0, total: 0, tripped: 0, healthy: true },
    moisture: { label: "Moisture / Condensation", untripped: 0, total: 0, tripped: 0, healthy: true },
    stationWide: { label: "Station-Wide Estops", untripped: 0, total: 0, tripped: 0, healthy: true }
  };

  if (parserMode === "localTopology") {
    const sortedEnclosureIndexes = Object.keys(topologyEntitiesByEnclosure).map(Number).sort((a, b) => a - b);
    for (const enclosureIndex of sortedEnclosureIndexes) {
      totalElements++;
      const entitiesForThisEnclosure = topologyEntitiesByEnclosure[enclosureIndex];
      
      const arrayIndex = Math.floor((enclosureIndex - 1) / 21) + 1;
      const positionInArray = ((enclosureIndex - 1) % 21) + 1;
      const isCS = positionInArray === 1;
      const esNumber = isCS ? null : (positionInArray - 1);
      
      const strings = isCS ? [] : [
        { arrayIndex, stringIndex: 2 * esNumber! - 1 },
        { arrayIndex, stringIndex: 2 * esNumber! }
      ];
      
      const virtualElement = {
        enclosureIndex,
        enclosureType: isCS ? "CollectionSegment" : "EnergySegment",
        locationInfo: {
          arrays: [{ arrayIndex }],
          segmentPosition: esNumber,
          strings
        }
      };
      
      const location = normalizeElementLocation(virtualElement);
      if (location.locationDerivedFromFallback) {
        locationFallbackCount++;
      }
      
      const emergencySensors = {
        moisture: createDefaultCell("moisture", !isCS, true)
      };
      const comStatus = {
        io: createDefaultCell("io", true, true),
        dataCommunications: createDefaultCell("dataUnavailable", true, true)
      };
      const doorSensors = {
        acDoors: createDefaultCell("acDoors", isCS, true),
        dcDoors: createDefaultCell("dcDoors", isCS, true),
        topCapDoors: createDefaultCell("topCapDoors", true, true),
        batteryDoors: createDefaultCell("batteryDoors", !isCS, true)
      };
      const otherSensors = {
        modbusEStop: createDefaultCell("modbusEStop", true, true),
        manualVentilation: createDefaultCell("manualVentilation", isCS, true),
        envControllerVent: createDefaultCell("envControllerVent", !isCS, true),
        envControllerLostComms: createDefaultCell("dataUnavailable", !isCS, true),
        upsAlarm: createDefaultCell("upsAlarm", isCS, true),
        smoke: createDefaultCell("smoke", true, true),
        heat: createDefaultCell("heat", true, true),
        fire: createDefaultCell("fire", isCS, true),
        fireTrouble: createDefaultCell("fireTrouble", true, true),
        hydrogen: createDefaultCell("hydrogen", !isCS, true),
        hydrogenFault: createDefaultCell("hydrogenFault", !isCS, true)
      };
      
      const upsAlarms: NormalizedSensorCell[] = [];
      const unknownSensorsList: NormalizedSensorCell[] = [];
      const thermalSensors: NormalizedSensorCell[] = [];
      let internalTemperature: number | null = null;
      let internalHumidity: number | null = null;
      let ambientTemperature: number | null = null;
      let ambientHumidity: number | null = null;

      for (const entity of entitiesForThisEnclosure) {
        totalSensors++;
        const code = entity.sensorCode;
        const isTempHumidity = String(entity.entityType || "").toLowerCase().includes("humidity") || String(entity.entityType || "").toLowerCase().includes("temperature");
        
        if (isTempHumidity) {
          const cell = parseTopologyEntityToCell(entity, code === 1 ? "internalEnvironment" : "externalEnvironment");
          thermalSensors.push(cell);
          
          if (code === 1) {
            if (entity.temperature !== undefined) internalTemperature = Number(entity.temperature);
            if (entity.humidity !== undefined) internalHumidity = Number(entity.humidity);
            if (entity.value !== undefined && typeof entity.value === "number") internalTemperature = entity.value;
          } else {
            if (entity.temperature !== undefined) ambientTemperature = Number(entity.temperature);
            if (entity.humidity !== undefined) ambientHumidity = Number(entity.humidity);
            if (entity.value !== undefined && typeof entity.value === "number") ambientTemperature = entity.value;
          }
        } else {
          // OpenClosedDetector
          let mapped = false;
          if (isCS) {
            if (code === 1) { comStatus.dataCommunications = parseTopologyEntityToCell(entity, "dataUnavailable"); mapped = true; }
            else if (code === 2) { doorSensors.acDoors = parseTopologyEntityToCell(entity, "acDoors"); mapped = true; }
            else if (code === 3) { doorSensors.dcDoors = parseTopologyEntityToCell(entity, "dcDoors"); mapped = true; }
            else if (code === 4) { doorSensors.topCapDoors = parseTopologyEntityToCell(entity, "topCapDoors"); mapped = true; }
            else if (code === 5) { otherSensors.manualVentilation = parseTopologyEntityToCell(entity, "manualVentilation"); mapped = true; }
            else if (code === 6) { otherSensors.smoke = parseTopologyEntityToCell(entity, "smoke"); mapped = true; }
            else if (code === 7) { otherSensors.fireTrouble = parseTopologyEntityToCell(entity, "fireTrouble"); mapped = true; }
            else if (code === 8) { otherSensors.fire = parseTopologyEntityToCell(entity, "fire"); mapped = true; }
            else if (code === 9) { comStatus.io = parseTopologyEntityToCell(entity, "io"); mapped = true; }
            else if (code === 10) { otherSensors.heat = parseTopologyEntityToCell(entity, "heat"); mapped = true; }
            else if (code >= 31 && code <= 34) {
              upsAlarms.push(parseTopologyEntityToCell(entity, "upsAlarm"));
              mapped = true;
            }
          } else {
            if (code === 1) { comStatus.dataCommunications = parseTopologyEntityToCell(entity, "dataUnavailable"); mapped = true; }
            else if (code === 2) { doorSensors.batteryDoors = parseTopologyEntityToCell(entity, "batteryDoors"); mapped = true; }
            else if (code === 3) { doorSensors.topCapDoors = parseTopologyEntityToCell(entity, "topCapDoors"); mapped = true; }
            else if (code === 4) { otherSensors.envControllerVent = parseTopologyEntityToCell(entity, "envControllerVent"); mapped = true; }
            else if (code === 5) { otherSensors.smoke = parseTopologyEntityToCell(entity, "smoke"); mapped = true; }
            else if (code === 6) { otherSensors.hydrogenFault = parseTopologyEntityToCell(entity, "hydrogenFault"); mapped = true; }
            else if (code === 7) { otherSensors.hydrogen = parseTopologyEntityToCell(entity, "hydrogen"); mapped = true; }
            else if (code === 8) { comStatus.io = parseTopologyEntityToCell(entity, "io"); mapped = true; }
            else if (code === 9) { otherSensors.heat = parseTopologyEntityToCell(entity, "heat"); mapped = true; }
            else if (code === 10) { otherSensors.fireTrouble = parseTopologyEntityToCell(entity, "fireTrouble"); mapped = true; }
            else if (code === 11) { emergencySensors.moisture = parseTopologyEntityToCell(entity, "moisture"); mapped = true; }
          }
          if (!mapped) {
            unknownSensorCodeCount++;
            unknownSensorsList.push(parseTopologyEntityToCell(entity, "unknown"));
          }
        }
      }
      
      if (isCS && upsAlarms.length > 0) {
        const allHealthy = upsAlarms.every(c => c.healthy);
        const anyTripped = upsAlarms.some(c => c.tripped);
        otherSensors.upsAlarm = {
          applicable: true,
          healthy: allHealthy,
          tripped: anyTripped,
          latched: upsAlarms.some(c => c.latched),
          value: null,
          status: allHealthy ? "Normal" : "Fault",
          displayValue: allHealthy ? "OK" : "TRIPPED",
          label: "UPS Alarm Aggregate",
          friendlyName: `${upsAlarms.filter(c => !c.healthy).length} / ${upsAlarms.length} UPS Alarms Tripped`,
          sensorRole: "upsAlarm",
          openClosedDetectorType: "UPS",
          sensorIndex: 31,
          sensorTypeCode: 31,
          detectorIndex: 31,
          raw: upsAlarms
        };
      }
      
      const thermalData = (internalTemperature !== null || internalHumidity !== null) ? {
        avgCellTemp: internalTemperature,
        maxTemp: internalTemperature,
        minTemp: internalTemperature,
        humidity: internalHumidity,
        ambientTemp: ambientTemperature,
        ambientHumidity: ambientHumidity
      } : null;
      
      const row: BlockSensorMatrixRow = {
        id: `enclosure-${enclosureIndex}`,
        location,
        actionHealthy: true,
        rowHealthy: true,
        severity: "OK",
        findings: [],
        topology: {
          enclosureType: isCS ? "CollectionSegment" : "EnergySegment",
          enclosureIndex,
          groupIndex: null,
          segmentIndex: location.rawSegmentIndex ?? null,
          segmentPosition: location.rawSegmentPosition ?? null,
          lineupId: location.rawLineupId ?? null,
          lineupIndex: location.rawLineupIndex ?? null,
          arrays: [{ arrayIndex }],
          strings
        },
        emergencySensors,
        comStatus,
        doorSensors,
        otherSensors,
        thermal: thermalData,
        raw: entitiesForThisEnclosure,
        unknownSensors: unknownSensorsList
      };
      
      let rowHealthy = true;
      let severity: "OK" | "Warning" | "Critical" = "OK";
      const findings: string[] = [];
      
      function checkCell(cell: NormalizedSensorCell, label: string) {
        if (!cell || !cell.applicable) return;
        if (!cell.healthy || cell.tripped) {
          rowHealthy = false;
          severity = "Critical";
          if (cell.tripped) {
            findings.push(`${label} sensor tripped`);
          } else {
            findings.push(`${label} sensor reporting unhealthy status (${cell.status})`);
          }
        }
      }
      
      checkCell(row.emergencySensors.moisture, "Moisture");
      checkCell(row.comStatus.io, "IO Board");
      checkCell(row.comStatus.dataCommunications, "Data Comms");
      checkCell(row.doorSensors.acDoors, "AC doors");
      checkCell(row.doorSensors.dcDoors, "DC doors");
      checkCell(row.doorSensors.topCapDoors, "Top cap doors");
      checkCell(row.doorSensors.batteryDoors, "Battery doors");
      checkCell(row.otherSensors.manualVentilation, "Manual ventilation");
      checkCell(row.otherSensors.envControllerVent, "Env Controller Vent");
      checkCell(row.otherSensors.smoke, "Smoke");
      checkCell(row.otherSensors.heat, "Heat");
      checkCell(row.otherSensors.fireTrouble, "Fire Trouble");
      checkCell(row.otherSensors.fire, "Fire");
      checkCell(row.otherSensors.hydrogen, "Hydrogen");
      checkCell(row.otherSensors.hydrogenFault, "Hydrogen Fault");
      checkCell(row.otherSensors.modbusEStop, "E-Stop");
      
      if (isCS && upsAlarms.length > 0) {
        upsAlarms.forEach((cell, idx) => {
          checkCell(cell, `UPS Relay ${idx + 31}`);
        });
      }
      
      row.rowHealthy = rowHealthy;
      row.actionHealthy = rowHealthy;
      row.severity = severity;
      row.findings = findings;
      
      addToSidebar("moisture", row.emergencySensors.moisture);
      addToSidebar("io", row.comStatus.io);
      addToSidebar("dataUnavailable", row.comStatus.dataCommunications);
      addToSidebar("acDoors", row.doorSensors.acDoors);
      addToSidebar("dcDoors", row.doorSensors.dcDoors);
      addToSidebar("topCapDoors", row.doorSensors.topCapDoors);
      addToSidebar("batteryDoors", row.doorSensors.batteryDoors);
      addToSidebar("manualVentilation", row.otherSensors.manualVentilation);
      addToSidebar("envControllerVent", row.otherSensors.envControllerVent);
      addToSidebar("smoke", row.otherSensors.smoke);
      addToSidebar("heat", row.otherSensors.heat);
      addToSidebar("fireTrouble", row.otherSensors.fireTrouble);
      addToSidebar("fire", row.otherSensors.fire);
      addToSidebar("hydrogen", row.otherSensors.hydrogen);
      addToSidebar("hydrogenFault", row.otherSensors.hydrogenFault);
      addToSidebar("modbusEStop", row.otherSensors.modbusEStop);
      if (isCS && upsAlarms.length > 0) {
        upsAlarms.forEach(cell => {
          addToSidebar("upsAlarm", cell);
        });
      }
      
      rows.push(row);
    }
  } else {
    for (const element of elements) {
    totalElements++;
    const location = normalizeElementLocation(element);
    if (location.locationDerivedFromFallback) {
      locationFallbackCount++;
    }

    const type = element.enclosureType === "CollectionSegment" ? "CollectionSegment" : "EnergySegment";
    const isCS = type === "CollectionSegment";
    
    const emergencySensors = {
      moisture: createDefaultCell("moisture", !isCS, true)
    };
    const comStatus = {
      io: createDefaultCell("io", true, true),
      dataCommunications: createDefaultCell("dataUnavailable", true, true)
    };
    const doorSensors = {
      acDoors: createDefaultCell("acDoors", isCS, true),
      dcDoors: createDefaultCell("dcDoors", isCS, true),
      topCapDoors: createDefaultCell("topCapDoors", true, true),
      batteryDoors: createDefaultCell("batteryDoors", !isCS, true)
    };
    const otherSensors = {
      modbusEStop: createDefaultCell("modbusEStop", true, true),
      manualVentilation: createDefaultCell("manualVentilation", isCS, true),
      envControllerVent: createDefaultCell("envControllerVent", !isCS, true),
      envControllerLostComms: createDefaultCell("dataUnavailable", !isCS, true),
      upsAlarm: createDefaultCell("upsAlarm", isCS, true),
      smoke: createDefaultCell("smoke", true, true),
      heat: createDefaultCell("heat", true, true),
      fire: createDefaultCell("fire", isCS, true),
      fireTrouble: createDefaultCell("fireTrouble", true, true),
      hydrogen: createDefaultCell("hydrogen", !isCS, true),
      hydrogenFault: createDefaultCell("hydrogenFault", !isCS, true)
    };

    const rawSensors = element.sensorsForEnclosure || [];
    const upsAlarms: NormalizedSensorCell[] = [];
    const unknownSensorsList: NormalizedSensorCell[] = [];

    for (const rawSens of rawSensors) {
      totalSensors++;
      const cell = parseSensorCell(rawSens, element.enclosureIndex);
      if (cell.debug?.sensorIndexParentMismatch) {
        sensorParentMismatchCount++;
      }

      const code = cell.sensorTypeCode;
      let mapped = false;

      if (isCS) {
        if (code === 1) { comStatus.dataCommunications = cell; mapped = true; }
        else if (code === 2) { doorSensors.acDoors = cell; mapped = true; }
        else if (code === 3) { doorSensors.dcDoors = cell; mapped = true; }
        else if (code === 4) { doorSensors.topCapDoors = cell; mapped = true; }
        else if (code === 5) { otherSensors.manualVentilation = cell; mapped = true; }
        else if (code === 6) { otherSensors.smoke = cell; mapped = true; }
        else if (code === 7) { otherSensors.fireTrouble = cell; mapped = true; }
        else if (code === 8) { otherSensors.fire = cell; mapped = true; }
        else if (code === 9) { comStatus.io = cell; mapped = true; }
        else if (code === 10) { otherSensors.heat = cell; mapped = true; }
        else if (code && code >= 31 && code <= 34) {
          upsAlarms.push(cell);
          mapped = true;
        }
      } else {
        if (code === 1) { comStatus.dataCommunications = cell; mapped = true; }
        else if (code === 2) { doorSensors.batteryDoors = cell; mapped = true; }
        else if (code === 3) { doorSensors.topCapDoors = cell; mapped = true; }
        else if (code === 4) { otherSensors.envControllerVent = cell; mapped = true; }
        else if (code === 5) { otherSensors.smoke = cell; mapped = true; }
        else if (code === 6) { otherSensors.hydrogenFault = cell; mapped = true; }
        else if (code === 7) { otherSensors.hydrogen = cell; mapped = true; }
        else if (code === 8) { comStatus.io = cell; mapped = true; }
        else if (code === 9) { otherSensors.heat = cell; mapped = true; }
        else if (code === 10) { otherSensors.fireTrouble = cell; mapped = true; }
        else if (code === 11) { emergencySensors.moisture = cell; mapped = true; }
      }

      if (!mapped && cell.sensorRole) {
        const r = cell.sensorRole.toLowerCase();
        if (r.includes("moisture")) { emergencySensors.moisture = cell; mapped = true; }
        else if (r.includes("io")) { comStatus.io = cell; mapped = true; }
        else if (r.includes("smoke")) { otherSensors.smoke = cell; mapped = true; }
        else if (r.includes("heat")) { otherSensors.heat = cell; mapped = true; }
        else if (r.includes("firetrouble")) { otherSensors.fireTrouble = cell; mapped = true; }
        else if (r.includes("fire")) { otherSensors.fire = cell; mapped = true; }
        else if (r.includes("hydrogenfault")) { otherSensors.hydrogenFault = cell; mapped = true; }
        else if (r.includes("hydrogen")) { otherSensors.hydrogen = cell; mapped = true; }
        else if (r.includes("estop")) { otherSensors.modbusEStop = cell; mapped = true; }
      }

      if (!mapped) {
        unknownSensorCodeCount++;
        unknownSensorsList.push(cell);
      }
    }

    if (isCS && upsAlarms.length > 0) {
      const allHealthy = upsAlarms.every(c => c.healthy);
      const anyTripped = upsAlarms.some(c => c.tripped);
      otherSensors.upsAlarm = {
        applicable: true,
        healthy: allHealthy,
        tripped: anyTripped,
        latched: upsAlarms.some(c => c.latched),
        value: null,
        status: allHealthy ? "Normal" : "Fault",
        displayValue: allHealthy ? "OK" : "TRIPPED",
        label: "UPS Alarm Aggregate",
        friendlyName: `${upsAlarms.filter(c => !c.healthy).length} / ${upsAlarms.length} UPS Alarms Tripped`,
        sensorRole: "upsAlarm",
        openClosedDetectorType: "UPS",
        sensorIndex: 31,
        sensorTypeCode: 31,
        detectorIndex: 31,
        raw: upsAlarms
      };
    }

    const row: BlockSensorMatrixRow = {
      id: `enclosure-${element.enclosureIndex || Math.random().toString(36).substring(2, 6)}`,
      location,
      actionHealthy: true,
      rowHealthy: true,
      severity: "OK",
      findings: [],
      topology: {
        enclosureType: type,
        enclosureIndex: element.enclosureIndex ?? null,
        groupIndex: element.groupIndex ?? null,
        segmentIndex: location.rawSegmentIndex ?? null,
        segmentPosition: location.rawSegmentPosition ?? null,
        lineupId: location.rawLineupId ?? null,
        lineupIndex: location.rawLineupIndex ?? null,
        arrays: location.arrayIndex !== null ? [{ arrayIndex: location.arrayIndex }] : [],
        strings: location.strings || []
      },
      emergencySensors,
      comStatus,
      doorSensors,
      otherSensors,
      thermal: element.thermalData || element.hvacControls || null,
      controller: element.controllerSettings || element.controllerStatisticsData || null,
      deviceHealth: element.deviceHealth || null,
      devicesWithLostComms: element.devicesWithLostComms || [],
      operationalState: element.operationalState || null,
      raw: element,
      unknownSensors: unknownSensorsList
    };

    let rowHealthy = true;
    let severity: "OK" | "Warning" | "Critical" = "OK";
    const findings: string[] = [];

    if (element.deviceHealth?.isHealthy === false) {
      rowHealthy = false;
      severity = "Critical";
      if (element.deviceHealth.unhealthyReasons && element.deviceHealth.unhealthyReasons.length > 0) {
        findings.push(...element.deviceHealth.unhealthyReasons);
      } else {
        findings.push("Device health state reported unhealthy");
      }
    }
    if (element.deviceHealth?.hasAlarms === true) {
      severity = "Critical";
      findings.push("Device has active alarms");
    }

    function checkCell(cell: NormalizedSensorCell, label: string) {
      if (!cell || !cell.applicable) return;
      if (!cell.healthy || cell.tripped) {
        rowHealthy = false;
        severity = "Critical";
        if (cell.tripped) {
          findings.push(`${label} sensor tripped`);
        } else {
          findings.push(`${label} sensor reporting unhealthy status`);
        }
      }
      if (cell.debug?.sensorIndexParentMismatch) {
        if (severity !== "Critical") severity = "Warning";
        findings.push(`Sensor index ${cell.sensorIndex} parent mismatch: expected enclosure ${cell.debug.expectedEnclosureIndex}, parsed ${cell.debug.parsedEnclosureIndex}`);
      }
    }

    checkCell(row.emergencySensors.moisture, "Moisture");
    checkCell(row.comStatus.io, "IO Board");
    checkCell(row.comStatus.dataCommunications, "Data Comms");
    checkCell(row.doorSensors.acDoors, "AC doors");
    checkCell(row.doorSensors.dcDoors, "DC doors");
    checkCell(row.doorSensors.topCapDoors, "Top cap doors");
    checkCell(row.doorSensors.batteryDoors, "Battery doors");
    checkCell(row.otherSensors.manualVentilation, "Manual ventilation");
    checkCell(row.otherSensors.envControllerVent, "Env Controller Vent");
    checkCell(row.otherSensors.smoke, "Smoke");
    checkCell(row.otherSensors.heat, "Heat");
    checkCell(row.otherSensors.fireTrouble, "Fire Trouble");
    checkCell(row.otherSensors.fire, "Fire");
    checkCell(row.otherSensors.hydrogen, "Hydrogen");
    checkCell(row.otherSensors.hydrogenFault, "Hydrogen Fault");
    checkCell(row.otherSensors.modbusEStop, "E-Stop");

    if (isCS && upsAlarms.length > 0) {
      upsAlarms.forEach((cell, idx) => {
        checkCell(cell, `UPS Relay ${idx + 31}`);
      });
    }

    row.actionHealthy = true;
    row.rowHealthy = true;
    row.severity = "OK";
    row.findings = [];
    row.rawActionHealthy = rowHealthy;
    row.rawRowHealthy = rowHealthy;
    row.rawSeverity = severity;
    row.rawFindings = findings;

    addToSidebar("moisture", row.emergencySensors.moisture);
    addToSidebar("io", row.comStatus.io);
    addToSidebar("dataUnavailable", row.comStatus.dataCommunications);
    addToSidebar("acDoors", row.doorSensors.acDoors);
    addToSidebar("dcDoors", row.doorSensors.dcDoors);
    addToSidebar("topCapDoors", row.doorSensors.topCapDoors);
    addToSidebar("batteryDoors", row.doorSensors.batteryDoors);
    addToSidebar("manualVentilation", row.otherSensors.manualVentilation);
    addToSidebar("envControllerVent", row.otherSensors.envControllerVent);
    addToSidebar("smoke", row.otherSensors.smoke);
    addToSidebar("heat", row.otherSensors.heat);
    addToSidebar("fireTrouble", row.otherSensors.fireTrouble);
    addToSidebar("fire", row.otherSensors.fire);
    addToSidebar("hydrogen", row.otherSensors.hydrogen);
    addToSidebar("hydrogenFault", row.otherSensors.hydrogenFault);
    addToSidebar("modbusEStop", row.otherSensors.modbusEStop);
    if (isCS && upsAlarms.length > 0) {
      upsAlarms.forEach(cell => {
        addToSidebar("upsAlarm", cell);
      });
    }

    rows.push(row);
    }
  }

  rows.sort((a, b) => {
    return (a.location.sortKey || "ZZZ").localeCompare(b.location.sortKey || "ZZZ");
  });

  // Resolve sensor capabilities and states using active profile
  const resolvedRows = resolveMatrixRows(rows, activeProfile);

  // Clear sidebarCounts
  Object.keys(sidebarCounts).forEach((k) => {
    const key = k as keyof SensorSidebarCounts;
    sidebarCounts[key].total = 0;
    sidebarCounts[key].tripped = 0;
    sidebarCounts[key].untripped = 0;
    sidebarCounts[key].healthy = true;
  });

  // Re-populate sidebarCounts from resolved rows
  resolvedRows.forEach((row) => {
    const isCS = row.location?.enclosureType === "CollectionSegment" || row.topology?.enclosureType === "CollectionSegment";
    
    addToSidebar("moisture", row.emergencySensors.moisture);
    addToSidebar("io", row.comStatus.io);
    addToSidebar("dataUnavailable", row.comStatus.dataCommunications);
    addToSidebar("acDoors", row.doorSensors.acDoors);
    addToSidebar("dcDoors", row.doorSensors.dcDoors);
    addToSidebar("topCapDoors", row.doorSensors.topCapDoors);
    addToSidebar("batteryDoors", row.doorSensors.batteryDoors);
    addToSidebar("manualVentilation", row.otherSensors.manualVentilation);
    addToSidebar("envControllerVent", row.otherSensors.envControllerVent);
    addToSidebar("smoke", row.otherSensors.smoke);
    addToSidebar("heat", row.otherSensors.heat);
    addToSidebar("fireTrouble", row.otherSensors.fireTrouble);
    addToSidebar("fire", row.otherSensors.fire);
    addToSidebar("hydrogen", row.otherSensors.hydrogen);
    addToSidebar("hydrogenFault", row.otherSensors.hydrogenFault);
    addToSidebar("modbusEStop", row.otherSensors.modbusEStop);
    
    if (isCS && row.otherSensors.upsAlarm && row.otherSensors.upsAlarm.applicable) {
      addToSidebar("upsAlarm", row.otherSensors.upsAlarm);
    }
  });

  const blockviewerHealth = source === "fallback_blockviewer" 
    ? "fallback" 
    : (fetchError ? "degraded" : "nominal");

  const stringIPMapHealth = (emsCache.stringIPMap && Array.isArray(emsCache.stringIPMap) && emsCache.stringIPMap.length > 0)
    ? "nominal"
    : "fallback";

  const ipMapHealth = (emsCache.ipMap && Array.isArray(emsCache.ipMap) && emsCache.ipMap.length > 0)
    ? "nominal"
    : "fallback";

  const activeProfileHealth = activeProfile ? "nominal" : "unreachable";

  let confidence: "high" | "medium" | "low" = "high";
  if (source === "fallback_blockviewer") {
    confidence = "low";
  } else if (stringIPMapHealth === "fallback" || ipMapHealth === "fallback") {
    confidence = "medium";
  }

  const warnings: string[] = [];
  if (source === "fallback_blockviewer") {
    warnings.push("No live blockviewer data available; generating dynamic grid fallback.");
  }
  if (stringIPMapHealth === "fallback") {
    warnings.push("stringIPMap is empty or failing; using profile-derived fallback map.");
  }
  if (ipMapHealth === "fallback") {
    warnings.push("ipMap is empty or failing; using profile-derived fallback map.");
  }
  if (fetchError) {
    warnings.push(`EMS fetch error on blockviewer: ${fetchError}`);
  }

  const topologyDiscovery = {
    activeProfileId: activeProfile ? activeProfile.id : null,
    activeProfileName: activeProfile ? activeProfile.profileName : null,
    emsBaseUrl: baseUrl || null,
    stationCode,
    blockIndex: blockData?.blockIndex || 1,
    sourcePriority: stationCodeSource,
    discovered: {
      arrayCount,
      arrays: sortedArrays,
      enclosureCount: parserMode === "localTopology" ? Object.keys(topologyEntitiesByEnclosure).length : elements.length,
      collectionSegmentCount,
      energySegmentCount,
      stringsByArray,
      energySegmentsByArray
    },
    sourceHealth: {
      blockviewer: blockviewerHealth,
      stringIPMap: stringIPMapHealth,
      ipMap: ipMapHealth,
      activeProfile: activeProfileHealth
    },
    confidence,
    warnings
  };

  const counts = calculateProfileAndRawCounts(resolvedRows);

  return {
    success: true,
    timestamp: new Date().toISOString(),
    source,
    stationCode,
    blockIndex: blockData?.blockIndex || 1,
    cumulativeHealthy: resolvedRows.filter(r => r.rowHealthy).length,
    cumulativeTotal: resolvedRows.length,
    ...counts,
    sourceHealth,
    sidebarCounts,
    rows: resolvedRows,
    topologyDiscovery,
    topologySummary: emsCache.topologySensorSummary,
    debug: {
      totalElements,
      totalSensors,
      locationFallbackCount,
      sensorParentMismatchCount,
      unknownSensorCodeCount,
      fallbackGenerated: source === "fallback_blockviewer",
      stationCodeSource,
      parserMode,
      topologyEntityCount: topologyEntities.length,
      openClosedDetectorCount: topologyEntities.filter(e => String(e.entityType || "").toLowerCase().includes("openclosed")).length,
      humidityTemperatureSensorCount: topologyEntities.filter(e => {
        const type = String(e.entityType || "").toLowerCase();
        return type.includes("humidity") || type.includes("temperature");
      }).length,
      groupedEnclosureCount: Object.keys(topologyEntitiesByEnclosure).length,
      unknownSensors: parserMode === "localTopology" 
        ? resolvedRows.reduce<NormalizedSensorCell[]>((acc, row) => acc.concat(row.unknownSensors || []), []) 
        : []
    }
  };

  function addToSidebar(role: string, cell: NormalizedSensorCell) {
    if (!cell || cell.contributesToHealth !== true) return;
    let categoryKey: keyof SensorSidebarCounts | null = null;
    if (role === "fire") categoryKey = "fire";
    else if (role === "fireTrouble") categoryKey = "fireTrouble";
    else if (role === "smoke") categoryKey = "smoke";
    else if (role === "heat") categoryKey = "heat";
    else if (role === "hydrogen") categoryKey = "hydrogen";
    else if (role === "hydrogenFault") categoryKey = "hydrogenFault";
    else if (role === "dataUnavailable" || role === "envControllerLostComms") categoryKey = "dataCommunications";
    else if (role === "io") categoryKey = "ioCommunications";
    else if (role === "acDoors") categoryKey = "acDoors";
    else if (role === "dcDoors") categoryKey = "dcDoors";
    else if (role === "topCapDoors" || role === "topCapDoor") categoryKey = "topCapDoor";
    else if (role === "batteryDoors") categoryKey = "batteryDoors";
    else if (role === "manualVentilation") categoryKey = "manualVentilation";
    else if (role === "envControllerVent") categoryKey = "envCtrl";
    else if (role === "upsAlarm") categoryKey = "upsAlarm";
    else if (role === "moisture") categoryKey = "moisture";
    else if (role === "modbusEStop") categoryKey = "stationWide";

    if (categoryKey && sidebarCounts[categoryKey]) {
      const cat = sidebarCounts[categoryKey];
      cat.total++;
      if (cell.tripped || !cell.healthy) {
        cat.tripped++;
      } else {
        cat.untripped++;
      }
      cat.healthy = cat.tripped === 0;
    }
  }
}

// GET /api/local/site-sensors/topology
router.get("/topology", async (req, res) => {
  const refresh = req.query.refresh === "true";
  const maxAgeMs = req.query.maxAgeMs ? Number(req.query.maxAgeMs) : 0;
  
  const demo = req.query.demo === "true";
  const sample = req.query.sample === "true";
  const debugMode = req.query.debug === "true" || req.query.debugMode === "true";

  try {
    let blockData = emsCache.block;
    let shouldFetch = refresh || !blockData;
    
    if (!shouldFetch && maxAgeMs > 0 && emsCache.lastUpdated) {
      const age = Date.now() - new Date(emsCache.lastUpdated).getTime();
      if (age > maxAgeMs) {
        shouldFetch = true;
      }
    }
    
    let fetchError: string | null = null;
    if (shouldFetch) {
      const endpoint = "/tools/monitor/ems/blockviewer/data";
      try {
        const data = await fetchAndRecord(endpoint, 4000, "json");
        if (data) {
          blockData = data;
          emsCache.block = data;
          emsCache.lastUpdated = new Date().toISOString();
        } else {
          fetchError = "fetchAndRecord returned null or empty data";
        }
      } catch (err: any) {
        fetchError = err.message || String(err);
      }
    }
    
    if (!blockData) {
      blockData = emsCache.block;
    }

    const hasLiveData = !!(blockData && (Array.isArray(blockData.topology) || (blockData.data && Array.isArray(blockData.data.topology))));
    let isFallbackUsed = false;

    if (!hasLiveData) {
      blockData = generateSimulatedTopology();
      isFallbackUsed = true;
    }
    
    const activeProfile = ProfileStore.getActiveProfile();
    const summary = parseEmsTopology(blockData);

    if (summary && summary.rows) {
      summary.rows = resolveMatrixRows(summary.rows, activeProfile);
      summary.cumulativeHealthy = summary.rows.filter((r: any) => r.rowHealthy).length;
      summary.cumulativeTotal = summary.rows.length;
      
      if (summary.points) {
        summary.points = resolveTopologyPoints(summary.points, activeProfile);
      }
      
      const counts = calculateProfileAndRawCounts(summary.rows);
      Object.assign(summary, counts);
    }
    
    const sensorSafetyHealthDebug = {
      requestedUrl: req.originalUrl || "/api/local/site-sensors/topology",
      parsedQuery: req.query || {},
      selectedProfile: "default",
      sourceEndpoints: ["/tools/monitor/ems/blockviewer/data"],
      sourceHealth: isFallbackUsed ? "offline / using partial fallback data" : (blockData ? (summary.success ? "healthy" : "degraded - missing topology") : "unreachable"),
      error: summary.success ? null : "topology[] is missing in blockviewer payload"
    };
    
    if (summary.success) {
      emsCache.topologySensorSummary = summary;
      res.json({
        ...summary,
        sensorSafetyHealthDebug
      });
    } else {
      res.json({
        success: false,
        valid: false,
        error: "topology[] is missing in blockviewer payload",
        sensorSafetyHealthDebug,
        rows: [],
        points: [],
        activePointCount: 0,
        unavailablePointCount: 0,
        unknownPointCount: 0,
        debug: summary.debug || {}
      });
    }
  } catch (error: any) {
    const sensorSafetyHealthDebug = {
      requestedUrl: req.originalUrl || "/api/local/site-sensors/topology",
      parsedQuery: req.query || {},
      selectedProfile: "default",
      sourceEndpoints: ["/tools/monitor/ems/blockviewer/data"],
      sourceHealth: "error",
      error: error.message || String(error)
    };
    res.json({
      success: false,
      valid: false,
      error: error.message || String(error),
      sensorSafetyHealthDebug,
      rows: [],
      points: [],
      activePointCount: 0,
      unavailablePointCount: 0,
      unknownPointCount: 0,
      debug: {}
    });
  }
});

// 6. Router implementation for blockviewer
router.get("/blockviewer", async (req, res) => {
  const refresh = req.query.refresh === "true";
  const maxAgeMs = req.query.maxAgeMs ? Number(req.query.maxAgeMs) : 0;
  try {
    const data = await buildBlockviewerSensorMatrix(refresh, maxAgeMs);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || String(error) });
  }
});

// Alias for general telemetry maps compatibility
router.get("/blockviewer/sensors", async (req, res) => {
  const refresh = req.query.refresh === "true";
  const maxAgeMs = req.query.maxAgeMs ? Number(req.query.maxAgeMs) : 0;
  try {
    const data = await buildBlockviewerSensorMatrix(refresh, maxAgeMs);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || String(error) });
  }
});

// 1. GET /api/local/site-sensors/summary - poller canonical endpoint
router.get("/summary", async (req, res) => {
  const refresh = req.query.refresh === "true";
  try {
    const data = await buildNormalizedResponderSummary(refresh);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || String(error) });
  }
});

// 2. GET /api/local/site-sensors/firstresponder - normalized PRIZM route aliases
router.get("/firstresponder", async (req, res) => {
  const refresh = req.query.refresh === "true";
  try {
    const data = await buildNormalizedResponderSummary(refresh);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || String(error) });
  }
});

// 3. GET /api/local/site-sensors/firstresponder/raw - raw un-normalized view
router.get("/firstresponder/raw", async (req, res) => {
  const refresh = req.query.refresh === "true";
  try {
    let rawV2: any = null;
    if (refresh) {
      try {
        rawV2 = await getLiveFirstResponderV2();
      } catch (e) {}
    }
    if (!rawV2) {
      rawV2 = DEFAULT_BHE0021_V2_PAYLOAD;
    }
    res.json(rawV2);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || String(error) });
  }
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
