import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {build} from "esbuild";
import {projectHistoryQuery,type HistoryQueryInput} from "./historyQueryProjection";
import {HistoryQueryRunner} from "./historyQueryRunner";
import type {SiteSample} from "./siteHistory";

const root=await fs.mkdtemp(path.join(os.tmpdir(),"prizm-worker-query-"));
const workerFile=path.join(root,"history-query-worker.cjs");
await build({entryPoints:["src/server/thermal/historyQueryWorker.ts"],bundle:true,platform:"node",format:"cjs",outfile:workerFile});
const start=Date.UTC(2026,8,24,12),ids=["energy/hvac/1","collection/hvac/1"];
const files:string[]=[];
for(const [index,id] of ids.entries()){
  const file=`${start}-${createHash("sha256").update(id).digest("hex")}.jsonl`;files.push(file);
  const samples:SiteSample[]=Array.from({length:12_000},(_,i)=>({id,label:id,array:1,segment:index===0?"ES1":"CS1",unit:1,ip:"127.0.0.1",receivedAt:start+i*100,sourceAt:start+i*100,
    point:{at:start+i*100+(i>=6000?180000:0),space:20+i%7,supply:14,current:i===4000?99:i%13,cell:index===0?26:9999,rpm:null,cooling:22,heating:18,mode:i%2?"Cooling":"Idle",quality:i===3000?"Unavailable":"Live",faults:i%3?[]:["test"]}}));
  await fs.writeFile(path.join(root,file),samples.map(s=>JSON.stringify(s)).join("\n")+'\ninvalid\n{"torn":');
}
const input:HistoryQueryInput={directory:root,files,ids:[...ids,ids[0]],start,end:start+1_500_000,metric:"current",filters:{},chunked:true};
const runner=new HistoryQueryRunner(workerFile);
const legacy=await projectHistoryQuery(input);
const actual=await runner.run(input);
assert.deepEqual(actual,legacy,"Worker and cooperative payloads match exactly");
assert(actual.points.some(p=>p.point.current===99),"Extreme retained");
assert(actual.points.some(p=>p.excluded&&p.point.quality==="Unavailable"),"Missing interval retained");
assert(actual.points.filter(p=>p.id===ids[1]).every(p=>p.point.cell===null),"CS placeholders suppressed");
assert(actual.points.length<=10010,"Representative payload remains bounded");
for(const filters of [{minimum:5,maximum:11},{mode:"Cooling",faults:"with"},{quality:"Unavailable"}] as HistoryQueryInput["filters"][]){
  assert.deepEqual(await runner.run({...input,filters}),await projectHistoryQuery({...input,filters}));
}
assert.deepEqual(await runner.run({...input,metric:"cell",chunked:false}),await projectHistoryQuery({...input,metric:"cell",chunked:false}));
const cancelled=new AbortController();cancelled.abort();
await assert.rejects(runner.run(input,cancelled.signal),/cancelled/);
const during=new AbortController();const pending=runner.run(input,during.signal);during.abort();
await assert.rejects(pending,/cancelled/);
assert.deepEqual(await runner.run(input),legacy,"Cancelled job does not poison next query");
const one=runner.run(input),two=runner.run(input);
await assert.rejects(runner.run(input),/busy/);await Promise.all([one,two]);
const short=new HistoryQueryRunner(workerFile,1);
await assert.rejects(short.run(input),/exceeded/);await short.close();
const missing=new HistoryQueryRunner(path.join(root,"missing.cjs"));
await assert.rejects(missing.run(input),/worker failed/);await missing.close();
const stop=new HistoryQueryRunner(workerFile);const stopped=assert.rejects(stop.run(input),/cancelled/);
await stop.close();await stopped;await assert.rejects(stop.run(input),/closed/);
process.env.PRIZM_HISTORY_WORKERS="false";
assert.deepEqual(await runner.run(input),legacy,"Explicit rollback parity");
delete process.env.PRIZM_HISTORY_WORKERS;

async function responsiveness(work:()=>Promise<unknown>){
  let ticks=0,maxDelay=0,last=performance.now();
  const timer=setInterval(()=>{const now=performance.now();maxDelay=Math.max(maxDelay,now-last);last=now;ticks++;},5);
  const begun=performance.now();try{await work();return {elapsedMs:Math.round(performance.now()-begun),ticks,maxTimerDelayMs:Math.round(maxDelay)};}finally{clearInterval(timer);}
}
const timing={cooperative:await responsiveness(()=>projectHistoryQuery(input)),worker:await responsiveness(()=>runner.run(input))};
await runner.close();
console.log(JSON.stringify({passed:true,observations:24000,points:actual.points.length,timing,fixture:root}));
