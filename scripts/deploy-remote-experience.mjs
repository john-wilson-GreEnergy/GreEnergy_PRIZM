/** Fleet presentation/routing only. No collector restart, account, tunnel,
 * Cloudflare, network, or equipment configuration changes. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const prior='/opt/prizm-fleet/releases/remote-password-20261020';
const release='/opt/prizm-fleet/releases/remote-experience-20261020';
const backup='/var/lib/prizm-fleet/remote-experience-20261020';
const archive='/home/ebc/prizm-remote-experience-20261020.tgz';
const archiveHash='de55a6ee32e40b7678850dfe79386f58695ea71303c1f1f6952499db76dcb1c8';
const override='/etc/systemd/system/prizm-fleet.service.d/zzzzzzzzzzzzzzzzz-experience-20261020.conf';
const configuration='/etc/prizm-fleet/fleet/fleet.json';
const remoteConfig='/etc/prizm-fleet/fleet/remote.json';
const report='/home/ebc/prizm-remote-experience-result.json';
const run=(cmd,args,extra={})=>execFileSync(cmd,args,{encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,...extra}).trim();
const prop=(unit,key)=>run('systemctl',['show',unit,'-p',key,'--value']);
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const text=`[Service]\nExecStart=\nExecStart=/usr/bin/node ${release}/dist/fleet-server.cjs\nWorkingDirectory=${release}\n`;
function replace(file,bytes,owner){
 const temp=file+'.new';fs.writeFileSync(temp,bytes,{flag:'wx',mode:0o600});
 if(owner)fs.chownSync(temp,owner.uid,owner.gid);fs.renameSync(temp,file);
}
const save=(file,data,owner)=>replace(file,JSON.stringify(data,null,2),owner);
function nextConfig(original){
 const c=JSON.parse(original);
 assert.equal(c.origin,'https://prizm.greenergyresources.org');
 assert.equal(c.socketPath,'/run/prizm-remote/mobile.sock');
 assert.equal(c.authentication,'password','Preserve the current PRIZM password-only login');
 assert(c.experience===undefined||c.experience==='mobile');
 return {...c,experience:'adaptive'};
}
function treeHashes(dir){
 return Object.fromEntries(fs.readdirSync(dir,{recursive:true}).sort().filter(p=>fs.lstatSync(dir+'/'+p).isFile()).map(p=>[p,hash(dir+'/'+p)]));
}
function invariants(){
 const c=JSON.parse(fs.readFileSync(configuration));
 return {
  hashes:Object.fromEntries([configuration,c.accountsFile,'/etc/prizm-fleet/ss3/export.json','/etc/prizm-fleet/ss4/export.json'].map(f=>[f,hash(f)])),
  // Retain both the current BPC-patched Fleet rollback and LAN workspace files.
  prior:treeHashes(prior+'/dist'),
  lan:treeHashes('/opt/prizm-fleet/releases/site-analytics-20261019/dist'),
  services:Object.fromEntries(['prizm','prizm-site@ss4','prizm-remote-tunnel'].map(s=>[s,{pid:prop(s,'MainPID'),exec:prop(s,'ExecStart'),active:prop(s,'ActiveState')}]))
 };
}
function archiveEntries(entries,types){
 assert(entries.length>5&&entries.length<500);assert.equal(new Set(entries).size,entries.length);
 assert(types.length===entries.length&&types.every(t=>t.startsWith('-')),'Regular files only');
 assert(entries.every(e=>/^dist\/(?:fleet-server\.cjs|index\.html|fleet\.html|mobile\.html|assets\/[A-Za-z0-9_.-]+\.(?:js|css|svg|woff2?))$/.test(e)));
 for(const f of ['fleet-server.cjs','index.html','fleet.html','mobile.html'])assert(entries.includes('dist/'+f));
}
function checkArchive(file){
 const st=fs.lstatSync(file);assert(st.isFile()&&!st.isSymbolicLink());
 assert(st.size>100000&&st.size<30*1024*1024);assert.equal(hash(file),archiveHash);
 archiveEntries(run('tar',['-tzf',file]).split('\n'),run('tar',['-tvzf',file]).split('\n'));
}
function socketRead(path,headers={}){
 return new Promise((resolve,reject)=>{
  const req=http.get({socketPath:'/run/prizm-remote/mobile.sock',path,headers:{Host:'prizm.greenergyresources.org',...headers}},res=>{
   let body='';res.on('data',b=>{body+=b;if(body.length>4*1024*1024)req.destroy(Error('Response limit'));});
   res.on('end',()=>resolve({status:res.statusCode,body,location:res.headers.location}));
  });req.setTimeout(5000,()=>req.destroy(Error('Socket timeout')));req.on('error',reject);
 });
}
async function probe(){
 const c=JSON.parse(fs.readFileSync(configuration)),sites=[];
 const read=(url,headers={})=>new Promise((resolve,reject)=>{
  const u=new URL(url),local=u.hostname==='10.0.0.15';
  const req=https.get({hostname:local?(!c.bindAddress||c.bindAddress==='0.0.0.0'?'127.0.0.1':c.bindAddress):u.hostname,port:u.port,path:u.pathname+u.search,headers:{...headers,Host:u.host},
   checkServerIdentity:(_host,cert)=>tls.checkServerIdentity(u.hostname,cert)},res=>{
   let body='';res.on('data',b=>{body+=b;if(body.length>8*1024*1024)req.destroy(Error('Response limit'));});
   res.on('end',()=>resolve({status:res.statusCode,body}));
  });req.setTimeout(10000,()=>req.destroy(Error('HTTPS timeout')));req.on('error',reject);
 });
 assert.equal((await read(c.origin+'/api/fleet/summary')).status,401);
 assert.equal((await read(c.origin+'/mobile/')).status,200);
 for(const collector of c.collectors){
  const workspace=c.workspaces.find(w=>w.siteId===collector.siteId);assert(workspace);
  assert.equal((await read(workspace.origin+'/api/fleet/workspace-context')).status,401);
  const r=await read(collector.url,{authorization:'Bearer '+collector.token});assert.equal(r.status,200);
  const data=JSON.parse(r.body);assert.equal(data.siteId,collector.siteId);assert.equal(data.stationCode,collector.stationCode);
  assert.equal(data.stale,false);assert(Date.now()-Date.parse(data.observedAt)<60000);
  sites.push({siteId:collector.siteId,observedAt:data.observedAt});
 }
 return {sites,localSessionsProtected:true};
}
async function remoteChecks(adaptive){
 const routes={};
 for(const [path,status,location] of adaptive?
  [['/',302,'/fleet/'],['/fleet',302,'/fleet/'],['/mobile',302,'/mobile/'],['/fleet/',200],['/mobile/',200]]:
  [['/',302,'/mobile/'],['/fleet',403],['/fleet/',403],['/mobile/',200]]){
  const r=await socketRead(path);assert.equal(r.status,status,path);if(location)assert.equal(r.location,location,path);
  if(adaptive&&status===200)assert.match(r.body,/data-prizm-adaptive="true"/);
  routes[path]={status:r.status,location:r.location??null};
 }
 const navigation={'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'};
 for(const entry of adaptive?['/fleet/','/mobile/']:['/mobile/'])assert.equal((await socketRead(entry,navigation)).status,200);
 for(const entry of adaptive?['/fleet','/mobile']:['/mobile']){
  for(const api of ['/api/fleet/session','/api/fleet/summary'])assert.equal((await socketRead(entry+api)).status,401);
  assert.equal((await socketRead(entry+'/api/fleet/summary',navigation)).status,403);
  assert.equal((await socketRead(entry+'/api/fleet/admin/users')).status,403);
 }
 for(const site of ['solar-star-3','solar-star-4']){
  const r=await socketRead('/desktop/'+site+'/');assert.equal(r.status,303);assert.equal(r.location,adaptive?'/fleet/':'/mobile/');
  assert.equal((await socketRead('/desktop/'+site+'/api/fleet/workspace-context')).status,401);
 }
 return routes;
}
async function healthy(adaptive){
 const until=Date.now()+90000;
 do{try{
  assert.equal(prop('prizm-fleet','ActiveState'),'active');
  const remote=await remoteChecks(adaptive);
  return {...JSON.parse(run('ip',['netns','exec','prizm-fleet','/usr/bin/node',backup+'/deploy.mjs','--probe'],{env:{...process.env,NODE_EXTRA_CA_CERTS:'/etc/prizm-fleet/fleet/ca-cert.pem'}})),remote,anonymousTelemetryDenied:true};
 }catch{console.log('Waiting for Fleet readiness and protected route checks…');await new Promise(r=>setTimeout(r,3000));}}while(Date.now()<until);
 throw Error('Fleet readiness verification failed');
}
function publish(state){
 save(report,{completedAt:state.completedAt??null,rolledBack:state.rolledBack??false,checks:state.checks??null,
  scope:'Remote desktop/mobile presentation and Fleet routing',collectorsRestarted:false,networkChanged:false,
  authentication:'password',remoteReadOnly:true,publicSignInAcceptancePending:true},fs.statSync('/home/ebc'));
}
async function rollback(state){
 if(state.changed){
  assert([state.oldRemoteHash,state.newRemoteHash].includes(hash(remoteConfig)),'Remote config changed independently');
  if(fs.existsSync(override)){assert.equal(fs.readFileSync(override,'utf8'),text);fs.unlinkSync(override);}
  replace(remoteConfig,fs.readFileSync(backup+'/remote.json'),state.owner);
  run('systemctl',['daemon-reload']);run('systemctl',['restart','prizm-fleet']);await healthy(false);
 }
 assert.equal(prop('prizm-fleet','WorkingDirectory'),prior);
 assert.equal(hash(remoteConfig),state.oldRemoteHash);assert.deepEqual(invariants(),state.before);
 state.rolledBack=true;save(backup+'/state.json',state);publish(state);
 console.log('Previous Fleet restored, including collapsed BPC lists and password-only login. Collectors unchanged.');
}
async function apply(){
 assert(!fs.existsSync(backup)&&!fs.existsSync(release)&&!fs.existsSync(override),'Existing deployment state; inspect before retry');
 checkArchive(archive);assert.equal(prop('prizm-fleet','WorkingDirectory'),prior);
 const before=invariants();assert(Object.values(before.services).every(s=>s.active==='active'&&s.pid!=='0'));
 const st=fs.lstatSync(remoteConfig);assert(st.isFile()&&!st.isSymbolicLink()&&(st.mode&0o777)===0o600);
 const old=fs.readFileSync(remoteConfig),next=JSON.stringify(nextConfig(old),null,2);
 fs.mkdirSync(backup,{mode:0o700});
 fs.copyFileSync(fileURLToPath(import.meta.url),backup+'/deploy.mjs',fs.constants.COPYFILE_EXCL);
 fs.chmodSync(backup+'/deploy.mjs',0o600);
 fs.writeFileSync(backup+'/remote.json',old,{flag:'wx',mode:0o600});
 fs.copyFileSync(archive,backup+'/release.tgz',fs.constants.COPYFILE_EXCL);checkArchive(backup+'/release.tgz');
 const state={before,changed:false,owner:{uid:st.uid,gid:st.gid},oldRemoteHash:hash(remoteConfig),newRemoteHash:createHash('sha256').update(next).digest('hex')};
 save(backup+'/state.json',state);await healthy(false);
 fs.mkdirSync(release,{mode:0o755});fs.cpSync(prior+'/dist',release+'/dist',{recursive:true});
 run('tar',['--no-same-owner','--no-same-permissions','-xzf',backup+'/release.tgz','-C',release]);
 fs.symlinkSync('/opt/prizm-fleet/releases/workspaces-20261001/node_modules',release+'/node_modules');
 run('/usr/bin/node',['--check',release+'/dist/fleet-server.cjs']);
 const expectedFiles=run('tar',['-tzf',backup+'/release.tgz']).split('\n');
 state.releaseHashes=Object.fromEntries(expectedFiles.map(p=>[p,hash(release+'/'+p)]));save(backup+'/state.json',state);
 try{
  assert.deepEqual(invariants(),before);assert.equal(hash(remoteConfig),state.oldRemoteHash);
  state.changed=true;save(backup+'/state.json',state);replace(remoteConfig,next,state.owner);
  fs.writeFileSync(override,text,{flag:'wx',mode:0o644});run('systemctl',['daemon-reload']);run('systemctl',['restart','prizm-fleet']);
  assert.equal(prop('prizm-fleet','WorkingDirectory'),release);
  state.checks=await healthy(true);assert.deepEqual(invariants(),before);assert.equal(hash(remoteConfig),state.newRemoteHash);
  for(const [p,digest] of Object.entries(state.releaseHashes))assert.equal(hash(release+'/'+p),digest);
  state.checks.releaseHashesVerified=true;state.completedAt=new Date().toISOString();save(backup+'/state.json',state);publish(state);
  console.log('Remote experience deployment complete. Sign in again on PC and phone for final acceptance. Both collectors, LAN controls and equipment settings unchanged.');
 }catch(e){await rollback(state);throw e;}
}
if(process.argv[2]==='--self-test'){
 const c={origin:'https://prizm.greenergyresources.org',socketPath:'/run/prizm-remote/mobile.sock',authentication:'password',extra:'retain'};
 assert.deepEqual(nextConfig(JSON.stringify(c)),{...c,experience:'adaptive'});
 for(const bad of [{...c,authentication:'cloudflare'},{...c,origin:'https://other.test'},{...c,socketPath:'/tmp/socket'},{...c,experience:'unexpected'}])assert.throws(()=>nextConfig(JSON.stringify(bad)));
 const entries=['dist/fleet-server.cjs','dist/index.html','dist/fleet.html','dist/mobile.html','dist/assets/a.js','dist/assets/b.css'];
 archiveEntries(entries,entries.map(()=>'- file'));
 for(const bad of ['../etc/passwd','dist/server.cjs','dist/assets/../secret','dist/config.json'])assert.throws(()=>archiveEntries([...entries,bad],[...entries,bad].map(()=>'- file')));
 assert.throws(()=>archiveEntries(entries,entries.map(()=>'l link')));
 console.log('PASS deployment scope, archive paths/types, exact origin/socket, authentication preservation');
}else if(process.argv[2]==='--check-archive'){checkArchive(process.argv[3]??archive);console.log('PASS release checksum and scope');}
else{
 assert.equal(process.getuid(),0,'Run with sudo');
 if(process.argv[2]==='--probe')console.log(JSON.stringify(await probe()));
 else{
  assert(['apply','rollback'].includes(process.argv[2]));
  const lock='/run/prizm-remote-experience.lock',fd=fs.openSync(lock,'wx',0o600);
  try{if(process.argv[2]==='apply')await apply();else await rollback(JSON.parse(fs.readFileSync(backup+'/state.json')));}
  finally{fs.closeSync(fd);fs.unlinkSync(lock);}
 }
}
