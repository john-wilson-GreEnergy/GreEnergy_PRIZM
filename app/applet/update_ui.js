const fs = require('fs');

const file = '/app/applet/src/components/SiteOperationsDashboard.tsx';
let code = fs.readFileSync(file, 'utf8');

function replaceSection(title, newContent) {
   const startMarkup = `<CollapsibleSection title="${title}"`;
   const startIdx = code.indexOf(startMarkup);
   if (startIdx < 0) {
      console.error(`Section ${title} not found!`);
      return;
   }
   const endMarkup = `</CollapsibleSection>`;
   const nextEndIdx = code.indexOf(endMarkup, startIdx);
   if (nextEndIdx < 0) return;
   
   const prefix = code.slice(0, startIdx);
   const postfix = code.slice(nextEndIdx + endMarkup.length);
   code = prefix + startMarkup + newContent + "</CollapsibleSection>" + postfix;
}

replaceSection("Array Summary", ` icon={BatteryMedium} defaultExpanded={true}>
                 {arraySummaryData.length > 0 ? (
                     <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                         <thead className="bg-black/40 text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border">
                             <tr>
                                 <th className="p-2 font-bold min-w-[120px]">Array</th>
                                 <th className="p-2 font-bold text-center border-l border-prizm-border">Comm</th>
                                 <th className="p-2 font-bold text-center border-l border-prizm-border">Strings</th>
                                 <th className="p-2 font-bold text-center border-l border-prizm-border">On/N/Off/NC</th>
                                 <th className="p-2 font-bold text-center border-l border-prizm-border">Rot In/Out</th>
                                 <th className="p-2 font-bold text-center border-l border-prizm-border text-emerald-400">Conn SOC</th>
                                 <th className="p-2 font-bold text-center border-l border-prizm-border text-prizm-text-muted">Not Conn SOC</th>
                                 <th className="p-2 font-bold text-center border-l border-prizm-border text-prizm-text-muted">Not Conn kWh</th>
                                 <th className="p-2 font-bold text-center border-l border-prizm-border">Power kW</th>
                                 <th className="p-2 font-bold text-center border-l border-prizm-border">Current A</th>
                                 <th className="p-2 font-bold text-center border-l border-prizm-border">Cell Min/Avg/Max</th>
                                 <th className="p-2 font-bold text-center border-l border-prizm-border">Chg/Dis Lim</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-prizm-border">
{arraySummaryData.map((arr: any, idx: number) => {
    const formatSOC = (val: any) => { if (val === null || val === undefined) return "--"; return Number(val).toFixed(1) + " %"; }; 
    const formatVal = (val: any, s: string = "") => { if (val === null || val === undefined) return "--"; return Number(val).toFixed(1) + (s ? " " + s : ""); };
    const formatInt = (val: any) => { if (val === null || val === undefined) return "--"; return Math.round(Number(val)) + ""; };
    return (
        <tr key={idx} className="hover:bg-prizm-surface transition-colors cursor-pointer" onClick={() => navigate("arrays-strings")}>
            <td className="p-2 text-prizm-primary font-bold">{arr.displayName}</td>
            <td className="p-2 text-center text-emerald-400 border-l border-prizm-border">{arr.communicating ? "OK" : <XOctagon size={12} className="inline text-prizm-danger" />}</td>
            <td className="p-2 text-center border-l border-prizm-border text-prizm-text">{formatInt(arr.stringCount)}</td>
            <td className="p-2 text-center border-l border-prizm-border">
                <span className="text-emerald-400">{formatInt(arr.onlineStringCount)}</span> / <span className="text-emerald-300">{formatInt(arr.nearlineStringCount)}</span> / <span className="text-prizm-text-muted">{formatInt(arr.offlineStringCount)}</span> / <span className="text-prizm-danger">{formatInt(arr.notCommunicationStringCount)}</span>
            </td>
            <td className="p-2 text-center border-l border-prizm-border">
                {formatInt(arr.inRotationCount)} / <span className="text-prizm-danger">{formatInt(arr.outOfRotationCount)}</span>
            </td>
            <td className="p-2 text-center border-l border-prizm-border text-emerald-400">{formatSOC(arr.connectedSocPct)}</td>
            <td className="p-2 text-center border-l border-prizm-border text-prizm-text-muted">{formatSOC(arr.notConnectedSocPct)}</td>
            <td className="p-2 text-center border-l border-prizm-border text-prizm-text-muted">{formatInt(arr.notConnectedKWh)}</td>
            <td className="p-2 text-center border-l border-prizm-border text-prizm-warning">{formatVal(arr.powerkW)}</td>
            <td className="p-2 text-center border-l border-prizm-border text-prizm-warning">{formatVal(arr.currentAmp)}</td>
            <td className="p-2 text-center border-l border-prizm-border text-prizm-text">{formatInt(arr.minCellVoltageMv)} / {" "} {formatInt(arr.avgCellVoltageMv)} / {" "} {formatInt(arr.maxCellVoltageMv)}</td>
            <td className="p-2 text-center border-l border-prizm-border text-prizm-text">{formatVal(arr.maxAllowedChargeCurrent)} / {formatVal(arr.maxAllowedDischargeCurrent)}</td>
        </tr>
    );
})}
                         </tbody>
                     </table>
                 ) : (
                     <div className="p-4 text-[10px] font-mono uppercase text-prizm-text-muted">No Array Summary available</div>
                 )}
            `);

replaceSection("Feather Devices / HVAC Summary", ` icon={Fan} defaultExpanded={false}>
                 {htsData && htsData.length > 0 ? (
                     <div className="overflow-x-auto w-full">
                         <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                             <thead className="bg-black/40 text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border sticky top-0">
                                 <tr>
                                     <th className="p-2 font-bold min-w-[200px]">Enclosure</th>
                                     <th className="p-2 font-bold border-l border-prizm-border text-center">Comm</th>
                                     <th className="p-2 font-bold border-l border-prizm-border text-center">Air / Space °C</th>
                                     <th className="p-2 font-bold border-l border-prizm-border text-center">Avg Cell °C</th>
                                     <th className="p-2 font-bold border-l border-prizm-border text-center">Humidity %</th>
                                     <th className="p-2 font-bold border-l border-prizm-border text-center">H2 ppm</th>
                                     <th className="p-2 font-bold border-l border-prizm-border">Doors</th>
                                 </tr>
                             </thead>
                             <tbody className="divide-y divide-prizm-border">
                                {htsData.map((f: any, idx: number) => {
                                    const formatVal = (val: any) => val !== null && val !== undefined ? Number(val).toFixed(1) : "--";
                                    return (
                                     <tr key={idx} className="hover:bg-prizm-surface transition-colors cursor-pointer" onClick={() => navigate("feather-devices")}>
                                         <td className="p-2 text-prizm-primary font-bold">{f.enclosureLabel}</td>
                                         <td className="p-2 text-center border-l border-prizm-border">{f.communicating ? <span className="text-emerald-400">OK</span> : <XOctagon size={12} className="inline text-prizm-danger" />}</td>
                                         <td className="p-2 text-center border-l border-prizm-border text-prizm-text">{formatVal(f.temperatureC)}</td>
                                         <td className="p-2 text-center border-l border-prizm-border text-prizm-text">{formatVal(f.avgCellTemperatureC)}</td>
                                         <td className="p-2 text-center border-l border-prizm-border text-blue-400">{formatVal(f.humidityPct)}</td>
                                         <td className="p-2 text-center border-l border-prizm-border text-purple-400">{formatVal(f.hydrogen1PPM)}</td>
                                         <td className="p-2 border-l border-prizm-border text-prizm-text-muted">{f.doors && f.doors.length > 0 ? f.doors.join(", ") : "Closed"}</td>
                                     </tr>
                                    );
                                })}
                             </tbody>
                         </table>
                     </div>
                 ) : (
                     <div className="p-4 text-[10px] font-mono uppercase text-prizm-text-muted">No Enclosure Environmental Data</div>
                 )}
            `);

replaceSection("Array PCS Summary", ` icon={Zap} defaultExpanded={false}>
                 {pcsData && pcsData.length > 0 ? (
                     <div className="overflow-x-auto w-full">
                         <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                             <thead className="bg-black/40 text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border sticky top-0">
                                 <tr>
                                     <th className="p-2 font-bold min-w-[200px]">PCS</th>
                                     <th className="p-2 font-bold text-center border-l border-prizm-border">State</th>
                                     <th className="p-2 font-bold text-center border-l border-prizm-border">Ready</th>
                                     <th className="p-2 font-bold text-center border-l border-prizm-border">Rotation</th>
                                     <th className="p-2 font-bold text-center border-l border-prizm-border">DC Voltage</th>
                                     <th className="p-2 font-bold text-center border-l border-prizm-border">DC Current</th>
                                     <th className="p-2 font-bold text-center border-l border-prizm-border">Real kW</th>
                                     <th className="p-2 font-bold text-center border-l border-prizm-border">React kVAR</th>
                                     <th className="p-2 font-bold text-center border-l border-prizm-border">Freq Hz</th>
                                     <th className="p-2 font-bold text-center border-l border-prizm-border">AC Voltage</th>
                                     <th className="p-2 font-bold text-center border-l border-prizm-border">AC Current</th>
                                 </tr>
                             </thead>
                             <tbody className="divide-y divide-prizm-border">
{pcsData.map((p: any, idx: number) => {
    const formatVal = (val: any) => val !== null && val !== undefined ? Number(val).toFixed(1) : "--";
    const name = ("Array " + (p.arrayIndex ?? "?")) + " PCS " + (p.pcsIndex ?? "?");
    return (
        <tr key={idx} className="hover:bg-prizm-surface transition-colors cursor-pointer">
            <td className="p-2 text-prizm-primary font-bold">{name}</td>
            <td className="p-2 text-center border-l border-prizm-border font-bold text-emerald-400">{p.state || "--"}</td>
            <td className="p-2 text-center border-l border-prizm-border">{p.ready === true ? "Ready" : <span className="text-prizm-danger">No</span>}</td>
            <td className="p-2 text-center border-l border-prizm-border">{p.rotation || "--"}</td>
            <td className="p-2 text-center border-l border-prizm-border text-prizm-text">{formatVal(p.dcVoltage)}</td>
            <td className="p-2 text-center border-l border-prizm-border text-prizm-warning">{formatVal(p.dcCurrent)}</td>
            <td className="p-2 text-center border-l border-prizm-border text-emerald-300">{formatVal(p.acRealPowerKw)}</td>
            <td className="p-2 text-center border-l border-prizm-border text-purple-300">{formatVal(p.acReactivePowerKvar)}</td>
            <td className="p-2 text-center border-l border-prizm-border text-prizm-text">{formatVal(p.frequencyHz)}</td>
            <td className="p-2 text-center border-l border-prizm-border text-prizm-text">{formatVal(p.acVoltage)}</td>
            <td className="p-2 text-center border-l border-prizm-border text-prizm-text">{formatVal(p.acCurrent)}</td>
        </tr>
    );
})}
                             </tbody>
                         </table>
                     </div>
                 ) : (
                     <div className="p-4 text-[10px] font-mono uppercase text-prizm-text-muted">No PCS Summary available</div>
                 )}
            `);

let h2fix = code.indexOf('f.hydrogen1PPM !== undefined ?');
if (h2fix > 0) {
    // we already replaced the feather devices section, so this is handled
}

fs.writeFileSync(file, code);
