import { EmsProfile } from "./profileTypes";
import { ProfileStore } from "./profileStore";

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
