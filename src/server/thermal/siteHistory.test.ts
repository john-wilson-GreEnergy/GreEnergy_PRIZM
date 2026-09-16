import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import {SiteHistory, readSiteSamples} from "./siteHistory";
import {thermalUnits} from "./thermalModel";
const root=await fs.mkdtemp("/tmp/prizm-seven-day-test-");
const DAY=86400000;let now=Date.UTC(2026,0,1,12,30);
const site={id:"station-1:block1:ems",label:"Test Site"};
const units=(at=now,current=2)=>thermalUnits(Array.from({length:6},(_,i)=>({ip:`10.0.0.${i+1}`,arrayIndex:1,segmentLabel:`ES${i+1}`,lastSuccessUtc:new Date(at).toISOString(),spaceTemperatureC:30,avgCellTemperatureC:28,hvac1:{currentA:current,compressorOn:true,reversingValveOn:false,fanLowOn:true},hvac2:{currentA:0,compressorOn:false,electricHeatOn:false}})),at);
const store=new SiteHistory(path.join(root,"site"),0,()=>now,false);await store.status();
store.ingest(units(),site);await store.configure({enabled:true,retentionDays:7,maxGiB:1});
for(let day=0;day<8;day++){store.ingest(units(),site);await store.flush();if(day<7)now+=DAY;}
assert.equal((await store.status()).unitCount,12,"All units recorded beyond the graph cap");
const id=units()[0].id;
let query=await store.query([id],now-10*DAY,now,"current");assert(query.points.length>0);assert(query.points.every(p=>p.point.at>=now-7*DAY));
// Precise cutoff rewrite preserves younger samples in the same hour.
now+=5*60000;await store.maintain();
for(const f of await fs.readdir(path.join(root,"site"))){if(f.endsWith(".jsonl"))for await(const s of readSiteSamples(path.join(root,"site",f)))assert(s.point.at>=now-7*DAY);}
assert((await store.status()).usedBytes>0);
// Disk-only history keeps extrema and observed source gaps in bounded results.
for(let i=0;i<300;i++){now+=5000;store.ingest(units(now,i===100?99:2),site);await store.flush();}
query=await store.query([id],now-DAY,now,"current");assert(query.points.some(p=>p.point.current===99));assert(query.points.some(p=>p.point.quality==="Unavailable"));assert(query.points.length<=1205);
assert(query.points.some(p=>p.point.commands?.fanLow===true));
await assert.rejects(()=>store.query(Array(2049).fill(id),0,now,"current"),/Invalid/);
await assert.rejects(()=>store.configure({enabled:true,retentionDays:8,maxGiB:1}),/1–7/);
const bytes=(await store.status()).usedBytes;store.ingest(units(),site);await store.flush();assert.equal((await store.status()).usedBytes,bytes,"Duplicate source timestamps are not repeated");
await fs.writeFile(path.join(root,"targeted.jsonl"),"preserve targeted recording");
await fs.writeFile(path.join(root,"site","unrelated.txt"),"preserve unrelated file");
await store.close();
const resumed=new SiteHistory(path.join(root,"site"),0,()=>now,false);await resumed.status();resumed.ingest(units(),site);await resumed.flush();assert.equal((await resumed.status()).usedBytes,bytes,"Restart recovers deduplication");
resumed.ingest(units(),{id:"different",label:"Other Site"});assert.match((await resumed.status()).pausedReason||"",/identity/);
await assert.rejects(()=>resumed.query([id],now-DAY,now,"space"),/different site/);
resumed.ingest(units(),site);await resumed.configure({enabled:false,retentionDays:1,maxGiB:1});
now+=2*DAY;await resumed.maintain();assert.equal((await resumed.status()).usedBytes,0,"Expiry continues after recording stops");
assert.equal(await fs.readFile(path.join(root,"targeted.jsonl"),"utf8"),"preserve targeted recording");assert.equal(await fs.readFile(path.join(root,"site","unrelated.txt"),"utf8"),"preserve unrelated file");
await resumed.close();
// Recovery prunes expired files before serving queries.
const again=new SiteHistory(path.join(root,"site"),0,()=>now,false);await again.status();again.ingest(units(),site);await again.configure({enabled:true,retentionDays:1,maxGiB:1});again.ingest(units(),site);await again.flush();await again.close();now+=2*DAY;
const expired=new SiteHistory(path.join(root,"site"),0,()=>now,false);assert.equal((await expired.status()).usedBytes,0);await expired.close();
const blocked=new SiteHistory(path.join(root,"reserve"),Number.MAX_SAFE_INTEGER,()=>now,false);await blocked.status();blocked.ingest(units(),site);await assert.rejects(()=>blocked.configure({enabled:true,retentionDays:7,maxGiB:1}),/reserve/);await blocked.close();
// An ownership marker is required before cleanup can touch any existing directory.
await fs.mkdir(path.join(root,"unowned"));await fs.writeFile(path.join(root,"unowned","keep.jsonl"),"keep");const unowned=new SiteHistory(path.join(root,"unowned"),0,()=>now,false);assert((await unowned.status()).pausedReason);await assert.rejects(()=>unowned.maintain());assert.equal(await fs.readFile(path.join(root,"unowned","keep.jsonl"),"utf8"),"keep");await unowned.close();
console.log(`Site retention tests passed: ${root}`);
// Only one writer may own a store; a second process/instance fails closed.
const owner=new SiteHistory(path.join(root,"locking"),0,()=>now,false);await owner.status();owner.ingest(units(),site);await owner.configure({enabled:true,retentionDays:7,maxGiB:1});owner.ingest(units(),site);await owner.flush();
const competitor=new SiteHistory(path.join(root,"locking"),0,()=>now,false);assert.match((await competitor.status()).pausedReason||"",/another PRIZM/);await competitor.close();
await owner.close();
// Persisted enabled state resumes; torn final JSON cannot swallow the next valid sample.
const shard=(await fs.readdir(path.join(root,"locking"))).find(f=>f.endsWith('.jsonl'))!;
await fs.appendFile(path.join(root,"locking",shard),'{"interrupted":');
const repaired=new SiteHistory(path.join(root,"locking"),0,()=>now,false);await repaired.status();now+=5000;repaired.ingest(units(now,7),site);await repaired.flush();
const recovered:number[]=[];for await(const sample of readSiteSamples(path.join(root,"locking",shard)))recovered.push(sample.point.at);assert.equal(recovered.length,2);assert.equal(recovered.at(-1),now);
assert((await repaired.query(units().map(u=>u.id).slice(0,8),now-60000,now,"current")).points.some(p=>p.point.current===7));await repaired.close();
// Disk cap pauses instead of deleting any unexpired observations.
const marker=path.join(root,"locking","storage.json");const cfg=JSON.parse(await fs.readFile(marker,"utf8"));cfg.maxBytes=1;await fs.writeFile(marker,JSON.stringify(cfg));
const capped=new SiteHistory(path.join(root,"locking"),0,()=>now,false);await capped.status();const before=(await capped.status()).usedBytes;now+=5000;capped.ingest(units(now,8),site);await capped.flush();assert.match((await capped.status()).pausedReason||"",/cap reached/);assert.equal((await capped.status()).usedBytes,before);await capped.close();
console.log("Site recorder locking, torn-tail recovery and disk-cap tests passed");
process.env.PRIZM_SITE_HISTORY_ENABLED="false";
const rollback=new SiteHistory(path.join(root,"site"),0,()=>now,false);assert.match((await rollback.status()).pausedReason||"",/disabled/);await assert.rejects(()=>rollback.configure({enabled:true,retentionDays:7,maxGiB:1}),/disabled/);await rollback.close();delete process.env.PRIZM_SITE_HISTORY_ENABLED;
console.log("Site-only rollback flag passed");
