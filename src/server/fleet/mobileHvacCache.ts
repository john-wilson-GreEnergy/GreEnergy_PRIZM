import type {Collector} from './CollectorPoller';
import type {WorkspaceEnrollment} from './workspaceAccess';
import {projectMobileHvac,unavailableHvac} from './mobileHvacProjection';

/** Reads only the collector's existing thermal cache. No device polling or writes.
 * Fixed, enrolled endpoints; never accepts a URL or path from a mobile client. */
export class MobileHvacCache {
 private records=new Map<string,{data:unknown;received:number}>();
 private timers=new Set<ReturnType<typeof setTimeout>>();
 private active=new Set<AbortController>();
 private running=false;
 constructor(private collectors:Collector[],private workspaces:WorkspaceEnrollment[],private fetcher:typeof fetch=fetch,private clock=Date.now){}
 view(siteId:string){
  const value=this.records.get(siteId);
  return value&&this.clock()-value.received<=15000?projectMobileHvac(value.data,this.clock()):unavailableHvac();
 }
 async refresh(collector:Collector,workspace:WorkspaceEnrollment){
  const controller=new AbortController();this.active.add(controller);
  const timeout=setTimeout(()=>controller.abort(),3000);timeout.unref();
  try{
   const url=new URL('/api/fleet/workspace/api/local/site-data/thermal',collector.url);
   if(url.protocol!=='https:'||collector.siteId!==workspace.siteId)throw Error('Invalid enrollment');
   const response=await this.fetcher(url,{method:'GET',redirect:'error',signal:controller.signal,headers:{Accept:'application/json',Authorization:'Bearer '+workspace.token}});
   if(!response.ok||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??'')){await response.body?.cancel();throw Error('Unavailable');}
   const reader=response.body?.getReader();if(!reader)throw Error('Unavailable');
   const chunks:Uint8Array[]=[];let size=0;
   let data:unknown;
   try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>3*1024*1024)throw Error('Oversize');chunks.push(p.value);}data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
   finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   projectMobileHvac(data,this.clock());
   if(!controller.signal.aborted)this.records.set(collector.siteId,{data,received:this.clock()});
  }catch{this.records.delete(collector.siteId);}
  finally{clearTimeout(timeout);this.active.delete(controller);}
 }
 start(){if(this.running)return;this.running=true;for(const w of this.workspaces){const c=this.collectors.find(c=>c.siteId===w.siteId);if(c)this.schedule(c,w,0);}}
 private schedule(c:Collector,w:WorkspaceEnrollment,delay:number){
  if(!this.running)return;
  const timer=setTimeout(()=>{this.timers.delete(timer);void this.refresh(c,w).finally(()=>this.schedule(c,w,5000));},delay);timer.unref();this.timers.add(timer);
 }
 stop(){this.running=false;for(const t of this.timers)clearTimeout(t);this.timers.clear();for(const c of this.active)c.abort();this.records.clear();}
}
