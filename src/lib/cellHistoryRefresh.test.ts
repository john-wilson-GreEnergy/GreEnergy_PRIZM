import assert from 'node:assert/strict';
import {setTimeout as wait} from 'node:timers/promises';
import {CellHistoryRefresh} from './cellHistoryRefresh';
const results:number[] = [], failures:string[] = [], signals:AbortSignal[] = [], loading:boolean[] = [];
let resolve!: (value:number)=>void;
const request = new CellHistoryRefresh<number>(signal=>{signals.push(signal); return new Promise(done=>{resolve=done;});},
  value=>results.push(value), message=>failures.push(message), busy=>loading.push(busy), 0);
request.refresh('1'); await wait(10);
request.refresh('2'); request.refresh('3'); request.refresh('3');
assert.equal(signals.length, 1); assert.equal(signals[0].aborted, false, 'Automatic updates do not cancel useful history');
resolve(1); await wait(10);
assert.deepEqual(results, [1], 'First graph remains available while queued refresh runs');
assert.equal(signals.length, 2, 'Intermediate automatic refreshes are coalesced');
resolve(3); await wait(10);
request.refresh('3'); await wait(10); assert.equal(signals.length, 2, 'Unchanged version is not queried again');
assert.deepEqual(results,[1,3]); assert.deepEqual(failures,[]);
request.refresh('4'); await wait(10); request.dispose();
assert.equal(signals[2].aborted,true); resolve(4); await wait(10);
assert.deepEqual(results,[1,3], 'Disposed selection cannot publish a late response');
const timed = new CellHistoryRefresh<number>(signal=>new Promise((_done,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')))),
  ()=>assert.fail('Unexpected success'), message=>failures.push(message), ()=>{}, 0, 5);
timed.refresh('1'); await wait(30); timed.dispose();
assert.match(failures[0], /timed out/);
assert.deepEqual(loading.slice(0,4),[true,false,true,false]);
console.log('Cell history refresh coalescing, retained results, cancellation and timeout passed');
