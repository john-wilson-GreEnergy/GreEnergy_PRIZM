import React,{useEffect,useMemo,useRef,useState} from 'react';
import type {NotificationGroup,NotificationReview} from '../server/notifications/notificationReview';
import {correctiveDisplayCategory} from '../core/correctiveGuidance';
import {correctivePacket,type CorrectivePacket} from '../lib/correctivePacket';
import {exportTargetChoices,exportTargetKeys,exportSelectionState,setExportTargets} from '../lib/correctiveSelection';

export interface CorrectiveExportDraft {review:NotificationReview;groups:NotificationGroup[];array:string;query:string;site:string;stale:boolean;filters:Record<string,string>}
function SelectionBox({label,keys,selected,onChange}:{label:string;keys:string[];selected:ReadonlySet<string>;onChange:(keys:string[],checked:boolean)=>void}){
  const input=useRef<HTMLInputElement>(null),state=exportSelectionState(keys,selected);
  useEffect(()=>{if(input.current)input.current.indeterminate=state.mixed;},[state.mixed]);
  return <input ref={input} type="checkbox" aria-label={label} aria-checked={state.mixed?'mixed':state.checked} checked={state.checked} onChange={e=>onChange(keys,e.target.checked)}/>;
}
export function CorrectiveExportSelection({draft,format,onClose,onExport}:{draft:CorrectiveExportDraft;format:string;onClose:()=>void;onExport:(packet:CorrectivePacket)=>Promise<void>}){
  const dialog=useRef<HTMLDialogElement>(null);
  const scoped=useMemo(()=>correctivePacket(draft.review,draft.groups,draft.array,draft.query,draft.site,draft.stale,draft.filters).selected,[draft]);
  const keys=useMemo(()=>exportTargetKeys(scoped),[scoped]);
  const [selected,setSelected]=useState(()=>new Set(keys)),[inventory,setInventory]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const categories=[...new Set(scoped.map(correctiveDisplayCategory))];
  const packet=useMemo(()=>correctivePacket(draft.review,draft.groups,draft.array,draft.query,draft.site,draft.stale,draft.filters,{keys:selected,includeSiteInventory:inventory}),[draft,selected,inventory]);
  useEffect(()=>{dialog.current?.showModal();},[]);
  const toggle=(keys:string[],checked:boolean)=>setSelected(current=>setExportTargets(current,keys,checked));
  const download=async()=>{setBusy(true);setError('');try{await onExport(packet);}catch(e){setError(e instanceof Error?e.message:'Unable to export this selection');}finally{setBusy(false);}};
  return <dialog ref={dialog} className="ca-guidance-dialog ca-export-dialog" aria-labelledby="ca-export-title" onCancel={e=>{if(busy)e.preventDefault();else onClose();}}>
    <header><div><small>EXPORT ONLY · LIVE FAULTS REMAIN UNCHANGED</small><h2 id="ca-export-title">Choose export targets</h2><p>{draft.site}</p></div><button onClick={onClose} disabled={busy}>Close</button></header>
    <p className="ca-export-help">Uncheck a category to leave out contactors, HVAC or other issues. Expand a category to choose faults, then expand a fault to choose equipment. Each BPC checkbox includes all its reported cell targets for that fault.</p>
    <p className="ca-export-help">Snapshot held at {new Date(draft.review.capturedAt).toLocaleString()}. Your current page filters apply. Close and reopen to use a newer snapshot.</p>
    <div className="ca-selection-tools"><button disabled={busy} onClick={()=>setSelected(new Set(keys))}>Select all</button><button disabled={busy} onClick={()=>setSelected(new Set())}>Clear selection</button><button disabled={busy} onClick={()=>setSelected(new Set(exportTargetKeys(scoped.filter(g=>g.code==='2073'||g.code==='2074'))))}>Balancing faults only</button></div>
    <fieldset disabled={busy} className="ca-export-tree"><legend className="sr-only">Fault and target selection</legend>{categories.map(category=>{
      const groups=scoped.filter(g=>correctiveDisplayCategory(g)===category),categoryKeys=exportTargetKeys(groups),count=exportSelectionState(categoryKeys,selected).count;
      return <div className="ca-export-category" key={category}><SelectionBox label={`Include category: ${category}`} keys={categoryKeys} selected={selected} onChange={toggle}/><details><summary>{category}<small>{count} / {categoryKeys.length} reported targets selected</small></summary>
        {groups.map(group=>{const groupKeys=exportTargetKeys([group]),count=exportSelectionState(groupKeys,selected).count;return <div key={group.id} className="ca-export-fault"><SelectionBox label={`Include fault: ${group.code} ${group.title} (${group.severity})`} keys={groupKeys} selected={selected} onChange={toggle}/><details><summary><span className="ca-export-severity">{group.severity}</span> {group.code} · {group.title}<small>{count} / {groupKeys.length} reported targets selected</small></summary>
          <div className="ca-export-targets">{exportTargetChoices(group,draft.review).map(choice=><label key={choice.id} className="ca-export-target"><SelectionBox label={`Include target: ${choice.label} for ${group.code} (${group.severity})`} keys={choice.keys} selected={selected} onChange={toggle}/><span>{choice.label}{choice.keys.length>1&&<small>Includes all {choice.keys.length} reported cell / scope targets for this BPC.</small>}</span></label>)}</div>
        </details></div>;})}
      </details></div>;
    })}</fieldset>
    <label className="ca-export-inventory"><input type="checkbox" checked={inventory} disabled={busy} onChange={e=>setInventory(e.target.checked)}/><span>Also include entire-site balancing quantities<small>Optional reference only; includes BPCs outside this selected worklist. Off by default.</small></span></label>
    <footer className="ca-export-footer"><div role="status"><strong>{packet.selected.length} fault groups · {packet.targets.length} reported targets</strong><small>{packet.bpcs?.length??'Unknown'} unique mapped BPCs selected{packet.partialBpcs?' · incomplete coverage':''}. Not a complete site fault list.</small></div><button disabled={busy||packet.targets.length===0} onClick={()=>void download()}>{busy?'Preparing…':`Download ${format.toUpperCase()}`}</button></footer>
    {error&&<p role="alert" className="ca-export-error">{error}</p>}
  </dialog>;
}
