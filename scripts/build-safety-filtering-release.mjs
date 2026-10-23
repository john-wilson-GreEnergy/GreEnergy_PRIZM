/** Exact overlay of the deployed safety-selection release. No activation or equipment I/O. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {build,transform} from 'esbuild';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse=traverseModule.default??traverseModule;
const [baseArg,outArg,installerArg]=process.argv.slice(2);assert(baseArg&&outArg&&installerArg);
const base=path.resolve(baseArg),out=path.resolve(outArg);assert(!fs.existsSync(out));
const sha=b=>createHash('sha256').update(b).digest('hex');
function tree(dir){const result={};for(const n of fs.readdirSync(dir).sort()){const p=dir+'/'+n,s=fs.lstatSync(p);assert(!s.isSymbolicLink());if(s.isDirectory())for(const[k,v]of Object.entries(tree(p)))result[n+'/'+k]=v;else{assert(s.isFile());result[n]=sha(fs.readFileSync(p));}}return result;}
function once(s,a,b){assert.equal(s.split(a).length,2,'Unique patch boundary '+a.slice(0,80));return s.replace(a,b);}
function fn(s,name){const node=parse(s,{sourceType:'module'}).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert(node,name);return s.slice(node.start,node.end);}
function execute(s){let node;traverse(parse(s,{sourceType:'module'}),{CallExpression(p){if(p.node.callee.type==='MemberExpression'&&p.node.callee.property.name==='post'&&p.node.arguments[0]?.value==='/execute'&&s.slice(p.node.start,p.node.end).includes('buildSafetyFaultClearCommand')){assert(!node);node=p.node.arguments[1];}}});assert(node);return s.slice(node.start,node.end);}
const raw=fs.readFileSync(base+'/safety-selection-manifest.json');assert.equal(sha(raw),'35b44894376fcb5f9266beeaf19781509a264ae31e1d25caf85276cce333f1b1');
const prior=JSON.parse(raw),fleet=base+'/fleet/dist',collector=base+'/collector/dist',before=tree(fleet),collectorBefore=tree(collector);
assert.deepEqual(before,prior.after);assert.deepEqual(collectorBefore,prior.collectorAfter);
const entries=['index.html','fleet.html','mobile.html','signin.html'],all=fs.readdirSync(fleet+'/assets'),active=new Set(),queue=entries.map(n=>fs.readFileSync(fleet+'/'+n,'utf8'));
while(queue.length){const text=queue.pop();for(const n of all)if(!active.has(n)&&text.includes(n)){active.add(n);if(n.endsWith('.js'))queue.push(fs.readFileSync(fleet+'/assets/'+n,'utf8'));}}
const sources=new Map([...active].filter(n=>n.endsWith('.js')).map(n=>[n,fs.readFileSync(fleet+'/assets/'+n,'utf8')]));
const {panel,view,workspace,client,summary}=prior.assets;
for(const n of [panel,view,workspace,client,summary])assert(sources.has(n),'Active asset '+n);
assert(sources.get(workspace).includes('qr as r,'));
const inputs=new Set();
async function compile(entry){const result=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'esm',jsx:'transform',minify:true,write:false,metafile:true,plugins:[{name:'deployed-singletons',setup(b){
 b.onResolve({filter:/^react(?:\/jsx-runtime)?$/},a=>({path:a.path,namespace:'deployed'}));
 b.onResolve({filter:/fleetWorkspace$/},()=>({path:'workspace-permissions',namespace:'deployed'}));
 b.onLoad({filter:/.*/,namespace:'deployed'},a=>({contents:a.path==='workspace-permissions'?`export {r as remoteReadOnlyWorkspace} from './${workspace}';`:a.path==='react'?`import {r as React} from './${client}';export default React;export const {useEffect,useState,useRef,forwardRef,createElement}=React;`:`import {j as runtime} from './${client}';export const {jsx,jsxs,Fragment}=runtime;`,loader:'js'}));
 b.onResolve({filter:/^\.\//},a=>a.namespace==='deployed'?{path:a.path,external:true}:undefined);
 }}]});for(const n of Object.keys(result.metafile.inputs)){assert(n==='<stdin>'||n.startsWith('deployed:')||n.startsWith('node_modules/lucide-react/')||['src/components/SafetyFaultCandidatesPanel.tsx','src/components/SafetyFaultClearView.tsx','src/lib/safetyFaultSelection.ts'].includes(n),'Unreviewed UI input '+n);inputs.add(n);}return result.outputFiles[0].text;}
sources.set(panel,await compile("export {default} from './src/components/SafetyFaultCandidatesPanel';"));
sources.set(view,await compile("export {default} from './src/components/SafetyFaultClearView';"));
const changedModules=new Set([panel,view]);let grew=true;
while(grew){grew=false;for(const[n,text]of sources)if(!changedModules.has(n)&&[...changedModules].some(child=>text.includes(child))){changedModules.add(n);grew=true;}}
const rename=new Map([...changedModules].map(n=>[n,`filter22-${sha(n).slice(0,12)}.js`]));
const rewrite=text=>{for(const[a,b]of rename)text=text.replaceAll(a,b);return text;};
const transpiled=(await transform(fs.readFileSync('src/server/safetyFaultClear.ts','utf8'),{loader:'ts',format:'esm'})).code;
const priorServer=fs.readFileSync(collector+'/server.cjs','utf8');let server=priorServer;const patches=[];
const patch=(old,next)=>{server=once(server,old,next);patches.push({old,next});};
for(const n of ['normalizeKey','extractLastCallCandidates','normalizeBlockviewerTopology','mergeCandidates','buildSafetyFaultCandidateSnapshot'])patch(fn(server,n),fn(transpiled,n));
patch(fn(server,'extractLastCallCandidates'),fn(transpiled,'collectSafetyCandidates')+'\n'+fn(server,'extractLastCallCandidates'));
patch(execute(server),execute(transpiled));
let reversed=server;for(const p of [...patches].reverse())reversed=once(reversed,p.next,p.old);assert.equal(reversed,priorServer,'Unrelated collector bytes preserved');
assert(server.includes('--skip-startup-storage-cleanup'));parse(server);
fs.mkdirSync(out,{recursive:true});fs.cpSync(fleet,out+'/fleet/dist',{recursive:true});fs.cpSync(collector,out+'/collector/dist',{recursive:true});
for(const[old,next]of rename){const text=rewrite(sources.get(old));parse(text,{sourceType:'module'});fs.writeFileSync(out+'/fleet/dist/assets/'+next,text);}
for(const n of entries)fs.writeFileSync(out+'/fleet/dist/'+n,rewrite(fs.readFileSync(fleet+'/'+n,'utf8')));
fs.writeFileSync(out+'/collector/dist/server.cjs',server);fs.writeFileSync(out+'/collector/rollback-server.cjs',priorServer);
const after=tree(out+'/fleet/dist'),collectorAfter=tree(out+'/collector/dist'),changed=Object.keys(after).filter(n=>before[n]!==after[n]).sort();
for(const n of Object.keys(before).filter(n=>!entries.includes(n)))assert.equal(before[n],after[n]);
assert.deepEqual(Object.keys(collectorAfter).filter(n=>collectorBefore[n]!==collectorAfter[n]),['server.cjs']);
const manifest={schema:1,scope:'Safety candidate discovery and conflict guards only; no latency, permissions or cleanup policy changes',before,after,changed,collectorBefore,collectorAfter,rollbackServerSha:sha(priorServer),assets:{panel:rename.get(panel),view:rename.get(view),summary:rename.get(summary),workspace:rename.get(workspace),client},renamed:Object.fromEntries(rename),inputs:[...inputs]};
const manifestBytes=JSON.stringify(manifest,null,2);fs.writeFileSync(out+'/safety-filtering-manifest.json',manifestBytes);
fs.writeFileSync(out+'/collector-patch-proof.json',JSON.stringify(patches));
// Reuse reviewed fixed-target installer with new exact baselines and release identity.
let installer=fs.readFileSync(installerArg,'utf8');
installer=once(installer,"const priorFleet='/opt/prizm-fleet/releases/storage-presence-20261021';","const priorFleet='/opt/prizm-fleet/releases/__BASE_FLEET__';");
installer=once(installer,"const priorCollector='/opt/prizm-fleet/releases/storage-presence-collector-20261021';","const priorCollector='/opt/prizm-fleet/releases/__BASE_COLLECTOR__';");
installer=installer.replaceAll('safety-selection','safety-filtering').replaceAll('__BASE_FLEET__','safety-selection-20261022').replaceAll('__BASE_COLLECTOR__','safety-selection-collector-20261022');
installer=once(installer,"'z'.repeat(49)","'z'.repeat(50)");
installer=once(installer,"const manifestHash='35b44894376fcb5f9266beeaf19781509a264ae31e1d25caf85276cce333f1b1';",`const manifestHash='${sha(manifestBytes)}';`);
installer=once(installer,'/^assets\\/safety22-[a-f0-9]{12}-[A-Za-z0-9_]+(?:\\.[A-Za-z0-9_]+)*\\.js$/.test(n)','/^assets\\/filter22-[a-f0-9]{12}\\.js$/.test(n)');
installer=installer.replaceAll('Safety fault selection','Safety candidate filtering').replaceAll('Safety fault workflow deployment complete.','Safety candidate filtering deployment complete.');
installer=once(installer,"assert.equal(candidate.allowFaultReset,true);}","assert.equal(candidate.allowFaultReset,true);assert(Array.isArray(candidate.resetEvidence)&&candidate.resetEvidence.some(e=>e.allowFaultReset===true),'Positive reset evidence required');if(candidate.resetEvidence.some(e=>e.allowFaultReset!==true))assert(candidate.resetBlockedReason,'Conflicting evidence must block clearing');}");
const allowed=new Function('n','return '+installer.match(/assert\(m\.changed\.every\(n=>(.+)\)\);/)[1]);assert(changed.every(allowed));for(const n of ['../server.cjs','assets/filter22-xyz.js','assets/filter22-123456789abc.js/evil'])assert(!allowed(n));
parse(installer,{sourceType:'module'});fs.writeFileSync(path.dirname(out)+'/prizm-safety-filtering-deploy.mjs',installer);
const stage=path.dirname(out)+'/prizm-safety-filtering-20261022';assert(!fs.existsSync(stage));fs.mkdirSync(stage);
fs.writeFileSync(stage+'/safety-filtering-manifest.json',manifestBytes);
for(const n of changed){fs.mkdirSync(path.dirname(stage+'/fleet/'+n),{recursive:true});fs.copyFileSync(out+'/fleet/dist/'+n,stage+'/fleet/'+n);}
fs.mkdirSync(stage+'/collector');fs.copyFileSync(out+'/collector/dist/server.cjs',stage+'/collector/server.cjs');fs.copyFileSync(out+'/collector/rollback-server.cjs',stage+'/collector/rollback-server.cjs');
console.log(JSON.stringify({out,stage,manifestSha:sha(manifestBytes),changedFiles:changed.length,activationPerformed:false}));
