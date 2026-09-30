import assert from 'node:assert/strict';
import {PrimaryTelemetryReader, type PrimarySample} from './PrimaryTelemetryReader';
const flush=async()=>{for(let n=0;n<12;n++)await Promise.resolve();};
function deferred<T>() {let resolve!:(v:T)=>void,reject!:(e:Error)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function fixture() {
  let now=100000,scope:string|null='A',calls=0,active=0,maxActive=0;
  const timers=new Map<number,{at:number;callback:()=>void}>();let serial=0;
  const requests:ReturnType<typeof deferred<{value:number}>>[]=[],published:PrimarySample<{value:number}>[]=[];
  const reader=new PrimaryTelemetryReader(()=>scope,async()=>{calls++;active++;maxActive=Math.max(active,maxActive);const d=deferred<{value:number}>();requests.push(d);try{return await d.promise;}finally{active--;}}
    ,sample=>{published.push(sample);},{now:()=>now,schedule:(callback,delay)=>{const id=++serial;timers.set(id,{at:now+delay,callback});return id;},cancel:handle=>{timers.delete(Number(handle));}});
  return {reader,requests,published,get calls(){return calls;},get maxActive(){return maxActive;},scope:(s:string|null)=>{scope=s;},
    async tick(ms:number) {now+=ms;for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);timer.callback();}await flush();}};
}
{
  const f=fixture(),a=f.reader.read('A'),b=f.reader.read('A');await flush();assert.equal(f.calls,1);
  await f.tick(500);f.requests[0].resolve({value:7});await flush();
  const first=await a;assert.deepEqual(await b,first);first.data!.value=99;
  assert.equal((await f.reader.read('A')).data!.value,7,'Consumer mutation cannot affect stored data');
  await f.tick(3499);assert.equal(f.calls,1);await f.tick(1);assert.equal(f.calls,2);
  assert.equal((await f.reader.read('A')).sequence,1,'Consumers may use the bounded previous sample while next read is pending');
  await f.tick(6000);assert.equal(f.calls,2,'No overlapping reads despite long response');
  f.requests[1].resolve({value:8});await flush();await f.tick(999);assert.equal(f.calls,2);await f.tick(1);assert.equal(f.calls,3,'One-second minimum quiet period after slow response');
  f.reader.stop();let drained=false;const drain=f.reader.drain().then(()=>{drained=true;});await flush();assert(!drained);
  f.requests[2].resolve({value:9});await drain;assert.equal(f.published.length,2,'No publication after stop');
  await f.tick(60000);assert.equal(f.calls,3);assert.equal(f.maxActive,1);await assert.rejects(f.reader.read('A'),/stopped/);
}
{
  const f=fixture();let p=f.reader.read('A');await flush();f.requests[0].reject(new Error('failed'));await assert.rejects(p,/failed/);
  for(const [index,delay] of [[1,8000],[2,16000],[3,30000]] as const) {
    await f.tick(delay-1);assert.equal(f.calls,index);await assert.rejects(f.reader.read('A'),/failed/,'Demand cannot bypass failure backoff');
    await f.tick(1);assert.equal(f.calls,index+1);f.requests[index].reject(new Error('failed'));await flush();
  }
  assert(f.published.every(p=>!p.success&&p.data===null));f.reader.stop();
}
{
  const f=fixture(),old=f.reader.read('A');const oldRejected=assert.rejects(old,/changed/);await flush();f.scope('B');
  const next=f.reader.read('B');await flush();assert.equal(f.calls,1);
  f.requests[0].resolve({value:1});await oldRejected;await flush();assert.equal(f.calls,2);assert.equal(f.published.length,0);
  f.requests[1].resolve({value:2});assert.equal((await next).data!.value,2);assert.equal(f.maxActive,1);f.reader.stop();
}
{
  const f=fixture(),p=f.reader.read('A');await flush();f.requests[0].resolve({value:1});await p;
  await f.tick(60000);assert.equal(f.calls,1,'Demand expiry stops autonomous reads');
  const next=f.reader.read('A');await flush();assert.equal(f.calls,2);
  f.requests[1].resolve({value:2});assert.equal((await next).data!.value,2);f.reader.stop();
}
{
  const f=fixture(),a=assert.rejects(f.reader.read('A'),/changed/);await flush();f.scope('B');const b=f.reader.read('B');const rejected=assert.rejects(b,/changed/);
  f.scope('A');const a2=f.reader.read('A');f.requests[0].resolve({value:1});await flush();
  assert.equal(f.published.length,0,'A to B to A discards the old generation');assert.equal(f.calls,2);
  f.requests[1].resolve({value:2});await Promise.all([a,a2,rejected]);assert.equal(f.maxActive,1);f.reader.stop();
}
{
  const f=fixture(),old=assert.rejects(f.reader.read('A'),/changed/);await flush();
  f.reader.stop();f.reader.start();const next=f.reader.read('A');await flush();assert.equal(f.calls,1);
  f.requests[0].resolve({value:1});await old;await flush();assert.equal(f.calls,2);assert.equal(f.published.length,0);
  f.requests[1].resolve({value:2});assert.equal((await next).data!.value,2);assert.equal(f.maxActive,1);f.reader.stop();
}
{
  const f=fixture(),p=f.reader.read('A');await flush();f.requests[0].resolve({value:1});await p;
  await f.tick(4000);f.requests[1].reject(new Error('lost source'));await flush();
  assert.equal(f.published.at(-1)?.success,false);assert.equal(f.published.at(-1)?.data,null);
  await assert.rejects(f.reader.read('A'),/lost source/,'Latest failure cannot return a previous successful result');f.reader.stop();
}
console.log('Primary reader: single-flight, rate limits, copy isolation, failure backoff, site generation, lease expiry, stop/start and shutdown drain passed.');
