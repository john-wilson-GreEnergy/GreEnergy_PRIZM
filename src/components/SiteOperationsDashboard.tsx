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
                    fetch("/api/local/overview/discovery?fullTables=true").then(r => r.json()),
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

    // Determine Global Site Status
    const isStringsLiveOrCached = state.stringsDashboard && state.stringsDashboard.stringsReturned > 0;
    const isOverviewLiveOrCached = state.overviewDiscovery && Object.values(state.overviewDiscovery.sourceHealth || {}).some((s: any) => s.ok);
    
    // Partial: some source is missing or offline
    const isStringsOffline = !state.stringsDashboard || state.stringsDashboard.stringsReturned === 0;
    const isOverviewOffline = !state.overviewDiscovery || !Object.values(state.overviewDiscovery.sourceHealth || {}).some((s: any) => s.ok);

    let siteState = "OFFLINE";
    if (isStringsLiveOrCached && isOverviewLiveOrCached) siteState = "LIVE";
    else if (isStringsLiveOrCached || isOverviewLiveOrCached) siteState = "PARTIAL";

    // Extract Discovery Sections
    const discovery = state.overviewDiscovery?.discoveredSections || {};
    const emsAppsData = state.siteSummary?.dragonApps || discovery.emsApps?.sampleItems || [];
    const blockTopologyData = state.siteSummary?.topology || discovery.blockTopology?.sampleItems || [];
    const pcsData = discovery.pcs?.sampleItems || [];
    const hvacCentipedeData = discovery.hvacCentipede?.sampleItems || [];
    const htsData = discovery.humidityTemperatureSensors?.sampleItems || [];
    
    const arraySummaryData = state.siteSummary?.arrays || state.stringsDashboard?.arrays || [];

    const rollups = state.stringsDashboard?.rollups || {};
    
    // Determine Station Code
    let stationCode = state.overviewDiscovery?.stationCode || state.stringsDashboard?.stationCode || "UNKNOWN";
    if (stationCode === "UNKNOWN" || stationCode === "--") {
        const scadaApp = emsAppsData.find((a: any) => a.appName?.toUpperCase().includes("SCADA") || a.appCode === "SCADA");
        if (scadaApp && scadaApp.configName) {
            const match = scadaApp.configName.match(/-([A-Z0-9]{3,4})_/);
            if (match && match[1]) {
                stationCode = match[1];
            }
        }
    }
    
    const emsBaseUrl = state.overviewDiscovery?.emsBaseUrl || state.stringsDashboard?.emsBaseUrl || "--";
    const blockIndex = state.overviewDiscovery?.blockIndex !== undefined ? state.overviewDiscovery?.blockIndex : "--";
    const profileId = state.stringsDashboard?.profileId || "--";

    // Build timeline/issues
    const activeIssues = [];

    // Group String Issues
    const stringWarnMap: Record<string, number> = {};
    const stringAlarmMap: Record<string, number> = {};
    
    if (state.stringsDashboard?.strings?.length) {
        state.stringsDashboard.strings.forEach((s: any) => {
            if (s.warnings && Array.isArray(s.warnings)) {
                s.warnings.forEach((w: string) => {
                    stringWarnMap[w] = (stringWarnMap[w] || 0) + 1;
                });
            }
            if (s.alarms && Array.isArray(s.alarms)) {
                s.alarms.forEach((a: string) => {
                    stringAlarmMap[a] = (stringAlarmMap[a] || 0) + 1;
                });
            }
        });
    }

    Object.entries(stringAlarmMap).forEach(([msg, count]) => {
        activeIssues.push({ severity: "ALARM", source: "Strings Dashboard", message: `[${count} Strings] ${msg}` });
    });
    Object.entries(stringWarnMap).forEach(([msg, count]) => {
        activeIssues.push({ severity: "WARNING", source: "Strings Dashboard", message: `[${count} Strings] ${msg}` });
    });

    if (state.stringsDashboard?.arrays) {
        let genericAlarms = 0;
        let genericWarns = 0;
        state.stringsDashboard.arrays.forEach((a: any) => {
            genericAlarms += a.alarmCount || 0;
            genericWarns += a.warningCount || 0;
        });
        if (genericAlarms > 0 && Object.keys(stringAlarmMap).length === 0) {
           activeIssues.push({ severity: "ALARM", source: "Strings Dashboard", message: `${genericAlarms} string alarms reported` });
        }
        if (genericWarns > 0 && Object.keys(stringWarnMap).length === 0) {
           activeIssues.push({ severity: "WARNING", source: "Strings Dashboard", message: `${genericWarns} string warnings reported` });
        }
    }

    // Group EMS Apps Issues
    emsAppsData.forEach((app: any) => {
        if (app.status && app.status !== "OK" && app.status !== "ACTIVE" && app.status !== "ON") {
             activeIssues.push({ severity: "WARNING", source: "EMS App", message: `${app.appName || app.name || app.appCode || "App"} is ${app.status}` });
        }
        if (app.health && app.health !== "HEALTHY" && app.health !== "OK" && app.health !== "DISABLED") {
             activeIssues.push({ severity: "WARNING", source: "EMS App", message: `${app.appName || app.name || app.appCode || "App"} health is ${app.health}` });
        }
    });

    // Group Topology Issues
    blockTopologyData.forEach((t: any) => {
        if (t.connected === false) {
             activeIssues.push({ severity: "ALARM", source: "Topology", message: `${t.entityName || t.id || t.name} is Disconnected` });
        } else if (t.state && t.state !== "READY" && t.state !== "CONNECTED") {
             activeIssues.push({ severity: "WARNING", source: "Topology", message: `${t.entityName || t.id || t.name} is ${t.state}` });
        }
    });

    // Group Feather / HVAC Issues
    if (state.featherDevices?.devices) {
        let fssInvalidCount = 0;
        let doorsInvalidCount = 0;
        let hvacInvalidCount = 0;
        let totalLostComms = 0;

        state.featherDevices.devices.forEach((d: any) => {
            if (d.devicesWithLostComms?.length > 0) {
                totalLostComms += d.devicesWithLostComms.length;
            }
            if (d.fssValid === false) fssInvalidCount++;
            if (d.doorsValid === false) doorsInvalidCount++;
            if (d.hvacValid === false) hvacInvalidCount++;
        });

        if (totalLostComms > 0) activeIssues.push({ severity: "WARNING", source: "Feather / HVAC", message: `Lost Comms with ${totalLostComms} child devices` });
        if (fssInvalidCount > 0) activeIssues.push({ severity: "ALARM", source: "Feather / HVAC", message: `FSS Data Invalid on ${fssInvalidCount} Feather controllers` });
        if (doorsInvalidCount > 0) activeIssues.push({ severity: "ALARM", source: "Feather / HVAC", message: `Doors Data Invalid on ${doorsInvalidCount} Feather controllers` });
        if (hvacInvalidCount > 0) activeIssues.push({ severity: "WARNING", source: "Feather / HVAC", message: `HVAC Data Invalid on ${hvacInvalidCount} Feather controllers` });
    }

    if (state.safetyFaults?.eligible?.length > 0) {
        activeIssues.push({ severity: "ALARM", source: "Safety Fault Clear", message: `${state.safetyFaults.eligible.length} reset-eligible safety faults` });
    }

    if (isStringsOffline) activeIssues.push({ severity: "STALE", source: "Strings Dashboard", message: "Strings data offline or missing" });
    if (isOverviewOffline) activeIssues.push({ severity: "STALE", source: "Overview Discovery", message: "EMS Local API sources offline" });

    // Sort active issues ALARM -> WARNING -> STALE -> INFO
    activeIssues.sort((a, b) => {
        const severityRank: Record<string, number> = { "ALARM": 1, "WARNING": 2, "STALE": 3, "INFO": 4 };
        return (severityRank[a.severity] || 5) - (severityRank[b.severity] || 5);
    });

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
            <CollapsibleSection title="BESS Fleet Summary" icon={Battery} defaultExpanded={true}>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 sm:gap-px bg-prizm-border">
                   <div className="bg-prizm-surface-strong p-4">
                       <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">Total Strings</div>
                       <div className="text-xl font-bold text-prizm-text font-mono">{rollups.totalStrings !== undefined ? rollups.totalStrings : "--"}</div>
                   </div>
                   <div className="bg-prizm-surface p-4">
                       <div className="text-[10px] text-emerald-500 uppercase font-bold tracking-wider mb-1">Normal Strings</div>
                       <div className="text-xl font-bold text-emerald-400 font-mono">{rollups.normal !== undefined ? rollups.normal : "--"}</div>
                   </div>
                   <div className="bg-prizm-surface p-4">
                       <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">Offline Strings</div>
                       <div className="text-xl font-bold text-prizm-text-muted font-mono">{rollups.offline !== undefined ? rollups.offline : "--"}</div>
                   </div>
                   <div className="bg-prizm-surface p-4">
                       <div className="text-[10px] text-prizm-warning uppercase font-bold tracking-wider mb-1">Warn / Alm Strings</div>
                       <div className="text-xl font-bold text-prizm-warning font-mono">
                           {rollups.warnings !== undefined ? rollups.warnings : "--"} <span className="text-prizm-text-muted">/</span> <span className="text-prizm-danger">{rollups.alarms !== undefined ? rollups.alarms : "--"}</span>
                       </div>
                   </div>
                   <div className="bg-prizm-surface-strong p-4 border-t border-prizm-border sm:border-t-0">
                       <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">Avg Cell Volts</div>
                       <div className="text-xl font-bold text-prizm-text font-mono">{rollups.fleetAvgCellVoltage !== undefined && rollups.fleetAvgCellVoltage !== null ? `${rollups.fleetAvgCellVoltage.toFixed(3)} V` : "--"}</div>
                   </div>
                   <div className="bg-prizm-surface-strong p-4 border-t border-prizm-border sm:border-t-0">
                       <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">Max Cell V Delta</div>
                       <div className="text-xl font-bold text-prizm-text font-mono">{rollups.fleetMaxCellVoltageDelta !== undefined && rollups.fleetMaxCellVoltageDelta !== null ? `${rollups.fleetMaxCellVoltageDelta.toFixed(3)} V` : "--"}</div>
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
                                 <th className="p-2 font-bold text-center">Enabled</th>
                                 <th className="p-2 font-bold text-center">Health</th>
                                 <th className="p-2 font-bold">Status</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-prizm-border">
                             {emsAppsData.map((app: any, idx: number) => (
                                 <tr key={idx} className="hover:bg-prizm-surface transition-colors">
                                     <td className="p-2 text-center text-prizm-text-muted">{app.priority !== undefined ? app.priority : "--"}</td>
                                     <td className="p-2 text-prizm-text font-bold">{app.appCode || "--"}</td>
                                     <td className="p-2 text-prizm-primary">{app.appName || app.name || "--"}</td>
                                     <td className="p-2 text-prizm-text-muted text-xs">{app.configName || "--"} {app.configVersionId ? `(v${app.configVersionId})` : ""}</td>
                                     <td className="p-2 text-center">
                                         {app.enabled ? <span className="text-emerald-400">Yes</span> : <span className="text-prizm-text-muted">No</span>}
                                     </td>
                                     <td className="p-2 text-center">
                                         <span className={`px-2 py-[2px] rounded font-bold ${app.health === 'HEALTHY' || app.health === 'OK' ? 'bg-emerald-500/10 text-emerald-500' : app.health === 'DISABLED' ? 'bg-slate-500/10 text-slate-400' : 'bg-prizm-warning/10 text-prizm-warning'}`}>{app.health || app.status || "--"}</span>
                                     </td>
                                     <td className="p-2 text-prizm-text whitespace-pre-wrap leading-tight">{app.hasShortAppStatus && app.shortAppStatus ? app.shortAppStatus.replace(/<br\s*\/?>/gi, '\n') : (app.appStatus || "--").replace(/<br\s*\/?>/gi, '\n')}</td>
                                 </tr>
                             ))}
                         </tbody>
                     </table>
                 ) : (
                     <div className="p-4 text-[10px] font-mono uppercase text-prizm-text-muted">No EMS Apps data discovered</div>
                 )}
            </CollapsibleSection>

            {/* Block Topology */}
            <CollapsibleSection title="Block Topology Config" icon={Network} defaultExpanded={false}>
                 {blockTopologyData.length > 0 ? (
                     <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                         <thead className="bg-black/40 text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border">
                             <tr>
                                 <th className="p-2 font-bold text-center">Priority</th>
                                 <th className="p-2 font-bold text-center">Connected</th>
                                 <th className="p-2 font-bold">Entity Name</th>
                                 <th className="p-2 font-bold">Connection Profile</th>
                                 <th className="p-2 font-bold">State</th>
                                 <th className="p-2 font-bold">IP Address</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-prizm-border">
                             {blockTopologyData.map((item: any, idx: number) => (
                                 <tr key={idx} className="hover:bg-prizm-surface transition-colors">
                                     <td className="p-2 text-center text-prizm-text-muted">{item.priority !== undefined ? item.priority : "--"}</td>
                                     <td className="p-2 text-center text-prizm-primary font-bold">{item.connected === true ? <CheckCircle2 size={12} className="inline text-emerald-400" /> : item.connected === false ? <XOctagon size={12} className="inline text-prizm-danger" /> : "--"}</td>
                                     <td className="p-2 text-prizm-text font-bold">{item.entityName || item.id || item.name || "--"}</td>
                                     <td className="p-2 text-prizm-text-muted">{item.connectionProfile || "--"}</td>
                                     <td className="p-2">
                                        <span className={`px-2 py-[2px] rounded font-bold ${item.state === 'READY' || item.state === 'CONNECTED' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-400'}`}>{item.state || "--"}</span>
                                     </td>
                                     <td className="p-2 text-prizm-text-muted">{item.hostAddress || item.address || item.ip || "--"}</td>
                                 </tr>
                             ))}
                         </tbody>
                     </table>
                 ) : (
                     <div className="p-4 text-[10px] font-mono uppercase text-prizm-text-muted">No Block Topology data discovered</div>
                 )}
            </CollapsibleSection>

            {/* Connected Equipment */}
            <CollapsibleSection title="Equipment: Block Meters" icon={RadioTower} defaultExpanded={false}>
                 {discovery.blockMeters?.sampleItems?.length > 0 ? (
                     <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                         <thead className="bg-black/40 text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border">
                             <tr>
                                 <th className="p-2 font-bold">Meter ID</th>
                                 <th className="p-2 font-bold">kW</th>
                                 <th className="p-2 font-bold">Voltage</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-prizm-border">
                             {discovery.blockMeters.sampleItems.map((item: any, idx: number) => (
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
                     <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                         <thead className="bg-black/40 text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border">
                             <tr>
                                 <th className="p-2 font-bold">PCS ID</th>
                                 <th className="p-2 font-bold">State</th>
                                 <th className="p-2 font-bold">Power</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-prizm-border">
                             {pcsData.map((item: any, idx: number) => (
                                 <tr key={idx} className="hover:bg-prizm-surface transition-colors">
                                     <td className="p-2 text-prizm-primary font-bold">{item.id || item.name || "--"}</td>
                                     <td className="p-2">{item.state || "--"}</td>
                                     <td className="p-2 text-prizm-text-muted">{item.power !== undefined ? item.power : "--"}</td>
                                 </tr>
                             ))}
                         </tbody>
                     </table>
                 ) : (
                     <div className="p-4 text-[10px] font-mono uppercase text-prizm-text-muted">No PCS data discovered</div>
                 )}
            </CollapsibleSection>

            <CollapsibleSection title="Equipment: Centipede / PLC Block HVAC" icon={Wind} defaultExpanded={false}>
                 {hvacCentipedeData.length > 0 ? (
                     <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                         <thead className="bg-black/40 text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border">
                             <tr>
                                 <th className="p-2 font-bold">Unit ID</th>
                                 <th className="p-2 font-bold">Mode</th>
                                 <th className="p-2 font-bold">Temp Setpoint</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-prizm-border">
                             {hvacCentipedeData.map((item: any, idx: number) => (
                                 <tr key={idx} className="hover:bg-prizm-surface transition-colors">
                                     <td className="p-2 text-prizm-primary font-bold">{item.id || item.name || "--"}</td>
                                     <td className="p-2 text-prizm-text">{item.mode || "--"}</td>
                                     <td className="p-2 text-prizm-text-muted">{item.setpoint !== undefined ? item.setpoint : "--"}</td>
                                 </tr>
                             ))}
                         </tbody>
                     </table>
                 ) : (
                     <div className="p-4 text-[10px] font-mono uppercase text-prizm-text-muted">No HVAC data discovered</div>
                 )}
            </CollapsibleSection>

            <CollapsibleSection title="Equipment: Humidity & Temp Sensors" icon={Thermometer} defaultExpanded={false}>
                 {htsData.length > 0 ? (
                     <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                         <thead className="bg-black/40 text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border">
                             <tr>
                                 <th className="p-2 font-bold">Sensor ID</th>
                                 <th className="p-2 font-bold">Temperature</th>
                                 <th className="p-2 font-bold">Humidity</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-prizm-border">
                             {htsData.map((item: any, idx: number) => (
                                 <tr key={idx} className="hover:bg-prizm-surface transition-colors">
                                     <td className="p-2 text-prizm-text">{item.id || item.name || "--"}</td>
                                     <td className="p-2 text-prizm-text">{item.temperature !== undefined ? `${item.temperature} °C` : "--"}</td>
                                     <td className="p-2 text-prizm-text-muted">{item.humidity !== undefined ? `${item.humidity} %` : "--"}</td>
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
                                     <td className="p-2 text-center text-prizm-text">{arr.onlineSOC !== undefined ? `${arr.onlineSOC} %` : '--'}</td>
                                     <td className="p-2 text-center text-emerald-300">{arr.nearlineSOC !== undefined ? `${arr.nearlineSOC} %` : '--'}</td>
                                     <td className="p-2 text-center text-prizm-text-muted">{arr.offlineSOC !== undefined ? `${arr.offlineSOC} %` : '--'}</td>
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
                     <div className="flex flex-col">
                         <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-prizm-border mb-4">
                             <div className="bg-prizm-surface p-4 flex flex-col items-center justify-center">
                                 <div className="text-[10px] text-emerald-500 uppercase font-bold tracking-widest">Normal</div>
                                 <div className="text-2xl font-bold font-mono mt-1 text-emerald-400">{rollups.normal || 0}</div>
                             </div>
                             <div className="bg-prizm-surface p-4 flex flex-col items-center justify-center">
                                 <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-widest">Offline</div>
                                 <div className="text-2xl font-bold font-mono mt-1 text-prizm-text-muted">{rollups.offline || 0}</div>
                             </div>
                             <div className="bg-prizm-surface p-4 flex flex-col items-center justify-center">
                                 <div className="text-[10px] text-prizm-warning uppercase font-bold tracking-widest">Warnings</div>
                                 <div className="text-2xl font-bold font-mono mt-1 text-prizm-warning">{rollups.warnings || 0}</div>
                             </div>
                             <div className="bg-prizm-surface p-4 flex flex-col items-center justify-center">
                                 <div className="text-[10px] text-prizm-danger uppercase font-bold tracking-widest">Alarms</div>
                                 <div className="text-2xl font-bold font-mono mt-1 text-prizm-danger">{rollups.alarms || 0}</div>
                             </div>
                         </div>
                         <div className="overflow-x-auto max-h-[400px] overflow-y-auto no-scrollbar outline outline-1 outline-prizm-border">
                             <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                                 <thead className="bg-black/40 text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border sticky top-0">
                                 <tr>
                                     <th className="p-2 font-bold text-center">Str/Arr</th>
                                     <th className="p-2 font-bold text-center">Comm.</th>
                                     <th className="p-2 font-bold text-center">State</th>
                                     <th className="p-2 font-bold text-center">SOC</th>
                                     <th className="p-2 font-bold text-center">DC Bus V</th>
                                     <th className="p-2 font-bold text-center">kW</th>
                                     <th className="p-2 font-bold">Warnings</th>
                                     <th className="p-2 font-bold">Alarms</th>
                                 </tr>
                             </thead>
                             <tbody className="divide-y divide-prizm-border">
                                 {state.stringsDashboard.strings.map((str: any, idx: number) => (
                                     <tr key={idx} className="hover:bg-prizm-surface transition-colors cursor-pointer" onClick={() => navigate("arrays-strings")}>
                                         <td className="p-2 text-prizm-primary font-bold text-center">{str.id || `A${str.arrayNumber}-S${str.stringNumber}`}</td>
                                         <td className="p-2 text-center text-emerald-400">{str.contactorStatus === 'CLOSED' || str.operationalState !== 'OFFLINE' ? 'OK' : <XOctagon size={12} className="inline text-prizm-danger" />}</td>
                                         <td className="p-2 text-center">
                                            <span className={`px-2 py-[2px] rounded font-bold ${str.operationalState === 'NORMAL' ? 'bg-emerald-500/10 text-emerald-500' : str.operationalState === 'WARNING' ? 'bg-prizm-warning/10 text-prizm-warning' : str.operationalState === 'ALARM' ? 'bg-prizm-danger/10 text-prizm-danger' : 'bg-slate-500/10 text-slate-400'}`}>
                                                {str.operationalState || "--"}
                                            </span>
                                         </td>
                                         <td className="p-2 text-center text-prizm-text">{str.socPct !== undefined && str.socPct !== null ? `${str.socPct} %` : '--'}</td>
                                         <td className="p-2 text-center text-prizm-text-muted">{str.busVoltage !== null ? `${str.busVoltage} V` : '--'}</td>
                                         <td className="p-2 text-center text-prizm-text">{str.kw !== null ? str.kw : '--'}</td>
                                         <td className="p-2 text-prizm-warning">{str.warningCount > 0 ? `${str.warningCount} W` : '--'}</td>
                                         <td className="p-2 text-prizm-danger">{str.alarmCount > 0 ? `${str.alarmCount} A` : '--'}</td>
                                     </tr>
                                 ))}
                             </tbody>
                         </table>
                     </div>
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
                    <div className="bg-prizm-surface border-t border-prizm-border p-3 flex justify-end">
                       <button onClick={() => navigate("feather-hvac")} className="text-[10px] font-bold uppercase tracking-widest font-mono bg-prizm-primary/10 text-prizm-primary px-4 py-2 hover:bg-prizm-primary/20 transition-colors border border-prizm-primary/30 rounded">Open Feather/HVAC</button>
                    </div>
                </CollapsibleSection>

            {/* Safety & Source Health */}
            <CollapsibleSection title="Safety Fault Candidates" icon={ShieldAlert} defaultExpanded={false}>
                <div className="grid grid-cols-2 gap-px bg-prizm-border flex-1 h-full">
                        <div className="bg-prizm-surface p-4 flex flex-col justify-center items-center">
                            <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">Reset Eligible</div>
                            <div className={`text-2xl font-bold font-mono ${safetyEligible > 0 ? "text-prizm-danger animate-pulse" : "text-prizm-text"}`}>{safetyEligible}</div>
                        </div>
                        <div className="bg-prizm-surface p-4 flex flex-col justify-center items-center">
                            <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">Not Eligible</div>
                            <div className="text-xl font-bold text-prizm-text-muted font-mono">{safetyNotEligible}</div>
                        </div>
                    </div>
                    <div className="bg-prizm-surface border-t border-prizm-border p-3 flex justify-end">
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
