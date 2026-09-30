import {FleetBroker, IdentityConflict, parseEnrollment} from './FleetBroker';
import type {SiteEnrollment} from '../../core/fleet/model';

export interface Collector extends SiteEnrollment {url:string; token:string}
export const LOOPBACK_HOSTS=['localhost','127.0.0.1','[::1]'];
export function parseCollector(value:unknown,allowLoopbackHttp=false):Collector {
  const site=parseEnrollment(value), row=value as Record<string,unknown>;
  if(typeof row.url!=='string' || typeof row.token!=='string' || !/^[A-Za-z0-9_-]{43,128}$/.test(row.token))throw new Error('Invalid collector credentials');
  const url=new URL(row.url);
  if(url.username || url.password || url.search || url.hash || url.pathname!=='/api/fleet/site-summary' ||
    (url.protocol!=='https:' && !(allowLoopbackHttp && url.protocol==='http:' && LOOPBACK_HOSTS.includes(url.hostname))))throw new Error('Enrolled collector requires HTTPS and the fixed summary path');
  return {...site,url:url.href,token:row.token};
}
export async function fetchCollector(collector:Collector,signal:AbortSignal,fetcher:typeof fetch=fetch):Promise<unknown> {
  const response=await fetcher(collector.url,{method:'GET',redirect:'error',signal,headers:{Accept:'application/json',Authorization:'Bearer '+collector.token}});
  if(!response.ok || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')){
    await response.body?.cancel(); throw new Error('Collector response unavailable');
  }
  const reader=response.body?.getReader();if(!reader)throw new Error('Collector response empty');
  const limit=256*1024,chunks:Uint8Array[]=[];let total=0;
  try {
    for(;;){const part=await reader.read();if(part.done)break;total+=part.value.byteLength;if(total>limit)throw new Error('Collector response too large');chunks.push(part.value);}
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  }finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
}
/** One bounded background request per enrolled site; browser reads never trigger it. */
export class CollectorPoller {
  private running=false;
  private timers=new Set<ReturnType<typeof setTimeout>>();
  private active=new Map<string,AbortController>();
  private work=new Set<Promise<void>>();
  constructor(private broker:FleetBroker,private collectors:Collector[],private read=fetchCollector){}
  start(){if(this.running)return;this.running=true;for(const collector of this.collectors)this.enqueue(collector,0);}
  private enqueue(collector:Collector,delay:number){
    if(!this.running)return;
    const timer=setTimeout(()=>{this.timers.delete(timer);const task=this.poll(collector);this.work.add(task);void task.finally(()=>this.work.delete(task));},delay);
    timer.unref();this.timers.add(timer);
  }
  private async poll(collector:Collector){
    if(!this.running || this.active.has(collector.siteId))return;
    const controller=new AbortController();this.active.set(collector.siteId,controller);
    const timeout=setTimeout(()=>controller.abort(),5000);timeout.unref();
    try{const payload=await this.read(collector,controller.signal);if(this.running)this.broker.accept(collector.siteId,payload);}
    catch(error){if(this.running)this.broker.fail(collector.siteId,error instanceof IdentityConflict?'identity-conflict':'unavailable');}
    finally{clearTimeout(timeout);this.active.delete(collector.siteId);this.enqueue(collector,4000);}
  }
  async stop(){this.running=false;for(const timer of this.timers)clearTimeout(timer);this.timers.clear();for(const controller of this.active.values())controller.abort();await Promise.all(this.work);}
}
