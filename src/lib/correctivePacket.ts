import type {NotificationGroup,NotificationReview} from '../server/notifications/notificationReview';
import {selectedTargets} from './correctiveWorklist';
import type {GuidanceSection} from '../server/notifications/notificationTroubleshooting';
import {correctiveDisplayCategory} from '../core/correctiveGuidance';
import {exportTargetKey} from './correctiveSelection';

/** Frozen export from already-authorized canonical data. Never queries equipment. */
export function correctivePacket(review:NotificationReview,groups:NotificationGroup[],array:string,query:string,site:string,stale:boolean,filters:Record<string,string>={},selection?:{keys:ReadonlySet<string>;includeSiteInventory:boolean}){
  const selected=groups.map(g=>({...g,displayCategory:correctiveDisplayCategory(g),targets:selectedTargets(g,array,query).filter(t=>!selection||selection.keys.has(exportTargetKey(g.id,t.id)))})).filter(g=>g.targets.length);
  const ids=new Set(selected.flatMap(g=>g.targets.map(t=>t.id)));
  const bpcs=review.bpcReview?.devices.filter(d=>review.bpcReview!.targetIdsByDevice[d.id]?.some(id=>ids.has(id)));
  const bpcChecklist=(bpcs??[]).map(d=>{
    const targetIds=(review.bpcReview!.targetIdsByDevice[d.id]??[]).filter(id=>ids.has(id));
    const deviceIds=new Set(targetIds);
    return {id:d.id,array:d.array,string:d.string,bpc:d.bpc,targetIds,
      codes:[...new Set(selected.filter(g=>g.targets.some(t=>deviceIds.has(t.id))).map(g=>g.code))].sort()};
  }).sort((a,b)=>a.array-b.array||a.string-b.string||a.bpc-b.bpc);
  const textFor=(g:NotificationGroup,key:GuidanceSection,id?:string)=>{
    const ids=new Set(g.targets.map(t=>t.id));
    return (g.troubleshooting?.[key]??[]).filter(i=>id?i.targetIds.includes(id):i.targetIds.some(t=>ids.has(t))).map(i=>(i.advisory?'General advisory: ':'')+i.text);
  };
  const targets=selected.flatMap(g=>g.targets.map(t=>({
    category:g.displayCategory||(g.section==='availability'?'Contactors & rotation':g.category),code:g.code,title:g.title,severity:g.severity,
    target:t.label,block:t.location?.block??null,array:t.array,string:t.location?.string??null,bpc:t.location?.bpc??null,cell:t.location?.cell??null,
    observed:[...new Set(t.observations.map(o=>o.at||'Not supplied'))].join('; '),
    actions:textFor(g,'actions',t.id).join('\n')||'Not supplied',validation:textFor(g,'validation',t.id).join('\n')||'Not supplied',clearing:textFor(g,'clearing',t.id).join('\n')||'Not supplied',safety:textFor(g,'safety',t.id).join('\n')||'Not supplied',
    documentedClearing:g.documentedClearing||'Not supplied',
    guidanceSource:(g.troubleshooting?.sources??[]).filter(s=>s.targetIds.includes(t.id)).map(s=>s.label+(s.advisory?' (general advisory)':'')).join('; ')||'Not supplied',
    telemetrySource:t.source.join('; '),
  })));
  return {site,capturedAt:review.capturedAt,generatedAt:new Date().toISOString(),revision:review.guidanceRevision??0,
    stale,warnings:review.sourceWarnings??[],filters:{...filters,array,target:query||'all',...(selection?{selection:'Operator-selected fault / target subset; not a complete site fault list'}:{})},selected,targets,bpcs,bpcChecklist,
    partialBpcs:review.bpcReview?.scopes['all:all']?.partial??true,
    inventory:selection&&!selection.includeSiteInventory?undefined:review.bpcReview?.balancerInventory,textFor,
  };
}
export type CorrectivePacket=ReturnType<typeof correctivePacket>;
export const exportColumns=['Site','Snapshot (UTC)','Freshness / coverage','Category','Severity','Code','Fault','Target','Block','Array','String','BPC','Cell group','Observed at','Recommended actions','Validation checks','Clear conditions','Safety / prerequisites','Documented clearing behavior','Guidance source','Telemetry source','Guidance revision'] as const;
export function packetRows(p:CorrectivePacket){return p.targets.map(t=>[p.site,p.capturedAt,[p.stale?'RETAINED - VERIFY FRESHNESS':'Published snapshot - verify before field work',...p.warnings].join('; '),t.category,t.severity,t.code,t.title,t.target,t.block,t.array,t.string,t.bpc,t.cell,t.observed,t.actions,t.validation,t.clearing,t.safety,t.documentedClearing,t.guidanceSource,t.telemetrySource,p.revision]);}
export function packetCsv(p:CorrectivePacket){const safe=(v:unknown)=>{const s=v==null?'':String(v);return '"'+(/^[\s]*[=+\-@]|^[\t\r]/.test(s)?"'":'')+s.replaceAll('"','""')+'"';};return [exportColumns,...packetRows(p)].map(row=>row.map(safe).join(',')).join('\r\n');}
