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
    Rows4
} from "lucide-react";
import { formatPrizmUtcTimestamp } from "../lib/timeFormat";

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

export default function SiteOperationsDashboard({ setActiveTab }: { setActiveTab?: (tab: string) => void }) {
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
            const profileId = state.stringsDashboard?.profileId || state.siteSummary?.site?.activeProfileId;
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
                    summaryRes,
                    historyRes
                ] = await Promise.allSettled([
                    fetch("/api/local/cache/status").then(r => r.json()),
                    fetch("/api/local/strings/dashboard?array=ALL&enrich=none&maxAgeMs=15000").then(r => r.json()),
                    fetch("/api/feather/devices").then(r => r.json()),
                    fetch("/api/local/safety-fault-clear/candidates").then(r => r.json()),
                    fetch("/api/local/overview/(state.overviewDiscovery?.discoveredSections || {})?fullTables=true").then(r => r.json()),
                    fetch("/api/local/site-operations/summary").then(r => r.json()),
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
                    siteSummary: summaryRes.status === "fulfilled" ? summaryRes.value : null,
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

    const sum = state.siteSummary;
    let siteState: string = sum?.site?.connectionState === "disconnected" ? "OFFLINE" : "LIVE";
    
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
    const onlineStats = { count: stringBuckets.online };
    const nearlineStats = { count: stringBuckets.nearline };
    const offlineStats = { count: stringBuckets.offline };
    const notCommStats = { count: stringBuckets.notCommunicating };
    const rollups = state.stringsDashboard?.rollups || { totalStrings: (stringBuckets.online + stringBuckets.nearline + stringBuckets.offline + stringBuckets.notCommunicating) || 0 };

    const activeIssues = sum?.activeIssueGroups || [];
    activeIssues.sort((a: any, b: any) => {
        const severityRank: Record<string, number> = { "ALARM": 1, "WARNING": 2, "STALE": 3, "INFO": 4 };
        return (severityRank[a.severity] || 5) - (severityRank[b.severity] || 5);
    });

    const clearableFaults = sum?.safetySummary?.clearableFaults || [];
    const safetyEligible = sum?.safetySummary?.clearableCount || 0;
    const safetyNotEligible = 0; // Not eligible faults no longer primarily tracked here

    const combinedSources = sum?.sourceHealth || [];
    const featherTotal = sum?.featherSummary?.totalDevices || 0;
    const featherLostComms = sum?.featherSummary?.lostCommsCount || 0;
    const featherFssInvalid = sum?.featherSummary?.fssInvalidCount || 0;
    const featherDoorsInvalid = sum?.featherSummary?.doorsInvalidCount || 0;

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
            <CollapsibleSection title="BESS Fleet Summary" icon={Battery} defaultExpanded={true}>
                 <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 sm:gap-px bg-prizm-border">
                    <div className="bg-prizm-surface-strong p-4">
                        <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">Total Strings</div>
                        <div className="text-xl font-bold text-prizm-text font-mono">{rollups.totalStrings !== undefined ? rollups.totalStrings : "--"}</div>
                    </div>
                    <div className="bg-prizm-surface p-4 border-t border-prizm-border sm:border-t-0">
                        <div className="text-[10px] text-emerald-500 uppercase font-bold tracking-wider mb-1">Online Strings</div>
                        <div className="text-xl font-bold text-emerald-400 font-mono">{onlineStats ? onlineStats.count : 0}</div>
                    </div>
                    <div className="bg-prizm-surface p-4 border-t border-prizm-border sm:border-t-0">
                        <div className="text-[10px] text-emerald-300 uppercase font-bold tracking-wider mb-1">Nearline Strings</div>
                        <div className="text-xl font-bold text-emerald-300 font-mono">{nearlineStats ? nearlineStats.count : 0}</div>
                    </div>
                    <div className="bg-prizm-surface p-4 border-t border-prizm-border sm:border-t-0">
                        <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">Offline Strings</div>
                        <div className="text-xl font-bold text-prizm-text-muted font-mono">{offlineStats ? offlineStats.count : 0}</div>
                    </div>
                    <div className="bg-prizm-surface p-4 border-t border-prizm-border sm:border-t-0">
                        <div className="text-[10px] text-prizm-danger uppercase font-bold tracking-wider mb-1">Not Communicating</div>
                        <div className="text-xl font-bold text-prizm-danger font-mono">{notCommStats ? notCommStats.count : 0}</div>
                    </div>
                    <div className="bg-prizm-surface p-4 border-t border-prizm-border sm:border-t-0">
                        <div className="text-[10px] text-prizm-warning uppercase font-bold tracking-wider mb-1">Warn / Alm Strings</div>
                        <div className="text-xl font-bold text-prizm-warning font-mono">
                            {rollups.warnings !== undefined ? rollups.warnings : "--"} <span className="text-prizm-text-muted">/</span> <span className="text-prizm-danger">{rollups.alarms !== undefined ? rollups.alarms : "--"}</span>
                        </div>
                    </div>
                    <div className="bg-prizm-surface-strong p-4 border-t border-prizm-border sm:border-t-0">
                        <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">Avg Cell V</div>
                        <div className="text-xl font-bold text-prizm-text font-mono">{rollups.fleetAvgCellVoltage !== undefined && rollups.fleetAvgCellVoltage !== null ? `${rollups.fleetAvgCellVoltage.toFixed(1)} mV` : "--"}</div>
                    </div>
                    <div className="bg-prizm-surface-strong p-4 border-t border-prizm-border sm:border-t-0">
                        <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">Max Cell Δ</div>
                        <div className="text-xl font-bold text-prizm-text font-mono">{rollups.fleetMaxCellVoltageDelta !== undefined && rollups.fleetMaxCellVoltageDelta !== null ? `Δ ${rollups.fleetMaxCellVoltageDelta.toFixed(0)} mV` : "--"}</div>
                    </div>
                    <div className="bg-prizm-surface-strong p-4 border-t border-prizm-border sm:border-t-0">
                        <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">Avg Cell Temp</div>
                        <div className="text-xl font-bold text-prizm-text font-mono">{rollups.fleetAvgCellTemp !== undefined && rollups.fleetAvgCellTemp !== null ? `${rollups.fleetAvgCellTemp.toFixed(1)} °C` : "--"}</div>
                    </div>
                    <div className="bg-prizm-surface-strong p-4 border-t border-prizm-border sm:border-t-0">
                        <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">Expected BPCs</div>
                        <div className="text-xl font-bold text-prizm-text font-mono">{rollups.expectedBpcCount !== undefined ? rollups.expectedBpcCount : "--"}</div>
                    </div>
                 </div>
            </CollapsibleSection>

            {/* EMS Apps */}
            <CollapsibleSection title="Operating Context (EMS Apps)" icon={BoxSelect} defaultExpanded={false}>
                 {emsAppsData.length > 0 ? (
                     <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                         <thead className="bg-black/40 text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border">
                             <tr>
                                 <th className="p-2 font-bold text-center">Pri</th>
                                 <th className="p-2 font-bold">App Code</th>
                                 <th className="p-2 font-bold">App Name</th>
                                 <th className="p-2 font-bold">Configuration</th>
                                 <th className="p-2 font-bold text-center">Status</th>
                                 <th className="p-2 font-bold">Details</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-prizm-border">
                             {emsAppsData.map((app: any, idx: number) => {
                                 let displayStatus = app.enabled ? "Enabled" : "Not Enabled";
                                 let statusColor = app.enabled ? "bg-emerald-500/10 text-emerald-500" : "bg-slate-500/10 text-slate-400";
                                 
                                 const h = (app.health || "").toUpperCase();
                                 if (h.includes("FAULT")) { displayStatus = "Faulted"; statusColor = "bg-prizm-danger/10 text-prizm-danger"; }
                                 else if (h.includes("WARN")) { displayStatus = "Warning"; statusColor = "bg-prizm-warning/10 text-prizm-warning"; }
                                 else if (h.includes("UNAVAIL") || h.includes("OFFLINE")) { displayStatus = "Unavailable"; statusColor = "bg-prizm-danger/10 text-prizm-danger"; }

                                 return (
                                 <tr key={idx} className="hover:bg-prizm-surface transition-colors">
                                     <td className="p-2 text-center text-prizm-text-muted">{app.priority !== undefined ? app.priority : "--"}</td>
                                     <td className="p-2 text-prizm-text font-bold">{app.appCode || "--"}</td>
                                     <td className="p-2 text-prizm-primary font-bold">{app.application || app.applicationName || app.appName || app.name || "--"}</td>
                                     <td className="p-2 text-prizm-text-muted text-xs">{app.configName || "--"} {app.configVersionId ? `(v${app.configVersionId})` : ""}</td>
                                     <td className="p-2 text-center">
                                         <span className={`px-2 py-[2px] rounded font-bold ${statusColor}`}>{displayStatus}</span>
                                     </td>
                                     <td className="p-2 text-prizm-text whitespace-pre-wrap leading-tight">{app.hasShortAppStatus && app.shortAppStatus ? app.shortAppStatus.replace(/<br\s*\/?>/gi, '\n') : (app.appStatus || "--").replace(/<br\s*\/?>/gi, '\n')}</td>
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
                         <thead className="bg-black/40 text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border">
                             <tr>
                                 <th className="p-2 font-bold">Meter ID</th>
                                 <th className="p-2 font-bold">kW</th>
                                 <th className="p-2 font-bold">Voltage</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-prizm-border">
                             {(state.overviewDiscovery?.discoveredSections || {}).blockMeters.sampleItems.map((item: any, idx: number) => (
                                 <tr key={idx} className="hover:bg-prizm-surface transition-colors">
                                     <td className="p-2 text-prizm-primary font-bold">{item.id || item.name || "--"}</td>
                                     <td className="p-2 text-prizm-text">{item.kw !== undefined ? item.kw : "--"}</td>
                                     <td className="p-2 text-prizm-text-muted">{item.voltage !== undefined ? item.voltage : "--"}</td>
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
                             <thead className="bg-black/40 text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border">
                                 <tr>
                                     <th className="p-2 font-bold min-w-[80px]">PCS Index</th>
                                     <th className="p-2 font-bold min-w-[80px]">Array Index</th>
                                     <th className="p-2 font-bold text-right min-w-[80px]">DC V</th>
                                     <th className="p-2 font-bold text-right min-w-[80px]">DC A</th>
                                     <th className="p-2 font-bold text-right min-w-[80px]">AC V</th>
                                     <th className="p-2 font-bold text-right min-w-[80px]">AC A</th>
                                     <th className="p-2 font-bold text-right min-w-[80px]">Real P (kW)</th>
                                     <th className="p-2 font-bold text-right min-w-[80px]">Reactive (kVAR)</th>
                                     <th className="p-2 font-bold text-right min-w-[80px]">Freq (Hz)</th>
                                     <th className="p-2 font-bold min-w-[80px]">Rotation</th>
                                 </tr>
                             </thead>
                             <tbody className="divide-y divide-prizm-border">
                                 {pcsData.map((item: any, idx: number) => (
                                     <tr key={idx} className="hover:bg-prizm-surface transition-colors">
                                         <td className="p-2 text-prizm-primary font-bold">{item.pcsIndex !== undefined ? item.pcsIndex : (item.id || item.name || "--")}</td>
                                         <td className="p-2 text-prizm-text">{item.arrayIndex !== undefined ? item.arrayIndex : "--"}</td>
                                         <td className="p-2 text-right">{item.dcVoltage !== undefined ? item.dcVoltage.toFixed(1) : "--"}</td>
                                         <td className="p-2 text-right">{item.dcCurrent !== undefined ? item.dcCurrent.toFixed(1) : "--"}</td>
                                         <td className="p-2 text-right">{item.acVoltage !== undefined ? item.acVoltage.toFixed(1) : "--"}</td>
                                         <td className="p-2 text-right">{item.acCurrent !== undefined ? item.acCurrent.toFixed(1) : "--"}</td>
                                         <td className="p-2 text-right text-prizm-text font-bold">{item.acRealPowerKw !== undefined ? item.acRealPowerKw.toFixed(1) : "--"}</td>
                                         <td className="p-2 text-right">{item.acReactivePowerKvar !== undefined ? item.acReactivePowerKvar.toFixed(1) : "--"}</td>
                                         <td className="p-2 text-right text-prizm-text-muted">{item.frequencyHz !== undefined ? item.frequencyHz.toFixed(2) : "--"}</td>
                                         <td className="p-2 text-prizm-text-muted">{item.rotation || "--"}</td>
                                     </tr>
                                 ))}
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
                         <thead className="bg-black/40 text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border">
                             <tr>
                                 <th className="p-2 font-bold">Enclosure / Location</th>
                                 <th className="p-2 font-bold">Sensor ID</th>
                                 <th className="p-2 font-bold">Source IP/Device</th>
                                 <th className="p-2 font-bold">Temperature</th>
                                 <th className="p-2 font-bold">Humidity</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-prizm-border">
                             {htsData.map((item: any, idx: number) => (
                                     <tr key={idx} className="hover:bg-prizm-surface transition-colors">
                                         <td className="p-2 text-prizm-primary font-bold">{item.enclosureLabel || "--"}</td>
                                         <td className="p-2 text-prizm-text">{item.sensorId || "--"}</td>
                                         <td className="p-2 text-prizm-text-muted">{item.sourceIp || item.deviceName || "--"}</td>
                                         <td className="p-2 text-cyan-400 font-bold">{item.temperatureC !== undefined && item.temperatureC !== null ? `${Number(item.temperatureC).toFixed(1)}°C` : "--"}</td>
                                         <td className="p-2 text-emerald-400 font-bold">{item.humidityPct !== undefined && item.humidityPct !== null ? `${Number(item.humidityPct).toFixed(1)}%` : "--"}</td>
                                     </tr>
                                 ))}
                         </tbody>
                     </table>
                 ) : (
                     <div className="p-4 text-[10px] font-mono uppercase text-prizm-text-muted">No HTS data discovered</div>
                 )}
            </CollapsibleSection>

            {/* Array Summary */}
            <CollapsibleSection title="Array Summary" icon={PanelTop} defaultExpanded={true}>
                 {arraySummaryData.length > 0 ? (
                     <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                         <thead className="bg-black/40 text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border">
                             <tr>
                                 <th className="p-2 font-bold">Array</th>
                                 <th className="p-2 font-bold text-center">Comm.</th>
                                 <th className="p-2 font-bold text-center">Online SOC</th>
                                 <th className="p-2 font-bold text-center">Nearline SOC</th>
                                 <th className="p-2 font-bold text-center">Offline SOC</th>
                                 <th className="p-2 font-bold text-center">Nearline kWh</th>
                                 <th className="p-2 font-bold text-center">Available kW AC (Chg / Dis)</th>
                                 <th className="p-2 font-bold text-center">Commanded kW AC</th>
                                 <th className="p-2 font-bold text-center">Measured kW AC</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-prizm-border">
                             {arraySummaryData.map((arr: any, idx: number) => {
                                 const name = arr.friendlyString || `Array ${arr.arrayNumber || arr.arrayIndex || idx+1}`;
                                 return (
                                 <tr key={idx} className="hover:bg-prizm-surface transition-colors cursor-pointer" onClick={() => navigate("arrays-strings")}>
                                     <td className="p-2 text-prizm-primary font-bold">{name}</td>
                                     <td className="p-2 text-center text-emerald-400">{arr.communicating !== false ? 'OK' : <XOctagon size={12} className="inline text-prizm-danger" />}</td>
                                     <td className="p-2 text-center text-prizm-text">{arr.onlineSOC !== undefined ? `${(arr.onlineSOC < 1 ? arr.onlineSOC * 100 : arr.onlineSOC).toFixed(1).replace(/\.0$/, '')} %` : '--'}</td>
                                     <td className="p-2 text-center text-emerald-300">{arr.nearlineSOC !== undefined ? `${(arr.nearlineSOC < 1 ? arr.nearlineSOC * 100 : arr.nearlineSOC).toFixed(1).replace(/\.0$/, '')} %` : '--'}</td>
                                     <td className="p-2 text-center text-prizm-text-muted">{arr.offlineSOC !== undefined ? `${(arr.offlineSOC < 1 ? arr.offlineSOC * 100 : arr.offlineSOC).toFixed(1).replace(/\.0$/, '')} %` : '--'}</td>
                                     <td className="p-2 text-center text-prizm-text-muted">{arr.nearlineAvailableKWh !== undefined ? arr.nearlineAvailableKWh : '--'} kWh</td>
                                     <td className="p-2 text-center text-prizm-text">{arr.availableACChargekW !== undefined ? `${arr.availableACChargekW} / ${arr.availableACDischargekW}` : '--'}</td>
                                     <td className="p-2 text-center text-prizm-warning">{arr.commandedkW !== undefined ? arr.commandedkW : '--'}</td>
                                     <td className="p-2 text-center text-prizm-text">{arr.measuredkW !== undefined ? arr.measuredkW : '--'}</td>
                                 </tr>
                             )})}
                         </tbody>
                     </table>
                 ) : (
                     <div className="p-4 text-[10px] font-mono uppercase text-prizm-text-muted">No Array Summary available</div>
                 )}
            </CollapsibleSection>

            {/* String Summary */}
            <CollapsibleSection title="String Summary" icon={Rows4} defaultExpanded={false}>
                 {state.stringsDashboard?.strings?.length > 0 ? (
                     <div className="overflow-x-auto w-full">
                         <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                             <thead className="bg-black/40 text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border sticky top-0">
                                 <tr>
                                     <th className="p-2 font-bold min-w-[200px]">Parameter</th>
                                     <th className="p-2 font-bold text-center border-l border-prizm-border text-emerald-400">Online</th>
                                     <th className="p-2 font-bold text-center border-l border-prizm-border text-emerald-300">Nearline</th>
                                     <th className="p-2 font-bold text-center border-l border-prizm-border text-prizm-text-muted">Offline</th>
                                     <th className="p-2 font-bold text-center border-l border-prizm-border text-prizm-danger">Not Comm</th>
                                 </tr>
                             </thead>
                             <tbody className="divide-y divide-prizm-border">
                                 {[
                                     { label: "Strings", key: "count" },
                                     { label: "SOC (kWh)", key: "socKwH" },
                                     { label: "Max Current (A)", key: "maxCurrent", suffix: " A" },
                                     { label: "Min Current (A)", key: "minCurrent", suffix: " A" },
                                     { label: "Max Cell Voltage (mV)", key: "maxCellV", suffix: " mV" },
                                     { label: "Average Cell Voltage (mV)", key: "avgCellV", suffix: " mV" },
                                     { label: "Min Cell Voltage (mV)", key: "minCellV", suffix: " mV" },
                                     { label: "Max Cell Voltage Delta (mV)", key: "maxCellVDelta", suffix: " mV" },
                                     { label: "High Cell Temp (°C)", key: "maxCellTemp", suffix: " °C" },
                                     { label: "Average Cell Temp (°C)", key: "avgCellTemp", suffix: " °C" },
                                     { label: "Low Cell Temp (°C)", key: "minCellTemp", suffix: " °C" },
                                     { label: "Max Cell Temp Delta (°C)", key: "maxCellTempDelta", suffix: " °C" }
                                 ].map((row, idx) => (
                                     <tr key={idx} className="hover:bg-prizm-surface transition-colors">
                                         <td className="p-2 text-prizm-text uppercase">{row.label}</td>
                                         <td className="p-2 text-center text-prizm-text-muted border-l border-prizm-border">
                                             {onlineStats && onlineStats[row.key] !== null && onlineStats[row.key] !== undefined ? `${onlineStats[row.key]}${row.suffix || ''}` : '--'}
                                         </td>
                                         <td className="p-2 text-center text-prizm-text-muted border-l border-prizm-border">
                                             {nearlineStats && nearlineStats[row.key] !== null && nearlineStats[row.key] !== undefined ? `${nearlineStats[row.key]}${row.suffix || ''}` : '--'}
                                         </td>
                                         <td className="p-2 text-center text-prizm-text-muted border-l border-prizm-border">
                                             {offlineStats && offlineStats[row.key] !== null && offlineStats[row.key] !== undefined ? `${offlineStats[row.key]}${row.suffix || ''}` : '--'}
                                         </td>
                                         <td className="p-2 text-center text-prizm-text-muted border-l border-prizm-border">
                                             {notCommStats && notCommStats[row.key] !== null && notCommStats[row.key] !== undefined ? `${notCommStats[row.key]}${row.suffix || ''}` : '--'}
                                         </td>
                                     </tr>
                                 ))}
                             </tbody>
                         </table>
                     </div>
                 ) : (
                     <div className="p-4 text-[10px] font-mono uppercase text-prizm-text-muted">No String Summary available</div>
                 )}
            </CollapsibleSection>

            {/* Active Issues */}
            <CollapsibleSection title="Active Issues" icon={TriangleAlert} defaultExpanded={true}>
                <div className="max-h-[300px] overflow-y-auto no-scrollbar">
                    {activeIssues.length > 0 ? (
                        <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                            <thead className="bg-black/40 text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border">
                                <tr>
                                    <th className="p-2 font-bold w-1/4">Level</th>
                                    <th className="p-2 font-bold w-1/4">Source</th>
                                    <th className="p-2 font-bold w-1/2">Message</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-prizm-border">
                                {activeIssues.map((issue, i) => (
                                    <tr key={i} className="hover:bg-prizm-surface transition-colors">
                                        <td className="p-2">
                                            <span className={`px-2 py-[2px] rounded font-bold ${issue.severity === 'ALARM' ? 'bg-prizm-danger/10 text-prizm-danger' : issue.severity === 'WARNING' ? 'bg-prizm-warning/10 text-prizm-warning' : 'bg-slate-500/10 text-slate-400'}`}>
                                                {issue.severity}
                                            </span>
                                        </td>
                                        <td className="p-2 text-prizm-primary font-bold">{issue.source}</td>
                                        <td className="p-2 text-prizm-text">{issue.message}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="p-4 text-[10px] text-prizm-text-muted uppercase font-mono">No active issues detected.</div>
                    )}
                </div>
            </CollapsibleSection>

                <CollapsibleSection title="Feather / HVAC Health" icon={Wind} defaultExpanded={false}>
                    {!sum?.featherSummary ? (
                         <div className="p-4 text-[10px] font-mono uppercase text-prizm-text-muted border-b border-prizm-border">Feather API Unavailable</div>
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
                                <thead className="bg-black/40 text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border">
                                    <tr>
                                        <th className="p-2 font-bold">Entity</th>
                                        <th className="p-2 font-bold min-w-[200px]">Status Message</th>
                                        <th className="p-2 font-bold text-center">Enabled</th>
                                        <th className="p-2 font-bold text-center">Source</th>
                                        <th className="p-2 font-bold text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-prizm-border">
                                    {clearableFaults.map((f: any, idx: number) => (
                                         <tr key={idx} className="hover:bg-prizm-surface transition-colors">
                                             <td className="p-2 font-bold text-prizm-primary">{f.displayKey || f.entityKey}</td>
                                             <td className="p-2 text-prizm-text whitespace-pre-wrap max-w-sm">{f.statusMessageText || f.statusMessage}</td>
                                             <td className="p-2 text-center text-prizm-text-muted">{f.enabled ? 'Yes' : 'No'}</td>
                                             <td className="p-2 text-center text-prizm-text-muted uppercase">{f.source}</td>
                                             <td className="p-2 text-center">
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
                                <thead className="bg-black/40 text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border">
                                    <tr>
                                        <th className="p-2 font-bold w-1/4">Source</th>
                                        <th className="p-2 font-bold w-1/4">Module</th>
                                        <th className="p-2 font-bold w-1/2">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-prizm-border">
                                    {combinedSources.map((src, i) => (
                                        <tr key={i} className="hover:bg-prizm-surface transition-colors">
                                            <td className="p-2 font-bold text-prizm-text">{src.name}</td>
                                            <td className="p-2 text-prizm-text-muted">{src.type}</td>
                                            <td className="p-2">
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
                            <thead className="bg-black/40 text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border">
                                <tr>
                                    <th className="p-2 font-bold">Timestamp</th>
                                    <th className="p-2 font-bold">Severity</th>
                                    <th className="p-2 font-bold">Source</th>
                                    <th className="p-2 font-bold">Message</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-prizm-border">
                                {state.historyEvents.events.map((e: any, i: number) => (
                                    <tr key={i} className="hover:bg-prizm-surface transition-colors">
                                        <td className="p-2 text-prizm-text-muted">{formatPrizmUtcTimestamp(e.timestamp)}</td>
                                        <td className="p-2">
                                            <span className={`px-2 py-[2px] rounded font-bold ${e.severity === 'ALARM' ? 'bg-prizm-danger/10 text-prizm-danger' : e.severity === 'WARNING' ? 'bg-prizm-warning/10 text-prizm-warning' : 'bg-slate-500/10 text-slate-400'}`}>
                                                {e.severity}
                                            </span>
                                        </td>
                                        <td className="p-2 font-bold text-prizm-text">{e.source}</td>
                                        <td className="p-2 text-prizm-text whitespace-normal min-w-[200px]">{e.message}</td>
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
                                        className="w-full bg-black/40 border border-prizm-border rounded p-2 text-prizm-text font-mono focus:border-prizm-primary outline-none focus:ring-1 focus:ring-prizm-primary"
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
            
        </div>
    );
}
