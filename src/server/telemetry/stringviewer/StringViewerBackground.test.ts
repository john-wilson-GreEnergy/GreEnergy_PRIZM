import assert from 'node:assert/strict';
import {StringViewerBackground, useBackgroundStringViewer} from './StringViewerBackground';
import {StringViewerScheduler} from './StringViewerScheduler';
import {StringViewerCache} from './StringViewerCache';
import type {StringViewerSchedulerConfig} from './StringViewerTypes';

const config: StringViewerSchedulerConfig = {mode:'scheduled',maxConcurrency:2,batchBudget:2,hotTtlMs:100,warmTtlMs:100,coldTtlMs:100,forceFullRefresh:false};
const rows = [{arrayNumber:1,stringNumber:2,stringKey:'A1-S2',communicating:true}];
const url = (base: string, n = 2) => `${base}/tools/monitor/ems/stringviewer/array/1/${n}/data`;
function deferred() {let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};}

async function freshnessAndCoalescing() {
  let now=10_000,calls=0;
  const gate=deferred(),cache=new StringViewerCache<{voltage:number}>(()=>now);
  const scheduler=new StringViewerScheduler(config,async(_candidate,base)=>{calls++;await gate.promise;return {success:true,value:{voltage:3200},sourceUrl:url(base),sourceObservationAt:new Date(9_950).toISOString(),latencyMs:50};},cache);
  const owner=new StringViewerBackground(scheduler),original=structuredClone(rows);
  assert.equal((await owner.read(rows,1,'http://fixture','site-a',true)).size,0,'First publication does not wait for details');
  assert.equal((await owner.read(rows,2,'http://fixture','site-a',true)).size,0);
  assert.equal(calls,1,'No overlapping batch or duplicate fetch during acquisition');
  gate.resolve();await owner.drain();
  assert.equal(owner.peek(rows,'http://fixture','site-a').size,1);
  assert.equal(owner.peek(rows,'http://fixture','another-site').size,0);
  assert.equal(owner.peek(rows,'http://other','site-a').size,0);
  assert.equal(calls,1,'Diagnostic cache peek never schedules acquisition');
  let entries=await owner.read(rows,3,'http://fixture','site-a',true);
  assert.equal(entries.get('A1-S2')?.ageMs,50);
  assert.equal(entries.get('A1-S2')?.cycleId,1,'Cached observation keeps producing cycle');
  assert.equal(entries.get('A1-S2')?.sourceObservationAt,new Date(9_950).toISOString());
  assert.equal(calls,1,'Fresh cache uses existing TTL policy');
  await owner.drain();now+=100;
  entries=await owner.read(rows,4,'http://fixture','site-a',true);
  assert.equal(entries.get('A1-S2')?.stale,true,'Refreshing cannot rejuvenate cached source time');
  assert.equal(entries.get('A1-S2')?.ageMs,150);
  await owner.drain();
  assert.deepEqual(rows,original,'Acquisition never mutates caller/published rows');
  owner.stop();await owner.drain();
}

async function sourceIsolation() {
  let calls=0,active=0,maxActive=0;
  const gates=[deferred(),deferred()];
  const scheduler=new StringViewerScheduler(config,async(_candidate,base)=>{
    const index=calls++;active++;maxActive=Math.max(maxActive,active);await gates[index].promise;active--;
    return {success:true,value:{base},sourceUrl:url(base),latencyMs:1};
  });
  const owner=new StringViewerBackground(scheduler);
  await owner.read(rows,1,'http://old','old-site',true);
  assert.equal((await owner.read(rows,2,'http://new','new-site',true)).size,0);
  assert.equal(calls,1,'New site waits for old batch to drain');
  gates[0].resolve();await owner.drain();
  assert.equal((await owner.read(rows,3,'http://new','new-site',true)).size,0,'Old result is discarded before new acquisition');
  assert.equal(calls,2);gates[1].resolve();await owner.drain();
  const next=await owner.read(rows,4,'http://new','new-site',true);
  assert.deepEqual(next.get('A1-S2')?.value,{base:'http://new'});
  assert.equal(maxActive,1);owner.stop();await owner.drain();
}

async function rollbackAndShutdown() {
  assert.equal(useBackgroundStringViewer(undefined),true);
  assert.equal(useBackgroundStringViewer('false'),false);
  const gate=deferred();let done=false,calls=0;
  const owner=new StringViewerBackground(new StringViewerScheduler(config,async(_c,base)=>{
    calls++;await gate.promise;return {success:true,value:{ok:true},sourceUrl:url(base),latencyMs:1};
  }));
  const pending=owner.read(rows,1,'http://fixture','same',false).then(result=>{done=true;return result;});
  await Promise.resolve();assert.equal(done,false,'Rollback restores awaited publication');
  gate.resolve();assert.equal((await pending).size,1);
  owner.stop();assert.equal((await owner.read(rows,2,'http://fixture','same',true)).size,0);assert.equal(calls,1);

  const held=deferred();let drained=false;
  const second=new StringViewerBackground(new StringViewerScheduler(config,async(_c,base)=>{await held.promise;return {success:true,value:{ok:true},sourceUrl:url(base),latencyMs:1};}));
  await second.read(rows,1,'http://fixture','same',true);second.stop();
  const drain=second.drain().then(()=>{drained=true;});await Promise.resolve();assert.equal(drained,false);
  held.resolve();await drain;assert.equal(drained,true);
}

async function workerFailureDrain() {
  const gate=deferred();let calls=0;
  const scheduler=new StringViewerScheduler(config,async(candidate,base)=>{
    calls++;if(candidate.stringIndex===1)throw new Error('mock failure');
    await gate.promise;return {success:true,value:{ok:true},sourceUrl:url(base),latencyMs:1};
  });
  const owner=new StringViewerBackground(scheduler);
  const pair=[{...rows[0],stringNumber:1,stringKey:'A1-S1'},rows[0]];
  await owner.read(pair,1,'http://fixture','same',true);
  await new Promise<void>(r=>setImmediate(r));
  await owner.read(pair,2,'http://fixture','same',true);
  assert.equal(calls,2,'Rejected worker does not release still-running sibling batch');
  gate.resolve();await owner.drain();assert.equal(owner.diagnostics().lastError,'StringViewer batch failed');
  owner.stop();
}

await freshnessAndCoalescing();await sourceIsolation();await rollbackAndShutdown();await workerFailureDrain();
console.log('StringViewer background: nonblocking publication, TTL/source time, single batch, site isolation, awaited rollback, failure drain and shutdown passed.');
