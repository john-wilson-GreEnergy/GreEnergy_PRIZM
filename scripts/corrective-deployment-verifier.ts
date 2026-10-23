// Read-only acceptance over an already published canonical snapshot.
import assert from 'node:assert/strict';
import type {NotificationReview} from '../src/server/notifications/notificationReview';
import {correctivePacket,packetCsv} from '../src/lib/correctivePacket';
import {exportTargetKeys} from '../src/lib/correctiveSelection';
export * from './hvac-review-deployment-verifier';

export function verifyCorrectiveReview(review:NotificationReview,revision:number,station:string){
  assert(Number.isSafeInteger(revision)&&revision>=0);
  assert.equal(review.guidanceRevision,revision);
  assert(review.bpcReview,'Canonical BPC review must remain available');
  const before=JSON.stringify(review);
  const all=correctivePacket(review,review.groups,'all','',station,false);
  assert.equal(all.targets.length,review.groups.reduce((n,g)=>n+g.targets.length,0));
  const balancing=review.groups.filter(g=>['2073','2074'].includes(g.code));
  const selected=correctivePacket(review,review.groups,'all','',station,false,{},
    {keys:new Set(exportTargetKeys(balancing)),includeSiteInventory:false});
  assert(selected.selected.every(g=>['2073','2074'].includes(g.code)));
  assert.equal(selected.targets.length,balancing.reduce((n,g)=>n+g.targets.length,0));
  assert.equal(new Set(selected.bpcChecklist.map(d=>d.id)).size,selected.bpcChecklist.length);
  assert(selected.bpcChecklist.every(d=>d.codes.every(c=>['2073','2074'].includes(c))));
  assert.equal(selected.inventory,undefined);
  assert.equal(correctivePacket(review,review.groups,'all','',station,false,{},
    {keys:new Set(),includeSiteInventory:false}).targets.length,0);
  assert(packetCsv(selected).startsWith('"Site","Snapshot (UTC)"'));
  assert.equal(JSON.stringify(review),before,'Export preparation must not modify the snapshot');
  return {revision,codeGroups:review.groups.length,targetRows:all.targets.length,
    balancingTargetRows:selected.targets.length,uniqueBalancingBpcs:selected.bpcChecklist.length,
    selectionAndCanonicalParity:true};
}
