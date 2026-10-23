/** Approved dashboard session rollout. Collector acquisition bundles stay unchanged. */
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
const release='/opt/prizm-fleet/releases/shift-sessions-20261002';
const backup='/var/lib/prizm-fleet/shift-sessions-20261002';
const archive='/home/ebc/prizm-shift-20261002.tgz';
const archiveHash='b98abf221a2b7b372ca8f7af080d6dca20de1e1773360b5171a46a76ac573f5f';
const previousCollectors='/opt/prizm-fleet/releases/cell-trend-20261002';
const previousFleet='/opt/prizm-fleet/releases/polling-tuned-20261001';
const ca='/etc/prizm-fleet/fleet/ca-cert.pem';
const plans=[
  {service:'prizm',site:'solar-star-3',station:'BHE0020'},
  {service:'prizm-site@ss4',site:'solar-star-4',station:'BHE0021'},
  {service:'prizm-fleet',site:'fleet'},
].map(p=>({...p,override:`/etc/systemd/system/${p.service}.service.d/zzzzzz-shift-sessions.conf`}));
const run=(file,args,options={})=>execFileSync(file,args,{encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024,...options}).trim();
const present=file=>{try{return fs.lstatSync(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const save=(file,value)=>{fs.writeFileSync(file+'.new',JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(file+'.new',file);};
const overrideText=p=>p.site==='fleet'
  ?`[Service]\nExecStart=\nExecStart=/usr/bin/node ${release}/dist/fleet-server.cjs\nWorkingDirectory=${release}\nEnvironment=PRIZM_SHIFT_MONITORING=true\n`
  :`[Service]\nEnvironment=PRIZM_PUBLIC_DIRECTORY=${release}/dist\n`;
function restoreOverride(p){
  if(!present(p.override))return;
  assert.equal(fs.readFileSync(p.override,'utf8'),overrideText(p),'Override changed externally; recovery stopped');
  fs.unlinkSync(p.override);
}
function checkArchive(){
  assert.equal(hash(archive),archiveHash,'Archive checksum mismatch');
  const entries=run('tar',['-tzf',archive]).split('\n');
  assert(entries.every(p=>p.startsWith('dist/')&&!p.split('/').includes('..')),'Unexpected archive path');
  for(const file of ['dist/fleet-server.cjs','dist/fleet.html','dist/index.html'])assert(entries.includes(file));
  const types=run('tar',['-tvzf',archive]).split('\n');
  assert(types.every(line=>line.startsWith('-')||line.startsWith('d')),'Archive links or special files rejected');
}
async function probe(site,updated){
  const config=JSON.parse(fs.readFileSync('/etc/prizm-fleet/fleet/fleet.json','utf8'));
  if(site==='fleet'){
    const request=(origin,pathname)=>new Promise((resolve,reject)=>{
      const url=new URL(origin);
      const req=https.get({hostname:config.bindAddress||'127.0.0.1',port:url.port,path:pathname,
        headers:{host:url.host},ca:fs.readFileSync(ca),checkServerIdentity:(_host,cert)=>tls.checkServerIdentity(url.hostname,cert)},res=>{
        let body='';res.setEncoding('utf8');res.on('data',part=>{body+=part;if(body.length>2*1024*1024)req.destroy(Error('Oversize probe'));});
        res.once('end',()=>resolve({status:res.statusCode,body}));
      });req.setTimeout(10000,()=>req.destroy(Error('TLS probe timeout')));req.once('error',reject);
    });
    const root=await request(config.origin,'/');assert.equal(root.status,200);
    if(updated)assert.equal(root.body,fs.readFileSync(release+'/dist/fleet.html','utf8'),'Fleet serves wrong UI');
    assert.equal((await request(config.origin,'/api/fleet/summary')).status,401);
    assert.equal((await request(config.origin,'/api/fleet/session')).status,401);
    for(const w of config.workspaces)assert.equal((await request(w.origin,'/api/fleet/workspace-context')).status,401);
    return {site,https:true,unauthenticatedAccessDenied:true,uiVerified:updated};
  }
  const p=plans.find(p=>p.site===site),c=config.collectors.find(c=>c.siteId===site),w=config.workspaces.find(w=>w.siteId===site);
  assert(p&&c&&w&&c.stationCode===p.station,'Unexpected site enrollment');
  const get=async(url,token)=>{
    const r=await fetch(url,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
    assert.equal(r.status,200);return r.json();
  };
  const summary=await get(c.url,c.token);
  assert.equal(summary.siteId,site);assert.equal(summary.stationCode,p.station);assert.equal(summary.stale,false);
  assert(Date.now()-Date.parse(summary.observedAt)<30000);
  assert.equal(summary.details.arrays.length,8);assert.equal(summary.details.pcs.length,8);assert.equal(summary.metrics.strings.value,320);
  const base=new URL(c.url).origin+'/api/fleet/workspace';
  const cells=await get(base+'/api/local/site-data/cells',w.token);
  assert.equal(cells.site,p.station+' / Block 1');assert.equal(cells.storage.enabled,true);assert.equal(cells.storage.retentionDays,7);
  assert.equal(cells.storage.lastError,null);assert(cells.storage.saved>0);assert(Date.now()-cells.acquiredAt<180000);
  const debug=await get(base+'/api/local/debug/coordinator',w.token);assert.equal(debug.metadataCadence.intervalMs,60000);
  const root=await fetch(base+'/',{headers:{authorization:'Bearer '+w.token},signal:AbortSignal.timeout(10000)});
  assert.equal(root.status,200);const html=await root.text();
  if(updated)assert.equal(html,fs.readFileSync(release+'/dist/index.html','utf8'),'Workspace serves wrong UI');
  const denied=await fetch(c.url,{signal:AbortSignal.timeout(10000)});assert.equal(denied.status,401);await denied.body?.cancel();
  return {site,station:p.station,observedAt:summary.observedAt,arrays:8,pcs:8,strings:320,
    cellsAcquiredAt:cells.acquiredAt,retentionDays:cells.storage.retentionDays,metadataIntervalMs:debug.metadataCadence.intervalMs,uiVerified:updated};
}
function isolatedProbe(site,updated){
  return JSON.parse(run('ip',['netns','exec','prizm-fleet',process.execPath,self,'--probe',site,...(updated?['updated']:[])],
    {timeout:90000,env:{...process.env,NODE_EXTRA_CA_CERTS:ca}}));
}
async function healthy(p,updated){
  const deadline=Date.now()+240000;let last;
  do{
    try{assert.equal(run('systemctl',['is-active',p.service]),'active');return isolatedProbe(p.site,updated);}
    catch(e){last=e;await new Promise(resolve=>setTimeout(resolve,5000));}
  }while(Date.now()<deadline);
  throw Error(p.service+' readiness failed: '+last.message.split('\n')[0]);
}
function validateState(state){
  assert(Array.isArray(state.changed)&&state.changed.length<=3);
  for(const p of state.changed){const expected=plans.find(item=>item.service===p.service);assert(expected);assert.equal(p.override,expected.override);assert.equal(p.site,expected.site);}
}
async function rollback(state){
  validateState(state);
  for(const p of [...state.changed].reverse()){
    if(p.restored)continue;
    console.log('Restoring '+p.service);run('systemctl',['stop',p.service]);restoreOverride(p);
    run('systemctl',['daemon-reload']);run('systemctl',['start',p.service]);await healthy(p,false);
    p.restored=true;save(backup+'/state.json',state);
  }
  state.rolledBack=true;save(backup+'/state.json',state);
  console.log('Previous dashboard software restored. Accounts, recorded data and network settings retained.');
}
async function apply(){
  assert(!present(release)&&!present(backup),'Deployment already exists; do not rerun apply');checkArchive();
  assert(Number(fs.statfsSync('/var/lib').bavail)*Number(fs.statfsSync('/var/lib').bsize)>20*1024**3);
  const state={at:new Date().toISOString(),changed:[],before:{},after:{}};
  for(const p of plans){
    assert(!present(p.override));
    const expected=(p.site==='fleet'?previousFleet+'/dist/fleet-server.cjs':previousCollectors+'/dist/server.cjs');
    assert(run('systemctl',['show',p.service,'-p','ExecStart','--value']).includes(expected),'Unexpected running release');
    state.before[p.service]=await healthy(p,false);
  }
  fs.mkdirSync(backup,{mode:0o700});save(backup+'/state.json',state);fs.copyFileSync(self,backup+'/deploy.mjs');
  fs.mkdirSync(release,{mode:0o755});run('tar',['--no-same-owner','-xzf',archive,'-C',release]);
  fs.symlinkSync('/opt/prizm-fleet/releases/workspaces-20261001/node_modules',release+'/node_modules');
  run('node',['--check',release+'/dist/fleet-server.cjs']);
  assert(fs.readFileSync(release+'/dist/fleet-server.cjs','utf8').includes('PRIZM_SHIFT_MONITORING'));
  try{
    for(const p of plans){
      state.changed.push({...p});save(backup+'/state.json',state);
      console.log('Updating '+p.service+'; other services remain running.');
      fs.mkdirSync(path.dirname(p.override),{recursive:true});fs.writeFileSync(p.override,overrideText(p),{mode:0o644,flag:'wx'});
      run('systemctl',['daemon-reload']);run('systemctl',['restart',p.service]);
      state.after[p.service]=await healthy(p,true);save(backup+'/state.json',state);console.log('PASS '+p.service);
    }
    for(const p of plans.filter(p=>p.site!=='fleet'))assert(run('systemctl',['show',p.service,'-p','ExecStart','--value']).includes(previousCollectors+'/dist/server.cjs'));
    state.completedAt=new Date().toISOString();save(backup+'/state.json',state);
    const report='/home/ebc/prizm-shift-result.json';save(report,{at:state.completedAt,before:state.before,after:state.after});
    const owner=fs.statSync('/home/ebc');fs.chownSync(report,owner.uid,owner.gid);
    console.log('Shift session deployment complete. Sign in again. Live user-session acceptance remains required.');
  }catch(e){console.error('Readiness failed; restoring changed services.');await rollback(state);throw e;}
}
function selfTest(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'prizm-shift-rollback-'));
  try{
    for(const plan of plans){
      const p={...plan,override:path.join(dir,plan.service+'.conf')};fs.writeFileSync(p.override,overrideText(p));
      restoreOverride(p);restoreOverride(p);assert(!present(p.override));
      fs.writeFileSync(p.override,'external change');assert.throws(()=>restoreOverride(p));assert.equal(fs.readFileSync(p.override,'utf8'),'external change');
      if(p.site!=='fleet')assert(!overrideText(p).includes('ExecStart'));
    }
    validateState({changed:plans});assert.throws(()=>validateState({changed:[{...plans[0],override:'/etc/other'}]}));
    console.log('PASS exact override rollback, repeated recovery, external-change rejection and unchanged collector executable scope');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
if(process.argv[2]==='--self-test')selfTest();
else if(process.argv[2]==='--check-archive'){checkArchive();console.log('PASS archive checksum, paths and file types');}
else{
  assert.equal(process.getuid(),0,'Run with sudo');
  if(process.argv[2]==='--probe')console.log(JSON.stringify(await probe(process.argv[3],process.argv[4]==='updated')));
  else if(process.argv[2]==='apply')await apply();
  else if(process.argv[2]==='rollback')await rollback(JSON.parse(fs.readFileSync(backup+'/state.json','utf8')));
  else throw Error('Use apply or rollback');
}
