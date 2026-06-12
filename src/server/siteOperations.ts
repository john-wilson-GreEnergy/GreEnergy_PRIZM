import * as prizmCache from "./cache/prizmCache";
import { Router } from "express";
import { buildSiteTopologyFromCachedSources } from "./topology/siteTopology";
import { 
    getEmsCachedBlock, 
    getEmsCachedStatus, 
    getEmsCachedLastCall, 
    getEmsCachedRawStrings, 
    
    getEmsCachedStatusCodes,
    getEmsConnectionStatus, 
    getEmsSourcesDebugInfo 
} from "./emsTurtleClient";
import { getFeatherCache, refreshFeatherCache } from "./feather/featherClient";

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

function collectEmsAppCandidates(root: any, path: string = ""): any[] {
    const results: any[] = [];
    if (!root || typeof root !== 'object') return results;

    if (Array.isArray(root)) {
        if (root.length > 0 && typeof root[0] === 'object' && root[0].appCode !== undefined && (root[0].appName !== undefined || root[0].priority !== undefined || root[0].configName !== undefined || root[0].health !== undefined)) {
            root.forEach(item => {
                if (typeof item === 'object') {
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

    let totalStrings = 0;

    const tableRows = stringsData.map(row => {
        totalStrings++;

        const arrayNumber = num(row.ArrayIndex ?? row.arrayIndex ?? row.arrayNumber);
        const stringNumber = num(row.StringIndex ?? row.stringIndex ?? row.stringNumber);
        const connectionState = String(row.StringConnectionState ?? row.stringConnectionState ?? row.connectionState ?? '').toUpperCase();
        const outRotation = bool(row.OutRotation ?? row.outRotation ?? row.outOfRotation);
        const posClosed = bool(row.PositiveContactorClosed ?? row.positiveContactorClosed);
        const negClosed = bool(row.NegativeContactorClosed ?? row.negativeContactorClosed);
        const contactorsClosed = posClosed && negClosed;

        let bucket = 'offline';
        if (connectionState.includes('LOSS') || connectionState.includes('NO_COMM') || connectionState.includes('NOT_COMM')) {
            bucket = 'notCommunicating';
        } else if (connectionState === 'OFFLINE' || outRotation) {
            bucket = 'offline';
        } else if (connectionState === 'ONLINE' && !outRotation && contactorsClosed) {
            bucket = 'online';
        } else if (connectionState === 'ONLINE' && !outRotation && !contactorsClosed) {
            bucket = 'nearline';
        } else {
            bucket = 'offline';
        }

        const socPct = num(row.Soc ?? row.soc);
        const kWh = num(row.KWh ?? row.kWh);
        const currentA = num(row.StringCurrent ?? row.stringCurrent ?? row.CtCurrent1 ?? row.ctCurrent1 ?? row.CtCurrent2 ?? row.ctCurrent2);
        const maxCellVoltageMv = num(row.MaxCellGroupVoltage ?? row.maxCellGroupVoltage);
        const minCellVoltageMv = num(row.MinCellGroupVoltage ?? row.minCellGroupVoltage);
        const avgCellVoltageMv = num(row.AvgCellGroupVoltage ?? row.avgCellGroupVoltage);
        let maxTempRaw = num(row.MaxCellGroupTemp ?? row.maxCellGroupTemp);
        let minTempRaw = num(row.MinCellGroupTemp ?? row.minCellGroupTemp);
        let avgTempRaw = num(row.AvgCellGroupTemp ?? row.avgCellGroupTemp);

        if (maxTempRaw !== null && Math.abs(maxTempRaw) > 100) maxTempRaw = maxTempRaw / 10;
        if (minTempRaw !== null && Math.abs(minTempRaw) > 100) minTempRaw = minTempRaw / 10;
        if (avgTempRaw !== null && Math.abs(avgTempRaw) > 100) avgTempRaw = avgTempRaw / 10;

        return {
            ...row,
            arrayNumber,
            stringNumber,
            bucket,
            communicating: bucket !== 'notCommunicating',
            inRotation: !outRotation,
            contactorsClosed,
            socPct,
            kWh,
            currentA,
            maxCellVoltageMv,
            minCellVoltageMv,
            avgCellVoltageMv,
            voltageDeltaMv: (maxCellVoltageMv !== null && minCellVoltageMv !== null) ? (maxCellVoltageMv - minCellVoltageMv) : null,
            maxTempRaw,
            minTempRaw,
            avgTempRaw,
            warningCount: num(row.WarnCount ?? row.warnCount ?? row.WarningCount ?? row.warningCount ?? 0),
            alarmCount: num(row.AlarmCount ?? row.alarmCount ?? row.AlarmsCount ?? row.alarmsCount ?? 0)
        };
    });

    const bucketsRaw = {
        online: tableRows.filter(r => r.bucket === 'online'),
        nearline: tableRows.filter(r => r.bucket === 'nearline'),
        offline: tableRows.filter(r => r.bucket === 'offline'),
        notCommunicating: tableRows.filter(r => r.bucket === 'notCommunicating')
    };

    const buckets: Record<string, number> = {
        online: bucketsRaw.online.length,
        nearline: bucketsRaw.nearline.length,
        offline: bucketsRaw.offline.length,
        notCommunicating: bucketsRaw.notCommunicating.length
    };

    const rollups: any = { totalStrings };

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
        const maxTemp = maxNum('maxTempRaw');
        const minTemp = minNum('minTempRaw');

        return {
            count,
            socPctAvg: avgNum('socPct'),
            socKwhAvg: sumNum('kWh'), // Return sum/avg per bucket requirement, actually the requirements say "SOC / KWh" so maybe socKwhAvg means average KWh, sum is better or avg is better? User says "socKwhAvg or kWh average". Let's do average.
            kWhAvg: avgNum('kWh'),
            maxCurrentA: maxNum('currentA'),
            minCurrentA: minNum('currentA'),
            maxCellVoltageMv: maxVoltageMv,
            avgCellVoltageMv: avgNum('avgCellVoltageMv'),
            minCellVoltageMv: minVoltageMv,
            maxCellVoltageDeltaMv: maxVoltageMv !== null && minVoltageMv !== null ? maxVoltageMv - minVoltageMv : null,
            highCellTempC: maxTemp,
            avgCellTempC: avgNum('avgTempRaw'),
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

    return { 
        buckets, 
        tableRows,
        rollups
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


import { pollEmsTurtle } from "./emsTurtleClient";

let siteOpsInFlight: Promise<any> | null = null;
let lastSummaryCache: any = null;
let lastSummaryTime = 0;

export function buildSiteOperationsSummaryFromCache() {
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
        const blockApps = collectEmsAppCandidates(block, "block");
        const statusApps = collectEmsAppCandidates(status, "status");
        const lastCallApps = collectEmsAppCandidates(lastCall, "lastCall");

        let appsCandidates = [...blockApps, ...statusApps, ...lastCallApps];
        const emsAppSourcePaths = Array.from(new Set(appsCandidates.map(a => a.sourcePath)));
        
        const emsApps = appsCandidates.filter((v,i,a) => a.findIndex(t => t.appCode === v.appCode && t.appName === v.appName) === i).map((app: any) => {
            const appName = app.appName || app.applicationName || app.application || app.name || app.appCode;
            let st = "Unknown";
            if (app.enabled === true) st = "Enabled";
            if (app.enabled === false) st = "Not Enabled";
            if ((app.health === "HEALTH_HEALTHY" || String(app.health).toLowerCase() === "healthy") && app.enabled !== false) st = "Enabled";
            if (app.health === "HEALTH_NOT_ENABLED" || String(app.health).toLowerCase() === "disabled") st = "Not Enabled";
            if (app.health === "HEALTH_FAULT" || String(app.health).toLowerCase().includes("fault")) st = "Faulted";
            if (app.health === "HEALTH_WARNING" || String(app.health).toLowerCase().includes("warning")) st = "Warning";
            
            return {
               priority: app.priority ?? null,
               appCode: app.appCode,
               appName,
               configName: app.configName ?? null,
               configVersionId: app.configVersionId ?? null,
               enabled: app.enabled ?? null,
               canDisable: app.canDisable ?? null,
               status: st,
               healthRaw: app.health ?? null,
               shortAppStatus: app.shortAppStatus ?? null,
               hasShortAppStatus: app.hasShortAppStatus ?? null,
               appStatus: app.appStatus ?? null,
               healthMessage: app.healthMessage ?? null,
               hasEditor: app.hasEditor ?? null,
               sourcePath: app.sourcePath || "discovered",
               raw: app
            };
        });

        // Part E - FEATHER/HVAC
        const fCache = getFeatherCache();
        const fDevices = (fCache.devices || []).filter(d => !(d as any).rejected);
        
        // Count accurately based on devices array. If !fCache.success or stale, keep the real counts but mark stale
        let fOnline = 0, fOffline = 0, fLostComms = 0, fFssInv = 0, fDoorsInv = 0, fHvacInv = 0, fWarn = 0, fFault = 0;
        let maxH = 0;
        let maxST: number | null = null;
        let maxCT: number | null = null;
        const devicesWithIssues: any[] = [];

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
            if (ct !== null && !Number.isNaN(ct)) maxCT = maxCT === null ? ct : Math.max(maxCT, ct);
            
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

        let arraySummary = arrCands.map((a: any) => {
             function num(v: any) {
                 if (v === null || v === undefined || v === '') return null;
                 const n = Number(v);
                 return Number.isFinite(n) ? n : null;
             }
             const arrayIndex = num(a.arrayIndex ?? a.arrayNumber);
             const stringCount = num(a.stringCount);
             const notCommunicationStringCount = num(a.notCommunicationStringCount);
             return {
                 arrayIndex,
                 communicating: notCommunicationStringCount === 0,
                 onlineSOC: num(a.onlineSOC),
                 nearlineSOC: num(a.nearlineSOC),
                 offlineSOC: num(a.offlineSOC),
                 onlineAvailableKWh: num(a.onlineAvailableKWh),
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
                 onlineStringCount: num(a.onlineStringCount),
                 nearlineStringCount: num(a.nearlineStringCount),
                 offlineStringCount: num(a.offlineStringCount),
                 notCommunicationStringCount,
                 inRotationCount: num(a.inRotationCount),
                 outOfRotationCount: num(a.outOfRotationCount),
                 friendlyString: a.displayKey || ('Array ' + (arrayIndex ?? 'Unknown')),
                 sourcePath: a.sourcePath || 'discovered',
                 raw: a
             };
        });

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
        
        function formatFeatherIssue(item: any): string {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
                const name = 
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
                     const key = 'feather_warn_' + encodeURIComponent(aw);
                     if (!groupMap.has(key)) groupMap.set(key, { id: key, severity: 'WARNING', source: 'Feather/HVAC', code: null, message: aw, displayText: aw, occurrenceCount: 0, affectedEnclosureCount: 0, occurrences: [] });
                     groupMap.get(key).occurrences.push({ deviceIp, enclosureLabel, sourcePath: 'featherSummary' });
                 });
             }
             const activeAlarms = f.activeAlarms || f.alarmMessages || f.faultMessages || [];
             if (f.alarmCount > 0 && Array.isArray(activeAlarms)) {
                 activeAlarms.forEach((aaRaw: any) => {
                     const aa = formatFeatherIssue(aaRaw);
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
                 const codeDesc = scMap[ac] || 'Alarm Code ' + ac;
                 const key = 'string_alarm_' + ac;
                 if (!groupMap.has(key)) groupMap.set(key, { id: key, severity: 'ALARM', source: 'String Controller', code: String(ac), message: codeDesc, displayText: codeDesc, occurrenceCount: 0, affectedEnclosureCount: 0, occurrences: [] });
                 groupMap.get(key).occurrences.push({ arrayNumber, stringNumber, bpcNumber: st.bpcNumber, enclosureLabel, sourcePath: 'stringsCsv' });
             });
             
             warnings.forEach(wc => {
                 const codeDesc = scMap[wc] || 'Warning Code ' + wc;
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
            type: d.endpoint.includes('feather') ? 'Feather' : 'EMS',
            ok: d.success,
            error: d.lastError === "NONE" ? undefined : d.lastError
        }));

        
        const siteTopology = buildSiteTopologyFromCachedSources();
        const totalStringsInTopology = siteTopology.counts.stringCount || stringSummary.rollups?.totalStrings || 0;

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
            debug: {
               pcsDebugKeys: Array.from(new Set(pcsDebugKeys)),
               appDebugKeys: [],
               emsAppCandidateCount: appsCandidates.length,
               emsAppSourcePaths: emsAppSourcePaths
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
            await pollEmsTurtle();
            refreshFeatherCache({ timeoutMs: 2500 }).catch(() => {});
            
            const data = buildSiteOperationsSummaryFromCache();
            if (data) {
                prizmCache.set('site-operations-summary', data, { ttlMs: 15000 });
                if (prizmCache.writeHistory) prizmCache.writeHistory('site-operations', data);
                lastSummaryCache = data;
                lastSummaryTime = Date.now();
            }
        } finally {
            siteOpsInFlight = null;
        }
    })();
    return siteOpsInFlight;
}

router.get("/summary", async (req, res) => {
    const tStart = Date.now();
    const preferCache = req.query.preferCache !== 'false';
    const forceRefresh = req.query.refresh === 'true';

    try {
        let cachedEntry = prizmCache.get('site-operations-summary');
        
        let tCacheRead = Date.now() - tStart;
        
        let shouldRefresh = forceRefresh;
        let responseData: any = null;

        if (forceRefresh) {
             shouldRefresh = true;
        } else if (preferCache) {
             if (cachedEntry) {
                 responseData = cachedEntry.data;
                 if (cachedEntry.isStale || cachedEntry.ageMs > 15000) shouldRefresh = true;
             } else if (lastSummaryCache && (Date.now() - lastSummaryTime < 15000)) {
                 responseData = lastSummaryCache;
                 cachedEntry = { data: lastSummaryCache, ageMs: Date.now() - lastSummaryTime, isLive: true } as any;
             } else {
                 responseData = buildSiteOperationsSummaryFromCache();
                 shouldRefresh = true;
             }
        } else {
             // preferCache=false
             responseData = buildSiteOperationsSummaryFromCache();
             shouldRefresh = true;
        }

        let refreshing = false;
        if (shouldRefresh) {
            refreshing = true;
            refreshSiteOperationsSources().catch(() => {});
        } else if (siteOpsInFlight) {
            refreshing = true;
        }

        if (forceRefresh) {
             await Promise.race([
                 siteOpsInFlight,
                 new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 3000))
             ]).catch(() => null);
             
             responseData = buildSiteOperationsSummaryFromCache();
        }

        if (!responseData) responseData = {};

        let cacheState = "UNAVAILABLE";
        if (Object.keys(responseData).length > 0) {
            if (siteOpsInFlight) {
                cacheState = "REFRESHING";
            } else if (cachedEntry?.isStale || (cachedEntry && cachedEntry.ageMs > 15000)) {
                cacheState = "STALE";
            } else if (cachedEntry || (!preferCache && !forceRefresh)) {
                cacheState = "CACHED";
            } else {
                cacheState = "LIVE";
            }
        }

        const tBuild = Date.now() - tStart;

        (responseData as any).cacheMeta = {
            cacheState,
            fetchedAt: cachedEntry ? cachedEntry.fetchedAt : new Date().toISOString(),
            ageMs: cachedEntry ? cachedEntry.ageMs : 0,
            ttlMs: 15000,
            sourceOk: true,
            refreshing
        };

        const totalMs = Date.now() - tStart;
        (responseData as any).debug = {
             ...((responseData as any).debug || {}),
             timings: { totalMs, cacheReadMs: tCacheRead, buildMs: tBuild - tCacheRead, sourceHealthMs: 0, refreshTriggered: shouldRefresh }
        };

        if (totalMs > 500) console.log('[SiteOps] Slow summary response: ' + totalMs + 'ms');

        res.json(responseData);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
