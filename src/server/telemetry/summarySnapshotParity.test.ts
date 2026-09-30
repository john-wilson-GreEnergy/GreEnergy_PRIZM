import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CoordinatorRuntime } from './CoordinatorRuntime';
import { readSummarySource } from './summarySnapshotSelection';
import type { PrizmSiteSnapshot } from '../prizmDataCoordinator';

// Optional read-only replay of a saved production snapshot. Never import the
// application with its working directory pointing at real profiles or caches.
const fixturePath = process.argv[2] ? resolve(process.argv[2]) : null;
const fixture = fixturePath ? JSON.parse(await readFile(fixturePath, 'utf8')) : {
  cycleId: 42,
  rawSources: { strings: [
    { Array: 1, String: 1, communicating: true, positiveContactorClosed: true, negativeContactorClosed: true, inRotation: true, TimestampUtc: '2026-09-25T14:00:00Z', avgCellVoltageMv: 3250 },
    { Array: 1, String: 2, communicating: false, TimestampUtc: '2026-09-25T13:00:00Z' },
  ] },
};
const snapshot: PrizmSiteSnapshot = fixture.data ?? fixture;
assert(snapshot.cycleId != null && snapshot.rawSources?.strings?.length, 'Fixture must contain a populated site snapshot');
const cwd = process.cwd(), realDate = globalThis.Date;
process.chdir(await mkdtemp('/tmp/prizm-summary-parity-'));
const fixedNow = realDate.now();
// Hold only wall-clock formatting stable; performance.now still measures work.
globalThis.Date = class extends realDate {
  constructor(value?: string | number) { super(value === undefined ? fixedNow : value); }
  static now() { return fixedNow; }
} as DateConstructor;
try {
  const { buildStringBucketSummary } = await import('../siteOperations');
  const runtime = new CoordinatorRuntime<PrizmSiteSnapshot>(async () => ({ snapshot: null, successful: false }));
  runtime.setCurrentSnapshot(snapshot);
  const legacy = readSummarySource(runtime, null, false)!;
  const compact = readSummarySource(runtime, null, true)!;
  assert.deepEqual(compact, legacy);
  assert.deepEqual(buildStringBucketSummary(compact.strings!), buildStringBucketSummary(legacy.strings!));
  const timings: Record<string, number[]> = { legacy: [], compact: [] };
  for (let i = 0; i < 5; i++) {
    for (const mode of ['legacy', 'compact'] as const) {
      const started = performance.now();
      readSummarySource(runtime, null, mode === 'compact');
      timings[mode].push(Number((performance.now() - started).toFixed(2)));
    }
  }
  console.log(JSON.stringify({ cycleId: snapshot.cycleId, strings: compact.strings!.length,
    snapshotBytes: Buffer.byteLength(JSON.stringify(snapshot)), selectionBytes: Buffer.byteLength(JSON.stringify(compact)),
    selectionMs: timings, summaryParity: true, source: fixturePath ? 'cached-file-replay' : 'synthetic' }));
  runtime.stop();
} finally {
  globalThis.Date = realDate;
  process.chdir(cwd);
}
