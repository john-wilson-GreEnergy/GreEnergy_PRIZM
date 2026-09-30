import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {StringViewerCache} from './stringviewer/StringViewerCache';
import {EntityDomainBroker} from '../domainBrokers/EntityDomainBroker';
import {compactStringView, projectCompactStringView} from './compactStringList';
import {findArrayCandidates, findArrayCandidatesLegacy, siteArrayCandidates} from '../normalizers/arrayCandidateSearch';

let now = 10_000;
const identity = {arrayIndex:1, stringIndex:2, stringKey:'A1-S2', controllerIp:'10.0.1.12'};
const source = {nested:{voltage:0,alarmCodes:[1003,2008],unknown:null}, cellGroups:[{mv:3300}]};
const fast = new StringViewerCache<typeof source>(()=>now, true);
const legacy = new StringViewerCache<typeof source>(()=>now, false);
const success = {success:true,value:source,sourceUrl:'fixture',latencyMs:0,sourceObservationAt:new Date(now).toISOString()};
assert.deepEqual(fast.record(identity,1,success),legacy.record(identity,1,success));
source.cellGroups[0].mv=999;
source.nested.alarmCodes.push(9999);
const first = fast.get(identity)!;
assert.equal(first.value!.cellGroups[0].mv,3300);
assert.deepEqual(first.value!.nested.alarmCodes,[1003,2008]);
assert.throws(()=>{first.value!.nested.voltage=1;});
assert.throws(()=>{first.value!.nested.alarmCodes.push(3);});
assert.throws(()=>{first.stale=true;});
for (now of [10_000,10_999,11_000,20_000]) {
  const next=fast.get(identity,1000)!;
  assert.deepEqual(next,legacy.get(identity,1000));
  assert.equal(next.ageMs,now-10_000);
  assert.equal(next.stale,now>=11_000);
  assert.equal(next.value,first.value,'reuse only owned frozen graph');
}
const failure={success:false,sourceUrl:'failed-fixture',latencyMs:50,error:'timeout'};
assert.deepEqual(fast.record(identity,2,failure),legacy.record(identity,2,failure));
assert.deepEqual(fast.values(),legacy.values());
assert.equal(fast.get(identity)!.value,first.value);
assert.equal(fast.get(identity)!.stale,true);
now=30_000;
assert.deepEqual(fast.record(identity,3,{...success,sourceObservationAt:null}),legacy.record(identity,3,{...success,sourceObservationAt:null}));
assert.equal(fast.get(identity)!.sourceObservationAt,null);
assert.equal(fast.get(identity)!.value!.cellGroups[0].mv,999);
const empty=new StringViewerCache(()=>now,true);
assert.equal(empty.get(identity),null);
assert.equal(empty.record(identity,1,failure).value,null);
fast.clear();assert.equal(fast.size,0);assert.equal(fast.get(identity),null);

const queries=[['arrayIndex','nearlineSOC'],['arrayIndex','onlineSOC'],['arrayIndex','communicatingStackCount']];
let seed=731;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
function tree(depth:number):unknown {
  if(depth===0)return random()<.5 ? {arrayIndex:1,onlineSOC:0,nearlineSOC:null} : 0;
  const children=Array.from({length:3},()=>tree(depth-1));
  return random()<.5 ? children : {a:children[0],b:children[1],c:children[2]};
}
const child={arrayIndex:2,onlineSOC:42};
const root=[{arrayIndex:1,nearlineSOC:0,nested:[child]}, {arrayIndex:3,nearlineSOC:null}];
assert.deepEqual(findArrayCandidates(root,queries),queries.map(q=>findArrayCandidatesLegacy(root,q)));
assert.equal(findArrayCandidates(root,queries)[0][0],root[0]);
assert.equal(findArrayCandidates(root,queries)[1][0],child,'nonmatching query descends matched branch');
for (const value of [null,undefined,[],[null],0,root,...Array.from({length:80},()=>tree(5))]) {
  assert.deepEqual(findArrayCandidates(value,queries),queries.map(q=>findArrayCandidatesLegacy(value,q)));
  assert.deepEqual(siteArrayCandidates(value,root,value,true),siteArrayCandidates(value,root,value,false));
}
assert.deepEqual(findArrayCandidates({a:root,b:root},queries)[0],[...root,...root],'preserve repeated references/order');

type Row=Record<string,unknown>;
const broker=new EntityDomainBroker<Row>('test',r=>String(r.id));
const row:Row={id:'A1-S2',arrayNumber:1,stringNumber:2,amps:0,voltage:null,stale:true,
  timestampUtc:'2026-09-30T12:00:00Z',warnings:[2003,2008],alarms:[1003],
  raw:{large:Array.from({length:1000},(_,i)=>({i,mv:3300}))},
  balanceDetails:[{bpIndex:1,mode:'Provided',targetMv:3300,displayState:'Charging'}]};
const metadata={strings:[row],cycleId:7,capturedAt:'2026-09-30T12:00:00Z',summary:{total:1}};
assert.deepEqual(projectCompactStringView(metadata,broker),compactStringView(structuredClone(metadata)));
broker.publish([row],metadata.capturedAt);
const expected=()=>compactStringView({...structuredClone(metadata),brokerVersion:broker.getVersion(),capturedAt:broker.snapshot().capturedAt,strings:broker.snapshot().rows});
assert.deepEqual(projectCompactStringView(metadata,broker),expected());
assert.deepEqual(projectCompactStringView(metadata,broker,false),expected());
const projected=projectCompactStringView(metadata,broker);
(projected.strings[0].warnings as number[]).push(5555);
projected.summary.total=999;
assert.deepEqual(broker.read('A1-S2')!.warnings,[2003,2008]);
assert.equal(metadata.summary.total,1);
broker.patch('A1-S2',{amps:3},'2026-09-30T12:00:01Z');
assert.deepEqual(projectCompactStringView(metadata,broker),expected(),'same-cycle command patches remain visible');
assert.equal(projectCompactStringView(metadata,broker).strings[0].amps,3);
assert.deepEqual(broker.read('A1-S2')!.raw,row.raw,'full detail unchanged');

// Optional read-only captured fixture: exact output parity and repeatable CPU timings.
if(process.argv[2]) {
  const full=JSON.parse(readFileSync(process.argv[2],'utf8'));
  const fleet=new EntityDomainBroker<Row>('strings',r=>`${r.arrayNumber}:${r.stringNumber}`);
  fleet.publish(full.strings,full.capturedAt);
  assert.deepEqual(projectCompactStringView(full,fleet,true),projectCompactStringView(full,fleet,false));
  const measure=(optimized:boolean)=>{
    const times:number[]=[];
    for(let i=0;i<20;i++){const start=performance.now();projectCompactStringView(full,fleet,optimized);times.push(performance.now()-start);}
    times.sort((a,b)=>a-b);return {medianMs:times[9],p95Ms:times[18],maxMs:times[19]};
  };
  console.log(JSON.stringify({fixtureRows:full.strings.length,exactParity:true,legacy:measure(false),optimized:measure(true)}));
  const readCache=(optimized:boolean)=>{
    const cache=new StringViewerCache(()=>now,optimized);
    full.strings.forEach((r:Row,i:number)=>cache.record({...identity,stringKey:String(i)},1,{...success,value:r}));
    const start=performance.now();
    for(let pass=0;pass<10;pass++)cache.values();
    return {rows:cache.size,tenReadMs:performance.now()-start};
  };
  console.log(JSON.stringify({frozenCacheRead:{legacy:readCache(false),optimized:readCache(true)}}));
}
console.log('Processing optimization parity, freshness, immutable ownership and rollback tests passed');
