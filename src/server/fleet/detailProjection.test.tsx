import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {fleetDetailFixture} from './fleetDetailFixture';
import {buildFleetDetails} from './detailProjection';
import {parseFleetDetails,ageFleetDetails} from './detailValidation';
import {SiteOverview} from '../../fleet/SiteOverview';
import {emptyMetrics,type SiteView} from '../../core/fleet/model';
const now=Date.now(),stamp=new Date(now).toISOString();
const fixture=fleetDetailFixture('TEST',stamp),details=buildFleetDetails(fixture.view,fixture.snapshot);
assert.deepEqual(parseFleetDetails(details),details);
assert.equal(details.arrays.length,8);assert.equal(details.sensors.trips,1);assert.equal(details.sensors.known,640);
assert.equal(details.sensors.active[0].status,'TRIPPED');
assert.equal(details.sensors.active[0].findings?.[0],'Heat sensor physical trip: TRIPPED');
assert.equal(details.sensors.active[0].occurredAt,new Date(now-120000).toISOString());
assert.equal(details.sensors.active[0].source,'firstresponder_v1');
const communications=structuredClone(fixture);
communications.snapshot.normalized.sensors.find(s=>s.heatStatus==='TRIPPED')!.heatCommunicating=false;
const comm=buildFleetDetails(communications.view,communications.snapshot);
assert.equal(comm.sensors.trips,0,'Communication failure must not count as a confirmed trip');
assert.equal(comm.sensors.active[0].condition,'communication');assert.equal(comm.sensors.active[0].status,'TRIPPED','Preserve last reported status without asserting it current');
const otherFault=structuredClone(fixture);otherFault.snapshot.normalized.sensors[0].gasStatus='TROUBLE';
const reported=buildFleetDetails(otherFault.view,otherFault.snapshot);
assert.equal(reported.sensors.trips,1);assert(reported.sensors.active.some(t=>t.status==='TROUBLE' && t.condition==='reported-status'));
const hot=structuredClone(fixture);Object.assign(hot.snapshot.normalized.sensors[0],{temperatureStatus:'HIGH',temperatureCommunicating:true,temperatureValue:40,temperatureUnit:'C'});
assert(buildFleetDetails(hot.view,hot.snapshot).sensors.active.some(t=>t.message==='High temperature reported: 104 °F.'));
parseFleetDetails(comm);parseFleetDetails(reported);
const absentSensor=structuredClone(fixture);Object.assign(absentSensor.snapshot.normalized.sensors[0],{fireSuppressionStatus:'NOT_INSTALLED',fireSuppressionCommunicating:false});
assert.equal(buildFleetDetails(absentSensor.view,absentSensor.snapshot).sensors.active.length,1,'Not installed is not a communication fault');
assert.equal(details.issues.categories.battery.alarms,1);assert.equal(details.issues.categories.battery.warnings,3);
assert.equal(details.issues.categories.availability.warnings,2);assert.equal(details.issues.categories.hvac.warnings,2);
const duplicates=structuredClone(fixture);duplicates.view.notificationReview.groups.push(duplicates.view.notificationReview.groups[0]);
assert.equal(buildFleetDetails(duplicates.view,duplicates.snapshot).issues.categories.battery.alarms,1,'Deduplicate targets across notification groups');
const mismatched=structuredClone(fixture);mismatched.snapshot.siteIdentity.stationCode='OTHER';
const wrong=buildFleetDetails(mismatched.view,mismatched.snapshot);
assert.equal(wrong.arrays[0].voltageMv.average,null);assert.equal(wrong.sensors.trips,null,'Do not mix site snapshots');
const foreign=structuredClone(fixture);foreign.snapshot.normalized.sensors.forEach(s=>s.stationCode='OTHER');
assert.equal(buildFleetDetails(foreign.view,foreign.snapshot).sensors.total,0);
const unknown=structuredClone(fixture);unknown.snapshot.normalized.sensors.forEach(s=>s.segmentCommunicating=false);
assert.equal(buildFleetDetails(unknown.view,unknown.snapshot).sensors.trips,null,'Unknown is not zero trips');
const sensors=structuredClone(fixture);sensors.snapshot.normalized.sensors.forEach(s=>{s.heatStatus='UNKNOWN';s.gasStatus='UNKNOWN';s.smokeStatus='UNKNOWN';s.fireSuppressionStatus='UNKNOWN';});
assert.equal(buildFleetDetails(sensors.view,sensors.snapshot).sensors.trips,null);
const ranges=structuredClone(fixture);
ranges.snapshot.normalized.strings=[
 {arrayNumber:1,stringNumber:1,minCellVoltageMv:3100,avgCellVoltageMv:3120,maxCellVoltageMv:3140,minCellTempC:10,avgCellTempC:12,maxCellTempC:14},
 {arrayNumber:1,stringNumber:2,minCellVoltageMv:3300,avgCellVoltageMv:3320,maxCellVoltageMv:3340,minCellTempC:20,avgCellTempC:22,maxCellTempC:24},
 {arrayNumber:1,stringNumber:3,segmentType:'CollectionSegment',minCellVoltageMv:65000,avgCellVoltageMv:65000,maxCellVoltageMv:65000,minCellTempC:500,avgCellTempC:500,maxCellTempC:500},
 {arrayNumber:1,stringNumber:4,stalePreserved:true,minCellVoltageMv:60000,avgCellVoltageMv:60000,maxCellVoltageMv:60000},
];
const range=buildFleetDetails(ranges.view,ranges.snapshot).arrays[0];
assert.equal(range.voltageMv.delta,240,'Array extrema, not largest single-string delta');assert.equal(range.voltageMv.average,3220);
assert.equal(range.temperatureC.delta,14);assert.equal(range.temperatureC.average,17);assert.equal(range.temperatureC.partial,true);
const aged=ageFleetDetails(details,now+15000,true);
assert.equal(aged.arrays[0].quality,'stale');assert.equal(aged.arrays[0].pcsQuality,'stale');assert.equal(aged.issues.quality,'stale');assert.equal(aged.sensors.quality,'stale');
assert.equal(details.arrays[0].quality,'live','Aging does not mutate snapshot');
assert.equal(ageFleetDetails(details,now,false).arrays[0].quality,'stale');
const old=buildFleetDetails({...fixture.view,notificationReview:undefined},fixture.snapshot);
assert.equal(old.issues.categories.battery.alarms,null,'Legacy collectors do not invent fault categories');
const multiple=structuredClone(fixture);multiple.view.pcsSummary.push({...multiple.view.pcsSummary[0],pcsIndex:2});
assert.equal(buildFleetDetails(multiple.view,multiple.snapshot).arrays[0].rotation,'UNKNOWN');
assert.equal(parseFleetDetails(undefined).sensors.trips,null);
const malformed=structuredClone(details);malformed.arrays.push(malformed.arrays[0]);assert.throws(()=>parseFleetDetails(malformed),/Duplicate/);
const oversized=structuredClone(details);oversized.issues.findings=Array(61).fill(details.issues.findings[0]);assert.throws(()=>parseFleetDetails(oversized),/list/);
const badRange=structuredClone(details);badRange.arrays[0].voltageMv.delta=1;assert.throws(()=>parseFleetDetails(badRange),/extrema/);
const site:SiteView={siteId:'test',blockId:'1',stationCode:'TEST',blockIndex:1,name:'Test site',status:'current',lastReceivedAt:stamp,observedAt:stamp,ageMs:0,metrics:emptyMetrics(),details};
const html=renderToStaticMarkup(<SiteOverview site={site} focused={false} onFocus={()=>{}}/>);
for(const text of ['Site one-line','Cell temperature · °F','Cell voltage','HVAC / Environmental','Safety sensor status','Contactors / Rotation','Show all arrays for Test site','Array 8','Reported sensor conditions','Heat sensor physical trip: TRIPPED','firstresponder_v1','Trip timestamp'])assert(html.includes(text),text);
assert(!html.includes('°C'));assert(html.includes('72.3'),'22.4 Celsius is displayed as 72.3 Fahrenheit');assert(html.includes('6.8'),'3.8 Celsius delta becomes 6.8 Fahrenheit without adding 32');
assert(!html.includes('NaN'));assert(!html.includes('undefined'));
const absent=renderToStaticMarkup(<SiteOverview site={{...site,details:undefined}} focused onFocus={()=>{}}/>);
assert(absent.includes('Detailed issue coverage is unavailable'));assert(absent.includes('Array topology has not been supplied'));
if(process.argv[2] && process.argv[3]){
 const view=JSON.parse(readFileSync(process.argv[2],'utf8')),snapshot=JSON.parse(readFileSync(process.argv[3],'utf8'));
 const live=buildFleetDetails(view,snapshot);parseFleetDetails(live);
 assert(live.arrays.length>0);assert(live.arrays.some(a=>a.voltageMv.average!==null));
 console.log(JSON.stringify({capturedCanonicalParity:{arrays:live.arrays.length,firstArray:live.arrays[0],sensors:live.sensors,issueQuality:live.issues.quality}}));
}
console.log('Fleet detailed projection, identity, sensor quality, coverage, bounds and rendering tests passed');
