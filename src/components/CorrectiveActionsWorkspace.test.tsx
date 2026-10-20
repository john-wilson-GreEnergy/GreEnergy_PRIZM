import React from 'react';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {LegacyCorrectiveActionsWorkspace as CorrectiveActionsWorkspace,filterIssueGroups} from './LegacyCorrectiveActionsWorkspace';
import {buildNotificationReview} from '../server/notifications/notificationReview';
import {correctiveReviewPresentation} from '../lib/operationsReview';
import {CorrectiveBpcWorkspace} from './CorrectiveBpcWorkspace';
import {projectNotificationBpcs} from '../server/notifications/notificationBpcs';

const review=buildNotificationReview([
  ...Array.from({length:30},(_,i)=>({code:'2074',severity:'warning',affected:[{arrayIndex:1,stringIndex:2,batteryPackIndex:3,cellGroupIndex:i+1}]})),
  {code:'2073',severity:'warning',affected:[{arrayIndex:1,stringIndex:2,batteryPackIndex:3,cellGroupIndex:1}]},
  {code:'1003',severity:'alarm',arrayNumber:2,stringNumber:5},
  {code:'2003',severity:'warning',arrayNumber:2,stringNumber:5},
  {code:'CONTACTOR',title:'Contactors open',severity:'alarm',arrayNumber:1,stringNumber:4},
  {code:'UNMAPPED',title:'Unmapped notification',severity:'unknown'},
],'2026-10-15T16:30:00Z');
const before=JSON.stringify(review);
const live={snapshot:{normalized:{notificationReview:review}},isInitialLoading:false,isPollingEnabled:true,isTerminated:false};
assert.equal(correctiveReviewPresentation(live).review,review,'live adapter must preserve canonical object identity');
assert.equal(correctiveReviewPresentation(live).stale,false);
for(const change of [{error:'failed'},{dataQualityWarning:'Source unavailable'},{isPollingEnabled:false},{isTerminated:true}]){
  const retained=correctiveReviewPresentation({...live,...change});
  assert.equal(retained.review,review);assert(retained.stale);assert(retained.error);
}
assert(correctiveReviewPresentation({...live,snapshot:{...live.snapshot,liveStatus:{stale:true}}}).stale);
assert.equal(correctiveReviewPresentation({...live,snapshot:null,isInitialLoading:true}).review,undefined);
const all={query:'',severity:'all',array:'all',category:'all'};
assert.equal(filterIssueGroups(review.groups,all).length,review.groups.length);
assert.equal(filterIssueGroups(review.groups,{...all,query:' 2074 '}).length,1);
assert.equal(filterIssueGroups(review.groups,{...all,query:'bpc 3'}).length,0,'equipment search belongs in the separate target filter');
assert.equal(filterIssueGroups(review.groups,{...all,array:'2'}).length,2);
assert.equal(filterIssueGroups(review.groups,{...all,severity:'unknown'}).length,1);
assert.equal(filterIssueGroups(review.groups,{...all,severity:'alarm',array:'2'}).length,1);
assert.equal(filterIssueGroups(review.groups,{...all,category:'no such category'}).length,0);
assert.equal(review.groups.find(g=>g.code==='2074')?.tableRows?.length,1,'30 cell faults remain consolidated to one string row');
const html=renderToStaticMarkup(<CorrectiveActionsWorkspace review={review}/>);
for(const content of ['Corrective actions','Contactors &amp; rotation','Unknown severity:','whole group','These are not unique BPC or replacement counts','Display','Severity','Read-only review'])assert(html.includes(content),content);
assert(!html.includes('String requested'),'availability issues are separate from equipment');
assert(html.includes('Unmapped notification'),'unknown severity must remain visible');
assert(!html.includes('Troubleshooting &amp; resolution'),'details mount only on expansion');
assert.equal(JSON.stringify(review),before,'presentation must not mutate canonical data');
const bpcHtml=renderToStaticMarkup(<CorrectiveBpcWorkspace review={{...review,bpcReview:projectNotificationBpcs(review,{stationCode:'TEST',blockIndex:1})}} array="all" query=""/>);
assert.equal((bpcHtml.match(/<details class="prizm-bpc-list">/g)||[]).length,2,'Both BPC tables start collapsed');
assert(!bpcHtml.includes('<details class="prizm-bpc-list" open'));
assert(bpcHtml.includes('Unique BPC list'));
assert(bpcHtml.includes('unique BPC candidates'),'Counts remain visible outside collapsed rows');
assert(bpcHtml.includes('Review Array 1 String 2 BPC 3'),'Per-device drilldown remains available');
const missing=renderToStaticMarkup(<CorrectiveActionsWorkspace/>);
assert(missing.includes('An empty view does not mean the site is clear'));
const stale=renderToStaticMarkup(<CorrectiveActionsWorkspace review={{...review,sourceWarnings:['A source is unavailable']}} stale error="Refresh failed; retained evidence"/>);
assert(stale.includes('Retained snapshot'));assert(stale.includes('A source is unavailable'));assert(stale.includes('Refresh failed; retained evidence'));
const empty=renderToStaticMarkup(<CorrectiveActionsWorkspace review={buildNotificationReview([],review.capturedAt)}/>);
assert(empty.includes('Check source health before treating this as an all-clear'));
// Keep every existing destination represented without importing the app or starting acquisition.
const app=readFileSync(new URL('../App.tsx',import.meta.url),'utf8');
const ids=[...app.matchAll(/^  "([a-z-]+)": \{ ?label:/gm)].map(m=>m[1]);
const navigation=readFileSync(new URL('../workspaces/OperationsShell.tsx',import.meta.url),'utf8');
assert.equal(ids.length,17);
assert(ids.includes('site-analytics'));
for(const id of ids)assert(navigation.includes(`id:'${id}'`),`Navigation missing ${id}`);
console.log('Operations workspace: filters, canonical count preservation, navigation parity, stale/unknown/empty states passed.');
