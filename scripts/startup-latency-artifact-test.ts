/** Tests the packaged production artifact without starting equipment acquisition. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {parse} from '@babel/parser';
import {transformSync} from 'esbuild';
import {cloneValue} from '../src/server/telemetry/TelemetryHealth';
import {telemetryMetrics} from '../src/server/telemetry/metrics';
import {runInTelemetryCycle} from '../src/server/telemetry/TelemetryCycleContext';
import {coordinatorProfiler} from '../src/server/telemetry/profiler';
import {cycleNormalizationCache} from '../src/server/telemetry/normalization';
import {compareSnapshot} from './string-refresh-probe';
const dist=process.argv[2];assert(dist);
const code=fs.readFileSync(dist+'/server.cjs','utf8');
const classStart=code.indexOf('CoordinatorRuntime = class {')+'CoordinatorRuntime = '.length;
const classEnd=code.indexOf('\n    };',classStart)+6;assert(classStart>30&&classEnd>classStart);
const CoordinatorRuntime=vm.runInNewContext('('+code.slice(classStart,classEnd)+')',{
 process,console,performance,Date,queueMicrotask,setInterval,clearInterval,
 cloneValue,telemetryMetrics,runInTelemetryCycle,coordinatorProfiler,cycleNormalizationCache});
// Re-run the complete snapshot ownership/fallback test against the bundled class.
let retention=fs.readFileSync('src/server/telemetry/snapshotRetention.test.ts','utf8').replace(/^import .*;\n/gm,'');
await vm.runInNewContext('(async()=>{'+transformSync(retention,{loader:'ts'}).code+'})()', {assert,CoordinatorRuntime,process,console});
const capture=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
for(const {site,snapshot} of capture.sites)console.log(JSON.stringify({site,...compareSnapshot(snapshot,dist+'/server.cjs')}));

// Re-run the cached route test against the actual compiled route and scheduler.
const routeTest=fs.readFileSync('src/server/telemetry/deferredViewRefresh.test.ts','utf8')
 .replace("fs.readFileSync('src/server/siteDataRoutes.ts','utf8')","fs.readFileSync(artifact,'utf8')")
 .replace("source.indexOf('const demandedViewKeys')","source.indexOf('var demandedViewKeys')")
 .replace(/^import .*;\n/gm,'');
const zlib=await import('node:zlib');
await vm.runInNewContext('(async()=>{'+transformSync(routeTest,{loader:'ts'}).code+'})()',{
 assert,fs,vm,transformSync,artifact:dist+'/server.cjs',...zlib,Buffer,console});

const entry=/src="([^"]+\.js)"/.exec(fs.readFileSync(dist+'/index.html','utf8'))![1];
const client=fs.readFileSync(dist+entry,'utf8'),ast=parse(client,{sourceType:'module'});
const effects:any[]=[];
function walk(n:any){if(!n||typeof n!=='object')return;if(n.type==='CallExpression'&&n.callee?.property?.name==='useEffect'&&client.slice(n.start,n.end).includes('if(a||be.current)return;'))effects.push(n);for(const [k,v]of Object.entries(n))if(k!=='loc'){if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}}
walk(ast);assert.equal(effects.length,1);const effect=client.slice(effects[0].start,effects[0].end);
let now=100000,reads=0,release=()=>{},poll=async()=>{},cleanup=()=>{};
const inFlight={current:false},lastPoll={current:0};
vm.runInNewContext(effect, {Date:{now:()=>now},document:{hidden:false},be:inFlight,Ie:lastPoll,
 Ye:{current:{status:'LIVE',reachable:true}},Je:{current:null},
 Le:()=>{reads++;return new Promise<void>(resolve=>{release=resolve;});},
 o:{useEffect:(fn:()=>()=>void)=>{cleanup=fn();}},setInterval:(fn:()=>Promise<void>)=>{poll=fn;return 1;},clearInterval:()=>{}});
assert.equal(reads,1);assert.equal(inFlight.current,true);
for(let i=0;i<4;i++){now+=2000;await poll();}assert.equal(reads,1);
release();await Promise.resolve();await Promise.resolve();assert.equal(inFlight.current,false);
now+=14000;await poll();assert.equal(reads,1);
now+=1000;const later=poll();assert.equal(reads,2);await poll();assert.equal(reads,2);release();await later;
cleanup();now+=20000;await poll();assert.equal(reads,2);
console.log('PACKAGED RELEASE PASS: runtime ownership, both-site parity, deferred gzip/304 route, startup single-flight and cleanup.');
