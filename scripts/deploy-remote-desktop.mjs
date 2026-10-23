/** Fixed Fleet-only release; existing tunnel/identity/accounts/collectors unchanged. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import https from 'node:https';
import tls from 'node:tls';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const prior='/opt/prizm-fleet/releases/remote-20261019';
const release='/opt/prizm-fleet/releases/remote-desktop-20261019';
const backup='/var/lib/prizm-fleet/remote-desktop-20261019';
const archive='/home/ebc/prizm-remote-desktop-20261019.tgz';
const archiveHash='b3842b10b01da3a9e3bd70cb3daabd9e21784b0074068a14d51982a021c34344';
const override='/etc/systemd/system/prizm-fleet.service.d/zzzzzzzzzzzzzzz-desktop-20261019.conf';
const configuration='/etc/prizm-fleet/fleet/fleet.json';
const report='/home/ebc/prizm-remote-desktop-result.json';
const run=(command,args,extra={})=>execFileSync(command,args,{encoding:'utf8',timeout:90000,maxBuffer:8*1024*1024,...extra}).trim();
const prop=(service,key)=>run('systemctl',['show',service,'-p',key,'--value']);
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const text=`[Service]\nExecStart=\nExecStart=/usr/bin/node ${release}/dist/fleet-server.cjs\nWorkingDirectory=${release}\n`;
function save(file,data){fs.writeFileSync(file+'.new',JSON.stringify(data,null,2),{flag:'wx',mode:0o600});fs.renameSync(file+'.new',file);}
function invariants(){const c=JSON.parse(fs.readFileSync(configuration));return {hashes:Object.fromEntries([configuration,c.accountsFile,'/etc/prizm-fleet/ss3/export.json','/etc/prizm-fleet/ss4/export.json'].map(f=>[f,hash(f)])),collectors:Object.fromEntries(['prizm','prizm-site@ss4'].map(s=>[s,{pid:prop(s,'MainPID'),exec:prop(s,'ExecStart'),active:prop(s,'ActiveState')}]))};}
function archiveEntries(entries,types){assert(entries.length>4&&entries.length<500);assert.equal(new Set(entries).size,entries.length);assert(types.length===entries.length&&types.every(t=>t.startsWith('-')));assert(entries.every(e=>/^dist\/(?:fleet-server\.cjs|index\.html|mobile\.html|assets\/[A-Za-z0-9_.-]+\.(?:js|css|svg|woff2?))$/.test(e)));for(const f of ['fleet-server.cjs','index.html','mobile.html'])assert(entries.includes('dist/'+f));}
function checkArchive(file){assert(fs.lstatSync(file).isFile()&&!fs.lstatSync(file).isSymbolicLink());assert.equal(hash(file),archiveHash);archiveEntries(run('tar',['-tzf',file]).split('\n'),run('tar',['-tvzf',file]).split('\n'));}
async function probe(){
 const c=JSON.parse(fs.readFileSync(configuration)),sites=[];
 const read=(url,headers={})=>new Promise((resolve,reject)=>{const u=new URL(url),local=u.hostname==='10.0.0.15';const req=https.get({hostname:local?(!c.bindAddress||c.bindAddress==='0.0.0.0'?'127.0.0.1':c.bindAddress):u.hostname,port:u.port,path:u.pathname+u.search,headers:{...headers,Host:u.host},checkServerIdentity:(_host,cert)=>tls.checkServerIdentity(u.hostname,cert)},res=>{let body='';res.on('data',b=>{body+=b;if(body.length>64*1024*1024)req.destroy(Error('Response limit'));});res.on('end',()=>resolve({status:res.statusCode,body}));});req.setTimeout(15000,()=>req.destroy(Error('Read timeout')));req.on('error',reject);});
 assert.equal((await read(c.origin+'/api/fleet/summary')).status,401);
 assert.equal((await read(c.origin+'/mobile/')).status,200);
 for(const collector of c.collectors){
  const enrollment=c.workspaces.find(w=>w.siteId===collector.siteId);assert(enrollment);
  assert.equal((await read(enrollment.origin+'/api/fleet/workspace-context')).status,401);
  const summary=await read(collector.url,{authorization:'Bearer '+collector.token});assert.equal(summary.status,200);
  const data=JSON.parse(summary.body);assert.equal(data.siteId,collector.siteId);assert.equal(data.stationCode,collector.stationCode);assert.equal(data.stale,false);assert(Date.now()-Date.parse(data.observedAt)<60000);
  const base=new URL(collector.url).origin+'/api/fleet/workspace';
  for(const p of ['/api/local/site-data/snapshot?view=overview','/api/local/site-data/pcs','/api/local/site-data/analytics','/api/local/site-data/cells?metric=millivolts','/api/local/topology/active']){
   const r=await read(base+p,{authorization:'Bearer '+enrollment.token});assert.equal(r.status,200,collector.siteId+' read '+p);
   const parsed=JSON.parse(r.body);if(p.includes('snapshot?')){assert.equal(parsed.siteIdentity.stationCode,collector.stationCode);assert.equal(parsed.siteIdentity.blockIndex,collector.blockIndex);}
  }
  sites.push({siteId:collector.siteId,station:collector.stationCode,observedAt:data.observedAt,desktopReadEndpoints:true});
 }
 return {sites,localSessionsProtected:true};
}
async function remoteDenied(){return new Promise((resolve,reject)=>{const r=http.get({socketPath:'/run/prizm-remote/mobile.sock',path:'/desktop/ss3/',headers:{Host:'prizm.greenergyresources.org'}},s=>{s.resume();s.on('end',()=>resolve(s.statusCode));});r.setTimeout(5000,()=>r.destroy(Error('Socket timeout')));r.on('error',reject);});}
async function healthy(){const end=Date.now()+90000;do{try{assert.equal(prop('prizm-fleet','ActiveState'),'active');assert.equal(await remoteDenied(),403);return JSON.parse(run('ip',['netns','exec','prizm-fleet','/usr/bin/node',backup+'/deploy.mjs','--probe'],{env:{...process.env,NODE_EXTRA_CA_CERTS:'/etc/prizm-fleet/fleet/ca-cert.pem'},timeout:60000}));}catch{console.log('Waiting for Fleet and read-only site verification…');await new Promise(r=>setTimeout(r,3000));}}while(Date.now()<end);throw Error('Verification failed');}
function publishReport(state){save(report,{completedAt:state.completedAt??null,rolledBack:state.rolledBack??false,checks:state.checks??null});const owner=fs.statSync('/home/ebc');fs.chownSync(report,owner.uid,owner.gid);}
async function rollback(state){if(state.changed){assert.equal(fs.readFileSync(override,'utf8'),text);fs.unlinkSync(override);run('systemctl',['daemon-reload']);run('systemctl',['restart','prizm-fleet']);await healthy();}assert.deepEqual(invariants(),state.before);state.rolledBack=true;save(backup+'/state.json',state);publishReport(state);console.log('Previous Fleet restored; collectors unchanged.');}
async function apply(){
 assert(!fs.existsSync(backup)&&!fs.existsSync(release)&&!fs.existsSync(override),'Already staged; inspect state before retry');checkArchive(archive);
 assert.equal(prop('prizm-fleet','WorkingDirectory'),prior);assert(prop('prizm-fleet','ExecStart').includes(prior+'/dist/fleet-server.cjs'));
 const before=invariants();assert(Object.values(before.collectors).every(c=>c.active==='active'&&c.pid!=='0'));
 fs.mkdirSync(backup,{mode:0o700});fs.copyFileSync(fileURLToPath(import.meta.url),backup+'/deploy.mjs',fs.constants.COPYFILE_EXCL);fs.chmodSync(backup+'/deploy.mjs',0o600);
 fs.copyFileSync(archive,backup+'/release.tgz',fs.constants.COPYFILE_EXCL);checkArchive(backup+'/release.tgz');
 const state={before,changed:false};save(backup+'/state.json',state);await healthy();
 fs.mkdirSync(release,{mode:0o755});fs.cpSync(prior+'/dist',release+'/dist',{recursive:true});
 run('tar',['--no-same-owner','--no-same-permissions','-xzf',backup+'/release.tgz','-C',release]);
 fs.symlinkSync('/opt/prizm-fleet/releases/workspaces-20261001/node_modules',release+'/node_modules');run('/usr/bin/node',['--check',release+'/dist/fleet-server.cjs']);
 try{assert.deepEqual(invariants(),before);state.changed=true;save(backup+'/state.json',state);fs.writeFileSync(override,text,{flag:'wx',mode:0o644});run('systemctl',['daemon-reload']);run('systemctl',['restart','prizm-fleet']);state.checks=await healthy();assert.deepEqual(invariants(),before);state.completedAt=new Date().toISOString();save(backup+'/state.json',state);publishReport(state);console.log('Remote desktop deployment complete. Sign in at https://prizm.greenergyresources.org/ and select Full PRIZM. Both collectors and equipment settings unchanged.');}catch(e){await rollback(state);throw e;}
}
if(process.argv[2]==='--self-test'){
 const entries=['dist/fleet-server.cjs','dist/index.html','dist/mobile.html','dist/assets/a.js','dist/assets/b.css'];archiveEntries(entries,entries.map(()=>'- file'));
 for(const bad of ['../etc/passwd','dist/../secret','dist/server.cjs','dist/assets/a/../b.js'])assert.throws(()=>archiveEntries([...entries,bad],[...entries,bad].map(()=>'- file')));
 assert.throws(()=>archiveEntries(entries,entries.map(()=> 'l link')));console.log('PASS archive scope, links and traversal denial');
}else if(process.argv[2]==='--check-archive'){checkArchive(process.argv[3]??archive);console.log('PASS archive checksum and scope');}
else{assert.equal(process.getuid(),0,'Run with sudo');if(process.argv[2]==='--probe')console.log(JSON.stringify(await probe()));else{assert(['apply','rollback'].includes(process.argv[2]));const lock='/run/prizm-remote-desktop.lock',fd=fs.openSync(lock,'wx',0o600);try{if(process.argv[2]==='apply')await apply();else await rollback(JSON.parse(fs.readFileSync(backup+'/state.json')));}finally{fs.closeSync(fd);fs.unlinkSync(lock);}}}
