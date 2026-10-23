/** Fleet-only authentication migration. Does not edit Cloudflare, accounts,
 * collector services, equipment settings, tunnel credentials or network rules. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import https from 'node:https';
import tls from 'node:tls';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const prior='/opt/prizm-fleet/releases/remote-desktop-20261019';
const release='/opt/prizm-fleet/releases/remote-password-20261020';
const backup='/var/lib/prizm-fleet/remote-password-20261020';
const artifact='/home/ebc/prizm-remote-password-20261020.cjs';
const artifactHash='e71a90505789786370ac4a28eb59a6f7182235e9b583b8479065c46fd8d825f8';
const override='/etc/systemd/system/prizm-fleet.service.d/zzzzzzzzzzzzzzzz-password-20261020.conf';
const configuration='/etc/prizm-fleet/fleet/fleet.json';
const remoteConfig='/etc/prizm-fleet/fleet/remote.json';
const report='/home/ebc/prizm-remote-password-result.json';
const run=(cmd,args,extra={})=>execFileSync(cmd,args,{encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024,...extra}).trim();
const prop=(unit,key)=>run('systemctl',['show',unit,'-p',key,'--value']);
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const text=`[Service]\nExecStart=\nExecStart=/usr/bin/node ${release}/dist/fleet-server.cjs\nWorkingDirectory=${release}\n`;
function replace(file,bytes,owner){
 const temp=file+'.new';
 fs.writeFileSync(temp,bytes,{flag:'wx',mode:0o600});
 if(owner)fs.chownSync(temp,owner.uid,owner.gid);
 fs.renameSync(temp,file);
}
const save=(file,data,owner)=>replace(file,JSON.stringify(data,null,2),owner);
function passwordConfig(original){
 const c=JSON.parse(original);
 assert.equal(c.origin,'https://prizm.greenergyresources.org');
 assert.equal(c.socketPath,'/run/prizm-remote/mobile.sock');
 assert(c.authentication===undefined||c.authentication==='cloudflare','Unexpected existing authentication mode');
 return {...c,authentication:'password'};
}
function invariants(){
 const c=JSON.parse(fs.readFileSync(configuration));
 return {
  hashes:Object.fromEntries([configuration,c.accountsFile,'/etc/prizm-fleet/ss3/export.json','/etc/prizm-fleet/ss4/export.json'].map(f=>[f,hash(f)])),
  services:Object.fromEntries(['prizm','prizm-site@ss4','prizm-remote-tunnel'].map(s=>[s,{pid:prop(s,'MainPID'),exec:prop(s,'ExecStart'),active:prop(s,'ActiveState')}]))
 };
}
function checkArtifact(file){
 const stat=fs.lstatSync(file);assert(stat.isFile()&&!stat.isSymbolicLink());
 assert.equal(hash(file),artifactHash);assert(stat.size>100000&&stat.size<10*1024*1024);
}
function socketRead(path,headers={}){
 return new Promise((resolve,reject)=>{
  const req=http.get({socketPath:'/run/prizm-remote/mobile.sock',path,headers:{Host:'prizm.greenergyresources.org',...headers}},res=>{
   let body='';res.on('data',b=>{body+=b;if(body.length>2*1024*1024)req.destroy(Error('Response limit'));});
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
   let body='';res.on('data',b=>{body+=b;if(body.length>4*1024*1024)req.destroy(Error('Response limit'));});
   res.on('end',()=>resolve({status:res.statusCode,body}));
  });req.setTimeout(10000,()=>req.destroy(Error('HTTPS timeout')));req.on('error',reject);
 });
 assert.equal((await read(c.origin+'/api/fleet/summary')).status,401);
 assert.equal((await read(c.origin+'/mobile/')).status,200);
 for(const collector of c.collectors){
  const workspace=c.workspaces.find(w=>w.siteId===collector.siteId);assert(workspace);
  assert.equal((await read(workspace.origin+'/api/fleet/workspace-context')).status,401);
  const r=await read(collector.url,{authorization:'Bearer '+collector.token});assert.equal(r.status,200);
  const data=JSON.parse(r.body);
  assert.equal(data.siteId,collector.siteId);assert.equal(data.stationCode,collector.stationCode);
  assert.equal(data.stale,false);assert(Date.now()-Date.parse(data.observedAt)<60000);
  sites.push({siteId:collector.siteId,station:collector.stationCode,observedAt:data.observedAt});
 }
 return {sites,localSessionsProtected:true};
}
async function healthy(mode){
 const until=Date.now()+90000;
 do{try{
  assert.equal(prop('prizm-fleet','ActiveState'),'active');
  if(mode==='password'){
   assert.equal((await socketRead('/mobile/')).status,200);
   assert.equal((await socketRead('/mobile/',{'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'})).status,200);
   for(const p of ['/mobile/api/fleet/session','/mobile/api/fleet/summary','/desktop/solar-star-3/api/fleet/workspace-context','/desktop/solar-star-4/api/local/site-data/pcs'])
    assert.equal((await socketRead(p)).status,401,p);
   for(const p of ['/api/fleet/admin/users','/mobile/api/fleet/admin/users','/desktop/solar-star-3/tools/controls/rotate'])
    assert([401,403].includes((await socketRead(p)).status),p);
   assert.equal((await socketRead('/mobile/api/fleet/summary',{'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'})).status,403);
  }else assert.equal((await socketRead('/mobile/')).status,403);
  return {...JSON.parse(run('ip',['netns','exec','prizm-fleet','/usr/bin/node',backup+'/deploy.mjs','--probe'],{env:{...process.env,NODE_EXTRA_CA_CERTS:'/etc/prizm-fleet/fleet/ca-cert.pem'}})),authentication:mode,anonymousTelemetryDenied:true};
 }catch{console.log('Waiting for Fleet readiness and protected data checks…');await new Promise(r=>setTimeout(r,3000));}}while(Date.now()<until);
 throw Error('Fleet readiness verification failed');
}
function publish(state){save(report,{completedAt:state.completedAt??null,rolledBack:state.rolledBack??false,checks:state.checks??null,cloudflareChanged:false,publicLoginAcceptancePending:true},fs.statSync('/home/ebc'));}
async function rollback(state){
 if(state.changed){
  const current=hash(remoteConfig);assert(current===state.oldRemoteHash||current===state.newRemoteHash,'Remote configuration changed independently; stop');
  if(fs.existsSync(override)){assert.equal(fs.readFileSync(override,'utf8'),text);fs.unlinkSync(override);}
  replace(remoteConfig,fs.readFileSync(backup+'/remote.json'),state.owner);
  run('systemctl',['daemon-reload']);run('systemctl',['restart','prizm-fleet']);await healthy('cloudflare');
 }
 assert.equal(hash(remoteConfig),state.oldRemoteHash);
 assert.deepEqual(invariants(),state.before);state.rolledBack=true;save(backup+'/state.json',state);publish(state);
 console.log('Previous Fleet and Cloudflare identity mode restored. Collectors unchanged. If an Access bypass was later enabled, remove it in Cloudflare before reopening remote access.');
}
async function apply(){
 assert(!fs.existsSync(backup)&&!fs.existsSync(release)&&!fs.existsSync(override),'Existing deployment state; inspect before retry');
 checkArtifact(artifact);assert.equal(prop('prizm-fleet','WorkingDirectory'),prior);
 const before=invariants();assert(Object.values(before.services).every(s=>s.active==='active'&&s.pid!=='0'));
 const st=fs.lstatSync(remoteConfig);assert(st.isFile()&&!st.isSymbolicLink()&&(st.mode&0o777)===0o600);
 const old=fs.readFileSync(remoteConfig),next=JSON.stringify(passwordConfig(old),null,2);
 fs.mkdirSync(backup,{mode:0o700});
 fs.copyFileSync(fileURLToPath(import.meta.url),backup+'/deploy.mjs',fs.constants.COPYFILE_EXCL);fs.chmodSync(backup+'/deploy.mjs',0o600);
 fs.writeFileSync(backup+'/remote.json',old,{flag:'wx',mode:0o600});
 fs.copyFileSync(artifact,backup+'/fleet-server.cjs',fs.constants.COPYFILE_EXCL);checkArtifact(backup+'/fleet-server.cjs');
 const state={before,changed:false,owner:{uid:st.uid,gid:st.gid},oldRemoteHash:hash(remoteConfig),newRemoteHash:createHash('sha256').update(next).digest('hex')};
 save(backup+'/state.json',state);await healthy('cloudflare');
 fs.mkdirSync(release,{mode:0o755});fs.cpSync(prior+'/dist',release+'/dist',{recursive:true});
 fs.copyFileSync(backup+'/fleet-server.cjs',release+'/dist/fleet-server.cjs');
 fs.chmodSync(release+'/dist/fleet-server.cjs',0o644);
 fs.symlinkSync('/opt/prizm-fleet/releases/workspaces-20261001/node_modules',release+'/node_modules');
 run('/usr/bin/node',['--check',release+'/dist/fleet-server.cjs']);
 try{
  assert.deepEqual(invariants(),before);assert.equal(hash(remoteConfig),state.oldRemoteHash);
  state.changed=true;save(backup+'/state.json',state);
  replace(remoteConfig,next,state.owner);fs.writeFileSync(override,text,{flag:'wx',mode:0o644});
  run('systemctl',['daemon-reload']);run('systemctl',['restart','prizm-fleet']);
  state.checks=await healthy('password');assert.deepEqual(invariants(),before);assert.equal(hash(remoteConfig),state.newRemoteHash);
  state.completedAt=new Date().toISOString();save(backup+'/state.json',state);publish(state);
  console.log('Remote password deployment complete. Cloudflare email verification is still unchanged; its final update and private sign-in test remain. No collectors or equipment settings changed.');
 }catch(e){await rollback(state);throw e;}
}
if(process.argv[2]==='--self-test'){
 const original={origin:'https://prizm.greenergyresources.org',socketPath:'/run/prizm-remote/mobile.sock',issuer:'retain',audience:'retain'};
 assert.deepEqual(passwordConfig(JSON.stringify(original)),{...original,authentication:'password'});
 for(const c of [{...original,origin:'https://other.test'},{...original,socketPath:'/tmp/other'},{...original,authentication:'unexpected'}])assert.throws(()=>passwordConfig(JSON.stringify(c)));
 assert.equal(JSON.parse(JSON.stringify(original)).authentication,undefined,'Backup preserves legacy default');
 console.log('PASS exact origin/socket/mode preconditions and configuration preservation');
}else if(process.argv[2]==='--check-artifact'){checkArtifact(process.argv[3]??artifact);console.log('PASS artifact checksum and file type');}
else{
 assert.equal(process.getuid(),0,'Run with sudo');
 if(process.argv[2]==='--probe')console.log(JSON.stringify(await probe()));
 else{
  assert(['apply','rollback'].includes(process.argv[2]));
  const lock='/run/prizm-remote-password.lock',fd=fs.openSync(lock,'wx',0o600);
  try{if(process.argv[2]==='apply')await apply();else await rollback(JSON.parse(fs.readFileSync(backup+'/state.json')));}
  finally{fs.closeSync(fd);fs.unlinkSync(lock);}
 }
}
