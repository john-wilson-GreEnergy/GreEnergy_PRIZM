// Operator-confirmed Installer enrollment. Local file work only; no device calls.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const prior='/home/ebc/prizm-sma-rollout-20261015';
const stage=prior+'-installer';
const setup='/usr/local/lib/prizm-sma-stream/setup-shared-20261015.cjs';
const setupHash='d14f0d5252013571e00fee117d7a461fb4d6d480f6f435156d66fa34b9b3d9c8';
export const sites=[
  {site:'SS3',station:'BHE0020',user:'ebc',service:'prizm.service',arrays:[2,3,4,5,6,7,8]},
  {site:'SS4',station:'BHE0021',user:'prizm-ss4',service:'prizm-site@ss4.service',arrays:[1,2,3,4,5,6,7]},
].map(p=>({...p,parent:`/var/lib/prizm-sites/${p.site.toLowerCase()}`,destination:`/var/lib/prizm-sites/${p.site.toLowerCase()}/sma-stream-20261015-installer`}));
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const run=(f,args)=>execFileSync(f,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000}).trim();
const trusted=(f,directory=false)=>{const s=fs.lstatSync(f);assert(!s.isSymbolicLink()&&(directory?s.isDirectory():s.isFile())&&s.uid===0&&(s.mode&0o022)===0,'Unexpected ownership or permissions');};
const read=f=>{trusted(f);return JSON.parse(fs.readFileSync(f,'utf8'));};
const save=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n',{flag:'wx',mode:0o644});
export function installerManifest(p,m){
  assert.equal(m.version,1);assert.equal(m.stationCode,p.station);assert.equal(m.blockCode,'B1');
  assert.deepEqual(Object.keys(m).sort(),['blockCode','stationCode','targets','version']);
  assert.deepEqual(m.targets.map(t=>t.array),p.arrays);
  for(const t of m.targets){
    assert.deepEqual(Object.keys(t).sort(),['array','deviceId','fingerprint256','host','userLevel']);
    assert.equal(t.host,`10.0.${t.array}.118`);assert.equal(t.userLevel,0,'Unexpected prior role');
    assert.match(t.deviceId,/^[0-9]{1,20}$/);assert.match(t.fingerprint256,/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/);
  }
  assert.equal(new Set(m.targets.map(t=>t.deviceId)).size,7);
  return {...m,targets:m.targets.map(t=>({...t,userLevel:1}))};
}
function privateCheck(p){
  const uid=Number(run('/usr/bin/id',['-u',p.user]));
  const dir=fs.lstatSync(p.destination);assert(dir.isDirectory()&&!dir.isSymbolicLink()&&dir.uid===uid&&(dir.mode&0o077)===0,'Unsafe private directory');
  for(const name of ['key','vault.json']){const s=fs.lstatSync(p.destination+'/'+name);assert(s.isFile()&&!s.isSymbolicLink()&&s.uid===uid&&(s.mode&0o077)===0,'Unsafe private file');}
}
function preservedHashes(){return sites.map(p=>({site:p.site,key:hash(p.parent+'/sma-stream-20261015-available/key'),vault:hash(p.parent+'/sma-stream-20261015-available/vault.json')}));}
export async function main(){
  assert.equal(process.platform,'linux');assert.equal(process.getuid(),0,'Use sudo in the Dell console');assert(process.stdin.isTTY,'Interactive console required');
  trusted(prior,true);trusted(setup);assert.equal(hash(setup),setupHash,'Setup utility changed');
  assert.equal(read(prior+'/ready.json').status,'ENROLLED_NOT_ACTIVE');
  const failure=read('/home/ebc/prizm-sma-activation-result.json');
  assert.equal(failure.status,'PREFLIGHT_FAILED');assert.equal(failure.servicesChanged,false);
  for(const p of sites)assert(!fs.existsSync(`/etc/systemd/system/${p.service}.d/zzzzzzzz-sma-all-20261015.conf`),'Prior activation settings exist');
  const manifests=sites.map(p=>installerManifest(p,read(prior+'/'+p.site+'.json')));
  const pids=()=>Object.fromEntries([...sites.map(p=>p.service),'prizm-fleet.service'].map(s=>[s,run('/usr/bin/systemctl',['show',s,'-p','MainPID','--value'])]));
  const before={pids:pids(),preserved:preservedHashes()};assert(Object.values(before.pids).every(p=>Number(p)>0));
  if(!fs.existsSync(stage)){fs.mkdirSync(stage,{mode:0o755});save(stage+'/before.json',before);}
  trusted(stage,true);assert.deepEqual(read(stage+'/before.json'),before,'Server or prior enrollment changed; review before resuming');
  for(let i=0;i<sites.length;i++){
    const p=sites[i],m=manifests[i],publicFile=stage+'/'+p.site+'.json',manifest=p.parent+'/sma-stream-20261015-installer-manifest.json';
    const parent=fs.lstatSync(p.parent),uid=Number(run('/usr/bin/id',['-u',p.user]));
    assert(parent.isDirectory()&&!parent.isSymbolicLink()&&parent.uid===uid&&(parent.mode&0o022)===0);
    for(const f of [publicFile,manifest]){if(fs.existsSync(f))assert.deepEqual(read(f),m);else save(f,m);}
    run('/usr/sbin/runuser',['-u',p.user,'--','/usr/bin/test','-r',manifest]);
    const savedFile=stage+'/'+p.site+'-saved.json';
    if(fs.existsSync(savedFile)){
      privateCheck(p);const saved=read(savedFile);assert.equal(saved.destination,p.destination);assert.equal(saved.userLevel,1);assert.deepEqual(saved.arrayNumbers,p.arrays);assert.equal(saved.vaultHash,hash(p.destination+'/vault.json'));
      console.log(`${p.site}: completed Installer enrollment retained; no password re-entry.`);continue;
    }
    assert(!fs.existsSync(p.destination),'Partial private enrollment exists; review before retrying');
    console.log(`\n${p.site}: shared INSTALLER password once plus confirmation, arrays ${p.arrays.join(', ')}. No inverter login attempts or controls.`);
    const result=spawnSync('/usr/sbin/runuser',['-u',p.user,'--','/usr/bin/node',setup,manifest,p.destination,'--shared-site-password'],{stdio:'inherit'});
    assert.equal(result.status,0,'Enrollment stopped');assert(fs.existsSync(p.destination),'Enrollment cancelled');privateCheck(p);
    save(savedFile,{at:new Date().toISOString(),site:p.site,userLevel:1,destination:p.destination,arrayNumbers:p.arrays,vaultHash:hash(p.destination+'/vault.json')});
  }
  assert.deepEqual(pids(),before.pids,'Service changed during preparation');assert.deepEqual(preservedHashes(),before.preserved,'Prior enrollment changed');
  const ready={status:'ENROLLED_NOT_ACTIVE',userLevel:1,arrayNumbers:Object.fromEntries(sites.map(p=>[p.site,p.arrays])),deferredTargets:{SS3:[1],SS4:[8]},productionUnchanged:true};
  if(fs.existsSync(stage+'/ready.json'))assert.deepEqual(read(stage+'/ready.json'),ready);else save(stage+'/ready.json',ready);
  console.log('Saved Installer credentials for both sites. 14 inverters enrolled; NOT ACTIVATED. Existing services and credentials unchanged.');
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Installer enrollment stopped. No service or equipment changes were performed. Preserve the files and report this message; do not send passwords.');process.exitCode=1;});
