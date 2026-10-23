/** Exact-baseline patch: folder metadata/display and an opt-in startup cleanup skip. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {transform} from 'esbuild';
import {parse} from '@babel/parser';
const [fleetArg,collectorArg,outArg]=process.argv.slice(2);
assert(fleetArg&&collectorArg&&outArg);
const fleet=path.resolve(fleetArg),collector=path.resolve(collectorArg),out=path.resolve(outArg);
assert(!fs.existsSync(out));
const sha=b=>createHash('sha256').update(b).digest('hex');
function tree(dir){const r={};for(const n of fs.readdirSync(dir).sort()){const p=dir+'/'+n,s=fs.lstatSync(p);assert(!s.isSymbolicLink());if(s.isDirectory())for(const[k,v]of Object.entries(tree(p)))r[n+'/'+k]=v;else{assert(s.isFile());r[n]=sha(fs.readFileSync(p));}}return r;}
function once(s,a,b){assert.equal(s.split(a).length,2,'Unique boundary: '+a);return s.replace(a,b);}
function functionCode(source,name){const n=parse(source,{sourceType:'module'}).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert(n,name);return source.slice(n.start,n.end);}
const before=tree(fleet),collectorBefore=tree(collector);
const baseline=JSON.parse(fs.readFileSync(path.dirname(fleet)+'/storage-display-manifest.json'));
assert.deepEqual(before,baseline.after,'Reviewed UI baseline');
const storageJs=(await transform(fs.readFileSync('src/server/storage/storageMaintenance.ts','utf8'),{loader:'ts',format:'esm'})).code;
// Transpiled exports are declarations without export prefixes in esbuild ESM output.
const compileFn=name=>functionCode(storageJs,name).replaceAll('fs.', 'import_fs4.default.').replaceAll('path.', 'import_path4.default.');
const priorServer=fs.readFileSync(collector+'/server.cjs','utf8');
let guarded=once(priorServer,functionCode(priorServer,'initLocalStorageMaintenance'),compileFn('initLocalStorageMaintenance'));
guarded=once(guarded,'    initLocalStorageMaintenance();',"    initLocalStorageMaintenance(process.argv.includes('--skip-startup-storage-cleanup'));");
let server=once(guarded,functionCode(guarded,'getStorageStatus'),compileFn('getStorageStatus'));
server+='\n'+compileFn('storageFolderExists')+'\n';parse(server);parse(guarded);
const entries=['index.html','fleet.html','mobile.html','signin.html'],all=fs.readdirSync(fleet+'/assets'),active=new Set(),queue=entries.map(f=>fs.readFileSync(fleet+'/'+f,'utf8'));
while(queue.length){const s=queue.pop();for(const n of all)if(!active.has(n)&&s.includes(n)){active.add(n);if(n.endsWith('.js'))queue.push(fs.readFileSync(fleet+'/assets/'+n,'utf8'));}}
const sources=new Map([...active].filter(n=>n.endsWith('.js')).map(n=>[n,fs.readFileSync(fleet+'/assets/'+n,'utf8')]));
const targets=[...sources].filter(([,s])=>s.includes('Root Filesystem Status:'));assert.equal(targets.length,1);
const [target,original]=targets[0];let patched=original;
for(const key of ['history','runtimeCache','nodeModules','data','dist'])patched=once(patched,'bytes:N.folders?.'+key+'?.sizeBytes','folder:N.folders?.'+key);
patched=once(patched,'children:t(s.bytes)','children:__formatStorageFolder(s.folder)');
const uiJs=(await transform(fs.readFileSync('src/lib/storagePresentation.ts','utf8'),{loader:'ts',format:'esm'})).code;
patched+='\n'+functionCode(uiJs,'formatStorageFolder').replaceAll('formatStorageFolder','__formatStorageFolder').replaceAll('formatStorageBytes','__formatStorageBytes')+'\n';
sources.set(target,patched);
const changedModules=new Set([target]);let grew=true;
while(grew){grew=false;for(const[n,s]of sources)if(!changedModules.has(n)&&[...changedModules].some(child=>s.includes(child))){changedModules.add(n);grew=true;}}
const rename=new Map([...changedModules].map(n=>[n,n.replace(/\.js$/,'-presence21.js')]));
const rewrite=s=>{for(const[a,b]of rename)s=s.replaceAll(a,b);return s;};
fs.mkdirSync(out,{recursive:true});fs.cpSync(fleet,out+'/fleet/dist',{recursive:true});fs.cpSync(collector,out+'/collector/dist',{recursive:true});
for(const[old,next]of rename){const s=rewrite(sources.get(old));parse(s,{sourceType:'module'});fs.writeFileSync(out+'/fleet/dist/assets/'+next,s);}
for(const f of entries)fs.writeFileSync(out+'/fleet/dist/'+f,rewrite(fs.readFileSync(fleet+'/'+f,'utf8')));
fs.writeFileSync(out+'/collector/dist/server.cjs',server);
// Recovery has the original metadata logic plus the same approved startup-only guard.
fs.writeFileSync(out+'/collector/rollback-server.cjs',guarded);
const after=tree(out+'/fleet/dist'),collectorAfter=tree(out+'/collector/dist');
const changed=Object.keys(after).filter(p=>before[p]!==after[p]).sort();
for(const p of Object.keys(before).filter(p=>!entries.includes(p)))assert.equal(before[p],after[p]);
assert.deepEqual(Object.keys(collectorAfter).filter(p=>collectorBefore[p]!==collectorAfter[p]),['server.cjs']);
const manifest={schema:1,scope:'Folder presence metadata/display; opt-in one-time startup cleanup skip; no latency, permissions, acquisition or scheduled cleanup changes',before,after,changed,collectorBefore,collectorAfter,rollbackServerSha:sha(guarded),assets:{storage:rename.get(target)},renamed:Object.fromEntries(rename)};
fs.writeFileSync(out+'/storage-presence-manifest.json',JSON.stringify(manifest,null,2));
console.log(JSON.stringify({out,changed:changed.length,manifestHash:sha(fs.readFileSync(out+'/storage-presence-manifest.json'))}));
