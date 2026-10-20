import React,{createContext,useContext,useEffect,useRef,useState} from 'react';
import type {NotificationGroup} from '../server/notifications/notificationReview';
import {correctiveGuidanceKey,correctiveDisplayCategory as correctiveCategory} from '../core/correctiveGuidance';

const EditorContext=createContext<((g:NotificationGroup)=>void)|undefined>(undefined);
export const useCorrectiveEditor=()=>useContext(EditorContext);
type Metadata={canEdit:boolean;revision:number;localDraft?:boolean};
export function CorrectiveGuidanceBoundary({children,revision=0}:{children:React.ReactNode;revision?:number}){
  const [metadata,setMetadata]=useState<Metadata|null>(null),[group,setGroup]=useState<NotificationGroup|null>(null);
  const [saved,setSaved]=useState(false);
  useEffect(()=>{const controller=new AbortController();fetch('/api/local/corrective-guidance',{signal:controller.signal}).then(async r=>{if(r.ok)setMetadata(await r.json());}).catch(()=>{});return()=>controller.abort();},[]);
  const synchronized=metadata?.revision===revision;
  return <EditorContext.Provider value={metadata?.canEdit&&synchronized?setGroup:undefined}>{saved&&<p role="status" className="ca-safety-note">Guidance saved. {synchronized?'The prepared snapshot includes your changes.':'Waiting for the next prepared snapshot; editing is paused to avoid overwriting newer guidance.'}</p>}{metadata?.canEdit&&!synchronized&&!saved&&<p role="status" className="ca-safety-note">Guidance has changed. Waiting for a matching snapshot; reload if this message persists.</p>}{children}{group&&metadata&&<GuidanceDialog group={group} metadata={metadata} onClose={()=>setGroup(null)} onSaved={revision=>{setMetadata({...metadata,revision});setSaved(true);setGroup(null);}}/>}</EditorContext.Provider>;
}
function GuidanceDialog({group,metadata,onClose,onSaved}:{group:NotificationGroup;metadata:Metadata;onClose:()=>void;onSaved:(revision:number)=>void}){
  const dialog=useRef<HTMLDialogElement>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const initial=(key:'actions'|'validation'|'clearing')=>[...new Set((group.troubleshooting?.[key]??[]).map(i=>i.text))].join('\n');
  const [category,setCategory]=useState(correctiveCategory(group)),[actions,setActions]=useState(initial('actions')),[validation,setValidation]=useState(initial('validation')),[clearing,setClearing]=useState(initial('clearing'));
  const [reference,setReference]=useState(group.guidanceOverride?.reference??''),[reason,setReason]=useState('');
  useEffect(()=>{dialog.current?.showModal();},[]);
  const save=async(reset=false)=>{
    setBusy(true);setError('');try{
      const response=await fetch('/api/local/corrective-guidance',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:metadata.revision,reset,entry:{key:correctiveGuidanceKey(group),category,actions:actions.split('\n').filter(Boolean),validation:validation.split('\n').filter(Boolean),clearing:clearing.split('\n').filter(Boolean),reference,reason}})});
      const body=await response.json();if(!response.ok)throw Error(body.error||'Unable to save');onSaved(body.revision);
    }catch(e){setError(e instanceof Error?e.message:'Unable to save');}finally{setBusy(false);}
  };
  return <dialog ref={dialog} className="ca-guidance-dialog" aria-labelledby="ca-guidance-title" onCancel={e=>{if(busy)e.preventDefault();else onClose();}}>
    <header><div><small>{metadata.localDraft?'MAC PREVIEW ONLY · LOCAL DRAFT':'LOCAL ADMINISTRATOR · SITE GUIDANCE'}</small><h2 id="ca-guidance-title">Edit corrective guidance</h2><p>{group.code} · {group.title}</p></div><button disabled={busy} onClick={onClose}>Close</button></header>
    <p className="ca-safety-note">Applies to this exact fault code and original equipment category on this site, across severities and targets. Existing safety notes remain. This changes reference guidance only—not fault detection, severity, controller clearing logic or permissions. Changes appear with the next prepared snapshot.</p>
    <form onSubmit={e=>{e.preventDefault();void save();}}>
      <label>Display category<input required maxLength={80} value={category} onChange={e=>setCategory(e.target.value)} list="ca-category-options"/></label>
      <datalist id="ca-category-options">{['String / Cell','HVAC / Environmental','PCS','Contactors & rotation','Safety systems','Other site issues'].map(c=><option key={c}>{c}</option>)}</datalist>
      {([['Recommended actions',actions,setActions],['Validation checks',validation,setValidation],['Clear conditions / required state',clearing,setClearing]] as const).map(([label,value,set])=><label key={label}>{label}<small>One step per line. Empty means not supplied, not cleared.</small><textarea rows={4} maxLength={60000} value={value} onChange={e=>set(e.target.value)}/></label>)}
      <label>Approved reference / procedure<input required maxLength={500} placeholder="Procedure name, revision and section" value={reference} onChange={e=>setReference(e.target.value)}/></label>
      <label>Reason for this change<input required maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      {error&&<p role="alert" className="ca-alarm">{error}</p>}
      <footer><button type="submit" disabled={busy}>{busy?'Saving…':metadata.localDraft?'Save local preview draft':'Save audited guidance'}</button>{group.guidanceOverride&&<button type="button" disabled={busy||!reason.trim()||!reference.trim()} onClick={()=>{if(window.confirm('Restore built-in guidance for this fault? This change is recorded.'))void save(true);}}>Restore built-in guidance</button>}</footer>
    </form>
  </dialog>;
}
