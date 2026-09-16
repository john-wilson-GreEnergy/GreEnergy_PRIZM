import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import {matchesHistory,validateHistoryFilters} from "./historyReview";
import {SiteHistory} from "./siteHistory";
import {thermalUnits} from "./thermalModel";
let now=Date.now();const make=(current:number)=>thermalUnits([{ip:"10.0.0.1",arrayIndex:1,segmentLabel:"ES1",lastSuccessUtc:new Date(now).toISOString(),spaceTemperatureC:30,hvac1:{currentA:current,compressorOn:true,reversingValveOn:false},hvac2:{currentA:0,compressorOn:false,electricHeatOn:false}}],now);
const p=make(0)[0].point;
assert(matchesHistory(p,"space",{minimum:85,maximum:87}),"Numeric temperatures are filtered in Fahrenheit");
assert(!matchesHistory(p,"space",{maximum:85}));
assert(matchesHistory(p,"current",{minimum:0,maximum:0}));
assert(!matchesHistory({...p,quality:"Stale"},"current",{minimum:0}));
assert(!matchesHistory({...p,current:null},"current",{maximum:10}));
assert(matchesHistory(p,"current",{mode:"Cooling",faults:"without"}));
assert(!matchesHistory({...p,faults:undefined},"current",{faults:"without"}));
assert(matchesHistory({...p,faults:["Fault"]},"current",{faults:"with"}));
assert.throws(()=>validateHistoryFilters({minimum:10,maximum:1}),/range/);
assert.throws(()=>validateHistoryFilters({mode:"invented"}),/filter/);
const dir=await fs.mkdtemp("/tmp/prizm-history-review-");const store=new SiteHistory(dir,0,()=>now,false);const site={id:"fixture",label:"Fixture"};await store.status();store.ingest(make(0),site);await store.configure({enabled:true,retentionDays:7,maxGiB:1});
for(const reading of [0,50,100]){now+=1000;store.ingest(make(reading),site);await store.flush();}
const id=make(0)[0].id;
const result=await store.query([id],now-7*86400000,now,"current",{minimum:40,maximum:60});
assert.deepEqual(result.points.filter(p=>!p.excluded).map(p=>p.point.current),[50],"Filter BEFORE downsampling so a middle-value match is retained");
assert(result.points.some(p=>p.excluded),"Rejected observations remain gap markers");
assert.equal((await store.historyDevices()).length,2);
store.ingest([],site);assert.equal((await store.historyDevices()).length,2,"Offline devices remain selectable from retained metadata");
await store.close();const resumed=new SiteHistory(dir,0,()=>now,false);assert.equal((await resumed.historyDevices()).length,2);await resumed.close();
console.log("History filter, pre-summary matching and retained-device catalogue tests passed");

const wholeDir=await fs.mkdtemp("/tmp/prizm-whole-history-");
const whole=new SiteHistory(wholeDir,0,()=>now,false);
const units=Array.from({length:336},(_,i)=>({...make(i)[0],id:`site/${i}`,array:Math.floor(i/48)+1}));
whole.ingest(units,site);await whole.configure({enabled:true,retentionDays:7,maxGiB:1});
for(let i=0;i<20;i++){now+=60000;whole.ingest(units.map(u=>({...u,point:{...u.point,at:now,sourceAt:now,current:i===10?999:i}})),site);await whole.flush();}
const all=await whole.query(units.map(u=>u.id),now-7*86400000,now,"current");
assert.equal(new Set(all.points.map(p=>p.id)).size,336);
assert.equal(new Set(all.points.filter(p=>p.point.current===999).map(p=>p.id)).size,336,"Every device peak survives whole-site reduction");
assert(all.points.length<=12000,"Whole-site output remains bounded");
await whole.close();
console.log("336-device retained history and extrema bounds passed");
