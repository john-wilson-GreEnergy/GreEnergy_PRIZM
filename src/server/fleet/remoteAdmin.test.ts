import assert from 'node:assert/strict';
import {createServer,request as httpRequest} from 'node:http';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createRemoteMobileApp,type RemoteMobileConfig} from './remoteMobile';
import {createMobileApp} from './mobileApp';
import {FleetBroker} from './FleetBroker';
import {hashLocalPassword,readAccounts} from '../security/localAccounts';
import {LocalSessions} from '../security/localSessions';
import {manageFleetAccount} from './accountManagement';

// Synthetic private account store and Unix socket only. No equipment forwarding.
const dir=await mkdtemp(path.join(tmpdir(),'prizm-remote-admin-')),file=path.join(dir,'accounts.json');
await mkdir(path.join(dir,'assets'));
for(const name of ['fleet.html','mobile.html','index.html'])await writeFile(path.join(dir,name),'<html>Fixture only</html>');
const password='Synthetic admin test password',hash=await hashLocalPassword(password);
const sites=[3,4].map(n=>({siteId:'ss'+n,blockId:'b1',blockIndex:1,stationCode:'LAB'+n,name:'Site '+n}));
await writeFile(file,JSON.stringify(['admin','viewer','localadmin'].map(id=>({id,email:id+'@example.invalid',disabled:false,version:1,password:hash,fleetAdmin:id!=='viewer',remoteAccess:id!=='localadmin',remoteControlSites:[],grants:sites.flatMap(s=>(['telemetry.view','workspace.full'] as const).map(capability=>({capability,siteId:s.siteId,blockId:s.blockId,scope:{kind:'block'}})))}))),{mode:0o600});
let now=Date.now(),auditFails=false,revokeActor=false;
const events:unknown[]=[];
const config:RemoteMobileConfig={origin:'https://prizm.example.test',socketPath:'/run/prizm-remote/mobile.sock',authentication:'password',controls:'profile',issuer:'https://unused.cloudflareaccess.com',audience:'a'.repeat(64),keysFile:'/unused',keysOwnerUid:0};
const options={publicDirectory:dir,adminAccountsFile:file,accounts:()=>readAccounts(file),clock:()=>now,hvac:()=>({units:[],capturedAt:now,error:null}),
 audit:async(event:{action:string;outcome:string})=>{if(event.action.startsWith('fleet.account.')&&event.outcome==='authorized'){
  if(auditFails)throw Error('Synthetic audit outage');
  if(revokeActor)await manageFleetAccount(file,sites,{kind:'remote',email:'admin@example.invalid',remoteAccess:false});
 }events.push(event);},
 desktop:sites.map(s=>({collector:{...s,url:'https://127.0.0.1:9443/api/fleet/site-summary',token:'x'.repeat(43)},forward:async()=>{throw Error('Equipment forwarding forbidden in this test');}}))};
const server=createServer(await createRemoteMobileApp(new FleetBroker(sites),options,config)),socket=path.join(dir,'fixture.sock');
await new Promise<void>(r=>server.listen(socket,r));
let headers:Record<string,string>={};
async function request(method:string,url:string,body?:unknown,extra:Record<string,string>={},socketPath=socket){
 const payload=body===undefined?'':JSON.stringify(body);
 return new Promise<{status:number;data:any;headers:import('node:http').IncomingHttpHeaders}>((resolve,reject)=>{
  const req=httpRequest({socketPath,path:url,method,headers:{Host:'prizm.example.test',Origin:config.origin,'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload),...headers,...extra}},res=>{
   let text='';res.on('data',b=>text+=b);res.on('end',()=>resolve({status:res.statusCode!,data:res.headers['content-type']?.includes('application/json')?JSON.parse(text):text,headers:res.headers}));
  });req.on('error',reject);req.setTimeout(5000,()=>req.destroy(Error('Fixture timeout')));req.end(payload);
 });
}
async function login(id='admin',socketPath=socket){
 now+=61000;headers={};
 const signed=await request('POST','/fleet/api/fleet/login',{email:id+'@example.invalid',password},{},socketPath);assert.equal(signed.status,200);
 headers.Cookie=signed.headers['set-cookie']!.find(c=>/Path=\/;/.test(c))!.split(';')[0];
 const session=await request('GET','/fleet/api/fleet/session',undefined,{},socketPath);assert.equal(session.status,200);headers['X-Prizm-Csrf']=session.data.csrf;
 return session.data;
}
const route='/fleet/api/fleet/admin/users',action={kind:'remote-controls',email:'viewer@example.invalid',siteIds:['ss3'],confirmationPassword:password};
try{
 assert.equal((await request('GET',route)).status,401);
 assert.equal((await login('viewer')).administrator,false);
 assert.equal((await request('GET',route)).status,403);assert.equal((await request('POST',route,action)).status,403);
 assert.equal((await login()).administrator,true,'Admin capability does not require equipment controls');
 const listed=await request('GET',route);assert.equal(listed.status,200);assert.equal(listed.data.users.length,3);
 assert(!/digest|salt|passwordSetup/.test(JSON.stringify(listed.data)));
 const before=await readFile(file,'utf8');
 for(const extra of [{Cookie:''},{Cookie:headers.Cookie+'; '+headers.Cookie},{'X-Prizm-Csrf':''},{Origin:''},{Origin:'https://evil.test'},{'Sec-Fetch-Site':'cross-site'},{Host:'evil.test'}])assert([401,403].includes((await request('POST',route,action,extra)).status));
 for(const url of ['/api/fleet/admin/users','/mobile/api/fleet/admin/users','/desktop/ss3/api/fleet/admin/users',route+'/',route+'?x=1','/fleet/api/fleet/admin/%75sers'])assert([400,403].includes((await request('GET',url)).status),url);
 assert.equal((await request('DELETE',route,action)).status,403);
 assert.equal((await request('POST',route,{...action,confirmationPassword:'wrong'})).status,403);
 assert.equal((await request('POST',route,{...action,siteIds:['ss3','ss3']})).status,400);
 assert.equal((await request('POST',route,{...action,siteIds:['unknown']})).status,400);
 now+=61000;
 assert.equal((await request('POST',route,{...action,fleetAdmin:true})).status,400);
 auditFails=true;assert.equal((await request('POST',route,action)).status,503);auditFails=false;
 assert.equal(await readFile(file,'utf8'),before,'Denied requests preserve accounts');
 const lanSessions=new LocalSessions(()=>readAccounts(file),()=>now,true,true);
 const lanViewer=await lanSessions.login('viewer@example.invalid',password,'fixture');
 await login('viewer');const viewerCookie=headers.Cookie;
 await login();
 assert.equal((await request('POST',route,action)).status,200);
 const granted=(await readAccounts(file)).find(a=>a.id==='viewer')!;
 assert.deepEqual(granted.remoteControlSites,['ss3']);assert.deepEqual(granted.grants,JSON.parse(before).find((a:{id:string})=>a.id==='viewer').grants);
 await assert.rejects(lanSessions.authenticate(lanViewer.token));
 assert.equal((await request('GET','/fleet/api/fleet/session',undefined,{Cookie:viewerCookie})).status,401);
 assert.equal((await request('POST',route,{...action,siteIds:[]})).status,200);
 assert.deepEqual((await readAccounts(file)).find(a=>a.id==='viewer')!.remoteControlSites,[]);
 assert.equal((await request('POST',route,{...action,email:'admin@example.invalid'})).status,200);
 assert.equal((await request('GET',route)).status,401,'Self-change invalidates current remote session');
 await login();
 assert.equal((await request('POST',route,{...action,email:'admin@example.invalid',siteIds:[]})).status,200);
 await login();now+=86400001;assert.equal((await request('GET',route)).status,401);
 await login();revokeActor=true;
 assert.equal((await request('POST',route,action)).status,401,'Revocation during audit prevents account mutation');revokeActor=false;
 assert.deepEqual((await readAccounts(file)).find(a=>a.id==='viewer')!.remoteControlSites,[]);
 assert(!JSON.stringify(events).includes(password));
 await manageFleetAccount(file,sites,{kind:'remote',email:'admin@example.invalid',remoteAccess:true});
 // The verified external identity must match the password session for admin too.
 const identityAccounts=async()=>(await readAccounts(file)).filter(a=>a.remoteAccess&&!a.disabled);
 const identityApp=createMobileApp(new FleetBroker(sites),{...options,accounts:identityAccounts,origin:config.origin,remoteListener:true,experience:'fleet',desktopSites:sites.map(s=>s.siteId),remoteSessions:new LocalSessions(identityAccounts,()=>now,true,true),remoteIdentity:async req=>String(req.headers['x-fixture-email']??'admin@example.invalid')});
 const identity=createServer((req,res)=>{req.url=req.url!.replace(/^\/fleet/,'');identityApp(req,res);}),identitySocket=path.join(dir,'identity.sock');
 await new Promise<void>(r=>identity.listen(identitySocket,r));
 try{
  assert.equal((await login('admin',identitySocket)).administrator,true);
  const unchanged=await readFile(file,'utf8');
  for(const method of ['GET','POST'])assert.equal((await request(method,route,method==='POST'?action:undefined,{'x-fixture-email':'viewer@example.invalid'},identitySocket)).status,403);
  assert.equal(await readFile(file,'utf8'),unchanged);
 }finally{identity.closeAllConnections();await new Promise<void>(r=>identity.close(()=>r()));}
 // Omitting the server-only account path is the remote-admin rollback switch.
 const rollback=createServer(await createRemoteMobileApp(new FleetBroker(sites),{...options,adminAccountsFile:undefined},config)),rollbackSocket=path.join(dir,'rollback.sock');
 await new Promise<void>(r=>rollback.listen(rollbackSocket,r));
 try{assert.equal((await login('admin',rollbackSocket)).administrator,false);assert.equal((await request('GET',route,undefined,{},rollbackSocket)).status,403);}finally{rollback.closeAllConnections();await new Promise<void>(r=>rollback.close(()=>r()));}
 console.log('PASS remote administration: admin-only inventory, password/CSRF/origin, exact routes, site grants/revocation, LAN and remote session invalidation, audit fail-closed, actor revocation, expiry, and rollback. No equipment connected.');
}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true});}
