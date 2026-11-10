/** Read-only comparison of SS4 export enrollment and canonical local views. */
import fs from 'node:fs';
import assert from 'node:assert/strict';

assert.equal(process.getuid(),0,'Run with sudo');
const exportConfig=JSON.parse(fs.readFileSync('/etc/prizm-fleet/ss4/export.json','utf8'));
const get=async path=>{
  try{
    const response=await fetch('http://127.0.0.1:3000'+path,{signal:AbortSignal.timeout(15000)});
    const text=await response.text();
    return {status:response.status,body:response.headers.get('content-type')?.includes('json')?JSON.parse(text):text.slice(0,500)};
  }catch(error){return {error:error instanceof Error?error.message:String(error)};}
};
const [status,block,pcs]=await Promise.all([
  get('/api/local/site-data/status'),get('/api/local/site-data/block-summary'),get('/api/local/site-data/pcs')
]);
const blockBody=block.body&&typeof block.body==='object'?block.body:{};
const pcsBody=pcs.body&&typeof pcs.body==='object'?pcs.body:{};
console.log(JSON.stringify({
  at:new Date().toISOString(),
  enrollment:exportConfig.identity,
  status:{http:status.status,error:status.error,siteIdentity:status.body?.siteIdentity,cache:status.body?.cache},
  block:{http:block.status,error:block.error,siteIdentity:blockBody.siteIdentity,liveStatus:blockBody.liveStatus,
    modbusTelemetry:blockBody.modbusTelemetry,pcsSummary:blockBody.pcsSummary},
  pcs:{http:pcs.status,error:pcs.error,siteIdentity:pcsBody.siteIdentity,cache:pcsBody.cache,count:Array.isArray(pcsBody.pcs)?pcsBody.pcs.length:null,
    modbusTelemetry:pcsBody.modbusTelemetry}
},null,2));
