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
  Shield,
  CheckCircle2,
  XCircle
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
      // Silently ignore network fetch errors
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
        setStatusMsg("Retry complete.");
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
    setStatusMsg("Bootstrapping cache namespaces...");
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

  // Header Data Extraction
  const hasActiveProfile = !!connectionStatus?.activeProfileName;
  const activeProfileName = hasActiveProfile ? connectionStatus.activeProfileName : "No Active Profile";
  const stationCode = hasActiveProfile ? connectionStatus?.stationCode : "-";
  const blockIndex = hasActiveProfile ? connectionStatus?.blockIndex : "-";
  const emsBaseUrl = hasActiveProfile ? connectionStatus?.activeEmsBaseUrl : "-";
  const modbusHost = hasActiveProfile ? connectionStatus?.modbusHost : "-";
  const modbusPort = hasActiveProfile ? connectionStatus?.modbusPort : "-";
  const isReachable = !!connectionStatus?.reachable;
  const lastPollTime = connectionStatus?.lastUpdated ? formatPrizmUtcTimestamp(connectionStatus.lastUpdated) : "Never";

  // Topology data
  const topologyFamily = bootStatus?.preloadStatus?.topologyFamily || "stack750_800";
  const hasTopology = bootStatus?.preloadStatus?.topology === true;

  return (
    <div className="space-y-6 animate-fade-in w-full pb-8 text-slate-800 font-sans">
      
      {/* SITE CONFIG HEADER */}
      <header className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-6">
          <div className="space-y-2 max-w-sm">
            <div className="flex items-center gap-2">
              <Server className="text-emerald-600" size={18} />
              <h2 className="text-sm font-bold uppercase tracking-wider">Site Configuration</h2>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Consolidated command panel. View active profiles, modify topology layouts, clear caches, and monitor connections.
            </p>
            {!hasActiveProfile && (
              <div className="mt-2 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-3 py-2 rounded">
                Create or activate a profile in Topology.
              </div>
            )}
          </div>

          {/* Compact Status Card Layout */}
          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded border border-slate-200 text-xs">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold mb-1">Active Connection</span>
              <span className="font-bold truncate block">{activeProfileName}</span>
              {hasActiveProfile && <span className="text-slate-500 text-[10px] block mt-0.5">{stationCode} [B{blockIndex}]</span>}
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold mb-1">Active Topology</span>
              {hasTopology ? (
                <span className="font-bold text-emerald-600 block">{topologyFamily}</span>
              ) : (
                <span className="font-bold text-slate-400 block">Not Configured</span>
              )}
            </div>
            <div className="col-span-2">
              <span className="text-slate-500 block text-[10px] uppercase font-bold mb-1">EMS / Turtle Connection</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-slate-700 truncate max-w-[200px]" title={emsBaseUrl}>{emsBaseUrl}</span>
                {hasActiveProfile && (
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ${isReachable ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {isReachable ? "Connected" : "Failed"}
                  </span>
                )}
              </div>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold mb-1">Modbus Target</span>
              <span className="font-mono text-slate-700">{hasActiveProfile ? `${modbusHost}:${modbusPort}` : "-"}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold mb-1">Cache Policy</span>
              <span className="font-bold uppercase text-slate-700">{cachePolicy || "Unknown"}</span>
            </div>
            <div className="col-span-2">
              <span className="text-slate-500 block text-[10px] uppercase font-bold mb-1">Last Validated Poll</span>
              <span className="text-slate-700 font-medium">{isReachable ? lastPollTime : "Never"}</span>
            </div>
          </div>
        </div>

        {/* SUB NAVIGATION FOR SITE CONFIGURATION */}
        <div className="mt-6 border-b border-slate-200 flex items-center justify-start overflow-x-auto no-scrollbar">
          {([
            { id: "connection", label: "Connection Profile", icon: Settings },
            { id: "topology", label: "Topology", icon: Network },
            { id: "data-sources", label: "Data Sources", icon: Wifi },
            { id: "cache", label: "Cache", icon: Database },
            { id: "diagnostics", label: "Diagnostics", icon: Activity },
            { id: "advanced", label: "Advanced", icon: ShieldAlert },
            { id: "ui-preferences", label: "UI Preferences", icon: Layers }
          ] as const).map(tab => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap border-b-2 ${
                  isActive
                    ? "border-emerald-500 text-emerald-700 bg-emerald-50/50"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                }`}
              >
                <Icon size={14} className={isActive ? "text-emerald-600" : "text-slate-400"} />
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
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-wrap gap-4 items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Network className="text-emerald-600" size={16} />
                <span className="font-bold text-slate-800 uppercase tracking-wider">Topology Model Reference</span>
              </div>
              <div className="flex flex-wrap gap-6 items-center text-slate-600">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Active Profile</span>
                  <span className="font-bold">{activeProfileName}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Layout Family</span>
                  <span className="font-bold">{topologyFamily}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Last Validation</span>
                  <span className={isReachable ? "font-bold text-emerald-600" : "font-bold text-amber-600"}>
                    {isReachable ? "Passed" : "Warning"}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Direct IP Targets</span>
                  <span className="font-bold">{topologyFamily === 'stack750_800' ? "Required" : "Not Applicable"}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Turtle Health</span>
                  <span className={isReachable ? "font-bold text-emerald-600" : "font-bold text-amber-600"}>
                    {isReachable ? "Online" : "Unknown"}
                  </span>
                </div>
              </div>
            </div>
            <div className="w-full">
              <ConnectionTopologyWorkflow />
            </div>
          </div>
        )}

        {activeSubTab === "data-sources" && (
          <div className="grid grid-cols-1 gap-6">
            <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-6">
              <h3 className="text-sm font-bold uppercase text-slate-800 border-b border-slate-200 pb-2">Direct IP Sources</h3>
              <div className="overflow-x-auto border border-slate-200 rounded">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-bold">
                      <th className="p-3">Source Name</th>
                      <th className="p-3">Source Type</th>
                      <th className="p-3">Requirement</th>
                      <th className="p-3">Last Status</th>
                      <th className="p-3">Data Used For</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-700">Stack 750/800 Feather direct reports</td>
                      <td className="p-3"><span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-[10px] font-bold uppercase">Direct IP</span></td>
                      <td className="p-3">
                        <span className={`font-bold ${topologyFamily === 'stack750_800' ? 'text-amber-600' : 'text-slate-400'}`}>
                          {topologyFamily === 'stack750_800' ? 'Required' : 'Not Applicable'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`font-bold uppercase ${topologyFamily === 'stack750_800' ? (isReachable ? 'text-emerald-600' : 'text-red-600') : 'text-slate-400'}`}>
                          {topologyFamily === 'stack750_800' ? (isReachable ? 'Found' : 'Missing') : 'Not Applicable'}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500">HVAC, Fans, Contactors for 750/800 systems</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-sm font-bold uppercase text-slate-800 border-b border-slate-200 pb-2 mt-6">EMS / Turtle Sources</h3>
              <div className="overflow-x-auto border border-slate-200 rounded">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-bold">
                      <th className="p-3">Source Endpoint</th>
                      <th className="p-3">Source Type</th>
                      <th className="p-3">Requirement</th>
                      <th className="p-3">Last Status</th>
                      <th className="p-3">Data Used For</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { path: "/status", type: "EMS Cache", req: "Required", used: "Global EMS State" },
                      { path: "/tools/report/ems/status.json", type: "Turtle Report", req: "Required", used: "Site Overview" },
                      { path: "/tools/monitor/ems/blockviewer/data", type: "EMS Cache", req: "Required", used: "Block Metrics" },
                      { path: "/tools/report/ems/strings.csv", type: "Turtle Report", req: "Required", used: "String Data" },
                      { path: "/tools/report/ems/ipMap.json", type: "Turtle Report", req: "Optional", used: "Legacy IP mapping" },
                      { path: "/tools/report/ems/array/{array}/report.json", type: "Turtle Report", req: "Required", used: "Array metrics" },
                      { path: "/tools/report/ems/array/{array}/pcs/{pcs}/report.json", type: "Turtle Report", req: "Required", used: "PCS Metrics" }
                    ].map((s, i) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="p-3 font-mono text-slate-700">{s.path}</td>
                        <td className="p-3"><span className="px-2 py-1 bg-cyan-50 text-cyan-700 rounded text-[10px] font-bold uppercase">{s.type}</span></td>
                        <td className="p-3 font-bold text-slate-600">{s.req}</td>
                        <td className="p-3">
                          <span className={`font-bold uppercase ${isReachable ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {isReachable ? 'Found' : 'Not Tested'}
                          </span>
                        </td>
                        <td className="p-3 text-slate-500">{s.used}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 className="text-sm font-bold uppercase text-slate-800 border-b border-slate-200 pb-2 mt-6">Imported / Metadata Sources</h3>
              <div className="overflow-x-auto border border-slate-200 rounded">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-bold">
                      <th className="p-3">Source Name</th>
                      <th className="p-3">Source Type</th>
                      <th className="p-3">Requirement</th>
                      <th className="p-3">Last Status</th>
                      <th className="p-3">Data Used For</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-700">Capacity Profile Model</td>
                      <td className="p-3"><span className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-[10px] font-bold uppercase">Imported Metadata</span></td>
                      <td className="p-3 font-bold text-slate-600">Required</td>
                      <td className="p-3"><span className="font-bold uppercase text-emerald-600">Found</span></td>
                      <td className="p-3 text-slate-500">Nominal metrics, string configuration, capacity</td>
                    </tr>
                    <tr className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-700">Custom Topology Layout Map</td>
                      <td className="p-3"><span className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-[10px] font-bold uppercase">Imported Metadata</span></td>
                      <td className="p-3 font-bold text-amber-600">Optional</td>
                      <td className="p-3"><span className="font-bold uppercase text-slate-400">Not Configured</span></td>
                      <td className="p-3 text-slate-500">Overriding standard IP layout mapping</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === "cache" && (
          <ConnectionSettings mode="cache" />
        )}

        {activeSubTab === "diagnostics" && (
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-sm font-bold uppercase text-slate-800 border-b border-slate-200 pb-2 mb-4">Troubleshooting & Diagnostics</h3>
            <div className="p-8 text-center text-slate-400">
              <Activity size={32} className="mx-auto mb-3 opacity-50" />
              <p className="text-xs uppercase font-bold tracking-wider mb-2">Endpoint Diagnostics Not Configured</p>
              <p className="text-xs">The endpoint runner requires an active backend test route.</p>
            </div>
          </div>
        )}

        {activeSubTab === "advanced" && (
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-6 animate-fade-in">
             <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                <ShieldAlert className="text-amber-500" size={18} />
                <span className="text-sm font-bold text-slate-800 uppercase tracking-wider">Safety & Advanced Configuration</span>
             </div>
             
             <div className="bg-amber-50 border border-amber-200 p-4 rounded text-sm text-amber-800">
                <strong className="block mb-1">Local Fallback / Mock Data</strong>
                <p className="text-xs">Local fallback is disabled in this environment. Data should be treated as live when connected.</p>
             </div>

             <div className="pt-4 flex flex-col md:flex-row md:items-center justify-between gap-4 border-t border-slate-200">
                <div>
                  <span className="text-sm font-bold text-slate-800 uppercase block tracking-wider">System Control Sequence Override</span>
                  <p className="text-xs text-slate-500 mt-1">
                    Forces hot reboot of internally managed drivers and pulls fresh device trees.
                  </p>
                </div>
                <div>
                  {reinitializedMsg && (
                    <span className="text-emerald-600 text-xs font-bold block mr-4 animate-fade-in mb-2 md:mb-0 uppercase">
                      ✔ {reinitializedMsg}
                    </span>
                  )}
                  <button
                    onClick={triggerReinitialize}
                    disabled={actionLoading === "reinitialize"}
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded uppercase text-xs tracking-wider cursor-pointer transition-colors shadow-sm disabled:opacity-50"
                  >
                    {actionLoading === "reinitialize" ? "Reinitializing..." : "Reinitialize System"}
                  </button>
                </div>
              </div>
          </div>
        )}

        {activeSubTab === "ui-preferences" && (
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4 max-w-2xl animate-fade-in">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
              <Layers className="text-emerald-600" size={18} />
              <span className="text-sm font-bold text-slate-800 uppercase tracking-wider">UI Preferences</span>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Customize active workspace tabs. Reorder layout or toggle visibility filters. Changes write persistently to client-local storage.
            </p>

            <div className="space-y-2 mt-4 max-w-md">
              {tabsOrder.map((tab, index) => {
                const master = MASTER_TABS_MAP[tab.id];
                if (!master) return null;
                const Icon = master.icon;

                return (
                  <div 
                    key={tab.id} 
                    className={`flex items-center justify-between p-3 rounded-lg border text-xs font-bold transition-all ${
                      tab.visible 
                        ? "bg-slate-50 border-slate-200" 
                        : "bg-slate-50/50 border-dashed border-slate-200 opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={16} className={tab.visible ? "text-emerald-600" : "text-slate-400"} />
                      <span className="text-slate-700 uppercase tracking-wider">
                        {master.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => toggleTabVisibility?.(tab.id)}
                        className={`p-1.5 rounded transition-all cursor-pointer ${
                          tab.visible 
                            ? "text-emerald-600 hover:bg-emerald-100" 
                            : "text-slate-400 hover:bg-slate-200"
                        }`}
                        title={tab.visible ? "Hide from Navigation bar" : "Show in Navigation bar"}
                      >
                        {tab.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>

                      <button
                        onClick={() => moveTab?.(index, "up")}
                        disabled={index === 0}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-800 hover:bg-slate-200 transition-all disabled:opacity-30 cursor-pointer"
                        title="Move Up"
                      >
                        <ArrowUp size={14} />
                      </button>

                      <button
                        onClick={() => moveTab?.(index, "down")}
                        disabled={index === tabsOrder.length - 1}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-800 hover:bg-slate-200 transition-all disabled:opacity-30 cursor-pointer"
                        title="Move Down"
                      >
                        <ArrowDown size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-6 mt-4 border-t border-slate-200 max-w-md">
              <button
                onClick={resetTabs}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md border border-slate-300 flex items-center gap-2 text-xs font-bold uppercase transition-all cursor-pointer"
              >
                <RotateCcw size={14} />
                Reset Defaults
              </button>
            </div>
          </div>
        )}
      </section>

    </div>
  );
}
