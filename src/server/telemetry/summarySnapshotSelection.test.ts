import assert from 'node:assert/strict';
import { CoordinatorRuntime } from './CoordinatorRuntime';
import { readSummarySource } from './summarySnapshotSelection';

type Fixture = { cycleId: number; rawSources?: { strings?: Array<{ sourceTimestampUtc: string; volts: number | null; nested?: { value: number } }> }; unrelated?: unknown };
const stamp = '2026-09-25T14:00:00.000Z';
const fixture = (cycleId: number): Fixture => ({ cycleId, rawSources: { strings: [{ sourceTimestampUtc: stamp, volts: 1234, nested: { value: 1 } }] } });
let outcome: Fixture | null = fixture(1), successful = true, throws = false;
const runtime = new CoordinatorRuntime<Fixture>(async () => {
  if (throws) throw new Error('fixture failure');
  return { snapshot: outcome, successful };
});
const fallback = fixture(99);
function parity() {
  assert.deepEqual(readSummarySource(runtime, fallback, true), readSummarySource(runtime, fallback, false));
}
assert.equal(readSummarySource(runtime, null, true), null);
parity(); // Startup central fallback, preserving structuredClone semantics.
fallback.rawSources!.strings![0].volts = NaN;
parity();
fallback.rawSources!.strings![0].volts = 1234;
runtime.setCurrentSnapshot(fixture(1));
parity();
const detached = readSummarySource(runtime, fallback, true)!;
(detached.strings![0] as { nested: { value: number } }).nested.value = 100;
assert.equal((readSummarySource(runtime, null, true)!.strings![0] as { nested: { value: number } }).nested.value, 1);
assert.equal(readSummarySource(runtime, fallback, true)!.cycleId, 1, 'Current runtime publication wins over newer central fallback');
runtime.setCurrentSnapshot({ cycleId: 2, rawSources: { strings: [] } });
parity();
assert.equal(readSummarySource(runtime, fallback, true)!.cycleId, 2, 'Empty strings must not select another cycle');
runtime.setCurrentSnapshot({ cycleId: 3 });
parity();
runtime.setCurrentSnapshot(fixture(1));
let release!: () => void;
const held = new CoordinatorRuntime<Fixture>(async () => {
  await new Promise<void>(resolve => { release = resolve; });
  return { snapshot: fixture(4), successful: true };
});
held.setCurrentSnapshot(fixture(1));
held.requestRefresh('fixture-held');
await new Promise<void>(resolve => setImmediate(resolve));
assert.equal(readSummarySource(held, fallback, true)!.cycleId, 1, 'Unfinished cycle cannot replace published data');
release(); await held.waitForIdle();
assert.equal(readSummarySource(held, fallback, true)!.cycleId, 4);
for (const state of ['success', 'partial', 'empty-failure', 'throw'] as const) {
  successful = state === 'success';
  throws = state === 'throw';
  outcome = state === 'success' ? fixture(5) : state === 'partial' ? fixture(6) : null;
  runtime.requestRefresh(`fixture-${state}`); await runtime.waitForIdle();
  parity();
  assert.equal(readSummarySource(runtime, fallback, true)!.cycleId, state === 'partial' ? 6 : 5);
  assert.equal((readSummarySource(runtime, null, true)!.strings![0] as { sourceTimestampUtc: string }).sourceTimestampUtc, stamp);
}
const original = process.env.PRIZM_COMPACT_SUMMARY_SELECTION;
try {
  for (const value of ['true', 'false']) {
    process.env.PRIZM_COMPACT_SUMMARY_SELECTION = value;
    assert.deepEqual(readSummarySource(runtime, fallback), readSummarySource(runtime, fallback, value !== 'false'));
  }
} finally {
  if (original === undefined) delete process.env.PRIZM_COMPACT_SUMMARY_SELECTION;
  else process.env.PRIZM_COMPACT_SUMMARY_SELECTION = original;
}
runtime.stop(); held.stop();
console.log('Summary selection: cycle/fallback/source-time parity, mutation isolation, partial/failure recovery and rollback passed.');
