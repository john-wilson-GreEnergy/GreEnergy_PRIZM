import React, { useState, useEffect } from "react";
import { Activity, Battery, TriangleAlert, ServerOff, CheckCircle2, ChevronRight, Hash, XOctagon } from "lucide-react";

export default function SiteTelemetryDashboard() {
  const [metrics, setMetrics] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    let unmounted = false;

    const fetchMetrics = async () => {
      try {
        const metRes = await fetch("/api/local/site-metrics");
        const histRes = await fetch("/api/local/site-metrics/history");
        
        if (metRes.ok && !unmounted) {
          const met = await metRes.json();
          if (!met.error) setMetrics(met);
        }
        if (histRes.ok && !unmounted) {
          const h = await histRes.json();
          setHistory(h);
        }
      } catch (err) {
        console.warn("Failed to fetch site telemetry:", err);
      }
    };

    fetchMetrics();
    const timer = setInterval(fetchMetrics, 3000);
    return () => {
      unmounted = true;
      clearInterval(timer);
    };
  }, []);

  if (!metrics || metrics.source === "offline" || metrics.error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-prizm-text-muted font-mono">
        <ServerOff size={48} className="mb-4 opacity-50" />
        <h2 className="text-xl font-bold uppercase tracking-widest text-prizm-danger mb-2">OFFLINE / NO LIVE DATA</h2>
        <p className="text-xs mb-4 max-w-md mx-auto">
          PRIZM cannot reach the LAN target or no active telemetry is currently reporting. 
        </p>
      </div>
    );
  }

  const { current, byArray } = metrics;
  
  // To trace latest SOC history chart
  const recentHist = history.slice(-50); // display last ~50 points
  
  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 overflow-y-auto no-scrollbar font-sans space-y-6">
      
      {/* Top Status Overview */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="text-[10px] font-mono text-prizm-primary font-bold block uppercase tracking-wider">Site Realtime Overview</span>
          <h2 className="text-sm font-bold text-prizm-text uppercase tracking-tight flex items-center gap-2">
            Active: Site Telemetry Trends
            {metrics.staleData && <span className="bg-prizm-warning/10 text-prizm-warning border border-prizm-warning/20 px-2 py-0.5 rounded text-[9px] font-mono whitespace-nowrap">STALE CACHE</span>}
            {metrics.source === "partial" && <span className="bg-prizm-warning/10 text-prizm-warning border border-prizm-warning/20 px-2 py-0.5 rounded text-[9px] font-mono whitespace-nowrap">PARTIAL SITE DATA</span>}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-mono">
          <div className="bg-prizm-surface p-2 border border-prizm-border rounded">
             Profile: <strong className="text-prizm-text">{metrics.activeProfileName || metrics.activeProfileId}</strong>
          </div>
          <div className="bg-prizm-surface p-2 border border-prizm-border rounded">
             Endpoint: <strong className="text-prizm-text">{metrics.activeEmsBaseUrl}</strong>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-prizm-surface border border-prizm-border p-4 rounded-lg flex flex-col gap-2 relative overflow-hidden">
          <div className="flex justify-between items-start">
            <span className="text-[10px] text-prizm-text-muted font-bold tracking-wider font-mono uppercase">Site Power Flow</span>
            <Activity size={14} className="text-prizm-primary" />
          </div>
          {current.totalMeasuredKw !== null ? (
            <div className="text-2xl font-black font-sans text-prizm-text tracking-tight">
              {current.totalMeasuredKw.toLocaleString(undefined, { maximumFractionDigits: 1 })} <span className="text-xs text-prizm-text-muted">kW</span>
            </div>
          ) : (
            <div className="text-[10px] font-mono text-prizm-text-muted italic py-1">UNAVAILABLE</div>
          )}
        </div>

        <div className="bg-prizm-surface border border-prizm-border p-4 rounded-lg flex flex-col gap-2">
          <div className="flex justify-between items-start">
            <span className="text-[10px] text-prizm-text-muted font-bold tracking-wider font-mono uppercase">Average SOC</span>
            <Battery size={14} className="text-prizm-info" />
          </div>
          {current.avgSoc !== null ? (
            <div className="text-2xl font-black font-sans text-prizm-text tracking-tight flex items-end gap-2">
              {current.avgSoc.toFixed(1)}%
              <span className="text-[10px] text-prizm-text-muted font-mono mb-1">
                (MIN: {current.minSoc?.toFixed(1)}% | MAX: {current.maxSoc?.toFixed(1)}%)
              </span>
            </div>
          ) : (
            <div className="text-[10px] font-mono text-prizm-text-muted italic py-1">UNAVAILABLE</div>
          )}
        </div>

        <div className="bg-prizm-surface border border-prizm-border p-4 rounded-lg flex flex-col gap-2">
          <div className="flex justify-between items-start">
            <span className="text-[10px] text-prizm-text-muted font-bold tracking-wider font-mono uppercase">Active Warnings/Alarms</span>
            <TriangleAlert size={14} className={current.totalAlarms > 0 || current.totalWarnings > 0 ? "text-prizm-warning" : "text-prizm-text-muted"} />
          </div>
          <div className="font-mono text-sm space-y-1 mt-1">
            <div className="flex justify-between text-[11px]"><span className="text-prizm-text-muted">Warnings:</span> <span className={current.totalWarnings > 0 ? "text-prizm-warning font-bold" : "text-prizm-text"}>{current.totalWarnings}</span></div>
            <div className="flex justify-between text-[11px]"><span className="text-prizm-text-muted">Alarms:</span> <span className={current.totalAlarms > 0 ? "text-prizm-danger font-bold" : "text-prizm-text"}>{current.totalAlarms}</span></div>
          </div>
        </div>

        <div className="bg-prizm-surface border border-prizm-border p-4 rounded-lg flex flex-col gap-2">
          <div className="flex justify-between items-start">
            <span className="text-[10px] text-prizm-text-muted font-bold tracking-wider font-mono uppercase">Link Status</span>
            <CheckCircle2 size={14} className={current.offlineStringCount > 0 ? "text-prizm-warning" : "text-emerald-400"} />
          </div>
          <div className="text-[10px] font-mono space-y-1">
             <div className="flex justify-between"><span className="text-prizm-text-muted">Strings Comm:</span> <span className="text-emerald-400">{current.onlineStringCount}</span></div>
             <div className="flex justify-between"><span className="text-prizm-text-muted">Strings Off:</span> <span className={current.offlineStringCount > 0 ? "text-prizm-danger font-bold" : "text-prizm-text"}>{current.offlineStringCount}</span></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Simple History Trend representing SOC */}
        <div className="bg-prizm-surface-strong border border-prizm-border rounded-lg p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="text-prizm-text-muted" size={14} />
            <h3 className="text-xs font-bold text-prizm-text uppercase tracking-widest font-mono">SOC History Trend</h3>
          </div>
          <div className="flex-1 min-h-[160px] relative border-b border-l border-prizm-border flex items-end py-1">
             {recentHist.length > 0 ? (
               <div className="flex h-full w-full items-end gap-[1px]">
                 {recentHist.map((h, i) => {
                    const soc = h.avgSoc || 0;
                    const hPx = Math.max(1, (soc / 100) * 100);
                    return (
                      <div key={i} className="flex-1 bg-prizm-primary/20 hover:bg-prizm-primary transition-colors h-full flex flex-col justify-end group relative" title={`${soc.toFixed(1)}% | ${new Date(h.timestamp).toLocaleTimeString()}`}>
                         <div style={{ height: `${hPx}%` }} className="bg-prizm-primary w-full shadow-t shadow-prizm-primary/20" />
                      </div>
                    );
                 })}
               </div>
             ) : (
                <div className="absolute inset-0 flex items-center justify-center text-[10px] text-prizm-text-muted font-mono uppercase">Building Polling History...</div>
             )}
          </div>
        </div>

        {/* Arrays Summaries */}
        <div className="bg-prizm-surface-strong border border-prizm-border rounded-lg p-5 flex flex-col max-h-[300px] overflow-hidden">
          <div className="flex items-center gap-2 mb-4 shrink-0">
            <Hash className="text-prizm-text-muted" size={14} />
            <h3 className="text-xs font-bold text-prizm-text uppercase tracking-widest font-mono">Array Status Rollup</h3>
          </div>
          <div className="overflow-y-auto no-scrollbar flex-1 -mx-2 px-2">
            <table className="w-full text-[10px] font-mono text-left">
              <thead className="sticky top-0 bg-prizm-surface-strong z-10">
                <tr className="text-prizm-text-muted border-b border-prizm-border font-bold">
                  <th className="py-2">Array</th>
                  <th className="py-2">Av SOC</th>
                  <th className="py-2">Power</th>
                  <th className="py-2">Warn/Alm</th>
                  <th className="py-2">Link</th>
                </tr>
              </thead>
              <tbody>
                {byArray && byArray.length > 0 ? (
                  byArray.map((arr: any, i: number) => (
                    <tr key={i} className="border-b border-prizm-border/50 hover:bg-black/5 text-prizm-text">
                      <td className="py-2 font-bold">{arr.arrayIndex}</td>
                      <td className="py-2">{arr.avgSoc !== null ? arr.avgSoc.toFixed(1) + "%" : "--"}</td>
                      <td className="py-2">{arr.totalMeasuredKw !== null ? arr.totalMeasuredKw.toFixed(1) + " kW" : "--"}</td>
                      <td className="py-2">
                        {arr.warningCount > 0 && <span className="text-prizm-warning mr-2">W:{arr.warningCount}</span>}
                        {arr.alarmCount > 0 && <span className="text-prizm-danger">A:{arr.alarmCount}</span>}
                        {arr.warningCount === 0 && arr.alarmCount === 0 && <span className="text-prizm-text-muted">0</span>}
                      </td>
                      <td className="py-2">
                        {arr.offlineStringCount > 0 ? <span className="text-prizm-danger">{arr.onlineStringCount}/{arr.stringCount} ON</span> : <span className="text-emerald-400">All ON</span>}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-prizm-text-muted italic">No arrays detected in payload</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  );
}
