import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,chmod,symlink,stat} from 'node:fs/promises';
import {ContactorReceipts,type CommandReservation} from './contactorReceipts';
import type {ContactorReceipt} from '../../core/security/contactorAccessModel';
const command:CommandReservation={commandId:'fixture-command-0001',subject:'alice',sessionId:'session-1',siteId:'fixture',blockId:'1',array:1,string:1,action:'open',reason:'Offline test',topologyRevision:'fixture'};
const result:ContactorReceipt={success:true,acceptedCount:1,verifiedCount:1,mismatchCount:0,unknownCount:0,results:[{target:{array:1,string:1},action:'open',accepted:true,readbackConfirmed:true,status:'Verified by fresh telemetry'}]};
async function fixture() {
  const directory=await mkdtemp('/tmp/prizm-receipts-test-'),file=directory+'/receipts.json';
  await writeFile(file,JSON.stringify({version:1,entries:[]}),{mode:0o600});
  return {file,directory,store:new ContactorReceipts(file)};
}
{
  const {file,store}=await fixture();await store.reserve(command);
  assert.equal((await stat(file)).mode&0o777,0o600);
  const restarted=new ContactorReceipts(file);
  assert.equal((await restarted.readOwned('alice',command,command.commandId)).state,'reserved');
  await assert.rejects(restarted.reserve(command),/already recorded/);
  await assert.rejects(restarted.reserve({...command,subject:'bob',commandId:'fixture-command-0002'}),/reconciliation/);
  await assert.rejects(restarted.assertTargetClear(command),/reconciliation/);
  await assert.rejects(restarted.readOwned('bob',command,command.commandId),/unavailable/);
  await assert.rejects(restarted.readOwned('alice',{...command,siteId:'other'},command.commandId),/unavailable/);
  await store.finish(command,result);await restarted.assertTargetClear(command);
  assert.deepEqual((await restarted.readOwned('alice',command,command.commandId)).result,result);
  await assert.rejects(restarted.reserve({...command,sessionId:'new-session'}),/already recorded/);
  await restarted.reserve({...command,commandId:'fixture-command-0002',sessionId:'new-session'});
}
{
  const {file,store}=await fixture();await store.reserve(command);
  await store.finish(command,{...result,success:false,verifiedCount:0,unknownCount:1,results:[{...result.results[0],readbackConfirmed:null}]});
  await assert.rejects(new ContactorReceipts(file).assertTargetClear(command),/reconciliation/);
}
{
  const {file,store}=await fixture();
  const results=await Promise.allSettled([store.reserve(command),new ContactorReceipts(file).reserve({...command,commandId:'fixture-command-0002'})]);
  assert.equal(results.filter(row=>row.status==='fulfilled').length,1,'Independent workers cannot both claim one target');
  assert.equal(JSON.parse(await readFile(file,'utf8')).entries.length,1);
}
{
  const {file,store}=await fixture();await store.reserve(command);
  await assert.rejects(store.finish(command,{...result,results:[{...result.results[0],target:{array:2,string:1}}]}),/Invalid command result/);
  await assert.rejects(store.finish(command,{...result,results:[{...result.results[0],status:'x'.repeat(257)}]}),/Invalid command result/);
  await writeFile(file+'.lock','crash-held lock',{mode:0o600});
  await assert.rejects(store.finish(command,result),/locked/);
  assert.equal((await new ContactorReceipts(file).readOwned('alice',command,command.commandId)).state,'reserved');
  assert.equal(await readFile(file+'.lock','utf8'),'crash-held lock','Never steal crash-held locks');
}
for(const mutation of ['corrupt','mode','symlink','missing','directory-mode','oversized','duplicate','unknown-field'] as const) {
  const {file,directory,store}=await fixture();let target=store;
  if(mutation==='corrupt') await writeFile(file,'incomplete JSON');
  if(mutation==='mode') await chmod(file,0o644);
  if(mutation==='symlink') {await symlink(file,directory+'/linked.json');target=new ContactorReceipts(directory+'/linked.json');}
  if(mutation==='missing') target=new ContactorReceipts(directory+'/missing.json');
  if(mutation==='directory-mode') await chmod(directory,0o755);
  if(mutation==='oversized') await writeFile(file,' '.repeat(1024*1024+1));
  if(mutation==='duplicate') {await store.reserve(command);const data=JSON.parse(await readFile(file,'utf8'));data.entries.push(data.entries[0]);await writeFile(file,JSON.stringify(data));}
  if(mutation==='unknown-field') await writeFile(file,JSON.stringify({version:1,entries:[],rawSecret:'must not leak'}));
  await assert.rejects(target.reserve(command),undefined,mutation);
  if(mutation==='missing') await assert.rejects(stat(directory+'/missing.json'));
}
{
  const {file,store}=await fixture();
  const entries=Array.from({length:512},(_,index)=>({...command,commandId:`fixture-capacity-${index}`,state:'verified',createdAt:1,updatedAt:1,result}));
  await writeFile(file,JSON.stringify({version:1,entries}));
  await assert.rejects(store.reserve(command),/capacity/);assert.equal(JSON.parse(await readFile(file,'utf8')).entries.length,512);
}
{
  const {file,store}=await fixture();await store.reserve(command);
  const initial=await store.readOwned('alice',command,command.commandId),before=await readFile(file,'utf8');
  const review={at:Date.now(),subject:'alice',reason:'site-checked' as const,observation:{actual:'open' as const,requested:'open' as const,capturedAt:Date.now()}};
  review.at=Math.max(review.at,review.observation.capturedAt);
  await assert.rejects(store.recordReview('alice',command,command.commandId,initial.updatedAt,review,async()=>{throw new Error('Permission revoked after lock acquisition');}),/revoked/);
  assert.equal(await readFile(file,'utf8'),before,'Final authorization failure must not modify receipt');
  const concurrent=await Promise.allSettled([store.recordReview('alice',command,command.commandId,initial.updatedAt,review,async()=>{}),
    new ContactorReceipts(file).recordReview('alice',command,command.commandId,initial.updatedAt,review,async()=>{})]);
  assert.equal(concurrent.filter(result=>result.status==='fulfilled').length,1);
  for(let count=1;count<20;count++) {
    const current=await store.readOwned('alice',command,command.commandId);
    await store.recordReview('alice',command,command.commandId,current.updatedAt,review,async()=>{});
  }
  const full=await readFile(file,'utf8'),current=await store.readOwned('alice',command,command.commandId);
  await assert.rejects(store.recordReview('alice',command,command.commandId,current.updatedAt,review,async()=>{}),/capacity/);
  assert.equal(await readFile(file,'utf8'),full);assert.equal(current.reviews?.length,20);
  await assert.rejects(new ContactorReceipts(file).assertTargetClear(command),/reconciliation/);
}
console.log('Durable contactor receipts: restart persistence, target exclusion, owner isolation, concurrency, corrupt/private/missing storage, failed completion, final authorization, review races and capacity passed.');
