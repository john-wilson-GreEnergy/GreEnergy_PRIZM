import assert from 'node:assert/strict';
import {workspaceScope,preferenceKey,readPreference,targetLink,readReviewTarget} from './workspacePreferences';
import {targetMatches,selectedTargets,correctiveCsv,printableWorklist} from './correctiveWorklist';
import {buildNotificationReview} from '../server/notifications/notificationReview';
import {projectNotificationBpcs} from '../server/notifications/notificationBpcs';

const ss3=workspaceScope({stationCode:'BHE0020',blockIndex:1},'operator')!;
const ss4=workspaceScope({stationCode:'BHE0021',blockIndex:1},'operator')!;
assert.notEqual(ss3,ss4);assert.notEqual(ss3,workspaceScope({stationCode:'BHE0020',blockIndex:1},'another operator'));
assert.notEqual(ss3,workspaceScope({stationCode:'BHE0020',blockIndex:1,activeProfileId:'other'},'operator'));
assert.equal(workspaceScope(null),null);
const stored=new Map([[preferenceKey(ss3,'filters'),JSON.stringify({query:'2074',array:'2'})]]);
const storage={getItem:(key:string)=>stored.get(key)??null};
assert.deepEqual(readPreference(storage,ss3,'filters',{query:'',array:'all'}),{query:'2074',array:'2'});
assert.deepEqual(readPreference(storage,ss4,'filters',{query:'',array:'all'}),{query:'',array:'all'});
stored.set(preferenceKey(ss3,'filters'),'{broken');assert.equal(readPreference(storage,ss3,'filters','fallback'),'fallback');
stored.set(preferenceKey(ss3,'filters'),'123');assert.equal(readPreference(storage,ss3,'filters','fallback'),'fallback');
assert.equal(readPreference({getItem:()=>{throw Error('Blocked')}},ss3,'filters','fallback'),'fallback');
const link=targetLink('http://127.0.0.1:3205/?ui=operations',ss3,'cell-history',{array:2,string:4,bpc:3});
assert.deepEqual(readReviewTarget(new URL(link,'http://localhost').search,ss3),{array:2,string:4,bpc:3});
assert.equal(readReviewTarget(new URL(link,'http://localhost').search,ss4),null);
assert(!link.includes('command'));assert(!link.includes('password'));

const affected=(string:number,cell:number)=>({blockIndex:1,arrayIndex:2,stringIndex:string,batteryPackIndex:3,cellGroupIndex:cell});
const review=buildNotificationReview([
 ...Array.from({length:30},(_,i)=>({code:'2074',severity:'warning',affected:[affected(4,i+1)]})),
 {code:'2073',severity:'warning',affected:[affected(4,1)]},
 {code:'2074',severity:'warning',affected:[affected(5,1)]},
],'2026-10-19T12:00:00Z');
const before=JSON.stringify(review),projected=projectNotificationBpcs(review,{stationCode:'BHE0020',blockIndex:1});
assert.equal(JSON.stringify(review),before,'projection does not mutate canonical review');
assert.equal(projected.balancerInventory?.total,2,'30 cells and two codes must not double count one physical BPC');
assert.deepEqual(projected.balancerInventory?.rows,[{bpc:3,chargeOnly:1,dischargeOnly:0,both:1,quantity:2}]);
assert.equal(projected.devices.length,2);
assert.equal(projected.targetIdsByDevice[projected.devices.find(d=>d.string===4)!.id].length,30);
const foreignReview=buildNotificationReview([{code:'2074',severity:'warning',affected:[affected(4,1),{...affected(4,2),blockIndex:2}]}],review.capturedAt);
const foreignProjection=projectNotificationBpcs(foreignReview,{stationCode:'BHE0020',blockIndex:1});
assert.equal(foreignProjection.devices.length,1);assert.equal(foreignProjection.targetIdsByDevice[foreignProjection.devices[0].id].length,1,'foreign block evidence must not enter the detail panel');
assert(foreignProjection.balancerInventory.partial,'foreign block targets remain unresolved, not silently assigned');
assert.equal(projected.devices.find(d=>d.string===4)?.issueCount,2);
assert(projectNotificationBpcs({...review,sourceWarnings:['Missing source']},{stationCode:'BHE0020',blockIndex:1}).balancerInventory?.partial);
const group=review.groups.find(g=>g.code==='2074')!;
assert.equal(selectedTargets(group,'2','String 4').length,30);
assert.equal(selectedTargets(group,'1','BPC 3').length,0);
assert(targetMatches(group.targets[0],'BPC 3'));assert(!targetMatches(group.targets[0],'BPC 30'));
const csv=correctiveCsv([group],'2','String 4','=site',review.capturedAt,true);
assert(csv.includes('"\'=site"'));assert(csv.includes('Retained / verify freshness'));
assert.equal(csv.split('\r\n').length,31);
const html=printableWorklist([{...group,title:'<script>alert(1)</script>'}],'2','String 4','SS3',review.capturedAt,true);
assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(html.includes('VERIFY FRESHNESS'));
console.log('Workspace review: site/account isolation, recovery, scoped links, BPC identity/deduplication and safe filtered exports passed.');
