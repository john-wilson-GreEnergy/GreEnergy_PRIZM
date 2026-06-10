import React, { useState, useEffect } from "react";
import { Search, Server, Download, Activity, Cpu, Thermometer, Battery, MapPin, Database, CheckCircle, XCircle } from "lucide-react";

export default function DataDiscovery() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDiscovery = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/local/data-discovery/site-equipment");
      if (!res.ok) {
        throw new Error("Failed to fetch discovery data");
      }
      const raw = await res.json();
      setData(raw);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
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
    <div className="flex flex-col h-full space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center bg-prizm-surface p-4 border border-prizm-border rounded-lg">
        <div>
          <h2 className="text-prizm-text font-bold font-mono uppercase tracking-widest text-sm flex items-center gap-2">
            <Search size={14} className="text-prizm-primary" />
            Local Data Discovery
          </h2>
          <p className="text-prizm-text-muted text-[10px] uppercase mt-1">
            Scanned {Object.keys(data.endpoints).length} Subsystem Endpoints &bull; Profile: {data.profileId}
          </p>
        </div>
        <div className="flex flex-col md:flex-row gap-2">
           <button
             onClick={fetchDiscovery}
             className="px-3 py-1 bg-prizm-surface-strong hover:bg-black/40 border border-prizm-border rounded text-prizm-text-muted text-[10px] uppercase font-bold"
           >
             Rescan Endpoints
           </button>
           <button
             onClick={() => {
               const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
               const url = URL.createObjectURL(blob);
               const a = document.createElement("a");
               a.href = url;
               a.download = `prizm-discovery-${new Date().toISOString()}.json`;
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
        {/* Endpoints Table */}
        <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4">
           <h3 className="text-[11px] font-bold text-prizm-text mb-3 uppercase tracking-wider border-b border-prizm-border pb-2">Endpoint Health</h3>
           <div className="overflow-x-auto">
             <table className="w-full text-left border-collapse text-[10px] font-mono">
               <thead>
                 <tr className="text-prizm-text-muted border-b border-prizm-border/50">
                   <th className="py-2 pr-2">Endpoint</th>
                   <th className="py-2 pr-2">Status</th>
                   <th className="py-2 pr-2">Type</th>
                   <th className="py-2 pr-2">ms</th>
                 </tr>
               </thead>
               <tbody>
                 {Object.entries(data.endpoints).map(([k, v]: [string, any]) => (
                   <tr key={k} className="border-b border-prizm-border/30 hover:bg-black/20">
                     <td className="py-1.5 pr-2 truncate max-w-[150px]" title={v.url}>{k}</td>
                     <td className="py-1.5 pr-2">
                       {v.ok ? <CheckCircle size={12} className="text-green-500 inline mr-1" /> : <XCircle size={12} className="text-red-500 inline mr-1" />}
                       {v.httpStatus || "FAIL"}
                     </td>
                     <td className="py-1.5 pr-2">{v.payloadType}</td>
                     <td className="py-1.5 pr-2">{v.durationMs}</td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
        </div>

        {/* Suggested Mappings */}
        <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4">
           <h3 className="text-[11px] font-bold text-prizm-info mb-3 uppercase tracking-wider border-b border-prizm-border pb-2">Suggested Next Iteration Mappings</h3>
           <div className="space-y-3">
             {Object.entries(data.suggestedMappings).map(([k, mappings]: [string, any]) => (
                <div key={k}>
                  <div className="font-bold text-prizm-text text-[10px] uppercase mb-1">{k}</div>
                  {mappings.length === 0 ? (
                    <div className="text-prizm-text-muted text-[10px] italic">No robust match found</div>
                  ) : (
                    mappings.map((m: any, i: number) => (
                      <div key={i} className="bg-black/30 border border-prizm-border p-2 rounded mb-1 text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-prizm-primary font-bold">{m.title}</span>
                          <span className="text-prizm-text-muted text-[9px]">{m.sourceEndpoint}</span>
                        </div>
                        <div className="text-cyan-400/80 mt-1 truncate">{m.fieldPath}</div>
                      </div>
                    ))
                  )}
                </div>
             ))}
           </div>
        </div>
      </div>

      {/* Discovered Fields Tree */}
      <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 flex-1 min-h-0 flex flex-col">
          <h3 className="text-[11px] font-bold text-prizm-text mb-3 uppercase tracking-wider border-b border-prizm-border pb-2">Discovered Field Candidates</h3>
          <div className="flex-1 overflow-y-auto space-y-4">
             {Object.entries(data.discovered).map(([k, fields]: [string, any]) => (
               <div key={k} className="border border-prizm-border rounded">
                 <div className="bg-black/40 p-2 font-bold text-[10px] text-prizm-text uppercase tracking-widest border-b border-prizm-border">
                   {k} <span className="ml-2 text-prizm-text-muted">({fields.length} candidates)</span>
                 </div>
                 {fields.length > 0 && (
                   <div className="p-2 space-y-2 max-h-[300px] overflow-y-auto">
                     {fields.map((f: any, i: number) => (
                       <div key={i} className="p-2 bg-prizm-surface-strong border border-prizm-border rounded text-[10px] flex justify-between items-center group">
                          <div className="flex-1 truncate pr-4">
                            <span className="text-prizm-text-muted">{f.endpoint} : </span>
                            <span className="text-cyan-400 font-bold">{f.path}</span>
                          </div>
                          <div className="w-[120px] text-right truncate text-prizm-text-muted">
                            {f.valueType} 
                            {f.numericStats && ` (μ=${Math.round(f.numericStats.average)})`}
                          </div>
                       </div>
                     ))}
                   </div>
                 )}
               </div>
             ))}
          </div>
      </div>

    </div>
  );
}
