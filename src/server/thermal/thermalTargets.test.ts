import assert from "node:assert/strict";
import {thermalUnits,thermalSegmentType,type ThermalDevice} from "./thermalModel";
import {thermalReadings,thermalDisplayValues} from "./thermalMetrics";
import {selectThermalTargets,type TargetQuery} from "./thermalTargets";
const now=Date.now();
const device=(array:number,segment:string,space:number,current:number):ThermalDevice=>({
  arrayIndex:array,segmentLabel:segment,ip:`10.0.${array}.${segment==='CS'?3:10+Number(segment.slice(2))*5}`,
  lastSuccessUtc:new Date(now).toISOString(),spaceTemperatureC:space,avgCellTemperatureC:segment==='CS'?32767:space-5,avgCellTemperatureRateCPerMin:segment==='CS'?32767:0.1,
  hvac1:{currentA:current},hvac2:{currentA:current+1},
});
const units=thermalUnits([device(1,'CS',50,9),device(1,'ES1',30,1),device(1,'ES2',35,3),device(2,'CS',55,10),device(2,'ES1',38,7),device(2,'ES2',39,0)],now).map(u=>({...u,readings:thermalReadings(u.point)}));
const base:TargetQuery={metric:'space',array:'all',unit:'all',segmentType:'all',search:'',status:'all',sort:'topology',topPerArray:0,selected:[]};
const run=(q:Partial<TargetQuery>)=>selectThermalTargets(units,units,{...base,...q});
assert.equal(run({segmentType:'CS'}).devices.length,4);
assert.equal(run({segmentType:'ES'}).devices.length,8);
assert.equal(run({segmentType:'CS',array:'1',unit:'2'}).devices.length,1);
const hottest=run({segmentType:'ES',topPerArray:1});
assert.equal(hottest.devices.length,4,'Each winning segment includes both HVAC units without consuming two rank slots');
assert(hottest.devices.every(d=>d.segment==='ES2'));
assert(hottest.devices.every(d=>hottest.ranks[d.id]===1));
const amps=run({metric:'current',topPerArray:1,segmentType:'ES'});
assert.equal(amps.devices.length,2);
assert.deepEqual(amps.devices.map(d=>[d.array,d.segment,d.unit]),[[1,'ES2',2],[2,'ES1',2]]);
const cells=run({metric:'cell',topPerArray:1});
assert(cells.devices.every(d=>d.segment!=='CS'));
assert.equal(cells.excludedCount,4);
assert.equal(run({metric:'cell',segmentType:'CS',topPerArray:3}).devices.length,0);
assert.equal(run({metric:'cellRate',segmentType:'CS',topPerArray:1}).devices.length,0);
assert.equal(run({search:'10.0.1.',topPerArray:1}).devices.length,2);
const selected=units.filter(u=>u.segment==='ES1').map(u=>u.id);
assert(run({selected,status:'selected',topPerArray:1}).devices.every(d=>selected.includes(d.id)));
const unavailable=units.map(u=>({...u,point:{...u.point,quality:'Stale' as const},readings:thermalReadings({...u.point,quality:'Stale'})}));
assert.equal(selectThermalTargets(units,unavailable,{...base,topPerArray:1}).devices.length,0);
const zero=run({metric:'current',segmentType:'ES',array:'2',unit:'1',search:'ES2',topPerArray:1});
assert.equal(zero.devices.length,1,'Real zero current is a valid reading');
assert.equal(run({metric:'cell',status:'stale',segmentType:'CS'}).devices.length,0,'Not applicable is not stale');
for(const segment of ['CS','CS 1','Collection Segment','Array 1 · CS · HVAC 1'])assert.equal(thermalSegmentType(segment),'CS');
assert.equal(thermalSegmentType('ES20'),'ES');
assert.equal(thermalSegmentType('Custom enclosure'),'UNKNOWN');
assert.throws(()=>run({topPerArray:100}),/Invalid/);
for(const u of units.filter(u=>u.segment==='CS')){
  assert.equal(u.point.cell,null);assert.equal(u.point.cellRate,null);
  assert.equal(u.readings.cell.text,'N/A — no cells');
  assert.equal(thermalDisplayValues({...u.point,cell:32767}).cell,null);
  assert.notEqual(u.readings.space.value,null);assert.notEqual(u.readings.current.value,null);
}
console.log('Thermal segment classification, cell applicability, and per-array subset ranking tests passed');
