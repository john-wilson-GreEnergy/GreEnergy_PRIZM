import { getEmsConnectionStatus, getEmsCachedBlock, getEmsCachedStatus, getEmsCachedLastCall, getEmsCachedRawStrings, getEmsCachedStatusCodes, getEmsSourcesDebugInfo, pollEmsTurtle, isDemoActive, getEmsCachedArrayPcsReports, getEmsCachedArrayReports } from "./emsTurtleClient";
import { getFeatherCache, refreshFeatherCache } from "./feather/featherClient";
import { fetchLiveEmsApps } from "./ems/emsAppsService";
import { buildSiteOperationsSummaryFromCache, NormalizedStringRow } from "./siteOperations";
import { recordTelemetrySample } from "./telemetry/siteTelemetryAggregator";
import * as prizmCache from "./cache/prizmCache";
import { ProfileStore } from "./profiles/profileStore";
import { buildNormalizedResponderSummary } from "./siteSensors/siteSensorsRoutes";
import { fetchEnrichedDevices } from "./feather/deviceEnrichment";
import { getSegmentName } from "./siteData/segmentTranslator";
import { buildNormalizedStringsData } from "./stringsDashboard";


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
    arrayPcsReports?: any;
    arrayReports?: any;
  };
  normalized: {
    strings: NormalizedStringRow[];
    arrays: NormalizedArraySummary[];
    pcs: NormalizedPcsSummary[];
    feather: NormalizedFeatherDevice[];
    correctiveActions: CorrectiveAction[];
    sensors?: any[];
    arrayDetailsByArray?: Record<string, any>;
  };
  rollups: {
    stringSummary: any;
    arraySummary: any[];
    pcsSummary: any;
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

      // Fetch UI-ready normalized string details
      const stringsResult = await buildNormalizedStringsData(false).catch((err: any) => {
         console.error("[Data Coordinator] Strings normalization fell back due to error:", err.message);
         return null;
      });

      // Normalization Stage 2 additions
      const rawPcsReports = getEmsCachedArrayPcsReports() || {};
      const normalizedPcs: any[] = [];
      const rawPcsKeys = Object.keys(rawPcsReports).sort((a,b) => Number(a) - Number(b));
      
      for (const arrKey of rawPcsKeys) {
        const arrNum = Number(arrKey);
        const pcsMap = rawPcsReports[arrKey] || {};
        const pcsKeys = Object.keys(pcsMap).sort((a,b) => Number(a) - Number(b));
        for (const pcsKey of pcsKeys) {
          const pcsNum = Number(pcsKey);
          const item = pcsMap[pcsKey];
          if (!item) continue;
          const response = item.data;
          const arrayPcsData = response?.arrayPcsData;

          const parseBoolean = (value: any): boolean | null => {
            if (value === true || value === "true" || value === 1 || value === "1") return true;
            if (value === false || value === "false" || value === 0 || value === "0") return false;
            return null;
          };

          const outRotation = parseBoolean(arrayPcsData?.outRotation);
          const inRotation = outRotation === null ? null : !outRotation;
          const rotationStatus = outRotation === null ? "UNKNOWN" : outRotation ? "OUT" : "IN";

          const phaseData = Array.isArray(arrayPcsData?.arrayPcsPhaseData) 
            ? arrayPcsData.arrayPcsPhaseData.map((ph: any) => ({
                phase: ph.arrayPcsPhase || "UNKNOWN",
                acCurrentAmp: ph.acCurrentAmp !== undefined ? Number(ph.acCurrentAmp) : null,
                acVoltageVolt: ph.acVoltageVolt !== undefined ? Number(ph.acVoltageVolt) : null,
                voltageMeasurementType: ph.arrayPcsPhaseVoltageMeasuremeantType || ph.voltageMeasurementType || null
              }))
            : [];

          normalizedPcs.push({
            id: `A${arrNum}-PCS${pcsNum}`,
            arrayNumber: arrNum,
            pcsNumber: pcsNum,
            state: arrayPcsData?.state !== undefined ? String(arrayPcsData.state) : null,
            isReady: arrayPcsData?.isReady !== undefined ? parseBoolean(arrayPcsData.isReady) : null,
            dcVoltageVolt: arrayPcsData?.dcVoltageVolt !== undefined ? Number(arrayPcsData.dcVoltageVolt) : null,
            dcCurrentAmp: arrayPcsData?.dcCurrentAmp !== undefined ? Number(arrayPcsData.dcCurrentAmp) : null,
            acCmdRealPowerKW: arrayPcsData?.acCmdRealPowerKW !== undefined ? Number(arrayPcsData.acCmdRealPowerKW) : null,
            acCmdReactivePowerKVAR: arrayPcsData?.acCmdReactivePowerKVAR !== undefined ? Number(arrayPcsData.acCmdReactivePowerKVAR) : null,
            acRealPowerSettingKW: arrayPcsData?.acRealPowerSettingKW !== undefined ? Number(arrayPcsData.acRealPowerSettingKW) : null,
            acReactivePowerSettingKVAR: arrayPcsData?.acReactivePowerSettingKVAR !== undefined ? Number(arrayPcsData.acReactivePowerSettingKVAR) : null,
            acRealPowerKW: arrayPcsData?.acRealPowerKW !== undefined ? Number(arrayPcsData.acRealPowerKW) : null,
            acReactivePowerKVAR: arrayPcsData?.acReactivePowerKVAR !== undefined ? Number(arrayPcsData.acReactivePowerKVAR) : null,
            acApparentPowerKVA: arrayPcsData?.acApparentPowerKVA !== undefined ? Number(arrayPcsData.acApparentPowerKVA) : null,
            acFrequencyHz: arrayPcsData?.acFrequencyHz !== undefined ? Number(arrayPcsData.acFrequencyHz) : null,
            phaseData,
            eventVendor1: arrayPcsData?.eventVendor1 !== undefined ? Number(arrayPcsData.eventVendor1) : null,
            eventVendor2: arrayPcsData?.eventVendor2 !== undefined ? Number(arrayPcsData.eventVendor2) : null,
            eventVendor3: arrayPcsData?.eventVendor3 !== undefined ? Number(arrayPcsData.eventVendor3) : null,
            eventVendor4: arrayPcsData?.eventVendor4 !== undefined ? Number(arrayPcsData.eventVendor4) : null,
            outRotation,
            inRotation,
            rotationStatus,
            timestamp: response?.timeStamp || null,
            sourceOk: item.ok,
            sourceEndpoint: item.endpoint,
            raw: response
          });
        }
      }

      // Arrays normalization Stage 2
      const rawArrayReports = getEmsCachedArrayReports() || {};
      const arrayDetailsByArray: Record<string, any> = {};
      const rawArrReportKeys = Object.keys(rawArrayReports).sort((a,b) => Number(a) - Number(b));
      
      for (const arrKey of rawArrReportKeys) {
        const arrNum = Number(arrKey);
        const item = rawArrayReports[arrKey];
        if (!item) continue;
        const response = item.data;
        const condCellRep = response?.cellGroupReportForArray?.condensedCellReportForString || {};

        const strings: any[] = [];
        const strKeys = Object.keys(condCellRep).sort((a, b) => Number(a) - Number(b));
        
        for (const sKey of strKeys) {
          const sData = condCellRep[sKey];
          if (!sData) continue;
          const strNum = Number(sData.stringIndex || sKey);

          const mv = Array.isArray(sData.millivolts) ? sData.millivolts.map(Number) : [];
          const temps = Array.isArray(sData.temperatures) ? sData.temperatures.map(Number) : [];

          const cellVoltageMin = mv.length ? Math.min(...mv) : null;
          const cellVoltageMax = mv.length ? Math.max(...mv) : null;
          const cellVoltageAvg = mv.length ? mv.reduce((sum, val) => sum + val, 0) / mv.length : null;
          const cellVoltageDelta = (cellVoltageMin !== null && cellVoltageMax !== null) ? (cellVoltageMax - cellVoltageMin) : null;

          const cellTempMin = temps.length ? Math.min(...temps) : null;
          const cellTempMax = temps.length ? Math.max(...temps) : null;
          const cellTempAvg = temps.length ? temps.reduce((sum, val) => sum + val, 0) / temps.length : null;
          const cellTempDelta = (cellTempMin !== null && cellTempMax !== null) ? (cellTempMax - cellTempMin) : null;

          const ignoredTempSensorCount = Array.isArray(sData.ignoredTempSensors) ? sData.ignoredTempSensors.length : 0;
          const balancingStatusCount = Array.isArray(sData.cellGroupBalancingStatusPerBpIndexes) ? sData.cellGroupBalancingStatusPerBpIndexes.length : 0;
          const balancingSettingCount = Array.isArray(sData.cellGroupBalancingSettingPerBpIndexes) ? sData.cellGroupBalancingSettingPerBpIndexes.length : 0;

          strings.push({
            id: `A${arrNum}-S${strNum}`,
            arrayNumber: arrNum,
            stringNumber: strNum,
            batteryPackCount: sData.batteryPackCount !== undefined ? Number(sData.batteryPackCount) : null,
            cellGroupPerBatteryPackCount: sData.cellGroupPerBatteryPackCount !== undefined ? Number(sData.cellGroupPerBatteryPackCount) : null,
            millivolts: mv,
            temperatures: temps,
            timestamps: Array.isArray(sData.timestamps) ? sData.timestamps.map(Number) : [],
            socs: Array.isArray(sData.socs) ? sData.socs.map(Number) : [],
            ignoredTempSensors: Array.isArray(sData.ignoredTempSensors) ? sData.ignoredTempSensors : [],
            balancingStatusPerBpIndexes: Array.isArray(sData.cellGroupBalancingStatusPerBpIndexes) ? sData.cellGroupBalancingStatusPerBpIndexes : [],
            balancingSettingPerBpIndexes: Array.isArray(sData.cellGroupBalancingSettingPerBpIndexes) ? sData.cellGroupBalancingSettingPerBpIndexes : [],
            cellVoltageMin,
            cellVoltageMax,
            cellVoltageAvg,
            cellVoltageDelta,
            cellTempMin,
            cellTempMax,
            cellTempAvg,
            cellTempDelta,
            staleCellGroupCount: null,
            ignoredTempSensorCount,
            balancingStatusCount,
            balancingSettingCount
          });
        }

        // Calculate rollups
        const validMvMins = strings.map(s => s.cellVoltageMin).filter((v): v is number => v !== null);
        const validMvMaxs = strings.map(s => s.cellVoltageMax).filter((v): v is number => v !== null);
        const validMvAvgs = strings.map(s => s.cellVoltageAvg).filter((v): v is number => v !== null);

        const arrayMvMin = validMvMins.length ? Math.min(...validMvMins) : null;
        const arrayMvMax = validMvMaxs.length ? Math.max(...validMvMaxs) : null;
        const arrayMvAvg = validMvAvgs.length ? validMvAvgs.reduce((sum, val) => sum + val, 0) / validMvAvgs.length : null;
        const arrayMvDelta = (arrayMvMin !== null && arrayMvMax !== null) ? (arrayMvMax - arrayMvMin) : null;

        const validTempMins = strings.map(s => s.cellTempMin).filter((v): v is number => v !== null);
        const validTempMaxs = strings.map(s => s.cellTempMax).filter((v): v is number => v !== null);
        const validTempAvgs = strings.map(s => s.cellTempAvg).filter((v): v is number => v !== null);

        const arrayTempMin = validTempMins.length ? Math.min(...validTempMins) : null;
        const arrayTempMax = validTempMaxs.length ? Math.max(...validTempMaxs) : null;
        const arrayTempAvg = validTempAvgs.length ? validTempAvgs.reduce((sum, val) => sum + val, 0) / validTempAvgs.length : null;
        const arrayTempDelta = (arrayTempMin !== null && arrayTempMax !== null) ? (arrayTempMax - arrayTempMin) : null;

        const totalIgnored = strings.reduce((sum, s) => sum + s.ignoredTempSensorCount, 0);
        const totalBalStatus = strings.reduce((sum, s) => sum + s.balancingStatusCount, 0);
        const totalBalSetting = strings.reduce((sum, s) => sum + s.balancingSettingCount, 0);

        arrayDetailsByArray[arrNum] = {
          arrayNumber: arrNum,
          id: `A${arrNum}`,
          timestamp: response?.timeStamp || null,
          stringCount: strings.length,
          totalBatteryPackCount: strings.reduce((sum, s) => sum + (s.batteryPackCount || 0), 0) || null,
          cellGroupPerBatteryPackCount: strings[0]?.cellGroupPerBatteryPackCount || null,
          strings,
          rollups: {
            cellVoltageMin: arrayMvMin,
            cellVoltageMax: arrayMvMax,
            cellVoltageAvg: arrayMvAvg,
            cellVoltageDelta: arrayMvDelta,
            cellTempMin: arrayTempMin,
            cellTempMax: arrayTempMax,
            cellTempAvg: arrayTempAvg,
            cellTempDelta: arrayTempDelta,
            ignoredTempSensorCount: totalIgnored,
            balancingStatusCount: totalBalStatus,
            balancingSettingCount: totalBalSetting
          },
          sourceOk: item.ok,
          sourceEndpoint: item.endpoint,
          raw: response
        };
      }

      const pcsListToUse = normalizedPcs.length ? normalizedPcs : enrichedPcsRows;
      const readyPcs = pcsListToUse.filter((p: any) => p.isReady).length;
      const stoppedPcs = pcsListToUse.filter((p: any) => p.state === "Stop" || p.state === "STOP" || p.state === "stopped" || p.state === "Stopped").length;
      const faultedPcs = pcsListToUse.filter((p: any) => p.state === "Fault" || p.state === "FAULT" || p.state === "faulted" || p.state === "Faulted").length;
      const inRotation = pcsListToUse.filter((p: any) => p.rotationStatus === "IN").length;
      const outRotationCount = pcsListToUse.filter((p: any) => p.rotationStatus === "OUT").length;
      const unknownRotation = pcsListToUse.filter((p: any) => p.rotationStatus === "UNKNOWN").length;

      const pcsSummaryObj = {
        totalPcsCount: pcsListToUse.length,
        readyPcsCount: readyPcs,
        stoppedPcsCount: stoppedPcs,
        faultedPcsCount: faultedPcs,
        inRotationCount: inRotation,
        outRotationCount: outRotationCount,
        unrecognizedRotationCount: unknownRotation
      };

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
              emsApps: parsed.emsApps || [],
              arrayPcsReports: rawPcsReports,
              arrayReports: rawArrayReports
          },
          normalized: {
              strings: (() => {
                  const isNonEmptyArray = (arr: any) => Array.isArray(arr) && arr.length > 0;
                  if (stringsResult && isNonEmptyArray(stringsResult.strings)) return stringsResult.strings;
                  const legacyStr = (parsed.stringSummary || {}) as any;
                  if (isNonEmptyArray(legacyStr.tableRows)) return legacyStr.tableRows;
                  if (isNonEmptyArray(legacyStr.strings)) return legacyStr.strings;
                  return [];
              })(),
              arrays: parsed.arraySummary || [],
              pcs: pcsListToUse,
              feather: enrichedFeatherRows,
              correctiveActions: parsed.correctiveActions || [],
              sensors: sensorsData.rows,
              arrayDetailsByArray
          },
          rollups: {
              stringSummary: (() => {
                  const legacyStringSummary = (parsed.stringSummary || {}) as any;
                  const isNonEmptyArray = (arr: any) => Array.isArray(arr) && arr.length > 0;
                  const isNonEmptyObject = (obj: any) => obj !== null && typeof obj === 'object' && Object.keys(obj).length > 0;
                  
                  return {
                      ...legacyStringSummary,
                      tableRows: isNonEmptyArray(stringsResult?.strings)
                          ? stringsResult.strings
                          : (isNonEmptyArray(legacyStringSummary.tableRows)
                              ? legacyStringSummary.tableRows
                              : (isNonEmptyArray(legacyStringSummary.strings) ? legacyStringSummary.strings : [])),
                      rollups: {
                          ...(legacyStringSummary.rollups || {}),
                          ...(stringsResult?.rollups || {})
                      },
                      buckets: isNonEmptyObject(legacyStringSummary.buckets) && Object.values(legacyStringSummary.buckets).some(v => typeof v === 'number' && v > 0)
                          ? legacyStringSummary.buckets
                          : (isNonEmptyObject(stringsResult?.buckets) ? stringsResult.buckets : (legacyStringSummary.buckets || {})),
                      summary: {
                          ...(legacyStringSummary.summary || {}),
                          ...(stringsResult?.summary || {})
                      },
                      cards: {
                          ...(legacyStringSummary.cards || {}),
                          ...(stringsResult?.cards || {})
                      },
                      enhanced: stringsResult || undefined
                  };
              })(),
              arraySummary: parsed.arraySummary || [],
              pcsSummary: pcsSummaryObj,
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
              correctiveActionsCount: (parsed.correctiveActions || []).length,
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

    const resultRows = [
        blockHealth,
        statusHealth,
        lastCallHealth,
        stringsHealth,
        statusCodesHealth,
        featherHealth,
        emsAppsHealth
    ];

    // Append individual array reports health rows
    const rawArrayReportsObj = snap?.rawSources?.arrayReports || {};
    const arrayKeys = Object.keys(rawArrayReportsObj).sort((a,b) => Number(a) - Number(b));
    for (const arrKey of arrayKeys) {
        const arrNum = Number(arrKey);
        const item = rawArrayReportsObj[arrKey];
        if (!item) continue;
        resultRows.push(buildRow(
            `array-${arrNum}-report`,
            `Array ${arrNum} Condensed Report`,
            [item.endpoint],
            () => {
                const stringsMap = item.data?.cellGroupReportForArray?.condensedCellReportForString || {};
                return Object.keys(stringsMap).length;
            }
        ));
    }

    // Append individual PCS reports health rows
    const rawPcsReportsObj = snap?.rawSources?.arrayPcsReports || {};
    const pArrKeys = Object.keys(rawPcsReportsObj).sort((a,b) => Number(a) - Number(b));
    for (const arrKey of pArrKeys) {
        const arrNum = Number(arrKey);
        const pcsMap = rawPcsReportsObj[arrKey] || {};
        const pcsKeys = Object.keys(pcsMap).sort((a,b) => Number(a) - Number(b));
        for (const pcsKey of pcsKeys) {
            const pcsNum = Number(pcsKey);
            const item = pcsMap[pcsKey];
            if (!item) continue;
            resultRows.push(buildRow(
                `array-${arrNum}-pcs-${pcsNum}-report`,
                `Array ${arrNum} PCS ${pcsNum} Operational Report`,
                [item.endpoint],
                () => item.ok ? 1 : 0
            ));
        }
    }

    return resultRows;
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
        pcsSummary: snap.rollups.pcsSummary || {},
        arrayDetailsByArray: (snap.normalized as any).arrayDetailsByArray || {},
        sourceHealth: snap.rollups.sourceHealth,
        source: "Coordinator Site Data Engine",
        cache: snap.liveStatus
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
