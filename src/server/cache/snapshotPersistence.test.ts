import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';

if (process.argv[2] === 'child') {
  const cache = await import('./prizmCache');
  const fixture = {cycleId:42,value:0,missing:null,stale:true,sourceAt:'2026-09-28T15:00:00Z'};
  let entry = cache.set('prizm-site-snapshot',fixture,{ttlMs:15000});
  assert.equal(cache.get('prizm-site-snapshot')?.data,fixture,'Memory publication must be immediate.');
  fixture.value = 123;
  cache.set('site-operations-summary',{cycleId:42,complete:true},{ttlMs:15000});
  const cleared = process.argv[3] === 'clear';
  if (cleared) cache.set('prizm-site-snapshot',null,{ttlMs:0});
  await cache.closeSnapshotCachePersistence();
  const persisted = JSON.parse(await fs.readFile(path.join(cache.getActiveSiteCachePath(),'prizm-site-snapshot.json'),'utf8'));
  if (cleared) {
    assert.equal(persisted.data,null,'A clear cannot be overwritten by older queued data.');
    assert.equal(persisted.cacheMeta.ttlMs,0);
  } else {
    assert.equal(persisted.data.value,0,'Serialization freezes queued data before caller mutation.');
    assert.equal(persisted.cacheMeta.fetchedAt,entry.fetchedAt);
    assert.equal(persisted.cacheMeta.cycleId,42);
    assert.equal(persisted.data.stale,true);
    assert.equal(persisted.cacheMeta.ttlMs,15000);
  }
  const status = cache.getSnapshotCachePersistenceStatus();
  assert.equal(status.enabled,process.env.PRIZM_ASYNC_SNAPSHOT_CACHE !== 'false');
  assert.equal(status.workerEnabled,status.enabled && process.env.PRIZM_SNAPSHOT_WORKER === 'true');
  assert.equal(status.completed,status.enabled ? 2 : 0);
  assert.equal(status.worker.completed,status.workerEnabled ? 2 : 0);
  assert.equal(status.pendingWrites,0); assert.equal(status.failed,0);
  console.log('PERSISTED:' + JSON.stringify(persisted.data));
} else {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'prizm-cache-integration-'));
  try {
    await build({entryPoints:['src/server/cache/snapshotCacheWorkerEntry.ts'],outfile:path.join(root,'dist','snapshot-cache-worker.cjs'),bundle:true,platform:'node',format:'cjs',packages:'external'});
    for (const mode of ['snapshot','clear']) {
      const outputs = [['true','false'],['false','false'],['true','true'],['false','true']].map(([flag,worker],i)=>execFileSync(process.execPath,
        ['--require',path.resolve('scripts/test-network-guard.cjs'),'--import',import.meta.resolve('tsx'),fileURLToPath(import.meta.url),'child',mode],
        {cwd:root,encoding:'utf8',timeout:30000,env:{...process.env,PRIZM_CACHE_DIR:path.join(root,mode,String(i),'cache'),PRIZM_HISTORY_DIR:path.join(root,mode,String(i),'history'),PRIZM_ASYNC_SNAPSHOT_CACHE:flag,PRIZM_SNAPSHOT_WORKER:worker,PRIZM_SNAPSHOT_WORKER_VERIFY:'true'}}));
      const results = outputs.map(text=>JSON.parse(text.split('\n').find(line=>line.startsWith('PERSISTED:'))!.slice(10)));
      for (const result of results.slice(1)) assert.deepEqual(results[0],result);
    }
    console.log('Snapshot persistence integration: immediate memory, frozen disk content, provenance/schema parity and disabled-mode rollback passed.');
  } finally {await fs.rm(root,{recursive:true,force:true});}
}
