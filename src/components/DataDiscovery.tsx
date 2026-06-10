import React, { useState, useEffect } from "react";
import { Search, Server, Download, Activity, Cpu, Thermometer, Battery, MapPin, Database, CheckCircle, XCircle, FileText, Share2, Layers } from "lucide-react";

export default function DataDiscovery() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDiscovery = async (refresh = false) => {
    setLoading(true);
    if (refresh) setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/local/overview/discovery?includeRawPreview=true${refresh ? "&refresh=true" : ""}`);
      if (!res.ok) {
        throw new Error("Failed to fetch discovery data");
      }
      const raw = await res.json();
      setData(raw);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDiscovery();
  }, []);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-prizm-text-muted">
        <Server className="animate-spin mb-4 text-prizm-primary" size={32} />
        <span className="font-mono text-[11px] uppercase tracking-widest block">Executing Site-Wide Discovery Phase...</span>
        <span className="font-mono text-[9px] block mt-2 opacity-50">Polling local Turtle endpoints & matching taxonomies</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-900/20 border border-red-500/50 rounded text-red-400 font-mono text-[11px]">
        {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex flex-col h-full space-y-4 font-mono">
      {/* Header */}
      <div className="flex justify-between items-center bg-prizm-surface p-4 border border-prizm-border rounded-lg">
        <div>
          <h2 className="text-prizm-text font-bold uppercase tracking-widest text-sm flex items-center gap-2">
            <Search size={14} className="text-prizm-primary" />
            Local Data Discovery Pass
          </h2>
          <p className="text-prizm-text-muted text-[10px] uppercase mt-1">
            Station: {data.stationCode} &bull; Profile: {data.profileId} &bull; Generated: {new Date(data.generatedAt).toLocaleTimeString()}
          </p>
        </div>
        <div className="flex flex-col md:flex-row gap-2">
           <button
             onClick={() => fetchDiscovery(true)}
             disabled={refreshing}
             className="px-3 py-1 bg-prizm-surface-strong hover:bg-black/40 border border-prizm-border rounded text-prizm-text-muted text-[10px] uppercase font-bold flex items-center gap-2"
           >
             {refreshing ? <Server className="animate-spin" size={12} /> : null}
             Rescan Sources
           </button>
           <button
             onClick={() => {
               const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
               const url = URL.createObjectURL(blob);
               const a = document.createElement("a");
               a.href = url;
               a.download = `prizm-overview-discovery-${new Date().toISOString()}.json`;
               a.click();
             }}
             className="px-3 py-1 flex items-center gap-2 bg-prizm-primary/10 hover:bg-prizm-primary/20 border border-prizm-primary/50 text-prizm-primary rounded text-[10px] uppercase font-bold"
           >
             <Download size={12} />
             Export JSON
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Source Health Table */}
        <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4">
           <h3 className="text-[11px] font-bold text-prizm-text mb-3 uppercase tracking-wider border-b border-prizm-border pb-2">Data Source Health</h3>
           <div className="overflow-x-auto">
             <table className="w-full text-left border-collapse text-[10px]">
               <thead>
                 <tr className="text-prizm-text-muted border-b border-prizm-border/50">
                   <th className="py-2 pr-2">Endpoint</th>
                   <th className="py-2 pr-2">Status</th>
                   <th className="py-2 pr-2 text-right">Time</th>
                 </tr>
               </thead>
               <tbody>
                 {Object.entries(data.sourceHealth).map(([k, v]: [string, any]) => (
                   <tr key={k} className="border-b border-prizm-border/30 hover:bg-black/20">
                     <td className="py-1.5 pr-2 truncate max-w-[150px]" title={v.url}>{k}</td>
                     <td className="py-1.5 pr-2 flex items-center gap-1">
                       {v.ok ? <CheckCircle size={10} className="text-green-500" /> : <XCircle size={10} className="text-red-500" />}
                       {v.httpStatus || "N/A"} {v.error && <span className="text-red-400 underline" title={v.error}>(Err)</span>}
                     </td>
                     <td className="py-1.5 pr-2 text-right">{v.durationMs}ms</td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
        </div>

        {/* Action Discovery Overview */}
        <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4">
           <h3 className="text-[11px] font-bold text-prizm-info mb-3 uppercase tracking-wider border-b border-prizm-border pb-2">Action Endpoints Discovery</h3>
           <div className="space-y-4">
             {Object.entries(data.actionDiscovery).map(([k, meta]: [string, any]) => (
               <div key={k} className="text-[10px]">
                 <div className="flex justify-between items-center bg-black/20 p-1.5 rounded">
                    <span className="font-bold text-cyan-400 capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <span className={`px-2 py-0.5 rounded ${meta.safeToExposeActions ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'}`}>
                      {meta.safeToExposeActions ? 'SAFE' : 'LOCKED'}
                    </span>
                 </div>
                 {meta.notes && <div className="text-prizm-text-muted mt-1 italic">{meta.notes}</div>}
                 {meta.discoveredCommandEndpoints?.length > 0 && (
                   <div className="mt-1 flex flex-wrap gap-1">
                     {meta.discoveredCommandEndpoints.map((ep: string, idx: number) => (
                       <span key={idx} className="bg-black/40 border border-prizm-border px-1 py-0.5 rounded text-[9px] text-prizm-text">
                         {ep}
                       </span>
                     ))}
                   </div>
                 )}
               </div>
             ))}
             <div className="bg-rose-500/10 border border-rose-500/20 p-2 rounded text-[10px] text-rose-300 flex items-start gap-2">
                <XCircle size={14} className="shrink-0 mt-0.5" />
                <p>Command buttons must remain disabled until local endpoint validation is verified against target simulation logic.</p>
             </div>
           </div>
        </div>
      </div>

      {/* Discovered Sections */}
      <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 flex-1">
          <h3 className="text-[11px] font-bold text-prizm-text mb-3 uppercase tracking-wider border-b border-prizm-border pb-2 flex items-center gap-2">
             <Layers size={14} className="text-prizm-primary" />
             Discovered Dashboard Sections
          </h3>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {Object.entries(data.discoveredSections).map(([k, section]: [string, any]) => (
               <div key={k} className="border border-prizm-border rounded overflow-hidden flex flex-col">
                 <div className="bg-prizm-surface-strong p-2 flex justify-between items-center border-b border-prizm-border">
                   <div className="flex items-center gap-2">
                     {section.available ? <CheckCircle size={12} className="text-green-500" /> : <Settings size={12} className="text-prizm-text-muted" />}
                     <span className="font-bold text-[10px] text-prizm-text uppercase tracking-widest">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                   </div>
                   <div className="bg-black/40 px-2 py-0.5 rounded text-[9px] text-prizm-text-muted">
                     Count: {section.count}
                   </div>
                 </div>
                 <div className="p-2 space-y-2 text-[10px]">
                    {section.fieldsObserved && section.fieldsObserved.length > 0 && (
                      <div className="text-prizm-text-muted">
                        <span className="mr-2">Fields:</span>
                        <span className="text-prizm-primary">{section.fieldsObserved.join(", ")}</span>
                      </div>
                    )}
                    {section.subtypes && section.subtypes.length > 0 && (
                      <div className="text-prizm-text-muted">
                        <span className="mr-2">Entities:</span>
                        <span className="text-prizm-text truncate block">{section.subtypes.join(", ")}</span>
                      </div>
                    )}
                    {section.sampleItems && section.sampleItems.length > 0 && (
                      <details className="mt-2 group">
                         <summary className="cursor-pointer bg-black/20 p-1.5 rounded hover:bg-black/30 border border-prizm-border flex justify-between items-center selection:bg-transparent">
                           <span className="text-prizm-text">Raw Data Preview</span>
                           <span className="text-[8px] opacity-50 uppercase group-open:hidden">Click To Expand</span>
                         </summary>
                         <pre className="mt-1 p-2 bg-[#0B0C10] border border-prizm-border rounded text-[9px] text-cyan-300 max-h-40 overflow-y-auto">
                           {JSON.stringify(section.sampleItems, null, 2)}
                         </pre>
                      </details>
                    )}
                 </div>
               </div>
            ))}
          </div>
      </div>
    </div>
  );
}

// Dummy Settings icon for inactive items
function Settings(props: any) {
  return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>;
}
