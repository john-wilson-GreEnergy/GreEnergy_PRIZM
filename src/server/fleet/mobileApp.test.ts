import assert from 'node:assert/strict';
import express from 'express';
import {createServer} from 'node:http';
import {Socket} from 'node:net';
import {mkdtemp,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createMobileApp} from './mobileApp';
import {createFleetApp} from './fleetApp';
import {FleetBroker} from './FleetBroker';
import {LocalSessions} from '../security/localSessions';
import {hashLocalPassword,type LocalAccount} from '../security/localAccounts';
import {emptyMetrics} from '../../core/fleet/model';
import {MobileHvacCache} from './mobileHvacCache';
import {thermalUnits} from '../thermal/thermalModel';
import {projectMobileHvac} from './mobileHvacProjection';

const dir=await mkdtemp(path.join(os.tmpdir(),'prizm-mobile-test-'));
await writeFile(path.join(dir,'mobile.html'),'<title>Mobile fixture</title>');
const one={siteId:'one',blockId:'1',stationCode:'FIXTURE1',blockIndex:1,name:'Site one'},two={...one,siteId:'two',stationCode:'FIXTURE2',name:'Site two'};
const broker=new FleetBroker([one,two]),stamp=new Date().toISOString();
for(const site of [one,two])broker.accept(site.siteId,{...site,schema:'prizm-site-summary-v1',observedAt:stamp,stale:false,metrics:emptyMetrics()});
const password='Offline fixture password only';
const account:LocalAccount={id:'fixture',email:'fixture@example.test',version:1,disabled:false,fleetAdmin:true,password:await hashLocalPassword(password),grants:['telemetry.view','workspace.full'].map(capability=>({capability:capability as 'telemetry.view'|'workspace.full',siteId:'one',blockId:'1',scope:{kind:'block' as const}}))};
let now=Date.now(),failAudit=false;
const readAccounts=async()=>structuredClone([account]);
const desktopSessions=new LocalSessions(readAccounts,()=>now,true);
const origin='http://localhost:3001';
const queried:string[]=[],events:unknown[]=[];
const options={origin,allowLoopbackHttp:true,publicDirectory:dir,accounts:readAccounts,clock:()=>now,
 hvac:(id:string)=>{queried.push(id);return {units:[],error:null,capturedAt:now};},
 audit:async(e:unknown)=>{if(failAudit)throw Error('Audit unavailable');events.push(e);}};
const app=express();app.use('/mobile',createMobileApp(broker,options));app.use(createFleetApp(broker,desktopSessions,options));
const server=createServer((req,res)=>{Object.defineProperty(req.socket,'remoteAddress',{value:'127.0.0.1',configurable:true});app(req,res);});
const socketPath=path.join(dir,'http.sock');await new Promise<void>(resolve=>server.listen(socketPath,resolve));
async function request(method:string,url:string,body?:unknown,extra:Record<string,string>={}){
 const payload=body===undefined?'':JSON.stringify(body);
 const headers={Host:'localhost:3001',Origin:origin,Connection:'close','Content-Type':'application/json','Content-Length':String(Buffer.byteLength(payload)),...extra};
 const text=await new Promise<string>((resolve,reject)=>{
  const socket=new Socket();let data='';socket.setEncoding('utf8');socket.setTimeout(10000,()=>socket.destroy(Error('Fixture timeout')));socket.on('error',reject);socket.on('data',s=>data+=s);socket.on('end',()=>resolve(data));
  socket.connect(socketPath,()=>socket.write(`${method} ${url} HTTP/1.1\r\n${Object.entries(headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')}\r\n\r\n${payload}`));
 });
 const boundary=text.indexOf('\r\n\r\n'),head=text.slice(0,boundary),bodyText=text.slice(boundary+4);
 const returned=Object.fromEntries(head.split('\r\n').slice(1).map(line=>{const i=line.indexOf(':');return [line.slice(0,i).toLowerCase(),line.slice(i+1).trim()];}));
 return {status:Number(head.split(' ')[1]),headers:returned,data:/application\/json/.test(returned['content-type'])?JSON.parse(bodyText):bodyText};
}
try{
 assert.equal((await request('GET','/mobile/')).status,200);
 assert.equal((await request('GET','/mobile/api/fleet/session')).status,401);
 const login=await request('POST','/mobile/api/fleet/login',{email:account.email,password});assert.equal(login.status,200);
 const cookie=String(login.headers['set-cookie']).split(';')[0],auth={Cookie:cookie};
 assert.match(String(login.headers['set-cookie']),/Path=\/mobile/);assert.match(String(login.headers['set-cookie']),/Max-Age=86400/);assert.match(String(login.headers['set-cookie']),/HttpOnly/);
 const session=await request('GET','/mobile/api/fleet/session',undefined,auth);
 assert.equal(session.status,200);assert.equal(session.data.administrator,false);assert.deepEqual(session.data.workspaces,[]);
 const summary=await request('GET','/mobile/api/fleet/summary',undefined,auth);
 assert.equal(summary.status,200);assert.deepEqual(summary.data.sites.map((s:any)=>s.siteId),['one']);assert.deepEqual(queried,['one']);
 // Renaming a mobile token never turns it into a desktop/control session.
 assert.equal((await request('GET','/api/fleet/session',undefined,{Cookie:cookie.replace('prizm_mobile_session','prizm_fleet_session')})).status,401);
 const desktop=await desktopSessions.login(account.email,password,'fixture');
 assert.equal((await request('GET','/mobile/api/fleet/session',undefined,{Cookie:'prizm_mobile_session='+desktop.token})).status,401);
 for(const target of ['/api/fleet/admin/users','/api/fleet/reauthenticate','/api/fleet/monitor','/api/local/commands','/turtle/tools/urls','/api/local/site-data/thermal','/api/fleet/summary?siteId=two','/api/fleet/summary/','/api/fleet/%73ummary','/accounts.json','/assets/server.cjs']){
  for(const method of ['GET','POST'])assert.equal((await request(method,'/mobile'+target,undefined,auth)).status,403,target);
 }
 assert.equal((await request('GET','/mobile/api/fleet/summary',undefined,{...auth,Origin:'https://other.test'})).status,403);
 assert.equal((await request('GET','/mobile/api/fleet/summary',undefined,{...auth,'Sec-Fetch-Site':'cross-site'})).status,403);
 assert.equal((await request('POST','/mobile/api/fleet/touch',{},auth)).status,403);
 assert.equal((await request('POST','/mobile/api/fleet/touch',{}, {...auth,'X-Prizm-Csrf':session.data.csrf})).status,200);
 now+=23*3600000;assert.equal((await request('GET','/mobile/api/fleet/session',undefined,auth)).status,200);
 now+=3600001;assert.equal((await request('GET','/mobile/api/fleet/session',undefined,auth)).status,401);
 now=Date.now();const again=await request('POST','/mobile/api/fleet/login',{email:account.email,password});
 const auth2={Cookie:String(again.headers['set-cookie']).split(';')[0]};account.disabled=true;
 assert.equal((await request('GET','/mobile/api/fleet/summary',undefined,auth2)).status,401);account.disabled=false;
 failAudit=true;assert.equal((await request('POST','/mobile/api/fleet/login',{email:account.email,password})).status,503);
 assert(!JSON.stringify(events).includes(password));assert(!JSON.stringify(events).includes(cookie));
 console.log('PASS mobile route denial, session/control isolation, CSRF, grants, revocation, 24-hour expiry and audit failure');
}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}

const collector={...one,url:'https://collector.test:9443/api/fleet/site-summary',token:'a'.repeat(43)},workspace={siteId:'one',origin:'https://fleet.test:3444',token:'b'.repeat(43)};
const thermal={units:thermalUnits([{ip:'10.0.4.3',arrayIndex:4,segmentLabel:'CS',lastSuccessUtc:new Date(now).toISOString(),faultMessages:['FSS fault'],hvac1:{compressorOn:false,electricHeatOn:false,currentA:0},hvac2:{compressorOn:true,reversingValveOn:false,currentA:13.6}}],now)};
let failed=false,calls=0;
const fetcher:typeof fetch=async(input,init)=>{calls++;assert.equal(String(input),'https://collector.test:9443/api/fleet/workspace/api/local/site-data/thermal');assert.equal(init?.method,'GET');assert.equal(init?.redirect,'error');assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer '+workspace.token);return new Response(failed?'failure':JSON.stringify(thermal),{status:failed?503:200,headers:{'Content-Type':'application/json'}});};
const cache=new MobileHvacCache([collector],[workspace],fetcher,()=>now);
await cache.refresh(collector,workspace);assert.equal(cache.view('one').units.length,2);
assert.deepEqual(cache.view('one').units[0].faults,[]);assert.deepEqual(cache.view('one').units[1].faults,[]);
assert.deepEqual(cache.view('one').units[0].controllerAlerts,['FSS fault']);
assert.equal(cache.view('one').units[0].readings.cell.text,'N/A — no cells');
for(let i=0;i<20;i++)cache.view('one');assert.equal(calls,1,'Browsers never trigger collection');
assert.equal(cache.view('two').units.length,0);
now+=16000;assert.equal(cache.view('one').units.length,0,'Expired cache is unavailable');
failed=true;await cache.refresh(collector,workspace);assert.equal(cache.view('one').units.length,0);
cache.stop();
assert.equal(projectMobileHvac(thermal,now+120000).units[0].quality,'Stale');
console.log('PASS fixed cached thermal reads, freshness, missing/zero/CS applicability, and FSS is not an HVAC fault');
