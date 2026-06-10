import React, { useState, useEffect, useMemo } from "react";
import { ServerOff, Search, ChevronRight, Download, RefreshCw, Layers } from "lucide-react";
import StringDetailDashboard from "./StringDetailDashboard";

export default function StringDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [search, setSearch] = useState("");
  const [arrayFilter, setArrayFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState("all");
  
  const [refreshInterval, setRefreshInterval] = useState(5000);
  const [selectedString, setSelectedString] = useState<any | null>(null);

  useEffect(() => {
    let unmounted = false;
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/local/strings/dashboard?refresh=true&maxAgeMs=${refreshInterval}`);
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
           <div className="bg-prizm-surface p-1.5 border border-prizm-border rounded text-prizm-text-muted">
              SRC: <span className="text-prizm-text">{data.emsBaseUrl}</span>
           </div>
           <div className="bg-prizm-surface p-1.5 border border-prizm-border rounded text-prizm-text-muted">
              AGE: <span className="text-prizm-text">{data.durationMs}ms</span>
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
          <span className="text-sm font-bold text-prizm-text">{summary.totalStrings}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border border-b-2 border-b-emerald-500/50 rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase">Normal</span>
          <span className="text-sm font-bold text-emerald-400">{summary.normalStrings}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border border-b-2 border-b-prizm-danger/50 rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase">Offline</span>
          <span className={summary.offlineStrings > 0 ? "text-sm font-bold text-prizm-danger" : "text-sm font-bold text-prizm-text"}>{summary.offlineStrings}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase">Warns / Alarms</span>
          <span className="text-sm font-bold text-prizm-warning">{summary.warningStrings} <span className="text-prizm-text-muted mx-1">/</span> <span className="text-prizm-danger">{summary.alarmStrings}</span></span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase leading-tight">Total BPCs</span>
          <span className="text-sm font-bold text-prizm-text">{summary.totalBpcs}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase leading-tight">BPC Alerts</span>
          <span className="text-sm font-bold text-prizm-warning">{summary.warningBpcs} <span className="text-prizm-text-muted mx-1">/</span> <span className="text-prizm-danger">{summary.alarmBpcs}</span></span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase leading-tight">Fleet Avg Cell / V Delta</span>
          <span className="text-[11px] font-bold text-prizm-text mt-0.5">{summary.avgCellVoltage !== null ? summary.avgCellVoltage+"V" : "--"} <span className="text-prizm-text-muted mx-1">|</span> {summary.maxCellVoltageDelta !== null ? "\u0394"+summary.maxCellVoltageDelta+"V" : "--"}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
          <span className="text-[9px] text-prizm-text-muted uppercase leading-tight">Fleet Avg Temp / Max \u0394</span>
          <span className="text-[11px] font-bold text-prizm-text mt-0.5">{summary.avgCellTemperature !== null ? summary.avgCellTemperature+"°C" : "--"} <span className="text-prizm-text-muted mx-1">|</span> {summary.maxCellTemperatureDelta !== null ? "\u0394"+summary.maxCellTemperatureDelta+"°C" : "--"}</span>
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
      <div className="flex-1 bg-prizm-surface border-x border-b border-prizm-border rounded-b-lg overflow-y-auto no-scrollbar relative min-h-0">
         <table className="w-full text-left text-[10px] font-mono whitespace-nowrap">
            <thead className="bg-prizm-surface-strong sticky top-0 z-10 shadow-md">
               <tr className="text-prizm-text-muted uppercase tracking-wider">
                  <th className="px-4 py-3 border-b border-prizm-border font-bold sticky left-0 bg-prizm-surface-strong z-20">String Key</th>
                  <th className="px-3 py-3 border-b border-prizm-border">Status</th>
                  <th className="px-3 py-3 border-b border-prizm-border">Contactor / Rot</th>
                  <th className="px-3 py-3 border-b border-prizm-border">SOC / Power</th>
                  <th className="px-3 py-3 border-b border-prizm-border">V / A</th>
                  <th className="px-3 py-3 border-b border-prizm-border">Cell V Min/Avg/Max (\u0394)</th>
                  <th className="px-3 py-3 border-b border-prizm-border">Cell T Min/Avg/Max (\u0394)</th>
                  <th className="px-3 py-3 border-b border-prizm-border">BPCs</th>
                  <th className="px-3 py-3 border-b border-prizm-border">IP / Firmware</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-prizm-border/20">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-prizm-text-muted font-bold tracking-widest text-xs">NO STRINGS MATCHING FILTERS</td>
                </tr>
              ) : (
                filtered.map((s:any) => (
                  <tr key={s.id} onClick={() => setSelectedString(s)} className="group hover:bg-black/20 cursor-pointer transition-colors relative">
                    <td className="px-4 py-3 border-r border-prizm-border/20 sticky left-0 group-hover:bg-black/60 bg-prizm-surface z-10 font-bold text-prizm-text">
                       {s.stringKey}
                       {s.alarmCount > 0 && <span className="ml-2 text-prizm-danger bg-prizm-danger/10 px-1 py-0.5 rounded">ALARM</span>}
                       {s.warningCount > 0 && s.alarmCount === 0 && <span className="ml-2 text-prizm-warning bg-prizm-warning/10 px-1 py-0.5 rounded">WARN</span>}
                    </td>
                    <td className="px-3 py-3 font-bold">
                       {s.operationalState === "NORMAL" ? <span className="text-emerald-400">NORMAL</span> : 
                        s.operationalState === "WARNING" ? <span className="text-prizm-warning">WARNING</span> :
                        s.operationalState === "ALARM" ? <span className="text-prizm-danger">ALARM</span> :
                        <span className="text-prizm-text-muted opacity-50">OFFLINE</span>}
                    </td>
                    <td className="px-3 py-3">
                       <span className={s.contactorClosed ? "text-emerald-400" : "text-prizm-text-muted"}>{s.contactorStatus}</span>
                       <span className="mx-2 text-prizm-text-muted">|</span>
                       <span className={s.rotationEnabled ? "text-emerald-400" : "text-prizm-warning"}>ROT {s.rotationStatus}</span>
                    </td>
                    <td className="px-3 py-3 space-x-2">
                       <span className="text-prizm-info font-bold">{s.socPct !== null ? s.socPct + "%" : "--"}</span>
                       <span className="text-prizm-text-muted">|</span>
                       <span className="text-prizm-text">{s.kw !== null ? s.kw + " kW" : "--"}</span>
                    </td>
                    <td className="px-3 py-3 space-x-2">
                       <span className="text-emerald-400">{s.measuredVoltage !== null ? s.measuredVoltage + " V" : "--"}</span>
                       <span className="text-prizm-text-muted text-[9px]">/</span>
                       <span className="text-prizm-text">{s.amps !== null ? s.amps + " A" : "--"}</span>
                    </td>
                    <td className="px-3 py-3">
                       {s.minCellVoltage !== null && s.maxCellVoltage !== null ? (
                          <span>{s.minCellVoltage}V &nbsp;&bull;&nbsp; {s.avgCellVoltage}V &nbsp;&bull;&nbsp; {s.maxCellVoltage}V <span className="text-prizm-warning ml-1">(\u0394{s.cellVoltageDelta}V)</span></span>
                       ) : "--"}
                    </td>
                    <td className="px-3 py-3">
                       {s.minCellTemperature !== null && s.maxCellTemperature !== null ? (
                          <span>{s.minCellTemperature}° &nbsp;&bull;&nbsp; {s.avgCellTemperature}° &nbsp;&bull;&nbsp; {s.maxCellTemperature}° <span className="text-prizm-warning ml-1">(\u0394{s.cellTemperatureDelta}°)</span></span>
                       ) : "--"}
                    </td>
                    <td className="px-3 py-3 text-prizm-text-muted">
                        {s.bpcCount > 0 ? (
                            <span className="flex items-center gap-2">
                               {s.bpcCount} <span className="text-[9px]">({s.bpcFirmwareSummary || "Unk"})</span>
                            </span>
                        ) : "--"}
                    </td>
                    <td className="px-3 py-3 text-prizm-text-muted text-[9px] flex justify-between items-center pr-4">
                       <span className="truncate max-w-[150px] block">
                          IP: {s.stringControllerIp || "Unk"} <br/>
                          FW: {s.stringControllerFirmware || "Unk"}
                       </span>
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
