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
const prior='/opt/prizm-fleet/releases/startup-assets-20261021';
const release='/opt/prizm-fleet/releases/profile-controls-20261021';
const stage='/home/ebc/prizm-profile-controls-20261021';
const backup='/var/lib/prizm-fleet/profile-controls-20261021';
const report='/home/ebc/prizm-profile-controls-result.json';
const override='/etc/systemd/system/prizm-fleet.service.d/zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz-profile-controls-20261021.conf';
const configFile='/etc/prizm-fleet/fleet/fleet.json';
const accountsFile='/var/lib/prizm-fleet/accounts/accounts.json';
const remoteFile='/etc/prizm-fleet/fleet/remote.json';
const ownerEmail='john.wilson@greenergyresources.com';
const siteIds=['solar-star-3','solar-star-4'];
const manifestHash='e671a922c6f897eecf629f3580dd2f1229b13e17188e355a7c5b73f8a2b0b452';
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
 hashes:Object.fromEntries([configFile,'/etc/prizm-fleet/ss3/export.json','/etc/prizm-fleet/ss4/export.json'].map(f=>[f,hash(f)])),
 baseline:tree(prior+'/dist'),
 collectorBundle:hash('/opt/prizm-fleet/releases/snapshot-retention-20261021/dist/server.cjs'),
 services:Object.fromEntries(['prizm','prizm-site@ss4','prizm-remote-tunnel'].map(s=>[s,{pid:prop(s,'MainPID'),exec:configuredExec(prop(s,'ExecStart')),active:prop(s,'ActiveState'),environmentHash:sha(prop(s,'Environment'))}]))};}
function effective(expected){assert.equal(prop('prizm-fleet','WorkingDirectory'),expected);assert.equal(configuredExec(prop('prizm-fleet','ExecStart')).argv,'/usr/bin/node '+expected+'/dist/fleet-server.cjs');}
function manifest(){const raw=fs.readFileSync(stage+'/profiles-manifest.json');assert.equal(sha(raw),manifestHash,'Reviewed manifest mismatch');const m=JSON.parse(raw);assert.equal(m.schema,1);
 for(const[p,h]of Object.entries(m.after)){assert(/^[a-zA-Z0-9_.\/-]+$/.test(p)&&!p.split('/').some(s=>s==='..'||!s));assert(/^[a-f0-9]{64}$/.test(h));}
 assert.deepEqual(Object.keys(m.after).filter(p=>m.before[p]!==m.after[p]).sort(),m.changed);assert(Object.keys(m.before).every(p=>p in m.after));
 for(const f of ['server.cjs','fleet-entry.cjs','workspace-ui.cjs','snapshot-cache-worker.cjs'])assert.equal(m.before[f],m.after[f]);return m;}
function privateMeta(file){const s=fs.lstatSync(file),parent=fs.lstatSync(path.dirname(file));assert(s.isFile()&&!s.isSymbolicLink()&&(s.mode&0o077)===0);
 assert(parent.isDirectory()&&!parent.isSymbolicLink()&&(parent.mode&0o022)===0);return {uid:s.uid,gid:s.gid,mode:s.mode&0o777};}
function atomic(file,bytes,meta,expected){assert.equal(hash(file),expected,'Private file changed independently: '+file);const temp=path.join(path.dirname(file),randomUUID()+'.profiles.tmp');let fd;
 try{fd=fs.openSync(temp,'wx',meta.mode);fs.fchownSync(fd,meta.uid,meta.gid);fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
  assert.equal(hash(file),expected,'Concurrent private file edit: '+file);fs.renameSync(temp,file);
 }finally{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
function grantOwner(accounts,collectors){assert(Array.isArray(accounts)&&accounts.length>0);const result=structuredClone(accounts);
 const matches=result.filter(a=>a.email===ownerEmail);assert.equal(matches.length,1,'Exact owner account required');const owner=matches[0];
 assert(owner.fleetAdmin===true&&!owner.disabled&&owner.remoteAccess===true,'Owner must already be an enabled remote administrator');
 assert(result.every(a=>a.remoteControlSites===undefined||Array.isArray(a.remoteControlSites)&&a.remoteControlSites.length===0),'Initial rollout requires every remote control grant to be empty');
 for(const id of siteIds){const enrolled=collectors.filter(c=>c.siteId===id);assert.equal(enrolled.length,1);assert(['telemetry.view','workspace.full'].every(cap=>owner.grants.some(g=>g.capability===cap&&g.siteId===id&&g.blockId===enrolled[0].blockId&&g.scope.kind==='block')),'Owner requires existing full workspace on '+id);}
 assert(Number.isSafeInteger(owner.version)&&owner.version>=1&&owner.version<Number.MAX_SAFE_INTEGER);owner.version++;owner.remoteControlSites=[...siteIds];
 return result;
}
function save(state){const tmp=backup+'/state.tmp';fs.writeFileSync(tmp,JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(tmp,backup+'/state.json');
 fs.writeFileSync(report,JSON.stringify({completedAt:state.completedAt??null,rolledBack:state.rolledBack??false,checks:state.checks??null,
  scope:'Per-array animation; profile-controlled remote operations and maintenance',initialRemoteOwner:ownerEmail,sites:siteIds,
  collectorsRestarted:false,equipmentCommandsSent:false,networkChanged:false,authenticatedBrowserAcceptancePending:true,
  preservedConcurrentPrivateFiles:state.preservedConcurrentPrivateFiles??[]},null,2),{mode:0o600});const user=fs.statSync('/home/ebc');fs.chownSync(report,user.uid,user.gid);}
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
function checkPrivate(state){for(const item of state.privateFiles)assert.equal(hash(item.file),item.afterHash,'Private configuration changed during rollout');}
async function rollback(state){
 // Restore only our exact writes. Never overwrite a later administrator change.
 state.preservedConcurrentPrivateFiles=[];
 for(const item of state.privateFiles){const current=hash(item.file);if(current===item.afterHash)atomic(item.file,fs.readFileSync(backup+'/'+item.copy),item.meta,current);else if(current!==item.beforeHash)state.preservedConcurrentPrivateFiles.push(item.file);}
 if(fs.existsSync(override)){assert.equal(fs.readFileSync(override,'utf8'),overrideText,'Override changed independently');fs.unlinkSync(override);}
 run('systemctl',['daemon-reload']);effective(prior);run('systemctl',['restart','prizm-fleet']);await healthy(false);same(invariants(),state.before,'Rollback preservation check');
 state.rolledBack=true;save(state);console.log('Previous read-only Fleet restored; collectors unchanged. Private backups retained.');
 if(state.preservedConcurrentPrivateFiles.length)console.log('Later administrator edits were preserved; inspect the result report. The old Fleet keeps remote controls disabled.');
}
async function apply(){
 assert(!fs.existsSync(backup)&&!fs.existsSync(release)&&!fs.existsSync(override),'Existing rollout state; inspect before retrying');effective(prior);
 const m=manifest(),before=invariants(),c=json(configFile),remote=json(remoteFile);assert.equal(c.accountsFile,accountsFile);assert.equal(remote.origin,'https://prizm.greenergyresources.org');
 assert(remote.controls===undefined||remote.controls==='disabled','Remote controls already configured; inspect before changing');
 same(before.baseline,m.before,'Deployed release differs from reviewed baseline');assert(Object.values(before.services).every(s=>s.active==='active'&&s.pid!=='0'));
 const accountBytes=Buffer.from(JSON.stringify(grantOwner(json(accountsFile),c.collectors),null,2));const remoteBytes=Buffer.from(JSON.stringify({...remote,controls:'profile'},null,2));
 const privateFiles=[[accountsFile,'accounts.before.json',accountBytes],[remoteFile,'remote.before.json',remoteBytes]].map(([file,copy,bytes])=>({file,copy,meta:privateMeta(file),beforeHash:hash(file),afterHash:sha(bytes)}));
 const patches=m.changed.map(p=>{const file=stage+'/'+p,s=fs.lstatSync(file);assert(s.isFile()&&!s.isSymbolicLink());const bytes=fs.readFileSync(file);assert.equal(sha(bytes),m.after[p]);return [p,bytes];});
 fs.mkdirSync(backup,{mode:0o700});fs.copyFileSync(fileURLToPath(import.meta.url),backup+'/deploy.mjs');fs.chmodSync(backup+'/deploy.mjs',0o600);
 for(const item of privateFiles){fs.copyFileSync(item.file,backup+'/'+item.copy);fs.chmodSync(backup+'/'+item.copy,0o600);assert.equal(hash(backup+'/'+item.copy),item.beforeHash);}
 const state={before,privateFiles,changed:false};save(state);await healthy(false);
 fs.mkdirSync(release,{mode:0o755});fs.cpSync(prior+'/dist',release+'/dist',{recursive:true});for(const[p,bytes]of patches)fs.writeFileSync(release+'/dist/'+p,bytes,{mode:0o644});
 same(tree(release+'/dist'),m.after,'Installed artifact hashes');fs.symlinkSync('/opt/prizm-fleet/releases/workspaces-20261001/node_modules',release+'/node_modules');
 for(const f of ['fleet-server.cjs','profile-controls.cjs'])run('/usr/bin/node',['--check',release+'/dist/'+f]);
 try{same(invariants(),before,'Pre-activation preservation check');state.changed=true;save(state);
  atomic(accountsFile,accountBytes,privateFiles[0].meta,privateFiles[0].beforeHash);atomic(remoteFile,remoteBytes,privateFiles[1].meta,privateFiles[1].beforeHash);
  fs.writeFileSync(override,overrideText,{mode:0o644,flag:'wx'});run('systemctl',['daemon-reload']);effective(release);run('systemctl',['restart','prizm-fleet']);
  state.checks=await healthy(true);same(invariants(),before,'Post-activation preservation check');checkPrivate(state);same(tree(release+'/dist'),m.after,'Post-activation artifact hashes');
  const earlier=new Map(state.checks.sites.map(s=>[s.siteId,s.observedAt]));await new Promise(r=>setTimeout(r,12000));const later=await healthy(true);
  assert(later.sites.every(s=>Date.parse(s.observedAt)>Date.parse(earlier.get(s.siteId))),'Collector timestamps did not advance');
  same(invariants(),before,'Final preservation check');checkPrivate(state);state.checks={...later,advancingBothSites:true,collectorPidsPreserved:true,onlyOwnerInitiallyEnabled:true};state.completedAt=new Date().toISOString();save(state);
  console.log('Profile controls deployment complete. Only John is enabled on SS3/SS4, including maintenance. Both collectors stayed running and data advanced. Sign in again on LAN and remote for browser verification. No equipment commands were sent.');
 }catch(error){console.error('Checks failed; restoring previous read-only Fleet.');try{await rollback(state);}catch(rollbackError){console.error('Rollback needs inspection. Private backups: '+backup);throw new AggregateError([error,rollbackError],'Deployment and rollback verification failed');}throw error;}
}
function selfTest(){
 const sites=siteIds.map(siteId=>({siteId,blockId:'b1'})),base=[{id:'owner',email:ownerEmail,disabled:false,fleetAdmin:true,remoteAccess:true,version:1,grants:sites.flatMap(s=>['telemetry.view','workspace.full'].map(capability=>({...s,capability,scope:{kind:'block'}})))},{id:'viewer',email:'viewer@example.test',version:1,grants:[]}];
 const granted=grantOwner(base,sites);assert.deepEqual(granted[0].remoteControlSites,siteIds);assert.equal(granted[0].version,2);assert.deepEqual(granted[1],base[1]);assert.deepEqual(granted[0].grants,base[0].grants);assert.equal(base[0].remoteControlSites,undefined);
 assert.throws(()=>grantOwner(granted,sites));assert.throws(()=>grantOwner([{...base[0],remoteAccess:false}],sites));assert.throws(()=>grantOwner([{...base[0],grants:[]}],sites));
 const first='{ path=/usr/bin/node ; argv[]=/usr/bin/node app.cjs ; ignore_errors=no ; start_time=[now] ; pid=123 ; }',second=first.replace('[now]','[n/a]').replace('pid=123','pid=0');assert.deepEqual(configuredExec(first),configuredExec(second));
 const dir=fs.mkdtempSync('/tmp/prizm-profiles-installer-');try{const f=dir+'/private.json';fs.writeFileSync(f,'old',{mode:0o600});const meta=privateMeta(f);atomic(f,Buffer.from('new'),meta,sha('old'));assert.equal(fs.readFileSync(f,'utf8'),'new');assert.throws(()=>atomic(f,Buffer.from('bad'),meta,sha('old')));atomic(f,Buffer.from('old'),meta,sha('new'));assert.equal(fs.readFileSync(f,'utf8'),'old');}finally{fs.rmSync(dir,{recursive:true});}
 assert(!overrideText.includes('prizm-site'));console.log('PASS owner-only grant, LAN grant preservation, eligibility denial, atomic private backup/restore, concurrent edit refusal, stable service comparison');
}
if(process.argv[2]==='--self-test')selfTest();else{
 assert.equal(process.getuid(),0,'Run with sudo');if(process.argv[2]==='--probe')console.log(JSON.stringify(await probe(process.argv[3]==='new')));else{
  assert(['apply','rollback'].includes(process.argv[2]));const lock='/run/prizm-profile-controls.lock',fd=fs.openSync(lock,'wx',0o600);let accountLock;
  try{accountLock=fs.openSync('/var/lib/prizm-fleet/accounts/provision.lock','wx',0o600);if(process.argv[2]==='apply')await apply();else await rollback(json(backup+'/state.json'));}
  finally{if(accountLock!==undefined){fs.closeSync(accountLock);fs.unlinkSync('/var/lib/prizm-fleet/accounts/provision.lock');}fs.closeSync(fd);fs.unlinkSync(lock);}
 }
}
