const fs = require('fs');
let code = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

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
