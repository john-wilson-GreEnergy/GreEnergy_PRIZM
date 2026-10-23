import type {FleetBalancerQuantity,FleetBpcDevice,FleetBpcIssue,FleetConsolidatedTarget,FleetDetails,FleetIssueTarget,IssueCategory} from '../../core/fleet/details';
import {issueCategories} from '../../core/fleet/details';
import type {SiteIdentity} from '../../core/fleet/model';

const positive=(n:number|null|undefined):n is number=>typeof n==='number' && Number.isSafeInteger(n) && n>0;
const compare=(a:FleetIssueTarget,b:FleetIssueTarget)=>(a.array??Infinity)-(b.array??Infinity)||(a.string??Infinity)-(b.string??Infinity)||(a.bpc??Infinity)-(b.bpc??Infinity)||a.id.localeCompare(b.id);
/** Compact evidence, never a guess that all 30 cell groups are affected. */
export function cellRanges(cells:Iterable<number>,unspecified=false):string {
  const sorted=[...new Set(cells)].sort((a,b)=>a-b),parts:string[]=[];
  for(let i=0;i<sorted.length;i++){
    const start=sorted[i];let end=start;
    while(i+1<sorted.length && sorted[i+1]===end+1)end=sorted[++i];
    parts.push(start===end?String(start):`${start}–${end}`);
  }
  if(unspecified)parts.push('BPC-level / cell not specified');
  return parts.join(', ') || 'Not specified';
}

/** Server-only projection of validated collector findings. Site/block identities never mix.
 * Raw findings and EMS counts remain intact; partial reports are explicitly lower bounds.
 */
export function attachBpcIssueReview(issues:FleetDetails['issues'],site:SiteIdentity,arrayNumbers:number[]=[]):void {
  const key=(t:FleetIssueTarget)=>positive(t.array)&&positive(t.string)&&positive(t.bpc)&&t.pcs===null &&
    (t.block===undefined || t.block===site.blockIndex)
    ?JSON.stringify([site.siteId,site.blockId,site.stationCode,site.blockIndex,t.array,t.string,t.bpc]):null;
  type Evidence={cells:Set<number>;unspecified:boolean;ids:Set<string>};
  const evidence=():Evidence=>({cells:new Set(),unspecified:false,ids:new Set()});
  const add=(e:Evidence,t:FleetIssueTarget)=>{e.ids.add(t.id);if(t.cell===null)e.unspecified=true;else e.cells.add(t.cell);};
  const devices=new Map<string,{device:FleetBpcDevice;evidence:Evidence;issues:Map<string,{issue:FleetBpcIssue;evidence:Evidence}>}>();
  const equipment=issues.findings.filter(f=>f.category!=='availability');
  for(const finding of equipment){
    const grouped=new Map<string,{row:FleetConsolidatedTarget;evidence:Evidence}>();
    const issueKey=JSON.stringify([finding.category,finding.severity,finding.code || finding.title.toLowerCase()]);
    for(const target of finding.targetRows??[]){
      const bpcKey=key(target),id=bpcKey??`unmapped:${target.id}`;
      let group=grouped.get(id);
      if(!group){group={row:{...target,id,cell:bpcKey?null:target.cell,label:bpcKey?`Array ${target.array} / String ${target.string} / BPC ${target.bpc}`:target.label,cells:'',reportedTargets:0,isBpc:!!bpcKey},evidence:evidence()};grouped.set(id,group);}
      add(group.evidence,target);
      if(!bpcKey)continue;
      let device=devices.get(bpcKey);
      if(!device){device={device:{id:bpcKey,array:target.array!,string:target.string!,bpc:target.bpc!,issues:[],issueCount:0,severity:'unknown',cells:'',categories:[]},evidence:evidence(),issues:new Map()};devices.set(bpcKey,device);}
      add(device.evidence,target);
      let issue=device.issues.get(issueKey);
      if(!issue){issue={issue:{key:issueKey,code:finding.code,title:finding.title,category:finding.category,severity:finding.severity,cells:'',reportedTargets:0},evidence:evidence()};device.issues.set(issueKey,issue);}
      add(issue.evidence,target);
    }
    finding.consolidatedTargets=[...grouped.values()].map(({row,evidence:e})=>({...row,cells:cellRanges(e.cells,e.unspecified),reportedTargets:e.ids.size})).sort(compare);
    finding.bpcCounts={all:0};
    for(const {row} of grouped.values())if(row.isBpc){finding.bpcCounts.all++;const a=String(row.array);finding.bpcCounts[a]=(finding.bpcCounts[a]??0)+1;}
  }
  const rank={alarm:0,warning:1,unknown:2,info:3};
  const rows=[...devices.values()].map(({device,evidence:e,issues:groups})=>{
    device.issues=[...groups.values()].map(({issue,evidence:e})=>({...issue,cells:cellRanges(e.cells,e.unspecified),reportedTargets:e.ids.size})).sort((a,b)=>rank[a.severity]-rank[b.severity]||a.code.localeCompare(b.code));
    device.issueCount=device.issues.length;device.severity=device.issues[0].severity;device.cells=cellRanges(e.cells,e.unspecified);device.categories=[...new Set(device.issues.map(i=>i.category))];return device;
  }).sort((a,b)=>a.array-b.array||a.string-b.string||a.bpc-b.bpc);
  const scopes:NonNullable<FleetDetails['issues']['bpcReview']>['scopes']={};
  const arrays=[...new Set([...arrayNumbers,...issues.findings.flatMap(f=>f.targetRows??[]).map(t=>t.array)].filter(positive))];
  // Unknown array mappings and omitted groups mean even a filtered view may be incomplete.
  const partial=issues.quality==='unknown'||issues.omittedGroups>0||equipment.some(f=>f.targetCount>(f.targetRows?.length??0)||f.targetRows?.some(t=>!positive(t.array)));
  for(const array of [null,...arrays])for(const category of [null,...Object.keys(issueCategories)] as (IssueCategory|null)[]){
    const selected=rows.filter(d=>(array===null||d.array===array)&&(category===null||d.categories.includes(category)));
    const unmapped=new Set<string>();
    for(const f of equipment)if(category===null||f.category===category)for(const t of f.targetRows??[])if((array===null||t.array===array)&&!key(t))unmapped.add(t.id);
    scopes[`${array??'all'}:${category??'all'}`]={uniqueBpcs:selected.length,multipleIssues:selected.filter(d=>d.issueCount>1).length,unmappedTargets:unmapped.size,partial};
  }
  // Known canonical balancer codes only; unrelated BPC faults never become parts demand.
  const balancing=equipment.filter(f=>f.code==='2073'||f.code==='2074');
  const quantities=new Map<number,FleetBalancerQuantity>();
  for(const device of rows){
    const charge=device.issues.some(i=>i.code==='2074'),discharge=device.issues.some(i=>i.code==='2073');
    if(!charge&&!discharge)continue;
    const row=quantities.get(device.bpc)??{bpc:device.bpc,chargeOnly:0,dischargeOnly:0,both:0,quantity:0};
    row.quantity++;
    if(charge&&discharge)row.both++;else if(charge)row.chargeOnly++;else row.dischargeOnly++;
    quantities.set(device.bpc,row);
  }
  const unmapped=new Set(balancing.flatMap(f=>f.targetRows??[]).filter(t=>!key(t)).map(t=>t.id));
  const inventoryRows=[...quantities.values()].sort((a,b)=>a.bpc-b.bpc);
  const inventoryPartial=issues.quality==='unknown'||issues.omittedGroups>0||unmapped.size>0||balancing.some(f=>f.targetCount>(f.targetRows?.length??0));
  issues.bpcReview={devices:rows,scopes,balancerInventory:{rows:inventoryRows,total:inventoryRows.reduce((sum,row)=>sum+row.quantity,0),unmappedTargets:unmapped.size,partial:inventoryPartial}};
}
