export type NormalizationDomain = "strings" | "first-responder";

export interface NormalizationTimingMetric {
  count: number;
  totalMs: number;
  latestMs: number | null;
  minimumMs: number | null;
  maximumMs: number | null;
  averageMs: number | null;
}

export interface NormalizationCycleMetric {
  cycleId: number;
  domain: NormalizationDomain;
  invocationCount: number;
  executionCount: number;
  hitCount: number;
  missCount: number;
  inFlightReuseCount: number;
  failureCount: number;
  subPhases: Record<string, NormalizationTimingMetric>;
  counters: Record<string, number>;
}

export type ReturnTypeOfNormalizationMetricsReport = ReturnType<NormalizationMetrics["report"]>;

function emptyTiming(): NormalizationTimingMetric {
  return { count: 0, totalMs: 0, latestMs: null, minimumMs: null, maximumMs: null, averageMs: null };
}

function addTiming(metric: NormalizationTimingMetric, durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  metric.count += 1;
  metric.totalMs += durationMs;
  metric.latestMs = durationMs;
  metric.minimumMs = metric.minimumMs == null ? durationMs : Math.min(metric.minimumMs, durationMs);
  metric.maximumMs = metric.maximumMs == null ? durationMs : Math.max(metric.maximumMs, durationMs);
  metric.averageMs = metric.totalMs / metric.count;
}

export class NormalizationMetrics {
  private readonly cycles = new Map<string, NormalizationCycleMetric>();
  private readonly retainedCycleIds: number[] = [];

  constructor(private readonly monotonicNow: () => number = () => performance.now(), private readonly historyLimit = 100) {}

  recordInvocation(cycleId: number, domain: NormalizationDomain): void { this.state(cycleId, domain).invocationCount += 1; }
  recordExecution(cycleId: number, domain: NormalizationDomain): void { this.state(cycleId, domain).executionCount += 1; }
  recordHit(cycleId: number, domain: NormalizationDomain): void { this.state(cycleId, domain).hitCount += 1; }
  recordMiss(cycleId: number, domain: NormalizationDomain): void { this.state(cycleId, domain).missCount += 1; }
  recordInFlightReuse(cycleId: number, domain: NormalizationDomain): void { this.state(cycleId, domain).inFlightReuseCount += 1; }
  recordFailure(cycleId: number, domain: NormalizationDomain): void { this.state(cycleId, domain).failureCount += 1; }

  increment(cycleId: number, domain: NormalizationDomain, counter: string, count = 1): void {
    const state = this.state(cycleId, domain);
    state.counters[counter] = (state.counters[counter] ?? 0) + count;
  }

  recordDuration(cycleId: number, domain: NormalizationDomain, subPhase: string, durationMs: number): void {
    const state = this.state(cycleId, domain);
    const timing = state.subPhases[subPhase] ?? emptyTiming();
    addTiming(timing, durationMs);
    state.subPhases[subPhase] = timing;
  }

  measure<T>(cycleId: number, domain: NormalizationDomain, subPhase: string, operation: () => T): T {
    const startedAt = this.monotonicNow();
    try { return operation(); }
    finally { this.recordDuration(cycleId, domain, subPhase, this.monotonicNow() - startedAt); }
  }

  async measureAsync<T>(cycleId: number, domain: NormalizationDomain, subPhase: string, operation: () => Promise<T>): Promise<T> {
    const startedAt = this.monotonicNow();
    try { return await operation(); }
    finally { this.recordDuration(cycleId, domain, subPhase, this.monotonicNow() - startedAt); }
  }

  report(): { cycles: NormalizationCycleMetric[]; totals: Record<NormalizationDomain, Omit<NormalizationCycleMetric, "cycleId" | "domain">> } {
    const cycles = [...this.cycles.values()].sort((a, b) => a.cycleId - b.cycleId).map((value) => structuredClone(value));
    const totals = {} as Record<NormalizationDomain, Omit<NormalizationCycleMetric, "cycleId" | "domain">>;
    for (const domain of ["strings", "first-responder"] as const) {
      const matching = cycles.filter((cycle) => cycle.domain === domain);
      const total: Omit<NormalizationCycleMetric, "cycleId" | "domain"> = {
        invocationCount: 0, executionCount: 0, hitCount: 0, missCount: 0, inFlightReuseCount: 0, failureCount: 0, subPhases: {}, counters: {},
      };
      for (const cycle of matching) {
        total.invocationCount += cycle.invocationCount;
        total.executionCount += cycle.executionCount;
        total.hitCount += cycle.hitCount;
        total.missCount += cycle.missCount;
        total.inFlightReuseCount += cycle.inFlightReuseCount;
        total.failureCount += cycle.failureCount;
        for (const [name, timing] of Object.entries(cycle.subPhases)) {
          const target = total.subPhases[name] ?? emptyTiming();
          if (timing.count > 0) {
            target.count += timing.count;
            target.totalMs += timing.totalMs;
            target.latestMs = timing.latestMs;
            target.minimumMs = target.minimumMs == null ? timing.minimumMs : timing.minimumMs == null ? target.minimumMs : Math.min(target.minimumMs, timing.minimumMs);
            target.maximumMs = target.maximumMs == null ? timing.maximumMs : timing.maximumMs == null ? target.maximumMs : Math.max(target.maximumMs, timing.maximumMs);
            target.averageMs = target.totalMs / target.count;
          }
          total.subPhases[name] = target;
        }
        for (const [name, count] of Object.entries(cycle.counters)) total.counters[name] = (total.counters[name] ?? 0) + count;
      }
      totals[domain] = total;
    }
    return { cycles, totals };
  }

  reset(): void { this.cycles.clear(); this.retainedCycleIds.length = 0; }

  private state(cycleId: number, domain: NormalizationDomain): NormalizationCycleMetric {
    const key = `${cycleId}:${domain}`;
    let state = this.cycles.get(key);
    if (!state) {
      state = { cycleId, domain, invocationCount: 0, executionCount: 0, hitCount: 0, missCount: 0, inFlightReuseCount: 0, failureCount: 0, subPhases: {}, counters: {} };
      this.cycles.set(key, state);
      if (!this.retainedCycleIds.includes(cycleId)) {
        this.retainedCycleIds.push(cycleId);
        while (this.retainedCycleIds.length > this.historyLimit) {
          const expired = this.retainedCycleIds.shift();
          if (expired != null) for (const domain of ["strings", "first-responder"] as const) this.cycles.delete(`${expired}:${domain}`);
        }
      }
    }
    return state;
  }
}

export const normalizationMetrics = new NormalizationMetrics();
