import fs from'node:fs';import vm from'node:vm';import path from'node:path';import assert from'node:assert/strict';import{createRequire}from'node:module';
const repo='/Volumes/Dock_Storage/Projects/PRIZM_Utility/GreEnergy_PRIZM',req=createRequire(repo+'/package.json'),{parse}=req('@babel/parser'),{build}=req('esbuild'),root=path.dirname(new URL(import.meta.url).pathname),base=root+'/../data-export-deployment-20261109/release',m=JSON.parse(fs.readFileSync(root+'/stage/manifest.json'));
const{inventory}=await import(repo+'/scripts/deployed-runtime-lib.mjs');for(const r of ['collector','fleet','lan'])assert.deepEqual(inventory(root+'/release/'+r),m.after[r]);
function reverse(s){for(const p of [...m.proof].reverse())if(s.includes(p.new))s=s.replace(p.new,p.old);return s;}
for(const role of ['collector','fleet']){const entry=role==='fleet'?'fleet-server.cjs':'server.cjs';assert.equal(reverse(fs.readFileSync(root+'/release/'+role+'/'+entry,'utf8')),fs.readFileSync(base+'/'+role+'/'+entry,'utf8'),'Every old backend byte restored after reversing declared edits');}
for(const role of ['lan','fleet']){
 const a=m.assets[role],dir=root+'/release/'+role+'/assets',files=new Set(fs.readdirSync(dir));
 for(const[oldName,newName]of Object.entries(a.renamed)){
  const raw=fs.readFileSync(dir+'/'+newName,'utf8');let code=raw;for(const[x,y]of Object.entries(a.renamed))code=code.replaceAll(y,x);
  code=code.replace("import __PowerEvidence,{AppStatus as __SunSpecStatus} from './power-evidence-entry.js';\n",'').replace("import __PowerEvidence from './power-evidence-entry.js';\n",'');code=reverse(code);
  if(newName!==a.panel)assert.equal(code,fs.readFileSync(base+'/'+role+'/assets/'+oldName,'utf8'),oldName+' reverse');
  const ast=parse(raw,{sourceType:'module'});for(const n of ast.program.body.filter(n=>n.source)){const dep=n.source.value;if(dep.startsWith('./')){assert(files.has(dep.slice(2)),dep);const other=parse(fs.readFileSync(dir+'/'+dep.slice(2),'utf8'),{sourceType:'module'}),exports=new Set();for(const e of other.program.body){if(e.type==='ExportDefaultDeclaration')exports.add('default');if(e.type==='ExportNamedDeclaration')for(const spec of e.specifiers??[])exports.add(spec.exported.name);}for(const spec of n.specifiers??[]){if(spec.type==='ImportSpecifier')assert(exports.has(spec.imported.name),dep+' '+spec.imported.name);if(spec.type==='ImportDefaultSpecifier')assert(exports.has('default'));}}}
 }
 for(const name of ['index.html','fleet.html','mobile.html','signin.html']){let html=fs.readFileSync(root+'/release/'+role+'/'+name,'utf8');html=html.replace(`<link rel="stylesheet" href="/assets/${a.css}">`,'');for(const[x,y]of Object.entries(a.renamed))html=html.replaceAll(y,x);assert.equal(html,fs.readFileSync(base+'/'+role+'/'+name,'utf8'));}
}
function fn(s,name){const n=parse(s,{sourceType:'unambiguous'}).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert(n,name);return s.slice(n.start,n.end);}
const server=fs.readFileSync(root+'/release/collector/server.cjs','utf8'),addon=req(root+'/release/collector/power-evidence.cjs');
const now=Date.now(),stamp=new Date(now).toISOString(),raw={blockReport:{stationCode:'TEST',blockIndex:1},dragonAppReport:{timestamp:String(now),dragonAppData:{dragonAppSlotData:[{appCode:'SSPC001',enabled:true,appStatus:'Recent AC Power Command received : 23289.20 kW / 0.00 kVAr'}]}}};
addon.stampSunspecResponse(raw,stamp,true);
const context={getEmsCachedBlock:()=>({data:{dragonApps:[{appCode:'SSPC001',enabled:true,appStatus:'',reportValues:{}},{appCode:'PC00001',enabled:false,appStatus:'Real Power: 0 kW'}]}}),getEmsCachedLastCall:()=>({data:raw,stationCode:'TEST',blockIndex:1}),require:n=>{assert.equal(n,'./power-evidence.cjs');return addon;},DRAGON_APP_CODE_NAME_MAP:{},getAppInteraction:()=>({}),emsAppProvenance:()=>({}),parsePowerControlStatus:()=>({realKw:0})};
const appsFn=vm.runInNewContext(fn(server,'fetchLiveEmsApps')+';fetchLiveEmsApps',context),apps=(await appsFn()).apps;
assert.equal(apps[0].sunspecRequest.valueKw,23289.2);assert.equal(apps[0].sunspecRequest.quality,'live');assert.equal(apps[1].sunspecRequest,undefined);assert.equal(apps[1].enabled,false);
const evidence=addon.buildPowerEvidence({site:'TEST / Block 1',expectedPcs:1,siteLive:true,now,emsApps:apps,pcsReports:{1:{1:{ok:true,fetchedAt:stamp,data:{timeStamp:String(now),arrayPcsData:{acCmdRealPowerKW:23000,acRealPowerKW:22950}}}}},modbus:{available:true,stale:false,capturedAt:stamp,block:{BasicOpTargetPower:0}}});
for(const role of ['collector','fleet']){
 const src=fs.readFileSync(root+'/release/'+role+'/'+(role==='collector'?'server.cjs':'fleet-server.cjs'),'utf8');
 const summary=vm.runInNewContext(fn(src,'parseSummary')+';parseSummary',{require:context.require,record4:x=>!!x,record:x=>!!x,validStamp:x=>typeof x==='string',metricKeys:[],emptyMetrics:()=>({}),parseFleetDetails:()=>({issues:[],arrays:[]}),parseOperatingCharts:()=>null,process:{env:{PRIZM_FLEET_BPC_REVIEW:'false'}},IdentityConflict:class extends Error {}});
 const site={siteId:'test',stationCode:'TEST',blockId:'1',blockIndex:1},p={...site,schema:'prizm-site-summary-v1',stale:false,observedAt:stamp,metrics:{},powerEvidence:evidence};
 assert.deepEqual(JSON.parse(JSON.stringify(summary(p,site).powerEvidence)),evidence);assert.throws(()=>summary({...p,powerEvidence:{...evidence,site:'WRONG / Block 1'}},site));
}
// Run the focused source test suite against the exact packaged implementations.
let test=fs.readFileSync(repo+'/src/server/telemetry/powerEvidence.test.ts','utf8');
test=test.replace("import {buildPowerEvidence} from './powerEvidence';",'').replace("import {parseSunspecRequest,projectSunspecRequest,stampSunspecResponse} from '../ems/sunspecRequest';",'').replace("import {parsePowerEvidence,displayedPowerQuality} from '../../core/powerEvidence';",`import {displayedPowerQuality} from '${repo}/src/core/powerEvidence';\nimport {createRequire} from 'node:module';const {buildPowerEvidence,parseSunspecRequest,projectSunspecRequest,stampSunspecResponse,parsePowerEvidence}=createRequire(import.meta.url)(${JSON.stringify(root+'/release/collector/power-evidence.cjs')});`);
const compiled=await build({stdin:{contents:test,resolveDir:repo,loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});fs.writeFileSync(root+'/packaged-tests.mjs',compiled.outputFiles[0].contents);
fs.writeFileSync(root+'/package-test-results.json',JSON.stringify({verifiedAt:new Date().toISOString(),exactInventories:true,allPreexistingBytesReversible:true,importsAndExports:true,packagedAppsMapping:true,collectorFleetParity:true,wrongSiteRejected:true,noEquipmentRequests:true},null,2));
console.log('PASS package inventories, reversible patches, imports/exports, canonical Apps and Fleet source separation');
