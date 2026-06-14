import React, { useState, useEffect } from "react";
import { 
    Activity, 
    Battery, 
    TriangleAlert, 
    ServerOff, 
    CheckCircle2, 
    ChevronRight, 
    ChevronDown,
    Hash, 
    XOctagon, 
    Flame,
    Zap,
    Thermometer,
    Wind,
    ShieldAlert,
    Network,
    Cpu,
    RadioTower,
    ServerCrash,
    BoxSelect,
    PanelTop,
    Rows4,
    Lock,
    Unlock,
    Play,
    Pause
} from "lucide-react";
import { formatPrizmUtcTimestamp } from "../lib/timeFormat";
import RotationModal, { RotationTarget } from "./RotationModal";

function CollapsibleSection({ 
    title, 
    icon: Icon, 
    defaultExpanded = true, 
    children, 
    badge = null,
    className = ""
}: {
    title: string;
    icon?: any;
    defaultExpanded?: boolean;
    children: React.ReactNode;
    badge?: React.ReactNode;
    className?: string;
}) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    return (
        <div className={`bg-prizm-surface-strong border border-prizm-border rounded-lg overflow-hidden flex flex-col ${className}`}>
            <button 
                onClick={() => setExpanded(!expanded)} 
                className="flex items-center justify-between p-3 bg-black/20 hover:bg-black/30 transition-colors border-b border-prizm-border w-full text-left"
            >
                <h3 className="text-xs font-bold text-prizm-text uppercase tracking-widest font-mono flex items-center gap-2">
                    {Icon && <Icon size={14} className="text-prizm-primary" />} {title}
                </h3>
                <div className="flex items-center gap-2 text-prizm-text-muted">
                    {badge}
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
            </button>
            {expanded && (
                <div className="p-0 overflow-x-auto no-scrollbar">
                    {children}
                </div>
            )}
        </div>
    );
}

type DashboardState = {
    loading: boolean;
    cacheStatus: any;
    stringsDashboard: any;
    featherDevices: any;
    safetyFaults: any;
    overviewDiscovery: any;
    siteSummary: any;
    historyEvents: any;
};


export async function fetchJsonWithTimeout(url: string, options: RequestInit & { timeoutMs?: number } = {}) {
    const { timeoutMs = 5000, ...fetchOptions } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
        clearTimeout(id);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

export default function SiteOperationsDashboard({ setActiveTab }: { setActiveTab?: (tab: string) => void }) {
    const hasVal = (val: any) => val !== null && val !== undefined && val !== "" && val !== "NaN" && !(typeof val === 'number' && Number.isNaN(val));

    const [state, setState] = useState<DashboardState>({
        loading: true,
        cacheStatus: null,
        stringsDashboard: null,
        featherDevices: null,
        safetyFaults: null,
        overviewDiscovery: null,
        siteSummary: null,
        historyEvents: null
    });

    const [isAdvancedMode, setIsAdvancedMode] = useState(false);
    const [rotationCapabilities, setRotationCapabilities] = useState<any>(null);
    const [pcsModalOpen, setPcsModalOpen] = useState(false);
    const [pcsModalTargets, setPcsModalTargets] = useState<RotationTarget[]>([]);
    const [pcsModalAction, setPcsModalAction] = useState<"in" | "out">("in");
    const [pcsActionPending, setPcsActionPending] = useState(false);
    useEffect(() => { let unmounted = false; fetchJsonWithTimeout("/api/local/capabilities", { timeoutMs: 1500 }).then(v => { if(!unmounted) setRotationCapabilities(v); }).catch(()=>{}); return () => { unmounted = true; }; }, []);
    const handlePcsConfirm = async (req: any) => {
        await fetch("/api/local/pcs/rotation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
        setPcsModalOpen(false);
        triggerRefresh(true);
    };
    
    // EMS App control states
    const [emsAppCandidate, setEmsAppCandidate] = useState<any>(null);
    const [emsAppTargetState, setEmsAppTargetState] = useState<boolean>(false);
    const [emsAppConfText, setEmsAppConfText] = useState("");
    const [emsAppLoading, setEmsAppLoading] = useState(false);
    const [emsAppResult, setEmsAppResult] = useState<any>(null);

    const executeEmsAppAction = async () => {
        if (!emsAppCandidate) return;
        const expectedText = `${emsAppTargetState ? "ENABLE" : "DISABLE"} ${emsAppCandidate.appCode}`;
        if (emsAppConfText !== expectedText) {
            setEmsAppResult({ success: false, message: "Confirmation text does not match" });
            return;
        }

        setEmsAppLoading(true);
        setEmsAppResult(null);

        try {
            const res = await fetch("/api/local/ems-apps/enabled-status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    stationCode: state.siteSummary?.site?.stationCode || "BHE0020",
                    blockIndex: state.siteSummary?.site?.blockIndex || 1,
                    appCode: emsAppCandidate.appCode,
                    priority: emsAppCandidate.priority,
                    enabled: emsAppTargetState,
                    confirmationText: emsAppConfText,
                    requestedBy: "local-overview"
                })
            });
            const data = await res.json();
            setEmsAppResult(data);
            if (data.success || data.queued) {
                // Refresh data
                triggerRefresh(true);
            }
        } catch (err: any) {
            setEmsAppResult({ success: false, message: err.message });
        } finally {
            setEmsAppLoading(false);
        }
    };

    const [clearCandidate, setClearCandidate] = useState<any>(null);
    const [clearConfRef, setClearConfRef] = useState("");
    const [clearLoading, setClearLoading] = useState(false);
    const [clearResult, setClearResult] = useState<any>(null);

    // Provide a callback to execute clearing
    const executeClear = async () => {
        if (!clearCandidate || clearConfRef !== clearCandidate.entityKeyToken) {
            setClearResult({ error: "Confirmation text does not match" });
            return;
        }
        setClearLoading(true);
        setClearResult(null);
        try {
            const profileId = state.siteSummary?.site?.profileId || state.stringsDashboard?.profileId;
            const operatorUsername = "local-overview";
            const res = await fetch("/api/local/safety-fault-clear/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    profileId,
                    entityKeyToken: clearCandidate.entityKeyToken,
                    confirmationText: clearConfRef,
                    operatorUsername
                })
            });
            const j = await res.json();
            if (!res.ok) throw new Error(j.error || "Execute failed");
            setClearResult(j);
        } catch(e: any) {
            setClearResult({ error: e.message });
        } finally {
            setClearLoading(false);
        }
    };


    const triggerRefresh = (sectionRefresh = false) => {
         const url = sectionRefresh ? "/api/local/site-operations/summary?refresh=true" : "/api/local/site-operations/summary";
         fetchJsonWithTimeout(url, { timeoutMs: sectionRefresh ? 5000 : 3000 }).then(summaryRes => {
             setState(prev => ({ ...prev, siteSummary: summaryRes, loading: false }));
         }).catch(err => {
             setState(prev => ({ ...prev, loading: false }));
         });
    };

    useEffect(() => {
        let unmounted = false;
        const fetchData = async () => {
             fetchJsonWithTimeout("/api/local/site-operations/summary", { timeoutMs: 3000 }).then(summaryRes => {
                 if (!unmounted) setState(prev => ({ ...prev, siteSummary: summaryRes, loading: false }));
             }).catch(err => {
                 if (!unmounted) setState(prev => ({ ...prev, loading: false }));
             });

             // Side fetches
             if (!unmounted) {
                 fetchJsonWithTimeout("/api/local/cache/status", { timeoutMs: 1500 }).then(v => { if(!unmounted) setState(p => ({...p, cacheStatus: v}))}).catch(()=>{});
                 fetchJsonWithTimeout("/api/local/history/events?range=24h", { timeoutMs: 1500 }).then(v => { if(!unmounted) setState(p => ({...p, historyEvents: v}))}).catch(()=>{});
             }
        };

        fetchData();
        const interval = setInterval(fetchData, 15000);
        return () => {
            unmounted = true;
            clearInterval(interval);
        };
    }, []);

    

    const sum = state.siteSummary;
    let siteState = "UNAVAILABLE";
    if (sum?.site?.connectionState === "disconnected") {
      siteState = "OFFLINE";
    } else if (sum?.site?.source === "partial" || sum?.cacheMeta?.cacheState === "STALE") {
      siteState = "PARTIAL";
    } else if (sum?.site?.connectionState || sum?.site?.source || sum?.cacheMeta?.cacheState) {
      siteState = "LIVE";
    }
    
    const stationCode = sum?.site?.stationCode || "UNKNOWN";
    const emsBaseUrl = sum?.site?.emsBaseUrl || "--";
    const blockIndex = sum?.site?.blockIndex || "--";
    const profileId = sum?.site?.profileId || "--";

    const emsAppsData = sum?.emsApps || [];
    const pcsData = sum?.pcsSummary || [];
    const htsData = sum?.humidityTemperatureSensors || [];
    const featherSummary = sum?.featherSummary || {};
    
    const arraySummaryData = sum?.arraySummary || [];
    const stringBuckets = sum?.stringSummary?.buckets || { online: 0, nearline: 0, offline: 0, notCommunicating: 0 };
    const onlineStats = sum?.stringSummary?.rollups?.online || { count: sum?.stringSummary?.buckets?.online || 0 };
    const nearlineStats = sum?.stringSummary?.rollups?.nearline || { count: sum?.stringSummary?.buckets?.nearline || 0 };
    const offlineStats = sum?.stringSummary?.rollups?.offline || { count: sum?.stringSummary?.buckets?.offline || 0 };
    const notCommStats = sum?.stringSummary?.rollups?.notCommunicating || { count: sum?.stringSummary?.buckets?.notCommunicating || 0 };
    const rollups = sum?.stringSummary?.rollups || state.stringsDashboard?.rollups || { totalStrings: (stringBuckets.online + stringBuckets.nearline + stringBuckets.offline + stringBuckets.notCommunicating) || 0 };

    const activeIssues = sum?.activeIssueGroups || [];
    activeIssues.sort((a: any, b: any) => {
        const severityRank: Record<string, number> = { "ALARM": 1, "WARNING": 2, "STALE": 3, "INFO": 4 };
        return (severityRank[a.severity] || 5) - (severityRank[b.severity] || 5);
    });

    const clearableFaults = sum?.safetySummary?.clearableFaults || [];
    const safetyEligible = sum?.safetySummary?.clearableCount || 0;
    const safetyNotEligible = 0; // Not eligible faults no longer primarily tracked here

    const combinedSources = sum?.sourceHealth || [];
    let featherTotal: any = sum?.featherSummary?.totalDevices;
    if (featherTotal === null || featherTotal === undefined) featherTotal = "--";
    let featherLostComms: any = sum?.featherSummary?.lostCommsCount;
    if (featherLostComms === null || featherLostComms === undefined) featherLostComms = "--";
    let featherFssInvalid: any = sum?.featherSummary?.fssInvalidCount;
    if (featherFssInvalid === null || featherFssInvalid === undefined) featherFssInvalid = "--";
    let featherDoorsInvalid: any = sum?.featherSummary?.doorsInvalidCount;
    if (featherDoorsInvalid === null || featherDoorsInvalid === undefined) featherDoorsInvalid = "--";

    const navigate = (tab: string) => {
        if (setActiveTab) setActiveTab(tab);
    };

    return (
        <div className="flex-1 flex flex-col p-4 sm:p-6 overflow-y-auto no-scrollbar font-sans space-y-6">
            {/* Global Site Status Banner Removed (Moved to Global Header) */}

            {/* KPI CARD GRID */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="bg-prizm-surface p-4 rounded-lg border border-prizm-border flex flex-col justify-between">
                    <div>
                        <h3 className="text-prizm-text-muted text-[10px] font-bold uppercase tracking-wider mb-3 flex items-center gap-2 border-b border-prizm-border pb-2">
                            <BoxSelect size={14} className="text-prizm-primary"/> Topology Overview
                        </h3>
                        <div className="flex flex-col gap-1 text-[11px] font-mono mt-3">
                            <div className="flex justify-between pb-1 border-b border-prizm-border/50"><span className="text-prizm-text-muted uppercase">Arrays</span><span className="font-bold text-prizm-text">{sum?.topologyCounts?.arrayCount ?? "--"}</span></div>
                            <div className="flex justify-between pb-1 border-b border-prizm-border/50"><span className="text-prizm-text-muted uppercase">Strings</span><span className="font-bold text-prizm-text">{sum?.topologyCounts?.stringCount ?? sum?.bessFleetSummary?.totalStrings ?? "--"}</span></div>
                            <div className="flex justify-between pb-1 border-b border-prizm-border/50"><span className="text-prizm-text-muted uppercase">PCS Units</span><span className="font-bold text-prizm-text">{sum?.topologyCounts?.pcsCount ?? "--"}</span></div>
                            <div className="flex justify-between pb-1 border-b border-prizm-border/50"><span className="text-prizm-text-muted uppercase">Feather</span><span className="font-bold text-prizm-text">{sum?.topologyCounts?.featherDeviceCount ?? "--"}</span></div>
                            <div className="flex justify-between"><span className="text-prizm-text-muted uppercase">AC Batts</span><span className="font-bold text-prizm-text">{sum?.topologyCounts?.acBatteryCount ?? "--"}</span></div>
                        </div>
                    </div>
                </div>

                <div className="bg-prizm-surface p-4 rounded-lg border border-prizm-border flex flex-col justify-between">
                    <div>
                        <h3 className="text-prizm-text-muted text-[10px] font-bold uppercase tracking-wider mb-3 flex items-center gap-2 border-b border-prizm-border pb-2">
                            <Battery size={14} className="text-prizm-primary"/> System State of Charge
                        </h3>
                        <div className="flex items-end gap-2 mt-4">
                            <div className="text-3xl font-bold text-prizm-text font-mono">{rollups?.averageSoc?.toFixed(1) || "--"}<span className="text-lg text-prizm-text-muted">%</span></div>
                        </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-prizm-border text-[11px] font-mono text-prizm-text-muted flex justify-between">
                        <span>Target:</span> <span className="text-prizm-text font-bold">{(rollups?.onlineAvailableKWh || 0).toLocaleString()} <span className="text-[9px]">kWh</span></span>
                    </div>
                </div>

                <div className="bg-prizm-surface p-4 rounded-lg border border-prizm-border flex flex-col justify-between">
                    <div>
                        <h3 className="text-prizm-text-muted text-[10px] font-bold uppercase tracking-wider mb-3 flex items-center gap-2 border-b border-prizm-border pb-2">
                            <Zap size={14} className="text-prizm-primary"/> Fleet Capacity
                        </h3>
                        <div className="flex items-end gap-2 mt-4">
                            <div className="text-2xl font-bold text-prizm-text font-mono">{((rollups?.onlineAvailableKWh || 0) / 1000).toFixed(2)}<span className="text-sm text-prizm-text-muted ml-1">MWh</span></div>
                        </div>
                    </div>
                    <div>
                        <div className="mt-4 pt-3 border-t border-prizm-border text-[11px] font-mono flex justify-between">
                            <span className="text-prizm-text-muted">Charge Lim:</span> <span className="text-emerald-400 font-bold">{((rollups.availableChargeKW || 0)/1000).toFixed(2)} <span className="text-[9px]">MW</span></span>
                        </div>
                        <div className="mt-1 flex justify-between text-[11px] font-mono">
                            <span className="text-prizm-text-muted">Discharge Lim:</span> <span className="text-emerald-400 font-bold">{((rollups.availableDischargeKW || 0)/1000).toFixed(2)} <span className="text-[9px]">MW</span></span>
                        </div>
                    </div>
                </div>

                <div className="bg-prizm-surface p-4 rounded-lg border border-prizm-border flex flex-col justify-between">
                    <div>
                        <h3 className="text-prizm-text-muted text-[10px] font-bold uppercase tracking-wider mb-3 flex items-center gap-2 border-b border-prizm-border pb-2">
                            <Cpu size={14} className={((sum?.bessFleetSummary?.warningStrings || 0) + (sum?.bessFleetSummary?.alarmStrings || 0)) > 0 ? "text-prizm-warning" : "text-prizm-primary"}/> String Fleet Status
                        </h3>
                        <div className="grid grid-cols-2 gap-2 mt-4">
                            <div>
                                 <div className="text-xl font-bold text-prizm-warning font-mono">{sum?.bessFleetSummary?.warningStrings ?? rollups.warnings ?? "--"}</div>
                                 <div className="text-[10px] text-prizm-text-muted uppercase">Strings Warn</div>
                            </div>
                            <div>
                                 <div className="text-xl font-bold text-red-500 font-mono">{sum?.bessFleetSummary?.alarmStrings ?? rollups.alarms ?? "--"}</div>
                                 <div className="text-[10px] text-prizm-text-muted uppercase">Strings Alarm</div>
                            </div>
                        </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-prizm-border flex justify-between items-baseline">
                        <span className="text-[10px] text-prizm-text-muted uppercase">Total Active</span>
                        <span className="text-lg font-bold text-prizm-text font-mono">{(sum?.bessFleetSummary?.totalStrings || 0)}</span>
                    </div>
                </div>

                <div className="bg-prizm-surface p-4 rounded-lg border border-prizm-border flex flex-col justify-between">
                    <div>
                        <h3 className="text-prizm-text-muted text-[10px] font-bold uppercase tracking-wider mb-3 flex items-center gap-2 border-b border-prizm-border pb-2">
                            <Activity size={14} className="text-prizm-primary"/> Cell Metrics Average
                        </h3>
                        <div className="space-y-2 mt-4">
                            <div className="flex justify-between items-center px-1">
                                <span className="text-[11px] text-prizm-text-muted uppercase font-bold tracking-wider">Voltage</span>
                                <div className="text-sm font-bold text-prizm-text font-mono">{sum?.bessFleetSummary?.avgCellVoltageMv != null ? `${sum.bessFleetSummary.avgCellVoltageMv.toFixed(1)} mV` : "--"}</div>
                            </div>
                            <div className="flex justify-between items-center px-1">
                                <span className="text-[11px] text-prizm-text-muted uppercase font-bold tracking-wider">Max Δ</span>
                                <div className="text-sm font-bold text-prizm-text font-mono">{sum?.bessFleetSummary?.maxCellVoltageDeltaMv != null ? `Δ ${sum.bessFleetSummary.maxCellVoltageDeltaMv.toFixed(0)} mV` : "--"}</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="bg-prizm-surface p-4 rounded-lg border border-prizm-border flex flex-col justify-between">
                    <div>
                        <h3 className="text-prizm-text-muted text-[10px] font-bold uppercase tracking-wider mb-3 flex items-center gap-2 border-b border-prizm-border pb-2">
                            <Thermometer size={14} className="text-prizm-danger"/> Thermal Average
                        </h3>
                        <div className="space-y-2 mt-4">
                            <div className="flex justify-between items-center px-1">
                               <span className="text-[11px] text-prizm-text-muted uppercase font-bold tracking-wider">Cells</span>
                               <div className="text-sm font-bold text-prizm-text font-mono">{sum?.bessFleetSummary?.avgCellTempC != null ? `${sum.bessFleetSummary.avgCellTempC.toFixed(1)} °C` : "--"}</div>
                            </div>
                            <div className="flex justify-between items-center px-1">
                               <span className="text-[11px] text-prizm-text-muted uppercase font-bold tracking-wider">Max Δ</span>
                               <div className="text-sm font-bold text-prizm-text font-mono">{sum?.bessFleetSummary?.maxCellTempDeltaC != null ? `Δ ${sum.bessFleetSummary.maxCellTempDeltaC.toFixed(1)} °C` : "--"}</div>
                            </div>
                            <div className="flex justify-between items-center px-1">
                               <span className="text-[11px] text-prizm-text-muted uppercase font-bold tracking-wider">Cell Max</span>
                               <div className="text-sm font-bold text-prizm-text font-mono">{sum?.featherSummary?.maxCellTempC != null ? `${sum.featherSummary.maxCellTempC.toFixed(1)} °C` : "--"}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            

            {/* DASHBOARD CORE SUMMARIES ROW */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
                <div>
{/* Corrective Actions */}
            <div className="bg-prizm-surface border border-prizm-border rounded-lg flex flex-col h-full">
<h3 className="text-prizm-text-muted text-[10px] font-bold uppercase tracking-wider p-3 flex items-center gap-2 border-b border-prizm-border"><TriangleAlert size={14} className="text-prizm-danger"/> CORRECTIVE ACTIONS (DATA-BASED FAULTS)</h3>
<div className="overflow-x-auto no-scrollbar flex-1">
                <div className="max-h-[350px] overflow-y-auto no-scrollbar">
                    {sum?.correctiveActions && sum.correctiveActions.length > 0 ? (
                        <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                            <thead className="bg-prizm-surface-strong text-[10px] text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border sticky top-0">
                            <tr>
                                <th className="py-1 px-2 font-bold w-1/8">Level</th>
                                    <th className="py-1 px-2 font-bold w-1/6">Fault / ID</th>
                                    <th className="py-1 px-2 font-bold w-1/6">Affected</th>
                                    <th className="py-1 px-2 font-bold w-1/3">Suggested Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-prizm-border">
                                {sum.correctiveActions.map((issue: any, i: number) => (
                                    <tr key={i} className="hover:bg-prizm-surface transition-colors">
                                        <td className="py-1 px-2">
                                            <span className={`px-2 py-[2px] rounded font-bold ${issue.level === 'FAULT' || issue.level === 'ALARM' ? 'bg-prizm-danger/10 text-prizm-danger' : 'bg-prizm-warning/10 text-prizm-warning'}`}>
                                                {issue.level}
                                            </span>
                                        </td>
                                        <td className="py-1 px-2 text-prizm-primary font-bold">
                                            {issue.fault}
                                        </td>
                                        <td className="py-1 px-2 text-prizm-text">
                                            {issue.object} {issue.count > 1 ? `(+${issue.count - 1} more)` : ''}
                                        </td>
                                        <td className="py-1 px-2 text-prizm-text">
                                            {issue.suggestedAction}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="p-4 text-[10px] text-prizm-text-muted uppercase font-mono">No active corrective actions detected.</div>
                    )}
                </div>
            </div>
            </div>
            </div>
            <div>
{/* String Summary */}
            <div className="bg-prizm-surface border border-prizm-border rounded-lg flex flex-col h-full">
<h3 className="text-prizm-text-muted text-[10px] font-bold uppercase tracking-wider p-3 flex items-center gap-2 border-b border-prizm-border"><Rows4 size={14} className="text-prizm-text"/> STRING SUMMARY</h3>
<div className="overflow-x-auto no-scrollbar flex-1">
                 {sum?.stringSummary && ((sum.stringSummary.tableRows && sum.stringSummary.tableRows.length > 0) || (sum.stringSummary.buckets && Object.values(sum.stringSummary.buckets).some(v => Number(v) > 0))) ? (
                     <div className="overflow-x-auto overflow-y-auto max-h-[350px] w-full no-scrollbar">
                         <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                             <thead className="bg-prizm-surface-strong text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border sticky top-0 z-10">
                                 <tr>
                                     <th className="py-1 px-2 font-bold min-w-[200px]">Parameter</th>
                                     <th className="py-1 px-2 font-bold text-center border-l border-prizm-border text-emerald-400">Online</th>
                                     <th className="py-1 px-2 font-bold text-center border-l border-prizm-border text-emerald-300">Nearline</th>
                                     <th className="py-1 px-2 font-bold text-center border-l border-prizm-border text-prizm-text-muted">Offline</th>
                                     <th className="py-1 px-2 font-bold text-center border-l border-prizm-border text-prizm-danger">Not Comm</th>
                                 </tr>
                             </thead>
                             <tbody className="divide-y divide-prizm-border">
                                {(() => {
                                    const formatVal = (v: any, suffix = "", toFixed = 1) => {
                                        if (v === null || v === undefined) return "--";
                                        const num = Number(v);
                                        if (isNaN(num)) return "--";
                                        return num.toFixed(toFixed).replace(/\.0+$/, '') + (suffix ? " " + suffix : "");
                                    };
                                    const buckets = ['online', 'nearline', 'offline', 'notCommunicating'];
                                    const renderRow = (label: string, field: string, suffix = "", toFixed = 1) => (
                                        <tr className="hover:bg-prizm-surface transition-colors">
                                            <td className="py-1 px-2 text-prizm-text-muted">{label}</td>
                                            {buckets.map((b, i) => {
                                              let val = sum.stringSummary.rollups?.[b]?.[field];
                                              return <td key={i} className={`py-1 px-2 text-center border-l border-prizm-border ${b === 'online' ? 'text-emerald-400' : b === 'nearline' ? 'text-emerald-300' : b === 'notCommunicating' ? 'text-prizm-danger' : 'text-prizm-text-muted'}`}>{formatVal(val, suffix, toFixed)}</td>
                                            })}
                                        </tr>
                                    );
                                    
                                    const renderSocRow = () => (
                                        <tr className="hover:bg-prizm-surface transition-colors">
                                            <td className="py-1 px-2 text-prizm-text-muted">SOC (kWh)</td>
                                            {buckets.map((b, i) => {
                                              let soc = sum.stringSummary.rollups?.[b]?.socPctAvg;
                                              let kwh = sum.stringSummary.rollups?.[b]?.kWhAvg;
                                              let txt = "--";
                                              if (soc !== null && soc !== undefined) txt = formatVal(soc, "%");
                                              if (kwh !== null && kwh !== undefined) txt += " (" + formatVal(kwh, "kWh") + ")";
                                              const finalTxt = txt === "--" ? "--" : txt.replace(/^-- \((.*?)\)$/, "$1").replace(/^(.*?) \(--\)$/, "$1");
                                              return <td key={i} className={`py-1 px-2 text-center border-l border-prizm-border ${b === 'online' ? 'text-emerald-400' : b === 'nearline' ? 'text-emerald-300' : b === 'notCommunicating' ? 'text-prizm-danger' : 'text-prizm-text-muted'}`}>{finalTxt}</td>
                                            })}
                                        </tr>
                                    );

                                    return (
                                        <>
                                            <tr className="hover:bg-prizm-surface transition-colors">
                                                <td className="py-1 px-2 text-prizm-text-muted">Strings</td>
                                                {buckets.map((b, i) => <td key={i} className={`py-1 px-2 text-center border-l border-prizm-border ${b === 'online' ? 'text-emerald-400' : b === 'nearline' ? 'text-emerald-300' : b === 'notCommunicating' ? 'text-prizm-danger' : 'text-prizm-text-muted'}`}>{sum.stringSummary.buckets?.[b] ?? sum.stringSummary.rollups?.[b]?.count ?? 0}</td>)}
                                            </tr>
                                            <tr className="hover:bg-prizm-surface transition-colors">
                                                <td className="py-1 px-2 text-prizm-text-muted">Connection Permitted</td>
                                                {buckets.map((b, i) => <td key={i} className={`py-1 px-2 text-center border-l border-prizm-border ${b === 'online' ? 'text-emerald-400' : b === 'nearline' ? 'text-emerald-300' : b === 'notCommunicating' ? 'text-prizm-danger' : 'text-prizm-text-muted'}`}>{b === 'online' || b === 'nearline' ? (sum.stringSummary.buckets?.[b] ?? sum.stringSummary.rollups?.[b]?.count ?? 0) : "--"}</td>)}
                                            </tr>
                                            {renderSocRow()}
                                            {renderRow("Max Current (A)", "maxCurrentA", "A", 1)}
                                            {renderRow("Min Current (A)", "minCurrentA", "A", 1)}
                                            {renderRow("Max Cell Voltage (mV)", "maxCellVoltageMv", "mV", 0)}
                                            {renderRow("Average Cell Voltage (mV)", "avgCellVoltageMv", "mV", 0)}
                                            {renderRow("Min Cell Voltage (mV)", "minCellVoltageMv", "mV", 0)}
                                            {renderRow("Max Cell Voltage Delta (mV)", "maxCellVoltageDeltaMv", "mV", 0)}
                                            {renderRow("High Cell Temp (°C)", "highCellTempC", "°C", 1)}
                                            {renderRow("Average Cell Temp (°C)", "avgCellTempC", "°C", 1)}
                                            {renderRow("Low Cell Temp (°C)", "lowCellTempC", "°C", 1)}
                                            {renderRow("Max Cell Temp Delta (°C)", "maxCellTempDeltaC", "°C", 1)}
                                        </>
                                    );
                                })()}
                             </tbody>
                         </table>
                     </div>
                 ) : (
                     <div className="p-4 text-[10px] font-mono uppercase text-prizm-text-muted">No String Summary available</div>
                 )}
            </div></div>
                </div>
            </div>

            {/* ARRAY SUMMARY ROW */}
            <div className="mt-2">
{/* Array Summary */}
            <div className="bg-prizm-surface border border-prizm-border rounded-lg flex flex-col mt-4">
<h3 className="text-prizm-text-muted text-[10px] font-bold uppercase tracking-wider p-3 flex items-center gap-2 border-b border-prizm-border"><PanelTop size={14} className="text-prizm-text"/> ARRAY SUMMARY</h3>
<div className="overflow-x-auto no-scrollbar">
                 {arraySummaryData.length > 0 ? (
                     <div className="overflow-x-auto overflow-y-auto max-h-[450px] w-full no-scrollbar">
                     <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                         <thead className="bg-prizm-surface-strong text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border sticky top-0 z-10">
                             <tr>
                                 <th className="py-1 px-2 font-bold min-w-[120px]">Array</th>
                                 <th className="py-1 px-2 font-bold text-center">Comm.</th>
                                 <th className="py-1 px-2 font-bold text-center">Online SOC</th>
                                 <th className="py-1 px-2 font-bold text-center">Nearline SOC</th>
                                 <th className="py-1 px-2 font-bold text-center">Offline SOC</th>
                                 <th className="py-1 px-2 font-bold text-center">Nearline kWh</th>
                                 <th className="py-1 px-2 font-bold text-center">Available kW AC (Chg / Dis)</th>
                                 <th className="py-1 px-2 font-bold text-center">Commanded kW AC</th>
                                 <th className="py-1 px-2 font-bold text-center">Measured kW AC</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-prizm-border">
 {arraySummaryData.map((arr: any, idx: number) => { const name = arr.friendlyString || ("Array " + (arr.arrayNumber ?? arr.arrayIndex ?? idx+1)); const formatSOC = (val: any) => { if (!hasVal(val)) return "--"; const num = Number(val); if (isNaN(num)) return "--"; return (num < 1 ? num * 100 : num).toFixed(1).replace(/\.0$/, "") + " %"; }; const formatVal = (val: any, suffix = "") => { if (!hasVal(val)) return "--"; return String(val) + (suffix ? " " + suffix : ""); }; const hasChargeDischarge = hasVal(arr.availableACChargekW) && hasVal(arr.availableACDischargekW); let chargeDischargeDisplay = "--"; if (hasChargeDischarge) { chargeDischargeDisplay = String(arr.availableACChargekW) + " / " + String(arr.availableACDischargekW); } return ( <tr key={idx} className="hover:bg-prizm-surface transition-colors cursor-pointer" onClick={() => navigate("arrays-strings")}> <td className="py-1 px-2 text-prizm-primary font-bold">{name}</td> <td className="py-1 px-2 text-center text-emerald-400">{arr.communicating !== false ? "OK" : <XOctagon size={12} className="inline text-prizm-danger" />}</td> <td className="py-1 px-2 text-center text-prizm-text">{formatSOC(arr.onlineSOC)}</td> <td className="py-1 px-2 text-center text-emerald-300">{formatSOC(arr.nearlineSOC)}</td> <td className="py-1 px-2 text-center text-prizm-text-muted">{formatSOC(arr.offlineSOC)}</td> <td className="py-1 px-2 text-center text-prizm-text-muted">{formatVal(arr.nearlineAvailableKWh, "kWh")}</td> <td className="py-1 px-2 text-center text-prizm-text">{chargeDischargeDisplay}</td> <td className="py-1 px-2 text-center text-prizm-warning">{formatVal(arr.commandedkW)}</td> <td className="py-1 px-2 text-center text-prizm-text">{formatVal(arr.measuredkW)}</td> </tr> ); })}
                         </tbody>
                     </table>
                     </div>
                 ) : (
                     <div className="p-4 text-[10px] font-mono uppercase text-prizm-text-muted">No Array Summary available</div>
                 )}
            </div></div>
            </div>

            {/* EMS Apps */}
            <CollapsibleSection title="Operating Context (EMS Apps)" icon={BoxSelect} defaultExpanded={false}>
                 <div className="flex justify-end p-2 bg-prizm-surface border-b border-prizm-border">
                     <button
                        onClick={() => setIsAdvancedMode(!isAdvancedMode)}
                        className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded border transition-colors ${
                            isAdvancedMode 
                            ? "bg-amber-500/10 border-amber-500/50 text-amber-500 hover:bg-amber-500/20" 
                            : "bg-prizm-surface-strong border-prizm-border text-prizm-text hover:bg-white/5"
                        }`}
                     >
                         {isAdvancedMode ? <Unlock size={12} /> : <Lock size={12} />}
                         {isAdvancedMode ? "Advanced Controls Unlocked" : "Unlock Advanced Controls"}
                     </button>
                 </div>
                 {emsAppsData.length > 0 ? (
                     <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                         <thead className="bg-prizm-surface-strong text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border">
                             <tr>
                                 <th className="py-1 px-2 font-bold text-center">Pri</th>
                                 <th className="py-1 px-2 font-bold">App Code</th>
                                 <th className="py-1 px-2 font-bold">App Name</th>
                                 {isAdvancedMode && <th className="py-1 px-2 font-bold text-center">Action</th>}
                                 <th className="py-1 px-2 font-bold">Configuration</th>
                                 <th className="py-1 px-2 font-bold text-center">Status</th>
                                 <th className="py-1 px-2 font-bold">Details</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-prizm-border">
                             {emsAppsData.map((app: any, idx: number) => {
                                 let displayStatus = app.status || (app.enabled ? "Enabled" : "Not Enabled");
                                 let statusColor = "bg-slate-500/10 text-slate-400";
                                 
                                 const h = String(app.healthRaw || app.health || displayStatus || "").toUpperCase();
                                 if (h.includes("FAULT")) { displayStatus = "Faulted"; statusColor = "bg-prizm-danger/10 text-prizm-danger"; }
                                 else if (h.includes("WARN")) { displayStatus = "Warning"; statusColor = "bg-prizm-warning/10 text-prizm-warning"; }
                                 else if (h.includes("HEALTHY") || displayStatus.toUpperCase() === "ENABLED") { displayStatus = "Enabled"; statusColor = "bg-emerald-500/10 text-emerald-500"; }
                                 else if (h.includes("UNAVAIL") || h.includes("OFFLINE")) { displayStatus = "Unavailable"; statusColor = "bg-prizm-danger/10 text-prizm-danger"; }

                                 return (
                                 <tr key={idx} className="hover:bg-prizm-surface transition-colors">
                                     <td className="py-1 px-2 text-center text-prizm-text-muted">{app.priority !== undefined && app.priority !== null ? app.priority : "--"}</td>
                                     <td className="py-1 px-2 text-prizm-text font-bold">{app.appCode || "--"}</td>
                                     <td className="py-1 px-2 text-prizm-primary font-bold">{app.appName || "--"}</td>
                                     {isAdvancedMode && (
                                         <td className="py-1 px-2 text-center w-[100px]">
                                             <button 
                                                onClick={() => {
                                                    setEmsAppCandidate(app);
                                                    setEmsAppTargetState(!app.enabled);
                                                    setEmsAppConfText("");
                                                    setEmsAppResult(null);
                                                }}
                                                className={`px-2 py-1 flex items-center justify-center gap-1 rounded font-bold uppercase transition-colors w-full border ${
                                                    app.enabled
                                                    ? "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
                                                    : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                                                }`}
                                             >
                                                {app.enabled ? <><Pause size={10} /> Disable</> : <><Play size={10} /> Enable</>}
                                             </button>
                                         </td>
                                     )}
                                     <td className="py-1 px-2 text-prizm-text-muted text-xs">{app.configName || "--"} {app.configVersionId ? `(v${app.configVersionId})` : ""}</td>
                                     <td className="py-1 px-2 text-center">
                                         <span className={`px-2 py-[2px] rounded font-bold ${statusColor}`}>{displayStatus}</span>
                                     </td>
                                     <td className="py-1 px-2 text-prizm-text whitespace-pre-wrap leading-tight">{(app.hasShortAppStatus && app.shortAppStatus ? app.shortAppStatus : app.appStatus || "--").replace(/<br\s*\/?>/gi, '\n')}</td>
                                 </tr>
                             )})}
                         </tbody>
                     </table>
                 ) : (
                     <div className="p-4 text-[10px] font-mono uppercase text-prizm-text-muted">No EMS Apps data discovered</div>
                 )}
            </CollapsibleSection>


            <CollapsibleSection title="Equipment: Block Meters" icon={RadioTower} defaultExpanded={false}>
                 {(state.overviewDiscovery?.discoveredSections || {}).blockMeters?.sampleItems?.length > 0 ? (
                     <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                         <thead className="bg-prizm-surface-strong text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border">
                             <tr>
                                 <th className="py-1 px-2 font-bold">Meter ID</th>
                                 <th className="py-1 px-2 font-bold">kW</th>
                                 <th className="py-1 px-2 font-bold">Voltage</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-prizm-border">
                             {(state.overviewDiscovery?.discoveredSections || {}).blockMeters.sampleItems.map((item: any, idx: number) => (
                                 <tr key={idx} className="hover:bg-prizm-surface transition-colors">
                                     <td className="py-1 px-2 text-prizm-primary font-bold">{item.id || item.name || "--"}</td>
                                     <td className="py-1 px-2 text-prizm-text">{item.kw !== undefined ? item.kw : "--"}</td>
                                     <td className="py-1 px-2 text-prizm-text-muted">{item.voltage !== undefined ? item.voltage : "--"}</td>
                                 </tr>
                             ))}
                         </tbody>
                     </table>
                 ) : (
                     <div className="p-4 text-[10px] font-mono uppercase text-prizm-text-muted">No Block Meters data discovered</div>
                 )}
            </CollapsibleSection>

            <CollapsibleSection title="Equipment: PCS Summary" icon={Zap} defaultExpanded={false}>
                 {pcsData.length > 0 ? (
                    <div className="overflow-x-auto no-scrollbar">
                         <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                             <thead className="bg-prizm-surface-strong text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border">
                                 <tr>
                                     <th className="py-1 px-2 font-bold min-w-[80px]">PCS Identity</th>
                                     <th className="py-1 px-2 font-bold min-w-[80px]">Array Index</th>
                                     <th className="py-1 px-2 font-bold text-right min-w-[80px]">DC V</th>
                                     <th className="py-1 px-2 font-bold text-right min-w-[80px]">DC A</th>
                                     <th className="py-1 px-2 font-bold text-right min-w-[80px]">AC V</th>
                                     <th className="py-1 px-2 font-bold text-right min-w-[80px]">AC A</th>
                                     <th className="py-1 px-2 font-bold text-right min-w-[80px]">Real P (kW)</th>
                                     <th className="py-1 px-2 font-bold text-right min-w-[80px]">Reactive (kVAR)</th>
                                     <th className="py-1 px-2 font-bold text-right min-w-[80px]">Freq (Hz)</th>
                                     <th className="py-1 px-2 font-bold text-center min-w-[120px]">Rotation Status</th>
                                     <th className="py-1 px-2 font-bold text-center min-w-[120px]">Actions</th>
                                 </tr>
                             </thead>
                             <tbody className="divide-y divide-prizm-border">
                                 {pcsData.map((item: any, idx: number) => {
                                     const inRotation = item.rotation === 'IN' || item.rotation === 'true' || item.inRotation === true;
                                     const outRotation = item.rotation === 'OUT' || item.rotation === 'false' || item.inRotation === false;
                                     const isUnknown = !inRotation && !outRotation;
                                     const pIndex = hasVal(item.pcsIndex) ? Number(item.pcsIndex) : idx + 1;
                                     const aIndex = hasVal(item.arrayIndex) ? Number(item.arrayIndex) : 1;
                                     return (
                                     <tr key={idx} className="hover:bg-prizm-surface transition-colors">
                                         <td className="py-1 px-2 text-prizm-primary font-bold">{hasVal(item.pcsIndex) ? `PCS ${item.pcsIndex}` : `PCS ${item.id || item.name || "--"}`}</td>
                                         <td className="py-1 px-2 text-prizm-text">{hasVal(item.arrayIndex) ? item.arrayIndex : "--"}</td>
                                         <td className="py-1 px-2 text-right">{hasVal(item.dcVoltage) ? Number(item.dcVoltage).toFixed(1) : "--"}</td>
                                         <td className="py-1 px-2 text-right">{hasVal(item.dcCurrent) ? Number(item.dcCurrent).toFixed(1) : "--"}</td>
                                         <td className="py-1 px-2 text-right text-prizm-text">{item.acVoltageDisplay !== "-- / -- / --" ? item.acVoltageDisplay : (hasVal(item.acVoltage) ? Number(item.acVoltage).toFixed(1) : "--")}</td>
                                         <td className="py-1 px-2 text-right">{hasVal(item.acCurrent) ? Number(item.acCurrent).toFixed(1) : "--"}</td>
                                         <td className="py-1 px-2 text-right text-prizm-text font-bold">{hasVal(item.acRealPowerKw) ? Number(item.acRealPowerKw).toFixed(1) : "--"}</td>
                                         <td className="py-1 px-2 text-right">{hasVal(item.acReactivePowerKvar) ? Number(item.acReactivePowerKvar).toFixed(1) : "--"}</td>
                                         <td className="py-1 px-2 text-right text-prizm-text-muted">{hasVal(item.frequencyHz) ? Number(item.frequencyHz).toFixed(2) : "--"}</td>
                                         
                                         <td className="py-1 px-2 text-center">
                                            <div className="flex justify-center items-center gap-1.5">
                                                <div className={`w-2 h-2 rounded-full ${inRotation ? 'bg-emerald-500' : outRotation ? 'bg-slate-400' : 'bg-prizm-warning'}`}></div>
                                                <span className={`text-[9px] font-bold uppercase ${inRotation ? 'text-emerald-500' : outRotation ? 'text-slate-400' : 'text-prizm-warning'}`}>
                                                    {inRotation ? "IN ROTATION" : outRotation ? "OUT OF ROTATION" : "UNKNOWN"}
                                                </span>
                                            </div>
                                         </td>
                                         <td className="py-1 px-2 text-center">
                                            <div className="flex justify-center items-center gap-2" title={!rotationCapabilities?.pcs?.single ? "PCS Rotation Control capability not verified on local EMS" : ""}>
                                                <button 
                                                    disabled={inRotation || !rotationCapabilities?.pcs?.single}
                                                    onClick={() => {
                                                        setPcsModalAction('in');
                                                        setPcsModalTargets([{ array: aIndex, pcs: pIndex }]);
                                                        setPcsModalOpen(true);
                                                    }}
                                                    className="px-2 py-0.5 border border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
                                                >
                                                    In
                                                </button>
                                                <button 
                                                    disabled={outRotation || !rotationCapabilities?.pcs?.single}
                                                    onClick={() => {
                                                        setPcsModalAction('out');
                                                        setPcsModalTargets([{ array: aIndex, pcs: pIndex }]);
                                                        setPcsModalOpen(true);
                                                    }}
                                                    className="px-2 py-0.5 border border-slate-500/50 bg-slate-500/10 text-slate-300 hover:bg-slate-500/30 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
                                                >
                                                    Out
                                                </button>
                                            </div>
                                         </td>
                                     </tr>
                                 )})}
                             </tbody>
                         </table>
                    </div>
                 ) : (
                     <div className="p-4 text-[10px] font-mono uppercase text-prizm-text-muted">No PCS data available from local EMS source.</div>
                 )}
            </CollapsibleSection>

            <CollapsibleSection title="Equipment: Humidity & Temp Sensors" icon={Thermometer} defaultExpanded={false}>
                 {htsData.length > 0 ? (
                     <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                         <thead className="bg-prizm-surface-strong text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border">
                             <tr>
                                 <th className="py-1 px-2 font-bold">Enclosure / Location</th>
                                 <th className="py-1 px-2 font-bold">Sensor ID</th>
                                 <th className="py-1 px-2 font-bold">Source IP/Device</th>
                                 <th className="py-1 px-2 font-bold">Temperature</th>
                                 <th className="py-1 px-2 font-bold">Humidity</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-prizm-border">
                             {htsData.map((item: any, idx: number) => (
                                     <tr key={idx} className="hover:bg-prizm-surface transition-colors">
                                         <td className="py-1 px-2 text-prizm-primary font-bold">{item.enclosureLabel || "--"}</td>
                                         <td className="py-1 px-2 text-prizm-text">{item.sensorId || "--"}</td>
                                         <td className="py-1 px-2 text-prizm-text-muted">{item.sourceIp || item.deviceName || "--"}</td>
                                         <td className="py-1 px-2 text-cyan-400 font-bold">{item.temperatureC !== undefined && item.temperatureC !== null ? `${Number(item.temperatureC).toFixed(1)}°C` : "--"}</td>
                                         <td className="py-1 px-2 text-emerald-400 font-bold">{item.humidityPct !== undefined && item.humidityPct !== null ? `${Number(item.humidityPct).toFixed(1)}%` : "--"}</td>
                                     </tr>
                                 ))}
                         </tbody>
                     </table>
                 ) : (
                     <div className="p-4 text-[10px] font-mono uppercase text-prizm-text-muted">No HTS data discovered</div>
                 )}
            </CollapsibleSection>

            

            

            

                <CollapsibleSection title="Feather / HVAC Health" icon={Wind} defaultExpanded={false}>
                    {sum?.featherSummary?.totalDevices === null ? (
                         <div className="p-4 text-[10px] font-mono uppercase text-prizm-text-muted border-b border-prizm-border flex justify-center">Feather API Unavailable</div>
                    ) : !sum?.featherSummary ? (
                         <div className="p-4 text-[10px] font-mono uppercase text-prizm-text-muted border-b border-prizm-border flex justify-center">Feather API Unavailable</div>
                    ) : (
                        <div className="grid grid-cols-2 gap-px bg-prizm-border flex-1">
                            <div className="bg-prizm-surface p-4 text-center">
                                <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">Total Devices</div>
                                <div className="text-xl font-bold font-mono text-prizm-text">{featherTotal}</div>
                            </div>
                            <div className="bg-prizm-surface p-4 text-center">
                                <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">Lost Comms</div>
                                <div className={`text-xl font-bold font-mono ${featherLostComms > 0 ? "text-prizm-warning" : "text-prizm-text"}`}>{featherLostComms}</div>
                            </div>
                            <div className="bg-prizm-surface p-4 text-center">
                                <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">FSS Invalid</div>
                                <div className={`text-xl font-bold font-mono ${featherFssInvalid > 0 ? "text-prizm-danger" : "text-prizm-text"}`}>{featherFssInvalid}</div>
                            </div>
                            <div className="bg-prizm-surface p-4 text-center">
                                <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">Doors Invalid</div>
                                <div className={`text-xl font-bold font-mono ${featherDoorsInvalid > 0 ? "text-prizm-danger" : "text-prizm-text"}`}>{featherDoorsInvalid}</div>
                            </div>
                        </div>
                    )}
                    <div className="bg-prizm-surface border-t border-prizm-border p-3 flex justify-end">
                       <button onClick={() => navigate("feather-hvac")} className="text-[10px] font-bold uppercase tracking-widest font-mono bg-prizm-primary/10 text-prizm-primary px-4 py-2 hover:bg-prizm-primary/20 transition-colors border border-prizm-primary/30 rounded">Open Feather/HVAC</button>
                    </div>
                </CollapsibleSection>

            {/* Safety & Source Health */}
            <CollapsibleSection title="Safety Fault Candidates" icon={ShieldAlert} defaultExpanded={false}>
                 {safetyEligible > 0 ? (
                    <div>
                        <div className="bg-prizm-surface p-4 flex flex-col justify-center items-center border-b border-prizm-border">
                            <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">Clearable Faults</div>
                            <div className="text-2xl font-bold font-mono text-prizm-danger animate-pulse">{safetyEligible}</div>
                        </div>
                        <div className="overflow-x-auto no-scrollbar">
                           <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                                <thead className="bg-prizm-surface-strong text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border">
                                    <tr>
                                        <th className="py-1 px-2 font-bold">Entity</th>
                                        <th className="py-1 px-2 font-bold min-w-[200px]">Status Message</th>
                                        <th className="py-1 px-2 font-bold text-center">Enabled</th>
                                        <th className="py-1 px-2 font-bold text-center">Source</th>
                                        <th className="py-1 px-2 font-bold text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-prizm-border">
                                    {clearableFaults.map((f: any, idx: number) => (
                                         <tr key={idx} className="hover:bg-prizm-surface transition-colors">
                                             <td className="py-1 px-2 font-bold text-prizm-primary">{f.displayKey || f.entityKey}</td>
                                             <td className="py-1 px-2 text-prizm-text whitespace-pre-wrap max-w-sm">{f.statusMessageText || f.statusMessage}</td>
                                             <td className="py-1 px-2 text-center text-prizm-text-muted">{f.enabled ? 'Yes' : 'No'}</td>
                                             <td className="py-1 px-2 text-center text-prizm-text-muted uppercase">{f.source}</td>
                                             <td className="py-1 px-2 text-center">
                                                 <button onClick={() => setClearCandidate(f)} className="px-2 py-1 bg-prizm-danger/10 text-prizm-danger rounded hover:bg-prizm-danger hover:text-white transition-colors">Clear</button>
                                             </td>
                                         </tr>
                                    ))}
                                </tbody>
                           </table>
                        </div>
                    </div>
                ) : (
                    <div className="p-4 text-[10px] font-mono uppercase text-prizm-text-muted border-b border-prizm-border">
                        {clearableFaults.length === 0 ? "Safety Faults API Unavailable" : "No clearable safety faults detected."}
                    </div>
                )}
                <div className="bg-prizm-surface p-3 flex justify-end border-t border-prizm-border">
                   <button onClick={() => navigate("safety-fault")} className="text-[10px] font-bold uppercase tracking-widest font-mono bg-prizm-danger/10 text-prizm-danger px-4 py-2 hover:bg-prizm-danger/20 transition-colors border border-prizm-danger/30 rounded">Open Safety Fault Clear</button>
                </div>
             </CollapsibleSection>

                 <CollapsibleSection title="Source / Cache Health" icon={Network} defaultExpanded={false}>
                    <div className="overflow-y-auto no-scrollbar max-h-[250px]">
                        {combinedSources.length > 0 ? (
                            <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                                <thead className="bg-prizm-surface-strong text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border">
                                    <tr>
                                        <th className="py-1 px-2 font-bold w-1/4">Source</th>
                                        <th className="py-1 px-2 font-bold w-1/4">Module</th>
                                        <th className="py-1 px-2 font-bold w-1/2">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-prizm-border">
                                    {combinedSources.map((src, i) => (
                                        <tr key={i} className="hover:bg-prizm-surface transition-colors">
                                            <td className="py-1 px-2 font-bold text-prizm-text">{src.name}</td>
                                            <td className="py-1 px-2 text-prizm-text-muted">{src.type}</td>
                                            <td className="py-1 px-2">
                                                <span className={src.ok ? "text-emerald-400 font-bold flex items-center gap-1" : "text-prizm-danger font-bold flex items-center gap-1"} title={src.error || ""}>
                                                    {src.ok ? <><CheckCircle2 size={12}/> OK</> : <><ServerOff size={12}/> FAILED</>}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="p-4 text-[10px] text-prizm-text-muted uppercase font-mono py-4">No localized source data found.</div>
                        )}
                    </div>
                 </CollapsibleSection>

            {/* Recent Event Timeline */}
            <CollapsibleSection title="Recent Event Timeline" icon={Activity} defaultExpanded={false}>
                <div className="overflow-y-auto no-scrollbar max-h-[300px]">
                    {state.historyEvents?.events?.length > 0 ? (
                         <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                            <thead className="bg-prizm-surface-strong text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border">
                                <tr>
                                    <th className="py-1 px-2 font-bold">Timestamp</th>
                                    <th className="py-1 px-2 font-bold">Severity</th>
                                    <th className="py-1 px-2 font-bold">Source</th>
                                    <th className="py-1 px-2 font-bold">Message</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-prizm-border">
                                {state.historyEvents.events.map((e: any, i: number) => (
                                    <tr key={i} className="hover:bg-prizm-surface transition-colors">
                                        <td className="py-1 px-2 text-prizm-text-muted">{formatPrizmUtcTimestamp(e.timestamp)}</td>
                                        <td className="py-1 px-2">
                                            <span className={`px-2 py-[2px] rounded font-bold ${e.severity === 'ALARM' ? 'bg-prizm-danger/10 text-prizm-danger' : e.severity === 'WARNING' ? 'bg-prizm-warning/10 text-prizm-warning' : 'bg-slate-500/10 text-slate-400'}`}>
                                                {e.severity}
                                            </span>
                                        </td>
                                        <td className="py-1 px-2 font-bold text-prizm-text">{e.source}</td>
                                        <td className="py-1 px-2 text-prizm-text whitespace-normal min-w-[200px]">{e.message}</td>
                                    </tr>
                                ))}
                            </tbody>
                         </table>
                    ) : (
                         <div className="p-4 text-[10px] text-prizm-text-muted uppercase font-mono">
                             <div className="mb-1">No recent historical events recorded yet.</div>
                             <div>Current active issues are shown above.</div>
                         </div>
                    )}
                </div>
            </CollapsibleSection>

            {/* PRIZM Cache Orchestration Telemetry Footer */}
            <div className="mt-6 mb-2 p-3 bg-prizm-surface-strong border border-prizm-border rounded-lg flex flex-col sm:flex-row flex-wrap sm:items-center justify-between gap-3 text-[10px] font-mono tracking-wide">
                 <div className="flex items-center gap-2">
                     <span className="text-prizm-text-muted">CACHE:</span>
                     <span className="text-cyan-500 font-bold truncate max-w-[300px]">{state.cacheStatus?.activeSiteCachePath ? state.cacheStatus.activeSiteCachePath.replace(/.*\\.prizm-cache/, '.prizm-cache') : 'NOT DETERMINED'}</span>
                 </div>
                 <div className="flex flex-wrap items-center gap-4">
                     <div className="flex items-center gap-2">
                        <span className="text-prizm-text-muted">CACHE STATE:</span>
                        <span className={`font-bold px-1.5 py-0.5 rounded ${state.siteSummary?.site?.connectionState === 'disconnected' ? 'bg-prizm-warning/10 text-prizm-warning' : 'bg-emerald-500/10 text-emerald-400'}`}>
                            {state.siteSummary?.site?.connectionState === 'disconnected' ? 'CACHED / OFFLINE' : 'LIVE'}
                        </span>
                     </div>
                     <div className="flex items-center gap-2">
                        <span className="text-prizm-text-muted">LAST FETCHED:</span>
                        <span className="text-prizm-text font-bold">{state.cacheStatus?.activeManifest?.lastUpdatedAt ? new Date(state.cacheStatus.activeManifest.lastUpdatedAt).toLocaleString() : 'N/A'}</span>
                     </div>
                 </div>
            </div>

            {/* Quick Navigation Panel */}
            <div className="mt-4 pt-4 border-t border-prizm-border flex flex-wrap gap-4 items-center">
                <span className="text-[10px] uppercase font-bold text-prizm-text-muted font-mono mr-2">Quick Navigation:</span>
                <button onClick={() => navigate("arrays-strings")} className="text-[10px] font-bold font-mono px-3 py-1.5 bg-prizm-surface hover:bg-prizm-surface-strong border border-prizm-border rounded transition-colors text-prizm-text">STRINGS / BPC</button>
                <button onClick={() => navigate("feather-hvac")} className="text-[10px] font-bold font-mono px-3 py-1.5 bg-prizm-surface hover:bg-prizm-surface-strong border border-prizm-border rounded transition-colors text-prizm-text">FEATHER / HVAC</button>
                <button onClick={() => navigate("safety-fault")} className="text-[10px] font-bold font-mono px-3 py-1.5 bg-prizm-surface hover:bg-prizm-surface-strong border border-prizm-border rounded transition-colors text-prizm-text">SAFETY FAULT CLEAR</button>
                <button onClick={() => navigate("reports")} className="text-[10px] font-bold font-mono px-3 py-1.5 bg-prizm-surface hover:bg-prizm-surface-strong border border-prizm-border rounded transition-colors text-prizm-text">REPORTS / EXPORTS</button>
                <button onClick={() => navigate("settings")} className="text-[10px] font-bold font-mono px-3 py-1.5 bg-prizm-surface hover:bg-prizm-surface-strong border border-prizm-border rounded transition-colors text-prizm-text">CONNECTION SETTINGS</button>
            </div>

            {/* Clear Safety Fault Modal */}
            {clearCandidate && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
                    <div className="bg-prizm-surface-strong border border-prizm-border rounded-lg p-6 max-w-lg w-full">
                        <div className="flex items-center gap-3 mb-6 relative">
                            <ShieldAlert className="text-prizm-danger" size={24} />
                            <div>
                                <h2 className="text-lg font-bold text-prizm-danger uppercase tracking-widest font-mono">Confirm Safety Fault Clear</h2>
                                <p className="text-xs text-prizm-text-muted mt-1 font-mono">Manual intervention command</p>
                            </div>
                        </div>

                        <div className="space-y-4 mb-6">
                            <div className="bg-black/20 p-4 border border-prizm-border rounded font-mono text-sm">
                                <div className="grid grid-cols-[1fr_2fr] gap-2 mb-2 border-b border-prizm-border pb-2">
                                    <span className="text-prizm-text-muted">Entity:</span>
                                    <span className="text-prizm-primary font-bold">{clearCandidate.displayKey || clearCandidate.entityKey}</span>
                                </div>
                                <div className="grid grid-cols-[1fr_2fr] gap-2 mb-2 border-b border-prizm-border pb-2">
                                    <span className="text-prizm-text-muted">Status:</span>
                                    <span className="text-prizm-text break-words whitespace-pre-wrap">{clearCandidate.statusMessageText || clearCandidate.statusMessage}</span>
                                </div>
                                <div className="grid grid-cols-[1fr_2fr] gap-2 mb-2 border-b border-prizm-border pb-2">
                                    <span className="text-prizm-text-muted">Source:</span>
                                    <span className="text-prizm-text-muted">{clearCandidate.source}</span>
                                </div>
                                <div className="grid grid-cols-[1fr_2fr] gap-2">
                                    <span className="text-prizm-text-muted">Reset Key:</span>
                                    <span className="text-prizm-text-muted select-all">{clearCandidate.resetEntityKey}</span>
                                </div>
                            </div>

                            <div className="bg-prizm-warning/10 border border-prizm-warning/30 p-3 rounded">
                                <p className="text-prizm-warning text-xs font-bold leading-relaxed">
                                    WARNING: This will send a manual clear command to the EMS on behalf of `local-overview`.
                                </p>
                            </div>

                            {!clearResult && (
                                <div>
                                    <label className="block text-xs font-bold text-prizm-text mb-2 uppercase tracking-widest font-mono">
                                        Type confirmation text: <span className="text-prizm-primary select-all">{clearCandidate.entityKeyToken}</span>
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Paste confirmation text here"
                                        value={clearConfRef}
                                        onChange={(e) => setClearConfRef(e.target.value)}
                                        className="w-full bg-prizm-surface-strong border border-prizm-border rounded p-2 text-prizm-text font-mono focus:border-prizm-primary outline-none focus:ring-1 focus:ring-prizm-primary"
                                    />
                                </div>
                            )}

                            {clearResult && (
                                <div className={`p-4 border rounded ${clearResult.error || clearResult.verification?.appearsCleared === false ? 'bg-prizm-danger/10 border-prizm-danger/30' : 'bg-emerald-500/10 border-emerald-500/30'}`}>
                                    <div className="font-bold mb-1 uppercase text-xs tracking-widest font-mono flex items-center gap-2">
                                        {clearResult.error ? (
                                            <><TriangleAlert size={14} className="text-prizm-danger" /> <span className="text-prizm-danger">FAULT CLEAR FAILED</span></>
                                        ) : clearResult.verification?.appearsCleared === false ? (
                                            <><TriangleAlert size={14} className="text-prizm-warning" /> <span className="text-prizm-warning">FAULT CLEARED BUT STILL PRESENT</span></>
                                        ) : (
                                            <><CheckCircle2 size={14} className="text-emerald-400" /> <span className="text-emerald-400">FAULT CLEARED SUCCESSFULLY</span></>
                                        )}
                                    </div>
                                    <div className="text-xs font-mono text-prizm-text-muted mt-2">
                                        {clearResult.error || "The fault reset completed successfully."}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 font-mono">
                            <button
                                onClick={() => {
                                    setClearCandidate(null);
                                    setClearConfRef("");
                                    setClearResult(null);
                                }}
                                className="px-4 py-2 border border-prizm-border rounded text-prizm-text-muted hover:bg-prizm-surface transition-colors uppercase tracking-widest text-[10px] font-bold"
                            >
                                {clearResult ? "Close" : "Cancel"}
                            </button>
                            {!clearResult && (
                                <button
                                    onClick={executeClear}
                                    disabled={clearConfRef !== clearCandidate.entityKeyToken || clearLoading}
                                    className="px-4 py-2 bg-prizm-danger text-white rounded font-bold hover:bg-prizm-danger/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest text-[10px] flex items-center gap-2"
                                >
                                    {clearLoading ? <Activity size={14} className="animate-spin" /> : null}
                                    {clearLoading ? "Executing..." : "Confirm Clear"}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
            
            {/* EMS App Control Modal */}
            {emsAppCandidate && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-prizm-surface-strong border border-prizm-border rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
                        <div className="flex items-center gap-2 p-4 bg-prizm-surface border-b border-prizm-border">
                            <BoxSelect className="text-prizm-primary animate-pulse" size={18} />
                            <h3 className="font-bold text-prizm-text font-mono uppercase tracking-widest text-sm">Review EMS App Control</h3>
                        </div>
                        <div className="p-6 space-y-4 font-mono text-xs">
                            <div className={`border p-3 rounded text-center ${
                                emsAppTargetState 
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" 
                                : "bg-amber-500/10 border-amber-500/30 text-amber-500"
                            }`}>
                                You are about to <span className="font-bold uppercase">{emsAppTargetState ? "ENABLE" : "DISABLE"}</span> a Dragon Application. This can immediately change the operational behavior of the system.
                            </div>
                            
                            <table className="w-full text-left">
                                <tbody className="divide-y divide-prizm-border/50">
                                    <tr>
                                        <th className="py-2 text-prizm-text-muted">Station</th>
                                        <td className="py-2 text-prizm-text text-right font-bold">{state.siteSummary?.site?.stationCode || "BHE0020"}</td>
                                    </tr>
                                    <tr>
                                        <th className="py-2 text-prizm-text-muted">Block</th>
                                        <td className="py-2 text-prizm-text text-right font-bold">{state.siteSummary?.site?.blockIndex || 1}</td>
                                    </tr>
                                    <tr>
                                        <th className="py-2 text-prizm-text-muted">App Name</th>
                                        <td className="py-2 text-prizm-text text-right font-bold text-prizm-primary">{emsAppCandidate.appName}</td>
                                    </tr>
                                    <tr>
                                        <th className="py-2 text-prizm-text-muted">App Code</th>
                                        <td className="py-2 text-prizm-text text-right font-bold">{emsAppCandidate.appCode}</td>
                                    </tr>
                                    <tr>
                                        <th className="py-2 text-prizm-text-muted">Priority</th>
                                        <td className="py-2 text-prizm-text text-right font-bold">{emsAppCandidate.priority}</td>
                                    </tr>
                                    <tr>
                                        <th className="py-2 text-prizm-text-muted">Current State</th>
                                        <td className="py-2 text-right">
                                            <span className={`px-2 py-0.5 rounded font-bold uppercase ${emsAppCandidate.enabled ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                                {emsAppCandidate.enabled ? "Enabled" : "Disabled"}
                                            </span>
                                        </td>
                                    </tr>
                                    <tr>
                                        <th className="py-2 text-prizm-text-muted">Requested State</th>
                                        <td className="py-2 text-right">
                                            <span className={`px-2 py-0.5 rounded font-bold uppercase ${emsAppTargetState ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                                {emsAppTargetState ? "ENABLE" : "DISABLE"}
                                            </span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            <div className="pt-2">
                                <label className="text-[10px] text-prizm-text-muted uppercase mb-1 block">Type exactly '<span className="text-prizm-text">{emsAppTargetState ? "ENABLE" : "DISABLE"} {emsAppCandidate.appCode}</span>'</label>
                                <input
                                    type="text"
                                    value={emsAppConfText}
                                    onChange={e => setEmsAppConfText(e.target.value)}
                                    placeholder={`${emsAppTargetState ? "ENABLE" : "DISABLE"} ${emsAppCandidate.appCode}`}
                                    disabled={emsAppLoading}
                                    autoComplete="off"
                                    className="w-full bg-black/50 border border-prizm-border p-2 focus:outline-none focus:border-prizm-primary text-prizm-text tracking-widest uppercase disabled:opacity-50"
                                />
                            </div>

                            {emsAppResult && (
                                <div className={`p-3 border rounded text-[10px] ${
                                    emsAppResult.success || emsAppResult.queued 
                                    ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-500" 
                                    : "bg-prizm-danger/10 border-prizm-danger text-prizm-danger"
                                }`}>
                                    <div className="font-bold uppercase tracking-wider mb-1">
                                        {emsAppResult.success ? "Success" : (emsAppResult.queued ? "Accepted/Queued" : "Action Failed")}
                                    </div>
                                    <div className="whitespace-pre-wrap font-mono uppercase text-[9px] text-prizm-text">{emsAppResult.message || emsAppResult.error}</div>
                                </div>
                            )}

                        </div>
                        
                        <div className="flex bg-prizm-surface border-t border-prizm-border">
                            <button
                                onClick={() => setEmsAppCandidate(null)}
                                disabled={emsAppLoading}
                                className="flex-1 py-3 text-xs font-bold text-prizm-text-muted hover:text-white transition-colors uppercase tracking-widest disabled:opacity-50"
                            >
                                {emsAppResult ? "Close" : "Cancel"}
                            </button>
                            {!emsAppResult && (
                                <button
                                    onClick={executeEmsAppAction}
                                    disabled={
                                        emsAppLoading || 
                                        emsAppConfText !== `${emsAppTargetState ? "ENABLE" : "DISABLE"} ${emsAppCandidate.appCode}`
                                    }
                                    className={`flex-1 py-3 text-xs font-bold transition-colors uppercase tracking-widest flex items-center justify-center gap-2 ${
                                        emsAppTargetState
                                        ? "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 disabled:bg-prizm-surface disabled:text-prizm-text-muted"
                                        : "bg-red-500/10 text-red-500 hover:bg-red-500/20 disabled:bg-prizm-surface disabled:text-prizm-text-muted"
                                    }`}
                                >
                                    {emsAppLoading ? "Processing..." : "Confirm Action"}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

        <RotationModal
                isOpen={pcsModalOpen}
                onClose={() => setPcsModalOpen(false)}
                onConfirm={handlePcsConfirm}
                targets={pcsModalTargets}
                action={pcsModalAction}
                targetType="pcs"
            />
        </div>
    );
}
