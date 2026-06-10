import React, { useState, useEffect } from "react";
import { ArrowLeft, RefreshCw, Download, AlertTriangle, Layers, Cpu, Zap, Activity, Thermometer } from "lucide-react";

export default function StringDetailDashboard({ stringData, onBack }: { stringData: any, onBack: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    let unmounted = false;
    const fetchDetail = async () => {
      try {
        const res = await fetch(`/api/local/strings/dashboard/${stringData.arrayNumber}/${stringData.stringNumber}/detail?captureHistory=true`);
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

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/local/strings/dashboard/${stringData.arrayNumber}/${stringData.stringNumber}/detail?refresh=true&captureHistory=true`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to refresh detail manually", err);
    } finally {
      setIsRefreshing(false);
    }
  };

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

  const s = {
    ...stringData,
    ...(data?.summary || {})
  };

  const { voltageMatrix = [], temperatureMatrix = [], notificationMatrix = [], balancingDetails = [], notifications = [], eventLogs = [], bpcs = [], sourceHealth = {} } = data || {};

  const stringViewerHealth = sourceHealth?.stringviewer;

  const downloadMatrixCsv = (matrix: any[], name: string) => {
    if (!matrix || matrix.length === 0) return;
    const csvRows = [];
    csvRows.push(["BPC Index", ...Array.from({length: matrix[0]?.length || 0}, (_,i) => `Cell ${i+1}`)].join(','));
    matrix.forEach((row, rIdx) => {
        csvRows.push([`BPC ${rIdx+1}`, ...row].join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${stringData.stringKey}_${name}_${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasBpcCellGroups = bpcs?.some((bpc: any) => Array.isArray(bpc.cellGroups) && bpc.cellGroups.length > 0);
  const hasVoltageMatrix = hasBpcCellGroups || (Array.isArray(voltageMatrix) && voltageMatrix.some(r => Array.isArray(r) && r.length > 0));
  const hasTempMatrix = hasBpcCellGroups || (Array.isArray(temperatureMatrix) && temperatureMatrix.some(r => Array.isArray(r) && r.length > 0));
  const hasNotifMatrix = Array.isArray(notificationMatrix) && notificationMatrix.some((r: any) => Array.isArray(r) && r.length > 0);

  const finalBpcCount = data?.summary?.bpcCount ?? bpcs?.length ?? s.bpcCount ?? 0;

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
            <div className="text-xs text-prizm-text-muted flex gap-4 items-center">
                <button
                    onClick={handleManualRefresh}
                    disabled={isRefreshing}
                    className="flex items-center gap-2 px-3 py-1 bg-prizm-surface border border-prizm-border rounded hover:bg-prizm-surface-strong transition-colors text-prizm-primary font-bold mr-4"
                >
                    <RefreshCw size={12} className={isRefreshing ? "animate-spin" : ""} /> REFRESH LIVE
                </button>
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
              <span className="text-[11px] font-bold text-prizm-text mt-0.5"><span className={s.contactorClosed || s.positiveContactorClosed || s.negativeContactorClosed ? "text-emerald-400" : "text-prizm-text-muted"}>{s.contactorStatus || (s.positiveContactorClosed ? "CLOSED" : "OPEN")}</span> | <span className={s.rotationEnabled || s.rotationStatus === "OUT" ? "text-emerald-400" : "text-prizm-warning"}>{s.rotationStatus}</span></span>
            </div>
            <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
              <span className="text-[9px] text-prizm-text-muted uppercase">SOC / Energy</span>
              <span className="text-[11px] font-bold text-prizm-info mt-0.5">{s.socPct ?? s.soc}% | {s.kwh ?? '--'}kWh</span>
            </div>
            <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
              <span className="text-[9px] text-prizm-text-muted uppercase">Power / Amps</span>
              <span className="text-[11px] font-bold text-prizm-text mt-0.5">{s.kw ?? '--'}kW | {s.amps ?? '--'}A</span>
            </div>
            <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
              <span className="text-[9px] text-prizm-text-muted uppercase leading-tight">Voltages (Meas/Calc)</span>
               <span className="text-[11px] font-bold text-prizm-text mt-0.5">{s.measuredVoltage ?? '--'}V / {s.calculatedVoltage ?? '--'}V</span>
            </div>
            <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
              <span className="text-[9px] text-prizm-text-muted uppercase leading-tight">Cell Bounds</span>
              <span className="text-[11px] font-bold text-prizm-text mt-0.5">{s.minCellVoltage ?? '--'}V &rarr; {s.maxCellVoltage ?? '--'}V</span>
            </div>
            <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
               <span className="text-[9px] text-prizm-text-muted uppercase leading-tight">Temp Bounds</span>
               <span className="text-[11px] font-bold text-prizm-text mt-0.5">{s.minCellTemperature ?? '--'}° &rarr; {s.maxCellTemperature ?? '--'}°</span>
            </div>
            <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
              <span className="text-[9px] text-prizm-text-muted uppercase leading-tight">Container / BPCs</span>
              <span className="text-[11px] font-bold text-prizm-text mt-0.5">{s.container || s.location || '--'} | {finalBpcCount} BPCs</span>
            </div>
          </div>

          {/* Details / Debug */}
          <details className="mb-6 bg-prizm-surface border border-prizm-border rounded-lg text-xs font-mono group">
            <summary className="p-3 cursor-pointer text-prizm-text-muted hover:text-prizm-text transition-colors select-none outline-none font-bold tracking-wider">
               Local EMS Data Binding Details
            </summary>
            <div className="p-3 border-t border-prizm-border bg-black/20 overflow-x-auto no-scrollbar space-y-2">
                <div className="flex gap-4 items-center">
                    <span className={`px-1.5 py-0.5 rounded font-bold ${data ? 'bg-emerald-500/20 text-emerald-400' : 'bg-prizm-danger/20 text-prizm-danger'}`}>
                        Detail endpoint loaded: {data ? 'true' : 'false'}
                    </span>
                    <span className="text-prizm-text-muted">sourceViewerUsed: {data?.sourceViewerUsed ? 'true' : 'false'}</span>
                    <span className="text-prizm-text-muted">bpcs: {bpcs?.length || 0}</span>
                    <span className="text-prizm-text-muted">firstBpcCellGroups: {bpcs?.[0]?.cellGroups?.length || 0}</span>
                    <span className="text-prizm-text-muted">voltageRows: {voltageMatrix?.length || 0}</span>
                    <span className="text-prizm-text-muted">temperatureRows: {temperatureMatrix?.length || 0}</span>
                </div>
                {stringViewerHealth && (
                    <div className="flex gap-4 items-center bg-black/20 p-2 rounded">
                        <span className={`px-1.5 py-0.5 rounded font-bold ${stringViewerHealth.ok ? 'bg-emerald-500/20 text-emerald-400' : 'bg-prizm-danger/20 text-prizm-danger'}`}>
                            stringviewer {stringViewerHealth.ok ? 'OK' : 'FAIL'}
                        </span>
                        <span className="text-prizm-text-muted">HTTP {stringViewerHealth.httpStatus || '--'}</span>
                        <span className="text-prizm-text-muted">{stringViewerHealth.durationMs}ms</span>
                        <span className="text-prizm-text-muted break-all">{stringViewerHealth.url}</span>
                    </div>
                )}
                {stringViewerHealth && !stringViewerHealth.ok && stringViewerHealth.error && (
                    <div className="text-prizm-danger">Error: {stringViewerHealth.error}</div>
                )}
            </div>
          </details>

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
                  
                  {hasVoltageMatrix ? (() => {
                      const cgCount = bpcs?.[0]?.cellGroups?.length || voltageMatrix?.[0]?.length || 30;
                      const bpcList = hasBpcCellGroups ? bpcs : voltageMatrix;
                      return (
                      <div className="overflow-auto no-scrollbar pb-2 max-h-[400px]">
                         <table className="w-full text-left font-mono text-[9px] border-collapse relative">
                            <thead className="sticky top-0 bg-prizm-surface z-20 shadow-sm shadow-prizm-bg/50">
                               <tr>
                                  <th className="sticky left-0 bg-prizm-surface z-30 min-w-[50px] p-1 text-prizm-text-muted select-none font-bold">CELL</th>
                                  {bpcList.map((bpc: any, bpcIdx: number) => (
                                      <th key={bpcIdx} className="min-w-[42px] w-[42px] p-1 text-center font-bold text-prizm-text-muted select-none">
                                        B{bpc.bpcNumber ?? (bpcIdx + 1)}
                                      </th>
                                  ))}
                               </tr>
                            </thead>
                            <tbody>
                             {Array.from({ length: cgCount }, (_, cIdx) => (
                                 <tr key={cIdx} className="group hover:bg-prizm-surface-strong border-b border-prizm-border/20">
                                     <td className="sticky left-0 bg-prizm-surface p-1 min-w-[50px] text-prizm-text-muted font-bold z-10 group-hover:bg-prizm-surface-strong select-none">
                                        C{cIdx + 1}
                                     </td>
                                     {bpcList.map((bpc: any, bpcIdx: number) => {
                                         if (hasBpcCellGroups) {
                                            const cg = bpc.cellGroups[cIdx];
                                            if (!cg) return <td key={bpcIdx} className="p-0.5"></td>;
                                            return (
                                               <td key={bpcIdx} className="p-0.5">
                                                  <div 
                                                    title={`BPC ${bpc.bpcNumber ?? (bpcIdx + 1)}, CG ${cg.cellGroupNumber ?? (cIdx + 1)}, ${cg.voltage} mV`}
                                                    className={`w-full min-w-[42px] h-[22px] flex items-center justify-center rounded-sm cursor-help select-none ${cg.voltageColor ? '' : getVoltageColor(cg.voltage)}`}
                                                    style={cg.voltageColor ? { backgroundColor: cg.voltageColor, color: '#000', fontWeight: 'bold' } : {}}
                                                  >
                                                      {cg.voltage}
                                                  </div>
                                               </td>
                                            );
                                         } else {
                                            const v = bpc[cIdx];
                                            if (v === undefined) return <td key={bpcIdx} className="p-0.5"></td>;
                                            return (
                                               <td key={bpcIdx} className="p-0.5">
                                                 <div 
                                                    title={`BPC ${bpcIdx + 1}, Cell ${cIdx + 1}: ${v} mV`}
                                                    className={`w-full min-w-[42px] h-[22px] flex items-center justify-center rounded-sm cursor-help select-none ${getVoltageColor(v)}`}
                                                 >
                                                     {v}
                                                 </div>
                                               </td>
                                            );
                                         }
                                     })}
                                 </tr>
                             ))}
                            </tbody>
                         </table>
                      </div>
                      );
                  })() : (
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
                  
                  {hasTempMatrix ? (() => {
                      const cgCount = bpcs?.[0]?.cellGroups?.length || temperatureMatrix?.[0]?.length || 30;
                      const bpcList = hasBpcCellGroups ? bpcs : temperatureMatrix;
                      return (
                      <div className="overflow-auto no-scrollbar pb-2 max-h-[400px]">
                         <table className="w-full text-left font-mono text-[9px] border-collapse relative">
                            <thead className="sticky top-0 bg-prizm-surface z-20 shadow-sm shadow-prizm-bg/50">
                               <tr>
                                  <th className="sticky left-0 bg-prizm-surface z-30 min-w-[50px] p-1 text-prizm-text-muted select-none font-bold">CELL</th>
                                  {bpcList.map((bpc: any, bpcIdx: number) => (
                                      <th key={bpcIdx} className="min-w-[42px] w-[42px] p-1 text-center font-bold text-prizm-text-muted select-none">
                                        B{bpc.bpcNumber ?? (bpcIdx + 1)}
                                      </th>
                                  ))}
                               </tr>
                            </thead>
                            <tbody>
                             {Array.from({ length: cgCount }, (_, cIdx) => (
                                 <tr key={cIdx} className="group hover:bg-prizm-surface-strong border-b border-prizm-border/20">
                                     <td className="sticky left-0 bg-prizm-surface p-1 min-w-[50px] text-prizm-text-muted font-bold z-10 group-hover:bg-prizm-surface-strong select-none">
                                        C{cIdx + 1}
                                     </td>
                                     {bpcList.map((bpc: any, bpcIdx: number) => {
                                         if (hasBpcCellGroups) {
                                            const cg = bpc.cellGroups[cIdx];
                                            if (!cg) return <td key={bpcIdx} className="p-0.5"></td>;
                                            return (
                                               <td key={bpcIdx} className="p-0.5">
                                                  <div 
                                                    title={`BPC ${bpc.bpcNumber ?? (bpcIdx + 1)}, CG ${cg.cellGroupNumber ?? (cIdx + 1)}, ${cg.temperature}°C`}
                                                    className={`w-full min-w-[42px] h-[22px] flex items-center justify-center rounded-sm cursor-help select-none ${cg.temperatureColor ? '' : getTempColor(cg.temperature)}`}
                                                    style={cg.temperatureColor ? { backgroundColor: cg.temperatureColor, color: '#000', fontWeight: 'bold' } : {}}
                                                  >
                                                      {cg.temperature}
                                                  </div>
                                               </td>
                                            );
                                         } else {
                                            const t = bpc[cIdx];
                                            if (t === undefined) return <td key={bpcIdx} className="p-0.5"></td>;
                                            return (
                                               <td key={bpcIdx} className="p-0.5">
                                                 <div 
                                                    title={`BPC ${bpcIdx + 1}, Cell ${cIdx + 1}: ${t}°C`}
                                                    className={`w-full min-w-[42px] h-[22px] flex items-center justify-center rounded-sm cursor-help select-none ${getTempColor(t)}`}
                                                 >
                                                     {t}
                                                 </div>
                                               </td>
                                            );
                                         }
                                     })}
                                 </tr>
                             ))}
                            </tbody>
                         </table>
                      </div>
                      );
                  })() : (
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
