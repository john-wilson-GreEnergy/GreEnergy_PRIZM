import React, {useMemo, useState} from 'react';
import {ChevronDown, ChevronRight, Search, ShieldAlert, SlidersHorizontal} from 'lucide-react';
import type {NotificationGroup,NotificationReview} from '../server/notifications/notificationReview';
import {NotificationTargetsTable,NotificationGroupRow} from './NotificationReviewPanel';
import {HvacIssueDisclosure} from './HvacIssueDisclosure';
import {NotificationGuidanceAudit} from './NotificationGuidanceAudit';
import {NotificationTroubleshootingPanel} from './NotificationTroubleshootingPanel';
import {usePresentation,TargetNavigation} from '../lib/workspacePreferences';
import {TableDensity} from './WorkspaceTableTools';
import {CorrectiveBpcWorkspace} from './CorrectiveBpcWorkspace';
import {selectedTargets,correctiveCsv,printableWorklist,downloadText} from '../lib/correctiveWorklist';

export interface IssueFilters {query:string;severity:string;array:string;category:string}
export function filterIssueGroups(groups:NotificationGroup[],filters:IssueFilters) {
  const query=filters.query.trim().toLowerCase();
  return groups.filter(group=>(filters.severity==='all'||group.severity===filters.severity)&&
    (filters.array==='all'||group.arrays.includes(Number(filters.array)))&&
    (filters.category==='all'||group.category===filters.category)&&
    [group.code,group.title,group.category].join(' ').toLowerCase().includes(query));
}
const emptyFilters:IssueFilters={query:'',severity:'all',array:'all',category:'all'};
const rank={critical:0,alarm:1,warning:2,unknown:3,info:4};

/** Presentation of the existing server-prepared review. No telemetry acquisition or fault inference. */
export function LegacyCorrectiveActionsWorkspace({review,stale=false,loading=false,error,onEditGuidance}: {
  review?:NotificationReview;stale?:boolean;loading?:boolean;error?:string;onEditGuidance?:(entryId:string|null)=>void;
}) {
  const [filters,setFilters]=usePresentation<IssueFilters>('corrective-filters',emptyFilters);
  const [section,setSection]=usePresentation<'equipment'|'availability'>('corrective-section','equipment');
  const [expanded,setExpanded]=usePresentation<string[]>('corrective-expanded',[]);
  const [showCategory,setShowCategory]=usePresentation('corrective-category-column',true);
  const [showArrays,setShowArrays]=usePresentation('corrective-arrays-column',true);
  const [showMetrics,setShowMetrics]=usePresentation('corrective-metrics-column',true);
  const [targetQuery,setTargetQuery]=usePresentation('corrective-target-query','');
  const [mode,setMode]=usePresentation<'issue'|'bpc'>('corrective-view','issue');
  const update=(key:keyof IssueFilters,value:string)=>setFilters(prev=>({...prev,[key]:value}));
  const groups=useMemo(()=>filterIssueGroups(review?.groups??[],filters).sort((a,b)=>rank[a.severity]-rank[b.severity]||a.title.localeCompare(b.title)),[review,filters]);
  const visible=groups.filter(g=>(g.section??'equipment')===section&&selectedTargets(g,filters.array,targetQuery).length>0);
  const hvac=review?.hvacReview?visible.filter(g=>g.category==='HVAC / Environmental'):[];
  const arrays=[...new Set(review?.groups.flatMap(g=>g.arrays)??[])].sort((a,b)=>a-b);
  const categories=[...new Set(review?.groups.map(g=>g.category)??[])].sort();
  const toggle=(id:string)=>setExpanded(prev=>prev.includes(id)?prev.filter(v=>v!==id):[...prev,id].slice(-128));
  const exportWork=(print=false)=>{if(!review)return;const site=typeof document==='undefined'?'PRIZM':document.querySelector('.ops-site')?.textContent||'PRIZM';downloadText(print?'PRIZM-worklist.html':'PRIZM-worklist.csv',print?printableWorklist(visible,filters.array,targetQuery,site,review.capturedAt,stale,review.sourceWarnings):correctiveCsv(visible,filters.array,targetQuery,site,review.capturedAt,stale,review.sourceWarnings),print?'text/html;charset=utf-8':undefined);};
  return <div className="ops-corrective">
    <div className="ops-breadcrumb">Maintenance <span>/</span> Corrective actions</div>
    <div className="ops-page-heading"><div><h1>Corrective actions</h1><p>Understand the issue. Review affected equipment. Verify resolution.</p></div><div className="ops-snapshot"><span className={stale?'ops-text-warning':''}>{stale?'Retained snapshot · verify freshness':loading?'Loading snapshot':'Prepared snapshot'}</span><span>{review?new Date(review.capturedAt).toLocaleString():'No observation available'}</span></div></div>
    {(stale||error)&&<div className="ops-alert" role="status"><ShieldAlert size={18}/><span>{error||'This snapshot is stale. Confirm current equipment conditions before taking action.'}</span></div>}
    {!!review?.sourceWarnings?.length&&<div className="ops-alert" role="status"><ShieldAlert size={18}/><div>{review.sourceWarnings.map(w=><p key={w}>{w}</p>)}</div></div>}
    <div className="ops-stats">{[
      ['Issue groups',review?.totals.groups,'neutral','Types of issues reported'],
      ['Unique targets',review?.totals.targets,'neutral','Includes cell-group targets'],
      ['Alarm / critical',review?.totals.alarm,'danger','Reported occurrences'],
      ['Warnings',review?.totals.warning,'warning','Reported occurrences'],
    ].map(([label,value,tone,detail])=><div className="ops-stat" key={String(label)}><span>{label}</span><strong className={`ops-text-${tone}`}>{value===undefined?'—':Number(value).toLocaleString()}</strong><small>{detail}</small></div>)}</div>
    <p className="ops-count-note">Complete snapshot totals · A target may have multiple issues. These are not unique BPC or replacement counts. Unknown severity: {review?.totals.unknown??'—'}.</p>
    <NotificationGuidanceAudit gaps={review?.guidanceGaps}/>
    <section className="ops-issues" aria-label="Issue review">
      <div className="ops-view-switch"><div><button aria-pressed={mode==='issue'} onClick={()=>setMode('issue')}>By issue</button><button aria-pressed={mode==='bpc'} onClick={()=>setMode('bpc')}>By BPC</button></div><TableDensity/></div>
      {mode==='bpc'?<><div className="ops-filter-bar"><label className="ops-search">Find BPC or issue<input aria-label="Find BPC" placeholder="BPC 3, string, or code…" value={targetQuery} onChange={e=>setTargetQuery(e.target.value)}/></label><label>Array<select aria-label="BPC array" value={filters.array} onChange={e=>update('array',e.target.value)}><option value="all">All arrays</option>{arrays.map(a=><option key={a} value={a}>Array {a}</option>)}</select></label><button className="ops-reset" onClick={()=>{setTargetQuery('');update('array','all');}}>Reset</button></div>{review?<CorrectiveBpcWorkspace review={review} array={filters.array} query={targetQuery}/>:<p className="ops-empty">Waiting for canonical BPC review.</p>}</>:<>
      <div className="ops-sections" aria-label="Issue sections">{([
        ['equipment','Equipment issues'],['availability','Contactors & rotation'],
      ] as const).map(([id,label])=><button key={id} aria-pressed={section===id} className={section===id?'is-active':''} onClick={()=>setSection(id)}>{label}<span>{groups.filter(g=>(g.section??'equipment')===id).length}</span></button>)}</div>
      <div className="ops-filter-bar">
        <label className="ops-search"><span>Find issue group</span><div><Search size={16}/><input aria-label="Find issue or target" placeholder="Search code or issue…" value={filters.query} onChange={e=>update('query',e.target.value)}/></div></label>
        <label className="ops-search"><span>Affected equipment</span><input aria-label="Filter affected equipment" placeholder="BPC 3, String 12…" value={targetQuery} onChange={e=>setTargetQuery(e.target.value)}/></label>
        <label>Severity<select aria-label="Issue severity" value={filters.severity} onChange={e=>update('severity',e.target.value)}>{['all','critical','alarm','warning','info','unknown'].map(s=><option key={s} value={s}>{s==='all'?'All severities':s.charAt(0).toUpperCase()+s.slice(1)}</option>)}</select></label>
        <label>Array<select aria-label="Issue array" value={filters.array} onChange={e=>update('array',e.target.value)}><option value="all">All arrays</option>{arrays.map(a=><option key={a} value={a}>Array {a}</option>)}</select></label>
        <label>Equipment<select aria-label="Issue equipment" value={filters.category} onChange={e=>update('category',e.target.value)}><option value="all">All equipment</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
        <button className="ops-reset" onClick={()=>{setFilters(emptyFilters);setTargetQuery('');}}>Reset</button>
      </div>
      <div className="ops-table-toolbar"><span>{visible.length} matching issue {visible.length===1?'group':'groups'} <span className="ops-muted">· Highest severity first</span></span><details className="ops-display"><summary><SlidersHorizontal size={14}/>Display</summary><div>{[[showCategory,setShowCategory,'Equipment column'],[showArrays,setShowArrays,'Arrays column'],[showMetrics,setShowMetrics,'Target metrics']] .map(([value,set,label])=><label key={String(label)}><input type="checkbox" checked={Boolean(value)} onChange={e=>(set as (v:boolean)=>void)(e.target.checked)}/>{String(label)}</label>)}</div></details></div>
      {section==='availability'&&<p className="ops-section-note">Connection and rotation conditions retain their reported severity. An operating state is not automatically a fault.</p>}
      {!!hvac.length&&<HvacIssueDisclosure review={review?.hvacReview} array={filters.array==='all'?null:Number(filters.array)} query={targetQuery} issueKeys={hvac.map(g=>g.id)}>
        {hvac.map(g=>{const targets=selectedTargets(g,filters.array,targetQuery),ids=new Set(targets.map(t=>t.id));return <NotificationGroupRow key={g.id} group={{...g,targets,tableRows:g.tableRows?.filter(r=>r.memberIds.some(id=>ids.has(id)))}} array={filters.array} targetLayout="table" onEditGuidance={onEditGuidance}/>;})}
      </HvacIssueDisclosure>}
      <div className="ops-table-scroll"><table className="ops-issue-table"><thead><tr><th scope="col">Issue / code</th><th scope="col">Severity</th>{showCategory&&<th scope="col">Equipment</th>}{showArrays&&<th scope="col">Arrays</th>}<th scope="col" className="ops-number">Targets</th></tr></thead><tbody>
        {visible.filter(g=>!hvac.includes(g)).map(group=>{
          const open=expanded.includes(group.id),id=`issue-${encodeURIComponent(group.id)}`;
          const targets=selectedTargets(group,filters.array,targetQuery),ids=new Set(targets.map(t=>t.id));
          const rows=group.tableRows?.filter(r=>r.memberIds.some(id=>ids.has(id)));
          const locations=[...new Map(targets.filter(t=>t.array&&t.location?.string).map(t=>[`${t.array}:${t.location!.string}:${t.location!.bpc}`,{array:t.array!,string:t.location!.string!,...(t.location!.bpc?{bpc:t.location!.bpc}:{})}])).values()];
          return <React.Fragment key={group.id}><tr className={open?'is-expanded':''}>
            <td><button className="ops-issue-toggle" aria-expanded={open} aria-controls={id} onClick={()=>toggle(group.id)}>{open?<ChevronDown size={16}/>:<ChevronRight size={16}/>}<span><strong>{group.title}</strong><small>{group.code||'No code supplied'}</small></span></button></td>
            <td><span className={`ops-severity ops-severity-${group.severity}`}>{group.severity}</span></td>
            {showCategory&&<td className="ops-muted">{group.category}</td>}{showArrays&&<td>{group.arrays.length?group.arrays.join(', '):'Not supplied'}</td>}
            <td className="ops-number"><strong>{group.targetCount}</strong><small>whole group</small></td>
          </tr><tr hidden={!open} id={id} className="ops-detail-row"><td colSpan={3+Number(showCategory)+Number(showArrays)}>{open&&<div className="ops-issue-detail">
            {group.explanation&&<p className="ops-explanation">{group.explanation}</p>}
            <NotificationTroubleshootingPanel group={{...group,targets}} array={filters.array} onEditGuidance={onEditGuidance}/>
            <div className="ops-target-heading"><h3>Affected targets</h3><span>{rows?.length??'—'} consolidated rows · {filters.array==='all'?'All arrays':`Array ${filters.array}`}</span></div>
            <p className="ops-section-note">{targets.length} matching reported targets · {rows?.length??'—'} matching string/equipment rows. Matching rows retain their full cell/BPC context; whole-group totals above do not change.</p>
            <details className="ops-location-links"><summary>Open matching equipment or history ({locations.length} locations)</summary>{locations.map(l=><div key={`${l.array}:${l.string}:${l.bpc}`}><span>Array {l.array} / String {l.string}{l.bpc?` / BPC ${l.bpc}`:''}</span><TargetNavigation target={l}/></div>)}</details>
            {showMetrics&&rows?.some(row=>row.metrics)&&<p className="ops-section-note">Current string context, not measurements at the time of the fault or individual BPC/cell readings. Normal readings do not clear retained alarms. — = unavailable.</p>}
            {rows?<div className="ops-target-scroll"><NotificationTargetsTable rows={rows} title={group.title} showMetrics={showMetrics} showGuidance={!group.troubleshooting}/></div>:<p className="ops-empty">Prepared target table unavailable. {group.targetCount} reported targets retained; this is not an all-clear.</p>}
            {!group.troubleshooting&&group.commonGuidance?.map(step=><p key={step} className="ops-section-note">{step}</p>)}
          </div>}</td></tr></React.Fragment>;
        })}
        {!visible.length&&<tr><td colSpan={3+Number(showCategory)+Number(showArrays)} className="ops-empty">{!review?'Waiting for the prepared notification snapshot. An empty view does not mean the site is clear.':review.groups.length?'No issues match this section and your filters. Try another section or reset filters.':'No findings in this snapshot. Check source health before treating this as an all-clear.'}</td></tr>}
      </tbody></table></div>
      <footer className="ops-table-footer"><span>{visible.length} of {review?.totals.groups??'—'} issue groups</span><span>Read-only review · No equipment commands</span></footer>
      <div className="ops-worklist-actions"><button disabled={!review||!visible.length} onClick={()=>exportWork()}>Export filtered worklist · CSV</button><button disabled={!review||!visible.length} onClick={()=>exportWork(true)}>Download printable worklist</button><span>Current issue / array / target filters · open the printable file to print</span></div>
      </>}
    </section>
    <details className="ops-definitions"><summary>Source & count definitions</summary><p>Unique targets retain cell-group and HVAC-unit granularity. An occurrence is one issue type and severity on one target, not a new event on every poll. A consolidated table row is not a replacement count. Troubleshooting guidance does not authorize a reset or confirm resolution.</p>{review?.sourceNotes?.map(note=><p key={note}>{note}</p>)}</details>
  </div>;
}
