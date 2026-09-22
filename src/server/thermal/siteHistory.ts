import {matchesHistory,validateHistoryFilters,type HistoryFilters,type HistoryDevice} from "./historyReview";
import {reviewReading} from "./thermalReviewPresentation";
import * as fs from "node:fs/promises";
import {createReadStream} from "node:fs";
import {createInterface} from "node:readline";
import {createHash,randomUUID} from "node:crypto";
import path from "node:path";
import type {ThermalUnit, ThermalPoint} from "./thermalModel";
import {applicableThermalPoint, thermalSegmentType} from "./thermalModel";
import {thermalDisplayValues, thermalMetrics, type ThermalMetric} from "./thermalMetrics";

const HOUR=3600000, DAY=24*HOUR, GiB=1024**3;
const shardPattern=/^(\d{10,16})-([a-f0-9]{64})\.jsonl$/;
const hash=(text:string)=>createHash("sha256").update(text).digest("hex");
export type SiteIdentity={id:string;label:string};
export type SiteSample={gap?:boolean;id:string;label:string;array:number;segment:string;unit:number;ip:string;receivedAt:number;sourceAt:number;point:ThermalPoint};
type Config={format:"prizm-site-thermal-v1";enabled:boolean;retentionDays:number;maxBytes:number;siteKey:string|null;siteLabel:string|null;lastSavedAt:number|null;lastCleanupAt:number|null;droppedSamples:number;pausedReason:string|null};
export type SiteStorageStatus=Config & {directory:string;usedBytes:number;freeBytes:number|null;reserveBytes:number;unitCount:number;currentSiteLabel:string|null;canStart:boolean;oldestAt:number|null;newestAt:number|null;shardCount:number;projectedSevenDayBytes:number|null};
export async function* readSiteSamples(file:string):AsyncGenerator<SiteSample>{
  const stat=await fs.lstat(file).catch(e=>{if(e.code==="ENOENT")return null;throw e;});
  if(!stat||!stat.isFile()||stat.isSymbolicLink())return;
  const input=createReadStream(file,{encoding:"utf8"});const lines=createInterface({input,crlfDelay:Infinity});
  try{for await(const line of lines){if(!line)continue;try{const sample=JSON.parse(line) as SiteSample;if(typeof sample.id==="string"&&Number.isFinite(sample.point?.at))yield sample;}catch{/* A torn final line is never a measurement. */}}}
  finally{lines.close();input.destroy();}
}

// Dependency-free hourly files indexed by target hash. No device acquisition.
export class SiteHistory {
  private config:Config={format:"prizm-site-thermal-v1",enabled:false,retentionDays:7,maxBytes:32*GiB,siteKey:null,siteLabel:null,lastSavedAt:null,lastCleanupAt:null,droppedSamples:0,pausedReason:null};
  private files=new Map<string,number>();
  private devices=new Map<string,HistoryDevice>();
  private latest=new Map<string,{key:string;at:number}>();
  private currentSite:SiteIdentity|null=null;
  private unitCount=0;
  private ready:Promise<void>;
  private tail:Promise<unknown>=Promise.resolve();
  private pending=0;
  private queries=0;
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
    return {...this.config,pausedReason:this.fatal||this.config.pausedReason,directory:this.directory,usedBytes:this.used(),freeBytes:this.freeBytes,reserveBytes:this.reserveBytes,unitCount:this.unitCount,currentSiteLabel:this.currentSite?.label??null,canStart:!!this.currentSite&&this.unitCount>0&&!this.fatal,oldestAt:oldest===null?null:Math.max(oldest,this.clock()-this.config.retentionDays*DAY),newestAt:this.config.lastSavedAt,shardCount:this.files.size,projectedSevenDayBytes:this.unitCount?this.unitCount*120960*600:null};
  }
  async configure(input:{enabled:boolean;retentionDays:number;maxGiB:number}){
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
    this.currentSite=site;this.unitCount=units.length;
    if(!this.config.enabled||this.fatal||process.env.PRIZM_SITE_HISTORY_ENABLED==="false")return;
    if(!site||hash(site.id)!==this.config.siteKey){this.config.pausedReason="Site identity changed; recording paused to prevent mixed-site history";return;}
    if(this.config.pausedReason)return;
    if(this.pending>=2){this.config.droppedSamples+=units.length;return;}
    void this.queue(async()=>{
      try{
      if(!this.config.enabled||this.config.pausedReason)return;
      if(!this.config.lastCleanupAt||now-this.config.lastCleanupAt>=60000)await this.prune();
      const batch: {file:string;sample:SiteSample;line:string;key:string}[]=[];
      for(const u of units){
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
      for(const {file,sample,line,key} of batch){
        const destination=path.join(this.directory,file);
        const stat=await fs.lstat(destination).catch(e=>{if(e.code==="ENOENT")return null;throw e;});if(stat&&(!stat.isFile()||stat.isSymbolicLink()))throw new Error("Invalid history shard");
        // Separate a torn tail from the next valid record after a crash.
        if(stat?.size){const tail=await fs.open(destination,"r+");try{const last=Buffer.alloc(1);await tail.read(last,0,1,stat.size-1);if(last[0]!==10){await tail.write(Buffer.from("\n"),0,1,stat.size);await tail.sync();}}finally{await tail.close();}}
        const f=await fs.open(destination,"a");try{await f.writeFile(line);await f.sync();}finally{await f.close();this.files.set(file,(await fs.stat(destination)).size);}
        this.devices.set(sample.id,{id:sample.id,array:sample.array,segment:sample.segment,unit:sample.unit,label:sample.label,ip:sample.ip});
        this.latest.set(sample.id,{key,at:sample.sourceAt});this.config.lastSavedAt=now;
      }
      await this.save();
      }catch(e){this.config.pausedReason=String(e);if(this.configured)await this.save().catch(()=>{});}
    }).catch(e=>{this.config.pausedReason=String(e);});
  }
  private async prune(){
    if(!this.configured)return;
    const cutoff=this.clock()-this.config.retentionDays*DAY;
    for(const file of [...this.files.keys()]){
      const hour=Number(shardPattern.exec(file)![1]);if(hour>=cutoff)continue;
      const destination=path.join(this.directory,file);
      if(hour+HOUR<=cutoff){await fs.unlink(destination).catch(e=>{if(e.code!=="ENOENT")throw e;});this.files.delete(file);continue;}
      // Rewrite only the cutoff hour to enforce the precise timestamp boundary.
      const temp=destination+".prune";const output=await fs.open(temp,"w");let bytes=0;
      try{for await(const sample of readSiteSamples(destination)){if(sample.point.at<cutoff)continue;const line=JSON.stringify(sample)+"\n";await output.writeFile(line);bytes+=Buffer.byteLength(line);}await output.sync();}finally{await output.close();}
      if(bytes){await fs.rename(temp,destination);this.files.set(file,bytes);}else{await fs.unlink(temp);await fs.unlink(destination).catch(e=>{if(e.code!=="ENOENT")throw e;});this.files.delete(file);}
    }
    this.config.lastCleanupAt=this.clock();await this.save();
  }
  async maintain(){return this.queue(()=>this.prune());}
  async historyDevices(){
    await this.ready;if(this.fatal)throw new Error(this.fatal);
    if(this.currentSite&&this.config.siteKey&&this.config.siteKey!==hash(this.currentSite.id))throw new Error("Recorded history belongs to a different site");
    const retained=new Set([...this.files.keys()].filter(f=>Number(shardPattern.exec(f)![1])+HOUR>this.clock()-this.config.retentionDays*DAY).map(f=>shardPattern.exec(f)![2]));
    return [...this.devices.values()].filter(d=>retained.has(hash(d.id))).sort((a,b)=>a.array-b.array||a.segment.localeCompare(b.segment,undefined,{numeric:true})||a.unit-b.unit);
  }
  async query(ids:string[],from:number,to:number,metric:ThermalMetric,filters:HistoryFilters={},signal?:AbortSignal){
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
    type Bucket={first:SiteSample;last:SiteSample;min:SiteSample;max:SiteSample;gap?:SiteSample};
    // Bound total representatives while retaining every selected device and its extrema.
    const bucketCount=Math.max(1,Math.min(240,Math.floor(10000/(Math.max(1,new Set(ids).size)*5))));
    const width=Math.max(1,(end-start)/bucketCount);
    const uniqueIds=[...new Set(ids)];
    const deviceByHash=new Map(uniqueIds.map((id,index)=>[hash(id),index]));
    const filesByDevice=uniqueIds.map(()=>[] as string[]);
    for(const file of this.files.keys()){
      checkCancelled();
      const match=shardPattern.exec(file);
      if(!match)continue;
      const index=deviceByHash.get(match[2]);
      const hour=Number(match[1]);
      if(index!==undefined&&hour<=end&&hour+HOUR>=start)filesByDevice[index].push(file);
    }
    // Each device has separate hourly shards. Scan a few devices concurrently
    // so an array selection does not wait for every device's disk reads in turn.
    // Keep the limit low to avoid flooding the recorder's disk with 336 readers.
    const byDevice:SiteSample[][]=new Array(uniqueIds.length);
    let nextId=0;
    const scan=async()=>{while(nextId<uniqueIds.length){
      checkCancelled();
      const index=nextId++,id=uniqueIds[index];
      const output:SiteSample[]=[];
      const buckets=new Map<number,Bucket>();
      const files=filesByDevice[index].sort();
      const value=(s:SiteSample)=>{const n=s.point[metric];return matchesHistory(s.point,metric,filters)&&s.point.quality==="Live"&&typeof n==="number"&&Number.isFinite(n)?n:null;};
      const consume=(s:SiteSample)=>{
        s={...s,point:applicableThermalPoint(s.point,thermalSegmentType(s.segment,s.point.segmentType))};
        const key=Math.floor((s.point.at-start)/width),b=buckets.get(key),v=value(s);
        if(!b){buckets.set(key,{first:s,last:s,min:s,max:s,...(v===null?{gap:s}:{})});return;}
        b.last=s;if(v===null){b.gap=s;return;}
        if(value(b.min)===null||v<value(b.min)!)b.min=s;if(value(b.max)===null||v>value(b.max)!)b.max=s;
      };
      let previous:SiteSample|undefined;
      for(const file of files)for await(const s of readSiteSamples(path.join(this.directory,file))){
        checkCancelled();
        if(s.id!==id||s.point.at<start||s.point.at>end)continue;
        if(previous&&s.point.at-previous.point.at>120000)consume({...previous,gap:true,point:{...previous.point,at:previous.point.at+1,quality:"Unavailable"}});
        consume(s);previous=s;
      }
      for(const b of buckets.values())output.push(...[b.first,b.min,b.max,...(b.gap?[b.gap]:[]),b.last]);
      byDevice[index]=output;
    }};
    await Promise.all(Array.from({length:Math.min(4,uniqueIds.length)},()=>scan()));
    checkCancelled();
    const output=byDevice.flat();
    const unique=new Map(output.map(s=>[`${s.id}:${s.point.at}:${s.point.quality}`,s]));
    return {points:[...unique.values()].sort((a,b)=>a.point.at-b.point.at).map(s=>{
      const excluded=!!s.gap||!matchesHistory(s.point,metric,filters);
      return {id:s.id,point:s.point,displayValues:thermalDisplayValues(s.point),excluded,review:reviewReading(s.point,metric,excluded)};
    }),summarized:true,from:start,to:end};
  }
  async flush(){await this.ready;await this.tail;}
  async close(){if(this.timer)clearInterval(this.timer);await this.flush();if(this.lockToken){const file=path.join(this.directory,"writer-lock.json");const owner=JSON.parse(await fs.readFile(file,"utf8"));if(owner.token===this.lockToken)await fs.unlink(file);this.lockToken=null;}}
}
