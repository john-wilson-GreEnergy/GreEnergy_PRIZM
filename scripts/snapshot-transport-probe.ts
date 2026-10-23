/** Read-only parity/size validator for already-published site snapshots. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {compactStringRow} from '../src/server/telemetry/compactStringList';
import {buildArrayCellMetrics} from '../src/server/telemetry/arrayCellMetrics';
export function compareSnapshot(source:any,artifact:string) {
  const code=fs.readFileSync(artifact,'utf8');
  function extract(name:string){const a=code.indexOf('function '+name+'('),b=code.indexOf('\n}\n',a);assert(a>0&&b>a);return code.slice(a,b+2);}
  const project=vm.runInNewContext(['withoutDiagnosticPayload','buildHeartbeatSnapshot','buildBrowserSnapshot'].map(extract).join('\n')+'\nbuildBrowserSnapshot',
    {process:{env:{}},compactStringRow,buildArrayCellMetrics});
  const next=JSON.parse(JSON.stringify(project(source,{compactStringList:true,includeStrings:true})));
  for(const key of ['siteIdentity','liveStatus','cycleId'])assert.deepEqual(next[key],source[key]);
  assert.deepEqual(next.normalized.strings,source.normalized.strings,'Every already-compact row field preserved');
  for(const key of ['arraySummary','arrayCellMetrics','sourceHealth','sourceHealthSummary'])assert.deepEqual(next.rollups[key],source.rollups[key]);
  for(const key of ['summary','rollups','buckets','cards','valid','totalStrings'])assert.deepEqual(next.rollups.stringSummary[key],source.rollups.stringSummary[key]);
  assert.deepEqual(next.debug.errors,source.debug.errors||[]);
  assert.equal(next.debug.lastPollDurationMs,source.debug.lastPollDurationMs);
  assert.equal(next.normalized.strings.length,320);
  const before=JSON.stringify(source),after=JSON.stringify(next);
  assert(gzipSync(after,{level:1}).length<500000,'Wire payload budget exceeded');
  return {station:source.siteIdentity.stationCode,rows:next.normalized.strings.length,allRowFieldsEqual:true,countsAndFreshnessEqual:true,
    beforeBytes:Buffer.byteLength(before),afterBytes:Buffer.byteLength(after),gzipBytes:gzipSync(after,{level:1}).length};
}
