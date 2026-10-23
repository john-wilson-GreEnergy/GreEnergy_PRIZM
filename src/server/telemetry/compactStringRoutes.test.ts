import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import type {Request, Response} from 'express';
// Import server modules only after isolating persistent state. Network guard stays on.
process.chdir(mkdtempSync('/tmp/prizm-compact-route-test-'));
const {siteDataRouter,buildBrowserSnapshot}=await import('../siteDataRoutes');
const {stringDomainBroker}=await import('../domainBrokers/stringDomainBroker');
const row={arrayNumber:1,stringNumber:2,amps:0,raw:{original:1},balanceDetails:[{bpIndex:1,mode:'Provided',targetMv:3300}]};
stringDomainBroker.publish([row]);
const snapshot={normalized:{strings:[row],arrays:[],arrayDetailsByArray:{'1':{strings:[row]}}},rollups:{arraySummary:[{arrayNumber:1,stringCount:1}],stringSummary:{summary:{totalStrings:1}}}};
const compact=buildBrowserSnapshot(snapshot,{compactStringList:true,includeStrings:true});
assert.deepEqual(compact.normalized.arrayDetailsByArray,{});
assert.deepEqual(compact.rollups.arraySummary,snapshot.rollups.arraySummary);
assert.equal(compact.rollups.arrayCellMetrics[0].arrayNumber,1);
assert.equal(compact.rollups.arrayCellMetrics[0].voltageMv.average,null);
assert.equal(compact.rollups.arrayCellMetrics[0].voltageMv.partial,true);
assert.deepEqual(compact.rollups.stringSummary,snapshot.rollups.stringSummary);
assert.equal(compact.normalized.strings[0].amps,0);
assert.equal(compact.normalized.strings[0].raw,undefined);
assert.equal(compact.normalized.strings[0].balanceDetails[0].targetMv,undefined);
const legacy=buildBrowserSnapshot(snapshot,{includeStrings:true,includeArrayDetails:true,includeStringDiagnostics:true});
assert.equal(legacy.normalized.strings[0].balanceDetails[0].targetMv,3300);
assert.equal(legacy.normalized.arrayDetailsByArray['1'].strings.length,1);
const layer=siteDataRouter.stack.find(entry=>entry.route?.path==='/strings-canonical/:array/:string');
assert(layer?.route);
for(const [array,string,expected] of [['1','2',200],['1','3',404],['0','2',400],['1','2.5',400]] as const) {
  let status=200,body:any;const headers=new Map();
  const res={status(code:number){status=code;return this;},setHeader(k:string,v:string){headers.set(k,v);},json(value:unknown){body=value;return this;}};
  layer.route.stack[0].handle({params:{array,string}} as unknown as Request,res as unknown as Response,()=>{});
  assert.equal(status,expected);
  if(status===200){assert.deepEqual(body.raw,row.raw);assert.equal(body.balanceDetails[0].targetMv,3300);assert.equal(headers.get('Cache-Control'),'no-store');}
}
console.log('Compact shared snapshot parity, legacy rollback, single-target full details and validation passed');

for(const stationCode of ['BHE0020','BHE0021']) {
  const source={...snapshot,siteIdentity:{stationCode},liveStatus:{stale:true,state:'PARTIAL'},
    debug:{lastPollDurationMs:123,errors:['Source delayed'],diagnostics:'x'.repeat(50000)},
    normalized:{...snapshot.normalized,strings:Array.from({length:320},(_,i)=>({...row,stringNumber:i+1,socPct:i%2?null:0,alarms:['test'],sourceTimestampUtc:'2026-10-21T00:00:00Z'})),
      notificationReview:{payload:'x'.repeat(100000)},feather:[{raw:'x'.repeat(100000)}]},
    correctiveActions:[{diagnostic:'x'.repeat(100000)}]};
  process.env.PRIZM_STRING_SNAPSHOT_SLIM='false';
  const previous=buildBrowserSnapshot(source,{compactStringList:true});
  delete process.env.PRIZM_STRING_SNAPSHOT_SLIM;
  const next=buildBrowserSnapshot(source,{compactStringList:true});
  assert.deepEqual(next.normalized.strings,previous.normalized.strings);
  assert.deepEqual(next.rollups.stringSummary,previous.rollups.stringSummary);
  assert.deepEqual(next.rollups.arraySummary,previous.rollups.arraySummary);
  assert.deepEqual(next.siteIdentity,previous.siteIdentity);
  assert.deepEqual(next.liveStatus,previous.liveStatus);
  assert.deepEqual(next.debug.errors,previous.debug.errors);
  assert.equal(next.debug.lastPollDurationMs,123);
  assert.equal(next.normalized.notificationReview,undefined);
  assert.equal(next.correctiveActions,undefined);
  assert(JSON.stringify(next).length<JSON.stringify(previous).length/2);
  assert.equal(source.normalized.strings[0].raw.original,1,'Never mutate canonical records');
  const context=buildBrowserSnapshot(source,{compactStringList:true,stringContextOnly:true});
  assert.equal(context.stringContextOnly,true);
  assert.equal(context.normalized.strings.length,320);
  assert.deepEqual(context.normalized.strings[0].balanceDetails,next.normalized.strings[0].balanceDetails);
  assert.equal(context.normalized.strings[0].socPct,undefined,'Stream owns the live readings');
  assert.deepEqual(context.rollups,next.rollups);
  assert.deepEqual(context.liveStatus,next.liveStatus);
  assert.deepEqual(context.debug.errors,next.debug.errors);
}
console.log('PASS both site slim snapshots: identical 320 rows, SOC/nulls, alarms, timestamps, counts, freshness, rollback');

const streamRoute=siteDataRouter.stack.find(entry=>entry.route?.path==='/strings-stream')!;
for(const shape of ['list','list-v2']){
 let close:()=>void=()=>{};const messages:string[]=[];
 const res={status(){return this;},setHeader(){},flushHeaders(){},write(s:string){messages.push(s);return true;},writableLength:0};
 streamRoute.route!.stack[0].handle({query:{shape},on(_name:string,fn:()=>void){close=fn;}} as unknown as Request,res as unknown as Response,()=>{});
 try{
  stringDomainBroker.publish([{...row,amps:shape==='list'?2:3}]);
  const ready=JSON.parse(messages[0].split('data: ')[1]),event=JSON.parse(messages[1].split('data: ')[1]);
  assert.equal(ready.transportEpoch,event.transportEpoch);
  assert.equal(ready.stringRefreshVersion,1);
  assert.equal(event.metadata,undefined,'No summary is fabricated before coordinator initialization');
  assert.equal(event.changes[0].patch,shape==='list-v2'?true:undefined);
  assert.equal(event.changes[0].row.raw,undefined);
  if(shape==='list-v2')assert.equal(event.changes[0].row.balanceDetails,undefined,'Unchanged nested detail need not be retransmitted');
 }finally{close();}
}
console.log('PASS legacy and v2 route negotiation, matching epochs, changed-only payload and unsubscribe');

// The rollback and projected-copy paths must emit identical bytes. Full stream
// shapes must still include diagnostics and never use projected subscriptions.
for (const shape of ['list','list-v2','full']) {
 stringDomainBroker.publish([{...row,amps:0,socPct:0,communicating:true}]);
 const streams:{messages:string[];close:()=>void}[]=[];
 try {
  for (const flag of ['false','true']) {
   process.env.PRIZM_PROJECTED_STRING_STREAM=flag;
   const stream={messages:[] as string[],close:()=>{}};
   streams.push(stream);
   const res={status(){return this;},setHeader(){},flushHeaders(){},write(s:string){stream.messages.push(s);return true;},writableLength:0};
   streamRoute.route!.stack[0].handle({query:{shape},on(_name:string,fn:()=>void){stream.close=fn;}} as unknown as Request,res as unknown as Response,()=>{});
  }
  stringDomainBroker.publish([{...row,amps:1,socPct:null,communicating:false}]);
  assert.deepEqual(streams[1].messages,streams[0].messages);
  const event=JSON.parse(streams[1].messages[1].split('data: ')[1]);
  assert.equal(event.changes[0].row.raw?.original,shape==='full'?1:undefined);
  assert.equal(event.changes[0].row.socPct,null);
 }finally{for(const stream of streams)stream.close();delete process.env.PRIZM_PROJECTED_STRING_STREAM;}
}
console.log('PASS projected/rollback route wire parity and full diagnostic streams');
