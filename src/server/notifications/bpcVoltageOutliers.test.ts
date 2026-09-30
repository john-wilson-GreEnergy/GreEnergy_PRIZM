import assert from 'node:assert/strict';
import {normalizeBpcVoltageSnapshot} from '../normalizers/bpcVoltageSnapshot';
import {calculateBpcVoltageOutliers,attachBpcVoltageOutliers} from './bpcVoltageOutliers';
import {buildNotificationReview} from './notificationReview';
import type {StringViewerCacheEntry} from '../telemetry/stringviewer/StringViewerTypes';
const now=Date.parse('2026-09-28T18:00:00Z');
const at=new Date(now).toISOString();
const map=(values:number[][])=>({batteryPacks:Object.fromEntries(values.map((cells,i)=>[String(i+1),{cellGroups:Object.fromEntries(cells.map((v,j)=>[String(j+1),{cellGroupIndex:j+1,value:String(v)}]))}]))});
function fixture():StringViewerCacheEntry {
  return {arrayIndex:1,stringIndex:2,stringKey:'A1-S2',controllerIp:null,lastAttemptAt:at,lastSuccessAt:at,sourceObservationAt:at,cacheUpdatedAt:at,ageMs:0,stale:false,success:true,failureCount:0,consecutiveFailureCount:0,latencyMs:1,sourceUrl:'fixture',cycleId:1,payloadFingerprint:null,payloadVersion:1,lastError:null,
    value:{arrayIndex:1,stringIndex:2,batteryPackCount:3,cellGroupCount:2,badReport:false,hasVoltageMap:true,hasTimestampMap:true,voltageMap:map([[3300,3300],[3400,3400],[3500,3500]]),timestampMap:map([[1,1],[1,1],[1,1]])}};
}
const entry=fixture(),before=structuredClone(entry),normalized=normalizeBpcVoltageSnapshot(entry,now),ranked=calculateBpcVoltageOutliers(normalized);
assert.equal(normalized.quality,'available');assert.equal(ranked.ranked.length,3);
const first=ranked.ranked.find(p=>p.bpc===1)!;
assert.equal(first.voltageV,6.6);assert(Math.abs(first.peerAverageV-6.9)<1e-10);assert(Math.abs(first.deviationV+0.3)<1e-10);
assert.deepEqual(entry,before,'Raw cache remains untouched');
for(const patch of [{batteryPackCount:undefined},{cellGroupCount:0},{arrayIndex:2},{badReport:true},{voltageMap:map([[3300,3300],[3400],[3500,3500]])},{voltageMap:map([[0,3300],[3400,3400],[3500,3500]])}]) {
  const test=fixture();test.value={...test.value as object,...patch};
  const result=normalizeBpcVoltageSnapshot(test,now);assert.equal(result.quality,'unavailable');assert.equal(calculateBpcVoltageOutliers(result).ranked.length,0);
}
const stale=fixture();assert.equal(normalizeBpcVoltageSnapshot(stale,now+31000).quality,'stale');
stale.success=false;assert.equal(normalizeBpcVoltageSnapshot(stale,now).quality,'stale');
const future=fixture();future.lastSuccessAt=new Date(now+1000).toISOString();assert.equal(normalizeBpcVoltageSnapshot(future,now).quality,'time unknown');
const unknown=fixture();unknown.value={...unknown.value as object,timestampMap:map([[1,1],[1],[1,1]])};assert.equal(normalizeBpcVoltageSnapshot(unknown,now).quality,'time unknown');
const findings=['1008','2008','2003'].map(code=>({code,severity:code==='1008'?'alarm':'warning',affected:[{blockIndex:1,arrayIndex:1,stringIndex:2}]}));
const review=buildNotificationReview(findings,at),baseline=structuredClone(review);
attachBpcVoltageOutliers(review,[normalized],1);
assert.equal(review.groups.filter(g=>g.tableRows?.[0].bpcOutliers?.ranked.length===3).length,2);
for(const group of review.groups) for(const row of group.tableRows??[]) delete row.bpcOutliers;
assert.deepEqual(review,baseline,'Diagnostic context changes no identities, severity, counts, metrics or evidence');
attachBpcVoltageOutliers(review,[normalized],2);
assert(review.groups.filter(g=>g.code==='2008').every(g=>g.tableRows?.[0].bpcOutliers?.quality==='unavailable'),'Cross-block data rejected');
attachBpcVoltageOutliers(review,[normalized,normalized],1);
assert(review.groups.filter(g=>g.code==='2008').every(g=>g.tableRows?.[0].bpcOutliers?.quality==='unavailable'),'Duplicate identities rejected');
console.log('BPC voltage normalization, peer-average ranking, freshness, identity and notification parity passed');
