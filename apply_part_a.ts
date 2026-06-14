import fs from 'fs';

let file = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

if (!file.includes('isCollectionSegmentFeather')) {
  file = file.replace('function getFeatherCellTemp', 
    'function isCollectionSegmentFeather(device: any): boolean {\\n' +
    '    const ip = device.deviceIp || device.ip || device.sourceIp || device.lastKnownIp || "";\\n' +
    '    const p = String(ip).split(".");\\n' +
    '    if (p.length !== 4) return false;\\n' +
    '    const lastOctet = Number(p.pop());\\n' +
    '    return Number.isFinite(lastOctet) && lastOctet === 3;\\n' +
    '}\\n' +
    'function getFeatherCellTemp');
}

if (!file.includes('featherCellTempExcludedCollectionSegments')) {
    const startIdx = file.indexOf('let maxCT: number | null = null;');
    const endIdxStr = '        const totalFeather = fDevices.length;';
    const endIdx = file.indexOf(endIdxStr);
    
    if (startIdx !== -1 && endIdx !== -1) {
        const replacement = 
        'let maxCT: number | null = null;\\n' +
        '        const devicesWithIssues: any[] = [];\\n' +
        '        let featherCellTempExcludedCollectionSegments = 0;\\n' +
        '        let featherCellTempIncludedDevices = 0;\\n\\n' +
        '        fDevices.forEach((f: any) => {\\n' +
        '            const hasLost = hasLostComms(f);\\n' +
        '            if (f.reachable || f.online || f.sourceOk) fOnline++; else fOffline++;\\n' +
        '            if (hasLost) fLostComms++;\\n' +
        '            const isFssInv = f.fssValid === false || f.thermalData?.fssSignals?.valid === false;\\n' +
        '            const isDoorsInv = f.doorsValid === false || f.doors?.valid === false;\\n' +
        '            const isHvacInv = f.mioValid === false || f.hvacDataValid === false || f.hvacValid === false;\\n' +
        '            if (isFssInv) fFssInv++;\\n' +
        '            if (isDoorsInv) fDoorsInv++;\\n' +
        '            if (isHvacInv) fHvacInv++;\\n' +
        '            fWarn += (f.warningCount || f.warningMessages?.length || f.warnInfo?.length || f.activeWarningInterlocks?.length || 0);\\n' +
        '            fFault += (f.alarmCount || f.faultMessages?.length || f.activeTripFaultLog?.length || f.activeAlarms?.length || 0);\\n' +
        '            if ((f.hydrogen1PPM ?? f.thermalData?.hydrogen1PPM) && (f.hydrogen1PPM ?? f.thermalData?.hydrogen1PPM) > maxH) maxH = (f.hydrogen1PPM ?? f.thermalData?.hydrogen1PPM);\\n' +
        '            const st = getFeatherSpaceTemp(f);\\n' +
        '            if (st !== null && !Number.isNaN(st)) maxST = maxST === null ? st : Math.max(maxST, st);\\n\\n' +
        '            const ct = getFeatherCellTemp(f);\\n' +
        '            if (isCollectionSegmentFeather(f)) {\\n' +
        '                 featherCellTempExcludedCollectionSegments++;\\n' +
        '            } else {\\n' +
        '                 if (ct !== null && !Number.isNaN(ct)) {\\n' +
        '                      maxCT = maxCT === null ? ct : Math.max(maxCT, ct);\\n' +
        '                 }\\n' +
        '                 featherCellTempIncludedDevices++;\\n' +
        '            }\\n\\n' +
        '            if (!f.reachable || hasLost || isFssInv || isDoorsInv || isHvacInv || (f.warningCount > 0) || (f.alarmCount > 0)) {\\n' +
        '                 devicesWithIssues.push(f);\\n' +
        '            }\\n' +
        '        });\\n\\n';
        file = file.substring(0, startIdx) + replacement + file.substring(endIdx);
    }
}

if (!file.includes('const correctiveActions: any[] = [];')) {
    const respDataIdx = file.indexOf('const responseData = {');
    if (respDataIdx !== -1) {
        const replacement2 = 
        '// Compute Corrective Actions Log\\n' +
        '        const correctiveActions: any[] = [];\\n' +
        '        const ignoredRegex = /oor|out of rotation|outrotation|contactor open|contactors open/i;\\n\\n' +
        '        // Process activeIssueGroups\\n' +
        '        activeIssueGroups.forEach((g: any) => {\\n' +
        '            if (ignoredRegex.test(g.faultName) || ignoredRegex.test(String(g.faultId))) return;\\n' +
        '            if (String(g.faultId) === "2534" || String(g.faultId) === "2561") return; // Skip known mapped OOR codes if missed\\n\\n' +
        '            let action = "Inspect affected device and review logs";\\n' +
        '            if (/door/i.test(g.faultName)) action = "Inspect and secure enclosure door";\\n' +
        '            else if (/comms|communication|reachable/i.test(g.faultName)) action = "Check device power/network path";\\n' +
        '            else if (/fss|fire/i.test(g.faultName)) action = "Inspect fire safety signal chain";\\n' +
        '            else if (/hvac|mio/i.test(g.faultName)) action = "Inspect HVAC controller and MIO status";\\n' +
        '            else if (/high cell temp|thermal/i.test(g.faultName)) action = "Inspect affected string/enclosure thermal conditions";\\n' +
        '            else if (/cell voltage|imbalance/i.test(g.faultName)) action = "Inspect BPC/cell imbalance and balancing status";\\n' +
        '            else if (g.source === "BPC" || /string/i.test(g.faultName)) action = "Open String List details and inspect BPC status";\\n\\n' +
        '            correctiveActions.push({\\n' +
        '                level: g.severity === "WARNING" ? "WARNING" : g.severity === "ALARM" ? "ALARM" : "FAULT",\\n' +
        '                source: g.source || "System",\\n' +
        '                fault: g.faultName,\\n' +
        '                object: g.sampleDevice || "Multiple",\\n' +
        '                details: "Affected units: " + g.occurrenceCount,\\n' +
        '                firstSeen: new Date().toISOString(),\\n' +
        '                count: g.occurrenceCount,\\n' +
        '                suggestedAction: action\\n' +
        '            });\\n' +
        '        });\\n\\n' +
        '        // Add source health errors\\n' +
        '        if (sourceHealth) {\\n' +
        '           sourceHealth.forEach((s: any) => {\\n' +
        '               if (!s.ok && s.error && s.error !== "NONE") {\\n' +
        '                   correctiveActions.push({\\n' +
        '                       level: "ALARM",\\n' +
        '                       source: s.type,\\n' +
        '                       fault: "Source Polling Failed",\\n' +
        '                       object: s.name,\\n' +
        '                       details: "Error: " + s.error,\\n' +
        '                       firstSeen: new Date().toISOString(),\\n' +
        '                       count: 1,\\n' +
        '                       suggestedAction: "Check remote node endpoint connectivity and path config"\\n' +
        '                   });\\n' +
        '               }\\n' +
        '           });\\n' +
        '        }\\n\\n' +
        '        const responseData = {\\n' +
        '            correctiveActions,\\n';
        file = file.substring(0, respDataIdx) + replacement2 + file.substring(respDataIdx + 'const responseData = {'.length);
    }
}

file = file.replace(/fleetMetricSource\\n\\s*\\}/, 'fleetMetricSource,\\n               featherCellTempExcludedCollectionSegments,\\n               featherCellTempIncludedDevices\\n            }');

fs.writeFileSync('src/server/siteOperations.ts', file);
console.log('Applied Site Operations correctly');
