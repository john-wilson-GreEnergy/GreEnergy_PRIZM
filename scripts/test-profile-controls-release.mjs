/** Exercise the exact scoped artifact with synthetic accounts/collectors only. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {execFileSync,spawn} from 'node:child_process';
import {createServer} from 'node:http';
import vm from 'node:vm';
import {parse} from '@babel/parser';
const [baseArg,releaseArg]=process.argv.slice(2);assert(baseArg&&releaseArg);
const base=path.resolve(baseArg),release=path.resolve(releaseArg);
const before=fs.readFileSync(base+'/fleet-server.cjs','utf8'),after=fs.readFileSync(release+'/fleet-server.cjs','utf8');
const funcs=s=>new Map(parse(s,{sourceType:'unambiguous'}).program.body.filter(n=>n.type==='FunctionDeclaration').map(n=>[n.id.name,s.slice(n.start,n.end)]));
const a=funcs(before),b=funcs(after),manifest=JSON.parse(fs.readFileSync(path.dirname(release)+'/profiles-manifest.json'));
assert.deepEqual([...a].filter(([n,s])=>b.get(n)!==s).map(([n])=>n).sort(),[...manifest.functions].sort());
assert.equal(b.get('main'),a.get('main').replace('{ event: "mobile.remote-listener.ready", readOnly: true }','{ event: "mobile.remote-listener.ready", controls: remoteConfig.controls === "profile" ? "profile" : "disabled" }'),'Startup differs only in truthful remote-controls logging');
let downloadModules=0;
for(const file of manifest.changed.filter(p=>p.endsWith('.js'))){
 const source=fs.readFileSync(release+'/'+file,'utf8'),helper=funcs(source).get('__profileDownload');if(!helper)continue;downloadModules++;
 for(const pathname of ['/','/desktop/ss3/','/desktop/ss4/']){
  const result=vm.runInNewContext(helper+';__profileDownload("/api/settings/profiles/export")',{window:{location:{pathname}}});
  assert.equal(result,(pathname==='/'?'':pathname.slice(0,-1))+'/api/settings/profiles/export');
 }
 assert(!/href:`\/api\/local\/(?:diagnostic-session|reports\/download)\//.test(source));
}
assert.equal(downloadModules,2,'Native download modules scoped to the selected site');
const entry=parse(after).program.body.filter(n=>after.slice(n.start,n.end).startsWith('void main().catch('));assert.equal(entry.length,1);
const exports=['createFleetApp','createRemoteMobileApp','createWorkspaceGateway','FleetBroker','LocalSessions','hashLocalPassword','verifyLocalPassword','readAccounts','parseAccounts','manageFleetAccount','listFleetAccounts'];
const prelude=`import fsFixture from 'node:fs';import ModuleFixture from 'node:module';
const artifact=${JSON.stringify(release+'/fleet-server.cjs')};
const compiled=fsFixture.readFileSync(artifact,'utf8');const mod=new ModuleFixture(artifact);mod.filename=artifact;mod.paths=[${JSON.stringify(path.resolve('node_modules'))}];
mod._compile(compiled.slice(0,${entry[0].start})+compiled.slice(${entry[0].end})+'\\nmodule.exports={${exports.join(',')}};',artifact);
const {${exports.join(',')}}=mod.exports;\n`;
const temp=fs.mkdtempSync('/private/tmp/prizm-profile-artifact-');
for(const name of ['accountManagement','adminRoutes','remoteControls','remoteMobile','remotePassword','workspaceUi']){
 const original=path.resolve('src/server/fleet/'+name+'.test.ts');let test=fs.readFileSync(original,'utf8');
 test=test.replace(/^import .* from ['"](?:\.\/accountManagement|\.\/fleetApp|\.\/remoteMobile|\.\/FleetBroker|\.\/workspaceGateway|\.\.\/security\/localSessions|\.\.\/security\/localAccounts)['"];?\n/gm,'');
 const file=temp+'/'+name+'.mjs';
 await build({stdin:{contents:prelude+test,resolveDir:path.dirname(original),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:file});
 execFileSync(process.execPath,[file],{stdio:'inherit',timeout:90000});
}
console.log('PASS exact scoped server: six profile functions plus startup log; deployed authentication, transports, broker, collectors and all other functions retained');
// Exercise the real startup path, not only exported test functions. All traffic
// goes to a loopback fixture that returns 503 and cannot reach equipment.
const fixture=createServer((_req,res)=>{res.writeHead(503);res.end();});
await new Promise(r=>fixture.listen(0,'127.0.0.1',r));
const collectorPort=fixture.address().port,portProbe=createServer();
await new Promise(r=>portProbe.listen(0,'127.0.0.1',r));const port=portProbe.address().port;
await new Promise(r=>portProbe.close(r));fs.chmodSync(temp,0o700);
fs.writeFileSync(temp+'/accounts.json',JSON.stringify([{id:'fixture',email:'fixture@example.invalid',disabled:true,version:1,
 password:{algorithm:'scrypt-v1',salt:'0'.repeat(32),digest:'0'.repeat(128)},grants:[]}]),{mode:0o600});
fs.writeFileSync(temp+'/config.json',JSON.stringify({origin:'http://127.0.0.1:'+port,allowLoopbackHttp:true,accountsFile:temp+'/accounts.json',
 collectors:[{siteId:'fixture',blockId:'1',stationCode:'FIXTURE',blockIndex:1,name:'Offline fixture',url:'http://127.0.0.1:'+collectorPort+'/api/fleet/site-summary',token:'f'.repeat(43)}]}),{mode:0o600});
try{for(const enabled of [true,false]){
 const child=spawn(process.execPath,[release+'/fleet-server.cjs'],{cwd:path.dirname(release),env:{...process.env,NODE_PATH:path.resolve('node_modules'),PRIZM_FLEET_CONFIG:temp+'/config.json',PRIZM_REMOTE_CONFIG:'',PRIZM_UNIFIED_WORKSPACE_UI:String(enabled)},stdio:['ignore','pipe','pipe']});
 const exited=new Promise(resolve=>child.once('exit',resolve));
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Fresh boot timeout')),10000);let output='';
  child.stdout.on('data',b=>{output+=b;if(output.includes('fleet.started')){clearTimeout(timer);resolve();}});
  child.once('exit',code=>{clearTimeout(timer);reject(Error('Boot exited '+code));});
 });
 const r=await fetch('http://127.0.0.1:'+port+'/');assert.equal(r.status,200);await r.text();assert.equal(Boolean(r.headers.get('x-prizm-ui-release')),enabled);
 const denied=await fetch('http://127.0.0.1:'+port+'/api/fleet/summary');assert.equal(denied.status,401);await denied.text();
 }finally{child.kill('SIGTERM');await exited;}
}console.log('PASS fresh exact production entrypoint and UI rollback flag; protected login, loopback fixture only');
}finally{fixture.closeAllConnections();await new Promise(r=>fixture.close(r));}
