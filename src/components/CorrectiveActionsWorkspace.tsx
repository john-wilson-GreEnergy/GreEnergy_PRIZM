import React,{useMemo} from 'react';
import type {NotificationGroup,NotificationReview} from '../server/notifications/notificationReview';
import {usePresentation} from '../lib/workspacePreferences';
import {selectedTargets} from '../lib/correctiveWorklist';
import {CorrectiveBpcWorkspace} from './CorrectiveBpcWorkspace';
import {CorrectiveCategoryList,correctiveCategory} from './CorrectiveCategoryList';
import {CorrectiveGuidanceBoundary} from './CorrectiveGuidanceEditor';
import {CorrectiveExportMenu} from './CorrectiveExportMenu';
import {NotificationGuidanceAudit} from './NotificationGuidanceAudit';
import {LegacyCorrectiveActionsWorkspace} from './LegacyCorrectiveActionsWorkspace';

export interface IssueFilters {query:string;severity:string;array:string;category:string}
export function filterIssueGroups(groups:NotificationGroup[],f:IssueFilters){return groups.filter(g=>(f.severity==='all'||g.severity===f.severity)&&(f.array==='all'||g.arrays.includes(Number(f.array)))&&(f.category==='all'||correctiveCategory(g)===f.category)&&[g.code,g.title,correctiveCategory(g)].join(' ').toLowerCase().includes(f.query.trim().toLowerCase()));}
const empty:IssueFilters={query:'',severity:'all',array:'all',category:'all'};
type Props={review?:NotificationReview;stale?:boolean;loading?:boolean;error?:string;onEditGuidance?:(entryId:string|null)=>void};
export function CorrectiveActionsWorkspace(props:Props){
  if(typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('correctiveLayout')==='legacy')return <LegacyCorrectiveActionsWorkspace {...props}/>;
  return <CorrectiveGuidanceBoundary revision={props.review?.guidanceRevision??0} sharedRevision={props.review?.guidanceSharedRevision??0}><Workspace {...props}/></CorrectiveGuidanceBoundary>;
}
function Workspace({review,stale=false,loading=false,error}:Props){
  const [filters,setFilters]=usePresentation<IssueFilters>('corrective-v2-filters',empty);
  const [targetQuery,setTargetQuery]=usePresentation('corrective-v2-target','');
  const [mode,setMode]=usePresentation<'issue'|'bpc'>('corrective-v2-mode','issue');
  const groups=useMemo(()=>filterIssueGroups(review?.groups??[],filters).filter(g=>selectedTargets(g,filters.array,targetQuery).length>0),[review,filters,targetQuery]);
  const categories=[...new Set(review?.groups.map(correctiveCategory)??[])].sort(),arrays=[...new Set(review?.groups.flatMap(g=>g.arrays)??[])].sort((a,b)=>a-b);
  const update=(key:keyof IssueFilters,value:string)=>setFilters(f=>({...f,[key]:value}));
  const bpcs=review?.bpcReview?.scopes['all:all'];
  return <div className="ops-corrective">
    <div className="ops-breadcrumb">Maintenance <span>/</span> Corrective actions</div>
    <div className="ops-page-heading"><div><h1>Corrective actions</h1><p>Prioritize by category. Locate affected equipment. Prepare a field worklist.</p></div><div className="ops-snapshot"><span>{stale?'Retained snapshot · verify freshness':loading?'Loading snapshot':'Prepared snapshot'}</span><span>{review?new Date(review.capturedAt).toLocaleString():'No observation available'}</span></div></div>
    {(stale||error)&&<p className="ops-alert" role="status">{error||'This snapshot is stale. Verify current equipment conditions before field work.'}</p>}
    {review?.sourceWarnings?.map(w=><p key={w} className="ops-alert" role="status">{w}</p>)}
    <div className="ops-stats">{[['Unique BPCs',bpcs?.uniqueBpcs,bpcs?.partial?'At least · incomplete coverage':'Each physical BPC counted once'],['Balancing candidates',review?.bpcReview?.balancerInventory?.total,'Charge + discharge combined; not replacement orders'],['Alarm / critical',review?.totals.alarm,'Reported occurrences'],['Issue groups',review?.totals.groups,'All severities and categories']].map(([label,value,note])=><div className="ops-stat" key={String(label)}><span>{label}</span><strong>{value==null?'—':Number(value).toLocaleString()}</strong><small>{note}</small></div>)}</div>
    <p className="ops-count-note">Complete snapshot totals · Fault occurrences are not replacement quantities. Unknown severity: {review?.totals.unknown??'—'}. Guidance revisions: site {review?.guidanceRevision??0} / shared {review?.guidanceSharedRevision??0}.</p>
    {review?.bpcReview?.balancerInventory?.partial&&<p className="ops-alert">Balancing coverage is incomplete. The displayed quantity is a lower bound, not a complete replacement count.</p>}
    <section className="ops-issues" aria-label="Issue review">
      <div className="ops-view-switch"><div><button aria-pressed={mode==='issue'} onClick={()=>setMode('issue')}>Faults by category</button><button aria-pressed={mode==='bpc'} onClick={()=>setMode('bpc')}>Unique BPCs & balancing quantities</button></div><span className="ops-muted">Read-only review · No equipment commands</span></div>
      <div className="ops-filter-bar">
        {mode==='issue'&&<label className="ops-search">Find fault<input aria-label="Find issue or target" value={filters.query} placeholder="Code or plain-language title…" onChange={e=>update('query',e.target.value)}/></label>}
        <label className="ops-search">Affected equipment<input aria-label="Filter affected equipment" value={targetQuery} placeholder="BPC 3, String 12, HVAC…" onChange={e=>setTargetQuery(e.target.value)}/></label>
        <label>Array<select aria-label="Issue array" value={filters.array} onChange={e=>update('array',e.target.value)}><option value="all">All arrays</option>{arrays.map(a=><option key={a} value={a}>Array {a}</option>)}</select></label>
        {mode==='issue'&&<><label>Severity<select aria-label="Issue severity" value={filters.severity} onChange={e=>update('severity',e.target.value)}>{['all','critical','alarm','warning','info','unknown'].map(s=><option key={s} value={s}>{s==='all'?'All severities':s}</option>)}</select></label><label>Category<select aria-label="Issue category" value={filters.category} onChange={e=>update('category',e.target.value)}><option value="all">All categories</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label></>}
        <button className="ops-reset" onClick={()=>{setFilters(empty);setTargetQuery('');}}>Reset filters</button>
      </div>
      {mode==='bpc'?review?<CorrectiveBpcWorkspace review={review} array={filters.array} query={targetQuery}/>:<p className="ops-empty">Waiting for canonical BPC review.</p>:<div style={{padding:'0 16px 16px'}}>
        <div className="ca-toolbar"><p>{groups.length} of {review?.totals.groups??'—'} groups · Highest severity first in each category · Expand a fault for its target list</p>{review&&<CorrectiveExportMenu review={review} groups={groups} array={filters.array} query={targetQuery} stale={stale} filters={{...filters}}/>}</div>
        <CorrectiveCategoryList groups={groups} array={filters.array} query={targetQuery}/>
        {!groups.length&&<p className="ops-empty">{!review?'Waiting for the prepared snapshot. An empty view does not mean the site is clear.':review.groups.length?'No issues match these filters. Reset filters to see the complete snapshot.':'No findings in this snapshot. Check source health before treating this as an all-clear.'}</p>}
      </div>}
    </section>
    <details className="ops-definitions"><summary>Guidance gaps & source definitions</summary><NotificationGuidanceAudit gaps={review?.guidanceGaps}/><p>Reported targets retain cell-group detail. BPC lists count physical devices once across issues. Display categories and local guidance do not alter detection, severity or controller clearing conditions.</p>{review?.sourceNotes?.map(n=><p key={n}>{n}</p>)}</details>
  </div>;
}
