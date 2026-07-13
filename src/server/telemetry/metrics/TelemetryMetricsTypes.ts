export type TelemetryMetricCategory = "endpoint" | "provider" | "route";

export interface TelemetryTimingValues {
  latestMs: number | null;
  minimumMs: number | null;
  maximumMs: number | null;
  rollingAverageMs: number | null;
  sampleCount: number;
}

export interface TelemetryEndpointMetric extends TelemetryTimingValues {
  latestCycleId: number | null;
  requestsByCycleId: Record<string, number>;
  source: string;
  endpoint: string;
  requestCount: number;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  fallbackCount: number;
  inFlightRequestCount: number;
  maximumConcurrentRequests: number;
  duplicateRequestCount: number;
  coalescedRequestCount: number;
  lastAttemptTimestamp: string | null;
  lastSuccessTimestamp: string | null;
  lastFailureTimestamp: string | null;
  responseBytes: number | null;
  totalResponseBytes: number;
  parseDuration: TelemetryTimingValues;
  normalizationDuration: TelemetryTimingValues;
  cacheWriteDuration: TelemetryTimingValues;
  sourceObservationTimestamp: string | null;
  acquisitionTimestamp: string | null;
  cacheTimestamp: string | null;
  calculatedDataAgeMs: number | null;
  stale: boolean;
  latestLatencyMs: number | null;
  minimumLatencyMs: number | null;
  maximumLatencyMs: number | null;
  rollingAverageLatencyMs: number | null;
}

export interface TelemetryProviderMetric extends TelemetryTimingValues {
  latestCycleId: number | null;
  providerId: string;
  collectionCount: number;
  successCount: number;
  failureCount: number;
  staleCount: number;
  lastCollectionTimestamp: string | null;
  latestCollectionDurationMs: number | null;
}

export interface TelemetryRouteMetric extends TelemetryTimingValues {
  latestCycleId: number | null;
  route: string;
  requestCount: number;
  failureCount: number;
  brokerSelectedCount: number;
  legacyFallbackCount: number;
  cacheOnlyResponseCount: number;
  routeTriggeredNetworkCallCount: number;
  lastRequestTimestamp: string | null;
  latestResponseDurationMs: number | null;
}

export interface TelemetryCoordinatorMetrics extends TelemetryTimingValues {
  cycleCount: number;
  completedCycleCount: number;
  failedCycleCount: number;
  overlapSkipCount: number;
  forcedOverlapCount: number;
  inFlightCycleCount: number;
  maximumConcurrentCycles: number;
  lastCycleStartedAt: string | null;
  lastCycleCompletedAt: string | null;
  latestCycleDurationMs: number | null;
  requestedRefreshCount: number;
  coalescedRefreshCount: number;
  ignoredDuplicateRefreshCount: number;
  queuedRefreshCount: number;
  maximumRefreshQueueDepth: number;
  successfulCoalescingCount: number;
  cycleOverlapAttemptCount: number;
  cycleWaitDuration: TelemetryTimingValues;
}

export interface TelemetryCoordinatorPhaseMetric extends TelemetryTimingValues {
  phase: string;
  count: number;
  failureCount: number;
  retryCount: number;
  totalBytes: number;
  blockingCount: number;
}

export interface TelemetryBrokerMetrics extends TelemetryTimingValues {
  latestCycleId: number | null;
  collectionCount: number;
  failureCount: number;
  inFlightCollectionCount: number;
  maximumConcurrentCollections: number;
  sharedInFlightCollectionReuseCount: number;
  retainedLastKnownGoodUsageCount: number;
  staleDomainRetentionCount: number;
  authoritySelected: Record<string, Record<string, number>>;
  lastCollectionTimestamp: string | null;
  latestCollectionDurationMs: number | null;
}

export interface TelemetryPerformanceReport {
  generatedAt: string;
  processUptimeSeconds: number;
  processUptime: number;
  observationStartedAt: string;
  observationDurationSeconds: number;
  endpoints: TelemetryEndpointMetric[];
  providers: TelemetryProviderMetric[];
  coordinator: TelemetryCoordinatorMetrics;
  coordinatorPhases: TelemetryCoordinatorPhaseMetric[];
  broker: TelemetryBrokerMetrics;
  routes: TelemetryRouteMetric[];
  suspectedDuplicatePolls: TelemetryEndpointMetric[];
  staleSources: TelemetryEndpointMetric[];
  slowestEndpoints: TelemetryEndpointMetric[];
  highestRequestVolume: TelemetryEndpointMetric[];
  recommendations: string[];
}

export interface EndpointCompletion {
  success: boolean;
  timeout?: boolean;
  fallback?: boolean;
  responseBytes?: number | null;
  parseDurationMs?: number | null;
  normalizationDurationMs?: number | null;
  cacheWriteDurationMs?: number | null;
  sourceObservationTimestamp?: string | number | Date | null;
  acquisitionTimestamp?: string | number | Date | null;
  cacheTimestamp?: string | number | Date | null;
  stale?: boolean;
}

export interface RouteCompletion {
  failed?: boolean;
  brokerSelected?: boolean;
  legacyFallback?: boolean;
  cacheOnly?: boolean;
  routeTriggeredNetworkCalls?: number;
  cycleId?: number | null;
}
