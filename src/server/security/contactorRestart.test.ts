import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ContactorAccess} from './contactorAccess';
import {ContactorReceipts} from './contactorReceipts';
import type {VerifiedPrincipal} from '../../core/security/controlPolicyPrototype';
const scope={siteId:'fixture',blockId:'1'};
const context=()=>({...scope,topologyRevision:'fixture',validUntil:Date.now()+60000,targets:[{id:'array:1:string:1',kind:'string' as const}]});
const principal=():VerifiedPrincipal=>({subject:'alice',sessionId:'fixture-session',state:'active',issuedAt:Date.now()-1000,expiresAt:Date.now()+60000,
  grants:[{capability:'controls.contactors',...scope,scope:{kind:'block'}},{capability:'history.view',...scope,scope:{kind:'block'}}]});
const intent={commandId:'fixture-command-crash',action:'open',array:1,string:1,reason:'Offline crash fixture',confirmed:true,topologyRevision:'fixture'};
const mode=process.argv[2];
if(mode==='before-dispatch' || mode==='after-dispatch') {
  const file=process.argv[3];
  const adapter=new ContactorAccess({receipts:new ContactorReceipts(file),context:async()=>context(),
    audit:async event=>{if(mode==='before-dispatch' && event.outcome==='requested') process.exit(19);},
    execute:async(request,guard)=>{
      await guard.beforeDispatch(request.targets[0]);
      // A filesystem marker is the only simulated side effect. No device transport exists here.
      await writeFile(file+'.simulated-write','one simulated dispatch',{mode:0o600});
      process.exit(19);
    },
  });
  await adapter.submit(intent,async()=>principal());
  throw new Error('Crash fixture did not exit at its planned boundary');
} else {
  for(const boundary of ['before-dispatch','after-dispatch']) {
    const directory=await mkdtemp('/tmp/prizm-command-crash-'),file=directory+'/receipts.json';
    await writeFile(file,JSON.stringify({version:1,entries:[]}),{mode:0o600});
    await assert.rejects(promisify(execFile)(process.execPath,[
      '--require',path.resolve('scripts/test-network-guard.cjs'),'--import','tsx',fileURLToPath(import.meta.url),boundary,file,
    ]),error=>!!error && typeof error==='object' && 'code' in error && error.code===19);
    let dispatches=0;
    const recovered=new ContactorAccess({receipts:new ContactorReceipts(file),context:async()=>context(),audit:async()=>{},
      execute:async()=>{dispatches++;throw new Error('Must not resend after restart');}});
    const auth=async()=>({...principal(),sessionId:'new-login-after-restart'});
    await assert.rejects(recovered.submit(intent,auth),/already recorded/);
    await assert.rejects(recovered.submit({...intent,commandId:'fixture-command-new-id'},auth),/reconciliation/);
    await assert.rejects(recovered.submit({...intent,commandId:'fixture-command-other-user'},async()=>({...await auth(),subject:'bob'})),/reconciliation/);
    await assert.rejects(recovered.review(1,1,auth),/reconciliation/);
    const saved=await recovered.readSaved(intent.commandId,await auth(),scope);
    assert.equal(saved.state,'reserved');assert.equal(saved.historical,true);assert.equal(dispatches,0);
    assert(!JSON.stringify(saved).includes('sessionId'));
    await assert.rejects(recovered.readSaved(intent.commandId,{...await auth(),subject:'bob'},scope),/unavailable/);
    if(boundary==='after-dispatch') assert.equal(await readFile(file+'.simulated-write','utf8'),'one simulated dispatch');
    else await assert.rejects(stat(file+'.simulated-write'));
  }
  console.log('Real subprocess interruption before/after simulated dispatch: restart and new login never resend; new IDs/accounts cannot bypass unresolved target; owner can read saved evidence.');
}
