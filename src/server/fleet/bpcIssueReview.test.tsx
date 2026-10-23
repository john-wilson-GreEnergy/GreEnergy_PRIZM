import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {emptyDetails,type FleetFinding,type FleetIssueTarget} from '../../core/fleet/details';
import {emptyMetrics,type SiteEnrollment} from '../../core/fleet/model';
import {attachBpcIssueReview,cellRanges} from './bpcIssueReview';
import {FleetBroker,parseSummary} from './FleetBroker';
import {ageFleetDetails} from './detailValidation';
import {FleetIssues} from '../../fleet/FleetDrilldowns';
import {BpcIssuesTable} from '../../fleet/BpcIssuesTable';

const site:SiteEnrollment={siteId:'site-a',blockId:'block-1',stationCode:'TEST',blockIndex:1,name:'Test site'};
const target=(cell:number|null,override:Partial<FleetIssueTarget>={}):FleetIssueTarget=>({id:`cell-${cell}`,label:`BPC 3 / Cell ${cell}`,array:1,string:2,bpc:3,cell,pcs:null,segment:1,block:1,...override});
const finding=(code:string,targets:FleetIssueTarget[],extra:Partial<FleetFinding>={}):FleetFinding=>({code,title:`Reported ${code}`,category:'battery',severity:'warning',targetCount:targets.length,targetRows:targets,targets:[],...extra});
const details=emptyDetails();details.issues.quality='live';
details.issues.findings=[finding('charge',Array.from({length:30},(_,i)=>target(i+1))),finding('discharge',[target(1),target(5)]),
  finding('temperature',[target(1,{id:'other-string',string:3}),target(1,{id:'other-array',array:2})]),
  finding('unlocated',[target(null,{id:'no-bpc',bpc:null}),target(1,{id:'no-string',string:null}),target(1,{id:'foreign-block',block:2})]),
  finding('HVAC',[target(null,{id:'hvac',bpc:null,string:null})],{category:'hvac'}),
  finding('rotation',[target(1,{id:'rotation'})],{category:'availability'})];
const original=structuredClone(details.issues.findings);
attachBpcIssueReview(details.issues,site,[1,2,3]);
const review=details.issues.bpcReview!;
assert.deepEqual(review.scopes['all:all'],{uniqueBpcs:3,multipleIssues:1,unmappedTargets:4,partial:false});
assert.equal(review.scopes['1:battery'].uniqueBpcs,2);
assert.equal(review.scopes['2:all'].uniqueBpcs,1);
assert.equal(review.scopes['3:all'].uniqueBpcs,0);
assert.equal(review.scopes['all:hvac'].uniqueBpcs,0);
assert.equal(review.devices[0].issues.length,2);
assert.equal(review.devices[0].cells,'1–30');
assert.equal(review.devices[0].issues[0].reportedTargets,30);
assert.equal(details.issues.findings[0].consolidatedTargets?.length,1,'Thirty cell targets become one BPC row');
assert.equal(details.issues.findings[0].targetCount,30,'EMS target counts are not rewritten as device counts');
for(const [i,f] of details.issues.findings.entries())assert.deepEqual(f.targetRows,original[i].targetRows,'Retain source target evidence');
const repeat=structuredClone(details);repeat.issues.findings.push(repeat.issues.findings[0]);attachBpcIssueReview(repeat.issues,site);
assert.equal(repeat.issues.bpcReview!.devices[0].issueCount,2,'Duplicate code rows do not multiply issues');
assert.equal(repeat.issues.bpcReview!.devices[0].issues[0].reportedTargets,30);
assert.equal(cellRanges([3,1,2,5,5],true),'1–3, 5, BPC-level / cell not specified');
const partial=structuredClone(details);partial.issues.findings[0].targetCount=31;attachBpcIssueReview(partial.issues,site,[3]);
assert(partial.issues.bpcReview!.scopes['3:all'].partial);
const legacy=emptyDetails();legacy.issues.quality='live';legacy.issues.findings=[finding('legacy',[],{targetCount:30,targets:['String 1']})];
attachBpcIssueReview(legacy.issues,site);assert.equal(legacy.issues.bpcReview!.scopes['all:all'].uniqueBpcs,0);assert(legacy.issues.bpcReview!.scopes['all:all'].partial);
const omitted=structuredClone(details);omitted.issues.omittedGroups=1;attachBpcIssueReview(omitted.issues,site);assert(omitted.issues.bpcReview!.scopes['all:all'].partial);
const unknown=emptyDetails();attachBpcIssueReview(unknown.issues,site);assert(unknown.issues.bpcReview!.scopes['all:all'].partial);
const second=structuredClone(details);attachBpcIssueReview(second.issues,{...site,siteId:'site-b',blockId:'block-2'});
assert.notEqual(second.issues.bpcReview!.devices[0].id,review.devices[0].id,'Identical coordinates in different sites stay distinct');
const now=Date.now(),observedAt=new Date(now).toISOString();details.issues.observedAt=observedAt;
const payload={...site,schema:'prizm-site-summary-v1',stale:false,observedAt,metrics:emptyMetrics(),details};
const accepted=parseSummary(payload,site);assert.equal(accepted.details?.issues.bpcReview?.scopes['all:all'].uniqueBpcs,3);
assert.equal(ageFleetDetails(accepted.details,now+16000,true).issues.quality,'stale');
const broker=new FleetBroker([{...site,name:'A'},{...site,siteId:'site-b',blockId:'block-2',blockIndex:2,name:'B'}],()=>now);
broker.accept(site.siteId,payload);assert.equal(broker.view(new Set(['site-b'])).sites[0].details?.issues.bpcReview,undefined,'No cross-site data leaks');
const before=process.env.PRIZM_FLEET_BPC_REVIEW;
try{process.env.PRIZM_FLEET_BPC_REVIEW='false';assert.equal(parseSummary(payload,site).details?.issues.bpcReview,undefined,'Rollback ignores derived fields supplied by collectors');}
finally{if(before===undefined)delete process.env.PRIZM_FLEET_BPC_REVIEW;else process.env.PRIZM_FLEET_BPC_REVIEW=before;}
const html=renderToStaticMarkup(<FleetIssues issues={details.issues} array={null}/>);
assert.equal((html.match(/<details class="prizm-bpc-list">/g)||[]).length,2,'Fleet BPC lists default collapsed');
assert(!html.includes('<details class="prizm-bpc-list" open'));
assert(html.includes('3 unique BPCs'));assert(html.includes('1 with multiple issues'));assert(html.includes('Other equipment / unresolved BPC targets'));assert(html.includes('Reported HVAC'));assert(html.includes('Reported rotation'));assert(html.includes('Review Array 1 String 2 BPC 3'));
assert(renderToStaticMarkup(<FleetIssues issues={partial.issues} array={null}/>).includes('lower-bound count'));
console.log('PASS BPC deduplication, cross-code union, cell evidence, scoped counts, partial/legacy data, site isolation, rollback and rendering');

const inventoryDetails=emptyDetails();inventoryDetails.issues.quality='live';
inventoryDetails.issues.findings=[
  finding('2074',Array.from({length:30},(_,i)=>target(i+1))),
  finding('2073',[target(1),target(1)]),
  finding('2074',[target(2,{id:'second-3',array:2}),target(3,{id:'twelve',bpc:12})]),
  finding('2073',[target(4,{id:'fourteen',bpc:14})]),
  finding('2014',[target(5,{id:'temp-only',bpc:8})]),
];
attachBpcIssueReview(inventoryDetails.issues,site,[1,2]);
const inventory=inventoryDetails.issues.bpcReview!.balancerInventory!;
assert.deepEqual(inventory,{rows:[
  {bpc:3,chargeOnly:1,dischargeOnly:0,both:1,quantity:2},
  {bpc:12,chargeOnly:1,dischargeOnly:0,both:0,quantity:1},
  {bpc:14,chargeOnly:0,dischargeOnly:1,both:0,quantity:1},
],total:4,unmappedTargets:0,partial:false});
const filteredInventoryHtml=renderToStaticMarkup(<BpcIssuesTable review={inventoryDetails.issues.bpcReview!} array={2} category="hvac"/>);
assert(filteredInventoryHtml.includes('BPC 12'),'Site-wide inventory remains independent of array/category selection');
assert(filteredInventoryHtml.includes('Total unique BPCs</th><td><strong>4'));
assert(!filteredInventoryHtml.includes('BPC 8'),'Temperature-only device must not count toward balancing quantities');
const incompleteInventory=structuredClone(inventoryDetails);
incompleteInventory.issues.findings.push(finding('2074',[target(1,{id:'missing-bpc',bpc:null}),target(2,{id:'foreign-balancer',block:2})]));
attachBpcIssueReview(incompleteInventory.issues,site);
assert.equal(incompleteInventory.issues.bpcReview!.balancerInventory!.total,4);
assert.equal(incompleteInventory.issues.bpcReview!.balancerInventory!.unmappedTargets,2);
assert(incompleteInventory.issues.bpcReview!.balancerInventory!.partial);
for(const change of ['omitted','truncated','unknown'] as const){
  const sample=structuredClone(inventoryDetails);
  if(change==='omitted')sample.issues.omittedGroups=1;
  if(change==='truncated')sample.issues.findings[0].targetCount=31;
  if(change==='unknown')sample.issues.quality='unknown';
  attachBpcIssueReview(sample.issues,site);
  assert(sample.issues.bpcReview!.balancerInventory!.partial,change);
}
const emptyInventory=emptyDetails();emptyInventory.issues.quality='live';attachBpcIssueReview(emptyInventory.issues,site);
assert.equal(emptyInventory.issues.bpcReview!.balancerInventory!.total,0);
assert(!emptyInventory.issues.bpcReview!.balancerInventory!.partial);
console.log('PASS balancing BPC-number quantities, cross-string/array counts, charge/discharge union, unrelated exclusions and incomplete coverage');
