/** Fixed, scoped Fleet-only release. Never modifies collector/network/account configuration. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
const prior='/opt/prizm-fleet/releases/soc-strings-20261021';
const release='/opt/prizm-fleet/releases/unified-workspace-20261021';
const stage='/home/ebc/prizm-unified-workspace-20261021';
const backup='/var/lib/prizm-fleet/unified-workspace-20261021';
const report='/home/ebc/prizm-unified-workspace-result.json';
const override='/etc/systemd/system/prizm-fleet.service.d/zzzzzzzzzzzzzzzzzzzzzzzz-unified-20261021.conf';
const configFile='/etc/prizm-fleet/fleet/fleet.json';
const manifestHash='7819667e354ed85e908d5ad664c9c318c9fa81f9b21080315126756a6b4b156c';
const overrideText=`[Service]\nExecStart=\nExecStart=/usr/bin/node ${release}/dist/fleet-server.cjs\nWorkingDirectory=${release}\nEnvironment=PRIZM_UNIFIED_WORKSPACE_UI=true\n`;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hash=file=>sha(fs.readFileSync(file));
const run=(cmd,args,extra={})=>execFileSync(cmd,args,{encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,...extra}).trim();
const prop=(unit,key)=>run('systemctl',['show',unit,'-p',key,'--value']);
function tree(dir){const result={};for(const name of fs.readdirSync(dir).sort()){
 const file=path.join(dir,name),s=fs.lstatSync(file);assert(!s.isSymbolicLink(),'Unexpected symlink');
 if(s.isDirectory())for(const [p,h]of Object.entries(tree(file)))result[name+'/'+p]=h;
 else{assert(s.isFile());result[name]=hash(file);}
}return result;}
function manifest(dir){const raw=fs.readFileSync(dir+'/unified-manifest.json');assert.equal(sha(raw),manifestHash);
 const m=JSON.parse(raw);assert.equal(m.schema,1);assert.deepEqual(m.changed,['fleet-server.cjs','workspace-ui.cjs']);
 for(const [p,h]of Object.entries(m.after)){assert(/^[a-zA-Z0-9_.\/-]+$/.test(p)&&!p.split('/').some(s=>s==='..'||!s));assert(/^[a-f0-9]{64}$/.test(h));}
 assert.deepEqual(Object.keys(m.after).filter(p=>m.before[p]!==m.after[p]).sort(),m.changed);
 assert(Object.keys(m.before).every(p=>p in m.after));return m;}
function save(state){fs.writeFileSync(backup+'/state.json',JSON.stringify(state,null,2),{mode:0o600});
 fs.writeFileSync(report,JSON.stringify({completedAt:state.completedAt??null,rolledBack:state.rolledBack??false,checks:state.checks??null,
  scope:'Shared LAN/remote UI delivery',collectorsRestarted:false,remoteReadOnly:true,networkChanged:false,
  authenticatedBrowserAcceptancePending:true},null,2),{mode:0o600});
 const owner=fs.statSync('/home/ebc');fs.chownSync(report,owner.uid,owner.gid);}
function invariants(){const c=JSON.parse(fs.readFileSync(configFile));return {
 hashes:Object.fromEntries([configFile,c.accountsFile,'/etc/prizm-fleet/fleet/remote.json','/etc/prizm-fleet/ss3/export.json','/etc/prizm-fleet/ss4/export.json'].map(f=>[f,hash(f)])),
 baseline:tree(prior+'/dist'),
 services:Object.fromEntries(['prizm','prizm-site@ss4','prizm-remote-tunnel'].map(s=>[s,{pid:prop(s,'MainPID'),exec:prop(s,'ExecStart'),active:prop(s,'ActiveState'),environmentHash:sha(prop(s,'Environment'))}]))};}
function socketRead(route){return new Promise((resolve,reject)=>{
 const req=http.get({socketPath:'/run/prizm-remote/mobile.sock',path:route,headers:{Host:'prizm.greenergyresources.org'}},res=>{
 let body='';res.on('data',b=>{body+=b;if(body.length>8*1024*1024)req.destroy(Error('Response limit'));});
 res.on('end',()=>resolve({status:res.statusCode,body,headers:res.headers}));res.on('error',reject);
 });req.setTimeout(10000,()=>req.destroy(Error('Remote socket timeout')));req.on('error',reject);
});}
async function probe(updated){
 const c=JSON.parse(fs.readFileSync(configFile)),sites=[];
 const ui=updated?(await import(pathToFileURL(release+'/dist/workspace-ui.cjs'))).createWorkspaceUi(release+'/dist'):null;
 const get=(url,headers={})=>new Promise((resolve,reject)=>{
  const u=new URL(url),local=u.hostname===new URL(c.origin).hostname;
  const req=https.get({hostname:local?(c.bindAddress&&c.bindAddress!=='0.0.0.0'?c.bindAddress:'127.0.0.1'):u.hostname,port:u.port,
   path:u.pathname+u.search,headers:{...headers,Host:u.host},checkServerIdentity:(_host,cert)=>tls.checkServerIdentity(u.hostname,cert)},res=>{
    let body='';res.on('data',b=>{body+=b;if(body.length>8*1024*1024)req.destroy(Error('Response limit'));});
    res.on('end',()=>resolve({status:res.statusCode,body,headers:res.headers}));res.on('error',reject);
   });req.setTimeout(10000,()=>req.destroy(Error('HTTPS readiness timeout')));req.on('error',reject);
 });
 const publicUi=await get(c.origin+'/');assert.equal(publicUi.status,200);
 assert.equal((await get(c.origin+'/api/fleet/summary')).status,401);
 if(ui)assert.equal(publicUi.headers['x-prizm-ui-release'],ui.releaseId);
 const mobile=await get(c.origin+'/mobile/');assert.equal(mobile.status,200);if(ui)assert.equal(mobile.headers['x-prizm-ui-release'],ui.releaseId);
 for(const collector of c.collectors){
  const workspace=c.workspaces.find(w=>w.siteId===collector.siteId);assert(workspace);
  assert.equal((await get(workspace.origin+'/')).status,303);
  assert.equal((await get(workspace.origin+'/api/fleet/workspace-context')).status,401);
  const r=await get(collector.url,{authorization:'Bearer '+collector.token});assert.equal(r.status,200);
  const d=JSON.parse(r.body);assert.equal(d.siteId,collector.siteId);assert.equal(d.stationCode,collector.stationCode);
  assert.equal(d.stale,false);assert(Date.now()-Date.parse(d.observedAt)<60000,'Collector snapshot stale');
  sites.push({siteId:d.siteId,station:d.stationCode,observedAt:d.observedAt});
 }
 return {sites,uiRelease:ui?.releaseId??null,localAuthenticationProtected:true};
}
async function remoteChecks(updated,releaseId){const entries={};
 for(const [route,status]of [['/',302],['/fleet',302],['/fleet/',200],['/mobile/',200],['/fleet/api/fleet/summary',401],['/mobile/api/fleet/summary',401]]){
  const r=await socketRead(route);assert.equal(r.status,status,route);
  if(updated&&status===200)assert.equal(r.headers['x-prizm-ui-release'],releaseId);
  entries[route]=r.status;
 }
 for(const site of ['solar-star-3','solar-star-4']){
  assert.equal((await socketRead('/desktop/'+site+'/')).status,303);
  assert.equal((await socketRead('/desktop/'+site+'/api/fleet/workspace-context')).status,401);
 }
 if(updated){const html=fs.readFileSync(release+'/dist/index.html','utf8');
  const assets=[...html.matchAll(/(?:src|href)="(\/assets\/[A-Za-z0-9_.-]+\.(?:js|css))"/g)].map(m=>m[1]);assert(assets.length>0);
  for(const asset of assets){const r=await socketRead(asset);assert.equal(r.status,200);assert.equal(sha(r.body),hash(release+'/dist'+asset));assert.equal(r.headers['x-prizm-ui-release'],releaseId);}
 }
 return entries;
}
async function healthy(updated){let last;for(let attempt=0;attempt<8;attempt++){
 try{assert.equal(prop('prizm-fleet','ActiveState'),'active');
  const local=JSON.parse(run('ip',['netns','exec','prizm-fleet','/usr/bin/node',backup+'/deploy.mjs','--probe',updated?'new':'old'],{env:{...process.env,NODE_EXTRA_CA_CERTS:'/etc/prizm-fleet/fleet/ca-cert.pem'}}));
  return {...local,remote:await remoteChecks(updated,local.uiRelease)};
 }catch(e){last=e;console.log('Waiting for protected interface and fresh collector readings…');await new Promise(r=>setTimeout(r,2000));}
 }throw last;}
function effective(expected){assert.equal(prop('prizm-fleet','WorkingDirectory'),expected);assert(prop('prizm-fleet','ExecStart').includes('argv[]=/usr/bin/node '+expected+'/dist/fleet-server.cjs ;'));}
async function rollback(state){
 if(fs.existsSync(override)){assert.equal(fs.readFileSync(override,'utf8'),overrideText,'Override changed independently');fs.unlinkSync(override);}
 run('systemctl',['daemon-reload']);effective(prior);run('systemctl',['restart','prizm-fleet']);await healthy(false);
 assert.deepEqual(invariants(),state.before);state.rolledBack=true;save(state);
 console.log('Unified workspace rollback complete. Previous Fleet restored; collectors unchanged.');
}
async function apply(){
 assert(!fs.existsSync(backup)&&!fs.existsSync(release)&&!fs.existsSync(override),'Existing rollout state; inspect before retry');effective(prior);
 const m=manifest(stage),before=invariants();assert.deepEqual(before.baseline,m.before,'Deployed release differs from reviewed baseline');
 assert(Object.values(before.services).every(s=>s.active==='active'&&s.pid!=='0'));
 const patches=m.changed.map(p=>{const file=stage+'/'+p,s=fs.lstatSync(file);assert(s.isFile()&&!s.isSymbolicLink());const bytes=fs.readFileSync(file);assert.equal(sha(bytes),m.after[p]);return [p,bytes];});
 fs.mkdirSync(backup,{mode:0o700});fs.copyFileSync(fileURLToPath(import.meta.url),backup+'/deploy.mjs');fs.chmodSync(backup+'/deploy.mjs',0o600);
 fs.copyFileSync(stage+'/unified-manifest.json',backup+'/unified-manifest.json');
 const state={before,changed:false};save(state);await healthy(false);
 fs.mkdirSync(release,{mode:0o755});fs.cpSync(prior+'/dist',release+'/dist',{recursive:true});
 for(const [p,bytes]of patches)fs.writeFileSync(release+'/dist/'+p,bytes,{mode:0o644});
 assert.deepEqual(tree(release+'/dist'),m.after);fs.symlinkSync('/opt/prizm-fleet/releases/workspaces-20261001/node_modules',release+'/node_modules');
 run('/usr/bin/node',['--check',release+'/dist/fleet-server.cjs']);
 try{
  assert.deepEqual(invariants(),before);state.changed=true;save(state);
  fs.writeFileSync(override,overrideText,{mode:0o644,flag:'wx'});run('systemctl',['daemon-reload']);effective(release);
  run('systemctl',['restart','prizm-fleet']);
  state.checks=await healthy(true);assert.deepEqual(invariants(),before);assert.deepEqual(tree(release+'/dist'),m.after);
  // Confirm canonical publications continue after restart without restarting either collector.
  const earlier=new Map(state.checks.sites.map(s=>[s.siteId,s.observedAt]));
  await new Promise(r=>setTimeout(r,12000));const later=await healthy(true);
  assert(later.sites.every(s=>Date.parse(s.observedAt)>Date.parse(earlier.get(s.siteId))),'Collector timestamps did not advance');
  state.checks={...later,advancingBothSites:true,baselineAndCollectorPidsPreserved:true};
  assert.deepEqual(invariants(),before);state.completedAt=new Date().toISOString();save(state);
  console.log('Unified workspace deployment complete. Both collectors stayed running. Remote controls remain disabled. Sign in on LAN and remote for final browser verification.');
 }catch(error){console.error('Deployment checks failed; restoring previous Fleet release.');await rollback(state);throw error;}
}
if(process.argv[2]==='--self-test'){
 const dir=fs.mkdtempSync('/tmp/prizm-unified-rollback-'),file=dir+'/override.conf';fs.writeFileSync(file,overrideText,{flag:'wx'});
 assert.equal(fs.readFileSync(file,'utf8'),overrideText);fs.unlinkSync(file);assert(!fs.existsSync(file));
 assert(!overrideText.includes('prizm-site'));assert(!overrideText.includes('remoteReadOnly=false'));
 console.log('PASS fixed Fleet-only override creation/removal and rollback baseline; no collector/config changes');
}else{
 assert.equal(process.getuid(),0,'Run with sudo');
 if(process.argv[2]==='--probe')console.log(JSON.stringify(await probe(process.argv[3]==='new')));
 else{assert(['apply','rollback'].includes(process.argv[2]));
  const lock='/run/prizm-unified-workspace.lock',fd=fs.openSync(lock,'wx',0o600);
  try{if(process.argv[2]==='apply')await apply();else await rollback(JSON.parse(fs.readFileSync(backup+'/state.json')));}
  finally{fs.closeSync(fd);fs.unlinkSync(lock);}
 }
}
