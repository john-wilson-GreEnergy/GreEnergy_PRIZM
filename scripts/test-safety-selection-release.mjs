import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
import {build} from 'esbuild';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
const traverse=traverseModule.default??traverseModule;
const root=path.resolve(process.argv[2]),base=path.resolve(process.argv[3]),m=JSON.parse(fs.readFileSync(root+'/safety-selection-manifest.json'));
const source=fs.readFileSync(root+'/collector/dist/server.cjs','utf8'),prior=fs.readFileSync(base+'/collector/server.cjs','utf8');
function fn(s,name){const n=parse(s,{sourceType:'module'}).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert(n,name);return s.slice(n.start,n.end);}
const guardStart=source.indexOf('    if (req.body.expectedDisplayKey'),guardEnd=source.indexOf('    if (targetEntity.allowFaultReset',guardStart);assert(guardStart>=0&&guardEnd>guardStart);
let reverted=source.slice(0,guardStart)+source.slice(guardEnd);
for(const name of ['mergeCandidates','buildSafetyFaultCandidateSnapshot'])reverted=reverted.replace(fn(reverted,name),fn(prior,name));
reverted=reverted.replace('const appearsCleared = queued && afterEntity?.allowFaultReset === false && afterEntity.communicating === true;','const appearsCleared = afterEntity ? afterEntity.allowFaultReset === false : true;');
reverted=reverted.replace('\n'+fn(source,'safetyFaultEquipment')+'\n'+fn(source,'__safetyStringToEnergySegment')+'\n','');
assert.equal(reverted,prior,'Every unrelated collector byte preserved');
assert.equal(fs.readFileSync(root+'/collector/rollback-server.cjs','utf8'),prior);
for(const name of ['fleet-server.cjs','profile-controls.cjs','remote-admin.cjs'])if(fs.existsSync(base+'/fleet/'+name))assert.equal(fs.readFileSync(root+'/fleet/dist/'+name,'utf8'),fs.readFileSync(base+'/fleet/'+name,'utf8'));
const helpers=['normalizeKey','extractLastCallCandidates','extractBlockviewerCandidate','normalizeBlockviewerTopology','mergeCandidates','buildSafetyFaultCandidateSnapshot','safetyFaultEquipment','__safetyStringToEnergySegment'];
let callback;
traverse(parse(source),{CallExpression(p){if(p.node.callee.type==='MemberExpression'&&p.node.callee.property.name==='post'&&p.node.arguments[0]?.value==='/execute'&&source.slice(p.node.start,p.node.end).includes('buildSafetyFaultClearCommand')){assert(!callback);callback=source.slice(p.node.arguments[1].start,p.node.arguments[1].end);}}});assert(callback);
let posts=0,after=null,before={entityKey:'SK-ST:TEST-B:1-A:4-S:5',displayKey:'String 5',statusMessage:'Door fault',allowFaultReset:true,enabled:true,communicating:true};
const context={console,Buffer,Date,Map,Set,Number,String,Boolean,Array,Math,Promise,setTimeout:f=>f(),
 ProfileStore:{getActiveProfile:()=>({id:'fixture',stationCode:'TEST',blockIndex:1})},buildEmsBaseUrl:()=> 'http://equipment.invalid',
 buildSafetyFaultClearCommand:()=>({buffer:new Uint8Array([1]),commandId:'synthetic'}),
 fetch:async(url,init)=>{assert(String(url).startsWith('http://equipment.invalid/'));if(init?.method==='POST'){posts++;return new Response('Queued');}return new Response(JSON.stringify(String(url).endsWith('/lastCall.json')?{topology:(posts?after:before)?[posts?after:before]:[]}:{}));}
};
vm.createContext(context);vm.runInContext(helpers.map(n=>fn(source,n)).join('\n'),context);
const candidate=context.buildSafetyFaultCandidateSnapshot({}, {topology:[before]}).eligible[0];
assert.equal(candidate.equipment.array,'Array 4');assert.equal(candidate.equipment.segment,'ES3 / String 5');
const handler=vm.runInContext('('+callback+')',context);
async function invoke(extra={}){posts=0;let status=200,result;await handler({body:{profileId:'fixture',entityKeyToken:candidate.entityKeyToken,confirmationText:'CLEAR FAULT',...extra}},{status(n){status=n;return this;},json(v){result=v;return this;}});return{status,result,posts};}
for(const bad of [{profileId:'other'},{confirmationText:'bad'},{expectedStatusMessage:'changed'},{expectedDisplayKey:'wrong'},{expectedResetEntityKey:'other'}]){const r=await invoke(bad);assert(r.status>=400);assert.equal(r.posts,0);}
let r=await invoke();assert.equal(r.posts,1);assert.equal(r.result.verification.appearsCleared,false);
after={...before,allowFaultReset:false};r=await invoke();assert.equal(r.result.verification.appearsCleared,true);
after={...after,communicating:false};r=await invoke();assert.equal(r.result.verification.appearsCleared,false);
// Execute the exact emitted UI component with only React/permission singletons stubbed.
let locked=false;
const bundle=await build({entryPoints:[root+'/fleet/dist/assets/'+m.assets.panel],bundle:true,format:'cjs',platform:'node',write:false,plugins:[{name:'test-singletons',setup(b){b.onResolve({filter:/\/(?:client-|safety22-.*-workspace|workspace-)/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.includes('client-')?'module.exports={r:require("react"),j:require("react/jsx-runtime")};':'module.exports={r:()=>require("permission")()};',loader:'js'}));b.onResolve({filter:/^(react(?:\/jsx-runtime)?|permission)$/},a=>({path:a.path,external:true}));}}]});
const uiContext={exports:{},module:{exports:{}},require:n=>{if(n==='react')return React;if(n==='react/jsx-runtime')return jsx;if(n==='permission')return()=>locked;throw Error('Unexpected dependency '+n);}};uiContext.exports=uiContext.module.exports;vm.runInNewContext(bundle.outputFiles[0].text,uiContext);
const Panel=uiContext.module.exports.default;
const render=(props={})=>renderToStaticMarkup(React.createElement(Panel,{profileId:'fixture',candidates:[candidate],...props}));
let html=render();for(const text of ['Safety fault candidates','Door fault','Array 4','ES3 / String 5','Select all eligible','Clear selected'])assert(html.includes(text));assert(!html.includes('placeholder="CLEAR'));
for(const props of [{stale:true},{unavailable:true}])assert(render(props).includes('Clearing is disabled'));
locked=true;assert(render().includes('Controls are locked'));locked=false;
const summary=fs.readFileSync(root+'/fleet/dist/assets/'+m.assets.summary,'utf8');assert(summary.includes('__SafetySelection'));assert(summary.indexOf('r.jsx(__SafetySelection')<summary.indexOf('CORRECTIVE ACTIONS (DATA-BASED FAULTS)'));assert(summary.includes("get('safetyView')==='legacy'"));
// Recovery simulation uses the generated installer, never systemctl or real files.
const deploy=fs.readFileSync(path.dirname(root)+'/prizm-safety-selection-deploy.mjs','utf8');
const plans=[{unit:'prizm',site:'solar-star-3',override:'/ss3.conf'},{unit:'prizm-site@ss4',site:'solar-star-4',override:'/ss4.conf'},{unit:'prizm-fleet',site:'fleet',override:'/fleet.conf'}];
const files=new Map(),commands=[],protectedState={unchanged:true};let saved;
const recovery={plans,collector:'/new',recovery:'/recovery',fleet:'/fleet',priorFleet:'/old-fleet',priorCollector:'/old',backup:'/backup',assert,console:{log:()=>{}},fs:{writeFileSync:(p,t)=>files.set(p,t),readFileSync:p=>files.get(p),existsSync:p=>files.has(p),unlinkSync:p=>files.delete(p)},run:(cmd,args)=>commands.push([cmd,...args]),healthy:async(_p,updated)=>assert.equal(updated,false),same:(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b)),invariants:()=>protectedState,save:s=>{saved=s;}};
vm.createContext(recovery);vm.runInContext(['entry','overrideText'].map(n=>fn(deploy,n)).join('\n'),recovery);
recovery.argv=unit=>{const p=plans.find(p=>p.unit===unit);return files.has(p.override)?/ExecStart=(\/usr\/bin\/node[^\n]+)/.exec(files.get(p.override))[1]:recovery.entry(p,p.site==='fleet'?recovery.priorFleet:recovery.priorCollector);};
for(const p of plans)files.set(p.override,recovery.overrideText(p,p.site==='fleet'?recovery.fleet:recovery.collector));
await vm.runInContext(fn(deploy,'restartCollector')+'\n'+fn(deploy,'rollback')+'\nrollback({before:{unchanged:true},touched:plans.map(p=>p.unit)})',recovery);
assert.equal(saved.rolledBack,true);assert.equal(files.size,0);assert.deepEqual(commands.filter(c=>c[1]==='restart').map(c=>c[2]),['prizm-fleet','prizm-site@ss4','prizm']);
assert(!deploy.includes('"POST"'));assert(!deploy.includes("'/api/local/safety-fault-clear/execute'"));
console.log('PASS exact release UI, identity, mocked command guards/evidence, unchanged unrelated bytes/security, and reversed recovery with transient cleanup skip. No equipment network.');
