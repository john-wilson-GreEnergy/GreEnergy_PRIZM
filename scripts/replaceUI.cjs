const fs = require('fs');
let content = fs.readFileSync('src/components/SiteOperationsDashboard.tsx', 'utf8');

// replace PCS empty text
content = content.replace("No PCS data discovered", "No PCS data available from local EMS source.");

// replace HTS row rendering
const targetHTS = `{htsData.map((item: any, idx: number) => {
                                 let enclosure = "--";
                                 const ipMatch = (item.ip || item.hostAddress || item.address || "").match(/\\d+\\.\\d+\\.(\\d+)\\.(\\d+)/);
                                 if (ipMatch) {
                                     const arrNum = ipMatch[1];
                                     const host = parseInt(ipMatch[2], 10);
                                     if (host === 3) enclosure = \`Array \${arrNum} CS\`;
                                     else if (host >= 10 && host <= 50 && host % 5 === 0) {
                                         enclosure = \`Array \${arrNum} ES\${host}\`;
                                     } else {
                                         enclosure = \`Array \${arrNum} (.\${host})\`;
                                     }
                                 }
                                 // Fallback if there's an entityDescription from Feather
                                 if (item.entityDescription && enclosure === "--") {
                                     enclosure = item.entityDescription;
                                 }
                                 
                                 const tempVal = item.temperature !== undefined ? item.temperature : item.spaceTemp;
                                 const humVal = item.humidity !== undefined ? item.humidity : item.spaceHumidity;

                                 return (
                                     <tr key={idx} className="hover:bg-prizm-surface transition-colors">
                                         <td className="p-2 text-prizm-primary font-bold">{enclosure}</td>
                                         <td className="p-2 text-prizm-text">{item.id || item.ip || "--"}</td>
                                         <td className="p-2 text-prizm-text-muted">{item.deviceName || "Unknown Source"}</td>
                                         <td className="p-2 text-cyan-400 font-bold">{tempVal !== undefined ? \`\${Number(tempVal).toFixed(1)}°C\` : "--"}</td>
                                         <td className="p-2 text-emerald-400 font-bold">{humVal !== undefined ? \`\${Number(humVal).toFixed(1)}%\` : "--"}</td>
                                     </tr>
                                 );
                             })}`;

const replHTS = `{htsData.map((item: any, idx: number) => (
                                     <tr key={idx} className="hover:bg-prizm-surface transition-colors">
                                         <td className="p-2 text-prizm-primary font-bold">{item.enclosureLabel || "--"}</td>
                                         <td className="p-2 text-prizm-text">{item.sensorId || "--"}</td>
                                         <td className="p-2 text-prizm-text-muted">{item.sourceIp || item.deviceName || "--"}</td>
                                         <td className="p-2 text-cyan-400 font-bold">{item.temperatureC !== undefined && item.temperatureC !== null ? \`\${Number(item.temperatureC).toFixed(1)}°C\` : "--"}</td>
                                         <td className="p-2 text-emerald-400 font-bold">{item.humidityPct !== undefined && item.humidityPct !== null ? \`\${Number(item.humidityPct).toFixed(1)}%\` : "--"}</td>
                                     </tr>
                                 ))}`;

// I need to use strict replace but let's just do a regex for the map body to be safe
content = content.replace(/\{htsData\.map\(\(item: any, idx: number\) => \{[\s\S]*?return \([\s\S]*?\);\n\s*\}\)\}/m, replHTS);

// replace apps rendering to show configured status? The prompt says "EMS app names are blank... priority: 1. appName... "
// I already built `emsApps` mapping in the backend. Let's check the apps rendering.
const appsTarget = `{emsAppsData.map((app: any, idx: number) => (
                             <tr key={idx} className="hover:bg-prizm-surface transition-colors">
                                 <td className="p-2 text-prizm-primary font-bold">{app.appCode || "--"}</td>
                                 <td className="p-2 text-prizm-text whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px]">{app.appName || app.applicationName || app.name || "--"}</td>
                                 <td className="p-2 text-prizm-text-muted">{app.configName || "--"}</td>
                                 <td className="p-2">
                                     {app.enabled === false ? (
                                         <span className="bg-slate-500/20 text-slate-400 px-2 py-0.5 rounded">Not Enabled</span>
                                     ) : app.health === 'HEALTH_HEALTHY' ? (
                                         <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">Healthy</span>
                                     ) : app.health === 'HEALTH_WARNING' ? (
                                         <span className="bg-prizm-warning/20 text-prizm-warning px-2 py-0.5 rounded">Warning</span>
                                     ) : (
                                         <span className="bg-prizm-danger/20 text-prizm-danger px-2 py-0.5 rounded">{app.health || "Unknown"}</span>
                                     )}
                                 </td>
                             </tr>
                         ))}`;

const replApps = `{emsAppsData.map((app: any, idx: number) => (
                             <tr key={idx} className="hover:bg-prizm-surface transition-colors">
                                 <td className="p-2 text-prizm-primary font-bold">{app.appCode || "--"}</td>
                                 <td className="p-2 text-prizm-text whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px]" title={app.appName}>{app.appName || "--"}</td>
                                 <td className="p-2 text-prizm-text-muted">{app.configName || "--"}</td>
                                 <td className="p-2">
                                     <span className={\`px-2 py-0.5 rounded \${
                                          app.status === 'Enabled' ? 'bg-emerald-500/20 text-emerald-400' :
                                          app.status === 'Not Enabled' ? 'bg-slate-500/20 text-slate-400' :
                                          app.status === 'Warning' ? 'bg-prizm-warning/20 text-prizm-warning' :
                                          app.status === 'Faulted' ? 'bg-prizm-danger/20 text-prizm-danger' :
                                          'bg-slate-500/20 text-slate-400'
                                     }\`}>
                                         {app.status || "Unknown"}
                                     </span>
                                 </td>
                             </tr>
                         ))}`;
content = content.replace(/\{emsAppsData\.map\(\(\s*app:\s*any,\s*idx:\s*number\s*\)\s*=>\s*\([\s\S]*?\)[\s\r\n]*\)\}/m, replApps);

fs.writeFileSync('src/components/SiteOperationsDashboard.tsx', content);
console.log('Successfully updated component UI components for HTS and Apps');
