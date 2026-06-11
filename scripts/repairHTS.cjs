const fs = require('fs');
let siteOps = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

const htsReplaceStr = `        const htsSummary: any[] = [];
        fDevices.forEach((f: any) => {
             const rt = f.rawResponse?.thermalData || f.rawResponse || {};
             const tempC = f.spaceTemperature ?? f.spaceTemp ?? f.temperature ?? rt.spaceTemperature ?? rt.spaceTemp ?? rt.airTemp ?? rt.temperature;
             const hum = f.spaceHumidity ?? f.humidity ?? rt.spaceHumidity ?? rt.humidity ?? rt.relativeHumidity;
             if (tempC !== undefined || hum !== undefined) {
                 const srcIp = f.deviceIp || f.ip;
                 let enc = f.enclosureLabel || f.entityDescription || f.entityName;
                 if (!enc) {
                     if (f.arrayIndex != null && f.stringIndex != null) {
                        enc = \`Array \${f.arrayIndex} ES\${f.stringIndex}\`;
                     } else if (srcIp) {
                        const parts = srcIp.split('.');
                        if (parts.length === 4) {
                             const arr = parseInt(parts[2], 10);
                             const h = parseInt(parts[3], 10);
                             if (!isNaN(arr) && !isNaN(h)) {
                                  if (h === 3) enc = \`Array \${arr} CS\`;
                                  else if (h >= 10 && h <= 50 && (h - 10) % 5 === 0) {
                                       enc = \`Array \${arr} ES\${((h - 10) / 5) + 1}\`;
                                  }
                             }
                        }
                     }
                 }
                 htsSummary.push({
                     enclosureLabel: enc || "Unknown Enclosure",
                     sensorId: srcIp,
                     sourceIp: srcIp,
                     deviceName: f.deviceType || "Feather",
                     entityDescription: f.entityName || null,
                     arrayIndex: f.arrayIndex ?? null,
                     stringIndex: f.stringIndex ?? null,
                     temperatureC: tempC,
                     humidityPct: hum,
                     source: "feather",
                     raw: f
                 });
             }
        });`;

siteOps = siteOps.replace(/const htsSummary: any\[\] = \[\];[\s\S]*?raw: f\s*\}\);\s*\}\s*\}\);/, htsReplaceStr);

fs.writeFileSync('src/server/siteOperations.ts', siteOps);
console.log("Updated HTS parsing.");
