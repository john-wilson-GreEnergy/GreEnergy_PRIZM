import React from 'react';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {renderToStaticMarkup} from 'react-dom/server';
import {compactStringRow,compactStringView,compactStringPublication} from './compactStringList';
import {EntityDomainBroker} from '../domainBrokers/EntityDomainBroker';
import {StringListRow} from '../../components/StringListRow';
const row = {id:'a1s2',arrayNumber:1,stringNumber:2,communicating:true,timestampUtc:'2026-09-25T12:00:00Z',
  amps:0,kw:0,socPct:0,measuredVoltage:null,bucket:'online',positiveContactorClosed:false,negativeContactorClosed:false,
  balanceTelemetryAvailable:true,balanceCount:1,balanceMode:'Provided',balanceActivity:'Charging',
  warnings:['warning'],alarms:['alarm'],sourceDebug:{canonicalStringSnapshot:{reason:'verified'},large:'unused'},
  raw:{large:'unused'},balancing:{duplicate:'unused'},
  balanceDetails:[{bpIndex:1,mode:'Provided (3300)',displayState:'Charging',balancingCellGroup:5,balanceTelemetryPresent:true,large:'unused'}]};
const before=structuredClone(row), compact=compactStringRow(row);
assert.deepEqual(row,before);
assert.equal(compact.raw,undefined);assert.equal(compact.balancing,undefined);
assert.deepEqual(compact.warnings,row.warnings);assert.deepEqual(compact.alarms,row.alarms);
assert.equal(compact.amps,0);assert.equal(compact.measuredVoltage,null);
assert.equal(compact.timestampUtc,row.timestampUtc);
assert.deepEqual(compact.sourceDebug,{canonicalStringSnapshot:{reason:'verified'}});
const render=(s:typeof row|Record<string,unknown>)=>renderToStaticMarkup(<table><tbody><StringListRow s={s} isArrFirst isArrAllSelected={false} isArrIndeterminate selected arraySelectionIds='["a1s2"]' commState="fresh" onOpen={()=>{}} onToggleRow={()=>{}} onToggleArray={()=>{}}/></tbody></table>);
assert.equal(render(row),render(compact));
const broker=new EntityDomainBroker<typeof row>('strings',r=>`${r.arrayNumber}:${r.stringNumber}`);
const publication=broker.publish([row],row.timestampUtc);
const view=compactStringView({strings:broker.snapshot().rows,brokerVersion:1});
const event=compactStringPublication(publication);
assert.deepEqual(event.changes[0].row,view.strings[0]);
assert.equal(view.transportEpoch,event.transportEpoch);
const detail=broker.read('1:2')!;
assert.deepEqual(detail,row);detail.raw.large='changed';
assert.equal(broker.read('1:2')?.raw.large,'unused');
assert.equal(broker.read('1:3'),null);
console.log('Compact string field/markup/publication parity and immutable single-target reads passed');

if (process.argv[2]) {
  const full=JSON.parse(readFileSync(process.argv[2],'utf8'));
  const projected=compactStringView(full);
  for (let i=0;i<full.strings.length;i++) assert.equal(render(full.strings[i]),render(projected.strings[i]),`Row ${i} markup differs`);
  const bytes=(value:unknown)=>({decoded:Buffer.byteLength(JSON.stringify(value)),gzip:gzipSync(JSON.stringify(value),{level:1}).length});
  console.log(JSON.stringify({rows:full.strings.length,markupParity:true,full:bytes(full),compact:bytes(projected)}));
}
