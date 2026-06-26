import React, { useState, useEffect } from "react";
import { formatTemperatureF, celsiusToFahrenheit } from "../utils/temperatureScale";
import { getDashboardConnectionStatus } from "../utils/statusDisplay";
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
  Pause,
} from "lucide-react";
import { formatPrizmUtcTimestamp } from "../lib/timeFormat";
import { normalizeVoltage, normalizeDeltaVoltage } from "../lib/voltageNormalizer";
import { filterAndNormalizeArraySummary } from "../lib/arraySummaryFilters";
import { getSystemSocAndSource } from "../lib/socUtils";
import RotationModal, { RotationTarget } from "./RotationModal";
import { stringNumberToEnergySegment, formatStringEsLabel } from "../lib/stringToEsMapper";

function CollapsibleSection({
  title,
  icon: Icon,
  defaultExpanded = true,
  children,
  badge = null,
  className = "",
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
    <div
      className={`bg-prizm-surface-strong border border-prizm-border rounded-lg overflow-hidden flex flex-col ${className}`}
    >
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
        <div className="p-0 overflow-x-auto no-scrollbar">{children}</div>
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

export async function fetchJsonWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {},
) {
  const { timeoutMs = 5000, ...fetchOptions } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    clearTimeout(id);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

export default function SiteOperationsDashboard({
  setActiveTab,
  active = true,
}: {
  setActiveTab?: (tab: string) => void;
  active?: boolean;
}) {
  const hasVal = (val: any) =>
    val !== null &&
    val !== undefined &&
    val !== "" &&
    val !== "NaN" &&
    !(typeof val === "number" && Number.isNaN(val));

  const [state, setState] = useState<DashboardState>({
    loading: true,
    cacheStatus: null,
    stringsDashboard: null,
    featherDevices: null,
    safetyFaults: null,
    overviewDiscovery: null,
    siteSummary: null,
    historyEvents: null,
  });

  const [isAdvancedMode, setIsAdvancedMode] = useState(false);
  const [expandedCorrectiveActions, setExpandedCorrectiveActions] = useState<
    Record<number, boolean>
  >({});
  const toggleCorrectiveAction = (idx: number) => {
    setExpandedCorrectiveActions((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };
  const [rotationCapabilities, setRotationCapabilities] = useState<any>(null);
  const [pcsModalOpen, setPcsModalOpen] = useState(false);
  const [pcsModalTargets, setPcsModalTargets] = useState<RotationTarget[]>([]);
  const [pcsModalAction, setPcsModalAction] = useState<"in" | "out">("in");
  const [pcsActionPending, setPcsActionPending] = useState(false);
  useEffect(() => {
    let unmounted = false;
    fetchJsonWithTimeout("/api/local/capabilities", { timeoutMs: 1500 })
      .then((v) => {
        if (!unmounted) setRotationCapabilities(v);
      })
      .catch(() => {});
    return () => {
      unmounted = true;
    };
  }, []);
  const handlePcsConfirm = async (req: any) => {
    await fetch("/api/local/pcs/rotation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
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
      setEmsAppResult({
        success: false,
        message: "Confirmation text does not match",
      });
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
          requestedBy: "local-overview",
        }),
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

  const [debugExpanded, setDebugExpanded] = useState(false);

  // Provide a callback to execute clearing
  const executeClear = async () => {
    if (!clearCandidate || clearConfRef !== clearCandidate.entityKeyToken) {
      setClearResult({ error: "Confirmation text does not match" });
      return;
    }
    setClearLoading(true);
    setClearResult(null);
    try {
      const profileId =
        state.siteSummary?.site?.profileId || state.stringsDashboard?.profileId;
      const operatorUsername = "local-overview";
      const res = await fetch("/api/local/safety-fault-clear/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          entityKeyToken: clearCandidate.entityKeyToken,
          confirmationText: clearConfRef,
          operatorUsername,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Execute failed");
      setClearResult(j);
    } catch (e: any) {
      setClearResult({ error: e.message });
    } finally {
      setClearLoading(false);
    }
  };

  const triggerRefresh = (sectionRefresh = false) => {
    let url = "/api/local/site-data/block-summary";
    if (sectionRefresh || state.cacheStatus?.policy === "live-only") {
      url += "?refresh=true";
    }
    fetchJsonWithTimeout(url, { timeoutMs: sectionRefresh ? 20000 : 5000 })
      .then((summaryRes) => {
        setState((prev) => ({
          ...prev,
          siteSummary: summaryRes,
          loading: false,
        }));
      })
      .catch((err) => {
        setState((prev) => ({
          ...prev,
          siteSummary: { error: err.message },
          loading: false,
        }));
      });
  };

  useEffect(() => {
    let unmounted = false;

    const fetchSummary = async (isFirst = false, cachePol: string | null = null) => {
      let url = "/api/local/site-data/block-summary";
      if (cachePol === "live-only") {
        url += "?refresh=true";
      }
      try {
        const summaryRes = await fetchJsonWithTimeout(url, {
          timeoutMs: isFirst ? 25000 : 5000,
        });
        if (!unmounted)
          setState((prev) => ({
            ...prev,
            siteSummary: summaryRes,
            loading: false,
          }));
      } catch (err: any) {
        if (!unmounted)
          setState((prev) => ({
            ...prev,
            siteSummary: { error: err.message },
            loading: false,
          }));
      }
    };

    const fetchData = async () => {
      let currentPol = state.cacheStatus?.policy;
      if (!currentPol) {
        const status = await fetchJsonWithTimeout("/api/local/cache/status", {
          timeoutMs: 1500,
        }).catch(() => {});
        if (!unmounted && status) {
          setState((p) => ({ ...p, cacheStatus: status }));
          currentPol = status.policy;
        }
      }

      await fetchSummary(true, currentPol);

      // Side fetches
      if (!unmounted) {
        fetchJsonWithTimeout("/api/local/history/events?range=24h", {
          timeoutMs: 1500,
        })
          .then((v) => {
            if (!unmounted) setState((p) => ({ ...p, historyEvents: v }));
          })
          .catch(() => {});
      }
    };

    fetchData();
    const interval = setInterval(async () => {
      if (unmounted || !active) return;
      const status = await fetchJsonWithTimeout("/api/local/cache/status", {
        timeoutMs: 1500,
      }).catch(() => {});
      if (!unmounted && status && active) {
        setState((p) => ({ ...p, cacheStatus: status }));
        let url = "/api/local/site-data/block-summary";
        if (status.policy === "live-only") {
          url += "?refresh=true";
        }
        try {
          const summaryRes = await fetchJsonWithTimeout(url, {
            timeoutMs: 5000,
          });
          if (!unmounted && active) {
            // Only clear error if we succeeded
            setState((prev) => ({ ...prev, siteSummary: summaryRes }));
          }
        } catch (err) {
          // Do not overwrite with error on background polling failure, just let it ride
        }
      }
    }, 15000);
    return () => {
      unmounted = true;
      clearInterval(interval);
    };
  }, [active]);

  const sum = state.siteSummary;

  // Since SiteDataContext delays rendering SiteOperationsDashboard until the first snapshot is ready,
  // we can use a very brief ghost state while the local fetch connects, without showing a slow loading text.
  if (state.loading && !sum) {
     return <div className="p-6 text-prizm-text-muted font-mono text-xs animate-pulse opacity-50">Syncing operations...</div>;
  }

  if (sum?.error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10 mt-10">
        <div className="bg-prizm-surface-strong border border-prizm-danger shadow-xl p-6 rounded-lg text-center max-w-md">
          <TriangleAlert
            size={48}
            className="text-prizm-danger mx-auto mb-4 opacity-80"
          />
          <h2 className="text-xl font-bold text-white mb-2 uppercase tracking-wide">
            Summary Unavailable
          </h2>
          <p className="text-prizm-text-muted mb-6 font-mono text-[11px]">
            {sum.error}
          </p>
          <button
            onClick={() => triggerRefresh(true)}
            className="px-6 py-2 bg-prizm-primary/20 text-prizm-primary border border-prizm-primary/50 hover:bg-prizm-primary/30 rounded uppercase tracking-wider font-bold transition-colors"
          >
            Retry Live Refresh
          </button>
        </div>
      </div>
    );
  }

  let siteState = "UNAVAILABLE";
  if (
    sum?.site?.connectionState === "disconnected" ||
    sum?.source === "offline"
  ) {
    siteState = "OFFLINE";
  } else if (sum?.site?.source === "partial" || sum?.stale) {
    siteState = "PARTIAL";
  } else if (
    sum?.site?.connectionState ||
    sum?.source ||
    sum?.cacheUsed !== undefined
  ) {
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

  const stringBuckets = sum?.stringSummary?.buckets || {
    online: 0,
    nearline: 0,
    offline: 0,
    notCommunicating: 0,
  };
  const onlineStats = sum?.stringSummary?.rollups?.online || {
    count: sum?.stringSummary?.buckets?.online || 0,
  };
  const nearlineStats = sum?.stringSummary?.rollups?.nearline || {
    count: sum?.stringSummary?.buckets?.nearline || 0,
  };
  const offlineStats = sum?.stringSummary?.rollups?.offline || {
    count: sum?.stringSummary?.buckets?.offline || 0,
  };
  const notCommStats = sum?.stringSummary?.rollups?.notCommunicating || {
    count: sum?.stringSummary?.buckets?.notCommunicating || 0,
  };
  const rollups = sum?.stringSummary?.rollups ||
    state.stringsDashboard?.rollups || {
      totalStrings:
        stringBuckets.online +
          stringBuckets.nearline +
          stringBuckets.offline +
          stringBuckets.notCommunicating || 0,
    };

  // Voltage Normalization Helpers moved to lib/voltageNormalizer.ts
  const { soc: systemSoc, source: socSource } = getSystemSocAndSource(sum, rollups);

  // Filter and normalize array summary data
  const arraySummaryData = filterAndNormalizeArraySummary(sum?.arraySummary || []);

  const activeIssues = sum?.activeIssueGroups ? [...sum.activeIssueGroups] : [];
  activeIssues.sort((a: any, b: any) => {
    const severityRank: Record<string, number> = {
      ALARM: 1,
      WARNING: 2,
      STALE: 3,
      INFO: 4,
    };
    return (severityRank[a.severity] || 5) - (severityRank[b.severity] || 5);
  });

  const clearableFaults = sum?.safetySummary?.clearableFaults || [];
  const safetyEligible = sum?.safetySummary?.clearableCount || 0;
  const safetyNotEligible = 0; // Not eligible faults no longer primarily tracked here

  const combinedSources = sum?.sourceHealth || [];
  let featherTotal: any = sum?.featherSummary?.totalDevices;
  if (featherTotal === null || featherTotal === undefined) featherTotal = "--";
  let featherLostComms: any = sum?.featherSummary?.lostCommsCount;
  if (featherLostComms === null || featherLostComms === undefined)
    featherLostComms = "--";
  let featherFssInvalid: any = sum?.featherSummary?.fssInvalidCount;
  if (featherFssInvalid === null || featherFssInvalid === undefined)
    featherFssInvalid = "--";
  let featherDoorsInvalid: any = sum?.featherSummary?.doorsInvalidCount;
  if (featherDoorsInvalid === null || featherDoorsInvalid === undefined)
    featherDoorsInvalid = "--";

  const navigate = (tab: string) => {
    if (setActiveTab) setActiveTab(tab);
  };

  const getCellMetrics = () => {
    const rows = sum?.stringSummary?.tableRows || [];
    
    let minCellVoltage = Infinity;
    let maxCellVoltage = -Infinity;
    let maxCellVoltageDelta = -Infinity;
    let lowCellTempC = Infinity;
    let highCellTempC = -Infinity;
    let maxCellTempDelta = -Infinity;
    
    let totalVolt = 0;
    let countVolt = 0;
    let totalTemp = 0;
    let countTemp = 0;

    for (const r of rows) {
      const vMin = r.minCellVoltageMv ?? r.minCellVoltage;
      const vAvg = r.avgCellVoltageMv ?? r.avgCellVoltage;
      const vMax = r.maxCellVoltageMv ?? r.maxCellVoltage;
      const vDelta = r.maxCellVoltageDeltaMv ?? r.cellVoltageDelta;
      
      const tMin = r.lowCellTempC ?? r.minCellTemperature;
      const tAvg = r.avgCellTempC ?? r.avgCellTemperature;
      const tMax = r.highCellTempC ?? r.maxCellTemperature;
      const tDelta = r.maxCellTempDeltaC ?? r.cellTemperatureDelta;

      if (vMin !== null && vMin !== undefined) minCellVoltage = Math.min(minCellVoltage, vMin);
      if (vMax !== null && vMax !== undefined) maxCellVoltage = Math.max(maxCellVoltage, vMax);
      if (vDelta !== null && vDelta !== undefined) maxCellVoltageDelta = Math.max(maxCellVoltageDelta, vDelta);
      if (vAvg !== null && vAvg !== undefined) {
        totalVolt += vAvg;
        countVolt++;
      }

      if (tMin !== null && tMin !== undefined) lowCellTempC = Math.min(lowCellTempC, tMin);
      if (tMax !== null && tMax !== undefined) highCellTempC = Math.max(highCellTempC, tMax);
      if (tDelta !== null && tDelta !== undefined) maxCellTempDelta = Math.max(maxCellTempDelta, tDelta);
      if (tAvg !== null && tAvg !== undefined) {
        totalTemp += tAvg;
        countTemp++;
      }
    }

    const finalMinVolt = minCellVoltage !== Infinity ? minCellVoltage : null;
    const finalMaxVolt = maxCellVoltage !== -Infinity ? maxCellVoltage : null;
    const finalAvgVolt = countVolt > 0 ? totalVolt / countVolt : (sum?.bessFleetSummary?.avgCellVoltageMv ?? null);
    const finalMaxVoltDelta = maxCellVoltageDelta !== -Infinity ? maxCellVoltageDelta : (sum?.bessFleetSummary?.maxCellVoltageDeltaMv ?? null);

    const finalLowTemp = lowCellTempC !== Infinity ? lowCellTempC : null;
    const finalHighTemp = highCellTempC !== -Infinity ? highCellTempC : (sum?.bessFleetSummary?.maxCellTempC ?? null);
    const finalAvgTemp = countTemp > 0 ? totalTemp / countTemp : (sum?.bessFleetSummary?.avgCellTempC ?? null);
    const finalMaxTempDelta = maxCellTempDelta !== -Infinity ? maxCellTempDelta : (sum?.bessFleetSummary?.maxCellTempDeltaC ?? null);

    return {
      minCellVoltage: finalMinVolt,
      avgCellVoltage: finalAvgVolt,
      maxCellVoltage: finalMaxVolt,
      maxCellVoltageDelta: finalMaxVoltDelta,
      lowCellTemp: finalLowTemp,
      avgCellTemp: finalAvgTemp,
      highCellTemp: finalHighTemp,
      maxCellTempDelta: finalMaxTempDelta
    };
  };

  const metrics = getCellMetrics();

  const handleActionClick = (target: any) => {
    const arrayNum = target.arrayIndex ?? target.arrayNumber;
    const stringNum = target.stringIndex ?? target.stringNumber;
    const deviceIp = target.ip ?? target.deviceIp;
    const source = (target.source ?? "").toLowerCase();

    if (source.includes("pcs") || target.faultName?.toLowerCase().includes("pcs") || target.suggestedAction?.toLowerCase().includes("pcs")) {
      localStorage.setItem("prizm_selected_pcs_id", "pcs-" + (target.pcsIndex ?? target.arrayIndex ?? 1));
      navigate("pcs-dashboard");
      return true;
    }

    if (source.includes("feather") || source.includes("hvac") || deviceIp) {
      if (deviceIp) {
        localStorage.setItem("prizm_selected_feather_ip", deviceIp);
      }
      if (arrayNum != null) {
        localStorage.setItem("prizm_selected_feather_array", String(arrayNum));
      }
      if (stringNum != null) {
        localStorage.setItem("prizm_selected_feather_string", String(stringNum));
      }
      navigate("feather-hvac");
      return true;
    }

    if (arrayNum != null || stringNum != null || source.includes("ems") || source.includes("string")) {
      if (arrayNum != null) {
        localStorage.setItem("prizm_selected_array", String(arrayNum));
      }
      if (stringNum != null) {
        localStorage.setItem("prizm_selected_string", String(stringNum));
      }
      navigate("arrays-strings");
      return true;
    }

    return false;
  };

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 overflow-y-auto no-scrollbar font-sans space-y-6">
      {/* Global Site Status Banner Removed (Moved to Global Header) */}

      {/* NEW TOP LAYOUT GRID: KPI BLOCKS + STRING SUMMARY */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* KPI BLOCKS */}
        <div className="lg:col-span-6 flex flex-col justify-between gap-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
            {/* 1. Topology / Status */}
            <div className="bg-prizm-surface p-4 rounded-lg border border-prizm-border flex flex-col justify-between">
              <div>
                <h3 className="text-prizm-text-muted text-[10px] font-bold uppercase tracking-wider mb-3 flex items-center gap-2 border-b border-prizm-border pb-2">
                  <BoxSelect size={14} className="text-prizm-primary" /> Topology / Status
                </h3>
                <div className="flex flex-col gap-1 text-[11px] font-mono mt-3">
                  <div className="flex justify-between pb-1 border-b border-prizm-border/50">
                    <span className="text-prizm-text-muted uppercase">Arrays</span>
                    <span className="font-bold text-prizm-text">
                      {sum?.topologyCounts?.arrayCount ?? "--"}
                    </span>
                  </div>
                  <div className="flex justify-between pb-1 border-b border-prizm-border/50">
                    <span className="text-prizm-text-muted uppercase">Strings (Total)</span>
                    <span className="font-bold text-prizm-text">
                      {sum?.topologyCounts?.stringCount ??
                        sum?.bessFleetSummary?.totalStrings ??
                        "--"}
                    </span>
                  </div>
                  <div className="flex justify-between pb-1 border-b border-prizm-border/50">
                    <span className="text-prizm-warning uppercase">Strings Warn</span>
                    <span className="font-bold text-prizm-warning">
                      {sum?.bessFleetSummary?.warningStrings ?? rollups.warnings ?? "--"}
                    </span>
                  </div>
                  <div className="flex justify-between pb-1 border-b border-prizm-border/50">
                    <span className="text-prizm-danger uppercase">Strings Alarm</span>
                    <span className="font-bold text-prizm-danger">
                      {sum?.bessFleetSummary?.alarmStrings ?? rollups.alarms ?? "--"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-prizm-text-muted uppercase">PCS Units</span>
                    <span className="font-bold text-prizm-text">
                      {sum?.topologyCounts?.pcsCount ?? "--"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Fleet Capacity */}
            <div className="bg-prizm-surface p-4 rounded-lg border border-prizm-border flex flex-col justify-between group relative">
              <div>
                <h3 className="text-prizm-text-muted text-[10px] font-bold uppercase tracking-wider mb-3 flex items-center justify-between border-b border-prizm-border pb-2">
                  <span className="flex items-center gap-2">
                    <Zap size={14} className="text-prizm-primary" /> Fleet Capacity
                  </span>
                  <span className="text-prizm-text-muted group-hover:text-prizm-text cursor-help font-mono text-[9px] border border-prizm-border px-1 rounded transition-colors">
                    HOVER BREAKDOWN
                  </span>
                </h3>

                {/* Hover Tooltip Popup panel */}
                {(() => {
                  const fc = sum?.fleetCapacity || sum?.stringSummary?.rollups?.fleetCapacity;
                  const formatVal = (v: number | null | undefined) => v != null ? (v / 1000).toFixed(2) : "Unavailable";
                  const formatMWhOrDash = (v: number | null | undefined) => v != null ? (v / 1000).toFixed(2) : "--";

                  return (
                    <div className="absolute hidden group-hover:block top-[calc(100%+8px)] left-1/2 -translate-x-1/2 w-80 max-w-[min(90vw,24rem)] bg-slate-900 border border-slate-700 text-slate-200 rounded-lg p-3 shadow-2xl z-[9999] text-[11px] font-mono space-y-2 pointer-events-none whitespace-normal">
                      <div className="font-bold border-b border-slate-700 pb-1 text-[11px] text-white uppercase tracking-wider text-center mb-2">
                        Fleet Capacity Breakdown
                      </div>
                      <div className="font-bold border-b border-slate-700 pt-1 pb-1 text-[10px] text-slate-400 uppercase tracking-wider">
                        Installed Capacity
                      </div>
                      <div className="grid grid-cols-2 gap-y-1">
                        <span>Total:</span>
                        <span className="text-right font-bold">{formatVal(fc?.installedCapacityKWh)}</span>
                        <span className="text-emerald-400">Online Installed:</span>
                        <span className="text-right">{formatVal(fc?.onlineInstalledKWh)}</span>
                        <span className="text-blue-400">Nearline Installed:</span>
                        <span className="text-right">{formatVal(fc?.nearlineInstalledKWh)}</span>
                        <span className="text-rose-400">Offline/Unavail:</span>
                        <span className="text-right">{formatVal(fc?.unavailableInstalledKWh)}</span>
                      </div>
                      <div className="font-bold border-b border-slate-700 pt-2 pb-1 text-[10px] text-slate-400 uppercase tracking-wider">
                        Stored Energy
                      </div>
                      <div className="grid grid-cols-2 gap-y-1">
                        <span>Available Stored:</span>
                        <span className="text-right font-bold">{formatMWhOrDash(fc?.availableStoredKWh)} MWh</span>
                        <span className="text-emerald-400">Online Stored:</span>
                        <span className="text-right">{formatMWhOrDash(fc?.onlineStoredKWh)} MWh</span>
                        <span className="text-blue-400">Nearline Stored:</span>
                        <span className="text-right">{formatMWhOrDash(fc?.nearlineStoredKWh)} MWh</span>
                        <span className="text-amber-400">Offline Stored:</span>
                        <span className="text-right">{formatMWhOrDash(fc?.offlineStoredKWh)} MWh</span>
                        <span className="text-rose-400">No Comm Stored:</span>
                        <span className="text-right">{formatMWhOrDash(fc?.notCommunicatingStoredKWh)} MWh</span>
                      </div>
                    </div>
                  );
                })()}

                <div className="flex flex-col mt-4">
                  {(() => {
                    const fc = sum?.fleetCapacity || sum?.stringSummary?.rollups?.fleetCapacity;
                    const formatMWhStr = (v: number | null | undefined): string => {
                      if (v == null) return "Unavailable";
                      return (v / 1000).toFixed(2);
                    };

                    const hasInstalledCapacity = fc?.installedCapacityKWh != null;
                    const hasStoredEnergy = fc?.availableStoredKWh != null;
                    const hasSoc = systemSoc !== null;

                    const primaryValue = hasInstalledCapacity
                      ? (
                        <div className="text-2xl font-bold text-prizm-text font-mono">
                          {formatMWhStr(fc.installedCapacityKWh)}
                          <span className="text-sm text-prizm-text-muted ml-1">MWh</span>
                        </div>
                      )
                      : hasStoredEnergy
                        ? (
                          <div className="text-2xl font-bold text-prizm-text font-mono">
                            {formatMWhStr(fc.availableStoredKWh)}
                            <span className="text-sm text-prizm-text-muted ml-1">MWh</span>
                          </div>
                        )
                        : hasSoc
                          ? (
                            <div className="text-2xl font-bold text-prizm-text font-mono">
                              {systemSoc.toFixed(1)}
                              <span className="text-sm text-prizm-text-muted ml-1">%</span>
                            </div>
                          )
                          : (
                            <div className="text-xl font-bold text-amber-500 font-mono">
                              Unavailable
                            </div>
                          );

                    const primaryLabel = hasInstalledCapacity
                      ? "Installed Capacity"
                      : "Fleet Capacity";

                    return (
                      <>
                        {primaryValue}
                        <div className="text-[10px] text-prizm-text-muted mt-0.5 mb-2 font-mono uppercase tracking-wider">{primaryLabel}</div>

                        <div className="mt-2 space-y-1 text-[10px] font-sans">
                          <div className="flex justify-between items-center">
                            <span className="text-prizm-text-muted">SOC Status:</span>
                            <span className={`font-mono font-bold ${hasSoc ? 'text-prizm-data-green' : 'text-prizm-text-muted'}`}>
                              {hasSoc ? `${systemSoc!.toFixed(1)}%` : "Unavailable"}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-prizm-text-muted">Limits Charge:</span>
                            <span className="font-mono font-bold text-prizm-text-muted">
                              {fc?.availableChargeKW != null ? `${(fc.availableChargeKW / 1000).toFixed(1)} MW` : "--"}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-prizm-text-muted">Discharge Limit:</span>
                            <span className="font-mono font-bold text-prizm-text-muted">
                              {fc?.availableDischargeKW != null ? `${(fc.availableDischargeKW / 1000).toFixed(1)} MW` : "--"}
                            </span>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* 3. Cell Metrics (Consolidated) */}
            <div className="bg-prizm-surface p-4 rounded-lg border border-prizm-border flex flex-col justify-between">
              <div>
                <h3 className="text-prizm-text-muted text-[10px] font-bold uppercase tracking-wider mb-3 flex items-center gap-2 border-b border-prizm-border pb-2">
                  <Activity size={14} className="text-prizm-primary" /> Cell Metrics
                </h3>
                <div className="space-y-2 mt-4 font-mono text-[10px]">
                  <div className="flex justify-between items-center">
                    <span className="text-prizm-text-muted uppercase font-bold tracking-wider">
                      Avg Voltage
                    </span>
                    <div className="font-bold text-prizm-text">
                      {metrics.avgCellVoltage != null && normalizeVoltage(metrics.avgCellVoltage) !== null
                        ? `${normalizeVoltage(metrics.avgCellVoltage)!.toFixed(1)} mV`
                        : "--"}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-prizm-text-muted uppercase font-bold tracking-wider">
                      Volt Max Δ
                    </span>
                    <div className="font-bold text-prizm-text">
                      {metrics.maxCellVoltageDelta != null && normalizeDeltaVoltage(metrics.maxCellVoltageDelta) !== null
                        ? `Δ ${normalizeDeltaVoltage(metrics.maxCellVoltageDelta)!.toFixed(0)} mV`
                        : "--"}
                    </div>
                  </div>
                  <div className="flex justify-between items-center border-t border-prizm-border/40 pt-1.5 mt-1.5">
                    <span className="text-prizm-text-muted uppercase font-bold tracking-wider">
                      Avg Temp
                    </span>
                    <div className="font-bold text-prizm-text">
                      {metrics.avgCellTemp != null
                        ? formatTemperatureF(metrics.avgCellTemp, { decimals: 1, showUnit: true, sourceUnit: "C" })
                        : "--"}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-prizm-text-muted uppercase font-bold tracking-wider">
                      Temp Max Δ
                    </span>
                    <div className="font-bold text-prizm-text">
                      {metrics.maxCellTempDelta != null
                        ? `Δ ${(metrics.maxCellTempDelta * 1.8).toFixed(1)}°F`
                        : "--"}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-prizm-text-muted uppercase font-bold tracking-wider">
                      Max Temp
                    </span>
                    <div className="font-bold text-prizm-danger">
                      {metrics.highCellTemp != null
                        ? formatTemperatureF(metrics.highCellTemp, { decimals: 1, showUnit: true, sourceUnit: "C" })
                        : "--"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      {/* STRING SUMMARY TABLE */}
      <div className="lg:col-span-6 flex flex-col">
        <div className="bg-prizm-surface border border-prizm-border rounded-lg flex flex-col h-full">
          <h3 className="text-prizm-text-muted text-[10px] font-bold uppercase tracking-wider p-3 flex items-center justify-between border-b border-prizm-border">
            <span className="flex items-center gap-2">
              <Rows4 size={14} className="text-prizm-text" /> STRING SUMMARY
            </span>
            <button
              onClick={() => navigate("arrays-strings")}
              className="text-[9px] px-2 py-0.5 uppercase tracking-widest text-prizm-primary hover:bg-prizm-primary/10 rounded border border-prizm-primary/30 transition-colors"
            >
              Detailed View
            </button>
          </h3>
          <div className="overflow-x-auto no-scrollbar flex-1">
            {(sum?.stringSummary?.tableRows && sum.stringSummary.tableRows.length > 0) ||
            (sum?.stringSummary?.buckets &&
              Object.values(sum.stringSummary.buckets).some((v) => Number(v) > 0)) ? (
              <div className="overflow-x-auto overflow-y-auto max-h-[350px] w-full no-scrollbar">
                <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                  <thead className="bg-prizm-surface-strong text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border sticky top-0 z-10">
                    <tr>
                      <th className="py-1 px-2 font-bold min-w-[200px]">
                        Parameter
                      </th>
                      <th className="py-1 px-2 font-bold text-center border-l border-prizm-border text-prizm-data-green">
                        Online
                      </th>
                      <th className="py-1 px-2 font-bold text-center border-l border-prizm-border text-[#166534]">
                        Nearline
                      </th>
                      <th className="py-1 px-2 font-bold text-center border-l border-prizm-border text-prizm-text-muted">
                        Offline
                      </th>
                      <th className="py-1 px-2 font-bold text-center border-l border-prizm-border text-prizm-danger">
                        Not Comm
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-prizm-border">
                    {(() => {
                      const formatVal = (
                        v: any,
                        suffix = "",
                        toFixed = 1,
                      ) => {
                        if (v === null || v === undefined) return "--";
                        const num = Number(v);
                        if (isNaN(num)) return "--";
                        return (
                          num.toFixed(toFixed).replace(/\.0+$/, "") +
                          (suffix ? " " + suffix : "")
                        );
                      };
                      const buckets = [
                        "online",
                        "nearline",
                        "offline",
                        "notCommunicating",
                      ];
                      const renderRow = (
                        label: string,
                        field: string,
                        suffix = "",
                        toFixed = 1,
                      ) => {
                        const isTemp = field.endsWith("TempC") || field.endsWith("TemperatureC");
                        const isTempDelta = field.endsWith("TempDeltaC") || field.endsWith("TemperatureDeltaC");
                        const isVoltage = field.toLowerCase().includes("voltage") || field.toLowerCase().includes("volt");
                        const isVoltageDelta = isVoltage && field.toLowerCase().includes("delta");
                        const displaySuffix = (isTemp || isTempDelta) ? "°F" : suffix;

                        return (
                          <tr className="hover:bg-prizm-surface transition-colors">
                            <td className="py-1 px-2 text-prizm-text-muted">
                              {label}
                            </td>
                            {buckets.map((b, i) => {
                              let val = sum.stringSummary.rollups?.[b]?.[field];
                              if (val !== null && val !== undefined && !isNaN(Number(val))) {
                                if (isTemp) {
                                  val = Number(val) * 1.8 + 32;
                                } else if (isTempDelta) {
                                  val = Number(val) * 1.8;
                                } else if (isVoltageDelta) {
                                  val = normalizeDeltaVoltage(Number(val));
                                } else if (isVoltage) {
                                  val = normalizeVoltage(Number(val));
                                }
                              }
                              return (
                                <td
                                  key={i}
                                  className={`py-1 px-2 text-center border-l border-prizm-border ${b === "online" ? "text-prizm-data-green font-bold" : b === "nearline" ? "text-[#166534] font-medium" : b === "notCommunicating" ? "text-prizm-danger font-bold" : "text-prizm-text-muted"}`}
                                >
                                  {formatVal(val, displaySuffix, toFixed)}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      };

                      const renderSocRow = () => (
                        <tr className="hover:bg-prizm-surface transition-colors">
                          <td className="py-1 px-2 text-prizm-text-muted">
                            SOC (kWh)
                          </td>
                          {buckets.map((b, i) => {
                            let soc =
                              sum.stringSummary.rollups?.[b]?.socPctAvg;
                            let kwh = sum.stringSummary.rollups?.[b]?.kWhAvg;
                            let txt = "--";
                            if (soc !== null && soc !== undefined)
                              txt = formatVal(soc, "%");
                            if (kwh !== null && kwh !== undefined)
                              txt += " (" + formatVal(kwh, "kWh") + ")";
                            const finalTxt =
                              txt === "--"
                                ? "--"
                                : txt
                                    .replace(/^-- \((.*?)\)$/, "$1")
                                    .replace(/^(.*?) \(--\)$/, "$1");
                            return (
                              <td
                                key={i}
                                className={`py-1 px-2 text-center border-l border-prizm-border ${b === "online" ? "text-prizm-data-green font-bold" : b === "nearline" ? "text-[#166534] font-medium" : b === "notCommunicating" ? "text-prizm-danger font-bold" : "text-prizm-text-muted"}`}
                              >
                                {finalTxt}
                              </td>
                            );
                          })}
                        </tr>
                      );

                      return (
                        <>
                          <tr className="hover:bg-prizm-surface transition-colors">
                            <td className="py-1 px-2 text-prizm-text-muted">
                              Strings
                            </td>
                            {buckets.map((b, i) => (
                              <td
                                key={i}
                                className={`py-1 px-2 text-center border-l border-prizm-border ${b === "online" ? "text-prizm-data-green font-bold" : b === "nearline" ? "text-[#166534] font-medium" : b === "notCommunicating" ? "text-prizm-danger font-bold" : "text-prizm-text-muted"}`}
                              >
                                {sum.stringSummary.buckets?.[b] ??
                                  sum.stringSummary.rollups?.[b]?.count ??
                                  0}
                              </td>
                            ))}
                          </tr>
                          <tr className="hover:bg-prizm-surface transition-colors">
                            <td className="py-1 px-2 text-prizm-text-muted">
                              Connection Permitted
                            </td>
                            {buckets.map((b, i) => (
                              <td
                                key={i}
                                className={`py-1 px-2 text-center border-l border-prizm-border ${b === "online" ? "text-prizm-data-green font-bold" : b === "nearline" ? "text-[#166534] font-medium" : b === "notCommunicating" ? "text-prizm-danger font-bold" : "text-prizm-text-muted"}`}
                              >
                                {b === "online" || b === "nearline"
                                  ? (sum.stringSummary.buckets?.[b] ??
                                    sum.stringSummary.rollups?.[b]?.count ??
                                    0)
                                  : "--"}
                              </td>
                            ))}
                          </tr>
                          {renderSocRow()}
                          {renderRow(
                            "Max Current (A)",
                            "maxCurrentA",
                            "A",
                            1,
                          )}
                          {renderRow(
                            "Min Current (A)",
                            "minCurrentA",
                            "A",
                            1,
                          )}
                          {renderRow(
                            "Max Cell Voltage (mV)",
                            "maxCellVoltageMv",
                            "mV",
                            0,
                          )}
                          {renderRow(
                            "Average Cell Voltage (mV)",
                            "avgCellVoltageMv",
                            "mV",
                            0,
                          )}
                          {renderRow(
                            "Min Cell Voltage (mV)",
                            "minCellVoltageMv",
                            "mV",
                            0,
                          )}
                          {renderRow(
                            "Max Cell Voltage Delta (mV)",
                            "maxCellVoltageDeltaMv",
                            "mV",
                            0,
                          )}
                          {renderRow(
                            "High Cell Temp (°F)",
                            "highCellTempC",
                            "°F",
                            1,
                          )}
                          {renderRow(
                            "Average Cell Temp (°F)",
                            "avgCellTempC",
                            "°F",
                            1,
                          )}
                          {renderRow(
                            "Low Cell Temp (°F)",
                            "lowCellTempC",
                            "°F",
                            1,
                          )}
                          {renderRow(
                            "Max Cell Temp Delta (°F)",
                            "maxCellTempDeltaC",
                            "°F",
                            1,
                          )}
                        </>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 text-[10px] font-mono uppercase text-prizm-text-muted">
                No String Summary available
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* FULL-WIDTH CORRECTIVE ACTIONS CARD */}
    <div className="bg-prizm-surface border border-prizm-border rounded-lg flex flex-col w-full">
      <h3 className="text-prizm-text-muted text-[10px] font-bold uppercase tracking-wider p-3 flex items-center justify-between border-b border-prizm-border">
        <span className="flex items-center gap-2">
          <TriangleAlert size={14} className="text-prizm-danger" />{" "}
          CORRECTIVE ACTIONS (DATA-BASED FAULTS)
        </span>
        <span className="text-[9px] text-prizm-text-muted tracking-wider uppercase font-mono">
          Click row to expand • Click target to drill-down
        </span>
      </h3>
      <div className="overflow-x-auto no-scrollbar flex-1">
        <div className="max-h-[450px] overflow-y-auto no-scrollbar">
          {sum?.correctiveActions && sum.correctiveActions.length > 0 ? (
            <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
              <thead className="bg-prizm-surface-strong text-[10px] text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border sticky top-0 z-10">
                <tr>
                  <th className="py-2 px-3 font-bold w-1/12">Level</th>
                  <th className="py-2 px-3 font-bold w-2/12">Fault / ID</th>
                  <th className="py-2 px-3 font-bold w-2/12">Affected Summary</th>
                  <th className="py-2 px-3 font-bold w-7/12">Suggested Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-prizm-border">
                {sum.correctiveActions
                  .filter((issue: any) => {
                    const name = (issue.faultName || issue.fault || "").toLowerCase();
                    const code = String(issue.code || issue.faultId || "");
                    if (code === "2534" || code === "2561" || name.includes("2534") || name.includes("2561")) {
                      return false;
                    }
                    return true;
                  })
                  .map((issue: any, i: number) => {
                  const hasOccurrences =
                    (Array.isArray(issue.occurrences) &&
                      issue.occurrences.length > 0) ||
                    (Array.isArray(issue.affected) &&
                      issue.affected.length > 0);
                  const isExpanded = !!expandedCorrectiveActions[i];
                  return (
                    <React.Fragment key={i}>
                      <tr
                        className={`${hasOccurrences ? "cursor-pointer hover:bg-prizm-surface-strong/70" : "hover:bg-prizm-surface"} transition-colors`}
                        onClick={() =>
                          hasOccurrences && toggleCorrectiveAction(i)
                        }
                      >
                        <td className="py-2 px-3">
                          <span
                            className={`px-2 py-[2px] rounded font-bold ${issue.level === "FAULT" || issue.level === "ALARM" ? "bg-prizm-danger/10 text-prizm-danger" : "bg-prizm-warning/10 text-prizm-warning"}`}
                          >
                            {issue.level}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-prizm-primary font-bold">
                          <div className="flex items-center gap-1.5">
                            {hasOccurrences && (
                              <span className="inline-flex items-center">
                                {isExpanded ? (
                                  <ChevronDown
                                    size={12}
                                    className="text-prizm-text-muted"
                                  />
                                ) : (
                                  <ChevronRight
                                    size={12}
                                    className="text-prizm-text-muted"
                                  />
                                )}
                              </span>
                            )}
                            <span>{issue.faultName || issue.fault}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-prizm-text font-bold">
                          {issue.affectedSummary || issue.object}
                        </td>
                        <td className="py-2 px-3 text-prizm-text flex items-center justify-between gap-4">
                          <span>{issue.suggestedAction}</span>
                          {issue.suggestedAction
                            ?.toLowerCase()
                            .includes("balance") ||
                          issue.suggestedAction
                            ?.toLowerCase()
                            .includes("balancing") ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleActionClick(issue);
                              }}
                              className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded uppercase tracking-widest text-[9px] hover:bg-blue-500/20 transition-colors"
                            >
                              Inspect Strings
                            </button>
                          ) : null}
                        </td>
                      </tr>
                      {hasOccurrences && isExpanded && (
                        <tr className="bg-black/25">
                          <td
                            colSpan={4}
                            className="py-3 px-4 border-l-2 border-prizm-danger"
                          >
                            <div className="text-[10px] uppercase tracking-wider text-prizm-text-muted mb-2 font-bold font-sans flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-prizm-danger animate-pulse"></span>
                              All Affected targets ({issue.affected ? issue.affected.length : issue.occurrences.length}):
                              <span className="text-[9px] lowercase font-normal italic text-prizm-text-muted">(click row/target to drill down directly)</span>
                            </div>
                            {issue.affected &&
                            issue.affected.length > 0 ? (
                              <div className="border border-prizm-border/40 rounded overflow-hidden max-h-[220px] overflow-y-auto no-scrollbar">
                                <table className="w-full text-[9px] font-mono text-left whitespace-nowrap bg-prizm-surface-strong/30">
                                  <thead className="bg-prizm-surface-strong/80 text-prizm-text-muted uppercase tracking-wider border-b border-prizm-border/30 sticky top-0">
                                    <tr>
                                      <th className="py-1.5 px-3 font-bold">
                                        Block
                                      </th>
                                      <th className="py-1.5 px-3 font-bold">
                                        Array
                                      </th>
                                      <th className="py-1.5 px-3 font-bold">
                                        ES / String / Side
                                      </th>
                                      <th className="py-1.5 px-3 font-bold">
                                        BPC
                                      </th>
                                      <th className="py-1.5 px-3 font-bold">
                                        CG
                                      </th>
                                      <th className="py-1.5 px-3 font-bold">
                                        Device IP / Callout
                                      </th>
                                      <th className="py-1.5 px-3 font-bold">
                                        Source
                                      </th>
                                      <th className="py-1.5 px-3 font-bold">
                                        Raw Fault / Code
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-prizm-border/20">
                                    {issue.affected.map(
                                      (aff: any, affIdx: number) => (
                                        <tr
                                          key={affIdx}
                                          className="hover:bg-prizm-primary/10 cursor-pointer transition-colors"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleActionClick(aff);
                                          }}
                                        >
                                          <td className="py-1.5 px-3 text-prizm-text-muted">
                                            B{aff.blockIndex ?? 1}
                                          </td>
                                          <td className="py-1.5 px-3 text-prizm-text">
                                            A{aff.arrayIndex ?? aff.arrayNumber ?? "N/A"}
                                          </td>
                                          <td className="py-1.5 px-3 text-prizm-text">
                                            {(() => {
                                              const sNum = aff.stringIndex ?? aff.stringNumber;
                                              if (sNum && sNum > 0) {
                                                const es = aff.energySegmentNumber ?? Math.ceil(sNum / 2);
                                                const side = aff.stringSide ?? (sNum % 2 === 1 ? "A-Side" : "B-Side");
                                                return `ES${es} – String ${sNum} – ${side}`;
                                              }
                                              return aff.stringIndex != null ? `ES${aff.stringIndex}` : "N/A";
                                            })()}
                                          </td>
                                          <td className="py-1.5 px-3 text-prizm-text">
                                            {aff.bpcIndex ?? aff.batteryPackIndex ?? "—"}
                                          </td>
                                          <td className="py-1.5 px-3 text-prizm-text">
                                            {aff.cellGroupIndex ?? aff.cgIndex ?? "—"}
                                          </td>
                                          <td className="py-1.5 px-3 text-prizm-primary font-semibold">
                                            {aff.deviceIp && aff.deviceIp !== "Unavailable" ? aff.deviceIp : (aff.callout || "Unavailable")}
                                          </td>
                                          <td className="py-1.5 px-3 text-prizm-text">
                                            <span
                                              className={`px-1 rounded text-[8px] font-bold ${
                                                aff.source === "array-notifications" ? "bg-indigo-500/10 text-indigo-400" :
                                                aff.source === "strings" ? "bg-amber-500/10 text-amber-400" :
                                                aff.source === "feather" ? "bg-teal-500/10 text-teal-400" :
                                                aff.source === "pcs" ? "bg-rose-500/10 text-rose-400" :
                                                "bg-gray-500/10 text-gray-400"
                                              }`}
                                            >
                                              {aff.source || "unknown"}
                                            </span>
                                          </td>
                                          <td
                                            className="py-1.5 px-3 text-prizm-danger truncate max-w-[200px]"
                                            title={aff.rawFault || aff.rawCode || aff.code}
                                          >
                                            {(() => {
                                              const code = aff.rawCode || aff.code;
                                              const msg = aff.triggerMessage || aff.message;
                                              const name = aff.rawFault || aff.faultName;
                                              if (code) {
                                                return msg ? `${code} / ${msg}` : String(code);
                                              }
                                              return name || "Unavailable";
                                            })()}
                                          </td>
                                        </tr>
                                      ),
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 py-1 max-h-[160px] overflow-y-auto no-scrollbar">
                                {(issue.occurrences || []).map(
                                  (occ: any, oIdx: number) => {
                                    const label =
                                      occ.enclosureLabel ||
                                      occ.deviceIp ||
                                      occ.endpoint ||
                                      "Unknown Unit";
                                    return (
                                      <div
                                        key={oIdx}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleActionClick({
                                            ...occ,
                                            ip: occ.deviceIp || occ.endpoint,
                                            source: issue.source || (occ.deviceIp ? "hvac" : "ems")
                                          });
                                        }}
                                        className="flex items-center gap-1.5 px-2 py-1 bg-prizm-surface rounded border border-prizm-border/30 text-[9px] text-prizm-text font-mono hover:bg-prizm-primary/15 hover:border-prizm-primary/60 cursor-pointer transition-all"
                                        title={`${label} - Click to Inspect`}
                                      >
                                        <span className="w-1 h-1 rounded-full bg-prizm-warning animate-pulse flex-shrink-0"></span>
                                        <span
                                          className="truncate font-semibold"
                                          title={label}
                                        >
                                          {label}
                                        </span>
                                      </div>
                                    );
                                  },
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="p-4 text-[10px] text-prizm-text-muted uppercase font-mono">
              No active corrective actions detected.
            </div>
          )}
        </div>
      </div>
    </div>

      {/* ARRAY SUMMARY ROW */}
      <div className="mt-2 text-prizm-text">
        <div className="bg-prizm-surface border border-prizm-border rounded-lg flex flex-col mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-prizm-surface-strong/50 border-b border-prizm-border">
            <div className="flex items-center gap-2">
              <PanelTop size={14} className="text-prizm-primary" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-prizm-text">
                ARRAY SUMMARY
              </span>
            </div>
            {/* Visual Legend */}
            <div className="flex flex-wrap items-center gap-4 text-[9px] font-medium font-sans">
              <div
                className="flex items-center gap-1.2"
                title="Communicating, in rotation, contactors closed. Fully operational."
              >
                <span className="w-2 h-2 rounded-sm bg-emerald-500/20 border border-emerald-500/50 flex-shrink-0"></span>
                <span className="text-prizm-data-green font-bold uppercase">
                  Online
                </span>
                <span className="text-prizm-text-muted lowercase">
                  (closed contactor, active)
                </span>
              </div>
              <div
                className="flex items-center gap-1.2"
                title="Communicating, in rotation, but contactors are open. Ready for load reservation."
              >
                <span className="w-2 h-2 rounded-sm bg-amber-500/20 border border-amber-500/50 flex-shrink-0"></span>
                <span className="text-amber-400 font-bold uppercase">
                  Nearline
                </span>
                <span className="text-prizm-text-muted lowercase">
                  (open contactor, reserve)
                </span>
              </div>
              <div
                className="flex items-center gap-1.2"
                title="Loss comms or out-of-rotation. Disabled/offline."
              >
                <span className="w-2 h-2 rounded-sm bg-red-500/20 border border-red-500/50 flex-shrink-0"></span>
                <span className="text-red-400 font-bold uppercase">
                  Offline
                </span>
                <span className="text-prizm-text-muted lowercase">
                  (disconnected/disabled)
                </span>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto no-scrollbar">
            {arraySummaryData.length > 0 ? (
              <div className="overflow-x-auto overflow-y-auto max-h-[450px] w-full no-scrollbar">
                <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                  <thead className="bg-prizm-surface-strong text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border sticky top-0 z-10">
                    <tr>
                      <th className="py-1.5 px-2 font-bold min-w-[120px]">
                        Array
                      </th>
                      <th className="py-1.5 px-2 font-bold text-center">
                        Comm.
                      </th>
                      <th
                        className="py-1.5 px-2 font-bold text-center bg-emerald-500/5 text-prizm-data-green border-x border-prizm-border/10"
                        title="State of Charge for active Operational strings (Communicating, In-Rotation, Closed Contactors)"
                      >
                        Online SOC
                      </th>
                      <th
                        className="py-1.5 px-2 font-bold text-center bg-amber-500/5 text-amber-400 border-x border-prizm-border/10"
                        title="State of Charge for Reserve strings (Communicating, In-Rotation, Open Contactors)"
                      >
                        Nearline SOC
                      </th>
                      <th
                        className="py-1.5 px-2 font-bold text-center bg-red-500/5 text-red-400 border-x border-prizm-border/10"
                        title="State of Charge for Out-Of-Service strings (Disconnected or Out-Of-Rotation)"
                      >
                        Offline SOC
                      </th>
                      <th
                        className="py-1.5 px-2 font-bold text-center bg-amber-500/5 text-amber-400 border-x border-prizm-border/10"
                        title="Reserve energy metrics (kWh) waiting for contactor closing"
                      >
                        Nearline kWh
                      </th>
                      <th className="py-1.5 px-2 font-bold text-center">
                        Available kW AC (Chg / Dis)
                      </th>
                      <th className="py-1.5 px-2 font-bold text-center">
                        Commanded kW AC
                      </th>
                      <th className="py-1.5 px-2 font-bold text-center">
                        Measured kW AC
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-prizm-border">
                    {arraySummaryData.map((arr: any, idx: number) => {
                      const name =
                        arr.friendlyString ||
                        "Array " +
                          (arr.arrayNumber ?? arr.arrayIndex ?? idx + 1);
                      const formatSOC = (val: any) => {
                        if (!hasVal(val)) return "--";
                        const numVal = Number(val);
                        if (isNaN(numVal)) return "--";
                        return (
                          (numVal < 1 ? numVal * 100 : numVal)
                            .toFixed(1)
                            .replace(/\.0$/, "") + " %"
                        );
                      };
                      const formatVal = (val: any, suffix = "") => {
                        if (!hasVal(val)) return "--";
                        return String(val) + (suffix ? " " + suffix : "");
                      };
                      const hasChargeDischarge =
                        hasVal(arr.availableACChargekW) &&
                        hasVal(arr.availableACDischargekW);
                      let chargeDischargeDisplay = "--";
                      if (hasChargeDischarge) {
                        chargeDischargeDisplay =
                          String(arr.availableACChargekW) +
                          " / " +
                          String(arr.availableACDischargekW);
                      }
                      return (
                        <tr
                          key={idx}
                          className="hover:bg-prizm-surface transition-colors cursor-pointer"
                          onClick={() => navigate("arrays-strings")}
                        >
                          <td className="py-1.5 px-2 text-prizm-primary font-bold">
                            {name}
                          </td>
                          <td className="py-1.5 px-2 text-center text-prizm-data-green font-bold">
                            {arr.communicating !== false ? (
                              "OK"
                            ) : (
                              <XOctagon
                                size={12}
                                className="inline text-prizm-danger"
                              />
                            )}
                          </td>
                          <td
                            className="py-1.5 px-2 text-center text-prizm-data-green font-bold bg-emerald-500/5 border-x border-prizm-border/10"
                            title="Active fully integrated BESS strings"
                          >
                            {formatSOC(arr.onlineSOC)}
                          </td>
                          <td
                            className="py-1.5 px-2 text-center text-amber-400 font-semibold bg-amber-500/5 border-x border-prizm-border/10"
                            title="Ready reserve strings waiting for load reservation"
                          >
                            {formatSOC(arr.nearlineSOC)}
                          </td>
                          <td
                            className="py-1.5 px-2 text-center text-prizm-text-muted bg-red-500/5 border-x border-prizm-border/10"
                            title="Strings excluded or lost connection"
                          >
                            {formatSOC(arr.offlineSOC)}
                          </td>
                          <td
                            className="py-1.5 px-2 text-center text-amber-400 bg-amber-500/5 border-x border-prizm-border/10"
                            title="Stored energy potential (kWh) ready to turn online"
                          >
                            {formatVal(arr.nearlineAvailableKWh, "kWh")}
                          </td>
                          <td className="py-1.5 px-2 text-center text-prizm-text">
                            {chargeDischargeDisplay}
                          </td>
                          <td className="py-1.5 px-2 text-center text-prizm-warning">
                            {formatVal(arr.commandedkW)}
                          </td>
                          <td className="py-1.5 px-2 text-center text-prizm-text">
                            {formatVal(arr.measuredkW)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 text-[10px] font-mono uppercase text-prizm-text-muted">
                {sum?.debug?.arraySummarySynthesis?.rejectedArrayZeroFallback || (sum?.debug?.arraySummaryRepair && !sum?.debug?.arraySummaryRepair?.used) ? (
                  <span className="text-amber-500 font-semibold">
                    Array grouping is warming up or unavailable. No valid arrays (1-8) mapped.
                  </span>
                ) : (
                  "No Array Summary available"
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* EMS Apps */}
      <div className="bg-prizm-surface border border-prizm-border rounded-lg flex flex-col mt-4">
        <div className="flex items-center justify-between p-3 border-b border-prizm-border">
          <div className="flex items-center gap-2">
            <BoxSelect size={14} className="text-prizm-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-prizm-text">
              EMS APPS
            </span>
          </div>
          <button
            onClick={() => setIsAdvancedMode(!isAdvancedMode)}
            className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded border transition-colors ${
              isAdvancedMode
                ? "bg-amber-500/10 border-amber-500/50 text-amber-500 hover:bg-amber-500/20"
                : "bg-prizm-surface-strong border-prizm-border text-prizm-text hover:bg-white/5"
            }`}
          >
            {isAdvancedMode ? <Unlock size={12} /> : <Lock size={12} />}
            {isAdvancedMode
              ? "Advanced Controls Unlocked"
              : "Unlock Advanced Controls"}
          </button>
        </div>
        {emsAppsData.length > 0 ? (
          <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
            <thead className="bg-prizm-surface-strong text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border">
              <tr>
                <th className="py-1 px-2 font-bold text-center">Pri</th>
                <th className="py-1 px-2 font-bold">App Code</th>
                <th className="py-1 px-2 font-bold">App Name</th>
                {isAdvancedMode && (
                  <th className="py-1 px-2 font-bold text-center">Action</th>
                )}
                <th className="py-1 px-2 font-bold">Configuration</th>
                <th className="py-1 px-2 font-bold text-center">Status</th>
                <th className="py-1 px-2 font-bold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-prizm-border">
              {emsAppsData.map((app: any, idx: number) => {
                let displayStatus =
                  app.status || (app.enabled ? "Enabled" : "Not Enabled");
                let statusColor = "bg-slate-500/10 text-slate-400";

                const h = String(
                  app.healthRaw || app.health || displayStatus || "",
                ).toUpperCase();
                if (h.includes("FAULT")) {
                  displayStatus = "Faulted";
                  statusColor = "bg-prizm-danger/10 text-prizm-danger";
                } else if (h.includes("WARN")) {
                  displayStatus = "Warning";
                  statusColor = "bg-prizm-warning/10 text-prizm-warning";
                } else if (
                  h.includes("HEALTHY") ||
                  displayStatus.toUpperCase() === "ENABLED"
                ) {
                  displayStatus = "Enabled";
                  statusColor = "bg-emerald-500/10 text-emerald-500";
                } else if (h.includes("UNAVAIL") || h.includes("OFFLINE")) {
                  displayStatus = "Unavailable";
                  statusColor = "bg-prizm-danger/10 text-prizm-danger";
                }

                return (
                  <tr
                    key={idx}
                    className="hover:bg-prizm-surface transition-colors"
                  >
                    <td className="py-1 px-2 text-center text-prizm-text-muted">
                      {app.priority !== undefined && app.priority !== null
                        ? app.priority
                        : "--"}
                    </td>
                    <td className="py-1 px-2 text-prizm-text font-bold">
                      {app.appCode || "--"}
                    </td>
                    <td className="py-1 px-2 text-prizm-primary font-bold">
                      {app.appName || "--"}
                    </td>
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
                          {app.enabled ? (
                            <>
                              <Pause size={10} /> Disable
                            </>
                          ) : (
                            <>
                              <Play size={10} /> Enable
                            </>
                          )}
                        </button>
                      </td>
                    )}
                    <td className="py-1 px-2 text-prizm-text-muted text-xs">
                      {app.configName || "--"}{" "}
                      {app.configVersionId ? `(v${app.configVersionId})` : ""}
                    </td>
                    <td className="py-1 px-2 text-center">
                      <span
                        className={`px-2 py-[2px] rounded font-bold ${statusColor}`}
                      >
                        {displayStatus}
                      </span>
                    </td>
                    <td className="py-1 px-2 text-prizm-text whitespace-pre-wrap leading-tight">
                      {(app.hasShortAppStatus && app.shortAppStatus
                        ? app.shortAppStatus
                        : app.appStatus || "--"
                      ).replace(/<br\s*\/?>/gi, "\n")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="p-4 text-[10px] font-mono uppercase text-prizm-text-muted">
            No EMS Apps data discovered
          </div>
        )}
      </div>

      {/* Safety & Source Health */}
      <CollapsibleSection
        title="Safety Fault Candidates"
        icon={ShieldAlert}
        defaultExpanded={false}
      >
        {safetyEligible > 0 ? (
          <div>
            <div className="bg-prizm-surface p-4 flex flex-col justify-center items-center border-b border-prizm-border">
              <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">
                Clearable Faults
              </div>
              <div className="text-2xl font-bold font-mono text-prizm-danger animate-pulse">
                {safetyEligible}
              </div>
            </div>
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                <thead className="bg-prizm-surface-strong text-prizm-text-muted uppercase tracking-widest border-b border-prizm-border">
                  <tr>
                    <th className="py-1 px-2 font-bold">Entity</th>
                    <th className="py-1 px-2 font-bold min-w-[200px]">
                      Status Message
                    </th>
                    <th className="py-1 px-2 font-bold text-center">Enabled</th>
                    <th className="py-1 px-2 font-bold text-center">Source</th>
                    <th className="py-1 px-2 font-bold text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-prizm-border">
                  {clearableFaults.map((f: any, idx: number) => (
                    <tr
                      key={idx}
                      className="hover:bg-prizm-surface transition-colors"
                    >
                      <td className="py-1 px-2 font-bold text-prizm-primary">
                        {f.displayKey || f.entityKey}
                      </td>
                      <td className="py-1 px-2 text-prizm-text whitespace-pre-wrap max-w-sm">
                        {f.statusMessageText || f.statusMessage}
                      </td>
                      <td className="py-1 px-2 text-center text-prizm-text-muted">
                        {f.enabled ? "Yes" : "No"}
                      </td>
                      <td className="py-1 px-2 text-center text-prizm-text-muted uppercase">
                        {f.source}
                      </td>
                      <td className="py-1 px-2 text-center">
                        <button
                          onClick={() => setClearCandidate(f)}
                          className="px-2 py-1 bg-prizm-danger/10 text-prizm-danger rounded hover:bg-prizm-danger hover:text-white transition-colors"
                        >
                          Clear
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="p-4 text-[10px] font-mono uppercase text-prizm-text-muted border-b border-prizm-border">
            {clearableFaults.length === 0
              ? "Safety Faults API Unavailable"
              : "No clearable safety faults detected."}
          </div>
        )}
        <div className="bg-prizm-surface p-3 flex justify-end border-t border-prizm-border">
          <button
            onClick={() => navigate("safety-fault")}
            className="text-[10px] font-bold uppercase tracking-widest font-mono bg-prizm-danger/10 text-prizm-danger px-4 py-2 hover:bg-prizm-danger/20 transition-colors border border-prizm-danger/30 rounded"
          >
            Open Safety Fault Clear
          </button>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Source / Cache Health"
        icon={Network}
        defaultExpanded={false}
      >
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
                  <tr
                    key={i}
                    className="hover:bg-prizm-surface transition-colors"
                  >
                    <td className="py-1 px-2 font-bold text-prizm-text">
                      {src.name}
                    </td>
                    <td className="py-1 px-2 text-prizm-text-muted">
                      {src.type}
                    </td>
                    <td className="py-1 px-2">
                      <span
                        className={
                          src.ok
                            ? "text-emerald-400 font-bold flex items-center gap-1"
                            : "text-prizm-danger font-bold flex items-center gap-1"
                        }
                        title={src.error || ""}
                      >
                        {src.ok ? (
                          <>
                            <CheckCircle2 size={12} /> OK
                          </>
                        ) : (
                          <>
                            <ServerOff size={12} /> FAILED
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-4 text-[10px] text-prizm-text-muted uppercase font-mono py-4">
              No localized source data found.
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Recent Event Timeline */}
      <CollapsibleSection
        title="Recent Event Timeline"
        icon={Activity}
        defaultExpanded={false}
      >
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
                  <tr
                    key={i}
                    className="hover:bg-prizm-surface transition-colors"
                  >
                    <td className="py-1 px-2 text-prizm-text-muted">
                      {formatPrizmUtcTimestamp(e.timestamp)}
                    </td>
                    <td className="py-1 px-2">
                      <span
                        className={`px-2 py-[2px] rounded font-bold ${e.severity === "ALARM" ? "bg-prizm-danger/10 text-prizm-danger" : e.severity === "WARNING" ? "bg-prizm-warning/10 text-prizm-warning" : "bg-slate-500/10 text-slate-400"}`}
                      >
                        {e.severity}
                      </span>
                    </td>
                    <td className="py-1 px-2 font-bold text-prizm-text">
                      {e.source}
                    </td>
                    <td className="py-1 px-2 text-prizm-text whitespace-normal min-w-[200px]">
                      {e.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-4 text-[10px] text-prizm-text-muted uppercase font-mono">
              <div className="mb-1">
                No recent historical events recorded yet.
              </div>
              <div>Current active issues are shown above.</div>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* PRIZM Cache Orchestration Telemetry Footer */}
      <div className="mt-6 mb-2 p-3 bg-prizm-surface-strong border border-prizm-border rounded-lg flex flex-col sm:flex-row flex-wrap sm:items-center justify-between gap-3 text-[10px] font-mono tracking-wide">
        <div className="flex items-center gap-2">
          <span className="text-prizm-text-muted">CACHE:</span>
          <span className="text-cyan-500 font-bold truncate max-w-[300px]">
            {state.cacheStatus?.activeSiteCachePath
              ? state.cacheStatus.activeSiteCachePath.replace(
                  /.*\\.prizm-cache/,
                  ".prizm-cache",
                )
              : "NOT DETERMINED"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-prizm-text-muted">CACHE STATE:</span>
            {(() => {
              const st = getDashboardConnectionStatus(
                state.siteSummary,
                state.loading,
              );
              return (
                <span
                  className={`font-bold px-1.5 py-0.5 rounded flex items-center gap-1.5 ${st.bgClass} ${st.colorClass}`}
                >
                  {st.pulse && (
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${st.bgClass.replace("/10", "")} animate-pulse`}
                    />
                  )}
                  {st.text}
                </span>
              );
            })()}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-prizm-text-muted">LAST FETCHED:</span>
            <span className="text-prizm-text font-bold">
              {state.cacheStatus?.activeManifest?.lastUpdatedAt
                ? new Date(
                    state.cacheStatus.activeManifest.lastUpdatedAt,
                  ).toLocaleString()
                : "N/A"}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Navigation Panel */}
      <div className="mt-4 pt-4 border-t border-prizm-border flex flex-wrap gap-4 items-center">
        <span className="text-[10px] uppercase font-bold text-prizm-text-muted font-mono mr-2">
          Quick Navigation:
        </span>
        <button
          onClick={() => navigate("arrays-strings")}
          className="text-[10px] font-bold font-mono px-3 py-1.5 bg-prizm-surface hover:bg-prizm-surface-strong border border-prizm-border rounded transition-colors text-prizm-text"
        >
          STRINGS / BPC
        </button>
        <button
          onClick={() => navigate("feather-hvac")}
          className="text-[10px] font-bold font-mono px-3 py-1.5 bg-prizm-surface hover:bg-prizm-surface-strong border border-prizm-border rounded transition-colors text-prizm-text"
        >
          FEATHER / HVAC
        </button>
        <button
          onClick={() => navigate("safety-fault")}
          className="text-[10px] font-bold font-mono px-3 py-1.5 bg-prizm-surface hover:bg-prizm-surface-strong border border-prizm-border rounded transition-colors text-prizm-text"
        >
          SAFETY FAULT CLEAR
        </button>
        <button
          onClick={() => navigate("reports")}
          className="text-[10px] font-bold font-mono px-3 py-1.5 bg-prizm-surface hover:bg-prizm-surface-strong border border-prizm-border rounded transition-colors text-prizm-text"
        >
          REPORTS / EXPORTS
        </button>
        <button
          onClick={() => navigate("settings")}
          className="text-[10px] font-bold font-mono px-3 py-1.5 bg-prizm-surface hover:bg-prizm-surface-strong border border-prizm-border rounded transition-colors text-prizm-text"
        >
          CONNECTION SETTINGS
        </button>
      </div>

      {/* Clear Safety Fault Modal */}
      {clearCandidate && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-prizm-surface-strong border border-prizm-border rounded-lg p-6 max-w-lg w-full">
            <div className="flex items-center gap-3 mb-6 relative">
              <ShieldAlert className="text-prizm-danger" size={24} />
              <div>
                <h2 className="text-lg font-bold text-prizm-danger uppercase tracking-widest font-mono">
                  Confirm Safety Fault Clear
                </h2>
                <p className="text-xs text-prizm-text-muted mt-1 font-mono">
                  Manual intervention command
                </p>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div className="bg-black/20 p-4 border border-prizm-border rounded font-mono text-sm">
                <div className="grid grid-cols-[1fr_2fr] gap-2 mb-2 border-b border-prizm-border pb-2">
                  <span className="text-prizm-text-muted">Entity:</span>
                  <span className="text-prizm-primary font-bold">
                    {clearCandidate.displayKey || clearCandidate.entityKey}
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_2fr] gap-2 mb-2 border-b border-prizm-border pb-2">
                  <span className="text-prizm-text-muted">Status:</span>
                  <span className="text-prizm-text break-words whitespace-pre-wrap">
                    {clearCandidate.statusMessageText ||
                      clearCandidate.statusMessage}
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_2fr] gap-2 mb-2 border-b border-prizm-border pb-2">
                  <span className="text-prizm-text-muted">Source:</span>
                  <span className="text-prizm-text-muted">
                    {clearCandidate.source}
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_2fr] gap-2">
                  <span className="text-prizm-text-muted">Reset Key:</span>
                  <span className="text-prizm-text-muted select-all">
                    {clearCandidate.resetEntityKey}
                  </span>
                </div>
              </div>

              <div className="bg-prizm-warning/10 border border-prizm-warning/30 p-3 rounded">
                <p className="text-prizm-warning text-xs font-bold leading-relaxed">
                  WARNING: This will send a manual clear command to the EMS on
                  behalf of `local-overview`.
                </p>
              </div>

              {!clearResult && (
                <div>
                  <label className="block text-xs font-bold text-prizm-text mb-2 uppercase tracking-widest font-mono">
                    Type confirmation text:{" "}
                    <span className="text-prizm-primary select-all">
                      {clearCandidate.entityKeyToken}
                    </span>
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
                <div
                  className={`p-4 border rounded ${clearResult.error || clearResult.verification?.appearsCleared === false ? "bg-prizm-danger/10 border-prizm-danger/30" : "bg-emerald-500/10 border-emerald-500/30"}`}
                >
                  <div className="font-bold mb-1 uppercase text-xs tracking-widest font-mono flex items-center gap-2">
                    {clearResult.error ? (
                      <>
                        <TriangleAlert
                          size={14}
                          className="text-prizm-danger"
                        />{" "}
                        <span className="text-prizm-danger">
                          FAULT CLEAR FAILED
                        </span>
                      </>
                    ) : clearResult.verification?.appearsCleared === false ? (
                      <>
                        <TriangleAlert
                          size={14}
                          className="text-prizm-warning"
                        />{" "}
                        <span className="text-prizm-warning">
                          FAULT CLEARED BUT STILL PRESENT
                        </span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={14} className="text-emerald-400" />{" "}
                        <span className="text-emerald-400">
                          FAULT CLEARED SUCCESSFULLY
                        </span>
                      </>
                    )}
                  </div>
                  <div className="text-xs font-mono text-prizm-text-muted mt-2">
                    {clearResult.error ||
                      "The fault reset completed successfully."}
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
                  disabled={
                    clearConfRef !== clearCandidate.entityKeyToken ||
                    clearLoading
                  }
                  className="px-4 py-2 bg-prizm-danger text-white rounded font-bold hover:bg-prizm-danger/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest text-[10px] flex items-center gap-2"
                >
                  {clearLoading ? (
                    <Activity size={14} className="animate-spin" />
                  ) : null}
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
              <BoxSelect
                className="text-prizm-primary animate-pulse"
                size={18}
              />
              <h3 className="font-bold text-prizm-text font-mono uppercase tracking-widest text-sm">
                Review EMS App Control
              </h3>
            </div>
            <div className="p-6 space-y-4 font-mono text-xs">
              <div
                className={`border p-3 rounded text-center ${
                  emsAppTargetState
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                    : "bg-amber-500/10 border-amber-500/30 text-amber-500"
                }`}
              >
                You are about to{" "}
                <span className="font-bold uppercase">
                  {emsAppTargetState ? "ENABLE" : "DISABLE"}
                </span>{" "}
                a Dragon Application. This can immediately change the
                operational behavior of the system.
              </div>

              <table className="w-full text-left">
                <tbody className="divide-y divide-prizm-border/50">
                  <tr>
                    <th className="py-2 text-prizm-text-muted">Station</th>
                    <td className="py-2 text-prizm-text text-right font-bold">
                      {state.siteSummary?.site?.stationCode || "BHE0020"}
                    </td>
                  </tr>
                  <tr>
                    <th className="py-2 text-prizm-text-muted">Block</th>
                    <td className="py-2 text-prizm-text text-right font-bold">
                      {state.siteSummary?.site?.blockIndex || 1}
                    </td>
                  </tr>
                  <tr>
                    <th className="py-2 text-prizm-text-muted">App Name</th>
                    <td className="py-2 text-prizm-text text-right font-bold text-prizm-primary">
                      {emsAppCandidate.appName}
                    </td>
                  </tr>
                  <tr>
                    <th className="py-2 text-prizm-text-muted">App Code</th>
                    <td className="py-2 text-prizm-text text-right font-bold">
                      {emsAppCandidate.appCode}
                    </td>
                  </tr>
                  <tr>
                    <th className="py-2 text-prizm-text-muted">Priority</th>
                    <td className="py-2 text-prizm-text text-right font-bold">
                      {emsAppCandidate.priority}
                    </td>
                  </tr>
                  <tr>
                    <th className="py-2 text-prizm-text-muted">
                      Current State
                    </th>
                    <td className="py-2 text-right">
                      <span
                        className={`px-2 py-0.5 rounded font-bold uppercase ${emsAppCandidate.enabled ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}
                      >
                        {emsAppCandidate.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <th className="py-2 text-prizm-text-muted">
                      Requested State
                    </th>
                    <td className="py-2 text-right">
                      <span
                        className={`px-2 py-0.5 rounded font-bold uppercase ${emsAppTargetState ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}
                      >
                        {emsAppTargetState ? "ENABLE" : "DISABLE"}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="pt-2">
                <label className="text-[10px] text-prizm-text-muted uppercase mb-1 block">
                  Type exactly '
                  <span className="text-prizm-text">
                    {emsAppTargetState ? "ENABLE" : "DISABLE"}{" "}
                    {emsAppCandidate.appCode}
                  </span>
                  '
                </label>
                <input
                  type="text"
                  value={emsAppConfText}
                  onChange={(e) => setEmsAppConfText(e.target.value)}
                  placeholder={`${emsAppTargetState ? "ENABLE" : "DISABLE"} ${emsAppCandidate.appCode}`}
                  disabled={emsAppLoading}
                  autoComplete="off"
                  className="w-full bg-black/50 border border-prizm-border p-2 focus:outline-none focus:border-prizm-primary text-prizm-text tracking-widest uppercase disabled:opacity-50"
                />
              </div>

              {emsAppResult && (
                <div
                  className={`p-3 border rounded text-[10px] ${
                    emsAppResult.success || emsAppResult.queued
                      ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-500"
                      : "bg-prizm-danger/10 border-prizm-danger text-prizm-danger"
                  }`}
                >
                  <div className="font-bold uppercase tracking-wider mb-1">
                    {emsAppResult.success
                      ? "Success"
                      : emsAppResult.queued
                        ? "Accepted/Queued"
                        : "Action Failed"}
                  </div>
                  <div className="whitespace-pre-wrap font-mono uppercase text-[9px] text-prizm-text">
                    {emsAppResult.message || emsAppResult.error}
                  </div>
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
                    emsAppConfText !==
                      `${emsAppTargetState ? "ENABLE" : "DISABLE"} ${emsAppCandidate.appCode}`
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

      {/* Debug Source Panel */}
      <div className="mt-8 border border-prizm-border rounded-lg bg-prizm-surface p-4">
        <button
          onClick={() => setDebugExpanded(!debugExpanded)}
          className="flex items-center gap-2 text-xs font-bold font-mono text-prizm-text-muted hover:text-prizm-text uppercase tracking-widest w-full text-left"
        >
          {debugExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Data Source Debug Panel
        </button>
        {debugExpanded && (
          <div className="mt-4 text-[10px] font-mono grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-prizm-surface-strong p-3 rounded border border-prizm-border/50">
              <h4 className="text-prizm-primary font-bold uppercase mb-2 border-b border-prizm-border/50 pb-1">Sources</h4>
              <div className="flex justify-between py-0.5"><span className="text-prizm-text-muted">SOC Source:</span><span className="text-prizm-data-blue">{socSource || "unknown"}</span></div>
              <div className="flex justify-between py-0.5"><span className="text-prizm-text-muted">Array Summary Source:</span><span className="text-prizm-data-blue">{sum?.debug?.arraySummarySource || "native"}</span></div>
              <div className="flex justify-between py-0.5"><span className="text-prizm-text-muted">String Summary Source:</span><span className="text-prizm-data-blue">{sum?.debug?.stringSummarySource || "unknown"}</span></div>
              <div className="flex justify-between py-0.5"><span className="text-prizm-text-muted">Voltage Input:</span><span className="text-emerald-400">normalized to mV</span></div>
            </div>
            
            <div className="bg-prizm-surface-strong p-3 rounded border border-prizm-border/50">
              <h4 className="text-prizm-primary font-bold uppercase mb-2 border-b border-prizm-border/50 pb-1">Rollup Keys</h4>
              <div className="text-prizm-text-muted h-32 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                {Object.keys(sum?.stringSummary?.rollups || {}).join(", ") || "None"}
              </div>
            </div>

            <div className="bg-prizm-surface-strong p-3 rounded border border-prizm-border/50">
              <h4 className="text-prizm-primary font-bold uppercase mb-2 border-b border-prizm-border/50 pb-1">First Array Row Keys</h4>
              <div className="text-prizm-text-muted h-32 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                {Object.keys(sum?.arraySummary?.[0] || {}).join(", ") || "None"}
              </div>
            </div>

            <div className="bg-prizm-surface-strong p-3 rounded border border-prizm-border/50 lg:col-span-3">
              <h4 className="text-prizm-primary font-bold uppercase mb-2 border-b border-prizm-border/50 pb-1">First String Metric Keys</h4>
              <div className="text-prizm-text-muted h-24 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                {Object.keys(sum?.stringSummary?.rawStrings?.[0] || sum?.stringSummary?.strings?.[0] || {}).join(", ") || "None"}
              </div>
            </div>
          </div>
        )}
      </div>

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
