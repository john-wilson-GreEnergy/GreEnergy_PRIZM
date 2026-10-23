import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

// Also runs against the exact release module, with no device/network access.
const {subscribeStringList} = await import(pathToFileURL(path.resolve(process.argv[2] || 'src/lib/subscribeStringList.ts')).href);
const originalNow = Date.now;
let now = 1000, sequence = 0;
const timers = new Map<number, {at:number; every:number; fn:()=>void}>();
const schedule = (fn:()=>void, ms:number, every=0) => { const id=++sequence; timers.set(id,{at:now+ms,every,fn}); return id; };
const tick = () => new Promise(resolve=>setImmediate(resolve));
const advance = async (ms:number) => {
  const end=now+ms;
  while (true) {
    const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
    if(!next) break;
    const [id,t]=next;now=t.at;
    if(t.every)t.at+=t.every;else timers.delete(id);
    t.fn();await tick();
  }
  now=end;await tick();
};
class Stream {
  static current:Stream;
  handlers=new Map<string,(e:{data:string})=>void>(); closed=false;
  constructor(readonly url:string){Stream.current=this;}
  addEventListener(type:string,fn:(e:{data:string})=>void){this.handlers.set(type,fn);}
  send(type:string,data:unknown={}){this.handlers.get(type)?.({data:JSON.stringify(data)});}
  close(){this.closed=true;}
}
type Request={url:string;resolve:(r:unknown)=>void;reject:(e:Error)=>void};
let requests:Request[]=[];
const visibility=new Set<()=>void>();
Object.assign(globalThis,{
  window:{location:{pathname:'/',search:''},setTimeout:(fn:()=>void,ms:number)=>schedule(fn,ms),clearTimeout:(id:number)=>timers.delete(id),setInterval:(fn:()=>void,ms:number)=>schedule(fn,ms,ms),clearInterval:(id:number)=>timers.delete(id)},
  document:{hidden:false,addEventListener:(_e:string,fn:()=>void)=>visibility.add(fn),removeEventListener:(_e:string,fn:()=>void)=>visibility.delete(fn)},
  EventSource:Stream,
  fetch:(url:string,options:{signal:AbortSignal})=>new Promise((resolve,reject)=>{requests.push({url,resolve,reject});options.signal.addEventListener('abort',()=>reject(new Error('aborted')));})
});
Date.now=()=>now;
const snap=(version=0)=>({transportEpoch:'test',brokerVersion:version,strings:[{arrayNumber:1,stringNumber:1,amps:0,capturedAt:'original-source-time'}]});
const ready=()=>Stream.current.send('ready',{transportEpoch:'test',version:0,stringRefreshVersion:1});
const answer=async(body:unknown=snap(),ok=true)=>{requests.at(-1)!.resolve({ok,json:async()=>body});await tick();};
const start=()=>{
  requests=[];const statuses:boolean[]=[],views:unknown[]=[];
  const stop=subscribeStringList((v:unknown)=>views.push(v),(s:boolean)=>statuses.push(s));
  return {statuses,views,stop:()=>{stop();assert.equal(timers.size,0);assert.equal(visibility.size,0);}};
};
try {
  for(const site of ['solar-star-3','solar-star-4']) {
    window.location.pathname='/desktop/'+site+'/';
    let run=start();assert.deepEqual(run.statuses,[false]);
    await advance(3000);ready();assert.equal(run.statuses.at(-1),false);
    // Ordinary deltas may precede the bootstrap response and be buffered.
    Stream.current.send('strings',{transportEpoch:'test',version:1,changes:[],capturedAt:'source-time'});
    assert.equal(run.statuses.at(-1),false);await answer();assert(!run.statuses.includes(true));
    assert(requests.every(r=>r.url.startsWith('/desktop/'+site+'/api/')));
    await advance(11999);assert.equal(run.statuses.at(-1),false);
    await advance(4001);assert.equal(run.statuses.at(-1),true,'silent established stream warns');
    await answer(snap(1));assert.equal(run.statuses.at(-1),true,'GET alone cannot mask silent SSE');
    Stream.current.send('strings',{transportEpoch:'test',version:2,changes:[],capturedAt:'next-source-time'});
    assert.equal(run.statuses.at(-1),false);run.stop();

    run=start();await answer();await advance(11999);assert.equal(run.statuses.at(-1),false);
    await advance(1);assert.equal(run.statuses.at(-1),true,'no ready warns at startup deadline');run.stop();
    run=start();await advance(8000);ready();await advance(4000);
    assert.equal(run.statuses.at(-1),true,'late ready cannot renew startup deadline');run.stop();
    run=start();ready();await advance(10000);
    assert.equal(run.statuses.at(-1),true,'bootstrap timeout warns');run.stop();
    run=start();Stream.current.send('error');assert.equal(run.statuses.at(-1),true,'explicit SSE error warns immediately');
    ready();assert.equal(run.statuses.at(-1),true);await answer();assert.equal(run.statuses.at(-1),false);run.stop();
    run=start();ready();await answer({},false);assert.equal(run.statuses.at(-1),true,'HTTP failure warns');run.stop();
    run=start();ready();await answer({});await answer({});assert.equal(run.statuses.at(-1),true,'invalid snapshot warns after bounded reconciliation');run.stop();
    run=start();ready();await answer();Stream.current.send('strings',{transportEpoch:'test',version:3,changes:[]});
    assert.equal(run.statuses.at(-1),true,'established version gap warns immediately');run.stop();
    run=start();Stream.current.handlers.get('strings')?.({data:'{invalid'});
    assert.equal(run.statuses.at(-1),true,'malformed stream warns');run.stop();
    // Reopening the page starts clean, not with a retained recovery warning.
    run=start();ready();await answer();assert(!run.statuses.includes(true));run.stop();
    console.log(site+': startup, delayed ready, buffering, deadlines, failures, recovery, gaps and cleanup passed');
  }
} finally {Date.now=originalNow;}
