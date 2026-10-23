import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {setImmediate as turn} from 'node:timers/promises';
import {parse} from '@babel/parser';
import {build,transformSync} from 'esbuild';
import {cloneValue} from '../src/server/telemetry/TelemetryHealth';
import {telemetryMetrics} from '../src/server/telemetry/metrics';
import {runInTelemetryCycle} from '../src/server/telemetry/TelemetryCycleContext';
import {coordinatorProfiler} from '../src/server/telemetry/profiler';
import {cycleNormalizationCache} from '../src/server/telemetry/normalization';
const dist=process.argv[2];assert(dist);
const source=fs.readFileSync(dist+'/server.cjs','utf8');
function find(node:any,result:any[]=[]):any[]{if(!node||typeof node!=='object')return result;if(node.type==='AssignmentExpression'&&node.left?.name==='CoordinatorRuntime')result.push(node.right);for(const [k,v]of Object.entries(node))if(k!=='loc'){if(Array.isArray(v))v.forEach(n=>find(n,result));else if(v&&typeof v==='object')find(v,result);}return result;}
const classes=find(parse(source));assert.equal(classes.length,1);
const ctx:any={process,performance,console,queueMicrotask,setInterval,clearInterval,cloneValue,telemetryMetrics,runInTelemetryCycle,coordinatorProfiler,cycleNormalizationCache};
const CoordinatorRuntime=vm.runInNewContext('('+source.slice(classes[0].start,classes[0].end)+')',ctx);
const {SnapshotRetentionWorker}=createRequire(import.meta.url)(path.resolve(dist,'snapshot-retention-runtime.cjs'));
let test=fs.readFileSync('src/server/telemetry/snapshotRetentionWorker.test.ts','utf8').replace(/^import .*;\n/gm,'');
test=test.replace("const file = path.join(root, 'snapshot-retention-worker.cjs');",'const file = path.join(dist, "snapshot-retention-worker.cjs");');
test=test.replace("await build({entryPoints:['src/server/telemetry/snapshotRetentionWorkerEntry.ts'],outfile:file,bundle:true,platform:'node',format:'cjs',packages:'external'});",'');
// Values crossing VM realms have different prototypes, so compare their JSON
// data while retaining every assertion about source isolation and prototype keys.
const testAssert=Object.assign((...args:any[])=>assert(...args as [any,string]),assert,{deepEqual:(a:any,b:any,m?:string)=>assert.equal(JSON.stringify(a),JSON.stringify(b),m)});
await vm.runInNewContext('(async()=>{'+transformSync(test,{loader:'ts'}).code+'})()',{
 ...ctx,CoordinatorRuntime,SnapshotRetentionWorker,fs:fsp,os,path,build,turn,assert:testAssert,dist,Object
});
assert(source.includes('coordinatorRuntime = new CoordinatorRuntime(executeCoordinatorCycle, require("./snapshot-retention-runtime.cjs").snapshotRetentionWorker);'));
console.log('PASS exact packaged runtime, worker client, worker entry and canonical injection');
