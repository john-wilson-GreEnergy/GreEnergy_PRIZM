import assert from 'node:assert/strict';
import {readContactorReview,submitContactor,readAccessSession} from './accessClient';
import type {ContactorIntent} from '../core/security/contactorAccessModel';
const originalFetch=globalThis.fetch,originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{protocol:'http:',hostname:'127.0.0.1'},setTimeout,clearTimeout}});
const intent:ContactorIntent={commandId:'fixture-command-1234',action:'open',array:1,string:2,reason:'Maintenance',confirmed:true,topologyRevision:'fixture'};
const result={success:true,acceptedCount:1,verifiedCount:1,mismatchCount:0,unknownCount:0,results:[{target:{array:1,string:2},action:'open',accepted:true,readbackConfirmed:true,status:'Verified'}]};
let calls=0,body:unknown=result;
try {
  globalThis.fetch=async(url,init)=>{
    calls++;assert.equal(url,'/api/access/controls/contactors');assert.equal(init?.method,'POST');assert.equal(init?.credentials,'same-origin');assert.equal(init?.redirect,'error');
    assert.equal((init?.headers as Record<string,string>)['X-Prizm-Csrf'],'fixture-csrf');assert.deepEqual(JSON.parse(String(init?.body)),intent);
    return Response.json(body);
  };
  assert.equal((await submitContactor(intent,'fixture-csrf',new AbortController().signal)).success,true);
  for(const changed of [{...result,success:false},{...result,results:[]},{...result,results:[{...result.results[0],target:{array:2,string:2}}]},
    {...result,results:[{...result.results[0],readbackConfirmed:undefined}]},{...result,unknownCount:1}]) {
    body=changed;await assert.rejects(submitContactor(intent,'fixture-csrf',new AbortController().signal),/could not be verified/);
  }
  const before=calls;
  globalThis.fetch=async()=>{calls++;throw new Error('Connection lost after send');};
  await assert.rejects(submitContactor(intent,'fixture-csrf',new AbortController().signal));assert.equal(calls,before+1,'Transport failure never retries');
  globalThis.fetch=async(url,init)=>{assert.equal(url,'/api/access/controls/contactors/1/2');assert.equal(init?.method,'GET');return Response.json({array:1,string:2,validUntil:Date.now()+10000,topologyRevision:'fixture'});};
  assert.equal((await readContactorReview(1,2,new AbortController().signal)).string,2);
  globalThis.fetch=async()=>Response.json({error:'private server detail'},{status:409});
  await assert.rejects(readContactorReview(1,2,new AbortController().signal),/saved command needs reconciliation/);
  await assert.rejects(submitContactor(intent,'fixture-csrf',new AbortController().signal),/signing in again does not clear saved commands/);
  globalThis.fetch=async()=>Response.json({email:'fixture@example.test',csrf:'x'.repeat(43),expiresAt:100000,idleExpiresAt:10000,mode:'restricted-pilot',controls:{singleStringContactors:'true'}});
  assert.equal((await readAccessSession())?.singleStringContactors,false,'Only explicit server boolean enables UI');
  console.log('Contactor client: exact endpoint/CSRF, reviewed target binding, response validation, fail-closed availability and no retries passed.');
} finally {
  globalThis.fetch=originalFetch;
  if(originalWindow) Object.defineProperty(globalThis,'window',originalWindow);else Reflect.deleteProperty(globalThis,'window');
}
