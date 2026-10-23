import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import vm from 'node:vm';
import {parse} from '@babel/parser';
const [releaseArg,installerArg]=process.argv.slice(2),release=path.resolve(releaseArg);
const temp=fs.mkdtempSync('/private/tmp/prizm-storage-boot-');fs.chmodSync(temp,0o700);
const collector=createServer((_req,res)=>{res.writeHead(503);res.end();});
await new Promise(r=>collector.listen(0,'127.0.0.1',r));
const portProbe=createServer();await new Promise(r=>portProbe.listen(0,'127.0.0.1',r));const port=portProbe.address().port;await new Promise(r=>portProbe.close(r));
fs.writeFileSync(temp+'/accounts.json',JSON.stringify([{id:'fixture',email:'fixture@example.invalid',disabled:true,version:1,password:{algorithm:'scrypt-v1',salt:'0'.repeat(32),digest:'0'.repeat(128)},grants:[]}]),{mode:0o600});
fs.writeFileSync(temp+'/config.json',JSON.stringify({origin:'http://127.0.0.1:'+port,allowLoopbackHttp:true,accountsFile:temp+'/accounts.json',collectors:[{siteId:'fixture',blockId:'1',stationCode:'FIXTURE',blockIndex:1,name:'Offline fixture',url:'http://127.0.0.1:'+collector.address().port+'/api/fleet/site-summary',token:'f'.repeat(43)}]}),{mode:0o600});
try{for(const enabled of [true,false]){
 const child=spawn(process.execPath,[release+'/fleet-server.cjs'],{cwd:path.dirname(release),env:{...process.env,NODE_PATH:path.resolve('node_modules'),PRIZM_FLEET_CONFIG:temp+'/config.json',PRIZM_REMOTE_CONFIG:'',PRIZM_UNIFIED_WORKSPACE_UI:String(enabled)},stdio:['ignore','pipe','pipe']});
 const exited=new Promise(resolve=>child.once('exit',resolve));
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Fresh boot timeout')),10000);let output='';child.stdout.on('data',b=>{output+=b;if(output.includes('fleet.started')){clearTimeout(timer);resolve();}});child.once('exit',code=>{clearTimeout(timer);reject(Error('Boot exited '+code));});});
  const r=await fetch('http://127.0.0.1:'+port+'/');assert.equal(r.status,200);await r.text();assert.equal(Boolean(r.headers.get('x-prizm-ui-release')),enabled);
  const denied=await fetch('http://127.0.0.1:'+port+'/api/fleet/summary');assert.equal(denied.status,401);await denied.text();
 }finally{child.kill('SIGTERM');await exited;}
}console.log('PASS fresh exact release startup and UI fallback, protected login; loopback fixtures only');
}finally{collector.closeAllConnections();await new Promise(r=>collector.close(r));}
if(installerArg==='--startup-only')process.exit(0);
const installer=fs.readFileSync(installerArg,'utf8'),ast=parse(installer,{sourceType:'module'}),fn=ast.program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='rollback');assert(fn);
const operations=[],before={untouched:true},state={before};
await vm.runInNewContext(installer.slice(fn.start,fn.end)+'\nrollback(state)',{
 state,fs:{existsSync:()=>true,readFileSync:()=> 'expected override',unlinkSync:p=>operations.push(['unlink',p])},override:'/only-this-rollout.conf',overrideText:'expected override',assert,
 prior:'remote-admin-baseline',run:(cmd,args)=>operations.push([cmd,...args]),effective:p=>assert.equal(p,'remote-admin-baseline'),healthy:async updated=>assert.equal(updated,false),same:(a,b)=>assert.deepEqual(a,b),invariants:()=>before,save:s=>assert.equal(s.rolledBack,true),console
});
assert.deepEqual(operations,[['unlink','/only-this-rollout.conf'],['systemctl','daemon-reload'],['systemctl','restart','prizm-fleet']]);
console.log('PASS rollback simulation: only rollout override removed; only Fleet restarted; preservation checks run');
