// Loopback-only HTTPS/HTTP integration. Never imports equipment adapters.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {createServer as tlsServer} from 'node:https';
import {createServer,request,type Server} from 'node:http';
import express from 'express';
import {LocalSessions} from '../security/localSessions';
import {hashLocalPassword,type LocalAccount} from '../security/localAccounts';
import {createWorkspaceGateway,workspaceForwarder} from './workspaceGateway';
import {collectorWorkspace} from './workspaceCollector';
import {CorrectiveGuidanceStore,createCorrectiveGuidanceRouter} from '../notifications/correctiveGuidance';
import type {Collector} from './CollectorPoller';

const dir=await mkdtemp(path.join(tmpdir(),'prizm-workspace-tls-'));
const certConfig=path.join(dir,'cert.conf');
await writeFile(certConfig,'[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ext\n[dn]\nCN=127.0.0.1\n[ext]\nsubjectAltName=IP:127.0.0.1\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\n');
await promisify(execFile)('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',path.join(dir,'key.pem'),'-out',path.join(dir,'cert.pem'),'-config',certConfig]);
const key=await readFile(path.join(dir,'key.pem')),cert=await readFile(path.join(dir,'cert.pem'));
const servers:Server[]=[];
async function listen(s:Server){servers.push(s);await new Promise<void>((resolve,reject)=>{s.once('error',reject);s.listen(0,'127.0.0.1',resolve);});return (s.address() as {port:number}).port;}
const user:LocalAccount={id:'fixture',email:'fixture@example.invalid',disabled:false,version:1,password:await hashLocalPassword('Loopback-only workspace fixture'),grants:[]};
const sessions=new LocalSessions(async()=>structuredClone([user]));
const calls:{site:number;body:unknown;cookie:unknown;authorization:unknown;csrf:unknown}[]=[];
let auth:{token:string;csrf:string};
async function send(port:number,url:string,method='GET',body?:unknown,headers:Record<string,string>={}){
  const payload=body===undefined?'':JSON.stringify(body);
  return new Promise<{status:number;body:string;headers:Record<string,unknown>}>((resolve,reject)=>{
    const req=request({host:'127.0.0.1',port,path:url,method,headers:{Host:'localhost:'+port,Origin:'http://localhost:'+port,Cookie:'prizm_fleet_session='+auth.token,'X-Prizm-Csrf':auth.csrf,'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload),...headers}},res=>{
      let body='';res.on('data',d=>body+=d);res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode!,body,headers:res.headers}));
    });req.on('error',reject);req.setTimeout(10000,()=>req.destroy(Error('Fixture timeout')));req.end(payload);
  });
}
try{
  const entries:{port:number;siteId:string}[]=[];
  const sharedSites:Collector[]=[];
  for(const n of [1,2]){
    const token=String(n).repeat(43),app=express(),legacy=express();legacy.use(express.json());
    legacy.use('/api/local/corrective-guidance',createCorrectiveGuidanceRouter(new CorrectiveGuidanceStore(path.join(dir,`guidance-${n}.json`)),{store:new CorrectiveGuidanceStore(path.join(dir,'shared.json'),true),sites:['Fixture 1','Fixture 2']}));
    legacy.post('/api/local/mock-control',(req,res)=>{calls.push({site:n,body:req.body,cookie:req.headers.cookie,authorization:req.headers.authorization,csrf:req.headers['x-prizm-csrf']});res.cookie('unsafe','never-forward');res.json({site:n,accepted:true});});
    legacy.get('/api/local/snapshot',(_req,res)=>res.json({site:n,source:'fixture'}));
    legacy.get('/api/local/redirect',(_req,res)=>res.redirect('https://example.invalid'));
    legacy.get('/api/local/site-data/strings-stream',(_req,res)=>{res.type('text/event-stream');res.write('data: one\n\n');setTimeout(()=>res.end('data: two\n\n'),10);});
    app.use('/api/fleet/workspace',collectorWorkspace(token,()=>true,legacy));
    const upstreamPort=await listen(tlsServer({key,cert},app));
    const collector={siteId:'fixture-'+n,blockId:'1',blockIndex:1,stationCode:'LAB'+n,name:'Fixture '+n,url:`https://127.0.0.1:${upstreamPort}/api/fleet/site-summary`,token:'s'.repeat(43)};
    sharedSites.push(collector);
    user.grants.push(...(['telemetry.view','workspace.full'] as const).map(capability=>({capability,siteId:collector.siteId,blockId:'1',scope:{kind:'block' as const}})));
    // Reserve the actual frontend port before constructing its fixed-origin guard.
    const frontend=express(),port=await listen(createServer(frontend));
    const enrollment={siteId:collector.siteId,origin:`http://localhost:${port}`,token};
    frontend.use(createWorkspaceGateway(sessions,collector,enrollment,'http://localhost:3443',async()=>{},workspaceForwarder(collector,enrollment,cert),true,sharedSites));
    entries.push({port,siteId:collector.siteId});
  }
  auth=await sessions.login(user.email,'Loopback-only workspace fixture','fixture');
  for(const [i,e] of entries.entries()){
    assert.equal(JSON.parse((await send(e.port,'/api/local/snapshot')).body).site,i+1);
    const result=await send(e.port,'/api/local/mock-control','POST',{target:'synthetic-only',value:i});
    assert.equal(result.status,200);assert.equal(result.headers['set-cookie'],undefined);
    assert.equal(calls.at(-1)?.site,i+1);assert.deepEqual(calls.at(-1)?.body,{target:'synthetic-only',value:i});
    assert.equal(calls.at(-1)?.cookie,undefined);assert.equal(calls.at(-1)?.authorization,undefined);assert.equal(calls.at(-1)?.csrf,undefined);
    assert.equal((await send(e.port,'/api/local/redirect')).status,502);
    const stream=await send(e.port,'/api/local/site-data/strings-stream');assert.match(stream.body,/data: one/);assert.match(stream.body,/data: two/);
  }
  assert.equal(calls.length,2,'Each synthetic control was delivered once to the assigned backend');
  const patch={revision:0,reset:false,entry:{key:JSON.stringify(['String / Cell','2074']),category:'Balancing',actions:['Fixture only'],validation:[],clearing:[],reference:'Offline fixture',reason:'Authorization test'}};
  const route='/api/local/corrective-guidance',port=entries[0].port;
  assert.equal(JSON.parse((await send(port,route,'GET',undefined,{'X-Prizm-Guidance-Actor':'forged'})).body).canEdit,false,'Client actor header cannot enable editing');
  assert.equal((await send(port,route,'PUT',patch,{'X-Prizm-Guidance-Actor':'forged'})).status,403);
  user.fleetAdmin=true;user.version++;
  auth=await sessions.login(user.email,'Loopback-only workspace fixture','fixture');
  assert.equal(JSON.parse((await send(port,route)).body).canEdit,true);
  assert.equal((await send(port,route,'PUT',patch,{'X-Prizm-Csrf':''})).status,403);
  assert.equal((await send(port,route,'PUT',patch,{Origin:'http://untrusted.invalid'})).status,403);
  const saved=await send(port,route,'PUT',patch);assert.equal(saved.status,200,saved.body);
  const guidance=JSON.parse(await readFile(path.join(dir,'guidance-1.json'),'utf8'));
  assert.equal(guidance.history[0].actor,user.id);assert.equal(guidance.revision,1);
  assert.equal((await send(port,route,'PUT',patch)).status,409,'Stale revision cannot overwrite edits');
  assert.equal(JSON.parse((await send(entries[1].port,route)).body).revision,0,'Guidance remains site-specific');
  const sharedPatch={...patch,scope:'shared'};
  assert.equal(JSON.parse((await send(port,route)).body).canEditShared,true);
  assert.equal((await send(port,route,'PUT',sharedPatch)).status,200);
  assert.equal(JSON.parse((await send(entries[1].port,route)).body).sharedRevision,1,'Both collectors observe one shared catalog');
  assert.equal((await send(entries[1].port,route,'PUT',sharedPatch)).status,409,'Cross-site stale writers cannot overwrite shared edits');
  user.grants=user.grants.filter(g=>g.siteId!==entries[1].siteId);user.version++;
  auth=await sessions.login(user.email,'Loopback-only workspace fixture','fixture');
  assert.equal(JSON.parse((await send(port,route)).body).canEditShared,false);
  assert.equal((await send(port,route,'PUT',{...sharedPatch,revision:1},{'X-Prizm-Guidance-Shared':'true'})).status,403,'Client cannot spoof all-site permission');
  assert.equal(JSON.parse(await readFile(path.join(dir,'shared.json'),'utf8')).revision,1);
  user.version++;
  assert.equal((await send(entries[0].port,'/api/local/mock-control','POST',{})).status,401);
  assert.equal(calls.length,2);
  console.log('PASS loopback HTTPS workspace proxy: two distinct collectors, streamed reads, POST body parity, stripped secrets/cookies, redirect rejection, revocation, no retries');
}finally{for(const s of servers){s.closeAllConnections();await new Promise<void>(resolve=>s.close(()=>resolve()));}}
