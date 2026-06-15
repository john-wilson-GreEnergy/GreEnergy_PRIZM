import { EmsProfile, TopologyModel, TopologyBlockModel } from "./profileTypes";
import { ProfileStore } from "./profileStore";
import { DiscoveryCandidate } from "../feather/featherTypes";

// Helper functions for standard PRIZM topology
export function buildIpFromStandardTopology(basePrefix: string, array: number, segment: number): string {
  const cleanPrefix = (basePrefix || "").trim();
  return `${cleanPrefix}.${array}.${segment}`;
}

export interface TopologyPreviewRow {
  blockId?: string;
  blockName?: string;
  array: number;
  device: string;
  segment: number;
  ipAddress: string;
  purpose: string;
}

export function normalizeTopologyModel(profile: any): TopologyModel {
  const tm = profile?.topologyModel || {};
  const type = tm.type || "standard-array-segment";
  const siteModelVersion = 2;
  const basePrefix = (tm.basePrefix || profile?.emsHost ? (profile.emsHost.split('.').slice(0, 2).join('.')) : "10.0");
  const arrayOctet = tm.arrayOctet !== undefined ? Number(tm.arrayOctet) : 3;
  const segmentOctet = tm.segmentOctet !== undefined ? Number(tm.segmentOctet) : 4;
  const arrayStart = tm.arrayStart !== undefined ? Number(tm.arrayStart) : 1;
  const arrayEnd = tm.arrayEnd !== undefined ? Number(tm.arrayEnd) : (profile?.arrayCount !== undefined ? Number(profile.arrayCount) : 8);
  const segmentStart = tm.segmentStart !== undefined ? Number(tm.segmentStart) : 3;
  const segmentEnd = tm.segmentEnd !== undefined ? Number(tm.segmentEnd) : 75;
  const csSegment = tm.csSegment !== undefined ? Number(tm.csSegment) : 3;
  const esSegmentStart = tm.esSegmentStart !== undefined ? Number(tm.esSegmentStart) : 10;
  const esSegmentStep = tm.esSegmentStep !== undefined ? Number(tm.esSegmentStep) : 5;
  const esCountPerArray = tm.esCountPerArray !== undefined ? Number(tm.esCountPerArray) : 20;
  const includeCollectionSegment = tm.includeCollectionSegment !== undefined ? !!tm.includeCollectionSegment : true;

  let blocks: TopologyBlockModel[] = [];
  if (Array.isArray(tm.blocks) && tm.blocks.length > 0) {
    blocks = tm.blocks.map((b: any, idx: number) => {
      const bPrefix = (b.basePrefix || basePrefix || "10.0").trim();
      return {
        blockId: b.blockId || `block-${idx + 1}`,
        blockName: b.blockName || `Block ${b.blockIndex ?? idx + 1}`,
        blockIndex: b.blockIndex !== undefined ? Number(b.blockIndex) : idx + 1,
        stationCode: b.stationCode || profile?.stationCode || "BHE0020",
        emsHost: b.emsHost || profile?.emsHost || "10.0.0.3",
        emsPort: b.emsPort !== undefined ? Number(b.emsPort) : (profile?.emsPort || 8080),
        turtlePath: b.turtlePath || profile?.turtlePath || "/turtle",
        modbusHost: b.modbusHost || profile?.modbusHost || b.emsHost || profile?.emsHost || "10.0.0.3",
        modbusPort: b.modbusPort !== undefined ? Number(b.modbusPort) : (profile?.modbusPort || 4502),
        modbusUnitId: b.modbusUnitId !== undefined ? Number(b.modbusUnitId) : (profile?.modbusUnitId || 1),
        basePrefix: bPrefix,
        arrayStart: b.arrayStart !== undefined ? Number(b.arrayStart) : arrayStart,
        arrayEnd: b.arrayEnd !== undefined ? Number(b.arrayEnd) : arrayEnd,
        segmentStart: b.segmentStart !== undefined ? Number(b.segmentStart) : segmentStart,
        segmentEnd: b.segmentEnd !== undefined ? Number(b.segmentEnd) : segmentEnd,
        csSegment: b.csSegment !== undefined ? Number(b.csSegment) : csSegment,
        esSegmentStart: b.esSegmentStart !== undefined ? Number(b.esSegmentStart) : esSegmentStart,
        esSegmentStep: b.esSegmentStep !== undefined ? Number(b.esSegmentStep) : esSegmentStep,
        esCountPerArray: b.esCountPerArray !== undefined ? Number(b.esCountPerArray) : esCountPerArray,
        includeCollectionSegment: b.includeCollectionSegment !== undefined ? !!b.includeCollectionSegment : includeCollectionSegment,
      };
    });
  } else {
    blocks = [
      {
        blockId: `block-${profile?.blockIndex || 1}`,
        blockName: `Block ${profile?.blockIndex || 1}`,
        blockIndex: profile?.blockIndex !== undefined ? Number(profile.blockIndex) : 1,
        stationCode: profile?.stationCode || "BHE0020",
        emsHost: profile?.emsHost || "10.0.0.3",
        emsPort: profile?.emsPort !== undefined ? Number(profile.emsPort) : 8080,
        turtlePath: profile?.turtlePath || "/turtle",
        modbusHost: profile?.modbusHost || profile?.emsHost || "10.0.0.3",
        modbusPort: profile?.modbusPort !== undefined ? Number(profile.modbusPort) : 4502,
        modbusUnitId: profile?.modbusUnitId !== undefined ? Number(profile.modbusUnitId) : 1,
        basePrefix,
        arrayStart,
        arrayEnd,
        segmentStart,
        segmentEnd,
        csSegment,
        esSegmentStart,
        esSegmentStep,
        esCountPerArray,
        includeCollectionSegment
      }
    ];
  }

  return {
    type,
    siteModelVersion,
    basePrefix,
    arrayOctet,
    segmentOctet,
    arrayStart,
    arrayEnd,
    segmentStart,
    segmentEnd,
    csSegment,
    esSegmentStart,
    esSegmentStep,
    esCountPerArray,
    includeCollectionSegment,
    blocks
  };
}

export function getActiveTopologyBlocks(): TopologyBlockModel[] {
  const profile = ProfileStore.getActiveProfile();
  return normalizeTopologyModel(profile).blocks;
}

export function generateTopologyPreview(profile: any): TopologyPreviewRow[] {
  const model = normalizeTopologyModel(profile);
  const rows: TopologyPreviewRow[] = [];

  for (const b of model.blocks) {
    const basePrefix = b.basePrefix;
    const arrayStart = b.arrayStart;
    const arrayEnd = b.arrayEnd;
    const csSegment = b.csSegment;
    const esStart = b.esSegmentStart;
    const esStep = b.esSegmentStep;
    const esCount = b.esCountPerArray;

    for (let array = arrayStart; array <= arrayEnd; array++) {
      if (b.includeCollectionSegment) {
        rows.push({
          blockId: b.blockId,
          blockName: b.blockName,
          array,
          device: "CS",
          segment: csSegment,
          ipAddress: buildIpFromStandardTopology(basePrefix, array, csSegment),
          purpose: `Collection Segment ${array} [${b.blockName}]`
        });
      }

      // Energy Segments (ES)
      for (let c = 0; c < esCount; c++) {
        const segment = esStart + c * esStep;
        rows.push({
          blockId: b.blockId,
          blockName: b.blockName,
          array,
          device: `ES${c + 1}`,
          segment,
          ipAddress: buildIpFromStandardTopology(basePrefix, array, segment),
          purpose: `Energy Segment ${c + 1} [${b.blockName}]`
        });
      }
    }
  }

  return rows;
}

export function generateFeatherDiscoveryCandidatesFromTopology(profile: any): DiscoveryCandidate[] {
  const model = normalizeTopologyModel(profile);
  const candidates: DiscoveryCandidate[] = [];

  for (const b of model.blocks) {
    const basePrefix = b.basePrefix;
    const arrayStart = b.arrayStart;
    const arrayEnd = b.arrayEnd;
    const csSegment = b.csSegment;
    const esStart = b.esSegmentStart;
    const esStep = b.esSegmentStep;
    const esCount = b.esCountPerArray;

    for (let array = arrayStart; array <= arrayEnd; array++) {
      if (b.includeCollectionSegment) {
        const csIp = buildIpFromStandardTopology(basePrefix, array, csSegment);
        candidates.push({
          deviceIp: csIp,
          blockId: b.blockId,
          blockName: b.blockName,
          blockIndex: b.blockIndex,
          basePrefix: b.basePrefix,
          arrayIndex: array,
          segment: csSegment,
          isCollectionSegment: true,
          sourceDiscoveryMethod: "topology-profile",
          entityName: `${b.blockName} Array ${array} Collection Segment (CS) Device Node`,
          entityKeyToken: `${b.blockId}_ARR_${array}_CS`
        });
      }

      for (let c = 0; c < esCount; c++) {
        const segment = esStart + c * esStep;
        const esIp = buildIpFromStandardTopology(basePrefix, array, segment);
        candidates.push({
          deviceIp: esIp,
          blockId: b.blockId,
          blockName: b.blockName,
          blockIndex: b.blockIndex,
          basePrefix: b.basePrefix,
          arrayIndex: array,
          segment: segment,
          stringIndex: c + 1,
          isCollectionSegment: false,
          sourceDiscoveryMethod: "topology-profile",
          entityName: `${b.blockName} Array ${array} Energy Segment ${c + 1} (ES) Device Node`,
          entityKeyToken: `${b.blockId}_ARR_${array}_STR_${c + 1}_ES`
        });
      }
    }
  }

  return candidates;
}

export function validateTopologyModel(profile: any): string[] {
  const errors: string[] = [];
  
  if (!profile.profileName || !profile.profileName.trim()) {
    errors.push("Profile Name is required");
  }
  if (!profile.siteName || !profile.siteName.trim()) {
    errors.push("Site Name is required");
  }
  if (!profile.stationCode || !profile.stationCode.trim()) {
    errors.push("Station Code is required");
  }

  const model = normalizeTopologyModel(profile);

  if (!model.blocks || model.blocks.length === 0) {
    errors.push("At least one block is required in topology configuration");
    return errors;
  }

  model.blocks.forEach((b, idx) => {
    const errorPrefix = `[Block ${idx + 1}] `;

    if (!b.blockName || !b.blockName.trim()) {
      errors.push(`${errorPrefix}Block Name is required`);
    }

    const emsPort = Number(b.emsPort);
    if (isNaN(emsPort) || emsPort < 1 || emsPort > 65535) {
      errors.push(`${errorPrefix}EMS HTTP port must be numeric and between 1 and 65535`);
    }
    
    const modbusPort = Number(b.modbusPort);
    if (isNaN(modbusPort) || modbusPort < 1 || modbusPort > 65535) {
      errors.push(`${errorPrefix}Modbus port must be numeric and between 1 and 65535`);
    }

    if (!b.turtlePath || !b.turtlePath.startsWith("/")) {
      errors.push(`${errorPrefix}Turtle path must start with '/'`);
    }

    const prefix = (b.basePrefix || "").trim();
    const parts = prefix.split(".");
    if (parts.length !== 2 || parts.some(p => {
      const num = Number(p);
      return isNaN(num) || num < 0 || num > 255 || p === "";
    })) {
      errors.push(`${errorPrefix}Base Prefix must be two valid IPv4 octets (e.g. '10.0')`);
    }

    const arrayStart = Number(b.arrayStart);
    const arrayEnd = Number(b.arrayEnd);
    if (isNaN(arrayStart) || arrayStart < 1 || arrayStart > 254) {
      errors.push(`${errorPrefix}Array Start must be between 1 and 254`);
    }
    if (isNaN(arrayEnd) || arrayEnd < 1 || arrayEnd > 254) {
      errors.push(`${errorPrefix}Array End must be between 1 and 254`);
    }
    if (!isNaN(arrayStart) && !isNaN(arrayEnd) && arrayStart > arrayEnd) {
      errors.push(`${errorPrefix}Array Start cannot be greater than Array End`);
    }

    const segmentStart = Number(b.segmentStart);
    const segmentEnd = Number(b.segmentEnd);
    if (isNaN(segmentStart) || segmentStart < 1 || segmentStart > 254) {
      errors.push(`${errorPrefix}Segment Start must be between 1 and 254`);
    }
    if (isNaN(segmentEnd) || segmentEnd < 1 || segmentEnd > 254) {
      errors.push(`${errorPrefix}Segment End must be between 1 and 254`);
    }
    if (!isNaN(segmentStart) && !isNaN(segmentEnd) && segmentStart > segmentEnd) {
      errors.push(`${errorPrefix}Scan Segment Min cannot be greater than Max`);
    }

    const csSegment = Number(b.csSegment);
    if (b.includeCollectionSegment) {
      if (isNaN(csSegment) || csSegment < segmentStart || csSegment > segmentEnd) {
        errors.push(`${errorPrefix}CS Segment (${csSegment}) must be within the scan range of ${segmentStart}-${segmentEnd}`);
      }
    }

    const esStart = Number(b.esSegmentStart);
    if (isNaN(esStart) || esStart < segmentStart || esStart > segmentEnd) {
      errors.push(`${errorPrefix}ES Segment Start (${esStart}) must be within the scan range of ${segmentStart}-${segmentEnd}`);
    }

    const count = Number(b.esCountPerArray);
    const step = Number(b.esSegmentStep);
    if (isNaN(count) || count < 1) {
      errors.push(`${errorPrefix}ES Count Per Array must be a positive number`);
    }
    if (isNaN(step) || step < 1) {
      errors.push(`${errorPrefix}ES Segment Step must be a positive number`);
    }

    if (!isNaN(esStart) && !isNaN(count) && !isNaN(step) && !isNaN(segmentEnd)) {
      const maxEsSegment = esStart + (count - 1) * step;
      if (maxEsSegment > segmentEnd) {
        errors.push(`${errorPrefix}Generated ES segment IPs (max segment: ${maxEsSegment}) will exceed the Scan Segment Max of ${segmentEnd}`);
      }
    }

    const sampleIp = `${prefix}.1.3`;
    const ipRegexp = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegexp.test(sampleIp)) {
      errors.push(`${errorPrefix}Generated sample IP address '${sampleIp}' is not a valid IPv4 address`);
    }
  });

  return errors;
}

// Helper function to build dynamic base URL
export function buildEmsBaseUrl(p: { emsHost: string; emsPort: number; turtlePath: string }): string {
  const host = p.emsHost.trim();
  const port = p.emsPort;
  let pathStr = p.turtlePath.trim();
  if (!pathStr.startsWith("/")) {
    pathStr = "/" + pathStr;
  }
  return `http://${host}:${port}${pathStr}`.replace(/\/$/, "");
}

// Perform test fetch on target url
async function testEndpoint(url: string, timeoutMsEnv?: number): Promise<{ success: boolean; duration: number; data?: any; error?: string }> {
  const timeoutMs = timeoutMsEnv || Number(process.env.EMS_REQUEST_TIMEOUT_MS) || 10000;
  const startTime = Date.now();
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    const duration = Date.now() - startTime;
    if (res.ok) {
      let data: any = null;
      try {
        data = await res.json();
      } catch (e) {
        // Fallback for non-JSON content
      }
      return { success: true, duration, data };
    }
    return { success: false, duration, error: `HTTP ${res.status} ${res.statusText}` };
  } catch (err: any) {
    clearTimeout(id);
    const duration = Date.now() - startTime;
    return { success: false, duration, error: err.message || "Timeout or network failure" };
  }
}

export class ProfileManager {
  public static async testProfileConnection(fields: Partial<EmsProfile>): Promise<NonNullable<EmsProfile["lastTestResult"]>> {
    const emsHost = fields.emsHost || "10.0.0.3";
    const emsPort = fields.emsPort || 8080;
    const turtlePath = fields.turtlePath || "/turtle";
    const baseUrl = buildEmsBaseUrl({ emsHost, emsPort, turtlePath });

    const statusUrl = `${baseUrl}/status`;
    const reportStatusUrl = `${baseUrl}/tools/report/ems/status.json`;
    const blockviewerUrl = `${baseUrl}/tools/monitor/ems/blockviewer/data`;

    // Execute concurrently
    const [statusResult, reportStatusResult, blockviewerResult] = await Promise.all([
      testEndpoint(statusUrl),
      testEndpoint(reportStatusUrl),
      testEndpoint(blockviewerUrl)
    ]);

    const success = statusResult.success || reportStatusResult.success || blockviewerResult.success;

    // Decode Turtle details if available
    let turtleVersion = "Unknown";
    let decodedStation = fields.stationCode || "BHE0020";
    let decodedBlock = fields.blockIndex || 1;

    // Try to find firmware version or station values from either status payload
    const statusData = statusResult.data || reportStatusResult.data;
    if (statusData) {
      if (statusData.firmwareVersion) {
        turtleVersion = statusData.firmwareVersion;
      } else if (statusData.version) {
        turtleVersion = statusData.version;
      }
      if (statusData.stationCode) {
        decodedStation = statusData.stationCode;
      }
      if (statusData.blockIndex !== undefined) {
        decodedBlock = statusData.blockIndex;
      }
    }

    // Try parsing blockviewer stats as fallback
    const blockData = blockviewerResult.data;
    if (blockData && blockData.system) {
      if (blockData.system.version) {
        turtleVersion = blockData.system.version;
      }
    }

    let error: string | null = null;
    if (!success) {
      error = statusResult.error || reportStatusResult.error || blockviewerResult.error || "ALL BESS target endpoints timed out or failed.";
    }

    return {
      success,
      emsUrlTested: baseUrl,
      statusEndpointResult: statusData || null,
      turtleVersion,
      stationCode: decodedStation,
      blockIndex: decodedBlock,
      error,
      durations: {
        status: statusResult.duration,
        reportStatus: reportStatusResult.duration,
        blockviewer: blockviewerResult.duration
      }
    };
  }
}
