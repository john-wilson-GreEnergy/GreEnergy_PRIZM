/** Fixed Solar Star rollout. Read-only verification; no controls, network,
 * credentials, account or Cloudflare changes. Restarts one service at a time. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const release='/opt/prizm-fleet/releases/power-flow-20261020';
const backup='/var/lib/prizm-fleet/power-flow-20261020';
const archive='/home/ebc/prizm-power-flow-coverage-20261020.tgz';
const archiveHash='4a6ec60974aa8b7168ca99a4380e330abe292bcf0fef80ef2b56a412c6c1016e';
const priorCollector='/opt/prizm-fleet/releases/site-analytics-20261019';
const priorFleet='/opt/prizm-fleet/releases/remote-experience-20261020';
const dependencies='/opt/prizm-fleet/releases/workspaces-20261001/node_modules';
const configFile='/etc/prizm-fleet/fleet/fleet.json',remoteFile='/etc/prizm-fleet/fleet/remote.json';
const ca='/etc/prizm-fleet/fleet/ca-cert.pem',report='/home/ebc/prizm-power-flow-result.json';
const plans=[
 {unit:'prizm',site:'solar-star-3',station:'BHE0020',cwd:'/home/ebc/GreEnergy_PRIZM'},
 {unit:'prizm-site@ss4',site:'solar-star-4',station:'BHE0021',cwd:'/var/lib/prizm-sites/ss4'},
 {unit:'prizm-fleet',site:'fleet',cwd:priorFleet}
].map(p=>({...p,override:`/etc/systemd/system/${p.unit}.service.d/zzzzzzzzzzzzzzzzzz-power-flow-20261020.conf`,worker:p.site==='fleet'?null:p.cwd+'/dist'}));
const run=(cmd,args,extra={})=>execFileSync(cmd,args,{encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024,...extra}).trim();
const prop=(unit,key)=>run('systemctl',['show',unit,'-p',key,'--value']);
const present=f=>{try{return fs.lstatSync(f);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function save(file,value,owner){
 fs.writeFileSync(file+'.new',JSON.stringify(value,null,2),{mode:0o600,flag:'wx'});
 if(owner)fs.chownSync(file+'.new',owner.uid,owner.gid);
 fs.renameSync(file+'.new',file);
}
const overrideText=p=>`[Service]\nExecStart=\nExecStart=/usr/bin/node ${release}/dist/${p.site==='fleet'?'fleet-server':'server'}.cjs\n`+
 (p.worker?`Environment=PRIZM_PUBLIC_DIRECTORY=${release}/dist\n`:`WorkingDirectory=${release}\n`);
function validateEntries(entries,types){
 assert(entries.length>20&&entries.length<500&&entries.length===types.length);
 assert.equal(new Set(entries).size,entries.length);
 assert(types.every(t=>t.startsWith('-')),'Only regular files allowed');
 assert(entries.every(e=>/^dist\/(?:[A-Za-z0-9_.-]+\.(?:cjs|html|svg|png|ico)|assets\/[A-Za-z0-9_.-]+\.(?:js|css|svg|woff2?))$/.test(e)),'Archive path outside dist');
 for(const f of ['index.html','fleet.html','mobile.html','server.cjs','fleet-server.cjs','cell-history-worker.cjs','history-query-worker.cjs','snapshot-cache-worker.cjs','power-flow-verifier.cjs'])assert(entries.includes('dist/'+f),'Missing '+f);
}
function checkArchive(file=archive){
 const st=present(file);assert(st?.isFile()&&!st.isSymbolicLink());assert(st.size>100000&&st.size<40*1024*1024);
 assert.equal(hash(file),archiveHash,'Release checksum mismatch');
 validateEntries(run('tar',['-tzf',file]).split('\n'),run('tar',['-tvzf',file]).split('\n'));
}
function switchWorker(file,expected,target){
 assert(present(file)?.isSymbolicLink()&&fs.readlinkSync(file)===expected,'Worker path changed externally');
 assert(!present(file+'.power-flow-next'));fs.symlinkSync(target,file+'.power-flow-next');fs.renameSync(file+'.power-flow-next',file);
}
function restoreOverride(p){
 if(!present(p.override))return;
 assert(present(p.override).isFile()&&!present(p.override).isSymbolicLink());
 assert.equal(fs.readFileSync(p.override,'utf8'),overrideText(p),'Override changed externally');fs.unlinkSync(p.override);
}
function invariants(){
 const c=JSON.parse(fs.readFileSync(configFile));
 const files=[configFile,remoteFile,c.accountsFile,'/etc/prizm-fleet/ss3/export.json','/etc/prizm-fleet/ss4/export.json'];
 const preserved={};
 for(const root of [priorCollector,priorFleet])
  for(const f of fs.readdirSync(root+'/dist',{recursive:true}).sort())
   if(fs.lstatSync(root+'/dist/'+f).isFile())preserved[root+'/dist/'+f]=hash(root+'/dist/'+f);
 return {configs:Object.fromEntries(files.map(f=>[f,hash(f)])),preserved,
  tunnel:{pid:prop('prizm-remote-tunnel','MainPID'),exec:prop('prizm-remote-tunnel','ExecStart')}};
}
function socketRead(url){
 return new Promise((resolve,reject)=>{
  const req=http.get({socketPath:'/run/prizm-remote/mobile.sock',path:url,headers:{Host:'prizm.greenergyresources.org'}},res=>{
   let body='';res.on('data',b=>{body+=b;if(body.length>4*1024*1024)req.destroy(Error('Oversize response'));});
   res.on('end',()=>resolve({status:res.statusCode,body,location:res.headers.location}));
  });req.setTimeout(5000,()=>req.destroy(Error('Socket timeout')));req.on('error',reject);
 });
}
async function probe(site,updated){
 const c=JSON.parse(fs.readFileSync(configFile)),p=plans.find(p=>p.site===site);assert(p);
 const read=(url,token)=>new Promise((resolve,reject)=>{
  const u=new URL(url),isLan=u.hostname==='10.0.0.15';
  const req=https.get({hostname:isLan?(!c.bindAddress||c.bindAddress==='0.0.0.0'?'127.0.0.1':c.bindAddress):u.hostname,
   port:u.port,path:u.pathname+u.search,headers:{Host:u.host,...(token?{authorization:'Bearer '+token}:{})},
   ca:fs.readFileSync(ca),checkServerIdentity:(_h,cert)=>tls.checkServerIdentity(u.hostname,cert)},res=>{
   let body='';res.on('data',b=>{body+=b;if(body.length>16*1024*1024)req.destroy(Error('Oversize response'));});
   res.on('end',()=>resolve({status:res.statusCode,body,location:res.headers.location}));
  });req.setTimeout(20000,()=>req.destroy(Error('HTTPS timeout')));req.on('error',reject);
 });
 const json=async(url,token)=>{const r=await read(url,token);assert.equal(r.status,200);return JSON.parse(r.body);};
 const checkUi=async(origin,token,file,expected)=>{
  const r=await read(origin,token);assert.equal(r.status,200);assert.equal(r.body,fs.readFileSync(expected+'/dist/'+file,'utf8'));
  for(const m of r.body.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g)){
   const asset=await read(origin.replace(/\/$/,'')+m[1],token);
   assert.equal(asset.status,200);assert.equal(asset.body,fs.readFileSync(expected+'/dist'+m[1],'utf8'));
  }
 };
 if(site==='fleet'){
  await checkUi(c.origin,undefined,'fleet.html',updated?release:priorFleet);
  assert.equal((await read(c.origin+'/api/fleet/summary')).status,401);
  for(const w of c.workspaces)assert.equal((await read(w.origin+'/api/fleet/workspace-context')).status,401);
  const root=await socketRead('/');assert.equal(root.status,302);assert.equal(root.location,'/fleet/');
  for(const route of ['/fleet/','/mobile/']){
   const page=await socketRead(route);assert.equal(page.status,200);assert.match(page.body,/data-prizm-adaptive="true"/);
   assert.equal((await socketRead(route+'api/fleet/summary')).status,401);
   assert.equal((await socketRead(route+'api/fleet/admin/users')).status,403);
  }
  for(const id of ['solar-star-3','solar-star-4'])assert.equal((await socketRead('/desktop/'+id+'/api/fleet/workspace-context')).status,401);
  return {site,localAndRemoteRoutesVerified:true,anonymousTelemetryDenied:true};
 }
 const collector=c.collectors.find(s=>s.siteId===site),workspace=c.workspaces.find(s=>s.siteId===site);
 assert(collector&&workspace&&collector.stationCode===p.station);
 const summary=await json(collector.url,collector.token),base=new URL(collector.url).origin+'/api/fleet/workspace';
 assert.equal(summary.siteId,site);assert.equal(summary.stationCode,p.station);assert.equal(summary.stale,false);
 assert(Date.now()-Date.parse(summary.observedAt)<45000);assert.equal(summary.details.arrays.length,8);
 assert.equal(summary.metrics.strings.value,320);assert.equal((await read(collector.url)).status,401);
 const block=await json(base+'/api/local/site-data/block-summary',workspace.token);
 assert.equal(block.siteIdentity.stationCode,p.station);assert.equal(block.siteIdentity.blockIndex,1);
 await checkUi(base+'/',workspace.token,'index.html',updated?release:priorCollector);
 const cells=await json(base+'/api/local/site-data/cells',workspace.token);
 assert.equal(cells.storage.enabled,true);assert.equal(cells.storage.lastError,null);assert(cells.storage.saved>0);
 assert(Date.now()-cells.acquiredAt<180000);
 const before=updated?JSON.parse(fs.readFileSync(backup+'/state.json')).before[p.unit]:null;
 const savedAt=before?.savedAt??cells.storage.lastSavedAt;assert(Number.isFinite(savedAt));
 const frame=await json(base+'/api/local/site-data/cells/snapshot?array=1&metric=millivolts&at='+savedAt,workspace.token);
 assert.equal(frame.acquiredAt,savedAt);assert.equal(frame.historical,true);
 const frameHash=digest(frame.strings);if(before)assert.equal(frameHash,before.frameHash,'Recorded cells changed');
 const result={site,station:p.station,observedAt:summary.observedAt,savedAt,frameHash,cellArchiveVerified:true,uiVerified:true};
 if(updated){
  const verifier=createRequire(import.meta.url)(release+'/dist/power-flow-verifier.cjs');
  assert.equal(block.powerFlow?.version,1);assert.equal(block.powerFlow.arrays.length,8);
  const canonical=verifier.buildBlockPowerFlow(block);
  assert(canonical,'Canonical power flow unavailable');
  assert.equal(block.powerFlow.net.powerKw,canonical.net.powerKw);
  assert.deepEqual(block.powerFlow.arrays.map(a=>[a.array,a.powerKw]),canonical.arrays.map(a=>[a.array,a.powerKw]));
  assert.deepEqual(block.powerFlow.arrays.map(a=>[a.array,a.soc?.percent]),canonical.arrays.map(a=>[a.array,a.soc?.percent]));
  assert.deepEqual(block.powerFlow.arrays.map(a=>[a.array,a.soc?.coverage]),canonical.arrays.map(a=>[a.array,a.soc?.coverage]));
  const broker=new verifier.FleetBroker([{...collector,name:site}]);broker.accept(site,summary);
  const flow=broker.view(new Set([site])).sites[0].powerFlow;
  assert.equal(flow?.version,1);assert.equal(flow.arrays.length,8);
  for(const model of [block.powerFlow,flow]){
   assert(!['unknown','stale'].includes(model.net.direction),'Net flow not current');
   assert(model.arrays.some(a=>a.soc?.quality==='live'),'No live array SOC');
   for(const a of model.arrays){
    assert(a.soc,'Missing SOC model');
    if(a.soc.percent!==null)assert(Number.isFinite(a.soc.percent)&&a.soc.percent>=0&&a.soc.percent<=100);
   }
   for(const r of [model.net,...model.arrays].filter(r=>r.validUntil)){
    assert.equal(r.direction,r.powerKw<-.5?'charging':r.powerKw>.5?'discharging':'idle','Power sign mismatch');
   }
  }
  result.powerFlowVerified=true;result.arrayCount=8;result.netDirection=flow.net.direction;result.liveSocArrays=flow.arrays.filter(a=>a.soc.quality==='live').length;
 }
 return result;
}
async function healthy(p,updated){
 const deadline=Date.now()+180000;
 do{
  try{
   assert.equal(prop(p.unit,'ActiveState'),'active');
   return JSON.parse(run('ip',['netns','exec','prizm-fleet','/usr/bin/node',backup+'/deploy.mjs','--probe',p.site,updated?'updated':'previous'],{timeout:45000}));
  }catch{console.log('Waiting for '+p.unit+' readiness and read-only checks…');await new Promise(r=>setTimeout(r,3000));}
 }while(Date.now()<deadline);
 throw Error('Read-only validation failed: '+p.unit);
}
function reportState(s){
 save(report,{completedAt:s.completedAt??null,rolledBack:s.rolledBack??false,checks:s.after??{},
  scope:'Fleet desktop/mobile and both PRIZM block summaries',networkChanged:false,equipmentCommandsSent:false,remoteReadOnly:true},fs.statSync('/home/ebc'));
}
function validateState(s){
 assert(Array.isArray(s.changed)&&s.changed.length<=3&&new Set(s.changed).size===s.changed.length);
 assert(s.changed.every(u=>plans.some(p=>p.unit===u)));
}
async function rollback(s){
 validateState(s);s.restored??=[];
 assert.deepEqual(invariants(),s.invariants,'Preserved configuration/release changed externally');
 for(const unit of [...s.changed].reverse()){
  if(s.restored.includes(unit))continue;const p=plans.find(p=>p.unit===unit);
  console.log('Restoring '+unit);run('systemctl',['stop',unit]);restoreOverride(p);
  if(p.worker){const link=fs.readlinkSync(p.worker);if(link===release+'/dist')switchWorker(p.worker,link,priorCollector+'/dist');else assert.equal(link,priorCollector+'/dist');}
  run('systemctl',['daemon-reload']);run('systemctl',['start',unit]);await healthy(p,false);
  s.restored.push(unit);save(backup+'/state.json',s);
 }
 s.rolledBack=true;save(backup+'/state.json',s);reportState(s);console.log('Previous releases restored; recordings and configuration preserved.');
}
async function apply(){
 assert(!present(backup)&&!present(release),'Existing rollout state: inspect before retry');checkArchive();
 const remote=JSON.parse(fs.readFileSync(remoteFile));
 assert.equal(remote.authentication,'password');assert.equal(remote.experience,'adaptive');
 for(const p of plans){
  assert(!present(p.override));assert.equal(prop(p.unit,'ActiveState'),'active');assert.equal(prop(p.unit,'WorkingDirectory'),p.cwd);
  assert(prop(p.unit,'ExecStart').includes((p.worker?priorCollector:priorFleet)+'/dist/'+(p.worker?'server':'fleet-server')+'.cjs'));
  if(p.worker){assert(present(p.worker)?.isSymbolicLink());assert.equal(fs.readlinkSync(p.worker),priorCollector+'/dist');assert(prop(p.unit,'Environment').includes('PRIZM_PUBLIC_DIRECTORY='+priorCollector+'/dist'));}
 }
 assert(Number(fs.statfsSync('/var/lib').bavail)*Number(fs.statfsSync('/var/lib').bsize)>10*1024**3,'Disk reserve too low');
 fs.mkdirSync(backup,{mode:0o700});
 fs.copyFileSync(fileURLToPath(import.meta.url),backup+'/deploy.mjs',fs.constants.COPYFILE_EXCL);fs.chmodSync(backup+'/deploy.mjs',0o600);
 fs.copyFileSync(archive,backup+'/release.tgz',fs.constants.COPYFILE_EXCL);checkArchive(backup+'/release.tgz');
 const state={changed:[],before:{},after:{},invariants:invariants()};save(backup+'/state.json',state);
 for(const p of plans)state.before[p.unit]=await healthy(p,false);save(backup+'/state.json',state);
 fs.mkdirSync(release,{mode:0o755});fs.mkdirSync(release+'/dist',{mode:0o755});
 for(const old of [priorCollector,priorFleet])fs.cpSync(old+'/dist/assets',release+'/dist/assets',{recursive:true});
 run('tar',['--no-same-owner','--no-same-permissions','-xzf',backup+'/release.tgz','-C',release]);fs.symlinkSync(dependencies,release+'/node_modules');
 const require=createRequire(release+'/dist/server.cjs');
 for(const f of fs.readdirSync(release+'/dist').filter(f=>f.endsWith('.cjs'))){
  run('/usr/bin/node',['--check',release+'/dist/'+f]);
  for(const m of fs.readFileSync(release+'/dist/'+f,'utf8').matchAll(/require\("([^".][^"]*)"\)/g))require.resolve(m[1]);
 }
 try{
  for(const p of plans){
   assert.deepEqual(invariants(),state.invariants);
   const otherPids=Object.fromEntries(plans.filter(q=>q.unit!==p.unit).map(q=>[q.unit,prop(q.unit,'MainPID')]));
   state.changed.push(p.unit);save(backup+'/state.json',state);
   console.log('Updating '+p.unit+' only; other services remain running.');
   run('systemctl',['stop',p.unit]);
   if(p.worker)switchWorker(p.worker,priorCollector+'/dist',release+'/dist');
   fs.writeFileSync(p.override,overrideText(p),{flag:'wx',mode:0o644});run('systemctl',['daemon-reload']);run('systemctl',['start',p.unit]);
   assert(prop(p.unit,'ExecStart').includes(release+'/dist/'));
   state.after[p.unit]=await healthy(p,true);
   for(const [unit,pid] of Object.entries(otherPids))assert.equal(prop(unit,'MainPID'),pid,'Unrelated service restarted');
   save(backup+'/state.json',state);console.log('PASS '+p.unit);
  }
  assert.deepEqual(invariants(),state.invariants);state.completedAt=new Date().toISOString();save(backup+'/state.json',state);reportState(state);
  console.log('Power-flow deployment complete. Fleet and both block summaries updated. Sign in again for visual acceptance. Equipment and network settings unchanged.');
 }catch(error){console.error('Validation failed; restoring changed services.');await rollback(state);throw error;}
}
function selfTest(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'prizm-power-flow-check-'));
 for(const p of plans){
  const test={...p,override:path.join(dir,p.unit+'.conf')};
  fs.writeFileSync(test.override,overrideText(p));restoreOverride(test);restoreOverride(test);
  fs.writeFileSync(test.override,'independent edit');assert.throws(()=>restoreOverride(test));
 }
 const link=path.join(dir,'dist');fs.symlinkSync('/previous',link);switchWorker(link,'/previous','/next');switchWorker(link,'/next','/previous');
 assert.equal(fs.readlinkSync(link),'/previous');assert.throws(()=>switchWorker(link,'/wrong','/next'));
 const entries=['index.html','fleet.html','mobile.html','server.cjs','fleet-server.cjs','cell-history-worker.cjs','history-query-worker.cjs','snapshot-cache-worker.cjs','power-flow-verifier.cjs',...Array.from({length:15},(_,i)=>`assets/test${i}.js`)].map(f=>'dist/'+f);
 validateEntries(entries,entries.map(()=>'- file'));
 for(const bad of ['../etc/a','dist/assets/../x.js','/etc/a','dist/a.tar'])assert.throws(()=>validateEntries([...entries,bad],[...entries,bad].map(()=>'- file')));
 assert.throws(()=>validateEntries(entries,entries.map(()=>'l link')));
 validateState({changed:plans.map(p=>p.unit)});assert.throws(()=>validateState({changed:['other']}));
 assert(!overrideText(plans[0]).includes('WorkingDirectory'));assert(!overrideText(plans[2]).includes('Environment='));
 console.log('PASS fixed services, archive validation, worker/override rollback and external-change protection');
}
if(process.argv[2]==='--self-test')selfTest();
else if(process.argv[2]==='--check-archive'){checkArchive(process.argv[3]??archive);console.log('PASS archive checksum and scope');}
else{
 assert.equal(process.getuid(),0,'Run with sudo');
 if(process.argv[2]==='--probe')console.log(JSON.stringify(await probe(process.argv[3],process.argv[4]==='updated')));
 else{
  assert(['apply','rollback'].includes(process.argv[2]),'Use apply or rollback');
  const lock='/run/prizm-power-flow.lock',fd=fs.openSync(lock,'wx',0o600);
  try{if(process.argv[2]==='apply')await apply();else await rollback(JSON.parse(fs.readFileSync(backup+'/state.json')));}
  finally{fs.closeSync(fd);fs.unlinkSync(lock);}
 }
}
