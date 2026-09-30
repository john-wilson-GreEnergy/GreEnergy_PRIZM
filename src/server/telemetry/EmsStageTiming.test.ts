import assert from 'node:assert/strict';
import {EmsStageTiming} from './EmsStageTiming';
let starts=0,stops=0;
const sampler=()=>{starts++;return ()=>{stops++;return {cpuMs:4,eventLoopMaxMs:20,eventLoopMeanMs:19};};};
const recorder=new EmsStageTiming(sampler,()=> '2026-09-25T00:00:00.000Z');
assert.equal(recorder.begin(1,false),null);assert.equal(starts,0);
for(let i=1;i<=35;i++){
  const sample=recorder.begin(i,true)!;
  const timing={headersMs:10,bodyReadMs:30,totalMs:40,bodyComplete:true,status:200,serverDateMs:null};
  sample.observe(timing);timing.headersMs=100;
  sample.finish({success:true,bytes:100,parseMs:2,fallback:false});
  sample.finish({success:false,bytes:null,parseMs:0,fallback:true});
}
assert.equal(starts,35);assert.equal(stops,35,'Cleanup exactly once');
const rows=recorder.snapshot();assert.equal(rows.length,30);assert.equal(rows[0].cycleId,6);assert.equal(rows[0].attempts[0].headersMs,10);
rows[0].attempts[0]={...rows[0].attempts[0],headersMs:999};assert.equal(recorder.snapshot()[0].attempts[0].headersMs,10);
assert.equal(new EmsStageTiming(()=>{throw Error('unsupported');}).begin(1,true),null);
assert.doesNotThrow(()=>new EmsStageTiming(()=>()=>{throw Error('unavailable');}).begin(1,true)!.finish({success:false,parseMs:0,bytes:null,fallback:false}));
console.log('Stage timing: opt-out, bounded metadata, detached snapshots, cleanup and observer error isolation passed.');
