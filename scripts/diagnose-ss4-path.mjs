/** Bounded, read-only Dell diagnostics. No service/network changes or device reads. */
import fs from 'node:fs';
import https from 'node:https';
import tls from 'node:tls';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const self=fileURLToPath(import.meta.url);
const run=(file,args)=>{
 try{return {ok:true,output:execFileSync(file,args,{encoding:'utf8',timeout:18000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']}).trim()};}
 catch(e){return {ok:false,output:String(e.stdout??'').slice(0,10000),error:String(e.stderr??e.message).slice(0,2000)};}
};
const prop=(unit,key)=>execFileSync('systemctl',['show',unit,'-p',key,'--value'],{encoding:'utf8',timeout:5000}).trim();
function namespace(file){try{const s=fs.statSync(file);return {device:s.dev,inode:s.ino};}catch(e){return {error:e.code};}}
async function tlsProbe(){
 const config=JSON.parse(fs.readFileSync('/etc/prizm-fleet/fleet/fleet.json','utf8'));
 const collector=config.collectors.find(c=>c.siteId==='solar-star-4');assert(collector);
 const u=new URL(collector.url);assert.equal(u.protocol,'https:');assert.equal(u.hostname,'172.31.250.6');assert.equal(u.port,'9443');
 return await new Promise(resolve=>{
  const started=Date.now();let settled=false,timer;
  const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);resolve({...value,elapsedMs:Date.now()-started});req.destroy();};
  // No credentials: an HTTP 401 proves the protected listener is reachable.
  const req=https.get({hostname:u.hostname,port:u.port,path:u.pathname,agent:false,
   ca:fs.readFileSync('/etc/prizm-fleet/fleet/ca-cert.pem'),checkServerIdentity:(_h,cert)=>tls.checkServerIdentity(u.hostname,cert)},res=>{
   res.resume();finish({status:res.statusCode});
  });
  req.on('error',e=>finish({error:e.code??e.message}));
  timer=setTimeout(()=>finish({error:'8-second deadline'}),8000);
 });
}
if(process.argv[2]==='--syntax-test')console.log('Read-only diagnostic loaded');
else if(process.argv[2]==='--probe')console.log(JSON.stringify(await tlsProbe()));
else{
 assert.equal(process.getuid(),0,'Run with sudo');assert.equal(process.argv.length,2,'No arguments accepted');
 const report={at:new Date().toISOString(),services:{},scopes:{},deployment:{}};
 const scopes=[['named-fleet',['ip','netns','exec','prizm-fleet']],['named-ss4',['ip','netns','exec','prizm-ss4']]];
 for(const unit of ['prizm','prizm-site@ss4','prizm-fleet']){
  const pid=Number(prop(unit,'MainPID'));
  report.services[unit]={pid,active:prop(unit,'ActiveState'),started:prop(unit,'ActiveEnterTimestamp'),exec:prop(unit,'ExecStart'),restarts:prop(unit,'NRestarts'),memory:prop(unit,'MemoryCurrent'),namespace:namespace('/proc/'+pid+'/ns/net')};
  if(unit!=='prizm'&&pid>1)scopes.push(['process-'+unit,['nsenter','-t',String(pid),'-n']]);
 }
 report.namedNamespaces={fleet:namespace('/run/netns/prizm-fleet'),ss4:namespace('/run/netns/prizm-ss4')};
 for(const [label,prefix] of scopes){
  const inside=args=>run(prefix[0],[...prefix.slice(1),...args]);
  report.scopes[label]={addresses:inside(['ip','-j','address','show']),routes:inside(['ip','-j','route','show']),
   listeners:inside(['ss','-lntp']),connections:inside(['ss','-s']),firewall:inside(['nft','list','ruleset']),
   ss4Tls:inside(['/usr/bin/node',self,'--probe'])};
 }
 const state='/var/lib/prizm-fleet/soc-strings-20261021/state.json';
 if(fs.existsSync(state)){
  const s=JSON.parse(fs.readFileSync(state));report.deployment={changed:s.changed,beforeChecks:Object.keys(s.before??{}),afterChecks:Object.keys(s.after??{}),completedAt:s.completedAt??null,rolledBack:s.rolledBack??false};
 }
 const target='/home/ebc/prizm-ss4-path-report.json',temp=target+'.new';
 const owner=fs.statSync('/home/ebc');fs.writeFileSync(temp,JSON.stringify(report,null,2),{mode:0o600,flag:'wx'});fs.chownSync(temp,owner.uid,owner.gid);fs.renameSync(temp,target);
 console.log('Saved SS4 connection diagnostics. No services, equipment or network settings changed.');
}
