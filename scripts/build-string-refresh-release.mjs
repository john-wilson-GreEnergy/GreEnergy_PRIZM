/** Scoped refresh release derived from the deployed artifacts, not the dirty tree. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {build,transformSync} from 'esbuild';
import {parse} from '@babel/parser';
import tp from '@babel/traverse';
const traverse=tp.default??tp;
const [baseArg,outArg]=process.argv.slice(2);assert(baseArg&&outArg);
const base=path.resolve(baseArg),out=path.resolve(outArg);assert(!fs.existsSync(out));
const sha=b=>createHash('sha256').update(b).digest('hex');
function tree(dir){const r={};for(const n of fs.readdirSync(dir).sort()){const p=dir+'/'+n,s=fs.lstatSync(p);assert(!s.isSymbolicLink());if(s.isDirectory())for(const [k,v]of Object.entries(tree(p)))r[n+'/'+k]=v;else{assert(s.isFile());r[n]=sha(fs.readFileSync(p));}}return r;}
const before=tree(base);fs.cpSync(base,out,{recursive:true});
function once(s,a,b){assert.equal(s.split(a).length,2,'Exact boundary: '+a.slice(0,100));return s.replace(a,b);}
function replaceFunction(s,name,code){const nodes=[];traverse(parse(s),{FunctionDeclaration(p){if(p.node.id.name===name)nodes.push(p.node);}});assert.equal(nodes.length,1,name);const n=nodes[0];return s.slice(0,n.start)+code.trimEnd()+s.slice(n.end);}
function sourceFunction(file,name){const s=fs.readFileSync(file,'utf8'),nodes=[];traverse(parse(s,{sourceType:'module',plugins:['typescript']}),{FunctionDeclaration(p){if(p.node.id?.name===name)nodes.push(p.node);}});assert.equal(nodes.length,1,name);const n=nodes[0];return transformSync(s.slice(n.start,n.end),{loader:'ts'}).code;}
function sourceRoute(file,start,end){const s=fs.readFileSync(file,'utf8'),a=s.indexOf(start),b=s.indexOf(end,a);assert(a>=0&&b>a);return transformSync(s.slice(a,b),{loader:'ts'}).code;}
let server=fs.readFileSync(base+'/server.cjs','utf8');
server=replaceFunction(server,'buildBrowserSnapshot',sourceFunction('src/server/siteDataRoutes.ts','buildBrowserSnapshot'));
server=replaceFunction(server,'serializePublishedView',sourceFunction('src/server/siteDataRoutes.ts','serializePublishedView').replaceAll('gzipSync(', '(0, import_node_zlib4.gzipSync)('));
server=once(server,'  { key: "string-list-v1", compactStringList: true, includeStrings: true },','  { key: "string-context-v1", compactStringList: true, stringContextOnly: true, includeStrings: true },\n  { key: "string-list-v1", compactStringList: true, includeStrings: true },');
for(const [start,end]of [['siteDataRouter.get("/snapshot",','siteDataRouter.get("/published-views/status",'],['siteDataRouter.get("/strings-stream",','siteDataRouter.get("/domains",']]){
 const a=server.indexOf(start),b=server.indexOf(end,a);assert(a>0&&b>a);
 let route=sourceRoute('src/server/siteDataRoutes.ts',start,end);
 route=route.replace('new StringFieldDeltas()', 'new (require("./soc-strings-runtime.cjs").StringFieldDeltas)(stringTransportEpoch)');
 server=server.slice(0,a)+route+server.slice(b);
}
server=once(server,'      publishOperationalDomains(newSnap, newSnap.liveStatus?.lastUpdated || (/* @__PURE__ */ new Date()).toISOString());','      publishOperationalDomains(newSnap, newSnap.liveStatus?.lastUpdated || (/* @__PURE__ */ new Date()).toISOString());\n      scheduleFastStringEncoding();');
server=once(server,'        durationMs: performance.now() - fastStringsStartedAt\n      });','        durationMs: performance.now() - fastStringsStartedAt\n      });\n      scheduleFastStringEncoding();');
server='var fastEncodingScheduled = false;\n'+sourceFunction('src/server/telemetry/stringListContext.ts','stringListContextRow')+
 sourceFunction('src/server/prizmDataCoordinator.ts','scheduleFastStringEncoding')+
 sourceFunction('src/server/prizmDataCoordinator.ts','getStringStreamMetadata')+server;
parse(server);fs.writeFileSync(out+'/server.cjs',server);
let forward=sourceFunction('src/server/fleet/workspaceGateway.ts','workspaceForwarder');
forward=forward.replace(/\s*if \(res.locals.prizmGuidanceShared === true\) headers\["x-prizm-guidance-shared"\] = "true";/,'');
assert(!forward.includes('prizmGuidanceShared'));
forward=forward.replaceAll('https.','import_node_https.default.').replaceAll('new Transform(','new import_node_stream.Transform(').replaceAll('randomUUID()','require("node:crypto").randomUUID()');
const fleet=replaceFunction(fs.readFileSync(base+'/fleet-server.cjs','utf8'),'workspaceForwarder',forward);
parse(fleet);fs.writeFileSync(out+'/fleet-server.cjs',fleet);
// One shared module owns stream liveness in both the request lane and subscription.
// The adapter provides the new optional argument to the existing provider call.
const client=await build({stdin:{contents:`
 export {subscribeStringList} from './src/lib/subscribeStringList';
 import {SiteDataRequests as Requests} from './src/lib/siteDataRequests';
 import {hasHealthyStringStream} from './src/lib/stringStreamHealth';
 import {RowProjectionCache as Cache,samePublication} from './src/lib/rowProjectionCache';
 export class SiteDataRequests extends Requests {
   snapshot(view,force=false,compact=true,context=new URLSearchParams(window.location.search).get('stringRefresh')!=='legacy'&&hasHealthyStringStream()){
     return super.snapshot(view,force,compact,context);
   }
 }
 export class RowProjectionCache extends Cache {constructor(){super(samePublication);}}
 `,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'esm',platform:'browser',write:false,minify:true});
const clientName='string-refresh-'+sha(client.outputFiles[0].contents).slice(0,12)+'.js';fs.writeFileSync(out+'/assets/'+clientName,client.outputFiles[0].contents);
const entries=['index.html','fleet.html','mobile.html','signin.html'].filter(n=>fs.existsSync(base+'/'+n));
const names=fs.readdirSync(base+'/assets'),active=new Set(),queue=entries.map(n=>fs.readFileSync(base+'/'+n,'utf8'));
while(queue.length){const s=queue.pop();for(const n of names)if(!active.has(n)&&s.includes(n)){active.add(n);if(n.endsWith('.js'))queue.push(fs.readFileSync(base+'/assets/'+n,'utf8'));}}
const rename=new Map([...active].filter(n=>n.endsWith('.js')).map(n=>[n,n.replace(/\.js$/,'-refresh21.js')]));
const rewrite=s=>{for(const [a,b]of rename)s=s.replaceAll(a,b);return s;};
const counts={subscription:0,requests:0,rowCache:0,pause:0,zero:0};
for(const [old,next]of rename){
 let s=fs.readFileSync(base+'/assets/'+old,'utf8');const edits=[],imports=[],functions=new Set();
 traverse(parse(s,{sourceType:'module'}),{
  StringLiteral(p){if(p.node.value==='/api/local/site-data/strings-stream?shape=list-v2'){const fn=p.getFunctionParent();assert(fn.node.type==='FunctionDeclaration');functions.add(fn.node);}},
  ClassDeclaration(p){const n=p.node,body=s.slice(n.start,n.end);if(body.includes('pendingSnapshot')&&body.includes('topologyLoaded')){edits.push({a:n.start,b:n.end,text:`const ${n.id.name}=__RefreshRequests;`});imports.push('SiteDataRequests as __RefreshRequests');counts.requests++;}
   if(body.includes('inputs.length')&&body.includes('this.rows')){edits.push({a:n.start,b:n.end,text:`const ${n.id.name}=__RefreshRows;`});imports.push('RowProjectionCache as __RefreshRows');counts.rowCache++;}}
 });
 for(const fn of functions){edits.push({a:fn.body.start,b:fn.body.end,text:'{return __RefreshSubscribe(...arguments);}'});imports.push('subscribeStringList as __RefreshSubscribe');counts.subscription++;}
 for(const e of edits.sort((a,b)=>b.a-a.a))s=s.slice(0,e.a)+e.text+s.slice(e.b);
 if(old.startsWith('StringDashboard-')){
  s=once(s,'isInitialLoading:o,refreshNow:g}=ir(["snapshot","activeTopologyProfile","isInitialLoading","refreshNow"])','isInitialLoading:o,refreshNow:g,isPollingEnabled:__RefreshPolling,isTerminated:__RefreshTerminated}=ir(["snapshot","activeTopologyProfile","isInitialLoading","refreshNow","isPollingEnabled","isTerminated"])');
  s=once(s,'f.useEffect(()=>{if(!t)return;if(z)return $r(A,N);','f.useEffect(()=>{if(!t||!__RefreshPolling||__RefreshTerminated)return;if(z)return $r(A,N);');
  s=once(s,'y.close()}},[t,z]);','y.close()}},[t,z,__RefreshPolling,__RefreshTerminated]);');counts.pause++;
  for(const [from,to]of [['E','s'],['J','d']])for(const field of ['knownBpcCount','expectedBpcCount','warningBpcs','alarmBpcs',...(from==='E'?['totalBpcs']:[])]){
   s=once(s,`${field}:${from}.${field}||${to}.${field}`,`${field}:${from}.${field}??${to}.${field}`);counts.zero++;
  }
 }
 if(imports.length)s=`import {${imports.join(',')}} from "./${clientName}";\n`+s;
 s=rewrite(s);parse(s,{sourceType:'module'});fs.writeFileSync(out+'/assets/'+next,s);
}
assert.deepEqual(counts,{subscription:1,requests:1,rowCache:1,pause:1,zero:9});
for(const name of entries)fs.writeFileSync(out+'/'+name,rewrite(fs.readFileSync(base+'/'+name,'utf8')));
const after=tree(out),changed=Object.keys(after).filter(p=>before[p]!==after[p]).sort();
assert(Object.keys(before).every(p=>p in after));
assert(changed.every(p=>['server.cjs','fleet-server.cjs',...entries].includes(p)||p==='assets/'+clientName||p.endsWith('-refresh21.js')));
const manifest={schema:1,scope:'Stream-owned string reads; context snapshot; pre-encoding; row reuse; bounded passive read recovery and diagnostics',before,after,changed,clientName,counts};
const raw=JSON.stringify(manifest,null,2);fs.writeFileSync(path.dirname(out)+'/refresh-manifest.json',raw);
console.log(JSON.stringify({output:out,changed:changed.length,counts,clientName,manifestHash:sha(raw)}));
