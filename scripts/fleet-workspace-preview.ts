// Disposable browser fixture. No equipment providers, production accounts or network clients.
import express from 'express';
import {createServer} from 'node:http';
import path from 'node:path';
import {FleetBroker} from '../src/server/fleet/FleetBroker';
import {createFleetApp} from '../src/server/fleet/fleetApp';
import {createWorkspaceGateway} from '../src/server/fleet/workspaceGateway';
import {LocalSessions} from '../src/server/security/localSessions';
import {hashLocalPassword,type LocalAccount} from '../src/server/security/localAccounts';
import {emptyMetrics} from '../src/core/fleet/model';
import {fleetDetailFixture} from '../src/server/fleet/fleetDetailFixture';
import {buildFleetDetails} from '../src/server/fleet/detailProjection';
const origin='http://127.0.0.1:3443';
const sites=[3,4].map(n=>({siteId:'sample-ss'+n,blockId:'1',blockIndex:1,stationCode:'SIMULATED-SS'+n,name:'Solar Star '+n+' · SIMULATED',url:'https://127.0.0.1:9443/api/fleet/site-summary',token:'s'.repeat(43)}));
const account:LocalAccount={id:'fixture',email:'preview@example.test',disabled:false,version:1,password:await hashLocalPassword('Offline workspace preview only'),grants:sites.flatMap(s=>(['telemetry.view','workspace.full'] as const).map(capability=>({capability,siteId:s.siteId,blockId:s.blockId,scope:{kind:'block' as const}})))};
const sessions=new LocalSessions(async()=>[account]),broker=new FleetBroker(sites);
const workspaces=sites.map((s,i)=>({siteId:s.siteId,origin:'http://127.0.0.1:'+(3444+i),token:String(i+1).repeat(43)}));
const update=()=>{for(const [i,s] of sites.entries()){
  const observedAt=new Date().toISOString(),fixture=fleetDetailFixture(s.stationCode,observedAt,i);
  broker.accept(s.siteId,{...s,schema:'prizm-site-summary-v1',observedAt,stale:false,metrics:emptyMetrics(),details:buildFleetDetails(fixture.view,fixture.snapshot)});
}};
update();const timer=setInterval(update,4000);
const servers:ReturnType<typeof createServer>[]=[];
async function listen(app:express.Express,port:number){const s=createServer(app);servers.push(s);await new Promise<void>((resolve,reject)=>{s.once('error',reject);s.listen(port,'127.0.0.1',resolve);});}
await listen(createFleetApp(broker,sessions,{origin,allowLoopbackHttp:true,simulated:true,publicDirectory:path.resolve('dist'),workspaces,audit:async()=>{}}),3443);
for(const [i,s] of sites.entries()){
  const legacy=express();legacy.use('/assets',express.static(path.resolve('dist/assets')));legacy.get('/logo-transparent.svg',(_req,res)=>res.sendFile(path.resolve('dist/logo-transparent.svg')));
  legacy.get('/',(_req,res)=>res.sendFile(path.resolve('dist/index.html')));
  legacy.use((_req,res)=>res.status(503).json({error:'SIMULATED navigation fixture; live telemetry and equipment actions are not connected'}));
  await listen(createWorkspaceGateway(sessions,s,workspaces[i],origin,async()=>{},async(req,res)=>{legacy(req,res);},true),3444+i);
}
console.log('SIMULATED ONLY: http://127.0.0.1:3443 ; preview@example.test ; Offline workspace preview only');
const stop=()=>{clearInterval(timer);for(const s of servers){s.closeAllConnections();s.close();}process.exit(0);};process.once('SIGTERM',stop);process.once('SIGINT',stop);
