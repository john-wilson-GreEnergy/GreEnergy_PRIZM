import assert from 'node:assert/strict';
import {buildSafetyFaultCandidateSnapshot as snapshot} from './safetyFaultClear';
import {candidateBlockedReason, candidateSignature, selectedSafetyCandidates} from '../lib/safetyFaultSelection';

// All data is synthetic. Network guard is required by the test command.
for (const station of ['BHE0020', 'BHE0021']) {
  const key = `SK-ST:${station}-B:1-A:4-S:5`;
  const token = key.replace(/[-:]/g, '_');
  const entity = {entityKey:key, displayKey:'String 5', allowFaultReset:true,
    enabled:true, communicating:true, statusMessage:'Door <b>fault</b>'};
  const shapes = [
    [entity], {topology:[entity]}, {arrays:[{strings:[entity]}]},
    {topology:{nodes:{controller:{children:[entity]}}}},
    {reports:{arrays:{four:{segments:{three:{controllers:[entity]}}}}}},
    {deep:{record:{...entity,entityKey:undefined,entityKeyToken:token}}},
  ];
  for (const shape of shapes) {
    for (const [block, lastCall] of [[shape, {}], [{}, shape]]) {
      const result = snapshot(block, lastCall);
      assert.equal(result.eligible.length, 1);
      const found = result.eligible[0];
      assert.equal(found.entityKeyToken, token);
      assert.equal(found.equipment?.array, 'Array 4');
      assert.equal(found.equipment?.segment, 'ES3 / String 5');
      assert.equal(found.statusMessageText, 'Door fault');
      assert.equal(candidateBlockedReason(found), '');
    }
  }
  const no = {...entity, allowFaultReset:false, statusMessage:'Ready'};
  // No source precedence, duplicate ordering or timestamp guessing may erase a true flag.
  for (const [block, lastCall] of [
    [[entity],[no]], [[no],[entity]], [{},[entity,no]], [{},[no,entity]],
    [[entity,no],{}], [[no,entity],{}],
    [[{...entity,timestamp:'2026-10-22T11:00:00Z'}],[{...no,timestamp:'2026-10-22T12:00:00Z'}]],
  ]) {
    const result = snapshot(block,lastCall);
    assert.equal(result.eligible.length,1);
    assert.match(candidateBlockedReason(result.eligible[0]), /disagree/);
    assert.equal(result.eligible[0].statusMessageText,'Door fault');
    const found = result.eligible[0];
    assert.deepEqual(selectedSafetyCandidates([found],{[token]:candidateSignature(found)}),[]);
  }
  const agreed = snapshot([entity], [entity, {...entity}]).eligible;
  assert.equal(agreed.length,1);
  assert.equal(candidateBlockedReason(agreed[0]),'');
  const conflict = snapshot([entity],[no]).eligible[0];
  assert.notEqual(candidateSignature(agreed[0]),candidateSignature(conflict));
  assert.deepEqual(snapshot([no],[no]).eligible,[]);
  for (const flag of ['false','true',1,0,null,undefined]) {
    assert.deepEqual(snapshot([{...entity,allowFaultReset:flag}],{}).eligible,[]);
    assert.match(candidateBlockedReason(snapshot([entity],[{...entity,allowFaultReset:flag}]).eligible[0]),/disagree/);
  }
  for (const state of [{enabled:false},{communicating:false},{enabled:undefined},{communicating:undefined}]) {
    const result=snapshot([entity],[{...entity,...state}]);
    assert.equal(result.eligible.length,1);
    assert(candidateBlockedReason(result.eligible[0]));
  }
  const missing = snapshot({one:{allowFaultReset:true},two:{allowFaultReset:true}},{}).eligible;
  assert.equal(missing.length,2);
  assert.notEqual(missing[0].entityKeyToken,missing[1].entityKeyToken);
  for (const found of missing) {assert.match(candidateBlockedReason(found),/identity/);assert.equal(found.resetEntityKey,'');}
  const mismatch = snapshot([{...entity,entityKeyToken:'ANOTHER_DEVICE'}],{}).eligible[0];
  assert.match(candidateBlockedReason(mismatch),/identity/);
  assert.equal(mismatch.resetEntityKey,'');
  const collision = snapshot([entity],[{...entity,entityKey:token}]).eligible[0];
  assert.match(candidateBlockedReason(collision),/identity/);
  assert.equal(collision.resetEntityKey,'');
  const cyclic: Record<string,unknown> = {entity}; cyclic.self=cyclic;
  assert.equal(snapshot(cyclic,{}).eligible.length,1);
  let deep: unknown = entity;
  for(let i=0;i<5000;i++) deep={child:deep};
  assert.equal(snapshot(deep,{}).eligible.length,1);
  assert.deepEqual(snapshot(null,null).eligible,[]);
  const frozen = Object.freeze({...entity});
  snapshot([frozen],[frozen]);
  assert.equal(frozen.allowFaultReset,true);
}
console.log('SS3/SS4 candidate discovery: nesting, duplicate/source conflicts, identity, strict flags and selection guards passed.');
