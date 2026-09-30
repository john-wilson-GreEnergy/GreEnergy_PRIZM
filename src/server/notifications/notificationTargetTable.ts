import type {NotificationTarget,NotificationEvidence} from './notificationReview';
import type {NotificationMetrics} from './notificationMetrics';
import type {BpcVoltageOutliers} from './bpcVoltageOutliers';

export interface NotificationTableRow {
  id:string; label:string; array:number|null; memberIds:string[]; locations:string[]; context:string[]; source:string[];
  scope:string[];
  metrics?:NotificationMetrics;
  bpcOutliers?:BpcVoltageOutliers;
  observations:{scope:string[]; condition:string; evidence:NotificationEvidence[]; guidance:string[]; times:string[]; missingTime:boolean}[];
}
const unique = (values:string[]) => [...new Set(values)].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
function scopeFor(targets:NotificationTarget[]):string[] {
  const packs=new Map<string,{cells:number[]; unspecified:boolean}>();
  for (const target of targets) {
    const location=target.location;
    if (!location || location.string==null || target.array==null || location.unit!=null || location.pcs!=null) {packs.set(target.label,{cells:[],unspecified:true});continue;}
    const key=location.bpc==null?'String-level / BPC not supplied':`BPC ${location.bpc}`;
    const pack=packs.get(key)??{cells:[],unspecified:false};
    if(location.cell!=null) pack.cells.push(location.cell); else pack.unspecified=true;
    packs.set(key,pack);
  }
  return [...packs.entries()].sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true})).map(([label,p])=>
    `${label}${p.cells.length?` · Cell groups ${unique(p.cells.map(String)).join(', ')}${p.unspecified?'; also reported without cell detail':''}`:''}`);
}
function time(value:string|null):string|null {
  if(!value) return null;
  const numeric=/^\d{10}(?:\d{3})?$/.test(value)?Number(value):null;
  const date=new Date(numeric==null?value:value.length===10?numeric*1000:numeric);
  return Number.isFinite(date.getTime())?date.toISOString():null;
}
/** Presentation only. Keep the original targets and counts; consolidate within one code/severity. */
export function buildNotificationTargetTable(targets:NotificationTarget[],title:string) {
  const guidanceByTarget=targets.map(t=>unique(t.observations.flatMap(o=>o.guidance)));
  const commonGuidance=(guidanceByTarget[0]??[]).filter(step=>guidanceByTarget.every(steps=>steps.includes(step)));
  const buckets=new Map<string,NotificationTarget[]>();
  for(const target of targets) {
    const l=target.location;
    // Do not infer a parent for unresolved targets, or combine HVAC units / PCS with strings.
    const id=l && target.array!=null && l.string!=null && l.unit==null && l.pcs==null
      ?JSON.stringify(['string',l.block,target.array,l.string]):target.id;
    buckets.set(id,[...(buckets.get(id)??[]),target]);
  }
  const rows:NotificationTableRow[]=[];
  for(const [id,members] of buckets) {
    const first=members[0],l=first.location;
    const isString=l && first.array!=null && l.string!=null && l.unit==null && l.pcs==null;
    const row:NotificationTableRow={id,array:first.array,label:isString?`${l.block!==1?`Block ${l.block} / `:''}Array ${first.array} / String ${l.string}`:first.label,
      memberIds:members.map(t=>t.id),locations:unique(members.map(t=>t.label)),
      context:unique(members.map(t=>[t.location?.segment==null?'':`Energy Segment ${t.location.segment}`,t.location?.side,t.location?.ip].filter(Boolean).join(' · ')).filter(Boolean)),
      source:unique(members.flatMap(t=>t.source)),scope:scopeFor(members),observations:[]};
    const observations=new Map<string,{targets:NotificationTarget[]; detail:NotificationTableRow['observations'][number]}>();
    for(const member of members) for(const observation of member.observations) {
      // Aggregate 'Affected: ... (+N more)' text duplicates the actual table, not device evidence.
      const condition=observation.condition===title || /^Affected:\s/i.test(observation.condition)?'':observation.condition;
      const guidance=observation.guidance.filter(step=>!commonGuidance.includes(step));
      const evidence=[...observation.evidence].sort((a,b)=>a.label.localeCompare(b.label)||a.value.localeCompare(b.value));
      const key=JSON.stringify([condition,evidence,guidance]);
      const item=observations.get(key)??{targets:[],detail:{scope:[],condition,evidence,guidance,times:[],missingTime:false}};
      item.targets.push(member);
      const at=time(observation.at);
      if(at) item.detail.times.push(at); else item.detail.missingTime=true;
      observations.set(key,item);
    }
    row.observations=[...observations.values()].map(({targets,detail})=>({...detail,scope:scopeFor(targets),times:unique(detail.times)}));
    rows.push(row);
  }
  rows.sort((a,b)=>(a.array??Infinity)-(b.array??Infinity)||a.label.localeCompare(b.label,undefined,{numeric:true})||a.id.localeCompare(b.id));
  return {rows,commonGuidance};
}
