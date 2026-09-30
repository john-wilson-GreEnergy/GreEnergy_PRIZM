import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {CommandRecovery} from './commandRecovery';
import {ContactorReceipts} from './contactorReceipts';
import type {VerifiedPrincipal} from '../../core/security/controlPolicyPrototype';
import {recoveryObservation} from './readOnlyTelemetryService';
import {applyCanonicalStringSnapshot} from '../normalizers/canonicalStringSnapshot';
const now=Date.now(),scope={siteId:'fixture',blockId:'1'},id='fixture-recovery-command';
const reservation={...scope,subject:'alice',sessionId:'old-session',commandId:id,array:1,string:2,action:'open' as const,reason:'Fixture',topologyRevision:'revision'};
const principal:VerifiedPrincipal={subject:'alice',sessionId:'new-session',state:'active',issuedAt:now-1000,expiresAt:now+60000,
  grants:['history.view','telemetry.view','controls.contactors'].map(capability=>({capability:capability as 'history.view'|'telemetry.view'|'controls.contactors',...scope,scope:{kind:'block'}}))};
async function fixture() {
  const file=(await mkdtemp('/tmp/prizm-recovery-'))+'/ledger.json';await writeFile(file,JSON.stringify({version:1,entries:[]}),{mode:0o600});
  const receipts=new ContactorReceipts(file,()=>now);await receipts.reserve(reservation);
  let actor=principal,at=now,actual:'open'|'closed'='open',site=scope,revision='revision',audits=0;
  let onAudit=()=>{};
  const service=new CommandRecovery({receipts,scope:()=>site,context:async()=>({...site,topologyRevision:revision,validUntil:now+60000,targets:[{id:'array:1:string:2',kind:'string'}]}),
    observe:async()=>({actual,requested:'open',capturedAt:at}),audit:async()=>{audits++;onAudit();}},()=>now);
  const auth=async()=>actor;
  return {service,receipts,auth,get audits(){return audits;},setActor:(p:VerifiedPrincipal)=>{actor=p;},stale:()=>{at=now-20000;},different:()=>{actual='closed';},siteChange:()=>{site={...scope,siteId:'other'};},topologyChange:()=>{revision='other';},onAudit:(fn:()=>void)=>{onAudit=fn;}};
}
const intent=(review:Awaited<ReturnType<CommandRecovery['review']>>)=>({commandId:id,expectedUpdatedAt:review.command.updatedAt,observation:review.observation,reason:'site-checked',confirmed:true});
{
  const f=await fixture();const list=await f.service.list(f.auth);assert.equal(list.length,1);assert(!JSON.stringify(list).includes('old-session'));assert(!JSON.stringify(list).includes('alice'));
  const review=await f.service.review(id,f.auth);assert.equal(review.observation.actual,'open');
  assert.deepEqual(await f.service.record(intent(review),f.auth),{recorded:true,targetReleased:false});
  const saved=await f.receipts.readOwned('alice',scope,id);assert.equal(saved.reviews?.length,1);assert.equal(saved.state,'reserved');assert.equal(saved.result,null);
  await assert.rejects(f.receipts.assertTargetClear(reservation),/reconciliation/);
  await assert.rejects(f.service.record(intent(review),f.auth),/changed/);assert.equal(f.audits,1,'Duplicate save must not append another review');
}
for(const scenario of ['owner','history','telemetry','target','stale','topology'] as const) {
  const f=await fixture();
  if(scenario==='owner') f.setActor({...principal,subject:'bob'});
  if(scenario==='history') f.setActor({...principal,grants:principal.grants.filter(g=>g.capability!=='history.view')});
  if(scenario==='telemetry') f.setActor({...principal,grants:principal.grants.filter(g=>g.capability!=='telemetry.view')});
  if(scenario==='target') f.setActor({...principal,grants:principal.grants.filter(g=>g.capability!=='controls.contactors')});
  if(scenario==='stale') f.stale();if(scenario==='topology') f.topologyChange();
  await assert.rejects(f.service.review(id,f.auth),undefined,scenario);
}
for(const scenario of ['feedback','revoke','site','audit','forged'] as const) {
  const f=await fixture(),body=intent(await f.service.review(id,f.auth));
  if(scenario==='feedback') f.different();
  if(scenario==='revoke') f.onAudit(()=>f.setActor({...principal,state:'revoked'}));
  if(scenario==='site') f.onAudit(()=>f.siteChange());
  if(scenario==='audit') f.onAudit(()=>{throw new Error('Audit failed');});
  await assert.rejects(f.service.record(scenario==='forged'?{...body,targetReleased:true}:body,f.auth));
  assert.equal((await f.receipts.readOwned('alice',scope,id)).reviews,undefined);
}
{
  const enrollment={profileId:'f',stationCode:'TEST',blockIndex:1,emsBaseUrl:'http://fixture.invalid/turtle'};
  const feedback={arrayNumber:1,stringNumber:2,actualState:'open',requestedState:'open',positiveContactorClosed:false,negativeContactorClosed:false,quality:'live',fetchedAt:new Date(now).toISOString()};
  const source=(contactor:unknown)=>({cycleId:1,siteIdentity:{activeProfileId:'f',stationCode:'TEST',blockIndex:1,emsBaseUrl:enrollment.emsBaseUrl},liveStatus:{state:'LIVE',stale:false,lastUpdated:new Date(now).toISOString()},normalized:{strings:[{arrayIndex:1,stringIndex:2,connectionState:'ONLINE',contactor}],correctiveActions:[]}});
  assert.equal(recoveryObservation(source(feedback),enrollment,1,2,now).actual,'open');
  for(const changed of [undefined,{...feedback,actualState:'closed'},{...feedback,negativeContactorClosed:true},{...feedback,quality:'failed'},{...feedback,stringNumber:3},{...feedback,fetchedAt:new Date(now-16000).toISOString()}]) assert.throws(()=>recoveryObservation(source(changed),enrollment,1,2,now));
  assert.throws(()=>recoveryObservation(source(feedback),{...enrollment,stationCode:'wrong'},1,2,now));
  const flat=source(undefined);
  Object.assign(flat.normalized.strings[0],{positiveContactorClosed:true,negativeContactorClosed:true,contactorState:'CLOSED',
    actualContactorStateSource:'last-call-explicit-polarity',timestampUtc:new Date(now-33000).toISOString(),sourceTimestampUtc:new Date(now).toISOString()});
  assert.throws(()=>recoveryObservation(flat,enrollment,1,2,now),/feedback/,'Observed live shape must fail closed: fresh publication time cannot substitute for older device observation');
  const projected=source(feedback);
  const report={arrayIndex:1,stringIndex:2,timeStamp:String(now-2000),stringData:{positiveContactorClosed:false,negativeContactorClosed:false,contactorsCloseExpected:true}};
  projected.normalized.strings=applyCanonicalStringSnapshot(projected.normalized.strings,{lastCall:{blockReport:{arrayReport:{1:{stringReport:{2:report}}}}}}).strings;
  assert.deepEqual(recoveryObservation(projected,enrollment,1,2,now),{actual:'open',requested:'closed',capturedAt:now-2000});
  const row=projected.normalized.strings[0] as Record<string,unknown>, observation=row.contactorObservation as Record<string,unknown>;
  for(const changed of [null,{}, {...observation,source:'other'}, {...observation,arrayNumber:2}, {...observation,stringNumber:1},
    {...observation,positiveContactorClosed:'false'}, {...observation,negativeContactorClosed:true},
    {...observation,observedAt:new Date(now-15000).toISOString()}, {...observation,observedAt:new Date(now+1).toISOString()},
    {...observation,observedAt:'invalid'}]) {
    row.contactorObservation=changed;
    assert.throws(()=>recoveryObservation(projected,enrollment,1,2,now),/feedback/,'Invalid current observation must not fall back to valid legacy nested feedback');
  }
  row.contactorObservation={...observation,positiveContactorClosed:true,negativeContactorClosed:true,requestedState:'unknown'};
  assert.deepEqual(recoveryObservation(projected,enrollment,1,2,now),{actual:'closed',requested:'unknown',capturedAt:now-2000});
  row.communicating=false;
  assert.throws(()=>recoveryObservation(projected,enrollment,1,2,now),/Fresh target/);
}
console.log('Recovery: owner/site/target authorization, fresh explicit feedback, revocation after audit, no unlock/retry, durable review and duplicate-save protection passed offline.');
