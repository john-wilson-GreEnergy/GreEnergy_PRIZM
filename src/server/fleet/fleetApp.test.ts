import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {Socket} from 'node:net';
import express from 'express';
import {hashLocalPassword,type LocalAccount} from '../security/localAccounts';
import {LocalSessions} from '../security/localSessions';
import {createFleetApp} from './fleetApp';
import {FleetBroker} from './FleetBroker';
import {emptyMetrics} from '../../core/fleet/model';
import {CollectorExport,parseExportConfig} from './collectorExport';

const directory=await mkdtemp(path.join(os.tmpdir(),'prizm-fleet-test-'));
await mkdir(path.join(directory,'assets'));
await writeFile(path.join(directory,'fleet.html'),'<!doctype html><title>Fleet fixture</title>');
await writeFile(path.join(directory,'index.html'),'Legacy page must not be exposed');
const one={siteId:'one',blockId:'1',stationCode:'FIXTURE1',blockIndex:1,name:'Site one'},two={...one,siteId:'two',stationCode:'FIXTURE2',name:'Site two'};
const broker=new FleetBroker([one,two]),stamp=new Date().toISOString();
const metrics=emptyMetrics();metrics.powerKw={value:0,quality:'live',observedAt:stamp,source:'fixture'};
for(const site of [one,two])broker.accept(site.siteId,{...site,schema:'prizm-site-summary-v1',observedAt:stamp,stale:false,metrics});
const password='Only an offline fixture password';
const account:LocalAccount={id:'fixture',email:'fixture@example.test',version:1,disabled:false,password:await hashLocalPassword(password),
  grants:[{capability:'telemetry.view',siteId:'one',blockId:'1',scope:{kind:'block'}}]};
let auditFails=false;const events:unknown[]=[];
const sessions=new LocalSessions(async()=>structuredClone([account]));
const options={origin:'http://localhost:3001',allowLoopbackHttp:true,publicDirectory:directory,
  audit:async(event:unknown)=>{if(auditFails)throw new Error('audit unavailable');events.push(event);}};
assert.throws(()=>createFleetApp(broker,sessions,{...options,origin:'http://10.0.0.15:3001'}),/HTTPS/);
const fleet=createFleetApp(broker,sessions,options),app=express();
let matches=true;
const config=parseExportConfig({identity:{...one,profileId:'profile',emsBaseUrl:'http://10.0.0.3:8080'},origin:options.origin,allowLoopbackHttp:true,token:'a'.repeat(43)});
const exporter=new CollectorExport(config,()=>({siteIdentity:{activeProfileId:'profile',stationCode:'FIXTURE1',blockIndex:1,emsBaseUrl:'http://10.0.0.3:8080'},liveStatus:{}}),()=>matches);
exporter.prepare();app.use('/collector',exporter.router());app.use(fleet);
const socketPath=path.join(directory,'http.sock');
const server=createServer((req,res)=>{Object.defineProperty(req.socket,'remoteAddress',{value:'127.0.0.1',configurable:true});app(req,res);});
await new Promise<void>(resolve=>server.listen(socketPath,resolve));
async function request(method:string,url:string,body?:unknown,extra:Record<string,string>={}){
  const payload=body===undefined?'':JSON.stringify(body);
  const headers={Host:'localhost:3001',Origin:options.origin,Connection:'close','Content-Type':'application/json','Content-Length':String(Buffer.byteLength(payload)),...extra};
  const bytes=await new Promise<Buffer>((resolve,reject)=>{
    const socket=new Socket(),parts:Buffer[]=[];socket.setTimeout(10000,()=>socket.destroy(new Error('Fixture timeout')));
    socket.on('error',reject);socket.on('data',part=>parts.push(part));socket.on('end',()=>resolve(Buffer.concat(parts)));
    socket.connect(socketPath,()=>socket.write(`${method} ${url} HTTP/1.1\r\n${Object.entries(headers).map(([key,value])=>`${key}: ${value}`).join('\r\n')}\r\n\r\n${payload}`));
  });
  const text=bytes.toString(),index=text.indexOf('\r\n\r\n'),head=text.slice(0,index),data=text.slice(index+4);
  return {status:Number(head.split(' ')[1]),head,data:/content-type: application\/json/i.test(head)?JSON.parse(data):data};
}
try{
  assert.equal((await request('GET','/')).status,200);
  assert.match((await request('GET','/')).head,/frame-ancestors 'none'/);
  assert.equal((await request('GET','/api/fleet/summary')).status,401);
  const login=await request('POST','/api/fleet/login',{email:account.email,password});assert.equal(login.status,200);
  assert.match(login.head,/HttpOnly/);assert.match(login.head,/SameSite=Strict/);
  const cookie=login.head.match(/set-cookie: ([^;]+)/i)![1];
  const auth={Cookie:cookie};
  const session=await request('GET','/api/fleet/session',undefined,auth);assert.equal(session.status,200);
  const summary=await request('GET','/api/fleet/summary',undefined,auth);
  assert.equal(summary.status,200);assert.equal(summary.data.sites.length,1);assert.equal(summary.data.totals.powerKw.value,0);
  assert(!JSON.stringify(summary.data).includes('FIXTURE2'));
  for(const route of ['/api/ems/control','/api/fleet/control','/api/fleet/summary','/api/local/commands','/turtle/tools/urls']){
    assert.equal((await request('POST',route,{action:'close'},auth)).status,403,route);
  }
  for(const route of ['/index.html','/src/fleet/main.tsx','/assets/server.cjs','/accounts.json','/api/fleet/summary?siteId=two','/api/fleet/summary?url=http://10.0.0.3'])assert.equal((await request('GET',route,undefined,auth)).status,403,route);
  assert.equal((await request('GET','/api/fleet/summary',undefined,{...auth,Origin:'http://evil.example'})).status,403);
  assert.equal((await request('GET','/api/fleet/summary',undefined,{...auth,Host:'evil.example'})).status,403);
  assert.equal((await request('POST','/api/fleet/logout',{},auth)).status,403);
  assert.equal((await request('POST','/api/fleet/touch',{}, {...auth,'X-Prizm-Csrf':session.data.csrf})).status,200);
  account.disabled=true;
  assert.equal((await request('GET','/api/fleet/summary',undefined,auth)).status,401,'Revoked accounts cannot read cached fleet state');
  account.disabled=false;
  auditFails=true;
  const rejected=await request('POST','/api/fleet/login',{email:account.email,password});assert.equal(rejected.status,503);assert(!/set-cookie:/i.test(rejected.head));
  assert.equal((await request('GET','/collector/site-summary')).status,401);
  const serviceAuth={Authorization:'Bearer '+config.token};
  assert.equal((await request('GET','/collector/site-summary',undefined,serviceAuth)).status,200);
  matches=false;assert.equal((await request('GET','/collector/site-summary',undefined,serviceAuth)).status,503,'Profile switch invalidates cached identity');
  assert.equal((await request('POST','/collector/site-summary',{},serviceAuth)).status,403);
  assert.equal((await request('GET','/collector/site-summary?refresh=1',undefined,serviceAuth)).status,403);
  exporter.stop();assert.equal((await request('GET','/collector/site-summary',undefined,serviceAuth)).status,503);
  assert(!JSON.stringify(events).includes(password));assert(!JSON.stringify(events).includes(cookie));
  console.log('Fleet HTTP authentication, site grants, revocation, export identity, route denial and rollback tests passed');
}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
