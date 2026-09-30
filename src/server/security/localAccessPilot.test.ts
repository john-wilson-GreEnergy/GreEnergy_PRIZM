import assert from 'node:assert/strict';
import {mkdtemp,writeFile,chmod,readFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {Socket} from 'node:net';
import express from 'express';
import {hashLocalPassword,verifyLocalPassword,parseAccounts,readAccounts,type LocalAccount} from './localAccounts';
import {LocalSessions} from './localSessions';
import {OwnedJobs} from './ownedJobs';
import {createLocalAccessPilot, type PilotPorts} from './localAccessPilot';
import {ContactorAccess} from './contactorAccess';
import {ContactorReceipts} from './contactorReceipts';
import {CommandRecovery} from './commandRecovery';
import {accessPilotFromEnvironment} from './accessPilotRuntime';
import {pilotUi} from './pilotUi';
import type {ReadOnlyTelemetry} from '../../core/security/readOnlyTelemetry';

const directory = await mkdtemp('/tmp/prizm-access-test-');
const originalCwd = process.cwd(); process.chdir(directory);
const password = 'offline-fixture-only-very-long-password';
const hashed = await hashLocalPassword(password);
assert(await verifyLocalPassword(password,hashed));
assert.equal(await verifyLocalPassword('incorrect',hashed),false);
await assert.rejects(hashLocalPassword('short'),/15 characters/);
const scope = {siteId:'fixture',blockId:'1'};
const accounts: LocalAccount[] = ['alice','bob','viewer'].map(username => ({id:username,email:username+'@example.test',disabled:false,version:1,password:hashed,
  grants:[{capability:'history.view',...scope,scope:{kind:'block'}},...(username !== 'viewer' ? [{capability:'diagnostics.record' as const,...scope,scope:{kind:'block' as const}},{capability:'telemetry.view' as const,...scope,scope:{kind:'block' as const}}] : [])]}));
parseAccounts(accounts);
// Logout while the account file read is pending must not authenticate an old token.
let releaseAccountRead: (()=>void) | undefined;
let delayedAccountRead = false;
const racingSessions = new LocalSessions(async()=>{
  if (delayedAccountRead) await new Promise<void>(resolve=>{releaseAccountRead=resolve;});
  return structuredClone(accounts);
});
const racingLogin = await racingSessions.login('alice@example.test',password,'fixture');
delayedAccountRead=true;
const pendingAuthentication=racingSessions.authenticate(racingLogin.token,false);
racingSessions.logout(racingLogin.token);releaseAccountRead!();
await assert.rejects(pendingAuthentication,/Sign-in required/);
assert.throws(() => parseAccounts([{...accounts[0],email:'ALICE@example.test'}]),/Invalid/);
assert.throws(() => parseAccounts([{...accounts[0],email:undefined,username:'alice'}]),/Invalid/,'Old browser/username identities cannot authenticate');
assert.throws(() => parseAccounts([accounts[0],{...accounts[1],email:accounts[0].email}]),/Duplicate/);
assert.throws(() => parseAccounts([...accounts,accounts[0]]),/Duplicate/);
const file = directory+'/accounts.json', ownerFile = directory+'/owners.json';
await writeFile(file,JSON.stringify(accounts),{mode:0o600}); await writeFile(ownerFile,'[]',{mode:0o600});
assert.equal((await readAccounts(file)).length,3);
await chmod(file,0o644); await assert.rejects(readAccounts(file),/private/); await chmod(file,0o600);
let now = Date.now();
const sessions = new LocalSessions(async () => structuredClone(accounts),() => now);
const jobs = new OwnedJobs(ownerFile);
let starts = 0, stops = 0, reads = 0, legacy = 0;
const audit: unknown[] = [];
let currentScope = {...scope};
let telemetryReads = 0;
let afterRead = () => {};
const telemetry: ReadOnlyTelemetry = {site:{name:'Fixture',station:'TEST',block:1},cycle:1,capturedAt:null,ageMs:null,state:'UNKNOWN',stale:true,strings:[],issues:[],counts:{arrays:0,strings:0,alarms:null,warnings:null}};
const ports: PilotPorts = {
  scope:() => currentScope,
  readTelemetry:async()=>{telemetryReads++;afterRead();return telemetry;},
  startRecording:async () => {starts++; return {id:'recording-'+starts};},
  stopRecording:async id => {stops++;return {id,state:'Stopped'};},
  readJob:async (_kind,id) => {reads++;return {id,state:'Recording'};},
  audit:async event => {audit.push(event);},
};
const router = createLocalAccessPilot(sessions,jobs,ports,{origin:'http://localhost:3000',allowLoopbackHttp:true});
assert.throws(() => createLocalAccessPilot(sessions,jobs,{} as never,{origin:'http://10.0.0.15:3000',allowLoopbackHttp:true}),/HTTPS/);
const previousMode = process.env.PRIZM_ACCESS_MODE, previousDirectory = process.env.PRIZM_ACCESS_DIRECTORY;
delete process.env.PRIZM_ACCESS_MODE;
assert.equal(accessPilotFromEnvironment(),null);
process.env.PRIZM_ACCESS_MODE = 'misspelled';assert.throws(accessPilotFromEnvironment,/Unknown/);
process.env.PRIZM_ACCESS_MODE = 'pilot';delete process.env.PRIZM_ACCESS_DIRECTORY;assert.throws(accessPilotFromEnvironment,/absolute/);
process.env.PRIZM_ACCESS_DIRECTORY = directory;
const unavailablePilot = accessPilotFromEnvironment()!; // Missing pilot.json must never fall through.
if (previousMode === undefined) delete process.env.PRIZM_ACCESS_MODE; else process.env.PRIZM_ACCESS_MODE = previousMode;
if (previousDirectory === undefined) delete process.env.PRIZM_ACCESS_DIRECTORY; else process.env.PRIZM_ACCESS_DIRECTORY = previousDirectory;
const uiDirectory = directory+'/public';
await mkdir(uiDirectory+'/assets',{recursive:true});
await writeFile(uiDirectory+'/signin.html','<!doctype html><title>PRIZM sign-in fixture</title>');
await writeFile(uiDirectory+'/assets/signin-fixture.js','/* fixture public code only */');
await writeFile(uiDirectory+'/index.html','legacy workspace must not be served');
const app = express(); app.use('/broken',unavailablePilot);app.use('/api',router); app.use(pilotUi(uiDirectory));
app.use((_req,res) => {legacy++;res.end();});
const socketPath = directory+'/http.sock';
const server = createServer((req,res) => {
  // Unix-domain fixture: emulate the direct loopback transport without TCP or TLS.
  Object.defineProperty(req.socket,'remoteAddress',{value:'127.0.0.1',configurable:true}); app(req,res);
});
await new Promise<void>(resolve => server.listen(socketPath,resolve));
type Login = {cookie: string; csrf: string};
async function request(method: string,url: string,body?: unknown,login?: Login,extra: Record<string,string> = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  const headers: Record<string,string> = {Host:'localhost:3000',Origin:'http://localhost:3000',Connection:'close','Content-Type':'application/json','Content-Length':String(Buffer.byteLength(payload)),
    ...(login ? {Cookie:login.cookie,'X-Prizm-Csrf':login.csrf} : {}),...extra};
  const bytes = await new Promise<Buffer>((resolve,reject) => {
    const chunks: Buffer[] = [], socket = new Socket();
    socket.setTimeout(10000,() => socket.destroy(new Error('Fixture timeout')));
    socket.on('error',reject);socket.on('data',chunk => chunks.push(chunk));socket.on('end',() => resolve(Buffer.concat(chunks)));
    socket.connect(socketPath,() => socket.write(`${method} ${url} HTTP/1.1\r\n${Object.entries(headers).map(([key,value]) => `${key}: ${value}`).join('\r\n')}\r\n\r\n${payload}`));
  });
  const text = bytes.toString(), index = text.indexOf('\r\n\r\n'), head = text.slice(0,index), data = text.slice(index+4);
  return {status:Number(head.split(' ')[1]),head,data:data ? (/content-type: application\/json/i.test(head) ? JSON.parse(data) : data) : null};
}
async function login(username: string): Promise<Login> {
  const response = await request('POST','/api/access/login',{email:username+'@example.test',password}); assert.equal(response.status,200);
  assert.match(response.head,/HttpOnly/);assert.match(response.head,/SameSite=Strict/);
  const cookie = response.head.match(/set-cookie: ([^;]+)/i)?.[1]; assert(cookie);
  assert(!JSON.stringify(response.data).includes(cookie.split('=')[1]));
  return {cookie,csrf:response.data.csrf};
}
try {
  const page = await request('GET','/');
  assert.equal(page.status,200);assert.match(page.data,/PRIZM sign-in fixture/);
  assert.match(page.head,/frame-ancestors 'none'/);
  assert.equal((await request('GET','/signin')).status,200);
  assert.equal((await request('GET','/assets/signin-fixture.js')).status,200);
  for (const path of ['/index.html','/accounts.json','/assets/server.cjs','/assets/signin-fixture.js.map','/assets/../accounts.json','/src/main.tsx','/tools/report','/turtle/tools/urls']) {
    assert.equal((await request('GET',path)).status,403,path);
  }
  assert.equal((await request('HEAD','/')).status,403);
  assert.equal((await request('POST','/signin',{})).status,403);
  assert.equal((await request('GET','/broken/any-legacy-route')).status,503);
  assert.equal((await request('GET','/api/access/session',undefined,undefined,{'X-Role':'admin','X-User':'alice'})).status,401);
  const alice = await login('alice'), bob = await login('bob'), viewer = await login('viewer');
  assert.equal((await request('GET','/api/access/config')).data.mode,'restricted-pilot');
  assert.equal((await request('GET','/api/access/session',undefined,alice)).data.email,'alice@example.test');
  const controlBody={commandId:'fixture-control-0001',action:'open',array:1,string:1,confirmed:true,reason:'Offline HTTP fixture',topologyRevision:'fixture'};
  assert.equal((await request('POST','/api/access/controls/contactors',controlBody,alice)).status,403,'Control adapter is disabled by default');
  let controlWrites=0;
  const receiptFile=directory+'/contactor-receipts.json';await writeFile(receiptFile,JSON.stringify({version:1,entries:[]}),{mode:0o600});
  ports.contactors=new ContactorAccess({receipts:new ContactorReceipts(receiptFile),context:async()=>({...scope,topologyRevision:'fixture',validUntil:now+60000,targets:[{id:'array:1:string:1',kind:'string'}]}),
    audit:async()=>{},execute:async(body,guard)=>{await guard.beforeDispatch(body.targets[0]);controlWrites++;
      return {success:false,acceptedCount:0,verifiedCount:0,mismatchCount:1,unknownCount:0,results:[{target:body.targets[0],action:body.action,phoenixUrl:'fixture-only',accepted:false,responseStatus:403,responseText:'fixture',readbackConfirmed:false,readbackStatus:'fixture',error:null}]};}},()=>now);
  assert.equal((await request('POST','/api/access/controls/contactors',controlBody)).status,401);
  assert.equal((await request('POST','/api/access/controls/contactors',controlBody,alice)).status,403,'Telemetry permission cannot control equipment');
  accounts[0].grants.push({capability:'controls.contactors',...scope,scope:{kind:'targets',ids:['array:1:string:1']}});
  const controller=await login('alice');
  assert.equal((await request('GET','/api/access/session',undefined,controller)).data.controls.singleStringContactors,true);
  assert.equal((await request('GET','/api/access/session',undefined,bob)).data.controls.singleStringContactors,false);
  assert.equal((await request('GET','/api/access/controls/contactors/1/1')).status,401);
  assert.equal((await request('GET','/api/access/controls/contactors/1/1',undefined,bob)).status,403);
  assert.equal((await request('GET','/api/access/controls/contactors/1/1',undefined,controller)).data.topologyRevision,'fixture');
  assert.equal((await request('GET','/api/access/controls/contactors/1/2',undefined,controller)).status,403);
  assert.equal((await request('GET','/api/access/controls/contactors/01/1',undefined,controller)).status,400);
  assert.equal((await request('POST','/api/access/controls/contactors',{...controlBody,topologyRevision:'changed'},controller)).status,409);
  assert.equal((await request('POST','/api/access/controls/contactors',controlBody,{...controller,csrf:'forged'})).status,403);
  assert.equal((await request('POST','/api/access/controls/contactors',{...controlBody,role:'admin'},controller)).status,400);
  assert.equal((await request('POST','/api/access/controls/contactors?source=other',controlBody,controller)).status,400);
  assert.equal((await request('GET','/api/access/controls/contactors',undefined,controller)).status,403);
  assert.equal(controlWrites,0);
  assert.equal((await request('POST','/api/access/controls/contactors',controlBody,controller)).status,200);
  assert.equal((await request('POST','/api/access/controls/contactors',controlBody,controller)).status,200);assert.equal(controlWrites,1);
  const savedPath='/api/access/controls/receipts/'+controlBody.commandId;
  assert.equal((await request('GET',savedPath)).status,401);
  assert.equal((await request('GET',savedPath,undefined,bob)).status,404);
  const saved=await request('GET',savedPath,undefined,controller);
  assert.equal(saved.status,200);assert.equal(saved.data.state,'unverified');assert.equal(saved.data.historical,true);
  assert(!JSON.stringify(saved.data).includes('sessionId'));assert(!JSON.stringify(saved.data).includes('responseText'));
  assert.equal((await request('POST',savedPath,{},controller)).status,403);
  assert.equal((await request('GET','/api/access/controls/contactors/1/1',undefined,controller)).status,409,'Unverified command blocks review after page reload');
  assert.equal((await request('GET','/api/access/recovery',undefined,controller)).status,403,'Recovery disabled unless explicitly wired');
  ports.recovery=new CommandRecovery({receipts:new ContactorReceipts(receiptFile),scope:()=>currentScope,
    context:async()=>({...scope,topologyRevision:'fixture',validUntil:Date.now()+60000,targets:[{id:'array:1:string:1',kind:'string'}]}),
    observe:async()=>({actual:'open',requested:'open',capturedAt:Date.now()}),audit:async()=>{}});
  assert.equal((await request('GET','/api/access/recovery')).status,401);
  assert.equal((await request('GET','/api/access/recovery',undefined,bob)).data.length,0);
  assert.equal((await request('GET','/api/access/recovery?owner=alice',undefined,controller)).status,400);
  assert.equal((await request('GET','/api/access/recovery',undefined,controller)).data.length,1);
  const recoveryPath='/api/access/recovery/'+controlBody.commandId;
  assert.equal((await request('GET',recoveryPath,undefined,bob)).status,404);
  const recovery=await request('GET',recoveryPath,undefined,controller);assert.equal(recovery.status,200);
  const recoveryBody={commandId:controlBody.commandId,expectedUpdatedAt:recovery.data.command.updatedAt,observation:recovery.data.observation,reason:'site-checked',confirmed:true};
  assert.equal((await request('POST','/api/access/recovery',recoveryBody,{...controller,csrf:'forged'})).status,403);
  assert.equal((await request('POST','/api/access/recovery',{...recoveryBody,release:true},controller)).status,400);
  assert.equal((await request('POST','/api/access/recovery',recoveryBody,controller)).data.targetReleased,false);
  assert.equal((await request('POST','/api/access/recovery',recoveryBody,controller)).status,409);
  const recorded=(await request('GET','/api/access/recovery',undefined,controller)).data[0];
  assert.equal(recorded.reviews.length,1);assert.equal(recorded.state,'unverified');assert.equal(controlWrites,1,'Recovery never dispatches');
  assert.equal((await request('GET','/api/access/controls/contactors/1/1',undefined,controller)).status,409,'Review record never releases target');
  ports.recovery=undefined;
  ports.contactors=undefined;
  accounts[0].grants.pop(); // Restore fixture grant fingerprint; original session was not read while changed.
  assert.equal((await request('GET','/api/access/telemetry')).status,401);
  assert.equal((await request('GET','/api/access/telemetry',undefined,viewer)).status,403);
  assert.equal((await request('GET','/api/access/telemetry?refresh=true',undefined,alice)).status,400);
  assert.equal(telemetryReads,0,'Denied requests must not reach the telemetry port');
  assert.equal((await request('GET','/api/access/telemetry',undefined,alice)).status,200);
  assert.equal((await request('POST','/api/access/telemetry',{},alice)).status,403);
  currentScope={siteId:'other',blockId:'1'};
  assert.equal((await request('GET','/api/access/telemetry',undefined,alice)).status,403);
  assert.equal(telemetryReads,1);currentScope={...scope};
  afterRead=()=>{currentScope={siteId:'other',blockId:'1'};};
  assert.equal((await request('GET','/api/access/telemetry',undefined,alice)).status,409,'Site changed during read');
  currentScope={...scope};afterRead=()=>{};
  const body = {targets:['fixture/hvac/1'],hours:1};
  assert.equal((await request('POST','/api/access/recordings',body,{...alice,csrf:'forged'})).status,403);
  assert.equal((await request('POST','/api/access/recordings',body,viewer)).status,403);
  assert.equal((await request('POST','/api/access/recordings',{...body,owner:'bob'},alice)).status,400);
  assert.equal((await request('POST','/api/access/recordings',body,alice,{Origin:'https://attacker.invalid'})).status,403);
  assert.equal(starts,0);
  const created = await request('POST','/api/access/recordings',body,alice);assert.equal(created.status,200); assert.equal(starts,1);
  assert.equal((await request('GET','/api/access/jobs/thermal-recording/recording-1',undefined,bob)).status,404);
  assert.equal((await request('POST','/api/access/recordings/recording-1/stop',{},bob)).status,404);assert.equal(stops,0);assert.equal(reads,0);
  assert.equal((await request('GET','/api/access/jobs/thermal-recording/recording-1',undefined,alice)).status,200);
  assert.equal((await request('GET','/api/access/jobs/balancing/legacy-unowned',undefined,alice)).status,404);
  const principal = (await sessions.authenticate(alice.cookie.split('=')[1])).principal;
  await new OwnedJobs(ownerFile).check(principal,scope,'thermal-recording','recording-1');
  currentScope = {siteId:'other',blockId:'1'};
  assert.equal((await request('GET','/api/access/jobs/thermal-recording/recording-1',undefined,alice)).status,403);
  currentScope = {...scope};
  for (const route of ['/api/local/balancing/execute','/api/local/thermal/morning-review','/api/local/thermal','/api/local/thermal/recordings','/tools/controls/ems/array/1/contactors/close','/turtle/tools/controls/ems/command']) {
    assert.equal((await request('POST',route,{confirmed:true,role:'admin'},alice)).status,403);
  }
  for (const method of ['HEAD','OPTIONS','PUT']) assert.equal((await request(method,'/api/access/session',undefined,alice)).status,403);
  assert.equal((await request('GET','/api/access/session',undefined,alice,{Cookie:alice.cookie+'; '+alice.cookie})).status,401);
  assert.equal((await request('GET','/api/access/session',undefined,alice,{Host:'attacker.invalid'})).status,403);
  assert.equal(legacy,0);
  accounts[0].disabled = true;
  assert.equal((await request('POST','/api/access/recordings/recording-1/stop',{},alice)).status,401);
  accounts[0].disabled = false;
  assert.equal((await request('GET','/api/access/session',undefined,alice)).status,401,'Disabled sessions stay revoked after re-enable');
  assert.equal((await request('POST','/api/access/logout',{},bob)).status,200);
  assert.equal((await request('GET','/api/access/session',undefined,bob)).status,401);
  now += 15*60000;
  assert.equal((await request('GET','/api/access/session',undefined,viewer)).status,401);
  const mixedCase = await request('POST','/api/access/login',{email:'  ALICE@EXAMPLE.TEST  ',password});
  assert.equal(mixedCase.status,200,'Email matching uses the same normalization as provisioning');
  assert.equal((await request('POST','/api/access/login',{username:'alice',password})).status,401,'Old username field is not a login');
  const changedGrant = await login('bob');
  accounts[1].version++;
  assert.equal((await request('GET','/api/access/session',undefined,changedGrant)).status,401,'Account revisions revoke existing sessions');
  const passive = await login('bob');
  for (let minute=0;minute<15;minute++) {
    now+=60000;
    assert.equal((await request('GET','/api/access/telemetry',undefined,passive)).status,minute===14 ? 401 : 200,'Telemetry refresh must not extend idle expiry');
  }
  const revokeDuringRead = await login('bob');
  afterRead=()=>{accounts[1].disabled=true;};
  assert.equal((await request('GET','/api/access/telemetry',undefined,revokeDuringRead)).status,401,'Revoke during read prevents disclosure');
  accounts[1].disabled=false;afterRead=()=>{};
  const absoluteExpiry = await login('bob');
  // Keep the session active through its idle windows; the absolute limit still wins.
  for (let index=0;index<48;index++) {
    now += 10*60000;
    const response = await request('GET','/api/access/session',undefined,absoluteExpiry);
    assert.equal(response.status,index===47 ? 401 : 200);
  }
  for (let index=0;index<8;index++) assert.equal((await request('POST','/api/access/login',{email:7,password:7})).status,401);
  assert.equal((await request('POST','/api/access/login',{email:7,password:7})).status,429);
  assert.equal(stops,0);
  const auditText = JSON.stringify(audit); assert(!auditText.includes(password));assert(!auditText.includes(alice.csrf));assert(!auditText.includes(alice.cookie));
  assert(!(await readFile(ownerFile,'utf8')).includes(alice.cookie.split('=')[1]));
  // No valid session survives a process/session-manager restart.
  await assert.rejects(new LocalSessions(async()=>accounts).authenticate(alice.cookie.split('=')[1]),/Sign-in/);
  console.log('Local access pilot: real HTTP over Unix socket, login, CSRF, revocation, idle expiry, ownership, site scope and deny-default passed; no equipment connections');
} finally {await new Promise<void>(resolve => server.close(() => resolve()));process.chdir(originalCwd);}
