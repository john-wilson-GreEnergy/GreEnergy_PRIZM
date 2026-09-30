import React, { Profiler, useState, type ReactNode } from 'react';
import { RenderMeasurements } from '../lib/renderMeasurements';
declare const __PRIZM_RENDER_PROFILE__: boolean;
const measurements = new RenderMeasurements();
export function renderProfilingEnabled() {
  return typeof __PRIZM_RENDER_PROFILE__ !== 'undefined' && __PRIZM_RENDER_PROFILE__ && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('renderProfile') === '1';
}
export function RenderProbe({id, children}: {id:string;children:ReactNode}) {
  if (!renderProfilingEnabled()) return children;
  return <Profiler id={id} onRender={(key, phase, ms)=>measurements.record(key,phase,ms)}>{children}</Profiler>;
}
export function RenderMeter() {
  const [report,setReport] = useState<ReturnType<RenderMeasurements['report']>>([]);
  if (!renderProfilingEnabled()) return null;
  return <aside aria-label="Render measurements" className="fixed bottom-16 left-2 z-[150] max-w-[90vw] max-h-[45vh] overflow-auto rounded border border-slate-400 bg-white p-3 text-black text-xs shadow-lg">
    <p>React render CPU only — excludes network, layout and paint. Profiling adds overhead.</p>
    <button className="border p-2 m-1" onClick={()=>setReport(measurements.report())}>Read render measurements</button>
    <button className="border p-2 m-1" onClick={()=>{measurements.reset();setReport([]);}}>Reset render measurements</button>
    <pre className="whitespace-pre-wrap">{report.length ? JSON.stringify(report,null,2) : 'No measurements displayed. Read after exercising a page.'}</pre>
  </aside>;
}
