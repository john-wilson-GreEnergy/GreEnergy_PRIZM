import fs from 'fs';
let file = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

// move `const stringSummary` up
file = file.replace(/\/\/ Part I - Strings\n\s*const stringSummary = buildStringBucketSummary\(stringsData\);\n/, '');
file = file.replace('// Part H - Arrays', '// Part H - Arrays\n        const stringSummary = buildStringBucketSummary(stringsData);\n');

// array summary update
file = file.replace(
/let arrCands = bestArrCand;\s*let arraySummary = arrCands\.map\(\(a: any\) => \{[\s\S]*?raw: a\s*\};\s*\}\);/g,
`let arrCands = bestArrCand;
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
                 }
                 if (str.currentA !== null) arr.currentAmp.push(str.currentA);
                 if (str.powerkW !== null && str.powerkW !== undefined) arr.powerkW.push(str.powerkW);
             }
             
             for (const arr of Array.from(arraysMap.values())) {
                 if (arr.notCommunicationStringCount === arr.stringCount && arr.stringCount > 0) {
                      arr.communicating = false;
                 }
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
        }`);

fs.writeFileSync('src/server/siteOperations.ts', file);
console.log('Fixed array summary');
