import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {plans,overrideText,removeOwnOverride,verifySummary} from './activateDellSmaRollout.mjs';
assert.deepEqual(plans.map(p=>p.arrays),[[2,3,4,5,6,7,8],[1,2,3,4,5,6,7]]);
assert.equal(plans[0].ns,null);assert.equal(plans[1].ns,'prizm-ss4');
const now=Date.now();
function summary(p){return {schema:'prizm-site-summary-v1',siteId:p.id,stationCode:p.station,stale:false,observedAt:new Date(now).toISOString(),metrics:{strings:{value:320}},details:{arrays:Array(8).fill({}),pcs:Array.from({length:8},(_,i)=>({array:i+1,...Object.fromEntries(['status','acContactor','dc1','dc2','dc3','insulationKohm','maxIgbtF'].map(k=>[k,{source:'SMA stream',quality:'live',value:1,observedAt:new Date(now-1000).toISOString()}]))}))}};}
for(const p of plans){
  assert(p.directory.endsWith('sma-stream-20261015-installer'));
  assert(p.override.endsWith('zzzzzzzz-sma-installer-20261015.conf'));
  assert.equal(overrideText(p).split('\n').filter(l=>l.startsWith('Environment=')).length,3);
  assert(!/ExecStart|NetworkNamespace|Password|password/.test(overrideText(p)));
  assert.equal(verifySummary(summary(p),p,true,now).pcs.length,7);
  for(const alter of [d=>d.siteId='wrong',d=>d.stale=true,d=>d.observedAt=new Date(now-120000).toISOString(),d=>d.details.pcs.pop(),d=>d.details.pcs[p.arrays[0]-1].status.source='SMA HTTP',d=>d.details.pcs[p.arrays[0]-1].dc1.quality='stale',d=>d.details.pcs[p.arrays[0]-1].maxIgbtF.value=null,d=>d.details.pcs[p.arrays[0]-1].insulationKohm.observedAt=new Date(now-40000).toISOString()]){
    const d=summary(p);alter(d);assert.throws(()=>verifySummary(d,p,true,now));
  }
  const deferred=summary(p);deferred.details.pcs[p.site==='SS3'?0:7].status={source:'EMS',quality:'unknown',value:null};
  assert.equal(verifySummary(deferred,p,true,now).pcs.length,7);
}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'prizm-mqtt-rollback-'));
try{
  const file=path.join(temp,'override.conf'),text=overrideText(plans[0]);
  removeOwnOverride(file,text);fs.writeFileSync(file,'foreign');
  assert.throws(()=>removeOwnOverride(file,text));assert.equal(fs.readFileSync(file,'utf8'),'foreign');
  fs.writeFileSync(file,text);removeOwnOverride(file,text);assert(!fs.existsSync(file));
  const target=path.join(temp,'target');fs.writeFileSync(target,text);fs.symlinkSync(target,file);
  assert.throws(()=>removeOwnOverride(file,text));assert(fs.existsSync(target));
}finally{fs.rmSync(temp,{recursive:true});}
console.log('PASS activation scope, site identity, canonical stream freshness, deferred units, and exact-file rollback guards');
