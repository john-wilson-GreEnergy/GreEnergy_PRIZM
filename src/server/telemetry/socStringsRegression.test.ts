import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeSocPercent} from '../../core/socPercent';
import {getSystemSocAndSource} from '../../lib/socUtils';
import {mergeMonitorFields} from './stringviewer/mergeMonitorFields';
import {StringFieldDeltas} from './stringFieldDeltas';
import {compactStringRow,stringTransportEpoch} from './compactStringList';
import {EntityDomainBroker} from '../domainBrokers/EntityDomainBroker';
import {StringStreamState} from '../../lib/stringStreamState';

for (const n of [0,.01,.4,.6,.99,1,1.01,2,50,100]) {
  assert.equal(normalizeSocPercent(n),n);
  assert.equal(normalizeSocPercent(String(n)),n);
  assert.equal(getSystemSocAndSource({bessFleetSummary:{systemSocPct:n}},null).soc,n);
}
for (const value of [null,undefined,'','  ',false,true,[],{},NaN,Infinity,-.1,100.1]) assert.equal(normalizeSocPercent(value),null);
assert.equal([.8,.9,1,1.1,1.2].map(normalizeSocPercent).reduce((a,b)=>a!+b!,0)!/5,1);
const fresh='2026-10-21T14:00:30Z',old='2026-10-21T14:00:00Z';
const row={socPct:1,amps:-10,busVoltage:1400,positiveContactorClosed:false,timestampUtc:fresh,sourceTimestampUtc:fresh};
const detail={soc:60,stringCurrent:100,dcBusVoltage:1500,positiveContactorClosed:true,maxCellGroupTemp:30,reportTimestamp:old};
for (const timestamp of [old,'invalid',undefined]) {
  const target={...row};mergeMonitorFields(target,{...detail,reportTimestamp:timestamp},{stale:false,success:true});
  for (const [key,value] of Object.entries(row)) assert.equal(target[key as keyof typeof row],value,key+' rolled backwards');
  assert.equal((target as any).maxCellTemperature,30);
  assert.equal((target as any).stringViewerFreshness.stale,true);
}
const newer={...row};mergeMonitorFields(newer,{...detail,reportTimestamp:'2026-10-21T14:00:31Z'},{stale:false,success:true});
assert.equal(newer.socPct,60);assert.equal(newer.timestampUtc,'2026-10-21T14:00:31Z');
const failed={...row};mergeMonitorFields(failed,{...detail,reportTimestamp:fresh},{stale:true,success:false});assert.equal(failed.socPct,1);
const missing={...row,socPct:null};mergeMonitorFields(missing,detail,{stale:true,success:false});assert.equal(missing.socPct,null,'Old SOC must not masquerade as a live missing reading');

type Row=Record<string,unknown>;
const rows:Row[]=process.argv[2]?JSON.parse(readFileSync(process.argv[2],'utf8')).strings:
 Array.from({length:320},(_,i)=>({arrayNumber:1+Math.floor(i/40),stringNumber:1+i%40,socPct:1,amps:0,warnings:['kept'],alarms:['also kept'],balanceDetails:Array.from({length:14},(_,b)=>({bpcNumber:b+1,mode:'Provided',state:'Idle'}))}));
const broker=new EntityDomainBroker<Row>('strings',r=>`${r.arrayNumber}:${r.stringNumber}`);
broker.publish(rows,old);
const encoder=new StringFieldDeltas();encoder.seed(rows);
const state=new StringStreamState();state.ready(stringTransportEpoch,1);
assert(state.snapshot({transportEpoch:stringTransportEpoch,brokerVersion:1,strings:rows.map(compactStringRow)}));
const changed=rows.map((r,i)=>({...r,socPct:i===0?0:r.socPct,timestampUtc:fresh,positiveContactorClosed:false}));
delete (changed[0] as any).amps;
const publication=broker.publish(changed,fresh),delta=encoder.project(publication);
assert(state.delta(delta));
assert.deepEqual(state.view!.strings,changed.map(compactStringRow));
const fullBytes=Buffer.byteLength(JSON.stringify(publication)),deltaBytes=Buffer.byteLength(JSON.stringify(delta));
assert(deltaBytes<fullBytes*.5,'Steady snapshot patch should be less than half of the full publication');
assert(!state.delta({...delta,version:delta.version+2}),'Version gaps must recover');
assert(state.snapshot({transportEpoch:stringTransportEpoch,brokerVersion:delta.version+2,strings:changed.map(compactStringRow)}));
assert(!state.delta({transportEpoch:stringTransportEpoch,version:delta.version+3,capturedAt:fresh,changes:[{key:'99:1',row:{arrayNumber:99,stringNumber:1},patch:true}]}),'Unknown patch target must recover');
console.log(JSON.stringify({passed:true,rows:rows.length,fullBytes,deltaBytes,reductionPercent:Math.round((1-deltaBytes/fullBytes)*100),checks:'low-SOC units, stale detail authority, values/alerts parity, field deletion, gaps and recovery'}));
