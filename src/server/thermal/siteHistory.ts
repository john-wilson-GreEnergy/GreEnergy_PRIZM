import {validateHistoryFilters,type HistoryFilters,type HistoryDevice} from "./historyReview";
import * as fs from "node:fs/promises";
import {createHash,randomUUID} from "node:crypto";
import path from "node:path";
import type {ThermalUnit, ThermalPoint} from "./thermalModel";
import {thermalMetrics, type ThermalMetric} from "./thermalMetrics";
import {ThermalReviewAccumulator, finishThermalReview, REVIEW_GAP_MS, type ThermalReviewJob, type ThermalReviewRow} from "./thermalMorningReview";
import {boundedHistoryWork,readSiteSamples} from "./historyIo";
export {readSiteSamples} from "./historyIo";
import {HistoryQueryRunner} from "./historyQueryRunner";

const HOUR=3600000, DAY=24*HOUR, GiB=1024**3;
const shardPattern=/^(\d{10,16})-([a-f0-9]{64})\.jsonl$/;
const hash=(text:string)=>createHash("sha256").update(text).digest("hex");
export type SiteIdentity={id:string;label:string};
export type SiteSample={gap?:boolean;id:string;label:string;array:number;segment:string;unit:number;ip:string;receivedAt:number;sourceAt:number;point:ThermalPoint};
type Config={format:"prizm-site-thermal-v1";enabled:boolean;retentionDays:number;maxBytes:number;siteKey:string|null;siteLabel:string|null;lastSavedAt:number|null;lastCleanupAt:number|null;droppedSamples:number;pausedReason:string|null};
export type SiteStorageStatus=Config & {directory:string;usedBytes:number;freeBytes:number|null;reserveBytes:number;unitCount:number;currentSiteLabel:string|null;canStart:boolean;oldestAt:number|null;newestAt:number|null;shardCount:number;projectedSevenDayBytes:number|null;pendingBatches:number;lastBatchDurationMs:number|null;lastBatchSamples:number};


// Dependency-free hourly files indexed by target hash. No device acquisition.
export class SiteHistory {
  private config:Config={format:"prizm-site-thermal-v1",enabled:false,retentionDays:7,maxBytes:32*GiB,siteKey:null,siteLabel:null,lastSavedAt:null,lastCleanupAt:null,droppedSamples:0,pausedReason:null};
  private files=new Map<string,number>();
  private devices=new Map<string,HistoryDevice>();
  private latest=new Map<string,{key:string;at:number}>();
  private scheduled=new Map<string,{key:string;at:number}>();
  private pendingWrites=0;
  private closed=false;
  private closing:Promise<void>|null=null;
  private lastBatchDurationMs:number|null=null;
  private lastBatchSamples=0;
  private currentSite:SiteIdentity|null=null;
  private unitCount=0;
  private ready:Promise<void>;
  private tail:Promise<unknown>=Promise.resolve();
  private pending=0;
  private queries=0;
  private queryWorker=new HistoryQueryRunner();
  private reviewJob:ThermalReviewJob={state:"idle",completed:0,total:0};
  private reviewGeneration=0;
  private configured=false;
  private lockToken:string|null=null;
  private fatal:string|null=null;
  private freeBytes:number|null=null;
  private timer:ReturnType<typeof setInterval>|undefined;
  constructor(readonly directory:string,private reserveBytes=5*GiB,private clock=Date.now,maintenance=true){
    const disabled=process.env.PRIZM_SITE_HISTORY_ENABLED==="false";
    if(disabled)this.fatal="Whole-site history is disabled by PRIZM_SITE_HISTORY_ENABLED";
    this.ready=disabled?Promise.resolve():this.load().catch(e=>{this.fatal=String(e);});
    if(maintenance&&!disabled){this.timer=setInterval(()=>{if(process.env.PRIZM_THERMAL_ENABLED!=="false"&&process.env.PRIZM_SITE_HISTORY_ENABLED!=="false"&&this.pending<2)void this.queue(()=>this.prune()).catch(e=>{this.config.pausedReason=String(e);});},60000);this.timer.unref();}
  }
  private async safeDirectory(){const s=await fs.lstat(this.directory);if(!s.isDirectory()||s.isSymbolicLink())throw new Error("Invalid site history directory");}
  private async acquireLock(){
    if(this.lockToken)return;
    const file=path.join(this.directory,"writer-lock.json"),token=randomUUID();
    for(let attempt=0;attempt<2;attempt++){
      try{const f=await fs.open(file,"wx");try{await f.writeFile(JSON.stringify({pid:process.pid,token}));await f.sync();}finally{await f.close();}this.lockToken=token;return;}
      catch(e){if((e as NodeJS.ErrnoException).code!=="EEXIST")throw e;
        const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw new Error("Invalid site recorder lock");
        const owner=JSON.parse(await fs.readFile(file,"utf8"));if(!Number.isInteger(owner.pid)||owner.pid<=0)throw new Error("Invalid site recorder owner");
        let alive=true;try{process.kill(owner.pid,0);}catch(error){if((error as NodeJS.ErrnoException).code==="ESRCH")alive=false;}
        if(alive)throw new Error("Site history is already open in another PRIZM process");
        await fs.unlink(file);
      }
    }
    throw new Error("Unable to acquire site recorder lock");
  }
  private async load(){
    const stat=await fs.lstat(this.directory).catch(e=>{if(e.code==="ENOENT")return null;throw e;});if(!stat)return;
    await this.safeDirectory();
    const marker=path.join(this.directory,"storage.json");
    const markerStat=await fs.lstat(marker).catch(e=>{if(e.code==="ENOENT")return null;throw e;});if(!markerStat){if((await fs.readdir(this.directory)).length)throw new Error("History ownership marker missing; cleanup disabled");return;}if(!markerStat.isFile()||markerStat.isSymbolicLink())throw new Error("Invalid history ownership marker");
    const c=JSON.parse(await fs.readFile(marker,"utf8")) as Config;
    if(c.format!=="prizm-site-thermal-v1"||typeof c.enabled!=="boolean"||!Number.isInteger(c.retentionDays)||c.retentionDays<1||c.retentionDays>7||!Number.isFinite(c.maxBytes)||c.maxBytes<=0)throw new Error("Invalid site history settings; automatic cleanup disabled");
    this.config=c;this.configured=true;await this.acquireLock();
    for(const file of await fs.readdir(this.directory)){if(!shardPattern.test(file))continue;const s=await fs.lstat(path.join(this.directory,file));if(s.isFile()&&!s.isSymbolicLink())this.files.set(file,s.size);}
    await this.prune();
    // Recover the last source observation from each target's latest shard, even after a crash.
    const newest=new Map<string,string>();for(const file of [...this.files.keys()].sort()){newest.set(shardPattern.exec(file)![2],file);}
    for(const file of newest.values())for await(const sample of readSiteSamples(path.join(this.directory,file))){this.devices.set(sample.id,{id:sample.id,array:sample.array,segment:sample.segment,unit:sample.unit,label:sample.label,ip:sample.ip});this.latest.set(sample.id,{key:`${sample.sourceAt}:${sample.point.quality}`,at:sample.sourceAt});}
  }
  private queue<T>(fn:()=>Promise<T>):Promise<T>{this.pending++;const run=this.tail.then(()=>this.ready).then(()=>{if(this.fatal)throw new Error(this.fatal);return fn();});this.tail=run.catch(()=>{}).finally(()=>{this.pending--;});return run;}
  private async save(){
    const temp=path.join(this.directory,"storage.json.tmp");
    const f=await fs.open(temp,"w");try{await f.writeFile(JSON.stringify(this.config));await f.sync();}finally{await f.close();}
    await fs.rename(temp,path.join(this.directory,"storage.json"));
  }
  private used(){return [...this.files.values()].reduce((sum,n)=>sum+n,0);}
  private async disk(){const s=await fs.statfs(this.directory);this.freeBytes=s.bavail*s.bsize;return this.freeBytes;}
  async status():Promise<SiteStorageStatus>{
    await this.ready;if(this.configured)await this.disk().catch(()=>{});
    let oldest:number|null=null;for(const f of this.files.keys()){const at=Number(shardPattern.exec(f)![1]);oldest=oldest===null?at:Math.min(oldest,at);}
    return {...this.config,pendingBatches:this.pendingWrites,lastBatchDurationMs:this.lastBatchDurationMs,lastBatchSamples:this.lastBatchSamples,pausedReason:this.fatal||this.config.pausedReason,directory:this.directory,usedBytes:this.used(),freeBytes:this.freeBytes,reserveBytes:this.reserveBytes,unitCount:this.unitCount,currentSiteLabel:this.currentSite?.label??null,canStart:!!this.currentSite&&this.unitCount>0&&!this.fatal,oldestAt:oldest===null?null:Math.max(oldest,this.clock()-this.config.retentionDays*DAY),newestAt:this.config.lastSavedAt,shardCount:this.files.size,projectedSevenDayBytes:this.unitCount?this.unitCount*120960*600:null};
  }
  async configure(input:{enabled:boolean;retentionDays:number;maxGiB:number}){
    if(this.closed)throw new Error("Site recorder is shutting down");
    return this.queue(async()=>{
      if(typeof input.enabled!=="boolean"||!Number.isInteger(input.retentionDays)||input.retentionDays<1||input.retentionDays>7||!Number.isFinite(input.maxGiB)||input.maxGiB<0.1||input.maxGiB>1024)throw new Error("Choose 1–7 days and a storage cap between 0.1 and 1024 GiB");
      if(input.enabled&&(!this.currentSite||!this.unitCount))throw new Error("Wait for mapped telemetry and site identity before starting");
      if(input.enabled&&this.config.siteKey&&this.config.siteKey!==hash(this.currentSite!.id))throw new Error("History belongs to a different site. Return to that site or use a separate PRIZM history directory");
      if(!this.configured){await fs.mkdir(this.directory,{recursive:true});await this.safeDirectory();if((await fs.readdir(this.directory)).length)throw new Error("Refusing to adopt a nonempty site history directory");this.configured=true;await this.acquireLock();await this.save();}
      if(input.enabled){const free=await this.disk();if(free<=this.reserveBytes)throw new Error("Free-disk reserve reached; recording cannot start");if(this.used()>=input.maxGiB*GiB)throw new Error("Storage cap is below current history usage");}
      this.config={...this.config,enabled:input.enabled,retentionDays:input.retentionDays,maxBytes:Math.floor(input.maxGiB*GiB),siteKey:this.config.siteKey||(input.enabled?hash(this.currentSite!.id):null),siteLabel:this.config.siteLabel||(input.enabled?this.currentSite!.label:null),pausedReason:null};
      await this.save();await this.prune();return this.status();
    });
  }
  ingest(units:ThermalUnit[],site:SiteIdentity|null,now=this.clock()){
    if(this.closed)return;
    if(this.currentSite?.id!==site?.id){this.reviewGeneration++;this.reviewJob={state:"idle",completed:0,total:0};}
    this.currentSite=site;this.unitCount=units.length;
    if(!this.config.enabled||this.fatal||process.env.PRIZM_SITE_HISTORY_ENABLED==="false")return;
    if(!site||hash(site.id)!==this.config.siteKey){this.config.pausedReason="Site identity changed; recording paused to prevent mixed-site history";return;}
    if(this.config.pausedReason)return;
    // Deduplicate against durable AND queued observations before counting overload.
    // Keep four complete batches; never coalesce distinct observations/extrema.
    const candidates=[...new Map(units.map(u=>[u.id,u])).values()].filter(u=>{
      const previous=this.scheduled.get(u.id)||this.latest.get(u.id),sourceAt=u.point.at;
      const at=u.point.quality==="Live"?sourceAt:now;
      return Number.isFinite(at)&&at<=now+30000&&at>=now-this.config.retentionDays*DAY&&previous?.key!==`${sourceAt}:${u.point.quality}`&&(!previous||sourceAt>=previous.at);
    });
    if(!candidates.length)return;
    if(this.pendingWrites>=4){this.config.droppedSamples+=candidates.length;return;}
    const accepted=candidates.map(u=>({...u,point:{...u.point}}));
    for(const u of accepted)this.scheduled.set(u.id,{key:`${u.point.at}:${u.point.quality}`,at:u.point.at});
    this.pendingWrites++;
    void this.queue(async()=>{
      const begun=performance.now();let saved=0;
      try{
      if(!this.config.enabled||this.config.pausedReason)return;
      if(!this.config.lastCleanupAt||now-this.config.lastCleanupAt>=60000)await this.prune();
      const batch: {file:string;sample:SiteSample;line:string;key:string}[]=[];
      for(const u of accepted){
        const sourceAt=u.point.at,key=`${sourceAt}:${u.point.quality}`,previous=this.latest.get(u.id);
        if(previous?.key===key||previous&&sourceAt<previous.at)continue;
        const at=u.point.quality==="Live"?sourceAt:now;
        if(!Number.isFinite(at)||at>now+30000||at<now-this.config.retentionDays*DAY)continue;
        const sample:SiteSample={id:u.id,label:u.label,array:u.array,segment:u.segment,unit:u.unit,ip:u.ip,receivedAt:now,sourceAt,point:{...u.point,at}};
        const file=`${Math.floor(at/HOUR)*HOUR}-${hash(u.id)}.jsonl`;
        batch.push({file,sample,key,line:JSON.stringify(sample)+"\n"});
      }
      const bytes=batch.reduce((sum,b)=>sum+Buffer.byteLength(b.line),0);if(!bytes)return;
      if(this.used()+bytes>this.config.maxBytes)throw new Error("Site history storage cap reached; unexpired data preserved. Increase the cap or wait for expiry, then resume");
      if(await this.disk()-bytes<this.reserveBytes)throw new Error("Free-disk reserve reached; site recording paused");
      await boundedHistoryWork(batch,process.env.PRIZM_HISTORY_PARALLEL_WRITES==="false"?1:4,async({file,sample,line,key})=>{
        const destination=path.join(this.directory,file);
        const stat=await fs.lstat(destination).catch(e=>{if(e.code==="ENOENT")return null;throw e;});if(stat&&(!stat.isFile()||stat.isSymbolicLink()))throw new Error("Invalid history shard");
        // Separate a torn tail from the next valid record after a crash.
        if(stat?.size){const tail=await fs.open(destination,"r+");try{const last=Buffer.alloc(1);await tail.read(last,0,1,stat.size-1);if(last[0]!==10){await tail.write(Buffer.from("\n"),0,1,stat.size);await tail.sync();}}finally{await tail.close();}}
        const f=await fs.open(destination,"a");try{await f.writeFile(line);await f.sync();}finally{await f.close();this.files.set(file,(await fs.stat(destination)).size);}
        this.devices.set(sample.id,{id:sample.id,array:sample.array,segment:sample.segment,unit:sample.unit,label:sample.label,ip:sample.ip});
        this.latest.set(sample.id,{key,at:sample.sourceAt});this.config.lastSavedAt=now;
        saved++;
      });
      await this.save();
      }catch(e){this.config.pausedReason=String(e);if(this.configured)await this.save().catch(()=>{});}
      finally{this.lastBatchDurationMs=Math.round(performance.now()-begun);this.lastBatchSamples=saved;}
    }).catch(e=>{this.config.pausedReason=String(e);}).finally(()=>{
      this.pendingWrites--;
      for(const u of accepted)if(this.scheduled.get(u.id)?.key===`${u.point.at}:${u.point.quality}`)this.scheduled.delete(u.id);
    });
  }
  private async prune(){
    if(!this.configured)return;
    const cutoff=this.clock()-this.config.retentionDays*DAY;
    const expired=[...this.files.keys()].filter(file=>Number(shardPattern.exec(file)![1])<cutoff);
    await boundedHistoryWork(expired,process.env.PRIZM_HISTORY_PARALLEL_WRITES==="false"?1:4,async file=>{
      const hour=Number(shardPattern.exec(file)![1]);
      const destination=path.join(this.directory,file);
      if(hour+HOUR<=cutoff){await fs.unlink(destination).catch(e=>{if(e.code!=="ENOENT")throw e;});this.files.delete(file);return;}
      // Rewrite only the cutoff hour to enforce the precise timestamp boundary.
      const temp=destination+".prune";const output=await fs.open(temp,"w");let bytes=0;
      let buffer="";
      try{for await(const sample of readSiteSamples(destination)){if(sample.point.at<cutoff)continue;const line=JSON.stringify(sample)+"\n";buffer+=line;bytes+=Buffer.byteLength(line);if(buffer.length>=65536){await output.writeFile(buffer);buffer="";}}if(buffer)await output.writeFile(buffer);await output.sync();}finally{await output.close();}
      if(bytes){await fs.rename(temp,destination);this.files.set(file,bytes);}else{await fs.unlink(temp);await fs.unlink(destination).catch(e=>{if(e.code!=="ENOENT")throw e;});this.files.delete(file);}
    });
    this.config.lastCleanupAt=this.clock();await this.save();
  }
  async maintain(){if(this.closed)return;return this.queue(()=>this.prune());}
  async historyDevices(){
    await this.ready;if(this.fatal)throw new Error(this.fatal);
    if(this.currentSite&&this.config.siteKey&&this.config.siteKey!==hash(this.currentSite.id))throw new Error("Recorded history belongs to a different site");
    const retained=new Set([...this.files.keys()].filter(f=>Number(shardPattern.exec(f)![1])+HOUR>this.clock()-this.config.retentionDays*DAY).map(f=>shardPattern.exec(f)![2]));
    return [...this.devices.values()].filter(d=>retained.has(hash(d.id))).sort((a,b)=>a.array-b.array||a.segment.localeCompare(b.segment,undefined,{numeric:true})||a.unit-b.unit);
  }
  reviewStatus():ThermalReviewJob {
    if(process.env.PRIZM_THERMAL_REVIEW_ENABLED==="false")return {state:"disabled",completed:0,total:0};
    return this.reviewJob;
  }
  cancelReview(){this.reviewGeneration++;this.reviewJob={state:"cancelled",completed:0,total:0};return this.reviewStatus();}
  async startReview(hours:number,currentDevices:HistoryDevice[]){
    if(process.env.PRIZM_THERMAL_REVIEW_ENABLED==="false")throw new Error("Thermal morning review disabled");
    if(![12,24].includes(hours))throw new Error("Choose a 12 or 24 hour review");
    await this.ready;
    if(this.fatal)throw new Error(this.fatal);
    if(!this.currentSite||!this.config.siteKey||hash(this.currentSite.id)!==this.config.siteKey)throw new Error("Wait for matching site identity and recorded history");
    const requestedSite=this.currentSite.id;
    if(this.reviewJob.state==="building")return this.reviewJob;
    const devices=[...new Map([...(await this.historyDevices()),...currentDevices].map(d=>[d.id,d])).values()];
    if(!devices.length)throw new Error("No thermal devices available for review");
    if(devices.length>2048)throw new Error("Review target limit exceeded");
    // Re-check after asynchronous directory readiness/catalogue work.
    if(this.reviewStatus().state==="building")return this.reviewJob;
    if(!this.currentSite||this.currentSite.id!==requestedSite||hash(this.currentSite.id)!==this.config.siteKey)throw new Error("Site changed before review started");
    const to=this.clock(),from=to-hours*HOUR,siteKey=this.config.siteKey!,siteLabel=this.config.siteLabel||this.currentSite.label;
    if(this.reviewJob.state==="ready"&&this.reviewJob.report&&to-this.reviewJob.report.to<5*60000&&this.reviewJob.report.to-this.reviewJob.report.from===hours*HOUR)return this.reviewJob;
    const generation=++this.reviewGeneration;
    this.reviewJob={state:"building",completed:0,total:devices.length};
    const check=()=>{if(generation!==this.reviewGeneration||process.env.PRIZM_THERMAL_REVIEW_ENABLED==="false"||!this.currentSite||hash(this.currentSite.id)!==siteKey)throw new Error("Review cancelled or site changed");};
    // One bounded disk reader, separate from the recorder queue. Never use chart representatives for analysis.
    void (async()=>{
      const rows:ThermalReviewRow[]=[];
      const files=[...this.files.keys()].sort();
      for(const device of devices){
        check();const accumulator=new ThermalReviewAccumulator(device,from,to),targetHash=hash(device.id);
        const selected=files.filter(file=>{const match=shardPattern.exec(file)!;const hour=Number(match[1]);return match[2]===targetHash&&hour<=to&&hour+HOUR>=from-REVIEW_GAP_MS;});
        let count=0;
        for(const file of selected)for await(const sample of readSiteSamples(path.join(this.directory,file))){
          check();if(sample.id===device.id)accumulator.consume(sample.point);
          if(++count%500===0)await new Promise<void>(resolve=>setImmediate(resolve));
        }
        rows.push(accumulator.finish());check();this.reviewJob={state:"building",completed:rows.length,total:devices.length};
        // Let live writes and interactive history queries run between targets.
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      check();this.reviewJob={state:"ready",completed:devices.length,total:devices.length,report:finishThermalReview(rows,siteKey,siteLabel,from,to,this.clock())};
    })().catch(error=>{if(generation===this.reviewGeneration)this.reviewJob={state:"failed",completed:this.reviewJob.completed,total:devices.length,error:String(error)};});
    return this.reviewJob;
  }
  async query(ids:string[],from:number,to:number,metric:ThermalMetric,filters:HistoryFilters={},signal?:AbortSignal){
    if(this.closed)throw new Error("History reader is closed");
    if(this.queries>=2)throw new Error("History reader busy; retry when the current query finishes");
    this.queries++;
    try{return await this.readQuery(ids,from,to,metric,filters,signal);}finally{this.queries--;}
  }
  private async readQuery(ids:string[],from:number,to:number,metric:ThermalMetric,filters:HistoryFilters,signal?:AbortSignal){
    const checkCancelled=()=>{if(signal?.aborted)throw new Error("History request cancelled");};
    checkCancelled();
    validateHistoryFilters(filters);
    await this.ready;if(this.fatal)throw new Error(this.fatal);
    if(ids.length>2048||!Number.isFinite(from)||!Number.isFinite(to)||from>to||!Object.prototype.hasOwnProperty.call(thermalMetrics,metric))throw new Error("Invalid site history query");
    if(this.currentSite&&this.config.siteKey&&this.config.siteKey!==hash(this.currentSite.id))throw new Error("Recorded history belongs to a different site");
    const start=Math.max(from,this.clock()-this.config.retentionDays*DAY),end=Math.min(to,this.clock());
    return this.queryWorker.run({
      directory:this.directory,files:[...this.files.keys()],ids,start,end,metric,filters,
      chunked:process.env.PRIZM_HISTORY_CHUNKED_READS!=="false",
    },signal);
  }

  async flush(){await this.ready;await this.tail;}
  close():Promise<void>{
    if(this.closing)return this.closing;
    this.closed=true;this.cancelReview();if(this.timer)clearInterval(this.timer);
    this.closing=(async()=>{await this.queryWorker.close();await this.flush();if(this.lockToken){const file=path.join(this.directory,"writer-lock.json");const owner=JSON.parse(await fs.readFile(file,"utf8"));if(owner.token===this.lockToken)await fs.unlink(file);this.lockToken=null;}})();
    return this.closing;
  }
}
