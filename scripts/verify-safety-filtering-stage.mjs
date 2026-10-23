import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=process.argv[2],m=JSON.parse(fs.readFileSync(root+'/safety-filtering-manifest.json'));
const mode=process.argv[3]||'baseline';assert(['baseline','stage'].includes(mode));
const hash=b=>createHash('sha256').update(b).digest('hex');
const remote=`import fs from 'node:fs';import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
function tree(dir){const r={};for(const n of fs.readdirSync(dir).sort()){const p=dir+'/'+n,s=fs.lstatSync(p);if(s.isSymbolicLink())throw Error('Release symlink');if(s.isDirectory())for(const[k,v]of Object.entries(tree(p)))r[n+'/'+k]=v;else r[n]=hash(fs.readFileSync(p));}return r;}
console.log(JSON.stringify(${mode==='baseline'?`{fleet:tree('/opt/prizm-fleet/releases/safety-selection-20261022/dist'),collector:tree('/opt/prizm-fleet/releases/safety-selection-collector-20261022/dist'),stageExists:fs.existsSync('/home/ebc/prizm-safety-filtering-20261022'),installerExists:fs.existsSync('/home/ebc/prizm-safety-filtering-deploy.mjs')}`:`{files:tree('/home/ebc/prizm-safety-filtering-20261022'),installer:hash(fs.readFileSync('/home/ebc/prizm-safety-filtering-deploy.mjs'))}`}));`;
const result=JSON.parse(execFileSync('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=8','-i','/Users/johnwilson/.ssh/prizm_dell_fleet','ebc@10.0.0.15','node --input-type=module'],{input:remote,encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024}));
if(mode==='baseline'){assert.deepEqual(result.fleet,m.before);assert.deepEqual(result.collector,m.collectorBefore);assert.equal(result.stageExists,false);assert.equal(result.installerExists,false);console.log('PASS complete active Fleet/collector baseline hashes; staging paths unused');}
else{const expected={'safety-filtering-manifest.json':hash(fs.readFileSync(root+'/safety-filtering-manifest.json')),'collector/server.cjs':m.collectorAfter['server.cjs'],'collector/rollback-server.cjs':m.rollbackServerSha};for(const n of m.changed)expected['fleet/'+n]=m.after[n];assert.deepEqual(result.files,expected);assert.equal(result.installer,hash(fs.readFileSync(process.argv[4])));console.log('PASS every staged artifact and installer hash');}
