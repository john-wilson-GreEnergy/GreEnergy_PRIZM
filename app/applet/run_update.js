const fs = require('fs');
let code = fs.readFileSync('/app/applet/src/server/siteOperations.ts', 'utf8');

const s1 = code.indexOf('export function buildSiteOperationsSummaryFromCache');
const s2 = code.indexOf('export async function refreshSiteOperationsSources');
const prefix = code.slice(0, s1);
const postfix = code.slice(s2);

const newFunction = `
export function buildSiteOperationsSummaryFromCache() {
    try {
        const block = getEmsCachedBlock().data || {};
        const status = getEmsCachedStatus().data || {};
        const lastCall = getEmsCachedLastCall().data || {};
        const stringsData = getEmsCachedRawStrings().data || [];
        const conn = getEmsConnectionStatus();
        const fDevices = getEmsCachedFeatherDevices() || [];

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

        const scMap = buildStatusCodeDescriptionMap(getEmsCachedStatusCodes().data || {});

        const bool = (v) => v === true || String(v).toLowerCase() === 'true';
        const num = (v) => { const n = Number(v); return isNaN(n) ? null : n; };
        const normalizeTemp = (v) => { let t = num(v); if (t !== null && Math.abs(t) > 100) t = t / 10; return t; };
        const splitCodes = (v) => {
            if (!v) return [];
            if (Array.isArray(v)) return v.map(String);
            return String(v).split(',').map(s => s.trim()).filter(Boolean);
        };

        const stringRows = stringsData.map(row => {
            const cs = String(row.StringConnectionState ?? row.stringConnectionState ?? "").toUpperCase();
            const outRotation = bool(row.OutRotation ?? row.outRotation);
            const pos = bool(row.PositiveContactorClosed ?? row.positiveContactorClosed);
            const neg = bool(row.NegativeContactorClosed ?? row.negativeContactorClosed);
            const contactorsClosed = pos && neg;
            
            let bucket = "notCommunicating";
            if (cs === "OFFLINE" && outRotation) bucket = "offline";
            else if (cs === "ONLINE" && !outRotation && contactorsClosed) bucket = "online";
            else if (cs === "ONLINE" && !outRotation && !contactorsClosed) bucket = "nearline";
            else if (cs === "ONLINE") bucket = "nearline";
            else if (cs === "OFFLINE") bucket = "offline";
            else if (row.LossOfComms || row.lossOfComms) bucket = "notCommunicating";
            else bucket = "notCommunicating";

            return {
                arrayNumber: num(row.ArrayIndex ?? row.arrayIndex),
                stringNumber: num(row.StringIndex ?? row.stringIndex),
                stringKey: row.StringKey ?? row.stringKey,
                timestampUtc: row.Datetime || (num(row.Timestamp) ? new Date(num(row.Timestamp)).toISOString() : null),
                connectionState: row.StringConnectionState ?? row.stringConnectionState,
                outRotation,
                positiveContactorClosed: pos,
                negativeContactorClosed: neg,
                contactorsClosed,
                socPct: num(row.Soc ?? row.soc),
                kWh: num(row.KWh ?? row.kWh),
                ah: num(row.Ah ?? row.ah),
                kw: num(row.KW ?? row.kW),
                calculatedStringVoltage: num(row.CalculatedStringVoltage ?? row.calculatedStringVoltage),
                measuredStringVoltage: num(row.MeasuredStringVoltage ?? row.measuredStringVoltage),
                maxCellGroupVoltageMv: num(row.MaxCellGroupVoltage ?? row.maxCellGroupVoltage),
                minCellGroupVoltageMv: num(row.MinCellGroupVoltage ?? row.minCellGroupVoltage),
                avgCellGroupVoltageMv: num(row.AvgCellGroupVoltage ?? row.avgCellGroupVoltage),
                maxCellGroupTempC: normalizeTemp(row.MaxCellGroupTemp ?? row.maxCellGroupTemp),
                minCellGroupTempC: normalizeTemp(row.MinCellGroupTemp ?? row.minCellGroupTemp),
                avgCellGroupTempC: normalizeTemp(row.AvgCellGroupTemp ?? row.avgCellGroupTemp),
                warningCodes: splitCodes(row.Warns ?? row.warns),
                alarmCodes: splitCodes(row.Alarms ?? row.alarms),
                warningCount: num(row.WarnCount ?? row.warnCount),
                alarmCount: num(row.AlarmCount ?? row.alarmCount),
                bucket
            };
        });

        const stringSummary = {
            buckets: { online: 0, nearline: 0, offline: 0, notCommunicating: 0 },
            tableRows: stringRows,
            rollups: { totalStrings: stringRows.length }
        };
        stringRows.forEach(r => {
             if (stringSummary.buckets[r.bucket] !== undefined) stringSummary.buckets[r.bucket]++;
        });

        const blockArrays = block.arrays || status.arrays || [];
        const arrayReports = lastCall?.blockReport?.arrayReport || [];

        const arraySummary = blockArrays.map(a => {
            const arrayIndex = num(a.arrayIndex ?? a.arrayNumber);
            const arrayDataEntry = arrayReports.find(r => num(r.arrayIndex) === arrayIndex) || {};
            const arrayData = arrayDataEntry.arrayData || {};
            
            return {
              arrayIndex,
              displayName: a.displayKey || "Array " + arrayIndex,
              communicating: a.notCommunicationStringCount === 0 || a.communicating === true,
              stringCount: num(a.stringCount),
              onlineStringCount: num(a.onlineStringCount),
              nearlineStringCount: num(a.nearlineStringCount),
              offlineStringCount: num(a.offlineStringCount),
              notCommunicationStringCount: num(a.notCommunicationStringCount),
              inRotationCount: num(a.inRotationCount),
              outOfRotationCount: num(a.outOfRotationCount),
              voltageVolt: num(a.voltageVolt),
              powerkW: num(a.powerkW),
              currentAmp: num(a.currentAmp),
              storedDcEnergyKWh: num(a.storedDcEnergyKWh),
              connectedSocPct: num(arrayData.connectedSOC?.soc),
              connectedKWh: num(arrayData.connectedSOC?.kWh),
              connectedKWhCapacity: num(arrayData.connectedSOC?.kWhCapacity),
              notConnectedSocPct: num(arrayData.notConnectedSOC?.soc),
              notConnectedKWh: num(arrayData.notConnectedSOC?.kWh),
              notConnectedKWhCapacity: num(arrayData.notConnectedSOC?.kWhCapacity),
              minCellVoltageMv: num((arrayData.connectedStackAvgCellVoltage > 0 ? arrayData.connectedStackMinCellVoltage : arrayData.notConnectedStackMinCellVoltage) || arrayData.stackMinCellVoltage),
              maxCellVoltageMv: num((arrayData.connectedStackAvgCellVoltage > 0 ? arrayData.connectedStackMaxCellVoltage : arrayData.notConnectedStackMaxCellVoltage) || arrayData.stackMaxCellVoltage),
              avgCellVoltageMv: num((arrayData.connectedStackAvgCellVoltage > 0 ? arrayData.connectedStackAvgCellVoltage : arrayData.notConnectedStackAvgCellVoltage) || arrayData.stackAvgCellVoltage),
              maxAllowedChargeCurrent: num(arrayData.maxAllowedChargeCurrent),
              maxAllowedDischargeCurrent: num(arrayData.maxAllowedDischargeCurrent),
              sourcePath: "block.arrays",
              raw: a
            };
        });

        let pcsCnds = [];
        if (block.arrays) block.arrays.forEach(a => { if (a.pcses) pcsCnds.push(...a.pcses); });
        if (lastCall?.blockReport?.arrayReport) lastCall.blockReport.arrayReport.forEach(ar => {
           if (ar.arrayPcsReport) pcsCnds.push(...ar.arrayPcsReport);
        });
        const average = (arr) => { const v = arr.map(Number).filter(n => !isNaN(n)); return v.length ? v.reduce((a,b)=>a+b)/v.length : null; };
        const averageNonZero = (arr) => { const v = arr.map(Number).filter(n => !isNaN(n) && n > 0); return v.length ? v.reduce((a,b)=>a+b)/v.length : null; };

        const pcsSummary = pcsCnds.map(p => {
           return {
               arrayIndex: num(p.arrayIndex),
               pcsIndex: num(p.arrayPcsIndex ?? p.pcsIndex),
               dcVoltage: num(p.dcVoltageVolt),
               dcCurrent: num(p.dcCurrentAmp),
               acRealPowerKw: num(p.acRealPowerKW),
               acReactivePowerKvar: num(p.acReactivePowerKVAR),
               frequencyHz: num(p.acFrequencyHz),
               acVoltage: averageNonZero([p.acPhaseABVoltageVolt, p.acPhaseBCVoltageVolt, p.acPhaseCAVoltageVolt]),
               acCurrent: average([p.acPhaseACurrentAmp, p.acPhaseBCurrentAmp, p.acPhaseCCurrentAmp]),
               state: p.state,
               ready: p.isReady,
               outRotation: p.outRotation,
               rotation: p.outRotation === true ? "Out" : "In",
               sourcePath: p.sourcePath || "discovered",
               raw: p
           };
        }).filter((v,i,a) => a.findIndex(t => (t.arrayIndex === v.arrayIndex && t.pcsIndex === v.pcsIndex && v.arrayIndex != null))===i);

        const featherDevicesSource = lastCall?.featherReport || fDevices || [];
        const featherSummary = featherDevicesSource.map(device => {
          return {
            sourceIp: device.ip ?? device.deviceIp,
            enclosureLabel: device.entityDescription ?? device.segmentLabel ?? device.entityName ?? "Unknown Enclosure",
            temperatureC: num(device.spaceTemperatureC ?? device.spaceTemperature ?? device.rawResponse?.thermalData?.spaceTemperature),
            humidityPct: num(device.spaceHumidityPct ?? device.spaceHumidity ?? device.rawResponse?.thermalData?.spaceHumidity),
            avgCellTemperatureC: num(device.avgCellTemperatureC ?? device.avgCellTemperature),
            hydrogen1PPM: num(device.hydrogen1PPM) < 0.0001 ? 0 : num(device.hydrogen1PPM),
            doors: device.doors || [],
            warningMessages: device.warningMessages || [],
            faultMessages: device.faultMessages || [],
            reachable: device.reachable ?? true,
            communicating: device.communicating ?? true,
            raw: device
          };
        });
        const humidityTemperatureSensors = featherSummary.filter(f => f.temperatureC !== null || f.humidityPct !== null);

        const activeIssueGroups = [];
        const activeIssueGroupsMap = new Map();
        function getGroup(id, severity, source, code, message) {
          if (!activeIssueGroupsMap.has(id)) {
             activeIssueGroupsMap.set(id, { id, severity, source, code, message, displayText: message, occurrenceCount: 0, affectedEnclosureCount: 0, occurrences: [] });
          }
          return activeIssueGroupsMap.get(id);
        }
        stringRows.forEach(r => {
           const enclosureLabel = "Array " + r.arrayNumber + " ES" + r.stringNumber;
           r.warningCodes.forEach(wc => {
              getGroup("string_warning_" + wc, "WARNING", "String Controller", wc, scMap[wc] || "Warning " + wc).occurrences.push({
                 arrayNumber: r.arrayNumber, stringNumber: r.stringNumber, enclosureLabel, timestampUtc: r.timestampUtc, sourcePath: "stringsCsv" 
              });
           });
           r.alarmCodes.forEach(ac => {
              getGroup("string_alarm_" + ac, "ALARM", "String Controller", ac, scMap[ac] || "Alarm " + ac).occurrences.push({
                 arrayNumber: r.arrayNumber, stringNumber: r.stringNumber, enclosureLabel, timestampUtc: r.timestampUtc, sourcePath: "stringsCsv"
              });
           });
        });

        const notifications = lastCall?.notificationReport?.notification || [];
        notifications.forEach(n => {
           const id = n.notificationType?.notificationId;
           const cat = n.notificationType?.notificationCategory; 
           if (id && cat) {
              const g = getGroup("notification_" + cat + "_" + id, cat, "System", id, n.notificationType?.notificationName || "Notification " + id);
              g.occurrences.push({
                 arrayNumber: n.notificationSource?.arrayIndex,
                 stringNumber: n.notificationSource?.stringIndex,
                 bpcNumber: n.notificationSource?.batteryPackIndex,
                 cellGroupNumber: n.notificationSource?.cellGroupIndex,
                 enclosureLabel: n.notificationSource?.arrayIndex ? "Array " + n.notificationSource.arrayIndex : "System",
                 timestampUtc: n.timestamp,
                 sourcePath: "notificationReport"
              });
           }
        });

        Array.from(activeIssueGroupsMap.values()).forEach(g => {
             g.occurrenceCount = g.occurrences.length;
             g.affectedEnclosureCount = new Set(g.occurrences.map(o => o.enclosureLabel)).size;
             activeIssueGroups.push(g);
        });

        let topology = block.topology || status.topology || lastCall.topologyReport?.topologyNodes || [];
        if (!Array.isArray(topology) && topology.lineups) topology = topology.lineups; 
        const clearableFaults = Array.isArray(topology) ? topology.filter(t => t.allowFaultReset === true).map(t => ({ ...t, entityKeyToken: t.entityKeyToken || t.id || t.name || "UNKNOWN_TOKEN" })) : [];
        const safetySummary = { clearableFaults, clearableCount: clearableFaults.length, sourceOk: true, lastUpdated: new Date().toISOString() };

        let totalAvgVolt = 0, voltCount = 0;
        let totalTempC = 0, tempCount = 0;
        let maxVoltDelta = -1;
        stringRows.forEach(st => {
           if (st.avgCellGroupVoltageMv) { totalAvgVolt += st.avgCellGroupVoltageMv; voltCount++; }
           if (st.avgCellGroupTempC) { totalTempC += st.avgCellGroupTempC; tempCount++; }
           if (st.maxCellGroupVoltageMv && st.minCellGroupVoltageMv) {
               const diff = st.maxCellGroupVoltageMv - st.minCellGroupVoltageMv;
               if (diff > maxVoltDelta) maxVoltDelta = diff;
           }
        });

        const bessFleetSummary = {
            totalStrings: stringSummary.buckets.online + stringSummary.buckets.nearline + stringSummary.buckets.offline + stringSummary.buckets.notCommunicating,
            onlineStrings: stringSummary.buckets.online,
            nearlineStrings: stringSummary.buckets.nearline,
            offlineStrings: stringSummary.buckets.offline,
            notCommunicatingStrings: stringSummary.buckets.notCommunicating,
            warningStrings: activeIssueGroups.filter(g => g.severity === 'WARNING').reduce((acc, g) => acc + g.occurrenceCount, 0),
            alarmStrings: activeIssueGroups.filter(g => g.severity === 'ALARM').reduce((acc, g) => acc + g.occurrenceCount, 0),
            expectedBpcs: stringSummary.rollups?.totalStrings || null,
            avgCellVoltageMv: voltCount > 0 ? num((totalAvgVolt / voltCount).toFixed(0)) : null,
            avgCellTempC: tempCount > 0 ? num((totalTempC / tempCount).toFixed(1)) : null,
            maxCellVoltageDeltaMv: maxVoltDelta >= 0 ? Math.round(maxVoltDelta) : null,
            sourceOk: true,
            lastUpdated: new Date().toISOString()
        };

        const result = {
            site: { stationCode, discoveredStationCode: conn.discoveredStationCode, siteCodeSource },
            bessFleetSummary,
            arraySummary,
            stringSummary,
            pcsSummary,
            featherSummary,
            humidityTemperatureSensors,
            safetySummary,
            activeIssueGroups,
            telemetryStatus: conn,
            debug: { sourceOk: true, lastUpdated: new Date().toISOString(), keys: [] }
        };

        lastSummaryCache = result;
        lastSummaryTime = Date.now();
        return result;
    } catch (e) {
        console.error("Local Summary build error", e);
        return { error: String(e), message: "Failed to build local site operations summary" };
    }
}
`

fs.writeFileSync('/app/applet/src/server/siteOperations.ts', prefix + newFunction + postfix);
