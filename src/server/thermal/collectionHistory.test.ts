import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ThermalService} from './thermalService';
import {SiteHistory} from './siteHistory';
import {thermalUnits} from './thermalModel';
const now=Date.now();
const dir=await fs.mkdtemp('/tmp/prizm-collection-history-');
const unit=thermalUnits([{ip:'10.0.1.3',arrayIndex:1,segmentLabel:'CS',spaceTemperatureC:30,hvac1:{currentA:4},lastSuccessUtc:new Date(now).toISOString()}],now)[0];
const oldPoint={...unit.point,cell:32767,cellRate:32767};delete oldPoint.segmentType;
// An old targeted recording has identity only in its saved label, not in the point.
const session='aabbccdd';
await fs.writeFile(path.join(dir,`${session}.json`),JSON.stringify({id:session,targets:[unit.id],labels:[unit.label],startedAt:now-1000,endsAt:now,state:'Stopped',samples:1}));
await fs.writeFile(path.join(dir,`${session}.jsonl`),JSON.stringify({id:unit.id,point:oldPoint})+'\n');
const service=new ThermalService(dir,0);
const targeted=await service.displayPoints([unit.id],0,session,'cell');
assert.equal(targeted[0].point.cell,null);assert.equal(targeted[0].displayValues.cellRate,null);
assert.equal(targeted[0].displayValues.space,86);
assert.equal((await service.displayPoints([unit.id],0,session,'cell',{minimum:0}))[0].excluded,true);
assert.match(await fs.readFile(path.join(dir,`${session}.jsonl`),'utf8'),/32767/,'Original recordings are preserved');
// Old whole-site shards contain segment metadata; sanitize before filtering/downsampling.
const site={id:'fixture',label:'Fixture'};
const historyDir=path.join(dir,'retained');
const history=new SiteHistory(historyDir,0,()=>now,false);
await history.status();history.ingest([unit],site);await history.configure({enabled:true,retentionDays:7,maxGiB:1});await history.close();
const hash=createHash('sha256').update(unit.id).digest('hex');
const shard=path.join(historyDir,`${Math.floor(now/3600000)*3600000}-${hash}.jsonl`);
await fs.writeFile(shard,JSON.stringify({...unit,point:oldPoint,receivedAt:now,sourceAt:now})+'\n');
const resumed=new SiteHistory(historyDir,0,()=>now,false);
try{
  const result=await resumed.query([unit.id],now-1000,now,'cell',{minimum:0});
  assert(result.points.length>0);assert(result.points.every(s=>s.excluded&&s.point.cell===null&&s.displayValues.cell===null));
  const space=await resumed.query([unit.id],now-1000,now,'space');assert.equal(space.points[0].displayValues.space,86);
  assert.match(await fs.readFile(shard,'utf8'),/32767/);
}finally{await resumed.close();await service.siteHistory.close();}
console.log('Legacy collection-segment targeted/retained history is sanitized without rewriting raw recordings');
