import type { CoordinatorRuntime, SnapshotReadOnly } from './CoordinatorRuntime';

type SummarySource = {
  cycleId: number;
  rawSources?: { strings?: unknown[] };
};

export function selectSummarySource(snapshot: SnapshotReadOnly<SummarySource>) {
  return { cycleId: snapshot.cycleId, strings: snapshot.rawSources?.strings };
}

export function readSummarySource<T extends SummarySource>(
  runtime: CoordinatorRuntime<T>,
  centralFallback: T | null,
  compact = process.env.PRIZM_COMPACT_SUMMARY_SELECTION !== 'false',
) {
  if (!compact) {
    const snapshot = runtime.getCurrentSnapshot() || centralFallback;
    return snapshot ? { cycleId: snapshot.cycleId, strings: structuredClone(snapshot.rawSources?.strings) } : null;
  }
  const selected = runtime.getCurrentProjection(snapshot => selectSummarySource(snapshot));
  if (selected) return { cycleId: selected.cycleId, strings: selected.strings };
  return centralFallback ? structuredClone(selectSummarySource(centralFallback)) : null;
}
