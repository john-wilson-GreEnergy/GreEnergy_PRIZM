import assert from 'node:assert/strict';
import {RestProvider,type RestTiming} from './RestProvider';
const original=globalThis.fetch;let now=0;
const input={name:'fixture',kind:'rest',url:'http://fixture.invalid/data',timeoutMs:100};
const provider=new RestProvider(()=>now),rows:RestTiming[]=[];
try {
  globalThis.fetch=async()=>{now+=12;return {ok:true,status:200,headers:new Headers({'content-type':'application/json',date:'Fri, 25 Sep 2026 00:00:00 GMT'}),text:async()=>{now+=45;return '{"value":3}';}} as Response;};
  const result=await provider.acquire({...input,onTiming:(r:RestTiming)=>rows.push(r)});
  assert.equal(result.success,true);assert.equal(result.payload?.body,'{"value":3}');
  assert.deepEqual(rows[0],{headersMs:12,bodyReadMs:45,totalMs:57,bodyComplete:true,status:200,serverDateMs:Date.parse('2026-09-25T00:00:00Z')});
  assert.equal((await provider.acquire({...input,onTiming:()=>{throw Error('observer');}})).success,true);
  globalThis.fetch=async()=>{now+=9;throw Error('connection');};
  assert.equal((await provider.acquire({...input,onTiming:(r:RestTiming)=>rows.push(r)})).success,false);
  assert.deepEqual(rows[1],{headersMs:null,bodyReadMs:null,totalMs:9,bodyComplete:false,status:null,serverDateMs:null});
  globalThis.fetch=async()=>{now+=5;return {ok:true,status:200,headers:new Headers(),text:async()=>{now+=25;throw Error('body');}} as unknown as Response;};
  assert.equal((await provider.acquire({...input,onTiming:(r:RestTiming)=>rows.push(r)})).success,false);
  assert.deepEqual(rows[2],{headersMs:5,bodyReadMs:25,totalMs:30,bodyComplete:false,status:200,serverDateMs:null});
} finally {globalThis.fetch=original;}
console.log('REST timing: exact header/body phases, source Date, body/connection failures and callback isolation passed.');
