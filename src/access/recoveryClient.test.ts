import assert from 'node:assert/strict';
import {listRecovery,reviewRecovery,recordRecovery} from './accessClient';
const previousFetch=globalThis.fetch,previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{protocol:'http:',hostname:'localhost'},setTimeout,clearTimeout}});
const command={commandId:'fixture-command-1234',array:1,string:2,action:'open',reason:'Fixture',state:'reserved',createdAt:1,updatedAt:1,result:null,reviews:[],historical:true};
const observation={actual:'open' as const,requested:'open' as const,capturedAt:1000};
try {
  globalThis.fetch=async url=>{assert.equal(url,'/api/access/recovery');return Response.json([command]);};
  assert.equal((await listRecovery(new AbortController().signal)).length,1);
  globalThis.fetch=async url=>{assert.equal(url,'/api/access/recovery/'+command.commandId);return Response.json({command,observation,validUntil:16000});};
  assert.equal((await reviewRecovery(command.commandId,new AbortController().signal)).observation.actual,'open');
  const intent={commandId:command.commandId,expectedUpdatedAt:1,observation,reason:'site-checked' as const,confirmed:true as const};
  let calls=0;
  globalThis.fetch=async(url,init)=>{calls++;assert.equal(url,'/api/access/recovery');assert.equal(init?.method,'POST');assert.equal((init?.headers as Record<string,string>)['X-Prizm-Csrf'],'fixture');assert.deepEqual(JSON.parse(String(init?.body)),intent);return Response.json({recorded:true,targetReleased:false});};
  await recordRecovery(intent,'fixture',new AbortController().signal);assert.equal(calls,1);
  globalThis.fetch=async()=>{calls++;throw new Error('Lost response');};
  await assert.rejects(recordRecovery(intent,'fixture',new AbortController().signal));assert.equal(calls,2,'No automatic retry');
  globalThis.fetch=async()=>Response.json({recorded:true,targetReleased:true});
  await assert.rejects(recordRecovery(intent,'fixture',new AbortController().signal));
  globalThis.fetch=async()=>Response.json([{...command,reviews:[{at:1,reason:'wrong',observation}]}]);
  await assert.rejects(listRecovery(new AbortController().signal));
  globalThis.fetch=async()=>Response.json({command:{...command,commandId:'other-command-1234'},observation,validUntil:16000});
  await assert.rejects(reviewRecovery(command.commandId,new AbortController().signal));
  console.log('Recovery client: bounded responses, matching ID, CSRF, no retry and unexpected release rejection passed.');
} finally {globalThis.fetch=previousFetch;if(previousWindow) Object.defineProperty(globalThis,'window',previousWindow);else Reflect.deleteProperty(globalThis,'window');}
