import { ProfileStore } from "../profiles/profileStore";
import { buildEmsBaseUrl } from "../profiles/profileManager";
import { getFeatherCache } from "./featherClient";
import { formatLostCommsEntry, formatFeatherDiagnosticValue } from "../../lib/featherErrorFormatter";
import { formatPrizmUtcTimestamp } from "../../lib/timeFormat";

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

  firmwareType?: string;
  controllerType?: string;

  spaceTemperatureC?: number;
  spaceHumidityPct?: number;
  avgCellTemperatureC?: number;
  avgCellTemperatureRateCPerMin?: number;
  supplyAirTempC?: number;
  outsideTemperatureC?: number;
  outsideHumidityPct?: number | null;
  hydrogen1PPM?: number;
  controlTemperatureC?: number;
  coolingSetpointC?: number;
  heatingSetpointC?: number;
  thermostatStage?: string;
  running?: boolean;
  thermalControlRunning?: boolean;
  hvacEnabled?: boolean;
  hvac1Active?: boolean;
  hvac2Active?: boolean;
  anyHvacActive?: boolean;
  hvacRuntimeState?: string;
  hvacDataValid?: boolean;
  fssValid?: boolean;
  doorsValid?: boolean;
  segmentLabel?: string;

  hvac1?: {
    controlsValid?: boolean;
    dataValid?: boolean;
    fanLowOn?: boolean;
    fanHighOn?: boolean;
    compressorOn?: boolean;
    reversingValveOn?: boolean;
    electricHeatOn?: boolean;
    freezeDetected?: boolean;
    currentA?: number;
    fanSpeedRpm?: number;
    firmwareVersion?: string;
  };

  hvac2?: {
    controlsValid?: boolean;
    dataValid?: boolean;
    fanLowOn?: boolean;
    fanHighOn?: boolean;
    compressorOn?: boolean;
    reversingValveOn?: boolean;
    electricHeatOn?: boolean;
    freezeDetected?: boolean;
    currentA?: number;
    fanSpeedRpm?: number;
    firmwareVersion?: string;
  };

  fssSignals?: {
    valid?: boolean;
    fssAlarm?: boolean;
    fssAlarmOrTrouble?: boolean;
    fssTrouble?: boolean;
    statXRelease?: boolean;
    hydrogenAlarm?: boolean;
    hydrogenFault?: boolean;
    smokeAlarm?: boolean;
    smokeAlarmTrouble?: boolean;
    heatSensor?: boolean;
    fireAlarm?: boolean;
    fireTrouble?: boolean;
    leakAlarm?: boolean;
    louverOpen?: boolean;
  };

  doors?: {
    valid?: boolean;
    batteryDoorsClosed?: boolean;
    lowerTopcapClosed?: boolean;
    dcDoorsClosed?: boolean;
    acDoorsClosed?: boolean;
  };

  doorApplicability?: {
    isCollectionSegment: boolean;
    monitorsAcDoors: boolean;
    monitorsDcDoors: boolean;
    monitorsBatteryDoors: boolean;
    monitorsTopCap: boolean;
  };

  devicesWithLostComms?: string[];
  lostCommsDevices?: Array<{
    device: string;
    lastCommsTimestampMillis?: string | number | null;
    lastCommsTimestampUtc?: string | null;
    displayText: string;
    raw?: any;
  }>;
  activeWarningInterlocks?: any[];
  activeTripFaultLog?: any[];
  warningMessages?: string[];
  faultMessages?: string[];

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


export function normalizeDirectFeatherStatus(ip: string, raw: any): Partial<FeatherHvacDevice> {
  const partial: Partial<FeatherHvacDevice> = {};
  if (!raw || typeof raw !== "object") return partial;

  partial.ip = ip;

  const statsReport = raw.fromFeatherControllerStatistcsReport;
  if (statsReport) {
    if (statsReport.controllerStatisticsData) {
      if (statsReport.controllerStatisticsData.ipAddress) {
        partial.ip = statsReport.controllerStatisticsData.ipAddress;
      }
      partial.controllerType = statsReport.controllerStatisticsData.controllerType;
      
      const tv = statsReport.controllerStatisticsData.turtleVersion;
      if (tv) {
        partial.firmwareType = tv.firmwareType;
        if (tv.fwVersionMajor !== undefined && tv.fwVersionMinor !== undefined && tv.fwVersionRevision !== undefined) {
          partial.firmwareVersion = `${tv.fwVersionMajor}.${tv.fwVersionMinor}.${tv.fwVersionRevision}`;
        }
      }
    }
  }

  const parts = ip.split(".");
  let isCS = false;
  let isES = false;
  if (parts.length === 4) {
    const arrayNum = parseInt(parts[2], 10);
    const lastOctet = parseInt(parts[3], 10);
    partial.arrayIndex = arrayNum;

    if (lastOctet === 3) {
      isCS = true;
      partial.segmentLabel = "CS";
      partial.entityDescription = `Feather CS`;
    } else if (lastOctet >= 10 && (lastOctet - 10) % 5 === 0) {
      isES = true;
      const energySegmentNumber = ((lastOctet - 10) / 5) + 1;
      partial.segmentLabel = `ES ${energySegmentNumber}`;
      partial.entityDescription = `Feather ES ${energySegmentNumber}`;
    }
  }

  // Fallbacks for entity description
  if (!partial.entityDescription) {
    if (partial.controllerType) {
      partial.entityDescription = partial.controllerType;
    }
  }

  partial.deviceState = raw.operationalState || "NORMAL";
  
  if (raw.healthy === true && partial.deviceState === "NORMAL") {
    partial.deviceState = "NORMAL";
  }

  const thermal = raw.thermalData || {};
  partial.spaceTemperatureC = thermal.spaceTemperature !== undefined ? thermal.spaceTemperature : undefined;
  partial.spaceHumidityPct = thermal.spaceHumidity !== undefined ? thermal.spaceHumidity : undefined;
  partial.avgCellTemperatureC = thermal.avgCellTemperature !== undefined ? thermal.avgCellTemperature : undefined;
  partial.avgCellTemperatureRateCPerMin = thermal.avgCellTemperatureRateOfChange !== undefined ? thermal.avgCellTemperatureRateOfChange : undefined;
  partial.thermostatStage = thermal.thermostatStage;
  partial.supplyAirTempC = thermal.supplyAirTemp !== undefined ? thermal.supplyAirTemp : undefined;
  partial.outsideTemperatureC = thermal.outsideTemperature !== undefined ? thermal.outsideTemperature : undefined;
  
  if (isES) {
    partial.outsideHumidityPct = null; // Ignored for ES
  } else if (thermal.outsideHumidity !== undefined) {
    partial.outsideHumidityPct = thermal.outsideHumidity === 999.9 ? null : thermal.outsideHumidity;
  }

  partial.hydrogen1PPM = thermal.hydrogen1PPM !== undefined ? thermal.hydrogen1PPM : undefined;
  partial.controlTemperatureC = thermal.controlTemperature !== undefined ? thermal.controlTemperature : undefined;
  partial.coolingSetpointC = thermal.coolingSetpoint !== undefined ? thermal.coolingSetpoint : undefined;
  partial.heatingSetpointC = thermal.heatingSetpoint !== undefined ? thermal.heatingSetpoint : undefined;
  
  partial.running = thermal.running;
  partial.thermalControlRunning = thermal.running;
  partial.hvacEnabled = thermal.enabled;

  const hvac1Ctrls = thermal.HVAC1Controls || {};
  const hvac1Data = thermal.HVAC1Data || {};
  partial.hvac1 = {
    controlsValid: hvac1Ctrls.valid,
    dataValid: hvac1Data.valid,
    fanLowOn: hvac1Ctrls.fanLowOn,
    fanHighOn: hvac1Ctrls.fanHighOn,
    compressorOn: hvac1Ctrls.YCompressorOn,
    reversingValveOn: hvac1Ctrls.ReversingValveOn,
    electricHeatOn: hvac1Ctrls.ElectricHeatOn,
    freezeDetected: hvac1Data.FreezeDetected,
    currentA: hvac1Data.hvacCurrent || 0,
    fanSpeedRpm: hvac1Data.fanSpeedRpm || 0,
    firmwareVersion: hvac1Data.firmwareVersion,
  };

  const hvac2Ctrls = thermal.HVAC2Controls || {};
  const hvac2Data = thermal.HVAC2Data || {};
  partial.hvac2 = {
    controlsValid: hvac2Ctrls.valid,
    dataValid: hvac2Data.valid,
    fanLowOn: hvac2Ctrls.fanLowOn,
    fanHighOn: hvac2Ctrls.fanHighOn,
    compressorOn: hvac2Ctrls.YCompressorOn,
    reversingValveOn: hvac2Ctrls.ReversingValveOn,
    electricHeatOn: hvac2Ctrls.ElectricHeatOn,
    freezeDetected: hvac2Data.FreezeDetected,
    currentA: hvac2Data.hvacCurrent || 0,
    fanSpeedRpm: hvac2Data.fanSpeedRpm || 0,
    firmwareVersion: hvac2Data.firmwareVersion,
  };

  partial.hvac1Active = !!(
    hvac1Ctrls.fanLowOn ||
    hvac1Ctrls.fanHighOn ||
    hvac1Ctrls.YCompressorOn ||
    hvac1Ctrls.ReversingValveOn ||
    hvac1Ctrls.ElectricHeatOn ||
    (partial.hvac1.currentA && partial.hvac1.currentA > 0.2) ||
    (partial.hvac1.fanSpeedRpm && partial.hvac1.fanSpeedRpm > 0)
  );

  partial.hvac2Active = !!(
    hvac2Ctrls.fanLowOn ||
    hvac2Ctrls.fanHighOn ||
    hvac2Ctrls.YCompressorOn ||
    hvac2Ctrls.ReversingValveOn ||
    hvac2Ctrls.ElectricHeatOn ||
    (partial.hvac2.currentA && partial.hvac2.currentA > 0.2) ||
    (partial.hvac2.fanSpeedRpm && partial.hvac2.fanSpeedRpm > 0)
  );

  partial.anyHvacActive = partial.hvac1Active || partial.hvac2Active;
  
  if (partial.anyHvacActive) {
      partial.hvacRuntimeState = "HVAC Active";
  } else if (!partial.anyHvacActive && (hvac1Ctrls.valid !== undefined)) {
      partial.hvacRuntimeState = "HVAC Idle";
  } else {
      partial.hvacRuntimeState = "HVAC Unknown";
  }

  partial.hvacDataValid = !!(
      hvac1Ctrls.valid && hvac2Ctrls.valid &&
      hvac1Data.valid && hvac2Data.valid
  );

  const fss = thermal.fssSignals || raw.fssSignals || {};
  partial.fssSignals = {
    valid: fss.valid === true,
    fssAlarm: fss.fssAlarm === true,
    fssAlarmOrTrouble: fss.fssAlarmOrTrouble === true,
    fssTrouble: fss.fssTrouble === true,
    statXRelease: fss.statXRelease === true,
    hydrogenAlarm: fss.hydrogenAlarm === true,
    hydrogenFault: fss.hydrogenFault === true,
    smokeAlarm: fss.smokeAlarm === true,
    smokeAlarmTrouble: fss.smokeAlarmTrouble === true,
    heatSensor: fss.heatSensor === true,
    fireAlarm: fss.fireAlarm === true,
    fireTrouble: fss.fireTrouble === true,
    leakAlarm: fss.leakAlarm === true,
    louverOpen: fss.louverOpen === true,
  };
  partial.fssValid = fss.valid === true;

  const doors = thermal.doors || raw.doors || {};
  partial.doors = {
    valid: doors.valid === true,
    batteryDoorsClosed: doors.batteryDoorsClosed === true,
    lowerTopcapClosed: doors.lowerTopcapClosed === true,
    dcDoorsClosed: doors.dcDoorsClosed === true,
    acDoorsClosed: doors.acDoorsClosed === true,
  };
  partial.doorsValid = doors.valid === true;

  partial.doorApplicability = {
    isCollectionSegment: isCS,
    monitorsAcDoors: isCS,
    monitorsDcDoors: isCS,
    monitorsBatteryDoors: isES,
    monitorsTopCap: true,
  };

  const rawLostComms = raw.devicesWithLostComms || raw.deviceStatusComms || raw.diagnosticStatus?.deviceStatusComms || [];
  partial.lostCommsDevices = [];
  partial.devicesWithLostComms = [];
  
  if (Array.isArray(rawLostComms)) {
    for (const item of rawLostComms) {
       const formatted = formatLostCommsEntry(item);
       if (formatted && formatted.label !== "--") {
           partial.devicesWithLostComms.push(formatted.label);
           partial.lostCommsDevices.push({
               device: formatted.label,
               lastCommsTimestampMillis: item?.lastCommsTimestampMillis || item?.lastCommsMs || item?.timestampMillis,
               lastCommsTimestampUtc: item?.lastCommsTimestampMillis ? formatPrizmUtcTimestamp(Number(item.lastCommsTimestampMillis)) : null,
               displayText: formatted.tooltip || formatted.label,
               raw: item
           });
       }
    }
  }

  partial.activeWarningInterlocks = raw.activeWarningInterlocks || raw.warningInterlocks || raw.diagnosticStatus?.activeWarningInterlocks || [];
  partial.activeTripFaultLog = raw.activeTripFaultLog || raw.tripFaultLog || raw.diagnosticStatus?.activeTripFaultLog || [];

  return partial;
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

  let rejectedCandidateCount = 0;
  const rejectedCandidates: any[] = [];

  // 1. Initialize map only with explicitly tracked Feather devices
  if (cache && cache.devices) {
     for (const dev of cache.devices) {
         if ((dev as any).rejected) {
             rejectedCandidateCount++;
             rejectedCandidates.push({
                 candidateIp: dev.deviceIp,
                 included: false,
                 reason: (dev as any).rejectedReason || "string-controller-or-inferred-es-host",
                 source: dev.sourceDiscoveryMethod || "stringIpMap",
                 lastValidationStatus: "not-feather"
             });
             continue;
         }
         
         if (dev.deviceIp) {
             devicesMap.set(dev.deviceIp, {
                 ip: dev.deviceIp,
                 discoveryMethod: "merged",
                 sourceCoverage: {
                   blockviewer: false,
                   ipMap: false,
                   stringIpMap: false,
                   stringsCsv: false,
                   lastCall: false,
                   directFeather: true,
                   firstResponder: false
                 },
                 raw: { directFeather: dev },
                 warnInfo: [],
                 alarmFaults: []
             });
         }
     }
  }

  const getIfExists = (ip: string) => devicesMap.get(ip);

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
             const d = getIfExists(item.ipAddress);
             if (!d) continue;
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
               const d = getIfExists(arr.ipAddress);
               if (!d) continue;
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
                         const d = getIfExists(str.ipAddress);
                         if (!d) continue;
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
             const d = getIfExists((val as any).ipAddress);
             if (!d) continue;
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
              const d = getIfExists(item.ip);
              if (!d) continue;
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
              const d = getIfExists(item.ipAddress);
              if (!d) continue;
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
              const d = getIfExists(item.ipAddress);
              if (!d) continue;
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
               const d = getIfExists(item.ipAddress);
               if (!d) continue;
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
             const d = getIfExists(dev.deviceIp);
             if (!d) continue;
             d.sourceCoverage.directFeather = true;
             d.raw!.directFeather = dev;
             if (dev.reachable && dev.rawResponse) {
                 sourceCounts.directFeatherSuccess++;
                 const normalized = normalizeDirectFeatherStatus(dev.deviceIp, dev.rawResponse);
                 Object.assign(d, normalized);

                 d.reachable = true;
                 d.communicating = true;
                 d.pingMs = dev.responseDurationMs;
                 d.lastSuccessUtc = dev.lastSuccessAt || new Date().toISOString();

                 d.warnInfo = [];
                 d.alarmFaults = [];

                 if (normalized.fssSignals) {
                   const fss = normalized.fssSignals;
                   if (fss.fssAlarm) d.alarmFaults.push("FSS Alarm");
                   if (fss.fssTrouble) d.alarmFaults.push("FSS Trouble");
                   if (fss.fssAlarmOrTrouble) d.alarmFaults.push("FSS Alarm or Trouble");
                   if (fss.statXRelease) d.alarmFaults.push("StatX Release");
                   if (fss.hydrogenAlarm) d.alarmFaults.push("H2 Alarm");
                   if (fss.hydrogenFault) d.alarmFaults.push("H2 Fault");
                   if (fss.smokeAlarm) d.alarmFaults.push("Smoke Alarm");
                   if (fss.smokeAlarmTrouble) d.alarmFaults.push("Smoke Alarm Trouble");
                   if (fss.heatSensor) d.alarmFaults.push("Heat Sensor");
                   if (fss.fireAlarm) d.alarmFaults.push("Fire Alarm");
                   if (fss.fireTrouble) d.alarmFaults.push("Fire Trouble");
                   if (fss.leakAlarm) d.alarmFaults.push("Leak Alarm");
                   
                 }

                 if (normalized.hvac1?.freezeDetected) d.alarmFaults.push("HVAC1 Freeze");
                 if (normalized.hvac2?.freezeDetected) d.alarmFaults.push("HVAC2 Freeze");

                 if (normalized.doors && normalized.doorApplicability) {
                     const doors = normalized.doors;
                     const app = normalized.doorApplicability;
                     if (app.monitorsAcDoors && doors.acDoorsClosed === false) d.alarmFaults.push("AC Door Open");
                     if (app.monitorsDcDoors && doors.dcDoorsClosed === false) d.alarmFaults.push("DC Door Open");
                     if (app.monitorsBatteryDoors && doors.batteryDoorsClosed === false) d.alarmFaults.push("Battery Door Open");
                     if (app.monitorsTopCap && doors.lowerTopcapClosed === false) d.alarmFaults.push("Top Cap Open");
                 }

                 if (normalized.devicesWithLostComms && normalized.devicesWithLostComms.length > 0) {
                     d.alarmFaults.push("Lost Comms");
                     const formattedLost = normalized.devicesWithLostComms.map((item: any) => {
                        if (typeof item === 'string') return item;
                        if (item && typeof item === 'object') return item.deviceName || item.name || item.type || JSON.stringify(item);
                        return String(item);
                     });
                     d.warnInfo.push(`Lost Comms with: ${formattedLost.join(", ")}`);
                 }
                 if (normalized.activeWarningInterlocks && normalized.activeWarningInterlocks.length > 0) {
                     normalized.activeWarningInterlocks.forEach((w: any) => {
                         const msg = typeof w === "object" && w !== null && (w.device || w.lastCommsTimestampMillis) ?
                             (formatLostCommsEntry(w).tooltip ? formatLostCommsEntry(w).tooltip! : formatFeatherDiagnosticValue(w))
                             : formatFeatherDiagnosticValue(w);
                         if (!d.warnInfo.includes(msg)) d.warnInfo.push(msg);
                     });
                 }
                 if (normalized.activeTripFaultLog && normalized.activeTripFaultLog.length > 0) {
                     normalized.activeTripFaultLog.forEach((f: any) => {
                         const msg = typeof f === "object" && f !== null && (f.device || f.lastCommsTimestampMillis) ?
                             (formatLostCommsEntry(f).tooltip ? formatLostCommsEntry(f).tooltip! : formatFeatherDiagnosticValue(f))
                             : formatFeatherDiagnosticValue(f);
                         if (!d.alarmFaults.includes(msg)) d.alarmFaults.push(msg);
                     });
                 }
                 d.warningMessages = [...d.warnInfo];
                 d.faultMessages = [...d.alarmFaults];


                 if (normalized.thermostatStage) d.hvacMode = normalized.thermostatStage;
                 d.mioSensorSummary = normalized.hvac1?.controlsValid ? "Valid" : "Invalid";
             } else if (dev.reachable) {
                 sourceCounts.directFeatherSuccess++;
                 d.reachable = true;
                 d.communicating = true;
                 d.pingMs = dev.responseDurationMs;
                 d.lastSuccessUtc = dev.lastSuccessAt || new Date().toISOString();
                 if (dev.firmwareVersion) d.firmwareVersion = dev.firmwareVersion;
                 if (dev.entityName) d.entityDescription = dev.entityName;
                 if (dev.activeWarnings) {
                     d.warnInfo = dev.activeWarnings.filter((w: string) => !w.includes("TRIP") && !w.includes("WARNING"));
                 }
                 if (dev.activeAlarms) {
                     d.alarmFaults = dev.activeAlarms.filter((a: string) => !a.includes("TRIP") && !a.includes("ALARM"));
                 }
                 
                 d.warningCount = d.warnInfo?.length || 0;
                 d.alarmCount = d.alarmFaults?.length || 0;
                 if (dev.spaceTemperature !== null) d.temperatureSupplyC = dev.spaceTemperature;
                 if (dev.avgCellTemperature !== null) d.temperatureCellC = dev.avgCellTemperature;
                 if (dev.thermostatStage) d.hvacMode = dev.thermostatStage;
                 d.mioSensorSummary = dev.mioValid ? "Valid" : "Invalid";
             } else {
                 sourceCounts.directFeatherFailed++;
                 d.deviceState = "OFFLINE";
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
    candidateCount: devices.length,
    rejectedCandidateCount,
    rejectedCandidates,
    total: devices.length,
    sourceCounts,
    devices
  };
}
