import fs from 'fs';

let file = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

// 1. Add isCollectionSegmentFeather helper
const helperRegex = /function getFeatherCellTemp/;
if (file.match(helperRegex)) {
  file = file.replace(helperRegex, `function isCollectionSegmentFeather(device: any): boolean {
    const ip = device.deviceIp || device.ip || device.sourceIp || device.lastKnownIp || "";
    const p = String(ip).split(".");
    if (p.length !== 4) return false;
    const lastOctet = Number(p.pop());
    return Number.isFinite(lastOctet) && lastOctet === 3;
}
function getFeatherCellTemp`);
}

// 2. Fix maxCT calculation to exclude collection segment feathers and track debug variables
const featherLoopRegex = /let maxCT: number \| null = null;\n\s*const devicesWithIssues: any\[\] = \[\];\n\n\s*fDevices.forEach\(\(f: any\) => \{[\s\S]*?(?=const totalFeather = fDevices.length;)/;
const newFeatherLoop = `let maxCT: number | null = null;
        const devicesWithIssues: any[] = [];
        let featherCellTempExcludedCollectionSegments = 0;
        let featherCellTempIncludedDevices = 0;

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
            if (isCollectionSegmentFeather(f)) {
                 featherCellTempExcludedCollectionSegments++;
            } else {
                 if (ct !== null && !Number.isNaN(ct)) {
                      maxCT = maxCT === null ? ct : Math.max(maxCT, ct);
                 }
                 featherCellTempIncludedDevices++;
            }
            
            if (!f.reachable || hasLost || isFssInv || isDoorsInv || isHvacInv || (f.warningCount > 0) || (f.alarmCount > 0)) {
                 devicesWithIssues.push(f);
            }
        });
        `;
file = file.replace(featherLoopRegex, newFeatherLoop);

// 3. Add correctiveActions builder before responseData
const responseDataRegex = /const responseData = \{/;
const correctiveActionsLogic = `
        // Compute Corrective Actions Log
        const correctiveActions: any[] = [];
        const ignoredRegex = /oor|out of rotation|outrotation|contactor open|contactors open/i;

        // Process activeIssueGroups
        activeIssueGroups.forEach((g: any) => {
            if (ignoredRegex.test(g.faultName) || ignoredRegex.test(String(g.faultId))) return;
            if (String(g.faultId) === '2534' || String(g.faultId) === '2561') return; // Skip known mapped OOR codes if missed

            let action = "Inspect affected device and review logs";
            if (/door/i.test(g.faultName)) action = "Inspect and secure enclosure door";
            else if (/comms|communication|reachable/i.test(g.faultName)) action = "Check device power/network path";
            else if (/fss|fire/i.test(g.faultName)) action = "Inspect fire safety signal chain";
            else if (/hvac|mio/i.test(g.faultName)) action = "Inspect HVAC controller and MIO status";
            else if (/high cell temp|thermal/i.test(g.faultName)) action = "Inspect affected string/enclosure thermal conditions";
            else if (/cell voltage|imbalance/i.test(g.faultName)) action = "Inspect BPC/cell imbalance and balancing status";
            else if (g.source === "BPC" || /string/i.test(g.faultName)) action = "Open String List details and inspect BPC status";

            correctiveActions.push({
                level: g.severity === 'WARNING' ? 'WARNING' : g.severity === 'ALARM' ? 'ALARM' : 'FAULT',
                source: g.source || "System",
                fault: g.faultName,
                object: g.sampleDevice || 'Multiple',
                details: \`Affected units: \${g.occurrenceCount}\`,
                firstSeen: new Date().toISOString(),
                count: g.occurrenceCount,
                suggestedAction: action
            });
        });

        // Add source health errors
        sourceHealth.forEach((s: any) => {
            if (!s.ok && s.error) {
                correctiveActions.push({
                    level: 'ALARM',
                    source: s.type,
                    fault: 'Source Polling Failed',
                    object: s.name,
                    details: 'Error: ' + s.error,
                    firstSeen: new Date().toISOString(),
                    count: 1,
                    suggestedAction: 'Check remote node endpoint connectivity and path config'
                });
            }
        });

        const responseData = {
            correctiveActions,
`;
file = file.replace(responseDataRegex, correctiveActionsLogic);

// 4. Inject feather metrics debug info inside responseData debug field
const debugRegex = /fleetMetricSource\n\s*\}/;
file = file.replace(debugRegex, `fleetMetricSource,
               featherCellTempExcludedCollectionSegments,
               featherCellTempIncludedDevices
            }`);

fs.writeFileSync('src/server/siteOperations.ts', file);
