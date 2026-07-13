import { CoordinatorCycleProfile, CoordinatorDurationStats, CoordinatorTimelineEntry, CoordinatorWaitState } from "./CoordinatorProfilerTypes";

export function durationStats(values: readonly number[]): CoordinatorDurationStats {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return { count: 0, min: null, max: null, average: null, median: null, p95: null };
  const average = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const midpoint = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[midpoint - 1] + sorted[midpoint]) / 2 : sorted[midpoint];
  const percentileIndex = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return { count: sorted.length, min: sorted[0], max: sorted[sorted.length - 1], average, median, p95: sorted[percentileIndex] };
}

export function calculateMaximumConcurrency(entries: readonly CoordinatorTimelineEntry[]): number {
  const events = entries.flatMap((entry) => entry.end == null ? [] : [
    { at: entry.start, delta: 1 },
    { at: entry.end, delta: -1 },
  ]).sort((a, b) => a.at - b.at || a.delta - b.delta);
  let active = 0;
  let maximum = 0;
  for (const event of events) {
    active += event.delta;
    maximum = Math.max(maximum, active);
  }
  return maximum;
}

export function calculateIdleDuration(entries: readonly CoordinatorTimelineEntry[], cycleDuration: number): number {
  const intervals = entries
    .filter((entry) => (entry.kind === "PHASE" || entry.kind === "GROUP") && entry.end != null && entry.parentPhaseId == null)
    .map((entry) => [Math.max(0, entry.start), Math.min(cycleDuration, entry.end as number)] as const)
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  let busy = 0;
  let cursor = 0;
  for (const [start, end] of intervals) {
    if (end <= cursor) continue;
    busy += end - Math.max(start, cursor);
    cursor = end;
  }
  return Math.max(0, cycleDuration - busy);
}

export function calculateWaitDuration(entries: readonly CoordinatorTimelineEntry[], cycleDuration: number, waitState: CoordinatorWaitState): number {
  const intervals = entries
    .filter((entry) => entry.kind === "PHASE" && entry.waitState === waitState && entry.end != null)
    .map((entry) => [Math.max(0, entry.start), Math.min(cycleDuration, entry.end as number)] as const)
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let cursor = 0;
  for (const [start, end] of intervals) {
    if (end <= cursor) continue;
    covered += end - Math.max(start, cursor);
    cursor = end;
  }
  return covered;
}

export function renderAsciiTimeline(profile: Pick<CoordinatorCycleProfile, "cycleId" | "cycleDuration" | "timeline" | "waits">, width = 36): string {
  const duration = Math.max(1, profile.cycleDuration ?? 1);
  const phases = profile.timeline
    .filter((entry) => entry.kind === "PHASE" && entry.duration != null && entry.parentPhaseId == null)
    .sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0));
  const rows = [`Cycle ${profile.cycleId} (${(profile.cycleDuration ?? 0).toFixed(1)}ms)`];
  for (const phase of phases) {
    const blocks = Math.max(1, Math.round(((phase.duration ?? 0) / duration) * width));
    rows.push(`${phase.phase} ${(phase.duration ?? 0).toFixed(1)}ms`);
    rows.push("█".repeat(Math.min(width, blocks)));
  }
  const idleBlocks = Math.round((profile.waits.idleWaitMs / duration) * width);
  rows.push(`Idle ${profile.waits.idleWaitMs.toFixed(1)}ms`);
  rows.push(idleBlocks > 0 ? "░".repeat(Math.min(width, idleBlocks)) : "·");
  return rows.join("\n");
}
