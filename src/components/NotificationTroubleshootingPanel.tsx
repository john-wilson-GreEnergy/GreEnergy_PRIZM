import React from 'react';
import type {NotificationGroup} from '../server/notifications/notificationReview';
import type {GuidanceItem} from '../server/notifications/notificationTroubleshooting';

export function NotificationTroubleshootingPanel({group,array,onEditGuidance}: {
  group:NotificationGroup;array:string;onEditGuidance?:(entryId:string|null)=>void;
}) {
  const targets=group.targets.filter(t=>array==='all'||String(t.array)===array);
  const ids=new Set(targets.map(t=>t.id));
  const guidance=group.troubleshooting;
  const visible=(items:GuidanceItem[]=[])=>items.filter(item=>item.targetIds.some(id=>ids.has(id)));
  const items=(values:GuidanceItem[],empty:string)=><ul className="list-disc pl-4 space-y-1">
    {values.map((item,index)=>{
      const affected=targets.filter(t=>item.targetIds.includes(t.id));
      const labels=[...new Set(affected.map(t=>t.label))];
      return <li key={index}>{item.advisory&&<span className="font-semibold text-amber-800">General fallback: </span>}{item.text}
        {affected.length<targets.length&&<span className="block text-[11px] text-slate-500">Applies to: {labels.join('; ')}</span>}
      </li>;
    })}
    {!values.length&&<li className="list-none -ml-4 text-slate-500">{empty}</li>}
  </ul>;
  const safety=visible(guidance?.safety),field=visible(guidance?.field);
  const sources=(guidance?.sources??[]).filter(source=>source.targetIds.some(id=>ids.has(id)));
  return <section aria-label={`${group.title} troubleshooting`} className="my-2 rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
    <header className="flex flex-wrap justify-between gap-2 mb-2"><h5 className="font-bold text-slate-900">Troubleshooting & resolution</h5>
      {onEditGuidance&&<button type="button" onClick={()=>onEditGuidance(sources.length===1?sources[0].entryId:null)} className="text-emerald-800 underline font-semibold">Edit Guidance</button>}
    </header>
    {!!safety.length&&<div className="mb-2 rounded border border-amber-200 bg-amber-50 p-2"><h6 className="font-semibold text-amber-900 mb-1">Safety / prerequisites</h6>{items(safety,'')}</div>}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div><h6 className="font-semibold text-emerald-800 mb-1">Recommended Actions</h6>{items(visible(guidance?.actions),guidance?'No recommended steps supplied.': 'Detailed guidance is not available in this snapshot.')}</div>
      <div><h6 className="font-semibold text-slate-800 mb-1">Validation Checks</h6>{items(visible(guidance?.validation),'No fault-specific validation checks supplied.')}</div>
      <div><h6 className="font-semibold text-sky-800 mb-1">Clearing Criteria / required state</h6>
        {items(visible(guidance?.clearing),'No curated clearing criteria supplied.')}
        {group.documentedClearing&&<p className="mt-2"><span className="font-semibold">Documented clearing behavior: </span>{group.documentedClearing}</p>}
        <p className="mt-2 text-[11px] text-slate-500">Reference only — not confirmation that the condition has cleared or authorization to reset equipment. Generic fallback criteria are not verified fault-specific clearing conditions.</p>
      </div>
    </div>
    {!!field.length&&<div className="mt-2 border-t border-slate-200 pt-2"><h6 className="font-semibold mb-1">Technician guidance / escalation</h6>{items(field,'')}</div>}
    <footer className="mt-2 border-t border-slate-200 pt-2 text-[11px] text-slate-500">
      {sources.map((source,index)=><p key={index}>Resolution source: {source.label}{source.advisory?' · Generic advisory; no matched troubleshooting entry':''}</p>)}
      {group.catalogSource&&<p>{group.catalogSource.document} · manual page {group.catalogSource.page}</p>}
      {group.sourceNotes?.map(note=><p key={note} className="mt-1 text-amber-800">{note}</p>)}
    </footer>
  </section>;
}
