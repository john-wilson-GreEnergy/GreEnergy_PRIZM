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
  Lock
} from "lucide-react";
// TODO: Implement route-level dynamic imports for code splitting.
import SiteOperationsDashboard from "./components/SiteOperationsDashboard";
import StringDashboard from "./components/StringDashboard";
import DevicesManager from "./components/DevicesManager";
import Reporting from "./components/Reporting";
import ToolDashboards from "./components/ToolDashboards";
import FeatherDashboard from "./components/FeatherDashboard";
import ConnectionSettings from "./components/ConnectionSettings";
import { GreEnergyLogo } from "./components/GreEnergyLogo";
import { BessDevice, BessLog, ReportConfig } from "./types";
import { formatPrizmUtcTimestamp } from "./lib/timeFormat";

export default function App() {
  const [activeTab, setActiveTab] = useState<"overview" | "ems-health" | "arrays-strings" | "tool-dashboards" | "feather-hvac" | "settings" | "reports" | "advanced" | "safety-fault">("overview");
  const [loading, setLoading] = useState(true);

  // Monitor EMS metadata
  const [emsMetadata, setEmsMetadata] = useState<any>(null);

  // Dynamic system clock matching timezone metadata
  const [currentTime, setCurrentTime] = useState(new Date("2026-05-29T14:19:25Z"));

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(prev => new Date(prev.getTime() + 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch full telemetry, reports & alerts
  const [connectionStatus, setConnectionStatus] = useState<any>(null);
  const [showConnectionConfig, setShowConnectionConfig] = useState(false);

  const fetchAllData = async (silent = false) => {
    if (!silent && !connectionStatus) setLoading(true);
    try {
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
            {emsMetadata?.activeMode === "live" && <span className="text-emerald-400 font-bold flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>LIVE</span>}
            {emsMetadata?.activeMode === "partial" && <span className="text-prizm-warning font-bold flex items-center gap-1.5" title={emsMetadata?.lastError || "Some EMS endpoints failing"}><span className="h-1.5 w-1.5 rounded-full bg-prizm-warning animate-pulse"></span>PARTIAL LIVE</span>}
            {emsMetadata?.activeMode === "cached" && <span className="text-amber-500 font-bold flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>CACHED</span>}
            {connectionStatus?.status === 'LIVE' && <span className="text-emerald-400 font-bold flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>LIVE</span>}
            {connectionStatus?.status === 'PARTIAL' && <span className="text-prizm-warning font-bold flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-prizm-warning"></span>PARTIAL</span>}
            {connectionStatus?.status === 'CACHED' && <span className="text-prizm-warning font-bold flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-prizm-warning animate-pulse"></span>CACHED</span>}
            {connectionStatus?.status === 'DEMO' && <span className="text-prizm-demo font-bold flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-prizm-demo animate-pulse"></span>DEMO</span>}
            {(!connectionStatus || connectionStatus?.status === 'OFFLINE') && <span className="text-prizm-danger font-bold flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-prizm-danger"></span>OFFLINE</span>}
            {connectionStatus?.status === 'MISCONFIGURED' && <span className="text-prizm-danger font-bold flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-prizm-danger"></span>MISCONFIGURED</span>}
            
            <span title={emsMetadata?.activeEmsBaseUrl || "No site linked"} className="truncate max-w-[200px]">NODE: {emsMetadata ? (emsMetadata.activeProfileName || "UNLINKED") : '...'}</span>
            
            <span>SITE: {connectionStatus?.discoveredStationCode || connectionStatus?.stationCode || 'Unknown'}</span>
            {connectionStatus?.status === 'MISCONFIGURED' && <span className="ml-2 text-prizm-danger uppercase">| EMS Settings Required</span>}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[11px] text-prizm-text-muted font-mono tracking-widest">
              {formatPrizmUtcTimestamp(currentTime)}
            </div>
          </div>
        </div>
      </header>

      {/* DASHBOARD CONTROL NAVIGATION TOOLBAR LINE */}
      <section className="bg-prizm-surface-strong border-b border-prizm-border z-40 sticky top-14 transition-all shrink-0">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between overflow-x-auto no-scrollbar scroll-smooth">
            
            {/* Tabs control styled beautifully */}
            <div className="flex space-x-1 py-1">
              {[
                { id: "overview", label: "Overview", icon: Activity },
                { id: "ems-health", label: "EMS Health", icon: Activity },
                { id: "arrays-strings", label: "Arrays / Strings", icon: Cpu },
                { id: "tool-dashboards", label: "Tool Dashboards", icon: Sliders },
                { id: "feather-hvac", label: "Feather / HVAC", icon: Network },
                { id: "settings", label: "Connection Settings", icon: Settings },
                { id: "reports", label: "Reports / Exports", icon: FileText },
                { id: "advanced", label: "Advanced / Locked", icon: Lock },
                { id: "safety-fault", label: "Safety Fault Clear", icon: ShieldAlert }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-3.5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest transition-all ${
                    activeTab === tab.id
                      ? "bg-prizm-info/10 border-b-2 border-prizm-primary text-prizm-primary font-bold"
                      : "text-prizm-text-muted hover:text-prizm-text hover:bg-black/5"
                  }`}
                >
                  <tab.icon size={12} className={activeTab === tab.id ? "text-prizm-primary" : "text-prizm-text-muted"} />
                  {tab.label}
                </button>
              ))}
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

            {activeTab === "ems-health" && (
              <ToolDashboards initialTab="stats" />
            )}

            {activeTab === "arrays-strings" && (
              <StringDashboard />
            )}

            {activeTab === "tool-dashboards" && (
              <ToolDashboards initialTab="ip-maps" />
            )}

            {activeTab === "feather-hvac" && (
              <FeatherDashboard />
            )}

            {activeTab === "settings" && (
              <ConnectionSettings />
            )}

            {activeTab === "reports" && (
              <Reporting 
                devices={[]}
                reports={[]}
                onAddReport={async () => {}}
                onDeleteReport={async () => {}}
              />
            )}

            {activeTab === "safety-fault" && (
              <SafetyFaultClearView />
            )}

            {activeTab === "advanced" && (
              <div className="flex flex-col items-center justify-center space-y-4 p-12 bg-prizm-surface border border-prizm-border rounded-lg text-center">
                <Lock size={48} className="text-prizm-warning" />
                <h2 className="text-prizm-text text-xl font-bold font-mono">Advanced / Locked Workflows</h2>
                <p className="max-w-md text-prizm-text-muted">
                  Guarded workflow pending. This control action is intentionally disabled until pre-checks, confirmation, batch execution, post-command verification, and audit logging are implemented.
                </p>
              </div>
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

    </div>
  );
}
