import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {Socket} from 'node:net';
import express from 'express';
import {LocalSessions} from '../security/localSessions';
import {hashLocalPassword,type LocalAccount} from '../security/localAccounts';
import {createWorkspaceGateway} from './workspaceGateway';
import {collectorWorkspace} from './workspaceCollector';
import {parseWorkspaceEnrollments,workspacePath,workspaceRouteAllowed,passiveWorkspaceGet} from './workspaceAccess';
import {parseWorkspaceContext,isFleetWorkspacePort} from '../../lib/fleetWorkspace';

const site=(n:number)=>({siteId:'site-'+n,name:'Fixture '+n,stationCode:'LAB'+n,blockId:'1',blockIndex:1,url:`https://127.0.0.1:${9400+n}/api/fleet/site-summary`,token:String(n).repeat(43)});
const sites=[site(1),site(2)],fleetOrigin='http://localhost:3443';
const workspaces=sites.map((s,i)=>({siteId:s.siteId,origin:`http://localhost:${3444+i}`,token:String(i+3).repeat(43)}));
assert.deepEqual(parseWorkspaceEnrollments(undefined,sites,'https://localhost:3443'),[]);
const configured=workspaces.map(w=>({...w,origin:w.origin.replace('http:','https:')}));
assert.equal(parseWorkspaceEnrollments(configured,sites,'https://localhost:3443').length,2);
for(const bad of [[{...configured[0],token:sites[0].token}],[{...configured[0],origin:'https://evil.test:3444'}],[{...configured[0],origin:'https://localhost:3000'}],[configured[0],configured[0]],[{...configured[0],siteId:'unknown'}]])assert.throws(()=>parseWorkspaceEnrollments(bad,sites,'https://localhost:3443'));
for(const p of ['//evil/x','/api/../settings','/api/%2e%2e/x','/api\\x','/api//x','/api/%61'])assert.throws(()=>workspacePath(p));
for(const p of ['/server.cjs','/assets/server.cjs','/fleet.html','/accounts.json'])assert.equal(workspaceRouteAllowed('GET',p),false);
assert.equal(workspaceRouteAllowed('POST','/api/settings/profiles/ss4/activate'),false);
for(const p of ['/api/settings/Profiles/ss4/activate','/api/settings/test-CONNECTION','/api/local/DEMO-toggle','/api/Fleet/login','/api/Access/login'])assert.equal(workspaceRouteAllowed('POST',p),false);
assert.equal(passiveWorkspaceGet('/tools/controls/ems/array/1/contactors/open'),false);
assert.equal(passiveWorkspaceGet('/api/local/site-data/strings-stream'),true);
assert.equal(isFleetWorkspacePort('3000'),false);
assert.equal(isFleetWorkspacePort('3445'),true);
assert.throws(()=>parseWorkspaceContext({fleetUrl:'https://evil.test'},'https://localhost:3444'));

const account:LocalAccount={id:'fixture',email:'fixture@example.invalid',version:1,disabled:false,password:await hashLocalPassword('Fixture password offline only'),
  grants:sites.flatMap(s=>[{capability:'telemetry.view' as const,siteId:s.siteId,blockId:'1',scope:{kind:'block' as const}}])};
let auditFails=false;const events:unknown[]=[],calls:number[]=[];
let now=Date.now();
const rollbackPolicy=process.argv.includes('--rollback-policy');
const sessions=new LocalSessions(async()=>structuredClone([account]),()=>now,true,!rollbackPolicy);
const login=()=>sessions.login(account.email,'Fixture password offline only','fixture');
let auth=await login();
const directory=await mkdtemp(path.join(tmpdir(),'prizm-workspace-test-'));
const app=express();
for(const [index,s] of sites.entries())app.use('/w'+index,createWorkspaceGateway(sessions,s,workspaces[index],fleetOrigin,async e=>{if(auditFails)throw Error('Audit unavailable');events.push(e);},async(req,res,recheck)=>{
  await recheck();calls.push(index);res.json({site:s.siteId,method:req.method,path:req.url});
},true));
let identityMatches=true,backendCalls=0;
app.use('/backend',collectorWorkspace(workspaces[0].token,()=>identityMatches,(_req,res)=>{backendCalls++;res.json({site:'site-1'});}));
const socketPath=path.join(directory,'fixture.sock');
const server=createServer((req,res)=>{Object.defineProperty(req.socket,'remoteAddress',{value:'127.0.0.1',configurable:true});app(req,res);});
await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(socketPath,resolve);});
async function request(index:number,method:string,url:string,headers:Record<string,string>={},body?:unknown){
  const port=3444+index;
  const payload=body===undefined?'':JSON.stringify(body);
  const h={Host:'localhost:'+port,Origin:'http://localhost:'+port,Connection:'close','Content-Type':'application/json','Content-Length':String(Buffer.byteLength(payload)),Cookie:'prizm_fleet_session='+auth.token,...headers};
  return new Promise<{status:number;body:string}>( (resolve,reject)=>{
    const socket=new Socket();let text='';socket.setTimeout(5000,()=>socket.destroy(Error('fixture timeout')));socket.on('error',reject);socket.on('data',d=>text+=d);socket.on('end',()=>resolve({status:Number(text.split(' ')[1]),body:text.slice(text.indexOf('\r\n\r\n')+4)}));
    socket.connect(socketPath,()=>socket.write(`${method} ${url.startsWith('/backend')?url:'/w'+index+url} HTTP/1.1\r\n${Object.entries(h).map(([k,v])=>k+': '+v).join('\r\n')}\r\n\r\n${payload}`));
  });
}
try{
  assert.equal((await request(0,'GET','/',{Cookie:''})).status,303);
  assert.equal((await request(0,'POST','/api/local/strings/contactors',{'X-Prizm-Csrf':auth.csrf})).status,403,'Read-only user cannot dispatch');
  assert.equal(calls.length,0);
  account.grants.push({capability:'workspace.full',siteId:'site-1',blockId:'1',scope:{kind:'block'}});
  assert.equal((await request(0,'GET','/')).status,303,'Permission change revokes old session');
  auth=await login();
  assert.equal((await request(0,'GET','/')).status,200);
  assert.equal((await request(1,'GET','/')).status,403,'Other site not authorized');
  const context=await request(0,'GET','/api/fleet/workspace-context');assert.equal(context.status,200);
  assert.equal(parseWorkspaceContext(JSON.parse(context.body),'http://localhost:3444').siteId,'site-1');
  assert.equal((await request(0,'POST','/api/local/balancing')).status,403);
  assert.equal((await request(0,'POST','/api/local/balancing',{'X-Prizm-Csrf':auth.csrf,Origin:workspaces[1].origin})).status,403);
  assert.equal((await request(0,'GET','/tools/controls/ems/array/1/contactors/open')).status,403,'GET command requires request token');
  const baseline=calls.length;
  assert.equal((await request(0,'PUT','/api/local/corrective-guidance',{'X-Prizm-Csrf':auth.csrf,'X-Prizm-Guidance-Actor':'spoof'})).status,403,'Non-admin cannot edit guidance, even with a spoofed actor');
  assert.equal((await request(0,'POST','/api/local/troubleshooting/overrides/example',{'X-Prizm-Csrf':auth.csrf})).status,403,'Legacy guidance edits also require a local administrator');
  assert.equal(calls.length,baseline,'Rejected guidance edit never dispatches');
  assert.equal((await request(0,'POST','/api/local/balancing',{'X-Prizm-Csrf':auth.csrf})).status,200);
  assert.equal(calls.length,baseline+1,'One mock dispatch, no retries');assert.equal(calls.at(-1),0);
  auditFails=true;
  assert.equal((await request(0,'POST','/api/local/balancing',{'X-Prizm-Csrf':auth.csrf})).status,503);
  assert.equal(calls.length,baseline+1,'Audit failure prevents dispatch');auditFails=false;
  for(const url of ['/api/settings/profiles/x/activate','/api/fleet/login'])assert.equal((await request(0,'POST',url,{'X-Prizm-Csrf':auth.csrf})).status,403);
  assert.equal((await request(0,'GET','/assets/server.cjs',{'X-Prizm-Csrf':auth.csrf})).status,403);
  assert.equal((await request(0,'GET','/backend/api/local/site-data/pcs',{Authorization:'Bearer '+sites[0].token})).status,401,'Summary token cannot open workspace');
  assert.equal(backendCalls,0);
  const service={Authorization:'Bearer '+workspaces[0].token};
  assert.equal((await request(0,'GET','/backend/api/local/site-data/pcs',service)).status,200);
  identityMatches=false;
  assert.equal((await request(0,'POST','/backend/api/local/balancing',service)).status,409);
  assert.equal(backendCalls,1,'Identity conflict prevents command');
  if(rollbackPolicy){
  for(let i=0;i<16;i++){now+=60000;assert.equal((await request(0,'POST','/api/fleet/workspace-monitor',{'X-Prizm-Csrf':auth.csrf})).status,200);}
  assert.equal((await request(0,'GET','/api/local/site-data/pcs',{'X-Prizm-Csrf':auth.csrf})).status,200,'Monitoring survives idle control lock');
  const beforeLocked=calls.length;
  for(const [method,url] of [['POST','/api/local/balancing'],['GET','/tools/controls/ems/array/1/contactors/open']])assert.equal((await request(0,method,url,{'X-Prizm-Csrf':auth.csrf})).status,423);
  assert.equal(calls.length,beforeLocked,'Locked commands never reach the collector');
  assert.equal((await request(0,'POST','/api/fleet/workspace-touch',{'X-Prizm-Csrf':auth.csrf})).status,200);
  assert.equal((await request(0,'POST','/api/local/balancing',{'X-Prizm-Csrf':auth.csrf})).status,423,'Touch cannot unlock');
  assert.equal((await request(0,'POST','/api/fleet/workspace-reauthenticate',{}, {password:'Fixture password offline only'})).status,403);
  assert.equal((await request(0,'POST','/api/fleet/workspace-reauthenticate',{'X-Prizm-Csrf':auth.csrf},{password:'wrong'})).status,403);
  assert.equal((await request(0,'POST','/api/fleet/workspace-reauthenticate',{'X-Prizm-Csrf':auth.csrf},{password:'Fixture password offline only'})).status,200);
  assert.equal(calls.length,beforeLocked,'Password confirmation never replays commands');
  assert.equal((await request(0,'POST','/api/local/balancing',{'X-Prizm-Csrf':auth.csrf})).status,200);
  }else{
    const expiry=(await sessions.status(auth.token)).expiresAt;
    now=expiry-3600000; // No activity/heartbeat for 23 hours.
    assert.equal((await request(0,'GET','/')).status,200,'Navigation requires no new password during a shift');
    assert.equal((await request(0,'GET','/api/local/site-data/pcs',{'X-Prizm-Csrf':auth.csrf})).status,200);
    const before=calls.length;
    assert.equal((await request(0,'POST','/api/local/balancing',{'X-Prizm-Csrf':auth.csrf})).status,200,'Mock control remains authorized');
    assert.equal(calls.length,before+1,'No automatic replay');
    assert.equal((await request(1,'GET','/')).status,403,'Long sessions do not expand site access');
    now=expiry;
    assert.equal((await request(0,'POST','/api/local/balancing',{'X-Prizm-Csrf':auth.csrf})).status,401);
    assert.equal(calls.length,before+1,'Expired command never reaches the collector');
  }
  account.disabled=true;
  assert.equal((await request(0,'GET','/api/local/site-data/pcs',{'X-Prizm-Csrf':auth.csrf})).status,401);
  assert(!JSON.stringify(events).includes(auth.csrf));assert(!JSON.stringify(events).includes(auth.token));
  console.log('PASS full workspace explicit grants, two-site separation, mock dispatch, origin/CSRF, revocation, identity, audit failure, token separation and disabled defaults');
}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
