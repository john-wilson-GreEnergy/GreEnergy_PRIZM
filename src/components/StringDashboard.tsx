import React, { useState, useEffect, useMemo } from "react";
import { ServerOff, Search, ChevronRight, Download, RefreshCw, Layers, Lock, Unlock } from "lucide-react";
import StringDetailDashboard from "./StringDetailDashboard";
import { formatTemperatureF } from "../utils/temperatureScale";

import { formatPrizmUtcTimestamp } from '../lib/timeFormat';
import { normalizeVoltage, normalizeDeltaVoltage } from '../lib/voltageNormalizer';
import RotationModal, { RotationTarget } from './RotationModal';
import BalancingModal from './BalancingModal';
import ContactorControlModal, { ContactorTarget } from './ContactorControlModal';
import { useSiteData } from '../context/SiteDataContext';

function getContactorVisualState(row: any) {
  const pos = row.positiveContactorClosed;
  const neg = row.negativeContactorClosed;
  const both = row.bothContactorsClosed;
  const commandedClosed = row.contactorsCloseExpected === true;
  const commandedOpen = row.contactorsCloseExpected === false;
  const matchesCommand = row.commandMatchesContactors;

  let actualLabel = "Unknown";
  let actualDotColor = "amber";

  if (pos === true && neg === true) {
    actualLabel = "Closed";
    actualDotColor = "blue";
  } else if (pos === false && neg === false) {
    actualLabel = "Open";
    actualDotColor = "gray";
  } else if (pos === true && neg === false) {
    actualLabel = "Partial / Mismatch";
    actualDotColor = "red";
  } else if (pos === false && neg === true) {
    actualLabel = "Partial / Mismatch";
    actualDotColor = "red";
  } else if ((pos === false && neg === null) || (pos === null && neg === false)) {
    actualLabel = "Open (incomplete feedback)";
    actualDotColor = "gray";
  } else if ((pos === true && neg === null) || (pos === null && neg === true)) {
    actualLabel = "Partial (incomplete feedback)";
    actualDotColor = "amber";
  } else if (pos === null && neg === null) {
    actualLabel = "Unknown";
    actualDotColor = "amber";
  }

  function getIndividualContactorDotColor(value: any) {
    if (value === true) return "blue";
    if (value === false) return "gray";
    return "amber";
  }

  const positiveDotColor = getIndividualContactorDotColor(pos);
  const negativeDotColor = getIndividualContactorDotColor(neg);

  // Command mismatch logic
  let matchLabel = "Command unknown / pending";
  let matchDotColor = "amber";

  if (pos === null && neg === null) {
    matchLabel = "Readback unknown";
    matchDotColor = "amber";
  } else {
    if (matchesCommand === true) {
      matchLabel = "Command matched";
      matchDotColor = "green";
    } else if (matchesCommand === false) {
      matchLabel = "Command mismatch";
      matchDotColor = "red";
    } else {
      matchLabel = "Command unknown / pending";
      matchDotColor = "amber";
    }
  }

  return {
    actualDotColor,
    positiveDotColor,
    negativeDotColor,
    matchDotColor,
    actualLabel,
    matchLabel
  };
}

function getTailwindClasses(color: string) {
  switch (color) {
    case "blue":
      return "bg-blue-400 shadow-[0_0_5px_rgba(96,165,250,0.5)]";
    case "gray":
      return "bg-prizm-text-muted/30";
    case "green":
      return "bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]";
    case "red":
      return "bg-prizm-danger shadow-[0_0_5px_rgba(255,51,102,0.5)]";
    case "amber":
    case "yellow":
      return "bg-prizm-warning shadow-[0_0_5px_rgba(255,204,0,0.5)]";
    default:
      return "bg-prizm-text-muted/30";
  }
}

interface StringDetailErrorBoundaryProps {
  children: React.ReactNode;
  onBack?: () => void;
}

interface StringDetailErrorBoundaryState {
  error: any;
}

class StringDetailErrorBoundary extends React.Component<StringDetailErrorBoundaryProps, StringDetailErrorBoundaryState> {
  props!: StringDetailErrorBoundaryProps;
  state: StringDetailErrorBoundaryState = { error: null };

  constructor(props: StringDetailErrorBoundaryProps) {
    super(props);
  }
  static getDerivedStateFromError(error: any) {
    return { error };
  }
  componentDidCatch(error: any, info: any) {
    console.error("[StringDetailErrorBoundary]", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6 bg-prizm-bg text-prizm-text font-mono h-full overflow-y-auto w-full">
          <button
            onClick={this.props.onBack}
            className="mb-4 px-3 py-1 border border-prizm-border rounded text-prizm-primary font-bold hover:bg-prizm-surface"
          >
            Back to String List
          </button>
          <div className="bg-prizm-surface border border-prizm-danger/40 rounded p-4 w-full">
            <div className="text-prizm-danger font-bold uppercase text-xs mb-2">
              String Detail Render Error
            </div>
            <pre className="text-[10px] whitespace-pre-wrap text-prizm-text-muted">
              {String(this.state.error?.message || this.state.error)}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function StringDashboard({ active = true }: { active?: boolean }) {
  const { snapshot, isInitialLoading, refreshNow } = useSiteData();
  
  const data = useMemo(() => {
    if (!snapshot) return null;
    const stringSummary = snapshot.rollups?.stringSummary || {};
    const stringSummarySummary = stringSummary.summary || {};
    const stringSummaryRollups = stringSummary.rollups || {};
    return {
      strings: snapshot.normalized?.strings || [],
      summary: stringSummarySummary,
      rollups: stringSummaryRollups,
      buckets: stringSummary.buckets || {},
      sourceHealth: stringSummary.sourceHealth || snapshot.rollups?.sourceHealth || [],
      emsBaseUrl: snapshot.siteIdentity?.emsBaseUrl || "",
      durationMs: snapshot.debug?.lastPollDurationMs || 0,
      stationCode: snapshot.siteIdentity?.stationCode || "",
      blockIndex: snapshot.siteIdentity?.blockIndex || 1,
      cache: snapshot.liveStatus ? {
        sourceOk: snapshot.liveStatus.state !== "OFFLINE",
        isStale: snapshot.liveStatus.state === "PARTIAL" || snapshot.liveStatus.stale === true,
        lastUpdatedAt: snapshot.liveStatus.lastUpdated
      } : null
    };
  }, [snapshot]);

  const [notificationRollupsByString, setNotificationRollupsByString] = useState<Record<string, any>>({});
  const [liveStringRows, setLiveStringRows] = useState<any[]>([]);
  const [liveStringRowsReady, setLiveStringRowsReady] = useState(false);
  const [liveStringRowsLoading, setLiveStringRowsLoading] = useState(false);
  const [liveStringRowsLastUpdated, setLiveStringRowsLastUpdated] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(15000);
  
  const [search, setSearch] = useState("");
  const [arrayFilter, setArrayFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState("all");
  const [contactorFilter, setContactorFilter] = useState<"all" | "abnormal" | "open" | "partial" | "closed" | "unknown">("all");
  
  const cacheTtlMs = 15000;
  const [selectedString, setSelectedString] = useState<any | null>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const [rotationCapabilities, setRotationCapabilities] = useState<any>(null);
  const [rotationModalOpen, setRotationModalOpen] = useState(false);
  const [rotationModalAction, setRotationModalAction] = useState<'in' | 'out'>('in');
  const [rotationModalTargets, setRotationModalTargets] = useState<any[]>([]);
  
  const [balancingModalOpen, setBalancingModalOpen] = useState(false);

  const [isAdvancedMode, setIsAdvancedMode] = useState(() => localStorage.getItem("prizm_advanced_mode") === "true");
  const [contactorModalOpen, setContactorModalOpen] = useState(false);
  const [contactorModalAction, setContactorModalAction] = useState<"open" | "close">("open");
  const [contactorModalTargets, setContactorModalTargets] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadNotificationRollups = async () => {
      try {
        const res = await fetch("/api/local/site-data/notifications/rollups");
        if (!res.ok) return;
        const json = await res.json();
        const byString = json?.grouped?.byString || json?.byString || json?.raw?.byString || {};
        if (!cancelled) setNotificationRollupsByString(byString);
      } catch (err) {
        console.warn("[StringDashboard] notification rollups fetch failed", err);
      }
    };

    loadNotificationRollups();
    const timer = window.setInterval(loadNotificationRollups, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const loadLiveStringRows = async (force = false) => {
    if (!active && !force) return;
    setLiveStringRowsLoading(true);

    try {
      const res = await fetch("/api/local/strings/dashboard?maxAgeMs=5000");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      const rows = Array.isArray(json?.strings) ? json.strings : [];

      if (rows.length >= 300) {
        setLiveStringRows(rows);
        setLiveStringRowsReady(true);
        setLiveStringRowsLastUpdated(new Date().toISOString());
      } else if (!liveStringRowsReady) {
        setLiveStringRows(rows);
      }
    } catch (err) {
      console.warn("[StringDashboard] live string rows fetch failed", err);
    } finally {
      setLiveStringRowsLoading(false);
    }
  };

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    const run = async () => {
      if (cancelled) return;
      await loadLiveStringRows(false);
    };

    run();
    const timer = window.setInterval(run, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [active, liveStringRowsReady]);

  useEffect(() => {
    localStorage.setItem("prizm_advanced_mode", isAdvancedMode ? "true" : "false");
  }, [isAdvancedMode]);

  useEffect(() => {
    if (!active || refreshInterval === 0) return;
    const iv = setInterval(() => {
        refreshNow(false);
    }, refreshInterval);
    return () => clearInterval(iv);
  }, [active, refreshInterval, refreshNow]);
  
  useEffect(() => { fetch('/api/local/capabilities').then(r => r.json()).then(setRotationCapabilities).catch(()=>{}); }, []);

  useEffect(() => {
    if (!isInitialLoading) setLoading(false);
  }, [isInitialLoading]);

  useEffect(() => {
    if (active) {
      const targetArray = localStorage.getItem("prizm_selected_array");
      const targetString = localStorage.getItem("prizm_selected_string");
      if (targetArray) {
        setArrayFilter(targetArray);
        localStorage.removeItem("prizm_selected_array");
      }
      if (targetString) {
        setSearch(`string ${targetString}`);
        localStorage.removeItem("prizm_selected_string");
      }
    }
  }, [active]);

  // Update selected string reference to get fresh data when snapshot updates
  useEffect(() => {
    if (selectedString && data?.strings) {
       const updated = data.strings.find((s:any) => s.id === selectedString.id);
       if (updated) setSelectedString(updated);
    }
  }, [data?.strings]); // Intentionally omitting selectedString to avoid infinite loop on update

  const handleRotationConfirm = async (req: any) => {
    await fetch("/api/local/strings/rotation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
    setRotationModalOpen(false);
    setSelectedIds(new Set());
    handleManualRefresh();
  };

  const handleBalancingPreflight = async (req: any) => {
      const res = await fetch("/api/local/balancing/preflight", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
      if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to execute balancing preflight");
      }
      return res.json();
  };

  const handleBalancingConfirm = async (req: any) => {
      const res = await fetch("/api/local/balancing/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
      if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to execute balancing");
      }
      setBalancingModalOpen(false);
      setSelectedIds(new Set());
      handleManualRefresh();
  };

  function openContactorModal(action: "open" | "close") {
    const targets = getSelectedTargets();
    if (!targets.length) return;
    setContactorModalAction(action);
    setContactorModalTargets(targets);
    setContactorModalOpen(true);
  }

  async function handleContactorConfirm(req: any) {
    const res = await fetch("/api/local/strings/contactors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to execute contactor control");
    }

    const result = await res.json();
    setSelectedIds(new Set());
    await handleManualRefresh();
    return result;
  }

  const getSelectedTargets = () => {
    // Array optimization
    const targets: RotationTarget[] = [];
    const grouped = new Map<number, number[]>();
    for (const id of selectedIds) {
        const s = strings.find((st:any) => st.id === id);
        if (s && s.arrayNumber) {
           if (!grouped.has(s.arrayNumber)) grouped.set(s.arrayNumber, []);
           grouped.get(s.arrayNumber)!.push(s.stringNumber);
        }
    }
    for (const [arr, strs] of grouped.entries()) {
        const totalInArr = strings.filter((fs:any) => fs.arrayNumber === arr).length;
        if (strs.length === totalInArr) {
             targets.push({ array: arr, allStrings: true });
        } else {
             strs.forEach((st:any) => targets.push({ array: arr, string: st }));
        }
    }
    return targets;
  };

const handleManualRefresh = async () => {
      setIsRefreshing(true);
      try {
        await refreshNow(true);
      } catch (err) {
        console.error("Failed to fetch dashboard strings", err);
      } finally {
        setIsRefreshing(false);
      }
  };

  const snapshotStrings = data?.strings || [];
  const strings = liveStringRowsReady && liveStringRows.length ? liveStringRows : snapshotStrings;
  const stringRowsAreWarming = !liveStringRowsReady && snapshotStrings.length > 0;

  const getStringContactorClosedState = (row: any): boolean | null => {
    const positiveFeedback =
      row?.positiveContactorClosed === true ? true :
      row?.positiveContactorClosed === false ? false :
      null;

    const negativeFeedback =
      row?.negativeContactorClosed === true ? true :
      row?.negativeContactorClosed === false ? false :
      null;

    if (positiveFeedback === true && negativeFeedback === true) return true;
    if (positiveFeedback === false && negativeFeedback === false) return false;
    if (positiveFeedback !== null || negativeFeedback !== null) return null;

    const statusText = String(
      row?.contactorStatus ||
      row?.contactStatus ||
      row?.contactState ||
      row?.contactorState ||
      row?.stringContactorState ||
      row?.contactorsState ||
      row?.contactors?.status ||
      row?.contactors?.state ||
      ""
    ).trim().toUpperCase();

    const codeText = String(
      row?.contactorCode ??
      row?.stringContactorCode ??
      row?.contactCode ??
      row?.rawContactorState ??
      ""
    ).trim().toUpperCase();

    if (
      statusText === "CLOSED" ||
      statusText === "CLOSE" ||
      statusText.includes("CLOSED") ||
      codeText === "5"
    ) return true;

    if (
      statusText === "OPEN" ||
      statusText === "OPENED" ||
      statusText.includes("OPEN") ||
      codeText === "6"
    ) return false;

    return null;
  };

  const contactorClosedCount = strings.filter((row: any) => getStringContactorClosedState(row) === true).length;
  const contactorOpenCount = strings.filter((row: any) => getStringContactorClosedState(row) === false).length;
  const contactorUnknownCount = strings.filter((row: any) => getStringContactorClosedState(row) === null).length;

  const getStringContactorFilterState = (row: any): "open" | "partial" | "closed" | "unknown" => {
    const actualState = String(row?.contactor?.actualState ?? row?.contactorStatus ?? "").trim().toLowerCase();

    if (actualState === "open") return "open";
    if (actualState === "partial" || actualState === "mismatch") return "partial";
    if (actualState === "closed") return "closed";

    const pos = row?.positiveContactorClosed;
    const neg = row?.negativeContactorClosed;

    if (pos === true && neg === true) return "closed";
    if (pos === false && neg === false) return "open";
    if (pos !== null && pos !== undefined && neg !== null && neg !== undefined && pos !== neg) return "partial";

    return "unknown";
  };

  const stringMatchesContactorFilter = (row: any): boolean => {
    if (contactorFilter === "all") return true;
    const state = getStringContactorFilterState(row);

    if (contactorFilter === "abnormal") {
      return state === "open" || state === "partial";
    }

    return state === contactorFilter;
  };

  const contactorPartialCount = strings.filter((row: any) => getStringContactorFilterState(row) === "partial").length;
  const contactorAbnormalCount = contactorOpenCount + contactorPartialCount;

  const countOf = (value:any): number | null => {
    if (typeof value === "number") return value;
    if (value && typeof value.count === "number") return value.count;
    return null;
  };
  const formatNumber = (value:any, decimals = 2) => {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(decimals) : "--";
  };
  const formatMaybeInt = (value:any) => {
    const n = Number(value);
    return Number.isFinite(n) ? String(Math.round(n)) : "--";
  };

  const { summary } = data || { summary: {} };

  const totalStrings =
    data?.rollups?.totalStrings ??
    summary?.totalStrings ??
    strings.length;
  const bucketCount = (bucket: string) =>
    strings.filter((s: any) => s.bucket === bucket).length;

  const rowsHaveBuckets = strings.some((s: any) =>
    s?.bucket === "online" ||
    s?.bucket === "nearline" ||
    s?.bucket === "offline" ||
    s?.bucket === "notCommunicating"
  );

  const onlineCount = rowsHaveBuckets
    ? bucketCount("online")
    : (
        summary?.normalStrings ??
        countOf(data?.rollups?.online) ??
        countOf(data?.rollups?.normal) ??
        0
      );

  const nearlineCount = rowsHaveBuckets
    ? bucketCount("nearline")
    : (
        summary?.nearlineStrings ??
        countOf(data?.rollups?.nearline) ??
        0
      );

  const offlineCount = rowsHaveBuckets
    ? bucketCount("offline")
    : (
        summary?.offlineStrings ??
        countOf(data?.rollups?.offline) ??
        0
      );

  const notCommunicatingCount = rowsHaveBuckets
    ? bucketCount("notCommunicating")
    : (
        summary?.notCommunicatingStrings ??
        countOf(data?.rollups?.notCommunicating) ??
        0
      );

  const liveKnownBpcCount =
    strings.reduce((sum: number, row: any) => sum + (Number(row?.balCt ?? row?.balancingCount ?? row?.knownBpcCount ?? 0) || 0), 0) ||
    countOf(data?.rollups?.knownBpcCount) ||
    summary?.knownBpcCount ||
    summary?.totalBpcs ||
    0;

  const liveExpectedBpcCount =
    countOf(data?.rollups?.expectedBpcCount) ??
    summary?.expectedBpcCount ??
    (totalStrings ? totalStrings * 14 : null);

  const liveWarningBpcCount =
    strings.reduce((sum: number, row: any) => sum + (Number(row?.warningCount ?? 0) || 0), 0) ||
    countOf(data?.rollups?.warningBpcs) ||
    summary?.warningBpcs ||
    0;

  const liveAlarmBpcCount =
    strings.reduce((sum: number, row: any) => sum + (Number(row?.alarmCount ?? 0) || 0), 0) ||
    countOf(data?.rollups?.alarmBpcs) ||
    summary?.alarmBpcs ||
    0;

  const warningCount =
    countOf(data?.rollups?.warnings) ??
    summary?.warningStrings ??
    strings.reduce((sum:number, s:any) => sum + (Number(s.warningCount) || 0), 0);
  const alarmCount =
    countOf(data?.rollups?.alarms) ??
    summary?.alarmStrings ??
    strings.reduce((sum:number, s:any) => sum + (Number(s.alarmCount) || 0), 0);
  const fleetAvgCellVoltage =
    data?.rollups?.fleetAvgCellVoltage ??
    data?.rollups?.nearline?.avgCellVoltageMv ??
    summary?.avgCellVoltage ??
    null;
  const fleetMaxCellVoltageDelta =
    data?.rollups?.fleetMaxCellVoltageDelta ??
    data?.rollups?.nearline?.maxCellVoltageDeltaMv ??
    summary?.maxCellVoltageDelta ??
    null;
  const fleetAvgCellTemp =
    data?.rollups?.fleetAvgCellTemp ??
    data?.rollups?.nearline?.avgCellTempC ??
    summary?.avgCellTemperature ??
    null;
  const fleetMaxCellTempDelta =
    data?.rollups?.fleetMaxCellTemp ??
    data?.rollups?.nearline?.maxCellTempDeltaC ??
    summary?.maxCellTemperatureDelta ??
    null;

  const sourceHealthRows = useMemo(() => {
    if (!data?.sourceHealth) return [];
    if (Array.isArray(data.sourceHealth)) {
      return data.sourceHealth.map((h:any) => ({
        key: h.name || h.endpoint || "source",
        ok: h.ok ?? h.success,
        httpStatus: h.httpStatus ?? h.statusCode ?? h.lastStatusCode,
        durationMs: h.durationMs ?? h.lastDurationMs,
        url: h.url ?? h.endpoint,
        error: h.error ?? (h.lastError === "NONE" ? null : h.lastError)
      }));
    }
    return Object.entries(data.sourceHealth).map(([key, h]: [string, any]) => ({
      key,
      ok: h.ok ?? h.success,
      httpStatus: h.httpStatus ?? h.statusCode ?? h.lastStatusCode,
      durationMs: h.durationMs ?? h.lastDurationMs,
      url: h.url ?? h.endpoint,
      error: h.error ?? (h.lastError === "NONE" ? null : h.lastError)
    }));
  }, [data?.sourceHealth]);

  const arrays = useMemo(() => {
    const list = Array.from(new Set(strings.map((s:any) => s.arrayNumber)));
    return list.sort((a, b) => Number(a) - Number(b));
  }, [strings]);

  const filtered = useMemo(() => {
    return strings.filter((s:any) => {
      if (arrayFilter !== "all" && String(s.arrayNumber) !== arrayFilter) return false;
      if (stateFilter !== "all") {
        const canonicalBucket = s.bucket || s.operationalBucket || s.operationalState || "";
        if (stateFilter.toLowerCase() !== canonicalBucket.toLowerCase()) return false;
      }
      if (healthFilter !== "all") {
        if (healthFilter === "alarms" && s.alarmCount <= 0) return false;
        if (healthFilter === "warnings" && s.warningCount <= 0) return false;
      }
      if (contactorFilter !== "all" && !stringMatchesContactorFilter(s)) return false;
      if (search) {
        const sq = search.toLowerCase();
        if (!s.stringKey.toLowerCase().includes(sq) && !s.stringControllerIp?.toLowerCase().includes(sq)) return false;
      }
      return true;
    });
  }, [strings, arrayFilter, stateFilter, healthFilter, contactorFilter, search]);

  const downloadCsv = () => {
    if (filtered.length === 0) return;
    const headers = ["stringKey", "arrayNumber", "stringNumber", "operationalState", "measuredVoltage", "amps", "socPct", "kw", "stringControllerIp", "minCellVoltage", "maxCellVoltage", "minCellTemperature", "maxCellTemperature"];
    const csvRows = [];
    csvRows.push(headers.join(','));
    for (const row of filtered) {
      const values = headers.map(header => {
        const val = row[header];
        const str = (val === null || val === undefined) ? "" : String(val);
        return `"${str.replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    }
    const csvString = csvRows.join('\\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EMS_Strings_Export_${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadJson = () => {
      if (!data) return;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EMS_Strings_Dashboard_${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (selectedString) {
    return (
      <StringDetailErrorBoundary onBack={() => setSelectedString(null)}>
        <StringDetailDashboard 
          stringData={selectedString} 
          onBack={() => setSelectedString(null)} 
        />
      </StringDetailErrorBoundary>
    );
  }

  if (loading && !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-prizm-text-muted font-mono">
        <RefreshCw className="animate-spin mb-4 text-prizm-primary" size={32} />
        <span className="text-xs font-bold tracking-widest text-prizm-primary">LOADING STRINGS DATA</span>
      </div>
    );
  }

  if (!data || data.summary.totalStrings === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-prizm-text-muted font-mono">
        <ServerOff size={48} className="mb-4 opacity-50" />
        <h2 className="text-xl font-bold uppercase tracking-widest text-prizm-danger mb-2">OFFLINE / NO LOCAL DATA</h2>
        <p className="text-xs max-w-md mx-auto">PRIZM Local EMS source failed to resolve strings data.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col font-sans transition-all bg-transparent pb-24">
      
      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 shrink-0 mb-6 font-mono">
        <div>
          <span className="text-[10px] text-prizm-primary font-bold uppercase tracking-wider block">Batteries</span>
          <h1 className="text-lg font-bold text-prizm-text tracking-wide flex items-center gap-2">
            STRINGS / BPC DASHBOARD
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[9px] font-bold">
           <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-1 bg-prizm-surface border border-prizm-border rounded hover:bg-prizm-surface-strong transition-colors text-prizm-primary mr-2 disabled:opacity-50"
           >
              <RefreshCw size={10} className={isRefreshing ? "animate-spin" : ""} /> REFRESH LIVE
           </button>
           <div className={`p-1.5 border rounded flex items-center gap-1.5 ${
                (!data.cache || !data.cache.sourceOk) ? 'bg-prizm-danger/10 border-prizm-danger/30 text-prizm-danger' : 
                isRefreshing ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' :
                (data.cache.isStale ? 'bg-prizm-warning/10 border-prizm-warning/30 text-prizm-warning' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-bold')
           }`}>
                {(() => {
                    if (!data.cache || !data.cache.sourceOk) return <><span className="h-1.5 w-1.5 rounded-full bg-prizm-danger"></span>Offline</>;
                    if (isRefreshing) return <><span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse"></span>Refreshing Live</>;
                    if (data.cache.isStale) return <><span className="h-1.5 w-1.5 rounded-full bg-prizm-warning"></span>Connection Partial</>;
                    return <><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>Connection Live</>;
                })()}
           </div>
           <div className="bg-prizm-surface p-1.5 border border-prizm-border rounded text-prizm-text-muted hidden sm:block">
              SRC: <span className="text-prizm-text">{data.emsBaseUrl}</span>
           </div>
           <div className="bg-prizm-surface p-1.5 border border-prizm-border rounded text-prizm-text-muted hidden sm:block">
              LATENCY: <span className="text-prizm-text">{data.durationMs}ms</span>
           </div>
        </div>
      </div>

      {/* Source Debug Panel */}
      <details className="mb-6 bg-prizm-surface border border-prizm-border rounded-lg text-xs font-mono group">
        <summary className="p-3 cursor-pointer text-prizm-text-muted hover:text-prizm-text transition-colors select-none outline-none font-bold uppercase tracking-wider">
           Source Debug Information
        </summary>
        <div className="p-3 border-t border-prizm-border bg-black/20 overflow-x-auto no-scrollbar">
           <table className="w-full text-left whitespace-nowrap text-[10px]">
              <thead className="text-prizm-text-muted">
                 <tr>
                    <th className="pr-4 pb-2">Key</th>
                    <th className="pr-4 pb-2">Status</th>
                    <th className="pr-4 pb-2">HTTP Code</th>
                    <th className="pr-4 pb-2">Ping (ms)</th>
                    <th className="pr-4 pb-2">URL</th>
                    <th className="pb-2">Error</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-prizm-border/10">
                 {sourceHealthRows.length === 0 ? (
                    <tr>
                       <td colSpan={6} className="py-4 text-center text-prizm-text-muted">
                          No source health telemetry published for this snapshot.
                       </td>
                    </tr>
                 ) : (
                    sourceHealthRows.map((row: any) => (
                       <tr key={row.key}>
                          <td className="pr-4 py-1.5 text-prizm-primary font-bold">{row.key}</td>
                          <td className="pr-4 py-1.5">
                             <span className={`px-1.5 py-0.5 rounded text-white ${row.ok ? 'bg-emerald-500/50' : 'bg-prizm-danger/50'}`}>
                                 {row.ok ? 'OK' : 'FAIL'}
                             </span>
                          </td>
                          <td className="pr-4 py-1.5 text-prizm-text">{row.httpStatus || '--'}</td>
                          <td className="pr-4 py-1.5 text-prizm-text-muted">{row.durationMs !== null && row.durationMs !== undefined ? `${row.durationMs}ms` : '--'}</td>
                          <td className="pr-4 py-1.5 text-prizm-text-muted opacity-80">{row.url || '--'}</td>
                          <td className="py-1.5 text-prizm-danger/80">{row.error || '--'}</td>
                       </tr>
                    ))
                 )}
              </tbody>
           </table>
        </div>
      </details>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-11 gap-2 mb-4 shrink-0 text-center font-mono select-none">
        <div className="bg-prizm-surface-strong border border-prizm-border rounded px-2 py-1.5 flex flex-col justify-center">
          <span className="text-[8px] text-prizm-text-muted uppercase tracking-wide">Total Strings</span>
          <span className="text-[12px] font-bold text-prizm-text">{formatMaybeInt(totalStrings)}</span>
        </div>
        <button
          type="button"
          onClick={() => setContactorFilter(contactorFilter === "abnormal" ? "all" : "abnormal")}
          title="Show open or mismatched contactors"
          className={`bg-prizm-surface border border-prizm-border border-b-2 rounded px-2 py-1.5 flex flex-col justify-center text-left transition-colors ${
            contactorFilter === "abnormal"
              ? "border-b-prizm-warning bg-prizm-warning/10"
              : "border-b-prizm-warning/60 hover:bg-prizm-surface-strong"
          }`}
        >
          <span className="text-[8px] text-prizm-text-muted uppercase tracking-wide leading-tight">Contactor Abnormal</span>
          <span className={contactorOpenCount > 0 ? "text-[12px] font-bold text-prizm-warning" : "text-[12px] font-bold text-emerald-400"}>
            {formatMaybeInt(contactorAbnormalCount)}
            <span className="text-prizm-text-muted mx-1">/</span>
            <span className="text-prizm-text">{formatMaybeInt(totalStrings)}</span>
          </span>
          <span className="text-[8px] text-prizm-text-muted mt-0.5">
            OPEN {formatMaybeInt(contactorOpenCount)} | PARTIAL {formatMaybeInt(contactorPartialCount)}
            {contactorUnknownCount > 0 ? ` | UNK ${formatMaybeInt(contactorUnknownCount)}` : ""}
          </span>
        </button>
        <div className="bg-prizm-surface border border-prizm-border border-b-2 border-b-emerald-500/50 rounded px-2 py-1.5 flex flex-col justify-center">
          <span className="text-[8px] text-prizm-text-muted uppercase tracking-wide">Online</span>
          <span className="text-[12px] font-bold text-emerald-400">{formatMaybeInt(onlineCount)}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border border-b-2 border-b-cyan-500/50 rounded px-2 py-1.5 flex flex-col justify-center">
          <span className="text-[8px] text-prizm-text-muted uppercase tracking-wide">Nearline</span>
          <span className={nearlineCount > 0 ? "text-[12px] font-bold text-cyan-400" : "text-[12px] font-bold text-prizm-text"}>{formatMaybeInt(nearlineCount)}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border border-b-2 border-b-prizm-danger/50 rounded px-2 py-1.5 flex flex-col justify-center">
          <span className="text-[8px] text-prizm-text-muted uppercase tracking-wide">Offline</span>
          <span className={offlineCount > 0 ? "text-[12px] font-bold text-prizm-danger" : "text-[12px] font-bold text-prizm-text"}>{formatMaybeInt(offlineCount)}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border border-b-2 border-b-slate-500/60 rounded px-2 py-1.5 flex flex-col justify-center">
          <span className="text-[8px] text-prizm-text-muted uppercase tracking-wide">Not Comm</span>
          <span className={notCommunicatingCount > 0 ? "text-[12px] font-bold text-slate-400" : "text-[12px] font-bold text-prizm-text"}>{formatMaybeInt(notCommunicatingCount)}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded px-2 py-1.5 flex flex-col justify-center">
          <span className="text-[8px] text-prizm-text-muted uppercase tracking-wide">Warns / Alarms</span>
          <span className="text-[12px] font-bold text-prizm-warning">{formatMaybeInt(warningCount)} <span className="text-prizm-text-muted mx-1">/</span> <span className="text-prizm-danger">{formatMaybeInt(alarmCount)}</span></span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded px-2 py-1.5 flex flex-col justify-center">
          <span className="text-[8px] text-prizm-text-muted uppercase tracking-wide leading-tight">Total BPCs</span>
          <span className="text-[10px] font-bold text-prizm-text mt-0.5">Known {formatMaybeInt(liveKnownBpcCount)} <span className="text-prizm-text-muted font-normal mx-0.5">/</span> {formatMaybeInt(liveExpectedBpcCount)}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded px-2 py-1.5 flex flex-col justify-center">
          <span className="text-[8px] text-prizm-text-muted uppercase tracking-wide leading-tight">BPC Alerts</span>
          <span className="text-[12px] font-bold text-prizm-warning">{formatMaybeInt(liveWarningBpcCount)} <span className="text-prizm-text-muted mx-1">/</span> <span className="text-prizm-danger">{formatMaybeInt(liveAlarmBpcCount)}</span></span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded px-2 py-1.5 flex flex-col justify-center">
          <span className="text-[8px] text-prizm-text-muted uppercase tracking-wide leading-tight">Fleet Avg Cell / V Delta</span>
          <span className="text-[10px] font-bold text-prizm-text mt-0.5">
            {fleetAvgCellVoltage !== null && normalizeVoltage(fleetAvgCellVoltage) !== null
              ? `${normalizeVoltage(fleetAvgCellVoltage)!.toFixed(1)} mV`
              : "--"}
            <span className="text-prizm-text-muted mx-1">|</span>
            {fleetMaxCellVoltageDelta !== null && normalizeDeltaVoltage(fleetMaxCellVoltageDelta) !== null
              ? `\u0394 ${normalizeDeltaVoltage(fleetMaxCellVoltageDelta)!.toFixed(0)} mV`
              : "--"}
          </span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded px-2 py-1.5 flex flex-col justify-center">
          <span className="text-[8px] text-prizm-text-muted uppercase tracking-wide leading-tight">Fleet Avg Temp / Max &Delta;</span>
          <span className="text-[10px] font-bold text-prizm-text mt-0.5">
            {fleetAvgCellTemp != null ? formatTemperatureF(fleetAvgCellTemp, { decimals: 1, showUnit: true, sourceUnit: "C" }) : "--"}
            <span className="text-prizm-text-muted mx-1">|</span>
            {fleetMaxCellTempDelta != null ? "\u0394" + (fleetMaxCellTempDelta * 1.8).toFixed(1) + "°F" : "--"}
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-prizm-surface-strong p-3 rounded-t-lg border border-prizm-border shrink-0">
        <div className="relative flex-1 w-full flex items-center">
          <Search size={14} className="absolute left-3 text-prizm-text-muted" />
          <input
            type="text"
            placeholder="Search String Key or IP..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-black/20 border border-prizm-border rounded pl-9 pr-3 py-1.5 text-xs text-prizm-text font-mono placeholder-black/40 focus:border-prizm-primary focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-3 w-full sm:w-auto">
          <select value={arrayFilter} onChange={e => setArrayFilter(e.target.value)} className="bg-black/20 border border-prizm-border rounded px-1.5 py-0.5 text-[10px] uppercase font-mono text-prizm-text focus:outline-none focus:border-prizm-primary cursor-pointer">
            <option value="all">Array: All</option>
            {arrays.map(a => <option key={String(a)} value={String(a)}>Array {a}</option>)}
          </select>
          <select value={stateFilter} onChange={e => setStateFilter(e.target.value)} className="bg-black/20 border border-prizm-border rounded px-1.5 py-0.5 text-[10px] uppercase font-mono text-prizm-text focus:outline-none focus:border-prizm-primary cursor-pointer">
            <option value="all">State: All</option>
            <option value="online">Online</option>
            <option value="nearline">Nearline</option>
            <option value="offline">Offline</option>
            <option value="notCommunicating">Not Communicating</option>
            <option value="unknown">Unknown</option>
          </select>
          <select value={contactorFilter} onChange={e => setContactorFilter(e.target.value as any)} className="bg-black/20 border border-prizm-border rounded px-1.5 py-0.5 text-[10px] uppercase font-mono text-prizm-text focus:outline-none focus:border-prizm-primary cursor-pointer">
            <option value="all">Contactors: All</option>
            <option value="abnormal">Contactors: Abnormal</option>
            <option value="open">Contactors: Open Only</option>
            <option value="partial">Contactors: Partial / Mismatch</option>
            <option value="closed">Contactors: Closed</option>
            <option value="unknown">Contactors: Unknown</option>
          </select>
          <select value={healthFilter} onChange={e => setHealthFilter(e.target.value)} className="bg-black/20 border border-prizm-border rounded px-1.5 py-0.5 text-[10px] uppercase font-mono text-prizm-text focus:outline-none focus:border-prizm-primary cursor-pointer">
            <option value="all">Health: All</option>
            <option value="warnings">Warnings</option>
            <option value="alarms">Alarms</option>
          </select>
          <select value={refreshInterval} onChange={e => setRefreshInterval(Number(e.target.value))} className="bg-black/20 border border-prizm-border rounded px-1.5 py-0.5 text-[10px] uppercase font-mono text-prizm-text focus:outline-none focus:border-prizm-primary cursor-pointer">
            <option value={0}>Refresh: Paused</option>
            <option value={5000}>Refresh: 5s</option>
            <option value={10000}>Refresh: 10s</option>
            <option value={30000}>Refresh: 30s</option>
            <option value={60000}>Refresh: 60s</option>
          </select>
          <button onClick={downloadCsv} title="Export CSV" className="bg-white/5 hover:bg-white/10 text-prizm-text border border-prizm-border px-1.5 py-0.5 rounded transition-colors cursor-pointer shrink-0">
            <Download size={14} />
          </button>
          <button onClick={downloadJson} title="Export API JSON" className="bg-white/5 hover:bg-white/10 text-prizm-info border border-prizm-border px-1.5 py-0.5 rounded transition-colors cursor-pointer shrink-0">
            <Layers size={14} />
          </button>
          <button
            onClick={() => setIsAdvancedMode(!isAdvancedMode)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded border transition-colors cursor-pointer shrink-0 ${
              isAdvancedMode
                ? "bg-amber-500/15 border-amber-500/50 text-amber-500 hover:bg-amber-500/25"
                : "bg-white/5 border-prizm-border text-prizm-text hover:bg-white/10"
            }`}
            title={isAdvancedMode ? "Advanced Controls Unlocked" : "Unlock Advanced Controls"}
          >
            {isAdvancedMode ? <Unlock size={12} className="text-amber-500 animate-pulse" /> : <Lock size={12} className="text-prizm-text-muted" />}
            {isAdvancedMode ? "Advanced" : "Unlock"}
          </button>
        

</div>
      </div>
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between px-1.5 py-0.5 bg-[#001a1a] border-x border-b border-prizm-border shadow-md z-[60] relative saturate-150">
           <div className="flex items-center gap-4">
              <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-widest">{selectedIds.size} Selected</span>
              <button 
                 onClick={() => setSelectedIds(new Set())}
                 className="text-[10px] text-prizm-text-muted hover:text-white uppercase tracking-widest underline decoration-prizm-text-muted/30 underline-offset-4 transition-colors"
              >
                 Clear
              </button>
           </div>
           <div className="flex items-center gap-2" title={!rotationCapabilities?.strings?.single ? "String Rotation Control capability not verified on local EMS" : ""}>
              <button
                  disabled={!rotationCapabilities?.strings?.single}
                  onClick={() => {
                     setRotationModalAction('in');
                     setRotationModalTargets(getSelectedTargets());
                     setRotationModalOpen(true);
                  }}
                  className="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-500/30 rounded text-[10px] uppercase font-bold tracking-widest transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                  Set In Rotation
              </button>
              <button
                  disabled={!rotationCapabilities?.strings?.single}
                  onClick={() => {
                     setRotationModalAction('out');
                     setRotationModalTargets(getSelectedTargets());
                     setRotationModalOpen(true);
                  }}
                  className="px-3 py-1 bg-slate-500/20 text-slate-300 border border-slate-500/50 hover:bg-slate-500/30 rounded text-[10px] uppercase font-bold tracking-widest transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                  Set Out Rotation
              </button>
              <button
                  onClick={() => {
                     setBalancingModalOpen(true);
                  }}
                  className="px-3 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/50 hover:bg-blue-500/30 rounded text-[10px] uppercase font-bold tracking-widest transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                  Set Balancing
              </button>
              <button
                  onClick={() => openContactorModal("open")}
                  className="px-3 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/50 hover:bg-amber-500/30 rounded text-[10px] uppercase font-bold tracking-widest transition-colors cursor-pointer"
                  title="Open selected string contactors through Phoenix BMS"
              >
                  Open Contactors
              </button>
              <button
                  onClick={() => openContactorModal("close")}
                  className="px-3 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/50 hover:bg-blue-500/30 rounded text-[10px] uppercase font-bold tracking-widest transition-colors cursor-pointer"
                  title="Close selected string contactors through Phoenix BMS"
              >
                  Close Contactors
              </button>
              {isAdvancedMode && (
                 <>
                 </>
              )}
           </div>
        </div>
      )}
      {/* Main Strings Table Engine */}
      <div className="flex-1 bg-prizm-surface border-x border-b border-prizm-border rounded-b-lg relative pb-12" id="strings-dashboard-scroll">
         <table className="w-full text-left text-[9px] font-mono whitespace-nowrap border-collapse">
             <thead className="sticky top-[102px] z-[70] bg-prizm-surface-strong shadow-sm">
                <tr className="text-prizm-text-muted uppercase tracking-wider">
                  <th className="px-1 py-0.5 border-b border-prizm-border sticky top-[102px] left-0 bg-prizm-surface-strong z-[80] w-[30px]"></th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border font-bold sticky top-[102px] left-[30px] bg-prizm-surface-strong z-[80] whitespace-nowrap min-w-[54px] sm:min-w-[64px]">ARR</th>
                  <th className="px-1 py-0.5 border-b border-prizm-border sticky top-[102px] left-[84px] sm:left-[94px] bg-prizm-surface-strong z-[80] w-[30px]"></th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border font-bold sticky top-[102px] left-[114px] sm:left-[124px] bg-prizm-surface-strong z-[80] whitespace-nowrap min-w-[48px]">STR</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Contactors</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Rotation</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Meas V</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Calc V</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Bus V</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Amps</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">kW</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">SOC %</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Ah</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Min Cell V</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Max Cell V</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Δ Cell V</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Min Temp (°F)</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Max Temp (°F)</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Δ Temp (°F)</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">BAL CT</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">BAL MODE</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Location</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Fans</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border text-right sticky top-[102px] bg-prizm-surface-strong z-[50]">Timestamp</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-prizm-border/20">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-prizm-text-muted font-bold tracking-widest text-xs">NO STRINGS MATCHING FILTERS</td>
                </tr>
              ) : (
                filtered.map((s:any, idx: number) => {
                  const isArrFirst = idx === 0 || filtered[idx-1].arrayNumber !== s.arrayNumber;
                  const arrStrings = filtered.filter((fs:any) => fs.arrayNumber === s.arrayNumber);
                  const arrSelectedCount = arrStrings.filter((fs:any) => selectedIds.has(fs.id)).length;
                  const isArrAllSelected = arrSelectedCount > 0 && arrSelectedCount === arrStrings.length;
                  const isArrIndeterminate = arrSelectedCount > 0 && arrSelectedCount < arrStrings.length;
                  
                  const normalizeText = (value: any): string => {
                    if (value === null || value === undefined) return "";
                    if (typeof value === "string") return value.toUpperCase();
                    try { return JSON.stringify(value).toUpperCase(); } catch { return String(value).toUpperCase(); }
                  };

                  const rowWarnings = [
                    ...(Array.isArray(s.warnings) ? s.warnings : []),
                    ...(Array.isArray(s.notificationList) ? s.notificationList : []),
                    ...(Array.isArray(s.activeNotifications) ? s.activeNotifications : []),
                    ...(Array.isArray(s.faults) ? s.faults : [])
                  ];

                  const rowAlarms = Array.isArray(s.alarms) ? s.alarms : [];

                  const alertText = [
                    ...rowWarnings,
                    ...rowAlarms,
                    s.alertSummary,
                    s.operationalState,
                    s.statusLabel,
                    s.rotationStatus,
                    s.rotationState,
                    s.stringRotationState,
                    s.balMode,
                    s.balanceMode,
                    s.bucket,
                    s.stringConnectionState
                  ].map(normalizeText).join(" ");

                  const rowBucket = String(s.bucket || "").toLowerCase();
                  const balModeText = String(s.balMode || s.balanceMode || "").trim().toUpperCase();

                  // Reference legend: dot 1 in rotation group is communication timestamp.
                  const sampleAgeMs = Number(s.sampleAgeMs ?? 0);
                  const rowTimestampMs = s.timestampUtc ? new Date(s.timestampUtc).getTime() : 0;
                  const timestampAgeMs = rowTimestampMs > 0 ? Date.now() - rowTimestampMs : Number.POSITIVE_INFINITY;

                  const commState =
                    s.bucket === "notCommunicating" || s.communicating === false || rowBucket === "notcommunicating"
                      ? "lost"
                      : s.stale === true || s.badReport === true || sampleAgeMs > 120000 || timestampAgeMs > 300000
                        ? "delayed"
                        : "fresh";

                  // Reference legend: dot 2 in rotation group is rotation state.
                  // Offline, OOR, balance mode Off, or explicit OUT must render as out-of-rotation.
                  const explicitOutOfRotation =
                    s.outRotation === true ||
                    s.inRotation === false ||
                    balModeText === "OFF" ||
                    String(s.rotationStatus || "").toUpperCase().includes("OUT") ||
                    String(s.rotationState || "").toUpperCase().includes("OUT") ||
                    String(s.stringRotationState || "").toUpperCase().includes("OUT") ||
                    alertText.includes("STRING OOR") ||
                    alertText.includes("OUT OF ROTATION") ||
                    alertText.includes("OUT-OF-ROTATION") ||
                    alertText.includes("OOR WARNING") ||
                    rowBucket === "offline" ||
                    rowBucket === "notcommunicating";

                  const inRotation = !explicitOutOfRotation;

                  // Reference legend: dot 3 in rotation group is notification severity.
                  const stringNotificationKey = `${Number(s.arrayNumber ?? s.arrayIndex)}-${Number(s.stringNumber ?? s.stringIndex)}`;
                  const stringNotificationRollup = notificationRollupsByString[stringNotificationKey] || null;

                  const warningTotal =
                    Number(stringNotificationRollup?.warningCount ?? 0) ||
                    (
                      Number(s.warningCount || 0) +
                      Number(s.uniqueWarningCount || 0) +
                      rowWarnings.length +
                      (explicitOutOfRotation ? 1 : 0)
                    );

                  const alarmTotal =
                    Number(stringNotificationRollup?.alarmCount ?? 0) ||
                    (
                      Number(s.alarmCount || 0) +
                      Number(s.uniqueAlarmCount || 0) +
                      rowAlarms.length
                    );

                  const alertsState = alarmTotal > 0 ? "alarm" : warningTotal > 0 ? "warning" : "ok";

                  const rotDot1 =
                    commState === "lost"
                      ? "bg-prizm-danger border border-prizm-danger shadow-[0_0_5px_rgba(255,51,102,0.5)]"
                      : commState === "delayed"
                        ? "bg-prizm-warning border border-prizm-warning shadow-[0_0_5px_rgba(255,204,0,0.5)]"
                        : "bg-emerald-500 border border-emerald-600 shadow-[0_0_5px_rgba(16,185,129,0.5)]";

                  const rotDot2 = inRotation
                    ? "bg-emerald-500 border border-emerald-600 shadow-[0_0_5px_rgba(16,185,129,0.5)]"
                    : "bg-black border border-slate-500";

                  const rotDot3 =
                    alertsState === "alarm"
                      ? "bg-prizm-danger border border-prizm-danger shadow-[0_0_5px_rgba(255,51,102,0.5)]"
                      : alertsState === "warning"
                        ? "bg-prizm-warning border border-prizm-warning shadow-[0_0_5px_rgba(255,204,0,0.5)]"
                        : "bg-emerald-500 border border-emerald-600 shadow-[0_0_5px_rgba(16,185,129,0.5)]";

                  // Reference legend: contactor group dots.
                  //
                  // The backend endpoint now publishes authoritative actual contactor state
                  // from stringviewer-live. Do not infer from requested state, connection
                  // permitted, stale aggregate values, or reclose count.
                  //
                  // Dot 1 = actual contactor state
                  // Dot 2 = positive feedback matches actual state
                  // Dot 3 = negative feedback matches actual state
                  const statusText = String(s.contactorStatus ?? "").trim().toUpperCase();

                  const interpretedClosed =
                    statusText === "CLOSED" ? true :
                    statusText === "OPEN" ? false :
                    null;

                  // Contactor dots compare actual feedback against requested state.
                  //
                  // green = this contactor matches requested open/closed state
                  // red   = this contactor does not match requested state
                  //
                  // Example:
                  // requested OPEN + positive open / negative open = both green
                  // requested OPEN + positive closed / negative open = positive red, negative green
                  // requested CLOSED + positive closed / negative open = positive green, negative red
                  const positiveClosed =
                    s.positiveContactorClosed === true ? true :
                    s.positiveContactorClosed === false ? false :
                    null;

                  const negativeClosed =
                    s.negativeContactorClosed === true ? true :
                    s.negativeContactorClosed === false ? false :
                    null;

                  const expectedClosed =
                    s.contactor?.contactorsCloseExpected === true ? true :
                    s.contactor?.contactorsCloseExpected === false ? false :
                    s.contactorsCloseExpected === true ? true :
                    s.contactorsCloseExpected === false ? false :
                    s.requestedContactorState === "closed" ? true :
                    s.requestedContactorState === "open" ? false :
                    null;

                  const requestedClosed = expectedClosed === true;

                  const positiveMatchesRequest =
                    expectedClosed === null || positiveClosed === null
                      ? false
                      : positiveClosed === expectedClosed;

                  const negativeMatchesRequest =
                    expectedClosed === null || negativeClosed === null
                      ? false
                      : negativeClosed === expectedClosed;

                  const contDot1 = requestedClosed
                    ? "bg-blue-500 border border-blue-600 shadow-[0_0_5px_rgba(59,130,246,0.5)]"
                    : "bg-white border border-slate-500";

                  const contDot2 = positiveMatchesRequest
                    ? "bg-emerald-500 border border-emerald-600 shadow-[0_0_5px_rgba(16,185,129,0.5)]"
                    : "bg-prizm-danger border border-prizm-danger shadow-[0_0_5px_rgba(255,51,102,0.5)]";

                  const contDot3 = negativeMatchesRequest
                    ? "bg-emerald-500 border border-emerald-600 shadow-[0_0_5px_rgba(16,185,129,0.5)]"
                    : "bg-prizm-danger border border-prizm-danger shadow-[0_0_5px_rgba(255,51,102,0.5)]";
                  
                  // Fans logic & color mapping
                  const MAX_FAN_RPM = 7500;
                  const FAN_MATCH_TOLERANCE_PERCENT = 5;

                  const toFiniteNumber = (value: any): number | null => {
                    const n = Number(value);
                    return Number.isFinite(n) ? n : null;
                  };

                  const formatPercent = (value: any): string => {
                    const n = toFiniteNumber(value);
                    return n === null ? "--" : `${Math.round(n)}%`;
                  };

                  const formatRpm = (value: any): string => {
                    const n = toFiniteNumber(value);
                    return n === null ? "--" : `${Math.round(n)} RPM`;
                  };

                  const formatFanCount = (value: any): string => {
                    const n = toFiniteNumber(value);
                    return n === null ? "--" : `${Math.round(n)}`;
                  };

                  const commandPct = toFiniteNumber(s.fanCommandPercent);
                  const settingPct = toFiniteNumber(s.fanSettingPercent);
                  const actualPct = toFiniteNumber(s.fanStatusPercent);
                  const avgRpm = toFiniteNumber(s.fanStatusAvgRpm);
                  const ratedRpm = toFiniteNumber(s.fanRatedRpm) ?? 7500;
                  const fanCountValue = toFiniteNumber(s.fanCount);
                  const fanState = String(s.fanState || "no-command").toLowerCase();
                  const fanTimeText = s.fanLastCommandTime || s.lastFanCommandTime || "--";

                  const fanDotClass =
                    fanState === "match"
                      ? "bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]"
                      : fanState === "mismatch"
                        ? "bg-yellow-500 shadow-[0_0_5px_rgba(234,179,8,0.5)]"
                        : "bg-black border border-neutral-700";

                  const fanRpmValues = Array.isArray(s.fanStatusRpmValues)
                    ? s.fanStatusRpmValues
                        .map((v: any) => toFiniteNumber(v))
                        .filter((v: number | null): v is number => v !== null)
                    : [];

                  const fanRpmLines =
                    fanRpmValues.length > 0
                      ? fanRpmValues.map((rpm: number, fanIdx: number) => `Fan ${fanIdx + 1} RPM: ${formatRpm(rpm)}`)
                      : [`Fan RPMs: --`];

                  const stateLabel =
                    fanState === "match" ? "Match" :
                    fanState === "mismatch" ? "Mismatch" :
                    fanState === "unknown" ? "Unknown" :
                    "No Command";

                  const fanTooltip = [
                    `Command: ${formatPercent(commandPct)}`,
                    `Actual: ${formatPercent(actualPct)}`,
                    `Setting: ${formatPercent(settingPct)}`,
                    `Avg RPM: ${formatRpm(avgRpm)}`,
                    `Rated RPM: ${formatRpm(ratedRpm)}`,
                    `Fans: ${formatFanCount(fanCountValue)}`,
                    ...fanRpmLines,
                    `Tolerance: ±5%`,
                    `State: ${stateLabel}`,
                    `Last Command Time: ${fanTimeText || "--"}`
                  ].join("\n");

                  const safeText = (value: any, fallback = "--"): string => {
                    if (value === null || value === undefined) return fallback;
                    if (typeof value === "string") {
                      const trimmed = value.trim();
                      return trimmed.length ? trimmed : fallback;
                    }
                    if (typeof value === "number" || typeof value === "boolean") {
                      return String(value);
                    }
                    return fallback;
                  };

                  const locStr = safeText(s.location, "") || safeText(s.container, "") || "--";

                  const telemetryAvailable = s.balanceTelemetryAvailable === true || (Array.isArray(s.balanceDetails) && s.balanceDetails.length > 0);
                  let balanceTooltip = "Balance telemetry not reported by current EMS source.";
                  let balCountToShow = "--";
                  let balModeToShow = "--";

                  if (telemetryAvailable) {
                      balCountToShow = String(s.balanceCount ?? 0);
                      balModeToShow = s.balanceMode || "--";

                      const details = Array.isArray(s.balanceDetails) ? s.balanceDetails : [];
                      const totalBpcs = details.length || 14;
                      const activeCount =
                        toFiniteNumber(s.balanceCount) ??
                        details.filter((b: any) => b.isActive === true).length;
                      const reportedCount = details.filter((b: any) =>
                        b.balanceTelemetryPresent === true && b.missingFromSource !== true
                      ).length;
                      const lines = details.map((b: any, bIdx: number) => {
                        const idx = b.bpIndex ?? b.bpcNumber ?? (bIdx + 1);
                        const modeStr = b.mode || "--";
                        const stateStr =
                          b.displayState ||
                          b.state ||
                          (b.missingFromSource ? "Not Reported" : "Off");
                        const cgStr =
                          b.balancingCellGroup !== null && b.balancingCellGroup !== undefined
                            ? `CG ${b.balancingCellGroup}`
                            : "CG --";
                        return `BPC ${idx}: ${modeStr} | ${stateStr} | ${cgStr}`;
                      });
                      balanceTooltip = [
                        `Active: ${activeCount} / ${totalBpcs}`,
                        `Telemetry: ${reportedCount} / ${totalBpcs}`,
                        "",
                        ...lines
                      ].join("\n");
                  }
                  
                  let borderClass = "";
                  if (s.alarmCount > 0) borderClass = "border-l-[3px] border-l-prizm-danger/60";
                  else if (s.warningCount > 0) borderClass = "border-l-[3px] border-l-prizm-warning/60";
                  else borderClass = "border-l-[3px] border-l-transparent";

                  return (
                  <tr key={s.id} onClick={() => setSelectedString(s)} className="group hover:bg-prizm-primary/5 cursor-pointer transition-colors relative">
<td className={"px-1.5 py-0.5 border-r border-prizm-border/10 sticky left-0 group-hover:bg-prizm-surface-strong bg-prizm-surface z-20 text-center " + borderClass}>
   {isArrFirst ? (
     <input type="checkbox" className="accent-prizm-primary w-3 h-3 cursor-pointer" 
       checked={isArrAllSelected}
       ref={el => { if(el) el.indeterminate = isArrIndeterminate; }}
       onChange={() => {}}
       onClick={(e) => {
         e.stopPropagation();
         const arrStrings = filtered.filter((fs:any) => fs.arrayNumber === s.arrayNumber);
         const allSelected = arrStrings.every((fs:any) => selectedIds.has(fs.id));
         const next = new Set(selectedIds);
         if (allSelected) {
             arrStrings.forEach((fs:any) => next.delete(fs.id));
         } else {
             arrStrings.forEach((fs:any) => next.add(fs.id));
         }
         setSelectedIds(next);
       }} 
     />
   ) : null}
</td>
<td className="px-1.5 py-0.5 border-r border-prizm-border/20 sticky left-[30px] group-hover:bg-prizm-surface-strong bg-prizm-surface z-20 min-w-[54px] sm:min-w-[64px]" title={s.warningCount > 0 || s.alarmCount > 0 ? `Warnings: ${(s.warnings||[]).join(", ")} | Alarms: ${(s.alarms||[]).join(", ")}` : ""}>
   {isArrFirst ? <span className="text-prizm-primary font-mono font-bold">{s.arrayNumber}</span> : null}
</td>
<td className="px-1.5 py-0.5 border-r border-prizm-border/10 sticky left-[84px] sm:left-[94px] group-hover:bg-prizm-surface-strong bg-prizm-surface z-20 text-center">
   <input type="checkbox" className="accent-prizm-primary w-3 h-3 cursor-pointer" 
     checked={selectedIds.has(s.id)}
     onChange={() => {}}
     onClick={(e) => {
       e.stopPropagation();
       const next = new Set(selectedIds);
       if (next.has(s.id)) next.delete(s.id);
       else next.add(s.id);
       setSelectedIds(next);
     }} 
   />
</td>
<td className="px-1.5 py-0.5 border-r border-prizm-border/20 sticky left-[114px] sm:left-[124px] group-hover:bg-prizm-surface-strong bg-prizm-surface z-20 font-bold text-prizm-primary font-mono text-center min-w-[48px]">
   {s.stringNumber}
</td>
<td className="px-1.5 py-0.5">
                       <div 
                         className="flex items-center gap-1 cursor-help"
                         title={`Request: ${requestedClosed ? "CLOSED" : "OPEN"} | Positive actual: ${positiveClosed ? "CLOSED" : "OPEN"} (${positiveMatchesRequest ? "matches" : "does not match"}) | Negative actual: ${negativeClosed ? "CLOSED" : "OPEN"} (${negativeMatchesRequest ? "matches" : "does not match"}) | Reclose Count: ${s.recloseCount ?? "--"}`}
                       >
                           <div className={`w-2 h-2 rounded-full ${contDot1}`}></div>
                           <div className={`w-2 h-2 rounded-full ${contDot2}`}></div>
                           <div className={`w-2 h-2 rounded-full ${contDot3}`}></div>
                           <span className="ml-1 text-[9px] text-prizm-text-muted">R:{s.recloseCount ?? "--"}</span>
                       </div>
                    </td>
                    <td className="px-1.5 py-0.5">
                       <div 
                         className="flex items-center gap-1 cursor-help"
                         title={`Comm: ${commState.toUpperCase()} | Rotation: ${inRotation ? "IN" : "OUT"} | Notification: ${alertsState.toUpperCase()}`}
                       >
                          <div className={`w-2 h-2 rounded-full ${rotDot1}`}></div>
                          <div className={`w-2 h-2 rounded-full ${rotDot2}`}></div>
                          <div className={`w-2 h-2 rounded-full ${rotDot3}`}></div>
                       </div>
                    </td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-emerald-400">{s.measuredVoltage !== null ? s.measuredVoltage : "--"}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-info">{s.calculatedVoltage !== null ? s.calculatedVoltage : "--"}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-text-muted">{s.busVoltage !== null && s.busVoltage !== undefined ? s.busVoltage : "--"}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-text">{s.amps !== null ? s.amps : "--"}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-text">{s.kw !== null ? s.kw : "--"}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-info font-bold">{s.socPct !== null ? s.socPct+"%" : "--"}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-text-muted">{formatNumber(s.ah, 2)}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-text-muted">{s.minCellVoltage !== null && normalizeVoltage(s.minCellVoltage) !== null ? normalizeVoltage(s.minCellVoltage) : "--"}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-text-muted">{s.maxCellVoltage !== null && normalizeVoltage(s.maxCellVoltage) !== null ? normalizeVoltage(s.maxCellVoltage) : "--"}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-warning">{s.cellVoltageDelta !== null && normalizeDeltaVoltage(s.cellVoltageDelta) !== null ? normalizeDeltaVoltage(s.cellVoltageDelta) : "--"}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-text-muted">{s.minCellTemperature != null ? formatTemperatureF(s.minCellTemperature, { decimals: 1, showUnit: false, sourceUnit: "C" }) : "--"}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-text-muted">{s.maxCellTemperature != null ? formatTemperatureF(s.maxCellTemperature, { decimals: 1, showUnit: false, sourceUnit: "C" }) : "--"}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-warning">{s.cellTemperatureDelta != null ? (s.cellTemperatureDelta * 1.8).toFixed(1) : "--"}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-text-muted cursor-help" title={balanceTooltip}>{balCountToShow}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-text truncate max-w-[100px] cursor-help" title={balanceTooltip}>{balModeToShow}</td>
                    <td className="px-1.5 py-0.5 font-bold text-prizm-text-muted text-xs">
                        {locStr}
                    </td>
                    <td className="px-1.5 py-0.5">
                       <div 
                           title={fanTooltip}
                           className={`w-2.5 h-2.5 rounded-full cursor-help ${fanDotClass}`}
                       ></div>
                    </td>
                    <td className="px-1.5 py-0.5 text-right font-mono text-prizm-text-muted text-[10px]">
                       <div className="flex items-center justify-end gap-2">
                           <span>{s.rawTimestamp || s.timestampDisplay || formatPrizmUtcTimestamp(s.timestampUtc || 0)}</span>
                           <ChevronRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity text-prizm-primary" />
                       </div>
                    </td>
                  </tr>
                  )})
              )}
            </tbody>
         </table>
      </div>

      <button
        className="fixed bottom-6 right-6 z-50 bg-prizm-surface-strong text-prizm-primary border border-prizm-primary/50 hover:bg-prizm-primary hover:text-prizm-bg px-4 py-2 rounded-full font-bold shadow-lg shadow-prizm-primary/20 transition-all active:scale-95 flex items-center gap-2 cursor-pointer outline-none"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <span className="text-xl leading-none">&uarr;</span> TOP
      </button>

          <RotationModal
        isOpen={rotationModalOpen}
        onClose={() => setRotationModalOpen(false)}
        onConfirm={handleRotationConfirm}
        targets={rotationModalTargets}
        action={rotationModalAction}
        targetType="string"
      />

      <BalancingModal
        isOpen={balancingModalOpen}
        onClose={() => setBalancingModalOpen(false)}
        onPreflight={handleBalancingPreflight}
        onConfirm={handleBalancingConfirm}
        targets={getSelectedTargets()}
        targetType="string"
      />

      <ContactorControlModal
        isOpen={contactorModalOpen}
        onClose={() => setContactorModalOpen(false)}
        onConfirm={handleContactorConfirm}
        targets={contactorModalTargets}
        action={contactorModalAction}
      />
    </div>
  );
}
