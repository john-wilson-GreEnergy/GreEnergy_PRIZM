import assert from 'node:assert/strict';
import {RowProjectionCache} from './rowProjectionCache';
import {prepareStringRows} from './prepareStringRows';

const base = {id:'a1s1', arrayNumber:1, stringNumber:1, balanceTelemetryAvailable:true,
  balanceCount:2, balanceDetails:[{state:'Charging'}], balanceMode:'Provided',
  balanceActivity:'Charging', balanceModeRaw:4, balanceProvidedVoltageTarget:3300,
  sourceDebug:{stale:false}, timestampUtc:'2026-09-25T00:00:00Z'};
const second = {...base,id:'a1s2',stringNumber:2};
const fast = {...base, balanceTelemetryAvailable:false,balanceDetails:[],balanceCount:0,measuredVoltage:0};
const cache = new RowProjectionCache();
const overlays = new Map();
const first = prepareStringRows([base,second],[fast,second],overlays,cache);
assert.deepEqual(first,prepareStringRows([base,second],[fast,second],overlays));
assert.equal(first[0].measuredVoltage,0);
assert.equal(first[0].balanceCount,2);
assert.equal(first[0].balanceDetails,base.balanceDetails);
const repeat = prepareStringRows([base,second],[fast,second],overlays,cache);
assert.equal(repeat[0],first[0]);assert.equal(repeat[1],first[1]);
for (const change of [{timestampUtc:'2026-09-25T00:01:00Z'}, {stale:true},
  {warningCount:1}, {measuredVoltage:null}, {balanceDetails:[{state:'Discharging'}],balanceTelemetryAvailable:true},
  {sourceDebug:{stale:true}}, {rotationStatus:'OUT'}, {busVoltage:0}]) {
  const nextFast={...fast,...change};
  const next=prepareStringRows([base,second],[nextFast,second],overlays,cache);
  assert.notEqual(next[0],first[0]);assert.equal(next[1],first[1]);
  assert.deepEqual(next,prepareStringRows([base,second],[nextFast,second],overlays));
}
const state={positiveContactorClosed:false,negativeContactorClosed:false,contactorsCloseExpected:false,dcBusVoltage:0};
overlays.set('1:1',state);
const commanded=prepareStringRows([base,second],[fast,second],overlays,cache);
assert.equal(commanded[0].contactorStatus,'OPEN');assert.equal(commanded[0].busVoltage,0);
assert.deepEqual(commanded,prepareStringRows([base,second],[fast,second],overlays));
overlays.clear();
assert.notEqual(prepareStringRows([base,second],[fast,second],overlays,cache)[0],commanded[0]);
const enriched={...base,balanceCount:3};
assert.equal(prepareStringRows([enriched],[fast],overlays,cache)[0].balanceCount,3);
assert.deepEqual(prepareStringRows([base],[],overlays,cache),[base]);
assert.deepEqual(prepareStringRows([],[],overlays,cache),[]);

let builds=0;
const bounded=new RowProjectionCache<object>();
const input={};const entry={key:'one',inputs:[input],build:()=>{builds++;return {};}};
bounded.project([entry]);bounded.project([entry]);assert.equal(builds,1);
bounded.project([]);bounded.project([entry]);assert.equal(builds,2,'Removed rows are not retained');
console.log('String preparation: lossless parity, identity reuse, enrichment, overlays, freshness, removal passed');
