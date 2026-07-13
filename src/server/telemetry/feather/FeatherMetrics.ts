import type { FeatherParsedSnapshot, FeatherPriorityClass, FeatherRawSnapshot, FeatherSchedulerConfig, FeatherTopologyClassification } from "./FeatherTypes";

type Recent = { deviceIp: string; latencyMs: number; success: boolean; priority: FeatherPriorityClass; cycleId: number | null; completedAt: string };

export class FeatherMetrics {
  currentCycleId: number | null = null;
  requestsThisCycle = 0;
  successesThisCycle = 0;
  failuresThisCycle = 0;
  attempts = 0; successes = 0; failures = 0; cacheHits = 0; cacheMisses = 0; staleHits = 0; parseHits = 0; parseMisses = 0; coalescedRequests = 0; skippedFresh = 0; retainedLastKnownGood = 0; diagnosticsAttempts = 0;
  totalLatencyMs = 0; totalParseDurationMs = 0; totalDiagnosticsLatencyMs = 0; totalReportBytes = 0; totalMainDataBytes = 0; schedulerPhaseDurationMs = 0;
  readonly requestsByPriority: Record<FeatherPriorityClass, number> = { ON_DEMAND: 0, HOT: 0, WARM: 0, COLD: 0 };
  readonly requestsByCycle: Record<string, number> = {};
  readonly controllersRefreshedByCycle: Record<string, number> = {};
  parityComparisons = 0;
  parityDifferences: Array<{ deviceIp: string; differences: string[]; recordedAt: string }> = [];
  private readonly recent: Recent[] = [];

  startCycle(cycleId: number | null): void { this.currentCycleId = cycleId; this.requestsThisCycle = 0; this.successesThisCycle = 0; this.failuresThisCycle = 0; }
  attempted(priority: FeatherPriorityClass): void { this.attempts++; this.requestsThisCycle++; this.requestsByPriority[priority]++; const key = this.currentCycleId == null ? "none" : String(this.currentCycleId); this.requestsByCycle[key] = (this.requestsByCycle[key] ?? 0) + 1; }
  completed(deviceIp: string, priority: FeatherPriorityClass, latencyMs: number, success: boolean, raw: FeatherRawSnapshot): void {
    this.totalLatencyMs += latencyMs;
    if (success) { this.successes++; this.successesThisCycle++; } else { this.failures++; this.failuresThisCycle++; }
    if (raw.retainedLastKnownGood) this.retainedLastKnownGood++;
    this.totalReportBytes += raw.reportBytes ?? 0; this.totalMainDataBytes += raw.mainDataBytes ?? 0;
    const key = this.currentCycleId == null ? "none" : String(this.currentCycleId); this.controllersRefreshedByCycle[key] = (this.controllersRefreshedByCycle[key] ?? 0) + 1;
    this.recent.push({ deviceIp, priority, latencyMs, success, cycleId: this.currentCycleId, completedAt: new Date().toISOString() }); if (this.recent.length > 100) this.recent.shift();
  }
  recordParity(deviceIp: string, values: Record<string, boolean>): void { this.parityComparisons++; const differences = Object.entries(values).filter(([, equal]) => !equal).map(([name]) => name); if (differences.length) { this.parityDifferences.push({ deviceIp, differences, recordedAt: new Date().toISOString() }); if (this.parityDifferences.length > 100) this.parityDifferences.shift(); } }

  report(args: { config: FeatherSchedulerConfig; queueDepth: number; inFlight: number; diagnosticsInFlight: number; raw: FeatherRawSnapshot[]; parsedCount: number; topology: Record<FeatherTopologyClassification, string[]>; fullRefreshProgress: { completed: number; total: number } }) {
    const raw = args.raw;
    const oldest = [...raw].filter((entry) => entry.lastSuccessAt).sort((a, b) => new Date(a.lastSuccessAt!).getTime() - new Date(b.lastSuccessAt!).getTime())[0];
    return {
      mode: args.config.mode, currentCycleId: this.currentCycleId,
      controllersKnown: Object.values(args.topology).reduce((sum, values) => sum + values.length, 0),
      controllersExpected: args.topology["expected-and-reachable"].length + args.topology["expected-but-unavailable"].length,
      controllersReachable: args.topology["expected-and-reachable"].length,
      controllersStale: raw.filter((entry) => entry.stale).length,
      controllersMissing: Math.max(0, Object.values(args.topology).reduce((sum, values) => sum + values.length, 0) - raw.length),
      queueDepth: args.queueDepth, inFlight: args.inFlight, maxConcurrency: args.config.maxConcurrency,
      cacheSize: raw.length, parsedCacheSize: args.parsedCount, diagnosticsInFlight: args.diagnosticsInFlight,
      cacheHits: this.cacheHits, cacheMisses: this.cacheMisses, staleHits: this.staleHits, parseHits: this.parseHits, parseMisses: this.parseMisses,
      coalescedRequests: this.coalescedRequests, skippedFresh: this.skippedFresh, retainedLastKnownGood: this.retainedLastKnownGood,
      requestsThisCycle: this.requestsThisCycle, successesThisCycle: this.successesThisCycle, failuresThisCycle: this.failuresThisCycle,
      acquisitionAttempts: this.attempts, successes: this.successes, failures: this.failures,
      requestsByPriority: { ...this.requestsByPriority }, requestsByCycle: { ...this.requestsByCycle }, controllersRefreshedByCycle: { ...this.controllersRefreshedByCycle },
      averageLatency: this.attempts ? this.totalLatencyMs / this.attempts : 0,
      averageParseDuration: this.parseMisses ? this.totalParseDurationMs / this.parseMisses : 0,
      diagnosticsAttempts: this.diagnosticsAttempts, averageDiagnosticsLatency: this.diagnosticsAttempts ? this.totalDiagnosticsLatencyMs / this.diagnosticsAttempts : 0,
      reportBytes: this.totalReportBytes, mainDataBytes: this.totalMainDataBytes,
      slowestRecentRequests: [...this.recent].sort((a, b) => b.latencyMs - a.latencyMs).slice(0, 10),
      failedControllers: raw.filter((entry) => !entry.success).map((entry) => ({ deviceIp: entry.deviceIp, lastError: entry.lastError, failureCount: entry.failureCount, consecutiveFailureCount: entry.consecutiveFailureCount, retainedLastKnownGood: entry.retainedLastKnownGood, producingCycleId: entry.cycleId, failureCycleId: entry.failureCycleId })),
      staleControllers: raw.filter((entry) => entry.stale).map((entry) => ({ deviceIp: entry.deviceIp, lastSuccessAt: entry.lastSuccessAt, sourceObservationAt: entry.sourceObservationAt, cycleId: entry.cycleId })),
      topologyClassification: args.topology, fullRefreshProgress: args.fullRefreshProgress,
      oldestEntry: oldest ? { deviceIp: oldest.deviceIp, lastSuccessAt: oldest.lastSuccessAt, sourceObservationAt: oldest.sourceObservationAt, cycleId: oldest.cycleId, stale: oldest.stale } : null,
      parity: { comparisons: this.parityComparisons, differences: [...this.parityDifferences] },
      memoryUsage: process.memoryUsage(),
    };
  }
  reset(): void { Object.assign(this, new FeatherMetrics()); }
}
