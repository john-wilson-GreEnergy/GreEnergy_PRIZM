import path from "node:path";
import {createHash} from "node:crypto";
import type {SiteSample} from "./siteHistory";
import {matchesHistory, type HistoryFilters} from "./historyReview";
import {reviewReading} from "./thermalReviewPresentation";
import {applicableThermalPoint, thermalSegmentType} from "./thermalModel";
import {thermalDisplayValues, type ThermalMetric} from "./thermalMetrics";
import {readSiteSamples, visitHistoryLines} from "./historyIo";

const HOUR=3600000;
const shardPattern=/^(\d{10,16})-([a-f0-9]{64})\.jsonl$/;
const hash=(text:string)=>createHash("sha256").update(text).digest("hex");
export type HistoryQueryInput = {
  directory:string; files:string[]; ids:string[]; start:number; end:number;
  metric:ThermalMetric; filters:HistoryFilters; chunked:boolean;
};
// One projection implementation for both worker and cooperative rollback.
// Only a server-owned shard manifest reaches this function; no client file paths.
export async function projectHistoryQuery(input:HistoryQueryInput,checkCancelled=()=>{}){
  const {ids,start,end,metric,filters}=input;
    type Bucket={first:SiteSample;last:SiteSample;min:SiteSample;max:SiteSample;gap?:SiteSample};
    // Bound total representatives while retaining every selected device and its extrema.
    const bucketCount=Math.max(1,Math.min(240,Math.floor(10000/(Math.max(1,new Set(ids).size)*5))));
    const width=Math.max(1,(end-start)/bucketCount);
    const uniqueIds=[...new Set(ids)];
    const deviceByHash=new Map(uniqueIds.map((id,index)=>[hash(id),index]));
    const filesByDevice=uniqueIds.map(()=>[] as string[]);
    for(const file of input.files){
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
      const visit=(s:SiteSample)=>{
        checkCancelled();
        if(s.id!==id||s.point.at<start||s.point.at>end)return;
        if(previous&&s.point.at-previous.point.at>120000)consume({...previous,gap:true,point:{...previous.point,at:previous.point.at+1,quality:"Unavailable"}});
        consume(s);previous=s;
      };
      for(const file of files){
        if(input.chunked === false){
          for await(const sample of readSiteSamples(path.join(input.directory,file)))visit(sample);
        }else await visitHistoryLines(path.join(input.directory,file),value=>{
          const sample=value as SiteSample|null;
          if(sample&&typeof sample.id==="string"&&Number.isFinite(sample.point?.at))visit(sample);
        },checkCancelled);
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
export type HistoryQueryResult = Awaited<ReturnType<typeof projectHistoryQuery>>;
