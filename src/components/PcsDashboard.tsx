import { markPerf } from '../lib/perf';
import React, { useState, useEffect, useMemo } from "react";
import { Zap, Activity, CheckCircle2, XOctagon, AlertTriangle, PanelTop } from "lucide-react";
import RotationModal, { RotationTarget } from "./RotationModal";
import { useSiteData } from "../context/SiteDataContext";

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
    const { snapshot, isInitialLoading, refreshNow } = useSiteData();
    const [pcsList, setPcsList] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    
    // Default structure fallback
    const [fallbackMode, setFallbackMode] = useState(false);
    const [pcsSource, setPcsSource] = useState("PCS source unavailable or unmapped.");

    // Row selection for array/PCS details
    const [selectedPcsId, setSelectedPcsId] = useState<string | null>(null);

    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [modalTargets, setModalTargets] = useState<RotationTarget[]>([]);
    const [modalAction, setModalAction] = useState<"in" | "out">("in");
    
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const dashboardData = useMemo(() => {
        if (!snapshot) return null;
        return {
            pcs: snapshot.normalized?.pcs || [],
            source: snapshot.normalized?.pcs?.[0]?.source?.sourceName 
               ? "Coordinator Site Data Engine" 
               : "Coordinator Site Data Engine"
        };
    }, [snapshot]);

    const selectedPcs = useMemo(() => {
        if (!selectedPcsId) return null;
        return pcsList.find(p => p.id === selectedPcsId) || null;
    }, [pcsList, selectedPcsId]);

    useEffect(() => {
        // Read selected PCS ID from localStorage
        const targetPcsId = localStorage.getItem("prizm_selected_pcs_id");
        if (targetPcsId) {
            setSelectedPcsId(targetPcsId);
            localStorage.removeItem("prizm_selected_pcs_id");
        }
    }, [pcsList]);

    const refreshData = async () => {
        const t0 = performance.now();
        if (pcsList.length > 0) setRefreshing(true);
        else setLoading(true);
        try {
            await refreshNow(true);
        } catch(e) {
            console.error("Manual refresh error", e);
        } finally {
            setLoading(false);
            setRefreshing(false);
            markPerf('PcsDashboard fetch & map', t0);
        }
    };

    useEffect(() => {
        if (isInitialLoading) return;
        
        let pcsRows: any[] = [];
        let sourceMeta = "PCS source unavailable or unmapped.";
        if (dashboardData && dashboardData.pcs) {
             pcsRows = dashboardData.pcs;
             sourceMeta = dashboardData.source || "Coordinator Site Data Engine";
        }

        if (pcsRows.length > 0) {
            // Ensure unique IDs and normalize fields
            const pcsWithId = pcsRows.map((p: any, idx: number) => {
                const finite = (v: any): number | null => {
                  const n = Number(v);
                  return Number.isFinite(n) ? n : null;
                };

                const arrayIndex =
                  finite(p.arrayNumber) ??
                  finite(p.arrayIndex) ??
                  finite(p.arrayNum) ??
                  finite(p.raw?.arrayIndex) ??
                  1;
                const pcsIndex =
                  finite(p.pcsNumber) ??
                  finite(p.pcsIndex) ??
                  finite(p.pcsNum) ??
                  finite(p.arrayPcsIndex) ??
                  finite(p.raw?.arrayPcsIndex) ??
                  1;
                const rotation =
                  String(
                    p.rotationStatus ??
                    p.rotation ??
                    (
                      p.outRotation === true ? "OUT" :
                      p.outRotation === false ? "IN" :
                      "UNKNOWN"
                    )
                  ).toUpperCase();

                const state = p.state ?? p.status ?? p.raw?.state ?? "Unknown";

                const dcVoltage = finite(p.dcVoltageVolt) ?? finite(p.dcVoltage) ?? finite(p.vDc) ?? finite(p.raw?.dcVoltageVolt);
                const dcCurrent = finite(p.dcCurrentAmp) ?? finite(p.dcCurrent) ?? finite(p.iDc) ?? finite(p.raw?.dcCurrentAmp);
                const acRealPowerKw =
                  finite(p.acRealPowerKW) ??
                  finite(p.acRealPowerKw) ??
                  finite(p.realPwr) ??
                  finite(p.raw?.acRealPowerKW);
                const acReactivePowerKvar =
                  finite(p.acReactivePowerKVAR) ??
                  finite(p.acReactivePowerKvar) ??
                  finite(p.reactivePwr) ??
                  finite(p.raw?.acReactivePowerKVAR);
                const frequencyHz =
                  finite(p.acFrequencyHz) ??
                  finite(p.frequencyHz) ??
                  finite(p.freqHz) ??
                  finite(p.raw?.acFrequencyHz);

                const acVoltageDisplay = Array.isArray(p.phaseData) && p.phaseData.length
                  ? p.phaseData
                      .map((ph: any) => finite(ph.acVoltageVolt))
                      .filter((n: number | null): n is number => n !== null)
                      .map((n: number) => n.toFixed(0))
                      .join(" / ")
                  : (p.acVoltageDisplay ?? "-- / -- / --");

                const acCurrent = Array.isArray(p.phaseData) && p.phaseData.length
                  ? p.phaseData
                      .map((ph: any) => finite(ph.acCurrentAmp))
                      .filter((n: number | null): n is number => n !== null)
                      .reduce((sum: number, curr: number) => sum + curr, 0) / p.phaseData.length
                  : (finite(p.acCurrent) ?? finite(p.iAc) ?? finite(p.acCurrentAmp) ?? null);

                return {
                    ...p,
                    id: p.id || `${arrayIndex}-${pcsIndex}`,
                    arrayIndex,
                    pcsIndex,
                    displayKey: p.displayKey ?? p.name ?? `ArrayPcs:${arrayIndex}:${pcsIndex}`,
                    dcVoltage,
                    dcCurrent,
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
        } else {
            setPcsList([]);
            setPcsSource("PCS source unavailable or unmapped.");
            setFallbackMode(true);
        }
        setLoading(false);
    }, [dashboardData, isInitialLoading]);

    useEffect(() => {
        if (!active) return;
        const iv = setInterval(() => refreshNow(false), 15000);
        return () => clearInterval(iv);
    }, [active, refreshNow]);

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

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full items-start">
                    <div className={selectedPcsId !== null ? "lg:col-span-7" : "lg:col-span-12"}>
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
                                <tr 
                                    key={pcs.id} 
                                    onClick={() => setSelectedPcsId(pcs.id)}
                                    className={`group hover:bg-prizm-primary/5 cursor-pointer transition-colors ${selectedPcsId === pcs.id ? "bg-prizm-primary/10 border-l border-prizm-primary" : ""}`}
                                >
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
                                              onClick={(e) => {
                                                e.stopPropagation();
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
                                              onClick={(e) => {
                                                e.stopPropagation();
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
            </div>

            {/* Detail Panel Column */}
            {selectedPcsId !== null && (
                <div className="lg:col-span-5 bg-prizm-surface border border-prizm-border rounded-lg p-5 space-y-5 flex flex-col h-fit max-h-[85vh] overflow-y-auto no-scrollbar relative animate-in slide-in-from-right duration-200">
                    {selectedPcs ? (
                        <>
                            <div className="flex justify-between items-start border-b border-prizm-border pb-3">
                                <div>
                                    <div className="text-[9px] text-[#10b981] font-bold uppercase tracking-wider font-mono select-none">
                                        ARRAY: 0{selectedPcs.arrayIndex} - PCS: 0{selectedPcs.pcsIndex}
                                    </div>
                                    <h2 className="text-xs font-bold text-prizm-text font-mono mt-0.5 select-none uppercase">
                                        PCS INVERTER TELEMETRY
                                    </h2>
                                    <p className="text-[8.5px] text-prizm-text-muted font-mono mt-1">
                                        Last Update: <span className="text-prizm-text font-bold">
                                            {selectedPcs.raw?.timestamp ? new Date(Number(selectedPcs.raw.timestamp)).toLocaleTimeString() : new Date().toLocaleTimeString()}
                                        </span>
                                    </p>
                                </div>
                                <button 
                                    onClick={() => setSelectedPcsId(null)}
                                    className="text-prizm-text-muted hover:text-white hover:border-prizm-primary/50 text-[9px] font-bold font-mono uppercase px-2 py-0.5 border border-prizm-border rounded bg-prizm-surface-strong transition-all select-none"
                                >
                                    ✕ Close
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-3 select-none">
                                <div className="bg-prizm-surface-strong border border-prizm-border/60 p-2.5 rounded">
                                    <div className="text-[8px] text-prizm-text-muted font-mono uppercase font-bold">Operation State</div>
                                    <div className="text-[10px] text-emerald-400 font-bold font-mono mt-0.5 flex items-center gap-1">
                                        <CheckCircle2 size={10} className="text-emerald-400" /> {selectedPcs.state || "ACTIVE"}
                                    </div>
                                    <div className="text-[8px] text-prizm-text-muted font-mono mt-1 truncate uppercase">
                                        Ready Status: <span className="text-prizm-text font-bold">
                                            {selectedPcs.raw?.ready === true || selectedPcs.raw?.isReady === true || selectedPcs.raw?.readyStatus === "READY" || selectedPcs.state === "Ready" || selectedPcs.state === "Running" ? "READY" : "NOT READY"}
                                        </span>
                                    </div>
                                </div>
                                
                                <div className="bg-prizm-surface-strong border border-prizm-border/60 p-2.5 rounded">
                                    <div className="text-[8px] text-prizm-text-muted font-mono uppercase font-bold">Rotation Status</div>
                                    <div className="text-[10px] text-prizm-text font-bold font-mono mt-0.5 uppercase tracking-wider flex items-center gap-1.5">
                                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${selectedPcs.rotation === "IN" ? "bg-emerald-400" : "bg-slate-400"}`}></span>
                                        {selectedPcs.rotation}
                                    </div>
                                    <div className="text-[8px] text-prizm-text-muted font-mono mt-1 uppercase">
                                        Apparent Pwr: <span className="text-prizm-text font-bold">
                                            {Math.round(Math.sqrt(Math.pow(selectedPcs.acRealPowerKw || 0, 2) + Math.pow(selectedPcs.acReactivePowerKvar || 0, 2)))} kVA
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Electrical Parameters */}
                            <div className="border border-prizm-border bg-prizm-surface-strong rounded p-3.5 space-y-3.5 font-mono">
                                <h3 className="text-[9px] font-bold text-prizm-primary uppercase tracking-wider border-b border-prizm-border/60 pb-1.5">Electrical Parameters</h3>
                                
                                <div className="grid grid-cols-2 gap-4 text-[9px]">
                                    <div>
                                        <span className="text-prizm-text-muted block text-[7.5px] uppercase">DC Input Voltage</span>
                                        <span className="text-prizm-text font-bold text-xs">{selectedPcs.dcVoltage !== null ? `${selectedPcs.dcVoltage.toFixed(1)} Vdc` : "--"}</span>
                                    </div>
                                    <div>
                                        <span className="text-prizm-text-muted block text-[7.5px] uppercase">DC Input Current</span>
                                        <span className="text-prizm-text font-bold text-xs">{selectedPcs.dcCurrent !== null ? `${selectedPcs.dcCurrent.toFixed(1)} Adc` : "--"}</span>
                                    </div>
                                    <div>
                                        <span className="text-prizm-text-muted block text-[7.5px] uppercase">AC Grid Frequency</span>
                                        <span className="text-prizm-text font-bold text-xs">{selectedPcs.frequencyHz !== null ? `${selectedPcs.frequencyHz.toFixed(2)} Hz` : "--"}</span>
                                    </div>
                                    <div>
                                        <span className="text-prizm-text-muted block text-[7.5px] uppercase">Source Endpoint</span>
                                        <span className="text-prizm-text-muted text-[8px] block truncate text-left uppercase" title={selectedPcs.sourcePath}>{selectedPcs.sourcePath || "discovered"}</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-2 text-[8px] border-t border-prizm-border/40 pt-3">
                                    <div className="bg-prizm-surface p-2 rounded">
                                        <span className="text-prizm-text-muted block uppercase text-[7px]">Real Measured</span>
                                        <span className="text-emerald-400 font-bold">{selectedPcs.acRealPowerKw !== null ? `${selectedPcs.acRealPowerKw.toFixed(1)} kW` : "--"}</span>
                                    </div>
                                    <div className="bg-prizm-surface p-2 rounded">
                                        <span className="text-prizm-text-muted block uppercase text-[7px]">Setting</span>
                                        <span className="text-prizm-text font-bold">{selectedPcs.raw?.acRealPowerSettingKW !== undefined ? `${selectedPcs.raw.acRealPowerSettingKW} kW` : (selectedPcs.raw?.acRealPowerSetting !== undefined ? `${selectedPcs.raw.acRealPowerSetting} kW` : "--")}</span>
                                    </div>
                                    <div className="bg-prizm-surface p-2 rounded">
                                        <span className="text-prizm-text-muted block uppercase text-[7px]">Command</span>
                                        <span className="text-prizm-text font-bold">{selectedPcs.raw?.acRealPowerCommandKW !== undefined ? `${selectedPcs.raw.acRealPowerCommandKW} kW` : (selectedPcs.raw?.acRealPowerCommand !== undefined ? `${selectedPcs.raw.acRealPowerCommand} kW` : "--")}</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-2 text-[8px]">
                                    <div className="bg-prizm-surface p-2 rounded">
                                        <span className="text-prizm-text-muted block uppercase text-[7px]">Reactive Meas</span>
                                        <span className="text-prizm-primary font-bold">{selectedPcs.acReactivePowerKvar !== null ? `${selectedPcs.acReactivePowerKvar.toFixed(1)} kVAR` : "--"}</span>
                                    </div>
                                    <div className="bg-prizm-surface p-2 rounded">
                                        <span className="text-prizm-text-muted block uppercase text-[7px]">Setting</span>
                                        <span className="text-prizm-text font-bold">{selectedPcs.raw?.acReactivePowerSettingKVAR !== undefined ? `${selectedPcs.raw.acReactivePowerSettingKVAR} kVAR` : (selectedPcs.raw?.acReactivePowerSetting !== undefined ? `${selectedPcs.raw.acReactivePowerSetting} kVAR` : "--")}</span>
                                    </div>
                                    <div className="bg-prizm-surface p-2 rounded">
                                        <span className="text-prizm-text-muted block uppercase text-[7px]">Command</span>
                                        <span className="text-prizm-text font-bold">{selectedPcs.raw?.acReactivePowerCommandKVAR !== undefined ? `${selectedPcs.raw.acReactivePowerCommandKVAR} kVAR` : (selectedPcs.raw?.acReactivePowerCommand !== undefined ? `${selectedPcs.raw.acReactivePowerCommand} kVAR` : "--")}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Phase Grid Details */}
                            {Array.isArray(selectedPcs.phaseData) && selectedPcs.phaseData.length > 0 && (
                                <div className="border border-prizm-border bg-prizm-surface-strong rounded p-3 font-mono">
                                    <h3 className="text-[9px] font-bold text-prizm-primary uppercase tracking-wider mb-2 select-none">Phase Metrics (A/B/C)</h3>
                                    <table className="w-full text-left text-[8px]">
                                        <thead>
                                            <tr className="border-b border-prizm-border/40 text-prizm-text-muted uppercase">
                                                <th className="py-1 font-bold">Phase</th>
                                                <th className="py-1 font-bold text-right">AC Voltage</th>
                                                <th className="py-1 font-bold text-right">AC Current</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-prizm-border/20 text-prizm-text">
                                            {selectedPcs.phaseData.map((ph: any, idx: number) => (
                                                <tr key={idx}>
                                                    <td className="py-1 font-bold">Phase {String.fromCharCode(65 + idx)}</td>
                                                    <td className="py-1 text-right">{ph.acVoltageVolt !== null && ph.acVoltageVolt !== undefined ? `${Number(ph.acVoltageVolt).toFixed(1)} V` : "--"}</td>
                                                    <td className="py-1 text-right">{ph.acCurrentAmp !== null && ph.acCurrentAmp !== undefined ? `${Number(ph.acCurrentAmp).toFixed(1)} A` : "--"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Vendor Event Codes */}
                            {selectedPcs.raw?.vendorEventCodes !== undefined && (
                                <div className="border border-prizm-border bg-prizm-surface-strong rounded p-3 font-mono text-[8.5px]">
                                    <h3 className="text-[9px] font-bold text-yellow-500 uppercase tracking-wider mb-1.5 select-none font-sans flex items-center gap-1">
                                        <AlertTriangle size={10} /> Active Event Manifest
                                    </h3>
                                    <div className="bg-prizm-surface p-2 border border-prizm-border/40 rounded max-h-[80px] overflow-y-auto font-mono text-[8px] break-all uppercase text-prizm-text">
                                        {selectedPcs.raw?.vendorEventCodes && String(selectedPcs.raw.vendorEventCodes).length > 0 ? String(selectedPcs.raw.vendorEventCodes) : "No anomalous event codes detected."}
                                    </div>
                                </div>
                            )}

                            {/* Small notification */}
                            <div className="text-[7.5px] text-prizm-text-muted text-center font-mono select-none uppercase">
                                * Array string telemetry is available in String Detail and Site Health.
                            </div>
                        </>
                    ) : (
                        <div className="text-xs font-mono text-prizm-text-muted select-none uppercase">Loading selected PCS telemetry cache...</div>
                    )}
                </div>
            )}
        </div>

        <RotationModal
            isOpen={modalOpen}
            onClose={() => setModalOpen(false)}
            onConfirm={handleConfirm}
            targets={modalTargets}
            action={modalAction}
            targetType="pcs"
        />

        {/* Array Summary */}
        <div className="bg-prizm-surface border border-prizm-border rounded-lg flex flex-col mt-6">
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-prizm-surface-strong/50 border-b border-prizm-border">
                <div className="flex items-center gap-2">
                    <PanelTop size={14} className="text-prizm-primary" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-prizm-text">
                        ARRAY SUMMARY (PCS/Array Integration Pending)
                    </span>
                </div>
                {/* Visual Legend */}
                <div className="flex flex-wrap items-center gap-4 text-[9px] font-medium font-sans">
                    <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm bg-emerald-500/20 border border-emerald-500/50 flex-shrink-0"></span>
                        <span className="text-prizm-data-green font-bold uppercase">Online</span>
                        <span className="text-prizm-text-muted lowercase">(closed contactor)</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm bg-amber-500/20 border border-amber-500/50 flex-shrink-0"></span>
                        <span className="text-amber-400 font-bold uppercase">Nearline</span>
                        <span className="text-prizm-text-muted lowercase">(open contactor)</span>
                    </div>
                </div>
            </div>
            
            <div className="p-3 text-[10px] text-prizm-text-muted font-mono uppercase border-b border-prizm-border bg-prizm-surface/30">
                Notice: Array Summary moved from Block Summary. PCS/Array integration pending.
            </div>

            <div className="overflow-x-auto no-scrollbar">
                {snapshot?.rollups?.arraySummary && snapshot.rollups.arraySummary.length > 0 ? (
                    <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                        <thead className="bg-prizm-surface-strong text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border">
                            <tr>
                                <th className="py-2 px-3 font-bold">Array</th>
                                <th className="py-2 px-3 font-bold text-center">Comm.</th>
                                <th className="py-2 px-3 font-bold text-center bg-emerald-500/5 text-prizm-data-green">Online SOC</th>
                                <th className="py-2 px-3 font-bold text-center bg-amber-500/5 text-amber-400">Nearline SOC</th>
                                <th className="py-2 px-3 font-bold text-center bg-red-500/5 text-red-400">Offline SOC</th>
                                <th className="py-2 px-3 font-bold text-center bg-amber-500/5 text-amber-400">Nearline kWh</th>
                                <th className="py-2 px-3 font-bold text-center">Available kW AC</th>
                                <th className="py-2 px-3 font-bold text-center">Commanded kW AC</th>
                                <th className="py-2 px-3 font-bold text-center">Measured kW AC</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-prizm-border">
                            {snapshot.rollups.arraySummary.map((arr: any, idx: number) => {
                                const name = arr.friendlyString || arr.name || `Array ${arr.arrayNumber ?? arr.arrayIndex ?? (idx + 1)}`;
                                
                                const formatSOC = (val: any) => {
                                    if (val === undefined || val === null || val === "" || val === "--") return "--";
                                    const numVal = Number(val);
                                    if (isNaN(numVal)) return "--";
                                    return (numVal < 1 ? numVal * 100 : numVal).toFixed(1).replace(/\.0$/, "") + " %";
                                };
                                
                                const formatVal = (val: any, suffix = "") => {
                                    if (val === undefined || val === null || val === "" || val === "--") return "--";
                                    return String(val) + (suffix ? " " + suffix : "");
                                };
                                
                                const hasChargeDischarge = hasVal(arr.availableACChargekW) && hasVal(arr.availableACDischargekW);
                                const chargeDischargeDisplay = hasChargeDischarge 
                                    ? `${arr.availableACChargekW} / ${arr.availableACDischargekW}` 
                                    : "--";

                                return (
                                    <tr key={idx} className="hover:bg-prizm-surface-strong/30 transition-colors">
                                        <td className="py-2 px-3 text-prizm-primary font-bold">{name}</td>
                                        <td className="py-2 px-3 text-center text-prizm-data-green font-bold">
                                            {arr.communicating !== false ? "OK" : <span className="text-prizm-danger">FAULT</span>}
                                        </td>
                                        <td className="py-2 px-3 text-center text-prizm-data-green font-bold bg-emerald-500/5">{formatSOC(arr.onlineSOC)}</td>
                                        <td className="py-2 px-3 text-center text-amber-400 font-semibold bg-amber-500/5">{formatSOC(arr.nearlineSOC)}</td>
                                        <td className="py-2 px-3 text-center text-prizm-text-muted bg-red-500/5">{formatSOC(arr.offlineSOC)}</td>
                                        <td className="py-2 px-3 text-center text-amber-400 bg-amber-500/5">{formatVal(arr.nearlineAvailableKWh ?? arr.nearlineAvailableKwh, "kWh")}</td>
                                        <td className="py-2 px-3 text-center text-prizm-text">{chargeDischargeDisplay}</td>
                                        <td className="py-2 px-3 text-center text-prizm-warning">{formatVal(arr.commandedkW ?? arr.commandedKw)}</td>
                                        <td className="py-2 px-3 text-center text-prizm-text">{formatVal(arr.measuredkW ?? arr.measuredKw)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                ) : (
                    <div className="p-4 text-[10px] font-mono uppercase text-prizm-text-muted">
                        No Array Summary data available or warming up.
                    </div>
                )}
            </div>
        </div>
            </div>
        </div>
    );
}
