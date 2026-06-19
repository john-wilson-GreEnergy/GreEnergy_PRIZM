import { Router } from "express";
import {
  getEmsCachedStatus,
  getEmsCachedBlock,
  getEmsCachedStatusCodes,
  getEmsCachedRawStrings,
  getEmsCachedControllerStatistics,
  getEmsCachedLastCall,
  getEmsIpMap,
  getEmsStringIpMap,
  getEmsSourcesDebugInfo
} from "./emsTurtleClient";
import { ProfileStore } from "./profiles/profileStore";

import * as prizmCache from "./cache/prizmCache";
import * as prizmHistory from "./history/prizmHistory";
import { BESS_STATUS_CODE_MAP, describeBessStatusCode, classifyBessStatusCode } from "../lib/bessStatusCodes";
import { classifyStringOperationalState } from "../lib/stringClassifier";

const router = Router();

function pN(val: any, def: number | null = null): number | null {
  if (val === undefined || val === null || val === "") return def;
  const n = Number(val);
  return isNaN(n) ? def : n;
}

const finite = (value: any): number | null => {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

function normalizeHeader(h: string): string {
    return h.toLowerCase().replace(/[\s_\-\.]/g, "");
}

function parseBoolean(val: any): boolean {
    if (val === true) return true;
    if (val === "true" || val === "TRUE" || val === "1" || val === 1) return true;
    return false;
}

function tryGetField(row: any, normalizedObject: Record<string, any>, possibleNames: string[]): any {
    for (const n of possibleNames) {
        if (row[n] !== undefined) return row[n];
        const norm = normalizeHeader(n);
        if (normalizedObject[norm] !== undefined) return normalizedObject[norm];
    }
    return undefined;
}

function findBatteryPackList(row: any, arrayNumber: number, stringNumber: number, lcStrBase: any, blockStrBase: any, lastCallWrapper: any, blockWrapper: any): any[] | null {
    if (lcStrBase) {
        if (Array.isArray(lcStrBase.batteryPackReportList)) return lcStrBase.batteryPackReportList;
        if (Array.isArray(lcStrBase.batteryPacks)) return lcStrBase.batteryPacks;
        if (Array.isArray(lcStrBase.packs)) return lcStrBase.packs;
        if (Array.isArray(lcStrBase.bpcs)) return lcStrBase.bpcs;
        if (lcStrBase.raw && Array.isArray(lcStrBase.raw.batteryPackReportList)) return lcStrBase.raw.batteryPackReportList;
    }
    if (blockStrBase) {
        if (Array.isArray(blockStrBase.batteryPackReportList)) return blockStrBase.batteryPackReportList;
        if (Array.isArray(blockStrBase.batteryPacks)) return blockStrBase.batteryPacks;
        if (Array.isArray(blockStrBase.packs)) return blockStrBase.packs;
        if (Array.isArray(blockStrBase.bpcs)) return blockStrBase.bpcs;
    }
    if (blockWrapper?.data?.arrays) {
        const arr = blockWrapper.data.arrays[arrayNumber - 1];
        if (arr && arr.strings) {
            const strObj = arr.strings[stringNumber - 1];
            if (strObj) {
                if (Array.isArray(strObj.batteryPackReportList)) return strObj.batteryPackReportList;
                if (Array.isArray(strObj.batteryPacks)) return strObj.batteryPacks;
            }
        }
    }
    if (lastCallWrapper?.data?.arrays) {
        const arr = lastCallWrapper.data.arrays[arrayNumber - 1];
        if (arr && arr.strings) {
            const strObj = arr.strings[stringNumber - 1];
            if (strObj) {
                if (Array.isArray(strObj.batteryPackReportList)) return strObj.batteryPackReportList;
                if (Array.isArray(strObj.batteryPacks)) return strObj.batteryPacks;
            }
        }
    }
    if (row) {
        if (Array.isArray(row.batteryPackReportList)) return row.batteryPackReportList;
        if (Array.isArray(row.batteryPacks)) return row.batteryPacks;
        if (row.raw && Array.isArray(row.raw.batteryPackReportList)) return row.raw.batteryPackReportList;
    }
    return null;
}

function extractBpcBalancing(item: any, idx: number) {
    const data = item?.batteryPackData || item;
    const config = data?.batteryPackBalancingConfiguration || data?.balancingConfiguration || data;

    const bpIndex = item?.bpIndex ?? item?.batteryPackIndex ?? item?.packIndex ?? item?.index ?? (idx + 1);

    const modeRaw = config?.balancingMode ?? config?.mode ?? null;
    const providedVoltageTarget = config?.providedVoltageTarget ?? config?.voltageTarget ?? config?.targetVoltage ?? null;
    const chargeBalancingPermitted = config?.chargeBalancingPermitted ?? config?.chargePermitted ?? null;
    const dischargeBalancingPermitted = config?.dischargeBalancingPermitted ?? config?.dischargePermitted ?? null;
    const chargeDeadband = config?.chargeDeadband ?? null;
    const dischargeDeadband = config?.dischargeDeadband ?? null;
    const commandTimeToLive = config?.commandTimeToLive ?? config?.ttl ?? null;
    const balancingSource = config?.balancingSource ?? config?.source ?? null;

    const balancingCellGroup = data?.balancingCellGroup ?? data?.balancingCgIndex ?? data?.cgIndex ?? null;
    const stateRaw = data?.balancingState ?? data?.state ?? data?.activeBalancingState ?? null;

    const formatBalanceMode = (mRaw: any, targetVal: any): string => {
        const raw = String(mRaw || "").toUpperCase();
        const target = Number(targetVal);
        if (raw.includes("PROVIDED")) {
            return Number.isFinite(target) ? `Provided (${target})` : "Provided";
        }
        if (raw.includes("AVERAGE")) {
            return "Average";
        }
        if (!raw) {
            return "--";
        }
        return raw
            .replace(/^BALANCE_TO_/, "")
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/\b\w/g, c => c.toUpperCase());
    };

    const mode = formatBalanceMode(modeRaw, providedVoltageTarget);

    const formatBalanceState = (sRaw: any): string => {
        const raw = String(sRaw || "").toUpperCase();
        if (!raw) return "Unknown";
        if (raw.includes("OFF")) return "Off";
        if (raw.includes("DISCHARGE") && raw.includes("ON")) return "Discharging";
        if (raw.includes("CHARGE") && raw.includes("ON")) return "Charging";
        if (raw.includes("ON")) return "On";
        return raw
            .replace(/^BATTERY_PACK_/, "")
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/\b\w/g, c => c.toUpperCase());
    };

    const state = formatBalanceState(stateRaw);

    let isActive = false;
    if (state !== "Off" && state !== "Unknown") {
        isActive = true;
    } else if (stateRaw) {
        const raw = String(stateRaw).toUpperCase();
        if (raw !== "BALANCING_OFF" && (
            raw.includes("ON") ||
            (raw.includes("CHARGE") && raw.includes("ON")) ||
            (raw.includes("DISCHARGE") && raw.includes("ON"))
        )) {
            isActive = true;
        }
    } else {
        if (item.active === true || item.balancingActive === true || data.active === true || data.balancingActive === true) {
            isActive = true;
        }
    }

    return {
        bpIndex,
        mode,
        modeRaw,
        providedVoltageTarget,
        state,
        stateRaw,
        balancingCellGroup,
        chargeBalancingPermitted,
        dischargeBalancingPermitted,
        chargeDeadband,
        dischargeDeadband,
        commandTimeToLive,
        balancingSource,
        isActive
    };
}

router.get("/dump", (req, res) => {
    res.json({
        rawStrings: getEmsCachedRawStrings(),
        debug: getEmsSourcesDebugInfo()
    });
});

export async function buildNormalizedStringsData(enrich = false, targetArray: number | null = null): Promise<any> {
    const profile = ProfileStore.getActiveProfile();
    const baseUrl = profile ? `http://${profile.emsHost}:${profile.emsPort}${profile.turtlePath}` : "unknown";

    const rawStringsWrapper = getEmsCachedRawStrings();
    const blockWrapper = getEmsCachedBlock();
    const stringIpMapWrapper = getEmsStringIpMap();
    const ipMapWrapper = getEmsIpMap();
    const lastCallWrapper = getEmsCachedLastCall();
    const statusWrapper = getEmsCachedStatus();
    const controllerStatsWrapper = getEmsCachedControllerStatistics();
    const bessStatusCodesWrapper = getEmsCachedStatusCodes();
    const debugInfo = getEmsSourcesDebugInfo() || {};

    const debugInfoArray = Array.isArray(debugInfo) ? debugInfo : [];
    const debugInfoMap: Record<string, any> = {};
    debugInfoArray.forEach((r: any) => {
        debugInfoMap[r.endpoint] = r;
    });

    // Source coverage
    const getSourceHealth = (key: string) => {
        const health = debugInfoMap[key] || { success: false, statusCode: null, durationMs: null, lastError: null };
        return {
            ok: !!health.success,
            httpStatus: health.statusCode || (health.success ? 200 : null),
            durationMs: health.durationMs,
            error: health.lastError === "NONE" ? null : health.lastError,
            url: `${baseUrl}${key}`
        };
    };

    const sourceHealth = {
        stringsCsv: getSourceHealth("/tools/report/ems/strings.csv"),
        lastCall: getSourceHealth("/tools/report/ems/lastCall.json"),
        stringIpMap: getSourceHealth("/tools/report/ems/stringIPMap.json"),
        ipMap: getSourceHealth("/tools/report/ems/ipMap.json"),
        blockviewer: getSourceHealth("/tools/monitor/ems/blockviewer/data"),
        status: getSourceHealth("/tools/report/ems/status.json"),
        controllerStatistics: getSourceHealth("/tools/report/ems/controllerStatistics.json"),
        bessStatusCodes: getSourceHealth("/tools/report/ems/bessStatusCodes.json")
    };

    // Determine base string list. Prefer strings.csv, fallback to blockviewer
    let stringsData: any[] = [];
    let sourceCoverageStringsCsv = false;
    let sourceCoverageBlockviewer = false;
    if (rawStringsWrapper.data && Array.isArray(rawStringsWrapper.data) && rawStringsWrapper.data.length > 0) {
        stringsData = rawStringsWrapper.data;
        sourceCoverageStringsCsv = true;
    } else if (blockWrapper.data && Array.isArray(blockWrapper.data.strings) && blockWrapper.data.strings.length > 0) {
        stringsData = blockWrapper.data.strings;
        sourceCoverageBlockviewer = true;
    }

    const stringIpMap = (stringIpMapWrapper.data && Array.isArray(stringIpMapWrapper.data)) ? stringIpMapWrapper.data : [];
    const ipMap = (ipMapWrapper.data && Array.isArray(ipMapWrapper.data)) ? ipMapWrapper.data : [];

    let lastCallStrings: any[] = [];
    let lastCallArrays: any[] = [];
    if (lastCallWrapper.data) {
        if (Array.isArray(lastCallWrapper.data.strings)) lastCallStrings = lastCallWrapper.data.strings;
        if (Array.isArray(lastCallWrapper.data.arrays)) lastCallArrays = lastCallWrapper.data.arrays;
    }

    const strings: any[] = [];
    
    let totalStrings = 0;
    let normalStrings = 0;
    let warningStrings = 0;
    let alarmStrings = 0;
    let offlineStrings = 0;
    let nearlineStrings = 0;
    let totalBpcs = 0;
    let knownBpcCount = 0;
    let warningBpcs = 0;
    let alarmBpcs = 0;
    
    // global stats
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
    
    let gWarnCount = 0;
    let gAlarmCount = 0;

    stringsData.forEach(row => {
        const normalizedObject: Record<string, any> = {};
        for (const [k, v] of Object.entries(row)) {
            normalizedObject[normalizeHeader(k)] = v;
        }

        const hasStringData = row && (row.stringData !== undefined || row.StringData !== undefined);
        const stringData = hasStringData ? (row.stringData || row.StringData) : null;

        const arrayNumber = hasStringData ? Number(row.arrayIndex) : pN(tryGetField(row, normalizedObject, ["array", "arrayindex", "arr"]));
        const stringNumber = hasStringData ? Number(row.stringIndex) : pN(tryGetField(row, normalizedObject, ["string", "stringindex", "str"]));
        
        if (arrayNumber === null || stringNumber === null) {
            require('fs').appendFileSync('skips.log', JSON.stringify({ arrayNumber, stringNumber, row }) + "\n");
            return;
        }
        totalStrings++;

        const id = `A${arrayNumber}-S${stringNumber}`;

        // Merge Map Info
        const sIpInfo = stringIpMap.find(m => pN(m.array) === arrayNumber && pN(m.string) === stringNumber);
        
        // Merge Blockviewer telemetry if not primary
        let blockStrBase: any = null;
        if (!sourceCoverageBlockviewer && blockWrapper.data?.strings) {
            blockStrBase = blockWrapper.data.strings.find((s:any) => pN(s.array) === arrayNumber && pN(s.string) === stringNumber) || null;
        }

        // Merge Last Call
        let lcStrBase = lastCallStrings.find(s => pN(s.array) === arrayNumber && pN(s.string) === stringNumber);
        // sometimes it's nested in array
        if (!lcStrBase) {
             const lcA = lastCallArrays.find(a => pN(a.index || a.arrayIndex) === arrayNumber);
             if (lcA && Array.isArray(lcA.strings)) {
                 lcStrBase = lcA.strings.find((s:any) => pN(s.index || s.stringIndex) === stringNumber);
             }
        }

        // Identify Connection State
        let isOnline: boolean | null = null;
        if (hasStringData) {
            const scState = stringData.stringConnectionState;
            isOnline = scState === "ONLINE" || scState === "Online" || scState === "NORMAL" || scState === true;
        } else {
            let conn = tryGetField(row, normalizedObject, ["connectionstate", "contact", "communicating"]);
            if (conn === undefined && blockStrBase) conn = blockStrBase.communicating;
            if (conn === undefined && lcStrBase) {
                 conn = lcStrBase.communicating ?? lcStrBase.connectionState;
            }
            if (conn === true || conn === "true" || conn === "Online" || conn === "ONLINE") isOnline = true;
            else if (conn === false || conn === "false" || conn === "Offline" || conn === "OFFLINE" || row.StringConnectionState === "OFFLINE") isOnline = false;
        }
        
        const contactorsCloseExpected = hasStringData 
            ? parseBoolean(stringData.contactorsCloseExpected) 
            : parseBoolean(tryGetField(row, normalizedObject, ["contactorscloseexpected", "closeexpected"]));
            
        const positiveContactorClosed = hasStringData 
            ? parseBoolean(stringData.positiveContactorClosed) 
            : parseBoolean(tryGetField(row, normalizedObject, ["positivecontactorclosed", "positive_contactor_closed"]));
            
        const negativeContactorClosed = hasStringData 
            ? parseBoolean(stringData.negativeContactorClosed) 
            : parseBoolean(tryGetField(row, normalizedObject, ["negativecontactorclosed", "negative_contactor_closed"]));
            
        const contactorClosed = positiveContactorClosed && negativeContactorClosed;
        const contactorStatus = contactorClosed ? "CLOSED" : "OPEN";
        const recloseCount = hasStringData 
            ? pN(stringData.recloseCount) 
            : pN(tryGetField(row, normalizedObject, ["reclosecount"]));
        
        const outRotation = hasStringData 
            ? parseBoolean(stringData.outRotation) 
            : parseBoolean(tryGetField(row, normalizedObject, ["outrotation", "out_rotation", "rotation"]));
            
        const rotationStatus = outRotation ? "OUT" : "IN";
        const rotationEnabled = !outRotation;

        const measuredVoltage = hasStringData 
            ? pN(stringData.measuredStringVoltage) 
            : pN(tryGetField(row, normalizedObject, ["measuredvoltage", "voltagemeasured", "voltagemeas", "voltage_measured", "measuredstringvoltage"]));
            
        const calculatedVoltage = hasStringData 
            ? pN(stringData.calculatedStringVoltage) 
            : pN(tryGetField(row, normalizedObject, ["calculatedvoltage", "voltagecalculated", "voltagecalc", "voltage_calculated", "calculatedstringvoltage"]));
            
        const preciseCalculatedVoltage = hasStringData 
            ? pN(stringData.preciseCalculatedStringVoltage) 
            : calculatedVoltage;

        const busVoltage = hasStringData 
            ? pN(stringData.dcBusVoltage) 
            : pN(tryGetField(row, normalizedObject, ["busvoltage", "voltagedcbus", "voltagebus", "voltage_bus", "dcbusvoltage"]));
            
        let voltageDelta = null;
        if (measuredVoltage !== null && calculatedVoltage !== null) {
            voltageDelta = Number(Math.abs(measuredVoltage - calculatedVoltage).toFixed(2));
        }

        const amps = hasStringData 
            ? pN(stringData.stringCurrent) 
            : pN(tryGetField(row, normalizedObject, ["current", "stringcurrent", "string_current"]));
            
        const kw = hasStringData 
            ? pN(stringData.kW) 
            : pN(tryGetField(row, normalizedObject, ["kw", "powerkw", "measuredkw", "power_kw"]));
            
        const socPct = hasStringData 
            ? pN(stringData.soc) 
            : pN(tryGetField(row, normalizedObject, ["soc", "powersoc"]));
            
        const ah = hasStringData 
            ? pN(stringData.ah) 
            : pN(tryGetField(row, normalizedObject, ["ah", "capacityah"]));
            
        const kwh = hasStringData 
            ? pN(stringData.kWh) 
            : pN(tryGetField(row, normalizedObject, ["kwh", "powerkwh"]));

        const minCellVoltage = hasStringData 
            ? pN(stringData.minCellGroupVoltage) 
            : pN(tryGetField(row, normalizedObject, ["mincellvoltage", "cellgroupvoltagemin", "cellvoltsmin", "mincellgroupvoltage"]));
            
        const maxCellVoltage = hasStringData 
            ? pN(stringData.maxCellGroupVoltage) 
            : pN(tryGetField(row, normalizedObject, ["maxcellvoltage", "cellgroupvoltagemax", "cellvoltsmax", "maxcellgroupvoltage"]));
            
        const avgCellVoltage = hasStringData 
            ? pN(stringData.avgCellGroupVoltage) 
            : pN(tryGetField(row, normalizedObject, ["avgcellvoltage", "cellgroupvoltageavg", "avgcellgroupvoltage"]));
            
        let cellVoltageDelta = null;
        if (maxCellVoltage !== null && minCellVoltage !== null) {
            cellVoltageDelta = Number((maxCellVoltage - minCellVoltage).toFixed(3));
        }

        let minCellTemperature = null;
        if (hasStringData) {
            const rawMinT = pN(stringData.minCellGroupTemp);
            minCellTemperature = rawMinT !== null ? (rawMinT > 90 ? rawMinT / 10 : rawMinT) : null;
        } else {
            const rawMinT = pN(tryGetField(row, normalizedObject, ["mincelltemperature", "mincelltemp", "cellgrouptempmin", "celltempmin", "mincellgrouptemp"]));
            minCellTemperature = rawMinT !== null ? (rawMinT > 90 ? rawMinT / 10 : rawMinT) : null;
        }

        let maxCellTemperature = null;
        if (hasStringData) {
            const rawMaxT = pN(stringData.maxCellGroupTemp);
            maxCellTemperature = rawMaxT !== null ? (rawMaxT > 90 ? rawMaxT / 10 : rawMaxT) : null;
        } else {
            const rawMaxT = pN(tryGetField(row, normalizedObject, ["maxcelltemperature", "maxcelltemp", "cellgrouptempmax", "celltempmax", "maxcellgrouptemp"]));
            maxCellTemperature = rawMaxT !== null ? (rawMaxT > 90 ? rawMaxT / 10 : rawMaxT) : null;
        }

        let avgCellTemperature = null;
        if (hasStringData) {
            const rawAvgT = pN(stringData.avgCellGroupTemp);
            avgCellTemperature = rawAvgT !== null ? (rawAvgT > 90 ? rawAvgT / 10 : rawAvgT) : null;
        } else {
            const rawAvgT = pN(tryGetField(row, normalizedObject, ["avgcelltemperature", "avgcelltemp", "cellgrouptempavg", "avgcellgrouptemp"]));
            avgCellTemperature = rawAvgT !== null ? (rawAvgT > 90 ? rawAvgT / 10 : rawAvgT) : null;
        }

        let cellTemperatureDelta = null;
        if (maxCellTemperature !== null && minCellTemperature !== null) {
            cellTemperatureDelta = Number((maxCellTemperature - minCellTemperature).toFixed(1));
        }

        // Locate battery packs / reports
        const packList = (hasStringData && Array.isArray(row.batteryPackReportList))
            ? row.batteryPackReportList
            : (hasStringData && Array.isArray(stringData?.batteryPackReportList)
                ? stringData.batteryPackReportList
                : findBatteryPackList(row, arrayNumber, stringNumber, lcStrBase, blockStrBase, lastCallWrapper, blockWrapper));

        let balanceTelemetryAvailable = false;
        let balanceCount: number | null = null;
        let balanceMode = "--";
        let balanceModeRaw: string | null = null;
        let balanceProvidedVoltageTarget: number | null = null;
        const balanceDetails: any[] = [];

        if (packList && packList.length > 0) {
            balanceTelemetryAvailable = true;
            balanceCount = 0;
            const modesList: string[] = [];
            packList.forEach((item: any, pIdx: number) => {
                const bpcDetail = extractBpcBalancing(item, pIdx);
                balanceDetails.push({
                    bpIndex: bpcDetail.bpIndex,
                    mode: bpcDetail.mode,
                    modeRaw: bpcDetail.modeRaw,
                    providedVoltageTarget: bpcDetail.providedVoltageTarget,
                    state: bpcDetail.state,
                    stateRaw: bpcDetail.stateRaw,
                    balancingCellGroup: bpcDetail.balancingCellGroup,
                    chargeBalancingPermitted: bpcDetail.chargeBalancingPermitted,
                    dischargeBalancingPermitted: bpcDetail.dischargeBalancingPermitted,
                    chargeDeadband: bpcDetail.chargeDeadband,
                    dischargeDeadband: bpcDetail.dischargeDeadband,
                    commandTimeToLive: bpcDetail.commandTimeToLive,
                    balancingSource: bpcDetail.balancingSource
                });
                if (bpcDetail.isActive) {
                    balanceCount!++;
                }
                if (bpcDetail.mode && bpcDetail.mode !== "--") {
                    modesList.push(bpcDetail.mode);
                    if (!balanceModeRaw && bpcDetail.modeRaw) balanceModeRaw = bpcDetail.modeRaw;
                    if (!balanceProvidedVoltageTarget && bpcDetail.providedVoltageTarget) balanceProvidedVoltageTarget = bpcDetail.providedVoltageTarget;
                }
            });

            if (modesList.length > 0) {
                const uniqueModes = Array.from(new Set(modesList));
                if (uniqueModes.length === 1) {
                    balanceMode = uniqueModes[0];
                } else {
                    balanceMode = "Mixed";
                }
            } else {
                balanceMode = "--";
            }
        } else {
            // Fallback to legacy balance fields
            const legacyBalCount = pN(tryGetField(row, normalizedObject, ["balancecount", "balancingcount"]));
            const legacyBalMode = String(tryGetField(row, normalizedObject, ["balancemode", "balancingmode"]) || "");
            const balanceRaw = String(tryGetField(row, normalizedObject, ["balanceraw", "balancingraw", "balance", "balancing"]) || "");
            
            if (legacyBalCount !== null || (legacyBalMode && legacyBalMode !== "undefined" && legacyBalMode !== "") || (balanceRaw && balanceRaw !== "undefined" && balanceRaw !== "")) {
                balanceTelemetryAvailable = true;
                balanceCount = legacyBalCount ?? 0;
                if (legacyBalMode && legacyBalMode !== "undefined" && legacyBalMode !== "") {
                    balanceMode = legacyBalMode;
                } else {
                    if (balanceRaw.includes("Provided") || legacyBalMode.includes("Provided")) {
                        balanceMode = "Provided";
                    } else if (balanceRaw && balanceRaw.includes("-")) {
                        balanceMode = balanceRaw.split("-")[1]?.trim() || balanceMode;
                    }
                }
            } else {
                balanceTelemetryAvailable = false;
                balanceCount = null;
                balanceMode = "--";
            }
        }

        const container = hasStringData 
            ? String(row.enclosureIndex || "") 
            : String(tryGetField(row, normalizedObject, ["container", "enclosure"]) || "");
            
        const location = hasStringData 
            ? String(row.enclosureLocation || "") 
            : String(tryGetField(row, normalizedObject, ["location"]) || "");
        
        // Resolve Fan fields
        let fanCommandRpm: number | null = null;
        let fanSettingRpm: number | null = null;
        let fanCommandPercent: number | null = null;
        let fanSettingPercent: number | null = null;
        let fanStatusPercent: number | null = null;
        let fanRatedRpm: number = 7500;
        let fanStatusRpmValues: number[] = [];
        let fanStatusAvgRpm: number | null = null;
        let fanCount: number = 1;
        let fanState: "no-command" | "unknown" | "match" | "mismatch" = "no-command";
        let fanLastCommandTime: any = null;

        if (hasStringData) {
            const FAN_MATCH_TOLERANCE_PERCENT = 5;
            const finite = (v: any): number | null => {
              const n = Number(v);
              return Number.isFinite(n) ? n : null;
            };
            const avg = (values: any[]): number | null => {
              const nums = values.map(finite).filter((n): n is number => n !== null);
              if (!nums.length) return null;
              return nums.reduce((a, b) => a + b, 0) / nums.length;
            };
            const clampPercent = (v: number): number =>
              Math.max(0, Math.min(100, Math.round(v)));
              
            const fanReport = stringData?.stringFanReport || {};
            fanRatedRpm = finite(fanReport.fanRatedRPM) ?? 7500;
            fanCommandPercent = finite(fanReport.fanCommand);
            fanSettingPercent = finite(fanReport.fanSetting);
            fanStatusRpmValues = Array.isArray(fanReport.fanStatusRPM) ? fanReport.fanStatusRPM.map((v: any) => Number(v) || 0) : [];
            fanStatusAvgRpm = Array.isArray(fanReport.fanStatusRPM) ? avg(fanReport.fanStatusRPM) : null;
            
            fanStatusPercent =
              fanStatusAvgRpm !== null && fanRatedRpm > 0
                ? clampPercent((fanStatusAvgRpm / fanRatedRpm) * 105) // allow normal scaling alignment
                : fanSettingPercent;
            
            if (fanStatusPercent !== null) {
              fanStatusPercent = clampPercent(fanStatusPercent);
            }

            fanCount = Number(fanReport.fanCount) || 1;
            fanLastCommandTime = stringData?.lastFanCommandTime;

            const hasCommand = fanCommandPercent !== null && fanCommandPercent > 0;
            const hasStatus = fanStatusPercent !== null;
            if (!hasCommand) fanState = "no-command";
            else if (!hasStatus) fanState = "unknown";
            else if (Math.abs(fanCommandPercent - fanStatusPercent) <= FAN_MATCH_TOLERANCE_PERCENT) fanState = "match";
            else fanState = "mismatch";
        } else {
            const fanCommandCandidates = [
                row.fanCommand,
                row.stringFanReport?.fanCommand,
                blockStrBase?.fanCommand,
                blockStrBase?.stringFanReport?.fanCommand,
                lcStrBase?.fanCommand,
                lcStrBase?.stringFanReport?.fanCommand,
                row.raw?.blockviewer?.fanCommand,
                row.raw?.stringDetail?.fanCommand,
                row.raw?.stringsCsv?.fanCommand,
                row.fanRequested,
                blockStrBase?.fanRequested,
                lcStrBase?.fanRequested,
            ];
            for (const val of fanCommandCandidates) {
                if (val !== undefined && val !== null && typeof val !== 'boolean') {
                    const n = Number(val);
                    if (!isNaN(n)) {
                        fanCommandRpm = n;
                        break;
                    }
                }
            }

            const fanSettingCandidates = [
                row.fanSetting,
                row.stringFanReport?.fanSetting,
                blockStrBase?.fanSetting,
                blockStrBase?.stringFanReport?.fanSetting,
                lcStrBase?.fanSetting,
                lcStrBase?.stringFanReport?.fanSetting,
                row.raw?.blockviewer?.fanSetting,
                row.raw?.stringDetail?.fanSetting,
                row.raw?.stringsCsv?.fanSetting,
                row.fanActual,
                blockStrBase?.fanActual,
                lcStrBase?.fanActual,
            ];
            for (const val of fanSettingCandidates) {
                if (val !== undefined && val !== null && typeof val !== 'boolean') {
                    const n = Number(val);
                    if (!isNaN(n)) {
                        fanSettingRpm = n;
                        break;
                    }
                }
            }

            const lastFanCommandTimeCandidates = [
                row.lastFanCommandTime,
                row.LastFanCommandTime,
                row.raw?.stringsCsv?.LastFanCommandTime,
                blockStrBase?.lastFanCommandTime,
                lcStrBase?.lastFanCommandTime,
                blockStrBase?.stringFanReport?.lastFanCommandTime,
                lcStrBase?.stringFanReport?.lastFanCommandTime,
            ];
            for (const val of lastFanCommandTimeCandidates) {
                if (val !== undefined && val !== null) {
                    fanLastCommandTime = val;
                    break;
                }
            }

            const MAX_FAN_RPM = 7500;
            const toFanPercent = (rpm: any): number | null => {
                const n = Number(rpm);
                if (!Number.isFinite(n) || isNaN(n)) return null;
                return Math.max(0, Math.min(100, Math.round((n / MAX_FAN_RPM) * 100)));
            };

            fanCommandPercent = toFanPercent(fanCommandRpm);
            fanStatusPercent = toFanPercent(fanSettingRpm);
            fanSettingPercent = fanStatusPercent;
            fanRatedRpm = MAX_FAN_RPM;
            fanStatusRpmValues = fanSettingRpm !== null ? [fanSettingRpm] : [];
            fanStatusAvgRpm = fanSettingRpm;
            fanCount = 1;
            
            const hasCommand = fanCommandPercent !== null && fanCommandPercent > 0;
            const hasStatus = fanStatusPercent !== null;
            if (!hasCommand) fanState = "no-command";
            else if (!hasStatus) fanState = "unknown";
            else if (Math.abs(fanCommandPercent - fanStatusPercent) <= 5) fanState = "match";
            else fanState = "mismatch";
        }

        const lastFanCommand = parseBoolean(tryGetField(row, normalizedObject, ["lastfancommand"]));
        const lastFanCommandTime = tryGetField(row, normalizedObject, ["lastfancommandtime"]);
        const fanCommandRequested = lastFanCommand;
        const fanHealthy = true;

        function safeParseDate(val: any): string {
            if (!val) return new Date().toISOString();
            const ts = new Date(val);
            if (isNaN(ts.getTime())) {
                if (typeof val === 'string' && val.includes('/')) {
                    // Attempt to parse some known bad formats if needed, e.g. DD/MM/YYYY
                    const parts = val.split(/[\s/:]+/);
                    if (parts.length >= 3) {
                        const d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T${parts[3]||'00'}:${parts[4]||'00'}:${parts[5]||'00'}Z`);
                        if (!isNaN(d.getTime())) return d.toISOString();
                    }
                }
                return new Date().toISOString();
            }
            return ts.toISOString();
        }

        const timestampUtc = safeParseDate(tryGetField(row, normalizedObject, ["timestamp", "datetime"]));

        const warningCount = pN(tryGetField(row, normalizedObject, ["warningcount", "warncount", "warnings"]), 0) || 0;
        const alarmCount = pN(tryGetField(row, normalizedObject, ["alarmcount", "alarms"]), 0) || 0;
        
        gWarnCount += warningCount;
        gAlarmCount += alarmCount;
        
        let warnings: string[] = tryGetField(row, normalizedObject, ["warns", "warningslist"]) || [];
        let alarms: string[] = tryGetField(row, normalizedObject, ["alarmslist"]) || [];
        
        if (typeof warnings === "string") warnings = (warnings as string).split(",").map(v=>v.trim()).filter(Boolean);
        if (typeof alarms === "string") alarms = (alarms as string).split(",").map(v=>v.trim()).filter(Boolean);
        
        if (Array.isArray(warnings)) warnings = warnings.map(w => w.match(/^\d+$/) ? `${w} - ${describeBessStatusCode(w)}` : w);
        if (Array.isArray(alarms)) alarms = alarms.map(a => a.match(/^\d+$/) ? `${a} - ${describeBessStatusCode(a)}` : a);

        // Extract BPC data
        let bpcs: any[] = [];
        const rawSources: any = { stringsCsv: row, lastCall: lcStrBase, stringIpMap: sIpInfo, blockviewer: blockStrBase };

        let bpcSourceData: any[] = [];
        if (lcStrBase && Array.isArray(lcStrBase.packs)) bpcSourceData = lcStrBase.packs;
        else if (lcStrBase && Array.isArray(lcStrBase.bpcs)) bpcSourceData = lcStrBase.bpcs;

        const bpcFirmwares = new Set<string>();

        bpcSourceData.forEach((bpcBase: any, bpcIdx: number) => {
            const bpcNum = pN(bpcBase.index || bpcBase.bpcIndex, bpcIdx + 1) || (bpcIdx + 1);
            
            let bpcIp = null;
            // find bpc in ipMap
            const bpcIpMatch = ipMap.find(m => pN(m.array) === arrayNumber && pN(m.string) === stringNumber && pN(m.pack || m.bpc) === bpcNum);
            if (bpcIpMatch) bpcIp = bpcIpMatch.ip;

            const cgs: any[] = [];
            let bpcWarns = bpcBase.warnings || bpcBase.warningList || [];
            let bpcAlarms = bpcBase.alarms || bpcBase.alarmList || [];
            
            if (typeof bpcWarns === "string") bpcWarns = (bpcWarns as string).split(",").map(v=>v.trim()).filter(Boolean);
            if (typeof bpcAlarms === "string") bpcAlarms = (bpcAlarms as string).split(",").map(v=>v.trim()).filter(Boolean);
            if (Array.isArray(bpcWarns)) bpcWarns = bpcWarns.map(w => w.match(/^\d+$/) ? `${w} - ${describeBessStatusCode(w)}` : w);
            if (Array.isArray(bpcAlarms)) bpcAlarms = bpcAlarms.map(a => a.match(/^\d+$/) ? `${a} - ${describeBessStatusCode(a)}` : a);
            
            if (bpcBase.firmwareVersion) bpcFirmwares.add(String(bpcBase.firmwareVersion));

            let cellVolts = Array.isArray(bpcBase.cellVoltages) ? bpcBase.cellVoltages : [];
            let cellTemps = Array.isArray(bpcBase.cellTemperatures) ? bpcBase.cellTemperatures : [];
            let cellNotes = Array.isArray(bpcBase.notifications || bpcBase.cgStatus) ? (bpcBase.notifications || bpcBase.cgStatus) : [];
            let balData = Array.isArray(bpcBase.balancing) ? bpcBase.balancing : [];

            const maxCgCount = Math.max(cellVolts.length, cellTemps.length, cellNotes.length, balData.length);
            for (let cgi = 0; cgi < maxCgCount; cgi++) {
                 const cv = typeof cellVolts[cgi] === 'number' ? cellVolts[cgi] : undefined;
                 const cgT = typeof cellTemps[cgi] === 'number' ? cellTemps[cgi] : undefined;
                 const cN = typeof cellNotes[cgi] === 'string' ? cellNotes[cgi] : (typeof cellNotes[cgi] === 'object' ? cellNotes[cgi].level : undefined);
                 const cBal = typeof balData[cgi] === 'boolean' ? balData[cgi] : (typeof balData[cgi] === 'object' ? balData[cgi].active : undefined);
                 
                 cgs.push({
                     id: `A${arrayNumber}-S${stringNumber}-B${bpcNum}-C${cgi + 1}`,
                     arrayNumber, stringNumber, bpcNumber: bpcNum, cellGroupNumber: cgi + 1,
                     voltage: cv,
                     temperature: cgT,
                     notificationLevel: cN,
                     balancingActive: cBal
                 });
            }

            bpcs.push({
                id: `A${arrayNumber}-S${stringNumber}-B${bpcNum}`,
                arrayNumber, stringNumber, bpcNumber: bpcNum,
                bpcIp,
                firmwareVersion: bpcBase.firmwareVersion,
                minCellVoltage: pN(bpcBase.minCellVoltage),
                maxCellVoltage: pN(bpcBase.maxCellVoltage),
                avgCellVoltage: pN(bpcBase.avgCellVoltage),
                minCellTemperature: pN(bpcBase.minCellTemp || bpcBase.minCellTemperature),
                maxCellTemperature: pN(bpcBase.maxCellTemp || bpcBase.maxCellTemperature),
                avgCellTemperature: pN(bpcBase.avgCellTemp || bpcBase.avgCellTemperature),
                warningCount: bpcWarns.length,
                alarmCount: bpcAlarms.length,
                warnings: bpcWarns,
                alarms: bpcAlarms,
                cellGroups: cgs,
                raw: bpcBase
            });

            totalBpcs++;
            if (bpcAlarms.length > 0) alarmBpcs++;
            else if (bpcWarns.length > 0) warningBpcs++;
        });

        let bpcCount = pN(tryGetField(row, normalizedObject, ["bpccount", "packcount"]));
        if (bpcSourceData.length > 0) bpcCount = bpcSourceData.length;
        if (bpcCount !== null) knownBpcCount += bpcCount;

        let bpcFirmwareSummary = "Unknown";
        if (bpcFirmwares.size === 1) bpcFirmwareSummary = Array.from(bpcFirmwares)[0];
        else if (bpcFirmwares.size > 1) bpcFirmwareSummary = "Mixed";

        const classification = classifyStringOperationalState(row);
        let operationalState = "OFFLINE";
        if (classification.state === "online") {
            if (alarmCount > 0) operationalState = "ALARM";
            else if (warningCount > 0) operationalState = "WARNING";
            else operationalState = "NORMAL";
        } else if (classification.state === "nearline") {
            if (alarmCount > 0) operationalState = "ALARM";
            else if (warningCount > 0) operationalState = "WARNING";
            else operationalState = "NEARLINE";
        } else {
            operationalState = "OFFLINE";
        }
        
        if (operationalState === "NORMAL") normalStrings++;
        if (operationalState === "WARNING") warningStrings++;
        if (operationalState === "ALARM") alarmStrings++;
        if (operationalState === "OFFLINE") offlineStrings++;
        if (operationalState === "NEARLINE") nearlineStrings++;

         if (minCellVoltage !== null) {
             if (gMinV === null || minCellVoltage < gMinV) gMinV = minCellVoltage;
         }
         if (maxCellVoltage !== null) {
             if (gMaxV === null || maxCellVoltage > gMaxV) gMaxV = maxCellVoltage;
         }
         if (avgCellVoltage !== null) {
             gSumV += avgCellVoltage; gCountV++;
         }
         if (cellVoltageDelta !== null) {
             if (gMaxVDelta === null || cellVoltageDelta > gMaxVDelta) gMaxVDelta = cellVoltageDelta;
         }
         if (minCellTemperature !== null) {
             if (gMinT === null || minCellTemperature < gMinT) gMinT = minCellTemperature;
         }
         if (maxCellTemperature !== null) {
             if (gMaxT === null || maxCellTemperature > gMaxT) gMaxT = maxCellTemperature;
         }
         if (avgCellTemperature !== null) {
             gSumT += avgCellTemperature; gCountT++;
         }
         if (cellTemperatureDelta !== null) {
             if (gMaxTDelta === null || cellTemperatureDelta > gMaxTDelta) gMaxTDelta = cellTemperatureDelta;
         }

        const stringNumValue = pN(stringNumber);
        const energySegmentNumber = stringNumValue !== null ? Math.ceil(stringNumValue / 2) : null;
        const containerNumber = energySegmentNumber;
        const containerLabel = energySegmentNumber !== null ? `ES ${energySegmentNumber}` : "--";

        const measuredStringVoltage = measuredVoltage;
        const calculatedStringVoltage = calculatedVoltage;

        const cellVoltageMin = minCellVoltage;
        const cellVoltageMax = maxCellVoltage;
        const cellVoltageAvg = avgCellVoltage;

        const cellTempMin = minCellTemperature;
        const cellTempMax = maxCellTemperature;
        const cellTempAvg = avgCellTemperature;
        const cellTempDelta = cellTemperatureDelta;

        const computedBpcCount = finite(bpcCount) ?? (Array.isArray(bpcs) ? bpcs.length : null);

        strings.push({
            id, arrayNumber, stringNumber,
            stringKey: `A${arrayNumber}-S${stringNumber}`,
            stringControllerIp: sIpInfo?.ip || tryGetField(row, normalizedObject, ["ip", "ipaddress"]),
            stringControllerEntityKey: sIpInfo?.entityKey,
            stringControllerEntityKeyToken: sIpInfo?.entityKeyToken,
            contactorStatus,
            contactorClosed,
            contactorsCloseExpected,
            positiveContactorClosed,
            negativeContactorClosed,
            recloseCount,
            rotationStatus,
            outRotation,
            rotationEnabled,
            measuredVoltage, calculatedVoltage, busVoltage, voltageDelta,
            measuredStringVoltage, calculatedStringVoltage, preciseCalculatedStringVoltage: preciseCalculatedVoltage,
            amps, kw, socPct, ah, kwh,
            minCellVoltage, maxCellVoltage, avgCellVoltage, cellVoltageDelta,
            cellVoltageMin, cellVoltageMax, cellVoltageAvg,
            minCellTemperature, maxCellTemperature, avgCellTemperature, cellTemperatureDelta,
            cellTempMin, cellTempMax, cellTempAvg, cellTempDelta,
            balanceTelemetryAvailable,
            balanceCount,
            balanceMode,
            balanceModeRaw,
            balanceProvidedVoltageTarget,
            balanceDetails,
            fanCommandRpm,
            fanSettingRpm,
            fanCommandPercent,
            fanStatusPercent,
            fanLastCommandTime: fanLastCommandTime || lastFanCommandTime,
            container, location,
            fanCommandRequested,
            lastFanCommandTime,
            fanHealthy,
            timestampUtc,
            lastUpdatedUtc: new Date().toISOString(),
            stringControllerFirmware: sIpInfo?.firmwareVersion || tryGetField(row, normalizedObject, ["firmware", "firmwareversion"]),
            bpcCount: computedBpcCount,
            energySegmentNumber,
            containerNumber,
            containerLabel,
            bpcFirmwareSummary,
            bpcs,
            operationalState,
            warningCount, alarmCount, warnings, alarms,
            sourceCoverage: {
                stringsCsv: sourceCoverageStringsCsv,
                lastCall: !!lcStrBase,
                stringIpMap: !!sIpInfo,
                ipMap: !!ipMapWrapper.data,
                blockviewer: !!blockStrBase, // or true if used directly
                controllerStatistics: false,
                bessStatusCodes: false,
            },
            raw: rawSources
        });
    });

    if (enrich) {
        const arrayFilter = targetArray;
        const targetStrings = arrayFilter ? strings.filter(s => s.arrayNumber === arrayFilter) : strings;
        await Promise.allSettled(targetStrings.map(async (s) => {
            const svUrl = `${baseUrl}/tools/monitor/ems/stringviewer/array/${s.arrayNumber}/${s.stringNumber}/data`;
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);
                const r = await fetch(svUrl, { signal: controller.signal });
                clearTimeout(timeoutId);
                if (r.ok) {
                    const svData = await r.json();
                    if (svData && svData.stringViewerDataModel) {
                        const sv = svData.stringViewerDataModel;
                        s.busVoltage = sv.dcBusVoltage ?? s.busVoltage;
                        s.outRotation = sv.outRotation ?? s.outRotation;
                        s.positiveContactorClosed = sv.positiveContactorClosed ?? s.positiveContactorClosed;
                        s.negativeContactorClosed = sv.negativeContactorClosed ?? s.negativeContactorClosed;
                        s.contactorsCloseExpected = sv.contactorsCloseExpected ?? s.contactorsCloseExpected;
                        s.recloseCount = sv.recloseCount ?? s.recloseCount;
                        s.badReport = sv.badReport ?? s.badReport;
                        s.fanRequested = sv.lastFanCommand ?? sv.fanCommand ?? sv.requestedFanCommand ?? sv.stringFanRequested ?? s.fanRequested;
                        s.fanActual = sv.fanActual ?? sv.fanState ?? sv.fanStatus ?? sv.fanSpeed ?? sv.fanSpeedRpm ?? sv.stringFanActual ?? s.fanActual;
                        s.socPct = sv.soc ?? s.socPct;
                        s.measuredVoltage = sv.measuredStringVoltage ?? s.measuredVoltage;
                        s.calculatedVoltage = sv.calculatedStringVoltage ?? s.calculatedVoltage;
                        s.minCellVoltage = sv.minCellGroupVoltage ?? s.minCellVoltage;
                        s.maxCellVoltage = sv.maxCellGroupVoltage ?? s.maxCellVoltage;
                        s.avgCellVoltage = sv.avgCellGroupVoltage ?? s.avgCellVoltage;
                        s.minCellTemperature = sv.minCellGroupTemp ?? s.minCellTemperature;
                        s.maxCellTemperature = sv.maxCellGroupTemp ?? s.maxCellTemperature;
                        s.avgCellTemperature = sv.avgCellGroupTemp ?? s.avgCellTemperature;
                        s.amps = sv.stringCurrent ?? s.amps;
                        s.bpcCount = sv.batteryPackCount ?? s.bpcCount;
                        s.cellGroupCount = sv.cellGroupCount ?? s.cellGroupCount;
                        s.timestampUtc = sv.reportTimestamp ?? s.timestampUtc;
                        s.operationalState = sv.stringConnectionState ?? s.operationalState;
                    }
                }
            } catch(e) {}
        }));
    }

    return {
        profileId: profile?.id,
        emsBaseUrl: baseUrl,
        generatedAt: new Date().toISOString(),
        scanStartedAt: rawStringsWrapper.lastUpdated,
        scanCompletedAt: new Date().toISOString(),
        durationMs: debugInfoMap["/tools/report/ems/strings.csv"]?.durationMs || 0,
        cacheAgeMs: 0,
        sourceHealth,
        expectedStringCount: strings.length > 0 ? strings.length : 320,
        baseRowCount: strings.length,
        stringsReturned: strings.length,
        enrichedRowCount: enrich ? strings.length : 0,
        cards: {
            totalStrings: strings.length > 0 ? strings.length : 320,
            normal: normalStrings,
            offline: offlineStrings,
            nearline: nearlineStrings,
            warnings: gWarnCount,
            alarms: gAlarmCount,
            totalBpcs: totalBpcs || knownBpcCount,
            knownBpcCount,
            expectedBpcCount: (strings.length > 0 ? strings.length : 320) * 14,
            fleetAvgCellVoltage: gCountV > 0 ? Number((gSumV/gCountV).toFixed(3)) : null,
            fleetMaxCellVoltageDelta: gMaxVDelta,
            fleetAvgCellTemp: gCountT > 0 ? Number((gSumT/gCountT).toFixed(1)) : null,
            fleetMaxCellTemp: gMaxT
        },
        rollups: {
            totalStrings: strings.length > 0 ? strings.length : 320,
            normal: normalStrings,
            offline: offlineStrings,
            nearline: nearlineStrings,
            warnings: gWarnCount,
            alarms: gAlarmCount,
            totalBpcs: totalBpcs || knownBpcCount,
            knownBpcCount,
            expectedBpcCount: (strings.length > 0 ? strings.length : 320) * 14,
            fleetAvgCellVoltage: gCountV > 0 ? Number((gSumV/gCountV).toFixed(3)) : null,
            fleetMaxCellVoltageDelta: gMaxVDelta,
            fleetAvgCellTemp: gCountT > 0 ? Number((gSumT/gCountT).toFixed(1)) : null,
            fleetMaxCellTemp: gMaxT
        },
        totalStrings: strings.length,
        arrayCount: new Set(strings.map(s => s.arrayNumber)).size,
        normal: normalStrings,
        offline: offlineStrings,
        nearline: nearlineStrings,
        warnings: gWarnCount,
        alarms: gAlarmCount,
        totalBpcs: totalBpcs || knownBpcCount,
        summary: {
            totalArrays: new Set(strings.map(s => s.arrayNumber)).size,
            totalStrings,
            normalStrings, warningStrings, alarmStrings, offlineStrings, nearlineStrings,
            totalBpcs, warningBpcs, alarmBpcs,
            minCellVoltage: gMinV, maxCellVoltage: gMaxV, avgCellVoltage: gCountV > 0 ? Number((gSumV/gCountV).toFixed(3)) : null,
            maxCellVoltageDelta: gMaxVDelta,
            minCellTemperature: gMinT, maxCellTemperature: gMaxT, avgCellTemperature: gCountT > 0 ? Number((gSumT/gCountT).toFixed(1)) : null,
            maxCellTemperatureDelta: gMaxTDelta,
            latestTimestampUtc: new Date().toISOString()
        },
        arrays: [],
        strings
    };
}

router.get("/", async (req, res) => {
    try {
        if (req.query.refresh === 'true') {
            await (await import('./emsTurtleClient')).pollEmsTurtle();
        }

        const profile = ProfileStore.getActiveProfile();
        const baseUrl = profile ? `http://${profile.emsHost}:${profile.emsPort}${profile.turtlePath}` : "unknown";

        const cacheKey = `string_dashboard_${req.query.enrich === 'stringviewer' ? 'enriched' : 'base'}_${req.query.array || 'ALL'}`;
        const maxAgeMs = req.query.maxAgeMs ? parseInt(String(req.query.maxAgeMs), 10) : 5000;

        const fetcher = async () => {
            return buildNormalizedStringsData(req.query.enrich === 'stringviewer', req.query.array ? Number(req.query.array) : null);
        };
        
        const policy = prizmCache.getEffectiveCachePolicy(req.query.cache, req.query.noCache, req.query.refresh);
        const cacheEntry = await prizmCache.getOrFetch(cacheKey, fetcher, {
            ttlMs: maxAgeMs,
            sourceUrl: '/api/local/strings/dashboard',
            profileId: profile?.id,
            emsBaseUrl: baseUrl,
            forceRefresh: req.query.refresh === 'true',
            persist: true,
            policy
        });

        const wasLiveSucceeded = cacheEntry.wasFetched && cacheEntry.sourceOk;
        const wasCacheUsed = !cacheEntry.wasFetched && (!cacheEntry.error || cacheEntry.data);

        // Hysteresis / History tracking
        if (cacheEntry.data && cacheEntry.data.strings && cacheEntry.wasFetched) {
            const hMetrics: any[] = [];
            const timestampUtc = new Date().toISOString();
            const quality = (cacheEntry.isLive && cacheEntry.sourceOk) ? "live" : "stale";
            
            const pushNumeric = (base: any, metricName: string, metricValue: number | undefined | null) => {
                if (metricValue === undefined || metricValue === null || Number.isNaN(metricValue)) return;
                hMetrics.push({ ...base, metricName, metricValue, quality });
            };
            const pushText = (base: any, metricName: string, metricText: string | undefined | null) => {
                if (!metricText || metricText.trim() === "") return;
                hMetrics.push({ ...base, metricName, metricText, quality });
            };

            cacheEntry.data.strings.forEach((s:any) => {
                 const base = {
                      timestampUtc,
                      profileId: profile?.id,
                      emsBaseUrl: cacheEntry.emsBaseUrl,
                      source: "dashboard_strings_matrix",
                      entityType: "string",
                      entityKey: s.id,
                      arrayNumber: s.arrayNumber,
                      stringNumber: s.stringNumber
                 };
                 // Numeric
                 pushNumeric(base, "socPct", s.socPct);
                 pushNumeric(base, "measuredVoltage", s.measuredVoltage);
                 pushNumeric(base, "calculatedVoltage", s.calculatedVoltage);
                 pushNumeric(base, "busVoltage", s.busVoltage);
                 pushNumeric(base, "voltageDelta", s.voltageDelta);
                 pushNumeric(base, "amps", s.amps);
                 pushNumeric(base, "kw", s.kw);
                 pushNumeric(base, "kwh", s.kwh);
                 pushNumeric(base, "minCellVoltage", s.minCellVoltage);
                 pushNumeric(base, "avgCellVoltage", s.avgCellVoltage);
                 pushNumeric(base, "maxCellVoltage", s.maxCellVoltage);
                 pushNumeric(base, "cellVoltageDelta", s.cellVoltageDelta);
                 pushNumeric(base, "minCellTemperature", s.minCellTemperature);
                 pushNumeric(base, "avgCellTemperature", s.avgCellTemperature);
                 pushNumeric(base, "maxCellTemperature", s.maxCellTemperature);
                 pushNumeric(base, "cellTemperatureDelta", s.cellTemperatureDelta);
                 pushNumeric(base, "warningCount", s.warningCount);
                 pushNumeric(base, "alarmCount", s.alarmCount);
                 pushNumeric(base, "recloseCount", s.recloseCount);
                 // Text
                 pushText(base, "operationalState", s.operationalState);
                 pushText(base, "rotationStatus", s.rotationStatus);
                 pushText(base, "contactorStatus", s.contactorStatus);
                 pushText(base, "fanStatus", s.fanStatus);
            });
            prizmHistory.appendSamples(hMetrics);
        }

        cacheEntry.dataClass = "live-telemetry";
        const meta = prizmCache.getActiveSiteMetadata();
        const activeIdentity = { activeProfileId: profile?.id, emsBaseUrl: baseUrl, stationCode: meta.stationCode, blockIndex: meta.blockIndex };
        const refreshRequested = req.query.refresh === 'true';
        const liveAttempted = prizmCache.shouldFetchLive(policy) || refreshRequested;
        const cacheMetadata = prizmCache.buildCacheMetadata(
            policy,
            Boolean(wasCacheUsed),
            Boolean(liveAttempted),
            Boolean(wasLiveSucceeded),
            cacheEntry,
            activeIdentity,
            "live-ems"
        );

        const outputData = policy === "live-only" && !wasLiveSucceeded ? {} : cacheEntry.data;

        res.json({ 
            ...outputData, 
            ...cacheMetadata,
            cache: {
                key: cacheEntry.key,
                fetchedAt: cacheEntry.fetchedAt,
                updatedAt: cacheEntry.updatedAt,
                ageMs: cacheEntry.ageMs,
                ttlMs: cacheEntry.ttlMs,
                sourceOk: cacheEntry.sourceOk,
                isLive: cacheEntry.isLive,
                isStale: cacheEntry.isStale,
                wasFetched: cacheEntry.wasFetched,
                error: cacheEntry.error,
                profileId: cacheEntry.profileId,
                emsBaseUrl: cacheEntry.emsBaseUrl
            },
            cacheAgeMs: cacheEntry.ageMs, 
            isCached: !cacheEntry.isLive || cacheEntry.isStale, 
            sourceOk: cacheEntry.sourceOk,
            isLive: cacheEntry.isLive,
            isStale: cacheEntry.isStale
        });

    } catch (e: any) {
        res.status(500).json({ error: e.message || "Failed to process strings dashboard" });
    }
});

router.get("/:arrayNumber/:stringNumber/detail/raw", async (req, res) => {
    try {
        const arrayNumber = Number(req.params.arrayNumber);
        const stringNumber = Number(req.params.stringNumber);
        const profile = ProfileStore.getActiveProfile();
        
        if (!profile) return res.status(400).json({ error: "No active profile" });
        const baseUrl = `http://${profile.emsHost}:${profile.emsPort}${profile.turtlePath}`;

        console.time(`String Detail Parse ${arrayNumber}-${stringNumber}`);
        const stringViewerUrl = `${baseUrl}/tools/monitor/ems/stringviewer/array/${arrayNumber}/${stringNumber}/data`;
        
        let ok = false;
        let httpStatus = null;
        let data: any = null;
        let error = null;
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const r = await fetch(stringViewerUrl, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            httpStatus = r.status;
            ok = r.ok;
            
            if (r.ok) {
                data = await r.json();
            } else {
                error = `HTTP ${r.status}`;
            }
        } catch(e: any) {
            error = e.message;
        }

        const topLevelKeys = data ? Object.keys(data) : [];
        const modelKeys = data?.stringViewerDataModel ? Object.keys(data.stringViewerDataModel) : [];
        
        const balanceRelatedPaths: Array<{path: string, value: any}> = [];
        const notificationRelatedPaths: Array<{path: string, value: any}> = [];
        const rawBalanceCandidates: Array<{path: string, value: any}> = [];
        const rawNotificationCandidates: Array<{path: string, value: any}> = [];

        const scanPaths = (obj: any, currentPath: string = "", depth: number = 0) => {
            if (!obj || typeof obj !== 'object' || depth > 8) return;
            for (const key of Object.keys(obj)) {
                const lower = key.toLowerCase();
                const v = obj[key];
                const fullPath = currentPath ? `${currentPath}.${key}` : key;
                
                const inBalancingMap = fullPath.toLowerCase().includes("balanc");
                let isBalanceRelated = inBalancingMap || ['provided', 'target'].some(k => lower.includes(k));
                
                // If it looks like cellGroup or mode related but is just inside batteryPacks, we include if it indicates balancing
                if (!isBalanceRelated) {
                    if (['cellgroup', 'cgindex', 'cg', 'mode', 'state'].some(k => lower.includes(k))) {
                        isBalanceRelated = true;
                    }
                }
                
                // Exclude ordinary cellGroupIndex/cellgroup unless inside a balancing structure
                if (isBalanceRelated && !inBalancingMap) {
                    const pathLower = fullPath.toLowerCase();
                    
                    // Strictly exclude ordinary cell groups from voltage/temperature/bpc lists if they don't say balance
                    if (!pathLower.includes("balanc") && (pathLower.includes("cellgroup") || pathLower.includes("cgindex") || pathLower.includes("cg"))) {
                         isBalanceRelated = false;
                    }
                }
                
                const isNotificationRelated = ['notification', 'warn', 'alarm', 'event', 'status', 'code', 'message', '2534', '2561'].some(k => lower.includes(k));
                
                const strValue = typeof v === 'object' ? JSON.stringify(v).substring(0, 150) : String(v);
                
                const valLower = typeof v === 'string' ? v.toLowerCase() : '';
                let valIsBalanceRelated = typeof v === 'string' && ['balanc', 'provided', 'target', 'mode', 'state'].some(k => valLower.includes(k));
                if (!valIsBalanceRelated && typeof v === 'string' && ['cellgroup', 'cgindex', 'cg'].some(k => valLower.includes(k))) {
                     valIsBalanceRelated = true;
                }
                
                if (valIsBalanceRelated && !inBalancingMap) {
                    const pathLower = fullPath.toLowerCase();
                    if (!pathLower.includes("balanc") && (pathLower.includes("cellgroup") || pathLower.includes("cgindex") || pathLower.includes("cg"))) {
                        valIsBalanceRelated = false;
                    }
                }

                const valIsNotificationRelated = typeof v === 'string' && ['notification', 'warn', 'alarm', 'event', 'status', 'code', 'message', '2534', '2561'].some(k => valLower.includes(k));
                const valIsSpecificCode = typeof v === 'number' && (v === 2534 || v === 2561);

                if ((isBalanceRelated || valIsBalanceRelated) && typeof v !== 'object') {
                    balanceRelatedPaths.push({ path: fullPath, value: strValue });
                    rawBalanceCandidates.push({ path: fullPath, value: v });
                }
                if ((isNotificationRelated || valIsNotificationRelated || valIsSpecificCode) && typeof v !== 'object') {
                    notificationRelatedPaths.push({ path: fullPath, value: strValue });
                    rawNotificationCandidates.push({ path: fullPath, value: v });
                }
                
                if (typeof v === 'object' && v !== null) {
                    scanPaths(v, fullPath, depth + 1);
                }
            }
        };

        if (data) scanPaths(data);

        res.json({
            sourceUrl: stringViewerUrl,
            httpStatus,
            ok,
            error,
            topLevelKeys,
            modelKeys,
            hasBalancingMap: data?.stringViewerDataModel?.hasBalancingMap ?? false,
            balancingMapType: data?.stringViewerDataModel?.balancingMap ? typeof data.stringViewerDataModel.balancingMap : "undefined",
            balancingMapKeys: data?.stringViewerDataModel?.balancingMap
              ? Object.keys(data.stringViewerDataModel.balancingMap)
              : [],
            balancingMapPreview: data?.stringViewerDataModel?.balancingMap ?? null,
            balanceRelatedPaths,
            notificationRelatedPaths,
            rawBalanceCandidates,
            rawNotificationCandidates,
            rawPreview: data ? Object.keys(data).reduce((acc: any, k) => {
                acc[k] = typeof data[k] === 'object' ? '{...}' : data[k];
                return acc;
            }, {}) : null
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get("/:arrayNumber/:stringNumber/detail", async (req, res) => {
    const startedAt = Date.now();
    const includePerf = req.query.includePerf === "true";
    try {
        const arrayNumber = Number(req.params.arrayNumber);
        const stringNumber = Number(req.params.stringNumber);
        const profile = ProfileStore.getActiveProfile();
        
        if (!profile) return res.status(400).json({ error: "No active profile" });
        const baseUrl = `http://${profile.emsHost}:${profile.emsPort}${profile.turtlePath}`;

        const cacheKey = `string_detail_${arrayNumber}_${stringNumber}`;
        const maxAgeMs = req.query.maxAgeMs ? parseInt(String(req.query.maxAgeMs), 10) : 5000;

        const fetcher = async () => {

        const stringViewerUrl = `${baseUrl}/tools/monitor/ems/stringviewer/array/${arrayNumber}/${stringNumber}/data`;
        const startTime = Date.now();
        let stringViewerSourceHealth: any = {
            ok: false,
            url: stringViewerUrl,
            httpStatus: null,
            durationMs: null,
            error: null
        };

        let stringViewerData: any = null;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const r = await fetch(stringViewerUrl, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            stringViewerSourceHealth.httpStatus = r.status;
            stringViewerSourceHealth.ok = r.ok;
            
            if (r.ok) {
                stringViewerData = await r.json();
            } else {
                stringViewerSourceHealth.error = `HTTP ${r.status}`;
            }
        } catch(e: any) {
            stringViewerSourceHealth.error = e.message;
        } finally {
            stringViewerSourceHealth.durationMs = Date.now() - startTime;
        }

        let lcBaseData = null;
        const lastCallWrapper = getEmsCachedLastCall();
        if (lastCallWrapper.data) {
             let lcS = null;
             if (Array.isArray(lastCallWrapper.data.strings)) {
                 lcS = lastCallWrapper.data.strings.find((s:any) => (s.array === arrayNumber || s.arrayIndex === arrayNumber) && (s.string === stringNumber || s.stringIndex === stringNumber));
             }
             if (!lcS && Array.isArray(lastCallWrapper.data.arrays)) {
                 const lcA = lastCallWrapper.data.arrays.find((a:any) => a.index === arrayNumber || a.arrayIndex === arrayNumber);
                 if (lcA && Array.isArray(lcA.strings)) {
                     lcS = lcA.strings.find((s:any) => s.index === stringNumber || s.stringIndex === stringNumber);
                 }
             }
             if (lcS) lcBaseData = lcS;
        }

        let voltageMatrix: number[][] = [];
        let temperatureMatrix: number[][] = [];
        let notificationMatrix: any[][] = [];
        let balancingDetails: any[] = [];
        let notifications: any[] = [];
        let eventLogs: any[] = [];
        const balancingDebugKeys: string[] = [];
        const notificationDebugKeys: string[] = [];

        const extractDebugKeys = (obj: any, currentPath: string = "") => {
            if (!obj || typeof obj !== 'object') return;
            for (const key of Object.keys(obj)) {
                const lower = key.toLowerCase();
                const isBal = lower.includes("balanc") || lower.includes("provided") || lower.includes("target");
                const isNotif = ['notification', 'warn', 'alarm', 'event', 'status', 'code', 'message'].some(k => lower.includes(k));
                
                if (isBal) {
                    balancingDebugKeys.push(`${currentPath}.${key}: ${typeof obj[key] === 'object' ? 'object' : obj[key]}`);
                }
                if (isNotif) {
                    notificationDebugKeys.push(`${currentPath}.${key}: ${typeof obj[key] === 'object' ? 'object' : obj[key]}`);
                }
                // Recurse at limited depth
                if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
                    if (currentPath.split('.').length < 4) {
                        extractDebugKeys(obj[key], `${currentPath}.${key}`);
                    }
                } else if (Array.isArray(obj[key]) && typeof obj[key][0] === 'object') {
                    if (currentPath.split('.').length < 4) {
                        extractDebugKeys(obj[key][0], `${currentPath}.${key}[0]`);
                    }
                }
            }
        };

        let bpcs: any[] = [];
        let summary: any = {};
        
        // Helper for lastCall fallback notifications
        const handleFallbackNotif = (defaultLevel: string, w: string, source: string) => {
            const match = String(w).match(/^(\d+)(?:\s+(.+))?$/);
            if (match) {
                const code = match[1];
                const msgPart = match[2];
                let msg = msgPart || describeBessStatusCode(code) || `Code ${code}`;
                const displayLevel = classifyBessStatusCode(code) || defaultLevel;
                notifications.push({ level: displayLevel, code, message: msg, displayText: `${code} - ${msg}`, source });
            } else {
                notifications.push({ level: defaultLevel, code: null, message: w, displayText: String(w), source });
            }
        };

        if (stringViewerData && stringViewerData.stringViewerDataModel) {
            extractDebugKeys(stringViewerData.stringViewerDataModel, "sv");
            const sv = stringViewerData.stringViewerDataModel;
            summary = {
                arrayNumber: sv.arrayIndex || arrayNumber,
                stringNumber: sv.stringIndex || stringNumber,
                bpcCount: sv.batteryPackCount,
                cellGroupCount: sv.cellGroupCount,
                socPct: sv.soc,
                soc: sv.soc,
                busVoltage: sv.dcBusVoltage,
                rotationStatus: sv.outRotation ? "OUT" : "IN",
                positiveContactorClosed: sv.positiveContactorClosed,
                negativeContactorClosed: sv.negativeContactorClosed,
                calculatedVoltage: sv.calculatedStringVoltage,
                measuredVoltage: sv.measuredStringVoltage,
                amps: sv.stringCurrent,
                contactorsCloseExpected: sv.contactorsCloseExpected,
                recloseCount: sv.recloseCount,
                maxCellTemperature: sv.maxCellGroupTemp,
                minCellTemperature: sv.minCellGroupTemp,
                avgCellTemperature: sv.avgCellGroupTemp,
                maxCellVoltage: sv.maxCellGroupVoltage,
                minCellVoltage: sv.minCellGroupVoltage,
                avgCellVoltage: sv.avgCellGroupVoltage,
                operationalState: sv.stringConnectionState,
                preciseCalculatedVoltage: sv.preciseCalculatedStringVoltage,
                ctCurrent1: sv.ctCurrent1,
                ctCurrent2: sv.ctCurrent2,
                badReport: sv.badReport,
                timestampUtc: sv.reportTimestamp,
                cellVoltageDelta: (sv.maxCellGroupVoltage !== undefined && sv.minCellGroupVoltage !== undefined) ? Number((sv.maxCellGroupVoltage - sv.minCellGroupVoltage).toFixed(3)) : undefined,
                cellTemperatureDelta: (sv.maxCellGroupTemp !== undefined && sv.minCellGroupTemp !== undefined) ? Number((sv.maxCellGroupTemp - sv.minCellGroupTemp).toFixed(1)) : undefined,
                voltageDelta: (sv.measuredStringVoltage !== undefined && sv.calculatedStringVoltage !== undefined) ? Number(Math.abs(sv.measuredStringVoltage - sv.calculatedStringVoltage).toFixed(2)) : undefined,
            };

            const vm = sv.voltageMap?.batteryPacks || {};
            const tm = sv.temperatureMap?.batteryPacks || {};

            // --- Normalize Balancing Details ---
            const parseBalMode = (modeRaw: any): string | null => {
                if (!modeRaw) return null;
                return String(modeRaw);
            };
            const parseTargetVoltage = (modeRaw: any, targetRaw: any): number | null => {
                if (targetRaw !== undefined && targetRaw !== null && targetRaw !== "") return Number(targetRaw);
                if (typeof modeRaw === 'string' && modeRaw.includes('Provided (')) {
                    const match = modeRaw.match(/Provided\s+\((\d+)\)/);
                    if (match) return Number(match[1]);
                }
                return null;
            };

            const bmSources = [
                sv.balanceMap?.batteryPacks,
                sv.balancingMap?.batteryPacks,
                sv.balancing?.batteryPacks,
                sv.balance?.batteryPacks,
                sv.batteryPacks, // sometimes embedded here
                sv.batteryPackBalance,
                sv.voltageMap?.batteryPacks,
                sv.temperatureMap?.batteryPacks,
                sv.balanceModeMap,
                sv.balancingCgIndexMap,
                sv.balanceTargetVoltageMap
            ].filter(Boolean);

            const bpcSeen = new Set<number>();

            // --- Confirm Primary Turtle balancingMap Parser ---
            if (sv && sv.hasBalancingMap === true && sv.balancingMap && sv.balancingMap.batteryPacks) {
                const bPacks = sv.balancingMap.batteryPacks;
                Object.keys(bPacks).forEach(key => {
                    const bpcN = Number(key);
                    if (isNaN(bpcN)) return;
                    
                    const batteryPackObject = bPacks[key];
                    if (!batteryPackObject) return;
                    
                    const batteryPack = batteryPackObject.batteryPack || {};
                    const packVal = batteryPack.value;
                    const packColor = batteryPack.color;
                    const cellGroups = batteryPackObject.cellGroups || {};
                    
                    let balancingCellGroupIndex: number | null = null;
                    let targetVoltage: number | null = null;
                    let color = packColor;
                    
                    const match = packVal ? String(packVal).match(/CG\s*(\d+)\s*->\s*(\d+(?:\.\d+)?)/i) : null;
                    if (match && packColor !== "#FFFFFF" && packVal !== "---") {
                        balancingCellGroupIndex = Number(match[1]);
                        targetVoltage = Number(match[2]);
                        const cg = cellGroups[String(balancingCellGroupIndex)];
                        if (cg && cg.color) {
                            color = cg.color;
                        }
                    } else {
                        // Fallback: check cell groups
                        const cgKeys = Object.keys(cellGroups);
                        for (const cgKey of cgKeys) {
                            const cg = cellGroups[cgKey];
                            if (cg && cg.value && cg.value !== "---" && cg.color && cg.color !== "#FFFFFF") {
                                balancingCellGroupIndex = Number(cg.cellGroupIndex || cgKey);
                                targetVoltage = Number(cg.value);
                                color = cg.color;
                                break;
                            }
                        }
                    }
                    
                    if (balancingCellGroupIndex === null || targetVoltage === null) return;
                    
                    let state: "Charging" | "Discharging" | "Active" | "Inactive" = "Active";
                    const c = String(color || "").toUpperCase();
                    if (c === "#AED6F1") {
                        state = "Charging";
                    } else if (c === "#F9E79F") {
                        state = "Discharging";
                    } else if (c === "#FFFFFF") {
                        state = "Inactive";
                    }
                    
                    if (state === "Inactive") return;
                    
                    balancingDetails.push({
                        arrayNumber,
                        stringNumber,
                        bpcNumber: bpcN,
                        mode: "Provided",
                        displayMode: `Provided (${targetVoltage})`,
                        state,
                        balancingActive: true,
                        balancingCellGroupIndex,
                        targetCellGroup: balancingCellGroupIndex,
                        targetVoltage,
                        sourcePath: `stringViewerDataModel.balancingMap.batteryPacks.${bpcN}`,
                        raw: batteryPackObject
                    });
                    
                    bpcSeen.add(bpcN);
                });
            }
            for (const source of bmSources) {
                if (Array.isArray(source)) {
                    source.forEach((item: any, i: number) => {
                        const bpcN = item.bpcNumber || item.bpIndex || item.batteryPackIndex || item.packIndex || item.index || (i + 1);
                        if (!bpcSeen.has(bpcN)) {
                            const rawMode = item.mode || item.balanceMode || item.balancingMode || item.providedMode;
                            const state = item.state || item.balanceState || item.balancingState || (item.active !== undefined ? String(item.active) : undefined) || (item.balancingActive !== undefined ? String(item.balancingActive) : undefined);
                            const tcg = item.balancingCellGroupIndex || item.balancingCgIndex || item.balancingCGIndex || item.activeCellGroup || item.targetCellGroup || item.targetCg || item.cgIndex;
                            const tv = parseTargetVoltage(rawMode, item.targetVoltage || item.providedBalanceVoltage || item.targetCellVoltage || item.balanceVoltage);
                            if (rawMode !== undefined || state !== undefined || tcg !== undefined || tv !== null) {
                                const m = parseBalMode(rawMode);
                                const dm = m && m.toLowerCase().includes('provided') && tv !== null ? `Provided (${tv})` : (m || "--");
                                balancingDetails.push({ bpcNumber: bpcN, mode: m, displayMode: dm, state: state, balancingCellGroupIndex: tcg, targetVoltage: tv, raw: item });
                                bpcSeen.add(bpcN);
                            }
                        }
                    });
                } else if (typeof source === 'object') {
                    Object.keys(source).forEach(key => {
                        const bpcN = Number(key);
                        const item = source[key];
                        if (!isNaN(bpcN) && !bpcSeen.has(bpcN)) {
                            const rawMode = item.mode || item.balanceMode || item.balancingMode || item.providedMode;
                            const state = item.state || item.balanceState || item.balancingState || (item.active !== undefined ? String(item.active) : undefined) || (item.balancingActive !== undefined ? String(item.balancingActive) : undefined);
                            const tcg = item.balancingCellGroupIndex || item.balancingCgIndex || item.balancingCGIndex || item.activeCellGroup || item.targetCellGroup || item.targetCg || item.cgIndex;
                            const tv = parseTargetVoltage(rawMode, item.targetVoltage || item.providedBalanceVoltage || item.targetCellVoltage || item.balanceVoltage);
                            if (rawMode !== undefined || state !== undefined || tcg !== undefined || tv !== null) {
                                const m = parseBalMode(rawMode);
                                const dm = m && m.toLowerCase().includes('provided') && tv !== null ? `Provided (${tv})` : (m || "--");
                                balancingDetails.push({ bpcNumber: bpcN, mode: m, displayMode: dm, state: state, balancingCellGroupIndex: tcg, targetVoltage: tv, raw: item });
                                bpcSeen.add(bpcN);
                            }
                        }
                    });
                }
            }

            // --- Normalize Notifications ---
            const codeToMsgMap = { ...(getEmsCachedStatusCodes().data as Record<string, string>), ...BESS_STATUS_CODE_MAP };
            const parseNotif = (level: string, item: any, src: string) => {
                if (typeof item === 'string') {
                    // Try to parse "2534 Contactor Open Warning"
                    const match = item.match(/^(\d+)(?:\s+(.+))?$/);
                    if (match) {
                        const code = match[1];
                        const msgPart = match[2];
                        let msg = msgPart || codeToMsgMap[code] || describeBessStatusCode(code);
                        if (!msg) msg = `Code ${code}`;
                        const displayLevel = classifyBessStatusCode(code) || level || 'INFO';
                        notifications.push({ level: displayLevel, code, message: msg, displayText: `${code} - ${msg}`, source: src });
                    } else {
                        notifications.push({ level, code: null, message: item, displayText: item, source: src });
                    }
                } else if (typeof item === 'object') {
                    const codeRaw = item.code || item.status || item.messageCode;
                    const code = codeRaw ? String(codeRaw) : null;
                    let msg = item.message || item.text || item.description || (code ? codeToMsgMap[code] : null) || describeBessStatusCode(code);
                    if (!msg && code) msg = `Code ${code}`;
                    if (code || msg) {
                        const displayLevel = code ? (classifyBessStatusCode(code) || item.level || level) : (item.level || level);
                        notifications.push({
                            level: displayLevel,
                            code,
                            message: msg,
                            displayText: code && msg && msg !== `Code ${code}` && !msg.startsWith(code) ? `${code} - ${msg}` : (msg || code),
                            timestamp: item.timestamp || item.time || item.created,
                            trigger: item.trigger || item.triggerValue,
                            source: src,
                            raw: item
                        });
                    }
                }
            };

            const notifLists = [
                { data: sv.notifications, source: "stringviewer.notifications" },
                { data: sv.notificationList, source: "stringviewer.notificationList" },
                { data: sv.activeNotifications, source: "stringviewer.activeNotifications" },
                { data: sv.warningList, source: "stringviewer.warningList", lev: "WARNING" },
                { data: sv.warnings, source: "stringviewer.warnings", lev: "WARNING" },
                { data: sv.alarms, source: "stringviewer.alarms", lev: "ALARM" },
                { data: sv.stringWarnings, source: "stringviewer.stringWarnings", lev: "WARNING" },
                { data: sv.stringAlarms, source: "stringviewer.stringAlarms", lev: "ALARM" }
            ];

            notifLists.forEach(nl => {
                if (Array.isArray(nl.data)) {
                    nl.data.forEach(n => parseNotif(nl.lev || "WARNING", n, nl.source));
                } else if (nl.data && typeof nl.data === 'object') {
                    Object.keys(nl.data).forEach(k => parseNotif(nl.lev || "WARNING", nl.data[k], `${nl.source}.${k}`));
                }
            });
            
            const bpKeys = Object.keys(vm).map(Number).sort((a,b) => a-b);
            bpKeys.forEach(bpIdx => {
                const cgsV = vm[String(bpIdx)]?.cellGroups || {};
                const cgsT = tm[String(bpIdx)]?.cellGroups || {};
                const cgKeys = Object.keys(cgsV).map(Number).sort((a,b) => a-b);
                const vRow = cgKeys.map(cg => Number(cgsV[String(cg)]?.value));
                const tRow = cgKeys.map(cg => Number(cgsT[String(cg)]?.value));
                voltageMatrix.push(vRow);
                temperatureMatrix.push(tRow);
                
                let minV: number | null = null;
                let maxV: number | null = null;
                let sumV = 0, countV = 0;
                let minT: number | null = null;
                let maxT: number | null = null;
                let sumT = 0, countT = 0;
                
                const cellGroups = cgKeys.map(cg => {
                    const v = Number(cgsV[String(cg)]?.value);
                    const t = Number(cgsT[String(cg)]?.value);
                    if (!isNaN(v)) {
                         if (minV === null || v < minV) minV = v;
                         if (maxV === null || v > maxV) maxV = v;
                         sumV += v; countV++;
                    }
                    if (!isNaN(t)) {
                         if (minT === null || t < minT) minT = t;
                         if (maxT === null || t > maxT) maxT = t;
                         sumT += t; countT++;
                    }
                    return {
                        arrayNumber,
                        stringNumber,
                        bpcNumber: bpIdx,
                        cellGroupNumber: cg,
                        voltage: v,
                        temperature: t,
                        voltageColor: cgsV[String(cg)]?.color,
                        temperatureColor: cgsT[String(cg)]?.color,
                        voltageColorIndex: cgsV[String(cg)]?.colorIndex,
                        temperatureColorIndex: cgsT[String(cg)]?.colorIndex,
                        rawVoltage: cgsV[String(cg)]?.value,
                        rawTemperature: cgsT[String(cg)]?.value
                    };
                });
                
                bpcs.push({
                    arrayNumber,
                    stringNumber,
                    bpcNumber: bpIdx,
                    cellGroups,
                    minCellVoltage: minV,
                    maxCellVoltage: maxV,
                    avgCellVoltage: countV > 0 ? Number((sumV / countV).toFixed(3)) : null,
                    cellVoltageDelta: (maxV !== null && minV !== null) ? Number((maxV - minV).toFixed(3)) : null,
                    minCellTemperature: minT,
                    maxCellTemperature: maxT,
                    avgCellTemperature: countT > 0 ? Number((sumT / countT).toFixed(1)) : null,
                    cellTemperatureDelta: (maxT !== null && minT !== null) ? Number((maxT - minT).toFixed(1)) : null,
                });
            });
        } else if (lcBaseData) {
            let bpcsData = lcBaseData.packs || lcBaseData.bpcs || lcBaseData.batteryPacks || [];
            if (!Array.isArray(bpcsData)) bpcsData = [];
            
            bpcsData.sort((a,b) => (a.index || a.bpcIndex || 0) - (b.index || b.bpcIndex || 0));
            
            bpcsData.forEach((bpc: any) => {
                const cv = Array.isArray(bpc.cellVoltages) ? bpc.cellVoltages : [];
                voltageMatrix.push(cv);
                
                const ct = Array.isArray(bpc.cellTemperatures) ? bpc.cellTemperatures : [];
                temperatureMatrix.push(ct);
                
                const cn = Array.isArray(bpc.notifications || bpc.cgStatus) ? (bpc.notifications || bpc.cgStatus) : [];
                notificationMatrix.push(cn);
                
                const bpcIdx = bpc.index || bpc.bpcIndex;
                const cellGroups = [];
                const maxLen = Math.max(cv.length, ct.length);
                for (let i = 0; i < maxLen; i++) {
                    cellGroups.push({
                        arrayNumber,
                        stringNumber,
                        bpcNumber: bpcIdx,
                        cellGroupNumber: i + 1,
                        voltage: cv[i],
                        temperature: ct[i]
                    });
                }
                
                bpcs.push({
                    arrayNumber,
                    stringNumber,
                    bpcNumber: bpcIdx,
                    cellGroups,
                    minCellVoltage: bpc.minCellVoltage,
                    maxCellVoltage: bpc.maxCellVoltage,
                    avgCellVoltage: bpc.avgCellVoltage,
                    minCellTemperature: bpc.minCellTemp || bpc.minCellTemperature,
                    maxCellTemperature: bpc.maxCellTemp || bpc.maxCellTemperature,
                    avgCellTemperature: bpc.avgCellTemp || bpc.avgCellTemperature,
                });
                
                if (bpc.balancing || bpc.balancingMode || bpc.balancingState) {
                    balancingDetails.push({
                        bpcNumber: bpcIdx,
                        mode: bpc.balancingMode,
                        state: bpc.balancingState,
                        balancingCellGroupIndex: undefined,
                        targetVoltage: undefined,
                        raw: bpc
                    });
                }
                
                const handleFallbackNotif = (defaultLevel: string, w: string, source: string) => {
                    const match = String(w).match(/^(\d+)(?:\s+(.+))?$/);
                    if (match) {
                        const code = match[1];
                        const msgPart = match[2];
                        let msg = msgPart || describeBessStatusCode(code) || `Code ${code}`;
                        const displayLevel = classifyBessStatusCode(code) || defaultLevel;
                        notifications.push({ level: displayLevel, code, message: msg, displayText: `${code} - ${msg}`, source });
                    } else {
                        notifications.push({ level: defaultLevel, code: null, message: w, displayText: String(w), source });
                    }
                };

                if (bpc.warnings && Array.isArray(bpc.warnings) && bpc.warnings.length > 0) {
                     bpc.warnings.forEach(w => handleFallbackNotif("WARNING", w, `BPC ${bpcIdx}`));
                } else if (bpc.warningList && Array.isArray(bpc.warningList) && bpc.warningList.length > 0) {
                     bpc.warningList.forEach(w => handleFallbackNotif("WARNING", w, `BPC ${bpcIdx}`));
                }
                if (bpc.alarms && Array.isArray(bpc.alarms) && bpc.alarms.length > 0) {
                     bpc.alarms.forEach(a => handleFallbackNotif("ALARM", a, `BPC ${bpcIdx}`));
                } else if (bpc.alarmList && Array.isArray(bpc.alarmList) && bpc.alarmList.length > 0) {
                     bpc.alarmList.forEach(a => handleFallbackNotif("ALARM", a, `BPC ${bpcIdx}`));
                }
            });
            
            if (lcBaseData.warnings && Array.isArray(lcBaseData.warnings) && lcBaseData.warnings.length > 0) {
                lcBaseData.warnings.forEach(w => handleFallbackNotif("WARNING", w, `lastCall String`));
            }
            if (lcBaseData.alarms && Array.isArray(lcBaseData.alarms) && lcBaseData.alarms.length > 0) {
                lcBaseData.alarms.forEach(a => handleFallbackNotif("ALARM", a, `lastCall String`));
            }
        }

        // Check fallback from main strings dashboard cache
        if (balancingDetails.length === 0 || notifications.length === 0) {
            const cachedDash = prizmCache.get<any>('string_dashboard_base_ALL');
            if (cachedDash && cachedDash.data && Array.isArray(cachedDash.data.strings)) {
                const mainRow = cachedDash.data.strings.find((s: any) => s.arrayNumber === arrayNumber && s.stringNumber === stringNumber);
                if (mainRow) {
                    if (balancingDetails.length === 0 && (mainRow.balanceMode || mainRow.balanceRaw)) {
                        // Create a faux balancing detail if we know there is balancing
                        balancingDetails.push({
                            bpcNumber: null,
                            mode: mainRow.balanceMode || mainRow.balanceRaw,
                            state: null,
                            balancingCellGroupIndex: null,
                            targetVoltage: null,
                            raw: mainRow.raw || {}
                        });
                    }
                    if (notifications.length === 0) {
                        const handleRefNotif = (defaultLevel: string, w: string, source: string) => {
                            const match = String(w).match(/^(\d+)(?:\s+(.+))?$/);
                            if (match) {
                                const code = match[1];
                                const msgPart = match[2];
                                let msg = msgPart || describeBessStatusCode(code) || `Code ${code}`;
                                const displayLevel = classifyBessStatusCode(code) || defaultLevel;
                                notifications.push({ level: displayLevel, code, message: msg, displayText: `${code} - ${msg}`, source });
                            } else {
                                notifications.push({ level: defaultLevel, code: null, message: w, displayText: String(w), source });
                            }
                        };
                        
                        if (Array.isArray(mainRow.warnings) && mainRow.warnings.length > 0) {
                            mainRow.warnings.forEach((w: string) => {
                                handleRefNotif("WARNING", w, "strings_dashboard");
                            });
                        }
                        if (Array.isArray(mainRow.alarms) && mainRow.alarms.length > 0) {
                            mainRow.alarms.forEach((a: string) => {
                                handleRefNotif("ALARM", a, "strings_dashboard");
                            });
                        }
                    }
                }
            }
        }

        console.timeEnd(`String Detail Parse ${arrayNumber}-${stringNumber}`);
        return {
            profileId: profile.id,
            emsBaseUrl: baseUrl,
            stationCode: "BHE",
            blockIndex: 1,
            arrayNumber,
            stringNumber,
            sourceHealth: { stringviewer: stringViewerSourceHealth },
            summary,
            bpcs,
            voltageMatrix,
            temperatureMatrix,
            notificationMatrix,
            balancingDetails,
            notifications,
            eventLogs,
            sourceViewerUsed: !!stringViewerData,
            hasBalancingMap: !!(stringViewerData?.stringViewerDataModel?.hasBalancingMap),
            balancingDebugKeys,
            notificationDebugKeys
        };
        }; // end fetcher function

        const policy = prizmCache.getEffectiveCachePolicy(req.query.cache, req.query.noCache, req.query.refresh);
        const cacheEntry = await prizmCache.getOrFetch(cacheKey, fetcher, {
            ttlMs: maxAgeMs,
            sourceUrl: `/api/local/strings/dashboard/${arrayNumber}/${stringNumber}/detail`,
            profileId: profile.id,
            emsBaseUrl: baseUrl,
            forceRefresh: req.query.refresh === 'true',
            persist: true,
            policy
        });

        const wasLiveSucceeded = cacheEntry.wasFetched && cacheEntry.sourceOk;
        const wasCacheUsed = !cacheEntry.wasFetched && (!cacheEntry.error || cacheEntry.data);

        // Hysteresis / History tracking
        const captureHistoryRequested = req.query.captureHistory === "true";
        if (cacheEntry.data && cacheEntry.data.bpcs && captureHistoryRequested && cacheEntry.wasFetched) {
             const hMetrics: any[] = [];
             const timestampUtc = new Date().toISOString();
             cacheEntry.data.bpcs.forEach((b:any, i:number) => {
                  let maxV = 0, minV = 9999;
                  if (b.cellGroups && b.cellGroups.length > 0) {
                      b.cellGroups.forEach((cg:any) => {
                          if (cg.voltage > maxV) maxV = cg.voltage;
                          if (cg.voltage < minV && cg.voltage > 0) minV = cg.voltage;
                      });
                  }
                  hMetrics.push({
                      timestampUtc,
                      profileId: profile?.id,
                      source: "string_detail_bpcs",
                      entityType: "bpc",
                      entityKey: `BPC_${cacheEntry.data.arrayNumber}_${cacheEntry.data.stringNumber}_${b.bpcNumber ?? (i+1)}`,
                      metricName: "maxVoltage",
                      metricValue: maxV,
                      quality: cacheEntry.isLive ? "live" : "cached",
                      arrayNumber: cacheEntry.data.arrayNumber,
                      stringNumber: cacheEntry.data.stringNumber,
                      bpcNumber: b.bpcNumber ?? (i+1)
                  });
             });
             prizmHistory.appendSamples(hMetrics);
        }

        cacheEntry.dataClass = "live-telemetry";
        const meta = prizmCache.getActiveSiteMetadata();
        const activeIdentity = { activeProfileId: profile?.id, emsBaseUrl: baseUrl, stationCode: meta.stationCode, blockIndex: meta.blockIndex };
        const refreshRequested = req.query.refresh === 'true';
        const liveAttempted = prizmCache.shouldFetchLive(policy) || refreshRequested;
        const cacheMetadata = prizmCache.buildCacheMetadata(
            policy,
            Boolean(wasCacheUsed),
            Boolean(liveAttempted),
            Boolean(wasLiveSucceeded),
            cacheEntry,
            activeIdentity,
            "live-ems"
        );

        const outputData = policy === "live-only" && !wasLiveSucceeded ? {} : cacheEntry.data;

        const responsePayload: any = {
            ...outputData, 
            ...cacheMetadata,
            cache: {
                key: cacheEntry.key,
                fetchedAt: cacheEntry.fetchedAt,
                updatedAt: cacheEntry.updatedAt,
                ageMs: cacheEntry.ageMs,
                ttlMs: cacheEntry.ttlMs,
                sourceOk: cacheEntry.sourceOk,
                isLive: cacheEntry.isLive,
                isStale: cacheEntry.isStale,
                wasFetched: cacheEntry.wasFetched,
                error: cacheEntry.error,
                profileId: cacheEntry.profileId,
                emsBaseUrl: cacheEntry.emsBaseUrl
            },
            cacheAgeMs: cacheEntry.ageMs, 
            isCached: !cacheEntry.isLive || cacheEntry.isStale, 
            sourceOk: cacheEntry.sourceOk,
            isLive: cacheEntry.isLive,
            isStale: cacheEntry.isStale
        };
        if (includePerf) {
            responsePayload.perf = {
                durationMs: Date.now() - startedAt,
                cacheHit: Boolean(wasCacheUsed),
                liveAttempted: Boolean(liveAttempted),
                source: (outputData as any)?.sourceUrl || "cache"
            };
        }
        res.json(responsePayload);
    } catch(err) {
        res.status(500).json({ error: (err as any).message });
    }
});

export default router;
