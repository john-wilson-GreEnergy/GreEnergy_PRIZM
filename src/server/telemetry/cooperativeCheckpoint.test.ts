import assert from 'node:assert/strict';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {createCooperativeCheckpoint, cooperativeProcessingEnabled} from './cooperativeCheckpoint';
import {CoordinatorRuntime} from './CoordinatorRuntime';
import {getTelemetryCycleId} from './TelemetryCycleContext';

for (const enabled of [true, false]) {
  const order: string[] = [];
  setImmediate(() => order.push('ready I/O'));
  const checkpoint = createCooperativeCheckpoint(() => true, enabled);
  await checkpoint();
  order.push('next processing stage');
  await nextTurn();
  assert.deepEqual(order, enabled ? ['ready I/O', 'next processing stage'] : ['next processing stage', 'ready I/O']);
}

let valid = true, yields = 0;
const invalidated = createCooperativeCheckpoint(() => valid, true, async () => {yields++; valid = false;});
await assert.rejects(invalidated(), /context changed/);
await assert.rejects(invalidated(), /context changed/);
assert.equal(yields, 1, 'An invalid context cannot enter another processing stage.');
await assert.rejects(createCooperativeCheckpoint(() => false, false)(), /context changed/, 'Rollback keeps context protection.');

async function fixture(enabled: boolean) {
  const previous = {cycleId: 0, rows: [0], complete: true};
  let published = previous, executions = 0, active = 0, maximum = 0;
  const observations: typeof previous[] = [];
  const runtime = new CoordinatorRuntime<typeof previous>(async ({cycleId}) => {
    executions++; active++; maximum = Math.max(active, maximum);
    const checkpoint = createCooperativeCheckpoint(() => true, enabled);
    const draft = {cycleId, rows: [1], complete: false};
    if (cycleId === 1) setImmediate(() => {
      observations.push(structuredClone(published));
      for (let i = 0; i < 10; i++) runtime.requestRefresh('during-processing');
    });
    await checkpoint();
    assert.equal(getTelemetryCycleId(), cycleId, 'Producing-cycle identity survives yielding.');
    draft.rows.push(2);
    await checkpoint();
    draft.complete = true;
    published = draft;
    active--;
    return {snapshot: published, successful: true};
  });
  runtime.setCurrentSnapshot(previous);
  runtime.requestRefresh('test');
  await runtime.waitForIdle();
  await nextTurn();
  await runtime.waitForIdle();
  assert.equal(maximum, 1, 'Yielding must not release the coordinator single-flight lock.');
  assert.equal(executions, 2, 'Refresh bursts remain coalesced, not duplicated.');
  assert.ok(observations.every(row => row.complete));
  if (enabled) assert.deepEqual(observations, [previous], 'Readers keep the complete old revision until publication.');
  runtime.stop();
  return published;
}
assert.deepEqual(await fixture(true), await fixture(false), 'Cooperative and rollback paths produce the same data.');
const oldFlag = process.env.PRIZM_COOPERATIVE_PROCESSING;
try {
  delete process.env.PRIZM_COOPERATIVE_PROCESSING; assert.equal(cooperativeProcessingEnabled(), true);
  process.env.PRIZM_COOPERATIVE_PROCESSING = 'false'; assert.equal(cooperativeProcessingEnabled(), false);
} finally {
  if (oldFlag === undefined) delete process.env.PRIZM_COOPERATIVE_PROCESSING;
  else process.env.PRIZM_COOPERATIVE_PROCESSING = oldFlag;
}
console.log('Cooperative checkpoints: I/O fairness, rollback parity, atomic publication fixture, context invalidation and coordinator lock passed.');
