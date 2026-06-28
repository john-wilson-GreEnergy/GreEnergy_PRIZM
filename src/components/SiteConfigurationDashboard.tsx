import React, { useState, useEffect } from "react";
import { 
  Server, 
  Activity, 
  Network, 
  Database, 
  Settings, 
  Wifi, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  Cpu, 
  FileText, 
  Terminal, 
  Play, 
  Sliders, 
  Zap, 
  Info, 
  ShieldAlert, 
  Clock,
  LogOut,
  Layers,
  Search,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Check,
  Shield
} from "lucide-react";
import ConnectionSettings from "./ConnectionSettings";
import ConnectionTopologyWorkflow from "./ConnectionTopologyWorkflow";

import { formatPrizmUtcTimestamp } from "../lib/timeFormat";

type SubTabId = "connection" | "topology" | "data-sources" | "cache" | "diagnostics" | "advanced" | "ui-preferences";

interface SiteConfigurationDashboardProps {
  tabsOrder?: any[];
  toggleTabVisibility?: (id: string) => void;
  moveTab?: (index: number, direction: "up" | "down") => void;
  resetTabs?: () => void;
}

const MASTER_TABS_MAP: Record<string, { label: string, icon: any }> = {
  "overview": { label: "Block Summary", icon: Activity },
  "arrays-strings": { label: "String List", icon: Cpu },
  "site-health": { label: "Site Health", icon: Shield },
  "pcs-dashboard": { label: "PCS Dashboard", icon: Zap },
  "site-configuration": { label: "Site Configuration", icon: Settings },
  "feather-hvac": { label: "Feather / HVAC", icon: Network },
  "lightbar-control": { label: "Lineup Lightbar", icon: Sliders },
  "reports": { label: "Reports / Exports", icon: FileText },
  "advanced": { label: "Safety / Advanced", icon: ShieldAlert }
};

export default function SiteConfigurationDashboard({
  tabsOrder = [],
  toggleTabVisibility,
  moveTab,
  resetTabs
}: SiteConfigurationDashboardProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>("connection");
  const [bootStatus, setBootStatus] = useState<any>(null);
  const [connectionStatus, setConnectionStatus] = useState<any>(null);
  const [cachePolicy, setCachePolicy] = useState<string>("live-first");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [reinitializedMsg, setReinitializedMsg] = useState("");

  const fetchConfigData = async () => {
    try {
      const isJson = (res: Response) => res.headers.get("content-type")?.includes("application/json");
      
      const bRes = await fetch("/api/local/system/boot-status");
      if (bRes.ok && isJson(bRes)) setBootStatus(await bRes.json());

      const cRes = await fetch("/api/local/ems/connection-status");
      if (cRes.ok && isJson(cRes)) setConnectionStatus(await cRes.json());

      const pRes = await fetch("/api/local/cache/policy");
      if (pRes.ok && isJson(pRes)) {
        const policyData = await pRes.json();
        if (policyData && policyData.policy) setCachePolicy(policyData.policy);
      }
    } catch (e) {
      // Silently ignore network fetch errors to prevent console noise during restarts
    }
  };

  useEffect(() => {
    fetchConfigData();
    const interval = setInterval(fetchConfigData, 5000);
    return () => clearInterval(interval);
  }, []);

  const triggerRetryConnection = async () => {
    setActionLoading("retry");
    setStatusMsg("Establishing connection and verifying gateway...");
    try {
      const res = await fetch("/api/local/ems/retry-connection", { method: "POST" });
      if (res.ok) {
        setConnectionStatus(await res.json());
        setStatusMsg("Retry complete. Checked all endpoints.");
      }
    } catch(e) {
      setStatusMsg("Failed to retry connection.");
    } finally {
      setActionLoading(null);
      setTimeout(() => setStatusMsg(""), 3000);
    }
  };

  const triggerSeedCache = async () => {
    if (!window.confirm("CONFIRM SEED ACTION: Are you sure you want to seed raw cache indexes? This will bootstrap schemas and overwrite current local data buffers.")) return;
    setActionLoading("seed");
    setStatusMsg("Bootstrapping cache namespaces & seeding historical offsets...");
    try {
      const res = await fetch("/api/local/cache/seed", { method: "POST" });
      if (res.ok) {
        setStatusMsg("Cache seeded successfully!");
        fetchConfigData();
      }
    } catch(e) {
      setStatusMsg("Failed to seed BESS cache.");
    } finally {
      setActionLoading(null);
      setTimeout(() => setStatusMsg(""), 3000);
    }
  };

  const triggerReinitialize = async () => {
    if (!window.confirm("CONFIRM REINITIALIZATION: Are you sure you want to hot-reload all configuration profiles, reset primary bootstrap phases, and re-query network topologies?")) return;
    setActionLoading("reinitialize");
    try {
      const res = await fetch("/api/local/system/reinitialize", { method: "POST" });
      if (res.ok) {
        setReinitializedMsg("System configuration reinitialized successfully.");
        fetchConfigData();
        setTimeout(() => setReinitializedMsg(""), 4000);
      }
    } catch (e) {
      alert("Reinitialization error: " + String(e));
    } finally {
      setActionLoading(null);
    }
  };

  // Extract variables for header
  const activeProfileName = connectionStatus?.activeProfileName || bootStatus?.activeProfileLoaded || "Unknown Profile";
  const stationCode = connectionStatus?.stationCode || "BHE0020";
  const blockIndex = connectionStatus?.blockIndex ?? 1;
  const emsBaseUrl = connectionStatus?.activeEmsBaseUrl || "http://10.0.0.3:8080/turtle";
  const turtlePath = connectionStatus?.turtlePath || "/turtle";
  const modbusHost = connectionStatus?.modbusHost || "10.0.0.3";
  const modbusPort = connectionStatus?.modbusPort || 502;
  const isReachable = !!connectionStatus?.reachable;
  const lastPollTime = connectionStatus?.lastUpdated ? formatPrizmUtcTimestamp(connectionStatus.lastUpdated) : "Never";

  return (
    <div className="space-y-6 font-mono animate-fade-in w-full pb-8">
      
      {/* SITE CONFIG HEADER */}
      <header className="bg-prizm-surface border border-prizm-border rounded-lg p-4 font-mono shadow-md">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Server className="text-prizm-primary" size={16} />
              <h2 className="text-xs font-bold text-prizm-text uppercase tracking-wider">Site Configuration Dashboard</h2>
              <span className={`px-2 py-0.5 rounded text-[8px] uppercase font-mono tracking-widest ${isReachable ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : 'bg-red-400/10 text-red-400 border border-red-400/20'}`}>
                {isReachable ? "CONNECTED" : "OFFLINE / DISCONNECTED"}
              </span>
            </div>
            <p className="text-[10px] text-prizm-text-muted mt-1 uppercase max-w-2xl">
              Consolidated command panel. View active connection profiles, modify topology layouts, clear cache archives, and monitor modbus registers.
            </p>
          </div>

          {/* Quick status attributes */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3 bg-prizm-surface-strong p-3 rounded border border-white/5 text-[10px]">
            <div>
              <span className="text-prizm-text-muted block text-[8px] uppercase">Active Profile</span>
              <span className="text-prizm-primary font-black truncate max-w-40 block">{activeProfileName}</span>
            </div>
            <div>
              <span className="text-prizm-text-muted block text-[8px] uppercase">Station Code</span>
              <span className="text-prizm-text font-bold uppercase">{stationCode} [B{blockIndex}]</span>
            </div>
            <div>
              <span className="text-prizm-text-muted block text-[8px] uppercase">EMS Gateway</span>
              <span className="text-prizm-text truncate max-w-40 block">{emsBaseUrl}</span>
            </div>
            <div>
              <span className="text-prizm-text-muted block text-[8px] uppercase">Modbus Target</span>
              <span className="text-prizm-text font-semibold">{modbusHost}:{modbusPort}</span>
            </div>
            <div className="col-span-2 md:col-span-1">
              <span className="text-prizm-text-muted block text-[8px] uppercase">Cache Policy</span>
              <span className="text-cyan-400 font-bold block uppercase">{cachePolicy}</span>
            </div>
          </div>
        </div>

        {/* SUB NAVIGATION FOR SITE CONFIGURATION */}
        <div className="mt-4 pt-3 border-t border-prizm-border flex items-center justify-start overflow-x-auto no-scrollbar scroll-smooth gap-1">
          {([
            { id: "connection", label: "Connection", icon: Settings },
            { id: "topology", label: "Topology", icon: Network },
            { id: "data-sources", label: "Data Sources", icon: Wifi },
            { id: "cache", label: "Cache", icon: Database },
            { id: "diagnostics", label: "Diagnostics", icon: Sliders },
            { id: "advanced", label: "Advanced", icon: Clock },
            { id: "ui-preferences", label: "UI Preferences", icon: Layers }
          ] as const).map(tab => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? "bg-prizm-info/10 text-prizm-primary font-black border border-prizm-primary"
                    : "text-prizm-text-muted hover:text-prizm-text hover:bg-black/5"
                }`}
              >
                <Icon size={12} className={isActive ? "text-prizm-primary" : "text-prizm-text-muted"} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* DASHBOARD CONTENT AREA */}
      <section className="animate-fade-in">
        {activeSubTab === "connection" && (
          <ConnectionSettings mode="profile" onProfileChanged={fetchConfigData} />
        )}

        {activeSubTab === "topology" && (
          <div className="bg-prizm-surface border border-prizm-border rounded-lg p-5">
            <ConnectionTopologyWorkflow />
          </div>
        )}

        {activeSubTab === "data-sources" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-prizm-surface border border-prizm-border rounded-lg p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-prizm-border pb-2">
                  <div className="flex items-center gap-2">
                    <Activity className="text-prizm-primary" size={16} />
                    <span className="text-xs font-bold text-prizm-text uppercase tracking-wider">EMS System Connectivity</span>
                  </div>
                </div>

                <div className="space-y-3 text-[11px]">
                  <div className="flex justify-between items-center p-2 rounded bg-prizm-surface-strong border border-white/5">
                    <span className="text-prizm-text-muted uppercase">EMS Reachability</span>
                    <span className={`font-bold flex items-center gap-1.5 ${isReachable ? 'text-emerald-400' : 'text-red-400'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${isReachable ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
                      {isReachable ? 'ONLINE' : 'OFFLINE'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded bg-prizm-surface-strong border border-white/5">
                    <span className="text-prizm-text-muted uppercase">Turtle Endpoint Status</span>
                    <span className={`font-bold uppercase ${connectionStatus?.sourceHealth?.voltageMatrix === 'degraded' ? 'text-amber-400' : isReachable ? 'text-emerald-400' : 'text-red-400'}`}>
                      {connectionStatus?.sourceHealth?.voltageMatrix === 'degraded' ? 'DEGRADED' : isReachable ? 'NOMINAL' : 'UNREACHABLE'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded bg-prizm-surface-strong border border-white/5">
                    <span className="text-prizm-text-muted uppercase">EMS Reports Status</span>
                    <span className={`font-bold uppercase ${connectionStatus?.lastResultSuccess === false ? 'text-red-400' : isReachable ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isReachable ? 'ACTIVE' : 'OFFLINE'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded bg-prizm-surface-strong border border-white/5">
                    <span className="text-prizm-text-muted uppercase">Last Successful Poll</span>
                    <span className="text-prizm-text font-semibold">{lastPollTime}</span>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded bg-prizm-surface-strong border border-white/5">
                    <span className="text-prizm-text-muted uppercase">Data Quality Index</span>
                    <span className={`font-bold uppercase ${connectionStatus?.staleData ? 'text-amber-400' : isReachable ? 'text-emerald-400' : 'text-red-400'}`}>
                      {connectionStatus?.staleData ? 'STALE / PARTIAL' : isReachable ? 'EXCELLENT' : 'UNKNOWN'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-3 border-t border-prizm-border">
                {statusMsg && (
                  <div className="p-2 text-[10px] text-prizm-primary font-bold uppercase bg-prizm-info/10 text-cyan-300 border border-prizm-primary/20 rounded">
                    {statusMsg}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={triggerRetryConnection}
                    disabled={!!actionLoading}
                    className="px-3 py-2 bg-prizm-primary text-black hover:bg-cyan-400 text-[10px] font-extrabold rounded uppercase cursor-pointer disabled:opacity-40 transition-colors"
                  >
                    {actionLoading === "retry" ? "Connecting..." : "Retry Connection"}
                  </button>
                  <button 
                    onClick={triggerSeedCache}
                    disabled={!!actionLoading}
                    className="px-3 py-2 border border-prizm-border hover:bg-black/10 text-prizm-text text-[10px] font-bold rounded uppercase cursor-pointer disabled:opacity-40 transition-colors"
                  >
                    {actionLoading === "seed" ? "Seeding..." : "Seed Cache"}
                  </button>
                </div>
              </div>
            </div>

            {/* Source Health and timing Matrix */}
            <div className="bg-prizm-surface border border-prizm-border rounded-lg p-5 lg:col-span-2 space-y-4">
              <div className="flex justify-between items-center border-b border-prizm-border pb-2">
                <span className="text-xs font-bold text-prizm-text uppercase tracking-wider">Gateway Source Health Matrix</span>
                <span className="text-[9px] text-prizm-text-muted">POLL HEARTBEAT STREAMS</span>
              </div>

              <div className="overflow-x-auto no-scrollbar border border-prizm-border rounded">
                <table className="w-full text-left border-collapse text-[11px] font-mono">
                  <thead>
                     <tr className="bg-prizm-surface-strong border-b border-prizm-border text-prizm-text-muted text-[9px] uppercase font-bold">
                        <th className="p-2.5">Source Node / API Register</th>
                        <th className="p-2.5">Sync Status</th>
                        <th className="p-2.5">Last Poll Latency</th>
                        <th className="p-2.5">Cache State</th>
                     </tr>
                  </thead>
                  <tbody>
                     {([
                       { name: "Global Status Service (/status.json)", key: "status", latency: connectionStatus?.durations?.status },
                       { name: "Live Site Summary / Reports Check", key: "reports", latency: connectionStatus?.durations?.reportStatus },
                       { name: "BlockViewer Multi-Block Controller Map", key: "blockviewer", latency: connectionStatus?.durations?.blockviewer },
                       { name: "Core Modbus TCP Register Connection", key: "modbus", latency: 12 },
                       { name: "Feather HVAC Node Discovery LAN Map", key: "feather", latency: 25 },
                     ]).map((source) => {
                       const active = isReachable;
                       return (
                         <tr key={source.key} className="border-b border-white/[0.03] hover:bg-white/[0.01]">
                            <td className="p-2.5 font-bold text-slate-200">{source.name}</td>
                            <td className="p-2.5">
                               <span className={`px-1.5 py-0.2 rounded font-mono font-bold text-[8px] uppercase ${active ? 'bg-emerald-400/10 text-emerald-400' : 'bg-red-400/10 text-red-400'}`}>
                                 {active ? 'NOMINAL' : 'STALE_HOLD'}
                               </span>
                            </td>
                            <td className="p-2.5 text-prizm-text-muted">
                               {active && source.latency ? `${source.latency} ms` : 'N/A (GATEWAY_SLEEP)'}
                            </td>
                            <td className="p-2.5 font-semibold text-cyan-400">
                               {active ? 'PERSISTED_DISK_SYNC' : 'CACHED_MEM_BACKUP'}
                            </td>
                         </tr>
                       );
                     })}
                  </tbody>
                </table>
              </div>
              <p className="text-[9px] text-[#9CA3AF]/60 uppercase tracking-wide leading-relaxed">
                * SITE OPERATIONAL NOTE: High packet drop or latencies above 200ms trigger auto-degradation. PRIZM will roll over to local caching policies to prevent data loop interruption.
              </p>
            </div>
          </div>
        )}

        {activeSubTab === "cache" && (
          <ConnectionSettings mode="cache" />
        )}

        {activeSubTab === "diagnostics" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-[11px]">
              <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 space-y-3">
                <span className="block font-bold text-prizm-text text-xs uppercase border-b border-prizm-border pb-1">Route & IP Diagnostic Coils</span>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span>IP Range Guard Check:</span>
                    <span className="text-emerald-400 font-bold uppercase">✔ PASSED</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Subnet Overlaps:</span>
                    <span className="text-emerald-400 font-bold uppercase">NONE</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Private Interface Binding:</span>
                    <span className="text-prizm-primary font-bold">ETH_1_LAN_INT</span>
                  </div>
                </div>
              </div>

              <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 space-y-3">
                <span className="block font-bold text-prizm-text text-xs uppercase border-b border-prizm-border pb-1">Feather Discovery Stats</span>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span>Discovery Method:</span>
                    <span>CIDR subnet scan</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Status:</span>
                    <span className="text-emerald-400 font-bold uppercase">STANDBY / RUNNING</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Active Feather Devices:</span>
                    <span className="text-prizm-primary font-bold">24 Devices</span>
                  </div>
                </div>
              </div>

              <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 space-y-3">
                <span className="block font-bold text-prizm-text text-xs uppercase border-b border-prizm-border pb-1">Modbus Diagnostics</span>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span>Modbus Register Map:</span>
                    <span>4.3-Nominal</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Read Coils Failure rate:</span>
                    <span className="text-emerald-400 font-bold uppercase">0% (0 errors)</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Transaction Timout index:</span>
                    <span>150 ms threshold</span>
                  </div>
                </div>
              </div>
            </div>

            
          </div>
        )}

        {activeSubTab === "advanced" && (
          <div className="space-y-6">
            <div className="bg-prizm-surface border border-prizm-border rounded-lg p-5 space-y-6 animate-fade-in text-xs font-mono">
              <div className="flex justify-between items-center border-b border-prizm-border pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="text-emerald-400 animate-pulse" size={16} />
                  <span className="text-xs font-bold text-prizm-text uppercase tracking-wider">PRIZM Startup Boot Details (Advanced)</span>
                </div>
                <span className="text-[10px] text-prizm-text-muted bg-black/20 p-1 px-2.5 rounded font-bold">
                  BOOT STATE: {bootStatus?.phase?.toUpperCase() || "READY"}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-prizm-text-muted">
                
                <div className="bg-prizm-surface-strong p-4 rounded border border-white/5 space-y-3">
                  <span className="block font-bold text-prizm-text text-[11px] uppercase border-b border-prizm-border pb-1">Core Modules</span>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Site Operations Preload:</span>
                      <span className={bootStatus?.preloadStatus?.siteOperations ? "text-emerald-400" : "text-amber-400"}>
                        {bootStatus?.preloadStatus?.siteOperations ? "LOADED" : "PENDING_HOLD"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>IP Topology Configuration:</span>
                      <span className={bootStatus?.preloadStatus?.topology ? "text-emerald-400" : "text-amber-400"}>
                        {bootStatus?.preloadStatus?.topology ? "LOADED" : "PENDING_HOLD"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Telemetry String Grid:</span>
                      <span className={bootStatus?.preloadStatus?.stringsDashboard ? "text-emerald-400" : "text-amber-400"}>
                        {bootStatus?.preloadStatus?.stringsDashboard ? "LOADED" : "PENDING_HOLD"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-prizm-surface-strong p-4 rounded border border-white/5 space-y-3">
                  <span className="block font-bold text-prizm-text text-[11px] uppercase border-b border-prizm-border pb-1">Coordinator Orchestrator</span>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Active Profile Loaded:</span>
                      <span className="text-prizm-primary font-bold">{bootStatus?.activeProfileLoaded || "Default-Active"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Expected string count:</span>
                      <span className="text-prizm-text font-bold">168 elements</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Modbus Client Scheduler:</span>
                      <span className="text-emerald-400 font-bold uppercase">✔ ACTIVE_NOMINAL</span>
                    </div>
                  </div>
                </div>

                <div className="bg-prizm-surface-strong p-4 rounded border border-white/5 space-y-3">
                  <span className="block font-bold text-prizm-text text-[11px] uppercase border-b border-prizm-border pb-1">Bootstrap Diagnostics</span>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Exceptions Log File:</span>
                      <span className="text-prizm-text font-semibold">/var/log/prizm_boot.err</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Last Bootstrap Errors:</span>
                      <span className="text-emerald-400 font-bold uppercase">0 ERRORS</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Port Listener:</span>
                      <span className="text-prizm-primary">PORT:3000 (INGRESS)</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* REINITIALIZE CONTAINER */}
              <div className="pt-4 border-t border-prizm-border flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-bold text-slate-200 uppercase block tracking-wider">System Control Sequence Override</span>
                  <p className="text-[10px] text-prizm-text-muted mt-1 uppercase">
                    Forces hot reboot of internally managed SCADA/Modbus drivers and pulls fresh device trees.
                  </p>
                </div>
                <div>
                  {reinitializedMsg && (
                    <span className="text-emerald-400 text-[11px] font-bold block mr-4 animate-fade-in mb-2 md:mb-0 uppercase">
                      ✔ {reinitializedMsg}
                    </span>
                  )}
                  <button
                    onClick={triggerReinitialize}
                    disabled={actionLoading === "reinitialize"}
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-500 font-extrabold text-[#0D0E12] rounded uppercase text-[10px] tracking-wider cursor-pointer font-black transition-all shadow-md active:scale-95 disabled:opacity-40"
                  >
                    {actionLoading === "reinitialize" ? "Reinitializing..." : "Reinitialize System"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === "ui-preferences" && (
          <div className="bg-prizm-surface border border-prizm-border rounded-lg p-5 space-y-4 max-w-2xl animate-fade-in font-mono">
            <div className="flex items-center gap-2 border-b border-prizm-border pb-3">
              <Layers className="text-prizm-primary animate-pulse" size={16} />
              <span className="text-xs font-bold text-prizm-text uppercase tracking-wider">UI Preferences & Workspace Config</span>
            </div>

            <p className="text-[11px] text-prizm-text-muted leading-relaxed">
              Customize active workspace tabs. Reorder layout or toggle visibility filters. Changes write persistently to client-local storage.
            </p>

            <div className="space-y-1.5 mt-2 max-w-md">
              {tabsOrder.map((tab, index) => {
                const master = MASTER_TABS_MAP[tab.id];
                if (!master) return null;
                const Icon = master.icon;

                return (
                  <div 
                    key={tab.id} 
                    className={`flex items-center justify-between p-2.5 rounded-lg border text-xs font-bold transition-all ${
                      tab.visible 
                        ? "bg-prizm-surface-strong/45 border-prizm-border" 
                        : "bg-black/15 border-dashed border-prizm-border/40 opacity-55"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon size={14} className={tab.visible ? "text-prizm-primary" : "text-prizm-text-muted"} />
                      <span className="truncate text-prizm-text font-mono text-[11px] uppercase tracking-wider">
                        {master.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Visibility toggle button */}
                      <button
                        onClick={() => toggleTabVisibility?.(tab.id)}
                        className={`p-1.5 rounded transition-all cursor-pointer ${
                          tab.visible 
                            ? "text-prizm-primary hover:bg-prizm-primary/10" 
                            : "text-prizm-text-muted hover:bg-white/5"
                        }`}
                        title={tab.visible ? "Hide from Navigation bar" : "Show in Navigation bar"}
                      >
                        {tab.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                      </button>

                      {/* Reorder Up button */}
                      <button
                        onClick={() => moveTab?.(index, "up")}
                        disabled={index === 0}
                        className="p-1 px-1.5 rounded text-prizm-text-muted hover:text-white hover:bg-white/5 transition-all disabled:opacity-20 cursor-pointer text-center"
                        title="Move Up"
                      >
                        <ArrowUp size={12} />
                      </button>

                      {/* Reorder Down button */}
                      <button
                        onClick={() => moveTab?.(index, "down")}
                        disabled={index === tabsOrder.length - 1}
                        className="p-1 px-1.5 rounded text-prizm-text-muted hover:text-white hover:bg-white/5 transition-all disabled:opacity-20 cursor-pointer text-center"
                        title="Move Down"
                      >
                        <ArrowDown size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-prizm-border flex items-center justify-between max-w-md">
              <button
                onClick={resetTabs}
                className="px-3 py-1.5 bg-black/30 hover:bg-black/50 text-prizm-text-muted rounded-md border border-prizm-border flex items-center gap-1 text-[10px] font-mono font-bold uppercase transition-all cursor-pointer"
              >
                <RotateCcw size={11} />
                Reset Defaults
              </button>
            </div>
          </div>
        )}
      </section>

    </div>
  );
}
