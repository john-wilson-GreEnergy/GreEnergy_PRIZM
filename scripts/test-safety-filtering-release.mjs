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
const root=path.resolve(process.argv[2]),base=path.resolve(process.argv[3]);
const m=JSON.parse(fs.readFileSync(root+'/safety-filtering-manifest.json'));
const source=fs.readFileSync(root+'/collector/dist/server.cjs','utf8'),prior=fs.readFileSync(base+'/collector/dist/server.cjs','utf8');
function fn(s,name){const n=parse(s,{sourceType:'module'}).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert(n,name);return s.slice(n.start,n.end);}
let reversed=source;
for(const p of JSON.parse(fs.readFileSync(root+'/collector-patch-proof.json')).reverse()){assert.equal(reversed.split(p.next).length,2);reversed=reversed.replace(p.next,p.old);}
assert.equal(reversed,prior,'Every unrelated collector byte preserved');
assert.equal(fs.readFileSync(root+'/collector/rollback-server.cjs','utf8'),prior);
for(const n of Object.keys(m.before).filter(n=>!['index.html','fleet.html','mobile.html','signin.html'].includes(n)))assert(fs.readFileSync(root+'/fleet/dist/'+n).equals(fs.readFileSync(base+'/fleet/dist/'+n)),'Preserved '+n);
// Parent modules differ only by asset import/cache-busting names.
for(const[old,next]of Object.entries(m.renamed))if(![m.assets.panel,m.assets.view].includes(next)){
 let s=fs.readFileSync(root+'/fleet/dist/assets/'+next,'utf8');for(const[a,b]of Object.entries(m.renamed))s=s.replaceAll(b,a);
 assert.equal(s,fs.readFileSync(base+'/fleet/dist/assets/'+old,'utf8'),'Unrelated UI preserved');
}
const helpers=['normalizeKey','collectSafetyCandidates','extractLastCallCandidates','normalizeBlockviewerTopology','mergeCandidates','buildSafetyFaultCandidateSnapshot','safetyFaultEquipment','__safetyStringToEnergySegment'];
let callback;
traverse(parse(source),{CallExpression(p){if(p.node.callee.type==='MemberExpression'&&p.node.callee.property.name==='post'&&p.node.arguments[0]?.value==='/execute'&&source.slice(p.node.start,p.node.end).includes('buildSafetyFaultClearCommand')){assert(!callback);callback=source.slice(p.node.arguments[1].start,p.node.arguments[1].end);}}});assert(callback);
let posts=0,block={},last={},postLast={},failedFeed='',failAfter=false;
const context={console,Buffer,Date,Map,Set,WeakSet,Number,String,Boolean,Array,Math,Promise,setTimeout:f=>f(),
 ProfileStore:{getActiveProfile:()=>({id:'fixture',stationCode:'TEST',blockIndex:1})},buildEmsBaseUrl:()=> 'http://equipment.invalid',
 buildSafetyFaultClearCommand:()=>({buffer:new Uint8Array([1]),commandId:'synthetic'}),
 fetch:async(url,init)=>{assert(String(url).startsWith('http://equipment.invalid/'));if(init?.method==='POST'){posts++;return new Response('Queued');}const feed=String(url).endsWith('/lastCall.json')?'last':'block';if(failedFeed===feed&&(!failAfter||posts))return new Response('Unavailable',{status:503});return new Response(JSON.stringify(feed==='last'?(posts?postLast:last):block));}
};
vm.createContext(context);vm.runInContext(helpers.map(n=>fn(source,n)).join('\n'),context);
const snapshot=context.buildSafetyFaultCandidateSnapshot;
for(const station of ['BHE0020','BHE0021']){
 const entity={entityKey:`SK-ST:${station}-B:1-A:4-S:5`,displayKey:'String 5',statusMessage:'Door fault',allowFaultReset:true,enabled:true,communicating:true};
 for(const[block,last]of [[{nested:{controller:entity}},{}],[{}, {nested:{controller:entity}}]]){const c=snapshot(block,last).eligible[0];assert(c);assert.equal(c.equipment.array,'Array 4');assert.equal(c.equipment.segment,'ES3 / String 5');assert(!c.resetBlockedReason);}
 const no={...entity,allowFaultReset:false};
 for(const[b,l]of [[[entity],[no]],[[no],[entity]],[[entity,no],{}],[{},[no,entity]]]){const c=snapshot(b,l).eligible;assert.equal(c.length,1);assert.match(c[0].resetBlockedReason,/disagree/);}
 assert.equal(snapshot([no],[no]).eligible.length,0);
 const orphan=snapshot({a:{allowFaultReset:true}},{}).eligible[0];assert.match(orphan.resetBlockedReason,/identity/);assert.equal(orphan.resetEntityKey,'');
 const token=entity.entityKey.replace(/[-:]/g,'_');assert.equal(snapshot([{...entity,entityKey:undefined,entityKeyToken:token}],{}).eligible.length,1);
 assert.equal(snapshot([{...entity,allowFaultReset:'false'}],{}).eligible.length,0);
}
const entity={entityKey:'SK-ST:TEST-B:1-A:4-S:5',displayKey:'String 5',statusMessage:'Door fault',allowFaultReset:true,enabled:true,communicating:true};
const candidate=snapshot({},[entity]).eligible[0],handler=vm.runInContext('('+callback+')',context);
async function invoke(extra={}){posts=0;let status=200,result;await handler({body:{profileId:'fixture',entityKeyToken:candidate.entityKeyToken,confirmationText:'CLEAR FAULT',...extra}},{status(n){status=n;return this;},json(v){result=v;return this;}});return{status,result,posts};}
last=[entity];postLast=[{...entity,allowFaultReset:false}];
for(const bad of [{profileId:'other'},{confirmationText:'bad'},{expectedStatusMessage:'changed'},{expectedDisplayKey:'wrong'},{expectedResetEntityKey:'other'}]){const r=await invoke(bad);assert(r.status>=400);assert.equal(r.posts,0);}
block=[{...entity,allowFaultReset:false}];let r=await invoke();assert.equal(r.status,409);assert.equal(r.posts,0);
block={};last=[entity,{...entity,allowFaultReset:false}];r=await invoke();assert.equal(r.status,409);assert.equal(r.posts,0);last=[entity];
for(const feed of ['block','last']){failedFeed=feed;r=await invoke();assert.equal(r.status,409);assert.equal(r.posts,0);}failedFeed='';
r=await invoke();assert.equal(r.posts,1);assert.equal(r.result.verification.appearsCleared,true);
postLast=[];r=await invoke();assert.equal(r.result.verification.appearsCleared,false);
postLast=[{...entity,allowFaultReset:false}];failedFeed='block';failAfter=true;r=await invoke();assert.equal(r.result.verification.appearsCleared,false);
// Exact shipped panel, with deployed React and permission singletons stubbed only.
let locked=false;
const bundle=await build({entryPoints:[root+'/fleet/dist/assets/'+m.assets.panel],bundle:true,format:'cjs',platform:'node',write:false,plugins:[{name:'test-singletons',setup(b){
 b.onResolve({filter:/^\.\//},a=>{if(a.path==='./'+m.assets.client||a.path==='./'+m.assets.workspace)return{path:a.path,namespace:'fixture'};});
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.includes('client-')?'module.exports={r:require("react"),j:require("react/jsx-runtime")};':'module.exports={r:()=>require("permission")()};',loader:'js'}));
 b.onResolve({filter:/^(react(?:\/jsx-runtime)?|permission)$/},a=>({path:a.path,external:true}));
 }}]});
const ui={exports:{},module:{exports:{}},require:n=>{if(n==='react')return React;if(n==='react/jsx-runtime')return jsx;if(n==='permission')return()=>locked;throw Error(n);}};ui.exports=ui.module.exports;vm.runInNewContext(bundle.outputFiles[0].text,ui);
const Panel=ui.module.exports.default,render=(c=candidate,props={})=>renderToStaticMarkup(React.createElement(Panel,{profileId:'fixture',candidates:[c],...props}));
for(const text of ['Safety fault candidates','Door fault','Array 4','ES3 / String 5','Select all eligible','Clear selected'])assert(render().includes(text));
const conflict=snapshot([entity],[{...entity,allowFaultReset:false}]).eligible[0];assert(render(conflict).includes(conflict.resetBlockedReason));assert.match(render(conflict),/disabled=""[^>]*>Clear selected/);
locked=true;assert(render().includes('Controls are locked'));locked=false;
for(const props of [{stale:true},{unavailable:true}])assert(render(candidate,props).includes('Clearing is disabled'));
// Recovery simulation; only in-memory fake files and a recorded systemctl function.
const deploy=fs.readFileSync(path.dirname(root)+'/prizm-safety-filtering-deploy.mjs','utf8');
const plans=[{unit:'prizm',site:'solar-star-3',override:'/ss3.conf'},{unit:'prizm-site@ss4',site:'solar-star-4',override:'/ss4.conf'},{unit:'prizm-fleet',site:'fleet',override:'/fleet.conf'}];
const files=new Map(),commands=[],boots=[];let saved;
const recovery={plans,collector:'/new',recovery:'/recovery',fleet:'/fleet',priorFleet:'/old-fleet',priorCollector:'/old',backup:'/backup',assert,console:{log:()=>{}},fs:{writeFileSync:(p,t)=>files.set(p,t),readFileSync:p=>files.get(p),existsSync:p=>files.has(p),unlinkSync:p=>files.delete(p)},run:(cmd,args)=>{commands.push([cmd,...args]);if(args[0]==='restart')boots.push(files.get(plans.find(p=>p.unit===args[1]).override));},healthy:async(_p,updated)=>assert.equal(updated,false),same:(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b)),invariants:()=>({unchanged:true}),save:s=>{saved=s;}};
vm.createContext(recovery);vm.runInContext(['entry','overrideText'].map(n=>fn(deploy,n)).join('\n'),recovery);
recovery.argv=unit=>{const p=plans.find(p=>p.unit===unit);return files.has(p.override)?/ExecStart=(\/usr\/bin\/node[^\n]+)/.exec(files.get(p.override))[1]:recovery.entry(p,p.site==='fleet'?recovery.priorFleet:recovery.priorCollector);};
for(const p of plans)files.set(p.override,recovery.overrideText(p,p.site==='fleet'?recovery.fleet:recovery.collector));
await vm.runInContext(fn(deploy,'restartCollector')+'\n'+fn(deploy,'rollback')+'\nrollback({before:{unchanged:true},touched:plans.map(p=>p.unit)})',recovery);
assert.equal(saved.rolledBack,true);assert.equal(files.size,0);assert.deepEqual(commands.filter(c=>c[1]==='restart').map(c=>c[2]),['prizm-fleet','prizm-site@ss4','prizm']);assert(boots.slice(1).every(text=>text.includes('--skip-startup-storage-cleanup')));
assert(!deploy.includes('"POST"'));assert(!deploy.includes("'/api/local/safety-fault-clear/execute'"));
console.log('PASS exact filtering release: nested SS3/SS4 fixtures, conflict retention, mock-only reset guards, emitted UI, unchanged unrelated bytes and rollback/cleanup-skip simulation.');
