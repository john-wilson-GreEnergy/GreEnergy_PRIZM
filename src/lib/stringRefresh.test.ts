import assert from 'node:assert/strict';
import {StringStreamState} from './stringStreamState';
import {prepareStringRows} from './prepareStringRows';
import {RowProjectionCache, samePublication} from './rowProjectionCache';
import {compactStringRow} from '../server/telemetry/compactStringList';
import {stringListContextRow} from '../server/telemetry/stringListContext';
import {SiteDataRequests} from './siteDataRequests';

const rows=Array.from({length:320},(_,i)=>({arrayNumber:Math.floor(i/40)+1,stringNumber:i%40+1,soc:i%101,
  amps:0,contactorStatus:'OPEN',timestampUtc:'original-source-time',stale:i===3,
  balanceTelemetryAvailable:true,balanceCount:0,balanceActivity:'IDLE',balanceMode:'none',
  balanceDetails:[{bpcNumber:1,mode:'IDLE',cellMv:3200}],fault:'retain',raw:{diagnostic:'discard'},sourceDebug:{large:'discard'}}));
const full=rows.map(compactStringRow),context=full.map(stringListContextRow);
const cache=new RowProjectionCache(samePublication);
const before=prepareStringRows(full as any,full as any,new Map(),cache as any);
const after=prepareStringRows(context as any,full as any,new Map(),cache as any);
assert.deepEqual(after,before);after.forEach((row,i)=>assert.equal(row,before[i],'Same row reference after context refresh'));
const refreshed=prepareStringRows(structuredClone(context) as any,full as any,new Map(),cache as any);
refreshed.forEach((row,i)=>assert.equal(row,before[i]));
const missingBalance={...full[0],balanceTelemetryAvailable:false,balanceCount:null};
const enriched=prepareStringRows(context as any,[missingBalance] as any,new Map());
assert.equal(enriched[0].balanceTelemetryAvailable,true);assert.equal(enriched[0].balanceCount,0);
const changed=[{...full[0],soc:1,stale:true},...full.slice(1)];
const next=prepareStringRows(context as any,changed as any,new Map(),cache as any);
assert.notEqual(next[0],before[0]);assert.equal(next[1],before[1]);
assert(JSON.stringify(context).length<JSON.stringify(full).length);

const state=new StringStreamState();state.ready('epoch',1);
state.snapshot({transportEpoch:'epoch',brokerVersion:1,strings:full,summary:{stringsOnline:320}});
assert(state.delta({transportEpoch:'epoch',version:2,capturedAt:'source-publication',metadata:{summary:{stringsOnline:0},cycleId:3,strings:[],brokerVersion:999},changes:[]}));
assert.deepEqual(state.view?.summary,{stringsOnline:0});assert.equal(state.view?.strings.length,320);
assert.equal(state.view?.brokerVersion,2);assert.equal(state.view?.strings[0].timestampUtc,'original-source-time');
const urls:string[]=[];
const requests=new SiteDataRequests(async input=>{urls.push(String(input));return new Response('{}',{headers:{'content-type':'application/json'}});});
await requests.snapshot('arrays-strings',false,true,true);assert.match(urls.at(-1)!,/shape=list-context/);
await requests.snapshot('arrays-strings',true,true,true);assert.match(urls.at(-1)!,/shape=list&refresh=true/);
await requests.snapshot('arrays-strings',false,true,false);assert.match(urls.at(-1)!,/shape=list$/);
console.log('String context: 320-row merge parity, balance fallback, zero counts, timestamps, stable references, recovery and force paths passed');
