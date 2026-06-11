import React, { useState, useEffect } from "react";
import { 
    Activity, 
    Battery, 
    TriangleAlert, 
    ServerOff, 
    CheckCircle2, 
    ChevronRight, 
    Hash, 
    XOctagon, 
    Flame,
    Zap,
    Thermometer,
    Wind,
    ShieldAlert,
    Network
} from "lucide-react";
import { formatPrizmUtcTimestamp } from "../lib/timeFormat";

type DashboardState = {
    loading: boolean;
    cacheStatus: any;
    stringsDashboard: any;
    featherDevices: any;
    safetyFaults: any;
    overviewDiscovery: any;
    historyEvents: any;
};

export default function SiteOperationsDashboard({ setActiveTab }: { setActiveTab?: (tab: string) => void }) {
    const [state, setState] = useState<DashboardState>({
        loading: true,
        cacheStatus: null,
        stringsDashboard: null,
        featherDevices: null,
        safetyFaults: null,
        overviewDiscovery: null,
        historyEvents: null
    });

    useEffect(() => {
        let unmounted = false;
        const fetchData = async () => {
            try {
                const [
                    cacheRes,
                    stringsRes,
                    featherRes,
                    safetyRes,
                    overviewRes,
                    historyRes
                ] = await Promise.allSettled([
                    fetch("/api/local/cache/status").then(r => r.json()),
                    fetch("/api/local/strings/dashboard?array=ALL&enrich=none&maxAgeMs=15000").then(r => r.json()),
                    fetch("/api/feather/devices").then(r => r.json()),
                    fetch("/api/local/safety-fault-clear/candidates").then(r => r.json()),
                    fetch("/api/local/overview/discovery").then(r => r.json()),
                    fetch("/api/local/history/events?range=24h").then(r => r.json())
                ]);

                if (unmounted) return;

                setState({
                    loading: false,
                    cacheStatus: cacheRes.status === "fulfilled" ? cacheRes.value : null,
                    stringsDashboard: stringsRes.status === "fulfilled" ? stringsRes.value : null,
                    featherDevices: featherRes.status === "fulfilled" ? featherRes.value : null,
                    safetyFaults: safetyRes.status === "fulfilled" ? safetyRes.value : null,
                    overviewDiscovery: overviewRes.status === "fulfilled" ? overviewRes.value : null,
                    historyEvents: historyRes.status === "fulfilled" ? historyRes.value : null
                });
            } catch (err) {
                if (!unmounted) setState(prev => ({ ...prev, loading: false }));
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 10000);
        return () => {
            unmounted = true;
            clearInterval(interval);
        };
    }, []);

    if (state.loading && !state.stringsDashboard && !state.overviewDiscovery) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
                <Activity size={48} className="animate-spin text-prizm-primary mb-4" />
                <h2 className="text-xl font-bold uppercase tracking-widest text-prizm-text mb-2">LOADING SITE OPERATIONS...</h2>
            </div>
        );
    }

    // Determine Global Site Status
    const isStringsLiveOrCached = state.stringsDashboard && state.stringsDashboard.stringsReturned > 0;
    const isOverviewLiveOrCached = state.overviewDiscovery && Object.values(state.overviewDiscovery.sourceHealth || {}).some((s: any) => s.ok);
    
    // Partial: some source is missing or offline
    const isStringsOffline = !state.stringsDashboard || state.stringsDashboard.stringsReturned === 0;
    const isOverviewOffline = !state.overviewDiscovery || !Object.values(state.overviewDiscovery.sourceHealth || {}).some((s: any) => s.ok);

    let siteState = "OFFLINE";
    if (isStringsLiveOrCached && isOverviewLiveOrCached) siteState = "LIVE";
    else if (isStringsLiveOrCached || isOverviewLiveOrCached) siteState = "PARTIAL";

    const rollups = state.stringsDashboard?.rollups || {};
    const stationCode = state.overviewDiscovery?.stationCode || state.stringsDashboard?.stationCode || "UNKNOWN";
    const emsBaseUrl = state.overviewDiscovery?.emsBaseUrl || state.stringsDashboard?.emsBaseUrl || "--";
    const blockIndex = state.overviewDiscovery?.blockIndex !== undefined ? state.overviewDiscovery?.blockIndex : "--";
    const profileId = state.stringsDashboard?.profileId || "--";

    // Build timeline/issues
    const activeIssues = [];

    if (state.stringsDashboard?.arrays) {
        state.stringsDashboard.arrays.forEach((a: any) => {
            if (a.warningCount > 0) activeIssues.push({ severity: "WARNING", source: `Array ${a.arrayNumber}`, message: `${a.warningCount} String Warnings` });
            if (a.alarmCount > 0) activeIssues.push({ severity: "ALARM", source: `Array ${a.arrayNumber}`, message: `${a.alarmCount} String Alarms` });
        });
    }

    if (state.featherDevices?.devices) {
        state.featherDevices.devices.forEach((d: any) => {
            if (d.devicesWithLostComms?.length > 0) {
                d.devicesWithLostComms.forEach((c: string) => {
                    activeIssues.push({ severity: "WARNING", source: `Feather ${d.ip}`, message: `Lost Comms with: ${c}` });
                });
            }
            if (d.fssValid === false) activeIssues.push({ severity: "ALARM", source: `Feather ${d.ip}`, message: `FSS Data Invalid` });
            if (d.doorsValid === false) activeIssues.push({ severity: "ALARM", source: `Feather ${d.ip}`, message: `Doors Data Invalid` });
            if (d.hvacValid === false) activeIssues.push({ severity: "WARNING", source: `Feather ${d.ip}`, message: `HVAC Data Invalid` });
        });
    }

    if (state.safetyFaults?.eligible?.length > 0) {
        activeIssues.push({ severity: "ALARM", source: "Safety Fault Clear", message: `${state.safetyFaults.eligible.length} reset-eligible safety faults` });
    }

    if (isStringsOffline) activeIssues.push({ severity: "STALE", source: "Strings Dashboard", message: "Strings data offline or missing" });
    if (isOverviewOffline) activeIssues.push({ severity: "STALE", source: "Overview Discovery", message: "EMS Local API sources offline" });

    // Safety Summary
    const safetyEligible = state.safetyFaults?.eligible?.length || 0;
    const safetyNotEligible = state.safetyFaults?.notEligible?.length || 0;

    // Feather Summary
    const featherTotal = state.featherDevices?.devices?.length || 0;
    let featherLostComms = 0;
    let featherFssInvalid = 0;
    let featherDoorsInvalid = 0;
    if (state.featherDevices?.devices) {
        state.featherDevices.devices.forEach((d: any) => {
             if (d.devicesWithLostComms?.length > 0 || d.warnInfo?.some((w:string) => w.includes("Lost Comms"))) featherLostComms++;
             if (d.fssValid === false) featherFssInvalid++;
             if (d.doorsValid === false) featherDoorsInvalid++;
        });
    }

    // Source health
    const buildSourceHealth = () => {
        const sources = [];
        if (state.stringsDashboard?.sourceHealth) {
           Object.entries(state.stringsDashboard.sourceHealth).forEach(([k, v]: any) => {
               sources.push({ name: k, ok: v.ok, error: v.error, type: "Strings" });
           });
        }
        if (state.overviewDiscovery?.sourceHealth) {
           Object.entries(state.overviewDiscovery.sourceHealth).forEach(([k, v]: any) => {
               sources.push({ name: k, ok: v.ok, error: v.error, type: "Overview" });
           });
        }
        return sources;
    };
    const combinedSources = buildSourceHealth();

    const navigate = (tab: string) => {
        if (setActiveTab) setActiveTab(tab);
    };

    return (
        <div className="flex-1 flex flex-col p-4 sm:p-6 overflow-y-auto no-scrollbar font-sans space-y-6">
            {/* Global Site Status Banner */}
            <div className={`border p-4 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${siteState === "LIVE" ? "bg-emerald-500/10 border-emerald-500/30" : siteState === "PARTIAL" ? "bg-prizm-warning/10 border-prizm-warning/30" : "bg-prizm-danger/10 border-prizm-danger/30"}`}>
                <div>
                   <h1 className="text-xl font-bold uppercase tracking-widest text-prizm-text">SITE OPERATIONS DASHBOARD</h1>
                   <div className="text-xs text-prizm-text-muted mt-1 uppercase font-mono">
                      Local EMS / BESS operational summary | Station: <strong className="text-prizm-text">{stationCode}</strong> | Profile: <strong className="text-prizm-text">{profileId}</strong>
                   </div>
                </div>
                <div className="flex flex-col gap-1 text-[10px] font-mono text-right">
                   <div className="flex items-center gap-2 justify-end">
                      <span className={`px-2 py-0.5 rounded font-bold ${siteState === "LIVE" ? "bg-emerald-500/20 text-emerald-500" : siteState === "PARTIAL" ? "bg-prizm-warning/20 text-prizm-warning" : "bg-prizm-danger/20 text-prizm-danger"}`}>
                         {siteState}
                      </span>
                   </div>
                   <div className="text-prizm-text-muted mt-1">Endpoint: {emsBaseUrl}</div>
                   <div className="text-prizm-text-muted">Block Index: {blockIndex}</div>
                </div>
            </div>

            {/* BESS Summary Cards */}
            <div>
               <h2 className="text-sm font-bold text-prizm-text uppercase tracking-widest mb-3 flex items-center gap-2"><Battery size={16} /> BESS Fleet Summary</h2>
               <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                   <div className="bg-prizm-surface-strong border border-prizm-border rounded p-3">
                       <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider">Total Strings</div>
                       <div className="text-xl font-bold text-prizm-text font-mono mt-1">{rollups.totalStrings !== undefined ? rollups.totalStrings : "--"}</div>
                   </div>
                   <div className="bg-prizm-surface-strong border border-emerald-500/30 rounded p-3">
                       <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider">Normal Strings</div>
                       <div className="text-xl font-bold text-emerald-400 font-mono mt-1">{rollups.normal !== undefined ? rollups.normal : "--"}</div>
                   </div>
                   <div className="bg-prizm-surface-strong border border-prizm-border rounded p-3">
                       <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider">Offline Strings</div>
                       <div className="text-xl font-bold text-prizm-text-muted font-mono mt-1">{rollups.offline !== undefined ? rollups.offline : "--"}</div>
                   </div>
                   <div className="bg-prizm-surface-strong border border-prizm-warning/30 rounded p-3">
                       <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider">Warn / Alm Strings</div>
                       <div className="text-xl font-bold text-prizm-warning font-mono mt-1">
                           {rollups.warnings !== undefined ? rollups.warnings : "--"} <span className="text-prizm-text-muted">/</span> <span className="text-prizm-danger">{rollups.alarms !== undefined ? rollups.alarms : "--"}</span>
                       </div>
                   </div>
                   <div className="bg-prizm-surface-strong border border-prizm-border rounded p-3">
                       <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider">Avg Cell Volts</div>
                       <div className="text-xl font-bold text-prizm-text font-mono mt-1">{rollups.fleetAvgCellVoltage !== undefined && rollups.fleetAvgCellVoltage !== null ? `${rollups.fleetAvgCellVoltage.toFixed(3)} V` : "--"}</div>
                   </div>
                   <div className="bg-prizm-surface-strong border border-prizm-border rounded p-3">
                       <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider">Max Cell V Delta</div>
                       <div className="text-xl font-bold text-prizm-text font-mono mt-1">{rollups.fleetMaxCellVoltageDelta !== undefined && rollups.fleetMaxCellVoltageDelta !== null ? `${rollups.fleetMaxCellVoltageDelta.toFixed(3)} V` : "--"}</div>
                   </div>
                   <div className="bg-prizm-surface-strong border border-prizm-border rounded p-3">
                       <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider">Avg Cell Temp</div>
                       <div className="text-xl font-bold text-prizm-text font-mono mt-1">{rollups.fleetAvgCellTemp !== undefined && rollups.fleetAvgCellTemp !== null ? `${rollups.fleetAvgCellTemp.toFixed(1)} °C` : "--"}</div>
                   </div>
                   <div className="bg-prizm-surface-strong border border-prizm-border rounded p-3">
                       <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider">Expected BPCs</div>
                       <div className="text-xl font-bold text-prizm-text font-mono mt-1">{rollups.expectedBpcCount !== undefined ? rollups.expectedBpcCount : "--"}</div>
                   </div>
               </div>
            </div>

            {/* Array Health Cards */}
            <div>
               <h2 className="text-sm font-bold text-prizm-text uppercase tracking-widest mb-3 flex items-center gap-2"><Hash size={16} /> Array Health Rollup</h2>
               {state.stringsDashboard?.arrays?.length > 0 ? (
                   <div className="flex overflow-x-auto gap-4 pb-2 no-scrollbar">
                       {state.stringsDashboard.arrays.map((arr: any, i: number) => {
                           const isAlarm = arr.alarmCount > 0;
                           const isWarning = arr.warningCount > 0;
                           const border = isAlarm ? "border-prizm-danger" : isWarning ? "border-prizm-warning" : "border-emerald-500/30";
                           return (
                               <div key={i} className={`min-w-[200px] shrink-0 bg-prizm-surface border ${border} rounded p-3 cursor-pointer hover:bg-prizm-surface-strong transition-colors`} onClick={() => navigate("arrays-strings")}>
                                   <div className="text-sm font-bold text-prizm-primary font-mono mb-2">Array {arr.arrayNumber}</div>
                                   <div className="text-[10px] font-mono text-prizm-text space-y-1">
                                       <div className="flex justify-between"><span>Normal</span> <span className="text-emerald-400">{arr.normalStrings}</span></div>
                                       <div className="flex justify-between"><span>Offline</span> <span className="text-prizm-text-muted">{arr.offlineStrings}</span></div>
                                       <div className="flex justify-between"><span>Warnings</span> <span className="text-prizm-warning">{arr.warningCount}</span></div>
                                       <div className="flex justify-between"><span>Alarms</span> <span className="text-prizm-danger">{arr.alarmCount}</span></div>
                                   </div>
                               </div>
                           );
                       })}
                   </div>
               ) : (
                   <div className="bg-prizm-surface border border-prizm-border rounded p-4 text-[10px] font-mono text-prizm-text-muted uppercase">No arrays available in strings dashboard data</div>
               )}
            </div>

            {/* Active Issues & Feather Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-prizm-surface-strong border border-prizm-border rounded-lg p-5 flex flex-col max-h-[300px] overflow-hidden">
                    <h3 className="text-xs font-bold text-prizm-text uppercase tracking-widest font-mono mb-4 flex items-center gap-2"><TriangleAlert size={14} className="text-prizm-warning" /> Active Issues</h3>
                    <div className="overflow-y-auto no-scrollbar flex-1 -mx-2 px-2">
                        {activeIssues.length > 0 ? (
                            <table className="w-full text-[10px] font-mono text-left">
                                <thead className="sticky top-0 bg-prizm-surface-strong z-10">
                                    <tr className="text-prizm-text-muted border-b border-prizm-border font-bold">
                                        <th className="py-2">Level</th>
                                        <th className="py-2">Source</th>
                                        <th className="py-2">Message</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeIssues.map((issue, i) => (
                                        <tr key={i} className="border-b border-prizm-border/50 text-prizm-text hover:bg-black/10">
                                            <td className="py-2">
                                                <span className={`px-1 rounded ${issue.severity === 'ALARM' ? 'bg-prizm-danger/20 text-prizm-danger' : issue.severity === 'WARNING' ? 'bg-prizm-warning/20 text-prizm-warning' : 'bg-slate-500/20 text-slate-400'}`}>
                                                    {issue.severity}
                                                </span>
                                            </td>
                                            <td className="py-2 font-bold">{issue.source}</td>
                                            <td className="py-2">{issue.message}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="text-[10px] text-prizm-text-muted uppercase font-mono py-4">No active issues detected.</div>
                        )}
                    </div>
                </div>

                <div className="bg-prizm-surface-strong border border-prizm-border rounded-lg p-5 flex flex-col">
                    <h3 className="text-xs font-bold text-prizm-text uppercase tracking-widest font-mono mb-4 flex items-center gap-2"><Wind size={14} className="text-prizm-info" /> Feather/HVAC Health</h3>
                    <div className="grid grid-cols-2 gap-4 flex-1">
                        <div className="bg-prizm-surface border border-prizm-border rounded p-3">
                            <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">Total Devices</div>
                            <div className="text-lg font-bold font-mono text-prizm-text">{featherTotal}</div>
                        </div>
                        <div className="bg-prizm-surface border border-prizm-border rounded p-3">
                            <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">FSS Invalid</div>
                            <div className={`text-lg font-bold font-mono ${featherFssInvalid > 0 ? "text-prizm-danger" : "text-prizm-text"}`}>{featherFssInvalid}</div>
                        </div>
                        <div className="bg-prizm-surface border border-prizm-border rounded p-3">
                            <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">Doors Invalid</div>
                            <div className={`text-lg font-bold font-mono ${featherDoorsInvalid > 0 ? "text-prizm-danger" : "text-prizm-text"}`}>{featherDoorsInvalid}</div>
                        </div>
                        <div className="bg-prizm-surface border border-prizm-border rounded p-3">
                            <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">Lost Comms</div>
                            <div className={`text-lg font-bold font-mono ${featherLostComms > 0 ? "text-prizm-warning" : "text-prizm-text"}`}>{featherLostComms}</div>
                        </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-prizm-border flex justify-end">
                       <button onClick={() => navigate("feather-hvac")} className="text-[10px] font-bold uppercase tracking-widest font-mono bg-prizm-primary/10 text-prizm-primary px-4 py-2 hover:bg-prizm-primary/20 transition-colors border border-prizm-primary/30 rounded">Open Feather/HVAC</button>
                    </div>
                </div>
            </div>

            {/* Safety & Source Health */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 <div className="bg-prizm-surface-strong border border-prizm-border rounded-lg p-5 flex flex-col">
                    <h3 className="text-xs font-bold text-prizm-text uppercase tracking-widest font-mono mb-4 flex items-center gap-2"><ShieldAlert size={14} className="text-prizm-danger" /> Safety Fault Candidates</h3>
                    <div className="grid grid-cols-2 gap-4 flex-1">
                        <div className="bg-prizm-surface border border-prizm-border rounded p-3">
                            <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">Reset Eligible</div>
                            <div className={`text-lg font-bold font-mono ${safetyEligible > 0 ? "text-prizm-danger animate-pulse" : "text-prizm-text"}`}>{safetyEligible}</div>
                        </div>
                        <div className="bg-prizm-surface border border-prizm-border rounded p-3">
                            <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">Not Eligible</div>
                            <div className="text-lg font-bold text-prizm-text-muted font-mono">{safetyNotEligible}</div>
                        </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-prizm-border flex justify-end">
                       <button onClick={() => navigate("safety-fault")} className="text-[10px] font-bold uppercase tracking-widest font-mono bg-prizm-danger/10 text-prizm-danger px-4 py-2 hover:bg-prizm-danger/20 transition-colors border border-prizm-danger/30 rounded">Open Safety Fault Clear</button>
                    </div>
                 </div>

                 <div className="bg-prizm-surface-strong border border-prizm-border rounded-lg p-5 flex flex-col max-h-[300px] overflow-hidden">
                    <h3 className="text-xs font-bold text-prizm-text uppercase tracking-widest font-mono mb-4 flex items-center gap-2"><Network size={14} className="text-prizm-text-muted" /> Source Health</h3>
                    <div className="overflow-y-auto no-scrollbar flex-1 -mx-2 px-2">
                        {combinedSources.length > 0 ? (
                            <table className="w-full text-[10px] font-mono text-left">
                                <thead className="sticky top-0 bg-prizm-surface-strong z-10">
                                    <tr className="text-prizm-text-muted border-b border-prizm-border font-bold">
                                        <th className="py-2">Source</th>
                                        <th className="py-2">Module</th>
                                        <th className="py-2">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {combinedSources.map((src, i) => (
                                        <tr key={i} className="border-b border-prizm-border/50 text-prizm-text hover:bg-black/10">
                                            <td className="py-2 font-bold">{src.name}</td>
                                            <td className="py-2 text-prizm-text-muted">{src.type}</td>
                                            <td className="py-2">
                                                <span className={src.ok ? "text-emerald-400" : "text-prizm-danger"} title={src.error || ""}>
                                                    {src.ok ? "OK" : "FAILED"}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="text-[10px] text-prizm-text-muted uppercase font-mono py-4">No localized source data found.</div>
                        )}
                    </div>
                 </div>
            </div>

            {/* Recent Event Timeline */}
            <div className="bg-prizm-surface-strong border border-prizm-border rounded-lg p-5 flex flex-col max-h-[300px] overflow-hidden">
                <h3 className="text-xs font-bold text-prizm-text uppercase tracking-widest font-mono mb-4 flex items-center gap-2"><Activity size={14} className="text-prizm-primary" /> Recent Event Timeline</h3>
                <div className="overflow-y-auto no-scrollbar flex-1 -mx-2 px-2">
                    {state.historyEvents?.events?.length > 0 ? (
                         <table className="w-full text-[10px] font-mono text-left">
                            <thead className="sticky top-0 bg-prizm-surface-strong z-10">
                                <tr className="text-prizm-text-muted border-b border-prizm-border font-bold">
                                    <th className="py-2">Timestamp</th>
                                    <th className="py-2">Severity</th>
                                    <th className="py-2">Source</th>
                                    <th className="py-2">Message</th>
                                </tr>
                            </thead>
                            <tbody>
                                {state.historyEvents.events.map((e: any, i: number) => (
                                    <tr key={i} className="border-b border-prizm-border/50 text-prizm-text hover:bg-black/10">
                                        <td className="py-2 whitespace-nowrap pr-2">{formatPrizmUtcTimestamp(e.timestamp)}</td>
                                        <td className="py-2">
                                            <span className={`px-1 rounded ${e.severity === 'ALARM' ? 'bg-prizm-danger/20 text-prizm-danger' : e.severity === 'WARNING' ? 'bg-prizm-warning/20 text-prizm-warning' : 'bg-slate-500/20 text-slate-400'}`}>
                                                {e.severity}
                                            </span>
                                        </td>
                                        <td className="py-2 font-bold">{e.source}</td>
                                        <td className="py-2">{e.message}</td>
                                    </tr>
                                ))}
                            </tbody>
                         </table>
                    ) : (
                         <div className="text-[10px] text-prizm-text-muted uppercase font-mono py-4">
                             <div className="mb-2">No recent historical events recorded yet.</div>
                             <div>Current active issues are shown above.</div>
                         </div>
                    )}
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
            
        </div>
    );
}
