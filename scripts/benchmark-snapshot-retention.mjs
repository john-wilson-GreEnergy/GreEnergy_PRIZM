// Offline replay only. No telemetry clients or network calls.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {setTimeout as pause} from 'node:timers/promises';
const [dist,...captures]=process.argv.slice(2);
const {SnapshotRetentionWorker}=createRequire(import.meta.url)(path.resolve(dist,'snapshot-retention-runtime.cjs'));
for(const file of captures){
 const raw=JSON.parse(gunzipSync(fs.readFileSync(file))).data;
 for(const key of ['nativeBlockSummary','blockviewerRaw','nativeEmsBlock']){
   assert.deepEqual(raw.rawSources[key],raw.rawSources.block);raw.rawSources[key]=raw.rawSources.block;
 }
 assert.deepEqual(raw.rollups.stringSummary.tableRows,raw.normalized.strings);
 raw.rollups.stringSummary.tableRows=raw.normalized.strings;
 const expected=JSON.stringify(raw);
 const worker=new SnapshotRetentionWorker(path.resolve(dist,'snapshot-retention-worker.cjs'));
 for(const mode of ['synchronous','worker','synchronous','worker']){
  let last=performance.now(),maxGapMs=0,ticks=0;
  const timer=setInterval(()=>{const now=performance.now();maxGapMs=Math.max(maxGapMs,now-last);last=now;ticks++;},2);
  await pause(10);const start=performance.now();
  const result=mode==='worker'?await worker.clone(raw):JSON.parse(JSON.stringify(raw));
  const durationMs=performance.now()-start;
  await pause(10);clearInterval(timer);
  assert.equal(JSON.stringify(result),expected);
  assert.equal(result.normalized.strings.length,320);
  console.log(JSON.stringify({site:raw.siteIdentity.stationCode,mode,durationMs,maxGapMs,ticks,exactParity:true,...(mode==='worker'?{worker:worker.status()}:{} )}));
 }
}
