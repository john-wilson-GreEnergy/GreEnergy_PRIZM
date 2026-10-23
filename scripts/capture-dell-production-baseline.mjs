/** Read-only Dell audit + portable local code reference. Never activate bundled code. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {hash,tree,verify,sourceFiles} from './production-baseline-lib.mjs';
const [outArg,referenceArg]=process.argv.slice(2);assert(outArg&&referenceArg,'output directory and local release reference required');
const repo=process.cwd(),out=path.resolve(outArg),reference=path.resolve(referenceArg);
assert(!fs.existsSync(out),'Never overwrite a baseline');
const ssh=['-o','BatchMode=yes','-o','ConnectTimeout=8','-i','/Users/johnwilson/.ssh/prizm_dell_fleet','ebc@10.0.0.15'];
const run=(cmd,args,extra={})=>execFileSync(cmd,args,{encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024,...extra});
const remote=`
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
function tree(dir){const r={};for(const n of fs.readdirSync(dir).sort()){const p=dir+'/'+n,s=fs.lstatSync(p);if(s.isSymbolicLink())throw Error('Unexpected release symlink');if(s.isDirectory())for(const[k,v]of Object.entries(tree(p)))r[n+'/'+k]=v;else if(s.isFile())r[n]=hash(fs.readFileSync(p));else throw Error('Unexpected file');}return r;}
const units=['prizm','prizm-site@ss4','prizm-fleet','prizm-fleet-entry-ss3','prizm-fleet-entry@ss4','prizm-workspace-entry@ss3-3444','prizm-workspace-entry@ss3-3445','prizm-workspace-entry@ss4-3444','prizm-workspace-entry@ss4-3445'];
const services=units.map(unit=>{
 const props=Object.fromEntries(execFileSync('systemctl',['show',unit,'-p','ActiveState','-p','MainPID','-p','ExecStart'],{encoding:'utf8'}).trim().split('\\n').map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)];}));
 const m=/argv\\[\\]=\\/usr\\/bin\\/node ([^ ;]+\\.cjs)/.exec(props.ExecStart);if(!m)throw Error('Unexpected entry '+unit);
 const entry=fs.realpathSync(m[1]);if(!entry.startsWith('/opt/prizm-fleet/releases/'))throw Error('Unexpected root');
 let runningEntry=null,processReadError=null;try{const args=fs.readFileSync('/proc/'+props.MainPID+'/cmdline','utf8').split('\\0');runningEntry=fs.realpathSync(args.find(a=>a.endsWith('.cjs')));}catch(e){processReadError=e.code;}
 return{unit,active:props.ActiveState,pid:props.MainPID,configuredEntry:entry,runningEntry,processReadError};
});
const roots=[...new Set(services.map(s=>path.dirname(s.configuredEntry)))];
const workerLinks={};for(const p of ['/home/ebc/GreEnergy_PRIZM/dist','/var/lib/prizm-sites/ss4/dist'])try{workerLinks[p]={resolved:fs.realpathSync(p)};if(!roots.includes(workerLinks[p].resolved))roots.push(workerLinks[p].resolved);}catch(e){workerLinks[p]={unverified:e.code};}
const releases=Object.fromEntries(roots.map(root=>{if(!/^\\/opt\\/prizm-fleet\\/releases\\/[A-Za-z0-9_-]+\\/dist$/.test(root))throw Error('Unsafe release root');return[root,tree(root)];}));
const deps='/opt/prizm-fleet/releases/workspaces-20261001';
const dependencyManifests=Object.fromEntries(['package.json','package-lock.json'].map(n=>[n,fs.readFileSync(deps+'/'+n,'utf8')]));
const dependenciesByRelease=Object.fromEntries(roots.map(root=>[root,fs.realpathSync(path.dirname(root)+'/node_modules')]));
console.log(JSON.stringify({capturedAt:new Date().toISOString(),node:process.version,platform:process.platform,arch:process.arch,services,workerLinks,releases,dependenciesByRelease,dependencyManifests}));`;
const observed=JSON.parse(run('ssh',[...ssh,'node --input-type=module'],{input:remote}));
assert(observed.services.every(s=>s.active==='active'),'All application services must be active');
assert(observed.services.every(s=>!s.runningEntry||s.runningEntry===s.configuredEntry),'Running/configured release differs');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(out+'/production');
const roots={};
for(const[remoteRoot,expected]of Object.entries(observed.releases)){
 const id=remoteRoot.split('/').at(-2);assert(/^[A-Za-z0-9_-]+$/.test(id));const dest=out+'/production/'+id+'/dist';fs.mkdirSync(path.dirname(dest));
 const local=id==='safety-filtering-20261022'?reference+'/fleet/dist':id==='safety-filtering-collector-20261022'?reference+'/collector/dist':null;
 if(local){verify(local,expected);fs.cpSync(local,dest,{recursive:true});}
 else run('scp',['-rp','-i','/Users/johnwilson/.ssh/prizm_dell_fleet','ebc@10.0.0.15:'+remoteRoot,dest]);
 verify(dest,expected);roots[id]={remoteRoot,files:expected};
}
fs.mkdirSync(out+'/production/dependency-manifests');
for(const[n,contents]of Object.entries(observed.dependencyManifests))fs.writeFileSync(out+'/production/dependency-manifests/'+n,contents);
delete observed.dependencyManifests;
const files=sourceFiles(repo);fs.mkdirSync(out+'/source');
for(const n of files){fs.mkdirSync(path.dirname(out+'/source/'+n),{recursive:true});fs.copyFileSync(repo+'/'+n,out+'/source/'+n);}
const sourceHashes=tree(out+'/source');
for(const[n,h]of Object.entries(sourceHashes))assert.equal(hash(fs.readFileSync(repo+'/'+n)),h,'Source changed during capture '+n);
// Recheck every live byte and service identity after copying, not just the initial observation.
const after=JSON.parse(run('ssh',[...ssh,'node --input-type=module'],{input:remote}));
assert.deepEqual(after.releases,observed.releases,'Live release changed while capturing');assert.deepEqual(after.services,observed.services,'Service changed while capturing');
const status=run('git',['status','--porcelain=v1','--untracked-files=all']).trim().split('\n').filter(Boolean);
const lock={schema:1,observed,roots,source:{gitHead:run('git',['rev-parse','HEAD']).trim(),branch:run('git',['branch','--show-current']).trim(),fileCount:files.length,files:sourceHashes,dirtyEntryCount:status.length,productionBuildParity:'NOT_VERIFIED',excluded:'Operational data, captured site fixtures, credentials, live configuration, hidden scratch folders, node_modules, generated builds and Git history'},constraints:{equipmentCommandsSent:false,latencySettingsChanged:false,dellWrites:false,githubPushed:false},limits:['A disk hash snapshot does not prove which bytes a running Node process loaded at startup. Entry paths and PID stability are checked when readable.','Source is the latest local working tree, not a proven reproducible production source checkout. Release-only overlays must be reconciled before ordinary builds can replace production.','SS4 worker symlink may need administrator read verification if marked EACCES.','Dependency manifests are included; installed dependency trees and Linux native modules are not copied.']};
fs.writeFileSync(out+'/production-lock.json',JSON.stringify(lock,null,2));
const verifyScript=`import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),lock=JSON.parse(fs.readFileSync(root+'/production-lock.json'));
const hash=b=>createHash('sha256').update(b).digest('hex');
function tree(dir){const r={};for(const n of fs.readdirSync(dir).sort()){const p=dir+'/'+n,s=fs.lstatSync(p);assert(!s.isSymbolicLink());if(s.isDirectory())for(const[k,v]of Object.entries(tree(p)))r[n+'/'+k]=v;else r[n]=hash(fs.readFileSync(p));}return r;}
for(const[id,record]of Object.entries(lock.roots))assert.deepEqual(tree(root+'/production/'+id+'/dist'),record.files,id);
assert.deepEqual(tree(root+'/source'),lock.source.files,'Editable source differs from captured handoff');
console.log('Verified exact captured production artifacts and source snapshot. Source-to-production build parity remains NOT VERIFIED. No network used.');
`;
fs.writeFileSync(out+'/verify-offline.mjs',verifyScript);
console.log(JSON.stringify({out,capturedAt:observed.capturedAt,releases:Object.keys(roots),sourceFiles:files.length,sourceBuildParity:'NOT_VERIFIED',workerLinks:observed.workerLinks,processEntries:observed.services.map(s=>({unit:s.unit,processVerified:!!s.runningEntry,error:s.processReadError}))},null,2));
