import { ProfileStore } from "../profiles/profileStore";
import { BalancerTestStatus, BalancerTestResultRow, BalancerTestAnalysis } from "./balancerTestTypes";
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
        parsed = JSON.parse(cleanJson);
      } catch (e) {}

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
}
