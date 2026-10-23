/** Patch only storage presentation in the exact deployed UI; preserve every backend byte. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {transform} from 'esbuild';
import {parse} from '@babel/parser';
const [baseArg,outArg]=process.argv.slice(2);assert(baseArg&&outArg);
const base=path.resolve(baseArg),out=path.resolve(outArg);assert(!fs.existsSync(out));
const sha=b=>createHash('sha256').update(b).digest('hex');
function tree(dir){const r={};for(const n of fs.readdirSync(dir).sort()){const p=dir+'/'+n,s=fs.lstatSync(p);assert(!s.isSymbolicLink());if(s.isDirectory())for(const[k,v]of Object.entries(tree(p)))r[n+'/'+k]=v;else{assert(s.isFile());r[n]=sha(fs.readFileSync(p));}}return r;}
function once(s,a,b){assert.equal(s.split(a).length,2,'Unique boundary: '+a);return s.replace(a,b);}
const before=tree(base),baseline=JSON.parse(fs.readFileSync(path.dirname(base)+'/remote-admin-manifest.json'));
assert.deepEqual(before,baseline.after,'Exact remote-admin baseline');
const entries=['index.html','fleet.html','mobile.html','signin.html'],all=fs.readdirSync(base+'/assets'),active=new Set(),queue=entries.map(f=>fs.readFileSync(base+'/'+f,'utf8'));
while(queue.length){const s=queue.pop();for(const n of all)if(!active.has(n)&&s.includes(n)){active.add(n);if(n.endsWith('.js'))queue.push(fs.readFileSync(base+'/assets/'+n,'utf8'));}}
const sources=new Map([...active].filter(n=>n.endsWith('.js')).map(n=>[n,fs.readFileSync(base+'/assets/'+n,'utf8')]));
const targets=[...sources].filter(([,s])=>s.includes('Root Filesystem Status:'));assert.equal(targets.length,1);
const [target,original]=targets[0];let patched=original;
const oldFormatter='s=>{if(s==null||s<0)return"0 MB";const l=["Bytes","KB","MB","GB","TB"],b=Math.floor(Math.log(s)/Math.log(1024));return b<=0?`${(s/1048576).toFixed(1)} MB`:`${(s/Math.pow(1024,b)).toFixed(1)} ${l[b]}`}';
patched=once(patched,oldFormatter,'__formatStorageBytes');
patched=once(patched,'t(N.freeBytes)," Free of ",t(N.totalBytes)','t(N.disk?.freeBytes)," Free of ",t(N.disk?.totalBytes)');
patched=once(patched,'Math.min(100,Math.max(5,(N.totalBytes-N.freeBytes)/(N.totalBytes||1)*100))','(__storageUsedPercent(N.disk)??0)');
patched=once(patched,'className:"h-2 w-full bg-prizm-border rounded-full overflow-hidden",children:', 'className:"h-2 w-full bg-prizm-border rounded-full overflow-hidden","aria-label":__storageUsedPercent(N.disk)===null?"Disk usage unavailable":"Disk usage",children:');
for(const[old,key]of [['prizmHistory','history'],['prizmCache','runtimeCache'],['nodeModules','nodeModules'],['data','data'],['dist','dist']])patched=once(patched,'bytes:N.folders.'+old,'bytes:N.folders?.'+key+'?.sizeBytes');
patched=once(patched,'N.lastCleanupTime?new Date(N.lastCleanupTime).toLocaleString():"Running periodically"','N.lastCleanupAt?new Date(N.lastCleanupAt).toLocaleString():"Unavailable"');
const helper=(await transform(fs.readFileSync('src/lib/storagePresentation.ts','utf8'),{loader:'ts',format:'esm'})).code.replace(/export \{[\s\S]*?\};?\s*$/,'').replaceAll('formatStorageBytes','__formatStorageBytes').replaceAll('storageUsedPercent','__storageUsedPercent');
assert(!helper.includes('export'));patched+='\n'+helper;
sources.set(target,patched);
// Rename only the changed module and its importing ancestors so cached clients refresh safely.
const changedModules=new Set([target]);let grew=true;
while(grew){grew=false;for(const[n,s]of sources)if(!changedModules.has(n)&&[...changedModules].some(child=>s.includes(child))){changedModules.add(n);grew=true;}}
const rename=new Map([...changedModules].map(n=>[n,n.replace(/\.js$/,'-storage21.js')]));
const rewrite=s=>{for(const[a,b]of rename)s=s.replaceAll(a,b);return s;};
fs.cpSync(base,out,{recursive:true});
for(const[old,next]of rename){const s=rewrite(sources.get(old));parse(s,{sourceType:'module'});fs.writeFileSync(out+'/assets/'+next,s);}
for(const f of entries)fs.writeFileSync(out+'/'+f,rewrite(fs.readFileSync(base+'/'+f,'utf8')));
const after=tree(out),changed=Object.keys(after).filter(p=>before[p]!==after[p]).sort();
for(const p of Object.keys(before).filter(p=>!entries.includes(p)))assert.equal(before[p],after[p],'Existing file preserved: '+p);
assert(changed.every(p=>entries.includes(p)||p.startsWith('assets/')&&p.endsWith('-storage21.js')));
const manifest={schema:1,scope:'Local Storage presentation only; no backend, telemetry, permissions, data deletion or latency changes',before,after,changed,assets:{storage:rename.get(target)},renamed:Object.fromEntries(rename)};
fs.writeFileSync(path.dirname(out)+'/storage-display-manifest.json',JSON.stringify(manifest,null,2));
console.log(JSON.stringify({out,changed,manifestHash:sha(fs.readFileSync(path.dirname(out)+'/storage-display-manifest.json'))}));
