const fs = require('fs');
let code = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

const stringBucketRegex = /export function buildStringBucketSummary[\s\S]*?\}\n\}\n/;
const newStringBucket = `export function buildStringBucketSummary(stringsData: any[]) {
    const buckets = {
        online: 0,
        nearline: 0,
        offline: 0,
        notCommunicating: 0
    };
    
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

        (buckets as Record<string, number>)[bucket]++;

        return {
            ...row,
            arrayNumber,
            stringNumber,
            bucket,
            communicating: bucket !== 'notCommunicating',
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
            return 'Unknown Issue';
        }

        fDevices.forEach((f: any) => {
             const activeWarnings = f.activeWarnings || f.warningMessages || [];
             if (f.warningCount > 0 && Array.isArray(activeWarnings)) {
                 activeWarnings.forEach((awRaw: any) => {
                     const aw = formatFeatherIssue(awRaw);
                     const key = 'feather_warn_' + encodeURIComponent(aw);
                     if (!groupMap.has(key)) groupMap.set(key, { id: key, severity: 'WARNING', source: 'Feather/HVAC', code: null, message: aw, displayText: aw, occurrenceCount: 0, affectedEnclosureCount: 0, occurrences: [] });
                     groupMap.get(key).occurrences.push({ deviceIp: f.deviceIp, enclosureLabel: f.entityName || 'Unknown', sourcePath: 'featherSummary' });
                 });
             }
             const activeAlarms = f.activeAlarms || f.alarmMessages || f.faultMessages || [];
             if (f.alarmCount > 0 && Array.isArray(activeAlarms)) {
                 activeAlarms.forEach((aaRaw: any) => {
                     const aa = formatFeatherIssue(aaRaw);
                     const key = 'feather_alarm_' + encodeURIComponent(aa);
                     if (!groupMap.has(key)) groupMap.set(key, { id: key, severity: 'ALARM', source: 'Feather/HVAC', code: null, message: aa, displayText: aa, occurrenceCount: 0, affectedEnclosureCount: 0, occurrences: [] });
                     groupMap.get(key).occurrences.push({ deviceIp: f.deviceIp, enclosureLabel: f.entityName || 'Unknown', sourcePath: 'featherSummary' });
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
        }`;

code = code.replace(activeIssueRegex, newActiveIssues);
fs.writeFileSync('src/server/siteOperations.ts', code);
