/** Safety-only overlay of the exact deployed storage-presence release. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {build,transform} from 'esbuild';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse=traverseModule.default??traverseModule;
const [baseArg,outArg]=process.argv.slice(2);assert(baseArg&&outArg);
const base=path.resolve(baseArg),out=path.resolve(outArg),fleet=base+'/fleet',collector=base+'/collector';
assert(!fs.existsSync(out),'Use a new output folder');
const sha=b=>createHash('sha256').update(b).digest('hex');
function tree(dir){const r={};for(const n of fs.readdirSync(dir).sort()){const p=dir+'/'+n,s=fs.lstatSync(p);assert(!s.isSymbolicLink());if(s.isDirectory())for(const[k,v]of Object.entries(tree(p)))r[n+'/'+k]=v;else{assert(s.isFile());r[n]=sha(fs.readFileSync(p));}}return r;}
function once(s,a,b){assert.equal(s.split(a).length,2,'Unique boundary: '+a.slice(0,100));return s.replace(a,b);}
function fn(s,name){const n=parse(s,{sourceType:'module'}).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert(n,name);return s.slice(n.start,n.end);}
const manifestBytes=fs.readFileSync(base+'/storage-presence-manifest.json');
assert.equal(sha(manifestBytes),'68df96278949dccb608963dea006d9deaea2f317163bb924a93cadc3583962f7');
const baseline=JSON.parse(manifestBytes),before=tree(fleet),collectorBefore=tree(collector);
assert.deepEqual(before,baseline.after,'Exact deployed Fleet');assert.deepEqual(collectorBefore,baseline.collectorAfter,'Exact deployed collectors');
const entries=['index.html','fleet.html','mobile.html','signin.html'],all=fs.readdirSync(fleet+'/assets'),active=new Set(),queue=entries.map(n=>fs.readFileSync(fleet+'/'+n,'utf8'));
while(queue.length){const s=queue.pop();for(const n of all)if(!active.has(n)&&s.includes(n)){active.add(n);if(n.endsWith('.js'))queue.push(fs.readFileSync(fleet+'/assets/'+n,'utf8'));}}
const name=prefix=>{const m=[...active].filter(n=>n.startsWith(prefix+'-')&&n.endsWith('.js'));assert.equal(m.length,1,prefix);return m[0];};
const sources=new Map([...active].filter(n=>n.endsWith('.js')).map(n=>[n,fs.readFileSync(fleet+'/assets/'+n,'utf8')]));
const client=name('client'),workspace=name('workspace'),summary=name('SiteOperationsDashboard'),clearView=name('SafetyFaultClearView');
assert(sources.get(workspace).includes('qr as r,'),'Deployed read-only permission export');
const additions={panel:'SafetyFaultCandidatesPanel-safety22.js',view:'SafetyFaultClearSelected-safety22.js'};
const inputs=new Set();
async function compile(entry){const result=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'esm',jsx:'transform',minify:true,write:false,metafile:true,plugins:[{name:'deployed-singletons',setup(b){
 b.onResolve({filter:/^react(?:\/jsx-runtime)?$/},a=>({path:a.path,namespace:'deployed'}));
 b.onResolve({filter:/fleetWorkspace$/},()=>({path:'workspace-permissions',namespace:'deployed'}));
 b.onLoad({filter:/.*/,namespace:'deployed'},a=>({contents:a.path==='workspace-permissions'?`export {r as remoteReadOnlyWorkspace} from './${workspace}';`:a.path==='react'?`import {r as React} from './${client}';export default React;export const {useEffect,useState,useRef,forwardRef,createElement}=React;`:`import {j as runtime} from './${client}';export const {jsx,jsxs,Fragment}=runtime;`,loader:'js'}));
 b.onResolve({filter:/^\.\/(?:client-|workspace-)/},a=>({path:a.path,external:true}));
}}]});for(const n of Object.keys(result.metafile.inputs)){assert(n==='<stdin>'||n.startsWith('deployed:')||n.startsWith('node_modules/lucide-react/')||['src/components/SafetyFaultCandidatesPanel.tsx','src/components/SafetyFaultClearView.tsx','src/lib/safetyFaultSelection.ts'].includes(n),'Unreviewed input '+n);inputs.add(n);}return result.outputFiles[0].text;}
sources.set(additions.panel,await compile("export {default} from './src/components/SafetyFaultCandidatesPanel';"));
sources.set(additions.view,await compile("export {default} from './src/components/SafetyFaultClearView';"));
// Preserve every existing summary operation, changing only placement of the safety panel.
let s=sources.get(summary),ast=parse(s,{sourceType:'module'}),legacyNode,notificationNode;
const notificationImport=ast.program.body.find(n=>n.type==='ImportDeclaration'&&n.source.value.includes('NotificationReviewPanel'));
assert(notificationImport);const notificationAlias=notificationImport.specifiers[0].local.name;
traverse(ast,{CallExpression(p){if(p.node.arguments[0]?.name===notificationAlias){assert(!notificationNode);assert.equal(p.parent.type,'ConditionalExpression');assert.equal(p.parentPath.parent.type,'ArrayExpression');notificationNode=p.parent;}
 if(p.node.arguments[1]?.properties?.some(x=>x.key?.name==='title'&&x.value.value==='Safety Fault Candidates')){assert(!legacyNode);assert.equal(p.parent.type,'ArrayExpression');legacyNode=p.node;}}});
assert(legacyNode&&notificationNode);assert(s.includes('const Po=')&&s.includes('onClick:()=>ee("safety-fault")'));
const legacy="new URLSearchParams(window.location.search).get('safetyView')==='legacy'";
const panel=`(${legacy})?null:r.jsx(__SafetySelection,{candidates:Po,profileId:a?.site?.profileId,stale:!!(a?.stale||a?.liveStatus?.stale),unavailable:!a?.safetySummary||a.safetySummary.sourceOk!==true,onOpenDetails:()=>ee('safety-fault')},a?.site?.profileId||'no-safety-profile'),`;
for(const [start,end,value]of [[legacyNode.start,legacyNode.end,`(${legacy})?${s.slice(legacyNode.start,legacyNode.end)}:null`],[notificationNode.start,notificationNode.start,panel]].sort((a,b)=>b[0]-a[0]))s=s.slice(0,start)+value+s.slice(end);
sources.set(summary,`import __SafetySelection from './${additions.panel}';\n`+s);
// Route the existing lazy chunk to the reviewed shared view, retaining its legacy option.
const priorView=sources.get(clearView);const exported=parse(priorView,{sourceType:'module'}).program.body.find(n=>n.type==='ExportNamedDeclaration');
assert(exported?.specifiers.length===1&&exported.specifiers[0].exported.name==='default');
sources.set(clearView,`export {default} from './${additions.view}';\n`);
const changedModules=new Set([summary,clearView,...Object.values(additions)]);let grew=true;
while(grew){grew=false;for(const[n,text]of sources)if(!changedModules.has(n)&&[...changedModules].some(child=>text.includes(child))){changedModules.add(n);grew=true;}}
const rename=new Map([...changedModules].map(n=>[n,`safety22-${sha(n).slice(0,12)}-${n.split('-')[0]}.js`]));
const rewrite=text=>{for(const[a,b]of rename)text=text.replaceAll(a,b);return text;};
// Only the canonical candidate projection and the execute guard/evidence checks change.
const transpiled=(await transform(fs.readFileSync('src/server/safetyFaultClear.ts','utf8'),{loader:'ts',format:'esm'})).code;
const identity=(await transform(fs.readFileSync('src/server/safetyFaultIdentity.ts','utf8'),{loader:'ts',format:'esm'})).code;
const mapping=(await transform(fs.readFileSync('src/lib/stringToEsMapper.ts','utf8'),{loader:'ts',format:'esm'})).code;
const priorServer=fs.readFileSync(collector+'/server.cjs','utf8');let server=priorServer;
for(const n of ['mergeCandidates','buildSafetyFaultCandidateSnapshot'])server=once(server,fn(server,n),fn(transpiled,n));
const guardStart=transpiled.indexOf('    if (req.body.expectedDisplayKey');
assert(guardStart>=0);const guardEnd=transpiled.indexOf('    if (targetEntity.allowFaultReset',guardStart);assert(guardEnd>guardStart);
const executeStart=server.indexOf('.post("/execute"');assert(executeStart>=0);
const executeBoundary=server.indexOf('    if (targetEntity.allowFaultReset',executeStart);assert(executeBoundary>executeStart);
server=server.slice(0,executeBoundary)+transpiled.slice(guardStart,guardEnd)+server.slice(executeBoundary);
server=once(server,'const appearsCleared = afterEntity ? afterEntity.allowFaultReset === false : true;','const appearsCleared = queued && afterEntity?.allowFaultReset === false && afterEntity.communicating === true;');
server+='\n'+fn(identity,'safetyFaultEquipment').replaceAll('stringNumberToEnergySegment','__safetyStringToEnergySegment')+'\n'+fn(mapping,'stringNumberToEnergySegment').replaceAll('stringNumberToEnergySegment','__safetyStringToEnergySegment')+'\n';
assert(server.includes("process.argv.includes(\"--skip-startup-storage-cleanup\")")||server.includes("process.argv.includes('--skip-startup-storage-cleanup')"));parse(server);
fs.mkdirSync(out,{recursive:true});fs.cpSync(fleet,out+'/fleet/dist',{recursive:true});fs.cpSync(collector,out+'/collector/dist',{recursive:true});
for(const[old,next]of rename){const text=rewrite(sources.get(old));parse(text,{sourceType:'module'});fs.writeFileSync(out+'/fleet/dist/assets/'+next,text);}
for(const entry of entries)fs.writeFileSync(out+'/fleet/dist/'+entry,rewrite(fs.readFileSync(fleet+'/'+entry,'utf8')));
fs.writeFileSync(out+'/collector/dist/server.cjs',server);fs.writeFileSync(out+'/collector/rollback-server.cjs',priorServer);
const after=tree(out+'/fleet/dist'),collectorAfter=tree(out+'/collector/dist'),changed=Object.keys(after).filter(n=>before[n]!==after[n]).sort();
for(const n of Object.keys(before).filter(n=>!entries.includes(n)))assert.equal(before[n],after[n],'Existing file preserved '+n);
assert.deepEqual(Object.keys(collectorAfter).filter(n=>collectorBefore[n]!==collectorAfter[n]),['server.cjs']);
const manifest={schema:1,scope:'Safety selection presentation and target/evidence guards only; no latency, permissions or scheduled cleanup changes',before,after,changed,collectorBefore,collectorAfter,rollbackServerSha:sha(priorServer),assets:{panel:rename.get(additions.panel),view:rename.get(additions.view),summary:rename.get(summary),workspace:rename.get(workspace)||workspace,client},renamed:Object.fromEntries(rename),inputs:[...inputs]};
fs.writeFileSync(out+'/safety-selection-manifest.json',JSON.stringify(manifest,null,2));console.log(JSON.stringify({out,changed:changed.length,manifestHash:sha(fs.readFileSync(out+'/safety-selection-manifest.json'))}));
