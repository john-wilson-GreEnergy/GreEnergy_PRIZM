import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ContactorWorkflow} from './ContactorWorkflow';
import {ContactorPanel} from './ContactorPanel';
import type {ContactorReceipt,ContactorReview} from '../core/security/contactorAccessModel';
const target={array:1,string:2};
const success:ContactorReceipt={success:true,acceptedCount:1,verifiedCount:1,mismatchCount:0,unknownCount:0,results:[{target,action:'open',accepted:true,readbackConfirmed:true,status:'Verified'}]};
function fixture() {
  let now=1000, fresh=true, sends=0, reads=0;
  let resolve!:(r:ContactorReceipt)=>void, reject!:(e:Error)=>void;
  const flow=new ContactorWorkflow({fresh:()=>fresh,id:()=>`fixture-command-${sends}`,review:async()=>{reads++;return {...target,topologyRevision:'revision',validUntil:now+10000};},
    submit:async intent=>{sends++;assert.equal(intent.topologyRevision,'revision');assert.equal(intent.confirmed,true);return new Promise((res,rej)=>{resolve=res;reject=rej;});}},()=>now);
  return {flow,get sends(){return sends;},get reads(){return reads;},stale:()=>{fresh=false;},expire:()=>{now+=10001;},resolve:(r:ContactorReceipt)=>resolve(r),reject:()=>reject(new Error('Transport timeout'))};
}
{
  const f=fixture();await f.flow.open(target);assert.equal(f.reads,1);assert.equal(f.sends,0);assert.equal(f.flow.canSend(),false);
  f.flow.choose('open');assert(f.flow.canSend());f.flow.reason('forged');assert.equal(f.flow.getSnapshot().reason,'Maintenance');
  const pending=f.flow.confirm();await f.flow.confirm();assert.equal(f.sends,1,'Double-click sends once');
  f.flow.close();assert.equal(f.flow.getSnapshot().phase,'sending');await f.flow.open({array:2,string:1});assert.equal(f.reads,1);
  f.resolve(success);await pending;assert.equal(f.flow.getSnapshot().phase,'result');f.flow.close();assert.equal(f.sends,1);
  await f.flow.open(target);assert.equal(f.flow.getSnapshot().phase,'review');f.flow.stop();
}
for(const mode of ['stale','expired'] as const) {
  const f=fixture();await f.flow.open(target);f.flow.choose('close');if(mode==='stale') f.stale();else f.expire();
  assert.equal(f.flow.canSend(),false);await f.flow.confirm();assert.equal(f.sends,0);f.flow.stop();
}
for(const mode of ['uncertain','unverified'] as const) {
  const f=fixture();await f.flow.open(target);f.flow.choose('open');const pending=f.flow.confirm();
  if(mode==='uncertain') f.reject();else f.resolve({...success,success:false,verifiedCount:0,unknownCount:1,results:[{...success.results[0],readbackConfirmed:null}]});
  await pending;f.flow.close();await f.flow.open(target);assert.equal(f.flow.getSnapshot().phase,'unknown');await f.flow.confirm();assert.equal(f.sends,1);f.flow.stop();
}
{
  const f=fixture();await f.flow.open(target);f.flow.choose('open');const pending=f.flow.confirm();f.flow.stop();f.resolve(success);await pending;
  assert.equal(f.flow.getSnapshot().phase,'closed','Late result cannot repopulate a signed-out workspace');
}
{
  let resolve!:(r:ContactorReview)=>void;
  const flow=new ContactorWorkflow({fresh:()=>true,id:()=>'',review:()=>new Promise(res=>{resolve=res;}),submit:async()=>{throw new Error('No dispatch');}});
  const opening=flow.open(target);flow.close();resolve({...target,topologyRevision:'revision',validUntil:Date.now()+10000});await opening;assert.equal(flow.getSnapshot().phase,'closed');flow.stop();
}
{
  const f=fixture();await f.flow.open(target);f.flow.choose('close');
  const html=renderToStaticMarkup(<ContactorPanel view={f.flow.getSnapshot()} site="Fixture site" canSend={true} fresh={true} onAction={()=>{}} onReason={()=>{}} onConfirm={()=>{}} onRefresh={()=>{}} onClose={()=>{}}/>);
  assert.match(html,/Array 1 \/ String 2/);assert.match(html,/Send CLOSE/);assert.match(html,/Electrical protections remain enabled/);assert.match(html,/type="radio"/);assert.doesNotMatch(html,/type="text"|type="password"/);f.flow.stop();
}
console.log('Contactor UI: review-only opening, explicit confirmation, expiry/staleness, duplicate clicks, uncertain-result lockout and late-response isolation passed.');
