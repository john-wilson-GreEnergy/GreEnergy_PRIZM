import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import{createRequire}from'node:module';
const repo='/Volumes/Dock_Storage/Projects/PRIZM_Utility/GreEnergy_PRIZM',req=createRequire(repo+'/package.json'),{build}=req('esbuild'),{parse}=req('@babel/parser');
const{inventory,sha256:sha}=await import(repo+'/scripts/deployed-runtime-lib.mjs');
const root=path.dirname(new URL(import.meta.url).pathname),base=path.resolve(root,'../permission-parity-20261109/release'),out=root+'/release',stage=root+'/stage',roles=['collector','fleet','lan'];
assert(!fs.existsSync(out));const before=JSON.parse(fs.readFileSync(root+'/dell-inventory.json'));
for(const r of roles){assert.deepEqual(inventory(base+'/'+r),before[r],r+' live baseline');fs.cpSync(base+'/'+r,out+'/'+r,{recursive:true});}
const proof=[];function once(s,a,b){assert.equal(s.split(a).length,2,'Unique boundary '+a.slice(0,110));proof.push({old:sha(a),new:sha(b),boundary:a.slice(0,100)});return s.replace(a,b);}
function fn(s,name){const n=parse(s,{sourceType:'unambiguous'}).program.body.filter(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert.equal(n.length,1,name);return n[0];}
const backend=await build({absWorkingDir:repo,stdin:{contents:"export {CellHealthMonitor} from './src/server/cellHealth/CellHealthMonitor';export {decodeCellReport} from './src/server/cells/decodeCellReport';export {createCellHistoryRouter} from './src/server/cells/cellHistoryRoutes';",resolveDir:repo,loader:'ts'},bundle:true,platform:'node',target:'node24',format:'cjs',external:['express'],write:false,metafile:true});
console.log(Object.keys(backend.metafile.inputs));assert(Object.keys(backend.metafile.inputs).every(n=>n==='<stdin>'||/^src\/(core\/(cellHealth|cellHistory|telemetryNumber)|server\/(cellHealth\/[A-Za-z]+|cells\/(decodeCellReport|cellHistoryRoutes|cellProjection)))\.ts$/.test(n)));
fs.writeFileSync(out+'/collector/cell-health.cjs',backend.outputFiles[0].contents);
let server=fs.readFileSync(out+'/collector/server.cjs','utf8');
let f=fn(server,'decodeCellReport');server=once(server,server.slice(f.start,f.end),'async function decodeCellReport(raw,site,acquiredAt){return require("./cell-health.cjs").decodeCellReport(raw,site,acquiredAt);}');
server=once(server,'var import_node_path4, bounded, cellHistory;','var import_node_path4, bounded, cellHistory, cellHealth;');
server=once(server,'    cellHistory = new CellHistory({','    cellHealth = new (require("./cell-health.cjs").CellHealthMonitor)(import_node_path4.default.resolve(process.cwd(), ".prizm-data", "cell-health-incidents"), process.env.PRIZM_CELL_HISTORY_ENABLED === "true" && process.env.PRIZM_CELL_HEALTH_ENABLED !== "false", () => {const p=ProfileStore.getActiveProfile();return p?.stationCode && Number.isInteger(p.blockIndex) ? {stationCode:p.stationCode,blockIndex:p.blockIndex,emsBaseUrl:buildEmsBaseUrl(p)} : null;});\n    cellHistory = new CellHistory({');
server=once(server,'          this.latest = frame;\n          const body = JSON.stringify(frame.strings);','          this.latest = frame;\n          cellHealth.offer(frame);\n          const body = JSON.stringify(frame.strings);');
f=fn(server,'createCellHistoryRouter');server=once(server,server.slice(f.start,f.end),'function createCellHistoryRouter(history){return require("./cell-health.cjs").createCellHistoryRouter(history,cellHealth);}');
server=once(server,'[cellHistory.close(), closeThermalService(),','[(async()=>{await cellHistory.close();await cellHealth.close();})(), closeThermalService(),');
assert(server.includes('--skip-startup-storage-cleanup'));parse(server);fs.writeFileSync(out+'/collector/server.cjs',server);
let fleet=fs.readFileSync(out+'/fleet/fleet-server.cjs','utf8');f=fn(fleet,'workspaceRead');let policy=fleet.slice(f.start,f.end);assert(!policy.includes('cells\\/health'));
policy=once(policy,'  const rules = {','  if(method==="GET" && /^\\/api\\/local\\/site-data\\/cells\\/health(?:\\/incident\\/[a-f0-9-]{36})?$/.test(u.pathname) && !u.search)return u.pathname;\n  const rules = {');
fleet=once(fleet,fleet.slice(f.start,f.end),policy);parse(fleet);fs.writeFileSync(out+'/fleet/fleet-server.cjs',fleet);
const assets={};
for(const role of ['lan','fleet']){
 const dir=base+'/'+role,all=fs.readdirSync(dir+'/assets'),entries=['index.html','fleet.html','mobile.html','signin.html'],active=new Set(),queue=entries.map(n=>fs.readFileSync(dir+'/'+n,'utf8'));
 while(queue.length){const s=queue.pop();for(const n of all)if(!active.has(n)&&s.includes(n)){active.add(n);if(n.endsWith('.js'))queue.push(fs.readFileSync(dir+'/assets/'+n,'utf8'));}}
 const sources=new Map([...active].filter(n=>n.endsWith('.js')).map(n=>[n,fs.readFileSync(dir+'/assets/'+n,'utf8')]));
 const unique=filter=>{const hits=[...sources].filter(filter);assert.equal(hits.length,1);return hits[0][0];};
 const workspace=unique(([,s])=>s.includes('useSiteDataFields must be used within a SiteDataProvider'));
 const panel=unique(([,s])=>s.includes('No cell history in this window.'));
 const client=unique(([n])=>n.startsWith('client-')),cartesian=unique(([n])=>n.startsWith('CartesianChart-')),line=unique(([n])=>n.startsWith('LineChart-')),legend=unique(([n])=>n.startsWith('Legend-'));
 const ws=sources.get(workspace);for(const marker of ['pt as n','ut as k','Mr as l'])assert(ws.includes(marker));
 const modules={react:`import {r as React} from './${client}';export default React;export const {useState,useEffect,useRef,useMemo,useCallback,forwardRef,createElement}=React;`,'react/jsx-runtime':`import {j as runtime} from './${client}';export const {jsx,jsxs,Fragment}=runtime;`,context:`export {n as useSiteDataFields} from './${workspace}';`,preferences:`export {k as usePresentation,l as useReviewTarget} from './${workspace}';`,recharts:`export {h as ResponsiveContainer,a as CartesianGrid,X as XAxis,Y as YAxis,T as Tooltip} from './${cartesian}';export {a as LineChart,L as Line} from './${line}';export {L as Legend} from './${legend}';`};
 const result=await build({absWorkingDir:repo,stdin:{contents:"export {default} from './src/components/CellHistoryWorkspace';",resolveDir:repo,loader:'tsx'},bundle:true,format:'esm',jsx:'transform',minify:true,write:false,outfile:'panel.js',metafile:true,plugins:[{name:'deployed-singletons',setup(b){
 b.onResolve({filter:/^(react(?:\/jsx-runtime)?|recharts)$/},a=>({path:a.path,namespace:'deployed'}));b.onResolve({filter:/SiteDataContext$/},()=>({path:'context',namespace:'deployed'}));b.onResolve({filter:/workspacePreferences$/},()=>({path:'preferences',namespace:'deployed'}));b.onLoad({filter:/.*/,namespace:'deployed'},a=>({contents:modules[a.path],loader:'js'}));b.onResolve({filter:/^\.\//},a=>a.namespace==='deployed'?{path:a.path,external:true}:undefined);
 }}]});
 const inputs=Object.keys(result.metafile.inputs);assert(inputs.every(n=>n==='<stdin>'||n.startsWith('deployed:')||n.startsWith('node_modules/lucide-react/')||/^src\/components\/(CellHistoryWorkspace|CellHealthPanel|CellAnalysisGuide|CellHistoryHeatmap|ArrayCellSnapshot|CellStringOverlay)\.tsx$/.test(n)||['src/components/cellHistory.css','src/lib/cellHistoryRefresh.ts'].includes(n)),JSON.stringify(inputs));
 const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text,css=result.outputFiles.find(f=>f.path.endsWith('.css')).text,cssName='cellanalysis09-'+sha(css).slice(0,12)+'.css';
 sources.set(panel,js);let shell=once(ws,'{id:"cell-history",label:"Cell history",icon:je},','');shell=once(shell,'{label:"Equipment",items:[','{label:"Equipment",items:[{id:"cell-history",label:"Cell analysis",icon:je},');shell=once(shell,'"cell-history":{label:"Cell History",','"cell-history":{label:"Cell Analysis",');sources.set(workspace,shell);
 const changed=new Set([panel,workspace]);let grew=true;while(grew){grew=false;for(const[n,s]of sources)if(!changed.has(n)&&[...changed].some(c=>s.includes(c))){changed.add(n);grew=true;}}
 const rename=new Map([...changed].map(n=>[n,'cellanalysis09-'+sha(role+n+sources.get(n)).slice(0,12)+'.js']));const rewrite=s=>{for(const[a,b]of rename)s=s.replaceAll(a,b);return s;};
 for(const[a,b]of rename){const s=rewrite(sources.get(a));parse(s,{sourceType:'module'});fs.writeFileSync(out+'/'+role+'/assets/'+b,s);}fs.writeFileSync(out+'/'+role+'/assets/'+cssName,css);
 for(const n of entries)fs.writeFileSync(out+'/'+role+'/'+n,rewrite(fs.readFileSync(dir+'/'+n,'utf8')).replace('</head>',`<link rel="stylesheet" href="/assets/${cssName}"></head>`));
 assets[role]={panel:rename.get(panel),workspace:rename.get(workspace),css:cssName,renamed:Object.fromEntries(rename),inputs};
}
const after=Object.fromEntries(roles.map(r=>[r,inventory(out+'/'+r)])),changed=Object.fromEntries(roles.map(r=>[r,Object.keys(after[r]).filter(n=>after[r][n]!==before[r][n]).sort()]));
assert.deepEqual(changed.collector,['cell-health.cjs','server.cjs']);for(const r of roles)assert(Object.keys(before[r]).every(n=>n in after[r]));
const manifest={schema:1,scope:'Passive Cell analysis workspace, bounded incidents, canonical operating context and shared read routes only',before,after,changed,assets,backendInputs:Object.keys(backend.metafile.inputs),proof};fs.mkdirSync(stage);fs.writeFileSync(stage+'/manifest.json',JSON.stringify(manifest,null,2));for(const r of roles)for(const n of changed[r]){const dest=stage+'/payload/'+r+'/'+n;fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(out+'/'+r+'/'+n,dest);}console.log(JSON.stringify({manifestHash:sha(fs.readFileSync(stage+'/manifest.json')),changed:Object.fromEntries(roles.map(r=>[r,changed[r].length]))}));
