import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CoordinatorRuntime } from './CoordinatorRuntime';
import { readSnapshotCycleId } from './snapshotCycleSelection';

type Fixture = { cycleId?: unknown; payload?: unknown };
let outcome: Fixture | null = { cycleId: 1 }, successful = true, fail = false;
const runtime = new CoordinatorRuntime<Fixture>(async () => {
  if (fail) throw new Error('fixture failure');
  return { snapshot: outcome, successful };
});
const fallback = { cycleId: 999, payload: { sourceTimestamp: '2026-09-25T14:00:00Z' } };
function parity() {
  const oldSnapshot = runtime.getCurrentSnapshot() || fallback;
  const oldValue = Number(oldSnapshot?.cycleId);
  const expected = Number.isSafeInteger(oldValue) ? oldValue : null;
  assert.equal(readSnapshotCycleId(runtime, fallback, true), expected);
  assert.equal(readSnapshotCycleId(runtime, fallback, false), expected);
}
assert.equal(readSnapshotCycleId(runtime, null, true), null);
assert.equal(readSnapshotCycleId(runtime, null, false), null);
parity();
for (const value of [0, 7, -1, '25', undefined, null, '', NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, 'invalid']) {
  runtime.setCurrentSnapshot({ cycleId: value });
  parity();
}
runtime.setCurrentSnapshot({});
parity();
assert.equal(readSnapshotCycleId(runtime, fallback, true), null, 'Invalid current cycle must not use fallback 999');
runtime.setCurrentSnapshot({ cycleId: 7, payload: fallback.payload });
const fullGetter = runtime.getCurrentSnapshot.bind(runtime);
runtime.getCurrentSnapshot = () => { throw new Error('Full snapshot getter must not be called'); };
assert.equal(readSnapshotCycleId(runtime, fallback, true), 7);
const priorFlag = process.env.PRIZM_COMPACT_REPORT_CYCLE;
try {
  process.env.PRIZM_COMPACT_REPORT_CYCLE = 'true';
  assert.equal(readSnapshotCycleId(runtime, fallback), 7);
  process.env.PRIZM_COMPACT_REPORT_CYCLE = 'false';
  assert.throws(() => readSnapshotCycleId(runtime, fallback), /Full snapshot getter/);
} finally {
  runtime.getCurrentSnapshot = fullGetter;
  if (priorFlag === undefined) delete process.env.PRIZM_COMPACT_REPORT_CYCLE;
  else process.env.PRIZM_COMPACT_REPORT_CYCLE = priorFlag;
}
assert.deepEqual(runtime.getCurrentSnapshot()?.payload, fallback.payload);
let release!: () => void;
const held = new CoordinatorRuntime<Fixture>(async () => {
  await new Promise<void>(resolve => { release = resolve; });
  return { snapshot: { cycleId: 8 }, successful: true };
});
held.setCurrentSnapshot({ cycleId: 7 }); held.requestRefresh('held');
await new Promise<void>(resolve => setImmediate(resolve));
assert.equal(readSnapshotCycleId(held, fallback), 7);
release(); await held.waitForIdle();
assert.equal(readSnapshotCycleId(held, fallback), 8);
for (const state of ['success', 'partial', 'empty-failure', 'exception'] as const) {
  successful = state === 'success'; fail = state === 'exception';
  outcome = state === 'success' ? { cycleId: 10 } : state === 'partial' ? { cycleId: 11 } : null;
  runtime.requestRefresh(state); await runtime.waitForIdle();
  parity();
  assert.equal(readSnapshotCycleId(runtime, fallback), state === 'partial' ? 11 : 10);
}
runtime.setCurrentSnapshot(null); parity();
assert.equal(readSnapshotCycleId(runtime, null), null, 'Reset clears eligibility');
runtime.stop(); held.stop();

if (process.argv[2]) {
  const file = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const snapshot = file.data ?? file;
  assert(Number.isSafeInteger(snapshot.cycleId));
  const replay = new CoordinatorRuntime<Fixture>(async () => ({ snapshot: null, successful: false }));
  replay.setCurrentSnapshot(snapshot);
  const timings: Record<string, number[]> = { legacy: [], compact: [] };
  for (let i = 0; i < 5; i++) {
    for (const mode of ['legacy', 'compact'] as const) {
      const started = performance.now();
      assert.equal(readSnapshotCycleId(replay, null, mode === 'compact'), snapshot.cycleId);
      timings[mode].push(Number((performance.now() - started).toFixed(3)));
    }
  }
  console.log(JSON.stringify({ source: 'read-only cached snapshot replay', cycle: snapshot.cycleId,
    snapshotBytes: Buffer.byteLength(JSON.stringify(snapshot)), cycleCheckMs: timings }));
}
console.log('Report cycle selection: legacy parity, no full copy, source priority, startup/reset, in-flight, partial/failure recovery and rollback passed.');
