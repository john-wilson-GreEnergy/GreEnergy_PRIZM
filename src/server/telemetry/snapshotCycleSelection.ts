import type { CoordinatorRuntime } from './CoordinatorRuntime';

type CycleSource = { cycleId?: unknown };

/** Read publication metadata without copying its unrelated telemetry payload. */
export function readSnapshotCycleId<T extends CycleSource>(
  runtime: CoordinatorRuntime<T>,
  centralFallback: T | null,
  compact = process.env.PRIZM_COMPACT_REPORT_CYCLE !== 'false',
): number | null {
  // Select an object rather than the scalar so a missing/invalid current cycle
  // cannot accidentally fall through to a newer central publication.
  const source = compact
    ? runtime.getCurrentProjection(snapshot => ({ cycleId: snapshot.cycleId }))
      ?? (centralFallback ? { cycleId: centralFallback.cycleId } : null)
    : runtime.getCurrentSnapshot() || centralFallback;
  const value = Number(source?.cycleId);
  return Number.isSafeInteger(value) ? value : null;
}
