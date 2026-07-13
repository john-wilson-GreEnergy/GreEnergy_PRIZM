import { telemetryMetrics } from "../metrics";
import { StringViewerCache, stringViewerIdentityKey } from "./StringViewerCache";
import { StringViewerMetrics } from "./StringViewerMetrics";
import { classifyStringViewerPriority, STRINGVIEWER_PRIORITY_ORDER, ttlForPriority } from "./StringViewerPriority";
import {
  StringViewerCacheEntry,
  StringViewerCandidate,
  StringViewerFetchResult,
  StringViewerIdentity,
  StringViewerPriorityClass,
  StringViewerSchedulerConfig,
  StringViewerSchedulerCycleResult,
} from "./StringViewerTypes";

type Fetcher<T> = (candidate: StringViewerCandidate, baseUrl: string) => Promise<StringViewerFetchResult<T>>;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getStringViewerConfig(env: NodeJS.ProcessEnv = process.env): StringViewerSchedulerConfig {
  return {
    mode: env.PRIZM_STRINGVIEWER_MODE === "scheduled" ? "scheduled" : "legacy",
    maxConcurrency: positiveInteger(env.PRIZM_STRINGVIEWER_MAX_CONCURRENCY, 6),
    batchBudget: positiveInteger(env.PRIZM_STRINGVIEWER_BATCH_BUDGET, 32),
    // Legacy warmup already uses 60 seconds. Scheduled defaults are deliberately
    // conservative and configurable; validation can tune them with live evidence.
    hotTtlMs: positiveInteger(env.PRIZM_STRINGVIEWER_HOT_TTL_MS, 60_000),
    warmTtlMs: positiveInteger(env.PRIZM_STRINGVIEWER_WARM_TTL_MS, 60_000),
    coldTtlMs: positiveInteger(env.PRIZM_STRINGVIEWER_COLD_TTL_MS, 60_000),
    forceFullRefresh: env.PRIZM_STRINGVIEWER_FORCE_FULL_REFRESH === "true",
  };
}

function canonicalIdentity(row: any): StringViewerIdentity | null {
  const arrayIndex = Number(row?.arrayNumber ?? row?.arrayIndex);
  const stringIndex = Number(row?.stringNumber ?? row?.stringIndex);
  if (!Number.isSafeInteger(arrayIndex) || !Number.isSafeInteger(stringIndex) || arrayIndex < 1 || stringIndex < 1) return null;
  return {
    arrayIndex,
    stringIndex,
    stringKey: String(row?.stringKey || row?.canonicalKey || `A${arrayIndex}-S${stringIndex}`),
    controllerIp: row?.controllerIp ?? row?.ipAddress ?? row?.ip ?? null,
  };
}

function sourceObservationAt(value: any): string | null {
  const candidate = value?.stringViewerDataModel?.reportTimestamp ?? value?.stringViewerDataModel?.timestampUtc ?? value?.reportTimestamp ?? value?.timestampUtc ?? null;
  if (candidate == null) return null;
  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function defaultFetcher(candidate: StringViewerCandidate, baseUrl: string): Promise<StringViewerFetchResult<unknown>> {
  const endpoint = `/tools/monitor/ems/stringviewer/array/${candidate.arrayIndex}/${candidate.stringIndex}/data`;
  const sourceUrl = `${baseUrl}${endpoint}`;
  const startedAt = performance.now();
  const metric = telemetryMetrics.registry.beginEndpoint("ems-turtle", endpoint);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(sourceUrl, { signal: controller.signal });
    if (!response.ok) {
      metric.finish({ success: false, acquisitionTimestamp: new Date(), stale: true });
      return { success: false, sourceUrl, latencyMs: performance.now() - startedAt, error: `HTTP ${response.status}` };
    }
    const parseStartedAt = performance.now();
    const text = await response.text();
    const value = JSON.parse(text);
    const parseDurationMs = performance.now() - parseStartedAt;
    const observedAt = sourceObservationAt(value);
    metric.finish({ success: true, responseBytes: Buffer.byteLength(text), parseDurationMs, sourceObservationTimestamp: observedAt, acquisitionTimestamp: new Date(), cacheTimestamp: new Date(), stale: false });
    return { success: true, value, sourceUrl, latencyMs: performance.now() - startedAt, sourceObservationAt: observedAt };
  } catch (error: any) {
    const timeout = error?.name === "AbortError";
    metric.finish({ success: false, timeout, acquisitionTimestamp: new Date(), stale: true });
    return { success: false, sourceUrl, latencyMs: performance.now() - startedAt, timeout, error: error?.message || String(error) };
  } finally {
    clearTimeout(timeoutId);
  }
}

export class StringViewerScheduler<T = unknown> {
  readonly cache: StringViewerCache<T>;
  readonly metrics: StringViewerMetrics;
  private readonly inFlight = new Map<string, Promise<StringViewerCacheEntry<T>>>();
  private readonly visible = new Set<string>();
  private readonly requested = new Map<string, string>();
  private readonly knownCandidates = new Map<string, StringViewerCandidate>();
  private readonly previousBaseline = new Map<string, string>();
  private queueDepth = 0;
  private stopped = false;
  private fullRefreshProgress = { completed: 0, total: 0 };

  constructor(
    readonly config: StringViewerSchedulerConfig = getStringViewerConfig(),
    private readonly fetcher: Fetcher<T> = defaultFetcher as Fetcher<T>,
    cache?: StringViewerCache<T>,
    metrics?: StringViewerMetrics,
    private readonly monotonicNow: () => number = () => performance.now(),
  ) {
    this.cache = cache ?? new StringViewerCache<T>();
    this.metrics = metrics ?? new StringViewerMetrics();
  }

  markStringVisible(stringKey: string): void { this.visible.add(stringKey); }
  markStringHidden(stringKey: string): void { this.visible.delete(stringKey); }
  requestRefresh(stringKey: string, reason = "operator-requested"): void { this.requested.set(stringKey, reason); }
  requestRefreshMany(keys: Iterable<string>, reason = "operator-requested"): void { for (const key of keys) this.requestRefresh(key, reason); }
  requestArrayRefresh(arrayIndex: number, reason = "operator-requested-array"): number {
    const keys = [...this.knownCandidates.values()].filter((candidate) => candidate.arrayIndex === arrayIndex).map((candidate) => candidate.stringKey);
    this.requestRefreshMany(keys, reason);
    return keys.length;
  }
  requestFullSweep(reason = "operator-requested-full-sweep"): number {
    const keys = [...this.knownCandidates.keys()];
    this.requestRefreshMany(keys, reason);
    return keys.length;
  }

  async runCycle(rows: readonly any[], cycleId: number | null, baseUrl: string): Promise<StringViewerSchedulerCycleResult<T>> {
    if (this.stopped) return { cycleId, requested: 0, refreshed: 0, entries: new Map() };
    this.metrics.startCycle(cycleId);
    const candidates = rows.map((row) => this.candidate(row)).filter((value): value is StringViewerCandidate => value != null);
    for (const candidate of candidates) this.knownCandidates.set(candidate.stringKey, candidate);

    const due: Array<{ candidate: StringViewerCandidate; queuedAt: number; age: number }> = [];
    for (const candidate of candidates) {
      const ttlMs = ttlForPriority(candidate.priority, this.config);
      const entry = this.cache.get(candidate, ttlMs);
      if (entry?.value != null && !entry.stale && !this.config.forceFullRefresh && !this.requested.has(candidate.stringKey)) {
        this.metrics.cacheHits += 1;
        this.metrics.skippedFresh += 1;
        continue;
      }
      if (entry?.value != null) {
        this.metrics.staleHits += 1;
        this.metrics.retainedLastKnownGood += 1;
      } else this.metrics.cacheMisses += 1;
      due.push({ candidate, queuedAt: this.monotonicNow(), age: entry?.ageMs ?? Number.POSITIVE_INFINITY });
    }

    due.sort((left, right) => {
      const priority = STRINGVIEWER_PRIORITY_ORDER[left.candidate.priority] - STRINGVIEWER_PRIORITY_ORDER[right.candidate.priority];
      if (priority !== 0) return priority;
      if (left.age !== right.age) return right.age - left.age;
      return left.candidate.arrayIndex - right.candidate.arrayIndex || left.candidate.stringIndex - right.candidate.stringIndex || left.candidate.stringKey.localeCompare(right.candidate.stringKey);
    });
    const budget = this.config.forceFullRefresh ? due.length : Math.min(this.config.batchBudget, due.length);
    const selected = due.slice(0, budget);
    // Reserve one slot for the oldest due cold entry so continuous hot activity
    // cannot starve the cold population indefinitely.
    if (!this.config.forceFullRefresh && selected.length > 0 && !selected.some((item) => item.candidate.priority === "COLD")) {
      const cold = due.find((item) => item.candidate.priority === "COLD");
      if (cold) selected[selected.length - 1] = cold;
    }
    this.queueDepth = selected.length;
    if (this.config.forceFullRefresh) this.fullRefreshProgress = { completed: 0, total: selected.length };
    let cursor = 0;
    let refreshed = 0;
    const worker = async () => {
      while (cursor < selected.length && !this.stopped) {
        const item = selected[cursor++];
        this.queueDepth = Math.max(0, this.queueDepth - 1);
        await this.refresh(item.candidate, cycleId, baseUrl, item.queuedAt);
        refreshed += 1;
        if (this.config.forceFullRefresh) this.fullRefreshProgress.completed += 1;
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.config.maxConcurrency, selected.length) }, () => worker()));
    for (const item of selected) this.requested.delete(item.candidate.stringKey);

    const entries = new Map<string, StringViewerCacheEntry<T>>();
    for (const candidate of candidates) {
      const entry = this.cache.get(candidate, ttlForPriority(candidate.priority, this.config));
      if (entry) entries.set(candidate.stringKey, entry);
    }
    return { cycleId, requested: selected.length, refreshed, entries };
  }

  getEntry(stringKey: string): StringViewerCacheEntry<T> | null {
    const candidate = this.knownCandidates.get(stringKey);
    return candidate ? this.cache.get(candidate, ttlForPriority(candidate.priority, this.config)) : this.cache.get(stringKey);
  }

  getDebugState() {
    const candidates = [...this.knownCandidates.values()];
    const entries = candidates.map((candidate) => this.cache.get(candidate, ttlForPriority(candidate.priority, this.config))).filter((entry): entry is StringViewerCacheEntry<T> => entry != null);
    return this.metrics.report({ config: this.config, queueDepth: this.queueDepth, inFlight: this.inFlight.size, entries, candidates, fullRefreshProgress: { ...this.fullRefreshProgress } });
  }

  shutdown(): void { this.stopped = true; this.requested.clear(); this.visible.clear(); this.queueDepth = 0; }
  reset(): void { this.cache.clear(); this.metrics.reset(); this.requested.clear(); this.visible.clear(); this.knownCandidates.clear(); this.previousBaseline.clear(); this.queueDepth = 0; this.fullRefreshProgress = { completed: 0, total: 0 }; this.stopped = false; }

  private candidate(row: any): StringViewerCandidate | null {
    const identity = canonicalIdentity(row);
    if (!identity) return null;
    const key = stringViewerIdentityKey(identity);
    const baseline = JSON.stringify([row?.communicating, row?.operationalState, row?.warningCount, row?.alarmCount, row?.outRotation]);
    const previous = this.previousBaseline.get(key);
    this.previousBaseline.set(key, baseline);
    const signals = {
      visible: this.visible.has(key),
      operatorRequested: this.requested.has(key),
      activeAlarm: Number(row?.alarmCount ?? row?.alarms?.length ?? 0) > 0,
      activeWarning: Number(row?.warningCount ?? row?.warnings?.length ?? 0) > 0,
      communicating: typeof row?.communicating === "boolean" ? row.communicating : null,
      recentlyChanged: previous != null && previous !== baseline,
      recentlyFaulted: Boolean(row?.recentlyFaulted),
    };
    return { ...identity, signals, priority: classifyStringViewerPriority(signals) };
  }

  private refresh(candidate: StringViewerCandidate, cycleId: number | null, baseUrl: string, queuedAt: number): Promise<StringViewerCacheEntry<T>> {
    const key = stringViewerIdentityKey(candidate);
    const existing = this.inFlight.get(key);
    if (existing) {
      this.metrics.coalescedRequests += 1;
      telemetryMetrics.registry.recordEndpointCoalesced("ems-turtle", `/tools/monitor/ems/stringviewer/array/${candidate.arrayIndex}/${candidate.stringIndex}/data`);
      return existing;
    }
    const promise = (async () => {
      this.metrics.attempted(candidate.priority, this.monotonicNow() - queuedAt);
      const result = await this.fetcher(candidate, baseUrl);
      this.metrics.completed(candidate.stringKey, candidate.priority, result.latencyMs, result.success, Boolean(result.timeout));
      return this.cache.record(candidate, cycleId, result);
    })().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }
}

export const stringViewerScheduler = new StringViewerScheduler();
