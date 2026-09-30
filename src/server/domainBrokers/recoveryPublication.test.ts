import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {recoveryTelemetryBroker} from './recoveryTelemetry';
import {recoveryObservation} from '../security/readOnlyTelemetryService';

// Heavy production imports only after moving all cache/profile side effects to a fixture.
const cwd=process.cwd(), originalFetch=globalThis.fetch;
const priorMin=process.env.PRIZM_POLL_ARRAY_MIN, priorMax=process.env.PRIZM_POLL_ARRAY_MAX;
process.chdir(await mkdtemp('/tmp/prizm-recovery-publication-'));
process.env.PRIZM_POLL_ARRAY_MIN='1';process.env.PRIZM_POLL_ARRAY_MAX='1';
const {ProfileStore}=await import('../profiles/profileStore');
const originalProfile=ProfileStore.getActiveProfile;
const profile={...ProfileStore.getActiveProfile(),id:'fixture',emsHost:'fixture.invalid',emsPort:8080,turtlePath:'/turtle',stationCode:'FIXTURE',blockIndex:1,arrayCount:1,stringsPerArray:2};
ProfileStore.getActiveProfile=()=>profile;
const site={profileId:profile.id,stationCode:profile.stationCode,blockIndex:1,emsBaseUrl:'http://fixture.invalid:8080/turtle'};
const sourceTime=Date.now()-2000;
const report={blockReport:{arrayReport:{1:{arrayIndex:1,stringReport:{2:{arrayIndex:1,stringIndex:2,timeStamp:String(sourceTime),stringData:{stringConnectionState:'ONLINE',positiveContactorClosed:true,negativeContactorClosed:true,contactorsCloseExpected:true}}}}}}};
let lastCallReads=0, complete=false, release!:()=>void, entered!:()=>void;
let stopReader=()=>{};
const held=new Promise<void>(resolve=>{release=resolve;}), reached=new Promise<void>(resolve=>{entered=resolve;});
globalThis.fetch=async(input,init)=>{
  assert(!init?.method || init.method==='GET','Test must never exercise device writes');
  const url=String(input);assert(url.startsWith(site.emsBaseUrl),'No destination outside the fixture');
  if(url.endsWith('/lastCall.json')) {lastCallReads++;return Response.json(report);}
  if(url.endsWith('/status')) return new Response('OK');
  if(url.endsWith('/strings.csv')) return new Response('Array,String\n1,2\n');
  return Response.json({});
};
try {
  const {pollEmsTurtle,emsPrimaryReader}=await import('../emsTurtleClient');
  stopReader=()=>emsPrimaryReader.stop();
  const {runInTelemetryCycle}=await import('../telemetry/TelemetryCycleContext');
  const poll=runInTelemetryCycle(1,()=>pollEmsTurtle(async()=>{entered();await held;})).then(result=>{complete=true;return result;});
  try {
    await reached;
    assert.equal(complete,false,'Full cycle is deliberately held behind unrelated publication work');
    assert.equal(lastCallReads,1,'Early view reuses the single scheduled acquisition');
    assert.deepEqual(recoveryObservation(recoveryTelemetryBroker.read(site),site,1,2),{actual:'closed',requested:'closed',capturedAt:sourceTime});
    if(process.env.PRIZM_PRIMARY_EMS_READER === 'true') {
      const deadline=Date.now()+6000;
      while(lastCallReads<2 && Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
      assert.equal(lastCallReads,2,'Shared reader advances while full publication remains blocked');
      assert.equal(complete,false);
      assert.deepEqual(recoveryObservation(recoveryTelemetryBroker.read(site),site,1,2),{actual:'closed',requested:'closed',capturedAt:sourceTime},'Repeated source reports are never retimestamped');
    }
  } finally {release();await poll;}
  assert.equal(complete,true);assert.equal(lastCallReads,process.env.PRIZM_PRIMARY_EMS_READER==='true'?2:1);
  const {emsStageTiming}=await import('../telemetry/EmsStageTiming');
  const measured=process.env.PRIZM_PRIMARY_EMS_READER!=='true'&&process.env.PRIZM_EMS_STAGE_TIMING!=='false';
  assert.equal(emsStageTiming.snapshot().length,measured?1:0,'Timing hooks do not add an acquisition; opt-out collects nothing');
  if(measured){const row=emsStageTiming.snapshot()[0];assert.equal(row.success,true);assert.equal(row.attempts.length,1);assert.equal(row.attempts[0].bodyComplete,true);assert.equal(row.fallback,false);}
  console.log('Real EMS poll integration: shared primary progresses independently when enabled; rollback uses one inline read; original source timestamps, mocked GETs only.');
} finally {
  stopReader();
  ProfileStore.getActiveProfile=originalProfile;globalThis.fetch=originalFetch;process.chdir(cwd);
  if(priorMin===undefined) delete process.env.PRIZM_POLL_ARRAY_MIN;else process.env.PRIZM_POLL_ARRAY_MIN=priorMin;
  if(priorMax===undefined) delete process.env.PRIZM_POLL_ARRAY_MAX;else process.env.PRIZM_POLL_ARRAY_MAX=priorMax;
}
