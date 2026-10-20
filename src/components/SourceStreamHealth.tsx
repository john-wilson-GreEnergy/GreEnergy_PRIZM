import React, {useState} from 'react';
import {useSiteDataFields} from '../context/SiteDataContext';
import {isLocalOperationsReview} from '../lib/operationsReview';

export interface StreamHealthRow {
  name?:string;sourceLabel?:string;endpoint?:string;url?:string;state?:string;
  ok?:boolean;success?:boolean;stale?:boolean;recordCount?:number|null;ageMs?:number|null;
  httpStatus?:number|null;statusCode?:number|null;lastStatusCode?:number|null;
  durationMs?:number|null;lastDurationMs?:number|null;lastUpdated?:string|null;
  error?:string|null;lastError?:string|null;
}
const number=(value:number|null|undefined,suffix='')=>value==null?'Not reported':`${value.toLocaleString(undefined,{maximumFractionDigits:1})}${suffix}`;
export function StreamHealthTable({rows}:{rows:StreamHealthRow[]}) {
  return <div className="overflow-x-auto rounded border border-prizm-border"><table className="w-full text-left text-xs"><thead className="bg-prizm-surface-strong"><tr>{['Source','Health','Freshness','Last acquired','Records','HTTP status','Latency','Endpoint','Error'].map(label=><th key={label} className="p-3 whitespace-nowrap">{label}</th>)}</tr></thead><tbody>
    {!rows.length&&<tr><td colSpan={9} className="p-6 text-prizm-text-muted">No source-health records are published. This does not indicate that sources are healthy.</td></tr>}
    {rows.map((row,index)=>{const ok=row.ok??row.success;const state=row.stale?'Stale':row.state||(ok===true?'Healthy':ok===false?'Failed':'Unknown');return <tr key={`${row.name||row.endpoint}-${index}`} className="border-t border-prizm-border"><td className="p-3 font-bold whitespace-nowrap">{row.sourceLabel||row.name||'Unnamed source'}</td><td className={`p-3 ${row.stale?'text-prizm-warning':ok===false?'text-prizm-danger':'text-prizm-text'}`}>{state}</td><td className="p-3 whitespace-nowrap">{row.ageMs==null?'Not reported':number(row.ageMs/1000,' s at publication')}</td><td className="p-3 whitespace-nowrap">{row.lastUpdated?new Date(row.lastUpdated).toLocaleString():'Not reported'}</td><td className="p-3">{number(row.recordCount)}</td><td className="p-3">{number(row.httpStatus??row.statusCode??row.lastStatusCode)}</td><td className="p-3 whitespace-nowrap">{number(row.durationMs??row.lastDurationMs,' ms')}</td><td className="p-3 font-mono text-[10px]">{row.url||row.endpoint||'Not reported'}</td><td className="p-3 text-prizm-danger">{row.error||(row.lastError==='NONE'?null:row.lastError)||'—'}</td></tr>;})}
  </tbody></table></div>;
}
export default function SourceStreamHealth(){
  const {sourceHealth,sourceHealthSummary,siteIdentity,snapshot,liveStatus,lastPollAttemptedAt,lastGoodSnapshotAt,error,refreshNow}=useSiteDataFields(['sourceHealth','sourceHealthSummary','siteIdentity','snapshot','liveStatus','lastPollAttemptedAt','lastGoodSnapshotAt','error','refreshNow']);
  const [filter,setFilter]=useState('');const [refreshing,setRefreshing]=useState(false);
  const rows=(sourceHealth||[]) as StreamHealthRow[];
  const filtered=rows.filter(row=>`${row.name} ${row.sourceLabel} ${row.endpoint} ${row.state}`.toLowerCase().includes(filter.toLowerCase()));
  const summary=sourceHealthSummary||{};
  return <div className="space-y-5"><header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold">Data stream health</h1><p className="mt-1 text-sm text-prizm-text-muted">Acquisition status, freshness, endpoint details, and source errors.</p></div><button className="ops-reset" disabled={refreshing} onClick={async()=>{setRefreshing(true);try{await refreshNow();}finally{setRefreshing(false);}}}>{refreshing?'Refreshing…':'Refresh status'}</button></header>
    {error&&<p role="alert" className="rounded border border-prizm-warning p-3 text-prizm-warning">The latest refresh failed. Records may be last known: {error.message}</p>}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[['Sources',summary.totalSources],['Healthy',summary.healthySources],['Stale',summary.staleSources],['Failed',summary.failedSources]].map(([label,value])=><div key={String(label)} className="rounded border border-prizm-border bg-prizm-surface p-4"><p className="text-xs text-prizm-text-muted">{label}</p><strong className="mt-2 block text-2xl">{number(value as number|undefined)}</strong></div>)}</div>
    <details className="rounded border border-prizm-border bg-prizm-surface p-4" open><summary className="cursor-pointer font-bold text-sm">Connection & acquisition details</summary><dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">{[['EMS endpoint',siteIdentity?.emsBaseUrl],['Snapshot state',liveStatus?.state],['Acquisition duration',number(snapshot?.debug?.lastPollDurationMs,' ms')],['Last attempt',lastPollAttemptedAt],['Last good snapshot',lastGoodSnapshotAt]].map(([label,value])=><div key={label}><dt className="text-prizm-text-muted">{label}</dt><dd className="mt-1 break-all font-mono">{value||'Not reported'}</dd></div>)}</dl>{isLocalOperationsReview()&&<p className="mt-4 text-xs text-prizm-text-muted">The local review uses published snapshots; the live string event stream is not forwarded. Per-row timestamps and freshness describe the readings shown.</p>}</details>
    <label className="flex flex-wrap items-center gap-3 text-xs">Find source<input aria-label="Find data source" value={filter} onChange={event=>setFilter(event.target.value)} className="rounded border border-prizm-border bg-prizm-surface p-2" placeholder="Name, endpoint, or state"/></label>
    <StreamHealthTable rows={filtered}/>
  </div>;
}
