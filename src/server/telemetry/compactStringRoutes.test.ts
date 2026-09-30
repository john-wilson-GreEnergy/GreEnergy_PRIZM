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
