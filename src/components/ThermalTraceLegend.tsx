import React from "react";
type Trace={id:string;label:string;color:string;visible:boolean;hasData:boolean};
type Props={traces:Trace[];only:string|null;hiddenCount:number;onToggle:(id:string)=>void;onOnly:(id:string)=>void;onRestore:()=>void};
export default function ThermalTraceLegend({traces,only,hiddenCount,onToggle,onOnly,onRestore}:Props){
  return <div aria-label="Thermal graph legend" className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <p>Click a label to hide/show its line. <strong>Only</strong> isolates one target. Targets and recordings stay unchanged.</p>
      <button type="button" disabled={!only&&!hiddenCount} onClick={onRestore} className="rounded border border-sky-300 px-3 py-2 font-semibold text-sky-900 disabled:opacity-40">Show all overlays</button>
    </div>
    <p role="status" className="mt-1 text-xs text-slate-500">{only?"One target isolated":`${hiddenCount} hidden overlays`} · Legend follows the current trace page. Shared segment temperatures may overlap.</p>
    <div className="mt-3 flex flex-wrap gap-2">{traces.map(trace=><div key={trace.id} className={`flex items-stretch rounded-lg border ${trace.visible?"border-slate-300":"border-dashed border-slate-300 bg-slate-50"}`}>
      <button type="button" aria-label={`Toggle trace ${trace.label}`} aria-pressed={trace.visible} onClick={()=>onToggle(trace.id)} title={trace.visible?"Hide this line":"Show this line"} className={`flex items-center gap-2 px-3 py-2 text-xs ${trace.visible?"text-slate-800":"text-slate-500 line-through"}`}>
        <span aria-hidden="true" className="inline-block h-1 w-5 rounded" style={{backgroundColor:trace.visible?trace.color:"#94a3b8"}}/>{trace.label}{!trace.hasData&&<span className="text-slate-500"> (no data)</span>}
      </button><button type="button" aria-label={`Show only ${trace.label}`} aria-pressed={only===trace.id} onClick={()=>onOnly(trace.id)} className="rounded-r-lg border-l border-slate-200 px-2 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-50">Only</button>
    </div>)}</div>
  </div>;
}
