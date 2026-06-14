import { getEmsConnectionStatus, getEmsCachedBlock, getEmsCachedStatus, getEmsCachedLastCall, getEmsCachedRawStrings, getEmsCachedStatusCodes, getEmsSourcesDebugInfo, pollEmsTurtle, isDemoActive } from "./emsTurtleClient";
import { getFeatherCache, refreshFeatherCache } from "./feather/featherClient";
import { fetchLiveEmsApps } from "./ems/emsAppsService";
import { buildSiteOperationsSummaryFromCache, NormalizedStringRow } from "./siteOperations";
import { recordTelemetrySample } from "./telemetry/siteTelemetryAggregator";
import * as prizmCache from "./cache/prizmCache";
import { ProfileStore } from "./profiles/profileStore";

export type NormalizedArraySummary = any;
export type NormalizedPcsSummary = any;
export type NormalizedFeatherDevice = any;
export type CorrectiveAction = any;

export type PrizmSiteSnapshot = {
  siteIdentity: {
    activeProfileId: string | null;
    activeProfileName: string | null;
    stationCode: string | null;
    blockIndex: number | null;
    emsBaseUrl: string | null;
  };
  liveStatus: {
    state: "LIVE" | "PARTIAL" | "CACHED" | "OFFLINE";
    source: "live-ems" | "cache" | "offline" | "partial";
    liveAttempted: boolean;
    liveSucceeded: boolean;
    stale: boolean;
    cacheUsed: boolean;
    lastUpdated: string | null;
    ageMs: number | null;
    warnings: string[];
    errors: string[];
  };
  rawSources: {
    block: any;
    status: any;
    lastCall: any;
    strings: any[];
    statusCodes: any;
    featherDevices: any[];
    emsApps: any[];
  };
  normalized: {
    strings: NormalizedStringRow[];
    arrays: NormalizedArraySummary[];
    pcs: NormalizedPcsSummary[];
    feather: NormalizedFeatherDevice[];
    correctiveActions: CorrectiveAction[];
  };
  rollups: {
    stringSummary: any;
    arraySummary: any[];
    pcsSummary: any[];
    bessFleetSummary: any;
    featherSummary: any;
    sourceHealth: any[];
  };
  debug: {
    coordinatorStartedAt: string;
    lastPollStartedAt: string | null;
    lastPollFinishedAt: string | null;
    lastPollDurationMs: number | null;
    normalizedStringRowCount: number;
    arraySummarySource: "native" | "synthesized-from-strings" | "native-merged-with-strings";
    correctiveActionsCount: number;
    featherCellTempExcludedCollectionSegments: number;
    errors: string[];
  };
}

let centralSnapshot: PrizmSiteSnapshot | null = null;
const coordinatorStartedAt = new Date().toISOString();
let lastPollStartedAt: string | null = null;
let lastPollFinishedAt: string | null = null;
let lastPollDurationMs: number | null = null;

let isPolling = false;
let pollingInterval: NodeJS.Timeout | null = null;
let featherInterval: NodeJS.Timeout | null = null;

async function doBackgroundPoll() {
  if (isPolling) return;
  isPolling = true;
  lastPollStartedAt = new Date().toISOString();
  const startTime = Date.now();
  let latestError = null;
  try {
      await pollEmsTurtle();
  } catch (err: any) {
      latestError = err;
      console.error("[Data Coordinator] EMS Turtle poll failed", err.message);
  }
  
  try {
      // 2. We use the existing siteOperations logic to build everything
      const parsed = await buildSiteOperationsSummaryFromCache();
      
      const connStatus = getEmsConnectionStatus();
      
      let state: "LIVE" | "PARTIAL" | "CACHED" | "OFFLINE" = "OFFLINE";
      if (!latestError && connStatus.source === "live") state = "LIVE";
      else if (!latestError && connStatus.source === "partial") state = "PARTIAL";
      else if (connStatus.source === "cached") state = "CACHED";

      let sourceOk = true;
      if (state === "OFFLINE" || latestError) sourceOk = false;
      
      const stNow = Date.now();
      const rawConn = getEmsConnectionStatus();
      const updatedTime = rawConn.lastUpdated ? new Date(rawConn.lastUpdated).getTime() : stNow;
      
      let featherCellTempExcludedCollectionSegments = 0;
      const featherNodes = parsed.featherSummary?.devices || [];
      featherNodes.forEach((f: any) => {
         const ip = String(f.deviceIp || f.ip || "");
         if (ip.endsWith('.3')) {
            featherCellTempExcludedCollectionSegments++;
         }
      });
      
      const newSnap: PrizmSiteSnapshot = {
          siteIdentity: {
              activeProfileId: rawConn.activeProfileId,
              activeProfileName: rawConn.activeProfileName,
              stationCode: parsed.stationCode,
              blockIndex: rawConn.blockIndex,
              emsBaseUrl: rawConn.activeEmsBaseUrl
          },
          liveStatus: {
              state,
              source: rawConn.source as any,
              liveAttempted: true,
              liveSucceeded: state === "LIVE" || state === "PARTIAL",
              stale: !!rawConn.staleData,
              cacheUsed: state === "CACHED",
              lastUpdated: rawConn.lastUpdated || new Date().toISOString(),
              ageMs: stNow - updatedTime,
              warnings: [],
              errors: []
          },
          rawSources: {
              block: getEmsCachedBlock().data,
              status: getEmsCachedStatus().data,
              lastCall: getEmsCachedLastCall().data,
              strings: getEmsCachedRawStrings().data || [],
              statusCodes: getEmsCachedStatusCodes().data,
              featherDevices: getFeatherCache().devices || [],
              emsApps: parsed.emsApps || []
          },
          normalized: {
              strings: parsed.stringSummary?.tableRows || [],
              arrays: parsed.arraySummary || [],
              pcs: parsed.pcsSummary || [],
              feather: parsed.featherSummary?.devices || [],
              correctiveActions: parsed.activeIssueGroups || []
          },
          rollups: {
              stringSummary: parsed.stringSummary || {},
              arraySummary: parsed.arraySummary || [],
              pcsSummary: parsed.pcsSummary || [],
              bessFleetSummary: parsed.bessFleetSummary || {},
              featherSummary: parsed.featherSummary || {},
              sourceHealth: parsed.sourceHealth || []
          },
          debug: {
              coordinatorStartedAt,
              lastPollStartedAt,
              lastPollFinishedAt: new Date().toISOString(),
              lastPollDurationMs: Date.now() - startTime,
              normalizedStringRowCount: (parsed.stringSummary?.tableRows || []).length,
              arraySummarySource: parsed.debug?.arraySummarySource as any,
              correctiveActionsCount: (parsed.activeIssueGroups || []).length,
              featherCellTempExcludedCollectionSegments,
              errors: latestError ? [latestError.message] : []
          }
      };

      centralSnapshot = newSnap;

      // Ensure cache layer has this info available so it doesn't need to rebuild
      prizmCache.set('prizm-site-snapshot', centralSnapshot, { ttlMs: 15000 });
      if (prizmCache.writeHistory) prizmCache.writeHistory('prizm-site-snapshot', centralSnapshot);
      
      const emsCacheRaw = prizmCache.get('ems-turtle') as any;
      const featherCacheRaw = getFeatherCache();
      recordTelemetrySample(emsCacheRaw || {}, featherCacheRaw);

  } catch (err: any) {
      console.error("[Data Coordinator] Dashboard aggregation failed", err.message);
  } finally {
      lastPollFinishedAt = new Date().toISOString();
      lastPollDurationMs = Date.now() - startTime;
      isPolling = false;
  }
}

export function startCoordinator() {
    console.log("[Prizm Data Coordinator] Starting central data coordinator...");
    
    doBackgroundPoll(); // initial background poll
    
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(() => {
        doBackgroundPoll();
    }, 5000);

    if (featherInterval) clearInterval(featherInterval);
    featherInterval = setInterval(() => {
        refreshFeatherCache({ force: true }).catch(console.error);
    }, 15000); // 15 seconds feather refresh
}

export function stopCoordinator() {
    if (pollingInterval) clearInterval(pollingInterval);
    if (featherInterval) clearInterval(featherInterval);
}

export function getLatestSnapshot(): PrizmSiteSnapshot | null {
    return centralSnapshot;
}
