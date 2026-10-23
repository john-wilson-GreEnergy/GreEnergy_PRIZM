/** Scoped release derived from the running artifacts. Unrelated local work is
 * deliberately excluded. Source equivalents are tested and maintained in src/.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {parse} from '@babel/parser';
import traversePackage from '@babel/traverse';
const traverse=traversePackage.default??traversePackage;
const [baseline,output]=process.argv.slice(2).map(p=>path.resolve(p));
assert(baseline&&output&&!fs.existsSync(output),'Fresh output directory required');
fs.mkdirSync(output,{recursive:true});
const sha=s=>createHash('sha256').update(s).digest('hex');
const manifest={scope:'SOC percent units, canonical string publication/freshness, v2 string patches, 15 kW display threshold',files:[]};
function record(file,original,next){fs.writeFileSync(path.join(output,file),next);manifest.files.push({file,before:original===null?null:sha(original),after:sha(next)});}
function once(source,from,to){assert.equal(source.split(from).length,2,'Expected exactly one boundary: '+from.slice(0,100));return source.replace(from,to);}
function functionBody(source,name,body){const nodes=[];traverse(parse(source),{FunctionDeclaration(p){if(p.node.id?.name===name)nodes.push(p.node);}});assert.equal(nodes.length,1,name);const n=nodes[0];return source.slice(0,n.body.start)+'{'+body+'}'+source.slice(n.body.end);}
const sidecar=await build({entryPoints:['scripts/soc-strings-runtime.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false});
record('soc-strings-runtime.cjs',null,sidecar.outputFiles[0].contents);
const runtime='require("./soc-strings-runtime.cjs")';
for(const file of ['server.cjs','fleet-server.cjs']){
 const original=fs.readFileSync(path.join(baseline,file),'utf8');let source=original;
 source=functionBody(source,'projectSitePowerFlow',`return ${runtime}.projectSitePowerFlow(...arguments);`);
 if(file==='server.cjs'){
  source=functionBody(source,'normalizeSocPercent',`return ${runtime}.normalizeSocPercent(...arguments);`);
  const start=source.indexOf('  row4.busVoltage = sv.dcBusVoltage ?? row4.busVoltage;'),end=source.indexOf('  stringViewerProvenance.set(row4, {',start);
  assert(start>0&&end>start&&end-start<3000);source=source.slice(0,start)+`  ${runtime}.mergeMonitorFields(row4,sv,entry3);\n`+source.slice(end);
  source=once(source,'      if (raw >= 0 && raw <= 1) return raw * 100;\n      if (raw >= 0 && raw <= 100) return raw;\n      return null;',`      return ${runtime}.normalizeSocPercent(raw);`);
  source=once(source,'  const publishFastStrings = async () => {','  const publishFastStrings = async () => {\n    if(process.env.PRIZM_CANONICAL_STRING_PUBLICATION!=="false")return;');
  source=once(source,'      centralSnapshot = newSnap;',`      centralSnapshot = newSnap;
      if(process.env.PRIZM_CANONICAL_STRING_PUBLICATION!=="false")latestFastStringsView={
        cycleId:context.cycleId,capturedAt:newSnap.liveStatus.lastUpdated,strings:newSnap.normalized.strings,
        summary:stringsResult?.summary||{},rollups:newSnap.rollups.stringSummary?.rollups||{},
        buckets:newSnap.rollups.stringSummary?.buckets||{},sourceHealth:stringsResult?.sourceHealth||[],durationMs:Date.now()-startTime};`);
  const routes=fs.readFileSync('src/server/siteDataRoutes.ts','utf8');
  const startRoute=routes.indexOf('siteDataRouter.get("/strings-stream",'),endRoute=routes.indexOf('\nsiteDataRouter.get("/domains",',startRoute);
  assert(startRoute>0&&endRoute>startRoute);
  const route=routes.slice(startRoute,endRoute).replace('new StringFieldDeltas()',`new (${runtime}.StringFieldDeltas)(stringTransportEpoch)`);
  const a=source.indexOf('siteDataRouter.get("/strings-stream",'),b=source.indexOf('siteDataRouter.get("/domains",',a);
  assert(a>0&&b>a);source=source.slice(0,a)+route+'\n'+source.slice(b);
 }else source=once(source,'"/api/local/site-data/strings-stream": { shape: /^list$/ }','"/api/local/site-data/strings-stream": { shape: /^list(?:-v2)?$/ }');
 parse(source);record(file,original,source);
}
// Keep all unmodified workers and static assets. Only active JS dependency
// graph gets new names, preventing old browser caches from masking the fix.
const entries=['index.html','fleet.html','mobile.html','signin.html'].filter(n=>fs.existsSync(path.join(baseline,n)));
const names=fs.readdirSync(path.join(baseline,'assets')),active=new Set(),queue=entries.map(n=>fs.readFileSync(path.join(baseline,n),'utf8'));
while(queue.length){const s=queue.pop();for(const name of names)if(!active.has(name)&&s.includes(name)){active.add(name);if(name.endsWith('.js'))queue.push(fs.readFileSync(path.join(baseline,'assets',name),'utf8'));}}
const namesMap=new Map([...active].filter(n=>n.endsWith('.js')).map(n=>[n,n.replace(/\.js$/,'-socstrings21.js')]));
const rewrite=s=>{for(const [before,after]of namesMap)s=s.replaceAll(before,after);return s;};
fs.mkdirSync(path.join(output,'assets'));
const client=await build({stdin:{contents:'export {subscribeStringList} from "./src/lib/subscribeStringList"; export {getSystemSocAndSource} from "./src/lib/socUtils";',resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',write:false,minify:true});
const clientName='soc-strings-client-'+sha(client.outputFiles[0].contents).slice(0,12)+'.js';
record('assets/'+clientName,null,client.outputFiles[0].contents);
let subscriptions=0,socFunctions=0;
for(const name of active){
 const original=fs.readFileSync(path.join(baseline,'assets',name));
 if(!name.endsWith('.js')){record('assets/'+name,original,original);continue;}
 let source=original.toString();const edits=[],functions=new Map();
 traverse(parse(source,{sourceType:'module'}),{StringLiteral(p){
  const type=p.node.value==='/api/local/site-data/strings-stream?shape=list'?'stream':p.node.value==='native block'?'soc':null;
  if(type){const fn=p.getFunctionParent();assert(fn?.node.type==='FunctionDeclaration');functions.set(fn.node,type);}
 }});
 for(const [fn,type]of functions){edits.push({start:fn.body.start,end:fn.body.end,text:`{return ${type==='stream'?'__prizmStringSubscribe21':'__prizmSoc21'}(...arguments);}`});if(type==='stream')subscriptions++;else socFunctions++;}
 edits.sort((a,b)=>b.start-a.start);for(const edit of edits)source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
 if(edits.length)source=`import {subscribeStringList as __prizmStringSubscribe21,getSystemSocAndSource as __prizmSoc21} from "./${clientName}";\n`+source;
 source=rewrite(source);parse(source,{sourceType:'module'});record('assets/'+namesMap.get(name),original,source);
}
assert.equal(subscriptions,1,'Exactly one active string subscription');assert.equal(socFunctions,1,'Exactly one active site SOC presenter');
for(const name of entries){const original=fs.readFileSync(path.join(baseline,name),'utf8');record(name,original,rewrite(original));}
for(const name of fs.readdirSync(baseline)){
 if(['server.cjs','fleet-server.cjs','power-flow-verifier.cjs',...entries].includes(name)||! /\.(cjs|svg|ico|png)$/.test(name))continue;
 const original=fs.readFileSync(path.join(baseline,name));record(name,original,original);
}
const verifier=await build({entryPoints:['scripts/corrective-deployment-verifier.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false});
record('power-flow-verifier.cjs',fs.readFileSync(path.join(baseline,'power-flow-verifier.cjs')),verifier.outputFiles[0].contents);
fs.writeFileSync(path.join(path.dirname(output),'scope-manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({files:manifest.files.length,subscriptions,socFunctions,output}));
