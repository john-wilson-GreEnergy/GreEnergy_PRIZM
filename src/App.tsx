import { markPerf } from './lib/perf';
import React, { useState, useEffect, Suspense, useTransition, useRef } from "react";
import { 
  Activity, 
  Cpu, 
  FileText, 
  ShieldAlert, 
  Zap, 
  RefreshCw, 
  Clock, 
  CheckCircle,
  BookOpen,
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
  Check,
  Gauge
} from "lucide-react";
const SiteOperationsDashboard = React.lazy(() => import("./components/SiteOperationsDashboard"));
const CorrectiveActionsDashboard = React.lazy(() => import("./components/CorrectiveActionsDashboard"));
const StringDashboard = React.lazy(() => import("./components/StringDashboard"));
const SiteDistributionDashboard = React.lazy(() => import("./components/SiteDistributionDashboard"));
const PcsDashboard = React.lazy(() => import("./components/PcsDashboard"));
const FeatherDashboard = React.lazy(() => import("./components/FeatherDashboard"));
const ProvisioningDashboard = React.lazy(() => import("./components/ProvisioningDashboard"));
const FeatherSerialConnectionManager = React.lazy(() => import("./components/FeatherSerialConnectionManager"));
const IoLogikFleetManager = React.lazy(() => import("./components/IoLogikFleetManager"));
const HvacSimulationDashboard = React.lazy(() => import("./components/HvacSimulationDashboard"));
const StringFanCommandHold = React.lazy(() => import("./components/StringFanCommandHold"));
const BalancerTestDashboard = React.lazy(() => import("./components/BalancerTestDashboard"));
const TroubleshootingLibrary = React.lazy(() => import("./components/TroubleshootingLibrary"));
const TroubleshootingMatrixEditor = React.lazy(() => import("./components/TroubleshootingMatrixEditor"));
const Reporting = React.lazy(() => import("./components/Reporting"));
const LineupLightbarControl = React.lazy(() => import("./components/LineupLightbarControl"));
const OneLineView = React.lazy(() => import("./components/OneLineView"));
const ThermalWorkspace = React.lazy(() => import("./components/ThermalWorkspace"));
import { GreEnergyLogo } from "./components/GreEnergyLogo";
const SiteConfigurationDashboard = React.lazy(() => import("./components/SiteConfigurationDashboard"));
const SafetyAdvancedDashboard = React.lazy(() => import("./components/SafetyAdvancedDashboard"));
const SafetyFaultClearView = React.lazy(() => import("./components/SafetyFaultClearView"));
import DashboardLoadingSkeleton from "./components/common/DashboardLoadingSkeleton";
import { formatPrizmUtcTimestamp } from "./lib/timeFormat";
import { useSiteData } from "./context/SiteDataContext";
import PrizmLoadingIndicator from "./components/common/PrizmLoadingIndicator";

type AppTabId = "overview" | "one-line" | "thermal-controls" | "corrective-actions" | "arrays-strings" | "site-health" | "pcs-dashboard" | "balancer-test" | "site-configuration" | "feather-hvac" | "lightbar-control" | "reports" | "safety-fault" | "advanced" | "troubleshooting-library";

interface TabItem {
  id: string;
  visible: boolean;
}

const MASTER_TABS_MAP: Record<string, { label: string, icon: any }> = {
  "overview": { label: "Block Summary", icon: Activity },
  "one-line": { label: "One-Line View", icon: Network },
  "thermal-controls": { label: "Thermal Controls", icon: Activity },
  "corrective-actions": { label: "Corrective Actions", icon: ShieldAlert },
  "arrays-strings": { label: "String List", icon: Cpu },
  "site-health": { label: "Site Health", icon: Shield },
  "pcs-dashboard": { label: "PCS Dashboard", icon: Zap },
  "balancer-test": { label: "BPC Balance Test", icon: Gauge },
  "site-configuration": { label: "Site Configuration", icon: Settings },
  "feather-hvac": { label: "Feather / HVAC", icon: Network },
  "lightbar-control": { label: "Lineup Lightbar", icon: Sliders },
  "reports": { label: "Reports / Exports", icon: FileText },
  "safety-fault": { label: "Safety Clear", icon: ShieldAlert },
  "advanced": { label: "Safety / Advanced", icon: ShieldAlert },
  "troubleshooting-library": { label: "Troubleshooting KB", icon: BookOpen }
};

const DEFAULT_TABS_ORDER: string[] = [
  "overview",
  "one-line",
  "corrective-actions",
  "arrays-strings",
  "site-health",
  "pcs-dashboard",
  "balancer-test",
  "site-configuration",
  "feather-hvac",
  "thermal-controls",
  "lightbar-control",
  "reports",
  "safety-fault",
  "advanced",
  "troubleshooting-library"
];

type PortalMode = "technician" | "operator";
const TECHNICIAN_TABS_ORDER: string[] = [
  "overview",
  "one-line",
  "corrective-actions",
  "arrays-strings",
  "site-health",
  "pcs-dashboard",
  "balancer-test",
  "site-configuration",
  "feather-hvac",
  "thermal-controls",
  "lightbar-control",
  "troubleshooting-library",
  "reports",
  "safety-fault"
];

function readPortalMode(): PortalMode {
  const requested = new URLSearchParams(window.location.search).get("portal");
  return requested === "operator" ? "operator" : "technician";
}

export default function App() {
  const [portalMode, setPortalMode] = useState<PortalMode>(readPortalMode);
  const [activeTab, setActiveTab] = useState<AppTabId>(() => {
    const searchParams = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search);
    const requested = searchParams?.get('tab') ?? searchParams?.get('legacyTab') ?? null;
    const portal = typeof window === 'undefined' ? "technician" : readPortalMode();
    const persisted = typeof window === 'undefined' ? null : window.localStorage.getItem(`prizm_active_tab_${portal}`) || window.localStorage.getItem("prizm_active_tab");
    if (requested && requested in MASTER_TABS_MAP) return requested as AppTabId;
    return persisted && persisted in MASTER_TABS_MAP ? persisted as AppTabId : "overview";
  });
  useEffect(() => {
    window.localStorage.setItem("prizm_active_tab", activeTab);
    window.localStorage.setItem(`prizm_active_tab_${portalMode}`, activeTab);
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") !== activeTab) {
      url.searchParams.set("tab", activeTab);
      window.history.replaceState(window.history.state, "", url);
    }
  }, [activeTab, portalMode]);

  const [isPending, startTransition] = useTransition();
  const handleSetActiveTab = (tab: AppTabId | string) => {
    if (!(tab in MASTER_TABS_MAP)) return;
    const nextTab = tab as AppTabId;
    window.localStorage.setItem("prizm_active_tab", nextTab);
    window.localStorage.setItem(`prizm_active_tab_${portalMode}`, nextTab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    window.history.replaceState(window.history.state, "", url);
    startTransition(() => setActiveTab(nextTab));
  };
  const [featherSub, setFeatherSub] = useState<"feather" | "simulation" | "fan-hold" | "serial-mode" | "iologik" | "provisioning">("feather");
  const [troubleshootingSub, setTroubleshootingSub] = useState<"library" | "matrix">("library");
  useEffect(() => {
    if (activeTab !== "troubleshooting-library") return;
    if (localStorage.getItem("prizm_troubleshooting_open_matrix") === "true") {
      setTroubleshootingSub("matrix");
      localStorage.removeItem("prizm_troubleshooting_open_matrix");
    }
  }, [activeTab]);
  const [loading, setLoading] = useState(true);
  const [diagnosticSession, setDiagnosticSession] = useState<any>(null);
  const [manualRepolling, setManualRepolling] = useState(false);
  const [manualRepollMessage, setManualRepollMessage] = useState<string | null>(null);
  const [manualRepollError, setManualRepollError] = useState<string | null>(null);

  // Configured navbar tabs list setting
  const [tabsOrder, setTabsOrder] = useState<TabItem[]>(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const saved = localStorage.getItem("prizm_tabs_config_v2");
        if (saved) {
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
        }
      }
    } catch (e) {
      console.warn("Failed to retrieve or parse navigation settings key from localStorage:", e);
    }
    return DEFAULT_TABS_ORDER.map(id => ({ id, visible: true }));
  });

  const effectiveTabsOrder = React.useMemo(() => portalMode === "technician"
    ? tabsOrder.filter((tab) => TECHNICIAN_TABS_ORDER.includes(tab.id))
    : tabsOrder, [portalMode, tabsOrder]);

  useEffect(() => {
    const applyPortal = (nextPortal: PortalMode) => {
      setPortalMode(nextPortal);
      const allowedTabs = nextPortal === "technician" ? TECHNICIAN_TABS_ORDER : DEFAULT_TABS_ORDER;
      const saved = window.localStorage.getItem(`prizm_active_tab_${nextPortal}`);
      const nextTab = saved && allowedTabs.includes(saved) ? saved as AppTabId : "overview";
      window.localStorage.setItem(`prizm_active_tab_${nextPortal}`, nextTab);
      const url = new URL(window.location.href); url.searchParams.set("tab", nextTab); window.history.replaceState(window.history.state, "", url);
      startTransition(() => setActiveTab(nextTab));
    };
    const handlePortalChange = (event: Event) => applyPortal((event as CustomEvent<PortalMode>).detail === "operator" ? "operator" : "technician");
    const handlePopState = () => applyPortal(readPortalMode());
    window.addEventListener("prizm-portal-change", handlePortalChange);
    window.addEventListener("popstate", handlePopState);
    return () => { window.removeEventListener("prizm-portal-change", handlePortalChange); window.removeEventListener("popstate", handlePopState); };
  }, []);

  const [isConfigOpen, setIsConfigOpen] = useState(false);

  // Save configurations layout changes to secure local client storage
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.setItem("prizm_tabs_config_v2", JSON.stringify(tabsOrder));
      }
    } catch (e) {
      console.warn("Failed to write navigation settings to localStorage:", e);
    }
  }, [tabsOrder]);

  // If the focus tab gets disabled or hidden, auto-select the next visible tab to preserve render viewport
  useEffect(() => {
    const currentTabItem = effectiveTabsOrder.find(t => t.id === activeTab);
    if (!currentTabItem || !currentTabItem.visible) {
      const firstVisible = effectiveTabsOrder.find(t => t.visible);
      if (firstVisible) {
        handleSetActiveTab(firstVisible.id as AppTabId);
      }
    }
  }, [effectiveTabsOrder, activeTab]);

  const moveTab = (index: number, direction: "up" | "down") => {
    const newIdx = direction === "up" ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= tabsOrder.length) return;
    const updated = [...tabsOrder];
    const temp = updated[index];
    updated[index] = updated[newIdx];
    updated[newIdx] = temp;
    setTabsOrder(updated);
  };

  const movePortalTab = (id: string, direction: "up" | "down") => {
    const allowed = portalMode === "technician" ? TECHNICIAN_TABS_ORDER : DEFAULT_TABS_ORDER;
    const ordered = tabsOrder.filter(tab => allowed.includes(tab.id));
    const index = ordered.findIndex(tab => tab.id === id);
    const neighbor = ordered[direction === "up" ? index - 1 : index + 1];
    if (index < 0 || !neighbor) return;
    const currentIndex = tabsOrder.findIndex(tab => tab.id === id);
    const neighborIndex = tabsOrder.findIndex(tab => tab.id === neighbor.id);
    const updated = [...tabsOrder];
    [updated[currentIndex], updated[neighborIndex]] = [updated[neighborIndex], updated[currentIndex]];
    setTabsOrder(updated);
  };

  const toggleTabVisibility = (id: string) => {
    const allowed = portalMode === "technician" ? TECHNICIAN_TABS_ORDER : DEFAULT_TABS_ORDER;
    const visibleCount = tabsOrder.filter(t => allowed.includes(t.id) && t.visible).length;
    const tabToToggle = tabsOrder.find(t => t.id === id);
    if (visibleCount <= 1 && tabToToggle?.visible) {
      return; // Safeguard navbar to have at least one active screen
    }
    setTabsOrder(prev => prev.map(t => t.id === id ? { ...t, visible: !t.visible } : t));
  };

  const resetTabs = () => {
    setTabsOrder(DEFAULT_TABS_ORDER.map(id => ({ id, visible: true })));
  };

  // Monitor EMS metadata
  const [emsMetadata, setEmsMetadata] = useState<any>(null);

  // Dynamic system clock matching timezone metadata
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const handleNavigate = (e: any) => {
        if (e.detail) {
          const tab = e.detail;
          if (tab === "settings" || tab === "ems-health" || tab === "tool-dashboards") {
            handleSetActiveTab("site-configuration");
          } else if (tab === "advanced" || tab === "safety-advanced") {
            handleSetActiveTab("advanced");
          } else if (tab === "site-distribution" || tab === "site-sensors" || tab === "site-health") {
            handleSetActiveTab("site-health");
          } else {
            handleSetActiveTab(tab);
          }
        }
    };
    window.addEventListener('navigate-tab', handleNavigate);
    return () => window.removeEventListener('navigate-tab', handleNavigate);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch full telemetry, reports & alerts
  const [connectionStatus, setConnectionStatus] = useState<any>(null);
  const [bootStatus, setBootStatus] = useState<any>(null);
  const [showConnectionConfig, setShowConnectionConfig] = useState(false);

  const {
    isInitialLoading: siteDataLoading,
    dataQualityWarning,
    isPollingEnabled,
    isTerminated,
    pausePolling,
    resumePolling,
    terminateConnection,
    consecutiveFailureCount,
    consecutiveDegradedCount,
    lastPollAttemptedAt,
    lastGoodSnapshotAt,
    setActiveView
  } = useSiteData();

  useEffect(() => {
    setActiveView(activeTab);
  }, [activeTab, setActiveView]);

  const [warmStartState, setWarmStartState] = useState<"idle" | "running" | "complete" | "failed">("idle");

  const warmStartFieldData = async () => {
    setWarmStartState("running");
    try {
      const endpoints = [
        "/api/local/hvac-simulation/targets",
        "/api/local/hvac-simulation/capabilities"
      ];
      for (const endpoint of endpoints) {
        await fetch(endpoint).catch(() => null);
      }
      setWarmStartState("complete");
      setTimeout(() => {
        setWarmStartState("idle");
      }, 5000);
    } catch (e) {
      console.error("[Warmstart] failed", e);
      setWarmStartState("failed");
      setTimeout(() => {
        setWarmStartState("idle");
      }, 5000);
    }
  };

  const warmStartRanRef = useRef(false);
  useEffect(() => {
    if (warmStartRanRef.current) return;
    const ready =
      connectionStatus?.status === "LIVE" ||
      connectionStatus?.status === "PARTIAL";
    if (!ready) return;
    warmStartRanRef.current = true;
    warmStartFieldData();
  }, [connectionStatus?.status]);

  


  const handleManualRepoll = async () => {
    if (pollInFlightRef.current || manualRepolling) return;
    setManualRepolling(true);
    setManualRepollError(null);
    setManualRepollMessage(null);
    try {
      const refreshRes = await fetch("/api/local/system/refresh-live", { method: "POST" });
      const refreshBody = await refreshRes.json().catch(() => null);
      if (!refreshRes.ok) throw new Error(refreshBody?.error || "Refresh failed with HTTP " + refreshRes.status);
      const connRes = await fetch("/api/local/ems/connection-status");
      const connBody = await connRes.json().catch(() => null);
      if (connRes.ok && connBody) { setConnectionStatus(connBody); setEmsMetadata(connBody); }
      const bootRes = await fetch("/api/local/system/boot-status").catch(() => null);
      if (bootRes && bootRes.ok) { const bootBody = await bootRes.json().catch(() => null); if (bootBody) setBootStatus(bootBody); }
      const debugRes = await fetch("/api/local/debug/sources").catch(() => null);
      let sourceMsg = "";
      if (debugRes && debugRes.ok) {
        const sources = await debugRes.json().catch(() => []);
        const okCount = sources.filter((s) => s.success).length;
        sourceMsg = " · Sources: " + okCount + " OK / " + (sources.length - okCount) + " Failed";
      }
      let connMsg = "";
      if (connBody) {
        if (connBody.status === "LIVE") connMsg = " · Connection Live";
        else if (connBody.status === "PARTIAL") connMsg = " · Partial Connection";
        else connMsg = " · " + (connBody.status || "Offline");

        if (connBody.status === "LIVE" || connBody.status === "PARTIAL") {
          warmStartFieldData();
        }
      }
      setManualRepollMessage("EMS Repoll Complete" + connMsg + sourceMsg);
      setTimeout(() => setManualRepollMessage(null), 6000);
    } catch (err) {
      setManualRepollError(err?.message || "EMS repoll failed");
      setTimeout(() => setManualRepollError(null), 6000);
    } finally {
      setManualRepolling(false);
    }
  };

  const fetchAllData = async (silent = false) => {
    const t0 = performance.now();
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
      markPerf('App fetchAllData', t0);
    }
  };

  
  const pollInFlightRef = useRef(false);
  const lastPollRef = useRef(0);
  const connectionStatusRef = useRef<any>(null);
  const diagnosticSessionRef = useRef<any>(null);

  useEffect(() => {
    connectionStatusRef.current = connectionStatus;
  }, [connectionStatus]);

  useEffect(() => {
    diagnosticSessionRef.current = diagnosticSession;
  }, [diagnosticSession]);

  useEffect(() => {
    let cancelled = false;
    const runInitial = async () => {
      if (!cancelled) {
        await fetchAllData();
        lastPollRef.current = Date.now();
      }
    };
    runInitial();
    
    const checkPoll = async () => {
      if (cancelled) return;
      if (pollInFlightRef.current) return;
      
      const now = Date.now();
      const isHidden = document.hidden;
      const currentConnection = connectionStatusRef.current;
      const currentSession = diagnosticSessionRef.current;
      
      const isLive = currentConnection?.status === "LIVE" && currentConnection?.reachable;
      const isRecording = currentSession?.active === true && currentSession?.paused !== true;
      
      let intervalMs = 15000;
      if (isHidden) {
          intervalMs = 30000;
      } else if (isRecording) {
          intervalMs = 3000;
      } else if (isLive) {
          intervalMs = 15000;
      } else {
          intervalMs = 20000;
      }
      
      if (now - lastPollRef.current < intervalMs) return;
      
      pollInFlightRef.current = true;
      try {
         await fetchAllData(true);
      } finally {
         lastPollRef.current = Date.now();
         pollInFlightRef.current = false;
      }
    };

    const poll = setInterval(checkPoll, 2000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, []);


  return (
    <div className="min-h-screen bg-prizm-bg text-prizm-text font-sans flex flex-col">
      <PrizmLoadingIndicator show={isPending} />
      
      {/* TOP NAVIGATION BAR (DAYLIGHT DESIGN THEME) */}
      <header className="h-14 border-b border-prizm-border flex items-center justify-between px-4 sm:px-6 bg-prizm-header sticky top-0 z-50 shrink-0">
        <div className="flex items-center gap-4">
            {manualRepollMessage && <span className="text-emerald-500 font-mono text-[10px] uppercase font-bold tracking-widest hidden sm:block mx-2">{manualRepollMessage}</span>}
            {manualRepollError && <span className="text-prizm-danger font-mono text-[10px] uppercase font-bold tracking-widest hidden sm:block mx-2">{manualRepollError}</span>}
            <button
              onClick={handleManualRepoll}
              disabled={manualRepolling}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-prizm-border bg-prizm-surface hover:bg-prizm-surface-strong text-prizm-primary font-mono text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={manualRepolling ? "animate-spin" : ""} />
              {manualRepolling ? "Repolling..." : "Repoll EMS"}
            </button>
            {warmStartState === "running" && (
              <span className="text-amber-400 font-mono text-[10px] uppercase font-bold tracking-widest hidden sm:block mx-2 animate-pulse">
                Warming data...
              </span>
            )}
            {warmStartState === "complete" && (
              <span className="text-emerald-400 font-mono text-[10px] uppercase font-bold tracking-widest hidden sm:block mx-2 animate-fade-in">
                Data warm-up complete
              </span>
            )}
            {warmStartState === "failed" && (
              <span className="text-prizm-danger font-mono text-[10px] uppercase font-bold tracking-widest hidden sm:block mx-2">
                Warm-up failed
              </span>
            )}
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
            {(connectionStatus?.staleData || emsMetadata?.staleData) && <span className="text-amber-600 font-bold">STALE DATA</span>}
            {connectionStatus?.status === 'DEMO' && <span className="text-purple-400 font-bold flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse"></span>Demo Mode</span>}
            {(!connectionStatus || connectionStatus?.status === 'OFFLINE') && <span className="text-prizm-danger font-bold flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-prizm-danger"></span>Offline</span>}
            {connectionStatus?.status === 'MISCONFIGURED' && <span className="text-prizm-danger font-bold flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-prizm-danger"></span>Offline (Misconfigured)</span>}
            
            <span title={emsMetadata?.siteName || emsMetadata?.activeProfileName || "Site name unavailable"} className="truncate max-w-[240px]">SITE: {
                emsMetadata?.siteName || emsMetadata?.activeProfileName || 'Unknown'
            }</span>
            
            <span>STATION: {connectionStatus?.discoveredStationCode || connectionStatus?.stationCode || 'Unknown'}</span>
            <span>BLOCK: {connectionStatus?.blockIndex || '1'}</span>
            {connectionStatus?.status === 'MISCONFIGURED' && <span className="ml-2 text-prizm-danger uppercase">| EMS Settings Required</span>}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap sm:flex-nowrap">
          <span className={`hidden md:inline-flex rounded border px-2 py-1 font-mono text-[9px] font-black uppercase tracking-wider ${portalMode === "technician" ? "border-sky-300 bg-sky-50 text-sky-700" : "border-emerald-300 bg-emerald-50 text-emerald-700"}`}>
            {portalMode} portal
          </span>
          {/* Sync Heartbeat display */}
          <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-prizm-text-muted">
            <span className="hidden lg:inline font-bold">SYNC HEARTBEAT:</span>
            {(() => {
              const isOffline = !connectionStatus || connectionStatus?.status === 'OFFLINE' || connectionStatus?.status === 'MISCONFIGURED';
              let heartbeatText = "Live Refresh Active";
              let heartbeatColorClass = "text-emerald-400";
              let dotColorClass = "bg-emerald-400";
              let dotAnimate = "animate-ping";

              if (isOffline) {
                heartbeatText = "Offline";
                heartbeatColorClass = "text-prizm-danger";
                dotColorClass = "bg-prizm-danger";
                dotAnimate = "";
              } else if (connectionStatus?.status === 'PARTIAL') {
                heartbeatText = "Partial Connection";
                heartbeatColorClass = "text-prizm-warning";
                dotColorClass = "bg-prizm-warning";
                dotAnimate = "";
              } else if (diagnosticSession && diagnosticSession.active) {
                if (diagnosticSession.paused) {
                  heartbeatText = "Session Paused";
                  heartbeatColorClass = "text-amber-500";
                  dotColorClass = "bg-amber-500";
                  dotAnimate = "";
                } else {
                  heartbeatText = "Session Recording";
                  heartbeatColorClass = "text-rose-500";
                  dotColorClass = "bg-rose-500";
                  dotAnimate = "animate-pulse";
                }
              } else {
                heartbeatText = "Live";
                heartbeatColorClass = "text-emerald-400";
                dotColorClass = "bg-emerald-400";
                dotAnimate = "animate-ping";
              }

              return (
                <span className={`${heartbeatColorClass} font-bold flex items-center gap-1`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${dotColorClass} ${dotAnimate}`}></span>
                  {heartbeatText}
                </span>
              );
            })()}
          </div>

          {/* Polling State & Controls */}
          <div className="flex items-center gap-2 text-[10px] font-mono text-prizm-text-muted pl-2.5 border-l border-prizm-border">
            <span className="hidden lg:inline font-bold uppercase">POLLING:</span>
            <div className="flex items-center gap-1.5">
              {isTerminated ? (
                <span className="text-rose-500 font-bold flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
                  TERM
                </span>
              ) : !isPollingEnabled ? (
                <span className="text-amber-500 font-bold flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                  PAUSED
                </span>
              ) : (
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  ACTIVE
                </span>
              )}
            </div>

            {/* Controls */}
            {!isTerminated && (
              <div className="flex items-center gap-1">
                {isPollingEnabled ? (
                  <button
                    onClick={pausePolling}
                    title="Pause automatic polling"
                    className="px-1.5 py-0.5 rounded bg-prizm-bg border border-prizm-border hover:bg-prizm-surface text-amber-500 font-bold uppercase text-[9px] transition-colors cursor-pointer"
                  >
                    Pause
                  </button>
                ) : (
                  <button
                    onClick={resumePolling}
                    title="Resume automatic polling"
                    className="px-1.5 py-0.5 rounded bg-prizm-bg border border-prizm-border hover:bg-prizm-surface text-emerald-400 font-bold uppercase text-[9px] transition-colors cursor-pointer"
                  >
                    Resume
                  </button>
                )}
                <button
                  onClick={terminateConnection}
                  title="Terminate background polling connection permanently"
                  className="px-1.5 py-0.5 rounded bg-prizm-bg border border-prizm-border hover:bg-prizm-surface text-rose-500 font-bold uppercase text-[9px] transition-colors cursor-pointer"
                >
                  Term
                </button>
              </div>
            )}
          </div>

          {diagnosticSession && diagnosticSession.active && (
            <div className={`flex items-center gap-1.5 border ${diagnosticSession.paused ? 'border-amber-500/20 bg-amber-500/5 text-amber-500' : 'border-rose-500/20 bg-rose-500/5 text-rose-500'} px-2 py-0.5 rounded font-mono text-[9px] font-black uppercase tracking-wider`}>
              <span className={`h-1.5 w-1.5 rounded-full ${diagnosticSession.paused ? 'bg-amber-500' : 'bg-rose-500 animate-pulse'} shrink-0`}></span>
              <span>ds: {diagnosticSession.paused ? 'paused' : 'recording'}</span>
            </div>
          )}
          <div className="text-right border-l border-prizm-border pl-2.5">
            <div className="text-[11px] text-prizm-text-muted font-mono tracking-widest whitespace-nowrap">
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
            <div className="flex justify-between"><span>Site Operations:</span> <span className={bootStatus?.preloadStatus?.siteOperations ? "text-emerald-400" : "text-prizm-text-muted"}>{bootStatus?.preloadStatus?.siteOperations ? "READY" : "WAITING"}</span></div>
            <div className="flex justify-between"><span>Topology:</span> <span className={bootStatus?.preloadStatus?.topology ? "text-emerald-400" : "text-prizm-text-muted"}>{bootStatus?.preloadStatus?.topology ? "READY" : "WAITING"}</span></div>
            <div className="flex justify-between"><span>Strings:</span> <span className={bootStatus?.preloadStatus?.stringsDashboard ? "text-emerald-400" : "text-prizm-text-muted"}>{bootStatus?.preloadStatus?.stringsDashboard ? "READY" : "WAITING"}</span></div>
            <div className="flex justify-between"><span>Feather/HVAC:</span> <span className={bootStatus?.preloadStatus?.featherDevices ? "text-emerald-400" : "text-prizm-text-muted"}>{bootStatus?.preloadStatus?.featherDevices ? "READY" : "WAITING"}</span></div>
            <div className="flex justify-between"><span>Modbus Setup:</span> <span className={bootStatus?.preloadStatus?.modbusProfile ? "text-emerald-400" : "text-prizm-text-muted"}>{bootStatus?.preloadStatus?.modbusProfile ? "READY" : "WAITING"}</span></div>
         </div>
      </div>
   </div>
) : (
  <>
      <section className="bg-prizm-surface-strong border-b border-prizm-border z-40 sticky top-14 transition-all shrink-0">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-2">
            
            {/* Tabs control styled beautifully */}
            <div className="flex min-w-0 flex-1 items-center space-x-1 overflow-x-auto py-1 no-scrollbar scroll-smooth">
              {effectiveTabsOrder
                .filter(tab => tab.visible)
                .map(tab => {
                  const master = MASTER_TABS_MAP[tab.id];
                  if (!master) return null;
                  const Icon = master.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => handleSetActiveTab(tab.id as AppTabId)}
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
            </div>

            <button
              onClick={() => setIsConfigOpen(true)}
              aria-label="Arrange navigation tabs"
              title="Arrange navigation tabs"
              className="shrink-0 rounded border border-prizm-border p-2 text-prizm-text-muted transition-colors hover:bg-prizm-info/10 hover:text-prizm-primary"
            >
              <Settings size={15} />
            </button>

          </div>
        </div>
      </section>

      {isConfigOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-end bg-black/30 p-4 sm:p-6" onMouseDown={() => setIsConfigOpen(false)}>
          <div className="mt-24 w-full max-w-md rounded-lg border border-prizm-border bg-prizm-surface p-5 shadow-2xl" onMouseDown={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-prizm-border pb-3">
              <div>
                <h2 className="font-mono text-sm font-bold uppercase text-prizm-text">Navigation Tabs</h2>
                <p className="mt-1 text-xs text-prizm-text-muted">Show, hide, or arrange tabs for the {portalMode} portal.</p>
              </div>
              <button onClick={() => setIsConfigOpen(false)} aria-label="Close navigation settings" className="rounded p-1.5 text-prizm-text-muted hover:bg-black/10 hover:text-prizm-text"><X size={16} /></button>
            </div>
            <div className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto pr-1">
              {tabsOrder.filter(tab => (portalMode === "technician" ? TECHNICIAN_TABS_ORDER : DEFAULT_TABS_ORDER).includes(tab.id)).map((tab, index, configuredTabs) => {
                const master = MASTER_TABS_MAP[tab.id];
                if (!master) return null;
                const Icon = master.icon;
                return <div key={tab.id} className={`flex items-center justify-between rounded border p-2.5 text-xs ${tab.visible ? "border-prizm-border bg-black/5" : "border-dashed border-prizm-border opacity-60"}`}>
                  <div className="flex min-w-0 items-center gap-2"><Icon size={14} className={tab.visible ? "text-prizm-primary" : "text-prizm-text-muted"} /><span className="truncate font-bold uppercase text-prizm-text">{master.label}</span></div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => toggleTabVisibility(tab.id)} aria-label={`${tab.visible ? "Hide" : "Show"} ${master.label}`} title={tab.visible ? "Hide tab" : "Show tab"} className="rounded p-1.5 text-prizm-text-muted hover:bg-black/10 hover:text-prizm-primary">{tab.visible ? <Eye size={14} /> : <EyeOff size={14} />}</button>
                    <button onClick={() => movePortalTab(tab.id, "up")} disabled={index === 0} aria-label={`Move ${master.label} left`} title="Move left" className="rounded p-1.5 text-prizm-text-muted hover:bg-black/10 hover:text-prizm-text disabled:opacity-25"><ArrowUp size={14} /></button>
                    <button onClick={() => movePortalTab(tab.id, "down")} disabled={index === configuredTabs.length - 1} aria-label={`Move ${master.label} right`} title="Move right" className="rounded p-1.5 text-prizm-text-muted hover:bg-black/10 hover:text-prizm-text disabled:opacity-25"><ArrowDown size={14} /></button>
                  </div>
                </div>;
              })}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-prizm-border pt-4">
              <button onClick={resetTabs} className="flex items-center gap-2 rounded border border-prizm-border px-3 py-2 text-xs font-bold uppercase text-prizm-text-muted hover:bg-black/10 hover:text-prizm-text"><RotateCcw size={14} />Reset defaults</button>
              <button onClick={() => setIsConfigOpen(false)} className="rounded bg-prizm-primary px-4 py-2 text-xs font-bold uppercase text-black">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* CORE WORKSPACE CONSOLE WINDOW */}
      <main className="flex-1 p-4 sm:p-6 bg-prizm-bg w-full px-4 sm:px-6 lg:px-8">
        {loading && activeTab !== "arrays-strings" ? (
          <div className="h-[400px] flex flex-col items-center justify-center space-y-4 border border-prizm-border bg-prizm-surface rounded-lg">
            <RefreshCw className="animate-spin text-prizm-primary" size={32} />
            <div className="text-center font-mono">
              <span className="text-xs text-prizm-text font-bold block">INITIALIZING PRIZM...</span>
              <p className="text-[11px] text-prizm-text-muted mt-1">Gathering site telemetry & preparing diagnostic view</p>
            </div>
          </div>
        ) : (
          <div className="animate-fade-in duration-300 h-full">
            {/* Polling / Data Quality Status Banner */}
            {(dataQualityWarning || !isPollingEnabled || isTerminated || consecutiveFailureCount > 0) && (
              <div className="mb-4 p-3 rounded-lg border border-prizm-border bg-prizm-surface flex flex-col md:flex-row items-start md:items-center justify-between gap-4 font-mono text-[11px] text-prizm-text shadow-sm animate-fade-in">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isTerminated ? (
                      <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-400 font-bold border border-rose-800">
                        CONNECTION TERMINATED
                      </span>
                    ) : !isPollingEnabled ? (
                      <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-400 font-bold border border-amber-800 animate-pulse">
                        POLLING PAUSED
                      </span>
                    ) : consecutiveFailureCount > 0 ? (
                      <span className="px-2 py-0.5 rounded bg-red-950 text-red-400 font-bold border border-red-800">
                        POLLING UNSTABLE
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 font-bold border border-emerald-800">
                        LIVE REFRESH ACTIVE
                      </span>
                    )}

                    {dataQualityWarning && (
                      <span className="text-amber-400 font-bold flex items-center gap-1.5 animate-pulse">
                        ⚠️ DISPLAYING LAST KNOWN GOOD SNAPSHOT
                      </span>
                    )}
                  </div>
                  
                  {dataQualityWarning && (
                    <p className="text-prizm-text-muted mt-1 leading-tight max-w-2xl font-sans text-xs">
                      {dataQualityWarning}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1.5 text-prizm-text-muted text-[10px] bg-black/10 p-2.5 rounded border border-prizm-border/40">
                  <div>
                    <span className="block text-prizm-text-muted uppercase text-[9px] font-bold">Last Attempted Poll</span>
                    <span className="font-bold text-prizm-text font-mono">
                      {lastPollAttemptedAt ? new Date(lastPollAttemptedAt).toLocaleTimeString() : "Never"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-prizm-text-muted uppercase text-[9px] font-bold">Last Good Snapshot</span>
                    <span className="font-bold text-prizm-text font-mono">
                      {lastGoodSnapshotAt ? new Date(lastGoodSnapshotAt).toLocaleTimeString() : "Never"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-prizm-text-muted uppercase text-[9px] font-bold">Consecutive Failures</span>
                    <span className={`font-bold font-mono ${consecutiveFailureCount > 0 ? 'text-rose-400' : 'text-prizm-text'}`}>
                      {consecutiveFailureCount}
                    </span>
                  </div>
                  <div>
                    <span className="block text-prizm-text-muted uppercase text-[9px] font-bold">Degraded Count</span>
                    <span className={`font-bold font-mono ${consecutiveDegradedCount > 0 ? 'text-amber-400' : 'text-prizm-text'}`}>
                      {consecutiveDegradedCount}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <Suspense fallback={<DashboardLoadingSkeleton label="Loading dashboard..." />}>
              {activeTab === "overview" && (
                <div className="block animate-fade-in">
                  <SiteOperationsDashboard setActiveTab={handleSetActiveTab} active />
                </div>
              )}

              {activeTab === "thermal-controls" && <ThermalWorkspace />}
              {activeTab === "one-line" && (
                <div className="block animate-fade-in">
                  <OneLineView active />
                </div>
              )}

              {activeTab === "corrective-actions" && (
                <div className="block animate-fade-in">
                  <CorrectiveActionsDashboard active />
                </div>
              )}

              {activeTab === "arrays-strings" && (
                <div className="block animate-fade-in">
                  <StringDashboard active />
                </div>
              )}

              {activeTab === "site-health" && (
                <div className="block animate-fade-in font-sans">
                  <SiteDistributionDashboard active />
                </div>
              )}

              {activeTab === "pcs-dashboard" && (
                <div className="block animate-fade-in">
                  <PcsDashboard active />
                </div>
              )}

              {activeTab === "balancer-test" && (
                <div className="block animate-fade-in">
                  <BalancerTestDashboard active />
                </div>
              )}

              {activeTab === "site-configuration" && (
                <div className="block animate-fade-in">
                  <SiteConfigurationDashboard />
                </div>
              )}

              {activeTab === "feather-hvac" && (
                <div className="block space-y-4 animate-fade-in">
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
                    <button
                      onClick={() => setFeatherSub("fan-hold")}
                      className={`px-4 py-2 border-b-2 transition-all cursor-pointer ${
                        featherSub === "fan-hold"
                          ? "border-prizm-primary text-prizm-primary bg-prizm-info/5 font-extrabold"
                          : "border-transparent text-prizm-text-muted hover:text-white"
                      }`}
                    >
                      String Fan Command Hold
                    </button>
                    <button
                      onClick={() => setFeatherSub("serial-mode")}
                      className={`px-4 py-2 border-b-2 transition-all cursor-pointer ${
                        featherSub === "serial-mode"
                          ? "border-prizm-primary text-prizm-primary bg-prizm-info/5 font-extrabold"
                          : "border-transparent text-prizm-text-muted hover:text-white"
                      }`}
                    >
                      Serial Mode Inventory
                    </button>
                    <button
                      onClick={() => setFeatherSub("iologik")}
                      className={`px-4 py-2 border-b-2 transition-all cursor-pointer ${
                        featherSub === "iologik"
                          ? "border-prizm-primary text-prizm-primary bg-prizm-info/5 font-extrabold"
                          : "border-transparent text-prizm-text-muted hover:text-white"
                      }`}
                    >
                      ioLogik Fleet
                    </button>
                    <button
                      onClick={() => setFeatherSub("provisioning")}
                      className={`px-4 py-2 border-b-2 transition-all cursor-pointer ${
                        featherSub === "provisioning"
                          ? "border-prizm-primary text-prizm-primary bg-prizm-info/5 font-extrabold"
                          : "border-transparent text-prizm-text-muted hover:text-white"
                      }`}
                    >
                      Provisioning
                    </button>
                  </div>
                  {featherSub === "feather" && <FeatherDashboard active />}
                  {featherSub === "simulation" && <HvacSimulationDashboard active />}
                  {featherSub === "fan-hold" && <StringFanCommandHold active />}
                  {featherSub === "serial-mode" && <FeatherSerialConnectionManager active />}
                  {featherSub === "iologik" && <IoLogikFleetManager active />}
                  {featherSub === "provisioning" && <ProvisioningDashboard />}
                </div>
              )}

              {activeTab === "lightbar-control" && (
                <div className="block animate-fade-in">
                  <LineupLightbarControl />
                </div>
              )}

              {activeTab === "reports" && (
                <div className="block animate-fade-in">
                  <Reporting 
                    devices={[]}
                    reports={[]}
                    onAddReport={async () => {}}
                    onDeleteReport={async () => {}}
                    diagnosticSession={diagnosticSession}
                    onRefreshDiagnostic={() => fetchAllData(true)}
                  />
                </div>
              )}

              {activeTab === "advanced" && (
                <div className="block animate-fade-in">
                  <SafetyAdvancedDashboard />
                </div>
              )}

              {activeTab === "safety-fault" && (
                <div className="block animate-fade-in">
                  <SafetyFaultClearView />
                </div>
              )}

              {activeTab === "troubleshooting-library" && (
                <div className="block space-y-4 animate-fade-in">
                  <div className="flex border-b border-prizm-border font-mono text-[10px] uppercase font-bold tracking-widest bg-prizm-surface p-1 rounded-t-md space-x-1">
                    <button
                      onClick={() => setTroubleshootingSub("library")}
                      className={`px-4 py-2 border-b-2 transition-all cursor-pointer ${
                        troubleshootingSub === "library"
                          ? "border-prizm-primary text-prizm-primary bg-prizm-info/5 font-extrabold"
                          : "border-transparent text-prizm-text-muted hover:text-white"
                      }`}
                    >
                      Troubleshooting Library
                    </button>
                    <button
                      onClick={() => setTroubleshootingSub("matrix")}
                      className={`px-4 py-2 border-b-2 transition-all cursor-pointer ${
                        troubleshootingSub === "matrix"
                          ? "border-prizm-primary text-prizm-primary bg-prizm-info/5 font-extrabold"
                          : "border-transparent text-prizm-text-muted hover:text-white"
                      }`}
                    >
                      Corrective Action Matrix
                    </button>
                  </div>

                  {troubleshootingSub === "library" && <TroubleshootingLibrary />}
                  {troubleshootingSub === "matrix" && <TroubleshootingMatrixEditor />}
                </div>
              )}
            </Suspense>
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
            {emsMetadata?.lastSuccessfulAt || emsMetadata?.lastUpdated
              ? `LAST GOOD POLL: ${formatPrizmUtcTimestamp(emsMetadata.lastSuccessfulAt || emsMetadata.lastUpdated)}`
              : emsMetadata?.lastAttemptAt
                ? 'AWAITING FIRST GOOD POLL'
                : 'POLLING PENDING...'}
          </span>
        </div>
        <div className="flex gap-4">
          <span>{emsMetadata?.isDemoFallback ? 'VER: 4.3.0-DEMO' : 'VER: 4.3.0-PROD'}</span>
        </div>
      </footer>
      </>
      )}

    </div>
  );
}
