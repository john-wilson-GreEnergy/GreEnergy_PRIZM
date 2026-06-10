import { getEmsConnectionStatus, getNormalizedBaseUrl } from "../emsTurtleClient";
import { ProfileStore } from "../profiles/profileStore";

export interface SiteMetricHistorySample {
  timestamp: string;
  activeProfileId: string;
  activeEmsBaseUrl: string;
  source: "live" | "cached" | "offline" | "demo";
  staleData: boolean;
  
  avgSoc: number | null;
  minSoc: number | null;
  maxSoc: number | null;
  stringCount: number;
  reportingStringCount: number;
  
  totalMeasuredKw: number | null;
  totalCommandedKw: number | null;
  totalMeasuredKvar: number | null;
  
  totalWarnings: number;
  totalAlarms: number;
  activeStatusCodeCount: number;
  
  onlineStringCount: number;
  offlineStringCount: number;
  
  healthyEndpointCount: number | null;
  reachableFeatherCount: number | null;
  unreachableFeatherCount: number | null;
}

const MAX_HISTORY_SAMPLES = 600; // e.g. 600 polls at 3s = 30 minutes

let telemetryHistory: SiteMetricHistorySample[] = [];
let currentProfileId: string | null = null;
let currentBaseUrl: string | null = null;

// Derived aggregated state
let latestSiteMetrics: any = null;

export function getSiteTelemetryHistory() {
  const status = getEmsConnectionStatus();
  
  // If profile switched, reset history visibility for current session
  if (status.activeProfileId !== currentProfileId || status.activeEmsBaseUrl !== currentBaseUrl) {
    return [];
  }
  
  return telemetryHistory;
}

export function getLatestSiteMetrics() {
  const status = getEmsConnectionStatus();
  
  if (status.activeProfileId !== currentProfileId || status.activeEmsBaseUrl !== currentBaseUrl) {
     return null;
  }
  
  return latestSiteMetrics;
}

export function recordTelemetrySample(
    emsCache: any, 
    featherStatus: any
) {
  const status = getEmsConnectionStatus();
  
  if (status.activeProfileId !== currentProfileId || status.activeEmsBaseUrl !== currentBaseUrl) {
    // Reset on profile change
    telemetryHistory = [];
    currentProfileId = status.activeProfileId;
    currentBaseUrl = status.activeEmsBaseUrl;
  }
  
  // Compute aggregate metrics from real data
  let totalMeasuredKw: number | null = null;
  let avgSoc: number | null = null;
  let minSoc: number | null = null;
  let maxSoc: number | null = null;
  let totalWarnings = 0;
  let totalAlarms = 0;
  let activeStatusCodeCount = 0;
  let onlineStringCount = 0;
  let offlineStringCount = 0;
  let stringCount = 0;
  let reportingStringCount = 0;
  
  // Array summaries
  const byArray: any[] = [];
  
  if (emsCache.strings && Array.isArray(emsCache.strings)) {
      stringCount = emsCache.strings.length;
      let socSum = 0;
      let pSum = 0;
      let pSumValid = false;
      const arrayMap: Record<string, { socSum: number, count: number, measKw: number, warn: number, alarm: number, on: number, off: number, min: number | null, max: number | null }> = {};
      
      emsCache.strings.forEach((str: any) => {
         const arrId = str.array || "Unknown";
         if (!arrayMap[arrId]) {
            arrayMap[arrId] = { socSum: 0, count: 0, measKw: 0, warn: 0, alarm: 0, on: 0, off: 0, min: null, max: null };
         }
         
         const isComm = (str.communicating === true || str.communicating === "true");
         if (isComm) {
             onlineStringCount++;
             arrayMap[arrId].on++;
             
             const soc = Number(str.soc);
             if (!isNaN(soc)) {
                 reportingStringCount++;
                 socSum += soc;
                 arrayMap[arrId].socSum += soc;
                 arrayMap[arrId].count++;
                 if (minSoc === null || soc < minSoc) minSoc = soc;
                 if (maxSoc === null || soc > maxSoc) maxSoc = soc;
                 
                 if (arrayMap[arrId].min === null || soc < arrayMap[arrId].min!) arrayMap[arrId].min = soc;
                 if (arrayMap[arrId].max === null || soc > arrayMap[arrId].max!) arrayMap[arrId].max = soc;
             }
             
             const kw = Number(str.measuredKw || 0);
             if (!isNaN(kw)) {
                 pSum += kw;
                 pSumValid = true;
                 arrayMap[arrId].measKw += kw;
             }
             
             const warn = Number(str.warnings || 0);
             const alarm = Number(str.alarms || 0);
             if (!isNaN(warn)) { totalWarnings += warn; arrayMap[arrId].warn += warn; }
             if (!isNaN(alarm)) { totalAlarms += alarm; arrayMap[arrId].alarm += alarm; }
             
         } else {
             offlineStringCount++;
             arrayMap[arrId].off++;
         }
      });
      
      if (reportingStringCount > 0) {
          avgSoc = socSum / reportingStringCount;
      }
      if (pSumValid) {
          totalMeasuredKw = pSum;
      }
      
      for (const [arrId, vals] of Object.entries(arrayMap)) {
          byArray.push({
              arrayIndex: arrId,
              avgSoc: vals.count > 0 ? vals.socSum / vals.count : null,
              minSoc: vals.min,
              maxSoc: vals.max,
              stringCount: vals.on + vals.off,
              reportingStringCount: vals.count,
              totalMeasuredKw: vals.measKw,
              warningCount: vals.warn,
              alarmCount: vals.alarm,
              onlineStringCount: vals.on,
              offlineStringCount: vals.off
          });
      }
  }
  
  if (emsCache.bessStatusCodes && emsCache.bessStatusCodes.activeStates) {
      activeStatusCodeCount = Array.isArray(emsCache.bessStatusCodes.activeStates) 
        ? emsCache.bessStatusCodes.activeStates.length 
        : Object.keys(emsCache.bessStatusCodes.activeStates).length;
  }
  
  let healthyEndpointCount = null;
  // If we could deduce healthy endpoints from ipMap or generic logs
  // Since we don't have direct access here easily without complex parsing, we'll leave it null
  
  let reachableFeatherCount = null;
  let unreachableFeatherCount = null;
  if (featherStatus && featherStatus.devices) {
      reachableFeatherCount = 0;
      unreachableFeatherCount = 0;
      featherStatus.devices.forEach((fd: any) => {
          if (fd.isOnline) reachableFeatherCount!++;
          else unreachableFeatherCount!++;
      });
  }

  const sample: SiteMetricHistorySample = {
      timestamp: new Date().toISOString(),
      activeProfileId: status.activeProfileId,
      activeEmsBaseUrl: status.activeEmsBaseUrl,
      source: status.activeMode,
      staleData: status.staleData,
      avgSoc,
      minSoc,
      maxSoc,
      stringCount,
      reportingStringCount,
      totalMeasuredKw,
      totalCommandedKw: null,
      totalMeasuredKvar: null,
      totalWarnings,
      totalAlarms,
      activeStatusCodeCount,
      onlineStringCount,
      offlineStringCount,
      healthyEndpointCount,
      reachableFeatherCount,
      unreachableFeatherCount
  };
  
  telemetryHistory.push(sample);
  if (telemetryHistory.length > MAX_HISTORY_SAMPLES) {
      telemetryHistory.shift();
  }
  
  latestSiteMetrics = {
      source: status.activeMode,
      staleData: status.staleData,
      lastUpdated: new Date().toISOString(),
      activeProfileId: status.activeProfileId,
      activeProfileName: status.activeProfileName,
      activeEmsBaseUrl: status.activeEmsBaseUrl,
      stationCode: status.stationCode,
      blockIndex: status.blockIndex,
      current: sample,
      byArray
  };
}
