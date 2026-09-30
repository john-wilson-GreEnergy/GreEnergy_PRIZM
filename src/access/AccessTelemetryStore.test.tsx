import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AccessTelemetryStore} from './AccessTelemetryStore';
import {SignInError} from './accessClient';
import {ReadOnlyWorkspaceView} from './ReadOnlyWorkspace';
import type {ReadOnlyTelemetry} from '../core/security/readOnlyTelemetry';
const data: ReadOnlyTelemetry = {site:{name:'Fixture',station:'TEST',block:1},cycle:1,capturedAt:null,ageMs:null,state:'UNKNOWN',stale:true,
  strings:[{array:1,string:2,state:'OPEN',soc:0,voltage:null,current:0,power:null,warnings:1,alarms:null,stale:true}],issues:[],counts:{arrays:1,strings:1,warnings:1,alarms:null}};
const settle = ()=>new Promise<void>(resolve=>setImmediate(resolve));
let calls=0, expired=0;
let fail: Error | null = null;
const store=new AccessTelemetryStore(async()=>{calls++;if(fail)throw fail;return data;},()=>expired++);
try {
  store.start();await settle();assert.equal(calls,1);assert.equal(store.getSnapshot().data,data);
  fail=new SignInError(503,'Unavailable');await store.refresh();
  assert.equal(store.getSnapshot().data,data);assert(store.getSnapshot().stale);
  fail=new SignInError(403,'Denied');await store.refresh();
  assert.equal(store.getSnapshot().data,null);assert(store.getSnapshot().blocked);
  await store.refresh();assert.equal(calls,3);assert.equal(expired,0);
} finally {store.stop();}
const unauthorized=new AccessTelemetryStore(async()=>{throw new SignInError(401,'Expired');},()=>expired++);
unauthorized.start();await settle();assert.equal(expired,1);assert.equal(unauthorized.getSnapshot().data,null);unauthorized.stop();
let resolveLate!: (value: ReadOnlyTelemetry)=>void;
let aborted=false;
const delayed=new AccessTelemetryStore(signal=>new Promise(resolve=>{resolveLate=resolve;signal.addEventListener('abort',()=>aborted=true);}),()=>{});
delayed.start();await delayed.refresh(); // Overlapping requests coalesce; the original remains pending.
delayed.stop();resolveLate(data);await settle();assert(aborted);assert.equal(delayed.getSnapshot().data,null,'Late response after logout must never repopulate');
const hidden=new AccessTelemetryStore(async()=>{throw new Error('Hidden tab must not fetch');},()=>{},()=>false);
hidden.start();await settle();assert.equal(hidden.getSnapshot().data,null);hidden.stop();
const aging=new AccessTelemetryStore(async()=>({...data,stale:false,ageMs:15000}),()=>{});
aging.start();await new Promise(resolve=>setTimeout(resolve,15));assert(aging.getSnapshot().stale,'Freshness deadline must mark cached data stale without waiting for another response');aging.stop();
const html=renderToStaticMarkup(<ReadOnlyWorkspaceView view={{data,error:'',stale:true,loading:false,blocked:false}} email="fixture@example.test" onLogout={()=>{}} busy={false} error=""/>);
assert.match(html,/Read-only pilot/);assert.match(html,/Array 1 \/ String 2/);assert.match(html,/Stale \/ incomplete/);assert.match(html,/0%/);assert.match(html,/—/);
assert.doesNotMatch(html,/Close contactors|Start balancing|Enable app/);
console.log('Access telemetry store: retained stale data, permission loss, expiry, no hidden polling, no overlap and late-response isolation passed.');
