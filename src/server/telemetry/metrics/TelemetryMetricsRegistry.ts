import {
  EndpointCompletion,
  RouteCompletion,
  TelemetryBrokerMetrics,
  TelemetryCoordinatorMetrics,
  TelemetryCoordinatorPhaseMetric,
  TelemetryEndpointMetric,
  TelemetryProviderMetric,
  TelemetryRouteMetric,
  TelemetryTimingValues,
} from "./TelemetryMetricsTypes";
import { getTelemetryCycleId } from "../TelemetryCycleContext";

const ROLLING_SAMPLE_LIMIT = 100;

type TimingState = TelemetryTimingValues & { samples: number[] };

function timingState(): TimingState {
  return { latestMs: null, minimumMs: null, maximumMs: null, rollingAverageMs: null, sampleCount: 0, samples: [] };
}

function addTiming(target: TimingState, value: number | null | undefined): void {
  if (value == null || !Number.isFinite(value) || value < 0) return;
  target.latestMs = value;
  target.minimumMs = target.minimumMs == null ? value : Math.min(target.minimumMs, value);
  target.maximumMs = target.maximumMs == null ? value : Math.max(target.maximumMs, value);
  target.sampleCount += 1;
  target.samples.push(value);
  if (target.samples.length > ROLLING_SAMPLE_LIMIT) target.samples.shift();
  target.rollingAverageMs = target.samples.reduce((sum, sample) => sum + sample, 0) / target.samples.length;
}

function publicTiming(target: TimingState): TelemetryTimingValues {
  const { samples: _samples, ...timing } = target;
  return { ...timing };
}

function timestamp(value: string | number | Date | null | undefined): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dataAgeMs(sourceObservationTimestamp: string | null, acquisitionTimestamp: string | null): number | null {
  if (!sourceObservationTimestamp || !acquisitionTimestamp) return null;
  return Math.max(0, new Date(acquisitionTimestamp).getTime() - new Date(sourceObservationTimestamp).getTime());
}

type EndpointState = Omit<TelemetryEndpointMetric, keyof TelemetryTimingValues | "parseDuration" | "normalizationDuration" | "cacheWriteDuration" | "latestLatencyMs" | "minimumLatencyMs" | "maximumLatencyMs" | "rollingAverageLatencyMs"> & {
  timing: TimingState;
  parseTiming: TimingState;
  normalizationTiming: TimingState;
  cacheWriteTiming: TimingState;
};

type ProviderState = Omit<TelemetryProviderMetric, keyof TelemetryTimingValues | "latestCollectionDurationMs"> & { timing: TimingState };
type RouteState = Omit<TelemetryRouteMetric, keyof TelemetryTimingValues | "latestResponseDurationMs"> & { timing: TimingState };
type CoordinatorPhaseState = Omit<TelemetryCoordinatorPhaseMetric, keyof TelemetryTimingValues> & { timing: TimingState };

export class TelemetryMetricsRegistry {
  private endpoints = new Map<string, EndpointState>();
  private providers = new Map<string, ProviderState>();
  private routes = new Map<string, RouteState>();
  private coordinatorPhases = new Map<string, CoordinatorPhaseState>();
  private coordinator = this.newCoordinator();
  private broker = this.newBroker();
  private observationStartedAt = new Date().toISOString();

  constructor(private readonly monotonicNow: () => number = () => performance.now()) {}

  registerEndpoint(source: string, endpoint: string): void {
    this.endpointState(source, endpoint);
  }

  beginEndpoint(source: string, endpoint: string): { finish: (result: EndpointCompletion) => void } {
    const metric = this.endpointState(source, endpoint);
    const cycleId = getTelemetryCycleId();
    metric.latestCycleId = cycleId;
    const cycleKey = cycleId == null ? "none" : String(cycleId);
    metric.requestsByCycleId[cycleKey] = (metric.requestsByCycleId[cycleKey] || 0) + 1;
    const startedAt = this.monotonicNow();
    const attemptAt = new Date().toISOString();
    metric.requestCount += 1;
    metric.lastAttemptTimestamp = attemptAt;
    if (metric.inFlightRequestCount > 0) metric.duplicateRequestCount += 1;
    metric.inFlightRequestCount += 1;
    metric.maximumConcurrentRequests = Math.max(metric.maximumConcurrentRequests, metric.inFlightRequestCount);
    let finished = false;

    return {
      finish: (result) => {
        if (finished) return;
        finished = true;
        const completedAt = new Date().toISOString();
        metric.inFlightRequestCount = Math.max(0, metric.inFlightRequestCount - 1);
        addTiming(metric.timing, this.monotonicNow() - startedAt);
        addTiming(metric.parseTiming, result.parseDurationMs);
        addTiming(metric.normalizationTiming, result.normalizationDurationMs);
        addTiming(metric.cacheWriteTiming, result.cacheWriteDurationMs);
        metric.responseBytes = result.responseBytes ?? null;
        if (result.responseBytes != null && Number.isFinite(result.responseBytes)) metric.totalResponseBytes += result.responseBytes;
        metric.sourceObservationTimestamp = timestamp(result.sourceObservationTimestamp) ?? metric.sourceObservationTimestamp;
        metric.acquisitionTimestamp = timestamp(result.acquisitionTimestamp) ?? completedAt;
        metric.cacheTimestamp = timestamp(result.cacheTimestamp) ?? metric.cacheTimestamp;
        metric.calculatedDataAgeMs = dataAgeMs(metric.sourceObservationTimestamp, metric.acquisitionTimestamp);
        metric.stale = result.stale ?? metric.stale;
        if (result.fallback) metric.fallbackCount += 1;
        if (result.timeout) metric.timeoutCount += 1;
        if (result.success) {
          metric.successCount += 1;
          metric.lastSuccessTimestamp = completedAt;
        } else {
          metric.failureCount += 1;
          metric.lastFailureTimestamp = completedAt;
        }
      },
    };
  }

  recordEndpointProcessing(source: string, endpoint: string, values: Pick<EndpointCompletion, "parseDurationMs" | "normalizationDurationMs" | "cacheWriteDurationMs">): void {
    const metric = this.endpointState(source, endpoint);
    addTiming(metric.parseTiming, values.parseDurationMs);
    addTiming(metric.normalizationTiming, values.normalizationDurationMs);
    addTiming(metric.cacheWriteTiming, values.cacheWriteDurationMs);
  }

  recordEndpointCoalesced(source: string, endpoint: string): void {
    this.endpointState(source, endpoint).coalescedRequestCount += 1;
  }

  beginProvider(providerId: string): { finish: (success: boolean, stale?: boolean) => void } {
    const metric = this.providerState(providerId);
    metric.latestCycleId = getTelemetryCycleId();
    const startedAt = this.monotonicNow();
    metric.collectionCount += 1;
    metric.lastCollectionTimestamp = new Date().toISOString();
    let finished = false;
    return { finish: (success, stale = false) => {
      if (finished) return;
      finished = true;
      addTiming(metric.timing, this.monotonicNow() - startedAt);
      if (success) metric.successCount += 1;
      else metric.failureCount += 1;
      if (stale) metric.staleCount += 1;
    } };
  }

  beginRoute(route: string): { finish: (result?: RouteCompletion) => void } {
    const metric = this.routeState(route);
    const startedAt = this.monotonicNow();
    metric.requestCount += 1;
    metric.lastRequestTimestamp = new Date().toISOString();
    let finished = false;
    return { finish: (result = {}) => {
      if (finished) return;
      finished = true;
      metric.latestCycleId = result.cycleId ?? metric.latestCycleId;
      addTiming(metric.timing, this.monotonicNow() - startedAt);
      if (result.failed) metric.failureCount += 1;
      if (result.brokerSelected) metric.brokerSelectedCount += 1;
      if (result.legacyFallback) metric.legacyFallbackCount += 1;
      if (result.cacheOnly) metric.cacheOnlyResponseCount += 1;
      metric.routeTriggeredNetworkCallCount += Math.max(0, result.routeTriggeredNetworkCalls ?? 0);
    } };
  }

  coordinatorCycleSkipped(): void { this.coordinator.overlapSkipCount += 1; }
  coordinatorForcedOverlap(): void { this.coordinator.forcedOverlapCount += 1; }
  recordCoordinatorRefresh(args: { coalesced: boolean; duplicate: boolean; queued: boolean; queueDepth: number }): void {
    this.coordinator.requestedRefreshCount += 1;
    if (args.coalesced) this.coordinator.coalescedRefreshCount += 1;
    if (args.duplicate) this.coordinator.ignoredDuplicateRefreshCount += 1;
    if (args.queued) this.coordinator.queuedRefreshCount += 1;
    this.coordinator.maximumRefreshQueueDepth = Math.max(this.coordinator.maximumRefreshQueueDepth, args.queueDepth);
  }
  recordSuccessfulCoalescing(): void { this.coordinator.successfulCoalescingCount += 1; }
  recordCoordinatorCycleWait(waitTimeMs: number): void { addTiming(this.coordinator.waitTiming, waitTimeMs); }
  recordCoordinatorPhase(phase: string, result: { durationMs: number; failed?: boolean; retries?: number; bytes?: number | null; blocking?: boolean }): void {
    let metric = this.coordinatorPhases.get(phase);
    if (!metric) {
      metric = { phase, count: 0, failureCount: 0, retryCount: 0, totalBytes: 0, blockingCount: 0, timing: timingState() };
      this.coordinatorPhases.set(phase, metric);
    }
    metric.count += 1;
    if (result.failed) metric.failureCount += 1;
    metric.retryCount += Math.max(0, result.retries ?? 0);
    metric.totalBytes += Math.max(0, result.bytes ?? 0);
    if (result.blocking) metric.blockingCount += 1;
    addTiming(metric.timing, result.durationMs);
  }

  beginCoordinatorCycle(): { finish: (success?: boolean) => void } {
    const coordinator = this.coordinator;
    const startedAt = this.monotonicNow();
    coordinator.cycleCount += 1;
    coordinator.inFlightCycleCount += 1;
    coordinator.maximumConcurrentCycles = Math.max(coordinator.maximumConcurrentCycles, coordinator.inFlightCycleCount);
    coordinator.lastCycleStartedAt = new Date().toISOString();
    let finished = false;
    return { finish: (success = true) => {
      if (finished) return;
      finished = true;
      coordinator.inFlightCycleCount = Math.max(0, coordinator.inFlightCycleCount - 1);
      coordinator.completedCycleCount += 1;
      if (!success) coordinator.failedCycleCount += 1;
      coordinator.lastCycleCompletedAt = new Date().toISOString();
      addTiming(coordinator.timing, this.monotonicNow() - startedAt);
    } };
  }

  brokerCollectionReused(): void { this.broker.sharedInFlightCollectionReuseCount += 1; }
  recordRetainedLastKnownGood(count = 1): void { this.broker.retainedLastKnownGoodUsageCount += count; }
  recordStaleDomainRetention(count = 1): void { this.broker.staleDomainRetentionCount += count; }
  recordAuthority(domain: string, providerId: string | null | undefined): void {
    const selected = providerId || "none";
    this.broker.authoritySelected[domain] ||= {};
    this.broker.authoritySelected[domain][selected] = (this.broker.authoritySelected[domain][selected] || 0) + 1;
  }

  beginBrokerCollection(): { finish: (success?: boolean) => void } {
    const broker = this.broker;
    broker.latestCycleId = getTelemetryCycleId();
    const startedAt = this.monotonicNow();
    broker.collectionCount += 1;
    broker.inFlightCollectionCount += 1;
    broker.maximumConcurrentCollections = Math.max(broker.maximumConcurrentCollections, broker.inFlightCollectionCount);
    broker.lastCollectionTimestamp = new Date().toISOString();
    let finished = false;
    return { finish: (success = true) => {
      if (finished) return;
      finished = true;
      broker.inFlightCollectionCount = Math.max(0, broker.inFlightCollectionCount - 1);
      if (!success) broker.failureCount += 1;
      addTiming(broker.timing, this.monotonicNow() - startedAt);
    } };
  }

  getObservationStartedAt(): string { return this.observationStartedAt; }
  getEndpoints(): TelemetryEndpointMetric[] { return [...this.endpoints.values()].map((m) => { const timing = publicTiming(m.timing); const { timing: _timing, parseTiming, normalizationTiming, cacheWriteTiming, ...base } = m; return { ...base, ...timing, latestLatencyMs: timing.latestMs, minimumLatencyMs: timing.minimumMs, maximumLatencyMs: timing.maximumMs, rollingAverageLatencyMs: timing.rollingAverageMs, parseDuration: publicTiming(parseTiming), normalizationDuration: publicTiming(normalizationTiming), cacheWriteDuration: publicTiming(cacheWriteTiming) }; }); }
  getProviders(): TelemetryProviderMetric[] { return [...this.providers.values()].map((m) => { const timing = publicTiming(m.timing); const { timing: _timing, ...base } = m; return { ...base, ...timing, latestCollectionDurationMs: timing.latestMs }; }); }
  getRoutes(): TelemetryRouteMetric[] { return [...this.routes.values()].map((m) => { const timing = publicTiming(m.timing); const { timing: _timing, ...base } = m; return { ...base, ...timing, latestResponseDurationMs: timing.latestMs }; }); }
  getCoordinator(): TelemetryCoordinatorMetrics { const timing = publicTiming(this.coordinator.timing); const { timing: _timing, waitTiming, ...base } = this.coordinator; return { ...base, ...timing, latestCycleDurationMs: timing.latestMs, cycleWaitDuration: publicTiming(waitTiming) }; }
  getCoordinatorPhases(): TelemetryCoordinatorPhaseMetric[] { return [...this.coordinatorPhases.values()].map((metric) => { const { timing, ...base } = metric; return { ...base, ...publicTiming(timing) }; }); }
  getBroker(): TelemetryBrokerMetrics { const timing = publicTiming(this.broker.timing); const { timing: _timing, ...base } = this.broker; return { ...base, authoritySelected: structuredClone(base.authoritySelected), ...timing, latestCollectionDurationMs: timing.latestMs }; }

  reset(): void {
    this.endpoints.clear(); this.providers.clear(); this.routes.clear(); this.coordinatorPhases.clear();
    this.coordinator = this.newCoordinator(); this.broker = this.newBroker();
    this.observationStartedAt = new Date().toISOString();
  }

  private endpointState(source: string, endpoint: string): EndpointState {
    const key = `${source}\u0000${endpoint}`;
    let metric = this.endpoints.get(key);
    if (!metric) {
      metric = { source, endpoint, latestCycleId: null, requestsByCycleId: {}, requestCount: 0, successCount: 0, failureCount: 0, timeoutCount: 0, fallbackCount: 0, inFlightRequestCount: 0, maximumConcurrentRequests: 0, duplicateRequestCount: 0, coalescedRequestCount: 0, lastAttemptTimestamp: null, lastSuccessTimestamp: null, lastFailureTimestamp: null, responseBytes: null, totalResponseBytes: 0, sourceObservationTimestamp: null, acquisitionTimestamp: null, cacheTimestamp: null, calculatedDataAgeMs: null, stale: false, timing: timingState(), parseTiming: timingState(), normalizationTiming: timingState(), cacheWriteTiming: timingState() };
      this.endpoints.set(key, metric);
    }
    return metric;
  }

  private providerState(providerId: string): ProviderState {
    let metric = this.providers.get(providerId);
    if (!metric) { metric = { providerId, latestCycleId: null, collectionCount: 0, successCount: 0, failureCount: 0, staleCount: 0, lastCollectionTimestamp: null, timing: timingState() }; this.providers.set(providerId, metric); }
    return metric;
  }

  private routeState(route: string): RouteState {
    let metric = this.routes.get(route);
    if (!metric) { metric = { route, latestCycleId: null, requestCount: 0, failureCount: 0, brokerSelectedCount: 0, legacyFallbackCount: 0, cacheOnlyResponseCount: 0, routeTriggeredNetworkCallCount: 0, lastRequestTimestamp: null, timing: timingState() }; this.routes.set(route, metric); }
    return metric;
  }

  private newCoordinator() { return { cycleCount: 0, completedCycleCount: 0, failedCycleCount: 0, overlapSkipCount: 0, forcedOverlapCount: 0, inFlightCycleCount: 0, maximumConcurrentCycles: 0, lastCycleStartedAt: null as string | null, lastCycleCompletedAt: null as string | null, requestedRefreshCount: 0, coalescedRefreshCount: 0, ignoredDuplicateRefreshCount: 0, queuedRefreshCount: 0, maximumRefreshQueueDepth: 0, successfulCoalescingCount: 0, cycleOverlapAttemptCount: 0, timing: timingState(), waitTiming: timingState() }; }
  private newBroker() { return { latestCycleId: null as number | null, collectionCount: 0, failureCount: 0, inFlightCollectionCount: 0, maximumConcurrentCollections: 0, sharedInFlightCollectionReuseCount: 0, retainedLastKnownGoodUsageCount: 0, staleDomainRetentionCount: 0, authoritySelected: {} as Record<string, Record<string, number>>, lastCollectionTimestamp: null as string | null, timing: timingState() }; }
}
