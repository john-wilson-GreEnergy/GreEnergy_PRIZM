import * as prizmCache from "./cache/prizmCache";
import { Router } from "express";
import { buildSiteTopologyFromCachedSources } from "./topology/siteTopology";
import { 
    getEmsCachedBlock, 
    getEmsCachedStatus, 
    getEmsCachedLastCall, 
    getEmsCachedRawStrings, 
    getEmsIpMap,
    getEmsStringIpMap,
    getEmsCachedStatusCodes,
    getEmsConnectionStatus, 
    getEmsSourcesDebugInfo 
} from "./emsTurtleClient";
import { getFeatherCache } from "./feather/featherClient";
import { BESS_STATUS_CODE_MAP, describeBessStatusCode } from "../lib/bessStatusCodes";
import { getNormalizedStringFaults, getCorrectiveActionsFromNormalizedFaults, classifyStringAvailability } from "./faults/normalizedFaultSource";
import { classifyStringOperationalState } from "../lib/stringClassifier";
import { normalizeStringRow } from "./normalizers/stringNormalizer";
import { formatStringEsLabel } from "../lib/stringToEsMapper";
import { normalizeIpToEquipmentCallout } from "../lib/topologyResolver";
import { ProfileStore } from "./profiles/profileStore";

const router = Router();

// generic deep finder

function scoreArrayCandidate(a: any): number {
    let score = 0;
    if (a.arrayIndex != null || a.arrayNumber != null) score += 10;
    if (a.onlineSOC != null) score += 5;
    if (a.nearlineSOC != null) score += 5;
    if (a.offlineSOC != null) score += 5;
    if (a.nearlineAvailableKWh != null) score += 2;
    if (a.onlineAvailableKWh != null) score += 2;
    if (a.availableACChargekW != null) score += 5;
    if (a.availableACDischargekW != null) score += 5;
    if (a.commandedkW != null) score += 2;
    if (a.measuredkW != null) score += 2;
    if (a.communicatingStackCount != null) score += 1;
    if (a.notCommunicatingStackCount != null) score += 1;
    if (a.friendlyString != null) score += 1;
    return score;
}
function numOrNull(val: any): number | null {
    if (val === null || val === undefined) return null;
    const n = Number(val);
    return isNaN(n) ? null : n;
}

function findArraysByObjectKeys(obj: any, requiredKeys: string[], results: any[] = []) {
    if (!obj || typeof obj !== 'object') return results;
    if (Array.isArray(obj)) {
        if (obj.length > 0 && typeof obj[0] === 'object' && requiredKeys.every(k => k in obj[0])) {
            results.push(...obj);
        } else {
            obj.forEach(o => findArraysByObjectKeys(o, requiredKeys, results));
        }
    } else {
        for (const [k, v] of Object.entries(obj)) {
            findArraysByObjectKeys(v, requiredKeys, results);
        }
    }
    return results;
}

const DRAGON_APP_CODE_NAME_MAP: Record<string, string> = {
  ES00001: "E-Stop Response v1.0",
  BSF0001: "Battery Safety v1.0",
  BP00001: "Block Power",
  HCP0001: "High Current Protection App v1.0",
  CAL001: "CAL001",
  CAL0001: "Critical Aux Load v1.0",
  PC00001: "Power Control v1.0",
  SSPC001: "Sunspec Power Command v1.0",
  BOP0001: "Basic Op v1.0",
  SCHED001: "Scheduler v1.0",
  FD00001: "Frequency Droop v1.0",
  AVR0001: "Automatic Voltage Regulation v1.0",
  ETC0001: "Enclosure Control v1.0",
  PCOMP001: "Power Compensator v1.0",
  ADB0001: "Auto Discharge Balancer v1.0",
  SLOW001: "Slow Charge v1.0",
  CTC0001: "Centipede Thermal Control v1.0",
  BS00001: "Backstop v1.0"
};

function collectEmsAppCandidates(root: any, path: string = ""): any[] {
    const results: any[] = [];
    if (!root || typeof root !== 'object') return results;

    if (Array.isArray(root)) {
        if (root.length > 0 && root.some(item => item && typeof item === 'object' && item.appCode !== undefined && (item.appName !== undefined || item.priority !== undefined || item.configName !== undefined || item.health !== undefined))) {
            root.forEach(item => {
                if (item && typeof item === 'object' && item.appCode !== undefined) {
                    results.push({ ...item, sourcePath: path });
                }
            });
        } else {
            root.forEach((o, i) => results.push(...collectEmsAppCandidates(o, `${path}[${i}]`)));
        }
    } else {
        for (const [k, v] of Object.entries(root)) {
            results.push(...collectEmsAppCandidates(v, path ? `${path}.${k}` : k));
        }
    }
    return results;
}

export function deriveArrayNumberFromRow(str: any): number | null {
  const raw = str?.raw || str;
  if (!raw) return null;

  // 1. row.arrayNumber / row.ArrayNumber
  const an = raw.arrayNumber ?? raw.ArrayNumber;
  if (typeof an === 'number' && an >= 1 && an <= 8) return an;
  if (typeof an === 'string') {
    const parsed = parseInt(an, 10);
    if (parsed >= 1 && parsed <= 8) return parsed;
  }

  // 2. row.arrayIndex, only if >= 1
  const ai = raw.arrayIndex ?? raw.ArrayIndex ?? raw.array_index;
  if (typeof ai === 'number' && ai >= 1 && ai <= 8) return ai;
  if (typeof ai === 'string') {
    const parsed = parseInt(ai, 10);
    if (parsed >= 1 && parsed <= 8) return parsed;
  }

  // 3. row.array
  const arr = raw.array;
  if (typeof arr === 'number' && arr >= 1 && arr <= 8) return arr;
  if (typeof arr === 'string') {
    const parsed = parseInt(arr, 10);
    if (parsed >= 1 && parsed <= 8) return parsed;
  }

  // 4. row.arr
  const ar = raw.arr;
  if (typeof ar === 'number' && ar >= 1 && ar <= 8) return ar;
  if (typeof ar === 'string') {
    const parsed = parseInt(ar, 10);
    if (parsed >= 1 && parsed <= 8) return parsed;
  }

  // 5. parse from row.label / row.displayLabel / row.friendlyString / row.id / row.deviceName
  const stringsToSearch: string[] = [];
  if (str?.id) stringsToSearch.push(String(str.id));
  if (str?.stringKey) stringsToSearch.push(String(str.stringKey));
  if (raw.id) stringsToSearch.push(String(raw.id));
  if (raw.label) stringsToSearch.push(String(raw.label));
  if (raw.displayLabel) stringsToSearch.push(String(raw.displayLabel));
  if (raw.friendlyString) stringsToSearch.push(String(raw.friendlyString));
  if (raw.deviceName) stringsToSearch.push(String(raw.deviceName));

  for (const s of stringsToSearch) {
    if (!s) continue;
    
    // Pattern: BHE0020:1:1 or ES00001:1:5
    const parts = s.split(':');
    if (parts.length >= 3) {
      const p2 = parseInt(parts[1], 10);
      const p3 = parseInt(parts[2], 10);
      if (p2 >= 1 && p2 <= 8) return p2;
      if (p3 >= 1 && p3 <= 8) return p3;
    }

    // Pattern: A1-S1 or A5
    const matchA = s.match(/\bA([1-8])\b/i) || s.match(/A([1-8])[-_\s]/i);
    if (matchA) {
      return parseInt(matchA[1], 10);
    }
    
    // Pattern: Array 1 or Array5
    const matchArray = s.match(/array\s*([1-8])\b/i);
    if (matchArray) {
      return parseInt(matchArray[1], 10);
    }

    // Pattern: Block 1 / Array 5 / ES3 - String 5
    const matchBlockArray = s.match(/array\s*([1-8])/i);
    if (matchBlockArray) {
      return parseInt(matchBlockArray[1], 10);
    }
  }

  return null;
}

export type NormalizedStringRow = {
  id: string;
  arrayNumber: number | null;
  stringNumber: number | null;
  stringKey: string;
  contactorStatus: string;
  contactorClosed: boolean | null;
  contactorsCloseExpected: boolean | null;
  positiveContactorClosed: boolean | null;
  negativeContactorClosed: boolean | null;
  recloseCount: number | null;
  rotationStatus: string;
  outRotation: boolean | null;
  rotationEnabled: boolean | null;
  measuredVoltage: number | null;
  calculatedVoltage: number | null;
  busVoltage: number | null;
  voltageDelta: number | null;
  amps: number | null;
  kw: number | null;
  socPct: number | null;
  ah: number | null;
  kwh: number | null;
  minCellVoltage: number | null;
  maxCellVoltage: number | null;
  avgCellVoltage: number | null;
  cellVoltageDelta: number | null;
  minCellTemperature: number | null;
  maxCellTemperature: number | null;
  avgCellTemperature: number | null;
  cellTemperatureDelta: number | null;
  balanceCount: number | null;
  balanceMode: string;
  container: string;
  location: string;
  fanCommandRequested: boolean;
  lastFanCommandTime: string | null;
  fanHealthy: boolean;
  timestampUtc: string | null;
  lastUpdatedUtc: string | null;
  bpcCount: number | null;
  bpcFirmwareSummary: string;
  bpcs: any[];
  operationalState: string;
  warningCount: number;
  alarmCount: number;
  warnings: string[];
  alarms: string[];
  bucket: "online" | "nearline" | "offline" | "notCommunicating" | "unknown";
  communicating: boolean | null;
  inRotation: boolean | null;
  contactorsClosed: boolean | null;
  sourceCoverage: any;
  sourcePath: string;
  raw: any;

  // Preserve the old properties as well just in case they are used elsewhere in codebase
  connectionState?: string;
  connectionPermitted?: boolean | null;
  currentA?: number | null;
  powerKw?: number | null;
  maxCellVoltageMv?: number | null;
  avgCellVoltageMv?: number | null;
  minCellVoltageMv?: number | null;
  voltageDeltaMv?: number | null;
  maxTempC?: number | null;
  avgTempC?: number | null;
  minTempC?: number | null;
  tempDeltaC?: number | null;
  wattHourCapacity?: number | null;

  // Canonical fields for snap
  badReport?: boolean | null;
  bothContactorsClosed?: boolean | null;
  operationalBucket?: "online" | "nearline" | "offline" | "notCommunicating" | "unknown";
  bucketReason?: string;
  bucketSource?: string;
  rawBucket?: any;
  measuredVoltageVdc?: number | null;
  calculatedVoltageVdc?: number | null;
  busVoltageVdc?: number | null;
  stackVoltageVdc?: number | null;
  ampHours?: number | null;
  storedKWh?: number | null;
  cellVoltageDeltaMv?: number | null;
  minCellTempC?: number | null;
  avgCellTempC?: number | null;
  maxCellTempC?: number | null;
  cellTempDeltaC?: number | null;
  commandMatchesContactors?: boolean | null;
};

export function buildStringBucketSummary(stringsData: any[]) {
    function bool(v: any) {
        if (v === true || v === false) return v;
        if (typeof v === 'string') return v.toLowerCase() === 'true' || v.toLowerCase() === '1' || v.toLowerCase() === 'yes';
        if (typeof v === 'number') return v === 1;
        return false;
    }

    function num(v: any) {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }

    const rawStringsWrapper = getEmsCachedRawStrings();
    const blockWrapper = getEmsCachedBlock();
    const stringIpMapWrapper = getEmsStringIpMap();
    const ipMapWrapper = getEmsIpMap();
    const lastCallWrapper = getEmsCachedLastCall();

    const stringIpMap = (stringIpMapWrapper && Array.isArray(stringIpMapWrapper.data)) ? stringIpMapWrapper.data : [];
    const ipMap = (ipMapWrapper && Array.isArray(ipMapWrapper.data)) ? ipMapWrapper.data : [];

    let lastCallStrings: any[] = [];
    let lastCallArrays: any[] = [];
    if (lastCallWrapper && lastCallWrapper.data) {
        if (Array.isArray(lastCallWrapper.data.strings)) lastCallStrings = lastCallWrapper.data.strings;
        if (Array.isArray(lastCallWrapper.data.arrays)) lastCallArrays = lastCallWrapper.data.arrays;
    }

    let totalStringsVal = 0;
    let normalStrings = 0;
    let nearlineStrings = 0;
    let offlineStrings = 0;
    let gWarnCount = 0;
    let gAlarmCount = 0;
    let totalBpcsCount = 0;
    let knownBpcCountVal = 0;

    let gMinV: number | null = null;
    let gMaxV: number | null = null;
    let gSumV = 0;
    let gCountV = 0;
    let gMaxVDelta: number | null = null;

    let gMinT: number | null = null;
    let gMaxT: number | null = null;
    let gSumT = 0;
    let gCountT = 0;
    let gMaxTDelta: number | null = null;

    const tableRows: NormalizedStringRow[] = stringsData.map(row => {
        totalStringsVal++;

        const norm = normalizeStringRow(row, {
            compatMissingContactorAsNearline: false,
            sourcePath: "/tools/report/ems/strings.csv",
            sourcePriority: 10
        });

        const id = norm.id;
        const arrayNumber = norm.arrayNumber;
        const stringNumber = norm.stringNumber;
        const stringKey = norm.stringKey;
        const bucket = norm.bucket;
        const outRotation = norm.outRotation;
        const inRotation = norm.inRotation;
        const contactorClosed = norm.bothContactorsClosed;
        const contactorsClosed = norm.bothContactorsClosed;
        const communicating = norm.communicating;
        const positiveContactorClosed = norm.positiveContactorClosed;
        const negativeContactorClosed = norm.negativeContactorClosed;
        const contactorsCloseExpected = norm.contactorsCloseExpected;
        const commandMatchesContactors = norm.commandMatchesContactors;
        const recloseCount = norm.recloseCount;

        const contactorStatus = contactorClosed === true ? "CLOSED" : (contactorClosed === false ? "OPEN" : "UNKNOWN");
        const rotationEnabled = outRotation !== null ? !outRotation : null;
        const rotationStatus = outRotation === true ? "OUT" : (outRotation === false ? "IN" : "UNKNOWN");

        // Voltage and power measurements
        const measuredVoltage = norm.measuredVoltageVdc;
        const calculatedVoltage = norm.calculatedVoltageVdc;
        const busVoltage = norm.busVoltageVdc;
        const voltageDelta = (measuredVoltage !== null && calculatedVoltage !== null) ? Number(Math.abs(measuredVoltage - calculatedVoltage).toFixed(2)) : null;

        const amps = norm.currentA;
        const kw = norm.powerKw;
        const socPct = norm.socPct;
        const ah = norm.ampHours;
        const kwh = norm.storedKWh;

        // Cell voltages
        const minCellVoltageMv = norm.minCellVoltageMv;
        const avgCellVoltageMv = norm.avgCellVoltageMv;
        const maxCellVoltageMv = norm.maxCellVoltageMv;
        const cellVoltageDeltaMv = norm.cellVoltageDeltaMv;

        const minCellVoltage = minCellVoltageMv !== null ? minCellVoltageMv / 1000 : null;
        const maxCellVoltage = maxCellVoltageMv !== null ? maxCellVoltageMv / 1000 : null;
        const avgCellVoltage = avgCellVoltageMv !== null ? avgCellVoltageMv / 1000 : null;
        const cellVoltageDelta = (maxCellVoltage !== null && minCellVoltage !== null) ? Number((maxCellVoltage - minCellVoltage).toFixed(3)) : null;

        // Cell temperatures (Celsius)
        const minCellTemperature = norm.minCellTempC;
        const avgCellTemperature = norm.avgCellTempC;
        const maxCellTemperature = norm.maxCellTempC;
        const cellTemperatureDelta = norm.cellTempDeltaC;

        // Connection Permitted
        const connectionPermitKeys = [
            "connectionPermitted",
            "contactorsCloseExpected",
            "closePermitted",
            "canConnect",
            "stringConnectionPermitted",
            "permitClose",
            "readyToConnect"
        ];

        let rawConnectionPermitted = null;
        let matchedKey = null;

        for (const key of connectionPermitKeys) {
            const lowerKey = key.toLowerCase();
            for (const k of Object.keys(row)) {
                if (k.toLowerCase() === lowerKey && row[k] !== undefined && row[k] !== null && row[k] !== "") {
                    rawConnectionPermitted = row[k];
                    matchedKey = k;
                    break;
                }
            }
            if (rawConnectionPermitted !== null) break;
        }

        const connectionPermitted = rawConnectionPermitted !== null ? bool(rawConnectionPermitted) : null;
        const connectionPermittedSource = matchedKey || "unavailable";

        // Balance fields
        const balanceCount = num(row.BalanceCount ?? row.balanceCount ?? row.BalancingCount ?? row.balancingCount);
        const balanceModeRaw = String(row.BalanceMode ?? row.balanceMode ?? row.BalancingMode ?? row.balancingMode ?? "");
        const balanceRaw = String(row.Balance ?? row.balance ?? row.Balancing ?? row.balancing ?? "");
        let balanceMode = balanceModeRaw;
        if (balanceRaw.includes("Provided") || balanceModeRaw.includes("Provided")) {
            balanceMode = "Provided";
        }

        const container = String(row.Container ?? row.container ?? row.Enclosure ?? row.enclosure ?? "");
        const location = String(row.Location ?? row.location ?? "");

        // Fan and timestamps
        const fanCommandRequested = bool(row.FanCommandRequested ?? row.fanCommandRequested ?? row.LastFanCommand ?? row.lastFanCommand ?? row.fanRequested);
        const lastFanCommandTime = row.LastFanCommandTime ?? row.lastFanCommandTime ?? null;
        const fanHealthy = bool(row.FanHealthy ?? row.fanHealthy ?? true);

        function safeParseDate(val: any): string {
            if (!val) return new Date().toISOString();
            const ts = new Date(val);
            if (isNaN(ts.getTime())) {
                return new Date().toISOString();
            }
            return ts.toISOString();
        }
        const timestampUtc = safeParseDate(row.TimestampUtc ?? row.timestampUtc ?? row.Timestamp ?? row.timestamp ?? row.DateTime ?? row.datetime);
        const lastUpdatedUtc = new Date().toISOString();

        // BPC Data
        const sIpInfo = stringIpMap.find(m => num(m.array) === arrayNumber && num(m.string) === stringNumber);
        let lcStrBase = lastCallStrings.find(s => num(s.array) === arrayNumber && num(s.string) === stringNumber);
        if (!lcStrBase) {
             const lcA = lastCallArrays.find(a => num(a.index ?? a.arrayIndex) === arrayNumber);
             if (lcA && Array.isArray(lcA.strings)) {
                 lcStrBase = lcA.strings.find((s: any) => num(s.index ?? s.stringIndex) === stringNumber);
             }
         }

        let blockStrBase: any = null;
        if (blockWrapper && blockWrapper.data?.strings) {
            blockStrBase = blockWrapper.data.strings.find((s: any) => num(s.array) === arrayNumber && num(s.string) === stringNumber) || null;
        }

        let bpcSourceData: any[] = [];
        if (lcStrBase && Array.isArray(lcStrBase.packs)) bpcSourceData = lcStrBase.packs;
        else if (lcStrBase && Array.isArray(lcStrBase.bpcs)) bpcSourceData = lcStrBase.bpcs;

        const bpcFirmwares = new Set<string>();
        const bpcs: any[] = [];
        bpcSourceData.forEach((bpcBase: any, bpcIdx: number) => {
            const bpcNum = num(bpcBase.index ?? bpcBase.bpcIndex) || (bpcIdx + 1);
            let bpcIp = null;
            const bpcIpMatch = ipMap.find(m => num(m.array) === arrayNumber && num(m.string) === stringNumber && num(m.pack ?? m.bpc) === bpcNum);
            if (bpcIpMatch) bpcIp = bpcIpMatch.ip;

            let bpcWarns = bpcBase.warnings ?? bpcBase.warningList ?? [];
            let bpcAlarms = bpcBase.alarms ?? bpcBase.alarmList ?? [];
            if (typeof bpcWarns === "string") bpcWarns = bpcWarns.split(",").map(v=>v.trim()).filter(Boolean);
            if (typeof bpcAlarms === "string") bpcAlarms = bpcAlarms.split(",").map(v=>v.trim()).filter(Boolean);
            if (Array.isArray(bpcWarns)) bpcWarns = bpcWarns.map(w => w.match(/^\d+$/) ? `${w} - ${describeBessStatusCode(w)}` : w);
            if (Array.isArray(bpcAlarms)) bpcAlarms = bpcAlarms.map(a => a.match(/^\d+$/) ? `${a} - ${describeBessStatusCode(a)}` : a);

            if (bpcBase.firmwareVersion) bpcFirmwares.add(String(bpcBase.firmwareVersion));

            bpcs.push({
                id: `A${arrayNumber}-S${stringNumber}-B${bpcNum}`,
                arrayNumber, stringNumber, bpcNumber: bpcNum,
                bpcIp,
                firmwareVersion: bpcBase.firmwareVersion,
                minCellVoltage: num(bpcBase.minCellVoltage),
                maxCellVoltage: num(bpcBase.maxCellVoltage),
                avgCellVoltage: num(bpcBase.avgCellVoltage),
                minCellTemperature: num(bpcBase.minCellTemp ?? bpcBase.minCellTemperature),
                maxCellTemperature: num(bpcBase.maxCellTemp ?? bpcBase.maxCellTemperature),
                avgCellTemperature: num(bpcBase.avgCellTemp ?? bpcBase.avgCellTemperature),
                warningCount: bpcWarns.length,
                alarmCount: bpcAlarms.length,
                warnings: bpcWarns,
                alarms: bpcAlarms,
                raw: bpcBase
            });
        });

        let bpcCount = num(row.BpcCount ?? row.bpcCount ?? row.BatteryPackCount ?? row.batteryPackCount ?? row.PackCount ?? row.packCount);
        if (bpcSourceData.length > 0) bpcCount = bpcSourceData.length;

        let bpcFirmwareSummary = "Unknown";
        if (bpcFirmwares.size === 1) bpcFirmwareSummary = Array.from(bpcFirmwares)[0];
        else if (bpcFirmwares.size > 1) bpcFirmwareSummary = "Mixed";

        // Warnings and alarms list
        let warnings: string[] = [];
        const rawWarns = row.Warns ?? row.warns ?? row.Warnings ?? row.warnings ?? row.WarnsList ?? row.warnsList ?? [];
        if (typeof rawWarns === 'string') {
            warnings = rawWarns.split(',').map(v => v.trim()).filter(Boolean);
        } else if (Array.isArray(rawWarns)) {
            warnings = rawWarns.map(v => String(v).trim()).filter(Boolean);
        }
        warnings = warnings.map(w => w.match(/^\d+$/) ? `${w} - ${describeBessStatusCode(w)}` : w);

        let alarms: string[] = [];
        const rawAlarms = row.Alarms ?? row.alarms ?? row.AlarmsList ?? row.alarmsList ?? [];
        if (typeof rawAlarms === 'string') {
            alarms = rawAlarms.split(',').map(v => v.trim()).filter(Boolean);
        } else if (Array.isArray(rawAlarms)) {
            alarms = rawAlarms.map(v => String(v).trim()).filter(Boolean);
        }
        alarms = alarms.map(a => a.match(/^\d+$/) ? `${a} - ${describeBessStatusCode(a)}` : a);

        const warningCount = num(row.WarnCount ?? row.warnCount ?? row.WarningCount ?? row.warningCount ?? warnings.length ?? 0) || 0;
        const alarmCount = num(row.AlarmCount ?? row.alarmCount ?? row.AlarmsCount ?? row.alarmsCount ?? alarms.length ?? 0) || 0;

        // operationalState determination
        let operationalState = "OFFLINE";
        if (bucket === "online") {
            if (alarmCount > 0) operationalState = "ALARM";
            else if (warningCount > 0) operationalState = "WARNING";
            else operationalState = "NORMAL";
        } else if (bucket === "nearline") {
            if (alarmCount > 0) operationalState = "ALARM";
            else if (warningCount > 0) operationalState = "WARNING";
            else operationalState = "NEARLINE";
        } else if (bucket === "offline" || bucket === "notCommunicating") {
            operationalState = "OFFLINE";
        } else {
            operationalState = "UNKNOWN";
        }

        const sourceCoverage = {
            stringsCsv: true,
            lastCall: !!lcStrBase,
            stringIpMap: !!sIpInfo,
            ipMap: !!ipMapWrapper?.data,
            blockviewer: !!blockStrBase,
            controllerStatistics: false,
            bessStatusCodes: false,
        };

        if (operationalState === "NORMAL") normalStrings++;
        if (operationalState === "NEARLINE") nearlineStrings++;
        if (operationalState === "OFFLINE") offlineStrings++;
        gWarnCount += warningCount;
        gAlarmCount += alarmCount;
        totalBpcsCount += bpcs.length;
        if (bpcCount !== null) knownBpcCountVal += bpcCount;

        if (minCellVoltageMv !== null) {
            if (gMinV === null || minCellVoltageMv < gMinV) gMinV = minCellVoltageMv;
        }
        if (maxCellVoltageMv !== null) {
            if (gMaxV === null || maxCellVoltageMv > gMaxV) gMaxV = maxCellVoltageMv;
        }
        if (avgCellVoltageMv !== null) {
            gSumV += avgCellVoltageMv;
            gCountV++;
        }
        if (cellVoltageDeltaMv !== null) {
            if (gMaxVDelta === null || cellVoltageDeltaMv > gMaxVDelta) gMaxVDelta = cellVoltageDeltaMv;
        }
        if (minCellTemperature !== null) {
            if (gMinT === null || minCellTemperature < gMinT) gMinT = minCellTemperature;
        }
        if (maxCellTemperature !== null) {
            if (gMaxT === null || maxCellTemperature > gMaxT) gMaxT = maxCellTemperature;
        }
        if (avgCellTemperature !== null) {
            gSumT += avgCellTemperature;
            gCountT++;
        }
        if (cellTemperatureDelta !== null) {
            if (gMaxTDelta === null || cellTemperatureDelta > gMaxTDelta) gMaxTDelta = cellTemperatureDelta;
        }

        const wattHourCapacity = num(row.wattHourCapacity ?? row.WattHourCapacity ?? row.watt_hour_capacity ?? row.Watt_Hour_Capacity ?? row.CapacityWh ?? row.capacityWh ?? row.CapacityWH ?? row.capacityWH ?? null);

        return {
            ...row,
            id,
            arrayNumber,
            stringNumber,
            stringKey,
            contactorStatus,
            contactorClosed,
            contactorsClosed,
            contactorsCloseExpected,
            positiveContactorClosed,
            negativeContactorClosed,
            recloseCount,
            rotationStatus,
            outRotation,
            rotationEnabled,
            measuredVoltage,
            calculatedVoltage,
            busVoltage,
            voltageDelta,
            amps,
            kw,
            socPct,
            ah,
            kwh,
            kWh: kwh,
            storedKWh: kwh,
            connectionPermitted,
            connectionPermittedSource,
            minCellVoltage,
            maxCellVoltage,
            avgCellVoltage,
            cellVoltageDelta,
            minCellTemperature,
            maxCellTemperature,
            avgCellTemperature,
            cellTemperatureDelta,
            balanceCount,
            balanceMode,
            container,
            location,
            fanCommandRequested,
            lastFanCommandTime,
            fanHealthy,
            timestampUtc,
            lastUpdatedUtc,
            bpcCount,
            bpcFirmwareSummary,
            bpcs,
            operationalState,
            warningCount,
            alarmCount,
            warnings,
            alarms,
            bucket,
            communicating,
            inRotation,
            sourceCoverage,
            sourcePath: norm.sourcePath,
            sourcePriority: norm.sourcePriority,
            sourceTimestampUtc: norm.sourceTimestampUtc,

            // PART 4 requirements
            badReport: norm.badReport,
            bothContactorsClosed: norm.bothContactorsClosed,
            operationalBucket: bucket,
            bucketReason: norm.bucketReason,
            bucketSource: norm.bucketSource,
            rawBucket: norm.rawBucket,
            measuredVoltageVdc: norm.measuredVoltageVdc,
            calculatedVoltageVdc: norm.calculatedVoltageVdc,
            busVoltageVdc: norm.busVoltageVdc,
            stackVoltageVdc: norm.stackVoltageVdc,
            currentA: norm.currentA,
            powerKw: norm.powerKw,
            ampHours: norm.ampHours,
            minCellVoltageMv: norm.minCellVoltageMv,
            avgCellVoltageMv: norm.avgCellVoltageMv,
            maxCellVoltageMv: norm.maxCellVoltageMv,
            cellVoltageDeltaMv: norm.cellVoltageDeltaMv,
            minCellTempC: norm.minCellTempC,
            avgCellTempC: norm.avgCellTempC,
            maxCellTempC: norm.maxCellTempC,
            cellTempDeltaC: norm.cellTempDeltaC,
            raw: norm.raw,
            commandMatchesContactors,

            // Preserve old properties to prevent breakage
            maxCellVoltageMv_compat: maxCellVoltage,
            maxTempC: maxCellTemperature,
            minTempC: minCellTemperature,
            avgTempC: avgCellTemperature,
            tempDeltaC: cellTemperatureDelta,
            wattHourCapacity
        };
    });

    const bucketsRaw = {
        online: tableRows.filter(r => r.bucket === 'online'),
        nearline: tableRows.filter(r => r.bucket === 'nearline'),
        offline: tableRows.filter(r => r.bucket === 'offline'),
        notCommunicating: tableRows.filter(r => r.bucket === 'notCommunicating'),
        unknown: tableRows.filter(r => r.bucket === 'unknown')
    };

    const buckets: Record<string, number> = {
        online: bucketsRaw.online.length,
        nearline: bucketsRaw.nearline.length,
        offline: bucketsRaw.offline.length,
        notCommunicating: bucketsRaw.notCommunicating.length,
        unknown: bucketsRaw.unknown.length
    };

    const rollups: any = { 
        totalStrings: totalStringsVal,
        normal: normalStrings,
        nearline: nearlineStrings,
        offline: offlineStrings,
        warnings: gWarnCount,
        alarms: gAlarmCount,
        totalBpcs: totalBpcsCount || knownBpcCountVal,
        knownBpcCount: knownBpcCountVal,
        expectedBpcCount: totalStringsVal * 14,
        fleetAvgCellVoltage: gCountV > 0 ? Number((gSumV / gCountV).toFixed(3)) : null,
        fleetMaxCellVoltageDelta: gMaxVDelta,
        fleetAvgCellTemp: gCountT > 0 ? Number((gSumT / gCountT).toFixed(1)) : null,
        fleetMaxCellTemp: gMaxT
    };

    function calculateRollup(arr: any[]) {
        const count = arr.length;
        if (count === 0) return { count: 0 };
        const sumNum = (key: string) => {
            const vals = arr.map(a => a[key]).filter(v => v !== null);
            return vals.length > 0 ? vals.reduce((sum, v) => sum + v, 0) : null;
        };
        const avgNum = (key: string) => {
            const vals = arr.map(a => a[key]).filter(v => v !== null);
            return vals.length > 0 ? vals.reduce((sum, v) => sum + v, 0) / vals.length : null;
        };
        const maxNum = (key: string) => {
            const vals = arr.map(a => a[key]).filter(v => v !== null);
            return vals.length > 0 ? Math.max(...vals) : null;
        };
        const minNum = (key: string) => {
            const vals = arr.map(a => a[key]).filter(v => v !== null);
            return vals.length > 0 ? Math.min(...vals) : null;
        };

        const maxVoltageMv = maxNum('maxCellVoltageMv');
        const minVoltageMv = minNum('minCellVoltageMv');
        const maxTemp = maxNum('maxCellTempC');
        const minTemp = minNum('minCellTempC');

        return {
            count,
            socPctAvg: avgNum('socPct'),
            socKwhAvg: sumNum('kWh'),
            kWhAvg: avgNum('kWh'),
            maxCurrentA: maxNum('currentA'),
            minCurrentA: minNum('currentA'),
            maxCellVoltageMv: maxVoltageMv,
            avgCellVoltageMv: avgNum('avgCellVoltageMv'),
            minCellVoltageMv: minVoltageMv,
            maxCellVoltageDeltaMv: maxVoltageMv !== null && minVoltageMv !== null ? maxVoltageMv - minVoltageMv : null,
            highCellTempC: maxTemp,
            avgCellTempC: avgNum('avgCellTempC'),
            lowCellTempC: minTemp,
            maxCellTempDeltaC: maxTemp !== null && minTemp !== null ? maxTemp - minTemp : null,
            warningCount: sumNum('warningCount') || 0,
            alarmCount: sumNum('alarmCount') || 0
        };
    }

    rollups.online = calculateRollup(bucketsRaw.online);
    rollups.nearline = calculateRollup(bucketsRaw.nearline);
    rollups.offline = calculateRollup(bucketsRaw.offline);
    rollups.notCommunicating = calculateRollup(bucketsRaw.notCommunicating);
    rollups.unknown = calculateRollup(bucketsRaw.unknown);

    return { 
        buckets, 
        tableRows,
        rollups
    };
}


function buildStatusCodeDescriptionMap(raw: any): Record<string, string> {
    const defaultMap: Record<string, string> = {
        ...BESS_STATUS_CODE_MAP
    };
    
    if (!raw) return defaultMap;

    let target = raw.bessStatusCodes || raw.statusCodes || raw.registeredStatusCodes || raw;
    if (Array.isArray(target)) {
        for (const item of target) {
            if (typeof item === 'object' && item.code) {
                defaultMap[String(item.code)] = item.description || item.desc || `Code ${item.code}`;
            } else if (typeof item === 'string' && item.includes(':')) {
                 const [k, v] = item.split(':');
                 defaultMap[k.trim()] = v.trim();
            }
        }
    } else if (typeof target === 'object') {
        for (const [k, v] of Object.entries(target)) {
            defaultMap[String(k)] = String(v);
        }
    }
    return defaultMap;
}


function hasLostComms(f: any): boolean {
    if (f.lostComms === true) return true;
    if (f.devicesWithLostComms?.length > 0) return true;
    if (f.lostCommsDevices?.length > 0) return true;
    if (Array.isArray(f.deviceStatusComms)) {
        if (f.deviceStatusComms.some((d: any) => typeof d === 'string' && d.includes('Lost'))) return true;
        if (f.deviceStatusComms.some((d: any) => typeof d === 'object' && d.lastCommsTimestampMillis)) return true;
    }
    if (f.warningMessages && Array.isArray(f.warningMessages) && f.warningMessages.some((w: any) => typeof w === 'string' && w.includes('Lost Comms'))) return true;
    return false;
}

function getFeatherSpaceTemp(f: any): number | null {
    const rt = f.rawResponse?.thermalData || f.rawResponse || {};
    const t = f.spaceTemp ?? f.spaceTemperature ?? f.temperature ?? rt.spaceTemperature ?? rt.spaceTemp ?? rt.airTemp ?? rt.temperature;
    return t !== undefined && t !== null ? Number(t) : null;
}

function getFeatherSpaceHumidity(f: any): number | null {
    const rt = f.rawResponse?.thermalData || f.rawResponse || {};
    const h = f.spaceHumidity ?? f.humidity ?? rt.spaceHumidity ?? rt.humidity ?? rt.relativeHumidity;
    return h !== undefined && h !== null ? Number(h) : null;
}

function isCollectionSegmentFeather(device: any): boolean {
    const ip = device.deviceIp || device.ip || device.sourceIp || device.lastKnownIp || "";
    const p = String(ip).split(".");
    if (p.length !== 4) return false;
    const lastOctet = Number(p.pop());
    return Number.isFinite(lastOctet) && lastOctet === 3;
}
function getFeatherCellTemp(f: any): number | null {
    const rt = f.rawResponse?.thermalData || f.rawResponse || {};
    const t = f.cellTemp ?? f.avgCellTemperature ?? f.avgCellTemp ?? rt.cellTemp ?? rt.avgCellTemperature;
    return t !== undefined && t !== null ? Number(t) : null;
}

function extractCodes(value: any): string[] {
    let rawCodes: string[] = [];
    if (!value) return [];
    if (Array.isArray(value)) {
        for (const v of value) {
            if (typeof v === 'object' && v.code) rawCodes.push(String(v.code));
            else rawCodes.push(String(v));
        }
    } else if (typeof value === 'string') {
        rawCodes.push(...value.split(','));
    } else if (typeof value === 'object' && value.code) {
        rawCodes.push(String(value.code));
    }
    return rawCodes
        .map(c => String(c).trim())
        .filter(c => c.length > 0);
}


import { fetchLiveEmsApps } from "./ems/emsAppsService";

function getEntityOrHostFromEndpoint(endpoint: string): string {
    if (!endpoint) return "Unknown Entity";
    if (endpoint === "emsApps") return "EMS Applications";
    
    // Extract IP from endpoint
    const ipMatch = endpoint.match(/(?:[0-9]{1,3}\.){3}[0-9]{1,3}/);
    const ip = ipMatch ? ipMatch[0] : "";
    
    if (!ip) {
        try {
            const url = new URL(endpoint);
            return url.host;
        } catch {
            return endpoint.split('/').pop() || endpoint;
        }
    }
    
    const parts = ip.split('.');
    if (parts.length === 4) {
        const o3 = parseInt(parts[2], 10);
        const o4 = parseInt(parts[3], 10);
        if (!isNaN(o3) && !isNaN(o4)) {
            if (o4 === 3) {
                return `Array ${o3} CS (${ip})`;
            }
            if (o4 >= 10 && o4 <= 50) {
                const stringIdx = Math.floor((o4 - 10) / 5) + 1;
                return `Array ${o3} ES${stringIdx} (${ip})`;
            }
            return `Array ${o3} (${ip})`;
        }
    }
    return ip;
}

let siteOpsInFlight: Promise<any> | null = null;
let lastSummaryCache: any = null;
let lastSummaryTime = 0;

export async function buildSiteOperationsSummaryFromCache() {
    try {
        
        let block = getEmsCachedBlock().data || {};
        if (block.blockReport) {
            block = { ...block, ...block.blockReport };
        }
        let status = getEmsCachedStatus().data || {};
        if (status.statusReport) {
            status = { ...status, ...status.statusReport };
        }
        let lastCall = getEmsCachedLastCall().data || {};
        if (lastCall.blockReport) {
            lastCall = { ...lastCall, ...lastCall.blockReport };
        }
        const stringsData = getEmsCachedRawStrings().data || [];
        const conn = getEmsConnectionStatus();
        
        const arrays = block.arrays || status.arrays || lastCall.arrays || [];

        // Part C - SITE CODE
        let siteCodeSource = "Unknown";
        let stationCode = "UNKNOWN";
        
        let topologyObj = block.topology || status.topology || lastCall.topology || {};
        if (topologyObj && topologyObj.stationCode) {
             stationCode = topologyObj.stationCode;
             siteCodeSource = "topology";
        } else if (block.stationCode) {
             stationCode = block.stationCode;
             siteCodeSource = "block";
        } else if (status.stationCode) {
             stationCode = status.stationCode;
             siteCodeSource = "status";
        } else if (conn.discoveredStationCode) {
             stationCode = conn.discoveredStationCode;
             siteCodeSource = conn.siteCodeSource || "Connection Context";
        } else {
             stationCode = conn.stationCode || "BHE0021"; // default if all else fails
             siteCodeSource = "Active Profile";
        }

        const site = {
            stationCode,
            discoveredStationCode: conn.discoveredStationCode || null,
            siteCodeSource,
            blockIndex: conn.blockIndex || 1,
            profileId: conn.activeProfileId,
            profileName: conn.activeProfileName,
            emsBaseUrl: conn.activeEmsBaseUrl,
            connectionState: conn.connectionState,
            source: conn.source,
            staleData: conn.staleData,
            lastUpdated: conn.lastUpdated
        };

        // Part D - EMS APPS Normalization (now async and strict)
        const emsAppsResult = await fetchLiveEmsApps();
        const emsApps = emsAppsResult.apps;
        const emsAppSourcePaths: string[] = Array.from(new Set(emsApps.map(a => a.sourcePath)));
        let unknownDragonAppCodes: string[] = []; // mapped in service

        // Part E - FEATHER/HVAC
        const fCache = getFeatherCache();
        const fDevices = (fCache.devices || []).filter(d => !(d as any).rejected);
        
        // Count accurately based on devices array. If !fCache.success or stale, keep the real counts but mark stale
        let fOnline = 0, fOffline = 0, fLostComms = 0, fFssInv = 0, fDoorsInv = 0, fHvacInv = 0, fWarn = 0, fFault = 0;
        let maxH = 0;
        let maxST: number | null = null;
        let maxCT: number | null = null;
        const devicesWithIssues: any[] = [];
        let featherCellTempExcludedCollectionSegments = 0;
        let featherCellTempIncludedDevices = 0;

        fDevices.forEach((f: any) => {
            const hasLost = hasLostComms(f);
            if (f.reachable || f.online || f.sourceOk) fOnline++; else fOffline++;
            if (hasLost) fLostComms++;
            const isFssInv = f.fssValid === false || f.thermalData?.fssSignals?.valid === false;
            const isDoorsInv = f.doorsValid === false || f.doors?.valid === false;
            const isHvacInv = f.mioValid === false || f.hvacDataValid === false || f.hvacValid === false;
            if (isFssInv) fFssInv++;
            if (isDoorsInv) fDoorsInv++;
            if (isHvacInv) fHvacInv++;
            fWarn += (f.warningCount || f.warningMessages?.length || f.warnInfo?.length || f.activeWarningInterlocks?.length || 0);
            fFault += (f.alarmCount || f.faultMessages?.length || f.activeTripFaultLog?.length || f.activeAlarms?.length || 0);
            if ((f.hydrogen1PPM ?? f.thermalData?.hydrogen1PPM) && (f.hydrogen1PPM ?? f.thermalData?.hydrogen1PPM) > maxH) maxH = (f.hydrogen1PPM ?? f.thermalData?.hydrogen1PPM);
            const st = getFeatherSpaceTemp(f);
            if (st !== null && !Number.isNaN(st)) maxST = maxST === null ? st : Math.max(maxST, st);

            const ct = getFeatherCellTemp(f);
            if (isCollectionSegmentFeather(f)) {
                 featherCellTempExcludedCollectionSegments++;
            } else {
                 if (ct !== null && !Number.isNaN(ct)) {
                      maxCT = maxCT === null ? ct : Math.max(maxCT, ct);
                 }
                 featherCellTempIncludedDevices++;
            }

            if (!f.reachable || hasLost || isFssInv || isDoorsInv || isHvacInv || (f.warningCount > 0) || (f.alarmCount > 0)) {
                 devicesWithIssues.push(f);
            }
        });

        const totalFeather = fDevices.length;
        const featherSummary = {
             sourceOk: fCache.success,
             isStale: fCache.isStale,
             totalDevices: totalFeather > 0 ? totalFeather : null,
             onlineDevices: totalFeather > 0 ? fOnline : null,
             offlineDevices: totalFeather > 0 ? fOffline : null,
             lostCommsCount: totalFeather > 0 ? fLostComms : null,
             fssInvalidCount: totalFeather > 0 ? fFssInv : null,
             doorsInvalidCount: totalFeather > 0 ? fDoorsInv : null,
             hvacDataInvalidCount: totalFeather > 0 ? fHvacInv : null,
             activeWarningCount: totalFeather > 0 ? fWarn : null,
             activeFaultCount: totalFeather > 0 ? fFault : null,
             maxHydrogenPpm: totalFeather > 0 ? maxH || null : null,
             maxSpaceTempC: totalFeather > 0 ? maxST || null : null,
             maxCellTempC: totalFeather > 0 ? maxCT || null : null,
             devicesWithIssues,
             devices: fDevices
        };

        // Part F - Humidity Temp
                const htsSummary: any[] = [];
        fDevices.forEach((f: any) => {
             const rt = f.rawResponse?.thermalData || f.rawResponse || {};
             const tempC = getFeatherSpaceTemp(f) ?? undefined;
             const hum = getFeatherSpaceHumidity(f) ?? undefined;
             if (tempC !== undefined || hum !== undefined) {
                 const srcIp = f.deviceIp || f.ip;
                 let enc = f.enclosureLabel || f.entityDescription || f.entityName;
                 if (!enc) {
                     if (f.arrayIndex != null && f.stringIndex != null) {
                        enc = `Array ${f.arrayIndex} ES${f.stringIndex}`;
                     } else if (srcIp) {
                        const parts = srcIp.split('.');
                        if (parts.length === 4) {
                             const arr = parseInt(parts[2], 10);
                             const h = parseInt(parts[3], 10);
                             if (!isNaN(arr) && !isNaN(h)) {
                                  if (h === 3) enc = `Array ${arr} CS`;
                                  else if (h >= 10 && h <= 50 && (h - 10) % 5 === 0) {
                                       enc = `Array ${arr} ES${((h - 10) / 5) + 1}`;
                                  }
                             }
                        }
                     }
                 }
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
                     cellTemperatureC: getFeatherCellTemp(f),
                     supplyAirTempC: f.supplyAirTempC ?? f.supplyAirTemp ?? rt.supplyAirTemp ?? rt.supplyAirTempC ?? null,
                     coolingSetpointC: f.coolingSetpointC ?? f.coolingSetpoint ?? rt.coolingSetpoint ?? rt.coolingSetpointC ?? null,
                     heatingSetpointC: f.heatingSetpointC ?? f.heatingSetpoint ?? rt.heatingSetpoint ?? rt.heatingSetpointC ?? null,
                     source: "feather",
                     raw: f
                 });
             }
        });

        // Part G - PCS
        const pcsDebugKeys: string[] = [];
        const pcsCandidates: any[] = [];
        function dig(obj: any, path: string = "") {
            if (!obj || typeof obj !== 'object') return;
            if (Array.isArray(obj)) {
                 obj.forEach((o, i) => dig(o, `${path}[${i}]`));
            } else {
                 for (const [k, v] of Object.entries(obj)) {
                     const tl = k.toLowerCase();
                     if (tl.includes('pcs') || tl.includes('inverter') || tl.includes('converter')) {
                         pcsDebugKeys.push(`${path ? path + '.' : ''}${k}`);
                         if (Array.isArray(v)) pcsCandidates.push(...v);
                         else if (typeof v === 'object' && v !== null) pcsCandidates.push(v);
                     }
                     dig(v, `${path ? path + '.' : ''}${k}`);
                 }
            }
        }
        dig(block, "block");
        dig(status, "status");
        dig(lastCall, "lastCall");
        
        const pcsCnds = [
            ...(block.arrays || []).flatMap((a:any) => a.pcs || a.arrayPcs || []),
            ...(status.arrays || []).flatMap((a:any) => a.pcs || a.arrayPcs || []),
            ...(lastCall.arrays || []).flatMap((a:any) => a.pcs || a.arrayPcs || []),
            ...pcsCandidates
        ];
        function numOrNull(v: any): number | null {
            if (v === null || v === undefined) return null;
            const n = Number(v);
            return isNaN(n) ? null : n;
        }
                function averageValid(vals: any[]) {
            const valid = vals.map(numOrNull).filter(v => v !== null);
            if (valid.length === 0) return null;
            return valid.reduce((a, b) => a + b, 0) / valid.length;
        }

        const pcsSummary = pcsCnds.map((p: any) => {
             const arrayIndex = numOrNull(p.arrayIndex ?? p.arrayNumber);
             const pcsIndex = numOrNull(p.arrayPcsIndex ?? p.pcsIndex ?? p.index);
             const acVoltageAB = numOrNull(p.acPhaseABVoltageVolt);
             const acVoltageBC = numOrNull(p.acPhaseBCVoltageVolt);
             const acVoltageCA = numOrNull(p.acPhaseCAVoltageVolt);
             const abDisplay = acVoltageAB !== null ? Number(acVoltageAB).toFixed(0) : '--';
             const bcDisplay = acVoltageBC !== null ? Number(acVoltageBC).toFixed(0) : '--';
             const caDisplay = acVoltageCA !== null ? Number(acVoltageCA).toFixed(0) : '--';
             const acVoltageDisplay = `${abDisplay} / ${bcDisplay} / ${caDisplay}`;
             return {
                 arrayIndex,
                 pcsIndex,
                 dcVoltage: numOrNull(p.dcVoltageVolt ?? p.dcVoltage ?? p.dcVolt ?? p.dcV),
                 dcCurrent: numOrNull(p.dcCurrentAmp ?? p.dcCurrent ?? p.dcCurr ?? p.dcA),
                 acRealPowerKw: numOrNull(p.acRealPowerKW ?? p.acRealPowerKw ?? p.acRealPower ?? p.kw ?? p.kW),
                 acReactivePowerKvar: numOrNull(p.acReactivePowerKVAR ?? p.acReactivePowerKvar ?? p.acReactPower ?? p.kvar ?? p.kVAr),
                 frequencyHz: numOrNull(p.acFrequencyHz ?? p.frequencyHz ?? p.freq ?? p.hz),
                 acVoltage: averageValid([p.acPhaseABVoltageVolt, p.acPhaseBCVoltageVolt, p.acPhaseCAVoltageVolt, p.acVoltage]),
                 acVoltageAB,
                 acVoltageBC,
                 acVoltageCA,
                 acVoltageDisplay,
                 acCurrent: averageValid([p.acPhaseACurrentAmp, p.acPhaseBCurrentAmp, p.acPhaseCCurrentAmp, p.acCurrent]),
                 state: p.state ?? null,
                 displayKey: p.displayKey || ('Array ' + arrayIndex + ' PCS ' + pcsIndex),
                 rotation: p.outRotation === true ? 'Out' : 'In',
                 sourcePath: p.sourcePath || 'discovered',
                 raw: p
             };
        }).filter((v:any,i:any,a:any) => a.findIndex((t: any) =>(t.arrayIndex === v.arrayIndex && t.pcsIndex === v.pcsIndex && v.arrayIndex != null))===i);


        
        // Part H - Arrays
        const stringSummary = buildStringBucketSummary(stringsData);

        let allArrCands: any[][] = [];
        if (arrays.length > 0) allArrCands.push(arrays);
        allArrCands.push(findArraysByObjectKeys(block, ['arrayIndex', 'nearlineSOC']));
        allArrCands.push(findArraysByObjectKeys(status, ['arrayIndex', 'nearlineSOC']));
        allArrCands.push(findArraysByObjectKeys(lastCall, ['arrayIndex', 'nearlineSOC']));
        allArrCands.push(findArraysByObjectKeys(block, ['arrayIndex', 'communicatingStackCount']));
        allArrCands.push(findArraysByObjectKeys(block, ['arrayIndex', 'availableACChargekW']));
        allArrCands.push(findArraysByObjectKeys(block, ['arrayIndex', 'onlineSOC']));
        allArrCands.push(findArraysByObjectKeys(status, ['arrayIndex', 'onlineSOC']));
        
        let bestArrCand: any[] = [];
        let bestScore = -1;
        for (const candSet of allArrCands) {
             if (!candSet || candSet.length === 0) continue;
             const avgScore = candSet.reduce((sum, a) => sum + scoreArrayCandidate(a), 0) / candSet.length;
             // Favor sets with around 8 arrays (typical for string systems with 8 arrays, or >0)
             let lengthScore = 0;
             if (candSet.length >= 4 && candSet.length <= 16) lengthScore += 5;
             const totalScore = avgScore + lengthScore;
             if (totalScore > bestScore) {
                 bestScore = totalScore;
                 bestArrCand = candSet;
             }
        }
        let arrCands = bestArrCand;
        let arraySummarySource = "native";
        let arraySummary: any[] = [];
        let arraySummarySynthesis: any = {
             used: false,
             source: "native",
             inputStringCount: stringSummary.tableRows.length,
             derivedArrayCounts: {},
             unknownArrayRows: 0,
             emittedArrayCount: 0,
             rejectedArrayZeroFallback: false,
             warnings: []
        };
        
        if (arrCands.length === 0 || bestScore < 10) {
             arraySummarySource = "synthesized-from-strings";
             arraySummarySynthesis.used = true;
             arraySummarySynthesis.source = "normalized-strings";

             const arraysMap = new Map<number, any>();
             let unknownArrayRows = 0;
             const derivedArrayCounts: Record<number, number> = {};

             for (const str of stringSummary.tableRows) {
                 let arrId = str.arrayNumber;
                 if (arrId === null || arrId === 0) {
                     const derived = deriveArrayNumberFromRow(str);
                     if (derived !== null) {
                         arrId = derived;
                         str.arrayNumber = derived;
                     } else {
                         unknownArrayRows++;
                         continue;
                     }
                 }

                 derivedArrayCounts[arrId] = (derivedArrayCounts[arrId] || 0) + 1;

                 if (!arraysMap.has(arrId)) {
                     arraysMap.set(arrId, {
                         arrayIndex: arrId,
                         stringCount: 0,
                         onlineStringCount: 0,
                         nearlineStringCount: 0,
                         offlineStringCount: 0,
                         notCommunicationStringCount: 0,
                         onlineSOC: [],
                         nearlineSOC: [],
                         offlineSOC: [],
                         onlineAvailableKWh: [],
                         nearlineAvailableKWh: [],
                         offlineAvailableKWh: [],
                         powerkW: [],
                         currentAmp: [],
                         minCellVoltages: [],
                         maxCellVoltages: [],
                         minCellTemps: [],
                         maxCellTemps: [],
                         communicating: true
                     });
                 }
                 const arr = arraysMap.get(arrId);
                 arr.stringCount++;
                 if (str.bucket === 'online') { 
                     arr.onlineStringCount++; 
                     if (str.socPct !== null) arr.onlineSOC.push(str.socPct);
                     if (str.kwh !== null) arr.onlineAvailableKWh.push(str.kwh);
                 } else if (str.bucket === 'nearline') {
                     arr.nearlineStringCount++;
                     if (str.socPct !== null) arr.nearlineSOC.push(str.socPct);
                     if (str.kwh !== null) arr.nearlineAvailableKWh.push(str.kwh);
                 } else if (str.bucket === 'offline') {
                     arr.offlineStringCount++;
                     if (str.socPct !== null) arr.offlineSOC.push(str.socPct);
                     if (str.kwh !== null) arr.offlineAvailableKWh.push(str.kwh);
                 } else {
                     arr.notCommunicationStringCount++;
                 }
                 const strAmp = str.amps ?? str.currentA;
                 if (strAmp !== null && strAmp !== undefined) arr.currentAmp.push(strAmp);
                 const strKw = str.kw ?? str.powerKw;
                 if (strKw !== null && strKw !== undefined) arr.powerkW.push(strKw);
                 if (str.minCellVoltage !== null) arr.minCellVoltages.push(str.minCellVoltage);
                 if (str.maxCellVoltage !== null) arr.maxCellVoltages.push(str.maxCellVoltage);
                 if (str.minCellTemperature !== null) arr.minCellTemps.push(str.minCellTemperature);
                 if (str.maxCellTemperature !== null) arr.maxCellTemps.push(str.maxCellTemperature);
             }
             
             arraySummarySynthesis.derivedArrayCounts = derivedArrayCounts;
             arraySummarySynthesis.unknownArrayRows = unknownArrayRows;

             for (const arr of Array.from(arraysMap.values())) {
                 if (arr.notCommunicationStringCount === arr.stringCount && arr.stringCount > 0) {
                      arr.communicating = false;
                 }
                 const avgOrNull = (vals: number[]) => vals.length > 0 ? vals.reduce((a,b)=>a+b, 0) / vals.length : null;
                 const sumOrNull = (vals: number[]) => vals.length > 0 ? vals.reduce((a,b)=>a+b, 0) : null;
                 const minOrNull = (vals: number[]) => vals.length > 0 ? Math.min(...vals) : null;
                 const maxOrNull = (vals: number[]) => vals.length > 0 ? Math.max(...vals) : null;

                 const arrMinV = minOrNull(arr.minCellVoltages);
                 const arrMaxV = maxOrNull(arr.maxCellVoltages);
                 const arrMinT = minOrNull(arr.minCellTemps);
                 const arrMaxT = maxOrNull(arr.maxCellTemps);

                 arraySummary.push({
                     arrayIndex: arr.arrayIndex,
                     arrayNumber: arr.arrayIndex,
                     communicating: arr.communicating,
                     stringCount: arr.stringCount,
                     onlineStringCount: arr.onlineStringCount,
                     nearlineStringCount: arr.nearlineStringCount,
                     offlineStringCount: arr.offlineStringCount,
                     notCommunicationStringCount: arr.notCommunicationStringCount,
                     onlineSOC: avgOrNull(arr.onlineSOC),
                     nearlineSOC: avgOrNull(arr.nearlineSOC),
                     offlineSOC: avgOrNull(arr.offlineSOC),
                     onlineAvailableKWh: sumOrNull(arr.onlineAvailableKWh),
                     nearlineAvailableKWh: sumOrNull(arr.nearlineAvailableKWh),
                     offlineAvailableKWh: sumOrNull(arr.offlineAvailableKWh),
                     powerkW: sumOrNull(arr.powerkW),
                     currentAmp: sumOrNull(arr.currentAmp),
                     measuredMinCellVoltage: arrMinV,
                     measuredMaxCellVoltage: arrMaxV,
                     cellVoltageDelta: (arrMaxV !== null && arrMinV !== null) ? Number((arrMaxV - arrMinV).toFixed(3)) : null,
                     measuredMinCellTemperature: arrMinT,
                     measuredMaxCellTemperature: arrMaxT,
                     cellTemperatureDelta: (arrMaxT !== null && arrMinT !== null) ? Number((arrMaxT - arrMinT).toFixed(1)) : null,
                     friendlyString: 'Array ' + arr.arrayIndex,
                     sourcePath: 'synthesized-from-normalized-strings',
                     raw: arr
                 });
             }

             if (arraySummary.length === 1 && arraySummary[0].arrayIndex === 0 && arraySummary[0].stringCount >= 100) {
                 arraySummarySynthesis.rejectedArrayZeroFallback = true;
                 arraySummarySynthesis.warnings.push("Rejected synthesized Array 0 fallback; preserving last-known-good array summary.");
                 arraySummarySynthesis.source = "fallback-rejected";
                 arraySummary = [];
             } else if (arraySummary.length === 0) {
                 arraySummarySynthesis.warnings.push("Unable to derive real array numbers from normalized strings.");
             }

             arraySummarySynthesis.emittedArrayCount = arraySummary.length;
             arraySummary.sort((a,b)=> a.arrayIndex - b.arrayIndex);
        } else {
             arraySummarySource = "native-merged-with-strings";
             const arraysMap = new Map<number, any>();
             for (const str of stringSummary.tableRows) {
                 let arrId = str.arrayNumber;
                 if (arrId === null || arrId === 0) {
                     const derived = deriveArrayNumberFromRow(str);
                     if (derived !== null) {
                         arrId = derived;
                         str.arrayNumber = derived;
                     } else {
                         arrId = 0;
                     }
                 }
                 if (!arraysMap.has(arrId)) {
                     arraysMap.set(arrId, {
                         arrayIndex: arrId,
                         socs: [],
                         kwhs: [],
                         stringCount: 0,
                         onlineStringCount: 0,
                         nearlineStringCount: 0,
                         offlineStringCount: 0,
                         notCommunicationStringCount: 0,
                     });
                 }
                 const arr = arraysMap.get(arrId);
                 arr.stringCount++;
                 if (str.socPct !== null) arr.socs.push(str.socPct);
                 if (str.kwh !== null) arr.kwhs.push(str.kwh);
                 if (str.bucket === 'online') arr.onlineStringCount++;
                 else if (str.bucket === 'nearline') arr.nearlineStringCount++;
                 else if (str.bucket === 'offline') arr.offlineStringCount++;
                 else if (str.bucket === 'notCommunicating') arr.notCommunicationStringCount++;
             }

             arraySummary = arrCands.map((a: any) => {
                 function num(v: any) {
                     if (v === null || v === undefined || v === '') return null;
                     const n = Number(v);
                     return Number.isFinite(n) ? n : null;
                 }
                 const arrayIndex = num(a.arrayIndex ?? a.arrayNumber) ?? 0;
                 
                 const synth = arraysMap.get(arrayIndex);

                 const stringCount = num(a.stringCount) ?? synth?.stringCount ?? 0;
                 const notCommunicationStringCount = num(a.notCommunicationStringCount) ?? synth?.notCommunicationStringCount ?? 0;
                 const avgOrNull = (vals: number[] | undefined) => (vals && vals.length > 0) ? vals.reduce((x,y)=>x+y, 0) / vals.length : null;
                 const sumOrNull = (vals: number[] | undefined) => (vals && vals.length > 0) ? vals.reduce((x,y)=>x+y, 0) : null;

                 return {
                     arrayIndex,
                     communicating: notCommunicationStringCount === 0 || notCommunicationStringCount < stringCount,
                     onlineSOC: num(a.onlineSOC) ?? avgOrNull(synth?.socs),
                     nearlineSOC: num(a.nearlineSOC) ?? avgOrNull(synth?.socs),
                     offlineSOC: num(a.offlineSOC),
                     onlineAvailableKWh: num(a.onlineAvailableKWh) ?? sumOrNull(synth?.kwhs),
                     nearlineAvailableKWh: num(a.nearlineAvailableKWh),
                     offlineAvailableKWh: num(a.offlineAvailableKWh),
                     availableACChargekW: num(a.availableACChargekW),
                     availableACDischargekW: num(a.availableACDischargekW),
                     commandedkW: num(a.commandedkW),
                     measuredkW: num(a.measuredkW),
                     voltageVolt: num(a.voltageVolt),
                     storedDcEnergyKWh: num(a.storedDcEnergyKWh),
                     powerkW: num(a.powerkW),
                     currentAmp: num(a.currentAmp),
                     maxAllowedChargeCurrent: a.maxAllowedChargeCurrent ?? null,
                     maxAllowedDischargeCurrent: a.maxAllowedDischargeCurrent ?? null,
                     stringCount,
                     onlineStringCount: num(a.onlineStringCount) ?? synth?.onlineStringCount ?? 0,
                     nearlineStringCount: num(a.nearlineStringCount) ?? synth?.nearlineStringCount ?? 0,
                     offlineStringCount: num(a.offlineStringCount) ?? synth?.offlineStringCount ?? 0,
                     notCommunicationStringCount,
                     inRotationCount: num(a.inRotationCount),
                     outOfRotationCount: num(a.outOfRotationCount),
                     friendlyString: a.displayKey || ('Array ' + (arrayIndex ?? 'Unknown')),
                     sourcePath: 'native-merged',
                     raw: a
                 };
             });
        }

        // Part H - Fleet Capacity rollups and dedicated fleetCapacity object
        const capacityMap = new Map<string, number>();
        let homogeneousCapacityValue: number | null = null;
        let capacitySourceMeta = "inferred";
        const allCapacities: number[] = [];

        arraySummary.forEach((arr: any) => {
            const arrIndex = arr.arrayIndex ?? arr.arrayNumber ?? arr.id ?? 1;
            const nativeStrings = arr.raw?.strings ?? arr.raw?.arrayStrings ?? [];
            if (Array.isArray(nativeStrings)) {
                nativeStrings.forEach((ns: any) => {
                    const strIndex = ns.stringIndex ?? ns.stringNumber ?? ns.id ?? 1;
                    const c = numOrNull(ns.wattHourCapacity ?? ns.WattHourCapacity ?? ns.watt_hour_capacity ?? ns.capacityWh ?? ns.CapacityWh ?? null);
                    if (c !== null) {
                        capacityMap.set(`${arrIndex}:${strIndex}`, c);
                        allCapacities.push(c);
                        capacitySourceMeta = "arraySummary.raw.strings[].wattHourCapacity";
                    } else {
                        const ah = numOrNull(ns.ampHourCapacity ?? null);
                        const nv = numOrNull(ns.nominalVoltage ?? 1326); // Default assuming standard string
                        if (ah !== null) {
                            const inferredWh = ah * nv;
                            capacityMap.set(`${arrIndex}:${strIndex}`, inferredWh);
                            allCapacities.push(inferredWh);
                            capacitySourceMeta = "arraySummary.raw.strings[].ampHourCapacity * nominalVoltage";
                        }
                    }
                });
            }
        });

        if (allCapacities.length > 0) {
            const first = allCapacities[0];
            const allSame = allCapacities.every(c => c === first);
            if (allSame && allCapacities.length > 20) {
                homogeneousCapacityValue = first;
            }
        }

        let validInstalledCount = 0;
        let totalInstalledWh = 0;
        let onlineInstalledWh = 0;
        let nearlineInstalledWh = 0;
        let offlineInstalledWh = 0;
        let unavailableInstalledWh = 0;

        let onlineStoredWh = 0;
        let nearlineStoredWh = 0;
        let offlineStoredWh = 0;
        let notCommunicatingStoredWh = 0;
        let hasValidStored = false;

        stringSummary.tableRows.forEach((r: any) => {
            const arrIndex = r.arrayIndex ?? r.raw?.arrayIndex ?? r.raw?.arrayNumber ?? 1;
            const strIndex = r.stringIndex ?? r.raw?.stringIndex ?? r.raw?.stringNumber ?? r.index ?? 1;
            let whCap = numOrNull(r.wattHourCapacity ?? r.raw?.wattHourCapacity ?? r.raw?.WattHourCapacity ?? r.raw?.watt_hour_capacity ?? r.raw?.CapacityWh ?? capacityMap.get(`${arrIndex}:${strIndex}`) ?? null);
            if (whCap === null && homogeneousCapacityValue !== null) {
                whCap = homogeneousCapacityValue;
            }

            if (whCap !== null) {
                validInstalledCount++;
                totalInstalledWh += whCap;
                if (r.bucket === 'online') {
                    onlineInstalledWh += whCap;
                } else if (r.bucket === 'nearline') {
                    nearlineInstalledWh += whCap;
                } else if (r.bucket === 'offline') {
                    offlineInstalledWh += whCap;
                    unavailableInstalledWh += whCap;
                } else if (r.bucket === 'notCommunicating') {
                    unavailableInstalledWh += whCap;
                }
            }

            const cellSoc = numOrNull(r.socPct ?? r.raw?.Soc ?? r.raw?.soc ?? null);
            let stringKWh: number | null = numOrNull(r.kWh ?? r.raw?.KWh ?? r.raw?.kWh ?? null);
            if (stringKWh === null && cellSoc !== null) {
                const capWh = whCap ?? 371250;
                stringKWh = (cellSoc / 100) * (capWh / 1000);
            }

            if (stringKWh !== null) {
                hasValidStored = true;
                if (r.bucket === 'online') {
                    onlineStoredWh += stringKWh;
                } else if (r.bucket === 'nearline') {
                    nearlineStoredWh += stringKWh;
                } else if (r.bucket === 'offline') {
                    offlineStoredWh += stringKWh;
                } else if (r.bucket === 'notCommunicating') {
                    notCommunicatingStoredWh += stringKWh;
                }
            }
        });

        const installedCapacityKWh = validInstalledCount > 0 ? (totalInstalledWh / 1000) : null;
        const onlineInstalledKWh = validInstalledCount > 0 ? (onlineInstalledWh / 1000) : null;
        const nearlineInstalledKWh = validInstalledCount > 0 ? (nearlineInstalledWh / 1000) : null;
        const offlineInstalledKWh = validInstalledCount > 0 ? (offlineInstalledWh / 1000) : null;
        const unavailableInstalledKWh = validInstalledCount > 0 ? (unavailableInstalledWh / 1000) : null;

        const onlineStoredKWh = hasValidStored ? onlineStoredWh : null;
        const nearlineStoredKWh = hasValidStored ? nearlineStoredWh : null;
        const offlineStoredKWh = hasValidStored ? offlineStoredWh : null;
        const notCommunicatingStoredKWh = hasValidStored ? notCommunicatingStoredWh : null;
        const availableStoredKWh = hasValidStored ? (onlineStoredWh + nearlineStoredWh) : null;

        let activeChargeSum: number | null = null;
        let activeDischargeSum: number | null = null;
        arraySummary.forEach((arr: any) => {
            const chg = numOrNull(arr.availableACChargekW ?? arr.raw?.availableACChargekW ?? null);
            if (chg !== null) {
                if (activeChargeSum === null) activeChargeSum = 0;
                activeChargeSum += chg;
            }
            const dis = numOrNull(arr.availableACDischargekW ?? arr.raw?.availableACDischargekW ?? null);
            if (dis !== null) {
                if (activeDischargeSum === null) activeDischargeSum = 0;
                activeDischargeSum += dis;
            }
        });

        const availableChargeKW = numOrNull(block.availableACChargekW ?? block.availableChargeKW ?? activeChargeSum ?? null);
        const availableDischargeKW = numOrNull(block.availableACDischargekW ?? block.availableDischargeKW ?? activeDischargeSum ?? null);

        const fleetCapacity = {
            installedCapacityKWh,
            onlineStoredKWh,
            nearlineStoredKWh,
            offlineStoredKWh,
            notCommunicatingStoredKWh,
            availableStoredKWh,
            onlineInstalledKWh,
            nearlineInstalledKWh,
            offlineInstalledKWh,
            unavailableInstalledKWh,
            availableChargeKW,
            availableDischargeKW,
            source: {
                installedCapacity: capacitySourceMeta,
                storedEnergy: "string.kWh or derived from SOC",
                chargeLimit: "array.availableACChargekW | null",
                dischargeLimit: "array.availableACDischargekW | null"
            }
        };

        // Inject into stringSummary.rollups
        if (!stringSummary.rollups) stringSummary.rollups = {};
        stringSummary.rollups.fleetCapacity = fleetCapacity;
        stringSummary.rollups.classificationSource = "shared-string-operational-state-v1";
        stringSummary.rollups.capacitySource = {
            installedCapacity: capacitySourceMeta,
            storedEnergy: "string.kWh or derived from SOC",
            chargeLimit: "array.availableACChargekW | null",
            dischargeLimit: "array.availableACDischargekW | null"
        };

        
        // Part J - Safety Summary
        let topology = block.topology || status.topology || lastCall.topology || [];
        if (!Array.isArray(topology) && topology.lineups) topology = topology.lineups; 
        const clearableFaults = Array.isArray(topology) ? topology.filter((t: any) => t.allowFaultReset === true).map((t: any) => ({ ...t, entityKeyToken: t.entityKeyToken || t.id || t.name || "UNKNOWN_TOKEN" })) : [];
        const safetySummary = {
             clearableFaults,
             clearableCount: clearableFaults.length,
             sourceOk: true,
             lastUpdated: new Date().toISOString()
        };

        // Part K - Active Issue Groups
        const activeIssueGroups: any[] = [];
        // Map Bess Status Codes to get descriptions
        const scMap = buildStatusCodeDescriptionMap(getEmsCachedStatusCodes().data || {});
        
        const groupMap = new Map<string, any>();
        
        function cleanFaultString(fault: string): string {
            if (!fault) return fault;
            if (fault.includes("Lost Comms with:")) {
                const prefixMatch = fault.match(/(Lost Comms with:\s*)(.*)/i);
                if (prefixMatch) {
                    const prefix = prefixMatch[1];
                    let rest = prefixMatch[2].trim();
                    if (rest.startsWith("{")) {
                        try {
                            const parsed = JSON.parse(rest);
                            const name = parsed.device || parsed.deviceName || parsed.name || parsed.label || parsed.id || rest;
                            return prefix + name;
                        } catch (e) {
                            // fall back
                        }
                    }
                }
            }
            if (fault.trim().startsWith("{")) {
                try {
                    const parsed = JSON.parse(fault);
                    const name = parsed.device || parsed.deviceName || parsed.name || parsed.label || parsed.id || fault;
                    return name;
                } catch (e) {
                    // fall back
                }
            }
            return fault;
        }

        function formatFeatherIssue(item: any): string {
            if (typeof item === 'string') {
                if (item.trim().startsWith('{')) {
                    try {
                        const parsed = JSON.parse(item);
                        const name = parsed.device || parsed.deviceName || parsed.name || parsed.label || parsed.id || item;
                        return 'Lost Comms with: ' + name;
                    } catch (e) {
                        return item;
                    }
                }
                return cleanFaultString(item);
            }
            if (item && typeof item === 'object') {
                const name = 
                  item.device ||
                  item.deviceName || 
                  item.deviceType || 
                  item.name || 
                  item.label || 
                  item.description || 
                  item.entityDescription || 
                  item.entityName || 
                  item.component || 
                  item.componentName || 
                  item.source || 
                  item.sourceName || 
                  item.ip || 
                  item.deviceIp || 
                  item.address || 
                  item.lastKnownIp || 
                  item.device?.name || 
                  item.device?.type || 
                  item.device?.ip || 
                  item.status?.deviceName || 
                  item.status?.deviceType;

                if (name) {
                    return 'Lost Comms with: ' + name;
                }

                const str = JSON.stringify(item);
                if (str.length < 120) return str;
                return 'Unknown Device';
            }
            return 'Unknown Issue';
        }

        function isIssueFiltered(msg: string, code?: string): boolean {
             const m = String(msg).toLowerCase();
             const c = String(code || "");
             if (c === "2534" || c === "2561") return true;
             if (m.includes("oor") || m.includes("out of rotation") || m.includes("outrotation")) return true;
             if (m.includes("contactor open") || m.includes("contactors open")) return true;
             return false;
        }

        fDevices.forEach((f: any) => {
             const enclosureLabel =
                  f.enclosureLabel ||
                  f.entityDescription ||
                  f.segmentLabel ||
                  f.entityName ||
                  (f.arrayIndex != null && f.stringIndex != null ? `Array ${f.arrayIndex} ES${f.stringIndex}` : null) ||
                  f.ip ||
                  f.deviceIp ||
                  "Unknown Enclosure";
             
             const deviceIp = f.ip || f.deviceIp || null;

             const activeWarnings = f.activeWarnings || f.warningMessages || [];
             if (f.warningCount > 0 && Array.isArray(activeWarnings)) {
                 activeWarnings.forEach((awRaw: any) => {
                     const aw = formatFeatherIssue(awRaw);
                     if (isIssueFiltered(aw)) return;
                     const key = 'feather_warn_' + encodeURIComponent(aw);
                     if (!groupMap.has(key)) groupMap.set(key, { id: key, severity: 'WARNING', source: 'Feather/HVAC', code: null, message: aw, displayText: aw, occurrenceCount: 0, affectedEnclosureCount: 0, occurrences: [] });
                     groupMap.get(key).occurrences.push({ deviceIp, enclosureLabel, sourcePath: 'featherSummary' });
                 });
             }
             const activeAlarms = f.activeAlarms || f.alarmMessages || f.faultMessages || [];
             if (f.alarmCount > 0 && Array.isArray(activeAlarms)) {
                 activeAlarms.forEach((aaRaw: any) => {
                     const aa = formatFeatherIssue(aaRaw);
                     if (isIssueFiltered(aa)) return;
                     const key = 'feather_alarm_' + encodeURIComponent(aa);
                     if (!groupMap.has(key)) groupMap.set(key, { id: key, severity: 'ALARM', source: 'Feather/HVAC', code: null, message: aa, displayText: aa, occurrenceCount: 0, affectedEnclosureCount: 0, occurrences: [] });
                     groupMap.get(key).occurrences.push({ deviceIp, enclosureLabel, sourcePath: 'featherSummary' });
                 });
             }
        });
        
        
        stringsData.forEach((st: any) => {
             let rawAlarms = String(st.Alarms || st.alarms || st.alarmCodes || st.alarmsList || '');
             let rawWarns = String(st.Warns || st.warns || st.warningCodes || st.warnCodes || st.warningsList || '');
             
             let alarms = extractCodes(rawAlarms.split(','));
             let warnings = extractCodes(rawWarns.split(','));
             
             if (alarms.length === 0 && Array.isArray(st.alarms)) alarms = extractCodes(st.alarms);
             if (warnings.length === 0 && Array.isArray(st.warns)) warnings = extractCodes(st.warns);
             
             alarms = Array.from(new Set(alarms));
             warnings = Array.from(new Set(warnings));
             
             const arrayNumber = st.arrayNumber ?? st.arrayIndex ?? st.ArrayIndex ?? null;
             const stringNumber = st.stringNumber ?? st.stringIndex ?? st.StringIndex ?? null;
             const enclosureLabel = arrayNumber != null && stringNumber != null
               ? 'Array ' + arrayNumber + ' ES' + stringNumber
               : 'Unknown String';
               
             if (warnings.length === 0 && Number(st.warningCount || st.warnCount || 0) > 0) {
                 const key = 'string_warn_generic_count';
                 if (!groupMap.has(key)) groupMap.set(key, { id: key, severity: 'WARNING', source: 'String Controller', code: null, message: 'String warnings present - codes unavailable', displayText: 'String warnings present - codes unavailable', occurrenceCount: 0, affectedEnclosureCount: 0, occurrences: [] });
                 groupMap.get(key).occurrences.push({ arrayNumber, stringNumber, bpcNumber: st.bpcNumber, enclosureLabel, sourcePath: 'stringsCsv' });
             }
             if (alarms.length === 0 && Number(st.alarmCount || st.alarmsCount || 0) > 0) {
                 const key = 'string_alarm_generic_count';
                 if (!groupMap.has(key)) groupMap.set(key, { id: key, severity: 'ALARM', source: 'String Controller', code: null, message: 'String alarms present - codes unavailable', displayText: 'String alarms present - codes unavailable', occurrenceCount: 0, affectedEnclosureCount: 0, occurrences: [] });
                 groupMap.get(key).occurrences.push({ arrayNumber, stringNumber, bpcNumber: st.bpcNumber, enclosureLabel, sourcePath: 'stringsCsv' });
             }

             
             alarms.forEach(ac => {
                 const desc = scMap[ac] || "";
                 const codeDesc = desc ? `Alarm Code ${ac}: ${desc}` : `Alarm Code ${ac}`;
                 if (isIssueFiltered(codeDesc, String(ac))) return;
                 const key = 'string_alarm_' + ac;
                 if (!groupMap.has(key)) groupMap.set(key, { id: key, severity: 'ALARM', source: 'String Controller', code: String(ac), message: codeDesc, displayText: codeDesc, occurrenceCount: 0, affectedEnclosureCount: 0, occurrences: [] });
                 groupMap.get(key).occurrences.push({ arrayNumber, stringNumber, bpcNumber: st.bpcNumber, enclosureLabel, sourcePath: 'stringsCsv' });
             });
             
             warnings.forEach(wc => {
                 const desc = scMap[wc] || "";
                 const codeDesc = desc ? `Warning Code ${wc}: ${desc}` : `Warning Code ${wc}`;
                 if (isIssueFiltered(codeDesc, String(wc))) return;
                 const key = 'string_warn_' + wc;
                 if (!groupMap.has(key)) groupMap.set(key, { id: key, severity: 'WARNING', source: 'String Controller', code: String(wc), message: codeDesc, displayText: codeDesc, occurrenceCount: 0, affectedEnclosureCount: 0, occurrences: [] });
                 groupMap.get(key).occurrences.push({ arrayNumber, stringNumber, bpcNumber: st.bpcNumber, enclosureLabel, sourcePath: 'stringsCsv' });
             });
        });

        
        for (const g of groupMap.values()) {
             g.occurrenceCount = g.occurrences.length;
             g.affectedEnclosureCount = new Set(g.occurrences.map((o: any) => o.enclosureLabel)).size;
             activeIssueGroups.push(g);
        }

        const sourceHealth = getEmsSourcesDebugInfo().map((d: any) => ({
            name: d.endpoint.split('/').pop() || d.endpoint,
            endpoint: d.endpoint,
            type: d.endpoint.includes('feather') ? 'Feather' : 'EMS',
            ok: d.success,
            error: d.lastError === "NONE" ? undefined : d.lastError
        }));

        sourceHealth.push({
            name: "emsApps",
            endpoint: "emsApps",
            type: "EMS",
            ok: emsAppsResult.status !== "error",
            error: emsAppsResult.status === "cached_timeout" ? "cached_timeout" : (emsAppsResult.status === "error" ? "error" : undefined)
        });

        
        const siteTopology = buildSiteTopologyFromCachedSources();
        const totalStringsInTopology = siteTopology.counts.stringCount || stringSummary.rollups?.totalStrings || 0;

        let fleetMetricSource = "native";
        const bessFleetSummary = {
            totalStrings: totalStringsInTopology,
            onlineStrings: stringSummary.buckets.online,
            nearlineStrings: stringSummary.buckets.nearline,
            offlineStrings: stringSummary.buckets.offline,
            notCommunicatingStrings: stringSummary.buckets.notCommunicating,
            warningStrings: activeIssueGroups.filter((g: any) => g.severity === 'WARNING').reduce((acc: number, g: any) => acc + g.occurrenceCount, 0),
            alarmStrings: activeIssueGroups.filter((g: any) => g.severity === 'ALARM').reduce((acc: number, g: any) => acc + g.occurrenceCount, 0),
            expectedBpcs: null,
            bpcsPerString: null,
            avgCellVoltageMv: null as number | null,
            maxCellVoltageDeltaMv: null as number | null,
            avgCellTempC: null as number | null,
            maxCellTempDeltaC: null as number | null,
            maxCellTempC: null as number | null,
            systemSocPct: null as number | null,
            sourceOk: stringSummary.buckets.online > 0 || stringSummary.buckets.offline > 0 || stringSummary.buckets.nearline > 0 || stringSummary.buckets.notCommunicating > 0,
            lastUpdated: new Date().toISOString()
        };

        if (stringSummary && stringSummary.tableRows && stringSummary.tableRows.length > 0) {
             fleetMetricSource = "stringSummary.tableRows";
             
             let maxVolt = -Infinity, minVolt = Infinity;
             let maxTemp = -Infinity, minTemp = Infinity;
             
             let avgVoltSum = 0, avgVoltCount = 0;
             let avgTempSum = 0, avgTempCount = 0;
             let socPctSum = 0, socPctCount = 0;
             
             for (const str of stringSummary.tableRows) {
                 // Check if it's a collection segment (CS or ES) by checking the object
                 // If the requirement means to skip feather collection segments, note that tableRows are strings, not feathers
                 // However, we still include offline/notCommunicating data if the data is there
                 const soc = str.socPct;
                 if (soc !== null && soc !== undefined) {
                     socPctSum += soc;
                     socPctCount++;
                 }

                 const vAvg = str.avgCellVoltageMv;
                 const vMax = str.maxCellVoltageMv;
                 const vMin = str.minCellVoltageMv;
                 
                 const tAvg = str.avgTempC;
                 const tMax = str.maxTempC;
                 const tMin = str.minTempC;
                 
                 if (vAvg !== null) { avgVoltSum += vAvg; avgVoltCount++; }
                 if (tAvg !== null) { avgTempSum += tAvg; avgTempCount++; }
                 
                 if (vMax !== null && vMax > maxVolt) maxVolt = vMax;
                 if (vMin !== null && vMin < minVolt) minVolt = vMin;
                 
                 if (tMax !== null && tMax > maxTemp) maxTemp = tMax;
                 if (tMin !== null && tMin < minTemp) minTemp = tMin;
             }
             
             if (avgVoltCount > 0) bessFleetSummary.avgCellVoltageMv = avgVoltSum / avgVoltCount;
             if (avgTempCount > 0) bessFleetSummary.avgCellTempC = avgTempSum / avgTempCount;
             if (socPctCount > 0) bessFleetSummary.systemSocPct = socPctSum / socPctCount;
			 
             if (maxVolt !== -Infinity && minVolt !== Infinity) {
                 bessFleetSummary.maxCellVoltageDeltaMv = maxVolt - minVolt;
             }
             if (maxTemp !== -Infinity && minTemp !== Infinity) {
                 bessFleetSummary.maxCellTempDeltaC = maxTemp - minTemp;
             }
             if (maxTemp !== -Infinity) bessFleetSummary.maxCellTempC = maxTemp;
        }

         // Compute Corrective Actions Log
         const activeProfile = ProfileStore.getActiveProfile();
         const liveDevices = fDevices;

         const sharedCorrectiveActions = getCorrectiveActionsFromNormalizedFaults();
         const correctiveActions: any[] = sharedCorrectiveActions.map(act => {
             const level: "ALARM" | "WARNING" | "INFO" = act.severity === "alarm" ? "ALARM" : act.severity === "warning" ? "WARNING" : "INFO";
             
             // Map affected into affectedTargets
             const affectedTargets: any[] = act.affected.map(aff => {
                 const targetIp = aff.ip;
                 const resolvedTarget = normalizeIpToEquipmentCallout(targetIp || aff.label, activeProfile, liveDevices);
                 
                 let stringNumber: number | null = null;
                 let isExplicitStringLevel = false;

                 if (aff.stringIndex !== undefined && aff.stringIndex !== null) {
                     stringNumber = aff.stringIndex;
                     isExplicitStringLevel = true;
                 } else if (resolvedTarget.stringIndex !== undefined && resolvedTarget.stringIndex !== null) {
                     stringNumber = resolvedTarget.stringIndex;
                     isExplicitStringLevel = true;
                 } else if (aff.segmentIndex !== undefined && aff.segmentIndex !== null) {
                     // Do not use aff.segmentIndex as stringNumber unless the affected target source explicitly identifies it as a string-level target
                     const isExplicitString = !!(
                         (aff.label && /string/i.test(aff.label)) ||
                         (aff.rawFault && /string/i.test(aff.rawFault)) ||
                         (aff.source === "ems" && /string/i.test(aff.label || ""))
                     );
                     if (isExplicitString) {
                         stringNumber = aff.segmentIndex;
                         isExplicitStringLevel = true;
                     }
                 }

                 const arrayNumber = aff.arrayIndex ?? resolvedTarget.arrayIndex ?? 1;
                 const blockIndex = aff.blockIndex ?? (resolvedTarget as any).blockIndex ?? 1;

                 let label = resolvedTarget.mapped ? resolvedTarget.label : (aff.label || resolvedTarget.label);
                 let displayLabel = resolvedTarget.mapped 
                     ? `${resolvedTarget.label} — ${targetIp}` 
                      : (targetIp ? `${resolvedTarget.label} — ${targetIp}` : resolvedTarget.displayLabel);

                 if (isExplicitStringLevel && stringNumber && stringNumber > 0) {
                     label = formatStringEsLabel({
                         blockIndex,
                         arrayNumber,
                         stringNumber,
                         includeBlock: true
                     });
                     displayLabel = targetIp ? `${label} — ${targetIp}` : label;
                 } else if (aff.segmentIndex !== undefined && aff.segmentIndex !== null) {
                     // If segmentIndex exists, but it's not a string-level target, format as segment-level (ES) target
                     label = formatStringEsLabel({
                         blockIndex,
                         arrayNumber,
                         energySegmentNumber: aff.segmentIndex,
                         includeBlock: true
                     });
                     displayLabel = targetIp ? `${label} — ${targetIp}` : label;
                 }

                 return {
                     raw: targetIp || aff.label,
                     label,
                     displayLabel,
                     mapped: resolvedTarget.mapped,
                     type: resolvedTarget.type,
                     arrayIndex: arrayNumber,
                     stringIndex: stringNumber,
                     stringNumber,
                     enclosureIndex: resolvedTarget.enclosureIndex ?? aff.segmentIndex ?? stringNumber,
                     hostOctet: resolvedTarget.hostOctet,
                     ip: targetIp || undefined,
                     source: aff.source,
                     rawFault: aff.rawFault || act.faultLabel,
                     rawCode: aff.rawCode || act.faultCode,
                     blockIndex: blockIndex
                 };
             });

             const count = affectedTargets.length;
             let affectedSummary = "";
             if (count === 1) {
                 affectedSummary = affectedTargets[0].label;
             } else if (count > 1) {
                 affectedSummary = `${affectedTargets[0].label} (+${count - 1} more)`;
             }

             const firstAffected = act.affected[0];
             const source = firstAffected?.source === "ems" ? "String Controller" : firstAffected?.source === "feather" ? "Feather/HVAC" : "System";
             const object = count === 1 ? affectedTargets[0].label : "Multiple";

             return {
                 id: act.id,
                 level,
                 source,
                 fault: act.faultLabel,
                 faultName: act.faultLabel,
                 faultId: act.faultCode,
                 object,
                 details: "Affected units: " + count,
                 firstSeen: new Date().toISOString(),
                 count,
                 affectedCount: count,
                 affectedSummary,
                 suggestedAction: act.suggestedAction,
                 affected: affectedTargets,
                 affectedTargets
             };
         });

         // Add source health errors
         if (sourceHealth) {
            const hasUsableData = stringSummary.tableRows.length > 0;

            sourceHealth.forEach((s: any) => {
                if (!s.ok && s.error && s.error !== "NONE") {
                    const host = s.endpoint || s.name;
                    const isCritical = ['/status', '/tools/report/ems/status.json', '/tools/monitor/ems/blockviewer/data', '/tools/report/ems/lastCall.json', '/tools/report/ems/strings.csv'].includes(host);

                    if (hasUsableData) {
                        return; // If we have usable parsed data, suppress polling failures from polluting corrective actions
                    }

                    const target: any = {
                        raw: host,
                        label: host,
                        displayLabel: host,
                        mapped: false,
                        type: "endpoint",
                        ip: host,
                        source: s.type
                    };

                    correctiveActions.push({
                        id: `source_health_${s.type}_${host}`,
                        level: isCritical ? "WARNING" : "INFO",
                        source: `${s.type} Source: ${host}`,
                        fault: "Source Polling Failed",
                        faultName: "Source Polling Failed",
                        faultId: "SOURCE_POLL_FAIL",
                        object: "Data Source",
                        details: "Endpoint unreachable or failed: " + s.error,
                        firstSeen: new Date().toISOString(),
                        count: 1,
                        affectedCount: 1,
                        affectedSummary: host,
                        suggestedAction: "Verify local connection and API endpoint availability for " + host,
                        affected: [target],
                        affectedTargets: [target]
                    });
                }
            });
         }

        const responseData = {
            correctiveActions,

            stationCode,
            site,
            topologyCounts: siteTopology.counts,
            topologySourceHealth: siteTopology.sourceHealth,
            emsApps,
            bessFleetSummary: bessFleetSummary,
            stringSummary,
            arraySummary,
            pcsSummary,
            featherSummary,
            humidityTemperatureSensors: htsSummary,
            safetySummary,
            activeIssueGroups,
            sourceHealth,
            fleetCapacity,
            classificationSource: "shared-string-operational-state-v1",
            capacitySource: {
                installedCapacity: capacitySourceMeta,
                storedEnergy: "string.kWh or derived from SOC",
                chargeLimit: "array.availableACChargekW | null",
                dischargeLimit: "array.availableACDischargekW | null"
            },
            debug: {
               featherCellTempExcludedCollectionSegments,
               normalizedStringRowCount: stringSummary.tableRows.length,
               pcsDebugKeys: Array.from(new Set(pcsDebugKeys)),
               appDebugKeys: [],
               emsAppCandidateCount: emsApps.length,
               emsAppSourcePaths: emsAppSourcePaths,
               unknownDragonAppCodes: unknownDragonAppCodes,
               arraySummarySource,
               arraySummaryCandidateCount: arrCands.length,
               arraySummarySynthesis,
               fleetMetricSource
            },
            
            // Legacy fallbacks
            arrays: arraySummary,
            dragonApps: emsApps,
            topology,
            activeIssues: activeIssueGroups
        };

        return responseData;
    } catch (err: any) { throw err; }
}

export async function refreshSiteOperationsSources() {
    if (siteOpsInFlight) return siteOpsInFlight;
    siteOpsInFlight = (async () => {
        try {
            const { requestRefresh } = await import("./prizmDataCoordinator");
            requestRefresh("route:/api/local/site-operations/summary");
        } finally {
            siteOpsInFlight = null;
        }
    })();
    return siteOpsInFlight;
}

import { getEffectiveCachePolicy, shouldFetchLive, buildCacheMetadata } from "./cache/prizmCache";

router.get("/summary", async (req, res) => {
    const tStart = Date.now();
    const policy = getEffectiveCachePolicy(req.query.cache, req.query.noCache, req.query.refresh);
    const forceLive = shouldFetchLive(policy);
    const allowCache = ["cache-first", "cache-only", "live-first"].includes(policy);

    try {
        let responseData: any = null;
        let wasLiveAttempted = false;
        let wasLiveSucceeded = false;
        let wasCacheUsed = false;

        if (forceLive) {
             wasLiveAttempted = true;
             // force refresh of sources? Yes. Then build summary from the fresh cache.
             if (policy !== "live-first" || req.query.refresh === "true") {
                 // if live-only or explicit refresh, await the refresh
                 await refreshSiteOperationsSources().catch(() => {});
             } else {
                 // live-first, maybe trigger in background or await if cache is empty
                 const cachedEntry = prizmCache.get('site-operations-summary');
                 if (!cachedEntry || cachedEntry.isStale) {
                     await refreshSiteOperationsSources().catch(() => {});
                 } else {
                     refreshSiteOperationsSources().catch(() => {});
                 }
             }
             responseData = await buildSiteOperationsSummaryFromCache();
             wasLiveSucceeded = Object.keys(responseData).length > 0;
             if (wasLiveSucceeded && policy === "live-only") {
                 // To prevent labeling as cache, we know it's freshly built from live data.
                 wasCacheUsed = false; 
             } else if (!wasLiveSucceeded && policy === "live-first") {
                 responseData = lastSummaryCache || (await buildSiteOperationsSummaryFromCache());
                 wasCacheUsed = !!responseData;
             }
        } 
        
        if (!wasLiveSucceeded && allowCache) {
             let cachedEntry = prizmCache.get('site-operations-summary');
             if (cachedEntry) {
                 responseData = cachedEntry.data;
                 wasCacheUsed = true;
             } else if (lastSummaryCache) {
                 responseData = lastSummaryCache;
                 wasCacheUsed = true;
             } else {
                 responseData = await buildSiteOperationsSummaryFromCache();
                 wasCacheUsed = true;
             }
        }

        if (!responseData) responseData = {};
        const producingCycleId = prizmCache.get('site-operations-summary')?.cycleId
          ?? getEmsCachedBlock().cycleId
          ?? null;
        responseData = { ...responseData, cycleId: producingCycleId };

        const cacheEntry = prizmCache.get('site-operations-summary') || {
            key: 'site-operations-summary', fetchedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(), ageMs: 0, ttlMs: 5000, 
            sourceOk: wasLiveSucceeded, isLive: wasLiveSucceeded, isStale: !wasLiveSucceeded,
            dataClass: "live-status", createdFromLiveSession: false,
            data: responseData ?? null
        };
        cacheEntry.dataClass = "live-status";
        if (wasLiveAttempted && wasLiveSucceeded) cacheEntry.createdFromLiveSession = true;

        const meta = prizmCache.getActiveSiteMetadata();
        const activeIdentity = { activeProfileId: meta.profileId, emsBaseUrl: meta.emsBaseUrl, stationCode: meta.stationCode, blockIndex: meta.blockIndex };
        const cacheMetadata = prizmCache.buildCacheMetadata(policy, wasCacheUsed, wasLiveAttempted, wasLiveSucceeded, cacheEntry, activeIdentity, "live-ems");

        // Merge the cache metadata directly into the root level as requested
        Object.assign(responseData, cacheMetadata);

        const totalMs = Date.now() - tStart;
        (responseData as any).debug = {
             ...((responseData as any).debug || {}),
             timings: { totalMs, cachePolicy: policy }
        };

        if (totalMs > 500) console.log('[SiteOps] Slow summary response: ' + totalMs + 'ms');

        res.json(responseData);
    } catch (err: any) {
        res.status(500).json({ error: err.message, source: "unavailable", cacheUsed: false, liveAttempted: forceLive, liveSucceeded: false });
    }
});

export default router;
