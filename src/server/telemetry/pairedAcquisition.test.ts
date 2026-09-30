import assert from 'node:assert/strict';
import {pairedAcquisition} from './pairedAcquisition';
function deferred() {let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};}
for (const parallel of [true,false]) {
  const gate=deferred(),second=deferred();let primaryCalls=0,secondaryCalls=0,finished=false;
  const run=pairedAcquisition(async()=>{primaryCalls++;await gate.promise;return 'primary';},async()=>{secondaryCalls++;await second.promise;},parallel).then(result=>{finished=true;return result;});
  await new Promise<void>(r=>setImmediate(r));
  assert.equal(primaryCalls,1);assert.equal(secondaryCalls,parallel?1:0);assert.equal(finished,false);
  gate.resolve();await new Promise<void>(r=>setImmediate(r));assert.equal(secondaryCalls,1);assert.equal(finished,false,'Publication waits for both providers');
  second.resolve();assert.deepEqual(await run,[{status:'fulfilled',value:'primary'},{status:'fulfilled',value:undefined}]);
}
for (const parallel of [true,false]) {
  let secondaryCalls=0;
  const results=await pairedAcquisition(async()=>{throw new Error('primary failed');},async()=>{secondaryCalls++;throw new Error('secondary failed');},parallel);
  assert.equal(secondaryCalls,1);assert.equal(results[0].status,'rejected');assert.equal(results[1]?.status,'rejected');
}
assert.deepEqual(await pairedAcquisition(async()=>42,null,true),[{status:'fulfilled',value:42},null]);
console.log('Paired acquisition: independent overlap, both-provider drain, startup/rollback sequencing, failure isolation and no extra acquisitions passed.');
