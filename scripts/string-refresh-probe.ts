/** Pure parity check of captured, already-published rows. No acquisition. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {compactStringRow} from '../src/server/telemetry/compactStringList';
import {buildArrayCellMetrics} from '../src/server/telemetry/arrayCellMetrics';
import {prepareStringRows} from '../src/lib/prepareStringRows';
export function compareSnapshot(source:any,artifact:string){
 const code=fs.readFileSync(artifact,'utf8');
 function extract(name:string){const a=code.indexOf('function '+name+'('),b=code.indexOf('\n}\n',a);assert(a>=0&&b>a);return code.slice(a,b+2);}
 const project=vm.runInNewContext(['stringListContextRow','withoutDiagnosticPayload','buildHeartbeatSnapshot','buildBrowserSnapshot'].map(extract).join('\n')+'\nbuildBrowserSnapshot',
  {process:{env:{}},compactStringRow,buildArrayCellMetrics});
 const next=JSON.parse(JSON.stringify(project(source,{compactStringList:true,stringContextOnly:true,includeStrings:true})));
 assert.equal(next.stringContextOnly,true);assert.equal(next.normalized.strings.length,320);
 assert.deepEqual(prepareStringRows(next.normalized.strings,source.normalized.strings,new Map()),prepareStringRows(source.normalized.strings,source.normalized.strings,new Map()));
 for(const key of ['siteIdentity','liveStatus','cycleId'])assert.deepEqual(next[key],source[key]);
 assert.deepEqual(next.rollups,source.rollups);assert.deepEqual(next.debug.errors,source.debug.errors||[]);
 const before=JSON.stringify(source),after=JSON.stringify(next);
 return {station:source.siteIdentity.stationCode,rows:320,allPreparedRowFieldsEqual:true,countsAndFreshnessEqual:true,
  beforeBytes:Buffer.byteLength(before),afterBytes:Buffer.byteLength(after),gzipBytes:gzipSync(after,{level:1}).length};
}
