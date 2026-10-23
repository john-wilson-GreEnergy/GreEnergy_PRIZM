// Loopback-only test: no equipment adapters or real credentials.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {gzipSync,gunzipSync} from 'node:zlib';
import express from 'express';
import {workspaceForwarder} from './workspaceGateway';
const dir=fs.mkdtempSync('/tmp/prizm-transport-test-');
fs.writeFileSync(dir+'/cert.conf','[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ext\n[dn]\nCN=127.0.0.1\n[ext]\nsubjectAltName=IP:127.0.0.1\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\n');
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',dir+'/key','-out',dir+'/cert','-config',dir+'/cert.conf'],{stdio:'ignore'});
const cert=fs.readFileSync(dir+'/cert'),key=fs.readFileSync(dir+'/key');
const listen=(s:http.Server)=>new Promise<number>(r=>s.listen(0,'127.0.0.1',()=>r((s.address() as {port:number}).port)));
const requests:http.ClientRequest[]=[],servers:http.Server[]=[];
const payload=JSON.stringify({strings:Array.from({length:320},(_,i)=>({id:i,soc:0,stale:false,alarm:'retained'}))});
let seen=0;
try {
 for(const site of ['SS3','SS4']) {
  const faultRequests=new Map<string,number>();
  const sockets=new Map<string,unknown>();
  let revokeDuringReset=()=>{};
  const upstream=https.createServer({key,cert},(req,res)=>{
   seen++;assert.equal(req.headers.cookie,undefined);assert.equal(req.headers.authorization,'Bearer '+'t'.repeat(43));
   sockets.set(req.url!,req.socket);
   if(req.url?.includes('reset-once')){
    const n=(faultRequests.get(req.url)||0)+1;faultRequests.set(req.url,n);
    if(n===1){if(req.url.includes('revoke'))revokeDuringReset();req.socket.destroy();return;}
   }
   if(req.url?.includes('reset-always')){faultRequests.set(req.url,(faultRequests.get(req.url)||0)+1);req.socket.destroy();return;}
   if(req.url?.includes('strings-stream')){res.writeHead(200,{'Content-Type':'text/event-stream'});res.write('event: ready\ndata: {}\n\n');return;}
   if(req.url?.includes('redirect')){res.writeHead(302,{Location:'https://example.invalid'});res.end();return;}
   res.setHeader('ETag','W/"fixture"');res.setHeader('Vary','Accept-Encoding');res.setHeader('Content-Type','application/json');res.setHeader('Set-Cookie','never=forward');
   if(req.headers['if-none-match']==='W/"fixture"'){res.statusCode=304;res.end();return;}
   const compressed=req.headers['accept-encoding']==='gzip';
   const bytes=compressed?gzipSync(payload):Buffer.from(payload);
   if(compressed)res.setHeader('Content-Encoding','gzip');
   res.setHeader('Content-Length',bytes.length);
   if(req.url?.includes('slow-active')){setTimeout(()=>res.end(bytes),1200);return;}
   res.end(bytes);
  });servers.push(upstream);const port=await listen(upstream);
  for(const optimized of [true,false]) {
   process.env.PRIZM_WORKSPACE_TRANSPORT=String(optimized);
   const forward=workspaceForwarder({url:'https://127.0.0.1:'+port} as any,{token:'t'.repeat(43)} as any,cert);
   delete process.env.PRIZM_WORKSPACE_TRANSPORT;
   let revoked=false;
   revokeDuringReset=()=>{revoked=true;};
   const app=express();app.use((req,res)=>{void forward(req,res,async()=>{if(revoked)throw Error('Revoked');}).catch(e=>res.status(e.status||500).end());});
   const front=http.createServer(app);servers.push(front);const fp=await listen(front);
   const read=(url:string,headers:Record<string,string>={},method='GET')=>new Promise<{status:number;headers:http.IncomingHttpHeaders;body:Buffer}>((resolve,reject)=>{
    const r=http.request({host:'127.0.0.1',port:fp,path:url,method,headers:{Cookie:'must-not-forward',...headers}},res=>{const chunks:Buffer[]=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode!,headers:res.headers,body:Buffer.concat(chunks)}));res.on('error',reject);});
    requests.push(r);r.setTimeout(3000,()=>r.destroy(Error('Snapshot starved')));r.on('error',reject);
    r.end();
   });
   const result=await read('/api/local/site-data/snapshot',{'accept-encoding':'gzip'});
   assert.equal(result.status,200);assert.equal(result.headers['set-cookie'],undefined);
   assert.equal(result.headers['content-encoding'],optimized?'gzip':undefined);
   assert.equal((optimized?gunzipSync(result.body):result.body).toString(),payload);
   const unchanged=await read('/api/local/site-data/snapshot',{'if-none-match':'W/"fixture"'});
   assert.equal(unchanged.status,optimized?304:200);if(optimized)assert.equal(unchanged.body.length,0);
   assert.equal((await read('/api/local/redirect')).status,502);
   if(optimized){
    await read('/api/local/system/boot-status?first');
    await read('/api/local/system/boot-status?second');
    const firstSocket=sockets.get('/api/fleet/workspace/api/local/system/boot-status?first');
    assert.equal(sockets.get('/api/fleet/workspace/api/local/system/boot-status?second'),firstSocket,'Completed reads reuse a healthy socket');
    await read('/api/local/system/boot-status?slow-active');
    assert.equal(sockets.get('/api/fleet/workspace/api/local/system/boot-status?slow-active'),firstSocket,'Idle timer must not close a reused active connection');
    await new Promise(r=>setTimeout(r,1150));
    await read('/api/local/system/boot-status?after-idle');
    assert.notEqual(sockets.get('/api/fleet/workspace/api/local/system/boot-status?after-idle'),firstSocket,'Old idle sockets are retired');
    for(const route of ['/api/local/system/boot-status','/api/local/capabilities']){
     await read('/api/local/site-data/snapshot');
     const retry=route+'?test=reset-once';assert.equal((await read(retry)).status,200);
     assert.equal(faultRequests.get('/api/fleet/workspace'+retry),2,'Startup cache read recovers once');
    }
    await read('/api/local/site-data/snapshot');
    const unsafe='/tools/controls/fixture?test=reset-always';assert.equal((await read(unsafe)).status,502);
    assert.equal(faultRequests.get('/api/fleet/workspace'+unsafe),1,'Unlisted GET is not retried');
    const fresh='/api/local/capabilities?test=reset-once-fresh';
    assert.equal((await read(fresh)).status,502,'Fresh connection errors are not replayed');
    assert.equal(faultRequests.get('/api/fleet/workspace'+fresh),1);
    await read('/api/local/site-data/snapshot');
    const post='/api/local/capabilities?test=reset-always-post';
    assert.equal((await read(post,{},'POST')).status,502);
    assert.equal(faultRequests.get('/api/fleet/workspace'+post),1,'POST is never retried, even on a read-only path');
    await read('/api/local/site-data/snapshot');
    const revokedRead='/api/local/capabilities?test=reset-once-revoke';
    assert.equal((await read(revokedRead)).status,401);
    assert.equal(faultRequests.get('/api/fleet/workspace'+revokedRead),1,'Revocation stops retry before dispatch');revoked=false;
    await read('/api/local/site-data/snapshot'); // Prime the keep-alive socket.
    const reset='/api/local/site-data/snapshot?test=reset-once';
    assert.equal((await read(reset)).status,200,'One stale reused socket read is retried');
    assert.equal(faultRequests.get('/api/fleet/workspace'+reset),2);
    await read('/api/local/site-data/snapshot');
    const repoll='/api/local/site-data/snapshot?refresh=true&test=reset-always';
    assert.equal((await read(repoll)).status,502,'Explicit repoll is never retried');
    assert.equal(faultRequests.get('/api/fleet/workspace'+repoll),1);
    await read('/api/local/site-data/snapshot');
    const broken='/api/local/site-data/snapshot?test=reset-always';
    assert.equal((await read(broken)).status,502,'Persistent failure remains visible');
    assert.equal(faultRequests.get('/api/fleet/workspace'+broken),2,'Retry is strictly bounded');
    // Eight active streams previously consumed all ordinary upstream sockets.
    const streams: http.IncomingMessage[]=[];
    await Promise.all(Array.from({length:8},()=>new Promise<void>((resolve,reject)=>{
     const r=http.get({host:'127.0.0.1',port:fp,path:'/api/local/site-data/strings-stream?shape=list-v2',headers:{Accept:'text/event-stream'}},res=>{streams.push(res);res.once('data',()=>resolve());res.resume();});requests.push(r);r.on('error',reject);
    })));
    assert.equal((await read('/api/local/site-data/strings-stream?shape=list-v2')).status,503,'Bound stream capacity without starving normal reads');
    const start=performance.now();assert.equal((await read('/api/local/site-data/snapshot',{'accept-encoding':'gzip'})).status,200);assert(performance.now()-start<2000);
    revoked=true;assert.equal((await read('/api/local/site-data/snapshot')).status,401);
    await Promise.all(streams.map(s=>new Promise<void>(r=>{s.once('close',r);s.destroy();})));
   }
   console.log('PASS '+site+' transport '+(optimized?'optimized':'rollback')+': compression, conditional reads, redirect rejection, streaming capacity and authorization');
  }
 }
 assert(seen>0);
}finally{delete process.env.PRIZM_WORKSPACE_TRANSPORT;for(const r of requests)r.destroy();for(const s of servers){s.closeAllConnections();await new Promise<void>(r=>s.close(()=>r()));}}
