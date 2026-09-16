import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ThermalService } from "./thermalService";
import { thermalUnits, supplyResponse, type ThermalDevice } from "./thermalModel";

const dir=await fs.mkdtemp(path.join(os.tmpdir(),"prizm-thermal-test-"));
const now=Date.now();
const device:ThermalDevice={ip:"10.0.6.105",arrayIndex:6,segmentLabel:"ES20",lastSuccessUtc:new Date(now).toISOString(),reachable:true,
  spaceTemperatureC:30,supplyAirTempC:20,coolingSetpointC:27,heatingSetpointC:15,
  hvac1:{controlsValid:true,dataValid:true,compressorOn:true,reversingValveOn:false,electricHeatOn:false,currentA:4,fanSpeedRpm:1000},
  hvac2:{controlsValid:true,dataValid:true,compressorOn:false,electricHeatOn:false,currentA:0,fanSpeedRpm:0}};
const [unit]=thermalUnits([device],now);
assert.equal(unit.point.mode,"Cooling");
assert.equal(unit.point.quality,"Live");
assert.equal(thermalUnits([{...device,lastSuccessUtc:undefined}],now)[0].point.quality,"Stale");
assert.equal(supplyResponse(unit.point,now-180000),"Strong response");
assert.match(supplyResponse(unit.point,now),/stabilizing/);
assert.equal(supplyResponse({...unit.point,mode:"Heating",supply:40},now-180000),"Normal response");
const service=new ThermalService(dir,0);
service.ingest([device],now);await service.flush();
await assert.rejects(()=>service.start(["bad-id"],1));
await assert.rejects(()=>service.start([unit.id],0));
const session=await service.start([unit.id],1);
assert.equal(session.state,"Waiting for data");
await assert.rejects(()=>service.start([unit.id],1));
service.ingest([{...device,lastSuccessUtc:new Date(now+1000).toISOString()}],now+1000);await service.flush();
assert.equal((await service.view()).sessions[0].state,"Recording");
assert.equal((await service.points([unit.id],0,session.id)).length,1);
// Unchanged samples are suppressed, but command transitions are retained.
service.ingest([{...device,lastSuccessUtc:new Date(now+2000).toISOString()}],now+2000);await service.flush();
assert.equal((await service.points([unit.id],0,session.id)).length,1);
service.ingest([{...device,lastSuccessUtc:new Date(now+3000).toISOString(),hvac1:{...device.hvac1,compressorOn:false}}],now+3000);await service.flush();
assert.equal((await service.points([unit.id],0,session.id)).length,2);
// New thermal fields trigger recording independently and persist with the same target.
service.ingest([{...device,lastSuccessUtc:new Date(now+3500).toISOString(),avgCellTemperatureC:28,avgCellTemperatureRateCPerMin:0.01,hvac1:{...device.hvac1,compressorOn:false}}],now+3500);await service.flush();
let extended=await service.points([unit.id],0,session.id);
assert.equal(extended.length,3);
assert.equal(extended.at(-1)?.point.cell,28);
service.ingest([{...device,lastSuccessUtc:new Date(now+3600).toISOString(),avgCellTemperatureC:28,avgCellTemperatureRateCPerMin:0.03,hvac1:{...device.hvac1,compressorOn:false}}],now+3600);await service.flush();
extended=await service.points([unit.id],0,session.id);
assert.equal(extended.length,4);
assert.equal(extended.at(-1)?.point.cellRate,0.03);
// New service resumes fixed targets, not arbitrary graph selections.
const resumed=new ThermalService(dir,0);await resumed.view();
assert.deepEqual((await resumed.view()).sessions[0].targets,[unit.id]);
resumed.ingest([device],now+4000);await resumed.flush();
assert.equal((await resumed.view()).sessions[0].state,"Recording");
resumed.ingest([],now+5000);await resumed.flush();
assert.equal((await resumed.view()).units[0].point.quality,"Unavailable");
await resumed.stop(session.id);
assert.equal((await resumed.view()).sessions[0].state,"Stopped");
const blocked=new ThermalService(path.join(dir,"blocked"),Number.MAX_SAFE_INTEGER);
blocked.ingest([device],now);await blocked.flush();
await assert.rejects(()=>blocked.start([unit.id],1),/reserve/);
const expired=new ThermalService(dir,0);await expired.view();
expired.ingest([device],now);await expired.flush();
const short=await expired.start([unit.id],0.1);
expired.ingest([device],short.endsAt+1);await expired.flush();
assert.equal((await expired.view()).sessions.find(s=>s.id===short.id)?.state,"Complete");
console.log(`Thermal tests passed; isolated test recordings: ${dir}`);
