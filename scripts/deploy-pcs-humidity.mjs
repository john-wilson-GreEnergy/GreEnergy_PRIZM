import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const stage='/home/ebc/prizm-pcs-humidity-20261110';
const release='/opt/prizm-fleet/releases/pcs-humidity-20261110';
const dependencies='/opt/prizm-fleet/releases/workspaces-20261001/node_modules';
const backup='/var/lib/prizm-fleet/pcs-humidity-20261110';
const plans=[
  {unit:'prizm',entry:'server.cjs',override:'/etc/systemd/system/prizm.service.d/~zzzz-pcs-humidity-20261110.conf',fleet:false},
  {unit:'prizm-site@ss4',entry:'server.cjs',override:'/etc/systemd/system/prizm-site@ss4.service.d/~zzzz-pcs-humidity-20261110.conf',fleet:false},
  {unit:'prizm-fleet',entry:'fleet-server.cjs',override:'/etc/systemd/system/prizm-fleet.service.d/~zzzz-pcs-humidity-20261110.conf',fleet:true},
];
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const run=(file,args,options={})=>execFileSync(file,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],...options}).trim();
const prop=(unit,name)=>run('systemctl',['show',unit,'-p',name,'--value']);
const targetFrom=text=>{const match=/argv\[\]=\/usr\/bin\/node ([^ ;]+)/.exec(text);assert(match,text);return match[1];};
const execTarget=unit=>targetFrom(prop(unit,'ExecStart'));
const tree=directory=>Object.fromEntries(fs.readdirSync(directory,{recursive:true,withFileTypes:true}).filter(e=>e.isFile()).map(e=>{
  const file=path.join(e.parentPath,e.name);return [path.relative(directory,file),sha(fs.readFileSync(file))];
}).sort(([a],[b])=>a.localeCompare(b)));
const protectedHashes=()=>Object.fromEntries(['/etc/prizm-fleet/fleet/fleet.json','/etc/prizm-fleet/fleet/remote.json','/etc/prizm-fleet/ss3/export.json','/etc/prizm-fleet/ss4/export.json']
  .filter(fs.existsSync).map(file=>[file,sha(fs.readFileSync(file))]));
const healthy=plan=>{assert.equal(prop(plan.unit,'ActiveState'),'active');assert(prop(plan.unit,'ExecStart').includes(release+'/dist/'+plan.entry),prop(plan.unit,'ExecStart'));};
const manifest=JSON.parse(fs.readFileSync(stage+'/manifest.json','utf8'));

function restore(state){
  for(const plan of plans)if(fs.existsSync(plan.override))fs.unlinkSync(plan.override);
  run('systemctl',['daemon-reload']);
  for(const plan of plans)run('systemctl',['restart',plan.unit]);
  for(const plan of plans){assert.equal(prop(plan.unit,'ActiveState'),'active');assert.equal(execTarget(plan.unit),state.services[plan.unit].execTarget);}
  assert.deepEqual(protectedHashes(),state.protectedHashes);
  state.rolledBackAt=new Date().toISOString();fs.writeFileSync(backup+'/state.json',JSON.stringify(state,null,2));
  console.log('Previous PRIZM services restored.');
}
function apply(){
  assert.equal(process.getuid(),0,'Run with sudo');assert.equal(manifest.release,'pcs-humidity-20261110');
  assert.deepEqual(tree(stage+'/payload/dist'),manifest.files,'Staged payload differs from manifest');
  for(const plan of plans){assert.equal(prop(plan.unit,'ActiveState'),'active');assert(!fs.existsSync(plan.override),'Deployment override already exists');}
  const saved=fs.existsSync(backup+'/state.json')?JSON.parse(fs.readFileSync(backup+'/state.json','utf8')):null;
  assert(!saved?.completedAt,'Deployment is already complete');
  const state=saved??{startedAt:new Date().toISOString(),release,protectedHashes:protectedHashes(),services:Object.fromEntries(plans.map(p=>[p.unit,{execTarget:execTarget(p.unit),mainPid:prop(p.unit,'MainPID')}]))};
  for(const plan of plans)if(!state.services[plan.unit].execTarget)state.services[plan.unit].execTarget=targetFrom(state.services[plan.unit].execStart);
  if(!fs.existsSync(backup))fs.mkdirSync(backup,{mode:0o700});
  fs.writeFileSync(backup+'/state.json',JSON.stringify(state,null,2),{mode:0o600});
  try{
    if(!fs.existsSync(release)){fs.mkdirSync(release,{mode:0o755});fs.cpSync(stage+'/payload/dist',release+'/dist',{recursive:true});}
    assert.deepEqual(tree(release+'/dist'),manifest.files);if(!fs.existsSync(release+'/node_modules'))fs.symlinkSync(dependencies,release+'/node_modules');
    for(const plan of plans){
      fs.mkdirSync(path.dirname(plan.override),{recursive:true});
      const text=`[Service]\nExecStart=\nExecStart=/usr/bin/node ${release}/dist/${plan.entry}\n${plan.fleet?`WorkingDirectory=${release}\n`:`Environment=PRIZM_PUBLIC_DIRECTORY=${release}/dist\n`}`;
      fs.writeFileSync(plan.override,text,{flag:'wx',mode:0o644});
    }
    run('systemctl',['daemon-reload']);
    for(const plan of plans)run('systemctl',['restart',plan.unit]);
    for(const plan of plans)healthy(plan);
    assert.deepEqual(protectedHashes(),state.protectedHashes,'Protected configuration changed');
    state.completedAt=new Date().toISOString();state.servicesAfter=Object.fromEntries(plans.map(p=>[p.unit,{execStart:prop(p.unit,'ExecStart'),mainPid:prop(p.unit,'MainPID')}]))
    fs.writeFileSync(backup+'/state.json',JSON.stringify(state,null,2),{mode:0o600});
    console.log('PCS humidity deployment complete for Solar Star 3, Solar Star 4, and Fleet.');
  }catch(error){console.error(String(error?.stack||error));restore(state);throw error;}
}
const mode=process.argv[2];if(mode==='apply')apply();else if(mode==='rollback'){assert.equal(process.getuid(),0);restore(JSON.parse(fs.readFileSync(backup+'/state.json','utf8')));}else throw Error('Use apply or rollback');
