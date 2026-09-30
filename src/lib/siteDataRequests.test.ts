import assert from 'node:assert/strict';
import {test} from 'node:test';
import {SiteDataRequests} from './siteDataRequests';
import {SelectedStore} from './selectedStore';

function deferred<T>() {let resolve!:(value:T)=>void;let reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const json=(value:unknown,etag='revision-1')=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json',etag}});

test('telemetry resolves while topology is held; topology failure stays isolated and retries',async()=>{
  const topology=deferred<Response>();let calls=0;
  const loader=new SiteDataRequests(async input=>{
    if(String(input).includes('topology')){calls++;return calls===1?topology.promise:json({success:true,profile:{id:'site'}});}
    return json({normalized:{},rollups:{}});
  });
  let coupledReady=false;
  const t=loader.topology(),s=loader.snapshot('overview');
  assert.equal(loader.topology(),t,'one topology request even during concurrent polls');
  const coupled=Promise.all([s,t]).then(()=>{coupledReady=true;});
  assert.ok(await s);
  assert.equal(coupledReady,false,'legacy coupled loading still waits, independent telemetry is available');
  topology.reject(new Error('topology offline'));
  assert.match((await t)!.error!.message,/offline/);
  await coupled;
  assert.deepEqual((await loader.topology())?.profile,{id:'site'});
  assert.equal(await loader.topology(),null,'successful topology is cached until explicit refresh');
});

test('view changes supersede delayed replies and ETags are scoped to accepted shape/view',async()=>{
  const late=deferred<Response>();const seen:{url:string;etag:string|null}[]=[];
  const loader=new SiteDataRequests(async(input,init)=>{
    const url=String(input);const etag=new Headers(init?.headers).get('If-None-Match');seen.push({url,etag});
    if(url.includes('overview'))return late.promise;
    return etag?new Response(null,{status:304}):json({view:url},'accepted');
  });
  const old=loader.snapshot('overview');
  assert.equal(loader.snapshot('overview'),old,'overlapping same-view calls share one request');
  const current=await loader.snapshot('pcs-dashboard');loader.accept(current!);
  late.resolve(json({view:'old'}));assert.equal(await old,null,'late completion cannot replace new view');
  assert.equal((await loader.snapshot('pcs-dashboard'))?.status,304);
  const strings=await loader.snapshot('arrays-strings');assert.equal(seen.at(-1)?.etag,null);loader.accept(strings!);
  await loader.snapshot('arrays-strings',false,false);assert.equal(seen.at(-1)?.etag,null,'list ETag never applies to full shape');
  await loader.snapshot('arrays-strings',true);assert.equal(seen.at(-1)?.etag,null,'force bypasses conditional reuse');
  assert.match(seen.at(-1)!.url,/refresh=true/);
});

test('rejected telemetry revisions are not cached and cancellation prevents late publication',async()=>{
  const seen:(string|null)[]=[];const gate=deferred<Response>();let slow=false;
  const loader=new SiteDataRequests(async(_input,init)=>{seen.push(new Headers(init?.headers).get('If-None-Match'));return slow?gate.promise:json({normalized:{}});});
  await loader.snapshot('overview'); // Quality gate rejects: intentionally do not accept.
  await loader.snapshot('overview');assert.deepEqual(seen,[null,null]);
  slow=true;const pending=loader.snapshot('pcs-dashboard');loader.cancel();gate.resolve(json({old:true}));assert.equal(await pending,null);
});

test('timeout covers response body, and malformed topology cannot mark itself loaded',async()=>{
  const loader=new SiteDataRequests(async()=>json({success:false}),30);
  assert.ok((await loader.topology())?.error);
  let attempts=0;
  const warming=new SiteDataRequests(async()=>{attempts++;return json({success:true,profile:null});});
  await warming.topology();await warming.topology();assert.equal(attempts,2,'an absent profile remains retryable after warm-up');
  assert.ok((await loader.topology())?.error);
  const bodyLoader=new SiteDataRequests(async(_input,init)=>({
    ok:true,status:200,headers:new Headers({'content-type':'application/json'}),
    json:()=>new Promise((_resolve,reject)=>init!.signal!.addEventListener('abort',()=>reject(new Error('body aborted')))),
  }) as Response,10);
  await assert.rejects(()=>bodyLoader.snapshot('overview'),/body aborted/);
});

test('selected subscriptions skip heartbeat-only updates but preserve data, error and action changes',()=>{
  const initial={snapshot:{power:10},heartbeat:0,error:null as string|null,refresh:()=>{}};
  const store=new SelectedStore(initial),page=store.select(['snapshot']),header=store.select(['heartbeat','error']),controls=store.select(['refresh']);
  let broad=0,heavy=0,status=0,actions=0;
  const unsubscribe=[store.subscribe(()=>broad++),page.subscribe(()=>heavy++),header.subscribe(()=>status++),controls.subscribe(()=>actions++)];
  const stable=page.get();
  for(let heartbeat=1;heartbeat<=100;heartbeat++)store.publish({...initial,heartbeat});
  assert.equal(broad,100);assert.equal(heavy,0);assert.equal(status,100);assert.equal(actions,0);assert.equal(page.get(),stable);
  store.publish({...store.get(),snapshot:{power:11}});assert.equal(heavy,1);
  store.publish({...store.get(),error:'unavailable'});assert.equal(status,101);
  store.publish({...store.get(),refresh:()=>{}});assert.equal(actions,1);
  unsubscribe.forEach(fn=>fn());store.publish(initial);assert.equal(heavy,1);
});
