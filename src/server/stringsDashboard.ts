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

const router = Router();

function pN(val: any, def: number | null = null): number | null {
  if (val === undefined || val === null || val === "") return def;
  const n = Number(val);
  return isNaN(n) ? def : n;
}

function normalizeHeader(h: string): string {
    return h.toLowerCase().replace(/[\s_\-\.]/g, "");
}

function tryGetField(row: any, normalizedObject: Record<string, any>, possibleNames: string[]): any {
    for (const n of possibleNames) {
        if (row[n] !== undefined) return row[n];
        const norm = normalizeHeader(n);
        if (normalizedObject[norm] !== undefined) return normalizedObject[norm];
    }
    return undefined;
}

router.get("/", (req, res) => {
    try {
        const rawStringsWrapper = getEmsCachedRawStrings();
        const blockWrapper = getEmsCachedBlock();
        const stringIpMapWrapper = getEmsStringIpMap();
        const ipMapWrapper = getEmsIpMap();
        const lastCallWrapper = getEmsCachedLastCall();
        const statusWrapper = getEmsCachedStatus();
        const controllerStatsWrapper = getEmsCachedControllerStatistics();
        const bessStatusCodesWrapper = getEmsCachedStatusCodes();
        const debugInfo = getEmsSourcesDebugInfo() || {};
        
        const profile = ProfileStore.getActiveProfile();
        const baseUrl = profile ? `http://${profile.emsHost}:${profile.emsPort}${profile.turtlePath}` : "unknown";

        // Source coverage
        const getSourceHealth = (key: string) => {
            const rawKey = key;
            const health = (debugInfo as any)[rawKey] || { success: false, statusCode: null, durationMs: null, lastError: null };
            return {
                ok: !!health.success,
                httpStatus: health.statusCode,
                durationMs: health.durationMs,
                error: health.lastError,
                url: `${baseUrl}${health.endpoint || ''}`
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
        let totalBpcs = 0;
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

        stringsData.forEach(row => {
            const normalizedObject: Record<string, any> = {};
            for (const [k, v] of Object.entries(row)) {
                normalizedObject[normalizeHeader(k)] = v;
            }

            const arrayNumber = pN(tryGetField(row, normalizedObject, ["array", "arrayindex", "arr"]));
            const stringNumber = pN(tryGetField(row, normalizedObject, ["string", "stringindex", "str"]));
            
            if (arrayNumber === null || stringNumber === null) return;
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
            let conn = tryGetField(row, normalizedObject, ["connectionstate", "contact", "communicating"]);
            if (conn === undefined && blockStrBase) conn = blockStrBase.communicating;
            
            let isOnline = false;
            if (conn === true || conn === "true" || conn === "Online") isOnline = true;
            else if (conn === false || conn === "false" || conn === "Offline") isOnline = false;
            
            const contactorClosed = Boolean(tryGetField(row, normalizedObject, ["positivecontactorclosed", "contactorclosed", "contactor_state"]) ?? isOnline);
            
            const rot = tryGetField(row, normalizedObject, ["rotation", "outrotation", "out_rotation"]);
            const rotationStatus = String(rot || "IN");

            const measuredVoltage = pN(tryGetField(row, normalizedObject, ["voltagemeasured", "voltagemeas", "voltage_measured"]));
            const calculatedVoltage = pN(tryGetField(row, normalizedObject, ["voltagecalculated", "voltagecalc", "voltage_calculated"]));
            const busVoltage = pN(tryGetField(row, normalizedObject, ["voltagedcbus", "voltagebus", "voltage_bus"]));
            let voltageDelta = pN(tryGetField(row, normalizedObject, ["voltagedelta", "voltage_delta"]));
            if (voltageDelta === null && measuredVoltage !== null && calculatedVoltage !== null) {
                voltageDelta = Number(Math.abs(measuredVoltage - calculatedVoltage).toFixed(2));
            }

            const amps = pN(tryGetField(row, normalizedObject, ["current", "stringcurrent", "string_current"]));
            const kw = pN(tryGetField(row, normalizedObject, ["kw", "powerkw", "measuredkw", "power_kw"]));
            const socPct = pN(tryGetField(row, normalizedObject, ["soc", "powersoc"]));
            const ah = pN(tryGetField(row, normalizedObject, ["ah", "capacityah"]));
            const kwh = pN(tryGetField(row, normalizedObject, ["kwh", "powerkwh"]));

            const minCellVoltage = pN(tryGetField(row, normalizedObject, ["cellgroupvoltagemin", "cellvoltsmin", "mincellvoltage"]));
            const maxCellVoltage = pN(tryGetField(row, normalizedObject, ["cellgroupvoltagemax", "cellvoltsmax", "maxcellvoltage"]));
            const avgCellVoltage = pN(tryGetField(row, normalizedObject, ["cellgroupvoltageavg", "avgcellvoltage"]));
            let cellVoltageDelta = pN(tryGetField(row, normalizedObject, ["cellvoltagedelta", "celldelta"]));
            if (cellVoltageDelta === null && maxCellVoltage !== null && minCellVoltage !== null) {
                cellVoltageDelta = Number((maxCellVoltage - minCellVoltage).toFixed(3));
            }

            const minCellTemperature = pN(tryGetField(row, normalizedObject, ["cellgrouptempmin", "celltempmin", "mincelltemp", "mincelltemperature"]));
            const maxCellTemperature = pN(tryGetField(row, normalizedObject, ["cellgrouptempmax", "celltempmax", "maxcelltemp", "maxcelltemperature"]));
            const avgCellTemperature = pN(tryGetField(row, normalizedObject, ["cellgrouptempavg", "avgcelltemp", "avgcelltemperature"]));
            let cellTemperatureDelta = pN(tryGetField(row, normalizedObject, ["celltempdelta"]));
            if (cellTemperatureDelta === null && maxCellTemperature !== null && minCellTemperature !== null) {
                cellTemperatureDelta = Number((maxCellTemperature - minCellTemperature).toFixed(1));
            }

            const balanceCount = pN(tryGetField(row, normalizedObject, ["balancecount", "balancingcount"]));
            const balanceMode = String(tryGetField(row, normalizedObject, ["balancemode", "balancingmode"]) || "");
            const container = String(tryGetField(row, normalizedObject, ["container", "enclosure"]) || "");
            const location = String(tryGetField(row, normalizedObject, ["location"]) || "");
            const fanStatus = String(tryGetField(row, normalizedObject, ["lastfancommand", "fanstatus"]) || "");

            const timestampUtc = tryGetField(row, normalizedObject, ["timestamp", "datetime"]) || new Date().toISOString();

            const warningCount = pN(tryGetField(row, normalizedObject, ["warningcount", "warnings"]), 0) || 0;
            const alarmCount = pN(tryGetField(row, normalizedObject, ["alarmcount", "alarms"]), 0) || 0;
            
            let warnings: string[] = tryGetField(row, normalizedObject, ["warningslist"]) || [];
            let alarms: string[] = tryGetField(row, normalizedObject, ["alarmslist"]) || [];
            
            if (typeof warnings === "string") warnings = (warnings as string).split(",");
            if (typeof alarms === "string") alarms = (alarms as string).split(",");

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

            let bpcFirmwareSummary = "Unknown";
            if (bpcFirmwares.size === 1) bpcFirmwareSummary = Array.from(bpcFirmwares)[0];
            else if (bpcFirmwares.size > 1) bpcFirmwareSummary = "Mixed";

            let operationalState = "NORMAL";
            if (!isOnline) operationalState = "OFFLINE";
            else if (alarmCount > 0) operationalState = "ALARM";
            else if (warningCount > 0) operationalState = "WARNING";

             if (operationalState === "NORMAL") normalStrings++;
             if (operationalState === "WARNING") warningStrings++;
             if (operationalState === "ALARM") alarmStrings++;
             if (operationalState === "OFFLINE") offlineStrings++;

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

            strings.push({
                id, arrayNumber, stringNumber,
                stringKey: `A${arrayNumber}-S${stringNumber}`,
                stringControllerIp: sIpInfo?.ip || tryGetField(row, normalizedObject, ["ip", "ipaddress"]),
                stringControllerEntityKey: sIpInfo?.entityKey,
                stringControllerEntityKeyToken: sIpInfo?.entityKeyToken,
                contactorStatus: contactorClosed ? "CLOSED" : "OPEN",
                contactorClosed,
                rotationStatus,
                rotationEnabled: rotationStatus !== "OUT",
                measuredVoltage, calculatedVoltage, busVoltage, voltageDelta,
                amps, kw, socPct, ah, kwh,
                minCellVoltage, maxCellVoltage, avgCellVoltage, cellVoltageDelta,
                minCellTemperature, maxCellTemperature, avgCellTemperature, cellTemperatureDelta,
                balanceCount, balanceMode,
                container, location,
                fanStatus, fanHealthy: fanStatus !== "FAULT",
                timestampUtc,
                lastUpdatedUtc: new Date().toISOString(),
                stringControllerFirmware: sIpInfo?.firmwareVersion || tryGetField(row, normalizedObject, ["firmware", "firmwareversion"]),
                bpcCount: bpcs.length,
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

        res.json({
            profileId: profile?.id,
            emsBaseUrl: baseUrl,
            generatedAt: new Date().toISOString(),
            scanStartedAt: rawStringsWrapper.lastUpdated,
            scanCompletedAt: new Date().toISOString(),
            durationMs: debugInfo["/tools/report/ems/strings.csv"]?.durationMs || 0,
            cacheAgeMs: 0,
            sourceHealth,
            summary: {
                totalArrays: new Set(strings.map(s => s.arrayNumber)).size,
                totalStrings,
                normalStrings, warningStrings, alarmStrings, offlineStrings,
                totalBpcs, warningBpcs, alarmBpcs,
                minCellVoltage: gMinV, maxCellVoltage: gMaxV, avgCellVoltage: gCountV > 0 ? Number((gSumV/gCountV).toFixed(3)) : null,
                maxCellVoltageDelta: gMaxVDelta,
                minCellTemperature: gMinT, maxCellTemperature: gMaxT, avgCellTemperature: gCountT > 0 ? Number((gSumT/gCountT).toFixed(1)) : null,
                maxCellTemperatureDelta: gMaxTDelta,
                latestTimestampUtc: new Date().toISOString()
            },
            arrays: [], // Could aggregate array level logic here if needed
            strings
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message || "Failed to process strings dashboard" });
    }
});

router.get("/:arrayNumber/:stringNumber/detail", async (req, res) => {
    try {
        const arrayNumber = Number(req.params.arrayNumber);
        const stringNumber = Number(req.params.stringNumber);
        const profile = ProfileStore.getActiveProfile();
        
        if (!profile) return res.status(400).json({ error: "No active profile" });
        const baseUrl = `http://${profile.emsHost}:${profile.emsPort}${profile.turtlePath}`;

        let stringViewerData: any = null;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const r = await fetch(`${baseUrl}/tools/monitor/ems/stringviewer/array/${arrayNumber}/string/${stringNumber}/data`, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (r.ok) {
                stringViewerData = await r.json();
            }
        } catch(e) {}

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

        if (stringViewerData && stringViewerData.stringViewerDataModel) {
            const sv = stringViewerData.stringViewerDataModel;
            const vm = sv.voltageMap?.batteryPacks || {};
            const tm = sv.temperatureMap?.batteryPacks || {};
            
            const bpKeys = Object.keys(vm).map(Number).sort((a,b) => a-b);
            bpKeys.forEach(bpIdx => {
                const cgsV = vm[String(bpIdx)]?.cellGroups || {};
                const cgsT = tm[String(bpIdx)]?.cellGroups || {};
                
                const cgKeys = Object.keys(cgsV).map(Number).sort((a,b) => a-b);
                const vRow = cgKeys.map(cg => cgsV[String(cg)]?.value);
                const tRow = cgKeys.map(cg => cgsT[String(cg)]?.value);
                voltageMatrix.push(vRow);
                temperatureMatrix.push(tRow);
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
                
                if (bpc.balancing || bpc.balancingMode || bpc.balancingState) {
                    balancingDetails.push({
                        index: bpc.index || bpc.bpcIndex,
                        mode: bpc.balancingMode,
                        state: bpc.balancingState,
                        balancingActive: bpc.balancingActive || bpc.balancing,
                        targetCellGroup: undefined
                    });
                }
                
                if (bpc.warnings && Array.isArray(bpc.warnings) && bpc.warnings.length > 0) {
                     bpc.warnings.forEach(w => notifications.push({ level: "WARNING", message: w, source: `BPC ${bpc.index || bpc.bpcIndex}` }));
                } else if (bpc.warningList && Array.isArray(bpc.warningList) && bpc.warningList.length > 0) {
                     bpc.warningList.forEach(w => notifications.push({ level: "WARNING", message: w, source: `BPC ${bpc.index || bpc.bpcIndex}` }));
                }
                if (bpc.alarms && Array.isArray(bpc.alarms) && bpc.alarms.length > 0) {
                     bpc.alarms.forEach(a => notifications.push({ level: "ALARM", message: a, source: `BPC ${bpc.index || bpc.bpcIndex}` }));
                } else if (bpc.alarmList && Array.isArray(bpc.alarmList) && bpc.alarmList.length > 0) {
                     bpc.alarmList.forEach(a => notifications.push({ level: "ALARM", message: a, source: `BPC ${bpc.index || bpc.bpcIndex}` }));
                }
            });
            
            if (lcBaseData.warnings && Array.isArray(lcBaseData.warnings) && lcBaseData.warnings.length > 0) {
                lcBaseData.warnings.forEach(w => notifications.push({ level: "WARNING", message: w, source: `String` }));
            }
            if (lcBaseData.alarms && Array.isArray(lcBaseData.alarms) && lcBaseData.alarms.length > 0) {
                lcBaseData.alarms.forEach(a => notifications.push({ level: "ALARM", message: a, source: `String` }));
            }
        }

        res.json({
            arrayNumber,
            stringNumber,
            voltageMatrix,
            temperatureMatrix,
            notificationMatrix,
            balancingDetails,
            notifications,
            eventLogs,
            sourceViewerUsed: !!stringViewerData
        });
    } catch(err) {
        res.status(500).json({ error: (err as any).message });
    }
});

export default router;
