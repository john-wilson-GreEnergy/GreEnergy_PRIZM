import assert from 'node:assert/strict';
import {subscribeStringList} from './subscribeStringList';
import {hasHealthyStringStream} from './stringStreamHealth';
const requests: {resolve: (value: unknown) => void; signal: AbortSignal}[] = [];
const timers = new Map<number, () => void>();
let id=0;
Object.assign(globalThis,{window:{location:{pathname:'/desktop/solar-star-4/',search:'?stringRefresh=legacy'},setTimeout:(fn:()=>void)=>{timers.set(++id,fn);return id;},clearTimeout:(key:number)=>timers.delete(key),
  setInterval:(fn:()=>void)=>{timers.set(++id,fn);return id;},clearInterval:(key:number)=>timers.delete(key)}});
class Stream {
  static current: Stream;
  handlers=new Map<string,(event:unknown)=>void>();closed=false;
  constructor(readonly url:string){Stream.current=this;}
  addEventListener(type:string,handler:(event:unknown)=>void){this.handlers.set(type,handler);}
  send(type:string,data?:unknown){this.handlers.get(type)?.({data:JSON.stringify(data)});}
  close(){this.closed=true;}
}
Object.assign(globalThis,{EventSource:Stream,fetch:(_url:string,options:{signal:AbortSignal})=>new Promise(resolve=>requests.push({resolve,signal:options.signal}))});
const views:unknown[]=[],recovery:boolean[]=[];
const stop=subscribeStringList(view=>views.push(view),status=>recovery.push(status));
assert.equal(Stream.current.url,'/desktop/solar-star-4/api/local/site-data/strings-stream?shape=list-v2');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const snapshot=(epoch:string,version:number)=>({transportEpoch:epoch,brokerVersion:version,strings:[{arrayNumber:1,stringNumber:2,amps:0}]});
const resolve=(index:number,body:unknown)=>requests[index].resolve({ok:true,json:async()=>body});
assert.equal(requests.length,1);
Stream.current.send('ready',{transportEpoch:'old',version:1});
assert.equal(requests[0].signal.aborted,true);assert.equal(requests.length,2);
resolve(0,snapshot('old',999));await tick();assert.equal(views.length,0);
resolve(1,snapshot('old',1));await tick();assert.equal(recovery.at(-1),false);
Stream.current.send('error');assert.equal(recovery.at(-1),true);
Stream.current.send('ready',{transportEpoch:'new',version:0});
assert.equal(requests.length,3);
resolve(2,snapshot('new',0));await tick();assert.equal(recovery.at(-1),false);
assert.equal((views.at(-1) as {transportEpoch:string}).transportEpoch,'new');
Stream.current.send('strings',{transportEpoch:'new',version:2,changes:[{key:'1:2',row:{arrayNumber:1,stringNumber:2,amps:2}}]});
assert.equal(requests.length,4);assert.equal(recovery.at(-1),true);
const count=views.length;
stop();assert(Stream.current.closed);assert.equal(timers.size,0);
resolve(3,snapshot('new',2));await tick();assert.equal(views.length,count);
window.location.search='';
let now=1000;const realNow=Date.now;Date.now=()=>now;
const visibility=new Set<()=>void>();
const doc={hidden:false,addEventListener:(_name:string,fn:()=>void)=>visibility.add(fn),removeEventListener:(_name:string,fn:()=>void)=>visibility.delete(fn)};
Object.assign(globalThis,{document:doc});
const optimized=subscribeStringList(view=>views.push(view),status=>recovery.push(status));
assert.equal(requests.length,5,'Bootstrap GET starts without waiting for SSE');
// No SSE connection: watchdog provides ordinary GET fallback.
Stream.current.send('ready',{transportEpoch:'final',version:0,stringRefreshVersion:1});assert(!requests[4].signal.aborted);
resolve(4,snapshot('final',0));await tick();assert(hasHealthyStringStream());
for(let i=0;i<10;i++)timers.forEach(fn=>fn());assert.equal(requests.length,5,'No duplicate GET at ready or while healthy');
const v=views.length;Stream.current.send('strings',{transportEpoch:'final',version:0,changes:[]});assert.equal(views.length,v);
now+=13000;doc.hidden=true;timers.forEach(fn=>fn());assert.equal(requests.length,5);
doc.hidden=false;visibility.forEach(fn=>fn());assert.equal(requests.length,6,'Visible silent stream repairs');
assert(!hasHealthyStringStream());assert.equal(recovery.at(-1),true);
optimized();assert.equal(timers.size,0);assert.equal(visibility.size,0);assert(!hasHealthyStringStream());
Date.now=realNow;
// HTTP wins: first ready adopts the verified snapshot, not a second request.
let index=requests.length;
const early=subscribeStringList(view=>views.push(view),status=>recovery.push(status));
resolve(index,snapshot('early',4));await tick();assert(!hasHealthyStringStream());
Stream.current.send('ready',{transportEpoch:'early',version:4,stringRefreshVersion:1});
assert.equal(requests.length,index+1);assert(hasHealthyStringStream());early();
// Ready wins and the HTTP snapshot belongs to an older epoch/version: one
// immediate reconciliation, never show the mismatched rows or spin on failure.
for(const old of [snapshot('old',99),snapshot('new',1)]){
 index=requests.length;const count=views.length;
 const late=subscribeStringList(view=>views.push(view),status=>recovery.push(status));
 Stream.current.send('ready',{transportEpoch:'new',version:2,stringRefreshVersion:1});
 resolve(index,old);await tick();assert.equal(views.length,count);assert.equal(requests.length,index+2);
 resolve(index+1,snapshot('new',2));await tick();assert(hasHealthyStringStream());
 Stream.current.send('error');Stream.current.send('ready',{transportEpoch:'restarted',version:0,stringRefreshVersion:1});
 assert.equal(requests.length,index+3,'Reconnect still gets a new baseline');
 resolve(index+2,snapshot('restarted',0));await tick();assert(hasHealthyStringStream());late();
}
index=requests.length;
const invalid=subscribeStringList(()=>{},status=>recovery.push(status));
Stream.current.send('ready',{transportEpoch:'new',version:2,stringRefreshVersion:1});
resolve(index,snapshot('old',0));await tick();resolve(index+1,snapshot('old',0));await tick();
assert.equal(requests.length,index+2,'Invalid responses do not create an unbounded retry loop');
assert.equal(recovery.at(-1),true);invalid();assert.equal(timers.size,0);
console.log('String subscription reconnect generations, aborts, gap recovery and cleanup passed');
