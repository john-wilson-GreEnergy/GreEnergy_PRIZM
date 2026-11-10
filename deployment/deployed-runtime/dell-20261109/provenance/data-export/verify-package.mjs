import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';import assert from 'node:assert/strict';import{createRequire}from'node:module';
const repo='/Volumes/Dock_Storage/Projects/PRIZM_Utility/GreEnergy_PRIZM',require=createRequire(repo+'/package.json'),{parse}=require('@babel/parser'),{build}=require('esbuild'),root=path.dirname(new URL(import.meta.url).pathname),m=JSON.parse(fs.readFileSync(root+'/stage/manifest.json'));
const{inventory}=await import(repo+'/scripts/deployed-runtime-lib.mjs');for(const r of ['collector','fleet','lan'])assert.deepEqual(inventory(root+'/release/'+r),m.after[r]);
function fn(s,name){const n=parse(s,{sourceType:'unambiguous'}).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert(n);return s.slice(n.start,n.end);}
const old=fs.readFileSync(root+'/../cell-summary-deployment-20261109/release/fleet/fleet-server.cjs','utf8'),next=fs.readFileSync(root+'/release/fleet/fleet-server.cjs','utf8');
const policy=vm.runInNewContext(fn(next,'workspaceRead')+';workspaceRead',{URL,reviewReadPath:()=>null});const monitoring=vm.runInNewContext(fn(next,'monitoringWorkspaceRequest')+';monitoringWorkspaceRequest',{monitoringWorkspaceGet:()=>false});
for(const [method,p]of [['GET','/api/local/site-data/data-export/catalog'],['POST','/api/local/site-data/data-export/query'],['GET','/api/local/site-data/data-export/package?ticket=12345678-1234-1234-1234-123456789abc']]){assert.equal(policy(method,p),p);assert.equal(policy(method,p+'?force=1'),null);}
assert(monitoring('POST','/api/local/site-data/data-export/query'));for(const p of ['/api/local/iologik/apply','/api/local/site-data/data-export/query?force=1','/api/local/site-data/data-export/package?ticket=../x'])assert.equal(policy('POST',p),null);
for(const name of ['createWorkspaceGateway','workspaceForwarder','main','startRemoteMobile','createFleetApp','remoteDesktopRead','reviewReadPath'])assert.equal(fn(next,name),fn(old,name),name);
// Every modification to preexisting code must reverse to the exact baseline.
function reverse(s){for(const p of [...m.proof].reverse().filter(p=>p.old)){if(s.includes(p.new))s=s.replace(p.new,p.old);}return s;}
for(const role of ['collector','fleet']){const entry=role==='fleet'?'fleet-server.cjs':'server.cjs';assert.equal(reverse(fs.readFileSync(root+'/release/'+role+'/'+entry,'utf8')),fs.readFileSync(root+'/../cell-summary-deployment-20261109/release/'+role+'/'+entry,'utf8'));}
for(const role of ['lan','fleet']){
 const a=m.assets[role],dir=root+'/release/'+role+'/assets',files=new Set(fs.readdirSync(dir));
 for(const[oldName,newName]of Object.entries(a.renamed)){
  const raw=fs.readFileSync(dir+'/'+newName,'utf8');let code=raw;for(const[x,y]of Object.entries(a.renamed))code=code.replaceAll(y,x);
  if(newName===a.workspace)code=reverse(code.replace("import __DataExport from './data-export-entry.js';\n",''));
  if(newName!==a.panel)assert.equal(code,fs.readFileSync(root+'/../cell-summary-deployment-20261109/release/'+role+'/assets/'+oldName,'utf8'),oldName);
  const ast=parse(raw,{sourceType:'module'});for(const n of ast.program.body.filter(n=>n.source)){const dep=n.source.value;if(dep.startsWith('./')){assert(files.has(dep.slice(2)),dep);const other=parse(fs.readFileSync(dir+'/'+dep.slice(2),'utf8'),{sourceType:'module'}),exports=new Set();for(const e of other.program.body){if(e.type==='ExportDefaultDeclaration')exports.add('default');if(e.type==='ExportNamedDeclaration')for(const spec of e.specifiers??[])exports.add(spec.exported.name);}for(const spec of n.specifiers??[]){if(spec.type==='ImportSpecifier')assert(exports.has(spec.imported.name),dep+' '+spec.imported.name);if(spec.type==='ImportDefaultSpecifier')assert(exports.has('default'));}}}
 }
 const ws=fs.readFileSync(dir+'/'+a.workspace,'utf8');assert(ws.includes('{label:"History & reports",items:[{id:"data-export",label:"Data export"'));assert(ws.includes('c==="data-export"'));
}
// Exercise packaged adapters and the exact packaged worker with genuine offline recorder files.
let test=fs.readFileSync(repo+'/src/server/dataExport/recorders.test.ts','utf8');
test=test.replace("import {DataExportService} from './service';",`import vm from 'node:vm';import {createRequire} from 'node:module';const require=createRequire(${JSON.stringify(repo+'/package.json')});const module={exports:{}};vm.runInNewContext(await fs.readFile(${JSON.stringify(root+'/release/collector/data-export.cjs')},'utf8'),{module,exports:module.exports,require,__dirname:${JSON.stringify(root+'/release/collector')},process,Buffer,structuredClone,console,setTimeout,clearTimeout,URL,AbortController});const {install,adapters}=module.exports;`);
test=test.replace('const service=new DataExportService(async()=>[timeline.exportPlan(),await cells.exportPlan(),await thermal.exportPlan()]);',`assert.deepEqual(JSON.parse(JSON.stringify(await adapters.cells.call(cells))),JSON.parse(JSON.stringify(await cells.exportPlan())));assert.deepEqual(JSON.parse(JSON.stringify(adapters.power.call(timeline))),JSON.parse(JSON.stringify(timeline.exportPlan())));assert.deepEqual(JSON.parse(JSON.stringify(await adapters.hvac.call(thermal))),JSON.parse(JSON.stringify(await thermal.exportPlan())));const service=install({use(){}},cells,()=>timeline,()=>({siteHistory:thermal}));`);
// Keep import resolution in the recorder test's directory and use the TS runtime locally.
for(const p of ['../cells/CellHistory','../history/operationalTimeline','../thermal/siteHistory','../thermal/thermalModel'])test=test.replaceAll("'"+p+"'",JSON.stringify(path.resolve(repo+'/src/server/dataExport',p)+'.ts'));
fs.writeFileSync(root+'/test-recorders.mts',test);
console.log('PASS exact artifact inventories, import exports, remote read permissions, and reversal of all unrelated code changes');
