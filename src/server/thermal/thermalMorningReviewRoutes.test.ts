import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import express from "express";
import {thermalService} from "./thermalService";
import {thermalRouter} from "./thermalRoutes";
process.env.PRIZM_THERMAL_DIR=await fs.mkdtemp("/tmp/prizm-morning-api-");
const service=thermalService(),now=Date.now(),site={id:"api-fixture",label:"API Fixture"};
const devices=[{ip:"10.0.1.10",arrayIndex:1,segmentLabel:"ES1",lastSuccessUtc:new Date(now).toISOString(),hvac1:{compressorOn:false,electricHeatOn:false,currentA:0},hvac2:{compressorOn:false,electricHeatOn:false,currentA:0}}];
service.ingest(devices,now,site);await service.flush();await service.siteHistory.configure({enabled:true,retentionDays:7,maxGiB:1});service.ingest(devices,now,site);await service.siteHistory.flush();
const app=express();app.use(express.json());app.use("/thermal",thermalRouter);
const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));
const address=server.address();assert(address&&typeof address!=="string");const base=`http://127.0.0.1:${address.port}/thermal`;
const post=(path:string,body:unknown)=>fetch(base+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
try{
  assert.equal((await post("/morning-review",{hours:7})).status,400);
  assert.equal((await post("/morning-review",{hours:12})).status,202);
  let job;for(let i=0;i<100;i++){job=await (await fetch(base+"/morning-review")).json();if(job.state!=="building")break;await new Promise(resolve=>setTimeout(resolve,10));}
  assert.equal(job.state,"ready");assert.equal(job.report.summary.units,2);assert.equal(job.report.rows[0].display.commanded,"Unknown","One point is not evidence of off runtime");
  const view=await (await fetch(base)).json();assert.equal(view.morningReview.state,"ready");assert.equal(view.units.length,2);
  assert.equal((await (await post("/morning-review/cancel",{})).json()).state,"cancelled");
  process.env.PRIZM_THERMAL_REVIEW_ENABLED="false";
  assert.equal((await post("/morning-review",{hours:12})).status,400);
  assert.equal((await (await fetch(base+"/morning-review")).json()).state,"disabled");
  assert.equal((await (await fetch(base+"/storage")).json()).enabled,true,"Review rollback does not disable recording");
  delete process.env.PRIZM_THERMAL_REVIEW_ENABLED;
}finally{await service.siteHistory.close();server.close();}
console.log("Morning review API, existing thermal view, cancellation and recorder-preserving rollback passed");
