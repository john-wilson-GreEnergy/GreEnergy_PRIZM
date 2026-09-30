import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import {boundedHistoryWork,visitHistoryLines} from "./historyIo";
import {SiteHistory} from "./siteHistory";
import {thermalUnits} from "./thermalModel";

const root=await fs.mkdtemp("/tmp/prizm-history-io-");
const file=path.join(root,"lines.jsonl");
await fs.writeFile(file,'{"id":1}\nnot-json\n'+JSON.stringify({text:"é".repeat(70000)})+'\n{"id":2}\n{"torn":');
const rows:unknown[]=[];await visitHistoryLines(file,v=>rows.push(v));assert.equal(rows.length,3);
await assert.rejects(()=>visitHistoryLines(file,()=>{throw new Error("consumer failure");}),/consumer failure/);
await assert.rejects(()=>visitHistoryLines(file,()=>{},()=>{throw new Error("cancelled");}),/cancelled/);
const link=path.join(root,"link");await fs.symlink(file,link);await visitHistoryLines(link,()=>assert.fail("symlink read"));
let running=0,peak=0,finished=0;
await assert.rejects(()=>boundedHistoryWork([0,1,2,3,4,5],4,async i=>{
  running++;peak=Math.max(peak,running);
  try{await new Promise(r=>setTimeout(r,i===0?1:10));if(i===0)throw new Error("disk failure");finished++;}finally{running--;}
}),/disk failure/);
assert.equal(running,0);assert.equal(peak,4);assert.equal(finished,3,"All started writes drained; no new writes after failure");

let now=Date.UTC(2026,8,23,12);const site={id:"io-test",label:"IO Test"};
const units=(at:number,current=2)=>thermalUnits(Array.from({length:21},(_,i)=>({ip:`10.0.1.${10+i}`,arrayIndex:1,segmentLabel:i===0?"CS1":`ES${i}`,lastSuccessUtc:new Date(at).toISOString(),spaceTemperatureC:30,avgCellTemperatureC:28,hvac1:{currentA:current,compressorOn:true},hvac2:{currentA:0,compressorOn:false}})),at);
const store=new SiteHistory(path.join(root,"store"),0,()=>now,false);await store.status();store.ingest(units(now),site);await store.configure({enabled:true,retentionDays:7,maxGiB:1});
for(let batch=0;batch<4;batch++){
  now+=5000;const observation=units(now,batch);
  store.ingest(observation,site);store.ingest(observation,site);
}
await store.flush();assert.equal((await store.status()).droppedSamples,0,"Duplicate queued readings do not consume queue slots or count as drops");
let result=await store.query([units(now)[0].id],now-60000,now,"current");
assert.equal(result.points.length,4,"Every distinct queued observation is retained");
for(let batch=0;batch<5;batch++){now+=5000;store.ingest(units(now,9),site);}
await store.flush();assert.equal((await store.status()).droppedSamples,42,"Only the unique fifth batch is counted as overload");
process.env.PRIZM_HISTORY_PARALLEL_WRITES="false";
now+=5000;store.ingest(units(now,17),site);await store.flush();
assert.equal((await store.status()).lastBatchSamples,42,"Serial rollback still records every target");
assert((await store.query([units(now)[0].id],now,now,"current")).points.some(p=>p.point.current===17));
await store.maintain();delete process.env.PRIZM_HISTORY_PARALLEL_WRITES;
await store.close();

// Representative fixed-window fixture: 42 targets, 1,440 observations each.
// Direct fixture creation is intentional; no production history is touched.
const start=now-2*3600000,targets=units(start);
for(const target of targets){
  const byFile=new Map<string,string[]>();
  for(let i=0;i<1440;i++){
    const at=start+i*5000,point={...target.point,at,current:i===777?99:i%13,quality:i===200?"Unavailable":"Live"};
    const sample={id:target.id,label:target.label,array:target.array,segment:target.segment,unit:target.unit,ip:target.ip,sourceAt:at,receivedAt:at,point};
    const name=`${Math.floor(at/3600000)*3600000}-${createHash("sha256").update(target.id).digest("hex")}.jsonl`;
    const lines=byFile.get(name)||[];lines.push(JSON.stringify(sample));byFile.set(name,lines);
  }
  for(const [name,lines] of byFile)await fs.writeFile(path.join(root,"store",name),lines.join("\n")+"\n");
}
const read=new SiteHistory(path.join(root,"store"),0,()=>now,false);await read.status();read.ingest([],site);
const ids=targets.map(t=>t.id),timings:{legacy:number[];chunked:number[]}={legacy:[],chunked:[]};
let baseline:unknown;
for(let round=0;round<3;round++)for(const mode of (round%2?["chunked","legacy"]:["legacy","chunked"]) as (keyof typeof timings)[]){
  process.env.PRIZM_HISTORY_CHUNKED_READS=mode==="legacy"?"false":"true";
  const begun=performance.now();const actual=await read.query(ids,start,now,"current");timings[mode].push(Math.round(performance.now()-begun));
  if(!baseline)baseline=actual;else assert.deepEqual(actual,baseline,"Chunked and rollback readers return identical graph payloads");
}
const cancelled=new AbortController();cancelled.abort();await assert.rejects(()=>read.query(ids,start,now,"current",{},cancelled.signal),/cancelled/);
delete process.env.PRIZM_HISTORY_CHUNKED_READS;
await read.close();
console.log(JSON.stringify({passed:true,targets:42,observations:60480,timingsMs:timings,fixture:root}));
