import express, { Router } from "express";
import { 
  getLiveFirstResponderV2, 
  getLiveFirstResponderV1, 
  getFirstResponderEndpointDebugInfo,
  getEmsCachedFirstResponder
} from "../emsTurtleClient";
import { getSegmentName } from "../siteData/segmentTranslator";
import { generateFeatherDiscoveryCandidatesFromTopology } from "../profiles/profileManager";
import { ProfileStore } from "../profiles/profileStore";
import { getFeatherCache } from "../feather/featherClient";


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
