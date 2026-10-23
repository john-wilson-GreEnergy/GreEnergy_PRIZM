/** BPC display only. Fixed existing UI files; no new navigation or server code. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import https from 'node:https';
import tls from 'node:tls';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const stage='/home/ebc/prizm-bpc-collapse-20261020';
const backup='/var/lib/prizm-fleet/bpc-collapse-20261020';
const report='/home/ebc/prizm-bpc-collapse-result.json';
const roots={fleet:'/opt/prizm-fleet/releases/remote-password-20261020/dist',site:'/opt/prizm-fleet/releases/site-analytics-20261019/dist'};
// Replaced with the reviewed manifest digest when staging this fixed release.
const manifestHash='a1934b2c10f0432b31c6442b2bf48cf7999159b5da27c73d7a90d5ce7073d761';
const digest=b=>createHash('sha256').update(b).digest('hex');
const hash=f=>digest(fs.readFileSync(f));
const run=(cmd,args,opts={})=>execFileSync(cmd,args,{encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024,...opts}).trim();
const prop=(unit,key)=>run('systemctl',['show',unit,'-p',key,'--value']);
function target(file){
 assert(/^(fleet|site)\/assets\/[A-Za-z0-9_-]+\.(js|css)$/.test(file),'Unexpected patch path');
 const [area,...rest]=file.split('/');return path.join(roots[area],...rest);
}
function manifest(dir){
 const bytes=fs.readFileSync(dir+'/manifest.json');assert.equal(digest(bytes),manifestHash);
 const m=JSON.parse(bytes);assert.equal(m.schema,1);assert.equal(m.files.length,8);
 assert.equal(new Set(m.files.map(f=>f.file)).size,8);
 for(const f of m.files){target(f.file);assert(/^[a-f0-9]{64}$/.test(f.before)&&/^[a-f0-9]{64}$/.test(f.after));}
 return m;
}
function regular(file){
 const s=fs.lstatSync(file);assert(s.isFile()&&!s.isSymbolicLink(),file);
 assert.equal(fs.realpathSync(file),file,'Symlink path not allowed');return s;
}
function atomic(file,bytes,owner){
 const temp=file+'.bpc-collapse-new';fs.writeFileSync(temp,bytes,{flag:'wx',mode:owner.mode&0o777});
 fs.chownSync(temp,owner.uid,owner.gid);fs.renameSync(temp,file);
}
function invariants(){
 const config='/etc/prizm-fleet/fleet/fleet.json',c=JSON.parse(fs.readFileSync(config));
 const files=[config,c.accountsFile,'/etc/prizm-fleet/fleet/remote.json','/etc/prizm-fleet/ss3/export.json','/etc/prizm-fleet/ss4/export.json',
  roots.fleet+'/fleet-server.cjs',roots.site+'/server.cjs',roots.fleet+'/fleet.html',roots.fleet+'/mobile.html',roots.fleet+'/index.html',roots.site+'/index.html'];
 return {hashes:Object.fromEntries(files.map(f=>[f,hash(f)])),
  collectors:Object.fromEntries(['prizm','prizm-site@ss4','prizm-remote-tunnel'].map(s=>[s,{pid:prop(s,'MainPID'),active:prop(s,'ActiveState'),exec:prop(s,'ExecStart')}])),
  fleet:{cwd:prop('prizm-fleet','WorkingDirectory'),exec:prop('prizm-fleet','ExecStart').match(/argv\[\]=([^;]+)/)?.[1]},
  publicRoots:['prizm','prizm-site@ss4'].map(s=>digest(prop(s,'Environment')))};
}
function save(state){
 fs.writeFileSync(backup+'/state.json',JSON.stringify(state,null,2),{mode:0o600});
 const result={completedAt:state.completedAt??null,rolledBack:state.rolledBack??false,checks:state.checks??null,scope:'BPC display only',collectorsRestarted:false,navigationChanged:false};
 fs.writeFileSync(report,JSON.stringify(result,null,2),{mode:0o600});const owner=fs.statSync('/home/ebc');fs.chownSync(report,owner.uid,owner.gid);
}
function socketRead(route){
 return new Promise((resolve,reject)=>{
  const req=http.get({socketPath:'/run/prizm-remote/mobile.sock',path:route,headers:{Host:'prizm.greenergyresources.org'}},res=>{
   res.resume();res.on('end',()=>resolve({status:res.statusCode,location:res.headers.location??null}));
  });req.setTimeout(5000,()=>req.destroy(Error('Remote socket timeout')));req.on('error',reject);
 });
}
async function probe(updated){
 const m=manifest(backup),c=JSON.parse(fs.readFileSync('/etc/prizm-fleet/fleet/fleet.json'));
 const get=(url,headers={})=>new Promise((resolve,reject)=>{
  const u=new URL(url),local=u.origin===c.origin;
  const req=https.get({hostname:local?'127.0.0.1':u.hostname,port:u.port,path:u.pathname+u.search,headers:{...headers,Host:u.host},
   checkServerIdentity:(_host,cert)=>tls.checkServerIdentity(u.hostname,cert)},res=>{
   const chunks=[];let size=0;res.on('data',b=>{size+=b.length;if(size>4*1024*1024)req.destroy(Error('Response too large'));else chunks.push(b);});
   res.on('end',()=>resolve({status:res.statusCode,bytes:Buffer.concat(chunks)}));
  });req.setTimeout(10000,()=>req.destroy(Error('Readiness timeout')));req.on('error',reject);
 });
 assert.equal((await get(c.origin+'/api/fleet/summary')).status,401);
 for(const f of m.files.filter(f=>f.file.startsWith('fleet/'))){
  const r=await get(c.origin+'/'+f.file.slice(6));assert.equal(r.status,200);
  assert.equal(digest(r.bytes),updated?f.after:f.before);
 }
 const sites=[];
 for(const collector of c.collectors){
  const w=c.workspaces.find(w=>w.siteId===collector.siteId);assert(w);
  const r=await get(collector.url,{authorization:'Bearer '+collector.token});assert.equal(r.status,200);
  const d=JSON.parse(r.bytes);assert.equal(d.siteId,collector.siteId);assert.equal(d.stationCode,collector.stationCode);assert.equal(d.stale,false);
  assert(Date.now()-Date.parse(d.observedAt)<60000,'Collector snapshot stale');
  for(const f of m.files.filter(f=>f.file.startsWith('site/'))){
   const asset=await get(new URL(collector.url).origin+'/api/fleet/workspace/'+f.file.slice(5),{authorization:'Bearer '+w.token});
   assert.equal(asset.status,200);assert.equal(digest(asset.bytes),updated?f.after:f.before);
  }
  sites.push({siteId:d.siteId,observedAt:d.observedAt});
 }
 return {sites,uiHashesVerified:true,anonymousTelemetryDenied:true};
}
async function healthy(updated){
 let last;
 for(let attempt=0;attempt<12;attempt++){
  try{
   assert.equal(prop('prizm-fleet','ActiveState'),'active');
   const remote={};for(const p of ['/','/mobile/','/fleet','/fleet/','/mobile/api/fleet/summary'])remote[p]=await socketRead(p);
   assert.equal(remote['/mobile/'].status,200);assert.equal(remote['/mobile/api/fleet/summary'].status,401);
   assert.equal(remote['/fleet'].status,403);assert.equal(remote['/fleet/'].status,403);
   return {...JSON.parse(run('ip',['netns','exec','prizm-fleet','/usr/bin/node',backup+'/deploy.mjs','--probe',updated?'new':'old'],{env:{...process.env,NODE_EXTRA_CA_CERTS:'/etc/prizm-fleet/fleet/ca-cert.pem'}})),remote};
  }catch(e){last=e;console.log('Waiting for protected UI readiness…');await new Promise(r=>setTimeout(r,2000));}
 }
 throw last;
}
async function rollback(state){
 for(const f of state.files){
  const dest=target(f.file),current=hash(dest);assert([f.before,f.after].includes(current),'File changed independently; stop');
  if(current!==f.before)atomic(dest,fs.readFileSync(backup+'/original/'+f.file),f.owner);
 }
 run('systemctl',['restart','prizm-fleet']);await healthy(false);
 assert.deepEqual(invariants(),state.before);state.rolledBack=true;save(state);
 console.log('BPC display rollback complete. Previous UI restored; collectors unchanged.');
}
async function apply(){
 assert(!fs.existsSync(backup),'Existing checkpoint: inspect report; use rollback if needed');
 const m=manifest(stage),before=invariants();assert.equal(before.fleet.cwd,path.dirname(roots.fleet));
 assert(Object.values(before.collectors).every(s=>s.active==='active'&&s.pid!=='0'));
 // Load and verify everything before any production write.
 const files=m.files.map(f=>{const dest=target(f.file),owner=regular(dest);regular(stage+'/'+f.file);
  assert.equal(hash(dest),f.before,'Deployed baseline changed: '+f.file);
  const next=fs.readFileSync(stage+'/'+f.file);assert.equal(digest(next),f.after);assert.equal(next.length,f.bytes);
  return {...f,owner:{uid:owner.uid,gid:owner.gid,mode:owner.mode},next,original:fs.readFileSync(dest)};});
 fs.mkdirSync(backup,{mode:0o700});
 fs.copyFileSync(fileURLToPath(import.meta.url),backup+'/deploy.mjs');fs.copyFileSync(stage+'/manifest.json',backup+'/manifest.json');
 for(const f of files){const file=backup+'/original/'+f.file;fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file,f.original,{mode:0o600,flag:'wx'});}
 const state={before,files:files.map(({next,original,...f})=>f)};save(state);
 await healthy(false);assert.deepEqual(invariants(),before);
 try{
  for(const f of files)atomic(target(f.file),f.next,f.owner);
  run('systemctl',['restart','prizm-fleet']);
  state.checks=await healthy(true);assert.deepEqual(invariants(),before);
  state.completedAt=new Date().toISOString();save(state);
  console.log('BPC display deployment complete. Lists default collapsed on Fleet, mobile and both site workspaces. Sign in again if prompted. Collectors, navigation and controls unchanged.');
 }catch(e){await rollback(state);throw e;}
}
if(process.argv[2]==='--self-test'){
 assert.equal(target('site/assets/example.js'),roots.site+'/assets/example.js');
 for(const p of ['../etc/x','fleet/../x.js','fleet/assets/a/x.js','fleet/assets/x.cjs','other/assets/x.js'])assert.throws(()=>target(p));
 const dir=fs.mkdtempSync('/tmp/prizm-bpc-rollback-test-'),file=dir+'/test.css';fs.writeFileSync(file,'original');
 const owner=fs.statSync(file);atomic(file,Buffer.from('new'),owner);assert.equal(fs.readFileSync(file,'utf8'),'new');
 atomic(file,Buffer.from('original'),owner);assert.equal(fs.readFileSync(file,'utf8'),'original');
 console.log('PASS fixed path allowlist and atomic byte-exact restoration');
}else{
 assert.equal(process.getuid(),0,'Run with sudo');
 if(process.argv[2]==='--probe')console.log(JSON.stringify(await probe(process.argv[3]==='new')));
 else{
  assert(['apply','rollback'].includes(process.argv[2]));
  const lock='/run/prizm-bpc-collapse.lock',fd=fs.openSync(lock,'wx',0o600);
  try{if(process.argv[2]==='apply')await apply();else await rollback(JSON.parse(fs.readFileSync(backup+'/state.json')));}
  finally{fs.closeSync(fd);fs.unlinkSync(lock);}
 }
}
