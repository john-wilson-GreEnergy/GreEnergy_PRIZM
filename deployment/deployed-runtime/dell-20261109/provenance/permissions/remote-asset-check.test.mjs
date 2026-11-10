import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir=new URL('./',import.meta.url),m=JSON.parse(fs.readFileSync(new URL('stage/manifest.json',dir))),requests=[];
const sha=b=>createHash('sha256').update(b).digest('hex');
let manifest=m,phase='before',mode='ok';
const source=fs.readFileSync(new URL('stage/deploy.mjs',dir),'utf8');
const start=source.indexOf('function remotePanelAsset('),end=source.indexOf('async function remoteCheck(',start);
assert(start>0&&end>start);
const ctx=vm.createContext({assert,sha,stage:'fixture',json:()=>manifest,remoteAsset:async route=>{
 requests.push(route);assert(!route.includes('undefined'));
 if(route==='/fleet/api/fleet/admin/users')return {status:401,body:''};
 const file=new URL((phase==='before'?'../mobile-admin-deployment-20261105/release/':'release/')+'fleet/'+route.slice(1),dir);
 const body=fs.readFileSync(file,'utf8');
 return {status:mode==='denied'?403:200,body:mode==='corrupt'?body+'corrupt':body};
}});
vm.runInContext(source.slice(start,end)+';globalThis.check=verifyRemoteIoLogikAsset;',ctx);
await ctx.check(false);assert.equal(requests[0],'/assets/mobileadmin05-63052c571936.js');
phase='after';await ctx.check(true);assert(requests.includes('/assets/permissions09-8763fa62ada4.js'));
for(const bad of ['missing','ambiguous','checksum']){
 manifest=structuredClone(m);
 if(bad==='missing')delete manifest.assets.fleet.renamed;
 if(bad==='ambiguous')manifest.assets.fleet.renamed['extra.js']=manifest.assets.fleet.panel;
 if(bad==='checksum')delete manifest.before.fleet['assets/mobileadmin05-63052c571936.js'];
 const count=requests.length;await assert.rejects(()=>ctx.check(false));assert.equal(requests.length,count);
}
manifest=m;phase='before';mode='denied';await assert.rejects(()=>ctx.check(false));
mode='corrupt';await assert.rejects(()=>ctx.check(false));
console.log('PASS actual installer pre/post remote asset checks with exact release bytes; missing/ambiguous metadata, missing checksum, HTTP failure and corrupt assets rejected. No network used.');
