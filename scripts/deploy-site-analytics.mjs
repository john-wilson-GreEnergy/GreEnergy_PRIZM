/** Fixed SS3/SS4/Fleet software rollout. No account, equipment or network changes. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import tls from 'node:tls';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const self=fileURLToPath(import.meta.url);
const release='/opt/prizm-fleet/releases/site-analytics-20261019';
const backup='/var/lib/prizm-fleet/site-analytics-20261019';
const archive='/home/ebc/prizm-analytics-20261019.tgz';
const archiveHash='f8281283f6e0b56c48127580940a44f8981bbd45c0675545a174701c39f4f998';
const previousCollector='/opt/prizm-fleet/releases/cell-trend-20261002';
const previousFleet='/opt/prizm-fleet/releases/shift24-sessions-20261015';
const previousUi='/opt/prizm-fleet/releases/operations-ui-20261015';
const dependencies='/opt/prizm-fleet/releases/workspaces-20261001/node_modules';
const ca='/etc/prizm-fleet/fleet/ca-cert.pem';
const report='/home/ebc/prizm-analytics-result.json';
const plans=[
  {service:'prizm',site:'solar-star-3',station:'BHE0020',cwd:'/home/ebc/GreEnergy_PRIZM'},
  {service:'prizm-site@ss4',site:'solar-star-4',station:'BHE0021',cwd:'/var/lib/prizm-sites/ss4'},
  {service:'prizm-fleet',site:'fleet',cwd:previousFleet},
].map(p=>({...p,override:`/etc/systemd/system/${p.service}.service.d/zzzzzzzzzzz-analytics-20261019.conf`,worker:p.site==='fleet'?null:p.cwd+'/dist'}));
const run=(file,args,options={})=>execFileSync(file,args,{encoding:'utf8',timeout:90000,maxBuffer:12*1024*1024,...options}).trim();
const present=file=>{try{return fs.lstatSync(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const save=(file,value)=>{fs.writeFileSync(file+'.new',JSON.stringify(value,null,2),{mode:0o600,flag:'wx'});fs.renameSync(file+'.new',file);};
const property=(p,key)=>run('systemctl',['show',p.service,'-p',key,'--value']);
const overrideText=p=>`[Service]\nExecStart=\nExecStart=/usr/bin/node ${release}/dist/${p.site==='fleet'?'fleet-server':'server'}.cjs\n`+(p.site==='fleet'?`WorkingDirectory=${release}\n`:`Environment=PRIZM_PUBLIC_DIRECTORY=${release}/dist\n`);
function checkEntries(entries,types){
  assert(entries.length>10&&entries.length<500&&new Set(entries).size===entries.length,'Invalid archive entry count');
  assert(entries.every(p=>/^dist\/(?:[A-Za-z0-9_.-]+\.(?:html|svg|cjs|map)|assets\/(?:[A-Za-z0-9_.-]+\.(?:js|css|svg))?)$/.test(p)),'Archive path outside release allowlist');
  assert(types.every(t=>t.startsWith('-')||t.startsWith('d')),'Archive links/special files forbidden');
  for(const f of ['server.cjs','fleet-server.cjs','cell-history-worker.cjs','history-query-worker.cjs','snapshot-cache-worker.cjs','analytics-verifier.cjs','index.html','fleet.html'])assert(entries.includes('dist/'+f),'Missing '+f);
}
function checkArchive(file=archive){
  assert(present(file)?.isFile()&&!present(file).isSymbolicLink());assert.equal(hash(file),archiveHash,'Release checksum mismatch');
  checkEntries(run('tar',['-tzf',file]).split('\n'),run('tar',['-tvzf',file]).split('\n'));
}
function switchWorker(file,expected,target){
  assert(present(file)?.isSymbolicLink()&&fs.readlinkSync(file)===expected,'Worker link changed');
  assert(!present(file+'.analytics-next'));fs.symlinkSync(target,file+'.analytics-next');fs.renameSync(file+'.analytics-next',file);
}
function restoreOverride(p){
  if(!present(p.override))return;
  assert(present(p.override).isFile()&&!present(p.override).isSymbolicLink());
  assert.equal(fs.readFileSync(p.override,'utf8'),overrideText(p),'Override changed externally');fs.unlinkSync(p.override);
}
function validateState(state){
  assert(Array.isArray(state.changed)&&state.changed.length<=3);
  assert.equal(new Set(state.changed).size,state.changed.length);
  for(const service of state.changed)assert(plans.some(p=>p.service===service),'Unrecognized service');
}
function configHashes(){
  const config=JSON.parse(fs.readFileSync('/etc/prizm-fleet/fleet/fleet.json','utf8'));
  return Object.fromEntries(['/etc/prizm-fleet/fleet/fleet.json',config.accountsFile,'/etc/prizm-fleet/ss3/export.json','/etc/prizm-fleet/ss4/export.json'].map(f=>[f,hash(f)]));
}
async function probe(site,updated){
  const config=JSON.parse(fs.readFileSync('/etc/prizm-fleet/fleet/fleet.json','utf8'));
  if(site==='fleet'){
    const request=(origin,pathname)=>new Promise((resolve,reject)=>{
      const url=new URL(origin),address=!config.bindAddress||config.bindAddress==='0.0.0.0'?'127.0.0.1':config.bindAddress;
      const req=https.get({hostname:address,port:url.port,path:pathname,headers:{host:url.host},ca:fs.readFileSync(ca),checkServerIdentity:(_host,cert)=>tls.checkServerIdentity(url.hostname,cert)},res=>{
        let body='';res.setEncoding('utf8');res.on('data',s=>{body+=s;if(body.length>4*1024*1024)req.destroy(Error('Oversize response'));});res.once('end',()=>resolve({status:res.statusCode,body}));
      });req.setTimeout(15000,()=>req.destroy(Error('TLS timeout')));req.once('error',reject);
    });
    const root=await request(config.origin,'/');assert.equal(root.status,200);
    assert.equal(root.body,fs.readFileSync((updated?release:previousFleet)+'/dist/fleet.html','utf8'),'Wrong Fleet UI');
    for(const endpoint of ['/api/fleet/summary','/api/fleet/session'])assert.equal((await request(config.origin,endpoint)).status,401);
    for(const w of config.workspaces)assert.equal((await request(w.origin,'/api/fleet/workspace-context')).status,401);
    for(const match of root.body.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g)){
      const asset=await request(config.origin,match[1]);assert.equal(asset.status,200);assert.equal(asset.body,fs.readFileSync((updated?release:previousFleet)+'/dist'+match[1],'utf8'));
    }
    return {site,uiVerified:true,https:true,unauthenticatedAccessDenied:true};
  }
  const p=plans.find(p=>p.site===site),c=config.collectors.find(c=>c.siteId===site),w=config.workspaces.find(w=>w.siteId===site);
  assert(p&&c&&w&&c.stationCode===p.station,'Unexpected enrollment');
  const get=async(url,token,format='json')=>{const r=await fetch(url,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,'Read-only endpoint unavailable');return format==='json'?r.json():r.text();};
  const summary=await get(c.url,c.token);assert.equal(summary.siteId,site);assert.equal(summary.stationCode,p.station);assert.equal(summary.stale,false);
  assert(Date.now()-Date.parse(summary.observedAt)<45000,'Summary stale');assert.equal(summary.details.arrays.length,8);assert.equal(summary.details.pcs.length,8);assert.equal(summary.metrics.strings.value,320);
  const base=new URL(c.url).origin+'/api/fleet/workspace',label=p.station+' / Block 1';
  const cells=await get(base+'/api/local/site-data/cells',w.token);
  assert.equal(cells.site,label);assert.equal(cells.storage.enabled,true);assert.equal(cells.storage.retentionDays,7);assert.equal(cells.storage.maxBytes,8*1024**3);assert.equal(cells.storage.lastError,null);
  assert(Date.now()-cells.acquiredAt<180000,'Cell recorder stale');assert(cells.storage.saved>0);
  const debug=await get(base+'/api/local/debug/coordinator',w.token);assert.equal(debug.metadataCadence.intervalMs,60000);
  const baseline=updated?JSON.parse(fs.readFileSync(backup+'/state.json','utf8')).before[p.service]:null;
  const savedAt=baseline?.savedAt??cells.storage.lastSavedAt;assert(Number.isFinite(savedAt));
  const saved=await get(base+'/api/local/site-data/cells/snapshot?array=1&metric=millivolts&at='+savedAt,w.token);
  assert.equal(saved.acquiredAt,savedAt);assert.equal(saved.historical,true);assert.equal(saved.statistics.total,16800);
  const frameHash=digest(saved.strings);if(baseline)assert.equal(frameHash,baseline.frameHash,'Existing cell recording changed');
  const html=await get(base+'/',w.token,'text');assert.equal(html,fs.readFileSync((updated?release:previousUi)+'/dist/index.html','utf8'),'Wrong workspace UI');
  assert(!html.includes('data-prizm-local-review'),'Local-only preview must not be deployed');
  for(const m of html.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g))assert.equal(await get(base+m[1],w.token,'text'),fs.readFileSync((updated?release:previousUi)+'/dist'+m[1],'utf8'));
  const denied=await fetch(c.url,{signal:AbortSignal.timeout(10000)});assert.equal(denied.status,401);await denied.body?.cancel();
  const result={site,station:p.station,observedAt:summary.observedAt,strings:320,arrays:8,pcs:8,savedAt,frameHash,cellArchiveVerified:true,uiVerified:true};
  if(updated){
    const verifier=createRequire(import.meta.url)(release+'/dist/analytics-verifier.cjs');
    verifier.parseSummary(summary,c);
    const charts=verifier.parseOperatingCharts(summary.operatingCharts);assert(charts&&charts.site===label);assert.equal(charts.distribution.length,320);assert.equal(charts.recordingError,null);assert(Date.now()-charts.capturedAt<30000);assert(charts.power.length>0);
    const analytics=await get(base+'/api/local/site-data/analytics',w.token);assert.equal(analytics.site,label);assert.equal(analytics.historical,false);assert(analytics.metrics.length>0);verifier.parseOperatingCharts(analytics.operatingCharts);
    const index=await get(base+'/api/local/site-data/cells/index?limit=1000',w.token);assert.equal(index.site,label);assert.equal(index.sampled,false);assert(index.timestamps.length>0);assert(index.total>=index.timestamps.length);
    const exactIndex=await get(base+'/api/local/site-data/cells/index?from='+savedAt+'&to='+savedAt,w.token);assert.deepEqual(exactIndex.timestamps,[savedAt]);
    const files=fs.readdirSync(p.cwd+'/.prizm-data/operating-charts').filter(f=>/^[a-f0-9]{64}\.json$/.test(f));
    assert(files.some(f=>{const file=p.cwd+'/.prizm-data/operating-charts/'+f,st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink())return false;const v=JSON.parse(fs.readFileSync(file,'utf8'));return v.charts?.site===label&&v.charts.power.length>0&&Date.now()-v.charts.capturedAt<90000&&(st.mode&0o777)===0o600;}),'No private persisted power sample');
    Object.assign(result,{analyticsVerified:true,exactReplayVerified:true,retainedFrames:index.total,powerSamples:charts.power.length,powerPersistenceVerified:true,fleetPayloadValidated:true});
  }
  return result;
}
function isolatedProbe(p,updated){return JSON.parse(run('ip',['netns','exec','prizm-fleet',process.execPath,backup+'/deploy.mjs','--probe',p.site,updated?'updated':'previous'],{env:{...process.env,NODE_EXTRA_CA_CERTS:ca},timeout:120000}));}
async function healthy(p,updated){
  const deadline=Date.now()+240000;let attempts=0;
  do{try{assert.equal(property(p,'ActiveState'),'active');return isolatedProbe(p,updated);}catch{attempts++;console.log(`Waiting for ${p.service} fresh data (${attempts})`);await new Promise(r=>setTimeout(r,5000));}}while(Date.now()<deadline);
  throw Error(p.service+' did not pass read-only validation');
}
function writeReport(state){
  assert(!present(report)||present(report).isFile()&&!present(report).isSymbolicLink());
  save(report,{completedAt:state.completedAt,rolledBack:state.rolledBack,before:state.before,after:state.after});const owner=fs.statSync('/home/ebc');fs.chownSync(report,owner.uid,owner.gid);
}
async function rollback(state){
  validateState(state);state.restored??=[];
  for(const service of [...state.changed].reverse()){
    if(state.restored.includes(service))continue;const p=plans.find(p=>p.service===service);
    console.log('Restoring '+service);run('systemctl',['stop',service]);restoreOverride(p);
    if(p.worker){const current=fs.readlinkSync(p.worker);if(current===release+'/dist')switchWorker(p.worker,current,previousCollector+'/dist');else assert.equal(current,previousCollector+'/dist');}
    run('systemctl',['daemon-reload']);run('systemctl',['start',service]);await healthy(p,false);state.restored.push(service);save(backup+'/state.json',state);
  }
  state.rolledBack=true;save(backup+'/state.json',state);writeReport(state);console.log('Rollback complete. Previous software and recorded data retained.');
}
async function apply(){
  assert(!present(release)&&!present(backup),'Already staged: inspect state; do not rerun apply');checkArchive();
  assert(Number(fs.statfsSync('/var/lib').bavail)*Number(fs.statfsSync('/var/lib').bsize)>20*1024**3,'Insufficient disk reserve');
  for(const p of plans){
    assert(!present(p.override));assert.equal(property(p,'ActiveState'),'active');assert.equal(property(p,'WorkingDirectory'),p.cwd);
    assert(property(p,'ExecStart').includes((p.site==='fleet'?previousFleet:previousCollector)+'/dist/'+(p.site==='fleet'?'fleet-server':'server')+'.cjs'),'Unexpected executable');
    if(p.worker){assert(present(p.worker)?.isSymbolicLink());assert.equal(fs.readlinkSync(p.worker),previousCollector+'/dist');assert(property(p,'Environment').includes('PRIZM_PUBLIC_DIRECTORY='+previousUi+'/dist'));}
  }
  fs.mkdirSync(backup,{mode:0o700});fs.copyFileSync(self,backup+'/deploy.mjs',fs.constants.COPYFILE_EXCL);fs.chmodSync(backup+'/deploy.mjs',0o600);
  fs.copyFileSync(archive,backup+'/release.tgz',fs.constants.COPYFILE_EXCL);checkArchive(backup+'/release.tgz');
  const state={startedAt:new Date().toISOString(),changed:[],before:{},after:{},configHashes:configHashes()};save(backup+'/state.json',state);
  for(const p of plans)state.before[p.service]=await healthy(p,false);save(backup+'/state.json',state);
  fs.mkdirSync(release,{mode:0o755});fs.mkdirSync(release+'/dist',{mode:0o755});
  for(const old of [previousUi,previousFleet])fs.cpSync(old+'/dist/assets',release+'/dist/assets',{recursive:true});
  run('tar',['--no-same-owner','--no-same-permissions','-xzf',backup+'/release.tgz','-C',release]);fs.symlinkSync(dependencies,release+'/node_modules');
  const require=createRequire(release+'/dist/server.cjs');
  for(const file of fs.readdirSync(release+'/dist').filter(f=>f.endsWith('.cjs'))){
    run(process.execPath,['--check',release+'/dist/'+file]);
    for(const m of fs.readFileSync(release+'/dist/'+file,'utf8').matchAll(/require\("([^".][^"]*)"\)/g))require.resolve(m[1]);
  }
  assert(fs.readFileSync(release+'/dist/index.html','utf8').includes('data-prizm-operations="enabled"'));
  assert(fs.readFileSync(release+'/dist/fleet-server.cjs','utf8').includes('PRIZM_SHIFT_24H_ACCESS'));
  try{
    for(const p of plans){
      assert.deepEqual(configHashes(),state.configHashes,'Private configuration changed; stop rollout');
      state.changed.push(p.service);save(backup+'/state.json',state);console.log('Updating '+p.service+' only; other services remain running.');
      run('systemctl',['stop',p.service]);
      if(p.worker)switchWorker(p.worker,previousCollector+'/dist',release+'/dist');
      fs.writeFileSync(p.override,overrideText(p),{mode:0o644,flag:'wx'});run('systemctl',['daemon-reload']);run('systemctl',['start',p.service]);
      state.after[p.service]=await healthy(p,true);save(backup+'/state.json',state);console.log('PASS '+p.service);
    }
    assert.deepEqual(configHashes(),state.configHashes);state.completedAt=new Date().toISOString();save(backup+'/state.json',state);writeReport(state);
    console.log('Fleet and site analytics deployment complete. Sign in again and review both sites. Equipment and network settings unchanged.');
  }catch(error){console.error('Validation failed; rolling back changed services.');await rollback(state);throw error;}
}
function selfTest(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'prizm-analytics-deploy-'));
  try{
    for(const p of plans){const test={...p,override:path.join(dir,p.service+'.conf')};fs.writeFileSync(test.override,overrideText(test));restoreOverride(test);restoreOverride(test);fs.writeFileSync(test.override,'external change');assert.throws(()=>restoreOverride(test));}
    const link=path.join(dir,'worker');fs.symlinkSync('/old',link);switchWorker(link,'/old','/new');switchWorker(link,'/new','/old');assert.equal(fs.readlinkSync(link),'/old');assert.throws(()=>switchWorker(link,'/wrong','/new'));
    validateState({changed:plans.map(p=>p.service)});assert.throws(()=>validateState({changed:['prizm','prizm']}));assert.throws(()=>validateState({changed:['other']}));
    assert(!overrideText(plans[0]).includes('WorkingDirectory'));assert(!overrideText(plans[0]).includes('SMA'));assert(!overrideText(plans[2]).includes('Network'));
    const entries=['server.cjs','fleet-server.cjs','cell-history-worker.cjs','history-query-worker.cjs','snapshot-cache-worker.cjs','analytics-verifier.cjs','index.html','fleet.html','signin.html','logo-transparent.svg','assets/test.js'].map(f=>'dist/'+f);
    checkEntries(entries,['- file']);for(const bad of ['../etc/a','dist/../secret','dist/assets/a/../x.js','/etc/a'])assert.throws(()=>checkEntries([...entries,bad],['- file']));assert.throws(()=>checkEntries(entries,['l link']));
    console.log('PASS exact service scope, worker/override rollback, external-change protection and archive allowlist');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
if(process.argv[2]==='--self-test')selfTest();
else if(process.argv[2]==='--check-archive'){checkArchive(process.argv[3]||archive);console.log('PASS release archive');}
else{
  assert.equal(process.getuid(),0,'Run with sudo');
  if(process.argv[2]==='--probe')console.log(JSON.stringify(await probe(process.argv[3],process.argv[4]==='updated')));
  else{
    assert(['apply','rollback'].includes(process.argv[2]),'Use apply or rollback');
    const lock='/run/prizm-analytics-deploy.lock',fd=fs.openSync(lock,'wx',0o600);
    try{if(process.argv[2]==='apply')await apply();else await rollback(JSON.parse(fs.readFileSync(backup+'/state.json','utf8')));}
    finally{fs.closeSync(fd);fs.unlinkSync(lock);}
  }
}
