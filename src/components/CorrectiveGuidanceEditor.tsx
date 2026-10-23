import React,{createContext,useContext,useEffect,useRef,useState} from 'react';
import type {NotificationGroup} from '../server/notifications/notificationReview';
import {correctiveGuidanceKey,correctiveDisplayCategory as correctiveCategory} from '../core/correctiveGuidance';

const EditorContext=createContext<((g:NotificationGroup)=>void)|undefined>(undefined);
export const useCorrectiveEditor=()=>useContext(EditorContext);
type Metadata={canEdit:boolean;revision:number;localDraft?:boolean;sharedRevision?:number;sharedSites?:string[];canEditShared?:boolean;localKeys?:string[];sharedKeys?:string[]};
export function CorrectiveGuidanceBoundary({children,revision=0,sharedRevision=0}:{children:React.ReactNode;revision?:number;sharedRevision?:number}){
  const [metadata,setMetadata]=useState<Metadata|null>(null),[group,setGroup]=useState<NotificationGroup|null>(null);
  const [saved,setSaved]=useState(false);
  useEffect(()=>{const controller=new AbortController();fetch('/api/local/corrective-guidance',{signal:controller.signal}).then(async r=>{if(r.ok)setMetadata(await r.json());}).catch(()=>{});return()=>controller.abort();},[]);
  const synchronized=metadata?.revision===revision&&(metadata?.sharedRevision??0)===sharedRevision;
  return <EditorContext.Provider value={metadata?.canEdit&&synchronized?setGroup:undefined}>{saved&&<p role="status" className="ca-safety-note">Guidance saved. {synchronized?'The prepared snapshot includes your changes.':'Waiting for the next prepared snapshot; editing is paused to avoid overwriting newer guidance.'}</p>}{metadata?.canEdit&&!synchronized&&!saved&&<p role="status" className="ca-safety-note">Guidance has changed. Waiting for a matching snapshot; reload if this message persists.</p>}{children}{group&&metadata&&<GuidanceDialog group={group} metadata={metadata} onClose={()=>setGroup(null)} onSaved={result=>{setMetadata({...metadata,...result});setSaved(true);setGroup(null);}}/>}</EditorContext.Provider>;
}
function GuidanceDialog({group,metadata,onClose,onSaved}:{group:NotificationGroup;metadata:Metadata;onClose:()=>void;onSaved:(result:{revision:number;sharedRevision:number;localKeys:string[];sharedKeys:string[]})=>void}){
  const dialog=useRef<HTMLDialogElement>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const initial=(key:'actions'|'validation'|'clearing')=>[...new Set((group.troubleshooting?.[key]??[]).map(i=>i.text))].join('\n');
  const [category,setCategory]=useState(correctiveCategory(group)),[actions,setActions]=useState(initial('actions')),[validation,setValidation]=useState(initial('validation')),[clearing,setClearing]=useState(initial('clearing'));
  const [reference,setReference]=useState(group.guidanceOverride?.reference??''),[reason,setReason]=useState('');
  const [scope,setScope]=useState<'site'|'shared'>(metadata.canEditShared?'shared':'site');
  const key=correctiveGuidanceKey(group),hasLocal=metadata.localKeys?.includes(key)??(group.guidanceScope!=='shared'&&!!group.guidanceOverride);
  const canReset=scope==='shared'?metadata.sharedKeys?.includes(key):hasLocal;
  useEffect(()=>{dialog.current?.showModal();},[]);
  const save=async(reset=false)=>{
    setBusy(true);setError('');try{
      const response=await fetch('/api/local/corrective-guidance',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope,revision:scope==='shared'?metadata.sharedRevision:metadata.revision,reset,entry:{key,category,actions:actions.split('\n').filter(Boolean),validation:validation.split('\n').filter(Boolean),clearing:clearing.split('\n').filter(Boolean),reference,reason}})});
      const body=await response.json();if(!response.ok)throw Error(body.error||'Unable to save');
      const keys=(existing:string[]|undefined,changed:boolean)=>!changed?(existing??[]):reset?(existing??[]).filter(k=>k!==key):[...new Set([...(existing??[]),key])];
      onSaved({revision:body.revision,sharedRevision:body.sharedRevision??0,localKeys:keys(metadata.localKeys,scope==='site'),sharedKeys:keys(metadata.sharedKeys,scope==='shared')});
    }catch(e){setError(e instanceof Error?e.message:'Unable to save');}finally{setBusy(false);}
  };
  return <dialog ref={dialog} className="ca-guidance-dialog" aria-labelledby="ca-guidance-title" onCancel={e=>{if(busy)e.preventDefault();else onClose();}}>
    <header><div><small>{metadata.localDraft?'MAC PREVIEW ONLY · LOCAL DRAFT':'LOCAL ADMINISTRATOR · SITE GUIDANCE'}</small><h2 id="ca-guidance-title">Edit corrective guidance</h2><p>{group.code} · {group.title}</p></div><button disabled={busy} onClick={onClose}>Close</button></header>
    <p className="ca-safety-note">Applies to this exact fault code and original equipment category, across severities and targets. Existing safety notes remain. This changes reference guidance only—not fault detection, severity, controller clearing logic or permissions. Changes appear with each site's next prepared snapshot.</p>
    <form onSubmit={e=>{e.preventDefault();void save();}}>
      <label>Apply changes to<select value={scope} onChange={e=>setScope(e.target.value as 'site'|'shared')} disabled={busy}>{metadata.canEditShared&&<option value="shared">Both sites · Shared guidance</option>}<option value="site">This site only · Site-specific exception</option></select></label>
      {scope==='shared'&&<p className="ca-safety-note">Shared by {metadata.sharedSites?.join(' and ')}. Site-specific exceptions take priority and are not overwritten.{hasLocal?' This fault has an exception on the current site: select “This site only” and remove the exception to inherit shared guidance.':''}</p>}
      {!metadata.canEditShared&&!!metadata.sharedSites?.length&&<p className="ca-safety-note">Shared guidance is available, but editing it requires local administrator workspace access to every shared site.</p>}
      <label>Display category<input required maxLength={80} value={category} onChange={e=>setCategory(e.target.value)} list="ca-category-options"/></label>
      <datalist id="ca-category-options">{['String / Cell','HVAC / Environmental','PCS','Contactors & rotation','Safety systems','Other site issues'].map(c=><option key={c}>{c}</option>)}</datalist>
      {([['Recommended actions',actions,setActions],['Validation checks',validation,setValidation],['Clear conditions / required state',clearing,setClearing]] as const).map(([label,value,set])=><label key={label}>{label}<small>One step per line. Empty means not supplied, not cleared.</small><textarea rows={4} maxLength={60000} value={value} onChange={e=>set(e.target.value)}/></label>)}
      <label>Approved reference / procedure<input required maxLength={500} placeholder="Procedure name, revision and section" value={reference} onChange={e=>setReference(e.target.value)}/></label>
      <label>Reason for this change<input required maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      {error&&<p role="alert" className="ca-alarm">{error}</p>}
      <footer><button type="submit" disabled={busy}>{busy?'Saving…':metadata.localDraft?'Save local preview draft':scope==='shared'?'Save shared guidance':'Save site-specific guidance'}</button>{canReset&&<button type="button" disabled={busy||!reason.trim()||!reference.trim()} onClick={()=>{if(window.confirm(scope==='shared'?'Remove shared guidance for both sites? Site-specific exceptions remain. This change is recorded.':'Remove this site exception and use shared guidance, or built-in guidance if none exists? This change is recorded.'))void save(true);}}>{scope==='shared'?'Remove shared guidance':'Remove site exception'}</button>}</footer>
    </form>
  </dialog>;
}
