import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
const traverse=traverseModule.default??traverseModule;
const [base,release]=process.argv.slice(2).map(p=>path.resolve(p));
const manifest=JSON.parse(fs.readFileSync(path.dirname(release)+'/storage-display-manifest.json'));
const source=fs.readFileSync(release+'/assets/'+manifest.assets.storage,'utf8');
const tree=parse(source,{sourceType:'module'});let render,free;
traverse(tree,{ArrowFunctionExpression(p){
  const s=source.slice(p.node.start,p.node.end);
  if(!s.includes('Root Filesystem Status:')||!s.startsWith('()=>{const t=__formatStorageBytes;'))return;
  assert(!render);render=s;free=new Set();p.traverse({ReferencedIdentifier(q){if(!q.scope.hasBinding(q.node.name)||!p.scope.getBinding(q.node.name))free.add(q.node.name);}});
}});
assert(render);
free=new Set();traverse(parse('('+render+')',{sourceType:'module'}),{ReferencedIdentifier(p){if(!p.scope.hasBinding(p.node.name))free.add(p.node.name);}});
// Only this isolated presentational expression is run; never component effects or server startup.
const helper=source.slice(source.indexOf('\nfunction __formatStorageBytes'));
assert(helper.includes('function __storageUsedPercent'));
const policy={history:{enabled:false},runtimeCache:{enabled:true,maxCacheBytes:1024**3,maxCacheAgeDays:1}};
const status={disk:{totalBytes:1024**4,freeBytes:512*1024**3},folders:{history:{sizeBytes:0},runtimeCache:{sizeBytes:1024**2},nodeModules:{sizeBytes:1024**3},data:{sizeBytes:2048},dist:{sizeBytes:4096}},lowDisk:false,lastCleanupAt:null};
const context={e:jsx,j:'cache',N:status,P:policy,B:false,Math,Number,Date};
// Icons/event handlers are inert in this isolated render. Missing values fail loudly if used as data.
for(const n of free)if(!(n in context)&&!['__formatStorageBytes','__storageUsedPercent'].includes(n))context[n]=()=>null;
function html(N){return renderToStaticMarkup(vm.runInNewContext(helper+'\n('+render+')()',{...context,N}));}
const good=html(status);assert(good.includes('512.0 GB'));assert(good.includes('1.0 TB'));assert(good.includes('width:50%'));
for(const value of ['0 MB','1.0 MB','1.0 GB','2.0 KB','4.0 KB'])assert(good.includes(value),value);
for(const N of [{},{disk:{totalBytes:0,freeBytes:null},folders:{}},{disk:{totalBytes:NaN,freeBytes:Infinity},folders:{data:{sizeBytes:-1}}}]){
 const rendered=html(N);assert(rendered.includes('Unavailable'));assert(rendered.includes('Disk usage unavailable'));assert(!rendered.includes('NaN'));assert(!rendered.includes('undefined'));assert(!rendered.includes('Infinity'));
}
// All importing ancestors differ only in immutable asset references; no control/latency logic changed.
for(const [old,next]of Object.entries(manifest.renamed)){
 if(next===manifest.assets.storage)continue;
 let original=fs.readFileSync(base+'/assets/'+old,'utf8');
 for(const[a,b]of Object.entries(manifest.renamed))original=original.replaceAll(a,b);
 assert.equal(fs.readFileSync(release+'/assets/'+next,'utf8'),original);
}
for(const [f,h]of Object.entries(manifest.before))if(!['index.html','fleet.html','mobile.html','signin.html'].includes(f))assert.equal(manifest.after[f],h);
assert.equal(manifest.before['fleet-server.cjs'],manifest.after['fleet-server.cjs']);
const preview=path.dirname(release)+'/storage-preview.html';
fs.writeFileSync(preview,'<!doctype html><meta charset="utf-8"><title>Storage display verification</title><style>body{background:#101923;color:#eef4fa;font:16px system-ui;margin:30px}button,select{margin:8px;padding:6px}h1{font-size:24px}div{margin:6px}span{margin-right:12px}</style><h1>Local Storage — synthetic verification</h1><p>Exact release display. 512 GB free / 1 TB. No equipment connected.</p>'+good+'<h2>Unavailable readings</h2>'+html({}));
console.log('PASS exact storage UI render: nested values, empty folders, malformed/missing values, disk meter, unchanged backend and ancestor logic');
console.log(preview);
