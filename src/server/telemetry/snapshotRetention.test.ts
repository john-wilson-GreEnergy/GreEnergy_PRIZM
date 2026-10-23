import assert from 'node:assert/strict';
import {CoordinatorRuntime} from './CoordinatorRuntime';
import {coordinatorProfiler} from './profiler';

const previousFlag=process.env.PRIZM_SNAPSHOT_RETENTION;
try {
 for(const legacy of [false,true]) {
  process.env.PRIZM_SNAPSHOT_RETENTION=legacy?'legacy':'single';
  let copies=0,attempt=0;
  const original={cycleId:1,rows:[{soc:0,alarm:true}],toJSON(){copies++;return {cycleId:this.cycleId,rows:this.rows};}};
  const runtime=new CoordinatorRuntime(async()=>{
   attempt++;
   if(attempt===1)return {snapshot:original,successful:true};
   if(attempt===2)return {snapshot:{...original,cycleId:2,rows:[{soc:20,alarm:false}]},successful:false};
   if(attempt===3)throw Error('Acquisition failed');
   return {snapshot:null,successful:false};
  });
  runtime.requestRefresh('initial');await runtime.waitForIdle();
  assert(coordinatorProfiler.getReport().rolling.phases.some(phase=>phase.phase==='Snapshot Retention'), 'Retention timing must belong to the completed cycle');
  assert.equal(copies,legacy?2:1,'Successful publication serializes once, with an explicit legacy rollback');
  original.rows[0].soc=99;
  const read=runtime.getCurrentSnapshot()!;read.rows[0].soc=98;
  const retained=runtime.getLastSuccessfulSnapshot()!;retained.rows[0].soc=97;
  const selected=runtime.getCurrentProjection(s=>s.rows)!;
  (selected as unknown as {soc:number}[])[0].soc=96;
  assert.equal(runtime.getCurrentSnapshot()!.rows[0].soc,0,'Caller/reader mutations cannot reach owned publications');
  runtime.requestRefresh('degraded');await runtime.waitForIdle();
  assert.equal(runtime.getCurrentSnapshot()!.cycleId,2);
  assert.equal(runtime.getLastSuccessfulSnapshot()!.cycleId,1,'Degraded draft cannot replace known-good data');
  runtime.requestRefresh('throws');await runtime.waitForIdle();
  assert.equal(runtime.getCurrentSnapshot()!.rows[0].soc,0);
  runtime.requestRefresh('empty');await runtime.waitForIdle();
  assert.equal(runtime.getCurrentSnapshot()!.rows[0].alarm,true,'Fallback retains alarms and zero values');
  runtime.setCurrentSnapshot(null);
  assert.equal(runtime.getCurrentSnapshot(),null);
  assert.equal(runtime.getLastSuccessfulSnapshot()!.cycleId,1);
  runtime.stop();
 }
} finally {if(previousFlag===undefined)delete process.env.PRIZM_SNAPSHOT_RETENTION;else process.env.PRIZM_SNAPSHOT_RETENTION=previousFlag;}
console.log('Snapshot retention: single serialization, legacy parity, mutation isolation, degraded/error fallback and null seed passed.');
