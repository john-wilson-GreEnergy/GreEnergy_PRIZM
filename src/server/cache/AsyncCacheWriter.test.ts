import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {AsyncCacheWriter, writeAtomicCache} from './AsyncCacheWriter';

function gate() {let release!:()=>void; const promise = new Promise<void>(r=>{release=r;}); return {promise,release};}
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prizm-cache-writer-test-'));
try {
  const file = path.join(root, 'site-a', 'snapshot.json'), other = path.join(root, 'site-b', 'snapshot.json');
  const blocked = gate(), started = gate();
  const writes: {file:string;content:string}[] = [];
  let concurrency = 0, maximum = 0;
  const queue = new AsyncCacheWriter({write: async (file, content) => {
    concurrency++; maximum = Math.max(maximum, concurrency);
    if (!writes.length) {started.release(); await blocked.promise;}
    writes.push({file, content}); concurrency--;
  }});
  assert(queue.enqueue(file, 'old'));
  await started.promise;
  assert(queue.enqueue(file, 'intermediate'));
  assert(queue.enqueue(file, 'new'));
  assert(queue.enqueue(other, 'other-site'));
  assert.equal(queue.status().coalesced, 1);
  assert.equal(queue.status().pendingWrites, 2);
  let closed = false;
  const closing = queue.close().then(()=>{closed=true;});
  await nextTurn(); assert.equal(closed, false, 'Shutdown must wait for pending writes.');
  blocked.release(); await closing;
  assert.deepEqual(writes, [{file,content:'old'}, {file,content:'new'}, {file:other,content:'other-site'}]);
  assert.equal(maximum,1); assert.equal(queue.status().retainedBytes,0);
  assert.equal(queue.enqueue(file,'late'),false);

  const held = gate(), active = gate();
  const bounded = new AsyncCacheWriter({maxBytes:30,maxJobs:2,write:async()=>{active.release();await held.promise;}});
  assert(bounded.enqueue(file,'12345')); // 15 budgeted bytes
  await active.promise;
  assert(bounded.enqueue(other,'12345'));
  assert.equal(bounded.enqueue(path.join(root,'third'),'1'),false);
  assert.equal(bounded.enqueue(file,'too-large-for-the-budget'),false);
  assert(bounded.status().retainedBytes <= 30);
  held.release(); await bounded.drain();
  assert.equal(bounded.status().unresolvedFailures,2, 'Old successful writes cannot clear newer rejections.');
  await assert.rejects(bounded.close(), /could not be saved/);

  let fail = true;
  const recovery = new AsyncCacheWriter({write:async()=>{if(fail)throw new Error('fixture disk failure');},onError:()=>{throw new Error('logging failure');}});
  recovery.enqueue(file,'failed'); await recovery.drain();
  assert.equal(recovery.status().failed,1);
  assert.equal(recovery.status().unresolvedFailures,1);
  fail = false; recovery.enqueue(file,'recovered'); await recovery.close();
  assert.equal(recovery.status().unresolvedFailures,0);
  const preparation = new AsyncCacheWriter();
  preparation.recordPreparationFailure(file, new Error('serialization fixture'));
  await assert.rejects(preparation.close(), /could not be saved/);

  const old = JSON.stringify({cycleId:1,value:'old'});
  await writeAtomicCache(file,old);
  const fresh = JSON.stringify({cycleId:2,value:'Δ'.repeat(100_000),sourceAt:123});
  let replacing = true;
  const replacement = writeAtomicCache(file,fresh).finally(()=>{replacing=false;});
  while (replacing) {
    const text = await fs.readFile(file,'utf8');
    assert.ok(text===old || text===fresh, 'Readers must see a complete old or new file.');
    JSON.parse(text);
  }
  await replacement;
  assert.equal(await fs.readFile(file,'utf8'),fresh);
  assert.deepEqual(await fs.readdir(path.dirname(file)),['snapshot.json']);
  await assert.rejects(writeAtomicCache(path.dirname(file),'bad'),/not a regular file/);
  assert.equal(await fs.readFile(file,'utf8'),fresh, 'Failed replacement preserves prior cache.');
  await assert.rejects(writeAtomicCache('relative.json','bad'),/absolute/);
  console.log('Async cache writer: ordered/coalesced/site-pinned writes, bounded bytes/jobs, shutdown drain, failure visibility/recovery, immutable atomic JSON and temporary cleanup passed.');
} finally {await fs.rm(root,{recursive:true,force:true});}
