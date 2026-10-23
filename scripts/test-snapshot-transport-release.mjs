import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {parse} from '@babel/parser';
import {build} from 'esbuild';
import {execFileSync,spawn} from 'node:child_process';
import {createServer} from 'node:http';
const [base,out]=process.argv.slice(2);assert(base&&out);

const before=fs.readFileSync(base+'/fleet-server.cjs','utf8'),after=fs.readFileSync(out+'/fleet-server.cjs','utf8');
const fns=s=>new Map(parse(s).program.body.filter(n=>n.type==='FunctionDeclaration').map(n=>[n.id.name,s.slice(n.start,n.end)]));
for(const [file,expected]of [['server.cjs','buildBrowserSnapshot'],['fleet-server.cjs','workspaceForwarder']]){
 const old=fs.readFileSync(base+'/'+file,'utf8'),next=fs.readFileSync(out+'/'+file,'utf8'),a=fns(old),b=fns(next);
 assert.deepEqual([...a].filter(([n,s])=>b.get(n)!==s).map(([n])=>n),[expected]);
 const strip=s=>{const node=parse(s).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===expected);return s.slice(0,node.start)+s.slice(node.end);};
 assert.equal(strip(old),strip(next),'Unrelated code and policies unchanged');
}
const start='void main().catch(() => {';assert.equal(after.split(start).length,2);
let test=fs.readFileSync('src/server/fleet/workspaceUi.test.ts','utf8');
for(const p of ['./workspaceUi','./workspaceGateway','./remoteMobile','./FleetBroker','../security/localSessions','../security/localAccounts'])test=test.split('\n').filter(line=>!line.startsWith('import ')||!line.includes("from '"+p+"'")).join('\n');
const prelude=`import fs from 'node:fs';import Module,{createRequire} from 'node:module';
const artifact=${JSON.stringify(path.resolve(out+'/fleet-server.cjs'))};
const mod=new Module(artifact);mod.filename=artifact;mod.paths=[${JSON.stringify(path.resolve('node_modules'))}];
mod._compile(fs.readFileSync(artifact,'utf8').split(${JSON.stringify(start)})[0]+'\\nmodule.exports={createWorkspaceGateway,createRemoteMobileApp,FleetBroker,LocalSessions,hashLocalPassword,remoteDesktopRead,monitoringWorkspaceGet};',artifact);
const {createWorkspaceGateway,createRemoteMobileApp,FleetBroker,LocalSessions,hashLocalPassword,remoteDesktopRead,monitoringWorkspaceGet}=mod.exports;
const {createWorkspaceUi}=createRequire(import.meta.url)(${JSON.stringify(path.resolve(out+'/workspace-ui.cjs'))});
`;
test+=`\nassert.equal(remoteDesktopRead('GET','/api/local/topology/active?view=profile'),'/api/local/topology/active?view=profile');
for(const bad of ['?view=full','?view=profile&view=profile','?refresh=true'])assert.equal(remoteDesktopRead('GET','/api/local/topology/active'+bad),null);
for(const m of ['POST','PUT','DELETE'])assert.equal(remoteDesktopRead(m,'/api/local/topology/active?view=profile'),null);
assert(monitoringWorkspaceGet('/api/local/topology/active'));`;
const temp=fs.mkdtempSync('/private/tmp/prizm-snapshot-test-'),file=temp+'/test.mjs';
await build({stdin:{contents:prelude+test,loader:'ts',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:file});
execFileSync(process.execPath,[file],{stdio:'inherit',timeout:60000});
console.log('PASS exact release: only projection/transport changed; LAN/remote read-only policy, site grants and revocation tests');


// Run the transport test against the actual deployed forwarder, not a mock.
let transport=fs.readFileSync('src/server/fleet/workspaceTransport.test.ts','utf8').replace("import {workspaceForwarder} from './workspaceGateway';",'');
const load=`import Module from 'node:module'; const artifact=${JSON.stringify(path.resolve(out+'/fleet-server.cjs'))};
const mod=new Module(artifact);mod.filename=artifact;mod.paths=[${JSON.stringify(path.resolve('node_modules'))}];
mod._compile(fs.readFileSync(artifact,'utf8').split(${JSON.stringify(start)})[0]+'\\nmodule.exports={workspaceForwarder};',artifact);
const {workspaceForwarder}=mod.exports;
`;
await build({stdin:{contents:load+transport,loader:'ts',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',banner:{js:"import {createRequire as __req} from 'node:module';const require=__req(import.meta.url);"},outfile:temp+'/transport.mjs'});
execFileSync(process.execPath,[temp+'/transport.mjs'],{stdio:'inherit',timeout:60000});
// Fresh Fleet entrypoint startup and rollback flag; loopback fixture only.
const fixture=createServer((_req,res)=>{res.writeHead(503);res.end();});
await new Promise(r=>fixture.listen(0,'127.0.0.1',r));
const portProbe=createServer();await new Promise(r=>portProbe.listen(0,'127.0.0.1',r));const port=portProbe.address().port;
await new Promise(r=>portProbe.close(r));fs.chmodSync(temp,0o700);
fs.writeFileSync(temp+'/accounts.json',JSON.stringify([{id:'fixture',email:'fixture@example.invalid',disabled:true,version:1,password:{algorithm:'scrypt-v1',salt:'0'.repeat(32),digest:'0'.repeat(128)},grants:[]}]),{mode:0o600});
fs.writeFileSync(temp+'/config.json',JSON.stringify({origin:'http://127.0.0.1:'+port,allowLoopbackHttp:true,accountsFile:temp+'/accounts.json',collectors:[{siteId:'fixture',blockId:'1',stationCode:'FIXTURE',blockIndex:1,name:'Offline fixture',url:'http://127.0.0.1:'+fixture.address().port+'/api/fleet/site-summary',token:'f'.repeat(43)}]}),{mode:0o600});
try{for(const enabled of [true,false]){
 const child=spawn(process.execPath,[path.resolve(out+'/fleet-server.cjs')],{cwd:path.dirname(path.resolve(out)),env:{...process.env,NODE_PATH:path.resolve('node_modules'),PRIZM_FLEET_CONFIG:temp+'/config.json',PRIZM_REMOTE_CONFIG:'',PRIZM_UNIFIED_WORKSPACE_UI:String(enabled)},stdio:['ignore','pipe','pipe']});
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Fresh boot timeout')),10000);let output='';child.stdout.on('data',b=>{output+=b;if(output.includes('fleet.started')){clearTimeout(timer);resolve();}});child.once('exit',code=>{clearTimeout(timer);reject(Error('Boot exited '+code));});});
  const r=await fetch('http://127.0.0.1:'+port+'/');assert.equal(r.status,200);await r.text();assert.equal(Boolean(r.headers.get('x-prizm-ui-release')),enabled);
  const denied=await fetch('http://127.0.0.1:'+port+'/api/fleet/summary');assert.equal(denied.status,401);await denied.text();
 }finally{child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}
}console.log('PASS exact production Fleet fresh startup and rollback flag');
}finally{fixture.closeAllConnections();await new Promise(r=>fixture.close(r));}

// Exercise the actual rollback routine with isolated files and mocked service operations.
const installer=fs.readFileSync('scripts/deploy-snapshot-transport.mjs','utf8');
const rb=installer.slice(installer.indexOf('async function rollback(state)'),installer.indexOf('async function apply()'));
const plans=['prizm','prizm-site@ss4','prizm-fleet'].map((unit,i)=>({unit,site:'site'+i,override:temp+'/'+unit+'.conf'}));
for(const p of plans)fs.writeFileSync(p.override,'fixture '+p.unit);
const calls=[],state={touched:plans.map(p=>p.unit),invariants:{preserved:true}};
const ctx={fs,assert,plans,overrideText:p=>'fixture '+p.unit,run:(cmd,args)=>calls.push([cmd,...args]),effective:(p,updated)=>assert.equal(updated,false),check:async(_s,updated)=>assert.equal(updated,false),invariants:()=>({preserved:true}),save:()=>{},console};
await vm.runInNewContext(rb+'\nrollback',ctx)(state);
assert.equal(state.rolledBack,true);assert(plans.every(p=>!fs.existsSync(p.override)));
assert.deepEqual(calls.filter(c=>c[1]==='restart').map(c=>c[2]),['prizm-fleet','prizm-site@ss4','prizm']);
fs.writeFileSync(plans[2].override,'independent edit');await assert.rejects(()=>vm.runInNewContext(rb+'\nrollback',ctx)(state));assert.equal(fs.readFileSync(plans[2].override,'utf8'),'independent edit');
console.log('PASS rollback reverses only touched services and refuses independently modified overrides');

