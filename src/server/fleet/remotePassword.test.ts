import assert from 'node:assert/strict';
import {createServer,request as httpRequest} from 'node:http';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRemoteMobileApp,type RemoteMobileConfig} from './remoteMobile';
import {FleetBroker} from './FleetBroker';
import {hashLocalPassword,type LocalAccount} from '../security/localAccounts';
import {emptyMetrics} from '../../core/fleet/model';

const dir=await mkdtemp(path.join(tmpdir(),'prizm-password-test-'));
await mkdir(path.join(dir,'assets'));
await writeFile(path.join(dir,'assets/mobile.js'),'// fixture');
await writeFile(path.join(dir,'mobile.html'),'<html><script src="/assets/mobile.js"></script></html>');
await writeFile(path.join(dir,'fleet.html'),'<html><h1>Fleet fixture</h1></html>');
await writeFile(path.join(dir,'index.html'),'<h1>Desktop fixture</h1>');
const config:RemoteMobileConfig={origin:'https://prizm.example.test',socketPath:'/run/prizm-remote/mobile.sock',authentication:'password',
 issuer:'https://unused.cloudflareaccess.com',audience:'a'.repeat(64),keysFile:'/nonexistent/keys.json',keysOwnerUid:0};
const password='Private test password only',hash=await hashLocalPassword(password);
const account:LocalAccount={id:'remote',email:'remote@example.test',password:hash,disabled:false,version:1,remoteAccess:true,
 grants:[{capability:'telemetry.view',siteId:'one',blockId:'b1',scope:{kind:'block'}}]};
const local={...account,id:'local',email:'local@example.test',remoteAccess:false};
const disabled={...account,id:'disabled',email:'disabled@example.test',disabled:true};
const sites=['one','two'].map(siteId=>({siteId,blockId:'b1',blockIndex:1,stationCode:'LAB'+siteId,name:siteId}));
let now=Date.now(),setupCalls=0,hvacCalls=0,forwarded=0,audits:string[]=[];
const broker=new FleetBroker(sites,()=>now);
for(const s of sites)broker.accept(s.siteId,{...s,schema:'prizm-site-summary-v1',observedAt:new Date(now).toISOString(),stale:false,metrics:emptyMetrics()});
const options={publicDirectory:dir,accounts:async()=>[account,local,disabled],clock:()=>now,
 hvac:()=>{hvacCalls++;return {units:[],error:null,capturedAt:now};},
 audit:async(e:{action:string;outcome:string})=>{audits.push(e.action+':'+e.outcome);},
 setup:async()=>{setupCalls++;return {accepted:true};},
 desktop:sites.map(s=>({collector:{...s,url:'https://127.0.0.1:9443/api/fleet/site-summary',token:'x'.repeat(43)},
 forward:async(_req:any,res:any,recheck:()=>Promise<void>)=>{await recheck();forwarded++;res.json({site:s.siteId});}}))};
await assert.rejects(()=>createRemoteMobileApp(broker,options,{...config,authentication:'typo' as any}));
await assert.rejects(()=>createRemoteMobileApp(broker,options,{...config,experience:'typo' as any}));
const app=await createRemoteMobileApp(broker,options,config);
const server=createServer(app),socketPath=path.join(dir,'http.sock');
await new Promise<void>(r=>server.listen(socketPath,r));
async function request(method:string,url:string,body?:unknown,extra:Record<string,string>={},targetSocket=socketPath){
 const payload=body===undefined?'':JSON.stringify(body);
 return new Promise<{status:number;headers:import('node:http').IncomingHttpHeaders;data:any}>((resolve,reject)=>{
  const req=httpRequest({socketPath:targetSocket,path:url,method,headers:{Host:'prizm.example.test',Origin:config.origin,
   'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload),...extra}},res=>{
   let text='';res.on('data',d=>text+=d);res.on('end',()=>resolve({status:res.statusCode!,headers:res.headers,data:res.headers['content-type']?.includes('application/json')?JSON.parse(text):text}));
  });req.setTimeout(5000,()=>req.destroy(Error('timeout')));req.on('error',reject);req.end(payload);
 });
}
function cookieOf(result:Awaited<ReturnType<typeof request>>){
 return result.headers['set-cookie']!.find(c=>/Path=\/;/.test(c))!.split(';')[0];
}
const login=(email=account.email,pass=password)=>request('POST','/mobile/api/fleet/login',{email,password:pass});
const navigation={'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document',Origin:''};
try{
 assert.equal((await request('GET','/')).status,302);
 assert.equal((await request('GET','/')).headers.location,'/fleet/');
 for(const entry of ['fleet','mobile']){
  const canonical=await request('GET','/'+entry,undefined,navigation);
  assert.equal(canonical.status,302);
  assert.equal(canonical.headers.location,'/'+entry+'/');
 }
 assert.match((await request('GET','/fleet/')).data,/data-prizm-adaptive="true"/);
 assert.match((await request('GET','/mobile/')).data,/data-prizm-adaptive="true"/);
 assert.equal((await request('GET','/fleet/',undefined,navigation)).status,200);
 assert.equal((await request('GET','/mobile/')).status,200,'Public login shell needs no Access identity');
 assert.equal((await request('GET','/assets/mobile.js')).status,200);
 assert.equal((await request('GET','/mobile/',undefined,navigation)).status,200);
 assert.equal((await request('GET','/desktop/one/',undefined,navigation)).status,303);
 for(const url of ['/fleet/api/fleet/session','/fleet/api/fleet/summary','/mobile/api/fleet/session','/mobile/api/fleet/summary','/desktop/one/api/fleet/workspace-context','/desktop/one/api/local/site-data/pcs'])
  assert.equal((await request('GET',url)).status,401,url);
 assert.equal(forwarded,0);assert.equal(hvacCalls,0);
 for(const url of ['/mobile/api/fleet/session','/mobile/api/fleet/summary','/assets/mobile.js'])
  assert.equal((await request('GET',url,undefined,navigation)).status,403,url);
 assert.equal((await request('GET','/mobile/',undefined,{'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'cors'})).status,403);
 assert.equal((await request('POST','/mobile/api/fleet/login',{email:account.email,password},navigation)).status,403);
 assert.equal((await request('POST','/mobile/api/fleet/login',{email:account.email,password},{Origin:'https://evil.test'})).status,403);
 for(const email of [local.email,disabled.email,'missing@example.test'])assert.equal((await login(email)).status,401,email);
 const signed=await login();assert.equal(signed.status,200);
 const cookie=cookieOf(signed);assert.match(signed.headers['set-cookie']!.join(';'),/Secure; HttpOnly|HttpOnly; Secure/);
 assert.match(signed.headers['set-cookie']!.join(';'),/SameSite=Strict/);
 const headers={Cookie:cookie,'Cf-Access-Jwt-Assertion':'forged','Cf-Access-Authenticated-User-Email':local.email};
 const session=await request('GET','/mobile/api/fleet/session',undefined,headers);
 const desktopSession=await request('GET','/fleet/api/fleet/session',undefined,headers);
 assert.deepEqual(desktopSession.data,session.data,'Both presentations use the same authorized read-only session');
 assert.equal(session.data.email,account.email,'Unverified proxy headers never determine identity');
 assert.equal(session.data.readOnly,true);assert.equal(session.data.administrator,false);
 assert.deepEqual(session.data.workspaces,[{siteId:'one',origin:'/desktop/one/'}]);
 assert.equal((await request('GET','/desktop/one/?tab=site-analytics',undefined,{...headers,...navigation})).status,200);
 for(const entry of ['/fleet/','/mobile/']){
  assert.equal((await request('GET',entry,undefined,headers)).status,200,'Same-origin navigation');
  assert.equal((await request('GET',entry,undefined,{...headers,'Sec-Fetch-Site':'none','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'})).status,200,'Direct refresh');
 }
 const summary=await request('GET','/mobile/api/fleet/summary',undefined,headers);
 assert.deepEqual(summary.data.sites.map((s:any)=>s.siteId),['one']);assert.equal(hvacCalls,1);
 const desktopSummary=await request('GET','/fleet/api/fleet/summary',undefined,headers);
 assert.deepEqual(desktopSummary.data,summary.data,'Desktop and mobile canonical summaries have exact parity');
 const context=await request('GET','/desktop/one/api/fleet/workspace-context',undefined,headers);
 assert.equal(context.data.fullControl,false);assert.equal(context.data.remoteReadOnly,true);
 assert.equal(context.data.fleetUrl,config.origin+'/fleet/');
 assert.equal((await request('GET','/desktop/one/api/local/site-data/pcs',undefined,headers)).status,200);
 for(const url of ['/desktop/two/','/desktop/two/api/local/site-data/pcs','/api/fleet/admin/users','/fleet/api/fleet/admin/users','/mobile/api/fleet/admin/users','/desktop/one/api/fleet/admin/users','/desktop/one/tools/controls/rotate'])
  assert.equal((await request('GET',url,undefined,headers)).status,403,url);
 for(const method of ['POST','PUT','PATCH','DELETE'])
  assert.equal((await request(method,'/desktop/one/api/local/site-data/pcs',{},headers)).status,403);
 assert.equal(forwarded,1,'No denied request forwarded to equipment or collector');
 assert.equal((await request('POST','/fleet/api/fleet/reauthenticate',{},headers)).status,403);
 assert.equal((await request('POST','/fleet/api/fleet/monitor',{},headers)).status,403);
 assert.equal((await request('POST','/mobile/api/fleet/touch',{},headers)).status,403);
 assert.equal((await request('POST','/mobile/api/fleet/touch',{}, {...headers,'X-Prizm-Csrf':session.data.csrf})).status,200);
 assert.equal((await request('POST','/mobile/api/fleet/setup',{email:local.email,token:'x'.repeat(43),password})).status,400);
 assert.equal(setupCalls,0,'Local-only invitation must not be redeemable remotely');
 assert.equal((await request('POST','/mobile/api/fleet/setup',{email:account.email,token:'x'.repeat(43),password})).status,200);
 assert.equal(setupCalls,1,'Enrolled invitation still delegates code validation to setup handler');
 const fleetLogin=await request('POST','/fleet/api/fleet/login',{email:account.email,password},headers);
 assert.equal(fleetLogin.status,200);
 const fleetCookie={Cookie:cookieOf(fleetLogin)};
 assert.equal((await request('GET','/fleet/api/fleet/session',undefined,headers)).status,401,'Replacing a session invalidates the previous token');
 const fleetSession=await request('GET','/fleet/api/fleet/session',undefined,fleetCookie);
 assert.equal(fleetSession.status,200);
 assert.equal((await request('GET','/mobile/api/fleet/session',undefined,fleetCookie)).status,200);
 assert.equal((await request('GET','/desktop/one/',undefined,fleetCookie)).status,200);
 assert.equal((await request('POST','/fleet/api/fleet/logout',{}, {...fleetCookie,'X-Prizm-Csrf':fleetSession.data.csrf})).status,200);
 assert.equal((await request('GET','/mobile/api/fleet/session',undefined,fleetCookie)).status,401);
 headers.Cookie=cookieOf(await login());
 account.remoteAccess=false;
 assert.equal((await request('GET','/mobile/api/fleet/session',undefined,headers)).status,401);
 assert.equal((await request('GET','/fleet/api/fleet/session',undefined,headers)).status,401);
 account.remoteAccess=true;
 now+=61000;const renewed=await login();const fresh={Cookie:cookieOf(renewed)};
 account.disabled=true;assert.equal((await request('GET','/desktop/one/api/local/site-data/pcs',undefined,fresh)).status,401);account.disabled=false;
 now+=61000;const expiry={Cookie:cookieOf(await login())};
 now+=86400001;assert.equal((await request('GET','/mobile/api/fleet/session',undefined,expiry)).status,401);
 for(let i=0;i<5;i++)assert.equal((await login(account.email,'wrong password')).status,401);
 assert.equal((await login()).status,429,'Password-only mode retains guessing protection');
 assert(audits.includes('mobile.login:accepted')&&audits.includes('mobile.login:rejected'));
 console.log('PASS password-only remote: direct login, navigation, opt-in, site scope, header spoofing, read-only, CSRF, revocation, invitation boundary, 24h expiry, rate limiting');
}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
const legacy=createServer(await createRemoteMobileApp(broker,options,{...config,experience:'mobile'}));
const legacySocket=path.join(dir,'legacy.sock');
await new Promise<void>(r=>legacy.listen(legacySocket,r));
try{
 const get=(url:string)=>request('GET',url,undefined,{},legacySocket);
 assert.equal((await get('/')).headers.location,'/mobile/');
 assert.equal((await get('/fleet/')).status,403);
 assert.doesNotMatch((await get('/mobile/')).data,/data-prizm-adaptive/);
 assert.equal((await get('/mobile/api/fleet/summary')).status,401);
 console.log('PASS presentation rollback: legacy mobile entry restored without changing authentication or read-only protections');
}finally{legacy.closeAllConnections();await new Promise<void>(r=>legacy.close(()=>r()));}
