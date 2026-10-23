/** Fixed Fleet-only deployment. No collector restarts or equipment commands. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const prior='/opt/prizm-fleet/releases/profile-controls-20261021';
const release='/opt/prizm-fleet/releases/animation-continuity-20261021';
const stage='/home/ebc/prizm-animation-continuity-20261021';
const backup='/var/lib/prizm-fleet/animation-continuity-20261021';
const report='/home/ebc/prizm-animation-continuity-result.json';
const override='/etc/systemd/system/prizm-fleet.service.d/zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz-animation-continuity-20261021.conf';
const configFile='/etc/prizm-fleet/fleet/fleet.json';
const accountsFile='/var/lib/prizm-fleet/accounts/accounts.json';
const remoteFile='/etc/prizm-fleet/fleet/remote.json';
const siteIds=['solar-star-3','solar-star-4'];
const manifestHash='dcbfcaea7b30b42753b7cd3cef49231b52d0ce4131977f03f83fec7e30e139d4';
const overrideText=`[Service]\nExecStart=\nExecStart=/usr/bin/node ${release}/dist/fleet-server.cjs\nWorkingDirectory=${release}\n`;
const sha=b=>createHash('sha256').update(b).digest('hex');
const hash=f=>sha(fs.readFileSync(f));
const run=(cmd,args,extra={})=>execFileSync(cmd,args,{encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,...extra}).trim();
const prop=(unit,key)=>run('systemctl',['show',unit,'-p',key,'--value']);
const json=f=>JSON.parse(fs.readFileSync(f,'utf8'));
function same(actual,expected,label){const keys=[...new Set([...Object.keys(actual),...Object.keys(expected)])];const changed=keys.filter(k=>JSON.stringify(actual[k])!==JSON.stringify(expected[k]));assert.equal(changed.length,0,label+': '+changed.slice(0,12).join(', '));}
function tree(dir){const result={};for(const n of fs.readdirSync(dir).sort()){
 const f=path.join(dir,n),s=fs.lstatSync(f);assert(!s.isSymbolicLink(),'Unexpected release symlink');
 if(s.isDirectory())for(const[p,h]of Object.entries(tree(f)))result[n+'/'+p]=h;
 else{assert(s.isFile());result[n]=hash(f);}
}return result;}
// daemon-reload can reset ExecStart runtime metadata without restarting a process.
function configuredExec(s){const m=/^\{ path=([^;]+) ; argv\[\]=([^;]+) ;/.exec(s);assert(m,'Unexpected ExecStart representation');return {path:m[1],argv:m[2]};}
function invariants(){return {
 hashes:Object.fromEntries([configFile,accountsFile,remoteFile,'/etc/prizm-fleet/ss3/export.json','/etc/prizm-fleet/ss4/export.json'].map(f=>[f,hash(f)])),
 baseline:tree(prior+'/dist'),
 collectorBundle:hash('/opt/prizm-fleet/releases/snapshot-retention-20261021/dist/server.cjs'),
 services:Object.fromEntries(['prizm','prizm-site@ss4','prizm-remote-tunnel'].map(s=>[s,{pid:prop(s,'MainPID'),exec:configuredExec(prop(s,'ExecStart')),active:prop(s,'ActiveState'),environmentHash:sha(prop(s,'Environment'))}]))};}
function effective(expected){assert.equal(prop('prizm-fleet','WorkingDirectory'),expected);assert.equal(configuredExec(prop('prizm-fleet','ExecStart')).argv,'/usr/bin/node '+expected+'/dist/fleet-server.cjs');}
function manifest(){const raw=fs.readFileSync(stage+'/continuity-manifest.json');assert.equal(sha(raw),manifestHash,'Reviewed manifest mismatch');const m=JSON.parse(raw);assert.equal(m.schema,1);
 for(const[p,h]of Object.entries(m.after)){assert(/^[a-zA-Z0-9_.\/-]+$/.test(p)&&!p.split('/').some(s=>s==='..'||!s));assert(/^[a-f0-9]{64}$/.test(h));}
 assert.deepEqual(Object.keys(m.after).filter(p=>m.before[p]!==m.after[p]).sort(),m.changed);assert(Object.keys(m.before).every(p=>p in m.after));
 for(const f of ['server.cjs','fleet-server.cjs','profile-controls.cjs','fleet-entry.cjs','workspace-ui.cjs','snapshot-cache-worker.cjs'])assert.equal(m.before[f],m.after[f]);assert(m.changed.every(p=>['index.html','fleet.html','mobile.html','signin.html'].includes(p)||p.startsWith('assets/')&&(p.endsWith('-continuity21.js')||p==='assets/power-flow-continuity21.css')));return m;}
function save(state){const tmp=backup+'/state.tmp';fs.writeFileSync(tmp,JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(tmp,backup+'/state.json');
 fs.writeFileSync(report,JSON.stringify({completedAt:state.completedAt??null,rolledBack:state.rolledBack??false,checks:state.checks??null,
 scope:'Animation display only',permissionsChanged:false,collectorsRestarted:false,equipmentCommandsSent:false,
 authenticatedBrowserAcceptancePending:true},null,2),{mode:0o600});const user=fs.statSync('/home/ebc');fs.chownSync(report,user.uid,user.gid);}
function socketRead(route){return new Promise((resolve,reject)=>{const req=http.get({socketPath:'/run/prizm-remote/mobile.sock',path:route,headers:{Host:'prizm.greenergyresources.org'}},res=>{
 let body='';res.on('data',b=>{body+=b;if(body.length>8*1024*1024)req.destroy(Error('Response limit'));});res.on('end',()=>resolve({status:res.statusCode,body,headers:res.headers}));res.on('error',reject);
 });req.setTimeout(10000,()=>req.destroy(Error('Remote socket timeout')));req.on('error',reject);});}
async function probe(updated){const c=json(configFile),sites=[];const ui=updated?(await import(pathToFileURL(release+'/dist/workspace-ui.cjs'))).createWorkspaceUi(release+'/dist'):null;
 const get=(url,headers={})=>new Promise((resolve,reject)=>{const u=new URL(url),local=u.hostname===new URL(c.origin).hostname;
  const req=https.get({hostname:local?(c.bindAddress&&c.bindAddress!=='0.0.0.0'?c.bindAddress:'127.0.0.1'):u.hostname,port:u.port,path:u.pathname+u.search,
   headers:{...headers,Host:u.host},checkServerIdentity:(_host,cert)=>tls.checkServerIdentity(u.hostname,cert)},res=>{let body='';res.on('data',b=>{body+=b;if(body.length>8*1024*1024)req.destroy(Error('Response limit'));});res.on('end',()=>resolve({status:res.statusCode,body,headers:res.headers}));res.on('error',reject);});
  req.setTimeout(10000,()=>req.destroy(Error('Protected endpoint timeout')));req.on('error',reject);
 });
 const root=await get(c.origin+'/');assert.equal(root.status,200);assert.equal((await get(c.origin+'/api/fleet/summary')).status,401);if(ui)assert.equal(root.headers['x-prizm-ui-release'],ui.releaseId);
 for(const id of siteIds){const collector=c.collectors.find(s=>s.siteId===id),workspace=c.workspaces.find(s=>s.siteId===id);assert(collector&&workspace);
  assert.equal((await get(workspace.origin+'/')).status,303);assert.equal((await get(workspace.origin+'/api/fleet/workspace-context')).status,401);
  const r=await get(collector.url,{authorization:'Bearer '+collector.token});assert.equal(r.status,200);const d=JSON.parse(r.body);
  assert.equal(d.siteId,id);assert.equal(d.stationCode,collector.stationCode);assert.equal(d.stale,false);
  const age=Date.now()-Date.parse(d.observedAt);assert(age>=-5000&&age<60000,'Collector snapshot stale or invalid');sites.push({siteId:id,observedAt:d.observedAt,ageMs:age});
 }return {sites,uiRelease:ui?.releaseId??null,localAuthenticationProtected:true};
}
async function remoteChecks(updated,releaseId){const entries={};for(const[route,status]of [['/',302],['/fleet/',200],['/mobile/',200],['/fleet/api/fleet/summary',401]]){
 const r=await socketRead(route);assert.equal(r.status,status,route);if(updated&&status===200)assert.equal(r.headers['x-prizm-ui-release'],releaseId);entries[route]=r.status;
 }for(const id of siteIds){assert.equal((await socketRead('/desktop/'+id+'/')).status,303);assert.equal((await socketRead('/desktop/'+id+'/api/fleet/workspace-context')).status,401);}
 if(updated){for(const entry of ['index.html','fleet.html']){const html=fs.readFileSync(release+'/dist/'+entry,'utf8'),assets=[...html.matchAll(/(?:src|href)="(\/assets\/[A-Za-z0-9_.-]+\.(?:js|css))"/g)].map(m=>m[1]);assert(assets.length);
  for(const asset of assets){const r=await socketRead(asset);assert.equal(r.status,200);assert.equal(sha(r.body),hash(release+'/dist'+asset));}
 }}return entries;}
async function healthy(updated){let last;for(let attempt=0;attempt<8;attempt++)try{
 assert.equal(prop('prizm-fleet','ActiveState'),'active');const local=JSON.parse(run('ip',['netns','exec','prizm-fleet','/usr/bin/node',backup+'/deploy.mjs','--probe',updated?'new':'old'],{env:{...process.env,NODE_EXTRA_CA_CERTS:'/etc/prizm-fleet/fleet/ca-cert.pem'}}));
 return {...local,remote:await remoteChecks(updated,local.uiRelease)};
 }catch(e){last=e;console.log(`Waiting for protected Fleet endpoints and fresh data (${attempt+1}/8)…`);await new Promise(r=>setTimeout(r,2000));}throw last;}
async function rollback(state){
 if(fs.existsSync(override)){assert.equal(fs.readFileSync(override,'utf8'),overrideText,'Override changed independently');fs.unlinkSync(override);}
 run('systemctl',['daemon-reload']);effective(prior);run('systemctl',['restart','prizm-fleet']);await healthy(false);same(invariants(),state.before,'Rollback preservation check');
 state.rolledBack=true;save(state);console.log('Previous profile-controls Fleet restored; permissions and collectors unchanged.');
}
async function apply(){
 assert(!fs.existsSync(backup)&&!fs.existsSync(release)&&!fs.existsSync(override),'Existing rollout state; inspect before retrying');effective(prior);
 const m=manifest(),before=invariants();
 same(before.baseline,m.before,'Deployed release differs from reviewed baseline');assert(Object.values(before.services).every(s=>s.active==='active'&&s.pid!=='0'));
 const patches=m.changed.map(p=>{const file=stage+'/'+p,s=fs.lstatSync(file);assert(s.isFile()&&!s.isSymbolicLink());const bytes=fs.readFileSync(file);assert.equal(sha(bytes),m.after[p]);return [p,bytes];});
 fs.mkdirSync(backup,{mode:0o700});fs.copyFileSync(fileURLToPath(import.meta.url),backup+'/deploy.mjs');fs.chmodSync(backup+'/deploy.mjs',0o600);
 const state={before,changed:false};save(state);await healthy(false);
 fs.mkdirSync(release,{mode:0o755});fs.cpSync(prior+'/dist',release+'/dist',{recursive:true});for(const[p,bytes]of patches)fs.writeFileSync(release+'/dist/'+p,bytes,{mode:0o644});
 same(tree(release+'/dist'),m.after,'Installed artifact hashes');fs.symlinkSync('/opt/prizm-fleet/releases/workspaces-20261001/node_modules',release+'/node_modules');
 for(const f of ['fleet-server.cjs','profile-controls.cjs'])run('/usr/bin/node',['--check',release+'/dist/'+f]);
 try{same(invariants(),before,'Pre-activation preservation check');state.changed=true;save(state);
  fs.writeFileSync(override,overrideText,{mode:0o644,flag:'wx'});run('systemctl',['daemon-reload']);effective(release);run('systemctl',['restart','prizm-fleet']);
  state.checks=await healthy(true);same(invariants(),before,'Post-activation preservation check');same(tree(release+'/dist'),m.after,'Post-activation artifact hashes');
  const earlier=new Map(state.checks.sites.map(s=>[s.siteId,s.observedAt]));await new Promise(r=>setTimeout(r,12000));const later=await healthy(true);
  assert(later.sites.every(s=>Date.parse(s.observedAt)>Date.parse(earlier.get(s.siteId))),'Collector timestamps did not advance');
  same(invariants(),before,'Final preservation check');state.checks={...later,advancingBothSites:true,collectorPidsPreserved:true,permissionsPreserved:true};state.completedAt=new Date().toISOString();save(state);
  console.log('Animation continuity deployment complete. Permissions and collectors unchanged; data advanced on both sites. LAN/remote browser acceptance remains. No equipment commands sent.');
 }catch(error){console.error('Checks failed; restoring previous profile-controls Fleet.');try{await rollback(state);}catch(rollbackError){console.error('Rollback needs inspection. Checkpoint: '+backup);throw new AggregateError([error,rollbackError],'Deployment and rollback verification failed');}throw error;}
}
function selfTest(){
 const first='{ path=/usr/bin/node ; argv[]=/usr/bin/node app.cjs ; ignore_errors=no ; start_time=[now] ; pid=123 ; }';
 assert.deepEqual(configuredExec(first),configuredExec(first.replace('[now]','[n/a]').replace('pid=123','pid=0')));
 assert(!overrideText.includes('prizm-site'));assert.notEqual(prior,release);
 assert(path.basename(override)>'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz-profile-controls-20261021.conf','New override must sort after active profile-controls override');
 const source=fs.readFileSync(fileURLToPath(import.meta.url),'utf8');
 assert(!source.includes('function '+'grantOwner('));assert(!source.includes('atomic('+'accountsFile,'));
 console.log('PASS animation-only installer: distinct release, stable process invariants, no permission writes');
}
if(process.argv[2]==='--self-test')selfTest();else{
 assert.equal(process.getuid(),0,'Run with sudo');if(process.argv[2]==='--probe')console.log(JSON.stringify(await probe(process.argv[3]==='new')));else{
  assert(['apply','rollback'].includes(process.argv[2]));const lock='/run/prizm-animation-continuity.lock',fd=fs.openSync(lock,'wx',0o600);let accountLock;
  try{accountLock=fs.openSync('/var/lib/prizm-fleet/accounts/provision.lock','wx',0o600);if(process.argv[2]==='apply')await apply();else await rollback(json(backup+'/state.json'));}
  finally{if(accountLock!==undefined){fs.closeSync(accountLock);fs.unlinkSync('/var/lib/prizm-fleet/accounts/provision.lock');}fs.closeSync(fd);fs.unlinkSync(lock);}
 }
}
