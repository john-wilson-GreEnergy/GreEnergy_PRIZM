import assert from 'node:assert/strict';
import {EntityDomainBroker, type DomainPublication} from './EntityDomainBroker';
import {compactStringPublication, compactStringRow} from '../telemetry/compactStringList';
import {StringFieldDeltas} from '../telemetry/stringFieldDeltas';

type Row = Record<string, any>;
const broker = new EntityDomainBroker<Row>('strings', row => `${row.arrayNumber}:${row.stringNumber}`);
const base = {arrayNumber:1,stringNumber:1,socPct:0,amps:null,communicating:false,
  alarms:['A'],sourceTimestampUtc:'2026-10-21T00:00:00Z',
  sourceDebug:{canonicalStringSnapshot:{reason:'stale'},large:'unused'},raw:{data:'diagnostics'},
  balanceDetails:[{bpIndex:1,mode:'Unknown',isActive:false,missingFromSource:true,targetMv:3500}]};
broker.publish([base], '2026-10-21T00:00:00Z');
for (const deltaMode of [false,true]) {
  const before = new StringFieldDeltas('00000000-0000-0000-0000-000000000001'), after = new StringFieldDeltas('00000000-0000-0000-0000-000000000001');
  const rows = broker.projectSnapshot(compactStringRow).rows;
  before.seed(rows); after.seed(rows);
  const prior:any[] = [], next:any[] = [], full:DomainPublication<Row>[] = [];
  const stopOld = broker.subscribe(p => prior.push(deltaMode ? before.project(p) : compactStringPublication(p)));
  const stopNew = broker.subscribeProjected(compactStringPublication, p => next.push(deltaMode ? after.project(p) : compactStringPublication(p)));
  const stopFull = broker.subscribe(p => full.push(p));
  for (let i=1;i<=3;i++) {
    const row:Row = {...base,socPct:i === 2 ? null : i,amps:0,alarms:i === 2 ? [] : ['A'],sourceTimestampUtc:`2026-10-21T00:00:0${i}Z`};
    if (i===2) delete row.communicating;
    broker.publish([row],`2026-10-21T00:00:0${i + (deltaMode ? 4 : 0)}Z`);
    assert.deepEqual(next,prior,'Compacted copy must preserve full/field-delta wire semantics');
  }
  assert.equal(full[0].changes[0].row.raw.data,'diagnostics','Full diagnostics remain available');
  assert.equal(next[0].changes[0].row.raw,undefined);
  stopOld();stopNew();stopFull();
  broker.patch('1:1',{socPct:4},deltaMode ? '2026-10-21T00:00:09Z' : '2026-10-21T00:00:04Z');
  assert.equal(next.length,3,'Unsubscribe stops projected delivery');
}

// Consumers cannot mutate stored rows, publications, or another subscriber.
const isolated = new EntityDomainBroker<Row>('strings',row=>row.id);
isolated.subscribeProjected(p=>p,p=>{p.changes[0].row.nested.value=99;});
let seen:any;
isolated.subscribeProjected(p=>p,p=>{seen=p;});
const source={id:'1',nested:{value:0},raw:{secret:'diagnostic'}};
const pub=isolated.publish([source]);
assert.equal(seen.changes[0].row.nested.value,0);
assert.equal(pub.changes[0].row.nested.value,0);
seen.changes[0].row.nested.value=55;
pub.changes[0].row.nested.value=44;
source.nested.value=33;
assert.equal(isolated.read('1')!.nested.value,0);

// Verify that discarded diagnostics never enter the per-listener clone.
const clone = globalThis.structuredClone;
const copied:any[]=[];
globalThis.structuredClone = ((value:any, options?:any)=>{copied.push(value);return clone(value,options);}) as typeof clone;
try {
  const compact = new EntityDomainBroker<Row>('strings',row=>row.id);
  compact.subscribeProjected(compactStringPublication,()=>{});
  compact.publish([{id:'1',raw:{large:'not for the list'},socPct:0}]);
  assert.equal(copied.length,3,'Storage, change, and compact listener copies only');
  assert.equal(copied[2].changes[0].row.raw,undefined);
} finally {globalThis.structuredClone=clone;}
console.log('PASS projected subscriptions: wire parity, deltas, removals, null/zero/false, stale reason, full diagnostics, isolation and unsubscribe');
