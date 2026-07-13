import { StringViewerCacheEntry, StringViewerPriorityClass, StringViewerSchedulerConfig } from "./StringViewerTypes";

type RecentRequest = { stringKey: string; priority: StringViewerPriorityClass; latencyMs: number; success: boolean; cycleId: number | null; completedAt: string };

export class StringViewerMetrics {
  requestsAttempted = 0;
  successes = 0;
  failures = 0;
  timeouts = 0;
  cacheHits = 0;
  cacheMisses = 0;
  staleHits = 0;
  coalescedRequests = 0;
  skippedFresh = 0;
  retainedLastKnownGood = 0;
  mergeCount = 0;
  totalMergeMs = 0;
  totalQueueWaitMs = 0;
  fullSweepCount = 0;
  fullSweepDurationMs = 0;
  currentCycleId: number | null = null;
  requestsThisCycle = 0;
  readonly refreshesByPriority: Record<StringViewerPriorityClass, number> = { ON_DEMAND: 0, HOT: 0, WARM: 0, COLD: 0 };
  readonly requestsByCycle: Record<string, number> = {};
  private readonly recent: RecentRequest[] = [];

  startCycle(cycleId: number | null): void { this.currentCycleId = cycleId; this.requestsThisCycle = 0; }
  attempted(priority: StringViewerPriorityClass, queueWaitMs: number): void {
    this.requestsAttempted += 1; this.requestsThisCycle += 1; this.totalQueueWaitMs += Math.max(0, queueWaitMs);
    this.refreshesByPriority[priority] += 1;
    const key = this.currentCycleId == null ? "none" : String(this.currentCycleId);
    this.requestsByCycle[key] = (this.requestsByCycle[key] ?? 0) + 1;
  }
  completed(stringKey: string, priority: StringViewerPriorityClass, latencyMs: number, success: boolean, timeout: boolean): void {
    if (success) this.successes += 1; else this.failures += 1;
    if (timeout) this.timeouts += 1;
    this.recent.push({ stringKey, priority, latencyMs, success, cycleId: this.currentCycleId, completedAt: new Date().toISOString() });
    if (this.recent.length > 100) this.recent.shift();
  }
  merged(durationMs: number): void { this.mergeCount += 1; this.totalMergeMs += Math.max(0, durationMs); }

  report(args: { config: StringViewerSchedulerConfig; queueDepth: number; inFlight: number; entries: StringViewerCacheEntry[]; candidates: Array<{ priority: StringViewerPriorityClass }>; fullRefreshProgress: { completed: number; total: number } }) {
    const now = Date.now();
    const entries = args.entries;
    const freshCount = entries.filter((entry) => entry.value != null && !entry.stale).length;
    const staleCount = entries.filter((entry) => entry.stale && entry.value != null).length;
    const priorityCounts = { ON_DEMAND: 0, HOT: 0, WARM: 0, COLD: 0 } as Record<StringViewerPriorityClass, number>;
    for (const candidate of args.candidates) priorityCounts[candidate.priority] += 1;
    return {
      mode: args.config.mode,
      queueDepth: args.queueDepth,
      inFlight: args.inFlight,
      maxConcurrency: args.config.maxConcurrency,
      batchBudget: args.config.batchBudget,
      cacheSize: entries.length,
      freshCount,
      staleCount,
      missingCount: Math.max(0, args.candidates.length - entries.filter((entry) => entry.value != null).length),
      hotCount: priorityCounts.HOT,
      warmCount: priorityCounts.WARM,
      coldCount: priorityCounts.COLD,
      requestsThisCycle: this.requestsThisCycle,
      requestsAttempted: this.requestsAttempted,
      successes: this.successes,
      failures: this.failures,
      timeouts: this.timeouts,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      staleHits: this.staleHits,
      coalescedRequests: this.coalescedRequests,
      skippedFresh: this.skippedFresh,
      retainedLastKnownGood: this.retainedLastKnownGood,
      averageQueueWaitMs: this.requestsAttempted ? this.totalQueueWaitMs / this.requestsAttempted : 0,
      averageMergeMs: this.mergeCount ? this.totalMergeMs / this.mergeCount : 0,
      refreshesByPriority: { ...this.refreshesByPriority },
      requestsByCycle: { ...this.requestsByCycle },
      fullRefreshProgress: args.fullRefreshProgress,
      oldestEntry: (() => {
        const entry = [...entries].filter((candidate) => candidate.lastSuccessAt).sort((a, b) => new Date(a.lastSuccessAt!).getTime() - new Date(b.lastSuccessAt!).getTime())[0];
        return entry ? { stringKey: entry.stringKey, arrayIndex: entry.arrayIndex, stringIndex: entry.stringIndex, lastSuccessAt: entry.lastSuccessAt, ageMs: entry.ageMs, stale: entry.stale, cycleId: entry.cycleId, sourceUrl: entry.sourceUrl } : null;
      })(),
      slowestRecentRequests: [...this.recent].sort((a, b) => b.latencyMs - a.latencyMs).slice(0, 10),
      failedEntries: entries.filter((entry) => !entry.success).map((entry) => ({ stringKey: entry.stringKey, lastError: entry.lastError, failureCount: entry.failureCount, consecutiveFailureCount: entry.consecutiveFailureCount, ageMs: entry.ageMs })),
      perPriorityCounts: priorityCounts,
      currentCycleId: this.currentCycleId,
      generatedAt: new Date(now).toISOString(),
    };
  }

  reset(): void {
    Object.assign(this, new StringViewerMetrics());
  }
}
