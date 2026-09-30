import React, {useState} from 'react';
import type {NotificationReview, NotificationGroup, NotificationTarget} from '../server/notifications/notificationReview';
import type {NotificationTableRow} from '../server/notifications/notificationTargetTable';
import {NotificationTroubleshootingPanel} from './NotificationTroubleshootingPanel';

const severityStyle: Record<string,string> = {critical:'bg-red-100 text-red-900',alarm:'bg-red-100 text-red-800',warning:'bg-amber-100 text-amber-900',info:'bg-sky-100 text-sky-900',unknown:'bg-slate-200 text-slate-800'};
export function NotificationTargetDetail({target}: {target:NotificationTarget}) {
  return <details className="border border-slate-200 rounded-lg bg-white">
    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900 break-words">{target.label}<span className="block ml-4 mt-1 text-xs font-normal text-slate-500">{target.source.join(' · ')}</span></summary>
    <div className="px-4 pb-4 space-y-4">{target.observations.map((observation,index)=><div key={index} className="border-t border-slate-100 pt-3">
      <p className="text-sm text-slate-800">{observation.condition || observation.title}</p>
      <p className="text-xs text-slate-500 mt-1">Observation timestamp: {observation.at ? new Date(observation.at).toLocaleString() : 'Not supplied by source'}</p>
      {observation.evidence.length > 0 && <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 my-3">{observation.evidence.map(field=><div key={field.label} className="bg-slate-50 rounded p-2"><dt className="text-xs text-slate-500">{field.label}</dt><dd className="text-sm font-semibold text-slate-900 break-words">{field.value}</dd></div>)}</dl>}
      {observation.guidance.length > 0 && <div className="text-sm text-slate-700 mt-3"><h5 className="font-semibold">Inspection guidance</h5><ul className="list-disc pl-5 mt-1 space-y-1">{observation.guidance.map(step=><li key={step}>{step}</li>)}</ul></div>}
    </div>)}</div>
  </details>;
}
export function CompactNotificationTargetsTable({rows,title,showMetrics=true,showGuidance=true}: {rows:NotificationTableRow[];title:string;showMetrics?:boolean;showGuidance?:boolean}) {
  const [allPacks,setAllPacks]=useState(false);
  const comparePacks=showMetrics&&rows.some(row=>row.bpcOutliers);
  // Presentation-only column alignment. Values and scope are prepared by the server.
  const fieldKey=(field:{label:string;unit:string})=>`${field.label}|${field.unit}`;
  const columns=[...new Map(rows.flatMap(row=>showMetrics&&!comparePacks?(row.metrics?.fields??[]):[]).map(field=>[fieldKey(field),field])).values()];
  const hasValues=columns.length>0||comparePacks;
  const sources=[...new Set(rows.flatMap(row=>row.source))];
  const metricSources=[...new Set(rows.flatMap(row=>showMetrics&&row.metrics?[row.metrics.source]:[]))];
  const shortTime=(value:string)=>new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
  return <table aria-label={`${title} affected targets`} className="w-full table-fixed text-left text-xs leading-snug border-collapse">
    <caption className="text-left text-[11px] text-slate-500 py-1">
      {sources.length===1&&<span>Notifications: {sources[0]}. </span>}
      {!!columns.length&&<span>String context{metricSources.length===1?` · ${metricSources[0]}`:''}. </span>}
      {comparePacks&&<div className="text-slate-700">Calculated BPC outliers · {allPacks?'All BPCs':'Three largest deviations per string'} · Pack voltage = sum of cell-group voltages. Peer average excludes that BPC.
        <p>Diagnostic context, not controller-confirmed faulted BPCs. The controller’s exact trip formula and threshold are unverified.</p>
        <button type="button" className="my-1 font-semibold text-emerald-800 underline" onClick={()=>setAllPacks(value=>!value)}>{allPacks?'Show largest 3 only':'Show all BPC comparisons'}</button>
      </div>}
    </caption>
    <thead className="bg-slate-100 text-slate-600"><tr>
      <th scope="col" className={`px-2 py-1.5 ${hasValues?'w-[22%]':'w-[30%]'}`}>Array / Segment / String</th>
      <th scope="col" className={`px-2 py-1.5 ${hasValues?'w-[20%]':'w-[30%]'}`}>BPC / Cell groups{comparePacks&&<span className="block font-normal">Controller reported</span>}</th>
      {comparePacks&&['Calculated BPC','Pack V','Other BPCs avg V','Deviation V'].map(label=><th key={label} scope="col" className="px-1 py-1.5 text-right font-medium break-words">{label}</th>)}
      {columns.map(field=><th key={fieldKey(field)} scope="col" className="px-1 py-1.5 text-right font-medium break-words">{field.label}<span className="block text-[10px] font-normal">{field.unit}</span></th>)}
      <th scope="col" className={`px-2 py-1.5 ${hasValues?'w-[24%]':''}`}>Observations / freshness</th>
    </tr></thead>
    <tbody className="divide-y divide-slate-200">{rows.map(row=><tr key={row.id} className="align-top even:bg-slate-50">
      <th scope="row" className="px-2 py-1.5 font-semibold text-slate-900 break-words">{row.label}
        {row.context.map(context=><span key={context} className="block text-[11px] font-normal text-slate-500">{context}</span>)}
        {comparePacks&&row.metrics&&<span className="block text-[10px] font-normal text-slate-500">{row.metrics.fields.map(field=>`${field.label}: ${field.value==null?'—':field.value.toLocaleString(undefined,{maximumFractionDigits:3})} ${field.unit}`).join(' · ')}</span>}
        {sources.length!==1&&<span className="block text-[11px] font-normal text-slate-500">{row.source.join(' · ')}</span>}
      </th>
      <td className="px-2 py-1.5 text-slate-700 break-words">{row.scope.length?row.scope.map(scope=><div key={scope}>{scope}</div>):<span className="text-slate-500">Not supplied</span>}</td>
      {comparePacks&&(['bpc','voltageV','peerAverageV','deviationV'] as const).map(field=><td key={field} className="px-1 py-1.5 text-right tabular-nums text-slate-900">
        {row.bpcOutliers?.ranked.length?row.bpcOutliers.ranked.slice(0,allPacks?undefined:3).map(pack=><div key={pack.bpc} className="leading-5 whitespace-nowrap">{field==='bpc'?`BPC ${pack.bpc}`:`${field==='deviationV'&&pack[field]>0?'+':''}${pack[field].toFixed(3)}`}</div>):<span aria-label="BPC comparison unavailable">—</span>}
      </td>)}
      {columns.map(column=>{
        const field=row.metrics?.fields.find(field=>fieldKey(field)===fieldKey(column));
        return <td key={fieldKey(column)} className="px-1 py-1.5 text-right font-semibold tabular-nums text-slate-900" title={field?.value==null?'Reading unavailable':`${field.label}: ${field.value} ${field.unit}`}>
          {field?.value==null?<span className="font-normal text-slate-500" aria-label={`${column.label} unavailable`}>—</span>:field.value.toLocaleString(undefined,{maximumFractionDigits:3})}
        </td>;
      })}
      <td className="px-2 py-1.5 text-[11px] text-slate-600 break-words">
        {comparePacks&&row.bpcOutliers&&<p className={row.bpcOutliers.quality==='available'?'text-slate-500':'font-semibold text-amber-800'}>BPC comparison · {row.bpcOutliers.quality} · {row.bpcOutliers.observedAt?shortTime(row.bpcOutliers.observedAt):'time unavailable'} · {row.bpcOutliers.reason} · {row.bpcOutliers.source}</p>}
        {showMetrics&&row.metrics&&<p className={row.metrics.quality==='available'?'text-slate-500':'font-semibold text-amber-800'}>
          Telemetry {row.metrics.at?shortTime(row.metrics.at):'time unavailable'} · {row.metrics.quality}
          {metricSources.length!==1&&<span> · {row.metrics.source}</span>}
        </p>}
        {row.observations.map((o,index)=><div key={index} className={index?'mt-1 border-t border-slate-100 pt-1':''}>
          {row.observations.length>1&&<p className="font-medium text-slate-700">{o.scope.join('; ')}</p>}
          {o.condition&&<p>{o.condition}</p>}
          {o.evidence.map(field=><span key={field.label} className="inline-block mr-2"><span className="text-slate-500">{field.label}: </span><span className="text-slate-800">{field.value}</span></span>)}
          {showGuidance&&o.guidance.map(step=><p key={step}>{step}</p>)}
          <p className="text-slate-500">Observed {o.times.length?`${shortTime(o.times[0])}${o.times.length>1?` – ${shortTime(o.times[o.times.length-1])} (${o.times.length} timestamps)`:''}`:'time not supplied'}{o.missingTime&&o.times.length>0?' · Some times unavailable':''}</p>
        </div>)}
      </td>
    </tr>)}</tbody>
  </table>;
}
export function NotificationTargetsTable({rows,title,showMetrics=true,compact=true,showGuidance=true}: {rows:NotificationTableRow[];title:string;showMetrics?:boolean;compact?:boolean;showGuidance?:boolean}) {
  if(compact) return <CompactNotificationTargetsTable rows={rows} title={title} showMetrics={showMetrics} showGuidance={showGuidance}/>;
  return <table aria-label={`${title} affected targets`} className="w-full table-fixed text-left text-xs border-collapse">
    <thead className="bg-slate-100 text-slate-600"><tr><th scope="col" className="p-2 w-1/4">Target / source</th><th scope="col" className="p-2 w-1/4">Affected BPCs / cells</th><th scope="col" className="p-2 w-1/2">Observed details</th></tr></thead>
    <tbody className="divide-y divide-slate-200">{rows.map(row=><tr key={row.id} className="align-top even:bg-slate-50">
      <th scope="row" className="p-2 font-semibold text-slate-900 break-words">{row.label}{row.context.map(context=><span key={context} className="block text-[11px] font-normal text-slate-600 mt-1">{context}</span>)}<span className="block text-[11px] font-normal text-slate-500 mt-1">{row.source.join(' · ')}</span></th>
      <td className="p-2 text-slate-700 break-words">{row.scope.map(scope=><div key={scope}>{scope}</div>)}</td>
      <td className="p-2 text-slate-700 break-words space-y-2">
      {showMetrics && row.metrics && <div className="rounded border border-slate-200 bg-white p-2">
        <p className="font-semibold text-slate-700">{row.metrics.scope} <span className={`font-normal ${row.metrics.quality==='available'?'text-slate-500':'text-amber-800'}`}>· {row.metrics.quality}</span></p>
        <dl className="grid grid-cols-2 xl:grid-cols-4 gap-2 mt-2">{row.metrics.fields.map(field=><div key={field.label}><dt className="text-[11px] text-slate-500">{field.label}</dt><dd className="font-semibold tabular-nums text-slate-900">{field.value==null?'Unavailable':`${field.value.toLocaleString(undefined,{maximumFractionDigits:3})} ${field.unit}`}</dd></div>)}</dl>
        <p className="text-[10px] text-slate-500 mt-2">Telemetry: {row.metrics.at?new Date(row.metrics.at).toLocaleString():'Time unavailable'} · {row.metrics.source}</p>
      </div>}
      {row.observations.map((o,index)=><div key={index}>
        {row.observations.length>1 && <p className="font-medium">{o.scope.join('; ')}</p>}
        {o.condition && <p>{o.condition}</p>}
        {o.evidence.map(field=><p key={field.label}><span className="text-slate-500">{field.label}: </span>{field.value}</p>)}
        {showGuidance&&o.guidance.map(step=><p key={step}>{step}</p>)}
        <p className="text-[11px] text-slate-500">Observation {o.times.length>1?'range':'time'}: {o.times.length?`${new Date(o.times[0]).toLocaleString()}${o.times.length>1?` – ${new Date(o.times[o.times.length-1]).toLocaleString()} (${o.times.length} timestamps)`:''}`:'Not supplied'}{o.missingTime&&o.times.length>0?' · Some source times unavailable':''}</p>
      </div>)}</td>
    </tr>)}</tbody>
  </table>;
}
export function NotificationGroupRow({group,array,targetLayout='table',showMetrics=true,compact=true,onEditGuidance}: {group:NotificationGroup;array:string;targetLayout?:'table'|'details';showMetrics?:boolean;compact?:boolean;onEditGuidance?:(entryId:string|null)=>void}) {
  const targets=group.targets.filter(target=>array==='all'||String(target.array)===array);
  const rows=group.tableRows?.filter(row=>array==='all'||String(row.array)===array);
  return <details className="group border border-slate-200 rounded-lg bg-white overflow-hidden">
    <summary className="cursor-pointer px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 hover:bg-slate-50 focus-visible:outline-emerald-600">
      <span className="text-slate-500 group-open:rotate-90 transition-transform" aria-hidden="true">▸</span>
      <span className={`rounded px-2 py-1 text-xs font-bold uppercase ${severityStyle[group.severity]}`}>{group.severity}</span>
      <span className="flex-1 min-w-[180px]"><span className="block text-sm font-semibold text-slate-900">{group.title}</span><span className="block text-xs text-slate-500 mt-1 break-all">{group.category}{group.code ? ` · ${group.code}` : ' · No code supplied'}</span></span>
      <span className="text-right text-sm font-semibold text-slate-900">{group.targetCount} affected {group.targetCount===1?'target':'targets'}{group.tableRows && <span className="block text-xs font-normal text-slate-500">{group.tableRows.length} consolidated {group.tableRows.length===1?'row':'rows'}</span>}<span className="block text-xs font-normal text-slate-500 mt-1">{group.arrays.length ? group.arrays.map(a=>`Array ${a}`).join(' · ') : 'Location not supplied'}</span></span>
      {group.explanation && <span className="basis-full text-xs text-slate-600 pl-6">{group.explanation}</span>}
    </summary>
    <div className="px-2 pb-2 border-t border-slate-100">
      <NotificationTroubleshootingPanel group={group} array={array} onEditGuidance={onEditGuidance}/>
      <p className="text-[11px] text-slate-500 pt-1.5">{array==='all'?'All affected targets':`Showing Array ${array} targets; group total includes all arrays`}. One row per string; fault counts unchanged.</p>
      {showMetrics && rows?.some(row=>row.metrics) && <p className="text-[11px] text-slate-600 py-1">Current string context, not values captured when the notification triggered; not the individual affected BPC or cell. Normal readings do not clear a retained alarm. — = unavailable.</p>}
      {targetLayout==='details'?<div className="space-y-2">{targets.map(target=><NotificationTargetDetail key={target.id} target={target}/>)}</div>:
        rows?<NotificationTargetsTable rows={rows} title={group.title} showMetrics={showMetrics} compact={compact} showGuidance={!group.troubleshooting}/>:<p className="text-sm text-slate-600">Waiting for the prepared target table. {targets.length} targets retained.</p>}
      {!group.troubleshooting&&targetLayout==='table'&&!!group.commonGuidance?.length&&<div className="mt-2 text-xs text-slate-700">{group.commonGuidance.map(step=><p key={step}>{step}</p>)}</div>}
    </div>
  </details>;
}
export default function NotificationReviewPanel({review,stale=false,onEditGuidance}: {review?:NotificationReview;stale?:boolean;onEditGuidance?:(entryId:string|null)=>void}) {
  const [query,setQuery]=useState('');
  const [severity,setSeverity]=useState('all');
  const [array,setArray]=useState('all');
  const [category,setCategory]=useState('all');
  const [compact]=useState(()=>typeof window==='undefined'||new URLSearchParams(window.location.search).get('notificationDensity')!=='comfortable');
  const [showMetrics]=useState(()=>typeof window==='undefined'||new URLSearchParams(window.location.search).get('notificationMetrics')!=='off');
  const [targetLayout]=useState<'table'|'details'>(()=>typeof window!=='undefined' && new URLSearchParams(window.location.search).get('notificationTargets')==='details'?'details':'table');
  if (!review) return <section className="rounded-xl border border-slate-200 bg-white p-5 text-slate-700"><h3 className="font-bold">Notifications & corrective actions</h3><p className="text-sm mt-2">Waiting for the prepared notification snapshot. An empty view does not mean the site is clear.</p></section>;
  const arrays=[...new Set(review.groups.flatMap(group=>group.arrays))].sort((a,b)=>a-b);
  const categories=[...new Set(review.groups.map(group=>group.category))];
  const filtered=review.groups.filter(group=>(severity==='all'||group.severity===severity)&&(category==='all'||group.category===category)&&(array==='all'||group.arrays.includes(Number(array)))&&[group.title,group.code,...group.targets.map(target=>target.label)].join(' ').toLowerCase().includes(query.toLowerCase().trim()));
  const selectClass='rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800';
  return <section aria-label="Notifications and corrective actions" className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
    <header className="p-5 bg-white border-b border-slate-200"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="text-lg font-bold text-slate-900">Notifications & corrective actions</h3><p className="text-sm text-slate-500 mt-1">One row per issue type and severity. Every affected target remains available.</p></div><span className={`text-xs self-start rounded px-2 py-1 ${stale?'bg-amber-100 text-amber-900':'bg-slate-100 text-slate-600'}`}>{stale?'Retained snapshot · verify freshness':'Prepared snapshot'} · {new Date(review.capturedAt).toLocaleTimeString()}</span></div>
    <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">{[['Issue groups',review.totals.groups],['Unique targets',review.totals.targets],['Alarm / critical occurrences',review.totals.alarm],['Warning occurrences',review.totals.warning]].map(([label,value])=><div key={label} className="rounded-lg border border-slate-200 px-3 py-2"><dt className="text-xs text-slate-500">{label}</dt><dd className="text-xl font-semibold text-slate-900 tabular-nums">{value}</dd></div>)}</dl><p className="text-xs text-slate-500 mt-2">A target can have several issue types. Counts above cover the complete snapshot, not just the current filters. Unknown severity occurrences: {review.totals.unknown}.</p></header>
    {!!review.sourceWarnings?.length && <div role="status" className="mx-4 mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{review.sourceWarnings.map(warning=><p key={warning}>{warning}</p>)}</div>}
    <div className="p-4 flex flex-wrap gap-3 items-end"><label className="flex-1 min-w-[180px] text-xs text-slate-600">Find an issue or target<input aria-label="Find notification" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Code, Array, String, HVAC, IP…" className={`${selectClass} block w-full mt-1`}/></label>
      <label className="text-xs text-slate-600">Severity<select aria-label="Notification severity" value={severity} onChange={event=>setSeverity(event.target.value)} className={`${selectClass} block mt-1`}>{['all','critical','alarm','warning','info','unknown'].map(value=><option key={value} value={value}>{value==='all'?'All severities':value}</option>)}</select></label>
      <label className="text-xs text-slate-600">Equipment<select aria-label="Notification equipment" value={category} onChange={event=>setCategory(event.target.value)} className={`${selectClass} block mt-1`}><option value="all">All equipment</option>{categories.map(value=><option key={value}>{value}</option>)}</select></label>
      <label className="text-xs text-slate-600">Array<select aria-label="Notification array" value={array} onChange={event=>setArray(event.target.value)} className={`${selectClass} block mt-1`}><option value="all">All arrays</option>{arrays.map(value=><option key={value} value={value}>Array {value}</option>)}</select></label>
      <button type="button" onClick={()=>{setQuery('');setSeverity('all');setCategory('all');setArray('all');}} className="px-3 py-2 text-sm font-semibold text-emerald-800">Reset filters</button>
    </div>
    <div className="px-2 pb-2 space-y-3"><p className="text-xs text-slate-600 pb-1">Showing {filtered.length} of {review.totals.groups} issue groups · highest severity first within each section</p>
      {([
        ['equipment','Battery & equipment issues','Voltage, temperature, balancing, HVAC and other equipment notifications.'],
        ['availability','Contactors & rotation','String and PCS connection / rotation conditions. Alarm severity is retained; an operating state is not automatically a fault.']
      ] as const).map(([section,title,description])=>{
        const groups=filtered.filter(group=>(group.section ?? 'equipment')===section);
        return <section key={section} aria-label={title} className="rounded-lg border border-slate-200 bg-white">
          <header className={`px-3 py-2 border-b border-slate-200 ${section==='availability'?'bg-sky-50':'bg-slate-100'}`}><div className="flex flex-wrap justify-between gap-2"><h4 className="font-bold text-slate-900">{title}</h4><span className="text-xs text-slate-600">{groups.length} matching {groups.length===1?'group':'groups'}</span></div><p className="text-xs text-slate-600">{description}</p></header>
          <div className="space-y-1 p-1">{groups.map(group=><NotificationGroupRow key={group.id} group={group} array={array} targetLayout={targetLayout} showMetrics={showMetrics} compact={compact} onEditGuidance={onEditGuidance}/>)}{!groups.length&&<p className="p-3 text-sm text-slate-600">No notifications in this section match the current snapshot and filters.</p>}</div>
        </section>;
      })}
      {!filtered.length&&<p className="p-5 rounded-lg bg-white text-sm text-slate-600">{review.groups.length?'No notifications match these filters.':'No findings in this snapshot. Check source health before treating this as an all-clear.'}</p>}</div>
    <details className="px-5 pb-4 text-xs text-slate-500"><summary className="cursor-pointer">Source & count definitions</summary><p className="mt-2">Unique targets retain cell-group and HVAC-unit granularity. An occurrence is one issue type and severity on one target; it is not a new event on every poll.</p>{review.sourceNotes?.map(note=><p key={note} className="mt-2">{note}</p>)}<a className="inline-block mt-3 underline text-emerald-800" href="?tab=overview&notificationView=legacy">Previous view / existing PDF exports</a><p className="mt-1">The previous view uses legacy grouping; its displayed totals may differ.</p></details>
  </section>;
}
