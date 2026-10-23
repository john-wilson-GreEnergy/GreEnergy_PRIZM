/** Fixed Solar Star snapshot and transport rollout. No equipment commands or network edits. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import https from 'node:https';
import http from 'node:http';
import tls from 'node:tls';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const priorFleet='/opt/prizm-fleet/releases/topology-profile-20261021';
const priorCollector=priorFleet;
const release='/opt/prizm-fleet/releases/snapshot-transport-20261021';
const stage='/home/ebc/prizm-snapshot-transport-20261021';
const backup='/var/lib/prizm-fleet/snapshot-transport-20261021';
const report='/home/ebc/prizm-snapshot-transport-result.json';
const configFile='/etc/prizm-fleet/fleet/fleet.json';
const manifestHash='91bb0a7d174d57f5fdc597607c0c6912ab7fa61ecc00446227946c9078ae2253';
const probeHash='c7e6c52e27b176745fdc47402b87b978d6601c655868c107a623928d25b1a84b';
const plans=[{unit:'prizm',site:'solar-star-3',station:'BHE0020',cwd:'/home/ebc/GreEnergy_PRIZM'},
 {unit:'prizm-site@ss4',site:'solar-star-4',station:'BHE0021',cwd:'/var/lib/prizm-sites/ss4'},
 {unit:'prizm-fleet',site:'fleet',cwd:priorFleet}].map(p=>({...p,override:`/etc/systemd/system/${p.unit}.service.d/zzzzzzzzzzzzzzzzzzzzzzzzzz-snapshot-transport-20261021.conf`}));
const sha=b=>createHash('sha256').update(b).digest('hex'),hash=f=>sha(fs.readFileSync(f));
const run=(cmd,args,extra={})=>execFileSync(cmd,args,{encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024,...extra}).trim();
const prop=(unit,key)=>run('systemctl',['show',unit,'-p',key,'--value']);
const overrideText=p=>`[Service]\nExecStart=\nExecStart=/usr/bin/node ${release}/dist/${p.site==='fleet'?'fleet-server':'server'}.cjs\n`+
 (p.site==='fleet'?`WorkingDirectory=${release}\n`:`Environment=PRIZM_PUBLIC_DIRECTORY=${release}/dist\n`);
function tree(dir){const r={};for(const n of fs.readdirSync(dir).sort()){const p=dir+'/'+n,s=fs.lstatSync(p);assert(!s.isSymbolicLink());if(s.isDirectory())for(const [k,v]of Object.entries(tree(p)))r[n+'/'+k]=v;else{assert(s.isFile());r[n]=hash(p);}}return r;}
function manifest(dir){const raw=fs.readFileSync(dir+'/snapshot-manifest.json');assert.equal(sha(raw),manifestHash);const m=JSON.parse(raw);assert.equal(m.schema,1);
 for(const [p,h]of Object.entries(m.after)){assert(/^[a-zA-Z0-9_.\/-]+$/.test(p)&&!p.split('/').some(s=>!s||s==='..'));assert(/^[a-f0-9]{64}$/.test(h));}
 assert(Object.keys(m.before).every(p=>p in m.after));assert.deepEqual(Object.keys(m.after).filter(p=>m.before[p]!==m.after[p]).sort(),m.changed);return m;}
function save(state){fs.writeFileSync(backup+'/state.json',JSON.stringify(state,null,2),{mode:0o600});
 fs.writeFileSync(report,JSON.stringify({completedAt:state.completedAt??null,rolledBack:state.rolledBack??false,checks:state.checks??{},before:state.baseline??{},remoteReadOnly:true,networkChanged:false,equipmentCommandsSent:false,authenticatedBrowserAcceptancePending:true},null,2),{mode:0o600});
 const s=fs.statSync('/home/ebc');fs.chownSync(report,s.uid,s.gid);}
function invariants(){const c=JSON.parse(fs.readFileSync(configFile));return {
 configs:Object.fromEntries([configFile,c.accountsFile,'/etc/prizm-fleet/fleet/remote.json','/etc/prizm-fleet/ss3/export.json','/etc/prizm-fleet/ss4/export.json'].map(f=>[f,hash(f)])),
 baselineFleet:tree(priorFleet+'/dist'),baselineCollector:hash(priorCollector+'/dist/server.cjs'),
 workerLinks:plans.filter(p=>p.site!=='fleet').map(p=>[p.cwd,fs.readlinkSync(p.cwd+'/dist')]),
 tunnel:{pid:prop('prizm-remote-tunnel','MainPID'),exec:prop('prizm-remote-tunnel','ExecStart')}};}
function effective(p,updated){const root=updated?release:p.site==='fleet'?priorFleet:priorCollector;
 assert(prop(p.unit,'ExecStart').includes(`argv[]=/usr/bin/node ${root}/dist/${p.site==='fleet'?'fleet-server':'server'}.cjs ;`),'Unexpected entrypoint '+p.unit);
 assert.equal(prop(p.unit,'WorkingDirectory'),p.site==='fleet'?root:p.cwd);
 if(updated&&p.site!=='fleet')assert(prop(p.unit,'Environment').split(/\s+/).some(s=>s.replaceAll('"','')==='PRIZM_PUBLIC_DIRECTORY='+release+'/dist'));
}
async function probe(site,updated){
 const c=JSON.parse(fs.readFileSync(configFile)),p=plans.find(p=>p.site===site);assert(p);
 const read=(url,token,extraHeaders={})=>new Promise((resolve,reject)=>{const u=new URL(url),local=u.hostname===new URL(c.origin).hostname,started=performance.now();
  const req=https.get({hostname:local?(!c.bindAddress||c.bindAddress==='0.0.0.0'?'127.0.0.1':c.bindAddress):u.hostname,port:u.port,path:u.pathname+u.search,
   headers:{Host:u.host,...(token?{Authorization:'Bearer '+token}:{}),...extraHeaders},ca:fs.readFileSync('/etc/prizm-fleet/fleet/ca-cert.pem'),checkServerIdentity:(_h,cert)=>tls.checkServerIdentity(u.hostname,cert)},res=>{
    let size=0;const chunks=[];res.on('data',b=>{chunks.push(b);size+=b.length;if(size>20*1024*1024)req.destroy(Error('Response limit'));});
    res.on('end',()=>{try{const bytes=Buffer.concat(chunks),body=(res.headers['content-encoding']==='gzip'?gunzipSync(bytes):bytes).toString();resolve({status:res.statusCode,body,ms:Math.round(performance.now()-started),bytes:size,headers:res.headers});}catch(e){reject(e);}});res.on('error',reject);
   });req.setTimeout(20000,()=>req.destroy(Error('Read timeout')));req.on('error',reject);
 });
 if(site==='fleet'){
  for(const [route,file]of [['/','fleet.html'],['/mobile/','mobile.html']]){const r=await read(c.origin+route);assert.equal(r.status,200);assert.equal(r.body,fs.readFileSync((updated?release:priorFleet)+'/dist/'+file,'utf8'));}
  assert.equal((await read(c.origin+'/api/fleet/summary')).status,401);
  for(const w of c.workspaces){assert.equal((await read(w.origin+'/')).status,303);assert.equal((await read(w.origin+'/api/fleet/workspace-context')).status,401);}
  return {site,authenticationProtected:true};
 }
 const collector=c.collectors.find(s=>s.siteId===site),workspace=c.workspaces.find(s=>s.siteId===site);assert(collector&&workspace&&collector.stationCode===p.station);
 const s=await read(collector.url,collector.token);assert.equal(s.status,200);const summary=JSON.parse(s.body);
 assert.equal(summary.siteId,site);assert.equal(summary.stationCode,p.station);assert.equal(summary.stale,false);assert(Date.now()-Date.parse(summary.observedAt)<60000,'Stale collector');
 const base=new URL(collector.url).origin+'/api/fleet/workspace';
 const r=await read(base+'/api/local/topology/active?view=profile',workspace.token);assert.equal(r.status,200);
 const topology=JSON.parse(r.body);assert.equal(topology.success,true);assert(topology.profile?.assumptions);const profileHash=sha(JSON.stringify(topology.profile));
 const result={site,station:p.station,observedAt:summary.observedAt,profileHash,topologyBytes:r.bytes,topologyMs:r.ms};
 if(updated){
  const before=JSON.parse(fs.readFileSync(backup+'/state.json')).baseline[site];assert.equal(profileHash,before.profileHash,'Topology profile changed');
  assert(!('normalized'in topology));assert(r.bytes<65536,'Profile unexpectedly large');assert.equal(r.bytes,before.topologyBytes,'Layout profile unchanged');assert(r.ms<10000,'Topology exceeds UI deadline');
  const rows=await read(base+'/api/local/site-data/strings-fast?shape=list',workspace.token);assert.equal(rows.status,200);const data=JSON.parse(rows.body);assert.equal(data.strings.length,320);result.stringRows=320;result.stringReadMs=rows.ms;
 }
 const snapshotUrl=base+'/api/local/site-data/snapshot?view=arrays-strings&shape=list';
 const snap=await read(snapshotUrl,workspace.token,updated?{'Accept-Encoding':'gzip'}:{});
 assert.equal(snap.status,200);const data=JSON.parse(snap.body);assert.equal(data.siteIdentity.stationCode,p.station);assert.equal(data.normalized.strings.length,320);
 const compare=createRequire(import.meta.url)(backup+'/snapshot-probe.cjs').compareSnapshot;
 if(!updated){
   result.snapshot=compare(data,backup+'/candidate-server.cjs');
   assert(result.snapshot.afterBytes<result.snapshot.beforeBytes*0.8,'Expected slim snapshot reduction');
 }else{
   const previous=JSON.parse(fs.readFileSync(backup+'/state.json')).baseline[site].snapshot;
   assert.equal(snap.headers['content-encoding'],'gzip');assert(snap.bytes<500000);assert(snap.ms<10000);
   assert(Buffer.byteLength(snap.body)<previous.beforeBytes*0.8);
   result.snapshot={bytes:Buffer.byteLength(snap.body),wireBytes:snap.bytes,ms:snap.ms,rows:320};
   let conditional=false,etag=snap.headers.etag;const timings=[snap.ms];
   for(let i=0;i<3;i++){
     const next=await read(snapshotUrl,workspace.token,{'Accept-Encoding':'gzip','If-None-Match':etag});
     assert([200,304].includes(next.status));timings.push(next.ms);
     if(next.status===304){assert.equal(next.bytes,0);conditional=true;break;}etag=next.headers.etag;
   }
   assert(conditional,'Conditional snapshot read was not accepted');result.snapshot.conditionalRead=true;result.snapshot.maxReadMs=Math.max(...timings);
 }

 return result;
}
async function check(site,updated){let last;for(let i=0;i<8;i++){try{const p=plans.find(p=>p.site===site);assert.equal(prop(p.unit,'ActiveState'),'active');effective(p,updated);
 return JSON.parse(run('ip',['netns','exec','prizm-fleet','/usr/bin/node',backup+'/deploy.mjs','--probe',site,updated?'new':'old']));
 }catch(e){last=e;console.log('Waiting for '+site+' protected endpoint and fresh data…');await new Promise(r=>setTimeout(r,2000));}}throw last;}
async function remoteCheck(){const read=route=>new Promise((resolve,reject)=>{const req=http.get({socketPath:'/run/prizm-remote/mobile.sock',path:route,headers:{Host:'prizm.greenergyresources.org'}},res=>{res.resume();res.on('end',()=>resolve({status:res.statusCode,release:res.headers['x-prizm-ui-release']}));});req.setTimeout(10000,()=>req.destroy(Error('Remote socket timeout')));req.on('error',reject);});
 const fleet=await read('/fleet/');assert.equal(fleet.status,200);assert(fleet.release);
 for(const s of ['solar-star-3','solar-star-4']){assert.equal((await read('/desktop/'+s+'/')).status,303);assert.equal((await read('/desktop/'+s+'/api/fleet/workspace-context')).status,401);}
 assert.equal((await read('/fleet/api/fleet/summary')).status,401);return {uiRelease:fleet.release,unauthenticatedTelemetryDenied:true};
}
async function rollback(state){
 for(const unit of [...state.touched].reverse()){const p=plans.find(p=>p.unit===unit);if(fs.existsSync(p.override)){assert.equal(fs.readFileSync(p.override,'utf8'),overrideText(p));fs.unlinkSync(p.override);}run('systemctl',['daemon-reload']);effective(p,false);run('systemctl',['restart',p.unit]);await check(p.site,false);}
 assert.deepEqual(invariants(),state.invariants);state.rolledBack=true;save(state);console.log('Snapshot transport rollback complete. Previous release restored.');
}
async function apply(){
 assert(!fs.existsSync(backup)&&!fs.existsSync(release),'Existing rollout; inspect before retry');const m=manifest(stage),initial=invariants();assert.deepEqual(initial.baselineFleet,m.before);assert.equal(initial.baselineCollector,m.before['server.cjs']);
 for(const p of plans){effective(p,false);assert(!fs.existsSync(p.override));for(const f of prop(p.unit,'DropInPaths').split(/\s+/).filter(Boolean))assert(path.basename(f)<path.basename(p.override),'Later override exists');}
 const patches=m.changed.map(p=>{const f=stage+'/'+p,s=fs.lstatSync(f);assert(s.isFile()&&!s.isSymbolicLink());const bytes=fs.readFileSync(f);assert.equal(sha(bytes),m.after[p]);return [p,bytes];});
 assert.equal(hash(stage+'/snapshot-probe.cjs'),probeHash);
 fs.mkdirSync(backup,{mode:0o700});fs.copyFileSync(stage+'/snapshot-probe.cjs',backup+'/snapshot-probe.cjs');assert.equal(hash(backup+'/snapshot-probe.cjs'),probeHash);
 fs.writeFileSync(backup+'/candidate-server.cjs',patches.find(([p])=>p==='server.cjs')[1],{mode:0o600});
 fs.copyFileSync(fileURLToPath(import.meta.url),backup+'/deploy.mjs');fs.chmodSync(backup+'/deploy.mjs',0o600);
 const state={invariants:initial,baseline:{},checks:{},touched:[]};save(state);
 for(const p of plans){state.baseline[p.site]=await check(p.site,false);save(state);}
 fs.mkdirSync(release,{mode:0o755});fs.cpSync(priorFleet+'/dist',release+'/dist',{recursive:true});
 for(const [p,b]of patches)fs.writeFileSync(release+'/dist/'+p,b,{mode:0o644});assert.deepEqual(tree(release+'/dist'),m.after);
 fs.symlinkSync('/opt/prizm-fleet/releases/workspaces-20261001/node_modules',release+'/node_modules');
 for(const f of ['server.cjs','fleet-server.cjs'])run('/usr/bin/node',['--check',release+'/dist/'+f]);
 try{
  for(const p of plans){assert.deepEqual(invariants(),initial);console.log('Updating '+p.site+'; other services remain running.');state.touched.push(p.unit);save(state);
   fs.writeFileSync(p.override,overrideText(p),{flag:'wx',mode:0o644});run('systemctl',['daemon-reload']);effective(p,true);run('systemctl',['restart',p.unit]);state.checks[p.site]=await check(p.site,true);save(state);}
  state.checks.remote=await remoteCheck();await new Promise(r=>setTimeout(r,12000));
  for(const p of plans.filter(p=>p.site!=='fleet')){const next=await check(p.site,true);assert(Date.parse(next.observedAt)>Date.parse(state.checks[p.site].observedAt),'Data did not advance');state.checks[p.site]={...next,advancing:true};}
  assert.deepEqual(invariants(),initial);assert.deepEqual(tree(release+'/dist'),m.after);state.completedAt=new Date().toISOString();save(state);
  console.log('Snapshot transport deployment complete. Both sites verified; remote controls remain disabled. Sign in again for browser acceptance.');
 }catch(e){console.error('Checks failed; restoring previous services.');await rollback(state);throw e;}
}
if(process.argv[2]==='--self-test'){
 const dir=fs.mkdtempSync('/tmp/prizm-topology-rollback-');for(const p of plans){const f=dir+'/'+p.unit;fs.writeFileSync(f,overrideText(p),{flag:'wx'});assert.equal(fs.readFileSync(f,'utf8'),overrideText(p));fs.unlinkSync(f);assert(!fs.existsSync(f));}
 assert(plans.every(p=>!overrideText(p).includes('remoteReadOnly=false')));console.log('PASS fixed service targets, exact override removal, preserved cwd/worker paths and rollback');
}else{assert.equal(process.getuid(),0,'Run with sudo');if(process.argv[2]==='--probe')console.log(JSON.stringify(await probe(process.argv[3],process.argv[4]==='new')));
 else{assert(['apply','rollback'].includes(process.argv[2]));const lock='/run/prizm-snapshot-transport.lock',fd=fs.openSync(lock,'wx',0o600);try{if(process.argv[2]==='apply')await apply();else await rollback(JSON.parse(fs.readFileSync(backup+'/state.json')));}finally{fs.closeSync(fd);fs.unlinkSync(lock);}}}

