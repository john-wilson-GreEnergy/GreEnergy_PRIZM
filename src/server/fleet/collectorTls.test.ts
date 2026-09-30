// Explicit loopback-only TLS integration test. No equipment endpoints are used.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,chmod,symlink} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:net';
import {request} from 'node:https';
import {createServer as httpServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import express from 'express';
import {parseCollectorTls,startCollectorTls} from './collectorTls';
import {collectorExportFromEnvironment} from './collectorExport';

const run=promisify(execFile);
const dir=await mkdtemp(path.join(tmpdir(),'prizm-collector-tls-'));
const keyFile=path.join(dir,'key.pem'),certFile=path.join(dir,'cert.pem');
const certificateConfig=path.join(dir,'certificate.conf');
await writeFile(certificateConfig,'[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=localhost\n[ext]\nsubjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\nextendedKeyUsage=serverAuth\n',{mode:0o600});
await run('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',keyFile,'-out',certFile,'-config',certificateConfig]);
await chmod(keyFile,0o600);await chmod(certFile,0o600);
const cert=await readFile(certFile);
async function port(){
  const socket=createServer();await new Promise<void>((resolve,reject)=>{socket.once('error',reject);socket.listen(0,'127.0.0.1',resolve);});
  const chosen=(socket.address() as {port:number}).port;
  await new Promise<void>(resolve=>socket.close(()=>resolve()));return chosen;
}
const ports=[await port(),await port()];
assert.notEqual(ports[0],ports[1]);
const originalConfig=process.env.PRIZM_FLEET_EXPORT_CONFIG;
const services:NonNullable<ReturnType<typeof collectorExportFromEnvironment>>[]=[];
const identity=(index:number)=>({siteId:'site-'+index,blockId:'1',stationCode:'LAB'+index,blockIndex:1,name:'Lab '+index,profileId:'profile-'+index,emsBaseUrl:'http://10.0.0.3:8080'});
let matches=true,reads=0;
const configs=ports.map((port,index)=>({identity:identity(index),origin:`https://127.0.0.1:${port}`,token:String(index+1).repeat(43),tls:{bindAddress:'127.0.0.1',keyFile,certFile}}));
const source=(index:number)=>{reads++;const stamp=new Date().toISOString();return {
  siteIdentity:{activeProfileId:identity(index).profileId,stationCode:identity(index).stationCode,blockIndex:1,emsBaseUrl:'http://10.0.0.3:8080'},
  liveStatus:{lastUpdated:stamp,stale:false,liveSucceeded:true,cacheUsed:false,state:'LIVE'},
  modbusTelemetry:{capturedAt:stamp,available:true,stale:false},blockOperatingSummary:{modbus:{measuredKW:index?720:1250}},
};};
async function get(index:number,route='/api/fleet/site-summary',extra:{method?:string;headers?:Record<string,string>;ca?:Buffer|null;servername?:string}={}){
  return new Promise<{status:number;body:string}>((resolve,reject)=>{
    const req=request({hostname:'127.0.0.1',port:ports[index],path:route,method:extra.method ?? 'GET',
      ca:extra.ca===null?undefined:(extra.ca ?? cert),servername:extra.servername ?? 'localhost',
      headers:{Authorization:'Bearer '+configs[index].token,Connection:'close',...extra.headers}},res=>{
      const parts:Buffer[]=[];res.on('data',p=>parts.push(p));res.on('end',()=>resolve({status:res.statusCode!,body:Buffer.concat(parts).toString()}));
    });req.setTimeout(3000,()=>req.destroy(new Error('Loopback request timeout')));req.on('error',reject);req.end();
  });
}
try {
  delete process.env.PRIZM_FLEET_EXPORT_CONFIG;
  assert.equal(collectorExportFromEnvironment(()=>null,()=>false),null,'Disabled by default');
  for(const address of ['0.0.0.0','::','8.8.8.8','host.example','172.32.0.1'])assert.throws(()=>parseCollectorTls({...configs[0].tls,bindAddress:address},configs[0].origin));
  assert.throws(()=>parseCollectorTls(configs[0].tls,'http://127.0.0.1:8443'));
  assert.throws(()=>parseCollectorTls(configs[0].tls,'https://127.0.0.1:0'));
  assert.throws(()=>parseCollectorTls({...configs[0].tls,keyFile:'key.pem'},configs[0].origin));
  for(const [index,config] of configs.entries()){
    const file=path.join(dir,`export-${index}.json`);await writeFile(file,JSON.stringify(config),{mode:0o600});
    process.env.PRIZM_FLEET_EXPORT_CONFIG=file;
    const service=collectorExportFromEnvironment(()=>source(index),()=>matches)!;services.push(service);await service.ready;
    assert.equal((await get(index)).status,200);
    assert.equal(JSON.parse((await get(index)).body).siteId,config.identity.siteId);
  }
  const baseline=reads;
  await Promise.all(Array.from({length:8},()=>get(0)));
  assert.equal(reads,baseline,'Browser/collector requests do not acquire telemetry');
  assert.equal((await get(0,undefined,{headers:{Authorization:'Bearer '+configs[1].token}})).status,401);
  assert.equal((await get(0,undefined,{headers:{Host:'wrong.example'}})).status,403);
  for(const route of ['/','/api/ems/control','/api/fleet/site-summary?refresh=1','/api/fleet/site-summary/','/api/fleet/site-summary/extra','/api/fleet/summary'])assert.equal((await get(0,route)).status,403,route);
  for(const method of ['POST','PUT','DELETE','HEAD','OPTIONS'])assert.equal((await get(0,undefined,{method})).status,403,method);
  await assert.rejects(get(0,undefined,{ca:null}),/self.signed|certificate/i);
  await assert.rejects(get(0,undefined,{servername:'wrong.example'}),/altname|hostname|certificate/i);
  matches=false;assert.equal((await get(0)).status,503);matches=true;
  // Real default fetch transport: child trusts only this temporary extra CA.
  const pollerUrl=new URL('./CollectorPoller.ts',import.meta.url).href;
  const child=await run(process.execPath,['--import','tsx','--input-type=module','-e',
    `const {fetchCollector,parseCollector}=await import(${JSON.stringify(pollerUrl)}); const c=JSON.parse(process.env.FLEET_TLS_TEST_COLLECTORS); const results=await Promise.all(c.map(v=>fetchCollector(parseCollector(v),AbortSignal.timeout(3000)))); if(results[0].siteId!=='site-0'||results[1].siteId!=='site-1')process.exit(1); console.log('Both default-fetch HTTPS collectors verified');`],
    {env:{...process.env,NODE_EXTRA_CA_CERTS:certFile,FLEET_TLS_TEST_COLLECTORS:JSON.stringify(configs.map(c=>({...c.identity,url:c.origin+'/api/fleet/site-summary',token:c.token})))},timeout:10000});
  assert.match(child.stdout,/Both default-fetch HTTPS collectors verified/);
  // The legacy HTTP router cannot expose the TLS enrollment, even with spoofed headers.
  const app=express();app.use('/api/fleet',services[0].router);
  const http=httpServer(app);await new Promise<void>(resolve=>http.listen(0,'127.0.0.1',resolve));
  try {
    const legacyPort=(http.address() as {port:number}).port;
    const response=await fetch(`http://127.0.0.1:${legacyPort}/api/fleet/site-summary`,{headers:{Host:new URL(configs[0].origin).host,'X-Forwarded-Proto':'https',Authorization:'Bearer '+configs[0].token},signal:AbortSignal.timeout(3000)});
    assert.equal(response.status,403);await response.text();
  } finally {http.closeAllConnections();await new Promise<void>(resolve=>http.close(()=>resolve()));}
  await assert.rejects(startCollectorTls(parseCollectorTls(configs[0].tls,configs[0].origin),(_q,r)=>r.end()),/EADDRINUSE/);
  await chmod(keyFile,0o644);
  await assert.rejects(startCollectorTls(parseCollectorTls(configs[0].tls,configs[0].origin),(_q,r)=>r.end()),/private/);
  await chmod(keyFile,0o600);
  const link=path.join(dir,'key-link.pem');await symlink(keyFile,link);
  await assert.rejects(startCollectorTls(parseCollectorTls({...configs[0].tls,keyFile:link},configs[0].origin),(_q,r)=>r.end()));
  for(const service of services)service.stop();
  await assert.rejects(get(0));await assert.rejects(get(1));
  // Cancellation before async config read must never leave a listener behind.
  const cancelled=collectorExportFromEnvironment(()=>source(1),()=>true)!;
  cancelled.stop();await cancelled.ready;await assert.rejects(get(1));
  // A normal stop/restart can bind the same enrolled address again.
  const restarted=collectorExportFromEnvironment(()=>source(1),()=>true)!;
  services.push(restarted);await restarted.ready;assert.equal((await get(1)).status,200);
  restarted.stop();await assert.rejects(get(1));
  // Invalid TLS enrollment fails closed instead of starting an HTTP fallback.
  const invalidFile=path.join(dir,'invalid-export.json');
  await writeFile(invalidFile,JSON.stringify({...configs[1],tls:undefined}),{mode:0o600});
  process.env.PRIZM_FLEET_EXPORT_CONFIG=invalidFile;
  const invalid=collectorExportFromEnvironment(()=>source(1),()=>true)!;
  services.push(invalid);await invalid.ready;await assert.rejects(get(1));
  let invalidStatus=0;
  invalid.router({} as any,{status:(status:number)=>{invalidStatus=status;return {json:()=>{}};}} as any,()=>assert.fail('Must not fall through'));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(invalidStatus,503);
  console.log('Collector TLS: two identities, verified certificates, denied writes, HTTP bypass denial, private keys and shutdown passed');
} finally {
  for(const service of services)service.stop();
  if(originalConfig===undefined)delete process.env.PRIZM_FLEET_EXPORT_CONFIG;
  else process.env.PRIZM_FLEET_EXPORT_CONFIG=originalConfig;
}
