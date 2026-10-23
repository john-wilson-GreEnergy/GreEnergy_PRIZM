/** Fixed Fleet-only mobile rollout. No collector, account, network or equipment changes. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import tls from 'node:tls';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const release='/opt/prizm-fleet/releases/mobile-20261019';
const previous='/opt/prizm-fleet/releases/site-analytics-20261019';
const backup='/var/lib/prizm-fleet/mobile-20261019';
const archive='/home/ebc/prizm-mobile-20261019.tgz';
const archiveHash='5f0f679ca10ac3db912c72fe306dba40905e633914d8cc231c268c68fd270036';
const dependencies='/opt/prizm-fleet/releases/workspaces-20261001/node_modules';
const ca='/etc/prizm-fleet/fleet/ca-cert.pem';
const configFile='/etc/prizm-fleet/fleet/fleet.json';
const override='/etc/systemd/system/prizm-fleet.service.d/zzzzzzzzzzzz-mobile-20261019.conf';
const report='/home/ebc/prizm-mobile-result.json';
const self=fileURLToPath(import.meta.url);
const run=(cmd,args,options={})=>execFileSync(cmd,args,{encoding:'utf8',timeout:90000,maxBuffer:8*1024*1024,...options}).trim();
const present=p=>{try{return fs.lstatSync(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const property=(service,key)=>run('systemctl',['show',service,'-p',key,'--value']);
const text=`[Service]\nExecStart=\nExecStart=/usr/bin/node ${release}/dist/fleet-server.cjs\nWorkingDirectory=${release}\n`;
function save(file,data){assert(!present(file)||present(file).isFile()&&!present(file).isSymbolicLink());fs.writeFileSync(file+'.new',JSON.stringify(data,null,2),{mode:0o600,flag:'wx'});fs.renameSync(file+'.new',file);}
function configuration(){const c=JSON.parse(fs.readFileSync(configFile,'utf8'));return Object.fromEntries([configFile,c.accountsFile,'/etc/prizm-fleet/ss3/export.json','/etc/prizm-fleet/ss4/export.json'].map(p=>[p,hash(p)]));}
function collectorState(){return Object.fromEntries(['prizm','prizm-site@ss4'].map(s=>[s,{pid:property(s,'MainPID'),exec:property(s,'ExecStart'),active:property(s,'ActiveState')}]));}
function entriesOkay(entries,types){
 assert(entries.length>=4&&entries.length<500&&new Set(entries).size===entries.length);
 assert(entries.every(p=>/^dist\/(?:fleet-server\.cjs|mobile-verifier\.cjs|mobile\.html|assets\/[A-Za-z0-9_.-]+\.(?:js|css|svg))$/.test(p)),'Unexpected archive path');
 assert(types.every(t=>t.startsWith('-')),'Only regular files allowed');
 for(const f of ['fleet-server.cjs','mobile-verifier.cjs','mobile.html'])assert(entries.includes('dist/'+f));
}
function checkArchive(file=archive){assert(present(file)?.isFile()&&!present(file).isSymbolicLink());assert.equal(hash(file),archiveHash);entriesOkay(run('tar',['-tzf',file]).split('\n'),run('tar',['-tvzf',file]).split('\n'));}
function restoreOverride(){if(!present(override))return;assert(present(override).isFile()&&!present(override).isSymbolicLink());assert.equal(fs.readFileSync(override,'utf8'),text,'Override externally changed');fs.unlinkSync(override);}
function output(state){save(report,{completedAt:state.completedAt??null,rolledBack:state.rolledBack??false,checks:state.checks??null});const owner=fs.statSync('/home/ebc');fs.chownSync(report,owner.uid,owner.gid);}
async function probe(updated){
 const config=JSON.parse(fs.readFileSync(configFile,'utf8'));
 assert.equal(config.origin,'https://10.0.0.15:3443');
 const get=(origin,pathname)=>new Promise((resolve,reject)=>{
  const u=new URL(origin),address=!config.bindAddress||config.bindAddress==='0.0.0.0'?'127.0.0.1':config.bindAddress;
  const req=https.get({hostname:address,port:u.port,path:pathname,headers:{host:u.host},ca:fs.readFileSync(ca),checkServerIdentity:(_host,cert)=>tls.checkServerIdentity(u.hostname,cert)},res=>{
   let body='';res.setEncoding('utf8');res.on('data',s=>{body+=s;if(body.length>4*1024*1024)req.destroy(Error('Oversize'));});res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode,body}));
  });req.setTimeout(5000,()=>req.destroy(Error('Timeout')));req.on('error',reject);
 });
 const root=await get(config.origin,'/');assert.equal(root.status,200);assert.equal(root.body,fs.readFileSync(previous+'/dist/fleet.html','utf8'),'Existing Fleet page changed');
 assert.equal((await get(config.origin,'/api/fleet/summary')).status,401);
 for(const w of config.workspaces)assert.equal((await get(w.origin,'/api/fleet/workspace-context')).status,401);
 if(!updated)return {https:true,previousFleetHealthy:true};
 const mobile=await get(config.origin,'/mobile/');assert.equal(mobile.status,200);assert.equal(mobile.body,fs.readFileSync(release+'/dist/mobile.html','utf8'));
 assert.equal((await get(config.origin,'/mobile')).status,302);
 for(const route of ['session','summary'])assert.equal((await get(config.origin,'/mobile/api/fleet/'+route)).status,401);
 for(const route of ['/mobile/api/fleet/admin/users','/mobile/api/fleet/reauthenticate','/mobile/api/local/commands','/mobile/accounts.json','/mobile/api/fleet/summary?siteId=other'])assert.equal((await get(config.origin,route)).status,403);
 const manifest=JSON.parse((await get(config.origin,'/mobile/mobile.webmanifest')).body);assert.equal(manifest.scope,'/mobile/');
 for(const m of mobile.body.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g)){const asset=await get(config.origin,m[1]);assert.equal(asset.status,200);assert.equal(asset.body,fs.readFileSync(release+'/dist'+m[1],'utf8'));}
 const {MobileHvacCache}=createRequire(import.meta.url)(release+'/dist/mobile-verifier.cjs');
 const cache=new MobileHvacCache(config.collectors,config.workspaces),sites=[];
 for(const c of config.collectors){
  const w=config.workspaces.find(w=>w.siteId===c.siteId);assert(w);
  const r=await fetch(c.url,{headers:{authorization:'Bearer '+c.token},redirect:'error',signal:AbortSignal.timeout(5000)});assert.equal(r.status,200);
  const summary=await r.json();assert.equal(summary.siteId,c.siteId);assert.equal(summary.stationCode,c.stationCode);assert.equal(summary.stale,false);assert(Date.now()-Date.parse(summary.observedAt)<45000);
  await cache.refresh(c,w);const hvac=cache.view(c.siteId);assert.equal(hvac.error,null);assert.equal(hvac.units.length,336);assert(hvac.units.some(u=>u.quality==='Live'));
  assert(hvac.units.every(u=>!u.faults.some(f=>f.startsWith('Controller: '))));
  const cs4=hvac.units.filter(u=>u.array===4&&u.segment==='CS');assert.equal(cs4.length,2);
  sites.push({site:c.siteId,observedAt:summary.observedAt,hvacUnits:hvac.units.length,cs4:cs4.map(u=>({unit:u.unit,mode:u.mode,quality:u.quality,at:u.at,current:u.readings.current.text,unitFaults:u.faults,segmentAlerts:u.controllerAlerts}))});
 }
 cache.stop();return {https:true,mobileUi:true,assets:true,readOnlyRoutes:true,sites};
}
function isolated(updated){return JSON.parse(run('ip',['netns','exec','prizm-fleet',process.execPath,backup+'/deploy.mjs','--probe',updated?'updated':'previous'],{env:{...process.env,NODE_EXTRA_CA_CERTS:ca},timeout:45000}));}
async function healthy(updated){const until=Date.now()+90000;do{try{assert.equal(property('prizm-fleet','ActiveState'),'active');return isolated(updated);}catch{console.log('Waiting for Fleet HTTPS and current cached readings…');await new Promise(r=>setTimeout(r,3000));}}while(Date.now()<until);throw Error('Fleet validation failed');}
async function rollback(state){
 if(state.changed){restoreOverride();run('systemctl',['daemon-reload']);run('systemctl',['restart','prizm-fleet']);await healthy(false);}
 assert.deepEqual(configuration(),state.configHashes);assert.deepEqual(collectorState(),state.collectors);
 state.rolledBack=true;save(backup+'/state.json',state);output(state);console.log('Previous Fleet restored. Collectors and recorded data unchanged.');
}
async function apply(){
 assert(!present(release)&&!present(backup)&&!present(override),'Already staged: inspect result or use rollback');checkArchive();
 assert(property('prizm-fleet','ExecStart').includes(previous+'/dist/fleet-server.cjs'));assert.equal(property('prizm-fleet','WorkingDirectory'),previous);assert.equal(property('prizm-fleet','UnitFileState'),'enabled');
 const collectors=collectorState();assert(Object.values(collectors).every(s=>s.active==='active'&&s.pid!=='0'));
 assert(Number(fs.statfsSync('/var/lib').bavail)*Number(fs.statfsSync('/var/lib').bsize)>5*1024**3,'Insufficient reserve');
 fs.mkdirSync(backup,{mode:0o700});fs.copyFileSync(self,backup+'/deploy.mjs',fs.constants.COPYFILE_EXCL);fs.chmodSync(backup+'/deploy.mjs',0o600);
 fs.copyFileSync(archive,backup+'/release.tgz',fs.constants.COPYFILE_EXCL);checkArchive(backup+'/release.tgz');
 const state={changed:false,collectors,configHashes:configuration()};save(backup+'/state.json',state);await healthy(false);
 fs.mkdirSync(release,{mode:0o755});fs.mkdirSync(release+'/dist',{mode:0o755});fs.cpSync(previous+'/dist/assets',release+'/dist/assets',{recursive:true});
 for(const name of ['fleet.html','logo-transparent.svg'])fs.copyFileSync(previous+'/dist/'+name,release+'/dist/'+name);
 run('tar',['--no-same-owner','--no-same-permissions','-xzf',backup+'/release.tgz','-C',release]);fs.symlinkSync(dependencies,release+'/node_modules');
 const require=createRequire(release+'/dist/fleet-server.cjs');for(const f of ['fleet-server.cjs','mobile-verifier.cjs']){
  run(process.execPath,['--check',release+'/dist/'+f]);for(const m of fs.readFileSync(release+'/dist/'+f,'utf8').matchAll(/require\("([^".][^"]*)"\)/g))require.resolve(m[1]);
 }
 try{
  assert.deepEqual(configuration(),state.configHashes);state.changed=true;save(backup+'/state.json',state);
  fs.writeFileSync(override,text,{flag:'wx',mode:0o644});run('systemctl',['daemon-reload']);run('systemctl',['restart','prizm-fleet']);
  state.checks=await healthy(true);assert.deepEqual(configuration(),state.configHashes);assert.deepEqual(collectorState(),state.collectors);
  state.completedAt=new Date().toISOString();save(backup+'/state.json',state);output(state);
  console.log('Mobile deployment complete: https://10.0.0.15:3443/mobile/ . Sign in to verify both sites. Collectors, network and equipment unchanged.');
 }catch(e){console.error('Validation failed; restoring previous Fleet.');await rollback(state);throw e;}
}
if(process.argv[2]==='--self-test'){
 const list=['dist/fleet-server.cjs','dist/mobile-verifier.cjs','dist/mobile.html','dist/assets/mobile.js'];entriesOkay(list,list.map(()=>'- file'));
 for(const bad of ['../etc/a','dist/../secret','dist/server.cjs','/etc/a','dist/assets/a/../b.js'])assert.throws(()=>entriesOkay([...list,bad],list.map(()=>'- file')));
 assert.throws(()=>entriesOkay(list,['l link']));assert(!text.includes('Network'));assert(!text.includes('prizm-site'));assert(text.includes('fleet-server.cjs'));
 console.log('PASS release scope and archive allowlist');
}else if(process.argv[2]==='--check-archive'){checkArchive(process.argv[3]??archive);console.log('PASS release archive');}
else{
 assert.equal(process.getuid(),0,'Run with sudo');
 if(process.argv[2]==='--probe')console.log(JSON.stringify(await probe(process.argv[3]==='updated')));
 else{assert(['apply','rollback'].includes(process.argv[2]),'Use apply or rollback');const lock='/run/prizm-mobile-deploy.lock',fd=fs.openSync(lock,'wx',0o600);
  try{if(process.argv[2]==='apply')await apply();else await rollback(JSON.parse(fs.readFileSync(backup+'/state.json','utf8')));}finally{fs.closeSync(fd);fs.unlinkSync(lock);}
 }
}
