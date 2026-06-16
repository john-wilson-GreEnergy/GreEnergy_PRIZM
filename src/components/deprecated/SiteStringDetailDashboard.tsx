import React, { useState, useEffect } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw, Cpu, Activity, AlertTriangle, ShieldAlert, Wifi, WifiOff } from "lucide-react";

interface Props {
  initialArray: number;
  initialString: number;
  onBack: () => void;
  allArrays: number[];
}

export default function SiteStringDetailDashboard({ initialArray, initialString, onBack, allArrays }: Props) {
  const [arrayIndex, setArrayIndex] = useState(initialArray);
  const [stringIndex, setStringIndex] = useState(initialString);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [debugOpen, setDebugOpen] = useState(false);

  const fetchData = async (aIdx: number, sIdx: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/local/strings/${aIdx}/${sIdx}/detail`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(arrayIndex, stringIndex);
  }, [arrayIndex, stringIndex]);

  const handlePrev = () => {
    if (stringIndex > 1) {
      setStringIndex(stringIndex - 1);
    } else if (arrayIndex > 1) {
      setArrayIndex(arrayIndex - 1);
      setStringIndex(8); // Assume 8 strings per array for navigation boundary, user can adjust
    }
  };

  const handleNext = () => {
    // Assuming 8 strings per array
    if (stringIndex < 8) {
      setStringIndex(stringIndex + 1);
    } else {
      setArrayIndex(arrayIndex + 1);
      setStringIndex(1);
    }
  };

  const renderMatrix = (matrix: any[], type: "voltage" | "temperature" | "notification") => {
    if (!matrix || matrix.length === 0) {
      return (
        <div className="p-8 text-center text-prizm-text-muted font-mono text-[10px] uppercase border border-prizm-border border-dashed rounded">
          No {type} matrix data reported for this string.
        </div>
      );
    }

    return (
      <div className="overflow-x-auto no-scrollbar">
        <table className="text-[10px] font-mono text-center border-collapse">
          <tbody>
            {matrix.map((pack: any, pIdx: number) => {
              const cells = Array.isArray(pack) ? pack : [];
              return (
                <tr key={pIdx}>
                  <td className="px-2 py-1 text-prizm-text-muted border border-prizm-border/30 bg-black/20 font-bold whitespace-nowrap">
                    Pack {pIdx + 1}
                  </td>
                  {cells.map((val: any, cIdx: number) => {
                    let colorClass = "text-prizm-text bg-prizm-surface";
                    
                    if (type === "voltage") {
                       if (val > 3.4) colorClass = "text-prizm-warning bg-prizm-warning/10";
                       else if (val < 2.9 && val > 0) colorClass = "text-prizm-danger bg-prizm-danger/10";
                       else if (val === 0 || val === null) colorClass = "text-prizm-text-muted bg-black/40";
                    } else if (type === "temperature") {
                       if (val > 35) colorClass = "text-prizm-danger bg-prizm-danger/10";
                       else if (val > 30) colorClass = "text-prizm-warning bg-prizm-warning/10";
                       else if (val === 0 || val === null) colorClass = "text-prizm-text-muted bg-black/40";
                    }

                    return (
                      <td key={cIdx} className={`px-2 py-1 border border-prizm-border/30 ${colorClass}`} title={`Pack ${pIdx + 1} Cell ${cIdx + 1}`}>
                        {val !== null && val !== undefined ? (typeof val === 'number' && type==='voltage' ? val.toFixed(3) : val) : "--"}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  if (!data) {
     return <div className="p-8 text-prizm-text-muted font-mono uppercase text-xs flex justify-center">Loading Granular Detail...</div>;
  }

  const { summary } = data;

  return (
    <div className="flex-1 flex flex-col font-sans h-full bg-prizm-bg p-4 sm:p-6 overflow-y-auto custom-scrollbar pb-20">
      
      {/* Top Banner Navigation */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-prizm-border pb-4 mb-4 shrink-0">
         <div className="flex items-center gap-3">
             <button onClick={onBack} className="flex border border-prizm-border bg-prizm-surface p-1.5 hover:bg-prizm-surface-strong hover:text-prizm-primary transition text-prizm-text-muted rounded cursor-pointer group">
                <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
             </button>
             <div>
                <span className="text-[10px] text-prizm-primary font-bold uppercase tracking-wider block">Stack Detail Explorer</span>
                <h2 className="text-lg font-bold text-prizm-text tracking-wide flex items-center gap-2">
                   ARRAY {arrayIndex} / STRING {stringIndex} 
                   <span className="text-prizm-text-muted text-sm font-normal">| {summary?.stringKey || `A${arrayIndex}-S${stringIndex}`}</span>
                </h2>
             </div>
         </div>
         
         <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono select-none">
            
            <div className="flex items-center border border-prizm-border rounded bg-prizm-surface overflow-hidden">
               <span className="px-2 py-1 text-prizm-text-muted border-r border-prizm-border bg-black/20 font-bold">ARRAY</span>
               <select 
                 value={arrayIndex} 
                 onChange={e => setArrayIndex(Number(e.target.value))}
                 className="bg-transparent text-prizm-text px-2 py-1 cursor-pointer focus:outline-none"
               >
                 {allArrays.map(a => <option key={a} value={a}>{a}</option>)}
               </select>
            </div>
            
            <div className="flex items-center rounded border border-prizm-border bg-prizm-surface overflow-hidden">
               <button onClick={handlePrev} className="px-2 py-1 text-prizm-text-muted hover:text-prizm-text hover:bg-white/5 border-r border-prizm-border cursor-pointer"><ChevronLeft size={14}/></button>
               <span className="px-3 py-1 font-bold text-prizm-text">STR {stringIndex}</span>
               <button onClick={handleNext} className="px-2 py-1 text-prizm-text-muted hover:text-prizm-text hover:bg-white/5 border-l border-prizm-border cursor-pointer"><ChevronRight size={14}/></button>
            </div>

            <button onClick={() => fetchData(arrayIndex, stringIndex)} className="p-1 border border-prizm-border bg-prizm-surface hover:bg-prizm-surface-strong text-prizm-text-muted rounded cursor-pointer" title="Refresh">
               <RefreshCw size={14} className={loading ? "animate-spin text-prizm-primary" : ""} />
            </button>
         </div>
      </div>

      {/* Metadata Strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] font-mono text-prizm-text mb-6">
          <div className="flex items-center gap-2">
             <span className="text-prizm-text-muted uppercase">Source:</span>
             <span className="bg-prizm-surface border border-prizm-border px-1.5 py-0.5 rounded">{data.activeProfileName || "N/A"}</span>
          </div>
          <div className="flex items-center gap-2">
             <span className="text-prizm-text-muted uppercase">Block / Station:</span>
             <span className="bg-prizm-surface border border-prizm-border px-1.5 py-0.5 rounded">{data.blockIndex || "0"} / {data.stationCode || "Default"}</span>
          </div>
          <div className="flex items-center gap-2">
             <span className="text-prizm-text-muted uppercase">IP Address:</span>
             <span className="bg-prizm-surface border border-prizm-border px-1.5 py-0.5 rounded text-emerald-400">{summary?.ipAddress || "Unknown"}</span>
          </div>
          <div className="flex items-center gap-2">
             <span className="text-prizm-text-muted uppercase">Last Updated:</span>
             <span className="bg-prizm-surface border border-prizm-border px-1.5 py-0.5 rounded">{new Date(data.lastUpdated).toLocaleTimeString()}</span>
          </div>
          {data.staleData && <span className="bg-prizm-warning/10 text-prizm-warning border border-prizm-warning/30 px-1.5 py-0.5 rounded font-bold">STALE TELEMETRY</span>}
          {data.source === "offline" && <span className="bg-prizm-danger/10 text-prizm-danger border border-prizm-danger/30 px-1.5 py-0.5 rounded font-bold">TARGET OFFLINE</span>}
      </div>

      {!summary ? (
         <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-prizm-border/50 rounded-lg p-12 text-prizm-text-muted font-mono">
            <Cpu size={32} className="mb-4 opacity-50" />
            <span className="text-xs uppercase tracking-widest">No String Summary Data</span>
            <p className="text-[10px] mt-2 max-w-md text-center">Active profile EMS did not return mapping for Array {arrayIndex} / String {stringIndex} in block summaries.</p>
         </div>
      ) : (
         <div className="space-y-6">
            
            {/* Health & Power Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 font-mono">
               <div className="bg-prizm-surface-strong border border-prizm-border rounded p-3 flex flex-col justify-center">
                  <span className="text-[9px] text-prizm-text-muted uppercase">Health State</span>
                  <div className="flex items-center gap-1.5 mt-1">
                     {summary.connectionState === "Online" ? <Wifi size={12} className="text-emerald-400" /> : <WifiOff size={12} className="text-prizm-danger" />}
                     <span className={`text-xs font-bold ${summary.connectionState === "Online" ? "text-emerald-400" : "text-prizm-danger"}`}>{summary.connectionState}</span>
                  </div>
               </div>
               <div className="bg-prizm-surface border border-prizm-border rounded p-3 flex flex-col justify-center">
                  <span className="text-[9px] text-prizm-text-muted uppercase">Warns / Alarms</span>
                  <span className={`text-xs font-bold mt-1 ${summary.warnCount > 0 || summary.alarmCount > 0 ? "text-prizm-warning" : "text-emerald-400"}`}>
                     {summary.warnCount} W / {summary.alarmCount} A
                  </span>
               </div>
               <div className="bg-prizm-surface border border-prizm-border rounded p-3 flex flex-col justify-center text-center">
                  <span className="text-[9px] text-prizm-text-muted uppercase">SOC</span>
                  <span className="text-xs font-bold text-prizm-info mt-1">{summary.soc !== null ? summary.soc + "%" : "--"}</span>
               </div>
               <div className="bg-prizm-surface border border-prizm-border rounded p-3 flex flex-col justify-center text-center">
                  <span className="text-[9px] text-prizm-text-muted uppercase">Capacity</span>
                  <span className="text-xs font-bold text-prizm-text mt-1">{summary.ah !== null ? summary.ah + " Ah" : "--"}</span>
               </div>
               <div className="bg-prizm-surface border border-prizm-border bg-gradient-to-br from-prizm-surface to-black/40 rounded p-3 flex flex-col justify-center text-center">
                  <span className="text-[9px] text-prizm-text-muted uppercase">Real Power</span>
                  <span className="text-xs font-bold text-prizm-text mt-1">{summary.kw !== null ? summary.kw.toFixed(1) + " kW" : "--"}</span>
               </div>
               <div className="bg-prizm-surface border border-prizm-border rounded p-3 flex flex-col justify-center text-center">
                  <span className="text-[9px] text-prizm-text-muted uppercase">Meas. Voc</span>
                  <span className="text-xs font-bold text-emerald-400 mt-1">{summary.measuredVoltage !== null ? summary.measuredVoltage + " V" : "--"}</span>
               </div>
               <div className="bg-prizm-surface border border-prizm-border rounded p-3 flex flex-col justify-center text-center">
                  <span className="text-[9px] text-prizm-text-muted uppercase">Calc. / DC Bus</span>
                  <span className="text-xs font-bold text-prizm-text-muted mt-1">{summary.calculatedVoltage ?? "-"} / {summary.dcBusVoltage ?? "-"} V</span>
               </div>
               <div className="bg-prizm-surface border border-prizm-border rounded p-3 flex flex-col justify-center text-center">
                  <span className="text-[9px] text-prizm-text-muted uppercase">Line Current</span>
                  <span className="text-xs font-bold text-prizm-text mt-1">{summary.stringCurrent !== null ? summary.stringCurrent + " A" : "--"}</span>
               </div>
            </div>

            {/* Sub-Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {/* Controls / Topology */}
               <div className="bg-prizm-surface-strong border border-prizm-border rounded-lg p-5">
                  <h3 className="text-xs font-bold font-mono text-prizm-text uppercase tracking-widest border-b border-prizm-border pb-2 mb-4">Topology & Control Hardware</h3>
                  <div className="grid grid-cols-2 gap-y-4 font-mono text-[10px]">
                     <div className="flex items-center gap-2">
                        <span className="text-prizm-text-muted w-24">Pos Contactor:</span>
                        {summary.positiveContactorClosed ? <span className="text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded font-bold">CLOSED</span> : <span className="text-prizm-text-muted bg-white/5 px-1.5 py-0.5 rounded">OPEN</span>}
                     </div>
                     <div className="flex items-center gap-2">
                        <span className="text-prizm-text-muted w-24">Neg Contactor:</span>
                        {summary.negativeContactorClosed ? <span className="text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded font-bold">CLOSED</span> : <span className="text-prizm-text-muted bg-white/5 px-1.5 py-0.5 rounded">OPEN</span>}
                     </div>
                     <div className="flex items-center gap-2">
                        <span className="text-prizm-text-muted w-24">Expected CT:</span>
                        {summary.contactorsCloseExpected ? <span className="text-prizm-info bg-prizm-info/10 px-1.5 py-0.5 rounded">CLOSE</span> : <span className="text-prizm-text-muted bg-white/5 px-1.5 py-0.5 rounded">OPEN</span>}
                     </div>
                     <div className="flex items-center gap-2">
                        <span className="text-prizm-text-muted w-24">Mismatch:</span>
                        {summary.contactorMismatch ? <span className="text-prizm-danger bg-prizm-danger/10 px-1.5 py-0.5 rounded font-bold animate-pulse">MISMATCH</span> : <span className="text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded text-opacity-80">STEADY</span>}
                     </div>
                     <div className="flex items-center gap-2">
                        <span className="text-prizm-text-muted w-24">Rotation:</span>
                        {summary.outRotation ? <span className="text-prizm-warning bg-prizm-warning/10 border border-prizm-warning/30 px-1.5 py-0.5 rounded font-bold">OUT</span> : <span className="text-prizm-text bg-white/5 px-1.5 py-0.5 rounded">IN</span>}
                     </div>
                     <div className="flex items-center gap-2">
                        <span className="text-prizm-text-muted w-24">Fan Command:</span>
                        <span className="text-prizm-text px-1.5 py-0.5 rounded bg-black/30 font-bold">{summary.lastFanCommand?.toUpperCase() || "--"}</span>
                     </div>
                     <div className="flex items-center gap-2">
                        <span className="text-prizm-text-muted w-24">Location:</span>
                        <span className="text-prizm-text bg-black/20 px-1.5 py-0.5 rounded border border-prizm-border truncate" title={summary.location}>{summary.location}</span>
                     </div>
                     <div className="flex items-center gap-2">
                        <span className="text-prizm-text-muted w-24">Reclose Cnt:</span>
                        <span className="text-prizm-text">{summary.recloseCount ?? "0"}</span>
                     </div>
                  </div>
               </div>

               {/* Temp/Volt Bounds */}
               <div className="bg-prizm-surface-strong border border-prizm-border rounded-lg p-5">
                  <h3 className="text-xs font-bold font-mono text-prizm-text uppercase tracking-widest border-b border-prizm-border pb-2 mb-4">Granular Bounds Rollup</h3>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4 font-mono text-[10px]">
                     {/* Voltages */}
                     <div className="col-span-2 sm:col-span-1 border-r border-prizm-border/50 pr-4">
                        <h4 className="text-prizm-text-muted mb-2 font-bold uppercase">Cell Voltages</h4>
                        <div className="flex justify-between py-1 border-b border-prizm-border/30"><span className="text-prizm-text-muted">Min:</span> <span className="text-prizm-text">{summary.minCellVoltage ?? "-"} V</span></div>
                        <div className="flex justify-between py-1 border-b border-prizm-border/30"><span className="text-prizm-text-muted">Avg:</span> <span className="text-prizm-text">{summary.avgCellVoltage ?? "-"} V</span></div>
                        <div className="flex justify-between py-1 border-b border-prizm-border/30"><span className="text-prizm-text-muted">Max:</span> <span className="text-prizm-text">{summary.maxCellVoltage ?? "-"} V</span></div>
                        <div className="flex justify-between py-1 mt-1 bg-black/20 px-1.5 rounded"><span className="text-prizm-text-muted">Spread \u0394:</span> <span className={`font-bold ${(summary.voltageDelta && summary.voltageDelta > 0.15) ? 'text-prizm-danger' : 'text-prizm-warning'}`}>{summary.voltageDelta ?? "-"} V</span></div>
                     </div>
                     {/* Temps */}
                     <div className="col-span-2 sm:col-span-1">
                        <h4 className="text-prizm-text-muted mb-2 font-bold uppercase">Cell Temperatures</h4>
                        <div className="flex justify-between py-1 border-b border-prizm-border/30"><span className="text-prizm-text-muted">Min:</span> <span className="text-prizm-text">{summary.minCellTemp ?? "-"} °C</span></div>
                        <div className="flex justify-between py-1 border-b border-prizm-border/30"><span className="text-prizm-text-muted">Avg:</span> <span className="text-prizm-text">{summary.avgCellTemp ?? "-"} °C</span></div>
                        <div className="flex justify-between py-1 border-b border-prizm-border/30"><span className="text-prizm-text-muted">Max:</span> <span className="text-prizm-text">{summary.maxCellTemp ?? "-"} °C</span></div>
                        <div className="flex justify-between py-1 mt-1 bg-black/20 px-1.5 rounded"><span className="text-prizm-text-muted">Spread \u0394:</span> <span className={`font-bold ${(summary.tempDelta && summary.tempDelta > 5) ? 'text-prizm-danger' : 'text-prizm-warning'}`}>{summary.tempDelta ?? "-"} °C</span></div>
                     </div>
                  </div>
               </div>
            </div>

            {/* Matrices Section */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
               {/* Voltage Matrix */}
               <div className="bg-prizm-surface-strong border border-prizm-border rounded-lg p-5 overflow-hidden flex flex-col">
                  <h3 className="text-xs font-bold font-mono text-prizm-text uppercase tracking-widest border-b border-prizm-border pb-2 mb-4 shrink-0">Cell Voltage Matrix</h3>
                  <div className="flex-1 overflow-auto custom-scrollbar">
                     {renderMatrix(data.voltageMatrix, "voltage")}
                  </div>
               </div>
               {/* Temp Matrix */}
               <div className="bg-prizm-surface-strong border border-prizm-border rounded-lg p-5 overflow-hidden flex flex-col">
                  <h3 className="text-xs font-bold font-mono text-prizm-text uppercase tracking-widest border-b border-prizm-border pb-2 mb-4 shrink-0">Cell Temperature Matrix</h3>
                  <div className="flex-1 overflow-auto custom-scrollbar">
                     {renderMatrix(data.temperatureMatrix, "temperature")}
                  </div>
               </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
               {/* CG Notification Matrix */}
               <div className="bg-prizm-surface-strong border border-prizm-border rounded-lg p-5 overflow-hidden flex flex-col">
                  <h3 className="text-xs font-bold font-mono text-prizm-text uppercase tracking-widest border-b border-prizm-border pb-2 mb-4 shrink-0">CG-Level Notification Matrix</h3>
                  <div className="flex-1 overflow-auto custom-scrollbar">
                     {renderMatrix(data.notificationMatrix, "notification")}
                  </div>
               </div>

               {/* Balancing Details */}
               <div className="bg-prizm-surface-strong border border-prizm-border rounded-lg p-5 overflow-hidden flex flex-col">
                  <h3 className="text-xs font-bold font-mono text-prizm-text uppercase tracking-widest border-b border-prizm-border pb-2 mb-4 shrink-0">Balancing Line Transactions</h3>
                  <div className="flex-1 overflow-auto custom-scrollbar">
                     {data.balancingDetails?.length > 0 ? (
                        <table className="w-full text-left text-[10px] font-mono">
                           <thead className="text-prizm-text-muted border-b border-prizm-border/50">
                              <tr>
                                 <th className="py-1.5 px-2">Pack</th>
                                 <th className="py-1.5 px-2">CG Index</th>
                                 <th className="py-1.5 px-2">State</th>
                                 <th className="py-1.5 px-2">Command Ref</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-prizm-border/30">
                              {data.balancingDetails.map((b: any, i: number) => (
                                 <tr key={i} className="hover:bg-white/5 data-row">
                                    <td className="py-1.5 px-2">{b.packIndex ?? "-"}</td>
                                    <td className="py-1.5 px-2">{b.cellGroupIndex ?? "-"}</td>
                                    <td className="py-1.5 px-2 text-emerald-400">{b.state || "Active"}</td>
                                    <td className="py-1.5 px-2">{b.referenceValue ?? "-"}</td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                     ) : (
                        <div className="p-8 text-center text-prizm-text-muted font-mono text-[10px] uppercase border border-prizm-border border-dashed rounded">
                           Balancing detail not reported by active EMS payload.
                        </div>
                     )}
                  </div>
               </div>
            </div>

            {/* Notifications & Events Lists */}
            <div className="grid grid-cols-1 gap-4">
               <div className="bg-prizm-surface-strong border border-prizm-border rounded-lg p-5">
                  <h3 className="text-xs font-bold font-mono text-prizm-text uppercase tracking-widest border-b border-prizm-border pb-2 mb-4">String-Level Notifications / Alarms</h3>
                  <div className="overflow-x-auto no-scrollbar max-h-[300px]">
                     {data.notifications?.length > 0 ? (
                        <table className="w-full text-left text-[10px] font-mono whitespace-nowrap">
                           <thead className="bg-black/20 text-prizm-text-muted sticky top-0">
                              <tr>
                                 <th className="py-2 px-3 font-bold border-b border-prizm-border">Timestamp</th>
                                 <th className="py-2 px-3 font-bold border-b border-prizm-border">Code</th>
                                 <th className="py-2 px-3 font-bold border-b border-prizm-border">Message</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-prizm-border/40">
                              {data.notifications.map((n: any, i: number) => (
                                 <tr key={i} className="hover:bg-white/5 text-prizm-text">
                                    <td className="py-2 px-3">{n.timestamp ? new Date(n.timestamp).toLocaleString() : "-"}</td>
                                    <td className={`py-2 px-3 font-bold ${n.code === 'ALARM' ? 'text-prizm-danger' : 'text-prizm-warning'}`}>{n.code}</td>
                                    <td className="py-2 px-3">{n.message}</td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                     ) : (
                        <div className="text-prizm-text-muted font-mono text-[10px] uppercase p-4 border border-prizm-border border-dashed rounded text-center">
                           No string-level notifications reported.
                        </div>
                     )}
                  </div>
               </div>
               
               <div className="bg-prizm-surface-strong border border-prizm-border rounded-lg p-5">
                  <h3 className="text-xs font-bold font-mono text-prizm-text uppercase tracking-widest border-b border-prizm-border pb-2 mb-4">Recent Event Logs</h3>
                  <div className="overflow-x-auto no-scrollbar max-h-[300px]">
                     {data.eventLogs?.length > 0 ? (
                        <table className="w-full text-left text-[10px] font-mono whitespace-nowrap">
                           <thead className="bg-black/20 text-prizm-text-muted sticky top-0">
                              <tr>
                                 <th className="py-2 px-3 font-bold border-b border-prizm-border">Timestamp</th>
                                 <th className="py-2 px-3 font-bold border-b border-prizm-border">Source Entity</th>
                                 <th className="py-2 px-3 font-bold border-b border-prizm-border">Message</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-prizm-border/40">
                              {data.eventLogs.map((e: any, i: number) => (
                                 <tr key={i} className="hover:bg-white/5 text-prizm-text">
                                    <td className="py-2 px-3">{e.timestamp ? new Date(e.timestamp).toLocaleString() : "-"}</td>
                                    <td className="py-2 px-3">{e.sourceEntity || e.source || "-"}</td>
                                    <td className="py-2 px-3 text-prizm-text-muted">{e.message || e.description || "-"}</td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                     ) : (
                        <div className="text-prizm-text-muted font-mono text-[10px] uppercase p-4 border border-prizm-border border-dashed rounded text-center">
                           No event logs reported for selected string.
                        </div>
                     )}
                  </div>
               </div>
            </div>
            
            {/* Advanced Debug */}
            <div className="pt-4 mt-8 border-t border-prizm-border border-dashed">
               <button onClick={() => setDebugOpen(!debugOpen)} className="text-[10px] font-bold font-mono uppercase text-prizm-text-muted hover:text-prizm-primary transition cursor-pointer">
                  {debugOpen ? "Hide Pipeline JSON Logs" : "Show Pipeline JSON Logs"}
               </button>
               {debugOpen && (
                  <div className="mt-4 bg-black/40 border border-prizm-border rounded p-4 overflow-x-auto">
                     <pre className="text-[9px] font-mono text-prizm-text-muted">
                        {JSON.stringify(data.debug, null, 2)}
                     </pre>
                  </div>
               )}
            </div>

         </div>
      )}
    </div>
  );
}
