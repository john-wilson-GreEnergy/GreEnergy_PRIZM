/** Fixed-scope Dell remote-mobile preparation. No DNS/tunnel connection until
 * a separate, interactive connect step; no collector or equipment changes. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {request} from 'node:http';
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {parseTunnelToken,saveTunnelToken,remoteTunnelId} from './security/remoteTunnelToken.mjs';
import {release,remoteConfig,fleetOverride,keysService,keysTimer,tunnelService} from './security/remoteServiceTemplates.mjs';
const prior='/opt/prizm-fleet/releases/onboarding-20261019',backup='/var/lib/prizm-remote-deployment',archive='/home/ebc/prizm-remote-20261019.tgz';
const archiveHash='3437feb8852fb8420239c6ef06cb1a44ebed7f76b352c03e8c6c42f81d8e1a19';
const override='/etc/systemd/system/prizm-fleet.service.d/zzzzzzzzzzzzzz-remote-20261019.conf';
const configFile='/etc/prizm-fleet/fleet/fleet.json',report='/home/ebc/prizm-remote-result.json';
const units={'prizm-remote-keys.service':keysService,'prizm-remote-keys.timer':keysTimer,'prizm-remote-tunnel.service':tunnelService};
const ca='/etc/prizm-fleet/fleet/ca-cert.pem';
const run=(cmd,args,options={})=>execFileSync(cmd,args,{encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024,...options}).trim();
const exists=p=>{try{return fs.lstatSync(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const prop=(unit,p)=>run('systemctl',['show',unit,'-p',p,'--value']);
const uid=n=>Number(run('id',['-u',n])),gid=n=>Number(run('getent',['group',n]).split(':')[2]);
function save(file,data,owner){const t=file+'.new';fs.writeFileSync(t,JSON.stringify(data,null,2),{flag:'wx',mode:0o600});if(owner)fs.chownSync(t,owner.uid,owner.gid);fs.renameSync(t,file);}
function reportState(state){save(report,{preparedAt:state.preparedAt??null,rolledBack:state.rolledBack??false,tunnelConnected:false,checks:state.checks??null},fs.statSync('/home/ebc'));}
function snapshots(){const config=JSON.parse(fs.readFileSync(configFile));return {hashes:Object.fromEntries([configFile,config.accountsFile,'/etc/prizm-fleet/ss3/export.json','/etc/prizm-fleet/ss4/export.json'].map(p=>[p,hash(p)])),collectors:Object.fromEntries(['prizm','prizm-site@ss4'].map(s=>[s,{pid:prop(s,'MainPID'),exec:prop(s,'ExecStart'),state:prop(s,'ActiveState')}]))};}
function checkArchive(file=archive){assert(exists(file)?.isFile()&&!exists(file).isSymbolicLink());assert.equal(hash(file),archiveHash);const names=run('tar',['-tzf',file]).split('\n');assert.deepEqual([...names].sort(),['fleet-server.cjs','enable-remote-owner.cjs','refreshRemoteKeys.mjs'].sort());assert(run('tar',['-tvzf',file]).split('\n').every(l=>l.startsWith('-')));}
function newText(file,text,mode=0o644){fs.writeFileSync(file,text,{flag:'wx',mode});}
function removeOwned(file,text){if(!exists(file))return;assert(exists(file).isFile()&&!exists(file).isSymbolicLink());assert.equal(fs.readFileSync(file,'utf8'),text);fs.unlinkSync(file);}
function account(name,group){assert(!exists('/home/'+name));run('useradd',['--system','--no-create-home','--home-dir','/nonexistent','--shell','/usr/sbin/nologin','--gid',group,name]);}
async function socketProbe(){return await new Promise((resolve,reject)=>{const req=request({socketPath:'/run/prizm-remote/mobile.sock',method:'GET',path:'/mobile/',headers:{Host:'prizm.greenergyresources.org'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.setTimeout(4000,()=>req.destroy(Error('Timeout')));req.on('error',reject);req.end();});}
function localCheck(){return JSON.parse(run('ip',['netns','exec','prizm-fleet','/usr/bin/node','/var/lib/prizm-fleet/onboarding-20261019/deploy.mjs','--probe','updated'],{env:{...process.env,NODE_EXTRA_CA_CERTS:ca},timeout:45000}));}
async function ready(remote){const end=Date.now()+90000;do{try{assert.equal(prop('prizm-fleet','ActiveState'),'active');const checks=localCheck();if(remote){assert.equal(await socketProbe(),403);const s=fs.lstatSync('/run/prizm-remote/mobile.sock');assert.equal(s.mode&0o777,0o660);assert.equal(s.uid,uid('prizm-fleet'));assert.equal(s.gid,gid('prizm-remote'));}return {...checks,remoteDeniesAnonymous:remote};}catch{console.log('Waiting for Fleet and fresh cached site data…');await new Promise(r=>setTimeout(r,3000));}}while(Date.now()<end);throw Error('Fleet health validation did not pass');}
async function installCloudflared(){
 if(exists('/usr/bin/cloudflared')){assert.match(run('/usr/bin/cloudflared',['tunnel','run','--help']),/token-file/);return;}
 const key='/usr/share/keyrings/prizm-cloudflare.gpg',repo='/etc/apt/sources.list.d/prizm-cloudflared.list';assert(!exists(key)&&!exists(repo),'Review existing package source first');
 const r=await fetch('https://pkg.cloudflare.com/cloudflare-main.gpg',{redirect:'error',signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);const body=Buffer.from(await r.arrayBuffer());assert(body.length>100&&body.length<65536);fs.writeFileSync(key,body,{flag:'wx',mode:0o644});
 newText(repo,'deb [signed-by='+key+'] https://pkg.cloudflare.com/cloudflared any main\n');
 const source=['-o','Dir::Etc::sourcelist='+repo,'-o','Dir::Etc::sourceparts=-'];
 run('apt-get',[...source,'update'],{timeout:180000});run('apt-get',[...source,'install','--no-install-recommends','-y','cloudflared'],{timeout:180000,env:{...process.env,DEBIAN_FRONTEND:'noninteractive',NEEDRESTART_MODE:'l'}});
 assert.match(run('/usr/bin/cloudflared',['tunnel','run','--help']),/token-file/);
}
function checkNetworkBoundary(){
 // Establish that this is reachable from the host, then prove the connector's
 // cgroup cannot connect. No HTTP request or equipment command is sent.
 const connect="const n=require('node:net');let s=n.connect(3443,'10.0.0.15');s.setTimeout(2500);s.on('connect',()=>{s.destroy();process.exit(0)});s.on('error',()=>process.exit(1));s.on('timeout',()=>process.exit(1));";
 run('/usr/bin/node',['-e',connect]);
 const blocked="const n=require('node:net');let s=n.connect(3443,'10.0.0.15');s.setTimeout(2500);s.on('connect',()=>{s.destroy();process.exit(1)});s.on('error',()=>process.exit(0));s.on('timeout',()=>{s.destroy();process.exit(0)});";
 run('systemd-run',['--quiet','--wait','--pipe','--collect','--unit=prizm-remote-isolation-check','-p','User=prizm-tunnel','-p','IPAddressDeny=any','-p','IPAddressAllow=127.0.0.53/32 198.41.192.0/24 198.41.200.0/24','/usr/bin/node','-e',blocked]);
}
async function rollback(state){
 const beforeRollback=snapshots();
 for(const u of ['prizm-remote-tunnel.service','prizm-remote-keys.timer'])run('systemctl',['disable','--now',u]);
 if(exists(override)){removeOwned(override,fleetOverride);run('systemctl',['daemon-reload']);run('systemctl',['restart','prizm-fleet']);await ready(false);}
 assert.deepEqual(snapshots(),beforeRollback);state.rolledBack=true;save(backup+'/state.json',state);reportState(state);console.log('Previous Fleet restored. Remote connector stopped; collectors/accounts unchanged. New package, inactive service files and backup retained.');
}
async function apply(){
 // All target paths are fixed; do not reuse existing identities/configuration.
 assert(!exists(backup)&&!exists(release)&&!exists(override)&&!exists(remoteConfig),'Already prepared; inspect report or rollback');checkArchive();
 assert(prop('prizm-fleet','ExecStart').includes(prior+'/dist/fleet-server.cjs'));assert.equal(prop('prizm-fleet','RuntimeDirectory'),'');assert.equal(prop('prizm-fleet','Group'),'prizm-fleet');
 assert(fs.readFileSync('/etc/resolv.conf','utf8').includes('nameserver 127.0.0.53'));
 for(const u of Object.keys(units))assert(!exists('/etc/systemd/system/'+u));
 for(const n of ['prizm-tunnel','prizm-keyfetch','prizm-remote'])for(const database of ['group','passwd']){let found=false;try{found=!!run('getent',[database,n]);}catch{}assert(!found,'Identity already exists: '+n);}
 assert(!exists('/etc/prizm-remote')&&!exists('/var/lib/prizm-remote-keys'));
 await ready(false);const state={before:snapshots(),changed:false};assert(Object.values(state.before.collectors).every(s=>s.state==='active'&&s.pid!=='0'));
 fs.mkdirSync(backup,{mode:0o700});save(backup+'/state.json',state);fs.copyFileSync(fileURLToPath(import.meta.url),backup+'/deploy.mjs');fs.chmodSync(backup+'/deploy.mjs',0o600);
 fs.copyFileSync(archive,backup+'/release.tgz');checkArchive(backup+'/release.tgz');
 fs.mkdirSync(release,{mode:0o755});fs.cpSync(prior+'/dist',release+'/dist',{recursive:true});fs.symlinkSync('/opt/prizm-fleet/releases/workspaces-20261001/node_modules',release+'/node_modules');
 const extracted=backup+'/unpacked';fs.mkdirSync(extracted,{mode:0o700});run('tar',['--no-same-owner','--no-same-permissions','-xzf',backup+'/release.tgz','-C',extracted]);
 fs.copyFileSync(extracted+'/fleet-server.cjs',release+'/dist/fleet-server.cjs');fs.copyFileSync(extracted+'/enable-remote-owner.cjs',release+'/enable-remote-owner.cjs');fs.copyFileSync(extracted+'/refreshRemoteKeys.mjs',release+'/refreshRemoteKeys.mjs');
 for(const f of ['dist/fleet-server.cjs','enable-remote-owner.cjs','refreshRemoteKeys.mjs']){fs.chmodSync(release+'/'+f,0o644);run('/usr/bin/node',['--check',release+'/'+f]);}
 await installCloudflared();
 run('groupadd',['--system','prizm-remote']);run('groupadd',['--system','prizm-keyfetch']);account('prizm-tunnel','prizm-remote');account('prizm-keyfetch','prizm-keyfetch');
 checkNetworkBoundary();
 fs.mkdirSync('/etc/prizm-remote',{mode:0o710});fs.chownSync('/etc/prizm-remote',0,gid('prizm-remote'));
 save(remoteConfig,{origin:'https://prizm.greenergyresources.org',issuer:'https://delicate-salad-7b96.cloudflareaccess.com',audience:'e37d620d43b216153a3e924d373e592947c478c1c22c536843a9197e9fea5192',keysFile:'/var/lib/prizm-remote-keys/keys.json',keysOwnerUid:uid('prizm-keyfetch'),socketPath:'/run/prizm-remote/mobile.sock'},{uid:uid('prizm-fleet'),gid:gid('prizm-fleet')});
 for(const [name,text]of Object.entries(units))newText('/etc/systemd/system/'+name,text);
 await finishPreparation(state);
}
async function finishPreparation(state){
 run('systemctl',['daemon-reload']);run('systemctl',['start','prizm-remote-keys.service']);const keys=JSON.parse(fs.readFileSync('/var/lib/prizm-remote-keys/keys.json'));assert(keys.keys.length>0&&Date.now()-keys.fetchedAt<60000);
 try{
  assert.deepEqual(snapshots(),state.before);newText(override,fleetOverride);state.changed=true;save(backup+'/state.json',state);run('systemctl',['daemon-reload']);run('systemctl',['restart','prizm-fleet']);state.checks=await ready(true);
  // Verify socket access as the tunnel identity, and denial of the account store.
  const socketTest="const fs=require('node:fs'),http=require('node:http');for(const p of ['/etc/prizm-fleet/fleet/fleet.json','/var/lib/prizm-fleet']){try{fs.accessSync(p,fs.constants.R_OK);process.exit(1);}catch{}}const r=http.get({socketPath:'/run/prizm-remote/mobile.sock',path:'/mobile/',headers:{Host:'prizm.greenergyresources.org'}},s=>{s.resume();s.on('end',()=>process.exit(s.statusCode===403?0:1))});r.on('error',()=>process.exit(1));r.setTimeout(4000,()=>process.exit(1));";
  run('runuser',['-u','prizm-tunnel','--','/usr/bin/node','-e',socketTest]);
  assert.deepEqual(snapshots(),state.before);run('systemctl',['enable','--now','prizm-remote-keys.timer']);
  state.preparedAt=new Date().toISOString();save(backup+'/state.json',state);reportState(state);
  console.log('Remote preparation complete. Mobile-only socket and key refresh verified. No tunnel connected. Collectors, equipment and account permissions unchanged.');
 }catch(e){await rollback(state);throw e;}
}
async function resume(){
 const state=JSON.parse(fs.readFileSync(backup+'/state.json'));assert(!state.changed&&!state.rolledBack&&!state.preparedAt);assert(!exists(override));assert(prop('prizm-fleet','ExecStart').includes(prior+'/dist/fleet-server.cjs'));checkArchive(backup+'/release.tgz');assert.deepEqual(snapshots(),state.before);
 for(const [source,target]of [['fleet-server.cjs','dist/fleet-server.cjs'],['enable-remote-owner.cjs','enable-remote-owner.cjs'],['refreshRemoteKeys.mjs','refreshRemoteKeys.mjs']])assert.equal(hash(backup+'/unpacked/'+source),hash(release+'/'+target));
 for(const [name,text]of Object.entries(units)){
  const file='/etc/systemd/system/'+name,current=fs.readFileSync(file,'utf8');
  if(current===text)continue;
  assert.equal(name,'prizm-remote-keys.service');assert.equal(current,text.replace(' -/run/prizm-remote',' /run/prizm-remote'));
  newText(file+'.new',text);fs.renameSync(file+'.new',file);
 }
 checkNetworkBoundary();await finishPreparation(state);
}
async function connect(){
 assert(process.stdin.isTTY&&process.stdout.isTTY,'Use a private interactive terminal');
 const state=JSON.parse(fs.readFileSync(backup+'/state.json'));assert(state.preparedAt&&!state.rolledBack,'Preparation must pass first');
 assert.equal(fs.readFileSync(override,'utf8'),fleetOverride);await ready(true);checkNetworkBoundary();
 const before=snapshots(),unit='/etc/systemd/system/prizm-remote-tunnel.service';
 const notifying=tunnelService.replace('[Service]\n','[Service]\nType=notify\nTimeoutStartSec=45\n');
 const current=fs.readFileSync(unit,'utf8');assert(current===tunnelService||current===notifying,'Unexpected connector service');
 assert.notEqual(prop('prizm-remote-tunnel','ActiveState'),'active','Already connected; verify Cloudflare status');
 const tokenFile='/etc/prizm-remote/tunnel.token',directory=fs.lstatSync('/etc/prizm-remote');
 assert(directory.isDirectory()&&!directory.isSymbolicLink()&&directory.uid===0&&(directory.mode&0o777)===0o710);
 assert.equal(directory.gid,gid('prizm-remote'));
 if(exists(tokenFile)){
  const s=fs.lstatSync(tokenFile);assert(s.isFile()&&!s.isSymbolicLink()&&s.uid===uid('prizm-tunnel')&&(s.mode&0o777)===0o600&&s.size<8192);
  parseTunnelToken(fs.readFileSync(tokenFile,'utf8'));console.log('Using the previously saved credential for this tunnel.');
 }else{
  const muted=new Writable({write(_chunk,_encoding,done){done();}}),prompt=createInterface({input:process.stdin,output:muted,terminal:true});
  let secret='';
  try{process.stdout.write('Paste the Cloudflare token or copied install command (hidden), then press Enter: ');secret=await prompt.question('');process.stdout.write('\n');}
  finally{prompt.close();}
  try{saveTunnelToken(tokenFile,parseTunnelToken(secret),{uid:uid('prizm-tunnel'),gid:gid('prizm-remote')});}finally{secret='';}
 }
 if(current!==notifying){newText(unit+'.new',notifying);fs.renameSync(unit+'.new',unit);}
 try{
  run('systemctl',['daemon-reload']);run('systemctl',['start','prizm-remote-tunnel'],{timeout:60000});
  assert.equal(prop('prizm-remote-tunnel','ActiveState'),'active');assert.equal(prop('prizm-remote-tunnel','Type'),'notify');
  assert.equal(await socketProbe(),403);assert.deepEqual(snapshots(),before);
  run('systemctl',['enable','prizm-remote-tunnel']);
  save('/home/ebc/prizm-remote-connect-result.json',{connectedAt:new Date().toISOString(),tunnelId:remoteTunnelId,edgeReady:true,hostnameAcceptancePending:true,collectorsUnchanged:true},fs.statSync('/home/ebc'));
  console.log('Tunnel connection complete. Cloudflare route and remote sign-in validation remain required. No collectors restarted or equipment settings changed.');
 }catch{
  run('systemctl',['disable','--now','prizm-remote-tunnel']);
  throw Error('Connector stopped after a failed check. Private token retained for retry; local Fleet and collectors were not restarted.');
 }
}
if(process.argv[2]==='--self-test'){
 assert(archiveHash!=='ARCHIVE_HASH_PENDING');assert(!fleetOverride.includes('NetworkNamespacePath'));assert(!fleetOverride.includes('prizm-site'));assert.match(tunnelService,/IPAddressDeny=any/);console.log('PASS remote deployment fixed scope');
}else if(process.argv[2]==='--check-archive'){checkArchive(process.argv[3]??archive);console.log('PASS remote archive');}
else{
 assert.equal(process.getuid(),0,'Run in the Dell console with sudo');
 const action=process.argv[2];assert(['apply','resume','rollback','enable-owner','connect'].includes(action),'Use apply, resume, rollback, enable-owner or connect');
 if(action==='apply')await apply();
 if(action==='resume')await resume();
 if(action==='rollback')await rollback(JSON.parse(fs.readFileSync(backup+'/state.json')));
 if(action==='enable-owner'){assert(exists('/run/prizm-remote/mobile.sock')?.isSocket());run('runuser',['-u','prizm-fleet','--','/usr/bin/node',release+'/enable-remote-owner.cjs'],{stdio:'inherit'});}
 if(action==='connect')await connect();
}
