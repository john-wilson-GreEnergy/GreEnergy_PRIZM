// Unix-socket fixtures only. No equipment adapters, live accounts or controllers.
import assert from 'node:assert/strict';
import {createServer,request as httpRequest} from 'node:http';
import {mkdtemp,mkdir,writeFile,symlink,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createWorkspaceUi} from './workspaceUi';
import {createWorkspaceGateway} from './workspaceGateway';
import {createRemoteMobileApp} from './remoteMobile';
import {FleetBroker} from './FleetBroker';
import {LocalSessions} from '../security/localSessions';
import {hashLocalPassword,type LocalAccount} from '../security/localAccounts';

const dir=await mkdtemp(path.join(tmpdir(),'prizm-unified-ui-'));
await mkdir(path.join(dir,'assets'));
for(const [file,text] of Object.entries({'index.html':'<html><head><script src="/assets/workspace.js"></script></head></html>',
  'fleet.html':'<html>Fleet</html>','mobile.html':'<html>Mobile</html>','assets/workspace.js':'const view=()=>import("./StringDashboard-test.js");',
  'assets/StringDashboard-test.js':'import "./rows-test.js";const history=()=>import("./History-test.js");','assets/rows-test.js':'// fixture rows','assets/History-test.js':'// lazy history',
  'assets/workspace.css':'body{}','server.cjs':'private server','assets/private.map':'private source','accounts.json':'private account'}))await writeFile(path.join(dir,file),text);
const ui=createWorkspaceUi(dir);
assert.match(ui.releaseId,/^[a-f0-9]{64}$/);
assert.equal(createWorkspaceUi(dir).releaseId,ui.releaseId);
await writeFile(path.join(dir,'assets/workspace.js'),'// different UI');
assert.notEqual(createWorkspaceUi(dir).releaseId,ui.releaseId,'Changed JS changes release fingerprint');
await writeFile(path.join(dir,'assets/workspace.js'),'const view=()=>import("./StringDashboard-test.js");');
await symlink(path.join(dir,'accounts.json'),path.join(dir,'assets/leak.js'));
assert.throws(()=>createWorkspaceUi(dir),/unsafe asset/);await unlink(path.join(dir,'assets/leak.js'));

const sites=['one','two'].map((siteId,index)=>({siteId,name:siteId,stationCode:'LAB'+index,blockIndex:1,blockId:'1',url:'https://127.0.0.1:9443/api/fleet/site-summary',token:'s'.repeat(43)}));
const password='Offline fixture password';
const account:LocalAccount={id:'operator',email:'operator@example.invalid',disabled:false,version:1,remoteAccess:true,password:await hashLocalPassword(password),
  grants:sites.flatMap(s=>(['telemetry.view','workspace.full'] as const).map(capability=>({capability,siteId:s.siteId,blockId:'1',scope:{kind:'block' as const}})))};
const sessions=new LocalSessions(async()=>structuredClone([account]));
const auth=await sessions.login(account.email,password,'fixture');
const calls:string[]=[];
const forwards=sites.map(s=>async(req:import('express').Request,res:import('express').Response,recheck:()=>Promise<void>)=>{
  await recheck();calls.push(s.siteId+':'+req.method+':'+req.url);res.json({siteId:s.siteId,value:16,source:'canonical-fixture'});
});
const servers:ReturnType<typeof createServer>[]=[];
async function start(app:ReturnType<typeof createWorkspaceGateway>,name:string,lan=false){
  const socket=path.join(dir,name+'.sock');
  const server=createServer((req,res)=>{if(lan)Object.defineProperty(req.socket,'remoteAddress',{value:'127.0.0.1',configurable:true});app(req,res);});
  servers.push(server);await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(socket,resolve);});return socket;
}
async function send(socket:string,host:string,url:string,cookie='',method='GET',body?:unknown,extra:Record<string,string>={}){
  const payload=body===undefined?'':JSON.stringify(body);
  return new Promise<{status:number;body:string;headers:import('node:http').IncomingHttpHeaders}>((resolve,reject)=>{
    const req=httpRequest({socketPath:socket,path:url,method,headers:{Host:host,Origin:(host==='prizm.example.test'?'https://':'http://')+host,Cookie:cookie,'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload),'X-Prizm-Csrf':auth.csrf,...extra}},res=>{
      let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode!,body,headers:res.headers}));res.on('error',reject);
    });req.setTimeout(5000,()=>req.destroy(Error('Fixture timeout')));req.on('error',reject);req.end(payload);
  });
}
try{
  const lan=await Promise.all(sites.map((s,i)=>start(createWorkspaceGateway(sessions,s,{siteId:s.siteId,origin:'http://localhost:3444',token:'w'.repeat(43)},'http://localhost:3443',async()=>{},forwards[i],true,[],ui),'lan'+i,true)));
  const remote=await start(await createRemoteMobileApp(new FleetBroker(sites),{publicDirectory:dir,workspaceUi:ui,accounts:async()=>structuredClone([account]),hvac:()=>({units:[],error:null,capturedAt:Date.now()}),audit:async()=>{},desktop:sites.map((collector,i)=>({collector,forward:forwards[i]}))},
    {origin:'https://prizm.example.test',socketPath:'/run/prizm-remote/mobile.sock',authentication:'password',issuer:'https://unused.cloudflareaccess.com',audience:'a'.repeat(64),keysFile:'/nonexistent',keysOwnerUid:0}),'remote');
  const login=await send(remote,'prizm.example.test','/fleet/api/fleet/login','','POST',{email:account.email,password});assert.equal(login.status,200);
  const remoteCookie=login.headers['set-cookie']!.find(c=>c.includes('Path=/;'))!.split(';')[0],localCookie='prizm_fleet_session='+auth.token;
  for(const route of ['/fleet/','/mobile/'])assert.equal((await send(remote,'prizm.example.test',route,remoteCookie)).headers['x-prizm-ui-release'],ui.releaseId);
  for(const [i,site] of sites.entries()){
    const local=(url:string,cookie=localCookie)=>send(lan[i],'localhost:3444',url,cookie);
    const distant=(url:string)=>send(remote,'prizm.example.test','/desktop/'+site.siteId+url,remoteCookie);
    const a=await local('/?tab=arrays-strings'),b=await distant('/?tab=arrays-strings');
    assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(a.body,b.body);
    assert.equal(a.headers['cache-control'],'no-store');assert.equal(b.headers['cache-control'],'no-store');
    assert.equal(a.headers['x-prizm-startup-preload'],undefined);assert.equal(b.headers['x-prizm-startup-preload'],undefined);
    assert(!a.body.includes('modulepreload'),'Production HTML is served unchanged; development preload is not deployed');
    assert(!a.body.includes('History-test.js'));
    assert(!(await local('/?tab=overview')).body.includes('modulepreload'));
    assert(!(await distant('/?tab=overview')).body.includes('modulepreload'));
    assert.equal(a.headers['x-prizm-ui-release'],ui.releaseId);assert.equal(b.headers['x-prizm-ui-release'],ui.releaseId);
    for(const file of ['/assets/workspace.js','/assets/workspace.css']){
      const x=await local(file),y=await send(remote,'prizm.example.test',file,remoteCookie);
      assert.equal(x.status,200);assert.equal(y.status,200);assert.equal(x.body,y.body);assert.equal(x.headers['x-prizm-ui-release'],y.headers['x-prizm-ui-release']);
      assert.equal(x.headers['cache-control'],'private, no-cache');assert.equal(y.headers['cache-control'],'private, no-cache');
      assert.equal(x.headers.etag,y.headers.etag);assert.match(x.headers.etag!,/^"[a-f0-9]{64}"$/);
      for(const [socket,host,cookie] of [[lan[i],'localhost:3444',localCookie],[remote,'prizm.example.test',remoteCookie]]){
        const conditional=await send(socket,host,file,cookie,'GET',undefined,{'If-None-Match':x.headers.etag!});
        assert.equal(conditional.status,304);assert.equal(conditional.body,'');
        assert.equal(conditional.headers['cache-control'],'private, no-cache');
        const changed=await send(socket,host,file,cookie,'GET',undefined,{'If-None-Match':'"old-release"'});
        assert.equal(changed.status,200);assert.equal(changed.body,x.body);
      }
      assert.equal((await send(lan[i],'localhost:3444',file,'','GET',undefined,{'If-None-Match':x.headers.etag!})).status,401,'Conditional requests never bypass LAN authorization');
    }
    assert.equal(calls.length,i*2,'HTML and assets never request the collector');
    const contextA=JSON.parse((await local('/api/fleet/workspace-context')).body),contextB=JSON.parse((await distant('/api/fleet/workspace-context')).body);
    assert.equal((await local('/api/fleet/workspace-context')).headers['cache-control'],'no-store');
    assert.equal((await distant('/api/fleet/workspace-context')).headers['cache-control'],'no-store');
    assert.equal(contextA.uiRelease,contextB.uiRelease);assert.equal(contextA.fullControl,true);assert.equal(contextB.fullControl,false);assert.equal(contextB.remoteReadOnly,true);
    assert.equal((await local('/api/local/site-data/pcs')).body,(await distant('/api/local/site-data/pcs')).body,'Same site canonical data through both entrances');
    assert.equal((await local('/', '')).status,303);assert.equal((await local('/assets/workspace.js','')).status,401);
    for(const file of ['/assets/private.map','/server.cjs','/accounts.json'])assert.equal((await local(file)).status,403);
    const before=calls.length;
    assert.equal((await local('/assets/missing.js')).status,404,'Missing UI does not fall back to collector');
    assert.equal((await send(remote,'prizm.example.test','/desktop/'+site.siteId+'/api/local/mock-control',remoteCookie,'POST',{})).status,403);
    assert.equal((await distant('/tools/controls/rotate')).status,403);assert.equal(calls.length,before,'No denied remote dispatch or asset fallback');
  }
  const legacy=await start(createWorkspaceGateway(sessions,sites[0],{siteId:'one',origin:'http://localhost:3444',token:'w'.repeat(43)},'http://localhost:3443',async()=>{},forwards[0],true),'rollback',true);
  assert.match((await send(legacy,'localhost:3444','/',localCookie)).body,/canonical-fixture/,'Rollback retains old forwarding path');
  const priorFlag=process.env.PRIZM_UI_ASSET_REVALIDATION;
  process.env.PRIZM_UI_ASSET_REVALIDATION='false';
  const legacyUi=createWorkspaceUi(dir);
  if(priorFlag===undefined)delete process.env.PRIZM_UI_ASSET_REVALIDATION;else process.env.PRIZM_UI_ASSET_REVALIDATION=priorFlag;
  const rollbackUi=await start(createWorkspaceGateway(sessions,sites[0],{siteId:'one',origin:'http://localhost:3444',token:'w'.repeat(43)},'http://localhost:3443',async()=>{},forwards[0],true,[],legacyUi),'cache-rollback',true);
  assert.equal((await send(rollbackUi,'localhost:3444','/assets/workspace.js',localCookie)).headers['cache-control'],'no-store','Explicit static cache rollback');
  account.grants=account.grants.filter(g=>g.siteId==='one');account.version++;
  assert.equal((await send(lan[1],'localhost:3444','/',localCookie)).status,303,'Revocation also blocks cached UI delivery');
  assert.equal((await send(lan[1],'localhost:3444','/assets/workspace.js',localCookie,'GET',undefined,{'If-None-Match':'*'})).status,401,'Revocation precedes conditional asset delivery');
  assert.equal((await send(remote,'prizm.example.test','/desktop/two/api/local/site-data/pcs',remoteCookie)).status,401);
  console.log('PASS unified UI: two sites, identical LAN/remote HTML/assets/fingerprint and canonical reads, no asset collector calls, protected files, revocation, remote controls denied, legacy rollback');
}finally{for(const server of servers){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}}
