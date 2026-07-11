export interface ProviderHealthReport {
  providerId: string;
  healthy: boolean;
  stale: boolean;
  latencyMs: number;
  lastSuccessAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  details?: any;
}

export function computeStale(lastUpdatedAt: string | null, freshnessTargetMs: number): boolean {
  if (!lastUpdatedAt) return true;
  const ts = Date.parse(lastUpdatedAt);
  if (!Number.isFinite(ts)) return true;
  return Date.now() - ts > freshnessTargetMs;
}

export function cloneValue<T>(value: T): T {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}
