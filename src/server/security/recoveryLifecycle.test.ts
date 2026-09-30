import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createServer} from 'node:http';
import {Socket} from 'node:net';
import express from 'express';
import {hashLocalPassword,readAccounts} from './localAccounts';
import {LocalSessions} from './localSessions';
import {OwnedJobs} from './ownedJobs';
import {ContactorReceipts} from './contactorReceipts';
import {ContactorAccess} from './contactorAccess';
import {CommandRecovery} from './commandRecovery';
import {createLocalAccessPilot} from './localAccessPilot';
const scope={siteId:'fixture',blockId:'1'},id='fixture-lifecycle-command',password='fixture-only-long-test-password';
const mode=process.argv[2],directory=process.argv[3];
if(!mode) {
  const dir=await mkdtemp('/tmp/prizm-recovery-lifecycle-');
  await writeFile(dir+'/accounts.json',JSON.stringify([{id:'alice',email:'alice@example.test',disabled:false,version:1,password:await hashLocalPassword(password),grants:
    ['history.view','telemetry.view','controls.contactors'].map(capability=>({capability,...scope,scope:{kind:'block'}}))}]),{mode:0o600});
  await writeFile(dir+'/owners.json','[]',{mode:0o600});await writeFile(dir+'/receipts.json','{"version":1,"entries":[]}',{mode:0o600});
  await new ContactorReceipts(dir+'/receipts.json').reserve({...scope,commandId:id,subject:'alice',sessionId:'prior-session',array:1,string:2,action:'open',reason:'Simulated interruption',topologyRevision:'fixture'});
  const run=promisify(execFile);let preserved='';
  for(const phase of ['record','read-only','re-enabled']) {
    const result=await run(process.execPath,['--require',path.resolve('scripts/test-network-guard.cjs'),'--import','tsx',fileURLToPath(import.meta.url),phase,dir]);
    assert.match(result.stdout,/PHASE PASSED/);
    const raw=await readFile(dir+'/receipts.json','utf8');
    if(phase==='record') preserved=raw;else assert.equal(raw,preserved,'Rollback/re-enable must preserve ledger byte for byte');
  }
  console.log('Recovery lifecycle: three fresh HTTP processes, session invalidation, durable review, authenticated read-only rollback and re-enable with target still blocked passed; no device transports.');
} else {
  process.chdir(directory);
  const receipts=new ContactorReceipts(directory+'/receipts.json');
  const context=async()=>({...scope,topologyRevision:'fixture',validUntil:Date.now()+60000,targets:[{id:'array:1:string:2',kind:'string' as const}]});
  let dispatches=0,legacy=0;
  const app=express();
  app.use('/api',createLocalAccessPilot(new LocalSessions(()=>readAccounts(directory+'/accounts.json')),new OwnedJobs(directory+'/owners.json'),{
    scope:()=>scope,
    contactors:mode==='read-only'?undefined:new ContactorAccess({receipts,context,audit:async()=>{},execute:async()=>{dispatches++;throw new Error('Forbidden fixture dispatch');}}),
    recovery:mode==='read-only'?undefined:new CommandRecovery({receipts,scope:()=>scope,context,audit:async()=>{},observe:async()=>({actual:'open',requested:'open',capturedAt:Date.now()})}),
    readTelemetry:async()=>({site:{name:'Fixture',station:'FIXTURE',block:1},cycle:1,capturedAt:null,ageMs:null,state:'UNKNOWN',stale:true,strings:[],issues:[],counts:{arrays:0,strings:0,warnings:null,alarms:null}}),
    readJob:async()=>null,startRecording:async()=>{throw new Error('Forbidden');},stopRecording:async()=>{throw new Error('Forbidden');},audit:async()=>{},
  },{origin:'http://localhost:3000',allowLoopbackHttp:true}));
  app.use((_req,res)=>{legacy++;res.sendStatus(500);});
  const socketPath=directory+'/'+mode+'.sock';
  const server=createServer((req,res)=>{Object.defineProperty(req.socket,'remoteAddress',{value:'127.0.0.1',configurable:true});app(req,res);});
  await new Promise<void>(resolve=>server.listen(socketPath,resolve));
  const request=async(method:string,url:string,cookie='',csrf='',body?:unknown)=>{
    const payload=body===undefined?'':JSON.stringify(body);
    const text=await new Promise<string>((resolve,reject)=>{
      const socket=new Socket();let data='';socket.setTimeout(10000,()=>socket.destroy(new Error('Fixture timeout')));
      socket.on('error',reject);socket.on('data',chunk=>{data+=chunk.toString();});socket.on('end',()=>resolve(data));
      socket.connect(socketPath,()=>socket.write(`${method} ${url} HTTP/1.1\r\nHost: localhost:3000\r\nOrigin: http://localhost:3000\r\nConnection: close\r\nCookie: ${cookie}\r\nX-Prizm-Csrf: ${csrf}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(payload)}\r\n\r\n${payload}`));
    });
    const index=text.indexOf('\r\n\r\n'),head=text.slice(0,index);
    return {status:Number(head.split(' ')[1]),cookie:head.match(/set-cookie: ([^;]+)/i)?.[1],data:JSON.parse(text.slice(index+4)) as Record<string,unknown>};
  };
  try {
    if(mode!=='record') assert.equal((await request('GET','/api/access/session',await readFile(directory+'/old-cookie','utf8'))).status,401,'Old session must not survive process restart');
    assert.equal((await request('GET','/api/access/recovery')).status,401);
    const login=await request('POST','/api/access/login','','',{email:'alice@example.test',password});assert.equal(login.status,200);assert(login.cookie);
    const cookie=login.cookie,csrf=String(login.data.csrf);
    assert.equal((await request('GET','/api/access/telemetry',cookie)).status,200);
    if(mode==='record') {
      const review=await request('GET','/api/access/recovery/'+id,cookie);assert.equal(review.status,200);
      const command=review.data.command as {updatedAt:number};
      const result=await request('POST','/api/access/recovery',cookie,csrf,{commandId:id,expectedUpdatedAt:command.updatedAt,observation:review.data.observation,reason:'follow-up-required',confirmed:true});
      assert.equal(result.status,200);assert.equal(result.data.targetReleased,false);
      await writeFile(directory+'/old-cookie',cookie,{mode:0o600});
    } else if(mode==='read-only') {
      assert.equal((await request('GET','/api/access/recovery',cookie)).status,403);
      assert.equal((await request('POST','/api/access/controls/contactors',cookie,csrf,{})).status,403);
    } else {
      const list=await request('GET','/api/access/recovery',cookie);assert.equal(list.status,200);
      const rows=list.data as unknown as {reviews:unknown[];state:string}[];assert.equal(rows.length,1);assert.equal(rows[0].reviews.length,1);assert.equal(rows[0].state,'reserved');
      assert.equal((await request('GET','/api/access/controls/contactors/1/2',cookie)).status,409);
    }
    assert.equal((await request('POST','/api/local/contactor-control',cookie,csrf,{confirmed:true})).status,403);
    await assert.rejects(receipts.assertTargetClear({...scope,array:1,string:2}),/reconciliation/);
    assert.equal(dispatches,0);assert.equal(legacy,0);console.log('PHASE PASSED',mode);
  } finally {await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}
