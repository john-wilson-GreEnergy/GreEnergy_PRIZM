import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {build} from 'esbuild';
import {prepareSnapshotTransfer, type SnapshotTransfer} from './snapshotTransfer';
import {SnapshotCacheWorker} from './SnapshotCacheWorker';
import {AsyncCacheWriter} from './AsyncCacheWriter';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prizm-snapshot-worker-'));
const workerFile = path.join(root, 'worker.cjs');
const file = path.join(root, 'site-a', 'snapshot.json');
await build({entryPoints:['src/server/cache/snapshotCacheWorkerEntry.ts'],outfile:workerFile,bundle:true,platform:'node',format:'cjs',packages:'external'});
const worker = new SnapshotCacheWorker(workerFile);
try {
  const shared = {value:0, off:false, missing:null, omitted:undefined, nan:NaN, infinity:Infinity, text:'Δ\n"🌡', array:[,undefined,-0,2]};
  const fixture = {cacheMeta:{cycleId:42,fetchedAt:'2026-09-28T15:00:00Z',ttlMs:15000},data:{raw:shared,normalized:shared,at:new Date('2026-09-28T15:00:00Z')}};
  process.env.PRIZM_SNAPSHOT_WORKER_VERIFY = 'true';
  for (const compact of ['true','false']) {
    process.env.PRIZM_COMPACT_TELEMETRY_CACHE = compact;
    const expected = JSON.stringify(fixture,null,compact==='false'?2:undefined);
    await worker.write(file,prepareSnapshotTransfer(fixture));
    assert.equal(await fs.readFile(file,'utf8'),expected,'Exact JSON bytes and provenance must match.');
  }
  delete process.env.PRIZM_COMPACT_TELEMETRY_CACHE;
  const captured = prepareSnapshotTransfer(fixture);
  shared.value=999;
  await worker.write(file,captured);
  assert.equal(JSON.parse(await fs.readFile(file,'utf8')).data.raw.value,0,'Queued graph must be frozen.');
  assert.equal(captured.bytes.byteLength,0,'Owned handoff buffer should transfer, not copy.');
  const good = await fs.readFile(file,'utf8');
  const corrupt = prepareSnapshotTransfer(fixture); corrupt.expectedHash='invalid';
  await assert.rejects(worker.write(file,corrupt),/parity/);
  assert.equal(await fs.readFile(file,'utf8'),good);
  // The worker is cache-specific: arbitrary classes are not accepted as canonical
  // records. Verification detects a future producer violating that contract.
  class Unsupported {toJSON(){return 'custom';}}
  await assert.rejects(worker.write(file,prepareSnapshotTransfer({data:new Unsupported()})),/parity/);
  await assert.rejects(worker.write(file,{bytes:new Uint8Array([1,2]),compact:true}),/deserialize|invalid|Unable/i);
  await worker.write(file,prepareSnapshotTransfer({data:null}));
  assert.equal(JSON.parse(await fs.readFile(file,'utf8')).data,null,'A failed job must not poison future jobs.');
  const queue = new AsyncCacheWriter<SnapshotTransfer>({write:(f,c)=>worker.write(f,c),estimateBytes:c=>c.bytes.byteLength*3});
  queue.enqueue(file,prepareSnapshotTransfer({cycleId:43}));
  queue.enqueue(file,prepareSnapshotTransfer({cycleId:44}));
  const other = path.join(root,'site-b','snapshot.json');
  queue.enqueue(other,prepareSnapshotTransfer({cycleId:45}));
  await queue.close();
  assert.equal(JSON.parse(await fs.readFile(file,'utf8')).cycleId,44);
  assert.equal(JSON.parse(await fs.readFile(other,'utf8')).cycleId,45);
  assert.equal(queue.status().retainedBytes,0);
  assert.equal(queue.status().failed,0);
  await worker.close();
  await assert.rejects(worker.write(file,prepareSnapshotTransfer({})),/closed/);

  const missing = new SnapshotCacheWorker(path.join(root,'missing.cjs'));
  await assert.rejects(missing.write(file,prepareSnapshotTransfer({})),/Cannot find module/);
  await missing.close();
  // Fault injection uses a generated in-memory worker bundle, never a device.
  const stalledFile = path.join(root,'stalled.cjs');
  await build({stdin:{contents:'setInterval(()=>{},1000);',loader:'js'},outfile:stalledFile,platform:'node'});
  const stalled = new SnapshotCacheWorker(stalledFile,100);
  await assert.rejects(stalled.write(file,prepareSnapshotTransfer({})),/timed out/);
  await stalled.close();
  console.log('Snapshot worker: JSON byte parity, frozen transfer, coalescing, site isolation, null clear, corrupt/missing worker, timeout, failure recovery and shutdown passed.');
} finally {
  await worker.close();
  delete process.env.PRIZM_SNAPSHOT_WORKER_VERIFY;
  delete process.env.PRIZM_COMPACT_TELEMETRY_CACHE;
  await fs.rm(root,{recursive:true,force:true});
}
