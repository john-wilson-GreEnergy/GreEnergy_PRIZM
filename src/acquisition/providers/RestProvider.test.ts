import assert from 'node:assert/strict';
import {RestProvider} from './RestProvider';

const fetchOriginal=globalThis.fetch, timeoutOriginal=globalThis.setTimeout, clearOriginal=globalThis.clearTimeout;
let deadline: (()=>void)|undefined, cleared=0;
globalThis.setTimeout=((callback:()=>void)=>{deadline=callback;return 1;}) as unknown as typeof setTimeout;
globalThis.clearTimeout=(()=>{cleared++;}) as typeof clearTimeout;
const provider=new RestProvider(), input={name:'fixture',kind:'rest',url:'http://fixture.invalid/data',timeoutMs:100};
try {
  let bodyStarted!:()=>void, resolveBody!:(value:string)=>void;
  const started=new Promise<void>(resolve=>{bodyStarted=resolve;});
  globalThis.fetch=async()=>({ok:true,status:200,headers:new Headers({'content-type':'application/json'}),text:()=>{bodyStarted();return new Promise<string>(resolve=>{resolveBody=resolve;});}} as Response);
  const pending=provider.acquire(input);await started;
  assert.equal(cleared,0,'Receiving headers must not clear acquisition deadline');
  resolveBody('{"ok":true}');assert.equal((await pending).success,true);assert.equal(cleared,1);

  let stalledStarted!:()=>void;const stalled=new Promise<void>(resolve=>{stalledStarted=resolve;});
  globalThis.fetch=async(_url,options)=>({ok:true,status:200,headers:new Headers(),text:()=>new Promise<string>((_resolve,reject)=>{
    options?.signal?.addEventListener('abort',()=>reject(new Error('Fixture body aborted')),{once:true});stalledStarted();
  })} as Response);
  const aborted=provider.acquire(input);await stalled;
  assert.equal(cleared,1);deadline!();const result=await aborted;
  assert.equal(result.success,false);assert.match(result.error??'',/body aborted/);assert.equal(result.payload,undefined);assert.equal(cleared,2);

  globalThis.fetch=async()=>{throw new Error('Fixture connection failed');};
  assert.equal((await provider.acquire(input)).success,false);assert.equal(cleared,3,'Connection failure cleans up timer');
  globalThis.fetch=async()=>new Response('denied',{status:403});
  assert.equal((await provider.acquire(input)).success,false);assert.equal(cleared,4);
  assert.equal((await provider.acquire({...input,url:''})).success,false);assert.equal(cleared,4,'Invalid URL never starts timer');
} finally {globalThis.fetch=fetchOriginal;globalThis.setTimeout=timeoutOriginal;globalThis.clearTimeout=clearOriginal;}
console.log('REST provider deadline covers headers and body, stalled transfer aborts, and success/error paths clean up timers; mocked requests only.');
