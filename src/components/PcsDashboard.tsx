import React, { useState, useEffect, useMemo } from "react";
import { Zap, Activity, CheckCircle2, XOctagon } from "lucide-react";
import RotationModal, { RotationTarget } from "./RotationModal";

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

export default function PcsDashboard() {
    const [pcsList, setPcsList] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Default structure fallback
    const [fallbackMode, setFallbackMode] = useState(false);

    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [modalTargets, setModalTargets] = useState<RotationTarget[]>([]);
    const [modalAction, setModalAction] = useState<"in" | "out">("in");
    
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const refreshData = async () => {
        setLoading(true);
        try {
            // Priority: load from known block/pcs sources
            let blockData: any = null;
            try {
                blockData = await fetchJsonWithTimeout("/api/local/block", { timeoutMs: 3000 });
            } catch(e) {}

            if (blockData && blockData.data && blockData.data.arrayPcsList && blockData.data.arrayPcsList.length > 0) {
                // Ensure unique IDs
                const pcsWithId = blockData.data.arrayPcsList.map((p: any) => ({
                    ...p,
                    id: p.id || `${p.arrayIndex}-${p.pcsIndex}`
                }));
                setPcsList(pcsWithId);
                setFallbackMode(false);
            } else {
                // If live readback isn't available, build a fallback layout based on site knowledge (e.g. BHE0021 = 8 PCS)
                // Just scaffold 8 arrays * 1 PCS each for standard view if no API is responsive.
                const manual = [];
                for(let a=1; a<=8; a++) {
                    manual.push({
                         id: `${a}-1`,
                         arrayIndex: a, 
                         pcsIndex: 1, 
                         rotation: "UNKNOWN", 
                         displayName: `Array ${a} / PCS 1`,
                         state: "NO_DATA",
                         vDc: 0,
                         realPwr: 0
                    });
                }
                setPcsList(manual);
                setFallbackMode(true);
            }
        } catch(e) {
            setFallbackMode(true);
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
                targets.push({ array: p.arrayIndex || p.arrayNum, pcs: p.pcsIndex || p.pcsNum });
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
                    
                    <button 
                         onClick={refreshData} disabled={loading}
                         className="flex items-center gap-1.5 px-3 py-1 bg-prizm-surface border border-prizm-border rounded hover:bg-prizm-surface-strong transition-colors text-prizm-primary font-bold text-[9px] disabled:opacity-50"
                    >
                        <Activity size={10} className={loading ? 'animate-pulse' : ''} /> REFRESH LIVE
                    </button>
                </div>
                
                {fallbackMode && (
                    <div className="bg-prizm-warning/10 border border-prizm-warning/50 text-prizm-warning p-3 rounded text-xs font-mono">
                        Live EMS block data is currently unavailable. Rendering synthetic PCS rows to allow configuration.
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

                <div className="bg-prizm-surface border-x border-b border-prizm-border rounded-b-lg relative overflow-x-auto overflow-y-visible pb-12">
                    <table className="w-full text-left text-[9px] font-mono whitespace-nowrap border-collapse">
                        <thead className="bg-prizm-surface-strong shadow-sm text-prizm-text-muted uppercase tracking-wider">
                            <tr>
                                <th className="px-1 py-0.5 border-b border-prizm-border font-bold sticky top-[102px] left-0 bg-prizm-surface-strong z-[80] w-[30px]" title="Select Array"></th>
                                <th className="px-1.5 py-0.5 border-b border-prizm-border font-bold sticky top-[102px] bg-prizm-surface-strong z-[80] whitespace-nowrap">ARR</th>
                                <th className="px-1 py-0.5 border-b border-prizm-border font-bold sticky top-[102px] bg-prizm-surface-strong z-[80] w-[30px]" title="Select PCS"></th>
                                <th className="px-1.5 py-0.5 border-b border-prizm-border font-bold sticky top-[102px] bg-prizm-surface-strong z-[80] whitespace-nowrap">PCS</th>
                                <th className="px-1.5 py-0.5 border-b border-prizm-border font-bold sticky top-[102px] bg-prizm-surface-strong z-[50]">Rotation Status</th>
                                <th className="px-1.5 py-0.5 border-b border-prizm-border font-bold sticky top-[102px] bg-prizm-surface-strong z-[50]">Telemetry (Power & V)</th>
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
                                    <td className="px-1.5 py-0.5 border-r border-prizm-border/10 bg-transparent text-center">
                                       {isArrFirst ? (
                                         <input type="checkbox" className="accent-prizm-primary w-3 h-3 cursor-pointer" 
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
                                    <td className="px-1.5 py-0.5 border-r border-prizm-border/20 bg-transparent min-w-[54px]">
                                       {isArrFirst ? <span className="text-prizm-primary font-mono font-bold">{pcs.arrayIndex}</span> : null}
                                    </td>
                                    
                                    <td className="px-1.5 py-0.5 border-r border-prizm-border/10 bg-transparent text-center">
                                       <input type="checkbox" className="accent-prizm-primary w-3 h-3 cursor-pointer" 
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
                                    <td className="px-1.5 py-0.5 border-r border-prizm-border/20 font-bold text-prizm-primary font-mono text-center min-w-[48px]">
                                        {pcs.pcsIndex}
                                    </td>

                                    <td className="px-1.5 py-0.5">
                                        <div className="flex items-center gap-2">
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
                                    <td className="px-1.5 py-0.5 text-prizm-text-muted">
                                        State: <span className="text-prizm-text">{pcs.state || 'N/A'}</span> <br/>
                                        Power: <span className="text-prizm-text">{pcs.realPwr ? `${pcs.realPwr} kW` : '---'}</span> | V: <span className="text-prizm-text">{pcs.vDc ? `${pcs.vDc} V` : '---'}</span>
                                    </td>
                                </tr>
                            )})}
                            {pcsList.length === 0 && !loading && (
                                <tr><td colSpan={6} className="px-4 py-12 text-center text-prizm-text-muted font-bold tracking-widest text-xs">No PCS data available</td></tr>
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
