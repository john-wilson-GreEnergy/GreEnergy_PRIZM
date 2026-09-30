import assert from 'node:assert/strict';
import {ContactorAccess, contactorPolicyContext, type ContactorAudit} from './contactorAccess';
import type {VerifiedPrincipal} from '../../core/security/controlPolicyPrototype';
import type {ReadOnlyTelemetry} from '../../core/security/readOnlyTelemetry';
import type {ContactorControlResponse} from '../contactorControlService';
import {AccessError} from './localSessions';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {ContactorReceipts} from './contactorReceipts';

const now=Date.now(), scope={siteId:'fixture',blockId:'1'};
const telemetry: ReadOnlyTelemetry={site:{name:'Fixture',station:'Fixture',block:1},cycle:1,capturedAt:new Date(now).toISOString(),ageMs:0,state:'LIVE',stale:false,
  strings:[1,2].map(string=>({array:1,string,state:'closed',soc:null,voltage:null,current:null,power:null,warnings:0,alarms:0,stale:false})),issues:[],counts:{arrays:1,strings:2,alarms:0,warnings:0}};
const context=contactorPolicyContext(scope,telemetry,now);
assert.equal(context.targets[0].id,'array:1:string:1');
for(const changed of [{state:'PARTIAL' as const},{stale:true},{capturedAt:null},{capturedAt:new Date(now-15000).toISOString()},{capturedAt:new Date(now+1).toISOString()},
  {strings:[]},{strings:[telemetry.strings[0],telemetry.strings[0]]},{strings:[{...telemetry.strings[0],stale:true}]}]) assert.throws(()=>contactorPolicyContext(scope,{...telemetry,...changed},now));
assert.equal(contactorPolicyContext(scope,{...telemetry,cycle:2,strings:[...telemetry.strings].reverse()},now).topologyRevision,context.topologyRevision);
const principal: VerifiedPrincipal={subject:'alice',sessionId:'session1',issuedAt:now-1000,expiresAt:now+3600000,state:'active',grants:[{capability:'controls.contactors',...scope,scope:{kind:'targets',ids:['array:1:string:1']}}]};
const body={commandId:'fixture-command-0001',action:'open',array:1,string:1,confirmed:true,reason:'Offline fixture',topologyRevision:context.topologyRevision};
function fixture(verified=false) {
  const file=mkdtempSync('/tmp/prizm-contactor-access-test-')+'/receipts.json';
  writeFileSync(file,JSON.stringify({version:1,entries:[]}),{mode:0o600});
  const receipts=new ContactorReceipts(file,()=>now);
  let current=structuredClone(principal), currentContext=structuredClone(context), writes=0, executions=0;
  let beforeDispatch=()=>{}, onAudit=(_event:ContactorAudit)=>{}, revoked=false;
  const events: ContactorAudit[]=[];
  const authenticate=async()=>{if(revoked) throw new AccessError(401,'Sign-in required');return current;};
  const adapter=new ContactorAccess({receipts,context:async()=>currentContext,audit:async event=>{events.push(event);onAudit(event);},execute:async(request,guard)=>{
    executions++;beforeDispatch();await guard.beforeDispatch(request.targets[0]);writes++;
    assert.equal(guard.actor,'alice');assert(guard.namespace.includes('session1'));assert.equal(request.ignoreStringDcBusVoltageDeltaLimit,false);
    const result:ContactorControlResponse={success:verified,acceptedCount:1,verifiedCount:verified?1:0,mismatchCount:0,unknownCount:verified?0:1,results:[{
      target:request.targets[0],action:request.action,phoenixUrl:'http://private-device.invalid',accepted:true,responseStatus:200,responseText:'secret response',readbackConfirmed:verified?true:null,readbackStatus:'raw private telemetry',error:null}]};
    return result;
  }},()=>now);
  return {adapter,authenticate,events,get writes(){return writes;},get executions(){return executions;},setPrincipal:(p:VerifiedPrincipal)=>{current=p;},
    setContext:(c:typeof context)=>{currentContext=c;},before:(f:()=>void)=>{beforeDispatch=f;},audit:(f:typeof onAudit)=>{onAudit=f;},revoke:()=>{revoked=true;}};
}
for(const changed of [{actor:'admin'},{role:'admin'},{targets:[{array:1,allStrings:true}]},{emsHost:'evil.invalid'},{ignoreStringDcBusVoltageDeltaLimit:true},
  {confirmed:false},{action:['open']},{array:'1'},{string:0},{reason:''},{commandId:'short'},{topologyRevision:undefined},{topologyRevision:'changed'}]) {
  const f=fixture();await assert.rejects(f.adapter.submit({...body,...changed},f.authenticate));assert.equal(f.executions,0);
}
for(const change of [(p:VerifiedPrincipal)=>({...p,grants:[]}), (p:VerifiedPrincipal)=>({...p,state:'revoked' as const}),
  (p:VerifiedPrincipal)=>({...p,expiresAt:now}), (p:VerifiedPrincipal)=>({...p,grants:p.grants.map(g=>({...g,siteId:'other'}))})]) {
  const f=fixture();f.setPrincipal(change(principal));await assert.rejects(f.adapter.submit(body,f.authenticate));assert.equal(f.executions,0);
}
{
  const f=fixture();await assert.rejects(f.adapter.submit({...body,string:2},f.authenticate));assert.equal(f.executions,0);
  assert.equal((await f.adapter.review(1,1,f.authenticate)).topologyRevision,context.topologyRevision);
  await assert.rejects(f.adapter.review(1,2,f.authenticate));assert.equal(f.executions,0,'Review never dispatches');
}
{
  const f=fixture();const [first,second]=await Promise.all([f.adapter.submit(body,f.authenticate),f.adapter.submit(body,f.authenticate)]);
  assert.deepEqual(first,second);assert.equal(f.writes,1);assert.equal(f.executions,1);assert.equal(first.success,false);assert.equal(first.results[0].readbackConfirmed,null);
  assert(!JSON.stringify(first).includes('private'));assert(!JSON.stringify(first).includes('secret'));
  await assert.rejects(f.adapter.submit({...body,action:'close'},f.authenticate),/already used/);assert.equal(f.writes,1);
  f.setPrincipal({...principal,sessionId:'other-session'});await assert.rejects(f.adapter.submit(body,f.authenticate),/already used/);assert.equal(f.writes,1);
}
for(const scenario of ['revoke','topology','site','stale','audit'] as const) {
  const f=fixture();
  f.audit(event=>{if(event.outcome!=='dispatch-authorized') return;
    if(scenario==='revoke') f.revoke();
    if(scenario==='topology') f.setContext({...context,topologyRevision:'changed'});
    if(scenario==='site') f.setContext({...context,siteId:'other'});
    if(scenario==='stale') f.setContext({...context,validUntil:now});
    if(scenario==='audit') throw new Error('Audit unavailable');
  });
  await assert.rejects(f.adapter.submit(body,f.authenticate));assert.equal(f.writes,0,scenario);
}
{
  const f=fixture();f.audit(()=>{throw new Error('Audit unavailable');});
  await assert.rejects(f.adapter.submit(body,f.authenticate));await assert.rejects(f.adapter.submit(body,f.authenticate));assert.equal(f.executions,0);
}
{
  const f=fixture();f.audit(event=>{if(event.outcome==='accepted-not-fully-verified') throw new Error('Disk full after dispatch');});
  await assert.rejects(f.adapter.submit(body,f.authenticate),/reconcile/);
  await assert.rejects(f.adapter.submit(body,f.authenticate),/reconcile/);assert.equal(f.writes,1,'Unknown outcome must not cause redispatch');
}
{
  const f=fixture();f.audit(event=>{if(event.outcome==='accepted-not-fully-verified') f.revoke();});
  await assert.rejects(f.adapter.submit(body,f.authenticate));assert.equal(f.writes,1,'Revocation cannot undo an already dispatched command');
}
{
  const f=fixture(true);
  for(let index=0;index<128;index++) await f.adapter.submit({...body,commandId:`capacity-fixture-${index}`},f.authenticate);
  await assert.rejects(f.adapter.submit({...body,commandId:'capacity-fixture-overflow'},f.authenticate),/capacity/);
  await f.adapter.submit({...body,commandId:'capacity-fixture-0'},f.authenticate);
  assert.equal(f.writes,128,'Capacity cannot evict a receipt and silently resend its command');
}
console.log('Contactor access: strict intent, target grants, freshness, reauthorization, audit, deduplication and sanitized outcomes passed offline');
