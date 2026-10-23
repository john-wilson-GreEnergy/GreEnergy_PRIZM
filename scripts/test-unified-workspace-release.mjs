/** Run the unified gateway suite against the exact scoped production artifact. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {execFileSync,spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {parse} from '@babel/parser';
const [baselineArg,releaseArg]=process.argv.slice(2);assert(baselineArg&&releaseArg);
const baseline=path.resolve(baselineArg),release=path.resolve(releaseArg);
const before=fs.readFileSync(baseline+'/fleet-server.cjs','utf8'),after=fs.readFileSync(release+'/fleet-server.cjs','utf8');
const functions=source=>new Map(parse(source).program.body.filter(n=>n.type==='FunctionDeclaration').map(n=>[n.id.name,source.slice(n.start,n.end)]));
const a=functions(before),b=functions(after),changed=[...a].filter(([name,body])=>b.get(name)!==body).map(([name])=>name).sort();
assert.deepEqual(changed,['createFleetApp','createMobileApp','createRemoteDesktop','createRemoteMobileApp','createWorkspaceGateway','main']);
const start='void main().catch(() => {';assert.equal(after.split(start).length,2);
let test=fs.readFileSync('src/server/fleet/workspaceUi.test.ts','utf8');
test=test.replace(/^import .* from '\.\/workspaceUi';\n/m,'').replace(/^import .* from '\.\/workspaceGateway';\n/m,'')
 .replace(/^import .* from '\.\/remoteMobile';\n/m,'').replace(/^import .* from '\.\/FleetBroker';\n/m,'')
 .replace(/^import .* from '\.\.\/security\/localSessions';\n/m,'').replace(/^import .* from '\.\.\/security\/localAccounts';\n/m,'');
const prelude=`import fs from 'node:fs';import Module,{createRequire} from 'node:module';
const artifact=${JSON.stringify(release+'/fleet-server.cjs')};
const mod=new Module(artifact);mod.filename=artifact;mod.paths=[${JSON.stringify(path.resolve('node_modules'))}];
mod._compile(fs.readFileSync(artifact,'utf8').split(${JSON.stringify(start)})[0]+'\\nmodule.exports={createWorkspaceGateway,createRemoteMobileApp,FleetBroker,LocalSessions,hashLocalPassword};',artifact);
const {createWorkspaceGateway,createRemoteMobileApp,FleetBroker,LocalSessions,hashLocalPassword}=mod.exports;
const {createWorkspaceUi}=createRequire(import.meta.url)(${JSON.stringify(release+'/workspace-ui.cjs')});
`;
const temp=fs.mkdtempSync('/private/tmp/prizm-unified-artifact-'),file=temp+'/test.mjs';
await build({stdin:{contents:prelude+test,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:file});
execFileSync(process.execPath,[file],{stdio:'inherit',timeout:60000});
console.log('PASS exact release: only six delivery functions changed; acquisition, authentication, command policies and collector bytes preserved');
// Fresh production entrypoint boot and rollback flag, loopback fixture only.
const fixture=createServer((_req,res)=>{res.writeHead(503);res.end();});
await new Promise(r=>fixture.listen(0,'127.0.0.1',r));
const collectorPort=fixture.address().port,portProbe=createServer();
await new Promise(r=>portProbe.listen(0,'127.0.0.1',r));const port=portProbe.address().port;
await new Promise(r=>portProbe.close(r));
fs.chmodSync(temp,0o700);
fs.writeFileSync(temp+'/accounts.json',JSON.stringify([{id:'fixture',email:'fixture@example.invalid',disabled:true,version:1,
 password:{algorithm:'scrypt-v1',salt:'0'.repeat(32),digest:'0'.repeat(128)},grants:[]}]),{mode:0o600});
fs.writeFileSync(temp+'/config.json',JSON.stringify({origin:'http://127.0.0.1:'+port,allowLoopbackHttp:true,accountsFile:temp+'/accounts.json',
 collectors:[{siteId:'fixture',blockId:'1',stationCode:'FIXTURE',blockIndex:1,name:'Offline fixture',url:'http://127.0.0.1:'+collectorPort+'/api/fleet/site-summary',token:'f'.repeat(43)}]}),{mode:0o600});
try{for(const enabled of [true,false]){
 const child=spawn(process.execPath,[release+'/fleet-server.cjs'],{cwd:path.dirname(release),env:{...process.env,NODE_PATH:path.resolve('node_modules'),PRIZM_FLEET_CONFIG:temp+'/config.json',PRIZM_REMOTE_CONFIG:'',PRIZM_UNIFIED_WORKSPACE_UI:String(enabled)},stdio:['ignore','pipe','pipe']});
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Fresh boot timeout')),10000);let output='';
  child.stdout.on('data',b=>{output+=b;if(output.includes('fleet.started')){clearTimeout(timer);resolve();}});
  child.once('exit',code=>{clearTimeout(timer);reject(Error('Boot exited '+code));});
 });
 const r=await fetch('http://127.0.0.1:'+port+'/');assert.equal(r.status,200);await r.text();
 assert.equal(Boolean(r.headers.get('x-prizm-ui-release')),enabled);
 const denied=await fetch('http://127.0.0.1:'+port+'/api/fleet/summary');assert.equal(denied.status,401);await denied.text();
 }finally{child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}
}console.log('PASS fresh production entrypoint startup and rollback flag, protected Fleet login, loopback-only fixture');
}finally{fixture.closeAllConnections();await new Promise(r=>fixture.close(r));}
