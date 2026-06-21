import { Router } from "express";
import { ProfileStore } from "./profiles/profileStore";

const debugSourceScanRouter = Router();

type ArrayInfo = {
  path: string;
  length: number;
  firstKeys: string[];
  firstSample: any;
};

type LikelyCellGroupArrayInfo = {
  path: string;
  length: number;
  sampleKeys: string[];
  firstSample: any;
  hasVoltageLikeKeys: boolean;
  hasTempLikeKeys: boolean;
  totalNestedCount?: number;
};

type CellTelemetryCandidateResult = {
  endpoint: string;
  url: string;
  ok: boolean;
  httpStatus: number | null;
  contentType: string | null;
  durationMs: number;
  topKeys: string[];
  arrayPaths: ArrayInfo[];
  likelyCellGroupArrays: LikelyCellGroupArrayInfo[];
  error: string | null;
};

function analyzeJsonArrays(json: any): {
  topKeys: string[];
  arrayPaths: ArrayInfo[];
  likelyCellGroupArrays: LikelyCellGroupArrayInfo[];
} {
  const topKeys = typeof json === "object" && json !== null && !Array.isArray(json) ? Object.keys(json) : [];
  const arrayPaths: ArrayInfo[] = [];
  const likelyCellGroupArrays: LikelyCellGroupArrayInfo[] = [];

  const voltageKeyRegex = /volt|voltage|millivolt|mv/i;
  const tempKeyRegex = /temp|temperature|celltemp|cellGroupTemp/i;
  const cellKeyRegex = /cell|cellGroup|group/i;
  //const bpcKeyRegex = /batteryPack|bpc|pack/i;

  let visited = 0;
  const maxDepth = 8;
  const maxArrays = 50;

  function traverse(obj: any, path: string, depth: number) {
    if (depth > maxDepth || visited > maxArrays) return;
    if (obj && typeof obj === "object") {
      if (Array.isArray(obj)) {
        visited++;
        const sample = obj.length > 0 ? obj[0] : null;
        let sampleKeys: string[] = [];
        let hasObj = false;
        if (sample && typeof sample === "object" && !Array.isArray(sample)) {
           sampleKeys = Object.keys(sample);
           hasObj = true;
        }

        const info: ArrayInfo = {
          path,
          length: obj.length,
          firstKeys: sampleKeys,
          firstSample: typeof sample === "object" ? { ...sample } : sample, // clone to truncate later if needed
        };
        arrayPaths.push(info);

        const hasVoltage = sampleKeys.some(k => voltageKeyRegex.test(k));
        const hasTemp = sampleKeys.some(k => tempKeyRegex.test(k));
        const isLikelyCellGroupPath = cellKeyRegex.test(path);
        
        let totalNestedCount = obj.length;
        if (obj.length === 14) {
             let nestedCount = 0;
             for (const item of obj) {
                if (item && typeof item === "object") {
                    for (const k in item) {
                       if (Array.isArray(item[k])) nestedCount += item[k].length;
                    }
                }
             }
             if (nestedCount > 0) {
                 totalNestedCount = nestedCount;
             }
        }

        if (
           obj.length === 30 || 
           obj.length === 420 || 
           (obj.length === 14 && totalNestedCount > 14) || 
           (hasObj && (hasVoltage || hasTemp)) ||
           (isLikelyCellGroupPath && hasObj && (hasVoltage || hasTemp))
        ) {
           // truncate firstSample object values if string/array is huge
           const truncSample = { ...sample };
           if (typeof truncSample === "object" && truncSample !== null) {
              for (const k in truncSample) {
                  if (typeof truncSample[k] === "string" && truncSample[k].length > 100) truncSample[k] = truncSample[k].substring(0, 100) + "...";
                  if (Array.isArray(truncSample[k]) && truncSample[k].length > 5) truncSample[k] = [...truncSample[k].slice(0, 5), `... ${truncSample[k].length} items`];
              }
           }

           likelyCellGroupArrays.push({
             path,
             length: obj.length,
             sampleKeys,
             firstSample: truncSample,
             hasVoltageLikeKeys: hasVoltage,
             hasTempLikeKeys: hasTemp,
             totalNestedCount: totalNestedCount !== obj.length ? totalNestedCount : undefined
           });
        }

        if (obj.length > 0 && typeof obj[0] === "object") {
             // For arrays like [ { cellGroups } ], peek inside the first item
             traverse(obj[0], `${path}[0]`, depth + 1);
        }
      } else {
        for (const key in obj) {
           traverse(obj[key], path ? `${path}.${key}` : key, depth + 1);
        }
      }
    }
  }

  traverse(json, "", 0);

  return { topKeys, arrayPaths, likelyCellGroupArrays };
}


debugSourceScanRouter.get("/debug/strings/:array/:string/cell-telemetry-source-scan", async (req, res) => {
  const array = req.params.array;
  const string = req.params.string;

  res.setHeader("Content-Type", "application/json");

  const profile = ProfileStore.getActiveProfile();
  if (!profile) {
    return res.json({
        arrayNumber: Number(array),
        stringNumber: Number(string),
        activeEmsBaseUrl: null,
        scannedAt: new Date().toISOString(),
        candidateCount: 0,
        candidates: []
    });
  }

  const baseUrl = `http://${profile.emsHost}:${profile.emsPort}${profile.turtlePath}`;
  
  const endpoints = [
    `/tools/report/ems/array/${array}/string/${string}/report.json`,
    `/tools/report/ems/array/${array}/string/${string}/cellReport.json`,
    `/tools/report/ems/array/${array}/string/${string}/cellGroups.json`,
    `/tools/report/ems/array/${array}/string/${string}/cells.json`,
    `/tools/report/ems/array/${array}/string/${string}/batteryPackReport.json`,
    `/tools/report/ems/array/${array}/string/${string}/batteryPackReports.json`,
    `/tools/report/ems/array/${array}/string/${string}/batteryPackReportList.json`,
    `/tools/report/ems/array/${array}/string/${string}/bpcReport.json`,
    `/tools/report/ems/array/${array}/string/${string}/bpcs.json`,
    `/tools/report/ems/array/${array}/string/${string}/detail.json`,
    `/tools/report/ems/array/${array}/string/${string}/data.json`,
    `/tools/report/ems/array/${array}/string/${string}/diagnostics.json`,
    `/tools/report/ems/array/${array}/string/${string}/telemetry.json`,
    `/tools/report/ems/array/${array}/string/${string}/cellGroupReportList.json`,
    `/tools/report/ems/array/${array}/string/${string}/bpc/1/report.json`,
    `/tools/report/ems/array/${array}/string/${string}/bpc/1/cellGroups.json`,
    `/tools/report/ems/array/${array}/string/${string}/batteryPack/1/report.json`,
    `/tools/report/ems/array/${array}/string/${string}/batteryPack/1/cellGroups.json`,
    `/tools/report/ems/array/${array}/string/${string}/batteryPack/1/cellGroupReportList.json`,
    `/tools/report/ems/array/${array}/string/${string}/batteryPack/0/report.json`,
    `/tools/report/ems/array/${array}/string/${string}/bpc/0/report.json`
  ];

  const results: CellTelemetryCandidateResult[] = [];

  for (const endpoint of endpoints) {
    const url = baseUrl + endpoint;
    const started = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      
      const contentType = response.headers.get("content-type");
      const text = await response.text();
      let parsedJson: any = null;
      let parseError: string | null = null;
      let ok = response.ok;

      if (contentType?.includes("application/json") || text.trim().startsWith("{") || text.trim().startsWith("[")) {
        try {
          parsedJson = JSON.parse(text);
        } catch (err) {
          parseError = String(err);
          ok = false;
        }
      }

      const { topKeys, arrayPaths, likelyCellGroupArrays } = parsedJson ? analyzeJsonArrays(parsedJson) : { topKeys: [], arrayPaths: [], likelyCellGroupArrays: [] };

      results.push({
        endpoint,
        url,
        ok,
        httpStatus: response.status,
        contentType,
        durationMs: Date.now() - started,
        topKeys,
        arrayPaths,
        likelyCellGroupArrays,
        error: parseError
      });
    } catch (err) {
      results.push({
        endpoint,
        url,
        ok: false,
        httpStatus: null,
        contentType: null,
        durationMs: Date.now() - started,
        topKeys: [],
        arrayPaths: [],
        likelyCellGroupArrays: [],
        error: String(err)
      });
    }
  }

  res.json({
    arrayNumber: Number(array),
    stringNumber: Number(string),
    activeEmsBaseUrl: baseUrl,
    scannedAt: new Date().toISOString(),
    candidateCount: endpoints.length,
    candidates: results
  });
});

export default debugSourceScanRouter;
