import React, { useState, useEffect, useMemo } from "react";
import { ServerOff, Search, ChevronRight, Download, RefreshCw, Layers } from "lucide-react";
import StringDetailDashboard from "./StringDetailDashboard";

import { formatPrizmUtcTimestamp } from '../lib/timeFormat';
import RotationModal, { RotationTarget } from './RotationModal';
import BalancingModal from './BalancingModal';
import { useSiteData } from '../context/SiteDataContext';

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

  const [loading, setLoading] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(15000);
  
  const [search, setSearch] = useState("");
  const [arrayFilter, setArrayFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState("all");
  
  const cacheTtlMs = 15000;
  const [selectedString, setSelectedString] = useState<any | null>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const [rotationCapabilities, setRotationCapabilities] = useState<any>(null);
  const [rotationModalOpen, setRotationModalOpen] = useState(false);
  const [rotationModalAction, setRotationModalAction] = useState<'in' | 'out'>('in');
  const [rotationModalTargets, setRotationModalTargets] = useState<any[]>([]);
  
  const [balancingModalOpen, setBalancingModalOpen] = useState(false);

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

  const strings = data?.strings || [];

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
  const normalCount =
    countOf(data?.rollups?.normal) ??
    countOf(data?.rollups?.online) ??
    summary?.normalStrings ??
    strings.filter((s:any) => s.operationalState === "NORMAL").length;
  const offlineCount =
    countOf(data?.rollups?.offline) ??
    summary?.offlineStrings ??
    strings.filter((s:any) => s.operationalState === "OFFLINE" || s.bucket === "offline" || s.bucket === "notCommunicating").length;
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
        if (stateFilter === "online" && s.operationalState === "OFFLINE") return false;
        if (stateFilter === "offline" && s.operationalState !== "OFFLINE") return false;
      }
      if (healthFilter !== "all") {
        if (healthFilter === "alarms" && s.alarmCount <= 0) return false;
        if (healthFilter === "warnings" && s.warningCount <= 0) return false;
      }
      if (search) {
        const sq = search.toLowerCase();
        if (!s.stringKey.toLowerCase().includes(sq) && !s.stringControllerIp?.toLowerCase().includes(sq)) return false;
      }
      return true;
    });
  }, [strings, arrayFilter, stateFilter, healthFilter, search]);

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
      <StringDetailDashboard 
        stringData={selectedString} 
        onBack={() => setSelectedString(null)} 
      />
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
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6 shrink-0 text-center font-mono select-none">
        <div className="bg-prizm-surface-strong border border-prizm-border rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase">Total Strings</span>
          <span className="text-sm font-bold text-prizm-text">{formatMaybeInt(totalStrings)}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border border-b-2 border-b-emerald-500/50 rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase">Normal</span>
          <span className="text-sm font-bold text-emerald-400">{formatMaybeInt(normalCount)}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border border-b-2 border-b-prizm-danger/50 rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase">Offline</span>
          <span className={offlineCount > 0 ? "text-sm font-bold text-prizm-danger" : "text-sm font-bold text-prizm-text"}>{formatMaybeInt(offlineCount)}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase">Warns / Alarms</span>
          <span className="text-sm font-bold text-prizm-warning">{formatMaybeInt(warningCount)} <span className="text-prizm-text-muted mx-1">/</span> <span className="text-prizm-danger">{formatMaybeInt(alarmCount)}</span></span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase leading-tight">Total BPCs</span>
          <span className="text-[11px] font-bold text-prizm-text mt-0.5">Known {formatMaybeInt(data?.rollups?.knownBpcCount ?? summary?.totalBpcs)} <span className="text-prizm-text-muted font-normal mx-0.5">/</span> {formatMaybeInt(data?.rollups?.expectedBpcCount)}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase leading-tight">BPC Alerts</span>
          <span className="text-sm font-bold text-prizm-warning">{formatMaybeInt(summary?.warningBpcs)} <span className="text-prizm-text-muted mx-1">/</span> <span className="text-prizm-danger">{formatMaybeInt(summary?.alarmBpcs)}</span></span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase leading-tight">Fleet Avg Cell / V Delta</span>
          <span className="text-[11px] font-bold text-prizm-text mt-0.5">
            {fleetAvgCellVoltage !== null ? (fleetAvgCellVoltage > 100 ? (fleetAvgCellVoltage / 1000).toFixed(3) + "V" : fleetAvgCellVoltage.toFixed(3) + "V") : "--"}
            <span className="text-prizm-text-muted mx-1">|</span>
            {fleetMaxCellVoltageDelta !== null ? "\u0394" + (fleetMaxCellVoltageDelta > 10 ? fleetMaxCellVoltageDelta.toFixed(0) + "mV" : fleetMaxCellVoltageDelta.toFixed(3) + "V") : "--"}
          </span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase leading-tight">Fleet Avg Temp / Max &Delta;</span>
          <span className="text-[11px] font-bold text-prizm-text mt-0.5">
            {fleetAvgCellTemp !== null ? fleetAvgCellTemp.toFixed(1) + "°C" : "--"}
            <span className="text-prizm-text-muted mx-1">|</span>
            {fleetMaxCellTempDelta !== null ? "\u0394" + fleetMaxCellTempDelta.toFixed(1) + "°C" : "--"}
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
            <option value="offline">Offline</option>
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
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Min Temp</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Max Temp</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Δ Temp</th>
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
                  
                  // Rotation Dots
                  const commsOk = s.badReport === false || (new Date().getTime() - new Date(s.timestampUtc || 0).getTime() < 300000);
                  const inRotation = s.outRotation === false;
                  const alertsState = s.alarmCount > 0 ? 'alarm' : s.warningCount > 0 ? 'warning' : 'ok';
                  
                  const rotDot1 = commsOk ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'bg-prizm-text-muted/30';
                  const rotDot2 = inRotation ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'bg-prizm-text-muted/30';
                  const rotDot3 = alertsState === 'alarm' ? 'bg-prizm-danger shadow-[0_0_5px_rgba(255,51,102,0.5)]' : alertsState === 'warning' ? 'bg-prizm-warning shadow-[0_0_5px_rgba(255,204,0,0.5)]' : 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]';
                  
                  // Contactor Dots
                  const stateHasContactorProps = typeof s.positiveContactorClosed === "boolean" && typeof s.negativeContactorClosed === "boolean";
                  const overallContactorClosed = stateHasContactorProps 
                        ? (s.positiveContactorClosed && s.negativeContactorClosed) 
                        : s.contactorClosed;
                  
                  const contDot1 = overallContactorClosed ? 'bg-blue-400 shadow-[0_0_5px_rgba(96,165,250,0.5)]' : 'bg-prizm-text-muted/30';
                  
                  let contDot2 = 'bg-prizm-text-muted/30';
                  let contDot3 = 'bg-prizm-text-muted/30';
                  if (typeof s.contactorsCloseExpected === "boolean" && stateHasContactorProps) {
                        contDot2 = s.positiveContactorClosed === s.contactorsCloseExpected ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'bg-prizm-danger shadow-[0_0_5px_rgba(255,51,102,0.5)]';
                        contDot3 = s.negativeContactorClosed === s.contactorsCloseExpected ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'bg-prizm-danger shadow-[0_0_5px_rgba(255,51,102,0.5)]';
                  } else if (stateHasContactorProps) {
                        // Without expected, we can just show physical state or default to unknown
                        contDot2 = s.positiveContactorClosed ? 'bg-blue-400 border border-transparent' : 'bg-prizm-bg border border-prizm-text-muted/50';
                        contDot3 = s.negativeContactorClosed ? 'bg-blue-400 border border-transparent' : 'bg-prizm-bg border border-prizm-text-muted/50';
                  }
                  
                  // Fans logic & color mapping
                  let fanDotClass = "bg-prizm-text-muted/20";
                  if (s.fanCommandPercent !== null && s.fanStatusPercent !== null) {
                    const diff = Math.abs(s.fanCommandPercent - s.fanStatusPercent);
                    if (diff <= 15) {
                      fanDotClass = "bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]";
                    } else {
                      fanDotClass = "bg-prizm-warning shadow-[0_0_5px_rgba(255,204,0,0.5)]";
                    }
                  } else if (s.fanCommandPercent !== null) {
                    fanDotClass = "bg-blue-400 shadow-[0_0_4px_rgba(96,165,250,0.4)]";
                  } else if (s.fanCommandRequested === true || s.fanRequested === true || s.lastFanCommand === true) {
                    fanDotClass = "bg-emerald-500/80";
                  }

                  const fanCommandText = s.fanCommandPercent !== null ? `${s.fanCommandPercent}%` : (s.fanCommandRequested ? "On" : "Not Reported");
                  const fanStatusText = s.fanStatusPercent !== null ? `${s.fanStatusPercent}%` : "Not Reported";
                  const fanCmdRpmText = s.fanCommandRpm !== null && s.fanCommandRpm !== undefined ? s.fanCommandRpm : "--";
                  const fanSetRpmText = s.fanSettingRpm !== null && s.fanSettingRpm !== undefined ? s.fanSettingRpm : "--";
                  const fanTimeText = s.fanLastCommandTime || s.lastFanCommandTime || "--";

                  const fanTooltip = [
                    `Command: ${fanCommandText}`,
                    `Status: ${fanStatusText}`,
                    `Command RPM: ${fanCmdRpmText}`,
                    `Status RPM: ${fanSetRpmText}`,
                    `Last Command Time: ${fanTimeText}`
                  ].join("\n");

                  const locStr = s.location && s.location.trim() !== "" ? s.location : s.container && s.container.trim() !== "" ? s.container : "--";

                  // Balancing details & tooltips
                  let balanceTooltip = "Balance telemetry not reported by current EMS source.";
                  if (Array.isArray(s.balanceDetails) && s.balanceDetails.length > 0) {
                    const lines = s.balanceDetails.map((b: any, bIdx: number) => {
                      const modeStr = b.mode || "--";
                      const stateStr = b.state || "--";
                      const cgStr = b.balancingCellGroup !== null && b.balancingCellGroup !== undefined ? `CG ${b.balancingCellGroup}` : "CG --";
                      return `BPC ${b.bpIndex ?? (bIdx + 1)}: ${modeStr} | ${stateStr} | ${cgStr}`;
                    });
                    const maxLinesToShow = 18;
                    if (lines.length > maxLinesToShow) {
                      const displayedLines = lines.slice(0, maxLinesToShow);
                      balanceTooltip = [
                        ...displayedLines,
                        `... and ${lines.length - maxLinesToShow} more BPCs (Total: ${lines.length})`
                      ].join("\n");
                    } else {
                      balanceTooltip = lines.join("\n");
                    }
                  }

                  const balCountToShow = (s.balanceDetails && s.balanceDetails.length > 0) ? s.balanceCount : "--";
                  const balModeToShow = s.balanceMode || "--";
                  
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
                         title={`Expected: ${s.contactorsCloseExpected !== undefined ? (s.contactorsCloseExpected?"CLOSED":"OPEN") : "Unknown"} | Positive: ${s.positiveContactorClosed!==undefined?(s.positiveContactorClosed?"CLOSED":"OPEN"):"Unknown"} | Negative: ${s.negativeContactorClosed!==undefined?(s.negativeContactorClosed?"CLOSED":"OPEN"):"Unknown"} | Reclose Count: ${s.recloseCount ?? "--"}`}
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
                         title={`Comms: ${commsOk?"OK":"Stale"} | Rotation: ${inRotation?"IN":"OUT"} | Alerts: ${alertsState}`}
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
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-text-muted">{s.minCellVoltage !== null ? s.minCellVoltage : "--"}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-text-muted">{s.maxCellVoltage !== null ? s.maxCellVoltage : "--"}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-warning">{s.cellVoltageDelta !== null ? s.cellVoltageDelta : "--"}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-text-muted">{s.minCellTemperature !== null ? s.minCellTemperature : "--"}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-text-muted">{s.maxCellTemperature !== null ? s.maxCellTemperature : "--"}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-warning">{s.cellTemperatureDelta !== null ? s.cellTemperatureDelta : "--"}</td>
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
    </div>
  );
}
