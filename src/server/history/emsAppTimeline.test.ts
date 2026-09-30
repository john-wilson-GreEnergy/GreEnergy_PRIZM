import assert from "node:assert/strict";
import {mkdtemp} from "node:fs/promises";
import {OperationalTimeline} from "./operationalTimeline";
import {projectEmsAppTimeline} from "./emsAppTimelineProjection";
import {beginBlockTimelineCommand} from "./commandTimeline";
const base = "http://fixture:8080/turtle", site = {id: JSON.stringify(["Fixture",1,base]),label:"Fixture"};
let now = Date.now();
const app = {appCode:"PC00001",priority:40,enabledRaw:false,sourceTimestampUtc:new Date(now).toISOString(),sourceBaseUrl:base,sourceLive:true,
  powerControlSetpoints:{realPowerkW:-5,reactivePowerkVAr:0}};
const [o] = projectEmsAppTimeline([app],base,1,now);
assert.equal(o.scope,"block");assert.equal(o.array,0);assert.equal(o.quality,"live");
assert.equal(o.values["Reported enabled"],"DISABLED");assert.equal(o.values["Reported setpoint kW"],-5);assert.equal(o.values["Reported setpoint kVAR"],0);
assert.equal(projectEmsAppTimeline([{...app,enabledRaw:undefined}],base,1,now)[0].values["Reported enabled"],null);
assert.equal(projectEmsAppTimeline([{...app,sourceLive:false}],base,1,now)[0].quality,"unavailable");
assert.equal(projectEmsAppTimeline([{...app,stalePreserved:true}],base,1,now)[0].quality,"unavailable");
assert.equal(projectEmsAppTimeline([app],"http://another:8080/turtle",1,now)[0].quality,"unavailable");
assert.equal(projectEmsAppTimeline([app],base,null,now).length,0);
const storage = new OperationalTimeline(await mkdtemp('/tmp/prizm-app-timeline-'),{maxBytes:5_000_000,reserveBytes:0},()=>now);
storage.ingest({site,observations:[o]}); await storage.flush();
const command = beginBlockTimelineCommand(base,{stationCode:"Fixture",blockIndex:1},"Power Control: requested -5 kW, 0 kVAR",storage);
command.result({accepted:true,readbackConfirmed:null}); await storage.flush();now=Date.now()+100;
for(const array of [1,8]) {
  const r=await storage.query(array,1,2);
  assert.equal(r.events.filter(e=>e.kind==='command').length,2);
  assert(r.events.some(e=>e.label==='Block 1 · All arrays'));
  assert.equal(r.coverage.length,1);assert.equal(r.coverage[0].stream,'ems-app');assert.equal(r.points.length,0);
  assert(r.events.some(e=>e.message.includes('Reported setpoint kW: -5')));
}
beginBlockTimelineCommand(base,{stationCode:"Wrong",blockIndex:1},"EMS app DISABLE",storage);
assert.equal(storage.status().droppedCommands,1,"Same URL but wrong station cannot misattribute commands");
now+=130_000;
storage.ingest({site,observations:projectEmsAppTimeline([app],base,1,now)});await storage.flush();
assert((await storage.query(1,1)).events.some(e=>e.message==='ems-app: telemetry unavailable'));
// New block commands must survive event truncation even though block shards sort before arrays.
now+=60_000;
storage.ingest({site,observations:Array.from({length:310},(_,i)=>({entity:`fixture:${i}`,array:1,label:`Old ${i}`,stream:'pcs-status' as const,source:'fixture',sourceAt:now-1000,observedAt:now-1000,quality:'live' as const,values:{State:'OPEN'}}))}); await storage.flush();
storage.recordCommand(site,{entity:'newest',scope:'block',array:0,label:'Newest block command',stream:'command',source:'fixture',sourceAt:now,observedAt:now,quality:'live',values:{Summary:'newest command',commandId:'newest'}});await storage.flush();
const capped=await storage.query(1,1);assert(capped.eventsTruncated);assert.equal(capped.events.length,300);assert.equal(capped.events[0].commandId,'newest');
process.env.PRIZM_OPERATIONAL_TIMELINE_ENABLED='false';const bytes=storage.status().usedBytes;
beginBlockTimelineCommand(base,{stationCode:'Fixture',blockIndex:1},'EMS app DISABLE',storage);await storage.flush();assert.equal(storage.status().usedBytes,bytes);
delete process.env.PRIZM_OPERATIONAL_TIMELINE_ENABLED;await storage.close();
console.log('Block-scope app/power history, freshness, filtering, event ordering and rollback passed (fixtures only)');
