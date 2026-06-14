import React, { useState, useEffect } from "react";
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

    const refreshData = async () => {
        setLoading(true);
        try {
            // Priority: load from known block/pcs sources
            let blockData: any = null;
            try {
                blockData = await fetchJsonWithTimeout("/api/local/block", { timeoutMs: 3000 });
            } catch(e) {}

            if (blockData && blockData.data && blockData.data.arrayPcsList && blockData.data.arrayPcsList.length > 0) {
                setPcsList(blockData.data.arrayPcsList);
                setFallbackMode(false);
            } else {
                // If live readback isn't available, build a fallback layout based on site knowledge (e.g. BHE0021 = 8 PCS)
                // Just scaffold 8 arrays * 1 PCS each for standard view if no API is responsive.
                const manual = [];
                for(let a=1; a<=8; a++) {
                    manual.push({
                         arrayIndex: a, 
                         pcsIndex: 1, 
                         rotation: "UNKNOWN", 
                         displayName: `PCS ${a}`,
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

    const openAction = (pcs: any, action: "in" | "out") => {
        setModalAction(action);
        setModalTargets([{ array: pcs.arrayIndex || pcs.arrayNum, pcs: pcs.pcsIndex || pcs.pcsNum }]);
        setModalOpen(true);
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
        await refreshData();
    };

    return (
        <div className="flex-1 overflow-auto bg-black p-4 text-prizm-text">
            <div className="max-w-7xl mx-auto space-y-6">
                <div className="flex items-center justify-between border-b border-prizm-border pb-4">
                    <h1 className="text-xl font-bold uppercase tracking-widest text-prizm-primary flex items-center gap-2">
                        <Zap size={20} /> PCS Dashboard
                    </h1>
                    
                    <button 
                         onClick={refreshData} disabled={loading}
                         className="px-3 py-1 flex items-center gap-2 border border-prizm-border rounded bg-prizm-surface hover:bg-prizm-surface-strong text-xs font-mono disabled:opacity-50"
                    >
                        <Activity size={12} className={loading ? 'animate-pulse' : ''} /> REFRESH
                    </button>
                </div>
                
                {fallbackMode && (
                    <div className="bg-prizm-surface-strong border border-prizm-warning/50 text-prizm-warning p-3 rounded text-xs font-mono">
                        Live EMS block data is currently unavailable. Rendering synthetic PCS rows to allow configuration.
                    </div>
                )}
                
                <div className="bg-prizm-surface border border-prizm-border rounded overflow-hidden">
                    <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-[#1a1b1e] border-b border-prizm-border text-prizm-text-muted">
                            <tr>
                                <th className="p-3 uppercase">PCS Array</th>
                                <th className="p-3 uppercase">Rotation Status</th>
                                <th className="p-3 uppercase">Telemetry (Power & V)</th>
                                <th className="p-3 uppercase text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-prizm-border">
                            {pcsList.map((pcs, idx) => {
                                const rot = (pcs.rotation || "UNKNOWN").toUpperCase();
                                return (
                                <tr key={`${pcs.arrayIndex}-${pcs.pcsIndex}-${idx}`} className="hover:bg-white/5 transition-colors">
                                    <td className="p-3">
                                        <div className="font-bold text-prizm-text">{pcs.displayName || `ARRAY ${pcs.arrayIndex} PCS ${pcs.pcsIndex}`}</div>
                                        <div className="text-prizm-text-muted">Array: {pcs.arrayIndex}</div>
                                    </td>
                                    <td className="p-3">
                                        {rot === "IN" ? (
                                            <span className="inline-flex py-1 px-2 items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded font-bold">
                                                <CheckCircle2 size={12} /> IN ROTATION
                                            </span>
                                        ) : rot === "OUT" ? (
                                            <span className="inline-flex py-1 px-2 items-center gap-1 bg-zinc-800/80 text-zinc-400 border border-zinc-700/80 rounded font-bold">
                                                <XOctagon size={12} /> OUT OF ROTATION
                                            </span>
                                        ) : (
                                            <span className="inline-flex py-1 px-2 items-center gap-1 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded font-bold">
                                                <Activity size={12} /> {rot}
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-3 text-prizm-text-muted">
                                        State: <span className="text-prizm-text">{pcs.state || 'N/A'}</span> <br/>
                                        Power: <span className="text-prizm-text">{pcs.realPwr ? `${pcs.realPwr} kW` : '---'}</span> | V: <span className="text-prizm-text">{pcs.vDc ? `${pcs.vDc} V` : '---'}</span>
                                    </td>
                                    <td className="p-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button 
                                                onClick={() => openAction(pcs, "in")}
                                                disabled={rot === "IN"}
                                                className={`px-3 py-1 font-bold rounded border uppercase ${rot === "IN" ? "bg-black/20 border-prizm-border/40 text-prizm-text-muted/40 cursor-not-allowed" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"}`}
                                            >
                                                [ In ] 
                                            </button>
                                            <button 
                                                onClick={() => openAction(pcs, "out")}
                                                disabled={rot === "OUT"}
                                                className={`px-3 py-1 font-bold rounded border uppercase ${rot === "OUT" ? "bg-black/20 border-prizm-border/40 text-prizm-text-muted/40 cursor-not-allowed" : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30"}`}
                                            >
                                                [ Out ]
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )})}
                            {pcsList.length === 0 && !loading && (
                                <tr><td colSpan={4} className="p-8 text-center text-prizm-text-muted italic">No PCS data available</td></tr>
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
