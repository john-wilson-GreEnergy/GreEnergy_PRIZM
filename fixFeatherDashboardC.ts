import fs from 'fs';

let content = fs.readFileSync('src/components/FeatherDashboard.tsx', 'utf8');

// Replace property usages
content = content.replace(/d\.avgCellTemperature/g, "d.temperatureCellC");
content = content.replace(/d\.thermostatStage/g, "d.hvacMode");

// Fix "Unknown Ethernet Node"
content = content.replace(/"Unknown Ethernet Node"/g, '"Unmapped"');

// Fix Array / String logic
// ARR / STR: arrayIndex/stringIndex from stringIPMap, ipMap, strings.csv, or topology
// If only array is known: Array X
// If unmapped: Unmapped
// If string known: Array X / String Y
const arrStrOld = `{d.arrayIndex !== null ? \`A-\${d.arrayIndex}\` : "N/A"} 
                        {d.stringIndex !== null ? \` / S-\${d.stringIndex}\` : ""}`;
const arrStrNew = `{d.arrayIndex !== undefined ? \`A-\${d.arrayIndex}\` : "Unmapped"} 
                        {d.stringIndex !== undefined ? \` / S-\${d.stringIndex}\` : ""}`;
content = content.replace(arrStrOld, arrStrNew);

// Fw Version logic: actual firmware/software version if found, Not reported if not present
const fwOld = `{d.reachable ? (d.firmwareVersion || "Unknown") : "n/a"}`;
const fwNew = `{d.firmwareVersion || d.softwareVersion || "Not reported"}`;
content = content.replace(fwOld, fwNew);

content = content.replace(/d\.batteryDoorsClosed/g, "d.raw?.directFeather?.batteryDoorsClosed");

// State: Normal / Warning / Alarm / Offline / Not reporting based on merged health
content = content.replace(/d\.operationalState === "NORMAL"/g, "(!d.alarmCount && !d.warningCount && d.reachable)");
content = content.replace(/d\.operationalState/g, "(d.reachable ? (d.alarmCount ? 'ALARM' : d.warningCount ? 'WARNING' : 'NORMAL') : (d.sourceCoverage.directFeather ? 'OFFLINE' : 'Not reporting'))");

content = content.replace(/selectedDevice.deviceIp/g, "selectedDevice.ip");

content = content.replace(/d.hydrogen1PPM/g, "d.raw?.directFeather?.hydrogen1PPM");
content = content.replace(/d\.lostComms/g, "d.raw?.directFeather?.lostComms");

fs.writeFileSync('src/components/FeatherDashboard.tsx', content);

console.log('Replacements 3 done');
