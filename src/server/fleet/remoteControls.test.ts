import assert from 'node:assert/strict';
import {createServer,request as httpRequest,type IncomingHttpHeaders} from 'node:http';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRemoteMobileApp,type RemoteMobileConfig} from './remoteMobile';
import {FleetBroker} from './FleetBroker';
import {hashLocalPassword,type LocalAccount} from '../security/localAccounts';
import type {WorkspaceAudit,WorkspaceForward} from './workspaceGateway';
import {emptyMetrics} from '../../core/fleet/model';

// Fresh Unix-socket server; dispatch is a recorder, never a collector/device.
const dir=await mkdtemp(path.join(tmpdir(),'prizm-remote-controls-'));
await mkdir(path.join(dir,'assets'));
await writeFile(path.join(dir,'mobile.html'),'<html>Fixture</html>');
await writeFile(path.join(dir,'fleet.html'),'<html>Fixture</html>');
await writeFile(path.join(dir,'index.html'),'<html>Fixture</html>');
const config:RemoteMobileConfig={origin:'https://prizm.example.test',socketPath:'/run/prizm-remote/mobile.sock',authentication:'password',controls:'profile',issuer:'https://unused.cloudflareaccess.com',audience:'a'.repeat(64),keysFile:'/unused',keysOwnerUid:0};
const sites=['ss3','ss4'].map(siteId=>({siteId,blockId:'b1',blockIndex:1,stationCode:'LAB'+siteId,name:siteId}));
const password='Synthetic test password only',hash=await hashLocalPassword(password);
const account:LocalAccount={id:'operator',email:'operator@example.test',password:hash,disabled:false,version:1,remoteAccess:true,remoteControlSites:['ss3'],
 grants:sites.flatMap(s=>(['telemetry.view','workspace.full'] as const).map(capability=>({capability,siteId:s.siteId,blockId:s.blockId,scope:{kind:'block' as const}})))};
let now=Date.now(),auditFails=false,revokeDuringAudit=false,ambiguousResponse=false;
const dispatched:Array<{site:string;method:string;path:string;body:string}>=[],events:Parameters<WorkspaceAudit>[0][]=[];
const options={publicDirectory:dir,accounts:async()=>[account],clock:()=>now,hvac:()=>({units:[],error:null,capturedAt:now}),
 audit:async(event:Parameters<WorkspaceAudit>[0])=>{if(event.action==='remote.workspace.dispatch'){if(auditFails)throw Error('Fixture audit failure');if(revokeDuringAudit)account.remoteControlSites=[];}events.push(event);},
 desktop:sites.map(s=>({collector:{...s,url:'https://127.0.0.1:9443/api/fleet/site-summary',token:'x'.repeat(43)},
 forward:(async(req,res,recheck)=>{await recheck();let body='';for await(const part of req)body+=part;await recheck();dispatched.push({site:s.siteId,method:req.method,path:req.url,body});if(ambiguousResponse)throw Error('Synthetic lost upstream response');res.json({synthetic:true});}) as WorkspaceForward}))};
const broker=new FleetBroker(sites,()=>now),socket=path.join(dir,'test.sock');
function publish(){for(const site of sites)broker.accept(site.siteId,{schema:'prizm-site-summary-v1',...site,stale:false,observedAt:new Date(now).toISOString(),metrics:emptyMetrics()});}
const server=createServer(await createRemoteMobileApp(broker,options,config));
await new Promise<void>(r=>server.listen(socket,r));
let headers:Record<string,string>={};
async function request(method:string,url:string,body?:unknown,extra:Record<string,string>={},socketPath=socket){
 const payload=body===undefined?'':JSON.stringify(body);
 return new Promise<{status:number;data:any;headers:IncomingHttpHeaders}>((resolve,reject)=>{
  const req=httpRequest({socketPath,path:url,method,headers:{Host:'prizm.example.test',Origin:config.origin,'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload),...headers,...extra}},res=>{
   let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode!,data:res.headers['content-type']?.includes('application/json')?JSON.parse(text):text,headers:res.headers}));
  });req.on('error',reject);req.setTimeout(5000,()=>req.destroy(Error('Fixture timeout')));req.end(payload);
 });
}
async function login(socketPath=socket){
 now+=61000;
 publish();
 const signed=await request('POST','/fleet/api/fleet/login',{email:account.email,password},{},socketPath);assert.equal(signed.status,200);
 headers={Cookie:signed.headers['set-cookie']!.find(c=>/Path=\/;/.test(c))!.split(';')[0]};
 const session=await request('GET','/fleet/api/fleet/session',undefined,{},socketPath);assert.equal(session.status,200);
 headers['X-Prizm-Csrf']=session.data.csrf;
}
const command='/desktop/ss3/api/local/ems-apps/power-control';
const payload={synthetic:true,confirmation:'NO EQUIPMENT CONNECTED'};
try{
 assert.equal((await request('POST',command,payload)).status,401);
 await login();
 const ctx=await request('GET','/desktop/ss3/api/fleet/workspace-context');
 assert.equal(ctx.data.fullControl,true);assert.equal(ctx.data.remoteReadOnly,false);assert.equal(ctx.data.remoteAccess,true);
 assert.equal((await request('GET','/desktop/ss4/api/fleet/workspace-context')).data.fullControl,false);
 assert.equal((await request('POST','/desktop/ss3/api/fleet/workspace-monitor')).status,200);
 for(const extra of [{'X-Prizm-Csrf':''},{Origin:''},{Origin:'https://evil.test'},{'Sec-Fetch-Site':'cross-site'},{Cookie:''},{Cookie:headers.Cookie+'; '+headers.Cookie}])assert([401,403].includes((await request('POST',command,payload,extra)).status));
 for(const url of ['/desktop/ss4/api/local/ems-apps/power-control','/desktop/unknown/api/local/ems-apps/power-control','/desktop/ss3/api/fleet/admin/users','/desktop/ss3/api/access/login','/desktop/ss3/api/settings/profiles/active/activate','/desktop/ss3/api/settings/test-connection','/desktop/ss3/api/local/demo-toggle','/desktop/ss3/api/local/corrective-guidance','/desktop/ss3/api/local/troubleshooting/overrides','/desktop/ss3/api/../local/test','/desktop/ss3/api/%2e%2e/test'])assert([400,403].includes((await request('POST',url,payload)).status),url);
 assert.equal(dispatched.length,0,'Denied requests never dispatch');
 now+=15000;assert.equal((await request('POST',command,payload)).status,409,'Stale telemetry cannot authorize remote commands');
 publish();broker.fail('ss3');assert.equal((await request('POST',command,payload)).status,409,'Unavailable collector fails closed');
 publish();broker.fail('ss3','identity-conflict');assert.equal((await request('POST',command,payload)).status,409,'Identity conflict fails closed');
 publish();assert.equal(dispatched.length,0,'Freshness checks do not dispatch or force polls');
 assert.equal((await request('POST',command,payload)).status,200);
 assert.deepEqual(dispatched[0],{site:'ss3',method:'POST',path:'/api/local/ems-apps/power-control',body:JSON.stringify(payload)});
 assert.equal(dispatched.length,1,'One user submission produces one synthetic dispatch');
 assert(events.some(e=>e.action==='remote.workspace.dispatch'&&e.siteId==='ss3'&&e.subject==='operator'));
 assert(!JSON.stringify(events).includes('NO EQUIPMENT'),'Audit excludes bodies');
 auditFails=true;assert.equal((await request('POST',command,payload)).status,503);auditFails=false;
 assert.equal(dispatched.length,1,'Audit failure is fail-closed');
 revokeDuringAudit=true;assert.equal((await request('POST',command,payload)).status,401);revokeDuringAudit=false;
 assert.equal(dispatched.length,1,'Revocation during audit prevents dispatch');
 await login();assert.equal((await request('POST',command,payload)).status,403);
 assert.equal((await request('GET','/desktop/ss3/api/local/site-data/pcs')).status,200,'Locked profile retains canonical monitoring');
 account.remoteControlSites=['ss3'];await login();
 account.grants=account.grants.filter(g=>g.capability!=='workspace.full');await login();
 assert.equal((await request('POST',command,payload)).status,403,'Remote flag never substitutes for LAN full workspace grant');
 account.grants.push({capability:'workspace.full',siteId:'ss3',blockId:'b1',scope:{kind:'block'}});await login();
 account.remoteAccess=false;assert.equal((await request('POST',command,payload)).status,401);account.remoteAccess=true;
 await login();account.disabled=true;assert.equal((await request('POST',command,payload)).status,401);account.disabled=false;
 await login();now+=86400001;assert.equal((await request('POST',command,payload)).status,401);
 // Maintenance uses the same authorization and fixed-site dispatch as operations.
 await login();
 const passiveCount=dispatched.length;
 for(const route of ['/api/local/site-data/strings-stream?shape=list-v2','/api/local/diagnostic-session/fixture/export/json','/api/settings/profiles/export'])assert.equal((await request('GET','/desktop/ss3'+route,undefined,{'X-Prizm-Csrf':''})).status,200,'Native stream/download: '+route);
 assert.equal(dispatched.length,passiveCount+3);
 assert.equal((await request('GET','/desktop/ss3/api/local/firmware/updates',undefined,{'X-Prizm-Csrf':''})).status,403,'Unknown GET still requires CSRF');
 for(const route of ['/api/local/firmware/updates','/api/local/firmware/capture','/api/local/feather-serial/apply','/api/local/system/commissioning/discover','/api/local/system/commissioning/reconcile']){
  const count=dispatched.length;
  for(const extra of [{'X-Prizm-Csrf':''},{Origin:'https://evil.test'}])assert.equal((await request('POST','/desktop/ss3'+route,payload,extra)).status,403);
  assert.equal((await request('POST','/desktop/ss4'+route,payload)).status,403);
  assert.equal(dispatched.length,count);
  assert.equal((await request('POST','/desktop/ss3'+route,payload)).status,200);
  assert.equal(dispatched.length,count+1);assert.equal(dispatched.at(-1)!.path,route);
 }
 assert.equal((await request('POST','/desktop/ss3/api/local/Corrective-Guidance',payload)).status,403);
 assert.equal((await request('POST','/desktop/ss3/api/local/Troubleshooting/Overrides',payload)).status,403);
 const count=dispatched.length;ambiguousResponse=true;
 const uncertain=await request('POST',command,payload);ambiguousResponse=false;
 assert.equal(uncertain.status,503);assert.match(uncertain.data.error,/verify any submitted command outcome before retrying/);
 assert.equal(dispatched.length,count+1,'An ambiguous upstream outcome never resubmits a command');
 const rollbackSocket=path.join(dir,'rollback.sock'),rollback=createServer(await createRemoteMobileApp(broker,options,{...config,controls:'disabled'}));
 await new Promise<void>(r=>rollback.listen(rollbackSocket,r));
 try{await login(rollbackSocket);assert.equal((await request('GET','/desktop/ss3/api/fleet/workspace-context',undefined,{},rollbackSocket)).data.fullControl,false);assert.equal((await request('POST',command,payload,{},rollbackSocket)).status,403);}finally{rollback.closeAllConnections();await new Promise<void>(r=>rollback.close(()=>r()));}
 console.log('PASS remote profile controls: site grants, CSRF/origin, maintenance routes, ambiguous outcome without retry, enrollment locks, audit failure, revocation, freshness, expiry, and master-switch rollback');
}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true});}
