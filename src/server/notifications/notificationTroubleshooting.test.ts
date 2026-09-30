import assert from 'node:assert/strict';
import {buildNotificationReview} from './notificationReview';
const capturedAt='2026-09-28T18:00:00Z';
const fixture=(array:number)=>({code:'1001',arrayNumber:array,stringNumber:1,
  recommendedActions:['Shared source step'],safetyNotes:['Use approved isolation procedure'],
  resolved:{matched:true,matrixEntryId:'cell-high',sourceLabel:'Approved guide · Page 4',
    recommendedActions:['Measure cell voltage'],validationChecks:['Confirm stable readings'],clearingCriteria:['Cell values within configured limits'],
    resolvedTroubleshooting:{recommendedActions:['Measure cell voltage'],validationChecks:['Confirm stable readings'],clearingCriteria:['Cell values within configured limits'],fieldCorrections:'Inspect harness',technicianDetail:'Escalate persistent mismatch'}}});
const review=buildNotificationReview([fixture(1),fixture(2)],capturedAt),g=review.groups[0],t=g.troubleshooting!;
assert.deepEqual(t.actions.map(x=>x.text),['Measure cell voltage','Shared source step']);
for(const section of ['actions','validation','clearing','safety','field'] as const) for(const item of t[section]) assert.equal(item.targetIds.length,2);
assert.equal(t.sources.length,1);assert.equal(t.sources[0].entryId,'cell-high');
const scoped=buildNotificationReview([fixture(1),{...fixture(2),recommendedActions:['Array 2 only']}],capturedAt).groups[0];
assert.equal(scoped.troubleshooting!.actions.find(i=>i.text==='Array 2 only')!.targetIds.length,1);
assert.equal(scoped.targets.find(x=>x.id===scoped.troubleshooting!.actions.find(i=>i.text==='Array 2 only')!.targetIds[0])!.array,2);
const fallback=buildNotificationReview([{...fixture(1),resolved:{matched:false,matrixEntryId:'unknown-issue',clearingCriteria:['Generic check'],sourceLabel:'Fallback'}}],capturedAt).groups[0].troubleshooting!;
assert.equal(fallback.clearing[0].advisory,true);assert.equal(fallback.sources[0].entryId,null);
const missing=buildNotificationReview([{code:'unknown',arrayNumber:1,stringNumber:1}],capturedAt).groups[0].troubleshooting!;
assert.equal(missing.validation.length,0);assert.equal(missing.clearing.length,0);
assert.equal(g.targetCount,2);assert.equal(g.tableRows!.length,2);
console.log('Group troubleshooting: full fields, deduplication, scoped guidance and fallback provenance passed');
