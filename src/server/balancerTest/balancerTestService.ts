import * as fs from "fs";
import * as path from "path";
import { ProfileStore } from "../profiles/profileStore";
import {
  BalancerTestStatus,
  BalancerTestResultRow,
  BalancerTestAnalysis,
  BalancerTestDeployRequest,
  BalancerTestDeployResponse,
  BalancerTestCapabilities
} from "./balancerTestTypes";
import { parseStatusPayload, parseReportPayload } from "./balancerTestParser";
import { analyzeReports } from "./balancerTestAnalyzer";

export function getEmsBaseUrl(): string {
  const profile = ProfileStore.getActiveProfile();
  if (!profile || !profile.emsHost || !profile.emsPort || !profile.turtlePath) {
    return "http://10.0.0.3:8080/turtle";
  }
  const host = profile.emsHost;
  const port = profile.emsPort;
  const path = profile.turtlePath.replace(/\/$/, "");
  return `http://${host}:${port}${path}`;
}

export class BalancerTestService {
  private static statusCache: BalancerTestStatus[] | null = null;
  private static statusCacheTime = 0;

  public static async getStatus(refresh = false, totalCellGroups = 30): Promise<BalancerTestStatus[]> {
    const baseUrl = getEmsBaseUrl();
    const url = `${baseUrl}/tools/report/ems/balancertest/status.json`;

    const now = Date.now();
    if (!refresh && this.statusCache && (now - this.statusCacheTime < 1000)) {
      return this.statusCache;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`EMS Status returned HTTP ${res.status}`);
      }

      const text = await res.text();
      const statusList = parseStatusPayload(text, totalCellGroups);
      
      this.statusCache = statusList;
      this.statusCacheTime = Date.now();
      return statusList;
    } catch (err: any) {
      console.error(`Error fetching balancer status from ${url}:`, err);
      throw new Error(`Failed to fetch active balancer test status from EMS: ${err.message}`);
    }
  }

  public static async getReport(testId: number): Promise<{ rows: BalancerTestResultRow[]; raw: any }> {
    const baseUrl = getEmsBaseUrl();
    const url = `${baseUrl}/tools/report/ems/balancertest/report.json?testID=${testId}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`EMS Report for testID ${testId} returned HTTP ${res.status}`);
      }

      const text = await res.text();
      const rows = parseReportPayload(text);

      let cleanJson = text;
      const bodyStartIdx = cleanJson.toLowerCase().indexOf("<body>");
      if (bodyStartIdx !== -1) {
        cleanJson = cleanJson.slice(bodyStartIdx + 6);
      }
      const bodyEndIdx = cleanJson.toLowerCase().indexOf("</body>");
      if (bodyEndIdx !== -1) {
        cleanJson = cleanJson.slice(0, bodyEndIdx);
      }
      cleanJson = cleanJson.trim();

      let parsed: any = {};
      try {
        if (
          cleanJson.toLowerCase().includes("no balancer test started") ||
          cleanJson.toLowerCase().includes("no balance")
        ) {
          parsed = {
            success: true,
            active: false,
            running: false,
            state: "idle",
            status: "idle",
            message: cleanJson || "No balancer test started.",
            raw: cleanJson
          };
        } else {
          parsed = JSON.parse(cleanJson);
        }
      } catch (e) {
        parsed = {
          success: false,
          active: false,
          running: false,
          state: "unknown",
          status: "unknown",
          message: cleanJson || "Unable to parse balancer test status.",
          raw: cleanJson
        };
      }

      const { results, ...rawMeta } = parsed;

      return {
        rows,
        raw: rawMeta
      };
    } catch (err: any) {
      console.error(`Error fetching report ${testId} from ${url}:`, err);
      throw new Error(`Failed to fetch report for testID ${testId} from EMS: ${err.message}`);
    }
  }

  public static async getAnalysis(testIds: number[]): Promise<BalancerTestAnalysis> {
    const baseUrl = getEmsBaseUrl();
    const allRows: BalancerTestResultRow[] = [];
    const errors: string[] = [];

    for (const testId of testIds) {
      try {
        const report = await this.getReport(testId);
        allRows.push(...report.rows);
      } catch (err: any) {
        console.warn(`Partial analysis failure for testId ${testId}:`, err);
        errors.push(`Test ID ${testId}: ${err.message}`);
      }
    }

    if (allRows.length === 0 && errors.length > 0) {
      throw new Error(`Failed to analyze any of the selected tests. Errors: ${errors.join("; ")}`);
    }

    const analysis = analyzeReports(testIds, allRows, `${baseUrl}/tools/report/ems/balancertest/report.json?testID=`);
    
    if (errors.length > 0) {
      (analysis as any).partialErrors = errors;
    }

    return analysis;
  }

  public static getCapabilities(): BalancerTestCapabilities {
    const unconfigured = process.env.MOCK_DEPLOY_UNCONFIGURED === "true";
    return {
      statusSupported: true,
      analysisSupported: true,
      deploySupported: !unconfigured,
      deployEndpointConfigured: !unconfigured,
      message: unconfigured
        ? "Balancer test deployment endpoint is not configured. Status and analysis are available."
        : "Balancer test deployment is supported and configured."
    };
  }

  private static writeAudit(record: any) {
    const auditPath = path.join(process.cwd(), "data", "audit", "balancer_test_audit.jsonl");
    try {
      fs.mkdirSync(path.dirname(auditPath), { recursive: true });
      fs.appendFileSync(auditPath, JSON.stringify(record) + "\n");
    } catch (err) {
      console.error("[BalancerTestService] Failed to write audit log:", err);
    }
  }

  public static async deploy(req: BalancerTestDeployRequest): Promise<BalancerTestDeployResponse> {
    const auditId = "audit-" + Date.now() + "-" + Math.random().toString(36).substring(2, 11);
    const profile = ProfileStore.getActiveProfile();
    const stationCode = profile?.stationCode || "unknown";
    const blockNum = req.block ?? 1;

    // Check capabilities
    const capabilities = this.getCapabilities();
    if (!capabilities.deploySupported) {
      const response: BalancerTestDeployResponse = {
        accepted: false,
        supportedLocally: false,
        message: "Balancer test deployment endpoint is not configured. Status and analysis are available.",
        request: req,
        auditId
      };
      this.writeAudit({
        timestamp: new Date().toISOString(),
        stationCode,
        block: blockNum,
        arrays: req.arrays || [],
        direction: req.direction,
        operator: req.operator || "PRIZM Operator",
        accepted: false,
        supportedLocally: false,
        rejectionReason: "Deployment endpoint not configured",
        auditId
      });
      return response;
    }

    // Validation
    let rejectionReason = "";
    if (!req.arrays || !Array.isArray(req.arrays) || req.arrays.length === 0) {
      rejectionReason = "arrays must be non-empty";
    } else if (req.arrays.some(a => isNaN(a) || a < 1 || a > 8)) {
      rejectionReason = "arrays must be between 1 and 8";
    } else if (req.direction !== "charge" && req.direction !== "discharge") {
      rejectionReason = "direction must be charge or discharge";
    }

    if (rejectionReason) {
      const response: BalancerTestDeployResponse = {
        accepted: false,
        supportedLocally: true,
        message: `Validation failed: ${rejectionReason}`,
        request: req,
        auditId
      };
      this.writeAudit({
        timestamp: new Date().toISOString(),
        stationCode,
        block: blockNum,
        arrays: req.arrays || [],
        direction: req.direction,
        operator: req.operator || "PRIZM Operator",
        accepted: false,
        supportedLocally: true,
        rejectionReason,
        auditId
      });
      return response;
    }

    const baseUrl = getEmsBaseUrl();
    const emsEndpoint = `${baseUrl}/tools/report/ems/balancertest/trigger/${req.direction}.json?arrayIndexes=${req.arrays.join(",")}`;

    let emsHttpStatus: number | null = null;
    let emsResponseText: string | null = null;
    let testId: number | null = null;
    let accepted = false;
    let message = "";
    let parsedStatus: BalancerTestStatus | null = null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(emsEndpoint, { signal: controller.signal });
      clearTimeout(timeoutId);

      emsHttpStatus = res.status;
      emsResponseText = await res.text();

      if (res.ok) {
        accepted = true;
        message = "Balancer test started successfully.";
        // Parse testId if available
        try {
          let cleanJson = emsResponseText;
          const bodyStartIdx = cleanJson.toLowerCase().indexOf("<body>");
          if (bodyStartIdx !== -1) {
            cleanJson = cleanJson.slice(bodyStartIdx + 6);
          }
          const bodyEndIdx = cleanJson.toLowerCase().indexOf("</body>");
          if (bodyEndIdx !== -1) {
            cleanJson = cleanJson.slice(0, bodyEndIdx);
          }
          cleanJson = cleanJson.trim();
          const parsed = JSON.parse(cleanJson);
          testId = parsed.testId ?? parsed.id ?? parsed.testID ?? null;
        } catch (e) {
          const match = emsResponseText.match(/\"?testId\"?\s*:\s*(\d+)/i) || emsResponseText.match(/\"?id\"?\s*:\s*(\d+)/i);
          if (match) {
            testId = parseInt(match[1], 10);
          }
        }
      } else {
        accepted = false;
        message = `EMS trigger failed with HTTP ${res.status}`;
      }
    } catch (err: any) {
      accepted = false;
      message = `Failed to contact EMS: ${err.message}`;
      emsResponseText = err.message;
    }

    // Refresh status
    if (accepted) {
      try {
        const refreshed = await this.getStatus(true, req.totalCellGroups ?? 30);
        if (testId !== null) {
          parsedStatus = refreshed.find(s => s.id === testId) || null;
        } else {
          parsedStatus = refreshed.find(s => s.state === "RUNNING" || s.state === "PENDING") || null;
        }
      } catch (e) {
        console.warn("Failed to refresh status after deploy:", e);
      }
    }

    const auditRecord = {
      timestamp: new Date().toISOString(),
      stationCode,
      block: blockNum,
      arrays: req.arrays,
      direction: req.direction,
      operator: req.operator || "PRIZM Operator",
      accepted,
      supportedLocally: true,
      emsEndpoint,
      emsHttpStatus,
      emsResponseText: emsResponseText ? emsResponseText.substring(0, 200) : null,
      testId,
      auditId
    };
    this.writeAudit(auditRecord);

    return {
      accepted,
      supportedLocally: true,
      testId,
      message,
      request: req,
      emsEndpoint,
      emsHttpStatus,
      emsResponseText,
      parsedStatus,
      auditId
    };
  }
}
