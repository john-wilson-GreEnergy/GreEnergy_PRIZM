import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import{createRequire}from'node:module';
const repo='/Volumes/Dock_Storage/Projects/PRIZM_Utility/GreEnergy_PRIZM',req=createRequire(repo+'/package.json'),{build}=req('esbuild'),{parse}=req('@babel/parser');
const{inventory,sha256:sha}=await import(repo+'/scripts/deployed-runtime-lib.mjs');
const root=path.dirname(new URL(import.meta.url).pathname),base=path.resolve(root,'../data-export-deployment-20261109/release'),out=root+'/release',stage=root+'/stage',roles=['collector','fleet','lan'];
assert(!fs.existsSync(out));const before=JSON.parse(fs.readFileSync(root+'/dell-inventory.json'));
for(const r of roles){assert.deepEqual(inventory(base+'/'+r),before[r],r+' live baseline');fs.cpSync(base+'/'+r,out+'/'+r,{recursive:true});}
const proof=[];function once(s,a,b){assert.equal(s.split(a).length,2,'Unique boundary '+a.slice(0,100));proof.push({old:a,new:b});return s.replace(a,b);}
const backend=await build({absWorkingDir:repo,stdin:{contents:"export {buildPowerEvidence} from './src/server/telemetry/powerEvidence';export {stampSunspecResponse,projectSunspecRequest,parseSunspecRequest} from './src/server/ems/sunspecRequest';export {parsePowerEvidence} from './src/core/powerEvidence';",resolveDir:repo,loader:'ts'},bundle:true,platform:'node',target:'node24',format:'cjs',write:false,metafile:true});
const inputs=Object.keys(backend.metafile.inputs);assert(inputs.every(n=>['<stdin>','src/server/telemetry/powerEvidence.ts','src/server/ems/sunspecRequest.ts','src/core/powerEvidence.ts','src/core/telemetryNumber.ts'].includes(n)),JSON.stringify(inputs));
for(const r of ['collector','fleet'])fs.writeFileSync(out+'/'+r+'/power-evidence.cjs',backend.outputFiles[0].contents);
for(const role of ['collector','fleet']){
 const entry=role==='collector'?'server.cjs':'fleet-server.cjs';let s=fs.readFileSync(base+'/'+role+'/'+entry,'utf8');
 s=once(s,'  const details = parseFleetDetails(value.details);','  const powerEvidence = require("./power-evidence.cjs").parsePowerEvidence(value.powerEvidence);\n  if(powerEvidence && powerEvidence.site!==`${site.stationCode} / Block ${site.blockIndex}`)throw new IdentityConflict("Power evidence site identity conflict");\n  const details = parseFleetDetails(value.details);');
 s=once(s,'    ...operatingCharts ? { operatingCharts } : {}','    ...powerEvidence ? { powerEvidence } : {},\n    ...operatingCharts ? { operatingCharts } : {}');
 const view=role==='fleet'?'operatingCharts: status === "identity-conflict" ? void 0 : structuredClone(summary?.operatingCharts)':'operatingCharts: status2 === "identity-conflict" ? void 0 : structuredClone(summary?.operatingCharts)';
 s=once(s,view,view.replace('operatingCharts:', 'powerEvidence:').replace('summary?.operatingCharts','summary?.powerEvidence')+', '+view);
 s=once(s,'targetKw: { label: "Power target", unit: "kW" }','targetKw: { label: "Basic-operation target", unit: "kW" }');
 if(role==='collector'){
  s=once(s,'emsPrimaryReader = createEmsPrimaryReader(currentRecoverySite, (sample) => {','emsPrimaryReader = createEmsPrimaryReader(currentRecoverySite, (sample) => {\n      require("./power-evidence.cjs").stampSunspecResponse(sample.data,new Date(sample.acquiredAt).toISOString(),sample.success && !isDemoActive());');
  s=once(s,'    emsCache.lastCall = result.data;','    require("./power-evidence.cjs").stampSunspecResponse(result.data,new Date().toISOString(),result.fallbackUsed === false && !isDemoActive());\n    emsCache.lastCall = result.data;');
  s=once(s,'  const apps = dragonApps.map((app2) => {','  const lastCall = getEmsCachedLastCall();\n  const sunspecRequest = require("./power-evidence.cjs").projectSunspecRequest(lastCall?.data,lastCall?.stationCode??"",Number(lastCall?.blockIndex));\n  const apps = dragonApps.map((app2) => {');
  s=once(s,'      ...emsAppProvenance(app2),','      ...emsAppProvenance(app2),\n      sunspecRequest: appCode === "SSPC001" ? sunspecRequest : undefined,');
  s=once(s,'  const blockOperatingSummary = {','  const powerEvidence = require("./power-evidence.cjs").buildPowerEvidence({site:`${snap.siteIdentity?.stationCode??""} / Block ${snap.siteIdentity?.blockIndex??""}`,pcsReports:snap.rawSources?.arrayPcsReports,emsApps:snap.rawSources?.emsApps,expectedPcs:pcsCountVal,siteLive:snap.liveStatus?.stale===false && snap.liveStatus?.liveSucceeded===true && snap.liveStatus?.cacheUsed===false,modbus:modbusTelemetry});\n  const blockOperatingSummary = {');
  s=once(s,'    blockOperatingSummary,\n    powerFlow:','    blockOperatingSummary,\n    powerEvidence,\n    powerFlow:');
  s=once(s,'details: buildFleetDetails(data, data.fleetDetailSnapshot), operatingCharts: data.operatingCharts','details: buildFleetDetails(data, data.fleetDetailSnapshot), powerEvidence: data.powerEvidence, operatingCharts: data.operatingCharts');
 }
 parse(s,{sourceType:'unambiguous'});fs.writeFileSync(out+'/'+role+'/'+entry,s);
}
const assets={};
for(const role of ['lan','fleet']){
 const dir=base+'/'+role,all=fs.readdirSync(dir+'/assets'),entries=['index.html','fleet.html','mobile.html','signin.html'],active=new Set(),queue=entries.map(n=>fs.readFileSync(dir+'/'+n,'utf8'));
 while(queue.length){const s=queue.pop();for(const n of all)if(!active.has(n)&&s.includes(n)){active.add(n);if(n.endsWith('.js'))queue.push(fs.readFileSync(dir+'/assets/'+n,'utf8'));}}
 const sources=new Map([...active].filter(n=>n.endsWith('.js')).map(n=>[n,fs.readFileSync(dir+'/assets/'+n,'utf8')]));
 const unique=filter=>{const hits=[...sources].filter(filter);assert.equal(hits.length,1,JSON.stringify(hits.map(x=>x[0])));return hits[0][0];};
 const workspace=unique(([,s])=>s.includes('EMS Modbus operating target')),client=unique(([n])=>n.startsWith('client-')),overview=unique(([,s])=>s.includes('className:"site-overview"')),model=unique(([,s])=>s.includes('targetKw:{label:"Power target"'));
 const modules={react:`import {r as React} from './${client}';export default React;export const {useState,useEffect,useRef,useMemo,useCallback,forwardRef,createElement}=React;`,'react/jsx-runtime':`import {j as runtime} from './${client}';export const {jsx,jsxs,Fragment}=runtime;`};
 const jsx=`import React from 'react';import {displayedPowerQuality} from './src/core/powerEvidence';export {default} from './src/components/PowerEvidencePanel';export function AppStatus({reading,stale}){return <div className="mb-2"><b>SunSpec requested power: {reading.valueKw==null?'Not available':reading.valueKw.toLocaleString(undefined,{maximumFractionDigits:2})+' kW'}</b><div>{displayedPowerQuality(reading,stale)==='live'?'Fresh report':'Stale / unverified report'}</div><div>App report time: {reading.observedAt?new Date(reading.observedAt).toLocaleString():'Not supplied'}</div><div>{reading.reason}</div></div>}`;
 const result=await build({absWorkingDir:repo,stdin:{contents:jsx,resolveDir:repo,loader:'tsx'},bundle:true,format:'esm',jsx:'transform',minify:true,write:false,outfile:'panel.js',metafile:true,plugins:[{name:'deployed-singletons',setup(b){b.onResolve({filter:/^(react(?:\/jsx-runtime)?)$/},a=>({path:a.path,namespace:'deployed'}));b.onLoad({filter:/.*/,namespace:'deployed'},a=>({contents:modules[a.path],loader:'js'}));b.onResolve({filter:/^\.\//},a=>a.namespace==='deployed'?{path:a.path,external:true}:undefined);}}]});
 const panelInputs=Object.keys(result.metafile.inputs);assert(panelInputs.every(n=>n==='<stdin>'||n.startsWith('deployed:')||['src/components/PowerEvidencePanel.tsx','src/components/powerEvidence.css','src/core/powerEvidence.ts'].includes(n)),JSON.stringify(panelInputs));
 const panel='power-evidence-entry.js',css=result.outputFiles.find(f=>f.path.endsWith('.css')).text,cssName='power09-'+sha(css).slice(0,12)+'.css';sources.set(panel,result.outputFiles.find(f=>f.path.endsWith('.js')).text);
 let ws=sources.get(workspace);
 ws=once(ws,'["Real Power",xe(re.realMeasured),`Cmd ${xe(re.realCommanded)}`]','["Block measured power",xe(re.realMeasured),"See source-separated PCS readings below"]');
 ws=once(ws,'["Power Target",xe(re.targetPower),"EMS Modbus operating target"]','["Basic-operation target",xe(re.targetPower),"BasicOpTargetPower · not SunSpec"]');
 ws=once(ws,'r.jsx(qo,{flow:a==null?void 0:a.powerFlow,','r.jsx(__PowerEvidence,{evidence:a?.powerEvidence,stale:Ke!=="LIVE"}),r.jsx(qo,{flow:a==null?void 0:a.powerFlow,');
 const status='(t.hasShortAppStatus&&t.shortAppStatus?t.shortAppStatus:t.appStatus||t.reason||"--").replace(/<br\\s*\\/?>/gi,`\n`)';
 ws=once(ws,status,'[t.appCode==="SSPC001"&&t.sunspecRequest?r.jsx(__SunSpecStatus,{reading:t.sunspecRequest,stale:Ke!=="LIVE"}):null,'+status+']');
 sources.set(workspace,`import __PowerEvidence,{AppStatus as __SunSpecStatus} from './${panel}';\n`+ws);
 let ov=sources.get(overview);ov=once(ov,'e.jsxs("div",{className:"site-health",','e.jsx(__PowerEvidence,{evidence:s.powerEvidence,stale:s.status!=="current"}),e.jsxs("div",{className:"site-health",');sources.set(overview,`import __PowerEvidence from './${panel}';\n`+ov);
 sources.set(model,once(sources.get(model),'targetKw:{label:"Power target",unit:"kW"}','targetKw:{label:"Basic-operation target",unit:"kW"}'));
 const changed=new Set([panel,workspace,overview,model]);let grew=true;while(grew){grew=false;for(const[n,s]of sources)if(!changed.has(n)&&[...changed].some(c=>s.includes(c))){changed.add(n);grew=true;}}
 const rename=new Map([...changed].map(n=>[n,'power09-'+sha(role+n+sources.get(n)).slice(0,12)+'.js']));const rewrite=s=>{for(const[a,b]of rename)s=s.replaceAll(a,b);return s;};
 for(const[a,b]of rename){const s=rewrite(sources.get(a));parse(s,{sourceType:'module'});fs.writeFileSync(out+'/'+role+'/assets/'+b,s);}fs.writeFileSync(out+'/'+role+'/assets/'+cssName,css);
 for(const n of entries)fs.writeFileSync(out+'/'+role+'/'+n,rewrite(fs.readFileSync(dir+'/'+n,'utf8')).replace('</head>',`<link rel="stylesheet" href="/assets/${cssName}"></head>`));
 assets[role]={panel:rename.get(panel),workspace:rename.get(workspace),overview:rename.get(overview),previousWorkspace:workspace,css:cssName,renamed:Object.fromEntries(rename),inputs:panelInputs};
}
const after=Object.fromEntries(roles.map(r=>[r,inventory(out+'/'+r)])),changed=Object.fromEntries(roles.map(r=>[r,Object.keys(after[r]).filter(n=>after[r][n]!==before[r][n]).sort()]));
assert.deepEqual(changed.collector,['power-evidence.cjs','server.cjs']);for(const r of roles)assert(Object.keys(before[r]).every(n=>n in after[r]));
const manifest={schema:1,scope:'Passive power source display and timestamps; existing acquisitions only; no equipment commands, settings or retention changes',before,after,changed,assets,backendInputs:inputs,proof};fs.mkdirSync(stage);fs.writeFileSync(stage+'/manifest.json',JSON.stringify(manifest,null,2));for(const r of roles)for(const n of changed[r]){const dest=stage+'/payload/'+r+'/'+n;fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(out+'/'+r+'/'+n,dest);}console.log(JSON.stringify({manifestHash:sha(fs.readFileSync(stage+'/manifest.json')),changed:Object.fromEntries(roles.map(r=>[r,changed[r].length]))}));
