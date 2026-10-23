/** Approved software-only Dell rollout. No network or equipment configuration writes. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import tls from 'node:tls';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const self=fileURLToPath(import.meta.url);
const release='/opt/prizm-fleet/releases/polling-tuned-20261001';
const backup='/var/lib/prizm-fleet/polling-tuned-20261001';
const archive='/home/ebc/prizm-polling-tuning-20261001.tgz';
const archiveHash='cd7c5e8d22c38488aa5e2d56e0b0787d07b474351ff877c060cf8448a058c8fd';
const ca='/etc/prizm-fleet/fleet/ca-cert.pem';
const run=(file,args,options={})=>execFileSync(file,args,{encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024,...options}).trim();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const plans=[
  {service:'prizm',site:'solar-star-3',worker:'/home/ebc/GreEnergy_PRIZM/dist'},
  {service:'prizm-site@ss4',site:'solar-star-4',worker:'/var/lib/prizm-sites/ss4/dist'},
  {service:'prizm-fleet',site:'fleet'},
].map(p=>({...p,override:`/etc/systemd/system/${p.service}.service.d/zzz-polling.conf`}));
const present=file=>{try{return fs.lstatSync(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const save=(file,value)=>{fs.writeFileSync(file+'.new',JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(file+'.new',file);};
function workerState(file){
  const stat=fs.lstatSync(file);
  if(stat.isSymbolicLink())return {kind:'link',target:fs.readlinkSync(file)};
  if(stat.isDirectory())return {kind:'directory',saved:file+'.before-polling-20261001'};
  throw Error('Unexpected worker path');
}
function installWorker(file,old,target){
  if(old.kind==='directory')fs.renameSync(file,old.saved);
  const temp=file+'.polling-new';fs.symlinkSync(target,temp);fs.renameSync(temp,file);
}
function restoreWorker(file,old,target){
  const stat=present(file);
  if(stat?.isSymbolicLink()&&fs.readlinkSync(file)===target)fs.unlinkSync(file);
  else if(stat){
    if(old.kind==='directory'&&stat.isDirectory()&&!present(old.saved))return;
    if(old.kind==='link'&&stat.isSymbolicLink()&&fs.readlinkSync(file)===old.target)return;
    throw Error('Worker path changed unexpectedly; recovery stopped');
  }
  if(old.kind==='directory')fs.renameSync(old.saved,file);else fs.symlinkSync(old.target,file);
  const temp=file+'.polling-new';
  if(present(temp)?.isSymbolicLink()&&fs.readlinkSync(temp)===target)fs.unlinkSync(temp);
}
const flags=`Environment=PRIZM_FLEET_REFRESH_MS=1000\nEnvironment=PRIZM_SNAPSHOT_MIN_INTERVAL_MS=60000\nEnvironment=PRIZM_SNAPSHOT_QUEUE_MAX_MB=192\nEnvironment=PRIZM_SNAPSHOT_WORKER_RECYCLE=true\nEnvironment=PRIZM_EMS_METADATA_INTERVAL_MS=60000\nEnvironment=PRIZM_STRINGVIEWER_MAX_CONCURRENCY=4\nEnvironment=PRIZM_STRINGVIEWER_REQUEST_SPACING_MS=50\n`;
function overrideText(p){return `[Service]\nExecStart=\nExecStart=/usr/bin/node ${release}/dist/${p.site==='fleet'?'fleet-server':'server'}.cjs\n`+(p.site==='fleet'?`WorkingDirectory=${release}\nEnvironment=PRIZM_FLEET_REFRESH_MS=1000\n`:`Environment=PRIZM_PUBLIC_DIRECTORY=${release}/dist\n${flags}`);}

async function probe(site,tuned){
  const config=JSON.parse(fs.readFileSync('/etc/prizm-fleet/fleet/fleet.json','utf8'));
  if(site==='fleet'){
    const origin=new URL(config.origin);
    const request=urlPath=>new Promise((resolve,reject)=>{
      const req=https.get({hostname:config.bindAddress||'127.0.0.1',port:origin.port||443,path:urlPath,
        headers:{host:origin.host},ca:fs.readFileSync(ca),checkServerIdentity:(_host,cert)=>tls.checkServerIdentity(origin.hostname,cert)},res=>{
        res.resume();res.once('end',()=>resolve(res.statusCode));
      });req.setTimeout(10000,()=>req.destroy(Error('TLS probe timeout')));req.once('error',reject);
    });
    assert.equal(await request('/'),200);assert.equal(await request('/api/fleet/summary'),401);
    return {site,https:true,unauthenticatedSummaryDenied:true};
  }
  const c=config.collectors.find(c=>c.siteId===site),w=config.workspaces.find(w=>w.siteId===site);
  assert(c&&w);
  const get=async(url,token)=>{
    const r=await fetch(url,{headers:token?{authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error('Probe HTTP '+r.status);return r.json();
  };
  const data=await get(c.url,c.token);
  assert.equal(data.schema,'prizm-site-summary-v1');assert.equal(data.siteId,c.siteId);assert.equal(data.stationCode,c.stationCode);
  assert.equal(data.stale,false);assert(Date.now()-Date.parse(data.observedAt)<30000);
  assert.equal(data.details.arrays.length,8);assert.equal(data.details.pcs.length,8);assert.equal(data.metrics.strings.value,320);
  const denied=await fetch(c.url,{signal:AbortSignal.timeout(10000)});assert.equal(denied.status,401);await denied.body?.cancel();
  const debug=await get(new URL(c.url).origin+'/api/fleet/workspace/api/local/debug/coordinator',w.token);
  if(tuned)assert.equal(debug.metadataCadence.intervalMs,60000);
  return {site,station:data.stationCode,observedAt:data.observedAt,strings:data.metrics.strings.value,arrays:8,pcs:8,
    metadataCadence:debug.metadataCadence,lastCompletedDuration:debug.lastCompletedDuration,
    cachePersistence:debug.cachePersistence,cycleHistory:debug.cycleHistory,
    pcsReadings:data.details.pcs.map(p=>({array:p.array,status:p.status,acContactor:p.acContactor,insulationKohm:p.insulationKohm,maxIgbtF:p.maxIgbtF}))};
}
function isolatedProbe(site,tuned){
  return JSON.parse(run('ip',['netns','exec','prizm-fleet',process.execPath,self,'--probe',site,...(tuned?['tuned']:[])],
    {timeout:45000,env:{...process.env,NODE_EXTRA_CA_CERTS:ca}}));
}
async function healthy(p,tuned){
  const deadline=Date.now()+150000;let last;
  do{
    try{assert.equal(run('systemctl',['is-active',p.service]),'active');return isolatedProbe(p.site,tuned);}
    catch(e){last=e;await sleep(5000);}
  }while(Date.now()<deadline);
  throw Error(p.service+' failed readiness: '+last.message.split('\n')[0]);
}
async function rollback(state){
  if(state.rolledBack)return;
  for(const p of [...state.changed].reverse()){
    console.log('Restoring '+p.service);
    run('systemctl',['stop',p.service]);
    if(present(p.override)){
      assert.equal(fs.readFileSync(p.override,'utf8'),overrideText(p));fs.unlinkSync(p.override);
    }
    if(p.worker)restoreWorker(p.worker,p.oldWorker,release+'/dist');
    run('systemctl',['daemon-reload']);run('systemctl',['start',p.service]);
    await healthy(p,false);
  }
  state.rolledBack=true;save(backup+'/state.json',state);console.log('Previous service files and settings restored.');
}
async function apply(){
  assert(!present(release)&&!present(backup),'Deployment already exists; do not rerun apply');
  assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),archiveHash,'Archive checksum mismatch');
  const entries=run('tar',['-tzf',archive]).split('\n');
  assert(entries.every(p=>p.startsWith('dist/')&&!p.split('/').includes('..')),'Unexpected archive entry');
  for(const p of plans){
    assert(!present(p.override));if(p.worker){p.oldWorker=workerState(p.worker);if(p.oldWorker.saved)assert(!present(p.oldWorker.saved));assert(!present(p.worker+'.polling-new'));}
    await healthy(p,false);
  }
  fs.mkdirSync(backup,{mode:0o700});const state={at:new Date().toISOString(),changed:[],before:{},after:{}};
  for(const p of plans)state.before[p.service]=isolatedProbe(p.site,false);
  save(backup+'/state.json',state);fs.copyFileSync(self,backup+'/deploy.mjs');
  fs.mkdirSync(release,{mode:0o755});run('tar',['--no-same-owner','-xzf',archive,'-C',release]);
  fs.symlinkSync('/opt/prizm-fleet/releases/workspaces-20261001/node_modules',release+'/node_modules');
  run('node',['--check',release+'/dist/server.cjs']);run('node',['--check',release+'/dist/fleet-server.cjs']);
  try{
    for(const p of plans){
      state.changed.push(p);save(backup+'/state.json',state);console.log('Updating '+p.service+' only...');
      run('systemctl',['stop',p.service]);
      if(p.worker)installWorker(p.worker,p.oldWorker,release+'/dist');
      fs.mkdirSync(path.dirname(p.override),{recursive:true});fs.writeFileSync(p.override,overrideText(p),{mode:0o644});
      run('systemctl',['daemon-reload']);run('systemctl',['start',p.service]);
      state.after[p.service]=await healthy(p,true);save(backup+'/state.json',state);console.log('PASS '+p.service+' readiness');
    }
    console.log('All services ready. Gathering a short post-update sample...');await sleep(60000);
    for(const p of plans)state.after[p.service]=await healthy(p,true);
    state.completedAt=new Date().toISOString();save(backup+'/state.json',state);
    const report='/home/ebc/prizm-tuning-result.json';save(report,{at:state.completedAt,before:state.before,after:state.after});
    const owner=fs.statSync('/home/ebc');fs.chownSync(report,owner.uid,owner.gid);
    console.log('Polling tuning complete. Saved verification report. No equipment or network settings changed.');
  }catch(error){console.error('Readiness failed; restoring previous releases.');await rollback(state);throw error;}
}
function selfTest(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'prizm-tuning-recovery-'));
  for(const kind of ['directory','link']){
    const file=path.join(root,kind),target=path.join(root,'new'),oldTarget=path.join(root,'old');
    if(kind==='directory'){fs.mkdirSync(file);fs.writeFileSync(path.join(file,'preserved'),'original');}else fs.symlinkSync(oldTarget,file);
    const old=workerState(file);installWorker(file,old,target);assert.equal(fs.readlinkSync(file),target);
    restoreWorker(file,old,target);restoreWorker(file,old,target);
    if(kind==='directory')assert.equal(fs.readFileSync(path.join(file,'preserved'),'utf8'),'original');else assert.equal(fs.readlinkSync(file),oldTarget);
  }
  console.log('PASS rollback restores directory contents and link targets; repeated recovery is harmless. Fixtures: '+root);
}
if(process.argv[2]==='--self-test')selfTest();
else{
  assert.equal(process.getuid(),0,'Run with sudo');
  if(process.argv[2]==='--probe')console.log(JSON.stringify(await probe(process.argv[3],process.argv[4]==='tuned')));
  else if(process.argv[2]==='apply')await apply();
  else if(process.argv[2]==='rollback')await rollback(JSON.parse(fs.readFileSync(backup+'/state.json','utf8')));
  else throw Error('Use apply or rollback');
}
