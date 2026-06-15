import { EmsProfile } from "./profileTypes";
import { ProfileStore } from "./profileStore";

// Helper functions for standard PRIZM topology
export function buildIpFromStandardTopology(basePrefix: string, array: number, segment: number): string {
  const cleanPrefix = (basePrefix || "").trim();
  return `${cleanPrefix}.${array}.${segment}`;
}

export interface TopologyPreviewRow {
  array: number;
  device: string;
  segment: number;
  ipAddress: string;
  purpose: string;
}

export function generateTopologyPreview(profile: any): TopologyPreviewRow[] {
  const model = profile.topologyModel || {
    type: "standard-array-segment",
    basePrefix: "10.0",
    arrayStart: 1,
    arrayEnd: 8,
    segmentStart: 3,
    segmentEnd: 75,
    csSegment: 3,
    esSegmentStart: 10,
    esSegmentStep: 5,
    esCountPerArray: 20
  };

  const rows: TopologyPreviewRow[] = [];
  const basePrefix = model.basePrefix || "10.0";
  const arrayStart = Number(model.arrayStart ?? 1);
  const arrayEnd = Number(model.arrayEnd ?? 8);
  const csSegment = Number(model.csSegment ?? 3);
  const esStart = Number(model.esSegmentStart ?? 10);
  const esStep = Number(model.esSegmentStep ?? 5);
  const esCount = Number(model.esCountPerArray ?? 20);

  for (let array = arrayStart; array <= arrayEnd; array++) {
    // Collection Segment (CS)
    rows.push({
      array,
      device: "CS",
      segment: csSegment,
      ipAddress: buildIpFromStandardTopology(basePrefix, array, csSegment),
      purpose: `Collection Segment ${array}`
    });

    // Energy Segments (ES)
    for (let c = 0; c < esCount; c++) {
      const segment = esStart + c * esStep;
      rows.push({
        array,
        device: `ES${c + 1}`,
        segment,
        ipAddress: buildIpFromStandardTopology(basePrefix, array, segment),
        purpose: `Energy Segment ${c + 1}`
      });
    }
  }

  return rows;
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
  
  const emsPort = Number(profile.emsPort);
  if (isNaN(emsPort) || emsPort < 1 || emsPort > 65535) {
    errors.push("EMS HTTP port must be numeric and between 1 and 65535");
  }
  
  const modbusPort = Number(profile.modbusPort);
  if (isNaN(modbusPort) || modbusPort < 1 || modbusPort > 65535) {
    errors.push("Modbus port must be numeric and between 1 and 65535");
  }

  if (!profile.turtlePath || !profile.turtlePath.startsWith("/")) {
    errors.push("Turtle path must start with '/'");
  }

  const model = profile.topologyModel;
  if (!model) {
    errors.push("Topology model is required");
    return errors;
  }

  if (model.type === "standard-array-segment") {
    const prefix = (model.basePrefix || "").trim();
    const parts = prefix.split(".");
    if (parts.length !== 2 || parts.some(p => {
      const num = Number(p);
      return isNaN(num) || num < 0 || num > 255 || p === "";
    })) {
      errors.push("Base Prefix must be two valid IPv4 octets (e.g. '10.0')");
    }

    const arrayStart = Number(model.arrayStart);
    const arrayEnd = Number(model.arrayEnd);
    if (isNaN(arrayStart) || arrayStart < 1 || arrayStart > 254) {
      errors.push("Array Start must be between 1 and 254");
    }
    if (isNaN(arrayEnd) || arrayEnd < 1 || arrayEnd > 254) {
      errors.push("Array End must be between 1 and 254");
    }
    if (!isNaN(arrayStart) && !isNaN(arrayEnd) && arrayStart > arrayEnd) {
      errors.push("Array Start cannot be greater than Array End");
    }

    const segmentStart = Number(model.segmentStart);
    const segmentEnd = Number(model.segmentEnd);
    if (isNaN(segmentStart) || segmentStart < 1 || segmentStart > 254) {
      errors.push("Segment Start (Min Scan segment) must be between 1 and 254");
    }
    if (isNaN(segmentEnd) || segmentEnd < 1 || segmentEnd > 254) {
      errors.push("Segment End (Max Scan segment) must be between 1 and 254");
    }
    if (!isNaN(segmentStart) && !isNaN(segmentEnd) && segmentStart > segmentEnd) {
      errors.push("Scan Segment Min cannot be greater than Max");
    }

    const csSegment = Number(model.csSegment);
    if (isNaN(csSegment) || csSegment < segmentStart || csSegment > segmentEnd) {
      errors.push(`CS Segment (${csSegment}) must be within the scan range of ${segmentStart}-${segmentEnd}`);
    }

    const esStart = Number(model.esSegmentStart);
    if (isNaN(esStart) || esStart < segmentStart || esStart > segmentEnd) {
      errors.push(`ES Segment Start (${esStart}) must be within the scan range of ${segmentStart}-${segmentEnd}`);
    }

    const count = Number(model.esCountPerArray);
    const step = Number(model.esSegmentStep);
    if (isNaN(count) || count < 1) {
      errors.push("ES Count Per Array must be a positive number");
    }
    if (isNaN(step) || step < 1) {
      errors.push("ES Segment Step must be a positive number");
    }

    if (!isNaN(esStart) && !isNaN(count) && !isNaN(step) && !isNaN(segmentEnd)) {
      const maxEsSegment = esStart + (count - 1) * step;
      if (maxEsSegment > segmentEnd) {
        errors.push(`Generated ES segment IPs (max segment: ${maxEsSegment}) will exceed the Scan Segment Max of ${segmentEnd}`);
      }
    }

    // generated IPs must be valid IPv4 addresses
    const sampleIp = `${prefix}.1.3`;
    const ipRegexp = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegexp.test(sampleIp)) {
      errors.push(`Generated sample IP address '${sampleIp}' is not a valid IPv4 address`);
    }
  }

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
