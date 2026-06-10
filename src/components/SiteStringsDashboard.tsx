import React, { useState, useEffect, useMemo } from "react";
import { ServerOff, Search, ChevronDown, ChevronRight, X, Download, Filter, Cpu, ShieldAlert, CpuIcon, AlertTriangle } from "lucide-react";
import SiteStringDetailDashboard from "./SiteStringDetailDashboard";

export default function SiteStringsDashboard() {
  const [data, setData] = useState<any>(null);
  const [strings, setStrings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [arrayFilter, setArrayFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [alarmFilter, setAlarmFilter] = useState("all");

  const [selectedString, setSelectedString] = useState<any | null>(null);

  useEffect(() => {
    let unmounted = false;
    const fetchData = async () => {
      try {
        const res = await fetch("/api/local/strings");
        if (res.ok && !unmounted) {
          const json = await res.json();
          setData(json);
          setStrings(json.data || []);
        }
      } catch (err) {
        console.error("Failed to fetch strings", err);
      } finally {
        if (!unmounted) setLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => {
      unmounted = true;
      clearInterval(interval);
    };
  }, []);

  const arrays = useMemo(() => {
    const list = Array.from(new Set(strings.map((s) => s.arrayIndex)));
    return list.sort((a, b) => Number(a) - Number(b));
  }, [strings]);

  const filtered = useMemo(() => {
    return strings.filter((s) => {
      if (arrayFilter !== "all" && String(s.arrayIndex) !== arrayFilter) return false;
      if (stateFilter !== "all") {
        if (stateFilter === "online" && s.connectionState !== "Online") return false;
        if (stateFilter === "offline" && s.connectionState !== "Offline") return false;
      }
      if (alarmFilter !== "all") {
        if (alarmFilter === "alarms" && s.alarmCount <= 0) return false;
        if (alarmFilter === "warnings" && s.warnCount <= 0) return false;
      }
      if (search) {
        const sq = search.toLowerCase();
        if (!s.stringKey.toLowerCase().includes(sq) && !s.ipAddress?.toLowerCase().includes(sq)) return false;
      }
      return true;
    });
  }, [strings, arrayFilter, stateFilter, alarmFilter, search]);

  const downloadCsv = () => {
    if (filtered.length === 0) return;
    const headers = Object.keys(filtered[0]);
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
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Site_Strings_Export_${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (selectedString) {
    return (
      <SiteStringDetailDashboard 
        initialArray={selectedString.arrayIndex} 
        initialString={selectedString.stringIndex} 
        allArrays={arrays.map(String).map(Number)} 
        onBack={() => setSelectedString(null)} 
      />
    );
  }

  if (loading && !data) {
    return <div className="p-8 text-prizm-text-muted font-mono uppercase text-xs flex justify-center">Loading array stack...</div>;
  }

  if (!data || data.source === "offline" || data.error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-prizm-text-muted font-mono">
        <ServerOff size={48} className="mb-4 opacity-50" />
        <h2 className="text-xl font-bold uppercase tracking-widest text-prizm-danger mb-2">OFFLINE / NO LIVE DATA</h2>
        <p className="text-xs max-w-md mx-auto">PRIZM cannot reach the LAN target or no active string telemetry is available.</p>
      </div>
    );
  }

  // Summary Metrics
  const total = strings.length;
  const online = strings.filter(s => s.connectionState === "Online").length;
  const offline = total - online;
  const warns = strings.filter(s => s.warnCount > 0).length;
  const alarms = strings.filter(s => s.alarmCount > 0).length;
  const mismatches = strings.filter(s => s.contactorMismatch).length;
  const outRot = strings.filter(s => s.outRotation).length;
  
  let socSum = 0; let socCount = 0;
  let minSoc = null; let maxSoc = null;
  let maxTemp = null; let maxVDelta = null;

  strings.forEach(s => {
    if (s.soc !== null) {
      socSum += s.soc; socCount++;
      if (minSoc === null || s.soc < minSoc) minSoc = s.soc;
      if (maxSoc === null || s.soc > maxSoc) maxSoc = s.soc;
    }
    if (s.maxCellTemp !== null) {
      if (maxTemp === null || s.maxCellTemp > maxTemp) maxTemp = s.maxCellTemp;
    }
    if (s.voltageDelta !== null) {
      if (maxVDelta === null || s.voltageDelta > maxVDelta) maxVDelta = s.voltageDelta;
    }
  });

  const avgSoc = socCount > 0 ? (socSum / socCount) : null;

  return (
    <div className="flex-1 flex overflow-hidden flex-col font-sans transition-all h-full bg-prizm-bg p-4 sm:p-6 pb-20">
      
      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 shrink-0 mb-6 font-mono">
        <div>
          <span className="text-[10px] text-prizm-primary font-bold uppercase tracking-wider block">Battery Bank Topologies</span>
          <h1 className="text-lg font-bold text-prizm-text tracking-wide flex items-center gap-2">
            STACK LIST : STRINGS OVERVIEW
            {data.staleData && <span className="bg-prizm-warning/10 text-prizm-warning border border-prizm-warning/20 px-2 py-0.5 rounded text-[9px] whitespace-nowrap">STALE CACHE</span>}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[9px] font-bold">
           <div className="bg-prizm-surface p-1.5 border border-prizm-border rounded text-prizm-text-muted">
              SRC: <span className="text-prizm-text">{data.activeProfileName}</span>
           </div>
           <div className="bg-prizm-surface p-1.5 border border-prizm-border rounded text-prizm-text-muted">
              UPDATED: <span className="text-prizm-text">{new Date(data.lastUpdated).toLocaleTimeString()}</span>
           </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6 shrink-0 text-center font-mono select-none">
        <div className="bg-prizm-surface-strong border border-prizm-border rounded p-2 flex flex-col justify-center relative overflow-hidden">
          <span className="text-[9px] text-prizm-text-muted uppercase">Total Strings</span>
          <span className="text-sm font-bold text-prizm-text">{total}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border border-b-2 border-b-emerald-500/50 rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase">Online / Comm</span>
          <span className="text-sm font-bold text-emerald-400">{online}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border border-b-2 border-b-prizm-danger/50 rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase">Offline / Flat</span>
          <span className={offline > 0 ? "text-sm font-bold text-prizm-danger" : "text-sm font-bold text-prizm-text"}>{offline}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase">Warns / Alarms</span>
          <span className="text-sm font-bold text-prizm-warning">{warns} <span className="text-prizm-text-muted mx-1">/</span> <span className="text-prizm-danger">{alarms}</span></span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase leading-tight">Mismatch<br/>Contactors</span>
          <span className={mismatches > 0 ? "text-sm font-bold text-prizm-danger" : "text-sm font-bold text-prizm-text"}>{mismatches}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase leading-tight">Out Of<br/>Rotation</span>
          <span className={outRot > 0 ? "text-sm font-bold text-prizm-warning" : "text-sm font-bold text-prizm-text"}>{outRot}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase">Fleet Avg SOC</span>
          <span className="text-sm font-bold text-prizm-info">{avgSoc !== null ? avgSoc.toFixed(1) : "--"}%</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase leading-tight">Max Cell T<br/>/ Max V-Delta</span>
          <span className="text-[11px] font-bold text-prizm-text mt-0.5">{maxTemp !== null ? maxTemp + "°C" : "--"} <span className="text-prizm-text-muted font-normal mx-0.5">|</span> {maxVDelta !== null ? maxVDelta + "V" : "--"}</span>
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
        <div className="flex gap-3 w-full sm:w-auto">
          <select value={arrayFilter} onChange={e => setArrayFilter(e.target.value)} className="bg-black/20 border border-prizm-border rounded px-3 py-1.5 text-[10px] uppercase font-mono text-prizm-text focus:outline-none focus:border-prizm-primary cursor-pointer w-full sm:w-auto">
            <option value="all">Array: All</option>
            {arrays.map(a => <option key={a} value={a}>Array {a}</option>)}
          </select>
          <select value={stateFilter} onChange={e => setStateFilter(e.target.value)} className="bg-black/20 border border-prizm-border rounded px-3 py-1.5 text-[10px] uppercase font-mono text-prizm-text focus:outline-none focus:border-prizm-primary cursor-pointer w-full sm:w-auto">
            <option value="all">State: All</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
          <select value={alarmFilter} onChange={e => setAlarmFilter(e.target.value)} className="bg-black/20 border border-prizm-border rounded px-3 py-1.5 text-[10px] uppercase font-mono text-prizm-text focus:outline-none focus:border-prizm-primary cursor-pointer w-full sm:w-auto">
            <option value="all">Health: All</option>
            <option value="warnings">Warnings</option>
            <option value="alarms">Alarms</option>
          </select>
          <button onClick={downloadCsv} title="Export CSV" className="bg-white/5 hover:bg-white/10 text-prizm-text border border-prizm-border px-3 py-1.5 rounded transition-colors cursor-pointer shrink-0">
            <Download size={14} />
          </button>
        </div>
      </div>

      {/* Main Strings Table Engine */}
      <div className="flex-1 bg-prizm-surface border-x border-b border-prizm-border rounded-b-lg overflow-y-auto no-scrollbar relative min-h-0">
         <table className="w-full text-left text-[10px] font-mono whitespace-nowrap">
            <thead className="bg-prizm-surface-strong sticky top-0 z-10 shadow-md">
               <tr className="text-prizm-text-muted uppercase tracking-wider">
                  <th className="px-4 py-2 border-b border-prizm-border font-bold sticky left-0 bg-prizm-surface-strong z-20">String Key</th>
                  <th className="px-3 py-2 border-b border-prizm-border">Link</th>
                  <th className="px-3 py-2 border-b border-prizm-border">State/Rot</th>
                  <th className="px-3 py-2 border-b border-prizm-border">SOC / Power</th>
                  <th className="px-3 py-2 border-b border-prizm-border">Volts / Amps</th>
                  <th className="px-3 py-2 border-b border-prizm-border">Cell Bounds</th>
                  <th className="px-3 py-2 border-b border-prizm-border">Temp Bounds</th>
                  <th className="px-3 py-2 border-b border-prizm-border">IP / Location</th>
               </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-prizm-text-muted font-bold tracking-widest text-xs">NO STRINGS MATCHING FILTERS</td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.stringKey} onClick={() => setSelectedString(s)} className="group border-b border-prizm-border/40 hover:bg-black/10 cursor-pointer transition-colors relative">
                    <td className="px-4 py-2 border-r border-prizm-border/20 sticky left-0 group-hover:bg-black/80 bg-prizm-surface z-10 font-bold text-prizm-text">
                       {s.stringKey}
                       {s.alarmCount > 0 && <AlertTriangle size={10} className="inline ml-1.5 text-prizm-danger mb-0.5" />}
                       {s.warnCount > 0 && s.alarmCount === 0 && <ShieldAlert size={10} className="inline ml-1.5 text-prizm-warning mb-0.5" />}
                    </td>
                    <td className="px-3 py-2">
                       {s.connectionState === "Online" ? <span className="text-emerald-400">● Online</span> : <span className="text-prizm-danger">○ Offline</span>}
                    </td>
                    <td className="px-3 py-2">
                       <div className="flex gap-1.5 items-center">
                          <span title="Positive CT / Ext / Rot" className={`h-2 w-2 rounded-full ${s.contactorMismatch ? "bg-prizm-warning animate-pulse" : (s.positiveContactorClosed ? "bg-emerald-500" : "bg-black/50 border border-prizm-border")}`}></span>
                          <span title="Negative CT" className={`h-2 w-2 rounded-full ${s.contactorMismatch ? "bg-prizm-warning animate-pulse" : (s.negativeContactorClosed ? "bg-emerald-500" : "bg-black/50 border border-prizm-border")}`}></span>
                          <span className="text-prizm-text-muted ml-1">{s.outRotation ? "OUT" : "IN"}</span>
                       </div>
                    </td>
                    <td className="px-3 py-2 space-x-2">
                       <span className="text-prizm-info font-bold">{s.soc !== null ? s.soc + "%" : "--"}</span>
                       <span className="text-prizm-text-muted">|</span>
                       <span className="text-prizm-text">{s.kw !== null ? s.kw + " kW" : "--"}</span>
                    </td>
                    <td className="px-3 py-2 space-x-2">
                       <span className="text-emerald-400">{s.measuredVoltage !== null ? s.measuredVoltage + " V" : "--"}</span>
                       <span className="text-prizm-text-muted text-[9px]">/</span>
                       <span className="text-prizm-text">{s.stringCurrent !== null ? s.stringCurrent + " A" : "--"}</span>
                    </td>
                    <td className="px-3 py-2">
                       {s.minCellVoltage !== null && s.maxCellVoltage !== null ? (
                          <span>{s.minCellVoltage}V <span className="text-prizm-text-muted">→</span> {s.maxCellVoltage}V <span className="text-prizm-warning ml-1">(\u0394{s.voltageDelta}V)</span></span>
                       ) : "--"}
                    </td>
                    <td className="px-3 py-2">
                       {s.minCellTemp !== null && s.maxCellTemp !== null ? (
                          <span>{s.minCellTemp}° <span className="text-prizm-text-muted">→</span> {s.maxCellTemp}° <span className="text-prizm-warning ml-1">(\u0394{s.tempDelta}°)</span></span>
                       ) : "--"}
                    </td>
                    <td className="px-3 py-2 text-prizm-text-muted text-[9px] flex justify-between items-center pr-4">
                       <span className="truncate max-w-[120px] block">{s.ipAddress}</span>
                       <ChevronRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
         </table>
      </div>

    </div>
  );
}
