import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {buildNotificationReview} from './notificationReview';
import {projectNotificationHvacs,attachFleetHvacs,auditNotificationGuidance} from './hvacIssueReview';
import {emptyDetails} from '../../core/fleet/details';
import {HvacIssueDisclosure} from '../../components/HvacIssueDisclosure';
import {HvacFaultRow} from '../../components/HvacFaultRow';
import {NotificationGuidanceAudit} from '../../components/NotificationGuidanceAudit';
import NotificationReviewPanel,{LegacyNotificationReviewPanel} from '../../components/NotificationReviewPanel';
import {CorrectiveActionsWorkspace} from '../../components/CorrectiveActionsWorkspace';
import {LegacyCorrectiveActionsWorkspace} from '../../components/LegacyCorrectiveActionsWorkspace';
import {FleetIssues} from '../../fleet/FleetDrilldowns';
import {MobileView} from '../../mobile/MobileApp';
import {FleetBroker} from '../fleet/FleetBroker';
import {emptyMetrics} from '../../core/fleet/model';

const stamp=new Date().toISOString();
const legacyName=buildNotificationReview([{code:'1071',title:'ALARM Code 1071',severity:'alarm',affected:[{arrayIndex:4,stringIndex:1}]}],stamp);
assert.equal(legacyName.groups[0].title,'String High Discharge Rate Alarm (legacy label)');
assert.equal(legacyName.groups[0].severity,'alarm');
assert.equal(legacyName.groups[0].targetCount,1);
assert.equal(legacyName.groups[0].category,'Other site issues','Name enrichment does not reclassify or change totals');
assert(legacyName.guidanceGaps![0].missing.includes('Code meaning / source verification'));
assert(legacyName.groups[0].sourceNotes!.some(n=>n==='Reported title: ALARM Code 1071'));
assert(buildNotificationReview([{code:'9999',title:'Code 9999'}],stamp).guidanceGaps![0].missing.includes('Plain-language title'),'Unverified names must not be invented');
const target=(array=4,unit=1)=>({arrayIndex:array,energySegmentIndex:2,hvacUnit:unit,
  label:`Array ${array} / ES 2 / HVAC ${unit}`,ip:`10.0.${array}.20`});
const review=buildNotificationReview([
  {code:'ENV-1',title:'HVAC command mismatch',subsystem:'hvac',severity:'alarm',affected:[target(),target()]},
  {code:'ENV-2',title:'HVAC fan warning',subsystem:'hvac',severity:'warning',affected:[target(),target(4,2),target(5)]},
  {code:'FSS',title:'FSS segment alert',subsystem:'hvac',severity:'critical',affected:[target()]},
  {code:'ENV-UNKNOWN',title:'Unclassified notification',subsystem:'hvac',severity:'unknown',affected:[{arrayIndex:4,label:'CS 4'}]},
  {code:'2074',severity:'warning',affected:[{arrayIndex:1,stringIndex:2,batteryPackIndex:3,cellGroupIndex:1}]},
],stamp);
const before=JSON.stringify(review),hvac=review.hvacReview!;
assert.equal(hvac.devices.length,3,'One target for the same unit across two codes; arrays/units remain distinct');
assert.equal(hvac.devices[0].issues.length,2);
assert.equal(hvac.devices[0].severity,'alarm');
assert.equal(hvac.unassigned.length,2,'FSS must remain a segment alert even if supplied with a unit field');
assert(hvac.unassigned.some(t=>t.issues.some(i=>i.code==='FSS')));
assert(!hvac.devices.some(t=>t.issues.some(i=>i.code==='FSS')));
assert.equal(projectNotificationHvacs({...review,sourceWarnings:['Unavailable source']})!.partial,true);
const filtered=renderToStaticMarkup(<HvacIssueDisclosure review={hvac} array={4}/>);
assert(filtered.includes('2 mapped HVAC targets'));
assert(!filtered.includes('Array 5'));
assert(!filtered.includes('<details class="hvac-issue-disclosure" open'),'Collapsed by default');
assert(filtered.includes('critical · alarm · warning · unknown'),'Severities remain visible before expansion');
const one=renderToStaticMarkup(<HvacIssueDisclosure review={hvac} issueKeys={[review.groups.find(g=>g.code==='ENV-1')!.id]}/>);
assert(one.includes('1 mapped HVAC target ·'));
assert(!one.includes('HVAC fan warning'));
assert.equal(JSON.stringify(review),before,'Projection/UI must not change source faults');
assert(review.guidanceGaps!.find(g=>g.code==='ENV-UNKNOWN')!.missing.includes('Plain-language title'));
assert(renderToStaticMarkup(<NotificationGuidanceAudit gaps={review.guidanceGaps}/>).includes('approved manual'));
const complete=structuredClone(review.groups[0]);
complete.documentedClearing='Documented condition';
complete.troubleshooting={actions:[],validation:[],clearing:[],sources:[],safety:[],field:[]};
for(const key of ['actions','validation'] as const)complete.troubleshooting[key]=[{text:'Reference step',advisory:false,targetIds:complete.targets.map(t=>t.id)}];
assert.deepEqual(auditNotificationGuidance({groups:[complete]}),[]);
complete.troubleshooting.actions[0].advisory=true;
assert(auditNotificationGuidance({groups:[complete]})[0].missing.includes('Fault-specific actions'),'Generic fallback is not verified guidance');

const issues=emptyDetails().issues;issues.quality='live';issues.observedAt=stamp;
issues.findings=review.groups.map(g=>({code:g.code,title:g.title,category:g.category==='HVAC / Environmental'?'hvac':'battery',
  severity:g.severity==='critical'?'alarm':g.severity,targetCount:g.targets.length,targets:[],targetRows:g.targets.map((t,i)=>({
    id:`target-${t.array}-${t.location?.unit??'cs'}`,label:t.label,array:t.array,string:null,bpc:null,cell:null,pcs:null,segment:2,hvacUnit:t.location?.unit??null
  }))}));
attachFleetHvacs(issues);
assert.equal(issues.hvacReview!.devices.length,3);
issues.findings[0].targetCount+=1;attachFleetHvacs(issues);assert(issues.hvacReview!.partial);
issues.findings[0].targetCount-=1;
const missing=structuredClone(issues);
missing.findings=missing.findings.filter(f=>f.category==='hvac').map(f=>({...f,targetRows:[]}));
attachFleetHvacs(missing);
assert(renderToStaticMarkup(<HvacIssueDisclosure review={missing.hvacReview}/>).includes('alarm'),'Missing target details must not hide alarm severity');
const fleetHtml=renderToStaticMarkup(<FleetIssues issues={issues} array={null}/>);
assert(fleetHtml.includes('HVAC &amp; environmental issues'));
for(const Component of [LegacyNotificationReviewPanel,LegacyCorrectiveActionsWorkspace]){
  const html=renderToStaticMarkup(<Component review={review}/>);
  assert(html.includes('HVAC &amp; environmental issues'));
  assert(html.includes('Fault documentation review'));
  assert(!html.includes('<details class="hvac-issue-disclosure" open'));
}
for(const Component of [NotificationReviewPanel,CorrectiveActionsWorkspace]){
  const html=renderToStaticMarkup(<Component review={review}/>);
  assert(html.includes('HVAC / Environmental'),'Shared category layout retains HVAC classification');
  assert(html.includes('Fault documentation review'));
  assert(!/<details[^>]*class="ca-category"[^>]*open/.test(html),'Shared HVAC category starts collapsed');
}
const site={siteId:'test',blockId:'1',blockIndex:1,stationCode:'TEST',name:'Test'};
const broker=new FleetBroker([site]);
broker.accept('test',{...site,schema:'prizm-site-summary-v1',stale:false,observedAt:stamp,metrics:emptyMetrics(),details:{...emptyDetails(),issues}});
const mobile=renderToStaticMarkup(<MobileView view={broker.view(new Set(['test']))} selected="test" tab="issues" onSelect={()=>{}} onTab={()=>{}}/>);
assert(mobile.includes('HVAC &amp; environmental issues'));
assert(!mobile.includes('Original codes'));
assert(!mobile.includes('Affected HVAC units'),'No unit-first list ahead of the fault rows');
assert(mobile.includes('hvac-fault-row'));
assert(mobile.includes('Reported affected target'));
assert(!mobile.includes('<details class="hvac-issue-disclosure" open'));
const faultFirst=renderToStaticMarkup(<HvacIssueDisclosure review={issues.hvacReview}>
  {issues.findings.filter(f=>f.category==='hvac').map(f=><HvacFaultRow key={f.code} finding={f}/>)}
</HvacIssueDisclosure>);
assert(faultFirst.includes('4 code groups'));
assert(!faultFirst.includes('hvac-originals'));
assert(!faultFirst.includes('<details class="hvac-fault-row" open'),'Fault target tables also start collapsed');
for(const f of issues.findings.filter(f=>f.category==='hvac')){
  assert(faultFirst.includes(f.title));assert(faultFirst.includes(f.code));
  for(const t of f.targetRows!)assert(faultFirst.includes(t.label));
}
const fan=issues.findings.find(f=>f.code==='ENV-2')!;
const arrayFour=renderToStaticMarkup(<HvacFaultRow finding={fan} array={4}/>);
assert(arrayFour.includes('Array 4'));assert(!arrayFour.includes('Array 5'));
assert(arrayFour.includes('2 targets'));
assert(renderToStaticMarkup(<HvacFaultRow finding={{...fan,targetCount:fan.targetCount+2}}/>).includes('2 additional targets'));
process.env.PRIZM_HVAC_ISSUE_REVIEW='false';
assert.equal(projectNotificationHvacs(review),undefined);attachFleetHvacs(issues);assert.equal(issues.hvacReview,undefined);
const legacy=renderToStaticMarkup(<LegacyNotificationReviewPanel review={{...review,hvacReview:undefined}}/>);
assert(!legacy.includes('HVAC &amp; environmental issues'));
assert(legacy.includes('HVAC fan warning'),'Rollback keeps original code rows');
delete process.env.PRIZM_HVAC_ISSUE_REVIEW;
console.log('HVAC grouping: identity, FSS separation, filters, partial coverage, guidance gaps, desktop/mobile and rollback passed.');
