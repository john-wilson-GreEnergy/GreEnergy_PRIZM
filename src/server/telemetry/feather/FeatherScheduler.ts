import { discoverTopologyCandidates } from "../../feather/featherDiscovery";
import { fetchJsonWithTimeout, publishFeatherNormalizedStatus, queryFeatherInternalDiagnostics } from "../../feather/featherClient";
import type { DiscoveryCandidate } from "../../feather/featherTypes";
import { coordinatorProfiler } from "../profiler";
import { telemetryMetrics } from "../metrics";
import { FeatherRawCache, immutableClone } from "./FeatherCache";
import { FeatherMetrics } from "./FeatherMetrics";
import { FeatherParser } from "./FeatherParser";
import { registerFeatherParsedEnrichment } from "./FeatherParsedEnrichmentRegistry";
import { classifyFeatherPriority, FEATHER_PRIORITY_ORDER, ttlForFeatherPriority } from "./FeatherPriority";
import type { FeatherAcquisitionResult, FeatherCandidate, FeatherParsedSnapshot, FeatherPriorityClass, FeatherSchedulerConfig, FeatherSchedulerCycleResult, FeatherTopologyClassification } from "./FeatherTypes";

type Acquire = (candidate: FeatherCandidate, timeoutMs: number) => Promise<FeatherAcquisitionResult>;
type Diagnostics = typeof queryFeatherInternalDiagnostics;

function positive(value: string | undefined, fallback: number): number { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback; }

export function getFeatherSchedulerConfig(env: NodeJS.ProcessEnv = process.env): FeatherSchedulerConfig {
  return {
    mode: env.PRIZM_FEATHER_MODE === "scheduled" ? "scheduled" : "legacy",
    maxConcurrency: positive(env.PRIZM_FEATHER_MAX_CONCURRENCY, 32),
    maxRefreshesPerCycle: positive(env.PRIZM_FEATHER_MAX_REFRESHES_PER_CYCLE, 64),
    hotTtlMs: positive(env.PRIZM_FEATHER_HOT_TTL_MS, 60_000),
    warmTtlMs: positive(env.PRIZM_FEATHER_WARM_TTL_MS, 90_000),
    coldTtlMs: positive(env.PRIZM_FEATHER_COLD_TTL_MS, 300_000),
    forceFullRefresh: env.PRIZM_FEATHER_FORCE_FULL_REFRESH === "true",
    timeoutMs: positive(env.FEATHER_REQUEST_TIMEOUT_MS, 3_000),
  };
}

export function shouldUseLegacyFeatherStatus(args: { queryLegacy?: boolean; forceLegacyEnv?: boolean; disableBrokerEnv?: boolean; mode?: "legacy" | "scheduled" }): boolean {
  return Boolean(args.queryLegacy || args.forceLegacyEnv || args.disableBrokerEnv || args.mode === "legacy");
}

function classifyTopology(candidate: DiscoveryCandidate, reachable: boolean | null): FeatherTopologyClassification {
  if (candidate.excluded && candidate.excludeReason?.includes("string-controller")) return "topology-derived-false-candidate";
  if (candidate.excluded) return "disabled-not-applicable";
  if (reachable === true) return "expected-and-reachable";
  if (reachable === false) return "expected-but-unavailable";
  return candidate.sourceDiscoveryMethod === "topology-profile" ? "expected-but-unavailable" : "unknown";
}

async function defaultAcquire(candidate: FeatherCandidate, timeoutMs: number): Promise<FeatherAcquisitionResult> {
  const started = performance.now();
  const startedAt = new Date().toISOString();
  const report = await fetchJsonWithTimeout(`http://${candidate.deviceIp}:8080/feather/status/report.json`, timeoutMs);
  const mainData = report.ok
    ? await fetchJsonWithTimeout(`http://${candidate.deviceIp}:8080/feather/main/data`, timeoutMs)
    : { ok: false, status: 0, data: null, error: "Skipped because status report acquisition failed", durationMs: 0 };
  return {
    report: { ...report, bytes: report.responseBytes ?? null },
    mainData: { ...mainData, bytes: "responseBytes" in mainData ? (mainData.responseBytes ?? null) : null },
    startedAt, completedAt: new Date().toISOString(), totalLatencyMs: performance.now() - started,
  };
}

export class FeatherScheduler {
  readonly rawCache: FeatherRawCache;
  readonly parser: FeatherParser;
  readonly metrics: FeatherMetrics;
  private readonly inFlight = new Map<string, Promise<FeatherParsedSnapshot | null>>();
  private readonly diagnosticsInFlight = new Map<string, Promise<any>>();
  private readonly requested = new Map<string, string>();
  private readonly visible = new Set<string>();
  private readonly candidates = new Map<string, FeatherCandidate>();
  private queueDepth = 0;
  private stopped = false;
  private fullRefreshProgress = { completed: 0, total: 0 };

  constructor(
    readonly config = getFeatherSchedulerConfig(),
    private readonly acquire: Acquire = defaultAcquire,
    private readonly diagnostics: Diagnostics = queryFeatherInternalDiagnostics,
    rawCache?: FeatherRawCache,
    parser?: FeatherParser,
    metrics?: FeatherMetrics,
  ) { this.rawCache = rawCache ?? new FeatherRawCache(); this.parser = parser ?? new FeatherParser(); this.metrics = metrics ?? new FeatherMetrics(); }

  markControllerVisible(deviceIp: string): void { this.visible.add(deviceIp); }
  markControllerHidden(deviceIp: string): void { this.visible.delete(deviceIp); }
  requestRefresh(deviceIp: string, reason = "operator-requested"): void { this.requested.set(deviceIp, reason); }
  requestRefreshMany(deviceIps: Iterable<string>, reason = "operator-requested"): void { for (const ip of deviceIps) this.requestRefresh(ip, reason); }
  requestPriorityRefresh(priority: FeatherPriorityClass, reason = "operator-requested-priority"): string[] { const ips = [...this.candidates.values()].filter((candidate) => candidate.priority === priority).map((candidate) => candidate.deviceIp); this.requestRefreshMany(ips, reason); return ips; }
  requestFullRefresh(reason = "operator-requested-full-sweep"): string[] { const ips = [...this.candidates.keys()]; this.requestRefreshMany(ips, reason); return ips; }

  async refreshController(deviceIp: string, reason = "operator-requested", cycleId: number | null = null): Promise<FeatherParsedSnapshot | null> {
    this.requestRefresh(deviceIp, reason);
    const candidate = this.toCandidate(this.candidates.get(deviceIp) ?? { deviceIp, sourceDiscoveryMethod: "manual" });
    this.candidates.set(deviceIp, candidate);
    const value = await this.refresh(candidate, cycleId);
    this.requested.delete(deviceIp);
    return value;
  }

  async refreshControllers(deviceIps: Iterable<string>, reason = "operator-requested", cycleId: number | null = null): Promise<Array<FeatherParsedSnapshot | null>> {
    const ips = [...new Set(deviceIps)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const results: Array<FeatherParsedSnapshot | null> = [];
    for (let index = 0; index < ips.length; index += this.config.maxConcurrency) {
      results.push(...await Promise.all(ips.slice(index, index + this.config.maxConcurrency).map((ip) => this.refreshController(ip, reason, cycleId))));
    }
    return results;
  }

  requestDiagnostics(deviceIp: string, _reason = "explicit-diagnostics"): Promise<any> {
    const existing = this.diagnosticsInFlight.get(deviceIp);
    if (existing) { this.metrics.coalescedRequests++; return existing; }
    this.metrics.diagnosticsAttempts++;
    const started = performance.now();
    const promise = this.diagnostics(deviceIp, this.config.timeoutMs).finally(() => {
      this.metrics.totalDiagnosticsLatencyMs += performance.now() - started;
      this.diagnosticsInFlight.delete(deviceIp);
    });
    this.diagnosticsInFlight.set(deviceIp, promise);
    return promise;
  }

  async runCycle(sourceCandidates: DiscoveryCandidate[] = discoverTopologyCandidates(), cycleId: number | null): Promise<FeatherSchedulerCycleResult> {
    if (this.stopped) return { cycleId, candidates: 0, requested: 0, refreshed: 0, snapshots: [] };
    this.metrics.startCycle(cycleId);
    const planningStarted = performance.now();
    const planned = sourceCandidates.map((candidate) => this.toCandidate(candidate));
    for (const candidate of planned) this.candidates.set(candidate.deviceIp, candidate);
    const expectedCount = planned.filter((candidate) => !candidate.excluded).length;
    const sweepLeadMs = Math.ceil(expectedCount / this.config.maxRefreshesPerCycle) * 15_000;
    const due = planned.map((candidate) => {
      const ttlMs = ttlForFeatherPriority(candidate.priority, this.config);
      const entry = this.rawCache.get(candidate.deviceIp, ttlMs);
      const planningLeadMs = ttlMs >= 30_000 ? Math.min(Math.max(0, ttlMs - 15_000), sweepLeadMs) : 0;
      const refreshDue = this.rawCache.isRefreshDue(candidate.deviceIp, ttlMs, planningLeadMs);
      if (entry && !refreshDue && !this.requested.has(candidate.deviceIp) && !this.config.forceFullRefresh) { this.metrics.cacheHits++; this.metrics.skippedFresh++; return null; }
      if (entry?.stale) this.metrics.staleHits++; else this.metrics.cacheMisses++;
      return { candidate, age: entry?.lastAttemptAt ? Date.now() - new Date(entry.lastAttemptAt).getTime() : Number.POSITIVE_INFINITY };
    }).filter((value): value is { candidate: FeatherCandidate; age: number } => value != null);
    due.sort((a, b) => FEATHER_PRIORITY_ORDER[a.candidate.priority] - FEATHER_PRIORITY_ORDER[b.candidate.priority] || b.age - a.age || a.candidate.deviceIp.localeCompare(b.candidate.deviceIp, undefined, { numeric: true }));
    const budget = this.config.forceFullRefresh ? due.length : Math.min(this.config.maxRefreshesPerCycle, due.length);
    const prioritySlots = Math.ceil(budget / 2);
    const selected = due.slice(0, prioritySlots);
    const remaining = due.filter((item) => !selected.includes(item)).sort((a, b) => b.age - a.age || a.candidate.deviceIp.localeCompare(b.candidate.deviceIp, undefined, { numeric: true }));
    selected.push(...remaining.slice(0, budget - selected.length));
    const cold = due.find((item) => item.candidate.priority === "COLD");
    if (cold && selected.length && !selected.some((item) => item.candidate.priority === "COLD")) selected[selected.length - 1] = cold;
    this.queueDepth = selected.length;
    telemetryMetrics.registry.recordCoordinatorPhase("Feather scheduler planning", { durationMs: performance.now() - planningStarted, blocking: true });
    if (this.config.forceFullRefresh) this.fullRefreshProgress = { completed: 0, total: selected.length };

    const schedulerStarted = performance.now();
    let cursor = 0;
    let refreshed = 0;
    const worker = async () => {
      while (!this.stopped && cursor < selected.length) {
        const item = selected[cursor++]; this.queueDepth = Math.max(0, this.queueDepth - 1);
        await this.refresh(item.candidate, cycleId); refreshed++;
        this.requested.delete(item.candidate.deviceIp);
        if (this.config.forceFullRefresh) this.fullRefreshProgress.completed++;
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.config.maxConcurrency, selected.length) }, () => worker()));
    const duration = performance.now() - schedulerStarted;
    this.metrics.schedulerPhaseDurationMs += duration;
    telemetryMetrics.registry.recordCoordinatorPhase("Feather scheduler", { durationMs: duration, blocking: true });
    return { cycleId, candidates: planned.length, requested: selected.length, refreshed, snapshots: this.getAllControllerSnapshots() };
  }

  getControllerSnapshot(deviceIp: string): FeatherParsedSnapshot | null {
    const parsed = this.parser.get(deviceIp);
    if (!parsed) return null;
    const stale = this.rawCache.isStale(deviceIp, this.candidates.has(deviceIp) ? ttlForFeatherPriority(this.candidates.get(deviceIp)!.priority, this.config) : this.config.warmTtlMs);
    return parsed.stale === stale ? parsed : immutableClone({ ...parsed, stale });
  }
  getAllControllerSnapshots(): FeatherParsedSnapshot[] {
    return this.parser.values().map((parsed) => {
      const candidate = this.candidates.get(parsed.deviceIp);
      const stale = this.rawCache.isStale(parsed.deviceIp, candidate ? ttlForFeatherPriority(candidate.priority, this.config) : this.config.warmTtlMs);
      return parsed.stale === stale ? parsed : immutableClone({ ...parsed, stale });
    });
  }

  getSchedulerState() {
    const topology = { "expected-and-reachable": [], "expected-but-unavailable": [], "topology-derived-false-candidate": [], "disabled-not-applicable": [], unknown: [] } as Record<FeatherTopologyClassification, string[]>;
    for (const candidate of this.candidates.values()) {
      const classification = classifyTopology(candidate, this.rawCache.getSuccess(candidate.deviceIp));
      topology[classification].push(candidate.deviceIp);
    }
    for (const values of Object.values(topology)) values.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const ttl = (ip: string) => { const candidate = this.candidates.get(ip); return candidate ? ttlForFeatherPriority(candidate.priority, this.config) : this.config.warmTtlMs; };
    return this.metrics.report({ config: this.config, queueDepth: this.queueDepth, inFlight: this.inFlight.size, diagnosticsInFlight: this.diagnosticsInFlight.size, raw: this.rawCache.metadataValues(ttl), parsedCount: this.parser.size, topology, fullRefreshProgress: { ...this.fullRefreshProgress } });
  }

  shutdown(): void { this.stopped = true; this.requested.clear(); this.visible.clear(); this.queueDepth = 0; }
  reset(): void { this.rawCache.clear(); this.parser.clear(); this.metrics.reset(); this.inFlight.clear(); this.diagnosticsInFlight.clear(); this.requested.clear(); this.visible.clear(); this.candidates.clear(); this.queueDepth = 0; this.stopped = false; this.fullRefreshProgress = { completed: 0, total: 0 }; }

  private toCandidate(candidate: DiscoveryCandidate): FeatherCandidate {
    const previousRaw = this.rawCache.getMetadata(candidate.deviceIp);
    const previousParsed = this.parser.getPrioritySignals(candidate.deviceIp);
    const requested = this.requested.has(candidate.deviceIp);
    const visible = this.visible.has(candidate.deviceIp);
    const activeIssue = previousParsed?.activeIssue ?? false;
    const priority: FeatherPriorityClass = candidate.excluded
      ? "COLD"
      : classifyFeatherPriority({ requested, visible, activeIssue, stale: previousRaw?.stale, unhealthy: previousRaw ? !previousRaw.success : false, neverSuccessful: !previousRaw?.lastSuccessAt, online: previousParsed?.reachable, stable: Boolean(previousRaw?.lastSuccessAt && !activeIssue) });
    return { ...candidate, priority, topologyClassification: classifyTopology(candidate, previousRaw ? previousRaw.success : null) };
  }

  private refresh(candidate: FeatherCandidate, cycleId: number | null): Promise<FeatherParsedSnapshot | null> {
    const existing = this.inFlight.get(candidate.deviceIp);
    if (existing) { this.metrics.coalescedRequests++; telemetryMetrics.registry.recordEndpointCoalesced("feather-scheduler", candidate.deviceIp); return existing; }
    const promise = (async () => {
      this.metrics.attempted(candidate.priority);
      const acquisitionStarted = performance.now();
      const acquisition = await this.acquire(candidate, this.config.timeoutMs);
      telemetryMetrics.registry.recordCoordinatorPhase("Feather acquisition", { durationMs: performance.now() - acquisitionStarted, failed: !acquisition.report.ok, bytes: (acquisition.report.bytes ?? 0) + (acquisition.mainData.bytes ?? 0), blocking: true });
      const cacheStarted = performance.now();
      const raw = this.rawCache.record(candidate, cycleId, acquisition);
      telemetryMetrics.registry.recordCoordinatorPhase("Feather cache write", { durationMs: performance.now() - cacheStarted, blocking: true });
      this.metrics.completed(candidate.deviceIp, candidate.priority, acquisition.totalLatencyMs, raw.success, raw);
      if (!raw.success && raw.retainedLastKnownGood) telemetryMetrics.registry.recordRetainedLastKnownGood();

      const parseStarted = performance.now();
      const parsedResult = this.parser.parse(raw, candidate);
      if (parsedResult?.reused) this.metrics.parseHits++; else if (parsedResult) { this.metrics.parseMisses++; this.metrics.totalParseDurationMs += parsedResult.snapshot.parseDurationMs; }
      telemetryMetrics.registry.recordCoordinatorPhase("Feather parsing", { durationMs: performance.now() - parseStarted, failed: !parsedResult, blocking: true });
      if (!parsedResult) return null;
      const publicationStarted = performance.now();
      const published = structuredClone(parsedResult.snapshot.normalized);
      registerFeatherParsedEnrichment(published.rawResponse, parsedResult.snapshot.enrichment);
      publishFeatherNormalizedStatus(published);
      telemetryMetrics.registry.recordCoordinatorPhase("Feather merge/publication", { durationMs: performance.now() - publicationStarted, blocking: true });
      return parsedResult.snapshot;
    })().finally(() => this.inFlight.delete(candidate.deviceIp));
    this.inFlight.set(candidate.deviceIp, promise);
    return promise;
  }
}

export const featherScheduler = new FeatherScheduler();
