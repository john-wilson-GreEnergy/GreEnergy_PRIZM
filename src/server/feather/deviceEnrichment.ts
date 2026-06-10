import fetch from "node-fetch";
import { ProfileStore } from "../profiles/profileStore";
import { buildEmsBaseUrl } from "../profiles/profileManager";
import { getFeatherCache } from "./featherClient";

export interface FeatherHvacDevice {
  ip: string;
  arrayIndex?: number;
  stringIndex?: number;
  site?: string;
  stationCode?: string;
  blockIndex?: number;

  discoveryMethod: "ems-ip-map" | "string-ip-map" | "blockviewer-topology" | "strings-csv" | "direct-feather" | "manual" | "merged";

  entityKey?: string;
  entityKeyToken?: string;
  displayKey?: string;
  entityType?: string;
  entitySubType?: string;
  entityDescription?: string;

  pingMs?: number;
  reachable?: boolean;
  communicating?: boolean;
  ready?: boolean;
  enabled?: boolean;

  firmwareVersion?: string;
  softwareVersion?: string;
  deviceState?: string;

  hvacSummary?: string;
  hvacMode?: string;
  hvacStatus?: string;
  mioSensorSummary?: string;

  temperatureAmbientC?: number;
  temperatureCellC?: number;
  temperatureSupplyC?: number;
  temperatureReturnC?: number;

  warnInfo?: string[];
  alarmFaults?: string[];
  alarmCount?: number;
  warningCount?: number;

  lastCheckedUtc?: string;
  lastSuccessUtc?: string;

  sourceCoverage: {
    blockviewer: boolean;
    ipMap: boolean;
    stringIpMap: boolean;
    stringsCsv: boolean;
    lastCall: boolean;
    directFeather: boolean;
    firstResponder: boolean;
  };

  raw?: any;
}

export async function fetchEnrichedDevices() {
  const profile = ProfileStore.getActiveProfile();
  if (!profile) {
     throw new Error("No active profile");
  }

  const baseUrl = buildEmsBaseUrl(profile);
  const cache = getFeatherCache();
  
  const sources = {
    blockviewer: null as any,
    ipMap: null as any,
    stringIpMap: null as any,
    stringsCsv: null as any,
    lastCall: null as any,
    status: null as any,
    controllerStatistics: null as any,
    bessStatusCodes: null as any,
    firstResponder: null as any,
    v2FirstResponder: null as any
  };

  const fetchSource = async (path: string, parseJson = true) => {
    try {
      const res = await fetch(baseUrl + path);
      if (res.ok) {
        return parseJson ? await res.json() : await res.text();
      }
    } catch(e) {}
    return null;
  };

  // Fetch all in parallel
  [
    sources.blockviewer,
    sources.ipMap,
    sources.stringIpMap,
    sources.stringsCsv,
    sources.lastCall,
    sources.status,
    sources.controllerStatistics,
    sources.bessStatusCodes,
    sources.firstResponder,
    sources.v2FirstResponder
  ] = await Promise.all([
    fetchSource("/tools/monitor/ems/blockviewer/data"),
    fetchSource("/tools/report/ems/ipMap.json"),
    fetchSource("/tools/report/ems/stringIPMap.json"),
    fetchSource("/tools/report/ems/strings.csv", false),
    fetchSource("/tools/report/ems/lastCall.json"),
    fetchSource("/tools/report/ems/status.json"),
    fetchSource("/tools/report/ems/controllerStatistics.json"),
    fetchSource("/tools/report/ems/bessStatusCodes.json"),
    fetchSource("/firstresponder/data"),
    fetchSource("/v2/firstresponder/data")
  ]);

  const devicesMap = new Map<string, FeatherHvacDevice>();

  const getOrCreate = (ip: string) => {
    if (!devicesMap.has(ip)) {
      devicesMap.set(ip, {
        ip,
        discoveryMethod: "merged",
        sourceCoverage: {
          blockviewer: false,
          ipMap: false,
          stringIpMap: false,
          stringsCsv: false,
          lastCall: false,
          directFeather: false,
          firstResponder: false
        },
        raw: {},
        warnInfo: [],
        alarmFaults: []
      });
    }
    return devicesMap.get(ip)!;
  };

  const sourceCounts = {
    blockviewer: 0,
    ipMap: 0,
    stringIpMap: 0,
    stringsCsv: 0,
    directFeatherSuccess: 0,
    directFeatherFailed: 0,
    firstResponder: 0
  };

  // Extract from blockviewer
  if (sources.blockviewer) {
      const bData = sources.blockviewer;
      const list = Array.isArray(bData) ? bData : (bData.topology || []);
      for (const item of list) {
          if (item && item.ipAddress) {
             const d = getOrCreate(item.ipAddress);
             d.sourceCoverage.blockviewer = true;
             d.raw!.blockviewer = item;
             if (item.entityKeyToken) d.entityKeyToken = item.entityKeyToken;
             if (item.displayKey) d.displayKey = item.displayKey;
             if (item.entityType) d.entityType = item.entityType;
             if (item.entitySubType) d.entitySubType = item.entitySubType;
             if (item.statusMessage) d.deviceState = item.statusMessage;
             d.communicating = !!item.communicating;
             d.ready = !!item.ready;
             d.enabled = !!item.enabled;
             sourceCounts.blockviewer++;
          }
      }
      
      if (bData.arrays && Array.isArray(bData.arrays)) {
        for (const arr of bData.arrays) {
           if (arr.ipAddress) {
               const d = getOrCreate(arr.ipAddress);
               d.sourceCoverage.blockviewer = true;
               d.raw!.blockviewer = arr;
               if (arr.entityKeyToken) d.entityKeyToken = arr.entityKeyToken;
               if (arr.displayKey) d.displayKey = arr.displayKey;
               if (arr.entityType) d.entityType = arr.entityType;
               if (arr.entitySubType) d.entitySubType = arr.entitySubType;
               if (arr.statusMessage && !d.deviceState) d.deviceState = arr.statusMessage;
           }
           if (arr.strings && Array.isArray(arr.strings)) {
               for (const str of arr.strings) {
                    if (str.ipAddress) {
                         const d = getOrCreate(str.ipAddress);
                         d.sourceCoverage.blockviewer = true;
                         d.raw!.blockviewer = str;
                         if (str.entityKeyToken) d.entityKeyToken = str.entityKeyToken;
                         if (str.displayKey) d.displayKey = str.displayKey;
                         if (str.entityType) d.entityType = str.entityType;
                         if (str.entitySubType) d.entitySubType = str.entitySubType;
                         if (str.statusMessage && !d.deviceState) d.deviceState = str.statusMessage;
                    }
               }
           }
        }
      }
  }

  // ipMap
  if (sources.ipMap && typeof sources.ipMap === 'object') {
     for (const [key, val] of Object.entries(sources.ipMap)) {
         if (val && (val as any).ipAddress) {
             const d = getOrCreate((val as any).ipAddress);
             d.sourceCoverage.ipMap = true;
             d.raw!.ipMap = val;
             if ((val as any).entityType && !d.entityType) d.entityType = (val as any).entityType;
             if ((val as any).arrayIndex !== undefined) d.arrayIndex = (val as any).arrayIndex;
             if ((val as any).stringIndex !== undefined) d.stringIndex = (val as any).stringIndex;
             sourceCounts.ipMap++;
         }
     }
  }

  // stringIpMap
  if (sources.stringIpMap && Array.isArray(sources.stringIpMap)) {
      for (const item of sources.stringIpMap) {
          if (item && item.ip) {
              const d = getOrCreate(item.ip);
              d.sourceCoverage.stringIpMap = true;
              d.raw!.stringIpMap = item;
              if (item.arrayIndex !== undefined) d.arrayIndex = item.arrayIndex;
              if (item.stringIndex !== undefined) d.stringIndex = item.stringIndex;
              sourceCounts.stringIpMap++;
          }
      }
  }

  // lastCall.json
  if (sources.lastCall && Array.isArray(sources.lastCall)) {
      for (const item of sources.lastCall) {
          if (item && item.ipAddress) {
              const d = getOrCreate(item.ipAddress);
              d.sourceCoverage.lastCall = true;
              d.raw!.lastCall = item;
              if (item.firmwareVersion) d.firmwareVersion = item.firmwareVersion;
              if (item.softwareVersion) d.softwareVersion = item.softwareVersion;
          }
      }
  }

  // firstResponder
  if (sources.firstResponder) {
      const data = sources.firstResponder;
      const list = Array.isArray(data) ? data : (data.devices || []);
      for (const item of list) {
          if (item && item.ipAddress) {
              const d = getOrCreate(item.ipAddress);
              d.sourceCoverage.firstResponder = true;
              d.raw!.firstResponder = item;
              sourceCounts.firstResponder++;
              if (item.hvacMode) d.hvacMode = item.hvacMode;
              if (item.hvacStatus) d.hvacStatus = item.hvacStatus;
              if (item.ambientTemp) d.temperatureAmbientC = item.ambientTemp;
              if (item.cellTemp) d.temperatureCellC = item.cellTemp;
              if (item.hvacSummary) d.hvacSummary = item.hvacSummary;
          }
      }
  }
  
  if (sources.v2FirstResponder) {
       const data = sources.v2FirstResponder;
       const list = Array.isArray(data) ? data : (data.devices || []);
       for (const item of list) {
           if (item && item.ipAddress) {
               const d = getOrCreate(item.ipAddress);
               d.sourceCoverage.firstResponder = true;
               d.raw!.firstResponder = item;
               sourceCounts.firstResponder++;
               if (item.hvacMode) d.hvacMode = item.hvacMode;
               if (item.hvacStatus) d.hvacStatus = item.hvacStatus;
               if (item.ambientTemp) d.temperatureAmbientC = item.ambientTemp;
               if (item.cellTemp) d.temperatureCellC = item.cellTemp;
           }
       }
   }

  // Direct Feather integration
  if (cache && cache.devices) {
     for (const dev of cache.devices) {
         if (dev.deviceIp) {
             const d = getOrCreate(dev.deviceIp);
             d.sourceCoverage.directFeather = true;
             d.raw!.directFeather = dev;
             if (dev.reachable) {
                 sourceCounts.directFeatherSuccess++;
                 d.reachable = true;
                 d.communicating = true;
                 d.pingMs = dev.responseDurationMs;
                 d.lastSuccessUtc = dev.lastSuccessAt || new Date().toISOString();
                 if (dev.firmwareVersion) d.firmwareVersion = dev.firmwareVersion;
                 if (dev.entityName) d.entityDescription = dev.entityName;
                 d.warningCount = dev.warningCount;
                 d.alarmCount = dev.alarmCount;
                 if (dev.activeWarnings) d.warnInfo = dev.activeWarnings;
                 if (dev.activeAlarms) d.alarmFaults = dev.activeAlarms;
                 if (dev.spaceTemperature !== null) d.temperatureSupplyC = dev.spaceTemperature;
                 if (dev.avgCellTemperature !== null) d.temperatureCellC = dev.avgCellTemperature;
                 if (dev.thermostatStage) d.hvacMode = dev.thermostatStage;
                 d.mioSensorSummary = dev.mioValid ? "Valid" : "Invalid";
             } else {
                 sourceCounts.directFeatherFailed++;
             }
             d.lastCheckedUtc = dev.lastSuccessAt || new Date().toISOString();
         }
     }
  }

  // Populate entityDescription fallback logic
  const devices = Array.from(devicesMap.values());
  for (const d of devices) {
      if (!d.entityDescription) {
          if (d.displayKey && d.entitySubType) {
              d.entityDescription = d.displayKey + " / " + d.entitySubType;
          } else if (d.entityType && d.entitySubType) {
               d.entityDescription = d.entityType + " / " + d.entitySubType;
          } else if (d.raw!.directFeather && (d.raw!.directFeather as any).entityName) {
               d.entityDescription = (d.raw!.directFeather as any).entityName;
          }
      }
      // do not default to generic placeholders here unless explicitly requested
      if (!d.warnInfo) d.warnInfo = [];
      if (!d.alarmFaults) d.alarmFaults = [];
      if (!d.warningCount) d.warningCount = d.warnInfo.length;
      if (!d.alarmCount) d.alarmCount = d.alarmFaults.length;
  }

  return {
    profileId: profile.id,
    emsBaseUrl: baseUrl,
    generatedAt: new Date().toISOString(),
    total: devices.length,
    sourceCounts,
    devices
  };
}
