/** Fixed-target rollout. Reads storage status; never invokes cleanup or equipment routes. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import https from 'node:https';
import http from 'node:http';
import tls from 'node:tls';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const manifestHash='__MANIFEST_HASH__';
const priorFleet='/opt/prizm-fleet/releases/storage-display-20261021';
const priorCollector='/opt/prizm-fleet/releases/snapshot-retention-20261021';
const fleet='/opt/prizm-fleet/releases/storage-presence-20261021';
const collector='/opt/prizm-fleet/releases/storage-presence-collector-20261021';
const recovery='/opt/prizm-fleet/releases/storage-presence-recovery-20261021';
const stage='/home/ebc/prizm-storage-presence-20261021';
const backup='/var/lib/prizm-fleet/storage-presence-20261021';
const report='/home/ebc/prizm-storage-presence-result.json';
const configFile='/etc/prizm-fleet/fleet/fleet.json';
const suffix='z'.repeat(48)+'-storage-presence-20261021.conf';
const plans=[
 {unit:'prizm',site:'solar-star-3',station:'BHE0020',cwd:'/home/ebc/GreEnergy_PRIZM'},
 {unit:'prizm-site@ss4',site:'solar-star-4',station:'BHE0021',cwd:'/var/lib/prizm-sites/ss4'},
 {unit:'prizm-fleet',site:'fleet',cwd:fleet}
].map(p=>({...p,override:'/etc/systemd/system/'+p.unit+'.service.d/'+suffix}));
const hash=b=>createHash('sha256').update(b).digest('hex');
const fileHash=f=>hash(fs.readFileSync(f));
const json=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const run=(cmd,args,extra={})=>execFileSync(cmd,args,{encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,...extra}).trim();
const prop=(unit,key)=>run('systemctl',['show',unit,'-p',key,'--value']);
function tree(dir){const r={};for(const n of fs.readdirSync(dir).sort()){const f=dir+'/'+n,s=fs.lstatSync(f);assert(!s.isSymbolicLink());if(s.isDirectory())for(const[k,v]of Object.entries(tree(f)))r[n+'/'+k]=v;else{assert(s.isFile());r[n]=fileHash(f);}}return r;}
function same(a,b,label){assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)),label);}
function argv(unit){const m=/argv\[\]=([^;]+) ;/.exec(prop(unit,'ExecStart'));assert(m);return m[1];}
function entry(p,root,skip=false){return '/usr/bin/node '+root+'/dist/'+(p.site==='fleet'?'fleet-server.cjs':'server.cjs')+(skip?' --skip-startup-storage-cleanup':'');}
function overrideText(p,root,skip=false){return '[Service]\nExecStart=\nExecStart='+entry(p,root,skip)+'\n'+(p.site==='fleet'?'WorkingDirectory='+root+'\n':'');}
function invariants(){const c=json(configFile);return {
 configs:Object.fromEntries([configFile,c.accountsFile,'/etc/prizm-fleet/fleet/remote.json','/etc/prizm-fleet/ss3/export.json','/etc/prizm-fleet/ss4/export.json',...plans.filter(p=>p.site!=='fleet').map(p=>p.cwd+'/data/prizm_storage_policy.json')].map(f=>[f,fileHash(f)])),
 environments:Object.fromEntries(plans.map(p=>[p.unit,hash(prop(p.unit,'Environment'))])),
 workerLinks:plans.filter(p=>p.site!=='fleet').map(p=>[p.cwd,fs.readlinkSync(p.cwd+'/dist')]),
 tunnel:{pid:prop('prizm-remote-tunnel','MainPID'),active:prop('prizm-remote-tunnel','ActiveState'),argv:argv('prizm-remote-tunnel'),environment:hash(prop('prizm-remote-tunnel','Environment'))}
};}
function save(s){fs.writeFileSync(backup+'/state.tmp',JSON.stringify(s,null,2),{mode:0o600});fs.renameSync(backup+'/state.tmp',backup+'/state.json');
 fs.writeFileSync(report,JSON.stringify({completedAt:s.completedAt??null,rolledBack:s.rolledBack??false,error:s.error??null,rollbackErrors:s.rollbackErrors??[],checks:s.checks??{},scope:'Storage folder presence',startupCleanupSkipped:true,scheduledCleanupPolicyChanged:false,latencySettingsChanged:false,permissionsChanged:false,equipmentCommandsSent:false,browserAcceptancePending:true},null,2),{mode:0o600});const u=fs.statSync('/home/ebc');fs.chownSync(report,u.uid,u.gid);}
function read(url,token){return new Promise((resolve,reject)=>{const u=new URL(url),config=json(configFile),local=u.hostname===new URL(config.origin).hostname,req=https.get({hostname:local?(config.bindAddress&&config.bindAddress!=='0.0.0.0'?config.bindAddress:'127.0.0.1'):u.hostname,port:u.port,path:u.pathname+u.search,headers:{Host:u.host,...(token?{Authorization:'Bearer '+token}:{})},ca:fs.readFileSync('/etc/prizm-fleet/fleet/ca-cert.pem'),checkServerIdentity:(_h,c)=>tls.checkServerIdentity(u.hostname,c)},res=>{let body='';res.on('data',b=>{body+=b;if(body.length>8*1024*1024)req.destroy(Error('Read limit'));});res.on('end',()=>resolve({status:res.statusCode,body,headers:res.headers}));res.on('error',reject);});req.setTimeout(10000,()=>req.destroy(Error('Read timeout')));req.on('error',reject);});}
function folderPresence(p){try{return fs.statSync(p).isDirectory()?true:null;}catch(e){return e.code==='ENOENT'?false:null;}}
function expectedFolders(p){const pid=prop(p.unit,'MainPID');assert(/^[1-9][0-9]*$/.test(pid));const env=Object.fromEntries(fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0').filter(Boolean).map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)];}));return Object.fromEntries(Object.entries({history:env.PRIZM_HISTORY_DIR||p.cwd+'/.prizm-history',runtimeCache:env.PRIZM_CACHE_DIR||p.cwd+'/.prizm-cache',nodeModules:p.cwd+'/node_modules',data:p.cwd+'/data',dist:p.cwd+'/dist'}).map(([k,v])=>[k,folderPresence(v)]));}
async function probe(site,updated){const c=json(configFile),p=plans.find(p=>p.site===site);assert(p);
 if(site==='fleet'){
  const r=await read(c.origin+'/');assert.equal(r.status,200);assert.equal((await read(c.origin+'/api/fleet/summary')).status,401);assert(r.headers['x-prizm-ui-release']);return {uiRelease:r.headers['x-prizm-ui-release']};
 }
 const enrollment=c.collectors.find(s=>s.siteId===site),workspace=c.workspaces.find(s=>s.siteId===site);assert(enrollment&&workspace);
 const r=await read(enrollment.url,enrollment.token);assert.equal(r.status,200);const s=JSON.parse(r.body);assert.equal(s.siteId,site);assert.equal(s.stationCode,p.station);assert.equal(s.stale,false);const age=Date.now()-Date.parse(s.observedAt);assert(age>=-5000&&age<60000,'Fresh published data required');
 const base=new URL(enrollment.url).origin+'/api/fleet/workspace';
 const storage=await read(base+'/api/local/storage/status',workspace.token);assert.equal(storage.status,200);const status=JSON.parse(storage.body);assert.equal(status.success,true);assert.equal(status.appRoot,p.cwd);
 const expected=expectedFolders(p),folders={};for(const key of Object.keys(expected)){const value=status.folders[key];assert(value);if(updated)assert.equal(value.exists,expected[key],site+' folder presence '+key);assert(Number.isFinite(value.sizeBytes)&&value.sizeBytes>=0);folders[key]={exists:value.exists??null,sizeBytes:value.sizeBytes};}
 assert.equal((await read(workspace.origin+'/api/fleet/workspace-context')).status,401);
 return {observedAt:s.observedAt,ageMs:age,folders,independentPresence:expected};
}
async function healthy(p,updated){let error;for(let i=0;i<8;i++)try{assert.equal(prop(p.unit,'ActiveState'),'active');return JSON.parse(run('ip',['netns','exec','prizm-fleet','/usr/bin/node',backup+'/deploy.mjs','--probe',p.site,updated?'new':'old']));}catch(e){error=String(e.stderr||e.message).slice(0,600);console.log('Waiting for '+p.site+' readiness ('+(i+1)+'/8)…');await new Promise(r=>setTimeout(r,2000));}throw Error(p.site+': '+error);}
function socketRead(route){return new Promise((resolve,reject)=>{const req=http.get({socketPath:'/run/prizm-remote/mobile.sock',path:route,headers:{Host:'prizm.greenergyresources.org'}},res=>{res.resume();res.on('end',()=>resolve({status:res.statusCode,release:res.headers['x-prizm-ui-release']}));});req.setTimeout(10000,()=>req.destroy(Error('Remote timeout')));req.on('error',reject);});}
async function remoteCheck(releaseId){for(const [route,status]of [['/fleet/',200],['/fleet/api/fleet/summary',401],['/fleet/api/fleet/admin/users',401],...plans.filter(p=>p.site!=='fleet').flatMap(p=>[['/desktop/'+p.site+'/',303],['/desktop/'+p.site+'/api/fleet/workspace-context',401]])]){const r=await socketRead(route);assert.equal(r.status,status,route);if(status===200)assert.equal(r.release,releaseId);}return {authenticationPreserved:true,uiRelease:releaseId};}
async function restartCollector(p,root,persistent){
 fs.writeFileSync(p.override,overrideText(p,root,true),{mode:0o644});run('systemctl',['daemon-reload']);assert.equal(argv(p.unit),entry(p,root,true));
 try{run('systemctl',['restart',p.unit]);}finally{
  // Clear the transient flag immediately; subsequent automatic boots use normal cleanup.
  if(persistent)fs.writeFileSync(p.override,overrideText(p,root),{mode:0o644});else fs.unlinkSync(p.override);
  run('systemctl',['daemon-reload']);
 }
 assert.equal(argv(p.unit),entry(p,persistent?root:priorCollector));
}
async function rollback(s){const errors=[];for(const unit of [...s.touched].reverse())try{
 const p=plans.find(p=>p.unit===unit);assert(p);if(fs.existsSync(p.override)){const text=fs.readFileSync(p.override,'utf8');assert([overrideText(p,p.site==='fleet'?fleet:collector),overrideText(p,collector,true)].includes(text),'Override independently changed');}
 if(p.site==='fleet'){if(fs.existsSync(p.override))fs.unlinkSync(p.override);run('systemctl',['daemon-reload']);assert.equal(argv(p.unit),entry(p,priorFleet));run('systemctl',['restart',p.unit]);}
 else await restartCollector(p,recovery,false);
 await healthy(p,false);
 }catch(e){errors.push({unit,message:e.message});}
 try{same(invariants(),s.before,'Rollback protected state');}catch(e){errors.push({unit:'protected-state',message:e.message});}
 s.rollbackErrors=errors;s.rolledBack=errors.length===0;save(s);assert(!errors.length,'Rollback needs inspection; '+backup);
 console.log('Prior behavior restored. Collector recovery boot skipped startup cleanup; future boots use the original release.');
}
function installTree(base,dest,expected,patches){fs.mkdirSync(dest,{mode:0o755});fs.cpSync(base+'/dist',dest+'/dist',{recursive:true});for(const [name,bytes]of patches){fs.mkdirSync(path.dirname(dest+'/dist/'+name),{recursive:true});fs.writeFileSync(dest+'/dist/'+name,bytes,{mode:0o644});}same(tree(dest+'/dist'),expected,'Installed tree '+dest);fs.symlinkSync('/opt/prizm-fleet/releases/workspaces-20261001/node_modules',dest+'/node_modules');}
async function apply(){
 for(const target of [backup,fleet,collector,recovery])assert(!fs.existsSync(target),'Existing rollout: inspect before retry');
 const raw=fs.readFileSync(stage+'/storage-presence-manifest.json');assert.equal(hash(raw),manifestHash);const m=JSON.parse(raw);assert.equal(m.schema,1);
 for(const dict of [m.before,m.after,m.collectorBefore,m.collectorAfter])for(const[n,h]of Object.entries(dict)){assert(/^[A-Za-z0-9_./-]+$/.test(n)&&!n.split('/').some(s=>!s||s==='..'));assert(/^[a-f0-9]{64}$/.test(h));}
 same(tree(priorFleet+'/dist'),m.before,'Reviewed Fleet baseline');same(tree(priorCollector+'/dist'),m.collectorBefore,'Reviewed collector baseline');
 same(Object.keys(m.after).filter(n=>m.before[n]!==m.after[n]).sort(),m.changed,'Fleet changes');assert(m.changed.every(n=>['index.html','fleet.html','mobile.html','signin.html'].includes(n)||n.startsWith('assets/')&&n.endsWith('-presence21.js')));
 same(Object.keys(m.collectorAfter).filter(n=>m.collectorBefore[n]!==m.collectorAfter[n]),['server.cjs'],'Collector changes');assert(Object.keys(m.before).every(n=>n in m.after));assert.deepEqual(Object.keys(m.collectorBefore),Object.keys(m.collectorAfter));
 const readPatch=(f,h)=>{assert(fs.lstatSync(f).isFile()&&!fs.lstatSync(f).isSymbolicLink());const b=fs.readFileSync(f);assert.equal(hash(b),h);return b;};
 const ui=m.changed.map(n=>[n,readPatch(stage+'/fleet/'+n,m.after[n])]);const server=readPatch(stage+'/collector/server.cjs',m.collectorAfter['server.cjs']);const rollbackServer=readPatch(stage+'/collector/rollback-server.cjs',m.rollbackServerSha);
 const before=invariants();assert.equal(before.tunnel.active,'active');assert.notEqual(before.tunnel.pid,'0');
 for(const p of plans.filter(p=>p.site!=='fleet')){const policy=json(p.cwd+'/data/prizm_storage_policy.json');assert(policy&&typeof policy==='object','Existing valid storage policy required');}
 for(const p of plans){assert(!fs.existsSync(p.override));assert.equal(prop(p.unit,'ActiveState'),'active');assert.equal(argv(p.unit),entry(p,p.site==='fleet'?priorFleet:priorCollector));assert.equal(prop(p.unit,'WorkingDirectory'),p.site==='fleet'?priorFleet:p.cwd);for(const f of prop(p.unit,'DropInPaths').split(/\s+/).filter(Boolean))assert(path.basename(f)<suffix,'Later override exists');}
 fs.mkdirSync(backup,{mode:0o700});fs.copyFileSync(fileURLToPath(import.meta.url),backup+'/deploy.mjs');fs.chmodSync(backup+'/deploy.mjs',0o600);const s={before,touched:[],checks:{}};save(s);
 for(const p of plans)await healthy(p,false);
 installTree(priorFleet,fleet,m.after,ui);installTree(priorCollector,collector,m.collectorAfter,[['server.cjs',server]]);installTree(priorCollector,recovery,{...m.collectorBefore,'server.cjs':m.rollbackServerSha},[['server.cjs',rollbackServer]]);
 for(const root of [collector,recovery])run('/usr/bin/node',['--check',root+'/dist/server.cjs']);run('/usr/bin/node',['--check',fleet+'/dist/fleet-server.cjs']);
 try{
  for(const p of plans){same(invariants(),before,'Before restart protected state');s.touched.push(p.unit);save(s);console.log('Updating '+p.site+'; startup cleanup skipped for collector restart.');
   if(p.site==='fleet'){fs.writeFileSync(p.override,overrideText(p,fleet),{flag:'wx',mode:0o644});run('systemctl',['daemon-reload']);assert.equal(argv(p.unit),entry(p,fleet));run('systemctl',['restart',p.unit]);}
   else await restartCollector(p,collector,true);
   s.checks[p.site]=await healthy(p,true);if(p.site!=='fleet'){await new Promise(r=>setTimeout(r,12000));const next=await healthy(p,true);assert(Date.parse(next.observedAt)>Date.parse(s.checks[p.site].observedAt),'Data must advance');s.checks[p.site]={...next,advancing:true};}save(s);
  }
  s.checks.remote=await remoteCheck(s.checks.fleet.uiRelease);same(invariants(),before,'Final protected state');same(tree(fleet+'/dist'),m.after,'Final UI tree');same(tree(collector+'/dist'),m.collectorAfter,'Final collector tree');
  s.completedAt=new Date().toISOString();save(s);console.log('Folder presence deployment complete. Both sites verified; no cleanup invoked, permissions and latency settings unchanged. LAN/remote browser verification remains.');
 }catch(e){s.error=e.message;save(s);try{await rollback(s);}catch(re){throw new AggregateError([e,re],'Deployment and recovery need inspection: '+backup);}throw e;}
}
function selfTest(){assert.equal(new Set(plans.map(p=>p.override)).size,3);assert(plans.every(p=>!overrideText(p,collector).includes('Environment=')));assert(overrideText(plans[0],collector,true).includes('--skip-startup-storage-cleanup'));assert(!overrideText(plans[0],collector).includes('--skip-startup-storage-cleanup'));assert(!overrideText(plans[0],collector).includes('WorkingDirectory'));assert(overrideText(plans[2],fleet).includes('WorkingDirectory='+fleet));console.log('PASS fixed targets and transient startup flag');}
if(process.argv[2]==='--self-test')selfTest();else{
 assert.equal(process.getuid(),0,'Run with sudo');if(process.argv[2]==='--probe')console.log(JSON.stringify(await probe(process.argv[3],process.argv[4]==='new')));else{
  assert(['apply','rollback'].includes(process.argv[2]));const lock='/run/prizm-storage-presence.lock',fd=fs.openSync(lock,'wx',0o600);let accountLock;
  try{accountLock=fs.openSync('/var/lib/prizm-fleet/accounts/provision.lock','wx',0o600);if(process.argv[2]==='apply')await apply();else await rollback(json(backup+'/state.json'));}
  finally{if(accountLock!==undefined){fs.closeSync(accountLock);fs.unlinkSync('/var/lib/prizm-fleet/accounts/provision.lock');}fs.closeSync(fd);fs.unlinkSync(lock);}
 }
}
