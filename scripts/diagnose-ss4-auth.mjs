/** Read-only authenticated Solar Star 4 collector probe. Never prints credentials. */
import fs from 'node:fs';
import https from 'node:https';
import assert from 'node:assert/strict';

assert.equal(process.getuid(),0,'Run with sudo');
const config=JSON.parse(fs.readFileSync('/etc/prizm-fleet/fleet/fleet.json','utf8'));
const collector=config.collectors.find(value=>value.siteId==='solar-star-4');
assert(collector,'Solar Star 4 collector is absent from Fleet configuration');
const target=new URL(collector.url);
const ca=fs.readFileSync('/etc/prizm-fleet/fleet/ca-cert.pem');
const result=await new Promise((resolve,reject)=>{
  const request=https.request({hostname:target.hostname,port:target.port,path:target.pathname,method:'GET',ca,
    headers:{authorization:`Bearer ${collector.token}`,accept:'application/json'},timeout:15000},response=>{
      let body='';response.setEncoding('utf8');response.on('data',chunk=>{if(body.length<8000)body+=chunk;});
      response.on('end',()=>resolve({status:response.statusCode,contentType:response.headers['content-type']??null,body:body.slice(0,8000)}));
    });
  request.on('timeout',()=>request.destroy(Error('15-second deadline exceeded')));request.on('error',reject);request.end();
});
console.log(JSON.stringify({at:new Date().toISOString(),siteId:collector.siteId,url:`${target.protocol}//${target.host}${target.pathname}`,result},null,2));
