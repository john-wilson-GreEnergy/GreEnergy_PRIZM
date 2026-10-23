import { cloneValue } from "./TelemetryHealth";
import { telemetryMetrics } from "./metrics";
import { runInTelemetryCycle } from "./TelemetryCycleContext";
import { coordinatorProfiler } from "./profiler";
import { cycleNormalizationCache } from "./normalization";

export type CoordinatorRuntimeState = "IDLE" | "RUNNING" | "REFRESH_PENDING" | "STOPPING" | "FAILED";

export interface CoordinatorCycleOutcome<TSnapshot> {
  snapshot: TSnapshot | null;
  successful: boolean;
  acquisitionTimestamp?: string | null;
}

export interface CoordinatorCycleRecord {
  cycleId: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  waitTimeMs: number;
  reasons: string[];
  refreshRequestCount: number;
  successful: boolean;
}

export interface CoordinatorDebugState {
  state: CoordinatorRuntimeState;
  currentCycleId: number | null;
  cycleStart: string | null;
  cycleDuration: number | null;
  pendingRefreshCount: number;
  pendingRefreshReasons: string[];
  refreshRequestCount: number;
  coalescedRefreshCount: number;
  ignoredDuplicateRefreshCount: number;
  queuedRefreshCount: number;
  lastRefreshRequest: { reason: string; requestedAt: string } | null;
  lastCompletedCycle: CoordinatorCycleRecord | null;
  lastCompletedDuration: number | null;
  lastAcquisition: string | null;
  snapshotAge: number | null;
  coordinatorRunning: boolean;
  maximumObservedConcurrency: number;
  currentConcurrency: number;
  refreshQueueDepth: number;
  nextScheduledCycle: string | null;
  cycleHistory: CoordinatorCycleRecord[];
  snapshotRetention: unknown;
}

type CycleExecutor<TSnapshot> = (context: { cycleId: number; reasons: string[]; refreshRequestCount: number }) => Promise<CoordinatorCycleOutcome<TSnapshot>>;

export type SnapshotReadOnly<T> = T extends object
  ? { readonly [K in keyof T]: SnapshotReadOnly<T[K]> }
  : T;

export class CoordinatorRuntime<TSnapshot> {
  private state: CoordinatorRuntimeState = "IDLE";
  private currentSnapshot: TSnapshot | null = null;
  private lastSuccessfulSnapshot: TSnapshot | null = null;
  private pendingRefreshRequests = 0;
  private readonly refreshReasons = new Set<string>();
  private firstPendingAt: number | null = null;
  private refreshRequestCount = 0;
  private coalescedRefreshCount = 0;
  private ignoredDuplicateRefreshCount = 0;
  private queuedRefreshCount = 0;
  private lastRefreshRequest: { reason: string; requestedAt: string } | null = null;
  private collectionPromise: Promise<void> | null = null;
  private drainScheduled = false;
  private stopping = false;
  private interval: NodeJS.Timeout | null = null;
  private intervalMs: number | null = null;
  private nextScheduledCycle: string | null = null;
  private currentCycleId: number | null = null;
  private cycleSequence = 0;
  private cycleStartedAt: string | null = null;
  private currentConcurrency = 0;
  private maximumObservedConcurrency = 0;
  private lastCompletedCycle: CoordinatorCycleRecord | null = null;
  private cycleHistory: CoordinatorCycleRecord[] = [];
  private lastAcquisition: string | null = null;
  private snapshotRevision = 0;

  constructor(private readonly executeCycle: CycleExecutor<TSnapshot>, private readonly retainer?: {
    clone(snapshot: TSnapshot): Promise<TSnapshot>;
    status(): unknown;
  }) {}

  start(intervalMs: number): void {
    if (this.interval) clearInterval(this.interval);
    this.stopping = false;
    this.intervalMs = intervalMs;
    this.state = "IDLE";
    this.scheduleNextTimestamp();
    this.interval = setInterval(() => {
      this.scheduleNextTimestamp();
      this.requestRefresh("scheduled-interval");
    }, intervalMs);
    this.requestRefresh("coordinator-start");
  }

  stop(): void {
    this.stopping = true;
    this.state = "STOPPING";
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.nextScheduledCycle = null;
    this.pendingRefreshRequests = 0;
    this.refreshReasons.clear();
    this.firstPendingAt = null;
  }

  requestRefresh(reason: string): void {
    if(this.stopping)return;
    const normalizedReason = String(reason || "unspecified").trim() || "unspecified";
    const requestedAt = new Date().toISOString();
    this.refreshRequestCount += 1;
    this.lastRefreshRequest = { reason: normalizedReason, requestedAt };

    // Scheduled ticks are cadence hints, not work that must be replayed. If a
    // cycle is already active, queueing every tick creates a permanent backlog.
    if (normalizedReason === "scheduled-interval" && (this.collectionPromise || this.pendingRefreshRequests > 0)) {
      this.ignoredDuplicateRefreshCount += 1;
      this.coalescedRefreshCount += 1;
      telemetryMetrics.registry.recordCoordinatorRefresh({
        coalesced: true,
        duplicate: true,
        queued: false,
        queueDepth: this.pendingRefreshRequests > 0 ? 1 : 0,
      });
      return;
    }

    const duplicateReason = this.refreshReasons.has(normalizedReason);
    const alreadyQueued = this.pendingRefreshRequests > 0;
    if (duplicateReason) this.ignoredDuplicateRefreshCount += 1;
    if (alreadyQueued || this.collectionPromise) this.coalescedRefreshCount += 1;
    if (this.collectionPromise) this.queuedRefreshCount += 1;

    this.pendingRefreshRequests += 1;
    this.refreshReasons.add(normalizedReason);
    this.firstPendingAt ??= performance.now();
    if (this.collectionPromise) this.state = "REFRESH_PENDING";

    telemetryMetrics.registry.recordCoordinatorRefresh({
      coalesced: alreadyQueued || !!this.collectionPromise,
      duplicate: duplicateReason,
      queued: !!this.collectionPromise,
      queueDepth: 1,
    });

    if (!this.collectionPromise && !this.stopping) this.scheduleDrain();
  }

  getCurrentSnapshot(): TSnapshot | null { return cloneValue(this.currentSnapshot); }
  getLastSuccessfulSnapshot(): TSnapshot | null { return cloneValue(this.lastSuccessfulSnapshot); }

  // Trusted, synchronous selectors only: never expose the owned publication or
  // accept request-provided callbacks. Copy only their result before returning it.
  getCurrentProjection<TProjection>(select: (snapshot: SnapshotReadOnly<TSnapshot>) => TProjection): TProjection | null {
    return this.currentSnapshot === null ? null : cloneValue(select(this.currentSnapshot as SnapshotReadOnly<TSnapshot>));
  }

  setCurrentSnapshot(snapshot: TSnapshot | null): void {
    this.snapshotRevision++;
    this.retainSnapshot(snapshot, Boolean(snapshot));
  }

  private retainSnapshot(snapshot: TSnapshot | null, successful: boolean): void {
    // Own one defensive copy. These private publications are replaced, never
    // mutated; every public read/selector result still receives its own copy.
    // Do not serialize the same multi-megabyte graph twice per successful cycle.
    const owned = cloneValue(snapshot);
    const retained = successful
      ? process.env.PRIZM_SNAPSHOT_RETENTION === 'legacy' ? cloneValue(snapshot) : owned
      : this.lastSuccessfulSnapshot;
    this.currentSnapshot = owned;
    this.lastSuccessfulSnapshot = retained;
  }

  getDebugState(): CoordinatorDebugState {
    const now = Date.now();
    const cycleDuration = this.cycleStartedAt ? Math.max(0, now - new Date(this.cycleStartedAt).getTime()) : null;
    const snapshotAge = this.lastAcquisition ? Math.max(0, now - new Date(this.lastAcquisition).getTime()) : null;
    return {
      state: this.state,
      currentCycleId: this.currentCycleId,
      cycleStart: this.cycleStartedAt,
      cycleDuration,
      pendingRefreshCount: this.pendingRefreshRequests,
      pendingRefreshReasons: [...this.refreshReasons],
      refreshRequestCount: this.refreshRequestCount,
      coalescedRefreshCount: this.coalescedRefreshCount,
      ignoredDuplicateRefreshCount: this.ignoredDuplicateRefreshCount,
      queuedRefreshCount: this.queuedRefreshCount,
      lastRefreshRequest: cloneValue(this.lastRefreshRequest),
      lastCompletedCycle: cloneValue(this.lastCompletedCycle),
      lastCompletedDuration: this.lastCompletedCycle?.durationMs ?? null,
      lastAcquisition: this.lastAcquisition,
      snapshotAge,
      coordinatorRunning: !!this.collectionPromise,
      maximumObservedConcurrency: this.maximumObservedConcurrency,
      currentConcurrency: this.currentConcurrency,
      refreshQueueDepth: this.pendingRefreshRequests > 0 ? 1 : 0,
      nextScheduledCycle: this.nextScheduledCycle,
      cycleHistory: cloneValue(this.cycleHistory),
      snapshotRetention: {enabled: !!this.retainer && process.env.PRIZM_RETENTION_WORKER !== 'false' && process.env.PRIZM_SNAPSHOT_RETENTION !== 'legacy', worker: this.retainer?.status() ?? null},
    };
  }

  async waitForIdle(): Promise<void> {
    while (this.collectionPromise || this.drainScheduled) {
      await this.collectionPromise;
      await Promise.resolve();
    }
  }

  private scheduleDrain(): void {
    if (this.drainScheduled) return;
    this.drainScheduled = true;
    queueMicrotask(() => {
      this.drainScheduled = false;
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.collectionPromise) {
      telemetryMetrics.registry.coordinatorCycleSkipped();
      return;
    }
    if (this.stopping || this.pendingRefreshRequests === 0) return;

    const reasons = [...this.refreshReasons];
    const requestCount = this.pendingRefreshRequests;
    const waitTimeMs = this.firstPendingAt == null ? 0 : Math.max(0, performance.now() - this.firstPendingAt);
    this.pendingRefreshRequests = 0;
    this.refreshReasons.clear();
    this.firstPendingAt = null;
    const cycleId = ++this.cycleSequence;
    const startedAt = new Date().toISOString();
    const startedMonotonic = performance.now();
    this.currentCycleId = cycleId;
    this.cycleStartedAt = startedAt;
    this.state = "RUNNING";
    this.currentConcurrency += 1;
    this.maximumObservedConcurrency = Math.max(this.maximumObservedConcurrency, this.currentConcurrency);
    telemetryMetrics.registry.recordCoordinatorCycleWait(waitTimeMs);
    const cycleMetric = telemetryMetrics.registry.beginCoordinatorCycle();
    coordinatorProfiler.startCycle(cycleId, { refreshWaitMs: waitTimeMs, lockWaitMs: 0 });

    let cycleFailedUnexpectedly = false;
    let cycleSuccessful = false;
    const snapshotRevision = this.snapshotRevision;
    this.collectionPromise = (async () => {
      let successful = false;
      try {
        const outcome = await runInTelemetryCycle(cycleId, () => this.executeCycle({ cycleId, reasons, refreshRequestCount: requestCount }));
        if (snapshotRevision !== this.snapshotRevision) throw new Error('Snapshot invalidated during acquisition');
        if (outcome.snapshot) {
          if (this.retainer && process.env.PRIZM_RETENTION_WORKER !== 'false' && process.env.PRIZM_SNAPSHOT_RETENTION !== 'legacy') {
            const owned = await runInTelemetryCycle(cycleId, () => coordinatorProfiler.withPhase("Snapshot Retention", {waitState:"CACHE",blocking:false},
              () => this.retainer!.clone(outcome.snapshot!)));
            if (snapshotRevision !== this.snapshotRevision) throw new Error('Snapshot invalidated during retention');
            this.currentSnapshot = owned;
            if (outcome.successful) this.lastSuccessfulSnapshot = owned;
          } else {
            runInTelemetryCycle(cycleId, () => coordinatorProfiler.withSyncPhase("Snapshot Retention", {waitState:"CACHE",blocking:true},
              () => this.retainSnapshot(outcome.snapshot, outcome.successful)));
          }
        } else if (!outcome.successful && this.lastSuccessfulSnapshot) {
          this.currentSnapshot = process.env.PRIZM_SNAPSHOT_RETENTION === 'legacy'
            ? cloneValue(this.lastSuccessfulSnapshot) : this.lastSuccessfulSnapshot;
        }
        if (outcome.successful) this.lastAcquisition = outcome.acquisitionTimestamp || new Date().toISOString();
        successful = outcome.successful;
        cycleSuccessful = outcome.successful;
        this.state = this.stopping
          ? "STOPPING"
          : this.pendingRefreshRequests > 0
            ? "REFRESH_PENDING"
            : outcome.successful ? "IDLE" : "FAILED";
      } catch {
        cycleFailedUnexpectedly = true;
        this.state = this.stopping ? "STOPPING" : "FAILED";
        if (snapshotRevision === this.snapshotRevision && this.lastSuccessfulSnapshot) this.currentSnapshot = process.env.PRIZM_SNAPSHOT_RETENTION === 'legacy'
          ? cloneValue(this.lastSuccessfulSnapshot) : this.lastSuccessfulSnapshot;
      } finally {
        const completedAt = new Date().toISOString();
        const record: CoordinatorCycleRecord = {
          cycleId,
          startedAt,
          completedAt,
          durationMs: performance.now() - startedMonotonic,
          waitTimeMs,
          reasons,
          refreshRequestCount: requestCount,
          successful,
        };
        this.lastCompletedCycle = record;
        this.cycleHistory.push(record);
        if (this.cycleHistory.length > 20) this.cycleHistory.shift();
        this.currentConcurrency = Math.max(0, this.currentConcurrency - 1);
        this.currentCycleId = null;
        this.cycleStartedAt = null;
        coordinatorProfiler.completeCycle(cycleId, successful);
        cycleNormalizationCache.clearCycle(cycleId);
        cycleMetric.finish(successful);
      }
    })();

    await this.collectionPromise;
    this.collectionPromise = null;
    if (this.stopping) return;
    if (this.pendingRefreshRequests > 0) {
      telemetryMetrics.registry.recordSuccessfulCoalescing();
      this.scheduleDrain();
    } else if (!cycleFailedUnexpectedly && cycleSuccessful) {
      this.state = "IDLE";
    }
  }

  private scheduleNextTimestamp(): void {
    this.nextScheduledCycle = this.intervalMs == null ? null : new Date(Date.now() + this.intervalMs).toISOString();
  }
}
