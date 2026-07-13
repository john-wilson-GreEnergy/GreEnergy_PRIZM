export type StringViewerMode = "legacy" | "scheduled";
export type StringViewerPriorityClass = "ON_DEMAND" | "HOT" | "WARM" | "COLD";

export interface StringViewerIdentity {
  arrayIndex: number;
  stringIndex: number;
  stringKey: string;
  controllerIp: string | null;
}

export interface StringViewerPrioritySignals {
  visible?: boolean;
  operatorRequested?: boolean;
  activeAlarm?: boolean;
  activeWarning?: boolean;
  communicating?: boolean | null;
  recentlyChanged?: boolean;
  recentlyFaulted?: boolean;
}

export interface StringViewerCacheEntry<T = unknown> extends StringViewerIdentity {
  lastAttemptAt: string;
  lastSuccessAt: string | null;
  sourceObservationAt: string | null;
  cacheUpdatedAt: string | null;
  ageMs: number | null;
  stale: boolean;
  success: boolean;
  failureCount: number;
  consecutiveFailureCount: number;
  latencyMs: number | null;
  sourceUrl: string;
  cycleId: number | null;
  payloadFingerprint: string | null;
  payloadVersion: number;
  lastError: string | null;
  value: T | null;
}

export interface StringViewerFetchResult<T = unknown> {
  success: boolean;
  value?: T;
  sourceUrl: string;
  latencyMs: number;
  sourceObservationAt?: string | null;
  timeout?: boolean;
  error?: string | null;
}

export interface StringViewerSchedulerConfig {
  mode: StringViewerMode;
  maxConcurrency: number;
  batchBudget: number;
  hotTtlMs: number;
  warmTtlMs: number;
  coldTtlMs: number;
  forceFullRefresh: boolean;
}

export interface StringViewerCandidate extends StringViewerIdentity {
  priority: StringViewerPriorityClass;
  signals: StringViewerPrioritySignals;
}

export interface StringViewerSchedulerCycleResult<T = unknown> {
  cycleId: number | null;
  requested: number;
  refreshed: number;
  entries: ReadonlyMap<string, StringViewerCacheEntry<T>>;
}
