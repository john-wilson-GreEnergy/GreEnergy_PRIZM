import { markPerf } from '../lib/perf';
import React, { useState, useEffect, useMemo } from "react";
import { Zap, Activity, CheckCircle2, XOctagon } from "lucide-react";
import RotationModal, { RotationTarget } from "./RotationModal";

const hasVal = (v: any) => v !== undefined && v !== null && v !== "" && v !== "--";

export async function fetchJsonWithTimeout(url: string, options: RequestInit & { timeoutMs?: number } = {}) {
    const { timeoutMs = 5000, ...fetchOptions } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
        clearTimeout(id);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (err) {
        clearTimeout(id);
        throw err;
    }
}

export default function PcsDashboard({ active = true }: { active?: boolean }) {
    const [pcsList, setPcsList] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    
    // Default structure fallback
    const [fallbackMode, setFallbackMode] = useState(false);
    const [pcsSource, setPcsSource] = useState("PCS source unavailable or unmapped.");

    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [modalTargets, setModalTargets] = useState<RotationTarget[]>([]);
    const [modalAction, setModalAction] = useState<"in" | "out">("in");
    
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const refreshData = async () => {
        const t0 = performance.now();
        if (pcsList.length > 0) setRefreshing(true);
        else setLoading(true);
        try {
            let pcsRows: any[] = [];
            let sourceMeta = "PCS source unavailable or unmapped.";
            
            try {
                const dashboardData = await fetchJsonWithTimeout("/api/local/pcs/dashboard", { timeoutMs: 5000 });
                if (Array.isArray(dashboardData) && dashboardData.length > 0) {
                    pcsRows = dashboardData;
                    sourceMeta = "Dedicated PCS Dashboard API";
                }
            } catch(e) {}

            if (pcsRows.length > 0) {
                // Ensure unique IDs and normalize fields
                const pcsWithId = pcsRows.map((p: any, idx: number) => {
                    const arrayIndex = p.arrayIndex ?? p.arrayNum ?? p.raw?.arrayIndex ?? 1;
                    const pcsIndex = p.pcsIndex ?? p.pcsNum ?? p.arrayPcsIndex ?? p.raw?.arrayPcsIndex ?? (idx + 1);
                    const rotation = p.rotation ?? (p.outRotation ? "OUT" : "IN");
                    const state = p.state ?? p.status ?? p.raw?.state ?? "Unknown";

                    const dcVoltage = hasVal(p.dcVoltage) ? p.dcVoltage : (hasVal(p.vDc) ? p.vDc : (hasVal(p.dcVoltageVolt) ? p.dcVoltageVolt : (p.raw ? p.raw.dcVoltageVolt : null)));
                    const dcCurrent = hasVal(p.dcCurrent) ? p.dcCurrent : (hasVal(p.iDc) ? p.iDc : (hasVal(p.dcCurrentAmp) ? p.dcCurrentAmp : (p.raw ? p.raw.dcCurrentAmp : null)));
                    const acVoltageDisplay = p.acVoltageDisplay ?? "-- / -- / --";
                    const acVoltage = hasVal(p.acVoltage) ? p.acVoltage : (hasVal(p.vAc) ? p.vAc : (hasVal(p.acVoltageVolt) ? p.acVoltageVolt : (p.raw ? p.raw.acVoltageVolt : null)));
                    const acCurrent = hasVal(p.acCurrent) ? p.acCurrent : (hasVal(p.iAc) ? p.iAc : (hasVal(p.acCurrentAmp) ? p.acCurrentAmp : (p.raw ? p.raw.acCurrentAmp : null)));
                    const acRealPowerKw = hasVal(p.acRealPowerKw) ? p.acRealPowerKw : (hasVal(p.realPwr) ? p.realPwr : (hasVal(p.acRealPowerKW) ? p.acRealPowerKW : (p.raw ? p.raw.acRealPowerKW : null)));
                    const acReactivePowerKvar = hasVal(p.acReactivePowerKvar) ? p.acReactivePowerKvar : (hasVal(p.reactivePwr) ? p.reactivePwr : (hasVal(p.acReactivePowerKvar) ? p.acReactivePowerKvar : (p.raw ? p.raw.acReactivePowerKvar : null)));
                    const frequencyHz = hasVal(p.frequencyHz) ? p.frequencyHz : (hasVal(p.freqHz) ? p.freqHz : (p.raw ? p.raw.acFrequencyHz : null));

                    return {
                        ...p,
                        id: p.id || `${arrayIndex}-${pcsIndex}`,
                        arrayIndex,
                        pcsIndex,
                        displayKey: p.displayKey ?? p.name ?? `ArrayPcs:${arrayIndex}:${pcsIndex}`,
                        dcVoltage,
                        dcCurrent,
                        acVoltage,
                        acVoltageAB: p.acVoltageAB,
                        acVoltageBC: p.acVoltageBC,
                        acVoltageCA: p.acVoltageCA,
                        acVoltageDisplay,
                        acCurrent,
                        acRealPowerKw,
                        acReactivePowerKvar,
                        frequencyHz,
                        rotation,
                        state,
                        sourcePath: p.sourcePath ?? "discovered",
                        raw: p.raw ?? p
                    };
                });
                setPcsList(pcsWithId);
                setPcsSource(sourceMeta);
                setFallbackMode(false);
            } else if (pcsList.length === 0) {
                setPcsList([]);
                setPcsSource("PCS source unavailable or unmapped.");
                setFallbackMode(true);
            }
        } catch(e) {
            setFallbackMode(true);
            setPcsSource("PCS source unavailable or unmapped.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refreshData();
    }, []);

    const getSelectedTargets = () => {
        const targets: RotationTarget[] = [];
        for (const id of selectedIds) {
            const p = pcsList.find(x => x.id === id);
            if (p) {
                targets.push({ array: p.arrayIndex, pcs: p.pcsIndex });
            }
        }
        return targets;
    };

    const handleConfirm = async (req: any) => {
        const res = await fetch("/api/local/pcs/rotation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(req)
        });
        
        if (!res.ok) {
           const err = await res.json();
           throw new Error(err.error || "Failed to execute PCS rotation");
        }
        
        setModalOpen(false);
        setSelectedIds(new Set());
        await refreshData();
    };

    const arrays = useMemo(() => {
        const list = Array.from(new Set(pcsList.map((p:any) => p.arrayIndex)));
        return list.sort((a, b) => Number(a) - Number(b));
    }, [pcsList]);

    return (
        <div className="flex flex-col font-sans transition-all bg-transparent text-prizm-text h-full">
            <div className="max-w-7xl mx-auto space-y-6 w-full pb-20">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 shrink-0 mb-6 mt-6 font-mono border-b border-prizm-border pb-4">
                    <div>
                        <span className="text-[10px] text-prizm-primary font-bold uppercase tracking-wider block">Inverters</span>
                        <h1 className="text-lg font-bold text-prizm-text tracking-wide flex items-center gap-2">
                            <Zap size={20} /> PCS DASHBOARD
                        </h1>
                    </div>
                    
                    <div className="flex items-center gap-2.5">
                        <span className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded border uppercase ${fallbackMode ? "bg-prizm-warning/10 border-prizm-warning/30 text-prizm-warning" : "bg-prizm-primary/10 border-prizm-primary/30 text-prizm-primary"}`}>
                            Source: {pcsSource}
                        </span>
                        <button 
                             onClick={refreshData} disabled={loading}
                             className="flex items-center gap-1.5 px-3 py-1 bg-prizm-surface border border-prizm-border rounded hover:bg-prizm-surface-strong transition-colors text-prizm-primary font-bold text-[9px] disabled:opacity-50"
                        >
                            <Activity size={10} className={(refreshing || loading) ? 'animate-pulse' : ''} /> {(refreshing || loading) ? 'REFRESHING...' : 'REFRESH LIVE'}
                        </button>
                    </div>
                </div>
                
                {fallbackMode && (
                    <div className="bg-prizm-warning/10 border border-prizm-warning/50 text-prizm-warning p-3 rounded text-xs font-mono">
                        PCS source unavailable or unmapped. No live PCS rows are currently available from the EMS source.
                    </div>
                )}
                
                {selectedIds.size > 0 && (
                    <div className="flex items-center justify-between px-1.5 py-0.5 bg-[#001a1a] border border-prizm-border shadow-md z-[60] relative saturate-150 rounded">
                       <div className="flex items-center gap-4">
                          <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-widest">{selectedIds.size} Selected</span>
                          <button 
                             onClick={() => setSelectedIds(new Set())}
                             className="text-[10px] text-prizm-text-muted hover:text-white uppercase tracking-widest underline decoration-prizm-text-muted/30 underline-offset-4 transition-colors"
                          >
                             Clear Selection
                          </button>
                       </div>
                       <div className="flex items-center gap-2">
                          <button
                              onClick={() => {
                                 setModalAction('in');
                                 setModalTargets(getSelectedTargets());
                                 setModalOpen(true);
                              }}
                              className="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-500/30 rounded text-[10px] uppercase font-bold tracking-widest transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                              Set In Rotation
                          </button>
                          <button
                              onClick={() => {
                                 setModalAction('out');
                                 setModalTargets(getSelectedTargets());
                                 setModalOpen(true);
                              }}
                              className="px-3 py-1 bg-slate-500/20 text-slate-300 border border-slate-500/50 hover:bg-slate-500/30 rounded text-[10px] uppercase font-bold tracking-widest transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                              Set Out Rotation
                          </button>
                       </div>
                    </div>
                )}

                <div className="bg-prizm-surface border border-prizm-border rounded-lg relative overflow-x-auto no-scrollbar pb-12">
                    <table className="w-full text-left text-[9px] font-mono whitespace-nowrap border-collapse">
                        <thead className="bg-prizm-surface-strong shadow-sm text-prizm-text-muted uppercase tracking-wider">
                            <tr>
                                <th className="px-1 py-1 border-b border-prizm-border font-bold w-[30px]" title="Select Array"></th>
                                <th className="px-1.5 py-1 border-b border-prizm-border font-bold">ARR</th>
                                <th className="px-1 py-1 border-b border-prizm-border font-bold w-[30px]" title="Select PCS"></th>
                                <th className="px-1.5 py-1 border-b border-prizm-border font-bold">PCS Identity</th>
                                <th className="px-1.5 py-1 border-b border-prizm-border font-bold text-right">DC V</th>
                                <th className="px-1.5 py-1 border-b border-prizm-border font-bold text-right">DC A</th>
                                <th className="px-1.5 py-1 border-b border-prizm-border font-bold text-right">AC V</th>
                                <th className="px-1.5 py-1 border-b border-prizm-border font-bold text-right">AC A</th>
                                <th className="px-1.5 py-1 border-b border-prizm-border font-bold text-right">Real P (kW)</th>
                                <th className="px-1.5 py-1 border-b border-prizm-border font-bold text-right">Reactive (kVAR)</th>
                                <th className="px-1.5 py-1 border-b border-prizm-border font-bold text-right">Freq (Hz)</th>
                                <th className="px-1.5 py-1 border-b border-prizm-border font-bold text-center">Rotation Status</th>
                                <th className="px-1.5 py-1 border-b border-prizm-border font-bold text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-prizm-border/20">
                            {pcsList.map((pcs, idx) => {
                                const rot = (pcs.rotation || "UNKNOWN").toUpperCase();
                                
                                const isArrFirst = idx === 0 || pcsList[idx-1].arrayIndex !== pcs.arrayIndex;
                                const arrRows = pcsList.filter(p => p.arrayIndex === pcs.arrayIndex);
                                const arrSelectedCount = arrRows.filter(p => selectedIds.has(p.id)).length;
                                const isArrAllSelected = arrSelectedCount > 0 && arrSelectedCount === arrRows.length;
                                const isArrIndeterminate = arrSelectedCount > 0 && arrSelectedCount < arrRows.length;

                                return (
                                <tr key={pcs.id} className="group hover:bg-prizm-primary/5 transition-colors">
                                    <td className="px-1.5 py-1 border-r border-prizm-border/10 bg-transparent text-center">
                                       {isArrFirst ? (
                                         <input type="checkbox" className="accent-prizm-primary w-3 h-3 cursor-pointer animate-none" 
                                           checked={isArrAllSelected}
                                           ref={el => { if(el) el.indeterminate = isArrIndeterminate; }}
                                           onChange={() => {}}
                                           onClick={(e) => {
                                             e.stopPropagation();
                                             const next = new Set(selectedIds);
                                             if (isArrAllSelected) {
                                                 arrRows.forEach(p => next.delete(p.id));
                                             } else {
                                                 arrRows.forEach(p => next.add(p.id));
                                             }
                                             setSelectedIds(next);
                                           }} 
                                         />
                                       ) : null}
                                    </td>
                                    <td className="px-1.5 py-1 border-r border-prizm-border/20 bg-transparent text-center">
                                       {isArrFirst ? <span className="text-prizm-primary font-mono font-bold">{pcs.arrayIndex}</span> : null}
                                    </td>
                                    
                                    <td className="px-1.5 py-1 border-r border-prizm-border/10 bg-transparent text-center">
                                       <input type="checkbox" className="accent-prizm-primary w-3 h-3 cursor-pointer animate-none" 
                                         checked={selectedIds.has(pcs.id)}
                                         onChange={() => {}}
                                         onClick={(e) => {
                                           e.stopPropagation();
                                           const next = new Set(selectedIds);
                                           if (next.has(pcs.id)) next.delete(pcs.id);
                                           else next.add(pcs.id);
                                           setSelectedIds(next);
                                         }} 
                                       />
                                    </td>
                                    <td className="px-1.5 py-1 border-r border-prizm-border/20 font-bold text-prizm-primary font-mono">
                                        PCS {pcs.pcsIndex}
                                    </td>
                                    <td className="px-1.5 py-1 text-right">
                                        {hasVal(pcs.dcVoltage) ? Number(pcs.dcVoltage).toFixed(1) : "--"}
                                    </td>
                                    <td className="px-1.5 py-1 text-right">
                                        {hasVal(pcs.dcCurrent) ? Number(pcs.dcCurrent).toFixed(1) : "--"}
                                    </td>
                                    <td className="px-1.5 py-1 text-right text-prizm-text">
                                        {pcs.acVoltageDisplay !== "-- / -- / --" && hasVal(pcs.acVoltageDisplay)
                                          ? pcs.acVoltageDisplay
                                          : hasVal(pcs.acVoltage)
                                            ? Number(pcs.acVoltage).toFixed(1)
                                            : "--"}
                                    </td>
                                    <td className="px-1.5 py-1 text-right">
                                        {hasVal(pcs.acCurrent) ? Number(pcs.acCurrent).toFixed(1) : "--"}
                                    </td>
                                    <td className="px-1.5 py-1 text-right text-prizm-text font-bold">
                                        {hasVal(pcs.acRealPowerKw) ? Number(pcs.acRealPowerKw).toFixed(1) : "--"}
                                    </td>
                                    <td className="px-1.5 py-1 text-right">
                                        {hasVal(pcs.acReactivePowerKvar) ? Number(pcs.acReactivePowerKvar).toFixed(1) : "--"}
                                    </td>
                                    <td className="px-1.5 py-1 text-right text-prizm-text-muted">
                                        {hasVal(pcs.frequencyHz) ? Number(pcs.frequencyHz).toFixed(2) : "--"}
                                    </td>

                                    <td className="px-1.5 py-1 text-center">
                                        <div className="flex justify-center items-center gap-1.5">
                                            {rot === "IN" ? (
                                                <div className="flex items-center gap-1.5" title="IN ROTATION">
                                                   <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]"></div>
                                                   <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">IN</span>
                                                </div>
                                            ) : rot === "OUT" ? (
                                                <div className="flex items-center gap-1.5" title="OUT OF ROTATION">
                                                   <div className="w-2 h-2 rounded-full bg-slate-500 shadow-[0_0_5px_rgba(100,116,139,0.5)]"></div>
                                                   <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">OUT</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5" title={rot}>
                                                   <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_5px_rgba(245,158,11,0.5)]"></div>
                                                   <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider">{rot}</span>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-1.5 py-1 text-center">
                                        <div className="flex justify-center items-center gap-2">
                                            <button
                                              disabled={rot === "IN"}
                                              onClick={() => {
                                                setModalAction('in');
                                                setModalTargets([{ array: pcs.arrayIndex, pcs: pcs.pcsIndex }]);
                                                setModalOpen(true);
                                              }}
                                              className="px-2 py-0.5 border border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors text-[8px] font-bold uppercase"
                                            >
                                              In
                                            </button>
                                            <button
                                              disabled={rot === "OUT"}
                                              onClick={() => {
                                                setModalAction('out');
                                                setModalTargets([{ array: pcs.arrayIndex, pcs: pcs.pcsIndex }]);
                                                setModalOpen(true);
                                              }}
                                              className="px-2 py-0.5 border border-slate-500/50 bg-slate-500/10 text-slate-300 hover:bg-slate-500/30 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors text-[8px] font-bold uppercase"
                                            >
                                              Out
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )})}
                            {pcsList.length === 0 && !loading && (
                                <tr><td colSpan={13} className="px-4 py-12 text-center text-prizm-text-muted font-bold tracking-widest text-xs">No PCS data available</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <RotationModal
                    isOpen={modalOpen}
                    onClose={() => setModalOpen(false)}
                    onConfirm={handleConfirm}
                    targets={modalTargets}
                    action={modalAction}
                    targetType="pcs"
                />
            </div>
        </div>
    );
}
