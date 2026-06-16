import React, { useState, useEffect } from "react";
import SafetyFaultClearView from "./components/SafetyFaultClearView";
import { 
  Activity, 
  Cpu, 
  FileText, 
  ShieldAlert, 
  Zap, 
  RefreshCw, 
  Clock, 
  CheckCircle,
  Network,
  Terminal,
  Sliders,
  Settings,
  Lock,
  BarChart3,
  Shield,
  LayoutGrid,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  X,
  Check
} from "lucide-react";
// TODO: Implement route-level dynamic imports for code splitting.
import SiteOperationsDashboard from "./components/SiteOperationsDashboard";
import StringDashboard from "./components/StringDashboard";
import SiteDistributionDashboard from "./components/SiteDistributionDashboard";
import PcsDashboard from "./components/PcsDashboard";
import DevicesManager from "./components/DevicesManager";
import Reporting from "./components/Reporting";
import ToolDashboards from "./components/ToolDashboards";
import FeatherDashboard from "./components/FeatherDashboard";
import EmsHealthDashboard from "./components/EmsHealthDashboard";
import ConnectionSettings from "./components/ConnectionSettings";
import HvacSimulationDashboard from "./components/HvacSimulationDashboard";
import LineupLightbarControl from "./components/LineupLightbarControl";
import { GreEnergyLogo } from "./components/GreEnergyLogo";
import SiteConfigurationDashboard from "./components/SiteConfigurationDashboard";
import SafetyAdvancedDashboard from "./components/SafetyAdvancedDashboard";
import { BessDevice, BessLog, ReportConfig } from "./types";
import { formatPrizmUtcTimestamp } from "./lib/timeFormat";

type AppTabId = "overview" | "arrays-strings" | "site-health" | "pcs-dashboard" | "site-configuration" | "feather-hvac" | "lightbar-control" | "reports" | "advanced";

interface TabItem {
  id: string;
  visible: boolean;
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

const DEFAULT_TABS_ORDER: string[] = [
  "overview",
  "arrays-strings",
  "site-health",
  "pcs-dashboard",
  "site-configuration",
  "feather-hvac",
  "lightbar-control",
  "reports",
  "advanced"
];

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTabId>("overview");
  const [featherSub, setFeatherSub] = useState<"feather" | "simulation">("feather");
  const [loading, setLoading] = useState(true);
  const [diagnosticSession, setDiagnosticSession] = useState<any>(null);

  // Configured navbar tabs list setting
  const [tabsOrder, setTabsOrder] = useState<TabItem[]>(() => {
    const saved = localStorage.getItem("prizm_tabs_config_v2");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const keys = parsed.map(t => t.id);
          const merged = [...parsed];
          DEFAULT_TABS_ORDER.forEach(id => {
            if (!keys.includes(id)) {
              merged.push({ id, visible: true });
            }
          });
          return merged.filter(t => DEFAULT_TABS_ORDER.includes(t.id));
        }
      } catch (e) {
        console.error("Failed to parse navigation settings key:", e);
      }
    }
    return DEFAULT_TABS_ORDER.map(id => ({ id, visible: true }));
  });

  const [isConfigOpen, setIsConfigOpen] = useState(false);

  // Save configurations layout changes to secure local client storage
  useEffect(() => {
    localStorage.setItem("prizm_tabs_config_v2", JSON.stringify(tabsOrder));
  }, [tabsOrder]);

  // If the focus tab gets disabled or hidden, auto-select the next visible tab to preserve render viewport
  useEffect(() => {
    const currentTabItem = tabsOrder.find(t => t.id === activeTab);
    if (currentTabItem && !currentTabItem.visible) {
      const firstVisible = tabsOrder.find(t => t.visible);
      if (firstVisible) {
        setActiveTab(firstVisible.id as AppTabId);
      }
    }
  }, [tabsOrder, activeTab]);

  const moveTab = (index: number, direction: "up" | "down") => {
    const newIdx = direction === "up" ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= tabsOrder.length) return;
    const updated = [...tabsOrder];
    const temp = updated[index];
    updated[index] = updated[newIdx];
    updated[newIdx] = temp;
    setTabsOrder(updated);
  };

  const toggleTabVisibility = (id: string) => {
    const visibleCount = tabsOrder.filter(t => t.visible).length;
    const tabToToggle = tabsOrder.find(t => t.id === id);
    if (visibleCount <= 1 && tabToToggle?.visible) {
      return; // Safeguard navbar to have at least one active screen
    }
    setTabsOrder(prev => prev.map(t => t.id === id ? { ...t, visible: !t.visible } : t));
  };

  const resetTabs = () => {
    setTabsOrder(DEFAULT_TABS_ORDER.map(id => ({ id, visible: true })));
    setActiveTab("overview");
  };

  // Monitor EMS metadata
  const [emsMetadata, setEmsMetadata] = useState<any>(null);

  // Dynamic system clock matching timezone metadata
  const [currentTime, setCurrentTime] = useState(new Date("2026-05-29T14:19:25Z"));

  useEffect(() => {
    const handleNavigate = (e: any) => {
        if (e.detail) {
          const tab = e.detail;
          if (tab === "settings" || tab === "ems-health" || tab === "tool-dashboards") {
            setActiveTab("site-configuration");
          } else if (tab === "safety-fault" || tab === "advanced" || tab === "safety-advanced") {
            setActiveTab("advanced");
          } else if (tab === "site-distribution" || tab === "site-sensors" || tab === "site-health") {
            setActiveTab("site-health");
          } else {
            setActiveTab(tab);
          }
        }
    };
    window.addEventListener('navigate-tab', handleNavigate);
    return () => window.removeEventListener('navigate-tab', handleNavigate);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(prev => new Date(prev.getTime() + 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch full telemetry, reports & alerts
  const [connectionStatus, setConnectionStatus] = useState<any>(null);
  const [bootStatus, setBootStatus] = useState<any>(null);
  const [showConnectionConfig, setShowConnectionConfig] = useState(false);

  const fetchAllData = async (silent = false) => {
    if (!silent && !connectionStatus) setLoading(true);
    try {
      const bootRes = await fetch('/api/local/system/boot-status').catch(err => null);
      if (bootRes && bootRes.ok) {
          const bs = await bootRes.json();
          setBootStatus(bs);
          if (bs.phase !== "ready" && bs.phase !== "offline" && bs.phase !== "degraded") {
             // still booting, show loading overlay maybe?
          }
      }
      
      const modeRes = await fetch('/api/local/ems/connection-status').catch(err => null);

      if (modeRes && modeRes.ok) {
        const mode = await modeRes.json().catch(() => null);
        if (mode) {
           setEmsMetadata(mode);
           setConnectionStatus(mode);
           
           // If reachable, auto-close the modal if it was open
           if (mode.reachable && showConnectionConfig) {
               setShowConnectionConfig(false);
           }

           if (!silent && !mode.reachable && (!mode.cacheSeedState || (mode.cacheSeedState.completedKeys?.length === 0 && !mode.cacheSeedState.running))) {
               setShowConnectionConfig(true);
           }
        }
      }

      const diagRes = await fetch('/api/local/diagnostic-session/status').catch(err => null);
      if (diagRes && diagRes.ok) {
        const diag = await diagRes.json().catch(() => null);
        setDiagnosticSession(diag);
      }
    } catch (err) {
      console.log('[App Telemetry Info] Telemetry gateway offline standby:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Immediate fetch + active 3-seconds interval polling to synchronize state
  useEffect(() => {
    fetchAllData();
    const poll = setInterval(() => {
      fetchAllData(true);
    }, 3000);
    return () => clearInterval(poll);
  }, []);

  return (
    <div className="min-h-screen bg-prizm-bg text-prizm-text font-sans flex flex-col">
      
      {/* TOP NAVIGATION BAR (DAYLIGHT DESIGN THEME) */}
      <header className="h-14 border-b border-prizm-border flex items-center justify-between px-4 sm:px-6 bg-prizm-header sticky top-0 z-50 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <GreEnergyLogo className="w-6 h-6 text-prizm-primary" strokeWidth={10} />
            <span className="font-mono font-bold tracking-tighter text-prizm-text text-base sm:text-lg">
              <span className="text-prizm-primary">GreEnergy</span> PRIZM
            </span>
          </div>
          <div className="h-4 w-[1px] bg-prizm-border mx-1 sm:mx-2"></div>
          <div className="hidden md:flex items-center gap-6 text-[11px] font-mono uppercase tracking-widest text-prizm-text-muted cursor-default select-none">
            {connectionStatus?.status === 'LIVE' && <span className="text-emerald-400 font-bold flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>Connection Live</span>}
            {connectionStatus?.status === 'PARTIAL' && <span className="text-prizm-warning font-bold flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-prizm-warning"></span>Connection Partial</span>}
            {connectionStatus?.status === 'CACHED' && <span className="text-amber-500 font-bold flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>Using Last Snapshot</span>}
            {connectionStatus?.status === 'DEMO' && <span className="text-purple-400 font-bold flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse"></span>Demo Mode</span>}
            {(!connectionStatus || connectionStatus?.status === 'OFFLINE') && <span className="text-prizm-danger font-bold flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-prizm-danger"></span>Offline</span>}
            {connectionStatus?.status === 'MISCONFIGURED' && <span className="text-prizm-danger font-bold flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-prizm-danger"></span>Offline (Misconfigured)</span>}
            
            <span title={emsMetadata?.activeEmsBaseUrl || "No site linked"} className="truncate max-w-[200px]">NODE: {
                (connectionStatus?.status === 'LIVE' || connectionStatus?.status === 'PARTIAL') && emsMetadata?.activeEmsBaseUrl 
                    ? emsMetadata.activeEmsBaseUrl.replace(/^https?:\/\//, '') 
                    : (emsMetadata ? (emsMetadata.activeProfileName || "UNLINKED") : '...')
            }</span>
            
            <span>STATION: {connectionStatus?.discoveredStationCode || connectionStatus?.stationCode || 'Unknown'}</span>
            <span>BLOCK: {connectionStatus?.blockIndex || '1'}</span>
            {connectionStatus?.status === 'MISCONFIGURED' && <span className="ml-2 text-prizm-danger uppercase">| EMS Settings Required</span>}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {diagnosticSession && diagnosticSession.active && (
            <div className={`flex items-center gap-2 border ${diagnosticSession.paused ? 'border-amber-500/20 bg-amber-500/5 text-amber-500' : 'border-rose-500/20 bg-rose-500/5 text-rose-500'} px-2.5 py-1 rounded font-mono text-[10px] font-black uppercase tracking-wider`}>
              <span className={`h-1.5 w-1.5 rounded-full ${diagnosticSession.paused ? 'bg-amber-500' : 'bg-rose-500 animate-pulse'} shrink-0`}></span>
              <span>ds: {diagnosticSession.paused ? 'paused' : 'recording'}</span>
              <span className="text-emerald-400 font-bold hidden sm:inline px-1 border-l border-white/5 ml-1">● sync</span>
            </div>
          )}
          <div className="text-right">
            <div className="text-[11px] text-prizm-text-muted font-mono tracking-widest">
              {formatPrizmUtcTimestamp(currentTime)}
            </div>
          </div>
        </div>
      </header>

      {/* DASHBOARD CONTROL NAVIGATION TOOLBAR LINE */}
      {bootStatus?.warnings?.length > 0 && (
         <div className="bg-amber-900 border-b border-amber-500 text-amber-200 text-xs px-4 py-1.5 font-mono uppercase text-center font-bold tracking-widest shadow-inner shadow-amber-950/50">
            {bootStatus.warnings.join(' | ')}
         </div>
      )}
{bootStatus && (bootStatus.phase !== "ready" && bootStatus.phase !== "offline" && bootStatus.phase !== "idle") ? (
   <div className="h-screen flex items-center justify-center p-4 z-50 w-full">
      <div className="bg-prizm-surface-strong p-8 rounded border border-prizm-border max-w-lg w-full text-center">
         <h2 className="text-xl font-bold mb-4 font-mono">PRIZM BOOT SEQUENCE</h2>
         <div className="text-sm text-prizm-text-muted mb-2 font-mono">Connecting to EMS {bootStatus.activeEmsBaseUrl}...</div>
         <div className="text-xs bg-prizm-bg p-2 rounded mb-6 font-mono text-cyan-400 border border-white/5">{bootStatus.phase.toUpperCase()}</div>
         
         <div className="text-left space-y-2 font-mono text-xs mb-8">
            <div className="flex justify-between"><span>Site Operations:</span> <span className={bootStatus.preloadStatus.siteOperations ? "text-emerald-400" : "text-prizm-text-muted"}>{bootStatus.preloadStatus.siteOperations ? "READY" : "WAITING"}</span></div>
            <div className="flex justify-between"><span>Topology:</span> <span className={bootStatus.preloadStatus.topology ? "text-emerald-400" : "text-prizm-text-muted"}>{bootStatus.preloadStatus.topology ? "READY" : "WAITING"}</span></div>
            <div className="flex justify-between"><span>Strings:</span> <span className={bootStatus.preloadStatus.stringsDashboard ? "text-emerald-400" : "text-prizm-text-muted"}>{bootStatus.preloadStatus.stringsDashboard ? "READY" : "WAITING"}</span></div>
            <div className="flex justify-between"><span>Feather/HVAC:</span> <span className={bootStatus.preloadStatus.featherDevices ? "text-emerald-400" : "text-prizm-text-muted"}>{bootStatus.preloadStatus.featherDevices ? "READY" : "WAITING"}</span></div>
            <div className="flex justify-between"><span>Modbus Setup:</span> <span className={bootStatus.preloadStatus.modbusProfile ? "text-emerald-400" : "text-prizm-text-muted"}>{bootStatus.preloadStatus.modbusProfile ? "READY" : "WAITING"}</span></div>
         </div>
      </div>
   </div>
) : (
  <>
      <section className="bg-prizm-surface-strong border-b border-prizm-border z-40 sticky top-14 transition-all shrink-0">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between overflow-x-auto no-scrollbar scroll-smooth">
            
            {/* Tabs control styled beautifully */}
            <div className="flex items-center space-x-1 py-1 min-w-0 flex-shrink flex-wrap">
              {tabsOrder
                .filter(tab => tab.visible)
                .map(tab => {
                  const master = MASTER_TABS_MAP[tab.id];
                  if (!master) return null;
                  const Icon = master.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as AppTabId)}
                      className={`flex items-center gap-2 px-3 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest transition-all cursor-pointer ${
                        activeTab === tab.id
                          ? "bg-prizm-info/10 border-b-2 border-prizm-primary text-prizm-primary font-bold"
                          : "text-prizm-text-muted hover:text-prizm-text hover:bg-black/5"
                      }`}
                    >
                      <Icon size={12} className={activeTab === tab.id ? "text-prizm-primary" : "text-prizm-text-muted"} />
                      {master.label}
                    </button>
                  );
                })}

              <button
                onClick={() => setIsConfigOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest text-[#B2C6FF] border border-dashed border-[#B2C6FF]/20 rounded-md hover:bg-[#B2C6FF]/10 transition-all cursor-pointer select-none hover:border-[#B2C6FF]/50"
                title="Configure navbar tabs layout"
              >
                <LayoutGrid size={12} className="text-prizm-primary animate-pulse" />
                Configure
              </button>
            </div>

            {/* Quick inline online node counts indicator */}
            <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono text-prizm-text-muted">
              <span>SYNC HEARTBEAT:</span>
              <span className="text-prizm-primary font-bold flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 bg-prizm-primary rounded-full animate-ping"></span>
                POLLING ACTIVE
              </span>
            </div>

          </div>
        </div>
      </section>

      {/* CORE WORKSPACE CONSOLE WINDOW */}
      <main className="flex-1 p-4 sm:p-6 bg-prizm-bg w-full px-4 sm:px-6 lg:px-8">
        {loading ? (
          <div className="h-[400px] flex flex-col items-center justify-center space-y-4 border border-prizm-border bg-prizm-surface rounded-lg">
            <RefreshCw className="animate-spin text-prizm-primary" size={32} />
            <div className="text-center font-mono">
              <span className="text-xs text-prizm-text font-bold block">INITIALIZING PRIZM...</span>
              <p className="text-[11px] text-prizm-text-muted mt-1">Gathering site telemetry & preparing diagnostic view</p>
            </div>
          </div>
        ) : (
          <div className="animate-fade-in duration-300 h-full">
            {activeTab === "overview" && (
              <SiteOperationsDashboard setActiveTab={setActiveTab} />
            )}

            {activeTab === "arrays-strings" && (
              <StringDashboard />
            )}

            {activeTab === "site-health" && (
              <SiteDistributionDashboard />
            )}
            {activeTab === "pcs-dashboard" && (
              <PcsDashboard />
            )}

            {activeTab === "site-configuration" && (
              <SiteConfigurationDashboard />
            )}

            {activeTab === "feather-hvac" && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex border-b border-prizm-border font-mono text-[10px] uppercase font-bold tracking-widest bg-prizm-surface p-1 rounded-t-md space-x-1">
                  <button
                    onClick={() => setFeatherSub("feather")}
                    className={`px-4 py-2 border-b-2 transition-all cursor-pointer ${
                      featherSub === "feather"
                        ? "border-prizm-primary text-prizm-primary bg-prizm-info/5 font-extrabold"
                        : "border-transparent text-prizm-text-muted hover:text-white"
                    }`}
                  >
                    Feather Core Controls
                  </button>
                  <button
                    onClick={() => setFeatherSub("simulation")}
                    className={`px-4 py-2 border-b-2 transition-all cursor-pointer ${
                      featherSub === "simulation"
                        ? "border-prizm-primary text-prizm-primary bg-prizm-info/5 font-extrabold"
                        : "border-transparent text-prizm-text-muted hover:text-white"
                    }`}
                  >
                    HVAC Simulation & Validation
                  </button>
                </div>
                {featherSub === "feather" ? <FeatherDashboard /> : <HvacSimulationDashboard />}
              </div>
            )}

            {activeTab === "lightbar-control" && (
              <LineupLightbarControl />
            )}

            {activeTab === "reports" && (
              <Reporting 
                devices={[]}
                reports={[]}
                onAddReport={async () => {}}
                onDeleteReport={async () => {}}
                diagnosticSession={diagnosticSession}
                onRefreshDiagnostic={() => fetchAllData(true)}
              />
            )}

            {activeTab === "advanced" && (
              <SafetyAdvancedDashboard />
            )}
          </div>
        )}
      </main>

      {/* FOOTER STATUS LINE (DAYLIGHT THEME) */}
      <footer className="h-8 bg-prizm-surface-strong border-t border-prizm-border px-4 sm:px-6 flex items-center justify-between text-[9px] font-mono tracking-widest text-prizm-text-muted uppercase shrink-0">
        <div className="flex gap-4 sm:gap-8 items-center">
          <span className="text-prizm-primary font-bold">GreEnergy Prizm</span>
          
          <span className={`font-bold hidden sm:inline ${emsMetadata?.activeMode === 'offline' ? 'text-prizm-danger' : emsMetadata?.staleData ? 'text-prizm-warning' : 'text-prizm-info'}`}>
            ● {emsMetadata?.activeMode === 'offline' ? 'OFFLINE' : emsMetadata?.staleData ? 'STALE DATA' : 'SYSTEM NORMAL'}
          </span>
          <span className="hidden md:inline truncate max-w-[150px]">
            LINK: {emsMetadata ? (emsMetadata.activeEmsBaseUrl || 'LOCAL LAN') : 'CHECKING'}
          </span>
          <span className="hidden lg:inline text-prizm-text-muted">
            {emsMetadata?.lastUpdated ? `LAST UPDATED: ${formatPrizmUtcTimestamp(emsMetadata.lastUpdated)}` : 'POLLING PENDING...'}
          </span>
        </div>
        <div className="flex gap-4">
          <span>{emsMetadata?.isDemoFallback ? 'VER: 4.3.0-DEMO' : 'VER: 4.3.0-PROD'}</span>
        </div>
      </footer>

      {isConfigOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in font-mono">
          <div className="bg-prizm-surface border border-prizm-border rounded-xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
            <div className="bg-prizm-surface-strong p-4 border-b border-prizm-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LayoutGrid className="text-prizm-primary animate-pulse" size={18} />
                <span className="text-xs font-bold text-prizm-text uppercase tracking-wider">Configure Workspace Tabs</span>
              </div>
              <button 
                onClick={() => setIsConfigOpen(false)}
                className="text-prizm-text-muted hover:text-white transition-colors cursor-pointer"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 flex-1 space-y-3 overflow-y-auto max-h-[350px]">
              <p className="text-[11px] text-prizm-text-muted font-sans leading-relaxed">
                Reorder or toggle the visibility of active workspace tabs. Changes are saved persistently in local storage.
              </p>

              <div className="space-y-1.5 mt-2">
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
                          onClick={() => toggleTabVisibility(tab.id)}
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
                          onClick={() => moveTab(index, "up")}
                          disabled={index === 0}
                          className="p-1 px-1.5 rounded text-prizm-text-muted hover:text-white hover:bg-white/5 transition-all disabled:opacity-20 cursor-pointer text-center"
                          title="Move Up"
                        >
                          <ArrowUp size={12} />
                        </button>

                        {/* Reorder Down button */}
                        <button
                          onClick={() => moveTab(index, "down")}
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
            </div>

            <div className="p-4 bg-prizm-surface-strong border-t border-prizm-border flex items-center justify-between">
              <button
                onClick={resetTabs}
                className="px-3 py-1.5 bg-black/30 hover:bg-black/50 text-prizm-text-muted rounded-md border border-prizm-border flex items-center gap-1 text-[10px] font-mono font-bold uppercase transition-all cursor-pointer"
              >
                <RotateCcw size={11} />
                Reset Defaults
              </button>

              <button
                onClick={() => setIsConfigOpen(false)}
                className="px-4 py-1.5 bg-prizm-primary hover:bg-prizm-primary/95 text-black font-extrabold rounded-md flex items-center gap-1 text-[10px] uppercase transition-all shadow-md cursor-pointer font-bold"
              >
                <Check size={11} />
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      </>
      )}

    </div>
  );
}
