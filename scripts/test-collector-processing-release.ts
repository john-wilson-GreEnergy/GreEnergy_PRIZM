import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {parse} from '@babel/parser';
import {transformSync} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {gunzipSync} from 'node:zlib';
import {cloneValue} from '../src/server/telemetry/TelemetryHealth';
import {telemetryMetrics} from '../src/server/telemetry/metrics';
import {runInTelemetryCycle} from '../src/server/telemetry/TelemetryCycleContext';
import {coordinatorProfiler} from '../src/server/telemetry/profiler';
import {cycleNormalizationCache} from '../src/server/telemetry/normalization';
const [base,dist,...captures]=process.argv.slice(2);assert(base&&dist);
const source=fs.readFileSync(dist+'/server.cjs','utf8'),ast=parse(source);
function find(node:any,pred:(n:any)=>boolean,result:any[]=[]):any[]{if(!node||typeof node!=='object')return result;if(pred(node))result.push(node);for(const [k,v]of Object.entries(node))if(k!=='loc'){if(Array.isArray(v))v.forEach(n=>find(n,pred,result));else if(v&&typeof v==='object')find(v,pred,result);}return result;}
function only(nodes:any[]){assert.equal(nodes.length,1);return nodes[0];}
const classCode=(name:string)=>{const n=only(find(ast,n=>n.type==='AssignmentExpression'&&n.left?.name===name)).right;return '('+source.slice(n.start,n.end)+')';};
const functionCode=(name:string)=>{const n=only(ast.program.body.filter((n:any)=>n.type==='FunctionDeclaration'&&n.id.name===name));return source.slice(n.start!,n.end!);};
const ctx:any={process,console,performance,Date,Map,Set,JSON,Number,Buffer,structuredClone,queueMicrotask,setInterval,clearInterval,cloneValue,telemetryMetrics,runInTelemetryCycle,coordinatorProfiler,cycleNormalizationCache,stringTransportEpoch:'test-epoch',require:createRequire(path.resolve(dist+'/server.cjs'))};
vm.createContext(ctx);
for(const name of ['compactStringRow','compactStringPublication'])vm.runInContext(functionCode(name),ctx);
const objectHelper=only(find(ast,n=>n.type==='AssignmentExpression'&&n.left?.name==='object6')).right;
vm.runInContext('var object6='+source.slice(objectHelper.start,objectHelper.end),ctx);
// The compact module's field allowlist is a local constant in the bundle.
const keys=only(find(ast,n=>n.type==='AssignmentExpression'&&n.left?.name==='balanceKeys')).right;
vm.runInContext('var balanceKeys='+source.slice(keys.start,keys.end),ctx);
ctx.EntityDomainBroker=vm.runInContext(classCode('EntityDomainBroker'),ctx);
ctx.StringFieldDeltas=ctx.require('./soc-strings-runtime.cjs').StringFieldDeltas;
ctx.CoordinatorRuntime=vm.runInContext(classCode('CoordinatorRuntime'),ctx);
vm.runInContext(functionCode('findPcsCandidates'),ctx);
for(const test of ['src/server/domainBrokers/projectedSubscription.test.ts','src/server/normalizers/pcsCandidateSearch.test.ts','src/server/telemetry/snapshotRetention.test.ts']){
  const body=fs.readFileSync(test,'utf8').replace(/^import .*;\n/gm,'');
  await vm.runInContext('(async()=>{'+transformSync(body,{loader:'ts'}).code+'})()',Object.assign(ctx,{assert}));
}
// Actual packaged route and broker, with no acquisition or service startup.
const routes=new Map();ctx.siteDataRouter={get:(p:string,handler:any)=>routes.set(p,handler)};
ctx.stringDomainBroker=new ctx.EntityDomainBroker('strings',(r:any)=>`${r.arrayNumber}:${r.stringNumber}`);
ctx.getStringStreamMetadata=()=>({cycleId:7,summary:{online:0},stale:true});
const start=source.indexOf('siteDataRouter.get("/strings-stream",'),end=source.indexOf('siteDataRouter.get("/domains",',start);
vm.runInContext(source.slice(start,end),ctx);
for(const site of ['BHE0020','BHE0021'])for(const shape of ['list','list-v2','full']){
 const row={arrayNumber:1,stringNumber:1,site,socPct:0,raw:{site},alarms:['fault'],sourceTimestampUtc:'2026-10-21T00:00:00Z'};
 ctx.stringDomainBroker.publish([row]);
 const streams:any[]=[];
 try{for(const optimized of ['false','true']){
   process.env.PRIZM_PROJECTED_STRING_STREAM=optimized;
   const stream:any={messages:[],close:()=>{}};streams.push(stream);
   routes.get('/strings-stream')({query:{shape},on:(_n:string,fn:any)=>stream.close=fn},{status(){return this;},setHeader(){},flushHeaders(){},write:(s:string)=>stream.messages.push(s),writableLength:0});
 }
 ctx.stringDomainBroker.publish([{...row,socPct:null}]);
 assert.deepEqual(streams[0].messages,streams[1].messages);
 const event=JSON.parse(streams[1].messages[1].split('data: ')[1]);
 assert.equal(event.changes[0].row.socPct,null);assert.equal(event.metadata.stale,true);assert.equal(event.metadata.summary.online,0);
 assert.equal(event.changes[0].row.raw?.site,shape==='full'?site:undefined);
 }finally{streams.forEach(s=>s.close());delete process.env.PRIZM_PROJECTED_STRING_STREAM;}
}
console.log('PASS exact packaged collector classes, route negotiation, delta/legacy parity, metadata and cleanup for both sites');
if(captures.length){
 const benchmark=fs.readFileSync('scripts/benchmark-collector-processing.ts','utf8').replace(/^import .*;\n/gm,'');
 const priorProcess=ctx.process;
 try{
  ctx.process={env:process.env,argv:['node','benchmark',...captures]};
  ctx.readFileSync=fs.readFileSync;ctx.gunzipSync=gunzipSync;
  await vm.runInContext('(async()=>{'+transformSync(benchmark,{loader:'ts'}).code+'})()',ctx);
 }finally{ctx.process=priorProcess;}
}
// The gateway suite tests actual release files, LAN + remote site grants,
// read-only routes, revocation and fresh Fleet startup in isolated fixtures.
let suite=fs.readFileSync('scripts/test-unified-workspace-release.mjs','utf8');
suite=suite.replace("assert.deepEqual(changed,['createFleetApp','createMobileApp','createRemoteDesktop','createRemoteMobileApp','createWorkspaceGateway','main']);","assert.deepEqual(changed,[]);");
suite=suite.replace('only six delivery functions changed','all gateway functions unchanged');
suite=suite.replace('command policies and collector bytes preserved','command policies and gateway bytes preserved');
// Source has an unshipped preload feature. This collector-only candidate keeps
// the deployed sidecar: assert preloads remain absent, not present. Keep every
// authentication, grant, revocation and denied-command assertion intact.
suite=suite.replace("test=test.replace(/^import",`test=test
 .replaceAll("headers['x-prizm-startup-preload'],'strings'", "headers['x-prizm-startup-preload'],undefined")
 .replace("assert(a.body.includes('rel=\\"modulepreload\\" crossorigin href=\\"/assets/StringDashboard-test.js\\"'))", "assert(!a.body.includes('rel=\\"modulepreload\\" crossorigin href=\\"/assets/StringDashboard-test.js\\"'))")
 .replace("assert(a.body.includes('href=\\"/assets/rows-test.js\\"'))", "assert(!a.body.includes('href=\\"/assets/rows-test.js\\"'))");
test=test.replace(/^import`);
const temp=fs.mkdtempSync(path.join(process.cwd(),'scripts/.collector-processing-test-'));
fs.writeFileSync(temp+'/test.mjs',suite);
execFileSync(process.execPath,[temp+'/test.mjs',base,dist],{stdio:'inherit',timeout:90000});
