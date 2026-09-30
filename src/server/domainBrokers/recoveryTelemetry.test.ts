import assert from 'node:assert/strict';
import {RecoveryTelemetryBroker, recoveryTelemetryBroker, recoveryTelemetrySource, type RecoveryAcquisition} from './recoveryTelemetry';
import {recoveryObservation, readOnlyTelemetry} from '../security/readOnlyTelemetryService';
import {contactorPolicyContext} from '../security/contactorAccess';
import {applyCanonicalStringSnapshot} from '../normalizers/canonicalStringSnapshot';

const now = Date.now(), site = {profileId:'fixture',stationCode:'FIXTURE',blockIndex:1,emsBaseUrl:'http://fixture.invalid/turtle'};
const entry = {arrayIndex:1,stringIndex:2,timeStamp:String(now-2000),stringData:{stringConnectionState:'NEARLINE',positiveContactorClosed:false,negativeContactorClosed:false,contactorsCloseExpected:true}};
const data = {blockReport:{arrayReport:{1:{arrayIndex:1,stringReport:{2:entry}}}}};
const acquisition: RecoveryAcquisition = {cycleId:1,startedAt:now-3000,acquiredAt:now,site,success:true,fallbackUsed:false,attemptUrl:site.emsBaseUrl+'/tools/report/ems/lastCall.json',data};
const broker = new RecoveryTelemetryBroker();
assert.equal(broker.read(site),null,'No disk/cache hydration');
assert(broker.publish(acquisition,site));
const snapshot = broker.read(site)!;
assert.deepEqual(broker.diagnostics(now),{available:true,cycleId:1,publishedAt:new Date(now).toISOString(),publicationAgeMs:0,strings:1,eligible:1,stale:0,ambiguous:0,unavailable:0,minObservationAgeMs:2000,maxObservationAgeMs:2000});
assert.equal(broker.diagnostics(now+13000).stale,1);
assert.equal(broker.diagnostics(now+13000).eligible,0);
assert.deepEqual(recoveryObservation(snapshot,site,1,2,now),{actual:'open',requested:'closed',capturedAt:now-2000});
const bulk = applyCanonicalStringSnapshot([{arrayNumber:1,stringNumber:2}],{lastCall:data}).strings[0];
assert.deepEqual(snapshot.normalized.strings[0].contactorObservation,bulk.contactorObservation,'Bulk and early views use identical authority and timestamp');
const policy = contactorPolicyContext({siteId:'fixture',blockId:'1'},readOnlyTelemetry(snapshot,site,now),now);
assert.deepEqual(policy.targets,[{id:'array:1:string:2',kind:'string'}]);
assert.equal(broker.read({...site,stationCode:'OTHER'}),null);
assert.throws(()=>recoveryObservation(snapshot,{...site,stationCode:'OTHER'},1,2,now),/site/);
assert.throws(()=>recoveryObservation(snapshot,site,1,2,now+13000),/feedback/,'Original device age still expires at 15 seconds');
assert.throws(()=>{(snapshot.normalized.strings as unknown as unknown[]).push({});});
assert(Object.isFrozen(snapshot.normalized.strings[0].contactorObservation));
entry.stringData.positiveContactorClosed = true;
assert.equal(snapshot.normalized.strings[0].contactorObservation?.positiveContactorClosed,false,'Raw cache mutation cannot refresh/change published evidence');
entry.stringData.positiveContactorClosed = false;
assert.equal(broker.publish({...acquisition,acquiredAt:now+1},site),false,'Same cycle cannot be restamped');
assert.equal(broker.publish({...acquisition,cycleId:0},site),false);
assert.strictEqual(broker.read(site),snapshot);

for (const override of [{success:false},{fallbackUsed:true},{attemptUrl:'http://localhost:3000/mock'},
  {site:{...site,profileId:'OTHER'}},{data:{}},{data:{blockReport:{arrayReport:{1:{arrayIndex:2,stringReport:{2:entry}}}}}},
  {data:{blockReport:{arrayReport:{1:{arrayIndex:1,stringReport:{3:entry}}}}}},
  {data:{blockReport:{arrayReport:{1:{arrayIndex:1,stringReport:{'02':entry}}}}}},
  {startedAt:now+1},{acquiredAt:NaN},{acquiredAt:8640000000000001}]) {
  const b = new RecoveryTelemetryBroker();b.publish(acquisition,site);
  assert.equal(b.publish({...acquisition,cycleId:2,...override},site),false);
  assert.equal(b.read(site),null,'Failed current acquisition must not retain eligible old evidence');
}
const switched = new RecoveryTelemetryBroker();
assert.equal(switched.publish(acquisition,{...site,emsBaseUrl:'http://other.invalid/turtle'}),false);
for (const change of [{timeStamp:String(now-15000)},{timeStamp:String(now+1)},{timeStamp:undefined},
  {stringData:{...entry.stringData,negativeContactorClosed:true}},
  {stringData:{...entry.stringData,stringConnectionState:'NOT_COMMUNICATING'}}]) {
  const b = new RecoveryTelemetryBroker();
  assert(b.publish({...acquisition,data:{blockReport:{arrayReport:{1:{arrayIndex:1,stringReport:{2:{...entry,...change}}}}}}},site));
  assert.throws(()=>recoveryObservation(b.read(site),site,1,2,now));
}
// Missing target changes the same topology hash used by durable receipts.
const changed = new RecoveryTelemetryBroker();
changed.publish({...acquisition,data:{blockReport:{arrayReport:{1:{arrayIndex:1,stringReport:{1:{...entry,stringIndex:1}}}}}}},site);
assert.notEqual(contactorPolicyContext({siteId:'fixture',blockId:'1'},readOnlyTelemetry(changed.read(site),site,now),now).topologyRevision,policy.topologyRevision);

let legacyReads = 0;const legacy = () => {legacyReads++;return {legacy:true};};
assert.equal(recoveryTelemetrySource(undefined,site,legacy),null);
assert.equal(legacyReads,0,'No implicit legacy fallback when early source unavailable');
recoveryTelemetryBroker.publish(acquisition,site);
assert(recoveryTelemetrySource(undefined,site,legacy));
assert.deepEqual(recoveryTelemetrySource('false',site,legacy),{legacy:true});
assert.equal(legacyReads,1);
console.log('Recovery early publication: exact site/target, primary-only provenance, immutable source time, bulk parity, freshness, topology revision, failure clearing and explicit rollback passed.');
