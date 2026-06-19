import { getEmsConnectionStatus, getEmsCachedBlock, getEmsCachedStatus, getEmsCachedLastCall, getEmsCachedRawStrings, getEmsCachedStatusCodes, getEmsSourcesDebugInfo, pollEmsTurtle, isDemoActive } from "./emsTurtleClient";
import { getFeatherCache, refreshFeatherCache } from "./feather/featherClient";
import { fetchLiveEmsApps } from "./ems/emsAppsService";
import { buildSiteOperationsSummaryFromCache, NormalizedStringRow } from "./siteOperations";
import { recordTelemetrySample } from "./telemetry/siteTelemetryAggregator";
import * as prizmCache from "./cache/prizmCache";
import { ProfileStore } from "./profiles/profileStore";
import { buildNormalizedResponderSummary } from "./siteSensors/siteSensorsRoutes";
import { fetchEnrichedDevices } from "./feather/deviceEnrichment";
import { getSegmentName } from "./siteData/segmentTranslator";


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
    sensors?: any[];
  };
  rollups: {
    stringSummary: any;
    arraySummary: any[];
    pcsSummary: any[];
    bessFleetSummary: any;
    featherSummary: any;
    sourceHealth: any[];
    sensorsSummary?: any;
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
      console.time("buildSiteOperationsSummaryFromCache");
      // 2. We use the existing siteOperations logic to build everything
      const parsed = await buildSiteOperationsSummaryFromCache();
      console.timeEnd("buildSiteOperationsSummaryFromCache");
      
      const connStatus = getEmsConnectionStatus();
      
      let state: "LIVE" | "PARTIAL" | "CACHED" | "OFFLINE" = "OFFLINE";
      if (!latestError && connStatus.source === "live") state = "LIVE";
      else if (!latestError && connStatus.source === "partial") state = "PARTIAL";
      else if (connStatus.source === "cached") state = "CACHED";

      let sourceOk = true;
      if (state === "OFFLINE" || latestError) sourceOk = false;
      
      const rawConn = getEmsConnectionStatus();
      const stNow = Date.now();
      const updatedTime = rawConn.lastUpdated ? new Date(rawConn.lastUpdated).getTime() : stNow;
      const capturedAt = rawConn.lastUpdated || new Date().toISOString();

      let featherCellTempExcludedCollectionSegments = 0;
      const featherNodes = parsed.featherSummary?.devices || [];
      featherNodes.forEach((f: any) => {
         const ip = String(f.deviceIp || f.ip || "");
         if (ip.endsWith('.3')) {
            featherCellTempExcludedCollectionSegments++;
         }
      });

      // 1. Enrich PCS rows with explicit lineage metadata
      const enrichedPcsRows = (parsed.pcsSummary || []).map((p: any) => {
          const arrIdx = p.arrayIndex !== null && p.arrayIndex !== undefined ? Number(p.arrayIndex) : null;
          const pcsIdx = p.pcsIndex !== null && p.pcsIndex !== undefined ? Number(p.pcsIndex) : null;
          const rawKey = p.displayKey || p.rawKey || (arrIdx !== null && pcsIdx !== null ? `Array ${arrIdx} PCS ${pcsIdx}` : null);
          return {
              ...p,
              sourcePath: "blockviewer.data.arrays[].pcses[]",
              source: {
                  domain: "pcs",
                  sourceName: "blockviewer",
                  sourceEndpoint: "/tools/monitor/ems/blockviewer/data",
                  sourcePath: "data.arrays[].pcses[]",
                  arrayIndex: arrIdx,
                  pcsIndex: pcsIdx,
                  rawKey,
                  capturedAt
              }
          };
      });

      // 2. Poll and parse enriched HVAC segment device models
      const enrichedFeatherResult = await fetchEnrichedDevices().catch((err: any) => {
         console.warn("[Data Coordinator] Enriched feather device query failed, utilizing base cache:", err.message);
         return { devices: getFeatherCache().devices || [] };
      });

      const enrichedFeatherRows = (enrichedFeatherResult?.devices || []).map((d: any) => {
         const isCS = d.isCollectionSegment ?? (d.ip ? d.ip.endsWith('.3') : false);
         return {
            ...d,
            segmentName: getSegmentName({
                lineupId: d.lineupId,
                arrayIndex: d.arrayIndex,
                segmentId: d.stringIndex,
                ipAddress: d.ip,
                isCollectionSegment: isCS,
                enclosureName: d.displayKey || d.entityName || d.entityDescription || d.segmentLabel
            })
         };
      });

      // 3. Query safety firstresponder telemetry structure
      const sensorsData = await buildNormalizedResponderSummary(false).catch((err: any) => {
         console.error("[Data Coordinator] Site safety analysis execution failed:", err.message);
         return { rows: [], totalCentipedeLineups: 8, totalHealthyLineups: 8, totalFaultyLineups: 0 };
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
              pcs: enrichedPcsRows,
              feather: enrichedFeatherRows,
              correctiveActions: parsed.activeIssueGroups || [],
              sensors: sensorsData.rows
          },
          rollups: {
              stringSummary: parsed.stringSummary || {},
              arraySummary: parsed.arraySummary || [],
              pcsSummary: enrichedPcsRows,
              bessFleetSummary: parsed.bessFleetSummary || {},
              featherSummary: {
                 ...parsed.featherSummary,
                 devices: enrichedFeatherRows
              },
              sourceHealth: parsed.sourceHealth || [],
              sensorsSummary: {
                 totalRows: sensorsData.rows.length,
                 totalLineups: sensorsData.totalCentipedeLineups,
                 healthyLineups: sensorsData.totalHealthyLineups,
                 faultyLineups: sensorsData.totalFaultyLineups,
                 abnormalSegments: sensorsData.totalAbnormalSegments,
                 highTempSegments: sensorsData.totalHighTempSegments,
                 trippedSensors: sensorsData.totalTrippedSensors,
                 nonCommunicating: sensorsData.totalNonCommunicating,
                 sourcePrimary: "firstresponder_v1",
                 sourceSupplemental: "firstresponder_v2"
              }
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

      // 2 & 3. Generate detailed source health rows & summary
      const healthRows = getSourceHealthRows(newSnap);
      const healthSummary = getSourceHealthSummary(healthRows);
      newSnap.rollups.sourceHealth = healthRows;
      (newSnap.rollups as any).sourceHealthSummary = healthSummary;
      (newSnap.rollups as any).topologyCounts = parsed.topologyCounts || {};
      (newSnap.rollups as any).safetySummary = parsed.safetySummary || {};

      centralSnapshot = newSnap;

      // Ensure cache layer has this info available so it doesn't need to rebuild
      prizmCache.set('prizm-site-snapshot', centralSnapshot, { ttlMs: 15000 });
      if (prizmCache.writeTelemetryHistoryIfEnabled) prizmCache.writeTelemetryHistoryIfEnabled('prizm-site-snapshot', centralSnapshot);
      
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

export function getSnapshotOrNull(): PrizmSiteSnapshot | null {
    return centralSnapshot;
}

export function getSourceHealthRows(snap: any): any[] {
    const emsDebug = getEmsSourcesDebugInfo() || [];
    const fCache = getFeatherCache();
    
    // Helper to extract diagnostic debug info
    const getDbg = (endpoints: string[]) => {
        return emsDebug.find((d: any) => endpoints.includes(d.endpoint));
    };

    const buildRow = (
        name: string,
        sourceLabel: string,
        endpoints: string[],
        getRecordCount: () => number | null
    ) => {
        const dbg = getDbg(endpoints);
        if (!dbg) {
            return {
                name,
                ok: null,
                state: "unknown" as const,
                lastUpdated: null,
                ageMs: null,
                stale: null,
                recordCount: null,
                endpoint: endpoints[0] || null,
                sourceLabel,
                error: null
            };
        }

        const ok = dbg.success ?? null;
        const stale = dbg.stale ?? null;
        let state: "healthy" | "stale" | "failed" | "unknown" = "unknown";
        if (ok === false) {
            state = "failed";
        } else if (ok === true) {
            state = stale ? "stale" : "healthy";
        }

        const lastUpdated = dbg.lastSuccessAt || (ok ? snap?.liveStatus?.lastUpdated : null) || null;
        const ageMs = lastUpdated ? Math.max(0, Date.now() - new Date(lastUpdated).getTime()) : null;

        return {
            name,
            ok,
            state,
            lastUpdated,
            ageMs,
            stale,
            recordCount: getRecordCount(),
            endpoint: dbg.endpoint || null,
            sourceLabel,
            error: dbg.lastError && dbg.lastError !== "NONE" ? dbg.lastError : (ok ? null : "Endpoint unreachable")
        };
    };

    // 1. blockviewer
    const blockHealth = buildRow(
        "blockviewer",
        "Blockviewer Data Stream",
        ["/tools/monitor/ems/blockviewer/data"],
        () => snap?.normalized?.pcs?.length ?? 0
    );

    // 2. status
    const statusHealth = buildRow(
        "status",
        "Direct Status JSON Feed",
        ["/tools/report/ems/status.json", "/status"],
        () => snap?.normalized?.arrays?.length ?? 0
    );

    // 3. lastCall
    const lastCallHealth = buildRow(
        "lastCall",
        "LastCall Backup Stream",
        ["/tools/report/ems/lastCall.json"],
        () => null
    );

    // 4. strings
    const stringsHealth = buildRow(
        "strings",
        "Strings CSV Report",
        ["/tools/report/ems/strings.csv"],
        () => snap?.normalized?.strings?.length ?? 0
    );

    // 5. statusCodes
    const statusCodesHealth = buildRow(
        "statusCodes",
        "BESS Status Codes Definitions",
        ["/tools/report/ems/bessStatusCodes.json"],
        () => null
    );

    // 6. feather
    let featherHealth;
    const fOk = fCache ? fCache.success : false;
    const fStale = fCache ? fCache.isStale : true;
    let fState: "healthy" | "stale" | "failed" | "unknown" = "failed";
    if (fCache) {
        fState = fOk ? (fStale ? "stale" : "healthy") : "failed";
    } else {
        fState = "unknown";
    }
    const featherLastUpdated = (fCache && fCache.lastUpdatedAt) || (fOk ? snap?.liveStatus?.lastUpdated : null) || null;
    const featherAgeMs = featherLastUpdated ? Math.max(0, Date.now() - new Date(featherLastUpdated).getTime()) : null;
    featherHealth = {
        name: "feather",
        ok: fCache ? fOk : null,
        state: fState,
        lastUpdated: featherLastUpdated,
        ageMs: featherAgeMs,
        stale: fCache ? fStale : null,
        recordCount: snap?.normalized?.feather?.length ?? 0,
        endpoint: "/api/local/feather",
        sourceLabel: "Feather HVAC & Balance Clients",
        error: fOk ? null : ((fCache as any)?.error || "Feather cache connection offline")
    };

    // 7. emsApps
    let emsAppsHealth;
    const eaOk = lastCallHealth.ok;
    const eaStale = lastCallHealth.stale;
    let eaState: "healthy" | "stale" | "failed" | "unknown" = "unknown";
    if (eaOk === false) {
        eaState = "failed";
    } else if (eaOk === true) {
        eaState = eaStale ? "stale" : "healthy";
    }
    emsAppsHealth = {
        name: "emsApps",
        ok: eaOk,
        state: eaState,
        lastUpdated: lastCallHealth.lastUpdated,
        ageMs: lastCallHealth.ageMs,
        stale: eaStale,
        recordCount: snap?.rawSources?.emsApps?.length ?? 0,
        endpoint: "/tools/report/ems/lastCall.json -> emsApps",
        sourceLabel: "EMS Integrated Applications",
        error: lastCallHealth.error
    };

    return [
        blockHealth,
        statusHealth,
        lastCallHealth,
        stringsHealth,
        statusCodesHealth,
        featherHealth,
        emsAppsHealth
    ];
}

export function getSourceHealthSummary(rows: any[]): any {
    let healthySources = 0;
    let staleSources = 0;
    let failedSources = 0;
    let unknownSources = 0;

    rows.forEach(r => {
        if (r.state === "healthy") {
            healthySources++;
        } else if (r.state === "stale") {
            staleSources++;
        } else if (r.state === "failed") {
            failedSources++;
        } else {
            unknownSources++;
        }
    });

    return {
        totalSources: rows.length,
        healthySources,
        staleSources,
        failedSources,
        unknownSources
    };
}

export function getSiteDataStatusView(): any {
    const snap = centralSnapshot;
    if (!snap) return { warming: true };
    const healthRows = getSourceHealthRows(snap);
    const summary = getSourceHealthSummary(healthRows);
    return {
        siteIdentity: snap.siteIdentity,
        liveStatus: snap.liveStatus,
        sourceHealthSummary: summary,
        sourceHealth: healthRows,
        debug: {
            ...snap.debug,
            sourceHealthSummary: summary
        },
        freshness: snap.liveStatus.lastUpdated ? {
            lastUpdated: snap.liveStatus.lastUpdated,
            ageMs: snap.liveStatus.ageMs,
            stale: snap.liveStatus.stale
        } : null
    };
}

export function getBlockSummaryView(): any {
    const snap = centralSnapshot;
    if (!snap) return { warming: true };

    const htsSummary: any[] = [];
    const fDevices = snap.normalized.feather || [];
    fDevices.forEach((f: any) => {
         const rt = f.rawResponse?.thermalData || f.rawResponse || {};
         const tempC = f.spaceTemp ?? f.spaceTemperature ?? f.temperature ?? rt.spaceTemperature ?? rt.spaceTemp ?? rt.airTemp ?? rt.temperature ?? null;
         const hum = f.spaceHumidity ?? f.humidity ?? rt.spaceHumidity ?? rt.humidity ?? rt.relativeHumidity ?? null;
         if (tempC !== null || hum !== null) {
             const srcIp = f.deviceIp || f.ip;
             let enc = f.enclosureLabel || f.entityDescription || f.entityName;
             if (!enc && f.arrayIndex != null && f.stringIndex != null) {
                enc = `Array ${f.arrayIndex} ES${f.stringIndex}`;
             }
             const ct = f.cellTemp ?? f.avgCellTemperature ?? f.avgCellTemp ?? rt.cellTemp ?? rt.avgCellTemperature ?? null;
             htsSummary.push({
                 enclosureLabel: enc || "Unknown Enclosure",
                 sensorId: srcIp,
                 sourceIp: srcIp,
                 deviceName: f.deviceType || "Feather",
                 entityDescription: f.entityName || null,
                 arrayIndex: f.arrayIndex ?? null,
                 stringIndex: f.stringIndex ?? null,
                 temperatureC: tempC,
                 humidityPct: hum,
                 cellTemperatureC: ct,
                 supplyAirTempC: f.supplyAirTempC ?? f.supplyAirTemp ?? rt.supplyAirTemp ?? rt.supplyAirTempC ?? null,
                 coolingSetpointC: f.coolingSetpointC ?? f.coolingSetpoint ?? rt.coolingSetpoint ?? rt.coolingSetpointC ?? null,
                 heatingSetpointC: f.heatingSetpointC ?? f.heatingSetpoint ?? rt.heatingSetpoint ?? rt.heatingSetpointC ?? null,
                 source: "feather"
             });
         }
    });

    const healthRows = getSourceHealthRows(snap);
    const healthSummary = getSourceHealthSummary(healthRows);

    const siteObj = {
        stationCode: snap.siteIdentity.stationCode,
        discoveredStationCode: snap.siteIdentity.stationCode,
        siteCodeSource: "topology",
        blockIndex: snap.siteIdentity.blockIndex,
        profileId: snap.siteIdentity.activeProfileId,
        profileName: snap.siteIdentity.activeProfileName,
        emsBaseUrl: snap.siteIdentity.emsBaseUrl,
        connectionState: snap.liveStatus.state === "OFFLINE" ? "disconnected" : "connected",
        source: snap.liveStatus.source,
        staleData: snap.liveStatus.stale,
        lastUpdated: snap.liveStatus.lastUpdated
    };

    return {
        // Uniform unified models
        siteIdentity: snap.siteIdentity,
        liveStatus: snap.liveStatus,
        debug: {
            ...snap.debug,
            sourceHealthSummary: healthSummary
        },

        // Backward compatible legacy structures
        site: siteObj,
        source: snap.liveStatus.state === "OFFLINE" ? "offline" : snap.liveStatus.source,
        stale: snap.liveStatus.stale,
        cacheUsed: snap.liveStatus.cacheUsed,
        correctiveActions: snap.normalized.correctiveActions,
        activeIssueGroups: snap.normalized.correctiveActions, // activeIssueGroups maps directly to correctiveActions array in modern snapshot
        bessFleetSummary: snap.rollups.bessFleetSummary,
        stringSummary: snap.rollups.stringSummary,
        arraySummary: snap.normalized.arrays,
        pcsSummary: enrichedPcsRowsInBlockView(snap),
        featherSummary: snap.rollups.featherSummary,
        humidityTemperatureSensors: htsSummary,
        safetySummary: (snap.rollups as any).safetySummary || {},
        emsApps: snap.rawSources.emsApps || [],
        sourceHealth: healthRows,
        sourceHealthSummary: healthSummary,
        topologyCounts: (snap.rollups as any).topologyCounts || {},
        fleetCapacity: snap.rollups.stringSummary?.rollups?.fleetCapacity || null
    };
}

function enrichedPcsRowsInBlockView(snap: any): any[] {
    const capturedAt = snap?.liveStatus?.lastUpdated || new Date().toISOString();
    return (snap?.normalized?.pcs || []).map((p: any) => {
        const arrIdx = p.arrayIndex !== null && p.arrayIndex !== undefined ? Number(p.arrayIndex) : null;
        const pcsIdx = p.pcsIndex !== null && p.pcsIndex !== undefined ? Number(p.pcsIndex) : null;
        const rawKey = p.displayKey || p.rawKey || (arrIdx !== null && pcsIdx !== null ? `Array ${arrIdx} PCS ${pcsIdx}` : null);
        return {
            ...p,
            sourcePath: "blockviewer.data.arrays[].pcses[]",
            source: {
                domain: "pcs",
                sourceName: "blockviewer",
                sourceEndpoint: "/tools/monitor/ems/blockviewer/data",
                sourcePath: "data.arrays[].pcses[]",
                arrayIndex: arrIdx,
                pcsIndex: pcsIdx,
                rawKey,
                capturedAt
            }
        };
    });
}

export function getStringsView(): any {
    const snap = centralSnapshot;
    if (!snap) return { warming: true };
    return {
        strings: snap.normalized.strings,
        stringSummary: snap.rollups.stringSummary
    };
}

export function getPcsView(): any {
    const snap = centralSnapshot;
    if (!snap) return { warming: true };
    return {
        pcs: snap.normalized.pcs,
        source: "Coordinator Site Data Engine"
    };
}

export function getFeatherView(): any {
    const snap = centralSnapshot;
    if (!snap) return { warming: true };
    return {
        feather: snap.normalized.feather,
        featherSummary: snap.rollups.featherSummary
    };
}

export function getArraysView(): any {
    const snap = centralSnapshot;
    if (!snap) return { warming: true };
    return {
        arrays: snap.normalized.arrays,
        arraySummary: snap.rollups.arraySummary
    };
}

export function getCorrectiveActionsView(): any {
    const snap = centralSnapshot;
    if (!snap) return { warming: true };
    return snap.normalized.correctiveActions;
}

export function getSourceHealthView(): any {
    const snap = centralSnapshot;
    if (!snap) return { warming: true };
    const healthRows = getSourceHealthRows(snap);
    const summary = getSourceHealthSummary(healthRows);
    return {
        sourceHealth: healthRows,
        sourceHealthSummary: summary,
        debug: {
            ...snap.debug,
            sourceHealthSummary: summary
         }
    };
}

export function getSensorsView(): any {
    const snap = centralSnapshot;
    if (!snap) return { warming: true };
    const sensors = (snap.normalized as any).sensors || [];
    const summary = (snap.rollups as any).sensorsSummary || {
        totalRows: sensors.length,
        totalLineups: 8,
        healthyLineups: 8,
        faultyLineups: 0,
        abnormalSegments: 0,
        highTempSegments: 0,
        trippedSensors: 0,
        nonCommunicating: 0,
        sourcePrimary: "firstresponder_v1",
        sourceSupplemental: "firstresponder_v2"
    };
    const healthRows = getSourceHealthRows(snap);
    const healthSummary = getSourceHealthSummary(healthRows);
    return {
        sensors,
        summary,
        sourceHealth: healthRows,
        sourceHealthSummary: healthSummary
    };
}

export function clearSnapshot() {
    centralSnapshot = null;
    prizmCache.set('prizm-site-snapshot', null, { ttlMs: 0 });
}

export function triggerImmediatePoll() {
    isPolling = false; // Break any locks to force immediate poll
    return doBackgroundPoll();
}
