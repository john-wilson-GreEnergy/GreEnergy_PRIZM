import { Router } from "express";
import { 
    getEmsCachedBlock, 
    getEmsCachedStatus, 
    getEmsCachedLastCall, 
    getEmsCachedRawStrings, 
    getEmsCachedControllerStatistics,
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
    
    // stringsDashboard style normalization
    const tableRows = stringsData.map(st => {
        const communicating = st.communicating === true || st.communicating === "true";
        const inRot = st.inRotation === true || st.inRotation === "true";
        const contClosed = st.contactorsClosed === true || st.contactorsClosed === "true";
        
        let bucket = "offline";
        if (communicating) {
            if (st.lossOfComms === true || st.lossOfComms === "true") {
                 bucket = "notCommunicating";
            } else if (!inRot) {
                 bucket = "offline";
            } else if (!contClosed) {
                 bucket = "nearline";
            } else {
                 bucket = "online";
            }
        } else {
            bucket = "notCommunicating";
        }
        
        (buckets as any)[bucket]++;
        
        return {
            ...st,
            bucket,
            communicating,
            inRotation: inRot,
            contactorsClosed: contClosed
        };
    });
    
    return { buckets, tableRows };
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
        let maxH = 0, maxST = 0, maxCT = 0;
        const devicesWithIssues: any[] = [];

        fDevices.forEach((f: any) => {
            if (f.reachable) fOnline++; else fOffline++;
            if (f.lostComms) fLostComms++;
            if (f.fssValid === false) fFssInv++;
            if (f.doorsValid === false) fDoorsInv++;
            if (f.mioValid === false) fHvacInv++;
            fWarn += (f.warningCount || 0);
            fFault += (f.alarmCount || 0);
            if (f.hydrogen1PPM && f.hydrogen1PPM > maxH) maxH = f.hydrogen1PPM;
            const st = f.spaceTemperature || (f.rawResponse?.thermalData?.spaceTemperature) || (f.rawResponse?.thermalData?.spaceTemp) || 0;
            if (st && st > maxST) maxST = st;
            if (f.avgCellTemperature && f.avgCellTemperature > maxCT) maxCT = f.avgCellTemperature;
            
            if (!f.reachable || f.lostComms || f.fssValid === false || f.doorsValid === false || (f.warningCount > 0) || (f.alarmCount > 0)) {
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
             const tempC = f.spaceTemperature ?? rt.spaceTemperature ?? rt.spaceTemp ?? rt.airTemp ?? rt.temperature;
             const hum = rt.spaceHumidity ?? rt.humidity ?? rt.relativeHumidity;
             if (tempC !== undefined || hum !== undefined) {
                 const srcIp = f.deviceIp || f.ip;
                 let enc = f.entityName || f.entityDescription;
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
        
        const pcsSummary = pcsCandidates.map(p => {
             return {
                 arrayIndex: p.arrayIndex ?? p.arrayNumber ?? null,
                 pcsIndex: p.pcsIndex ?? p.index ?? null,
                 dcVoltage: p.dcVoltage ?? p.dcVolt ?? p.dcV ?? p.dc_volt ?? null,
                 dcCurrent: p.dcCurrent ?? p.dcCurr ?? p.dcA ?? p.dc_current ?? null,
                 acVoltage: p.acVoltage ?? p.acVolt ?? p.acV ?? p.ac_voltage ?? null,
                 acCurrent: p.acCurrent ?? p.acCurr ?? p.acA ?? p.ac_current ?? null,
                 acRealPowerKw: p.acRealPowerKw ?? p.acRealPower ?? p.realPowerKw ?? p.kw ?? p.kW ?? null,
                 acReactivePowerKvar: p.acReactivePowerKvar ?? p.acReactPower ?? p.reactivePowerKvar ?? p.kvar ?? p.kVAr ?? null,
                 frequencyHz: p.frequencyHz ?? p.freq ?? p.hz ?? null,
                 rotation: p.rotation ?? p.rotationStatus ?? null,
                 sourcePath: p.sourcePath || "discovered",
                 raw: p
             };
        }).filter((v,i,a) => a.findIndex((t: any) =>(t.arrayIndex === v.arrayIndex && t.pcsIndex === v.pcsIndex && v.arrayIndex != null))===i);

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
        const clearableFaults = Array.isArray(topology) ? topology.filter((t: any) => t.allowFaultReset === true) : [];
        const safetySummary = {
             clearableFaults,
             clearableCount: clearableFaults.length,
             sourceOk: true,
             lastUpdated: new Date().toISOString()
        };

        // Part K - Active Issue Groups
        const activeIssueGroups: any[] = [];
        // Map Bess Status Codes to get descriptions
        const scMap = getEmsCachedStatusCodes().data?.bessStatusCodes || {};
        
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
             if (st.alarmCodes && st.alarmCodes.length > 0) {
                 st.alarmCodes.forEach((ac: number) => {
                     const codeDesc = scMap[ac] || `Alarm Code ${ac}`;
                     const key = `string_alarm_${ac}`;
                     if (!groupMap.has(key)) groupMap.set(key, { id: key, severity: 'ALARM', source: 'String Controller', code: `${ac}`, message: codeDesc, displayText: codeDesc, occurrenceCount: 0, affectedEnclosureCount: 0, occurrences: [] });
                     groupMap.get(key).occurrences.push({ arrayNumber: st.arrayNumber, stringNumber: st.stringNumber, bpcNumber: st.bpcNumber, enclosureLabel: `Array ${st.arrayNumber} ES${st.stringNumber}`, sourcePath: "stringsCsv" });
                 });
             }
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

        const responseData = {
            site,
            emsApps,
            bessFleetSummary: {},
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
