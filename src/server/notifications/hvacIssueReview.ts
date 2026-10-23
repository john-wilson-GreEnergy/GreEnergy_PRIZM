import type {HvacIssue,HvacIssueReview,HvacAffectedTarget,GuidanceGap} from '../../core/hvacIssueReview';
import type {NotificationReview} from './notificationReview';
import type {FleetDetails} from '../../core/fleet/details';
import {BESS_STATUS_CODE_MAP} from '../../lib/bessStatusCodes';
import {NOTIFICATION_CATALOG} from './notificationCatalog';

const rank={critical:0,alarm:1,warning:2,unknown:3,info:4};
const genericTitle=(title:string,code:string)=>!title.trim()||/^(?:unclassified|unknown|unmapped)\b/i.test(title.trim())||
  /^(?:(?:alarm|warning|info)\s+)?(?:notification|fault|alarm|warning|code)\b[\s:#\d_-]*$/i.test(title.trim())||title.trim()===code.trim();
/** Enrich display labels only; preserve identity, severity, targets and classification. */
export function annotateNotificationNames(review:Pick<NotificationReview,'groups'>){
  for(const g of review.groups){
    if(g.code==='2561')g.title=NOTIFICATION_CATALOG['2561'].name;
    if(NOTIFICATION_CATALOG[g.code]||!genericTitle(g.title,g.code)||!BESS_STATUS_CODE_MAP[g.code])continue;
    const original=g.title;
    g.title=`${BESS_STATUS_CODE_MAP[g.code]} (legacy label)`;
    g.sourceNotes=[...new Set([...(g.sourceNotes??[]),`Reported title: ${original}`,
      'Legacy code label: existing PRIZM mapping, not verified against the supplied fault-code manual. Confirm the code meaning and fault-specific procedure before action.'])];
  }
}
interface Group extends HvacIssue {
  targets:{id:string;label:string;array:number|null;unit:number|null}[];
  targetCount:number;
}
/** Exact canonical target identity only. Never infer a unit from a segment alarm. */
function project(groups:Group[],incomplete=false):HvacIssueReview {
  const devices=new Map<string,HvacAffectedTarget>(),unassigned=new Map<string,HvacAffectedTarget>();
  let partial=incomplete;
  for(const g of groups){
    partial ||= g.targetCount>g.targets.length;
    for(const t of g.targets){
      const isUnit=Number.isSafeInteger(t.unit)&&t.unit!>0&&Number.isSafeInteger(t.array)&&t.array!>0&&
        !/\b(FSS|fire suppression|smoke|gas sensor)\b/i.test(`${g.code} ${g.title}`);
      const map=isUnit?devices:unassigned;
      const entry=map.get(t.id)??{...t,unit:isUnit?t.unit:null,issues:[],severity:g.severity};
      if(!entry.issues.some(i=>i.key===g.key))entry.issues.push({key:g.key,code:g.code,title:g.title,severity:g.severity});
      if(rank[g.severity]<rank[entry.severity])entry.severity=g.severity;
      map.set(t.id,entry);
    }
  }
  const ordered=(map:Map<string,HvacAffectedTarget>)=>[...map.values()].sort((a,b)=>rank[a.severity]-rank[b.severity]||
    (a.array??Infinity)-(b.array??Infinity)||a.label.localeCompare(b.label,undefined,{numeric:true}));
  return {devices:ordered(devices),unassigned:ordered(unassigned),partial,
    issueTypes:groups.map(({key,code,title,severity})=>({key,code,title,severity}))};
}
export function projectNotificationHvacs(review:Pick<NotificationReview,'groups'|'sourceWarnings'>){
  if(process.env.PRIZM_HVAC_ISSUE_REVIEW==='false')return undefined;
  return project(review.groups.filter(g=>g.category==='HVAC / Environmental').map(g=>({
    key:g.id,code:g.code,title:g.title,severity:g.severity,targetCount:g.targetCount,
    targets:g.targets.map(t=>({id:t.id,label:t.label,array:t.array,unit:t.location?.unit??null}))
  })),!!review.sourceWarnings?.length);
}
export function attachFleetHvacs(issues:FleetDetails['issues']){
  if(process.env.PRIZM_HVAC_ISSUE_REVIEW==='false'){delete issues.hvacReview;return;}
  issues.hvacReview=project(issues.findings.filter(g=>g.category==='hvac').map(g=>({
    key:JSON.stringify([g.category,g.severity,g.code,g.title]),code:g.code,title:g.title,severity:g.severity,targetCount:g.targetCount,
    targets:(g.targetRows??[]).map(t=>({id:t.id,label:t.label,array:t.array,unit:t.hvacUnit??null}))
  })),issues.omittedGroups>0||issues.quality!=='live');
}
/** Audit supplied guidance, not a new fault rule or a claim that a repair is required. */
export function auditNotificationGuidance(review:Pick<NotificationReview,'groups'>):GuidanceGap[]{
  return review.groups.flatMap(g=>{
    const missing:string[]=[];
    if(genericTitle(g.title,g.code))missing.push('Plain-language title');
    if(g.sourceNotes?.some(n=>n.startsWith('Legacy code label:')))missing.push('Code meaning / source verification');
    // Rotation / availability states are not repair instructions or new equipment faults.
    if(g.code!=='2561'&&!g.code.startsWith('PRIZM-')){
      for(const [key,label] of [['actions','Fault-specific actions'],['validation','Validation checks'],['clearing','Clearing criteria']] as const){
        if(key==='clearing'&&g.documentedClearing?.trim())continue;
        const supplied=new Set((g.troubleshooting?.[key]??[]).filter(i=>!i.advisory&&i.text.trim()).flatMap(i=>i.targetIds));
        if(!g.targets.length||g.targets.some(t=>!supplied.has(t.id)))missing.push(label);
      }
    }
    return missing.length?[{groupId:g.id,code:g.code,title:g.title,severity:g.severity,missing,targetCount:g.targetCount}]:[];
  });
}
