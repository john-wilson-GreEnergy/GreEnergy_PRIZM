/** Patch only reviewed interface-loading changes onto the exact Dell release. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {build,transform} from 'esbuild';
import {parse} from '@babel/parser';
const [baseArg,outArg]=process.argv.slice(2);assert(baseArg&&outArg);
const base=path.resolve(baseArg),out=path.resolve(outArg);assert(!fs.existsSync(out));
const sha=b=>createHash('sha256').update(b).digest('hex');
function tree(dir){const r={};for(const n of fs.readdirSync(dir).sort()){const p=dir+'/'+n,s=fs.lstatSync(p);assert(!s.isSymbolicLink());if(s.isDirectory())for(const[k,v]of Object.entries(tree(p)))r[n+'/'+k]=v;else{assert(s.isFile());r[n]=sha(fs.readFileSync(p));}}return r;}
function once(s,a,b){assert.equal(s.split(a).length,2,'Unique boundary: '+a.slice(0,100));return s.replace(a,b);}
const before=tree(base);fs.cpSync(base,out,{recursive:true});
const sidecar=await build({entryPoints:['src/server/fleet/workspaceUi.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false});
fs.writeFileSync(out+'/workspace-ui.cjs',sidecar.outputFiles[0].contents);
const names=fs.readdirSync(base+'/assets'),entries=['index.html','fleet.html','mobile.html','signin.html'].filter(n=>fs.existsSync(base+'/'+n));
const active=new Set(),queue=entries.map(n=>fs.readFileSync(base+'/'+n,'utf8'));
while(queue.length){const s=queue.pop();for(const n of names)if(!active.has(n)&&s.includes(n)){active.add(n);if(n.endsWith('.js'))queue.push(fs.readFileSync(base+'/assets/'+n,'utf8'));}}
const name=prefix=>{const matches=[...active].filter(n=>n.startsWith(prefix+'-')&&n.endsWith('.js'));assert.equal(matches.length,1,prefix);return matches[0];};
const client=name('client'),strings=name('StringDashboard'),timeline=name('PcsOperationalTimeline'),entry=name('workspace');
const texts=new Map([...active].filter(n=>n.endsWith('.js')).map(n=>[n,fs.readFileSync(base+'/assets/'+n,'utf8')]));
let history=texts.get(timeline);
history=once(history,'function W({arrays:s}){const[l,t]=i.useState(!1)','function W({arrays:s,embedded=false}){const[l,t]=i.useState(embedded)');
history=once(history,'return e.jsxs("details",{className:"rounded border border-prizm-border bg-white p-4 mb-5",open:l,onToggle:a=>t(a.currentTarget.open),children:[e.jsx("summary",{className:"cursor-pointer font-bold text-sm",children:"Operational history & incident timeline"})',
 'return e.jsxs(embedded?"section":"details",{className:embedded?"":"rounded border border-prizm-border bg-white p-4 mb-5",open:embedded?undefined:l,onToggle:embedded?undefined:a=>t(a.currentTarget.open),children:[!embedded&&e.jsx("summary",{className:"cursor-pointer font-bold text-sm",children:"Operational history & incident timeline"})');
texts.set(timeline,history);
const wrapper='DeferredStringTimeline-startupassets21.js';
let wrapperSource=fs.readFileSync('src/components/DeferredStringTimeline.tsx','utf8');
wrapperSource=once(wrapperSource,"import React, {lazy, Suspense, useState} from 'react';",`import {r as React} from './${client}';const {lazy,Suspense,useState}=React;`);
wrapperSource=once(wrapperSource,"import('./PcsOperationalTimeline')",`import('./${timeline}').then(m=>({default:m.P}))`);
texts.set(wrapper,(await transform(wrapperSource,{loader:'tsx',format:'esm',jsx:'transform',minify:true})).code);
let stringSource=texts.get(strings);
stringSource=once(stringSource,`import{P as vr}from"./${timeline}";`,`import vr from "./${wrapper}";`);
const removed=[timeline,name('CartesianChart'),name('LineChart')];
for(const n of removed.slice(1))stringSource=once(stringSource,`import"./${n}";`,'');
texts.set(strings,stringSource);
// Remove only the string-dashboard preload references to the now deferred
// chart modules. Other pages retain their existing charts and preload lists.
let shell=texts.get(entry);const ast=parse(shell,{sourceType:'module'});
const arrays=[];function walk(n){if(!n||typeof n!=='object')return;if(n.type==='ArrayExpression')arrays.push(n);for(const[k,v]of Object.entries(n))if(k!=='loc'&&k!=='comments'){if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}}walk(ast);
const deps=arrays.find(n=>n.elements.every(x=>x?.type==='StringLiteral')&&n.elements.some(x=>x.value==='assets/'+strings));assert(deps);
const indices=removed.map(n=>deps.elements.findIndex(x=>x.value==='assets/'+n));assert(indices.every(i=>i>=0));
const escaped=strings.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const pattern=new RegExp('(import\\("\\./'+escaped+'"\\),__vite__mapDeps\\()\\[([0-9,]+)\\](\\))');
const match=pattern.exec(shell);assert(match);assert.equal(shell.match(new RegExp(pattern.source,'g')).length,1);
const ids=match[2].split(',').map(Number);assert(indices.every(i=>ids.includes(i)));
shell=shell.replace(pattern,(_all,a,_ids,b)=>a+'['+ids.filter(i=>!indices.includes(i)).join(',')+']'+b);texts.set(entry,shell);
const rename=new Map([...texts.keys()].map(n=>[n,n===wrapper?n:n.replace(/\.js$/,'-assets21.js')]));
const rewrite=s=>{for(const[a,b]of rename)s=s.replaceAll(a,b);return s;};
for(const[prior,next]of rename){const s=rewrite(texts.get(prior));parse(s,{sourceType:'module'});fs.writeFileSync(out+'/assets/'+next,s);}
for(const n of entries)fs.writeFileSync(out+'/'+n,rewrite(fs.readFileSync(base+'/'+n,'utf8')));
const after=tree(out),changed=Object.keys(after).filter(p=>before[p]!==after[p]).sort();
assert(changed.every(p=>p==='workspace-ui.cjs'||entries.includes(p)||p.startsWith('assets/')&&p.endsWith('.js')));
for(const f of ['server.cjs','fleet-server.cjs','fleet-entry.cjs'])assert.equal(before[f],after[f],f+' must not change');
const manifest={schema:1,scope:'Deferred string history charts and private static-asset revalidation only; collectors, permissions and remote controls unchanged',before,after,changed,clientName:rename.get(entry),stringName:rename.get(strings),timelineName:rename.get(timeline),wrapperName:wrapper};
const raw=JSON.stringify(manifest,null,2),root=path.dirname(out);fs.writeFileSync(root+'/assets-manifest.json',raw);
let deploy=fs.readFileSync('scripts/deploy-unified-workspace.mjs','utf8');
deploy=once(deploy,"const prior='/opt/prizm-fleet/releases/soc-strings-20261021';","const prior='/opt/prizm-fleet/releases/startup-latency-20261021';");
deploy=deploy.replaceAll('unified-workspace','startup-assets').replaceAll('unified-manifest.json','assets-manifest.json');
deploy=deploy.replace(/zz+-unified-20261021\.conf/,'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz-startup-assets-20261021.conf');
deploy=deploy.replace(/const manifestHash='[a-f0-9]+';/,`const manifestHash='${sha(raw)}';`);
deploy=once(deploy,"assert.deepEqual(m.changed,['fleet-server.cjs','workspace-ui.cjs']);",`assert(m.changed.includes('workspace-ui.cjs'));assert(m.changed.every(p=>p==='workspace-ui.cjs'||['index.html','fleet.html','mobile.html','signin.html'].includes(p)||/^assets\\/[A-Za-z0-9_.-]+\\.js$/.test(p)));for(const f of ['server.cjs','fleet-server.cjs','fleet-entry.cjs'])assert.equal(m.before[f],m.after[f]);`);
deploy=once(deploy,'function socketRead(route){','function socketRead(route,extraHeaders={}){');
deploy=once(deploy,"headers:{Host:'prizm.greenergyresources.org'}","headers:{Host:'prizm.greenergyresources.org',...extraHeaders}");
deploy=once(deploy,"assert.equal(r.headers['x-prizm-ui-release'],releaseId);}","assert.equal(r.headers['x-prizm-ui-release'],releaseId);assert.equal(r.headers['cache-control'],'private, no-cache');const conditional=await socketRead(asset,{'If-None-Match':r.headers.etag});assert.equal(conditional.status,304);assert.equal(conditional.body,'');}");
deploy=once(deploy,'sites.push({siteId:d.siteId,station:d.stationCode,observedAt:d.observedAt});',`const strings=await get(new URL(collector.url).origin+'/api/fleet/workspace/api/local/site-data/strings-fast?shape=list',{authorization:'Bearer '+workspace.token});assert.equal(strings.status,200);assert.equal(JSON.parse(strings.body).strings.length,320);sites.push({siteId:d.siteId,station:d.stationCode,observedAt:d.observedAt,stringRows:320});`);
deploy=once(deploy,'effective(prior);\n const m=manifest(stage)',"effective(prior);for(const p of prop('prizm-fleet','DropInPaths').split(/\\s+/).filter(Boolean))assert(path.basename(p)<path.basename(override),'Later override exists');\n const m=manifest(stage)");
deploy=deploy.replaceAll('Unified workspace deployment complete.','Startup assets deployment complete.').replaceAll('Unified workspace rollback complete.','Startup assets rollback complete.');
parse(deploy,{sourceType:'module'});fs.writeFileSync(root+'/prizm-startup-assets-deploy.mjs',deploy);
const upload=root+'/upload';fs.mkdirSync(upload);for(const p of changed){fs.mkdirSync(path.dirname(upload+'/'+p),{recursive:true});fs.copyFileSync(out+'/'+p,upload+'/'+p);}fs.writeFileSync(upload+'/assets-manifest.json',raw);
console.log(JSON.stringify({out,changed:changed.length,manifestHash:sha(raw),installerHash:sha(deploy),collectorsUnchanged:true}));
