import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
const directory = await mkdtemp('/tmp/prizm-owned-recording-');
const cwd = process.cwd();process.chdir(directory);
const {ThermalService} = await import('../thermal/thermalService');
const service = new ThermalService(directory+'/history',0);
const now = Date.now(), site = {id:'enrolled-site',label:'Fixture'};
const device = {ip:'fixture.invalid',arrayIndex:1,segmentLabel:'ES1',lastSuccessUtc:new Date(now).toISOString(),hvac1:{controlsValid:true,dataValid:true,currentA:4}};
try {
  service.ingest([device],now,site);await service.flush();
  await assert.rejects(service.start(['fixture.invalid/hvac/1'],1,'other-site'),/not verified/);
  const recording = await service.start(['fixture.invalid/hvac/1'],1,site.id);
  service.ingest([{...device,lastSuccessUtc:new Date(now+1000).toISOString()}],now+1000,site);await service.flush();
  assert.equal((await service.view()).sessions[0].state,'Recording');
  const before = await service.points(recording.targets,0,recording.id);
  service.ingest([{...device,hvac1:{...device.hvac1,currentA:99},lastSuccessUtc:new Date(now+2000).toISOString()}],now+2000,{id:'other-site',label:'Other'});
  await service.flush();
  assert.equal((await service.view()).sessions[0].state,'Paused');
  assert.deepEqual(await service.points(recording.targets,0,recording.id),before,'No new-site data enters the owned recording');
  await service.close();
  const restored = new ThermalService(directory+'/history',0);
  try {const saved = (await restored.view()).sessions[0];assert.equal(saved.securitySiteId,site.id);assert.equal(saved.state,'Paused');} finally {await restored.close();}
  console.log('Owned recording preserves site binding across restart and pauses on site changes');
} finally {await service.close();process.chdir(cwd);}
