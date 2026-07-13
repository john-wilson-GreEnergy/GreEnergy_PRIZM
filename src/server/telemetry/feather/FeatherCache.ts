import type { FeatherAcquisitionResult, FeatherCandidate, FeatherRawSnapshot } from "./FeatherTypes";

export function immutableClone<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (item: any, seen = new WeakSet<object>()): any => {
    if (!item || typeof item !== "object" || seen.has(item)) return item;
    seen.add(item);
    for (const child of Object.values(item)) freeze(child, seen);
    return Object.freeze(item);
  };
  return freeze(clone);
}

export function fingerprintPayload(value: unknown): string | null {
  if (value == null) return null;
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return `${text.length}:${(hash >>> 0).toString(16)}`;
}

function sourceTimestamp(report: any, main: any): string | null {
  const raw = main?.timestamp ?? main?.timeStamp ?? main?.capturedAt ?? report?.timestamp ?? report?.timeStamp ?? report?.capturedAt ?? report?.thermalData?.timestamp ?? null;
  if (raw == null) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export class FeatherRawCache {
  private readonly entries = new Map<string, FeatherRawSnapshot>();
  constructor(private readonly now: () => number = Date.now) {}

  get(deviceIp: string, ttlMs = Number.POSITIVE_INFINITY): FeatherRawSnapshot | null {
    const entry = this.entries.get(deviceIp);
    if (!entry) return null;
    const anchor = entry.sourceObservationAt ?? entry.lastSuccessAt;
    const stale = entry.stale || anchor == null || this.now() - new Date(anchor).getTime() >= ttlMs;
    return immutableClone({ ...entry, stale });
  }

  isRefreshDue(deviceIp: string, ttlMs: number, planningLeadMs = 0): boolean {
    const entry = this.entries.get(deviceIp);
    if (!entry) return true;
    const anchor = entry.success ? (entry.sourceObservationAt ?? entry.lastSuccessAt) : entry.lastAttemptAt;
    return anchor == null || this.now() - new Date(anchor).getTime() >= Math.max(0, ttlMs - planningLeadMs);
  }

  isStale(deviceIp: string, ttlMs: number): boolean {
    const entry = this.entries.get(deviceIp);
    if (!entry) return true;
    const anchor = entry.sourceObservationAt ?? entry.lastSuccessAt;
    return entry.stale || anchor == null || this.now() - new Date(anchor).getTime() >= ttlMs;
  }

  getMetadata(deviceIp: string): FeatherRawSnapshot | null {
    const entry = this.entries.get(deviceIp);
    return entry ? immutableClone({ ...entry, reportPayload: null, mainDataPayload: null }) : null;
  }

  getSuccess(deviceIp: string): boolean | null { return this.entries.get(deviceIp)?.success ?? null; }

  metadataValues(ttlFor: (deviceIp: string) => number = () => Number.POSITIVE_INFINITY): FeatherRawSnapshot[] {
    return [...this.entries.entries()].map(([deviceIp, entry]) => immutableClone({
      ...entry,
      reportPayload: null,
      mainDataPayload: null,
      stale: this.isStale(deviceIp, ttlFor(deviceIp)),
    }));
  }

  record(candidate: FeatherCandidate, cycleId: number | null, acquisition: FeatherAcquisitionResult): FeatherRawSnapshot {
    const previous = this.entries.get(candidate.deviceIp);
    const reportSucceeded = acquisition.report.ok && acquisition.report.data != null;
    if (!reportSucceeded) {
      const failed: FeatherRawSnapshot = {
        deviceIp: candidate.deviceIp,
        controllerIdentity: candidate.entityKeyToken || candidate.entityName || candidate.deviceIp,
        reportPayload: previous?.reportPayload ?? null,
        mainDataPayload: previous?.mainDataPayload ?? null,
        reportSourceUrl: previous?.reportSourceUrl ?? `http://${candidate.deviceIp}:8080/feather/status/report.json`,
        mainDataSourceUrl: previous?.mainDataSourceUrl ?? `http://${candidate.deviceIp}:8080/feather/main/data`,
        acquisitionStartedAt: acquisition.startedAt,
        acquisitionCompletedAt: acquisition.completedAt,
        sourceObservationAt: previous?.sourceObservationAt ?? null,
        cacheUpdatedAt: previous?.cacheUpdatedAt ?? null,
        reportLatencyMs: acquisition.report.durationMs,
        mainDataLatencyMs: acquisition.mainData.durationMs || null,
        totalLatencyMs: acquisition.totalLatencyMs,
        reportBytes: acquisition.report.bytes ?? null,
        mainDataBytes: acquisition.mainData.bytes ?? null,
        reportStatusCode: acquisition.report.status || null,
        mainDataStatusCode: acquisition.mainData.status || null,
        reportFingerprint: previous?.reportFingerprint ?? null,
        mainDataFingerprint: previous?.mainDataFingerprint ?? null,
        combinedFingerprint: previous?.combinedFingerprint ?? null,
        cycleId: previous?.cycleId ?? null,
        failureCycleId: cycleId,
        success: false,
        stale: true,
        lastAttemptAt: acquisition.completedAt,
        lastSuccessAt: previous?.lastSuccessAt ?? null,
        lastFailureAt: acquisition.completedAt,
        failureCount: (previous?.failureCount ?? 0) + 1,
        consecutiveFailureCount: (previous?.consecutiveFailureCount ?? 0) + 1,
        retainedLastKnownGood: previous?.reportPayload != null,
        lastError: acquisition.report.error || "Feather status report acquisition failed",
      };
      const immutable = immutableClone(failed);
      this.entries.set(candidate.deviceIp, immutable);
      return this.get(candidate.deviceIp)!;
    }

    const reportPayload = immutableClone(acquisition.report.data);
    const mainDataPayload = acquisition.mainData.ok && acquisition.mainData.data != null ? immutableClone(acquisition.mainData.data) : null;
    const reportFingerprint = fingerprintPayload(reportPayload);
    const mainDataFingerprint = fingerprintPayload(mainDataPayload);
    const completed: FeatherRawSnapshot = {
      deviceIp: candidate.deviceIp,
      controllerIdentity: candidate.entityKeyToken || candidate.entityName || candidate.deviceIp,
      reportPayload,
      mainDataPayload,
      reportSourceUrl: `http://${candidate.deviceIp}:8080/feather/status/report.json`,
      mainDataSourceUrl: `http://${candidate.deviceIp}:8080/feather/main/data`,
      acquisitionStartedAt: acquisition.startedAt,
      acquisitionCompletedAt: acquisition.completedAt,
      sourceObservationAt: sourceTimestamp(reportPayload, mainDataPayload),
      cacheUpdatedAt: acquisition.completedAt,
      reportLatencyMs: acquisition.report.durationMs,
      mainDataLatencyMs: acquisition.mainData.durationMs || null,
      totalLatencyMs: acquisition.totalLatencyMs,
      reportBytes: acquisition.report.bytes ?? null,
      mainDataBytes: acquisition.mainData.bytes ?? null,
      reportStatusCode: acquisition.report.status,
      mainDataStatusCode: acquisition.mainData.status || null,
      reportFingerprint,
      mainDataFingerprint,
      combinedFingerprint: `${reportFingerprint || "none"}|${mainDataFingerprint || "none"}`,
      cycleId,
      failureCycleId: null,
      success: true,
      stale: false,
      lastAttemptAt: acquisition.completedAt,
      lastSuccessAt: acquisition.completedAt,
      lastFailureAt: previous?.lastFailureAt ?? null,
      failureCount: previous?.failureCount ?? 0,
      consecutiveFailureCount: 0,
      retainedLastKnownGood: false,
      lastError: acquisition.mainData.ok ? null : acquisition.mainData.error,
    };
    const immutable = immutableClone(completed);
    this.entries.set(candidate.deviceIp, immutable);
    return this.get(candidate.deviceIp)!;
  }

  values(ttlFor: (deviceIp: string) => number = () => Number.POSITIVE_INFINITY): FeatherRawSnapshot[] { return [...this.entries.keys()].map((ip) => this.get(ip, ttlFor(ip))!).filter(Boolean); }
  clear(): void { this.entries.clear(); }
  get size(): number { return this.entries.size; }
}
