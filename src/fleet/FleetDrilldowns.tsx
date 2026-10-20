import React,{useState} from 'react';
import {issueCategories,type FleetDetails,type FleetFinding,type FleetPcs,type FleetPcsReading,type IssueCategory} from '../core/fleet/details';
import {BpcIssuesTable} from './BpcIssuesTable';
import {HvacIssueDisclosure} from '../components/HvacIssueDisclosure';
import {HvacFaultRow} from '../components/HvacFaultRow';

function Reading({reading,unit=''}:{reading:FleetPcsReading;unit?:string}){
  return <div className={'pcs-reading '+reading.quality}><strong>{reading.value===null?'Not reported':typeof reading.value==='number'?reading.value.toLocaleString(undefined,{maximumFractionDigits:1}):reading.value}{reading.value!==null && unit && ` ${unit}`}</strong>
    <span className="row-meta">{reading.quality==='live'?'Current':reading.quality==='stale'?'Last known':'Unknown'} · {reading.source}</span>
    <span className="row-meta" title={reading.observedAt ?? undefined}>{reading.observedAt?(reading.quality==='live'?new Date(reading.observedAt).toLocaleTimeString():new Date(reading.observedAt).toLocaleString()):'No observation time'}</span>
    {reading.clockSkew && <span className="row-meta" title={`Device time: ${reading.deviceObservedAt??'unknown'}`}>Device clock differs · stream receipt shown</span>}</div>;
}
export function FleetPcsTable({pcs,array}:{pcs:FleetPcs[];array:number|null}){
  const units=pcs.filter(p=>array===null || p.array===array);
  return <div className="panel-section pcs-section"><div className="subheading"><div><h3>{array?`Array ${array} · PCS status`:'PCS operating status'}</h3><p>Reported switch positions · Insulation resistance · Maximum IGBT temperature in °F</p></div><span className="diagram-note">Read-only · Each value retains its own source and timestamp</span></div>
    {!units.length?<p className="empty-state">Detailed PCS readings have not been supplied by this collector.</p>:<div className="table-wrap"><table className="pcs-table"><thead><tr><th>Array / PCS</th><th>Inverter status</th><th>Rotation</th><th>AC contactor</th><th>DC switches 1 / 2 / 3</th><th>Insulation</th><th>Max IGBT</th></tr></thead><tbody>{units.map(p=><tr key={p.id}><th>Array {p.array}<span className="row-meta">PCS {p.number}</span></th><td><Reading reading={p.status}/></td><td><Reading reading={p.rotation}/></td><td><Reading reading={p.acContactor}/></td><td><div className="dc-readings">{(['dc1','dc2','dc3'] as const).map((key,i)=><div key={key}><span className="row-meta">DC {i+1}</span><Reading reading={p[key]}/></div>)}</div></td><td><Reading reading={p.insulationKohm} unit="kΩ"/></td><td><Reading reading={p.maxIgbtF} unit="°F"/></td></tr>)}</tbody></table></div>}
  </div>;
}
function Finding({finding,array,onlyUnmapped=false}:{finding:FleetFinding;array:number|null;onlyUnmapped?:boolean}){
  const [open,setOpen]=useState(false);
  const rows=(finding.consolidatedTargets??finding.targetRows)?.filter(t=>(array===null || t.array===array)&&(!onlyUnmapped||!('isBpc' in t)||!t.isBpc));
  const shown=rows?.length ?? finding.targets.length,missing=finding.targetCount-(finding.targetRows?.length ?? finding.targets.length);
  const bpcs=finding.bpcCounts?.[array??'all']??0;
  return <div className={'finding-disclosure '+(open?'expanded':'')}>
    <button className="finding-toggle" aria-expanded={open} onClick={()=>setOpen(!open)}>
      <span className="disclosure-chevron" aria-hidden="true">{open?'▾':'▸'}</span><span className={'severity '+finding.severity}>{finding.severity}</span><span className="finding-code">{finding.code || 'No code'}</span><strong>{finding.title}</strong><span className="finding-count">{!onlyUnmapped&&bpcs>0?`${missing>0?'At least ':''}${bpcs} unique ${bpcs===1?'BPC':'BPCs'} · `:''}{finding.consolidatedTargets?`${shown} listed ${shown===1?'row':'rows'}`:`${array===null?finding.targetCount:shown} targets`}</span>
    </button>
    {open && <div className="finding-body"><div className="table-wrap"><table className="target-table"><thead><tr><th>Array</th><th>Segment / String / PCS</th><th>BPC</th><th>Cell group</th><th>Reported target</th></tr></thead><tbody>
      {rows?rows.map(t=><tr key={t.id}><td>{t.array ?? '—'}</td><td>{[t.segment!==null?`Segment ${t.segment}`:'',t.string!==null?`String ${t.string}`:'',t.pcs!==null?`PCS ${t.pcs}`:''].filter(Boolean).join(' · ') || '—'}</td><td>{t.bpc ?? '—'}</td><td>{'cells' in t?String(t.cells):t.cell ?? '—'}</td><td>{t.label}{'reportedTargets' in t && <span className="row-meta">{String(t.reportedTargets)} reported targets</span>}</td></tr>):finding.targets.map((label,i)=><tr key={i}><td colSpan={5}>{label}</td></tr>)}
    </tbody></table></div>{missing>0 && <p className="source-note">Partial target list: {missing} additional targets were not supplied by this collector. Open the site’s full notification review for the remainder.</p>}{shown===0 && <p className="empty-state">No target detail supplied for this selection.</p>}</div>}
  </div>;
}
export function FleetIssues({issues,array}:{issues:FleetDetails['issues'];array:number|null}){
  const [category,setCategory]=useState<IssueCategory|null>(null);
  const [mode,setMode]=useState<'bpc'|'code'>('bpc');
  const byBpc=mode==='bpc'&&!!issues.bpcReview;
  const findings=issues.findings.filter(f=>(category===null || f.category===category) && (array===null || f.targetRows?.some(t=>t.array===array)));
  const sections=[{name:'Equipment issues',availability:false},{name:'Contactors / Rotation',availability:true}];
  return <div className="panel-section issues-section"><div className="subheading"><div><h3>Issues & availability{array?` · Array ${array}`:''}</h3><p>Review equipment by BPC or code. Site category totals below count reported targets, not unique BPCs; categories overlap.</p></div><span className={'quality-tag '+issues.quality}>{issues.quality==='live'?'Current':issues.quality==='stale'?'Last known':'Unknown'} · {issues.observedAt?new Date(issues.observedAt).toLocaleTimeString():'Not reported'}</span></div>
    <div className="issue-categories">{(Object.keys(issueCategories) as IssueCategory[]).map(key=>{const c=issues.categories[key];return <button key={key} aria-pressed={category===key} className={category===key?'selected':''} onClick={()=>setCategory(category===key?null:key)}><span>{issueCategories[key]}</span><strong>{c.targets ?? '—'} <small>site targets</small></strong><span className="issue-breakdown"><span className={c.alarms?'alarm-text':''}>{c.alarms ?? '—'} alarm</span><span className={c.warnings?'warning-text':''}>{c.warnings ?? '—'} warning</span></span><span className="row-meta">{c.info ?? '—'} info · {c.unknown ?? '—'} unclassified</span></button>;})}</div>
    {category && <p><button className="text-button" onClick={()=>setCategory(null)}>Show all categories</button></p>}
    {sections.map(section=>{const groups=findings.filter(f=>(f.category==='availability')===section.availability);const bpcMode=byBpc&&!section.availability;const listed=bpcMode?groups.filter(f=>!f.consolidatedTargets||f.consolidatedTargets.some(t=>!t.isBpc&&(array===null||t.array===array))||f.targetCount>(f.targetRows?.length??0)):groups;return <details className="issue-section-disclosure" key={section.name} open><summary>{section.name}<span>{groups.length} code groups</span></summary>
      {!section.availability&&issues.bpcReview&&<div className="bpc-view-controls" role="group" aria-label="Equipment issue grouping"><button aria-pressed={byBpc} onClick={()=>setMode('bpc')}>By BPC</button><button aria-pressed={!byBpc} onClick={()=>setMode('code')}>By code</button></div>}
      {bpcMode&&<BpcIssuesTable review={issues.bpcReview!} array={array} category={category}/>}
      {issues.hvacReview&&!!listed.filter(f=>f.category==='hvac').length&&<HvacIssueDisclosure review={issues.hvacReview} array={array}>{listed.filter(f=>f.category==='hvac').map(f=><HvacFaultRow key={[f.category,f.severity,f.code,f.title].join(':')} finding={f} array={array}/>)}</HvacIssueDisclosure>}
      {bpcMode&&listed.length>0&&<h4 className="unmapped-heading">Other equipment / unresolved BPC targets</h4>}
      {listed.length?listed.filter(f=>!issues.hvacReview||f.category!=='hvac').map(f=><Finding key={[f.category,f.severity,f.code,f.title].join(':')} finding={f} array={array} onlyUnmapped={bpcMode}/>):!bpcMode&&<p className="empty-state">{issues.quality==='unknown'?'Detailed issue coverage is unavailable from this collector.':'No notification groups reported for this selection.'}</p>}
    </details>;})}
    {array!==null && issues.findings.some(f=>!f.targetRows || f.targetCount>f.targetRows.length || f.targetRows.some(t=>t.array===null)) && <p className="source-note">Some targets lack array mapping or complete detail. Select the station to review the unfiltered site list.</p>}
    {issues.notes.map((note,i)=><p className="source-note" key={i}>{note}</p>)}{issues.omittedGroups>0 && <p className="source-note">{issues.omittedGroups} additional code groups were not supplied.</p>}
  </div>;
}
