const fs = require('fs');

let code = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

// 1. Array Summary
const arraySummaryRegex = /let arraySummary = arrCands\.map\(\(a: any\) => \{[\s\S]*?\}\);/;
const newArraySummary = `let arraySummary = arrCands.map((a: any) => {
             function num(v: any): number | null {
                 if (v === null || v === undefined || v === "") return null;
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
        });`;
code = code.replace(arraySummaryRegex, newArraySummary);

// 2. PCS Summary
const pcsSummaryRegex = /const pcsSummary = pcsCnds\.map\(\(p: any\) => \{[\s\S]*?\}\)\.filter\(\(v:any,i:any,a:any\) => a\.findIndex\(\(t: any\) =>\(t\.arrayIndex === v\.arrayIndex && t\.pcsIndex === v\.pcsIndex && v\.arrayIndex != null\)\)===i\);/;
const newPcsSummary = `
        function averageValid(vals: any[]): number | null {
            const valid = vals.map(numOrNull).filter(v => v !== null) as number[];
            if (valid.length === 0) return null;
            return valid.reduce((a, b) => a + b, 0) / valid.length;
        }

        const pcsSummary = pcsCnds.map((p: any) => {
             const arrayIndex = numOrNull(p.arrayIndex ?? p.arrayNumber);
             const pcsIndex = numOrNull(p.arrayPcsIndex ?? p.pcsIndex ?? p.index);
             return {
                 arrayIndex,
                 pcsIndex,
                 dcVoltage: numOrNull(p.dcVoltageVolt ?? p.dcVoltage ?? p.dcVolt ?? p.dcV),
                 dcCurrent: numOrNull(p.dcCurrentAmp ?? p.dcCurrent ?? p.dcCurr ?? p.dcA),
                 acRealPowerKw: numOrNull(p.acRealPowerKW ?? p.acRealPowerKw ?? p.acRealPower ?? p.kw ?? p.kW),
                 acReactivePowerKvar: numOrNull(p.acReactivePowerKVAR ?? p.acReactivePowerKvar ?? p.acReactPower ?? p.kvar ?? p.kVAr),
                 frequencyHz: numOrNull(p.acFrequencyHz ?? p.frequencyHz ?? p.freq ?? p.hz),
                 acVoltage: averageValid([p.acPhaseABVoltageVolt, p.acPhaseBCVoltageVolt, p.acPhaseCAVoltageVolt, p.acVoltage]),
                 acCurrent: averageValid([p.acPhaseACurrentAmp, p.acPhaseBCurrentAmp, p.acPhaseCCurrentAmp, p.acCurrent]),
                 state: p.state ?? null,
                 displayKey: p.displayKey ?? ('Array ' + arrayIndex + ' PCS ' + pcsIndex),
                 rotation: p.outRotation === true ? "Out" : "In",
                 sourcePath: p.sourcePath || "discovered",
                 raw: p
             };
        }).filter((v:any,i:any,a:any) => a.findIndex((t: any) =>(t.arrayIndex === v.arrayIndex && t.pcsIndex === v.pcsIndex && v.arrayIndex != null))===i);`;
code = code.replace(pcsSummaryRegex, newPcsSummary);

// 3. String Buckets
const stringBucketRegex = /export function buildStringBucketSummary[\s\S]*?\}\n\}\n/;
const newStringBucket = `export function buildStringBucketSummary(stringsData: any[]) {
    const buckets = {
        online: 0,
        nearline: 0,
        offline: 0,
        notCommunicating: 0
    };
    
    function bool(v: any): boolean {
        if (v === true || v === false) return v;
        if (typeof v === "string") return v.toLowerCase() === "true" || v.toLowerCase() === "1" || v.toLowerCase() === "yes";
        if (typeof v === "number") return v === 1;
        return false;
    }

    function num(v: any): number | null {
        if (v === null || v === undefined || v === "") return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }

    let totalStrings = 0;

    const tableRows = stringsData.map(row => {
        totalStrings++;

        const arrayNumber = num(row.ArrayIndex ?? row.arrayIndex ?? row.arrayNumber);
        const stringNumber = num(row.StringIndex ?? row.stringIndex ?? row.stringNumber);
        const connectionState = String(row.StringConnectionState ?? row.stringConnectionState ?? row.connectionState ?? "").toUpperCase();
        const outRotation = bool(row.OutRotation ?? row.outRotation ?? row.outOfRotation);
        const posClosed = bool(row.PositiveContactorClosed ?? row.positiveContactorClosed);
        const negClosed = bool(row.NegativeContactorClosed ?? row.negativeContactorClosed);
        const contactorsClosed = posClosed && negClosed;

        let bucket = "offline";
        if (connectionState.includes("LOSS") || connectionState.includes("NO_COMM") || connectionState.includes("NOT_COMM")) {
            bucket = "notCommunicating";
        } else if (connectionState === "OFFLINE" || outRotation) {
            bucket = "offline";
        } else if (connectionState === "ONLINE" && !outRotation && contactorsClosed) {
            bucket = "online";
        } else if (connectionState === "ONLINE" && !outRotation && !contactorsClosed) {
            bucket = "nearline";
        } else {
            bucket = "offline";
        }

        buckets[bucket as keyof typeof buckets]++;

        return {
            ...row,
            arrayNumber,
            stringNumber,
            bucket,
            communicating: bucket !== "notCommunicating",
            inRotation: !outRotation,
            contactorsClosed
        };
    });
    
    return { 
        buckets, 
        tableRows,
        rollups: { totalStrings } 
    };
}
`;
code = code.replace(stringBucketRegex, newStringBucket);

// 4. Active Issue Groups (Part K)
const activeIssueRegex = /\/\/ Part K \- Active Issue Groups[\s\S]*?for \(const g of groupMap\.values\(\)\) \{[\s\S]*?activeIssueGroups\.push\(g\);\n        \}/;
const newActiveIssues = `// Part K - Active Issue Groups
        const activeIssueGroups: any[] = [];
        const scMap = buildStatusCodeDescriptionMap(getEmsCachedStatusCodes().data || {});
        
        const groupMap = new Map<string, any>();
        
        function formatFeatherIssue(item: any): string {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
                if (item.deviceType || item.deviceName) {
                    return 'Lost Comms with: ' + (item.deviceName || item.deviceType);
                }
                const str = JSON.stringify(item);
                if (str.length < 50) return str;
            }
            return "Unknown Issue";
        }

        fDevices.forEach((f: any) => {
             const activeWarnings = f.activeWarnings || f.warningMessages || [];
             if (f.warningCount > 0 && Array.isArray(activeWarnings)) {
                 activeWarnings.forEach((awRaw: any) => {
                     const aw = formatFeatherIssue(awRaw);
                     const key = 'feather_warn_' + encodeURIComponent(aw);
                     if (!groupMap.has(key)) groupMap.set(key, { id: key, severity: 'WARNING', source: 'Feather/HVAC', code: null, message: aw, displayText: aw, occurrenceCount: 0, affectedEnclosureCount: 0, occurrences: [] });
                     groupMap.get(key).occurrences.push({ deviceIp: f.deviceIp, enclosureLabel: f.entityName || "Unknown", sourcePath: "featherSummary" });
                 });
             }
             const activeAlarms = f.activeAlarms || f.alarmMessages || f.faultMessages || [];
             if (f.alarmCount > 0 && Array.isArray(activeAlarms)) {
                 activeAlarms.forEach((aaRaw: any) => {
                     const aa = formatFeatherIssue(aaRaw);
                     const key = 'feather_alarm_' + encodeURIComponent(aa);
                     if (!groupMap.has(key)) groupMap.set(key, { id: key, severity: 'ALARM', source: 'Feather/HVAC', code: null, message: aa, displayText: aa, occurrenceCount: 0, affectedEnclosureCount: 0, occurrences: [] });
                     groupMap.get(key).occurrences.push({ deviceIp: f.deviceIp, enclosureLabel: f.entityName || "Unknown", sourcePath: "featherSummary" });
                 });
             }
        });
        
        stringsData.forEach((st: any) => {
             let rawAlarms = String(st.Alarms || st.alarms || st.alarmCodes || st.alarmsList || "");
             let rawWarns = String(st.Warns || st.warns || st.warningCodes || st.warnCodes || st.warningsList || "");
             
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
               : "Unknown String";
               
             alarms.forEach(ac => {
                 const codeDesc = scMap[ac] || 'Alarm Code ' + ac;
                 const key = 'string_alarm_' + ac;
                 if (!groupMap.has(key)) groupMap.set(key, { id: key, severity: 'ALARM', source: 'String Controller', code: String(ac), message: codeDesc, displayText: codeDesc, occurrenceCount: 0, affectedEnclosureCount: 0, occurrences: [] });
                 groupMap.get(key).occurrences.push({ arrayNumber, stringNumber, bpcNumber: st.bpcNumber, enclosureLabel, sourcePath: "stringsCsv" });
             });
             
             warnings.forEach(wc => {
                 const codeDesc = scMap[wc] || 'Warning Code ' + wc;
                 const key = 'string_warn_' + wc;
                 if (!groupMap.has(key)) groupMap.set(key, { id: key, severity: 'WARNING', source: 'String Controller', code: String(wc), message: codeDesc, displayText: codeDesc, occurrenceCount: 0, affectedEnclosureCount: 0, occurrences: [] });
                 groupMap.get(key).occurrences.push({ arrayNumber, stringNumber, bpcNumber: st.bpcNumber, enclosureLabel, sourcePath: "stringsCsv" });
             });
        });

        for (const g of groupMap.values()) {
             g.occurrenceCount = g.occurrences.length;
             g.affectedEnclosureCount = new Set(g.occurrences.map((o: any) => o.enclosureLabel)).size;
             activeIssueGroups.push(g);
        }`;

code = code.replace(activeIssueRegex, newActiveIssues);

fs.writeFileSync('src/server/siteOperations.ts', code);
console.log("Replaced");
