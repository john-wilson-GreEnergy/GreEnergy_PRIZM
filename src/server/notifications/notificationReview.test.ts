import assert from 'node:assert/strict';
import './notificationCatalog.test';
import './notificationTargetTable.test';
import {buildNotificationReview,buildRotationStatusFindings} from './notificationReview';
import {NOTIFICATION_CATALOG} from './notificationCatalog';
const at='2026-09-28T16:00:00Z';
const finding=(string:number,severity='alarm')=>({id:`s${string}`,remediationStrategyId:'contactor-requested-closed-actual-open',subsystem:'contactor',arrayNumber:2,stringNumber:string,severity,title:'String requested closed but contactors are open',evidence:{requestedState:'closed',actualState:'open'},source:'contactor-engine'});
const input=[finding(3),finding(19),finding(27),finding(3)];
const before=JSON.stringify(input);
const review=buildNotificationReview(input,at);
assert.equal(review.groups.length,1); assert.equal(review.groups[0].targetCount,3);
assert.equal(review.totals.alarm,3); assert.equal(review.totals.targets,3);
assert.equal(review.inputTargets,4); assert.equal(JSON.stringify(input),before);
assert.equal(buildNotificationReview([...input].reverse(),at).groups[0].id,review.groups[0].id);
assert.equal(buildNotificationReview([finding(3),finding(3,'warning')],at).groups.length,2,'different severity remains visible');
const native=(code:string,cg:number)=>({severity:'warning',code,title:'Cell voltage',affected:[{arrayIndex:1,stringIndex:2,batteryPackIndex:1,cellGroupIndex:cg,label:`Array 1 / String 2 / BPC 1 / CG ${cg}`}]});
assert.equal(buildNotificationReview([native('2001',1),native('2001',2),native('2001',1)],at).totals.occurrences,2);
assert.equal(buildNotificationReview([native('2001',1),native('2002',1)],at).groups.length,2);
assert.equal(buildNotificationReview([{title:'No location',severity:'alarm'},{title:'No location',severity:'alarm'}],at).totals.targets,2,'unresolved targets must not be collapsed');
const hvac=(unit:number)=>({severity:'warning',subsystem:'hvac',remediationStrategyId:'hvac-commanded-no-current',arrayNumber:4,evidence:{deviceIp:'10.0.4.10',energySegmentNumber:1,hvacUnit:unit,commanded:true,currentA:0,hvacProfile:'dometic',fanSpeedRpm:0,pairedHvac:{hvac1:{commanded:true,currentA:0},hvac2:{commanded:false,currentA:2}}}});
const hvacs=buildNotificationReview([hvac(1),hvac(2),hvac(1)],at);
assert.equal(hvacs.groups.length,1); assert.equal(hvacs.groups[0].targetCount,2);
assert(!JSON.stringify(hvacs).includes('Fan speed (RPM)'));
assert(JSON.stringify(hvacs).includes('OFF / 2 A'));
assert.equal(buildNotificationReview([{code:'X',severity:'surprise',affected:['unresolved source']}],at).totals.unknown,1);
assert.equal(buildNotificationReview([],at).totals.groups,0);
const voltage=buildNotificationReview(['1003','2003','1008','2008'].map(code=>({code,severity:code.startsWith('1')?'alarm':'warning',title:`Code ${code}`,affected:[{arrayIndex:1,stringIndex:2}]})),at);
assert.equal(voltage.groups.length,4,'warning and alarm codes are not merged');
assert.equal(voltage.totals.occurrences,4);
for (const group of voltage.groups) {
  assert.equal(group.title,NOTIFICATION_CATALOG[group.code].name);
  assert.equal(group.section,'equipment');
  assert.equal(group.category,'String / Cell');
  assert(group.explanation?.includes('configured'));
}
assert.equal(NOTIFICATION_CATALOG['1003'].family,NOTIFICATION_CATALOG['2003'].family);
assert.equal(NOTIFICATION_CATALOG['1008'].family,NOTIFICATION_CATALOG['2008'].family);
const rotation=buildRotationStatusFindings([
  {arrayNumber:1,stringNumber:2,rotationStatus:'OUT',stale:true,timestampUtc:at},
  {arrayNumber:1,stringNumber:3,rotationStatus:'IN'},
  {arrayNumber:1,stringNumber:4,rotationStatus:'UNKNOWN'},
  {arrayNumber:1,stringNumber:5,rotationEnabled:false}
],[{arrayNumber:1,pcsIndex:1,rotationStatus:'OUT'},{arrayNumber:1,pcsIndex:2,rotationStatus:'OUT'}]);
assert.equal(rotation.length,3,'unknown/false/in-rotation do not imply out of rotation');
const sectioned=buildNotificationReview([...rotation,finding(3),{code:'PCS-CONTACTOR',title:'PCS contactor open',subsystem:'pcs',severity:'alarm',affected:[{arrayIndex:1,pcsIndex:1}]}],at);
assert(sectioned.groups.every(group=>group.section==='availability'));
assert.equal(sectioned.totals.alarm,2,'moving a fault to availability must not downgrade severity');
assert.equal(sectioned.groups.find(group=>group.code==='PRIZM-PCS-OUT-OF-ROTATION')?.targetCount,2);
assert.equal(sectioned.totals.targets,5,'PCS identity is separate from string identity');
assert(JSON.stringify(sectioned).includes('retained / verify freshness'));
console.log('Notification review grouping, identity, parity, severity and HVAC evidence tests passed');
import './notificationMetrics.test';
import './notificationTroubleshooting.test';
import './bpcVoltageOutliers.test';
