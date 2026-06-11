const fs = require('fs');

let siteOps = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

// PART A: remove getEmsCachedControllerStatistics
siteOps = siteOps.replace(/    getEmsCachedControllerStatistics,\s*/, '');

// PART B: deep-search lastCall
const appSearchReplacement = `
        if (!appsCandidates.length) appsCandidates.push(...findArraysByObjectKeys(lastCall, ["appCode", "appName"]));
        if (!appsCandidates.length) appsCandidates.push(...findArraysByObjectKeys(lastCall, ["appCode", "priority"]));
        if (!appsCandidates.length) appsCandidates.push(...findArraysByObjectKeys(lastCall, ["appCode", "configName"]));
        if (!appsCandidates.length) appsCandidates.push(...findArraysByObjectKeys(lastCall, ["appName", "configName"]));
`;
siteOps = siteOps.replace(/if \(!appsCandidates\.length\) appsCandidates = findArraysByObjectKeys\(status, \["appCode"\]\);/, 'if (!appsCandidates.length) appsCandidates = findArraysByObjectKeys(status, ["appCode"]);\n' + appSearchReplacement);

// PART C & D: helper functions for Feather
const featherHelpers = `
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
`;

siteOps = siteOps.replace(/function extractCodes/, featherHelpers + '\\nfunction extractCodes');

// Inject new helpers into feather summary block
siteOps = siteOps.replace(/if \(f\.lostComms \|\| f\.devicesWithLostComms\?\\.length > 0 \|\| f\.lostCommsDevices\?\\.length > 0 \|\| f\.deviceStatusComms\?\\.includes\('Lost'\)\)/g, 'if (hasLostComms(f))');
siteOps = siteOps.replace(/let maxT = null;/g, 'let maxT = null;\\n        let totalT = 0, countT = 0, tMax = -999;');
siteOps = siteOps.replace(/fDevices.forEach\(\(f: any\) => \{[\\s\\S]*?if \(maxT === null \|\| t > maxT\) maxT = t;[\\s\\S]*\}\);/, (match) => {
    return match.replace(/const t = Number\(f\.spaceTemp \|\| f\.spaceTemperature \|\| 0\);/g, 'const t = getFeatherSpaceTemp(f) ?? -999;');
});

// PART D (HTS updates)
siteOps = siteOps.replace(/const tempC = f\\.spaceTemperature \\?\\? f\\.spaceTemp \\?\\? f\\.temperature \\?\\? rt\\.spaceTemperature \\?\\? rt\\.spaceTemp \\?\\? rt\\.airTemp \\?\\? rt\\.temperature;/, 'const tempC = getFeatherSpaceTemp(f) ?? undefined;');
siteOps = siteOps.replace(/const hum = f\\.spaceHumidity \\?\\? f\\.humidity \\?\\? rt\\.spaceHumidity \\?\\? rt\\.humidity \\?\\? rt\\.relativeHumidity;/, 'const hum = getFeatherSpaceHumidity(f) ?? undefined;');

// PART F: warnings
siteOps = siteOps.replace(/const alarms = extractCodes\\(st\\.alarmCodes \\|\\| st\\.alarms \\|\\| st\\.alarmsList \\|\\| st\\.alarmCount\\);/, 'const alarms = extractCodes(st.alarmCodes || st.alarms || st.alarmsList);');
siteOps = siteOps.replace(/const warnings = extractCodes\\(st\\.warningCodes \\|\\| st\\.warnCodes \\|\\| st\\.warnings \\|\\| st\\.warns \\|\\| st\\.warningsList \\|\\| st\\.warningCount\\);/, 'const warnings = extractCodes(st.warningCodes || st.warnCodes || st.warnings || st.warns || st.warningsList);');

const genericWarnStr = `
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
`;

siteOps = siteOps.replace(/const enclosureLabel = \`Array \\\$\{st.arrayNumber \\|\\| st.array \\|\\| st.arrayIndex \\|\\| st.Array \\|\\| '\\?'\\\} ES\\\$\{st.stringNumber \\|\\| st.string \\|\\| st.stringIndex \\|\\| st.String \\|\\| '\\?'\\\}\`;/, \`
             const arrayNumber = st.arrayNumber ?? st.arrayIndex ?? st.array ?? st.Array ?? null;
             const stringNumber = st.stringNumber ?? st.stringIndex ?? st.string ?? st.String ?? null;
             const enclosureLabel = arrayNumber != null && stringNumber != null
               ? \\\`Array \\\${arrayNumber\} ES\\\${stringNumber\}\\\`
               : "Unknown String";
             \${genericWarnStr}
\`);

siteOps = siteOps.replace(/arrayNumber: st\\.arrayNumber, stringNumber: st\\.stringNumber/g, 'arrayNumber, stringNumber');

// PART G: bessFleetSummary
const bestFleetPopulateStr = `
        const bessFleetSummary: any = {
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
`;

siteOps = siteOps.replace(/        const responseData = \{/, bestFleetPopulateStr + '\\n        const responseData = {');
siteOps = siteOps.replace(/bessFleetSummary: \{\},/, 'bessFleetSummary,');

fs.writeFileSync('src/server/siteOperations.ts', siteOps);
console.log('Fixed');
