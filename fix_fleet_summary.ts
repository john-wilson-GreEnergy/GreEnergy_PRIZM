import fs from 'fs';
let file = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

file = file.replace(
/const bessFleetSummary = \{[\s\S]*?\s*const responseData = \{/s,
`let fleetMetricSource = "native";
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
                 if (str.bucket === "notCommunicating" || str.bucket === "offline") continue;
                 
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

        const responseData = {`
);

fs.writeFileSync('src/server/siteOperations.ts', file);
console.log('Fixed fleet summary');
