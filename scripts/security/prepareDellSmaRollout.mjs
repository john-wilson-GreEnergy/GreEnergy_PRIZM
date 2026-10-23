// Dell-specific enrollment preparation only. No service, network, or equipment writes.
import fs from 'node:fs';
import https from 'node:https';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const self=fileURLToPath(import.meta.url);
const stage='/home/ebc/prizm-sma-rollout-20261015';
const setup='/usr/local/lib/prizm-sma-stream/setup-shared-20261015.cjs';
const setupPayload='/home/ebc/prizm-sma-shared-setup.cjs';
const setupHash='d14f0d5252013571e00fee117d7a461fb4d6d480f6f435156d66fa34b9b3d9c8';
const sites={
  SS3:{station:'BHE0020',user:'ebc',service:'prizm.service',parent:'/var/lib/prizm-sites/ss3',manifest:'/home/ebc/prizm-sma-ss3-rollout.json',hash:'6a42edfb025643dfcd9aa488a4f9f7e14c86f77e1b59c55e926a638fa8aab010'},
  SS4:{station:'BHE0021',user:'prizm-ss4',service:'prizm-site@ss4.service',parent:'/var/lib/prizm-sites/ss4',manifest:'/home/ebc/prizm-sma-ss4-rollout.json',hash:'e4800bf2e59929729492b396463fc84190ff437bf06372bce590df32457232a1'},
};
export const deferredTargets=Object.freeze({SS3:Object.freeze([1]),SS4:Object.freeze([8])});
export function enrollmentArrays(site){assert(sites[site],'Unknown site');return [1,2,3,4,5,6,7,8].filter(array=>!deferredTargets[site].includes(array));}
const destination=site=>sites[site].parent+'/sma-stream-20261015-available';
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const run=(file,args)=>execFileSync(file,args,{encoding:'utf8',timeout:120_000,maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe']}).trim();
const sameNs=(a,b)=>a.ino===b.ino&&a.dev===b.dev;
export function namespaceMatches(site,here,host,ss4){return site==='SS3'?sameNs(here,host):site==='SS4'&&sameNs(here,ss4)&&!sameNs(here,host);}
function guard(site){
  assert(sites[site],'Unknown site');
  assert(namespaceMatches(site,fs.statSync('/proc/self/ns/net'),fs.statSync('/proc/1/ns/net'),site==='SS4'?fs.statSync('/run/netns/prizm-ss4'):null),'Wrong network namespace');
}
function manifest(site){
  const s=sites[site];assert.equal(hash(s.manifest),s.hash,'Original public inventory changed; review before enrollment');
  const m=JSON.parse(fs.readFileSync(s.manifest,'utf8'));
  assert.equal(m.version,1);assert.equal(m.stationCode,s.station);assert.equal(m.blockCode,'B1');
  assert.deepEqual(m.targets.map(t=>t.array),site==='SS3'?[1,2,3,4,5,6,7,8]:[1,2,3,5,6,7,8]);
  for(const t of m.targets){assert(!Object.hasOwn(t,'password'));assert.equal(t.host,`10.0.${t.array}.118`);}
  return m;
}
export function verifiedTarget(site,array,expected,observed){
  assert(sites[site]&&Number.isInteger(array)&&array>=1&&array<=8);
  assert.equal(observed.status,200,`${site} Array ${array}: unavailable`);
  assert.match(observed.fingerprint256??'',/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/);
  if(expected){
    assert.equal(expected.array,array);assert.equal(expected.host,`10.0.${array}.118`);
    assert.equal(observed.fingerprint256,expected.fingerprint256,`${site} Array ${array}: certificate changed`);
    if(observed.deviceId!==null)assert.equal(observed.deviceId,expected.deviceId,`${site} Array ${array}: device changed`);
    else assert(site==='SS4'&&[2,8].includes(array),'Device identity missing outside the verified pilot');
    return {...expected};
  }
  assert(site==='SS4'&&array===4,'Unapproved new target');
  assert.match(observed.deviceId??'',/^[0-9]{1,20}$/,'New PCS identity unavailable');
  return {array,host:`10.0.${array}.118`,deviceId:observed.deviceId,fingerprint256:observed.fingerprint256,userLevel:0};
}
function inspect(array){
  // Credential-free identity discovery. A certificate observed here is compared
  // to the existing pin; the new SS4/4 pin requires operator confirmation.
  return new Promise(resolve=>{
    let done=false;const finish=x=>{if(!done){done=true;resolve(x);}};
    const body=JSON.stringify({uniqueId:332});
    const req=https.request({host:`10.0.${array}.118`,port:443,path:'/home/getSingleData',method:'POST',rejectUnauthorized:false,
      headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{
      const fingerprint256=res.socket.getPeerCertificate().fingerprint256;let text='';
      res.on('data',chunk=>{text+=chunk;if(text.length>1024*1024)req.destroy(Error('limit'));});
      res.on('error',()=>finish({status:'response-error'}));
      res.on('end',()=>{try{const p=JSON.parse(text)?.data;finish({status:res.statusCode,fingerprint256,deviceId:p?.deviceId?String(p.deviceId):null});}catch{finish({status:'invalid-response'});}});
    });
    const timer=setTimeout(()=>req.destroy(Error('deadline')),7000);
    req.on('close',()=>clearTimeout(timer));req.on('error',()=>finish({status:'unavailable'}));req.end(body);
  });
}
export async function inspectEnrollment(site,m,inspectTarget){
  const arrays=enrollmentArrays(site),targets=[];
  for(const array of arrays)targets.push(verifiedTarget(site,array,m.targets.find(t=>t.array===array),await inspectTarget(array)));
  assert.equal(new Set(targets.map(t=>t.deviceId)).size,arrays.length,'Duplicate inverter identities');
  return {...m,targets};
}
async function inspectSite(site){guard(site);return inspectEnrollment(site,manifest(site),inspect);}
function trustedDirectory(dir){const s=fs.lstatSync(dir);assert(s.isDirectory()&&!s.isSymbolicLink()&&(s.mode&0o022)===0,'Unsafe directory');}
function ensureSetup(){
  for(const dir of ['/usr','/usr/local','/usr/local/lib','/usr/local/lib/prizm-sma-stream']){trustedDirectory(dir);assert.equal(fs.statSync(dir).uid,0);}
  if(!fs.existsSync(setup)){
    const st=fs.lstatSync(setupPayload);assert(st.isFile()&&!st.isSymbolicLink());
    const bytes=fs.readFileSync(setupPayload);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),setupHash,'Staged shared-password helper changed');
    fs.writeFileSync(setup,bytes,{flag:'wx',mode:0o644});
  }
  const st=fs.lstatSync(setup);assert(st.isFile()&&!st.isSymbolicLink()&&st.uid===0&&(st.mode&0o022)===0);
  assert.equal(hash(setup),setupHash,'Installed shared-password helper changed');
}
function exclusive(file,content){fs.writeFileSync(file,content,{flag:'wx',mode:0o644});}
function owner(user){return {uid:Number(run('/usr/bin/id',['-u',user])),gid:Number(run('/usr/bin/id',['-g',user]))};}
function parents(site){
  for(const p of ['/var','/var/lib','/var/lib/prizm-sites'])trustedDirectory(p);
  const s=sites[site],o=owner(s.user);
  if(!fs.existsSync(s.parent)){fs.mkdirSync(s.parent,{mode:0o700});fs.chownSync(s.parent,o.uid,o.gid);}
  trustedDirectory(s.parent);assert.equal(fs.statSync(s.parent).uid,o.uid);
}
export function validatePreparedManifest(site,m){
  assert(sites[site]);assert.deepEqual(Object.keys(m).sort(),['blockCode','stationCode','targets','version']);
  assert.equal(m.version,1);assert.equal(m.stationCode,sites[site].station);assert.equal(m.blockCode,'B1');
  assert.deepEqual(m.targets.map(t=>t.array),enrollmentArrays(site));
  for(const t of m.targets){
    assert.deepEqual(Object.keys(t).sort(),['array','deviceId','fingerprint256','host','userLevel']);
    assert.equal(t.host,`10.0.${t.array}.118`);assert.equal(t.userLevel,0);
    assert.match(t.deviceId,/^[0-9]{1,20}$/);assert.match(t.fingerprint256,/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/);
  }
  return m;
}
function stagedJson(name){
  const file=stage+'/'+name,st=fs.lstatSync(file);
  assert(st.isFile()&&!st.isSymbolicLink()&&st.uid===0&&(st.mode&0o022)===0,'Staged metadata changed');
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function serviceManifest(site){
  parents(site);
  const m=validatePreparedManifest(site,stagedJson(site+'.json'));
  // The service cannot traverse ebc's private home. Do not widen home access.
  const file=sites[site].parent+'/sma-stream-20261015-manifest.json',bytes=JSON.stringify(m,null,2)+'\n';
  if(fs.existsSync(file)){
    const st=fs.lstatSync(file);assert(st.isFile()&&!st.isSymbolicLink()&&st.uid===0&&(st.mode&0o022)===0);
    assert.equal(fs.readFileSync(file,'utf8'),bytes,'Service manifest differs; refusing overwrite');
  }else exclusive(file,bytes);
  for(const readable of [file,setup])run('/usr/sbin/runuser',['-u',sites[site].user,'--','/usr/bin/test','-r',readable]);
  run('/usr/sbin/runuser',['-u',sites[site].user,'--','/usr/bin/test','-w',sites[site].parent]);
  return file;
}
function checkPrivateEnrollment(site){
  for(const file of ['key','vault.json']){const st=fs.lstatSync(destination(site)+'/'+file);assert(st.isFile()&&!st.isSymbolicLink()&&(st.mode&0o077)===0&&st.uid===owner(sites[site].user).uid,'Private enrollment incomplete');}
}
function enroll(site,file){
  assert(!fs.existsSync(destination(site)),`${site} enrollment already exists; refusing overwrite`);
  console.log(`\n${site}: enter the shared User password once, then confirm it, for arrays ${enrollmentArrays(site).join(', ')}. Offline array ${deferredTargets[site].join(', ')} is deferred.`);
  const result=spawnSync('/usr/sbin/runuser',['-u',sites[site].user,'--','/usr/bin/node',setup,file,destination(site),'--shared-site-password'],{stdio:'inherit'});
  assert.equal(result.status,0,`${site} enrollment stopped. Existing production settings remain unchanged.`);
  checkPrivateEnrollment(site);
  exclusive(stage+`/${site}-saved.json`,JSON.stringify({at:new Date().toISOString(),site,arrays:enrollmentArrays(site).length,arrayNumbers:enrollmentArrays(site),deferred:deferredTargets[site],destination:destination(site),vaultHash:hash(destination(site)+'/vault.json')},null,2)+'\n');
}
function finishPreparation(pids){
  for(const [site,s] of Object.entries(sites))assert.equal(run('/usr/bin/systemctl',['show',s.service,'-p','MainPID','--value']),pids[site],'Collector changed during preparation; review before activation');
  exclusive(stage+'/ready.json',JSON.stringify({at:new Date().toISOString(),status:'ENROLLED_NOT_ACTIVE',sites:['SS3','SS4'],arraysPerSite:7,arrayNumbers:{SS3:enrollmentArrays('SS3'),SS4:enrollmentArrays('SS4')},deferredTargets,productionUnchanged:true},null,2)+'\n');
  console.log('\nSaved encrypted credentials for 14 inverters. Deferred: SS3 Array 1 and SS4 Array 8. NOT ACTIVATED. Existing collectors and pilot configuration remain unchanged.');
}
export function validateSavedEnrollment(site,saved,vaultHash){
  assert.equal(saved.site,site);assert.equal(saved.destination,destination(site));
  assert.deepEqual(saved.arrayNumbers,enrollmentArrays(site));assert.deepEqual(saved.deferred,deferredTargets[site]);
  assert.equal(saved.vaultHash,vaultHash,'Previously saved credentials changed');
}
async function resumeSs4(){
  guard('SS3');assert(process.stdin.isTTY,'Use the server console');ensureSetup();
  assert(!fs.existsSync(stage+'/ready.json'),'Enrollment is already complete');
  assert(!fs.existsSync(destination('SS4')),'SS4 enrollment already exists; refusing overwrite');
  const before=stagedJson('before.json');checkPrivateEnrollment('SS3');
  const savedHashes=['key','vault.json'].map(file=>hash(destination('SS3')+'/'+file));
  validateSavedEnrollment('SS3',stagedJson('SS3-saved.json'),savedHashes[1]);
  const ss4=validatePreparedManifest('SS4',stagedJson('SS4.json'));
  console.log('Preserving saved SS3 credentials. Rechecking only SS4 arrays 1–7; Array 8 remains deferred.');
  const current=JSON.parse(run('/usr/sbin/ip',['netns','exec','prizm-ss4','/usr/bin/node',self,'inspect-site','SS4']));
  assert.deepEqual(current,ss4,'SS4 identity changed since confirmation; review before enrollment');
  enroll('SS4',serviceManifest('SS4'));
  assert.deepEqual(['key','vault.json'].map(file=>hash(destination('SS3')+'/'+file)),savedHashes,'SS3 enrollment changed during SS4 setup');
  finishPreparation(before.pids);
}
async function prepare(){
  guard('SS3');assert(process.stdin.isTTY,'Use the server console for private password entry');
  ensureSetup();
  assert(!fs.existsSync(stage),'Preparation already exists; do not overwrite it');
  for(const site of ['SS3','SS4'])assert(!fs.existsSync(destination(site)),`${site} enrollment already exists`);
  const pids=Object.fromEntries(Object.entries(sites).map(([name,s])=>[name,run('/usr/bin/systemctl',['show',s.service,'-p','MainPID','--value'])]));
  assert(Object.values(pids).every(p=>Number(p)>0),'Both collectors must be running');
  console.log('Checking 14 inverter identities without passwords or equipment commands. Deferred/offline: SS3 Array 1 and SS4 Array 8 (not contacted).');
  const ss3=await inspectSite('SS3');
  const ss4=JSON.parse(run('/usr/sbin/ip',['netns','exec','prizm-ss4','/usr/bin/node',self,'inspect-site','SS4']));
  console.log('SS3: seven existing identities match. SS4: six existing identities match.');
  const newTarget=ss4.targets.find(t=>t.array===4);
  console.log(`NEW SS4 Array 4: ${newTarget.host}, process device ID ${newTarget.deviceId}, SHA-256 ${newTarget.fingerprint256}`);
  const prompt=createInterface({input:process.stdin,output:process.stdout});
  let confirmation;
  try{confirmation=await prompt.question('Confirm this is the intended SS4 Array 4 inverter and enroll the 14 available units (SS3 2-8; SS4 1-7)? Type yes: ');}finally{prompt.close();}
  if(confirmation!=='yes'){console.log('Cancelled; no enrollment saved.');return;}
  // Only public manifests/reports go in this staging directory. Credentials are
  // entered by the operator directly into the unchanged, tested private helper.
  fs.mkdirSync(stage,{mode:0o755});
  exclusive(stage+'/SS3.json',JSON.stringify(ss3,null,2)+'\n');
  exclusive(stage+'/SS4.json',JSON.stringify(ss4,null,2)+'\n');
  exclusive(stage+'/before.json',JSON.stringify({at:new Date().toISOString(),pids,deferredTargets,servicesChanged:false},null,2)+'\n');
  // Preflight access as BOTH service accounts before collecting any passwords.
  const readable=Object.fromEntries(['SS3','SS4'].map(site=>[site,serviceManifest(site)]));
  for(const site of ['SS3','SS4'])enroll(site,readable[site]);
  finishPreparation(pids);
}
export async function main(args){
  assert.equal(process.platform,'linux','This is a Dell Linux deployment helper, not the cross-platform telemetry runtime');
  if(args.length===2&&args[0]==='inspect-site'&&sites[args[1]])console.log(JSON.stringify(await inspectSite(args[1])));
  else if(args.length===1&&args[0]==='resume-ss4'){assert.equal(process.getuid(),0,'Run with sudo');await resumeSs4();}
  else if(args.length===0){assert.equal(process.getuid(),0,'Run this helper with sudo in the Dell console');await prepare();}
  else throw Error('Run without arguments to prepare enrollment');
}
if(process.argv[1]===self)main(process.argv.slice(2)).catch(error=>{console.error('Preparation stopped: '+error.message);console.error('No service restart, network change, or equipment command was performed. Do not send passwords in chat.');process.exitCode=1;});
