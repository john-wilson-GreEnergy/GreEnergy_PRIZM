import type {NotificationReview} from './notificationReview';
import {emptyDetails,type FleetDetails,type IssueCategory} from '../../core/fleet/details';
import {attachBpcIssueReview} from '../fleet/bpcIssueReview';

/** Reuse Fleet's physical-device identity/counting policy, from the canonical review only. */
export function projectNotificationBpcs(review:NotificationReview,site:{stationCode:string;blockIndex:number}){
  const issues:FleetDetails['issues']=emptyDetails().issues;
  issues.quality=review.sourceWarnings?.length?'unknown':'live';issues.observedAt=review.capturedAt;
  issues.findings=review.groups.map(g=>({code:g.code,title:g.title,
    category:(g.section==='availability'?'availability':g.category==='String / Cell'?'battery':g.category==='HVAC / Environmental'?'hvac':g.category==='PCS'?'pcs':'other') as IssueCategory,
    severity:g.severity==='critical'?'alarm':g.severity,targetCount:g.targetCount,targets:[],
    targetRows:g.targets.map(t=>({id:t.id,label:t.label,array:t.array,string:t.location?.string??null,bpc:t.location?.bpc??null,cell:t.location?.cell??null,pcs:t.location?.pcs??null,segment:t.location?.segment??null,block:t.location?.block??null}))}));
  attachBpcIssueReview(issues,{...site,siteId:site.stationCode,blockId:String(site.blockIndex)});
  const bpcReview=issues.bpcReview!;
  const targetIdsByDevice:Record<string,string[]>={};
  const index=new Map<string,Set<string>>();
  for(const g of review.groups)for(const t of g.targets){
    if(t.location?.block!==site.blockIndex||t.location?.pcs!=null)continue;
    const key=JSON.stringify([t.array,t.location.string,t.location.bpc]);
    if(!index.has(key))index.set(key,new Set());index.get(key)!.add(t.id);
  }
  for(const d of bpcReview.devices)targetIdsByDevice[d.id]=[...(index.get(JSON.stringify([d.array,d.string,d.bpc]))??[])];
  return {...bpcReview,targetIdsByDevice};
}
