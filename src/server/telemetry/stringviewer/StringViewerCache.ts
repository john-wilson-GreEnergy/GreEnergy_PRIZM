import { StringViewerCacheEntry, StringViewerFetchResult, StringViewerIdentity } from "./StringViewerTypes";

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value && typeof value === "object") {
    const object = value as object;
    if (seen.has(object)) return value;
    seen.add(object);
    for (const child of Object.values(object)) deepFreeze(child, seen);
    Object.freeze(object);
  }
  return value;
}

function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}:${(hash >>> 0).toString(16)}`;
}

export function stringViewerIdentityKey(identity: Pick<StringViewerIdentity, "stringKey" | "arrayIndex" | "stringIndex">): string {
  return identity.stringKey || `A${identity.arrayIndex}-S${identity.stringIndex}`;
}

export class StringViewerCache<T = unknown> {
  private readonly entries = new Map<string, StringViewerCacheEntry<T>>();

  constructor(private readonly now: () => number = Date.now) {}

  get(identityOrKey: StringViewerIdentity | string, ttlMs = Number.POSITIVE_INFINITY): StringViewerCacheEntry<T> | null {
    const key = typeof identityOrKey === "string" ? identityOrKey : stringViewerIdentityKey(identityOrKey);
    const entry = this.entries.get(key);
    if (!entry) return null;
    const ageAnchor = entry.sourceObservationAt ?? entry.lastSuccessAt;
    const ageMs = ageAnchor == null ? null : Math.max(0, this.now() - new Date(ageAnchor).getTime());
    return deepFreeze({ ...entry, ageMs, stale: entry.stale || ageMs == null || ageMs >= ttlMs });
  }

  record(identity: StringViewerIdentity, cycleId: number | null, result: StringViewerFetchResult<T>): StringViewerCacheEntry<T> {
    const key = stringViewerIdentityKey(identity);
    const canonicalIdentity: StringViewerIdentity = {
      arrayIndex: identity.arrayIndex,
      stringIndex: identity.stringIndex,
      stringKey: identity.stringKey,
      controllerIp: identity.controllerIp,
    };
    const previous = this.entries.get(key);
    const attemptedAt = new Date(this.now()).toISOString();
    if (result.success && result.value !== undefined) {
      const value = deepFreeze(structuredClone(result.value));
      const nextFingerprint = fingerprint(value);
      const entry = deepFreeze<StringViewerCacheEntry<T>>({
        ...canonicalIdentity,
        lastAttemptAt: attemptedAt,
        lastSuccessAt: attemptedAt,
        sourceObservationAt: result.sourceObservationAt ?? null,
        cacheUpdatedAt: attemptedAt,
        ageMs: 0,
        stale: false,
        success: true,
        failureCount: previous?.failureCount ?? 0,
        consecutiveFailureCount: 0,
        latencyMs: result.latencyMs,
        sourceUrl: result.sourceUrl,
        cycleId,
        payloadFingerprint: nextFingerprint,
        payloadVersion: previous?.payloadFingerprint === nextFingerprint ? previous.payloadVersion : (previous?.payloadVersion ?? 0) + 1,
        lastError: null,
        value,
      });
      this.entries.set(key, entry);
      return entry;
    }

    const entry = deepFreeze<StringViewerCacheEntry<T>>({
      ...canonicalIdentity,
      lastAttemptAt: attemptedAt,
      lastSuccessAt: previous?.lastSuccessAt ?? null,
      sourceObservationAt: previous?.sourceObservationAt ?? null,
      cacheUpdatedAt: previous?.cacheUpdatedAt ?? null,
      ageMs: (previous?.sourceObservationAt ?? previous?.lastSuccessAt) == null ? null : Math.max(0, this.now() - new Date((previous?.sourceObservationAt ?? previous?.lastSuccessAt)!).getTime()),
      stale: true,
      success: false,
      failureCount: (previous?.failureCount ?? 0) + 1,
      consecutiveFailureCount: (previous?.consecutiveFailureCount ?? 0) + 1,
      latencyMs: result.latencyMs,
      sourceUrl: previous?.value != null ? previous.sourceUrl : result.sourceUrl,
      cycleId: previous?.cycleId ?? cycleId,
      payloadFingerprint: previous?.payloadFingerprint ?? null,
      payloadVersion: previous?.payloadVersion ?? 0,
      lastError: result.error ?? "StringViewer refresh failed",
      value: previous?.value ?? null,
    });
    this.entries.set(key, entry);
    return entry;
  }

  values(): StringViewerCacheEntry<T>[] { return [...this.entries.keys()].map((key) => this.get(key)!).filter(Boolean); }
  get size(): number { return this.entries.size; }
  clear(): void { this.entries.clear(); }
}
