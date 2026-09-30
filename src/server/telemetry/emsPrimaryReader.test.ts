import assert from 'node:assert/strict';
import {createEmsPrimaryReader,primaryReaderEnabled} from './emsPrimaryReader';
import {recoveryTelemetryBroker} from '../domainBrokers/recoveryTelemetry';
import {recoveryObservation} from '../security/readOnlyTelemetryService';
const originalFetch=globalThis.fetch;
const prior=process.env.PRIZM_PRIMARY_EMS_READER;
delete process.env.PRIZM_PRIMARY_EMS_READER;assert.equal(primaryReaderEnabled(),false);
process.env.PRIZM_PRIMARY_EMS_READER='true';assert.equal(primaryReaderEnabled(),true);
process.env.PRIZM_PRIMARY_EMS_READER='false';assert.equal(primaryReaderEnabled(),false);
if(prior===undefined)delete process.env.PRIZM_PRIMARY_EMS_READER;else process.env.PRIZM_PRIMARY_EMS_READER=prior;
const now=Date.now(),site={profileId:'fixture',stationCode:'FIXTURE',blockIndex:1,emsBaseUrl:'http://fixture.invalid/turtle'};
const data={blockReport:{arrayReport:{1:{arrayIndex:1,stringReport:{2:{arrayIndex:1,stringIndex:2,timeStamp:String(now-2000),stringData:{stringConnectionState:'ONLINE',positiveContactorClosed:true,negativeContactorClosed:true,contactorsCloseExpected:true}}}}}}};
let calls=0;
globalThis.fetch=async(input,init)=>{calls++;assert.equal(String(input),site.emsBaseUrl+'/tools/report/ems/lastCall.json');assert.equal(init?.method,'GET');return Response.json(data);};
const reader=createEmsPrimaryReader(()=>site);
try {
  const [a,b]=await Promise.all([reader.read(),reader.read()]);assert.equal(calls,1);assert.deepEqual(a.data,data);assert.deepEqual(b.data,data);
  assert.deepEqual(recoveryObservation(recoveryTelemetryBroker.read(site),site,1,2),{actual:'closed',requested:'closed',capturedAt:now-2000});
  assert.equal(reader.diagnostics().sequence,1);
} finally {reader.stop();await reader.drain();globalThis.fetch=originalFetch;}
// Fresh owner with failing provider must not issue a local-mock retry.
globalThis.fetch=async(input)=>{calls++;assert.equal(String(input),site.emsBaseUrl+'/tools/report/ems/lastCall.json');return new Response('unavailable',{status:503});};
const failed=createEmsPrimaryReader(()=>site);
try {await assert.rejects(failed.read(),/HTTP 503/);assert.equal(calls,2);}
finally {failed.stop();await failed.drain();globalThis.fetch=originalFetch;}
console.log('EMS primary reader: exact GET destination, shared acquisition, source timestamp parity, rollout/rollback flag and no mock fallback passed.');
