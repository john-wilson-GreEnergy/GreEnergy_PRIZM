// Disposable loopback-only browser fixture. No equipment providers are imported.
import {createServer} from 'node:http';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {writeFile,mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import express from 'express';
import {FleetBroker} from '../src/server/fleet/FleetBroker';
import {CollectorPoller,parseCollector} from '../src/server/fleet/CollectorPoller';
import {createFleetApp} from '../src/server/fleet/fleetApp';
import {hashLocalPassword,type LocalAccount} from '../src/server/security/localAccounts';
import {LocalSessions} from '../src/server/security/localSessions';
import {emptyMetrics,metricKeys,type SiteEnrollment} from '../src/core/fleet/model';
import {fleetDetailFixture} from '../src/server/fleet/fleetDetailFixture';
import {buildFleetDetails} from '../src/server/fleet/detailProjection';

const directory=await mkdtemp(path.join(os.tmpdir(),'prizm-fleet-preview-'));
const password=randomBytes(18).toString('base64url'),token=randomBytes(32).toString('base64url');
const sites:SiteEnrollment[]=[
  {siteId:'sample-ss3',blockId:'1',stationCode:'SIMULATED-SS3',blockIndex:1,name:'Solar Star 3 · Sample'},
  {siteId:'sample-ss4',blockId:'1',stationCode:'SIMULATED-SS4',blockIndex:1,name:'Solar Star 4 · Sample'},
];
const servers:ReturnType<typeof createServer>[]=[];
for(const [i,site] of sites.entries()){
  const source=express();source.get('/api/fleet/site-summary',(req,res)=>{
    if(req.headers.authorization!=='Bearer '+token)return res.sendStatus(401);
    const observedAt=new Date().toISOString(),metrics=emptyMetrics();
    const values={powerKw:i?720:1250,reactiveKvar:i?-10:24,targetKw:i?750:1300,socPct:i?62.4:48.2,
      capacityKwh:118800,chargeKw:26400,dischargeKw:26400,strings:320,warnings:i?3:7,alarms:i?0:1};
    for(const key of metricKeys)if(key in values)metrics[key]={value:values[key],observedAt,quality:'live',source:'Simulated fixture'};
    const fixture=fleetDetailFixture(site.stationCode,observedAt,i);
    res.json({...site,schema:'prizm-site-summary-v1',observedAt,stale:false,metrics,details:buildFleetDetails(fixture.view,fixture.snapshot)});
  });
  const server=createServer(source);await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(3192+i,'127.0.0.1',resolve);});servers.push(server);
}
const account:LocalAccount={id:'preview-only',email:'preview@example.test',version:1,disabled:false,password:await hashLocalPassword(password),
  grants:sites.map(site=>({capability:'telemetry.view',siteId:site.siteId,blockId:site.blockId,scope:{kind:'block'}}))};
const collectors=sites.map((site,i)=>parseCollector({...site,token,url:`http://127.0.0.1:${3192+i}/api/fleet/site-summary`},true));
const broker=new FleetBroker(sites),poller=new CollectorPoller(broker,collectors);
const app=createFleetApp(broker,new LocalSessions(async()=>[account]),{origin:'http://127.0.0.1:3191',allowLoopbackHttp:true,
  simulated:true,publicDirectory:path.resolve('dist'),audit:async()=>{}});
const server=createServer((req,res)=>{
  if(req.url?.startsWith('/api/fleet/login'))res.once('finish',()=>console.log(JSON.stringify({event:'preview.login',status:res.statusCode,host:req.headers.host,origin:req.headers.origin})));
  app(req,res);
});await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(3191,'127.0.0.1',resolve);});servers.push(server);poller.start();
await writeFile(path.join(directory,'login.json'),JSON.stringify({email:account.email,password}),{mode:0o600});
await writeFile(path.join(directory,'accounts.json'),JSON.stringify([account]),{mode:0o600});
await writeFile(path.join(directory,'runtime.json'),JSON.stringify({origin:'http://127.0.0.1:3194',allowLoopbackHttp:true,accountsFile:path.join(directory,'accounts.json'),collectors}),{mode:0o600});
console.log(JSON.stringify({url:'http://127.0.0.1:3191',credentials:path.join(directory,'login.json'),runtimeConfig:path.join(directory,'runtime.json'),simulated:true}));
const stop=async()=>{await poller.stop();for(const server of servers)server.close();};
process.once('SIGTERM',()=>void stop());process.once('SIGINT',()=>void stop());
