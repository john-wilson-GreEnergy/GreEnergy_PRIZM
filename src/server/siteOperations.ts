import { Router } from "express";
import { 
    getEmsCachedBlock, 
    getEmsCachedStatus, 
    getEmsCachedLastCall, 
    getEmsCachedRawStrings, 
    
    getEmsCachedStatusCodes,
    getEmsConnectionStatus, 
    getEmsSourcesDebugInfo 
} from "./emsTurtleClient";
import { getFeatherCache } from "./feather/featherClient";

const router = Router();

// generic deep finder
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

export function buildStringBucketSummary(stringsData: any[]) {
    const buckets = {
        online: 0,
        nearline: 0,
        offline: 0,
        notCommunicating: 0
    };
    
    let totalStrings = 0;

    const tableRows = stringsData.map(st => {
        totalStrings++;
        const communicating = 
            st.communicating === true || 
            st.Comms === true || 
            st.communication === true || 
            st.connectionState === "Online" || 
            st.connectionState === "ONLINE" || 
            st.StringConnectionState === "Online" || 
            st.LossOfComms === false || 
            st.lossOfComms === false;
            
        const rawNotComm = 
            st.communicating === false || 
            st.LossOfComms === true || 
            st.lossOfComms === true || 
            st.connectionState === "Offline" || 
            st.connectionState === "OFFLINE";
            
        const isComm = communicating || !rawNotComm; // Default to communicating if not explicitly offline and missing true flags
        const notComm = rawNotComm || !isComm;

        const inRot = 
            st.inRotation === true || 
            st.rotationEnabled === true || 
            st.outRotation === false || 
            st.OutRotation === false || 
            st.out_rotation === false || 
            st.rotation === "in" || 
            st.outOfRotation === false;

        const rawOutRot = 
            st.outRotation === true || 
            st.out_rotation === true || 
            st.OutRotation === true || 
            st.rotationEnabled === false || 
            st.outOfRotation === true ||
            st.rotation === "fault";

        const isInRot = inRot || !rawOutRot; // Default to in rotation if absent

        const contClosed = 
            st.contactorClosed === true || 
            st.contactorStatus === "CLOSED" || 
            st.contactorsClosed === true || 
            (st.positiveContactorClosed === true && st.negativeContactorClosed === true) || 
            (st.positive_contactor_closed === true && st.negative_contactor_closed === true);

        let bucket = "offline";
        if (notComm) {
            bucket = "notCommunicating";
        } else if (!isInRot) {
            bucket = "offline";
        } else if (!contClosed) {
            bucket = "nearline";
        } else {
            bucket = "online";
        }
        
        (buckets as any)[bucket]++;
        
        return {
            ...st,
            bucket,
            communicating: isComm,
            inRotation: isInRot,
            contactorsClosed: contClosed
        };
    });
    
    return { 
        buckets, 
        tableRows,
        rollups: { totalStrings } 
    };
}


function buildStatusCodeDescriptionMap(raw: any): Record<string, string> {
    const defaultMap: Record<string, string> = {
        "1004": "CellGroup Low Voltage Alarm",
        "2024": "BPC Disconnect Warning",
        "2073": "CellGroup Discharge Balancer Warning",
        "2074": "CellGroup Charge Balancer Warning",
        "2534": "Contactors Open Warning",
        "2561": "String OOR Warning"
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

function getFeatherCellTemp(f: any): number | null {
    const rt = f.rawResponse?.thermalData || f.rawResponse || {};
    const t = f.cellTemp ?? f.avgCellTemperature ?? f.avgCellTemp ?? rt.cellTemp ?? rt.avgCellTemperature;
    return t !== undefined && t !== null ? Number(t) : null;
}

function extractCodes(value: any): string[] {
    const codes: string[] = [];
    if (!value) return codes;
    if (Array.isArray(value)) {
        for (const v of value) {
            if (typeof v === 'object' && v.code) codes.push(String(v.code));
            else codes.push(String(v));
        }
    } else if (typeof value === 'string') {
        codes.push(...value.split(',').map(s => s.trim()).filter(Boolean));
    } else if (typeof value === 'object' && value.code) {
        codes.push(String(value.code));
    }
    return codes;
}

router.get("/summary", (req, res) => {
    try {
        const block = getEmsCachedBlock().data || {};
        const status = getEmsCachedStatus().data || {};
        const lastCall = getEmsCachedLastCall().data || {};
        const stringsData = getEmsCachedRawStrings().data || [];
        const conn = getEmsConnectionStatus();
        
        const arrays = block.arrays || status.arrays || lastCall.arrays || [];

        // Part C - SITE CODE
        let siteCodeSource = "Unknown";
        let stationCode = "UNKNOWN";
        if (conn.discoveredStationCode) {
            stationCode = conn.discoveredStationCode;
            siteCodeSource = conn.siteCodeSource || "Connection Context";
        } else {
             stationCode = conn.stationCode || "UNKNOWN";
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

        // Part D - EMS APPS Normalization
        let appsCandidates = [
            ...(block.dragonApps || []),
            ...(status.dragonApps || []),
            ...(lastCall.dragonApps || [])
        ];
        if (!appsCandidates.length) appsCandidates.push(...findArraysByObjectKeys(block, ["appCode", "appName"]));
        if (!appsCandidates.length) appsCandidates.push(...findArraysByObjectKeys(status, ["appCode", "appName"]));
        
        const emsApps = appsCandidates.filter((v,i,a) => a.findIndex(t => t.appCode === v.appCode) === i).map((app: any) => {
            const appName = app.appName || app.applicationName || app.application || app.name || app.appCode;
            let st = "Unknown";
            if (app.enabled === true) st = "Enabled";
            if (app.enabled === false) st = "Not Enabled";
            if (app.health === "HEALTH_HEALTHY" && app.enabled !== false) st = "Enabled";
            if (app.health === "HEALTH_NOT_ENABLED") st = "Not Enabled";
            if (app.health === "HEALTH_FAULT") st = "Faulted";
            if (app.health === "HEALTH_WARNING") st = "Warning";
            
            return {
               priority: app.priority ?? null,
               appCode: app.appCode,
               appName,
               configName: app.configName ?? null,
               enabled: app.enabled ?? null,
               status: st,
               healthRaw: app.health ?? null,
               shortAppStatus: app.shortAppStatus ?? null,
               appStatus: app.appStatus ?? null,
               sourcePath: app.sourcePath || "discovered",
               raw: app
            };
        });

        // Part E - FEATHER/HVAC
        const fCache = getFeatherCache();
        const fDevices = fCache.devices || [];
        
        // Count accurately based on devices array. If !fCache.success or stale, keep the real counts but mark stale
        let fOnline = 0, fOffline = 0, fLostComms = 0, fFssInv = 0, fDoorsInv = 0, fHvacInv = 0, fWarn = 0, fFault = 0;
        let maxH = 0, maxST = -999, maxCT = -999;
        const devicesWithIssues: any[] = [];

        fDevices.forEach((f: any) => {
            if (f.reachable || f.online || f.sourceOk) fOnline++; else fOffline++;
            if (hasLostComms(f)) fLostComms++;
            if (f.fssValid === false || f.thermalData?.fssSignals?.valid === false) fFssInv++;
            if (f.doorsValid === false || f.doors?.valid === false) fDoorsInv++;
            if (f.mioValid === false || f.hvacDataValid === false || f.hvacValid === false) fHvacInv++;
            fWarn += (f.warningCount || f.warningMessages?.length || f.warnInfo?.length || f.activeWarningInterlocks?.length || 0);
            fFault += (f.alarmCount || f.faultMessages?.length || f.activeTripFaultLog?.length || f.activeAlarms?.length || 0);
            if ((f.hydrogen1PPM ?? f.thermalData?.hydrogen1PPM) && (f.hydrogen1PPM ?? f.thermalData?.hydrogen1PPM) > maxH) maxH = (f.hydrogen1PPM ?? f.thermalData?.hydrogen1PPM);
            const st = getFeatherSpaceTemp(f) ?? -999;
            if (st && st > maxST) maxST = st;
            const ct = getFeatherCellTemp(f) ?? -999;
            if (ct && ct > maxCT) maxCT = ct;
            
            if (!f.reachable || hasLostComms(f) || f.fssValid === false || f.thermalData?.fssSignals?.valid === false || f.doorsValid === false || f.doors?.valid === false || (f.warningCount > 0) || (f.alarmCount > 0)) {
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
        const pcsSummary = pcsCnds.map((p: any) => {
             return {
                 arrayIndex: p.arrayIndex ?? p.arrayNumber ?? null,
                 pcsIndex: p.pcsIndex ?? p.index ?? null,
                 dcVoltage: numOrNull(p.dcVoltage ?? p.dcVolt ?? p.dcV ?? p.dc_volt),
                 dcCurrent: numOrNull(p.dcCurrent ?? p.dcCurr ?? p.dcA ?? p.dc_current),
                 acVoltage: numOrNull(p.acVoltage ?? p.acVolt ?? p.acV ?? p.ac_voltage),
                 acCurrent: numOrNull(p.acCurrent ?? p.acCurr ?? p.acA ?? p.ac_current),
                 acRealPowerKw: numOrNull(p.acRealPowerKw ?? p.acRealPower ?? p.realPowerKw ?? p.kw ?? p.kW),
                 acReactivePowerKvar: numOrNull(p.acReactivePowerKvar ?? p.acReactPower ?? p.reactivePowerKvar ?? p.kvar ?? p.kVAr),
                 frequencyHz: numOrNull(p.frequencyHz ?? p.freq ?? p.hz),
                 rotation: p.rotation ?? p.rotationStatus ?? null,
                 sourcePath: p.sourcePath || "discovered",
                 raw: p
             };
        }).filter((v:any,i:any,a:any) => a.findIndex((t: any) =>(t.arrayIndex === v.arrayIndex && t.pcsIndex === v.pcsIndex && v.arrayIndex != null))===i);


        // Part H - Arrays
        let arrCands = arrays.length ? arrays : findArraysByObjectKeys(block, ["arrayIndex", "onlineSOC", "communicating"]);
        if (!arrCands.length) arrCands = findArraysByObjectKeys(status, ["arrayIndex", "onlineSOC", "communicating"]);
        
        let arraySummary = arrCands.map((a: any) => ({
             arrayIndex: a.arrayIndex ?? a.arrayNumber ?? null,
             communicating: a.communicating ?? null,
             onlineSOC: a.onlineSOC ?? null,
             nearlineSOC: a.nearlineSOC ?? null,
             offlineSOC: a.offlineSOC ?? null,
             onlineAvailableKWh: a.onlineAvailableKWh ?? null,
             nearlineAvailableKWh: a.nearlineAvailableKWh ?? null,
             offlineAvailableKWh: a.offlineAvailableKWh ?? null,
             availableACChargekW: a.availableACChargekW ?? null,
             availableACDischargekW: a.availableACDischargekW ?? null,
             commandedkW: a.commandedkW ?? null,
             measuredkW: a.measuredkW ?? null,
             maxAllowedChargeCurrent: a.maxAllowedChargeCurrent ?? null,
             maxAllowedDischargeCurrent: a.maxAllowedDischargeCurrent ?? null,
             notCommunicatingStackCount: a.notCommunicatingStackCount ?? null,
             communicatingStackCount: a.communicatingStackCount ?? null,
             friendlyString: a.friendlyString || `Array ${a.arrayIndex ?? 'Unknown'}`,
             sourcePath: a.sourcePath || "discovered",
             raw: a
        }));

        // Part I - Strings
        const stringSummary = buildStringBucketSummary(stringsData);

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
        fDevices.forEach((f: any) => {
             if (f.warningCount > 0 && f.activeWarnings) {
                 f.activeWarnings.forEach((aw: string) => {
                     const key = `feather_warn_${aw}`;
                     if (!groupMap.has(key)) groupMap.set(key, { id: key, severity: 'WARNING', source: 'Feather/HVAC', code: aw, message: `Feather ${aw}`, displayText: aw, occurrenceCount: 0, affectedEnclosureCount: 0, occurrences: [] });
                     groupMap.get(key).occurrences.push({ deviceIp: f.deviceIp, enclosureLabel: f.entityName || "Unknown", sourcePath: "featherSummary" });
                 });
             }
             if (f.alarmCount > 0 && f.activeAlarms) {
                 f.activeAlarms.forEach((aa: string) => {
                     const key = `feather_alarm_${aa}`;
                     if (!groupMap.has(key)) groupMap.set(key, { id: key, severity: 'ALARM', source: 'Feather/HVAC', code: aa, message: `Feather ${aa}`, displayText: aa, occurrenceCount: 0, affectedEnclosureCount: 0, occurrences: [] });
                     groupMap.get(key).occurrences.push({ deviceIp: f.deviceIp, enclosureLabel: f.entityName || "Unknown", sourcePath: "featherSummary" });
                 });
             }
        });
        
        
        stringsData.forEach((st: any) => {
             const alarms = extractCodes(st.alarmCodes || st.alarms || st.alarmsList);
             const warnings = extractCodes(st.warningCodes || st.warnCodes || st.warnings || st.warns || st.warningsList);
             
             
             const arrayNumber = st.arrayNumber ?? st.arrayIndex ?? st.array ?? st.Array ?? null;
             const stringNumber = st.stringNumber ?? st.stringIndex ?? st.string ?? st.String ?? null;
             const enclosureLabel = arrayNumber != null && stringNumber != null
               ? 'Array ' + arrayNumber + ' ES' + stringNumber
               : "Unknown String";
               
             if (warnings.length === 0 && Number(st.warningCount || st.warnCount || 0) > 0) {
                 const key = 'string_warn_generic_count';
                 if (!groupMap.has(key)) groupMap.set(key, { id: key, severity: 'WARNING', source: 'String Controller', code: null, message: 'String warnings present - codes unavailable', displayText: 'String warnings present - codes unavailable', occurrenceCount: 0, affectedEnclosureCount: 0, occurrences: [] });
                 groupMap.get(key).occurrences.push({ arrayNumber, stringNumber, bpcNumber: st.bpcNumber, enclosureLabel, sourcePath: "stringsCsv" });
             }
             if (alarms.length === 0 && Number(st.alarmCount || st.alarmsCount || 0) > 0) {
                 const key = 'string_alarm_generic_count';
                 if (!groupMap.has(key)) groupMap.set(key, { id: key, severity: 'ALARM', source: 'String Controller', code: null, message: 'String alarms present - codes unavailable', displayText: 'String alarms present - codes unavailable', occurrenceCount: 0, affectedEnclosureCount: 0, occurrences: [] });
                 groupMap.get(key).occurrences.push({ arrayNumber, stringNumber, bpcNumber: st.bpcNumber, enclosureLabel, sourcePath: "stringsCsv" });
             }

             
             alarms.forEach(ac => {
                 const codeDesc = scMap[ac] || `Alarm Code ${ac}`;
                 const key = `string_alarm_${ac}`;
                 if (!groupMap.has(key)) groupMap.set(key, { id: key, severity: 'ALARM', source: 'String Controller', code: `${ac}`, message: codeDesc, displayText: codeDesc, occurrenceCount: 0, affectedEnclosureCount: 0, occurrences: [] });
                 groupMap.get(key).occurrences.push({ arrayNumber, stringNumber, bpcNumber: st.bpcNumber, enclosureLabel, sourcePath: "stringsCsv" });
             });
             
             warnings.forEach(wc => {
                 const codeDesc = scMap[wc] || `Warning Code ${wc}`;
                 const key = `string_warn_${wc}`;
                 if (!groupMap.has(key)) groupMap.set(key, { id: key, severity: 'WARNING', source: 'String Controller', code: `${wc}`, message: codeDesc, displayText: codeDesc, occurrenceCount: 0, affectedEnclosureCount: 0, occurrences: [] });
                 groupMap.get(key).occurrences.push({ arrayNumber, stringNumber, bpcNumber: st.bpcNumber, enclosureLabel, sourcePath: "stringsCsv" });
             });
        });

        
        for (const g of groupMap.values()) {
             g.occurrenceCount = g.occurrences.length;
             g.affectedEnclosureCount = new Set(g.occurrences.map((o: any) => o.enclosureLabel)).size;
             activeIssueGroups.push(g);
        }

        const sourceHealth = getEmsSourcesDebugInfo().map((d: any) => ({
            name: d.endpoint.split('/').pop() || d.endpoint,
            type: d.endpoint.includes('feather') ? 'Feather' : 'EMS',
            ok: d.success,
            error: d.lastError === "NONE" ? undefined : d.lastError
        }));

        
        const bessFleetSummary = {
            totalStrings: stringSummary.buckets.online + stringSummary.buckets.nearline + stringSummary.buckets.offline + stringSummary.buckets.notCommunicating,
            onlineStrings: stringSummary.buckets.online,
            nearlineStrings: stringSummary.buckets.nearline,
            offlineStrings: stringSummary.buckets.offline,
            notCommunicatingStrings: stringSummary.buckets.notCommunicating,
            warningStrings: activeIssueGroups.filter((g: any) => g.severity === 'WARNING').reduce((acc: number, g: any) => acc + g.occurrenceCount, 0),
            alarmStrings: activeIssueGroups.filter((g: any) => g.severity === 'ALARM').reduce((acc: number, g: any) => acc + g.occurrenceCount, 0),
            expectedBpcs: stringSummary.rollups?.totalStrings || null,
            avgCellVoltageMv: null,
            maxCellVoltageDeltaMv: null,
            avgCellTempC: null,
            sourceOk: stringSummary.buckets.online > 0 || stringSummary.buckets.offline > 0 || stringSummary.buckets.nearline > 0 || stringSummary.buckets.notCommunicating > 0,
            lastUpdated: new Date().toISOString()
        };
        // Compute from strings if available
        if (stringsData && stringsData.length > 0) {
            let totalAvgVolt = 0, voltCount = 0;
            let totalTempC = 0, tempCount = 0;
            let maxVoltDelta = -1;
            stringsData.forEach((st: any) => {
                const volts = st.averageCellVoltageMv ?? st.avgCellVoltage ?? st.avgCellVoltageMv;
                if (volts != null) { totalAvgVolt += Number(volts); voltCount++; }
                
                const delta = st.maxCellVoltageDeltaMv ?? st.maxCellVoltageDelta ?? st.maxCellVoltageDiff;
                if (delta != null && Number(delta) > maxVoltDelta) maxVoltDelta = Number(delta);
                
                const temp = st.averageCellTemperatureC ?? st.avgCellTemperature ?? st.avgCellTemp;
                if (temp != null) { totalTempC += Number(temp); tempCount++; }
            });
            if (voltCount > 0) bessFleetSummary.avgCellVoltageMv = totalAvgVolt / voltCount;
            if (tempCount > 0) bessFleetSummary.avgCellTempC = totalTempC / tempCount;
            if (maxVoltDelta >= 0) bessFleetSummary.maxCellVoltageDeltaMv = maxVoltDelta;
        }

        const responseData = {
            site,
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
            debug: {
               pcsDebugKeys: Array.from(new Set(pcsDebugKeys)),
               appDebugKeys: []
            },
            
            // Legacy fallbacks
            arrays: arraySummary,
            dragonApps: emsApps,
            topology,
            activeIssues: activeIssueGroups
        };

        try {
            const prizmCache = require('./cache/prizmCache');
            prizmCache.set('site-operations-summary', responseData, { ttlMs: 15000 });
            if (prizmCache.writeHistory) prizmCache.writeHistory('site-operations', responseData);
        } catch(e) {}
        
        res.json(responseData);
    } catch (err: any) {
        console.error("Summary aggregator error:", err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
