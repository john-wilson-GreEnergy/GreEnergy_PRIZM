import React,{useEffect,useRef} from 'react';
import type {NotificationReview} from '../server/notifications/notificationReview';
import {usePresentation,TargetNavigation} from '../lib/workspacePreferences';
import {NotificationTroubleshootingPanel} from './NotificationTroubleshootingPanel';
import {BpcListDisclosure} from './BpcListDisclosure';

export function CorrectiveBpcWorkspace({review,array,query}:{review:NotificationReview;array:string;query:string}){
  const bpcs=review.bpcReview,inventory=bpcs?.balancerInventory;
  const [selected,setSelected]=usePresentation<string|null>('corrective-bpc',null);
  const [multiple,setMultiple]=usePresentation('corrective-bpc-multiple',false);
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(selected&&!dialog.current?.open)dialog.current?.showModal();if(!selected&&dialog.current?.open)dialog.current.close();},[selected,!!bpcs]);
  if(!bpcs)return <p className="ops-empty">BPC review is unavailable in this collector snapshot. Issue counts must not be used as replacement quantities.</p>;
  const q=query.trim().toLowerCase(),match=/^bpc\s*(\d+)$/i.exec(q);
  const devices=bpcs.devices.filter(d=>(array==='all'||String(d.array)===array)&&(!multiple||d.issueCount>1)&&(!q||(match?d.bpc===Number(match[1]):`array ${d.array} string ${d.string} bpc ${d.bpc} ${d.issues.map(i=>`${i.code} ${i.title}`).join(' ')}`.toLowerCase().includes(q))));
  const current=bpcs.devices.find(d=>d.id===selected),counts=bpcs.scopes[`${array}:all`];
  const currentIds=new Set(current?bpcs.targetIdsByDevice?.[current.id]??[]:[]);
  return <div className="ops-bpc-workspace">
    <section className="ops-inventory"><div><h3>Balancing faults · configuration quantities</h3><p>Entire site, independent of filters · Charge 2074 + discharge 2073 · Each physical BPC counted once.</p></div><strong>{inventory?.partial?'At least ':''}{inventory?.total??'—'} <small>unique BPC candidates</small></strong>
      <p>Inspection / replacement planning only—not a confirmed replacement decision.</p>
      {inventory?.partial&&<p className="ops-alert">Incomplete inventory. Counts are lower bounds; {inventory.unmappedTargets} unmapped targets.</p>}
      <BpcListDisclosure label="Balancing quantities by BPC number">
      <div className="ops-data-scroll"><table className="ops-data-table"><thead><tr><th>BPC number</th><th>Total quantity</th><th>Charge only</th><th>Discharge only</th><th>Both faults</th></tr></thead><tbody>{inventory?.rows.map(r=><tr key={r.bpc}><th>BPC {r.bpc}</th><td><strong>{r.quantity}</strong></td><td>{r.chargeOnly}</td><td>{r.dischargeOnly}</td><td>{r.both}</td></tr>)}</tbody></table></div>
      {!inventory?.rows.length&&<p>No mapped balancing candidates reported. Check coverage before treating this as zero required work.</p>}
      </BpcListDisclosure>
    </section>
    <div className="ops-table-toolbar"><span>{devices.length} matching BPCs · {counts?.partial?'at least ':''}{counts?.uniqueBpcs??'—'} in array scope · {counts?.unmappedTargets??'—'} other / unresolved targets</span><label><input type="checkbox" checked={multiple} onChange={e=>setMultiple(e.target.checked)}/> Multiple issues only</label></div>
    {counts?.partial&&<p className="ops-alert">Partial source coverage; this is not a complete work inventory.</p>}
    <BpcListDisclosure label={`Unique BPC list · ${devices.length} matching BPCs`}>
    <div className="ops-data-scroll"><table className="ops-data-table"><thead><tr><th>Array / String</th><th>BPC</th><th>Severity</th><th>Issues / codes</th><th>Cell groups</th><th>Review</th></tr></thead><tbody>{devices.map(d=><tr key={d.id}><th>Array {d.array} · String {d.string}</th><td>BPC {d.bpc}</td><td><span className={`ops-severity ops-severity-${d.severity}`}>{d.severity}</span></td><td>{d.issueCount} · {d.issues.map(i=>i.code).join(', ')}</td><td>{d.cells}</td><td><button className="ops-link-button" onClick={()=>setSelected(d.id)} aria-label={`Review Array ${d.array} String ${d.string} BPC ${d.bpc}`}>Review BPC →</button></td></tr>)}</tbody></table></div>
    {!devices.length&&<p className="ops-empty">No mapped BPCs match these filters. Other equipment and unresolved findings remain in By issue.</p>}
    </BpcListDisclosure>
    <dialog ref={dialog} className="ops-detail-drawer" aria-label="BPC issue details" onCancel={()=>setSelected(null)} onClose={()=>setSelected(null)}><header><h2>{current?`Array ${current.array} · String ${current.string} · BPC ${current.bpc}`:'BPC no longer in this snapshot'}</h2><button autoFocus onClick={()=>setSelected(null)}>Close</button></header>
      {current?<><p>All reported issues on this physical device · Affected cell groups: {current.cells}</p><TargetNavigation target={current}/>{review.groups.filter(g=>g.targets.some(t=>currentIds.has(t.id))).map(g=><section key={g.id}><h3><span className={`ops-severity ops-severity-${g.severity}`}>{g.severity}</span> {g.code} · {g.title}</h3><NotificationTroubleshootingPanel group={{...g,targets:g.targets.filter(t=>currentIds.has(t.id))}} array={String(current.array)}/></section>)}</>:<p>Refresh or close this panel. A missing row alone does not confirm resolution.</p>}
    </dialog>
  </div>;
}
