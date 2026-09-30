import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import {ThermalReviewAccumulator} from "./thermalMorningReview";
import {SiteHistory} from "./siteHistory";
import type {ThermalPoint, ThermalUnit} from "./thermalModel";

const minute=60000, from=Date.UTC(2026,8,23), to=from+20*minute;
const device={id:"10.0.1.10/hvac/1",array:1,segment:"ES1",unit:1,ip:"10.0.1.10",label:"Array 1 · ES1 · HVAC 1"};
const point=(at:number,on:boolean,extra:Partial<ThermalPoint>={}):ThermalPoint=>({at,space:30,supply:29,current:on?8:0,rpm:null,cooling:25,heating:10,mode:on?"Cooling":"Idle",quality:"Live",commands:{compressor:on,electricHeat:false,reversingValve:false,fanLow:on,fanHigh:false},faults:[],cell:28,...extra});
const run=new ThermalReviewAccumulator(device,from,to);
for(let i=0;i<=20;i++)run.consume(point(from+i*minute,i>0&&i!==2,{faults:i>=5&&i<8?["Example fault"]:[]}));
const row=run.finish();
assert.equal(row.coveragePct,100);
assert.equal(row.starts,2);
assert.equal(row.shortCycles,1);
assert.equal(row.commandedMs,18*minute);
assert.equal(row.faultAppeared,1);assert.equal(row.faultCleared,1);
assert.equal(row.weakCoolingMs,14*minute);
assert.equal(row.display.peakSpace,"86.0 °F");
assert.equal(row.longestGapMs,0);
const gap=new ThermalReviewAccumulator(device,from,to);
gap.consume(point(from,true));gap.consume(point(from+minute,true));gap.consume(point(to,false));
assert.equal(gap.finish().coveredMs,minute);assert.equal(gap.finish().shortCycles,0);assert.equal(gap.finish().longestGapMs,19*minute);
const absent=new ThermalReviewAccumulator(device,from,to).finish();assert.equal(absent.coveragePct,0);assert.equal(absent.display.commanded,"Unknown");assert.equal(absent.longestGapMs,to-from);
const cs=new ThermalReviewAccumulator({...device,segment:"CS"},from,to);cs.consume(point(from,false,{cell:9999}));assert.equal(cs.finish().peakCellC,null);assert.match(cs.finish().display.peakCell,/N\/A/);
const legacy=new ThermalReviewAccumulator(device,from,to);legacy.consume(point(from,false,{commands:undefined,faults:undefined}));legacy.consume(point(from+minute,true,{commands:undefined,faults:["Already present"]}));assert.equal(legacy.finish().starts,0);assert.equal(legacy.finish().faultAppeared,0);assert.equal(legacy.finish().commandCoveragePct,0);
const stale=new ThermalReviewAccumulator(device,from,to);stale.consume(point(from,false));stale.consume(point(from+minute,true,{quality:"Stale",cell:999}));stale.consume(point(from+2*minute,true));assert.equal(stale.finish().coveredMs,0);assert.equal(stale.finish().peakCellC,28);assert.equal(stale.finish().starts,0);
const duplicate=new ThermalReviewAccumulator(device,from,to);duplicate.consume(point(from,false));duplicate.consume(point(from,false,{quality:"Unavailable"}));duplicate.consume(point(from+minute,true));assert.equal(duplicate.finish().coveredMs,0);
// Do not count an already-running partial cycle as a complete short cycle.
const initial=new ThermalReviewAccumulator(device,from,to);initial.consume(point(from,true));initial.consume(point(from+minute,false));assert.equal(initial.finish().shortCycles,0);
const boundary=new ThermalReviewAccumulator(device,from,to);boundary.consume(point(from-2*minute,false));boundary.consume(point(from-minute,true));boundary.consume(point(from+minute,false));assert.equal(boundary.finish().shortCycles,0,"Cycles starting before the window are partial");

const root=await fs.mkdtemp("/tmp/prizm-morning-review-");let now=from;
const store=new SiteHistory(path.join(root,"site"),0,()=>now,false),site={id:"review-fixture",label:"Fixture"};
await store.status();const unit=(p:ThermalPoint):ThermalUnit=>({...device,point:p,faults:[]});
store.ingest([unit(point(now,false))],site);await store.configure({enabled:true,retentionDays:7,maxGiB:1});
for(let i=0;i<=20;i++){now=from+i*minute;store.ingest([unit(point(now,i>0&&i!==2))],site);await store.flush();}
const before=(await store.status()).usedBytes;
await assert.rejects(()=>store.startReview(168,[device]),/12 or 24/);
assert.equal((await store.startReview(12,[device,{...device,id:"missing",label:"Missing target"}])).state,"building");
// Duplicate clients share one in-flight build.
assert.equal((await store.startReview(24,[device])).state,"building");
async function ready(){for(let i=0;i<200;i++){const job=store.reviewStatus();if(job.state!=="building")return job;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error("Review did not finish");}
const job=await ready();assert.equal(job.state,"ready");assert.equal(job.report?.summary.units,2);assert.equal(job.report?.summary.noData,1);
assert.equal(job.report?.rows[0].starts,2);assert.equal(job.report?.rows[0].shortCycles,1);assert.equal(job.report?.rows[0].coveredMs,20*minute);
assert.equal((await store.status()).usedBytes,before,"Review does not alter recorded files");
assert.strictEqual((await store.startReview(12,[device])).report,job.report,"Recent completed reports are cached");
store.cancelReview();await store.startReview(12,[device]);store.cancelReview();assert.equal((await ready()).state,"cancelled");
await store.startReview(12,[device]);store.ingest([unit(point(now,true))],{id:"other",label:"Other"});await new Promise(resolve=>setTimeout(resolve,30));assert.equal(store.reviewStatus().state,"idle","Site changes discard previous report/job");await assert.rejects(()=>store.startReview(12,[device]),/identity/);
store.ingest([unit(point(now,true))],site);process.env.PRIZM_THERMAL_REVIEW_ENABLED="false";assert.equal(store.reviewStatus().state,"disabled");await assert.rejects(()=>store.startReview(12,[device]),/disabled/);delete process.env.PRIZM_THERMAL_REVIEW_ENABLED;
await store.close();console.log("Thermal morning review: raw-history parity, quality gaps, CS exclusion, cycles, fault transitions, cache, cancellation and rollback passed");
