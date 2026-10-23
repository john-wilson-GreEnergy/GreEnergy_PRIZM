import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
const traverse=traverseModule.default??traverseModule;
const root=path.resolve(process.argv[2]),m=JSON.parse(fs.readFileSync(root+'/storage-presence-manifest.json'));
const source=fs.readFileSync(root+'/fleet/dist/assets/'+m.assets.storage,'utf8');
let render;
traverse(parse(source,{sourceType:'module'}),{ArrowFunctionExpression(p){const s=source.slice(p.node.start,p.node.end);if(s.startsWith('()=>{const t=__formatStorageBytes;')&&s.includes('Root Filesystem Status:')){assert(!render);render=s;}}});
assert(render);const free=new Set();traverse(parse('('+render+')',{sourceType:'module'}),{ReferencedIdentifier(p){if(!p.scope.hasBinding(p.node.name))free.add(p.node.name);}});
const helper=source.slice(source.indexOf('\nfunction __formatStorageBytes'));
const ctx={e:jsx,j:'cache',P:{history:{enabled:false},runtimeCache:{maxCacheBytes:750*1024**2,maxCacheAgeDays:3}},B:false,Math,Number,Date};
for(const n of free)if(!(n in ctx)&&!n.startsWith('__'))ctx[n]=()=>null;
const folderKeys=['history','runtimeCache','nodeModules','data','dist'];
const status={disk:{totalBytes:1024**4,freeBytes:512*1024**3},folders:Object.fromEntries(folderKeys.map(k=>[k,{exists:true,sizeBytes:0}]))};
const html=N=>renderToStaticMarkup(vm.runInNewContext(helper+'\n('+render+')()',{...ctx,N}));
assert.equal((html(status).match(/>0 MB</g)||[]).length,5);
for(const key of folderKeys){const N=structuredClone(status);N.folders[key].exists=false;const s=html(N);assert.equal((s.match(/Not present/g)||[]).length,1);assert.equal((s.match(/>0 MB</g)||[]).length,4);}
const missing=structuredClone(status);for(const k of folderKeys)missing.folders[k].exists=false;
assert.equal((html(missing).match(/Not present/g)||[]).length,5);
for(const N of [{},{folders:{nodeModules:{sizeBytes:0}}},{folders:{data:{exists:null,sizeBytes:0}}}]){const s=html(N);assert(s.includes('Unavailable'));assert(!s.includes('NaN'));assert(!s.includes('undefined'));assert(!s.includes('Not present'));}
assert(html(status).includes('512.0 GB'));assert(html(status).includes('width:50%'));
function fn(src,name){const n=parse(src).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert(n,name);return src.slice(n.start,n.end);}
const server=fs.readFileSync(root+'/collector/dist/server.cjs','utf8');
const recovery=fs.readFileSync(root+'/collector/rollback-server.cjs','utf8');
const prior=fs.readFileSync('/private/tmp/prizm-snapshot-retention-20261021-v3/dist/server.cjs','utf8');
let restored=server.replace(fn(server,'getStorageStatus'),fn(prior,'getStorageStatus')).replace('\n'+fn(server,'storageFolderExists')+'\n','');
assert.equal(restored,recovery,'Only status metadata added beyond cleanup guard');
restored=recovery.replace(fn(recovery,'initLocalStorageMaintenance'),fn(prior,'initLocalStorageMaintenance')).replace("    initLocalStorageMaintenance(process.argv.includes('--skip-startup-storage-cleanup'));",'    initLocalStorageMaintenance();');
assert.equal(restored,prior,'Every unrelated collector byte preserved');
for(const src of [server,recovery]){
 const calls=[],policy={history:{cleanupIntervalMinutes:30},runtimeCache:{cleanupIntervalMinutes:30}};
 let tick;
 const context={loadStoragePolicy:()=>policy,import_fs4:{default:{mkdirSync:()=>calls.push('mkdir')}},HISTORY_ROOT:'history',CACHE_ROOT:'cache',getFolderSize:()=>({sizeBytes:0}),getDiskSpace:()=>({freeBytes:100}),formatBytes:String,process:{cwd:()=>'/fixture'},console:{log:()=>{}},runStorageCleanup:()=>calls.push('cleanup'),checkAndEnforceLowDisk:()=>calls.push('check'),stopLocalStorageMaintenance:()=>calls.push('stop'),setInterval:(cb,ms)=>{tick=cb;calls.push(ms);}};
 vm.runInNewContext(fn(src,'initLocalStorageMaintenance')+'\ninitLocalStorageMaintenance(true)',context);
 assert.deepEqual(calls,['stop',1800000],'Skip only startup; scheduled timing retained');tick();assert.deepEqual(calls,['stop',1800000,'check','cleanup']);
 calls.length=0;vm.runInNewContext(fn(src,'initLocalStorageMaintenance')+'\ninitLocalStorageMaintenance()',context);assert.deepEqual(calls,['mkdir','mkdir','cleanup','stop',1800000],'Normal future boots unchanged');
}
const reads=[],existsCode=fn(server,'storageFolderExists');
const result=vm.runInNewContext(existsCode+'\n'+fn(server,'getStorageStatus')+'\ngetStorageStatus()',{
 loadStoragePolicy:()=>({history:{enabled:false},runtimeCache:{}}),getDiskSpace:()=>({totalBytes:100,usedBytes:25,freeBytes:75,usedPercent:25}),process:{cwd:()=>'/fixture'},HISTORY_ROOT:'/fixture/history',CACHE_ROOT:'/fixture/cache',getFolderSize:()=>({sizeBytes:0,fileCount:0}),import_path4:{default:path},import_fs4:{default:{statSync:p=>{reads.push(p);if(p.endsWith('/history')||p.endsWith('/node_modules'))throw Object.assign(Error('absent'),{code:'ENOENT'});return {isDirectory:()=>true};}}},lowDiskState:false,lastCleanupAt:null,lastCleanupSummary:{},Date
});
assert.equal(result.folders.history.exists,false);assert.equal(result.folders.nodeModules.exists,false);for(const k of ['runtimeCache','data','dist'])assert.equal(result.folders[k].exists,true);assert.equal(reads.length,5);
fs.writeFileSync(root+'/storage-presence-preview.html','<!doctype html><meta charset="utf-8"><title>Storage folder presence verification</title><style>body{background:#101923;color:#eef4fa;font:16px system-ui;margin:30px}div{margin:6px}span{margin-right:12px}button,select{padding:6px;margin:8px}</style><h1>Empty folders — expected 0 MB</h1>'+html(status)+'<h1>Absent folders — expected Not present</h1>'+html(missing));
console.log('PASS exact UI states, canonical presence metadata, inaccessible fallback, no startup cleanup on apply/recovery, unchanged schedule and unrelated collector bytes');
