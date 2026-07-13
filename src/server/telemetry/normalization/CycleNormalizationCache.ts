import { getTelemetryCycleId } from "../TelemetryCycleContext";
import { NormalizationDomain, normalizationMetrics } from "./NormalizationMetrics";

interface CacheEntry<T> {
  promise: Promise<T>;
  value: T | undefined;
  settled: boolean;
}

export interface CycleNormalizationRequest<T> {
  domain: NormalizationDomain;
  operation: () => Promise<T>;
  cycleId?: number | null;
  fingerprint?: string;
  variant?: string;
  freeze?: (value: T) => T;
}

export class CycleNormalizationCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  async getOrCompute<T>(request: CycleNormalizationRequest<T>): Promise<T> {
    const cycleId = request.cycleId ?? getTelemetryCycleId();
    if (cycleId == null) return request.operation();
    normalizationMetrics.recordInvocation(cycleId, request.domain);
    const key = this.key(cycleId, request.domain, request.variant, request.fingerprint);
    const existing = this.entries.get(key) as CacheEntry<T> | undefined;
    if (existing) {
      if (existing.settled) normalizationMetrics.recordHit(cycleId, request.domain);
      else normalizationMetrics.recordInFlightReuse(cycleId, request.domain);
      return existing.promise;
    }
    normalizationMetrics.recordMiss(cycleId, request.domain);
    normalizationMetrics.recordExecution(cycleId, request.domain);
    const entry: CacheEntry<T> = { promise: Promise.resolve(undefined as T), value: undefined, settled: false };
    entry.promise = request.operation().then((value) => {
      const immutable = request.freeze ? request.freeze(value) : value;
      entry.value = immutable;
      entry.settled = true;
      return immutable;
    }).catch((error) => {
      normalizationMetrics.recordFailure(cycleId, request.domain);
      this.entries.delete(key);
      throw error;
    });
    this.entries.set(key, entry as CacheEntry<unknown>);
    return entry.promise;
  }

  clearCycle(cycleId: number): void {
    const prefix = `${cycleId}\u0000`;
    for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.entries.delete(key);
  }

  sizeForCycle(cycleId: number): number {
    const prefix = `${cycleId}\u0000`;
    return [...this.entries.keys()].filter((key) => key.startsWith(prefix)).length;
  }

  reset(): void { this.entries.clear(); }

  private key(cycleId: number, domain: NormalizationDomain, variant = "default", fingerprint = "none"): string {
    return `${cycleId}\u0000${domain}\u0000${variant}\u0000${fingerprint}`;
  }
}

export const cycleNormalizationCache = new CycleNormalizationCache();
