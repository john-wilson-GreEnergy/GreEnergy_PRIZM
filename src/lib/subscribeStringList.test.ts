import assert from 'node:assert/strict';
import {subscribeStringList} from './subscribeStringList';
const requests: {resolve: (value: unknown) => void; signal: AbortSignal}[] = [];
const timers = new Map<number, () => void>();
let id=0;
Object.assign(globalThis,{window:{setTimeout:(fn:()=>void)=>{timers.set(++id,fn);return id;},clearTimeout:(key:number)=>timers.delete(key),
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
console.log('String subscription reconnect generations, aborts, gap recovery and cleanup passed');
