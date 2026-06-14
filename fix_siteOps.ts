import fs from 'fs';

let file = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

// Move stringSummary before arraySummary so arraySummary can use it.
const stringSummaryRegex = /\/\/ Part I - Strings\n\s*const stringSummary = buildStringBucketSummary\(stringsData\);\n/;
const stringSummaryCode = `// Part I - Strings
        const stringSummary = buildStringBucketSummary(stringsData);
`;
file = file.replace(stringSummaryRegex, '');

// Insert stringSummary right before part H - Arrays
file = file.replace('// Part H - Arrays', stringSummaryCode + '\n        // Part H - Arrays');

// Now rewrite array summary to fallback to synthesized strings if arrCands has low score or is empty
// Let's replace the array summary computation chunk.
file = file.replace(
/(\s*let arrCands = bestArrCand;\n)(\s*let arraySummary = arrCands\.map.*?\s*}\);\n)/s,
`$1
        let arraySummarySource = "native";
        let arraySummary: any[] = [];
        
        if (arrCands.length === 0 || bestScore < 10) {
             arraySummarySource = "synthesized-from-strings";
             const arraysMap = new Map<number, any>();
             for (const str of stringSummary.tableRows) {
                 const arrId = str.arrayNumber ?? 0;
                 if (!arraysMap.has(arrId)) {
                     arraysMap.set(arrId, {
                         arrayIndex: arrId,
                         stringCount: 0,
                         onlineStringCount: 0,
                         nearlineStringCount: 0,
                         offlineStringCount: 0,
                         notCommunicationStringCount: 0,
                         onlineSOC: [],
                         nearlineSOC: [],
                         offlineSOC: [],
                         onlineAvailableKWh: [],
                         nearlineAvailableKWh: [],
                         offlineAvailableKWh: [],
                         powerkW: [],
                         currentAmp: [],
                         communicating: true
                     });
                 }
                 const arr = arraysMap.get(arrId);
                 arr.stringCount++;
                 if (str.bucket === 'online') { 
                     arr.onlineStringCount++; 
                     if (str.socPct !== null) arr.onlineSOC.push(str.socPct);
                     if (str.kWh !== null) arr.onlineAvailableKWh.push(str.kWh);
                 } else if (str.bucket === 'nearline') {
                     arr.nearlineStringCount++;
                     if (str.socPct !== null) arr.nearlineSOC.push(str.socPct);
                     if (str.kWh !== null) arr.nearlineAvailableKWh.push(str.kWh);
                 } else if (str.bucket === 'offline') {
                     arr.offlineStringCount++;
                     if (str.socPct !== null) arr.offlineSOC.push(str.socPct);
                     if (str.kWh !== null) arr.offlineAvailableKWh.push(str.kWh);
                 } else {
                     arr.notCommunicationStringCount++;
                     arr.communicating = false;
                 }
                 if (str.currentA !== null) arr.currentAmp.push(str.currentA);
                 // if kW is available we can push it, strings don't typically have kW but maybe they do.
             }
             
             for (const arr of Array.from(arraysMap.values())) {
                 const avgOrNull = (vals: number[]) => vals.length > 0 ? vals.reduce((a,b)=>a+b, 0) / vals.length : null;
                 const sumOrNull = (vals: number[]) => vals.length > 0 ? vals.reduce((a,b)=>a+b, 0) : null;
                 arraySummary.push({
                     arrayIndex: arr.arrayIndex,
                     communicating: arr.communicating,
                     stringCount: arr.stringCount,
                     onlineStringCount: arr.onlineStringCount,
                     nearlineStringCount: arr.nearlineStringCount,
                     offlineStringCount: arr.offlineStringCount,
                     notCommunicationStringCount: arr.notCommunicationStringCount,
                     onlineSOC: avgOrNull(arr.onlineSOC),
                     nearlineSOC: avgOrNull(arr.nearlineSOC),
                     offlineSOC: avgOrNull(arr.offlineSOC),
                     onlineAvailableKWh: sumOrNull(arr.onlineAvailableKWh),
                     nearlineAvailableKWh: sumOrNull(arr.nearlineAvailableKWh),
                     offlineAvailableKWh: sumOrNull(arr.offlineAvailableKWh),
                     powerkW: sumOrNull(arr.powerkW),
                     currentAmp: sumOrNull(arr.currentAmp),
                     friendlyString: 'Array ' + arr.arrayIndex,
                     sourcePath: 'synthesized',
                     raw: arr
                 });
             }
             // Sort by arrayIndex
             arraySummary.sort((a,b)=> a.arrayIndex - b.arrayIndex);
        } else {
             arraySummary = arrCands.map((a: any) => {
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
        }
`
);

// We need to replace the bessFleetSummary part. Lines from `const bessFleetSummary = {` to `       }

        const responseData = {`.

file = file.replace(/const bessFleetSummary = \{.*?\} else \{[\s\S]*?(?=const responseData = \{)/m, ''); // just in case
file = file.replace(/const bessFleetSummary = \{[\s\S]*?(?=const responseData = \{)/, `
        let fleetMetricSource = "native";
        
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
            avgCellVoltageMv: null as number | null,
            maxCellVoltageDeltaMv: null as number | null,
            avgCellTempC: null as number | null,
            maxCellTempDeltaC: null as number | null,
            sourceOk: stringSummary.buckets.online > 0 || stringSummary.buckets.offline > 0 || stringSummary.buckets.nearline > 0 || stringSummary.buckets.notCommunicating > 0,
            lastUpdated: new Date().toISOString()
        };

        if (stringSummary && stringSummary.tableRows && stringSummary.tableRows.length > 0) {
             fleetMetricSource = "stringSummary.tableRows";
             
             let maxVolt = -Infinity, minVolt = Infinity;
             let maxTemp = -Infinity, minTemp = Infinity;
             
             let avgVoltSum = 0, avgVoltCount = 0;
             let avgTempSum = 0, avgTempCount = 0;
             
             for (const str of stringSummary.tableRows) {
                 // only consider communicating strings
                 if (str.bucket === "notCommunicating") continue;
                 
                 const vAvg = str.avgCellVoltageMv;
                 const vMax = str.maxCellVoltageMv;
                 const vMin = str.minCellVoltageMv;
                 
                 const tAvg = str.avgTempRaw;
                 const tMax = str.maxTempRaw;
                 const tMin = str.minTempRaw;
                 
                 if (vAvg !== null) { avgVoltSum += vAvg; avgVoltCount++; }
                 if (tAvg !== null) { avgTempSum += tAvg; avgTempCount++; }
                 
                 if (vMax !== null && vMax > maxVolt) maxVolt = vMax;
                 if (vMin !== null && vMin < minVolt) minVolt = vMin;
                 
                 if (tMax !== null && tMax > maxTemp) maxTemp = tMax;
                 if (tMin !== null && tMin < minTemp) minTemp = tMin;
             }
             
             if (avgVoltCount > 0) bessFleetSummary.avgCellVoltageMv = avgVoltSum / avgVoltCount;
             if (avgTempCount > 0) bessFleetSummary.avgCellTempC = avgTempSum / avgTempCount;
             if (maxVolt !== -Infinity && minVolt !== Infinity) {
                 bessFleetSummary.maxCellVoltageDeltaMv = maxVolt - minVolt;
             }
             if (maxTemp !== -Infinity && minTemp !== Infinity) {
                 bessFleetSummary.maxCellTempDeltaC = maxTemp - minTemp;
             }
        }
        
`);

// Now insert debug fields into responseData
file = file.replace(/emsAppSourcePaths: emsAppSourcePaths,\n\s*unknownDragonAppCodes: unknownDragonAppCodes/,
`emsAppSourcePaths: emsAppSourcePaths,
               unknownDragonAppCodes: unknownDragonAppCodes,
               arraySummarySource,
               arraySummaryCandidateCount: arrCands.length,
               fleetMetricSource`
);

fs.writeFileSync('src/server/siteOperations.ts', file);
