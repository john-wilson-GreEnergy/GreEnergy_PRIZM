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

router.get("/dump", (req, res) => {
    res.json({
        rawStrings: getEmsCachedRawStrings(),
        debug: getEmsSourcesDebugInfo()
    });
});

router.get("/", async (req, res) => {
    try {
        if (req.query.refresh === 'true') {
            await (await import('./emsTurtleClient')).pollEmsTurtle();
        }

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
            let conn = tryGetField(row, normalizedObject, ["connectionstate", "contact", "communicating"]);
            if (conn === undefined && blockStrBase) conn = blockStrBase.communicating;
            if (conn === undefined && lcStrBase) {
                 conn = lcStrBase.communicating ?? lcStrBase.connectionState;
            }
            
            let isOnline: boolean | null = null;
            if (conn === true || conn === "true" || conn === "Online" || conn === "ONLINE") isOnline = true;
            else if (conn === false || conn === "false" || conn === "Offline" || conn === "OFFLINE") isOnline = false;
            
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

            let operationalState = "UNKNOWN";
            if (isOnline === false) operationalState = "OFFLINE";
            else if (alarmCount > 0) operationalState = "ALARM";
            else if (warningCount > 0) operationalState = "WARNING";
            else if (isOnline === true) operationalState = "NORMAL";

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

        if (req.query.enrich === 'stringviewer') {
            const arrayFilter = req.query.array ? Number(req.query.array) : null;
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

        res.json({
            profileId: profile?.id,
            emsBaseUrl: baseUrl,
            generatedAt: new Date().toISOString(),
            scanStartedAt: rawStringsWrapper.lastUpdated,
            scanCompletedAt: new Date().toISOString(),
            durationMs: debugInfoMap["/tools/report/ems/strings.csv"]?.durationMs || 0,
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

        let bpcs: any[] = [];
        let summary: any = {};
        
        if (stringViewerData && stringViewerData.stringViewerDataModel) {
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
                        index: bpcIdx,
                        mode: bpc.balancingMode,
                        state: bpc.balancingState,
                        balancingActive: bpc.balancingActive || bpc.balancing,
                        targetCellGroup: undefined
                    });
                }
                
                if (bpc.warnings && Array.isArray(bpc.warnings) && bpc.warnings.length > 0) {
                     bpc.warnings.forEach(w => notifications.push({ level: "WARNING", message: w, source: `BPC ${bpcIdx}` }));
                } else if (bpc.warningList && Array.isArray(bpc.warningList) && bpc.warningList.length > 0) {
                     bpc.warningList.forEach(w => notifications.push({ level: "WARNING", message: w, source: `BPC ${bpcIdx}` }));
                }
                if (bpc.alarms && Array.isArray(bpc.alarms) && bpc.alarms.length > 0) {
                     bpc.alarms.forEach(a => notifications.push({ level: "ALARM", message: a, source: `BPC ${bpcIdx}` }));
                } else if (bpc.alarmList && Array.isArray(bpc.alarmList) && bpc.alarmList.length > 0) {
                     bpc.alarmList.forEach(a => notifications.push({ level: "ALARM", message: a, source: `BPC ${bpcIdx}` }));
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
            sourceViewerUsed: !!stringViewerData
        });
    } catch(err) {
        res.status(500).json({ error: (err as any).message });
    }
});

export default router;
