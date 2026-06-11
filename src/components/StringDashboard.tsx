import React, { useState, useEffect, useMemo } from "react";
import { ServerOff, Search, ChevronRight, Download, RefreshCw, Layers } from "lucide-react";
import StringDetailDashboard from "./StringDetailDashboard";

import { formatPrizmUtcTimestamp } from '../lib/timeFormat';

export default function StringDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [search, setSearch] = useState("");
  const [arrayFilter, setArrayFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState("all");
  
  const [refreshInterval, setRefreshInterval] = useState(5000);
  const cacheTtlMs = 15000;
  const [selectedString, setSelectedString] = useState<any | null>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    let unmounted = false;
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/local/strings/dashboard?array=ALL&enrich=none&maxAgeMs=${cacheTtlMs}`);
        if (res.ok && !unmounted) {
          const json = await res.json();
          setData(json);
          // Update selected string reference to get fresh data
          if (selectedString) {
             const updated = json.strings.find((s:any) => s.id === selectedString.id);
             if (updated) setSelectedString(updated);
          }
        }
      } catch (err) {
        console.error("Failed to fetch dashboard strings", err);
      } finally {
        if (!unmounted) setLoading(false);
      }
    };
    fetchData();
    let interval: any;
    if (refreshInterval > 0) {
       interval = setInterval(fetchData, refreshInterval);
    }
    return () => {
      unmounted = true;
      if (interval) clearInterval(interval);
    };
  }, [refreshInterval, selectedString?.id]);

  const handleManualRefresh = async () => {
      setIsRefreshing(true);
      try {
        const res = await fetch(`/api/local/strings/dashboard?array=ALL&enrich=none&refresh=true&maxAgeMs=${cacheTtlMs}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
          // Update selected string reference to get fresh data
          if (selectedString) {
             const updated = json.strings.find((s:any) => s.id === selectedString.id);
             if (updated) setSelectedString(updated);
          }
        }
      } catch (err) {
        console.error("Failed to fetch dashboard strings", err);
      } finally {
        setIsRefreshing(false);
      }
  };

  const strings = data?.strings || [];

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

  const { summary } = data;

  return (
    <div className="flex-1 flex overflow-hidden flex-col font-sans transition-all h-full bg-prizm-bg p-4 sm:p-6 pb-20">
      
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
           <div className={`p-1.5 border rounded ${
                (!data.cache || !data.cache.sourceOk) ? 'bg-prizm-danger/20 border-prizm-danger text-prizm-danger' : 
                (data.cache.isStale ? 'bg-prizm-warning/20 border-prizm-warning text-prizm-warning' : 
                 (data.cache.wasFetched ? 'bg-prizm-primary/20 border-prizm-primary text-prizm-primary font-bold' : 'bg-prizm-primary/10 border-prizm-primary/50 text-prizm-primary/80'))
           }`}>
                {(!data.cache || !data.cache.sourceOk) ? 'SOURCE OFFLINE' : (data.cache.isStale ? `STALE CACHE` : (data.cache.wasFetched ? 'LIVE FETCHED' : `LIVE CACHE`))}
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
                 {Object.entries(data.sourceHealth || {}).map(([cKey, h]: [string, any]) => (
                    <tr key={cKey}>
                       <td className="pr-4 py-1.5 text-prizm-primary font-bold">{cKey}</td>
                       <td className="pr-4 py-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-white ${h.ok ? 'bg-emerald-500/50' : 'bg-prizm-danger/50'}`}>
                              {h.ok ? 'OK' : 'FAIL'}
                          </span>
                       </td>
                       <td className="pr-4 py-1.5 text-prizm-text">{h.httpStatus || '--'}</td>
                       <td className="pr-4 py-1.5 text-prizm-text-muted">{h.durationMs !== null ? `${h.durationMs}ms` : '--'}</td>
                       <td className="pr-4 py-1.5 text-prizm-text-muted opacity-80">{h.url}</td>
                       <td className="py-1.5 text-prizm-danger/80">{h.error || '--'}</td>
                    </tr>
                 ))}
              </tbody>
           </table>
        </div>
      </details>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6 shrink-0 text-center font-mono select-none">
        <div className="bg-prizm-surface-strong border border-prizm-border rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase">Total Strings</span>
          <span className="text-sm font-bold text-prizm-text">{data.rollups?.totalStrings ?? summary.totalStrings ?? "--"}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border border-b-2 border-b-emerald-500/50 rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase">Normal</span>
          <span className="text-sm font-bold text-emerald-400">{data.rollups?.normal ?? summary.normalStrings ?? "--"}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border border-b-2 border-b-prizm-danger/50 rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase">Offline</span>
          <span className={(data.rollups?.offline ?? summary.offlineStrings) > 0 ? "text-sm font-bold text-prizm-danger" : "text-sm font-bold text-prizm-text"}>{data.rollups?.offline ?? summary.offlineStrings ?? "--"}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase">Warns / Alarms</span>
          <span className="text-sm font-bold text-prizm-warning">{data.rollups?.warnings ?? summary.warningStrings ?? 0} <span className="text-prizm-text-muted mx-1">/</span> <span className="text-prizm-danger">{data.rollups?.alarms ?? summary.alarmStrings ?? 0}</span></span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase leading-tight">Total BPCs</span>
          <span className="text-[11px] font-bold text-prizm-text mt-0.5">Known {data.rollups?.knownBpcCount ?? summary.totalBpcs ?? "--"} <span className="text-prizm-text-muted font-normal mx-0.5">/</span> {data.rollups?.expectedBpcCount ?? "--"}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase leading-tight">BPC Alerts</span>
          <span className="text-sm font-bold text-prizm-warning">{summary.warningBpcs} <span className="text-prizm-text-muted mx-1">/</span> <span className="text-prizm-danger">{summary.alarmBpcs}</span></span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase leading-tight">Fleet Avg Cell / V Delta</span>
          <span className="text-[11px] font-bold text-prizm-text mt-0.5">{(data.rollups?.fleetAvgCellVoltage ?? summary.avgCellVoltage) !== null ? (data.rollups?.fleetAvgCellVoltage ?? summary.avgCellVoltage)+"V" : "--"} <span className="text-prizm-text-muted mx-1">|</span> {(data.rollups?.fleetMaxCellVoltageDelta ?? summary.maxCellVoltageDelta) !== null ? "\u0394"+(data.rollups?.fleetMaxCellVoltageDelta ?? summary.maxCellVoltageDelta)+"V" : "--"}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase leading-tight">Fleet Avg Temp / Max \u0394</span>
          <span className="text-[11px] font-bold text-prizm-text mt-0.5">{(data.rollups?.fleetAvgCellTemp ?? summary.avgCellTemperature) !== null ? (data.rollups?.fleetAvgCellTemp ?? summary.avgCellTemperature)+"°C" : "--"} <span className="text-prizm-text-muted mx-1">|</span> {(data.rollups?.fleetMaxCellTemp ?? summary.maxCellTemperature) !== null ? (data.rollups?.fleetMaxCellTemp ?? summary.maxCellTemperature)+"°C" : "--"}</span>
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
          <select value={arrayFilter} onChange={e => setArrayFilter(e.target.value)} className="bg-black/20 border border-prizm-border rounded px-3 py-1.5 text-[10px] uppercase font-mono text-prizm-text focus:outline-none focus:border-prizm-primary cursor-pointer">
            <option value="all">Array: All</option>
            {arrays.map(a => <option key={String(a)} value={String(a)}>Array {a}</option>)}
          </select>
          <select value={stateFilter} onChange={e => setStateFilter(e.target.value)} className="bg-black/20 border border-prizm-border rounded px-3 py-1.5 text-[10px] uppercase font-mono text-prizm-text focus:outline-none focus:border-prizm-primary cursor-pointer">
            <option value="all">State: All</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
          <select value={healthFilter} onChange={e => setHealthFilter(e.target.value)} className="bg-black/20 border border-prizm-border rounded px-3 py-1.5 text-[10px] uppercase font-mono text-prizm-text focus:outline-none focus:border-prizm-primary cursor-pointer">
            <option value="all">Health: All</option>
            <option value="warnings">Warnings</option>
            <option value="alarms">Alarms</option>
          </select>
          <select value={refreshInterval} onChange={e => setRefreshInterval(Number(e.target.value))} className="bg-black/20 border border-prizm-border rounded px-3 py-1.5 text-[10px] uppercase font-mono text-prizm-text focus:outline-none focus:border-prizm-primary cursor-pointer">
            <option value={0}>Refresh: Paused</option>
            <option value={5000}>Refresh: 5s</option>
            <option value={10000}>Refresh: 10s</option>
            <option value={30000}>Refresh: 30s</option>
            <option value={60000}>Refresh: 60s</option>
          </select>
          <button onClick={downloadCsv} title="Export CSV" className="bg-white/5 hover:bg-white/10 text-prizm-text border border-prizm-border px-3 py-1.5 rounded transition-colors cursor-pointer shrink-0">
            <Download size={14} />
          </button>
          <button onClick={downloadJson} title="Export API JSON" className="bg-white/5 hover:bg-white/10 text-prizm-info border border-prizm-border px-3 py-1.5 rounded transition-colors cursor-pointer shrink-0">
            <Layers size={14} />
          </button>
        </div>
      </div>

      {/* Main Strings Table Engine */}
      <div className="flex-1 bg-prizm-surface border-x border-b border-prizm-border rounded-b-lg overflow-y-auto no-scrollbar relative min-h-0" id="strings-dashboard-scroll">
         <table className="w-full text-left text-[10px] font-mono whitespace-nowrap">
             <thead className="bg-prizm-surface-strong sticky top-0 z-30 shadow-md">
                <tr className="text-prizm-text-muted uppercase tracking-wider">
                  <th className="px-3 py-2 border-b border-prizm-border font-bold sticky top-0 left-0 bg-prizm-surface-strong z-40 whitespace-nowrap">ARR</th>
                  <th className="px-3 py-2 border-b border-prizm-border font-bold sticky top-0 left-[54px] sm:left-[64px] bg-prizm-surface-strong z-40 whitespace-nowrap">STR</th>
                  <th className="px-3 py-2 border-b border-prizm-border sticky top-0 bg-prizm-surface-strong z-30">Contactors</th>
                  <th className="px-3 py-2 border-b border-prizm-border sticky top-0 bg-prizm-surface-strong z-30">Rotation</th>
                  <th className="px-3 py-2 border-b border-prizm-border sticky top-0 bg-prizm-surface-strong z-30">Meas V</th>
                  <th className="px-3 py-2 border-b border-prizm-border sticky top-0 bg-prizm-surface-strong z-30">Calc V</th>
                  <th className="px-3 py-2 border-b border-prizm-border sticky top-0 bg-prizm-surface-strong z-30">Bus V</th>
                  <th className="px-3 py-2 border-b border-prizm-border sticky top-0 bg-prizm-surface-strong z-30">Amps</th>
                  <th className="px-3 py-2 border-b border-prizm-border sticky top-0 bg-prizm-surface-strong z-30">kW</th>
                  <th className="px-3 py-2 border-b border-prizm-border sticky top-0 bg-prizm-surface-strong z-30">SOC %</th>
                  <th className="px-3 py-2 border-b border-prizm-border sticky top-0 bg-prizm-surface-strong z-30">Ah</th>
                  <th className="px-3 py-2 border-b border-prizm-border sticky top-0 bg-prizm-surface-strong z-30">Min Cell V</th>
                  <th className="px-3 py-2 border-b border-prizm-border sticky top-0 bg-prizm-surface-strong z-30">Max Cell V</th>
                  <th className="px-3 py-2 border-b border-prizm-border sticky top-0 bg-prizm-surface-strong z-30">Δ Cell V</th>
                  <th className="px-3 py-2 border-b border-prizm-border sticky top-0 bg-prizm-surface-strong z-30">Min Temp</th>
                  <th className="px-3 py-2 border-b border-prizm-border sticky top-0 bg-prizm-surface-strong z-30">Max Temp</th>
                  <th className="px-3 py-2 border-b border-prizm-border sticky top-0 bg-prizm-surface-strong z-30">Δ Temp</th>
                  <th className="px-3 py-2 border-b border-prizm-border sticky top-0 bg-prizm-surface-strong z-30">BAL CT</th>
                  <th className="px-3 py-2 border-b border-prizm-border sticky top-0 bg-prizm-surface-strong z-30">BAL MODE</th>
                  <th className="px-3 py-2 border-b border-prizm-border sticky top-0 bg-prizm-surface-strong z-30">Location</th>
                  <th className="px-3 py-2 border-b border-prizm-border sticky top-0 bg-prizm-surface-strong z-30">Fans</th>
                  <th className="px-3 py-2 border-b border-prizm-border text-right sticky top-0 bg-prizm-surface-strong z-30">Timestamp</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-prizm-border/20">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-prizm-text-muted font-bold tracking-widest text-xs">NO STRINGS MATCHING FILTERS</td>
                </tr>
              ) : (
                filtered.map((s:any) => {
                  
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
                  
                  // Fans logic
                  let fanDot = 'bg-prizm-text-muted/10';
                  let fanMatch = "N/A";
                  if (s.fanCommandRequested !== undefined && s.fanCommandRequested !== null && s.fanCommandRequested !== "") {
                        fanMatch = s.fanHealthy ? "Yes" : "No";
                        fanDot = fanMatch === 'Yes' ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'bg-prizm-warning shadow-[0_0_5px_rgba(255,204,0,0.5)]';
                  }

                  const locStr = s.location && s.location.trim() !== "" ? s.location : s.container && s.container.trim() !== "" ? s.container : "--";
                  return (
                  <tr key={s.id} onClick={() => setSelectedString(s)} className="group hover:bg-prizm-primary/10 cursor-pointer transition-colors relative">
                    <td className="px-3 py-1.5 border-r border-prizm-border/20 sticky left-0 group-hover:bg-prizm-surface-strong bg-prizm-surface z-20 font-bold text-prizm-text min-w-[54px] sm:min-w-[64px]" title={s.warningCount > 0 || s.alarmCount > 0 ? `Warnings: ${(s.warnings||[]).join(", ")} | Alarms: ${(s.alarms||[]).join(", ")}` : ""}>
                       <span className={s.warningCount > 0 || s.alarmCount > 0 ? (s.alarmCount > 0 ? "text-prizm-danger" : "text-prizm-warning") : "text-prizm-primary font-mono font-bold"}>{s.arrayNumber}</span>
                       {s.alarmCount > 0 && <span className="text-prizm-danger ml-1" title="Alarms Active">⚠️</span>}
                       {s.warningCount > 0 && s.alarmCount === 0 && <span className="text-prizm-warning ml-1" title="Warnings Active">⚠️</span>}
                    </td>
                    <td className="px-3 py-1.5 border-r border-prizm-border/20 sticky left-[54px] sm:left-[64px] group-hover:bg-prizm-surface-strong bg-prizm-surface z-20 font-bold text-prizm-primary font-mono text-center min-w-[48px]">
                       {s.stringNumber}
                    </td>
                    <td className="px-3 py-1.5">
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
                    <td className="px-3 py-1.5">
                       <div 
                         className="flex items-center gap-1 cursor-help"
                         title={`Comms: ${commsOk?"OK":"Stale"} | Rotation: ${inRotation?"IN":"OUT"} | Alerts: ${alertsState}`}
                       >
                          <div className={`w-2 h-2 rounded-full ${rotDot1}`}></div>
                          <div className={`w-2 h-2 rounded-full ${rotDot2}`}></div>
                          <div className={`w-2 h-2 rounded-full ${rotDot3}`}></div>
                       </div>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs text-emerald-400">{s.measuredVoltage !== null ? s.measuredVoltage : "--"}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-prizm-info">{s.calculatedVoltage !== null ? s.calculatedVoltage : "--"}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-prizm-text-muted">{s.busVoltage !== null && s.busVoltage !== undefined ? s.busVoltage : "--"}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-prizm-text">{s.amps !== null ? s.amps : "--"}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-prizm-text">{s.kw !== null ? s.kw : "--"}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-prizm-info font-bold">{s.socPct !== null ? s.socPct+"%" : "--"}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-prizm-text-muted">{s.ah !== null && s.ah !== undefined ? s.ah : "--"}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-prizm-text-muted">{s.minCellVoltage !== null ? s.minCellVoltage : "--"}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-prizm-text-muted">{s.maxCellVoltage !== null ? s.maxCellVoltage : "--"}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-prizm-warning">{s.cellVoltageDelta !== null ? s.cellVoltageDelta : "--"}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-prizm-text-muted">{s.minCellTemperature !== null ? s.minCellTemperature : "--"}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-prizm-text-muted">{s.maxCellTemperature !== null ? s.maxCellTemperature : "--"}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-prizm-warning">{s.cellTemperatureDelta !== null ? s.cellTemperatureDelta : "--"}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-prizm-text-muted">{s.balanceCount !== null && s.balanceCount !== undefined ? s.balanceCount : "--"}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-prizm-text truncate max-w-[100px]" title={s.balanceMode}>{s.balanceMode || "--"}</td>
                    <td className="px-3 py-1.5 font-bold text-prizm-text-muted text-xs">
                        {locStr}
                    </td>
                    <td className="px-3 py-1.5">
                       <div 
                           title={`Fan Requested: ${s.fanCommandRequested ?? "--"} | Match: ${fanMatch}`}
                           className={`w-2.5 h-2.5 rounded-full cursor-help ${fanDot}`}
                       ></div>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-prizm-text-muted text-[10px]">
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
        onClick={() => document.getElementById('strings-dashboard-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <span className="text-xl leading-none">&uarr;</span> TOP
      </button>

    </div>
  );
}
