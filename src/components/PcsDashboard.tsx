import { markPerf } from '../lib/perf';
import React, { useState, useEffect, useMemo, useRef } from "react";
import { Zap, Activity, CheckCircle2, XOctagon, AlertTriangle, PanelTop } from "lucide-react";
import RotationModal, { RotationTarget } from "./RotationModal";
import { useSiteData } from "../context/SiteDataContext";

const hasVal = (v: any) => v !== undefined && v !== null && v !== "" && v !== "--";
function PcsSwitchOneLine({ telemetry }: { telemetry: any }) {
    const stateColor = (state: any) => String(state || "UNKNOWN").toUpperCase() === "CLOSED"
        || String(state || "UNKNOWN").toUpperCase() === "OK" ? "#16a34a"
        : String(state || "UNKNOWN").toUpperCase() === "OPEN" ? "#475569"
        : String(state || "UNKNOWN").toUpperCase() === "ERROR" ? "#dc2626" : "#f59e0b";
    const SvgSwitch = ({ x, y, state, label }: { x: number; y: number; state: any; label: string }) => {
        const normalized = String(state || "UNKNOWN").toUpperCase();
        const closed = normalized === "CLOSED";
        const open = normalized === "OPEN";
        const color = stateColor(normalized);
        return <g aria-label={`${label}: ${normalized}`}>
            <circle cx={x - 12} cy={y} r="4" fill="#fff" stroke={color} strokeWidth="3" />
            <circle cx={x + 12} cy={y} r="4" fill="#fff" stroke={color} strokeWidth="3" />
            <line x1={x - 8} y1={y - 1} x2={x + 8} y2={closed ? y : y - 14} stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={!closed && !open ? "4 3" : undefined} />
            <circle cx={x} cy={y + 25} r="6" fill={color} stroke="#fff" strokeWidth="2" />
            <text x={x} y={y + 43} textAnchor="middle" className="fill-slate-600 text-[10px] font-bold">{label}</text>
            <text x={x} y={y + 56} textAnchor="middle" fill={color} className="text-[9px] font-extrabold">{normalized}</text>
        </g>;
    };
    const MiniSwitch = ({ x, y, state, label }: { x: number; y: number; state: any; label: string }) => {
        const normalized = String(state || "UNKNOWN").toUpperCase();
        const closed = normalized === "CLOSED";
        const open = normalized === "OPEN";
        const color = stateColor(normalized);
        return <g aria-label={`${label}: ${normalized}`}>
            <circle cx={x - 7} cy={y} r="2.5" fill="#fff" stroke={color} strokeWidth="2" />
            <circle cx={x + 7} cy={y} r="2.5" fill="#fff" stroke={color} strokeWidth="2" />
            <line x1={x - 4.5} y1={y - 0.5} x2={x + 4.5} y2={closed ? y : y - 8} stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={!closed && !open ? "2 2" : undefined} />
            <text x={x} y={y - 13} textAnchor="middle" fill={color} className="text-[7px] font-extrabold">{label}</text>
        </g>;
    };
    const combinedDcState = (() => {
        const states = [telemetry.dcSwitch1, telemetry.dcSwitch2, telemetry.dcSwitch3]
            .map((value) => String(value || "UNKNOWN").toUpperCase());
        if (states.every((state) => state === "CLOSED")) return "CLOSED";
        if (states.every((state) => state === "OPEN")) return "OPEN";
        return "UNKNOWN";
    })();
    const StatusBadge = ({ x, y, state }: { x: number; y: number; state: any }) => {
        const normalized = String(state || "UNKNOWN").toUpperCase();
        const color = stateColor(normalized);
        return <g aria-label={`Device status: ${normalized}`}>
            <circle cx={x} cy={y} r="14" fill="#fff" stroke="#64748b" strokeWidth="1.5" />
            <circle cx={x} cy={y} r="11" fill={color} />
            {normalized === "CLOSED" || normalized === "OK"
                ? <path d={`M${x - 5} ${y} l4 4 7 -8`} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                : normalized === "OPEN"
                    ? <path d={`M${x - 5} ${y - 5} l10 10 M${x + 5} ${y - 5} l-10 10`} stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
                    : <text x={x} y={y + 5} textAnchor="middle" fill="#fff" className="text-[13px] font-black">?</text>}
        </g>;
    };
    const unknown = "UNKNOWN";
    return (
        <div className="overflow-x-auto rounded border border-slate-300 bg-gradient-to-b from-[#f4f4f4] to-white p-2 shadow-inner">
            <svg viewBox="0 0 900 205" className="min-w-[760px] w-full" role="img" aria-label="Sunny Central PCS switch and component one-line status">
                <rect x="8" y="8" width="884" height="189" rx="2" fill="url(#pcsPanel)" stroke="#c4c8cc" />
                <defs><linearGradient id="pcsPanel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ededed" /><stop offset="1" stopColor="#ffffff" /></linearGradient></defs>

                {/* Keep the feeder behind equipment, but stop it at each switch so the
                    contactor blades have a clear, visible isolation gap. */}
                {[
                    [116, 164],
                    [196, 422],
                    [454, 659],
                    [691, 786],
                ].map(([x1, x2]) => (
                    <line key={`${x1}-${x2}`} x1={x1} y1="105" x2={x2} y2="105" stroke="#57a63c" strokeWidth="5" />
                ))}

                <g aria-label="DC battery input">
                    <rect x="65" y="61" width="58" height="88" fill="#fff" stroke="#3f3f46" strokeWidth="5" />
                    <rect x="82" y="82" width="25" height="46" fill="none" stroke="#3f3f46" strokeWidth="4" />
                    {[89, 98, 107, 116].map((y) => <line key={y} x1="87" y1={y} x2="102" y2={y} stroke="#3f3f46" strokeWidth="3" />)}
                    <path d="M87 76 h15 l-3 -6 h-9 z" fill="#3f3f46" />
                    <StatusBadge x={123} y={63} state={telemetry.dcHealth || combinedDcState} />
                    <text x="94" y="172" textAnchor="middle" className="fill-[#1769aa] text-[11px] font-extrabold">DC SIDE</text>
                </g>
                <MiniSwitch x={154} y={63} state={telemetry.dcSwitch1} label="DC1" />
                <MiniSwitch x={180} y={63} state={telemetry.dcSwitch2} label="DC2" />
                <MiniSwitch x={206} y={63} state={telemetry.dcSwitch3} label="DC3" />
                <SvgSwitch x={180} y={105} state={combinedDcState} label="DC SWITCH" />

                <g aria-label="Inverter">
                    <rect x="296" y="61" width="78" height="88" fill="#fff" stroke="#3f3f46" strokeWidth="5" />
                    <line x1="298" y1="146" x2="372" y2="64" stroke="#3f3f46" strokeWidth="5" />
                    <path d="M306 78 h14 M306 85 h14" stroke="#3f3f46" strokeWidth="4" />
                    <path d="M344 127 q7 -8 14 0 q7 8 14 0 M344 135 q7 -8 14 0 q7 8 14 0" fill="none" stroke="#3f3f46" strokeWidth="3" />
                    <StatusBadge x={374} y={63} state={telemetry.inverterHealth} />
                    <text x="335" y="172" textAnchor="middle" className="fill-[#1769aa] text-[11px] font-extrabold">INVERTER</text>
                </g>
                <SvgSwitch x={438} y={105} state={telemetry.acSwitch} label="AC SWITCH" />

                <g aria-label="Transformer">
                    <rect x="533" y="61" width="78" height="88" fill="#fff" stroke="#3f3f46" strokeWidth="5" />
                    <circle cx="566" cy="105" r="17" fill="none" stroke="#3f3f46" strokeWidth="4" />
                    <circle cx="580" cy="105" r="17" fill="none" stroke="#3f3f46" strokeWidth="4" />
                    <StatusBadge x={611} y={63} state={telemetry.transformerHealth} />
                    <text x="572" y="172" textAnchor="middle" className="fill-[#1769aa] text-[11px] font-extrabold">AC SIDE</text>
                </g>
                <SvgSwitch x={675} y={105} state={telemetry.mvSwitch || unknown} label="GRID SWITCH" />

                <g aria-label="Utility grid">
                    <rect x="786" y="61" width="58" height="88" fill="#fff" stroke="#3f3f46" strokeWidth="5" />
                    <path d="M815 76 l-18 58 M815 76 l18 58 M801 123 h28 M804 109 h22 M808 95 h14 M794 87 q21 -18 42 0" fill="none" stroke="#262626" strokeWidth="3" />
                    <StatusBadge x={844} y={63} state={telemetry.gridHealth} />
                    <text x="815" y="172" textAnchor="middle" className="fill-[#1769aa] text-[11px] font-extrabold">GRID</text>
                </g>

            </svg>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-4 border-t border-prizm-border/50 pt-2 text-[7px] font-bold uppercase text-prizm-text-muted">
                <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-500" />Closed</span>
                <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-slate-500" />Open</span>
                <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-amber-500" />Unknown / stale</span>
            </div>
        </div>
    );
}

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
    const { snapshot, isInitialLoading } = useSiteData();
    const [pcsList, setPcsList] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    
    // Default structure fallback
    const [fallbackMode, setFallbackMode] = useState(false);
    const [pcsSource, setPcsSource] = useState("PCS source unavailable or unmapped.");
    const [pcsUpdatedAt, setPcsUpdatedAt] = useState<string | null>(null);
    const [arrayPowerSummary, setArrayPowerSummary] = useState<any[]>([]);
    const [modbusArraySummary, setModbusArraySummary] = useState<any[]>([]);
    const [modbusTelemetry, setModbusTelemetry] = useState<any>(null);

    // Row selection for array/PCS details
    const [selectedPcsId, setSelectedPcsId] = useState<string | null>(null);
    const [pcsDetailTab, setPcsDetailTab] = useState<"overview" | "electrical" | "thermal" | "diagnostics" | "controls">("overview");

    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [modalTargets, setModalTargets] = useState<RotationTarget[]>([]);
    const [modalAction, setModalAction] = useState<"in" | "out">("in");
    
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const apiDataLoadedRef = useRef(false);

    const snapshotDashboardData = useMemo(() => {
        if (!snapshot) return null;
        return {
            pcs: snapshot.normalized?.pcs || [],
            source: snapshot.normalized?.pcs?.[0]?.source?.sourceName 
               ? "Coordinator Site Data Engine" 
               : "Coordinator Site Data Engine"
        };
    }, [snapshot]);

    const applyDashboardData = React.useCallback((data: any) => {
        apiDataLoadedRef.current = true;
        setModbusTelemetry(data?.modbusTelemetry || null);
        setArrayPowerSummary(Array.isArray(data?.arrayPowerSummary) ? data.arrayPowerSummary : []);
        setModbusArraySummary(Array.isArray(data?.modbusArraySummary) ? data.modbusArraySummary : []);
        const pcsRows = (Array.isArray(data?.pcs) ? data.pcs : []).map((p: any, index: number) => {
            const numberOrNull = (value: any) => {
                const parsed = Number(value);
                return Number.isFinite(parsed) ? parsed : null;
            };
            const arrayIndex = numberOrNull(p.arrayNumber ?? p.arrayIndex) ?? 1;
            const pcsIndex = numberOrNull(p.pcsNumber ?? p.pcsIndex) ?? 1;
            const phaseVoltages = [p.acVoltageAB, p.acVoltageBC, p.acVoltageCA]
                .map(numberOrNull)
                .filter((value: number | null): value is number => value !== null);
            return {
                ...p,
                id: p.id || p.pcsId || `${arrayIndex}-${pcsIndex}-${index}`,
                arrayIndex,
                pcsIndex,
                dcVoltage: numberOrNull(p.dcVoltageVolt ?? p.dcVoltage),
                dcCurrent: numberOrNull(p.dcCurrentAmp ?? p.dcCurrent),
                acVoltageDisplay: phaseVoltages.length ? phaseVoltages.map((value: number) => value.toFixed(0)).join(" / ") : "-- / -- / --",
                acCurrent: numberOrNull(p.acCurrent ?? p.acCurrentAmp),
                acRealPowerKw: numberOrNull(p.acRealPowerKW ?? p.acRealPowerKw),
                acReactivePowerKvar: numberOrNull(p.acReactivePowerKVAR ?? p.acReactivePowerKvar),
                acCmdRealPowerKw: numberOrNull(p.acCmdRealPowerKW ?? p.acCmdRealPowerKw),
                acCmdReactivePowerKvar: numberOrNull(p.acCmdReactivePowerKVAR ?? p.acCmdReactivePowerKvar),
                acRealPowerSettingKw: numberOrNull(p.acRealPowerSettingKW ?? p.acRealPowerSettingKw),
                acReactivePowerSettingKvar: numberOrNull(p.acReactivePowerSettingKVAR ?? p.acReactivePowerSettingKvar),
                frequencyHz: numberOrNull(p.acFrequencyHz ?? p.frequencyHz),
                rotation: String(p.rotationStatus ?? p.rotation ?? "UNKNOWN").replace("IN_ROTATION", "IN").replace("OUT_OF_ROTATION", "OUT"),
                sourcePath: p.sourcePath ?? p.sourceEndpoint ?? "unreported",
                raw: p.raw ?? p
            };
        });
        if (pcsRows.length > 0) {
            setPcsList((previous) => {
                const previousById = new Map(previous.map((row: any) => [row.id, row]));
                let changed = previous.length !== pcsRows.length;
                const merged = pcsRows.map((row: any) => {
                    const prior = previousById.get(row.id);
                    if (prior && JSON.stringify(prior) === JSON.stringify(row)) return prior;
                    changed = true;
                    return row;
                });
                return changed ? merged : previous;
            });
            setPcsSource(data?.modbusTelemetry?.available && !data?.modbusTelemetry?.stale ? "EMS Modbus + coordinator" : (data?.source || "Coordinator Site Data Engine"));
            setPcsUpdatedAt(data?.modbusTelemetry?.capturedAt || data?.cache?.lastUpdated || data?.cache?.capturedAt || null);
            setFallbackMode(false);
        } else {
            setPcsList((previous) => {
                if (previous.length === 0) {
                    setPcsSource("PCS source unavailable or unmapped.");
                    setFallbackMode(true);
                }
                return previous;
            });
        }
    }, []);

    const fetchPcsView = React.useCallback(async (force = false) => {
        const first = await fetchJsonWithTimeout(`/api/local/site-data/pcs${force ? "?refresh=true" : ""}`, { timeoutMs: 10000 });
        if (!force) return first;

        const previousStamp = first?.cache?.lastUpdated;
        const deadline = Date.now() + 9000;
        let latest = first;
        while (Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 500));
            latest = await fetchJsonWithTimeout("/api/local/site-data/pcs", { timeoutMs: 3000 });
            if (latest?.cache?.lastUpdated && latest.cache.lastUpdated !== previousStamp) break;
        }
        return latest;
    }, []);

    const selectedPcs = useMemo(() => {
        if (!selectedPcsId) return null;
        return pcsList.find(p => p.id === selectedPcsId) || null;
    }, [pcsList, selectedPcsId]);
    // Keep every PCS collapsed until the technician deliberately opens one.
    // This prevents an arbitrary first-unit drill-down from dominating the page.
    const oneLinePcs = selectedPcs;
    const selectedPcsIndex = selectedPcs ? pcsList.findIndex((pcs: any) => pcs.id === selectedPcs.id) : -1;
    const selectAdjacentPcs = (offset: number) => {
        if (!pcsList.length) return;
        const base = selectedPcsIndex >= 0 ? selectedPcsIndex : 0;
        const next = (base + offset + pcsList.length) % pcsList.length;
        setSelectedPcsId(pcsList[next].id);
    };
    const oneLineValue = (value: any, unit: string, digits = 1) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? `${numeric.toFixed(digits)} ${unit}` : "Not reported";
    };
    const smaPoints = oneLinePcs?.pcsSwitches?.smaProcessData || {};
    const smaValue = (key: string) => smaPoints[key]?.value;
    const smaNumber = (key: string) => {
        const value = Number(smaValue(key));
        return Number.isFinite(value) ? value : null;
    };
    const smaDisplay = (key: string, unit = "", digits = 1) => {
        const value = smaNumber(key);
        return value === null ? "Not reported" : `${value.toFixed(digits)}${unit ? ` ${unit}` : ""}`;
    };
    const smaAvailablePower = (puKey: string, ratingKey: string, unit: string) => {
        const pu = smaNumber(puKey);
        const rating = smaNumber(ratingKey);
        return pu === null || rating === null ? "Not reported" : `${(pu * rating).toFixed(1)} ${unit} (${(pu * 100).toFixed(1)}%)`;
    };
    const smaUptime = (() => {
        const seconds = smaNumber("uptimeSeconds");
        if (seconds === null) return "Not reported";
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${days}d ${hours}h ${minutes}m`;
    })();

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
            const data = await fetchPcsView(true);
            applyDashboardData(data);
        } catch(e) {
            console.error("Manual refresh error", e);
        } finally {
            setLoading(false);
            setRefreshing(false);
            markPerf('PcsDashboard fetch & map', t0);
        }
    };

    useEffect(() => {
        if (!active) return;
        let cancelled = false;
        const update = async () => {
            if (document.hidden) return;
            try {
                const data = await fetchPcsView(false);
                if (!cancelled) applyDashboardData(data);
            } catch (error) {
                console.error("PCS live view refresh error", error);
            }
        };
        update();
        const intervalId = window.setInterval(update, 3000);
        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [active, applyDashboardData, fetchPcsView]);

    useEffect(() => {
        if (isInitialLoading) return;
        if (apiDataLoadedRef.current) return;
        
        let pcsRows: any[] = [];
        let sourceMeta = "PCS source unavailable or unmapped.";
        if (snapshotDashboardData && snapshotDashboardData.pcs) {
             pcsRows = snapshotDashboardData.pcs;
             sourceMeta = snapshotDashboardData.source || "Coordinator Site Data Engine";
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
            setPcsList((previous) => previous);
        }
        setLoading(false);
    }, [snapshotDashboardData, isInitialLoading]);

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

    const pcsByArray = useMemo(() => {
        const grouped = new Map<number, any[]>();
        for (const row of pcsList) {
            const key = Number(row.arrayIndex);
            const rows = grouped.get(key);
            if (rows) rows.push(row);
            else grouped.set(key, [row]);
        }
        return grouped;
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
                        {pcsUpdatedAt && (
                            <span className="text-[9px] font-mono text-prizm-text-muted">
                                Updated {new Date(pcsUpdatedAt).toLocaleTimeString()}
                            </span>
                        )}
                        {pcsList.some((pcs: any) => pcs.stale || pcs.sourceOk === false) && (
                            <span className="text-[9px] font-bold font-mono px-2 py-0.5 rounded border uppercase bg-prizm-warning/10 border-prizm-warning/30 text-prizm-warning">
                                Stale PCS source
                            </span>
                        )}
                        {modbusTelemetry?.available && (
                            <span className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded border uppercase ${modbusTelemetry.stale ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-emerald-50 border-emerald-300 text-emerald-700"}`} title={modbusTelemetry.error || "Map-driven PCS and block telemetry"}>
                                Modbus {modbusTelemetry.stale ? "stale" : `${modbusTelemetry.durationMs ?? "--"} ms`}
                            </span>
                        )}
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
                    <div className="lg:col-span-12">
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
                                const arrRows = pcsByArray.get(Number(pcs.arrayIndex)) || [];
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
                <div className="hidden">
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
                                            {(selectedPcs.timestamp ?? selectedPcs.raw?.timeStamp ?? selectedPcs.raw?.timestamp)
                                                ? new Date(Number(selectedPcs.timestamp ?? selectedPcs.raw?.timeStamp ?? selectedPcs.raw?.timestamp)).toLocaleTimeString()
                                                : "Not reported"}
                                        </span>
                                    </p>
                                    {selectedPcs.telemetrySource && (
                                        <p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-emerald-600">
                                            {selectedPcs.telemetrySource} · {selectedPcs.telemetryCapturedAt ? new Date(selectedPcs.telemetryCapturedAt).toLocaleTimeString() : "live"}
                                        </p>
                                    )}
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
                                    <div className="text-[8px] text-prizm-text-muted font-mono mt-1 uppercase">
                                        Fault Code: <span className={Number(selectedPcs.modbusFaultCode || 0) === 0 ? "text-emerald-500 font-bold" : "text-prizm-danger font-bold"}>
                                            {hasVal(selectedPcs.modbusFaultCode) ? Number(selectedPcs.modbusFaultCode) : "Not reported"}
                                        </span>
                                    </div>
                                </div>

                                <div className="col-span-2 grid grid-cols-3 gap-2 text-[8px] border-t border-prizm-border/40 pt-3">
                                    <div className="bg-prizm-surface p-2 rounded">
                                        <span className="text-prizm-text-muted block uppercase text-[7px]">Total Energy</span>
                                        <span className="text-prizm-text font-bold">{hasVal(selectedPcs.totalEnergyWh) ? `${(Number(selectedPcs.totalEnergyWh) / 1_000_000).toFixed(2)} MWh` : "Not reported"}</span>
                                    </div>
                                    <div className="bg-prizm-surface p-2 rounded">
                                        <span className="text-prizm-text-muted block uppercase text-[7px]">Imported</span>
                                        <span className="text-prizm-text font-bold">{hasVal(selectedPcs.importedEnergyWh) ? `${(Number(selectedPcs.importedEnergyWh) / 1_000_000).toFixed(2)} MWh` : "Not reported"}</span>
                                    </div>
                                    <div className="bg-prizm-surface p-2 rounded">
                                        <span className="text-prizm-text-muted block uppercase text-[7px]">Exported</span>
                                        <span className="text-prizm-text font-bold">{hasVal(selectedPcs.exportedEnergyWh) ? `${(Number(selectedPcs.exportedEnergyWh) / 1_000_000).toFixed(2)} MWh` : "Not reported"}</span>
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
                                        <span className="text-prizm-text-muted text-[8px] block truncate text-left uppercase" title={selectedPcs.telemetrySource || selectedPcs.sourcePath}>{selectedPcs.telemetrySource || selectedPcs.sourcePath || "discovered"}</span>
                                    </div>
                                    <div>
                                        <span className="text-prizm-text-muted block text-[7.5px] uppercase">Cabinet Temperature</span>
                                        <span className="text-prizm-text font-bold text-xs">{hasVal(selectedPcs.cabinetTemperatureC) && Number(selectedPcs.cabinetTemperatureC) !== 0 ? `${Number(selectedPcs.cabinetTemperatureC).toFixed(1)} °C` : "Not reported"}</span>
                                    </div>
                                    <div>
                                        <span className="text-prizm-text-muted block text-[7.5px] uppercase">Heatsink Temperature</span>
                                        <span className="text-prizm-text font-bold text-xs">{hasVal(selectedPcs.heatSinkTemperatureC) && Number(selectedPcs.heatSinkTemperatureC) !== 0 ? `${Number(selectedPcs.heatSinkTemperatureC).toFixed(1)} °C` : "Not reported"}</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-2 text-[8px] border-t border-prizm-border/40 pt-3">
                                    <div className="bg-prizm-surface p-2 rounded">
                                        <span className="text-prizm-text-muted block uppercase text-[7px]">Real Measured</span>
                                        <span className="text-emerald-400 font-bold">{selectedPcs.acRealPowerKw !== null ? `${selectedPcs.acRealPowerKw.toFixed(1)} kW` : "--"}</span>
                                    </div>
                                    <div className="bg-prizm-surface p-2 rounded">
                                        <span className="text-prizm-text-muted block uppercase text-[7px]">Setting</span>
                                        <span className="text-prizm-text font-bold">{hasVal(selectedPcs.acRealPowerSettingKw ?? selectedPcs.acRealPowerSettingKW) ? `${Number(selectedPcs.acRealPowerSettingKw ?? selectedPcs.acRealPowerSettingKW).toFixed(1)} kW` : "Not reported"}</span>
                                    </div>
                                    <div className="bg-prizm-surface p-2 rounded">
                                        <span className="text-prizm-text-muted block uppercase text-[7px]">Command</span>
                                        <span className="text-prizm-text font-bold">{hasVal(selectedPcs.acCmdRealPowerKw ?? selectedPcs.acCmdRealPowerKW) ? `${Number(selectedPcs.acCmdRealPowerKw ?? selectedPcs.acCmdRealPowerKW).toFixed(1)} kW` : "Not reported"}</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-2 text-[8px]">
                                    <div className="bg-prizm-surface p-2 rounded">
                                        <span className="text-prizm-text-muted block uppercase text-[7px]">Reactive Meas</span>
                                        <span className="text-prizm-primary font-bold">{selectedPcs.acReactivePowerKvar !== null ? `${selectedPcs.acReactivePowerKvar.toFixed(1)} kVAR` : "--"}</span>
                                    </div>
                                    <div className="bg-prizm-surface p-2 rounded">
                                        <span className="text-prizm-text-muted block uppercase text-[7px]">Setting</span>
                                        <span className="text-prizm-text font-bold">{hasVal(selectedPcs.acReactivePowerSettingKvar ?? selectedPcs.acReactivePowerSettingKVAR) ? `${Number(selectedPcs.acReactivePowerSettingKvar ?? selectedPcs.acReactivePowerSettingKVAR).toFixed(1)} kVAR` : "Not reported"}</span>
                                    </div>
                                    <div className="bg-prizm-surface p-2 rounded">
                                        <span className="text-prizm-text-muted block uppercase text-[7px]">Command</span>
                                        <span className="text-prizm-text font-bold">{hasVal(selectedPcs.acCmdReactivePowerKvar ?? selectedPcs.acCmdReactivePowerKVAR) ? `${Number(selectedPcs.acCmdReactivePowerKvar ?? selectedPcs.acCmdReactivePowerKVAR).toFixed(1)} kVAR` : "Not reported"}</span>
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
                        ARRAY POWER SUMMARY
                    </span>
                </div>
            </div>
            
            <div className="p-3 text-[10px] text-prizm-text-muted font-mono uppercase border-b border-prizm-border bg-prizm-surface/30">
                DC current limits and available AC power come directly from Turtle's live array and AC-battery reports. Commanded and measured power come from each array PCS report.
            </div>

            <div className="overflow-x-auto no-scrollbar">
                {snapshot?.rollups?.arraySummary && snapshot.rollups.arraySummary.length > 0 ? (
                    <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                        <thead className="bg-prizm-surface-strong text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border">
                            <tr>
                                <th className="py-2 px-3 font-bold">Array</th>
                                <th className="py-2 px-3 font-bold text-center">Comm.</th>
                                <th className="py-2 px-3 font-bold text-center">Max Charge / Discharge A DC</th>
                                <th className="py-2 px-3 font-bold text-center">Available Charge / Discharge kW AC</th>
                                <th className="py-2 px-3 font-bold text-center">Commanded kW AC</th>
                                <th className="py-2 px-3 font-bold text-center">Measured kW AC</th>
                                <th className="py-2 px-3 font-bold text-center">Strings Closed / Open / Out</th>
                                <th className="py-2 px-3 font-bold text-center">Cell mV Min / Avg / Max</th>
                                <th className="py-2 px-3 font-bold text-center">Cell °C Min / Avg / Max</th>
                                <th className="py-2 px-3 font-bold text-center">DC Bus V Min / Avg / Max</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-prizm-border">
                            {snapshot.rollups.arraySummary.map((arr: any, idx: number) => {
                                const name = arr.friendlyString || arr.name || `Array ${arr.arrayNumber ?? arr.arrayIndex ?? (idx + 1)}`;
                                const arrayNumber = Number(arr.arrayNumber ?? arr.arrayIndex ?? (idx + 1));
                                const liveLimits = arrayPowerSummary.find((row: any) => Number(row.arrayIndex) === arrayNumber);
                                const arrayPcsRows = pcsByArray.get(arrayNumber) || [];
                                const sumReported = (keys: string[]) => {
                                    const values = arrayPcsRows
                                        .map((pcs: any) => keys.map((key) => pcs?.[key]).find(hasVal))
                                        .filter(hasVal)
                                        .map(Number)
                                        .filter(Number.isFinite);
                                    return values.length ? values.reduce((total: number, value: number) => total + value, 0) : null;
                                };
                                
                                const chargeLimit = liveLimits?.availableACChargekW ?? arr.availableACChargekW;
                                const dischargeLimit = liveLimits?.availableACDischargekW ?? arr.availableACDischargekW;
                                const hasChargeDischarge = hasVal(chargeLimit) && hasVal(dischargeLimit);
                                const chargeDischargeDisplay = hasChargeDischarge
                                    ? `${Number(chargeLimit).toFixed(1)} / ${Number(dischargeLimit).toFixed(1)}`
                                    : "Not reported";
                                const dcChargeLimit = liveLimits?.maxAllowedChargeCurrentDc;
                                const dcDischargeLimit = liveLimits?.maxAllowedDischargeCurrentDc;
                                const dcLimitDisplay = hasVal(dcChargeLimit) && hasVal(dcDischargeLimit)
                                    ? `${Number(dcChargeLimit).toFixed(0)} / ${Number(dcDischargeLimit).toFixed(0)}`
                                    : "Not reported";
                                const commandedKw = sumReported(["acCmdRealPowerKw", "acCmdRealPowerKW"]);
                                const measuredKw = sumReported(["acRealPowerKw", "acRealPowerKW"]);
                                const modbusArray = modbusArraySummary.find((row: any) => Number(row.arrayIndex) === arrayNumber);
                                const triplet = (minimum: any, average: any, maximum: any, digits = 0, multiplier = 1) =>
                                    [minimum, average, maximum].every(hasVal)
                                        ? [minimum, average, maximum].map((value) => (Number(value) * multiplier).toFixed(digits)).join(" / ")
                                        : "Not reported";
                                const stringStates = modbusArray
                                    ? `${modbusArray.StackWithClosedContactorsCount ?? "--"} / ${modbusArray.StackWithOpenContactorsCount ?? "--"} / ${modbusArray.StackOutOfRotationCount ?? "--"}`
                                    : "Not reported";

                                return (
                                    <tr key={idx} className="hover:bg-prizm-surface-strong/30 transition-colors">
                                        <td className="py-2 px-3 text-prizm-primary font-bold">{name}</td>
                                        <td className="py-2 px-3 text-center text-prizm-data-green font-bold">
                                            {arr.communicating !== false ? "OK" : <span className="text-prizm-danger">FAULT</span>}
                                        </td>
                                        <td className="py-2 px-3 text-center text-prizm-text">{dcLimitDisplay}</td>
                                        <td className="py-2 px-3 text-center text-prizm-text">{chargeDischargeDisplay}</td>
                                        <td className="py-2 px-3 text-center text-prizm-warning">{commandedKw !== null ? `${commandedKw.toFixed(1)} kW` : "Not reported"}</td>
                                        <td className="py-2 px-3 text-center text-prizm-text">{measuredKw !== null ? `${measuredKw.toFixed(1)} kW` : "Not reported"}</td>
                                        <td className="py-2 px-3 text-center text-prizm-text">{stringStates}</td>
                                        <td className="py-2 px-3 text-center text-prizm-text">{triplet(modbusArray?.CellVoltageMin, modbusArray?.CellVoltageAvg, modbusArray?.CellVoltageMax, 0, 1000)}</td>
                                        <td className="py-2 px-3 text-center text-prizm-text">{triplet(modbusArray?.CellTmpMin, modbusArray?.CellTmpAvg, modbusArray?.CellTmpMax, 1)}</td>
                                        <td className="py-2 px-3 text-center text-prizm-text">{triplet(modbusArray?.DcBusVoltageMin, modbusArray?.DcBusVoltageAvg, modbusArray?.DcBusVoltageMax, 1)}</td>
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

        {/* PCS fleet selector and on-demand one-line drill-down */}
        <div className="mt-6 rounded-lg border border-prizm-border bg-prizm-surface font-mono">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-prizm-border bg-prizm-surface-strong/50 p-3">
                <div>
                    <div className="flex items-center gap-2">
                        <Activity size={14} className="text-prizm-primary" />
                        <h2 className="text-[10px] font-bold uppercase tracking-wider text-prizm-text">PCS Units Online</h2>
                    </div>
                    <p className="mt-1 text-[7.5px] uppercase text-prizm-text-muted">
                        {oneLinePcs
                            ? `Array ${oneLinePcs.arrayIndex} · PCS ${oneLinePcs.pcsIndex} drill-down open`
                            : "Select a collapsed unit to open its one-line and diagnostics"}
                    </p>
                </div>
                {oneLinePcs && (
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => selectAdjacentPcs(-1)} className="rounded border border-prizm-border bg-prizm-surface px-2 py-1 text-[7px] font-bold uppercase text-prizm-text-muted hover:border-prizm-primary hover:text-prizm-primary">← Previous</button>
                        <button type="button" onClick={() => selectAdjacentPcs(1)} className="rounded border border-prizm-border bg-prizm-surface px-2 py-1 text-[7px] font-bold uppercase text-prizm-text-muted hover:border-prizm-primary hover:text-prizm-primary">Next →</button>
                        <span className={`rounded border px-2 py-1 text-[7px] font-bold uppercase ${oneLinePcs.pcsSwitches?.stale === false ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-amber-300 bg-amber-50 text-amber-700"}`}>
                            {oneLinePcs.pcsSwitches?.stale === false ? `${oneLinePcs.pcsSwitches.durationMs ?? "--"} ms` : "Unavailable"}
                        </span>
                        <button
                            type="button"
                            onClick={() => setSelectedPcsId(null)}
                            className="rounded border border-prizm-border bg-prizm-surface px-2 py-1 text-[7px] font-bold uppercase text-prizm-text-muted transition-colors hover:border-prizm-primary hover:text-prizm-primary"
                        >
                            Collapse
                        </button>
                    </div>
                )}
            </div>
            <div className="space-y-3 p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
                    {pcsList.map((pcs: any) => {
                        const isOpen = selectedPcsId === pcs.id;
                        const directOnline = pcs.pcsSwitches?.stale === false;
                        const communicating = directOnline || pcs.communicating === true || pcs.sourceOk === true || Number(pcs.dcVoltage) > 0;
                        const operatingState = pcs.pcsSwitches?.inverterOperatingState || pcs.state || pcs.modbusOperatingState || "Unknown";
                        const hasFault = Number(pcs.modbusFaultCode || 0) !== 0 || String(operatingState).toUpperCase() === "ERROR";
                        const statusColor = hasFault ? "bg-red-500" : communicating ? "bg-emerald-500" : "bg-amber-500";
                        return (
                            <button
                                key={pcs.id}
                                type="button"
                                aria-expanded={isOpen}
                                onClick={() => {
                                    setSelectedPcsId(isOpen ? null : pcs.id);
                                    if (!isOpen) setPcsDetailTab("overview");
                                }}
                                className={`min-w-0 rounded border p-3 text-left transition-all ${isOpen
                                    ? "border-prizm-primary bg-prizm-primary/10 shadow-sm ring-1 ring-prizm-primary/20"
                                    : "border-prizm-border bg-prizm-surface hover:border-prizm-primary/60 hover:bg-prizm-primary/5"}`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="truncate text-[9px] font-extrabold uppercase text-prizm-text">Array {pcs.arrayIndex} · PCS {pcs.pcsIndex}</div>
                                        <div className="mt-1 truncate text-[7px] font-bold uppercase text-prizm-text-muted">{operatingState}</div>
                                    </div>
                                    <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${statusColor} ${communicating && !hasFault ? "shadow-[0_0_6px_rgba(16,185,129,0.65)]" : ""}`} />
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1 text-[7px] uppercase">
                                    <span className="text-prizm-text-muted">Real power</span>
                                    <span className="text-right font-bold text-prizm-text">{oneLineValue(pcs.acRealPowerKw, "kW", 1)}</span>
                                    <span className="text-prizm-text-muted">DC voltage</span>
                                    <span className="text-right font-bold text-prizm-text">{oneLineValue(pcs.dcVoltage, "V", 1)}</span>
                                    <span className="text-prizm-text-muted">Rotation</span>
                                    <span className="text-right font-bold text-prizm-text">{pcs.rotation || "Unknown"}</span>
                                </div>
                                <div className={`mt-3 border-t pt-2 text-center text-[7px] font-bold uppercase ${isOpen ? "border-prizm-primary/30 text-prizm-primary" : "border-prizm-border text-prizm-text-muted"}`}>
                                    {isOpen ? "Close drill-down" : "Open drill-down"}
                                </div>
                            </button>
                        );
                    })}
                    {pcsList.length === 0 && (
                        <div className="col-span-full rounded border border-dashed border-prizm-border p-5 text-center text-[8px] font-bold uppercase text-prizm-text-muted">
                            No PCS units are currently available
                        </div>
                    )}
                </div>
                {oneLinePcs && (
                    <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 rounded border border-prizm-border bg-prizm-surface-strong/95 px-3 py-2 shadow-sm backdrop-blur">
                        <div className="flex items-center gap-2 text-[8px] font-bold uppercase text-prizm-text">
                            <span className={`h-2 w-2 rounded-full ${oneLinePcs.pcsSwitches?.stale === false ? "bg-emerald-500" : "bg-amber-500"}`} />
                            Array {oneLinePcs.arrayIndex} · PCS {oneLinePcs.pcsIndex}
                            <span className="text-prizm-text-muted">· {oneLinePcs.pcsSwitches?.inverterOperatingState || oneLinePcs.state || "Unknown"} · {oneLinePcs.rotation || "Unknown rotation"}</span>
                        </div>
                        <span className="text-[7px] font-bold uppercase text-prizm-text-muted">{oneLinePcs.pcsSwitches?.capturedAt ? `Updated ${new Date(oneLinePcs.pcsSwitches.capturedAt).toLocaleTimeString()}` : "Awaiting direct sample"}</span>
                    </div>
                )}
                {oneLinePcs && (
                    <div className="flex flex-wrap gap-1 rounded border border-prizm-border bg-prizm-surface-strong p-1">
                        {(["overview", "electrical", "thermal", "diagnostics", "controls"] as const).map((tab) => (
                            <button key={tab} type="button" onClick={() => setPcsDetailTab(tab)} className={`rounded px-3 py-1.5 text-[8px] font-bold uppercase transition-colors ${pcsDetailTab === tab ? "bg-prizm-primary text-white shadow-sm" : "text-prizm-text-muted hover:bg-prizm-surface hover:text-prizm-text"}`}>{tab}</button>
                        ))}
                    </div>
                )}
                {oneLinePcs && pcsDetailTab === "overview" && <PcsSwitchOneLine telemetry={oneLinePcs.pcsSwitches || {}} />}
                {oneLinePcs && (pcsDetailTab === "overview" || pcsDetailTab === "electrical") && (
                    <div className="grid grid-cols-1 overflow-hidden rounded border border-prizm-border bg-prizm-surface md:grid-cols-4">
                        <div className="border-b border-prizm-border p-3 md:border-b-0 md:border-r">
                            <h3 className="mb-2 border-b border-prizm-border bg-prizm-surface-strong px-2 py-1 text-[9px] font-bold uppercase text-prizm-primary">DC Side</h3>
                            <dl className="space-y-1.5 text-[8px]">
                                <div className="flex justify-between gap-3"><dt className="text-prizm-text-muted">DC Power</dt><dd className="font-bold text-prizm-text">{oneLineValue(oneLinePcs.dcPowerKW, "kW", 1)}</dd></div>
                                <div className="flex justify-between gap-3"><dt className="text-prizm-text-muted">DC Voltage</dt><dd className="font-bold text-prizm-text">{oneLineValue(oneLinePcs.dcVoltage, "V", 1)}</dd></div>
                                <div className="flex justify-between gap-3"><dt className="text-prizm-text-muted">DC Current</dt><dd className="font-bold text-prizm-text">{oneLineValue(oneLinePcs.dcCurrent, "A", 1)}</dd></div>
                            </dl>
                        </div>
                        <div className="border-b border-prizm-border p-3 md:border-b-0 md:border-r">
                            <h3 className="mb-2 border-b border-prizm-border bg-prizm-surface-strong px-2 py-1 text-[9px] font-bold uppercase text-prizm-primary">Inverter</h3>
                            <dl className="space-y-1.5 text-[8px]">
                                <div className="flex justify-between gap-3"><dt className="text-prizm-text-muted">Operating State</dt><dd className="font-bold text-prizm-text">{oneLinePcs.pcsSwitches?.inverterOperatingState || oneLinePcs.state || oneLinePcs.modbusOperatingState || "Unknown"}</dd></div>
                                <div className="flex justify-between gap-3"><dt className="text-prizm-text-muted">Ready</dt><dd className={`font-bold ${oneLinePcs.isReady ? "text-emerald-600" : "text-amber-600"}`}>{oneLinePcs.isReady ? "YES" : "NO"}</dd></div>
                                <div className="flex justify-between gap-3"><dt className="text-prizm-text-muted">Fault Code</dt><dd className="font-bold text-prizm-text">{hasVal(oneLinePcs.modbusFaultCode) ? oneLinePcs.modbusFaultCode : "Not reported"}</dd></div>
                            </dl>
                        </div>
                        <div className="border-b border-prizm-border p-3 md:border-b-0 md:border-r">
                            <h3 className="mb-2 border-b border-prizm-border bg-prizm-surface-strong px-2 py-1 text-[9px] font-bold uppercase text-prizm-primary">AC Side</h3>
                            <dl className="space-y-1.5 text-[8px]">
                                <div className="flex justify-between gap-3"><dt className="text-prizm-text-muted">Active Power</dt><dd className="font-bold text-prizm-text">{oneLineValue(oneLinePcs.acRealPowerKw, "kW", 1)}</dd></div>
                                <div className="flex justify-between gap-3"><dt className="text-prizm-text-muted">Reactive Power</dt><dd className="font-bold text-prizm-text">{oneLineValue(oneLinePcs.acReactivePowerKvar, "kVAR", 1)}</dd></div>
                                <div className="flex justify-between gap-3"><dt className="text-prizm-text-muted">Grid Frequency</dt><dd className="font-bold text-prizm-text">{oneLineValue(oneLinePcs.frequencyHz, "Hz", 2)}</dd></div>
                                <div className="flex justify-between gap-3"><dt className="text-prizm-text-muted">AC Voltage A/B/C</dt><dd className="font-bold text-prizm-text">{oneLinePcs.acVoltageDisplay || "Not reported"}</dd></div>
                            </dl>
                        </div>
                        <div className="p-3">
                            <h3 className="mb-2 border-b border-prizm-border bg-prizm-surface-strong px-2 py-1 text-[9px] font-bold uppercase text-prizm-primary">Grid Command</h3>
                            <dl className="space-y-1.5 text-[8px]">
                                <div className="flex justify-between gap-3"><dt className="text-prizm-text-muted">Setpoint Active</dt><dd className="font-bold text-prizm-text">{oneLineValue(oneLinePcs.acCmdRealPowerKw, "kW", 1)}</dd></div>
                                <div className="flex justify-between gap-3"><dt className="text-prizm-text-muted">Setpoint Reactive</dt><dd className="font-bold text-prizm-text">{oneLineValue(oneLinePcs.acCmdReactivePowerKvar, "kVAR", 1)}</dd></div>
                                <div className="flex justify-between gap-3"><dt className="text-prizm-text-muted">Rotation</dt><dd className="font-bold text-prizm-text">{oneLinePcs.rotation || "Unknown"}</dd></div>
                            </dl>
                        </div>
                    </div>
                )}
                {oneLinePcs && pcsDetailTab === "thermal" && (
                    <div className="grid grid-cols-1 gap-3 rounded border border-prizm-border bg-prizm-surface p-3 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                            ["Maximum PCB", smaDisplay("maxPcbTemperatureC", "°C", 1)],
                            ["Maximum IGBT", smaDisplay("maxIgbtTemperatureC", "°C", 1)],
                            ["Cabinet", hasVal(oneLinePcs.cabinetTemperatureC) && Number(oneLinePcs.cabinetTemperatureC) !== 0 ? `${Number(oneLinePcs.cabinetTemperatureC).toFixed(1)} °C` : "Not reported"],
                            ["Heatsink", hasVal(oneLinePcs.heatSinkTemperatureC) && Number(oneLinePcs.heatSinkTemperatureC) !== 0 ? `${Number(oneLinePcs.heatSinkTemperatureC).toFixed(1)} °C` : "Not reported"],
                        ].map(([label, value]) => <div key={label} className="rounded border border-prizm-border bg-prizm-surface-strong p-3"><div className="text-[7px] font-bold uppercase text-prizm-text-muted">{label}</div><div className="mt-1 text-sm font-extrabold text-prizm-text">{value}</div></div>)}
                    </div>
                )}
                {oneLinePcs && pcsDetailTab === "controls" && (
                    <div className="rounded border border-prizm-border bg-prizm-surface p-4">
                        <div className="mb-3 text-[8px] font-bold uppercase text-prizm-text-muted">PCS rotation controls · Array {oneLinePcs.arrayIndex} / PCS {oneLinePcs.pcsIndex}</div>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" disabled={oneLinePcs.rotation === "IN"} onClick={() => { setModalAction("in"); setModalTargets([{ array: oneLinePcs.arrayIndex, pcs: oneLinePcs.pcsIndex }]); setModalOpen(true); }} className="rounded border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-[9px] font-bold uppercase text-emerald-600 disabled:opacity-40">Set In Rotation</button>
                            <button type="button" disabled={oneLinePcs.rotation === "OUT"} onClick={() => { setModalAction("out"); setModalTargets([{ array: oneLinePcs.arrayIndex, pcs: oneLinePcs.pcsIndex }]); setModalOpen(true); }} className="rounded border border-slate-500/50 bg-slate-500/10 px-4 py-2 text-[9px] font-bold uppercase text-slate-600 disabled:opacity-40">Set Out Rotation</button>
                        </div>
                    </div>
                )}
                {oneLinePcs && pcsDetailTab === "diagnostics" && (
                    <div className="overflow-hidden rounded border border-prizm-border bg-prizm-surface">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-prizm-border bg-prizm-surface-strong px-3 py-2">
                            <h3 className="text-[9px] font-bold uppercase text-prizm-primary">Direct SMA PCS Diagnostics</h3>
                            <span className="text-[7px] font-bold uppercase text-prizm-text-muted">Read-only process data · slower 60-second profile</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
                            <section className="border-b border-prizm-border p-3 md:border-r xl:border-b-0">
                                <h4 className="mb-2 text-[8px] font-bold uppercase text-prizm-text-muted">Capability &amp; Limits</h4>
                                <dl className="space-y-1.5 text-[8px]">
                                    <div className="flex justify-between gap-3"><dt>Available active</dt><dd className="font-bold">{smaAvailablePower("availableActivePowerPu", "ratedActivePowerKw", "kW")}</dd></div>
                                    <div className="flex justify-between gap-3"><dt>Available reactive</dt><dd className="font-bold">{smaAvailablePower("availableReactivePowerPu", "ratedReactivePowerKvar", "kVAR")}</dd></div>
                                    <div className="flex justify-between gap-3"><dt>DC voltage range</dt><dd className="font-bold">{smaDisplay("dcVoltageDynamicMinV", "V", 0)} – {smaDisplay("dcVoltageDynamicMaxV", "V", 0)}</dd></div>
                                    <div className="flex justify-between gap-3"><dt>DC current range</dt><dd className="font-bold">{smaDisplay("dcCurrentDynamicMinA", "A", 0)} – {smaDisplay("dcCurrentDynamicMaxA", "A", 0)}</dd></div>
                                    <div className="flex justify-between gap-3"><dt>Operating mode</dt><dd className="font-bold">{smaDisplay("inverterOperatingMode", "", 0)}</dd></div>
                                </dl>
                            </section>
                            <section className="border-b border-prizm-border p-3 xl:border-b-0 xl:border-r">
                                <h4 className="mb-2 text-[8px] font-bold uppercase text-prizm-text-muted">Protection &amp; Thermal</h4>
                                <dl className="space-y-1.5 text-[8px]">
                                    <div className="flex justify-between gap-3"><dt>Insulation resistance</dt><dd className="font-bold">{smaDisplay("insulationResistanceKOhm", "kΩ", 1)}</dd></div>
                                    <div className="flex justify-between gap-3"><dt>Maximum PCB</dt><dd className="font-bold">{smaDisplay("maxPcbTemperatureC", "°C", 1)}</dd></div>
                                    <div className="flex justify-between gap-3"><dt>Maximum IGBT</dt><dd className="font-bold">{smaDisplay("maxIgbtTemperatureC", "°C", 1)}</dd></div>
                                    <div className="flex justify-between gap-3"><dt>Inverter / SMA fault</dt><dd className="font-bold">{smaDisplay("inverterFaultNumber", "", 0)} / {smaDisplay("smaFaultNumber", "", 0)}</dd></div>
                                    <div className="flex justify-between gap-3"><dt>DC coupler / battery mask</dt><dd className="font-bold">{smaDisplay("dcCouplerStatusMask", "", 0)} / {smaDisplay("batteryStatusMask", "", 0)}</dd></div>
                                </dl>
                            </section>
                            <section className="border-b border-prizm-border p-3 md:border-r xl:border-b-0">
                                <h4 className="mb-2 text-[8px] font-bold uppercase text-prizm-text-muted">Status &amp; Timing</h4>
                                <dl className="space-y-1.5 text-[8px]">
                                    <div className="flex justify-between gap-3"><dt>Power-off reason</dt><dd className="max-w-[65%] text-right font-bold">{oneLinePcs.pcsSwitches?.powerOffReason || "Not reported"}</dd></div>
                                    <div className="flex justify-between gap-3"><dt>Grid wait</dt><dd className="font-bold">{smaDisplay("gridWaitSeconds", "s", 0)}</dd></div>
                                    <div className="flex justify-between gap-3"><dt>Error time remaining</dt><dd className="font-bold">{smaDisplay("errorRemainingSeconds", "s", 0)}</dd></div>
                                    <div className="flex justify-between gap-3"><dt>Power factor / apparent</dt><dd className="font-bold">{smaDisplay("powerFactor", "", 4)} / {smaDisplay("apparentPowerKva", "kVA", 1)}</dd></div>
                                    <div className="flex justify-between gap-3"><dt>PCS uptime</dt><dd className="font-bold">{smaUptime}</dd></div>
                                    <div className="flex justify-between gap-3"><dt>Communication firmware</dt><dd className="font-bold">{smaDisplay("communicationFirmwareRaw", "", 0)}</dd></div>
                                </dl>
                            </section>
                            <section className="p-3">
                                <h4 className="mb-2 text-[8px] font-bold uppercase text-prizm-text-muted">Energy Counters</h4>
                                <dl className="space-y-1.5 text-[8px]">
                                    <div className="flex justify-between gap-3"><dt>AC today</dt><dd className="font-bold">{smaDisplay("acEnergyTodayMwh", "MWh", 2)}</dd></div>
                                    <div className="flex justify-between gap-3"><dt>AC yesterday</dt><dd className="font-bold">{smaDisplay("acEnergyYesterdayMwh", "MWh", 2)}</dd></div>
                                    <div className="flex justify-between gap-3"><dt>AC total</dt><dd className="font-bold">{smaDisplay("acEnergyTotalMwh", "MWh", 2)}</dd></div>
                                    <div className="flex justify-between gap-3"><dt>DC today</dt><dd className="font-bold">{smaDisplay("dcEnergyTodayMwh", "MWh", 2)}</dd></div>
                                    <div className="flex justify-between gap-3"><dt>DC yesterday</dt><dd className="font-bold">{smaDisplay("dcEnergyYesterdayMwh", "MWh", 2)}</dd></div>
                                    <div className="flex justify-between gap-3"><dt>DC total</dt><dd className="font-bold">{smaDisplay("dcEnergyTotalMwh", "MWh", 2)}</dd></div>
                                </dl>
                            </section>
                        </div>
                    </div>
                )}
                {oneLinePcs?.pcsSwitches?.stale !== false && (
                    <div className="rounded border border-amber-300 bg-amber-50 p-2 text-[8px] text-amber-800">
                        {oneLinePcs?.pcsSwitches?.error || (oneLinePcs
                            ? "Direct PCS switch telemetry has not completed a successful poll."
                            : "PCS data is not currently available; the one-line will populate automatically when a PCS is discovered.")}
                    </div>
                )}
                {oneLinePcs && (
                    <div className="flex flex-wrap justify-between gap-2 text-[7px] uppercase text-prizm-text-muted">
                        <span>
                            {oneLinePcs.pcsSwitches?.source === "SMA_WEB_PROCESS_DATA"
                                ? `SMA GUI PROCESS DATA · ${oneLinePcs.pcsSwitches?.host || `10.0.${oneLinePcs.arrayIndex}.118`}:443`
                                : `${oneLinePcs.pcsSwitches?.host || `10.0.${oneLinePcs.arrayIndex}.118`}:502`}
                        </span>
                        <span>{oneLinePcs.pcsSwitches?.capturedAt ? new Date(oneLinePcs.pcsSwitches.capturedAt).toLocaleTimeString() : "No valid sample"}</span>
                    </div>
                )}
            </div>
        </div>
            </div>
        </div>
    );
}
