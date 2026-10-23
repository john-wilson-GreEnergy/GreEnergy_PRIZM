/** Frontend-only SS3/SS4 rollout. No collector executable, Fleet, network or equipment changes. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const self=fileURLToPath(import.meta.url);
const release='/opt/prizm-fleet/releases/operations-ui-20261015';
const previous='/opt/prizm-fleet/releases/shift24-sessions-20261015/dist';
const collector='/opt/prizm-fleet/releases/cell-trend-20261002/dist/server.cjs';
const backup='/var/lib/prizm-fleet/operations-ui-20261015';
const archive='/home/ebc/prizm-operations-ui-20261015.tgz';
const archiveHash='3e14bd7267891bb3dd1594cf1c9098fa1727ac693e6978a06e42ac0aeddaa4c5';
const ca='/etc/prizm-fleet/fleet/ca-cert.pem';
const report='/home/ebc/prizm-operations-ui-result.json';
const plans=[{service:'prizm',site:'solar-star-3',station:'BHE0020'},
  {service:'prizm-site@ss4',site:'solar-star-4',station:'BHE0021'}]
  .map(p=>({...p,override:`/etc/systemd/system/${p.service}.service.d/zzzzzzzzzz-operations-ui-20261015.conf`}));
const run=(file,args,options={})=>execFileSync(file,args,{encoding:'utf8',timeout:90000,maxBuffer:24*1024*1024,...options}).trim();
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const present=file=>{try{return fs.lstatSync(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const save=(file,value)=>{fs.writeFileSync(file+'.new',JSON.stringify(value,null,2),{mode:0o600,flag:'wx'});fs.renameSync(file+'.new',file);};
const overrideText=()=>`[Service]\nEnvironment=PRIZM_PUBLIC_DIRECTORY=${release}/dist\n`;
const property=(service,key)=>run('systemctl',['show',service,'-p',key,'--value']);
function checkPaths(entries,types){
  assert(entries.length>3&&entries.length<500,'Unexpected archive size');
  assert.equal(new Set(entries).size,entries.length,'Duplicate archive paths');
  assert(entries.every(p=>p==='dist/index.html'||p==='dist/logo-transparent.svg'||p==='dist/assets/'||/^dist\/assets\/[A-Za-z0-9_.-]+\.(js|css|svg)$/.test(p)),'Unexpected archive path');
  assert(entries.includes('dist/index.html')&&entries.includes('dist/logo-transparent.svg'));
  assert(types.every(line=>line.startsWith('-')||line.startsWith('d')),'Links or special files rejected');
}
function checkArchive(file=archive){
  assert(present(file)?.isFile()&&!present(file).isSymbolicLink());
  assert.equal(hash(file),archiveHash,'Archive checksum mismatch');
  checkPaths(run('tar',['-tzf',file]).split('\n'),run('tar',['-tvzf',file]).split('\n'));
}
function restoreOverride(p){
  if(!present(p.override))return;
  assert(!present(p.override).isSymbolicLink(),'Override is now a symbolic link');
  assert.equal(fs.readFileSync(p.override,'utf8'),overrideText(),'Override changed externally; recovery stopped');
  fs.unlinkSync(p.override);
}
function validateState(state){
  assert(Array.isArray(state.changed)&&state.changed.length<=2);
  assert.equal(new Set(state.changed.map(p=>p.service)).size,state.changed.length);
  for(const p of state.changed){const expected=plans.find(q=>q.service===p.service);assert(expected);assert.equal(p.override,expected.override);assert.equal(p.site,expected.site);}
}
async function probe(site,updated){
  const config=JSON.parse(fs.readFileSync('/etc/prizm-fleet/fleet/fleet.json','utf8'));
  const p=plans.find(p=>p.site===site),c=config.collectors.find(c=>c.siteId===site),w=config.workspaces.find(w=>w.siteId===site);
  assert(p&&c&&w&&c.stationCode===p.station,'Unexpected enrollment');
  const get=async(url,token,format='json')=>{
    const r=await fetch(url,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
    assert.equal(r.status,200,'Read-only endpoint unavailable');return format==='json'?r.json():r.text();
  };
  const summary=await get(c.url,c.token);
  assert.equal(summary.siteId,site);assert.equal(summary.stationCode,p.station);assert.equal(summary.stale,false);
  assert(Date.now()-Date.parse(summary.observedAt)<45000,'Summary not fresh');
  assert.equal(summary.details.arrays.length,8);assert.equal(summary.details.pcs.length,8);
  const base=new URL(c.url).origin+'/api/fleet/workspace';
  const snapshot=await get(base+'/api/local/site-data/snapshot?view=corrective-actions',w.token);
  assert.equal(snapshot.siteIdentity.stationCode,p.station);assert.equal(snapshot.siteIdentity.blockIndex,1);
  assert.equal(snapshot.liveStatus.stale,false,'Canonical snapshot stale');
  const review=snapshot.normalized?.notificationReview;
  assert(review&&Array.isArray(review.groups)&&review.totals,'Canonical notification review missing');
  const html=await get(base+'/',w.token,'text');
  const dist=updated?release+'/dist':previous;
  assert.equal(html,fs.readFileSync(dist+'/index.html','utf8'),'Wrong frontend served');
  if(updated){assert(html.includes('data-prizm-operations="enabled"'));assert(!html.includes('data-prizm-local-review'));}
  const assets=[...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g)].map(m=>m[1]);
  assert(assets.length>=2);
  for(const asset of assets)assert.equal(await get(base+asset,w.token,'text'),fs.readFileSync(dist+asset,'utf8'),'Asset mismatch');
  const denied=await fetch(c.url,{signal:AbortSignal.timeout(10000)});assert.equal(denied.status,401);await denied.body?.cancel();
  return {site,station:p.station,observedAt:summary.observedAt,arrays:8,pcs:8,groups:review.groups.length,
    canonicalTotals:review.totals,uiVerified:true,operationsDefault:updated,unauthenticatedAccessDenied:true};
}
function isolatedProbe(p,updated){
  return JSON.parse(run('ip',['netns','exec','prizm-fleet',process.execPath,backup+'/deploy.mjs','--probe',p.site,...(updated?['updated']:[])],
    {env:{...process.env,NODE_EXTRA_CA_CERTS:ca}}));
}
async function healthy(p,updated){
  const deadline=Date.now()+240000;let attempts=0;
  do{
    try{assert.equal(property(p.service,'ActiveState'),'active');return isolatedProbe(p,updated);}
    catch{attempts++;if(attempts===1||attempts%6===0)console.log(`Waiting for ${p.service} to serve fresh data (${attempts})...`);await new Promise(r=>setTimeout(r,5000));}
  }while(Date.now()<deadline);
  throw Error(p.service+' readiness failed; no equipment commands were sent');
}
function writeReport(state){
  // Contains only aggregate health results, never credentials or device payloads.
  const output={completedAt:state.completedAt,rolledBack:state.rolledBack,before:state.before,after:state.after,fleetUnchanged:state.fleetUnchanged};
  assert(!present(report)||present(report).isFile()&&!present(report).isSymbolicLink());
  save(report,output);const owner=fs.statSync('/home/ebc');fs.chownSync(report,owner.uid,owner.gid);
}
async function rollback(state){
  validateState(state);
  for(const p of [...state.changed].reverse()){
    if(p.restored)continue;
    console.log('Restoring previous interface for '+p.service);
    restoreOverride(p);run('systemctl',['daemon-reload']);run('systemctl',['restart',p.service]);
    await healthy(p,false);p.restored=true;save(backup+'/state.json',state);
  }
  state.rolledBack=true;save(backup+'/state.json',state);writeReport(state);
  console.log('Previous interface restored. Fleet, equipment settings and recorded data retained.');
}
async function apply(){
  assert(!present(release)&&!present(backup),'Deployment already staged; inspect saved state rather than rerunning apply');
  checkArchive();
  const stats=fs.statfsSync('/opt');assert(Number(stats.bavail)*Number(stats.bsize)>1024**3,'Insufficient free space');
  for(const p of plans){
    assert(!present(p.override),'Override already exists');
    assert(property(p.service,'ExecStart').includes(collector),'Unexpected collector executable');
    assert(property(p.service,'Environment').includes('PRIZM_PUBLIC_DIRECTORY='+previous),'Unexpected frontend baseline');
    assert.equal(property(p.service,'ActiveState'),'active');
  }
  assert.equal(property('prizm-fleet','ActiveState'),'active');
  const state={startedAt:new Date().toISOString(),changed:[],before:{},after:{},fleetPid:property('prizm-fleet','MainPID')};
  fs.mkdirSync(backup,{mode:0o700});save(backup+'/state.json',state);
  fs.copyFileSync(self,backup+'/deploy.mjs',fs.constants.COPYFILE_EXCL);fs.chmodSync(backup+'/deploy.mjs',0o600);
  fs.copyFileSync(archive,backup+'/frontend.tgz',fs.constants.COPYFILE_EXCL);checkArchive(backup+'/frontend.tgz');
  for(const p of plans)state.before[p.service]=await healthy(p,false);
  save(backup+'/state.json',state);
  fs.mkdirSync(release,{mode:0o755});fs.mkdirSync(release+'/dist',{mode:0o755});
  // Keep old hashed chunks available to already-open tabs; never copy backend executables.
  fs.cpSync(previous+'/assets',release+'/dist/assets',{recursive:true});
  run('tar',['--no-same-owner','--no-same-permissions','-xzf',backup+'/frontend.tgz','-C',release]);
  const html=fs.readFileSync(release+'/dist/index.html','utf8');
  assert(html.includes('data-prizm-operations="enabled"')&&!html.includes('data-prizm-local-review'));
  assert(!present(release+'/dist/server.cjs')&&!present(release+'/dist/fleet-server.cjs'));
  try{
    for(const p of plans){
      state.changed.push({...p});save(backup+'/state.json',state);
      console.log('Updating '+p.service+' only. Other services remain running.');
      fs.writeFileSync(p.override,overrideText(),{mode:0o644,flag:'wx'});
      run('systemctl',['daemon-reload']);run('systemctl',['restart',p.service]);
      state.after[p.service]=await healthy(p,true);
      assert(property(p.service,'ExecStart').includes(collector),'Collector executable changed');
      save(backup+'/state.json',state);console.log('PASS '+p.service+' — interface, fresh data, site identity and authentication');
    }
    state.fleetUnchanged=property('prizm-fleet','MainPID')===state.fleetPid;
    assert(state.fleetUnchanged,'Fleet unexpectedly restarted');
    state.completedAt=new Date().toISOString();save(backup+'/state.json',state);writeReport(state);
    console.log('Operations UI deployment complete on SS3 and SS4. Reload both workspace tabs.');
  }catch(e){console.error('Validation failed. Restoring previous interfaces.');await rollback(state);throw e;}
}
function selfTest(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'prizm-operations-rollback-'));
  try{
    for(const plan of plans){
      const p={...plan,override:path.join(dir,plan.service+'.conf')};
      fs.writeFileSync(p.override,overrideText());restoreOverride(p);restoreOverride(p);assert(!present(p.override));
      fs.writeFileSync(p.override,'external change');assert.throws(()=>restoreOverride(p));assert.equal(fs.readFileSync(p.override,'utf8'),'external change');
    }
    assert(!overrideText().includes('ExecStart'));assert(!plans.some(p=>p.service==='prizm-fleet'));
    validateState({changed:plans});assert.throws(()=>validateState({changed:[plans[0],plans[0]]}));
    assert.throws(()=>validateState({changed:[{...plans[0],override:'/etc/other'}]}));
    const valid=['dist/index.html','dist/logo-transparent.svg','dist/assets/','dist/assets/workspace-test.js'];
    checkPaths(valid,['- file','d dir']);
    for(const bad of ['dist/server.cjs','../etc/passwd','dist/assets/../../x','/etc/x'])assert.throws(()=>checkPaths([...valid,bad],['- file']));
    assert.throws(()=>checkPaths(valid,['l link']));assert.throws(()=>checkPaths([...valid,valid[0]],['- file']));
    console.log('PASS frontend-only scope, archive allowlist, exact rollback, repeated recovery and external-change protection');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
if(process.argv[2]==='--self-test')selfTest();
else if(process.argv[2]==='--check-archive'){checkArchive(process.argv[3]||archive);console.log('PASS archive checksum, paths and types');}
else{
  assert.equal(process.getuid(),0,'Run with sudo');
  if(process.argv[2]==='--probe')console.log(JSON.stringify(await probe(process.argv[3],process.argv[4]==='updated')));
  else{
    assert(['apply','rollback'].includes(process.argv[2]),'Use apply or rollback');
    const lock='/run/prizm-operations-ui-deploy.lock';const fd=fs.openSync(lock,'wx',0o600);
    try{if(process.argv[2]==='apply')await apply();else await rollback(JSON.parse(fs.readFileSync(backup+'/state.json','utf8')));}
    finally{fs.closeSync(fd);fs.unlinkSync(lock);}
  }
}
