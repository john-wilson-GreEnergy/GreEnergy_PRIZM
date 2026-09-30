import React, {useState} from "react";
import type {ThermalReviewJob} from "../server/thermal/thermalMorningReview";
import type {SiteStorageStatus} from "../server/thermal/siteHistory";

const button="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40";
export default function ThermalMorningReview({job,storage,onChanged,onInspect}:{job?:ThermalReviewJob;storage?:SiteStorageStatus;onChanged:()=>void;onInspect:(id:string,from:number,to:number)=>void}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[hours,setHours]=useState(12),[filter,setFilter]=useState("attention"),[page,setPage]=useState(0);
  const report=job?.report;
  const rows=report?.rows.filter(row=>filter==="all"||filter==="coverage"&&row.coverageGap||filter==="attention"&&row.performanceCandidate)||[];
  const start=page*20;
  const request=async(cancel=false)=>{setBusy(true);setError("");try{
    const response=await fetch(`/api/local/site-data/thermal/morning-review${cancel?"/cancel":""}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({hours})});
    const value=await response.json();if(!response.ok)throw new Error(value.error||"Review request failed");setPage(0);onChanged();
  }catch(e){setError(String(e));}finally{setBusy(false);}};
  const download=()=>{if(!report)return;const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:"application/json"}));const link=document.createElement("a");link.href=url;link.download=`prizm-thermal-review-${new Date(report.to).toISOString().replace(/[:.]/g,"-")}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  if(job?.state==="disabled")return null;
  return <section aria-label="Thermal morning review" className="rounded-xl border border-sky-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-bold text-slate-900">What happened overnight?</h2><p className="mt-1 text-xs text-slate-600">Whole-site thermal review · independent of graph targets · saved observations only · no equipment commands</p></div>
      <div className="flex flex-wrap items-center gap-2"><label className="text-xs">Window <select aria-label="Morning review window" className={button} value={hours} disabled={busy||job?.state==="building"} onChange={e=>setHours(Number(e.target.value))}><option value={12}>Last 12 hours</option><option value={24}>Last 24 hours</option></select></label><button className={button} disabled={busy||job?.state==="building"||!storage?.siteKey||!storage.canStart} onClick={()=>request()}>Build review</button>{job?.state==="building"&&<button className={button} disabled={busy} onClick={()=>request(true)}>Cancel review</button>}</div>
    </div>
    {storage&&<p className={`mt-3 text-xs ${storage.pausedReason||!storage.enabled?"text-amber-800":"text-slate-600"}`}>Recorder: {storage.pausedReason?`paused — ${storage.pausedReason}`:storage.enabled?"enabled":"disabled"} · Last saved: {storage.lastSavedAt?new Date(storage.lastSavedAt).toLocaleString():"never"} · Recorder lifetime dropped-sample counter: {storage.droppedSamples} (not specific to this review)</p>}
    {error&&<p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
    {job?.state==="failed"&&<p role="alert" className="mt-3 text-sm text-red-800">Review could not complete: {job.error}. No partial report is presented as complete.</p>}
    {job?.state==="building"&&<p role="status" className="mt-3 rounded-lg bg-sky-50 p-3 text-sm">Preparing saved history in the background: {job.completed} of {job.total} units reviewed. Large windows can take several minutes; live readings remain available.</p>}
    {job?.state==="cancelled"&&<p className="mt-3 text-xs">Review cancelled. Recording continues unchanged.</p>}
    {!report&&job?.state!=="building"&&<p className="mt-3 text-xs text-slate-500">Build a review to see coverage, reported faults, commanded compressor time, and cooling-response findings. This first release does not include PCS or string incidents.</p>}
    {report&&<>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs"><p><strong>{report.siteLabel}</strong> · {new Date(report.from).toLocaleString()} → {new Date(report.to).toLocaleString()}<br/>Fixed historical window; not a live alarm list. Results are reused for up to 5 minutes.</p><button className={button} onClick={download}>Export review</button></div>
      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-5">{[["Units reviewed",report.summary.units],["Below 95% coverage",report.summary.partialCoverage],["With reported faults",report.summary.faultTargets],["Short-cycle candidates",report.summary.shortCycleTargets],["Weak-cooling candidates",report.summary.weakCoolingTargets]].map(([label,value])=><div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-xs text-slate-600">{label}</div><strong className="text-xl">{value}</strong></div>)}</div>
      <p className="mt-2 text-xs text-slate-600">{report.summary.noData} units had no live saved observations. A zero candidate count does not establish healthy operation when coverage is incomplete.</p>
      <details className="mt-3 rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer text-xs font-semibold">How to interpret this review</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">{report.limitations.map(note=><li key={note}>{note}</li>)}</ul></details>
      <details className="mt-3 rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-semibold">Equipment findings and coverage · open to review units</summary>
      <div className="my-3 flex flex-wrap items-center justify-between gap-2 text-xs"><label>Show <select aria-label="Morning review findings" className={button} value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);}}><option value="attention">Performance candidates / reported faults</option><option value="coverage">Coverage gaps</option><option value="all">All units</option></select></label><span>{rows.length} matching units</span></div>
      <div className="space-y-2">{rows.slice(start,start+20).map(row=><details key={row.device.id} className="rounded-lg border border-slate-200 bg-white p-3"><summary className="cursor-pointer text-sm"><span className="font-semibold">{row.device.label}</span><span className="ml-3 text-xs text-slate-600">Live coverage {row.display.coverage} · Commanded on {row.display.commanded} · Observed starts {row.starts}</span></summary>
        <div className="mt-3 grid gap-3 text-xs sm:grid-cols-3"><p>Longest unverified interval<br/><strong>{row.display.gap}</strong></p><p>Compressor-command coverage<br/><strong>{row.display.commandCoverage}</strong></p><p>Complete short commanded-on cycles<br/><strong>{row.shortCycles}</strong></p><p>Observed weak-cooling time<br/><strong>{row.display.weakCooling}</strong></p><p>Peak HVAC current<br/><strong>{row.display.peakCurrent}</strong></p><p>Peak enclosure / cell temperature<br/><strong>{row.display.peakSpace} / {row.display.peakCell}</strong></p></div>
        <p className="mt-3 text-xs">Fault appearances: {row.faultAppeared} · Observed clears: {row.faultCleared}. These count individual fault messages, not equipment incidents.</p>
        {row.notes.map(note=><p className="mt-2 text-xs text-amber-900" key={note}>{note}</p>)}
        {!!row.faultObservations.length&&<ul className="mt-2 list-disc pl-5 text-xs">{row.faultObservations.map(f=><li key={f}>{f}</li>)}</ul>}
        <button className={`${button} mt-3`} onClick={()=>onInspect(row.device.id,report.from,report.to)}>Review this unit’s amperage history</button>
      </details>)}</div>
      {!rows.length&&<p className="py-3 text-xs">No findings match this view. Choose All units to inspect coverage and measurements.</p>}
      {rows.length>20&&<div className="mt-3 flex items-center gap-3 text-xs"><button className={button} disabled={page===0} onClick={()=>setPage(p=>p-1)}>Previous units</button><span>Page {page+1}</span><button className={button} disabled={start+20>=rows.length} onClick={()=>setPage(p=>p+1)}>Next units</button></div>}
      </details>
    </>}
  </section>;
}
