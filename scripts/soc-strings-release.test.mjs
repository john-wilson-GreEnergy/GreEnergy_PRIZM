import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {parse} from '@babel/parser';
import traversePackage from '@babel/traverse';
const traverse=traversePackage.default??traversePackage;
const dir=path.resolve(process.argv[2]),source=fs.readFileSync(dir+'/server.cjs','utf8');
const context={require:createRequire(dir+'/server.cjs'),process:{env:{}},Date,JSON,Number,Map,WeakMap,
 stringViewerProvenance:new WeakMap(),getTelemetryCycleId:()=>1};
vm.createContext(context);
for(const name of ['normalizeSocPercent','mergeStringViewerMonitorFields','projectSitePowerFlow']){
 const found=[];traverse(parse(source),{FunctionDeclaration(p){if(p.node.id?.name===name)found.push(p.node);}});
 assert.equal(found.length,1);vm.runInContext(source.slice(found[0].start,found[0].end),context);
}
for(const value of [0,.01,.5,.99,1,1.01,2,100])assert.equal(context.normalizeSocPercent(value),value);
const row={socPct:1,amps:-10,timestampUtc:'2026-10-21T14:00:30Z'};
context.mergeStringViewerMonitorFields(row,{stringViewerDataModel:{soc:60,stringCurrent:100,reportTimestamp:'2026-10-21T14:00:00Z'}},{stale:false,success:true});
assert.equal(row.socPct,1);assert.equal(row.amps,-10);assert.equal(row.timestampUtc,'2026-10-21T14:00:30Z');
const now=Date.now(),observedAt=new Date(now).toISOString();
for(const value of [-15.01,-15,-.1,0,.1,15,15.01]){
 const flow=context.projectSitePowerFlow({stationCode:'BHE0020',status:'current',metrics:{powerKw:{value,observedAt,quality:'live',source:'EMS Modbus'}},details:{arrays:[]}},now);
 assert.equal(flow.net.direction,value < -15?'charging':value > 15?'discharging':'idle');
}
const client=fs.readdirSync(dir+'/assets').find(n=>n.startsWith('soc-strings-client-'));
assert(client);const ui=await import(pathToFileURL(dir+'/assets/'+client));
assert.equal(ui.getSystemSocAndSource({bessFleetSummary:{systemSocPct:.6}},null).soc,.6);
assert.equal(typeof ui.subscribeStringList,'function');
let route;const frames=[];let subscriber,close;
const broker={getVersion:()=>1,projectSnapshot:()=>({rows:[{arrayNumber:1,stringNumber:1,socPct:1,alarms:['keep']}]}),subscribe:fn=>{subscriber=fn;return()=>{subscriber=null;};}};
Object.assign(context,{siteDataRouter:{get:(_path,handler)=>{route=handler;}},stringDomainBroker:broker,stringTransportEpoch:'test-epoch',compactStringRow:r=>r,setInterval:()=>1,clearInterval:()=>{}});
const start=source.indexOf('siteDataRouter.get("/strings-stream",'),end=source.indexOf('siteDataRouter.get("/domains",',start);
vm.runInContext(source.slice(start,end),context);
route({query:{shape:'list-v2'},on:(_name,fn)=>{close=fn;}},{status(){return this;},setHeader(){},flushHeaders(){},write:frame=>frames.push(frame),writableLength:0});
subscriber({version:2,capturedAt:observedAt,changes:[{key:'1:1',row:{arrayNumber:1,stringNumber:1,socPct:0,alarms:['keep']}}]});
const ready=JSON.parse(frames[0].split('data: ')[1]),patch=JSON.parse(frames[1].split('data: ')[1]);
assert.equal(ready.transportEpoch,patch.transportEpoch);assert.equal(patch.changes[0].patch,true);
assert.equal(patch.changes[0].row.socPct,0);assert.equal(patch.changes[0].row.alarms,undefined);close();assert.equal(subscriber,null);
assert(source.includes('PRIZM_CANONICAL_STRING_PUBLICATION!=="false"'));
console.log('PASS packaged release: SOC units, old-detail rejection, idle boundaries, browser module, versioned SSE patches/epoch and cleanup');
