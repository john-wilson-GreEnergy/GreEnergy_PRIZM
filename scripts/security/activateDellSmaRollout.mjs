// Fixed-scope Dell activation: existing code, new stream environment only.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const self=fileURLToPath(import.meta.url);
const stage='/home/ebc/prizm-sma-rollout-20261015-installer';
const backup='/var/lib/prizm-fleet/sma-activation-20261015-installer';
const publicResult='/home/ebc/prizm-sma-installer-activation-result.json';
const lib='/usr/local/lib/prizm-sma-rollout-20261015-installer';
const ca='/etc/prizm-fleet/fleet/ca-cert.pem';
const release='/opt/prizm-fleet/releases/cell-trend-20261002/dist/server.cjs';
const releaseHash='2a8214d0293bc31fcf0d5c9542d16604a5351eb7b9d9dad90ba8498ef8ee9c32';
const probePayload='/home/ebc/prizm-sma-installer-check.cjs';
const probeHash='fc22391a37a0a19a091d0f382820ec71bc221e14e98b74456b595485eab02072';
export const plans=[
  {site:'SS3',id:'solar-star-3',station:'BHE0020',user:'ebc',service:'prizm.service',arrays:[2,3,4,5,6,7,8],ns:null},
  {site:'SS4',id:'solar-star-4',station:'BHE0021',user:'prizm-ss4',service:'prizm-site@ss4.service',arrays:[1,2,3,4,5,6,7],ns:'prizm-ss4'},
].map(p=>({...p,parent:`/var/lib/prizm-sites/${p.site.toLowerCase()}`,directory:`/var/lib/prizm-sites/${p.site.toLowerCase()}/sma-stream-20261015-installer`,override:`/etc/systemd/system/${p.service}.d/zzzzzzzz-sma-installer-20261015.conf`}));
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const run=(file,args,extra={})=>execFileSync(file,args,{encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe'],...extra}).trim();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const pid=service=>run('/usr/bin/systemctl',['show',service,'-p','MainPID','--value']);
const save=(name,value)=>fs.writeFileSync(backup+'/'+name,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});
const exported=value=>{
  const old=fs.existsSync(publicResult)?fs.lstatSync(publicResult):null;
  assert(!old||old.isFile()&&!old.isSymbolicLink()&&old.uid===0,'Unexpected result file');
  fs.writeFileSync(publicResult,JSON.stringify(value,null,2)+'\n',{mode:0o644});
};
export const overrideText=p=>`[Service]\nEnvironment=PRIZM_SMA_STREAM_ENABLED=true\nEnvironment=PRIZM_SMA_STREAM_VAULT=${p.directory}/vault.json\nEnvironment=PRIZM_SMA_STREAM_KEY_FILE=${p.directory}/key\n`;
export function removeOwnOverride(file,text){
  if(!fs.existsSync(file))return;
  const st=fs.lstatSync(file);assert(st.isFile()&&!st.isSymbolicLink(),'Unexpected override type');
  assert.equal(fs.readFileSync(file,'utf8'),text,'Override changed externally; refusing removal');
  fs.unlinkSync(file);
}
export function verifySummary(d,p,stream,now=Date.now()){
  assert.equal(d.schema,'prizm-site-summary-v1');assert.equal(d.siteId,p.id);assert.equal(d.stationCode,p.station);assert.equal(d.stale,false);
  const age=now-Date.parse(d.observedAt);assert(Number.isFinite(age)&&age>=-30000&&age<60000,'Collector summary is stale');
  assert.equal(d.details.arrays.length,8);assert.equal(d.details.pcs.length,8);assert.equal(d.metrics.strings.value,320);
  const selected=p.arrays.map(array=>{
    const rows=d.details.pcs.filter(x=>x.array===array);assert.equal(rows.length,1,'Ambiguous PCS identity');
    const row=rows[0],readings={};
    for(const field of ['status','acContactor','dc1','dc2','dc3','insulationKohm','maxIgbtF']){
      const r=row[field];if(stream){
        assert.equal(r?.source,'SMA stream',`${p.site} Array ${array}: ${field} not streamed`);
        assert.equal(r.quality,'live',`${p.site} Array ${array}: ${field} not live`);assert(r.value!==null&&r.value!==undefined);
        const pointAge=now-Date.parse(r.observedAt);assert(Number.isFinite(pointAge)&&pointAge>=-30000&&pointAge<30000,'PCS value is stale');
      }
      readings[field]=r;
    }
    return {array,readings};
  });
  return {site:p.site,observedAt:d.observedAt,arrays:p.arrays,streamVerified:stream,pcs:selected};
}
async function fleetProbe(site,stream){
  const p=plans.find(p=>p.site===site);assert(p);
  const config=JSON.parse(fs.readFileSync('/etc/prizm-fleet/fleet/fleet.json','utf8'));
  const c=config.collectors.find(c=>c.siteId===p.id);assert(c);assert.equal(c.stationCode,p.station);
  const url=new URL(c.url);assert.equal(url.protocol,'https:');
  assert.equal(url.pathname,'/api/fleet/site-summary');assert(!url.username&&!url.password&&!url.search&&!url.hash);
  const response=await fetch(url,{redirect:'error',headers:{authorization:'Bearer '+c.token},signal:AbortSignal.timeout(12000)});
  assert.equal(response.status,200);const result=verifySummary(await response.json(),p,stream);
  const denied=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(12000)});assert.equal(denied.status,401);await denied.body?.cancel();
  return {...result,anonymousAccessDenied:true};
}
function isolatedProbe(p,stream){return JSON.parse(run('/usr/sbin/ip',['netns','exec','prizm-fleet','/usr/bin/node',backup+'/activate.mjs','probe',p.site,stream?'stream':'baseline'],{env:{...process.env,NODE_EXTRA_CA_CERTS:ca}}));}
async function ready(p,stream){
  const until=Date.now()+180000;let last='not ready';
  do{try{assert.equal(run('/usr/bin/systemctl',['is-active',p.service]),'active');return isolatedProbe(p,stream);}catch{last=`${p.site} summary/stream readiness failed`;await sleep(5000);}}while(Date.now()<until);
  throw Error(last);
}
function assertProgress(first,last){
  for(let i=0;i<last.pcs.length;i++)for(const field of Object.keys(last.pcs[i].readings))assert(Date.parse(last.pcs[i].readings[field].observedAt)>Date.parse(first.pcs[i].readings[field].observedAt),'Published stream timestamp did not advance');
}
function ensureManifest(p){
  const source=stage+'/'+p.site+'.json',st=fs.lstatSync(source);
  assert(st.isFile()&&!st.isSymbolicLink()&&st.uid===0&&(st.mode&0o022)===0,'Unsafe public manifest');
  const manifest=JSON.parse(fs.readFileSync(source,'utf8'));
  assert.equal(manifest.stationCode,p.station);assert.equal(manifest.blockCode,'B1');assert.equal(manifest.version,1);
  assert.deepEqual(manifest.targets.map(t=>t.array),p.arrays);
  assert(manifest.targets.every(t=>!Object.hasOwn(t,'password')&&t.userLevel===1));
  const bytes=JSON.stringify(manifest,null,2)+'\n',file=p.parent+'/sma-stream-20261015-installer-manifest.json';
  if(fs.existsSync(file)){const st=fs.lstatSync(file);assert(st.isFile()&&!st.isSymbolicLink()&&st.uid===0&&(st.mode&0o022)===0);assert.equal(fs.readFileSync(file,'utf8'),bytes);}
  else fs.writeFileSync(file,bytes,{mode:0o644,flag:'wx'});
  run('/usr/sbin/runuser',['-u',p.user,'--','/usr/bin/test','-r',file]);
}
function privateHashes(){return plans.flatMap(p=>['key','vault.json'].map(name=>({file:p.directory+'/'+name,hash:hash(p.directory+'/'+name)})));}
function streamCheck(p){
  const namespace=fs.statSync(p.ns?'/run/netns/'+p.ns:'/proc/self/ns/net');
  const args=['-u',p.user,'--','/usr/bin/node',lib+'/check.cjs',p.site,String(namespace.dev),String(namespace.ino)];
  try{
    return JSON.parse(p.ns?run('/usr/sbin/ip',['netns','exec',p.ns,'/usr/sbin/runuser',...args]):run('/usr/sbin/runuser',args));
  }catch(error){
    const diagnostic=String(error.stderr??'').split('\n').find(line=>line.startsWith('Read-only stream validation failed:'));
    throw Error(diagnostic||`${p.site} read-only stream validation failed; no activation`);
  }
}
async function rollback(){
  const before=JSON.parse(fs.readFileSync(backup+'/before.json','utf8'));
  const restored=[];
  for(const p of [...plans].reverse())if(fs.existsSync(p.override)){
    removeOwnOverride(p.override,overrideText(p));
    run('/usr/bin/systemctl',['daemon-reload']);run('/usr/bin/systemctl',['restart',p.service]);
    restored.push(await ready(p,false));
  }
  assert.equal(pid('prizm-fleet.service'),before.fleetPid,'Fleet process changed');
  const report={status:'ROLLED_BACK',at:new Date().toISOString(),restored,credentialsRetained:true};
  fs.writeFileSync(backup+'/rollback.json',JSON.stringify(report,null,2),{mode:0o600});exported(report);
  console.log('Previous stream settings restored. Credential enrollments retained; no Fleet restart or equipment commands.');
}
async function apply(){
  assert.equal(hash(release),releaseHash,'Collector release changed');
  assert(!fs.existsSync(backup)&&!fs.existsSync(lib),'Activation already prepared; inspect or roll back, do not overwrite');
  const ns=fs.statSync('/proc/self/ns/net'),host=fs.statSync('/proc/1/ns/net');assert.equal(ns.ino,host.ino);assert.equal(ns.dev,host.dev);
  const marker=JSON.parse(fs.readFileSync(stage+'/ready.json','utf8'));assert.equal(marker.status,'ENROLLED_NOT_ACTIVE');assert.equal(marker.userLevel,1);
  const before={at:new Date().toISOString(),fleetPid:pid('prizm-fleet.service'),pids:{},credentials:privateHashes(),summaries:[]};
  for(const p of plans){
    assert(!fs.existsSync(p.override),'Override exists');
    assert(!fs.existsSync(`/etc/systemd/system/${p.service}.d/zzzzzzzz-sma-all-20261015.conf`),'Earlier activation settings exist');
    assert(run('/usr/bin/systemctl',['show',p.service,'-p','ExecStart','--value']).includes(release),'Unexpected collector release');
    assert.equal(run('/usr/bin/systemctl',['show',p.service,'-p','User','--value']),p.user);
    assert.equal(run('/usr/bin/systemctl',['show',p.service,'-p','NetworkNamespacePath','--value']),p.ns?'/run/netns/'+p.ns:'');
    const envFile=p.site==='SS3'?'/home/ebc/GreEnergy_PRIZM/.env':'/etc/prizm-fleet/ss4/collector.env';
    assert(!fs.existsSync(envFile)||!/^\s*(?:export\s+)?PRIZM_SMA_STREAM_\w+\s*=/m.test(fs.readFileSync(envFile,'utf8')),'Environment file overrides stream settings; review before activation');
    const uid=Number(run('/usr/bin/id',['-u',p.user]));
    for(const name of ['key','vault.json']){const st=fs.lstatSync(p.directory+'/'+name);assert(st.isFile()&&!st.isSymbolicLink()&&st.uid===uid&&(st.mode&0o077)===0,'Unsafe private enrollment permissions');}
    const saved=JSON.parse(fs.readFileSync(stage+'/'+p.site+'-saved.json','utf8'));assert.equal(hash(p.directory+'/vault.json'),saved.vaultHash,'Enrollment changed');
    assert.equal(saved.userLevel,1);assert.equal(saved.destination,p.directory);assert.deepEqual(saved.arrayNumbers,p.arrays);ensureManifest(p);before.pids[p.site]=pid(p.service);assert(Number(before.pids[p.site])>0);
  }
  assert(Number(before.fleetPid)>0);
  const bytes=fs.readFileSync(probePayload);assert.equal(createHash('sha256').update(bytes).digest('hex'),probeHash,'Validation bundle changed');
  fs.mkdirSync(backup,{mode:0o700});fs.copyFileSync(self,backup+'/activate.mjs');fs.chmodSync(backup+'/activate.mjs',0o600);
  fs.mkdirSync(lib,{mode:0o755});fs.writeFileSync(lib+'/check.cjs',bytes,{mode:0o644,flag:'wx'});
  save('before.json',before);
  try{
    for(const p of plans)before.summaries.push(isolatedProbe(p,false));save('baseline.json',before.summaries);
    // BOTH sites must pass before any service setting changes.
    for(const p of plans){
      console.log(`Validating ${p.site} arrays ${p.arrays.join(', ')} read-only (about 100 seconds)...`);
      save(p.site+'-preflight.json',streamCheck(p));console.log(`PASS ${p.site}: advancing stream points across session refresh.`);
    }
    const after=[];
    for(const p of plans){
      console.log(`Enabling ${p.site}; restarting only ${p.service}...`);
      fs.writeFileSync(p.override,overrideText(p),{flag:'wx',mode:0o644});
      run('/usr/bin/systemctl',['daemon-reload']);run('/usr/bin/systemctl',['restart',p.service]);
      const first=await ready(p,true);await sleep(20000);const last=await ready(p,true);assertProgress(first,last);
      save(p.site+'-activated.json',last);after.push(last);
      assert.equal(pid('prizm-fleet.service'),before.fleetPid);console.log(`PASS ${p.site}: live canonical MQTT readings for all seven selected inverters.`);
    }
    // Confirm both sites still pass after a production session-refresh interval.
    await sleep(75000);
    for(let i=0;i<plans.length;i++){const latest=await ready(plans[i],true);assertProgress(after[i],latest);after[i]=latest;}
    assert.deepEqual(privateHashes(),before.credentials);assert.equal(pid('prizm-fleet.service'),before.fleetPid);
    const result={status:'ACTIVATED',at:new Date().toISOString(),sites:after,deferred:{SS3:[1],SS4:[8]},fleetRestarted:false,equipmentCommands:false,credentialsUnchanged:true};
    save('after.json',result);exported(result);console.log('MQTT activation complete: 14 inverters verified. SS3 Array 1 and SS4 Array 8 deferred.');
  }catch(error){
    console.error(String(error.message).split('\n')[0]);
    if(plans.some(p=>fs.existsSync(p.override)))await rollback();
    else exported({status:'PREFLIGHT_FAILED',at:new Date().toISOString(),reason:String(error.message).split('\n')[0],servicesChanged:false});
    throw Error('Activation did not complete. Review the saved result before any retry.');
  }
}
async function main(){
  assert.equal(process.platform,'linux','This activation helper is only for the Dell Linux deployment');
  assert.equal(process.getuid(),0,'Use sudo in the Dell console');
  const [mode,site,kind,...extra]=process.argv.slice(2);assert(!extra.length);
  if(mode==='probe'){assert(['stream','baseline'].includes(kind));console.log(JSON.stringify(await fleetProbe(site,kind==='stream')));}
  else if(mode==='apply'&&!site)await apply();
  else if(mode==='rollback'&&!site)await rollback();
  else throw Error('Use apply or rollback');
}
if(process.argv[1]===self)main().catch(error=>{console.error('Activation stopped: '+String(error.message).split('\n')[0]);process.exitCode=1;});
