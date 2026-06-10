import React, { useState, useEffect } from "react";
import { ArrowLeft, RefreshCw, Download, AlertTriangle, Layers, Cpu, Zap, Activity, Thermometer } from "lucide-react";

export default function StringDetailDashboard({ stringData, onBack }: { stringData: any, onBack: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unmounted = false;
    const fetchDetail = async () => {
      try {
        const res = await fetch(`/api/local/strings/${stringData.arrayNumber}/${stringData.stringNumber}/detail`);
        if (res.ok && !unmounted) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error("Failed to fetch string detail", err);
      } finally {
        if (!unmounted) setLoading(false);
      }
    };
    fetchDetail();
    // Detail could also auto-refresh, but we'll leave it as one-off or simple interval
    const interval = setInterval(fetchDetail, 5000);
    return () => {
      unmounted = true;
      clearInterval(interval);
    };
  }, [stringData.arrayNumber, stringData.stringNumber]);

  if (!data && loading) {
    return (
       <div className="flex-1 flex flex-col h-full bg-prizm-bg p-6">
         <button onClick={onBack} className="text-prizm-text-muted hover:text-prizm-text flex items-center gap-2 font-mono text-xs mb-6 w-fit">
            <ArrowLeft size={14} /> BACK TO STRINGS
         </button>
         <div className="flex-1 flex flex-col items-center justify-center p-8 text-prizm-text-muted font-mono">
            <RefreshCw className="animate-spin mb-4 text-prizm-primary" size={32} />
            <span className="text-xs font-bold tracking-widest uppercase">Fetching detail for {stringData.stringKey}...</span>
         </div>
       </div>
    );
  }

  const s = stringData;
  const { voltageMatrix = [], temperatureMatrix = [], notificationMatrix = [], balancingDetails = [], notifications = [], eventLogs = [] } = data || {};

  const downloadMatrixCsv = (matrix: any[], name: string) => {
    if (!matrix || matrix.length === 0) return;
    const csvRows = [];
    csvRows.push(["BPC Index", ...Array.from({length: matrix[0]?.length || 0}, (_,i) => `Cell ${i+1}`)].join(','));
    matrix.forEach((row, rIdx) => {
        csvRows.push([`BPC ${rIdx+1}`, ...row].join(','));
    });
    const blob = new Blob([csvRows.join('\\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${stringData.stringKey}_${name}_${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasVoltageMatrix = Array.isArray(voltageMatrix) && voltageMatrix.some(r => Array.isArray(r) && r.length > 0);
  const hasTempMatrix = Array.isArray(temperatureMatrix) && temperatureMatrix.some(r => Array.isArray(r) && r.length > 0);
  const hasNotifMatrix = Array.isArray(notificationMatrix) && notificationMatrix.some((r: any) => Array.isArray(r) && r.length > 0);

  const getVoltageColor = (v: number) => {
       if (v > 3600) return "bg-prizm-danger text-prizm-bg font-bold animate-pulse";
       if (v > 3500) return "bg-prizm-warning text-black font-bold";
       if (v < 2800) return "bg-prizm-danger text-white font-bold animate-pulse";
       if (v < 3000) return "bg-prizm-warning text-black font-bold";
       return "bg-black/20 text-emerald-400 group-hover:bg-black/40";
  };

  const getTempColor = (t: number) => {
       if (t > 45) return "bg-prizm-danger text-white font-bold animate-pulse";
       if (t > 40) return "bg-prizm-warning text-black font-bold";
       if (t < 5) return "bg-blue-500 text-white font-bold";
       return "bg-black/20 text-prizm-text group-hover:bg-black/40";
  };

  return (
    <div className="flex-1 flex overflow-hidden flex-col font-sans transition-all h-full bg-prizm-bg">
      <div className="flex-1 overflow-y-auto no-scrollbar p-4 sm:p-6 pb-20">
          <div className="flex justify-between items-center mb-6 shrink-0 font-mono">
            <button onClick={onBack} className="text-prizm-text-muted hover:text-prizm-text flex items-center gap-2 text-xs font-bold transition-colors">
                <ArrowLeft size={14} /> BACK TO STRINGS
            </button>
            <div className="text-xs text-prizm-text-muted flex gap-4">
                <span>{s.stringControllerIp}</span>
                <span>FW: {s.stringControllerFirmware || "Unknown"}</span>
            </div>
          </div>

          {/* Top summary strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6 shrink-0 text-center font-mono select-none">
            <div className="bg-prizm-surface-strong border border-prizm-border rounded p-2 flex flex-col justify-center">
              <span className="text-[9px] text-prizm-text-muted uppercase">Array / String</span>
              <span className="text-sm font-bold text-prizm-text">{s.arrayNumber} / {s.stringNumber}</span>
            </div>
            <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
              <span className="text-[9px] text-prizm-text-muted uppercase">Contact / Rot</span>
              <span className="text-[11px] font-bold text-prizm-text mt-0.5"><span className={s.contactorClosed ? "text-emerald-400" : "text-prizm-text-muted"}>{s.contactorStatus}</span> | <span className={s.rotationEnabled ? "text-emerald-400" : "text-prizm-warning"}>{s.rotationStatus}</span></span>
            </div>
            <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
              <span className="text-[9px] text-prizm-text-muted uppercase">SOC / Energy</span>
              <span className="text-[11px] font-bold text-prizm-info mt-0.5">{s.socPct}% | {s.kwh}kWh</span>
            </div>
            <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
              <span className="text-[9px] text-prizm-text-muted uppercase">Power / Amps</span>
              <span className="text-[11px] font-bold text-prizm-text mt-0.5">{s.kw}kW | {s.amps}A</span>
            </div>
            <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
              <span className="text-[9px] text-prizm-text-muted uppercase leading-tight">Voltages (Meas/Calc)</span>
               <span className="text-[11px] font-bold text-prizm-text mt-0.5">{s.measuredVoltage}V / {s.calculatedVoltage}V</span>
            </div>
            <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
              <span className="text-[9px] text-prizm-text-muted uppercase leading-tight">Cell Bounds</span>
              <span className="text-[11px] font-bold text-prizm-text mt-0.5">{s.minCellVoltage}V &rarr; {s.maxCellVoltage}V</span>
            </div>
            <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
               <span className="text-[9px] text-prizm-text-muted uppercase leading-tight">Temp Bounds</span>
               <span className="text-[11px] font-bold text-prizm-text mt-0.5">{s.minCellTemperature}° &rarr; {s.maxCellTemperature}°</span>
            </div>
            <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
              <span className="text-[9px] text-prizm-text-muted uppercase leading-tight">Container / BPCs</span>
              <span className="text-[11px] font-bold text-prizm-text mt-0.5">{s.container || s.location} | {s.bpcCount} BPCs</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Voltage Matrix */}
              <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 flex flex-col">
                  <div className="flex justify-between items-center mb-4">
                     <h3 className="font-mono text-xs font-bold text-prizm-primary flex items-center gap-2 uppercase tracking-wide">
                         <Zap size={14} /> Array {s.arrayNumber} - String {s.stringNumber} - Voltage
                     </h3>
                     {hasVoltageMatrix && (
                        <button onClick={() => downloadMatrixCsv(voltageMatrix, "Voltage_Matrix")} className="text-prizm-text-muted hover:text-prizm-text">
                           <Download size={14} />
                        </button>
                     )}
                  </div>
                  
                  {hasVoltageMatrix ? (
                      <div className="overflow-x-auto no-scrollbar pb-2">
                         <div className="flex flex-col gap-1 font-mono text-[9px]">
                             {voltageMatrix.map((row: number[], bpcIdx: number) => (
                                 <div key={bpcIdx} className="flex gap-1 group whitespace-nowrap items-center">
                                     <div className="w-10 text-prizm-text-muted font-bold">B{bpcIdx + 1}</div>
                                     {row.map((v, cIdx) => (
                                         <div 
                                            key={cIdx} 
                                            title={`Cell ${cIdx + 1}: ${v} mV`}
                                            className={`w-10 h-6 flex items-center justify-center rounded cursor-help transition-colors ${getVoltageColor(v)}`}
                                         >
                                             {v}
                                         </div>
                                     ))}
                                 </div>
                             ))}
                         </div>
                      </div>
                  ) : (
                      <div className="flex-1 flex items-center justify-center text-xs font-mono text-prizm-text-muted border border-dashed border-prizm-border/50 rounded bg-black/10 py-12">
                          Granular BPC/cell-group matrix data not available from current local EMS source.
                      </div>
                  )}
              </div>

              {/* Temperature Matrix */}
              <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 flex flex-col">
                  <div className="flex justify-between items-center mb-4">
                     <h3 className="font-mono text-xs font-bold text-prizm-warning flex items-center gap-2 uppercase tracking-wide">
                         <Thermometer size={14} /> Array {s.arrayNumber} - String {s.stringNumber} - Temperature
                     </h3>
                     {hasTempMatrix && (
                        <button onClick={() => downloadMatrixCsv(temperatureMatrix, "Temperature_Matrix")} className="text-prizm-text-muted hover:text-prizm-text">
                           <Download size={14} />
                        </button>
                     )}
                  </div>
                  
                  {hasTempMatrix ? (
                      <div className="overflow-x-auto no-scrollbar pb-2">
                         <div className="flex flex-col gap-1 font-mono text-[9px]">
                             {temperatureMatrix.map((row: number[], bpcIdx: number) => (
                                 <div key={bpcIdx} className="flex gap-1 group whitespace-nowrap items-center">
                                     <div className="w-10 text-prizm-text-muted font-bold">B{bpcIdx + 1}</div>
                                     {row.map((t, cIdx) => (
                                         <div 
                                            key={cIdx} 
                                            title={`Cell ${cIdx + 1}: ${t}°C`}
                                            className={`w-8 h-6 flex items-center justify-center rounded cursor-help transition-colors ${getTempColor(t)}`}
                                         >
                                             {t}
                                         </div>
                                     ))}
                                 </div>
                             ))}
                         </div>
                      </div>
                  ) : (
                      <div className="flex-1 flex items-center justify-center text-xs font-mono text-prizm-text-muted border border-dashed border-prizm-border/50 rounded bg-black/10 py-12">
                          Granular BPC/cell-group matrix data not available from current local EMS source.
                      </div>
                  )}
              </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
             {/* Balancing */}
             <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 flex flex-col">
                 <h3 className="font-mono text-xs font-bold text-prizm-info flex items-center gap-2 mb-4 uppercase tracking-wide">
                    <Activity size={14} /> Array {s.arrayNumber} - String {s.stringNumber} - Balancing Details
                 </h3>
                 {balancingDetails.length > 0 ? (
                     <div className="overflow-x-auto no-scrollbar">
                        <table className="w-full text-left text-[10px] font-mono whitespace-nowrap">
                           <thead className="bg-black/20 text-prizm-text-muted">
                              <tr>
                                 <th className="p-2 border-b border-prizm-border">BP Index</th>
                                 <th className="p-2 border-b border-prizm-border">Mode</th>
                                 <th className="p-2 border-b border-prizm-border">State</th>
                                 <th className="p-2 border-b border-prizm-border">Active CG</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-prizm-border/20">
                               {balancingDetails.map((b: any, i: number) => (
                                   <tr key={i} className="hover:bg-black/10">
                                       <td className="p-2">{b.index !== undefined ? `B${b.index}` : `B${i+1}`}</td>
                                       <td className="p-2">{b.mode !== undefined ? b.mode : "--"}</td>
                                       <td className="p-2">
                                           {b.state === "BALANCING" ? <span className="text-emerald-400 font-bold animate-pulse">BALANCING</span> : <span className="text-prizm-text-muted">{b.state || "IDLE"}</span>}
                                       </td>
                                       <td className="p-2">{b.targetCellGroup !== undefined ? `C${b.targetCellGroup}` : (b.balancingActive ? "ACTIVE" : "--")}</td>
                                   </tr>
                               ))}
                           </tbody>
                        </table>
                     </div>
                 ) : (
                     <div className="flex-1 flex items-center justify-center text-xs font-mono text-prizm-text-muted border border-dashed border-prizm-border/50 rounded bg-black/10 py-12">
                          No balancing data available from current local EMS source.
                     </div>
                 )}
             </div>

             {/* Notifications */}
             <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 flex flex-col">
                 <h3 className="font-mono text-xs font-bold text-prizm-danger flex items-center gap-2 mb-4 uppercase tracking-wide">
                    <AlertTriangle size={14} /> Array {s.arrayNumber} - String {s.stringNumber} - Notification List
                 </h3>
                 {notifications.length > 0 ? (
                     <div className="overflow-x-auto no-scrollbar max-h-[300px]">
                        <table className="w-full text-left text-[10px] font-mono whitespace-nowrap">
                           <thead className="bg-black/20 text-prizm-text-muted sticky top-0">
                              <tr>
                                 <th className="p-2 border-b border-prizm-border">Code/Level</th>
                                 <th className="p-2 border-b border-prizm-border">Message</th>
                                 <th className="p-2 border-b border-prizm-border">Timestamp</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-prizm-border/20">
                               {notifications.map((n: any, i: number) => (
                                   <tr key={i} className="hover:bg-black/10">
                                       <td className="p-2">
                                           <span className={`px-1.5 py-0.5 rounded font-bold ${n.code === 'ALARM' ? 'bg-prizm-danger/20 text-prizm-danger' : 'bg-prizm-warning/20 text-prizm-warning'}`}>
                                               {n.code || n.level || "WARN"}
                                           </span>
                                       </td>
                                       <td className="p-2 whitespace-normal break-words">{n.message || n.text || String(n)}</td>
                                       <td className="p-2 text-prizm-text-muted">{n.timestamp || s.timestampUtc}</td>
                                   </tr>
                               ))}
                           </tbody>
                        </table>
                     </div>
                 ) : (
                     <div className="flex-1 flex flex-col items-center justify-center text-xs font-mono text-prizm-text-muted border border-dashed border-emerald-500/30 rounded bg-emerald-500/5 py-12">
                          <span className="text-emerald-400 font-bold mb-2 text-lg">●</span>
                          No active notifications or faults.
                     </div>
                 )}
             </div>
          </div>

          {/* Event Logs */}
          <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 flex flex-col">
              <h3 className="font-mono text-xs font-bold text-prizm-text flex items-center gap-2 mb-4 uppercase tracking-wide">
                <Layers size={14} className="text-prizm-text-muted" /> Array {s.arrayNumber} - String {s.stringNumber} - Event Logs
              </h3>
              {eventLogs.length > 0 ? (
                  <div className="overflow-x-auto no-scrollbar max-h-[300px]">
                        <table className="w-full text-left text-[10px] font-mono whitespace-nowrap">
                           <thead className="bg-black/20 text-prizm-text-muted sticky top-0">
                              <tr>
                                 <th className="p-2 border-b border-prizm-border">Category</th>
                                 <th className="p-2 border-b border-prizm-border">Message</th>
                                 <th className="p-2 border-b border-prizm-border">Timestamp</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-prizm-border/20">
                               {eventLogs.map((e: any, i: number) => (
                                   <tr key={i} className="hover:bg-black/10">
                                       <td className="p-2 text-prizm-text-muted">{e.category || "General"}</td>
                                       <td className="p-2">{e.message || e.text || "Unknown Event"}</td>
                                       <td className="p-2 text-prizm-text-muted">{e.timestamp || s.timestampUtc}</td>
                                   </tr>
                               ))}
                           </tbody>
                        </table>
                     </div>
              ) : (
                  <div className="flex-1 flex items-center justify-center text-xs font-mono text-prizm-text-muted border border-dashed border-prizm-border/50 rounded bg-black/10 py-12">
                       No event logs available from current local EMS sources.
                  </div>
              )}
          </div>
      </div>
    </div>
  );
}
