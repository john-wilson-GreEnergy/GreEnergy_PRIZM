import { immutableValue } from '../../core/objectGraph';

export interface TopologyGraphMetricsSnapshot {
  readonly rebuildRequests: number;
  readonly coalescedRebuilds: number;
  readonly rebuildExecutions: number;
  readonly latestRebuildDurationMs: number | null;
  readonly latestSourceCollectionDurationMs: number | null;
  readonly latestObjectCreationDurationMs: number | null;
  readonly latestRelationshipCreationDurationMs: number | null;
  readonly latestValidationDurationMs: number | null;
  readonly latestSnapshotDurationMs: number | null;
  readonly successfulRebuilds: number;
  readonly failedRebuilds: number;
  readonly retainedLastKnownGoodUse: number;
  readonly sourceFingerprintChanges: number;
  readonly unchangedSourceSkips: number;
  readonly objectCount: number;
  readonly relationshipCount: number;
  readonly parityMismatchCount: number;
}

export class TopologyGraphMetrics {
  private state: TopologyGraphMetricsSnapshot = {
    rebuildRequests: 0, coalescedRebuilds: 0, rebuildExecutions: 0,
    latestRebuildDurationMs: null, latestSourceCollectionDurationMs: null,
    latestObjectCreationDurationMs: null, latestRelationshipCreationDurationMs: null,
    latestValidationDurationMs: null, latestSnapshotDurationMs: null,
    successfulRebuilds: 0, failedRebuilds: 0, retainedLastKnownGoodUse: 0,
    sourceFingerprintChanges: 0, unchangedSourceSkips: 0, objectCount: 0,
    relationshipCount: 0, parityMismatchCount: 0,
  };

  recordRequest(): void { this.patch({ rebuildRequests: this.state.rebuildRequests + 1 }); }
  recordCoalesced(): void { this.patch({ coalescedRebuilds: this.state.coalescedRebuilds + 1 }); }
  recordExecution(): void { this.patch({ rebuildExecutions: this.state.rebuildExecutions + 1 }); }
  recordFingerprintChange(): void { this.patch({ sourceFingerprintChanges: this.state.sourceFingerprintChanges + 1 }); }
  recordUnchangedSkip(): void { this.patch({ unchangedSourceSkips: this.state.unchangedSourceSkips + 1 }); }
  recordFailure(durationMs: number, retained: boolean): void {
    this.patch({ failedRebuilds: this.state.failedRebuilds + 1, latestRebuildDurationMs: durationMs, retainedLastKnownGoodUse: this.state.retainedLastKnownGoodUse + (retained ? 1 : 0) });
  }
  recordSuccess(value: { rebuildDurationMs: number; sourceCollectionDurationMs: number; objectCreationDurationMs: number; relationshipCreationDurationMs: number; validationDurationMs: number; snapshotDurationMs: number; objectCount: number; relationshipCount: number; parityMismatchCount: number }): void {
    this.patch({ successfulRebuilds: this.state.successfulRebuilds + 1, latestRebuildDurationMs: value.rebuildDurationMs, latestSourceCollectionDurationMs: value.sourceCollectionDurationMs, latestObjectCreationDurationMs: value.objectCreationDurationMs, latestRelationshipCreationDurationMs: value.relationshipCreationDurationMs, latestValidationDurationMs: value.validationDurationMs, latestSnapshotDurationMs: value.snapshotDurationMs, objectCount: value.objectCount, relationshipCount: value.relationshipCount, parityMismatchCount: value.parityMismatchCount });
  }
  snapshot(): TopologyGraphMetricsSnapshot { return immutableValue(structuredClone(this.state)); }
  reset(): TopologyGraphMetricsSnapshot { const next = new TopologyGraphMetrics(); this.state = next.state; return this.snapshot(); }
  private patch(value: Partial<TopologyGraphMetricsSnapshot>): void { this.state = { ...this.state, ...value }; }
}
