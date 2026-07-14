import { immutableValue } from '../../core/objectGraph';

export interface TopologyGraphMetricsSnapshot {
  readonly graphInvalidations: number;
  readonly invalidationsByReason: Readonly<Record<string, number>>;
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
  readonly latestProfileSwitchRebuildDurationMs: number | null;
  readonly latestTimeToRegainHybridReadinessMs: number | null;
  readonly latestTimeToRegainGraphOnlyReadinessMs: number | null;
}

export class TopologyGraphMetrics {
  private state: TopologyGraphMetricsSnapshot = {
    graphInvalidations: 0, invalidationsByReason: {},
    rebuildRequests: 0, coalescedRebuilds: 0, rebuildExecutions: 0,
    latestRebuildDurationMs: null, latestSourceCollectionDurationMs: null,
    latestObjectCreationDurationMs: null, latestRelationshipCreationDurationMs: null,
    latestValidationDurationMs: null, latestSnapshotDurationMs: null,
    successfulRebuilds: 0, failedRebuilds: 0, retainedLastKnownGoodUse: 0,
    sourceFingerprintChanges: 0, unchangedSourceSkips: 0, objectCount: 0,
    relationshipCount: 0, parityMismatchCount: 0, latestProfileSwitchRebuildDurationMs: null, latestTimeToRegainHybridReadinessMs: null, latestTimeToRegainGraphOnlyReadinessMs: null,
  };

  recordRequest(): void { this.patch({ rebuildRequests: this.state.rebuildRequests + 1 }); }
  recordCoalesced(): void { this.patch({ coalescedRebuilds: this.state.coalescedRebuilds + 1 }); }
  recordExecution(): void { this.patch({ rebuildExecutions: this.state.rebuildExecutions + 1 }); }
  recordFingerprintChange(): void { this.patch({ sourceFingerprintChanges: this.state.sourceFingerprintChanges + 1 }); }
  recordUnchangedSkip(): void { this.patch({ unchangedSourceSkips: this.state.unchangedSourceSkips + 1 }); }
  recordInvalidation(reason: string): void { this.patch({ graphInvalidations: this.state.graphInvalidations + 1, invalidationsByReason: { ...this.state.invalidationsByReason, [reason]: (this.state.invalidationsByReason[reason] ?? 0) + 1 } }); }
  recordHybridReadiness(durationMs: number): void { this.patch({ latestTimeToRegainHybridReadinessMs: durationMs }); }
  recordGraphReadiness(durationMs: number): void { this.patch({ latestTimeToRegainGraphOnlyReadinessMs: durationMs }); }
  recordFailure(durationMs: number, retained: boolean): void {
    this.patch({ failedRebuilds: this.state.failedRebuilds + 1, latestRebuildDurationMs: durationMs, retainedLastKnownGoodUse: this.state.retainedLastKnownGoodUse + (retained ? 1 : 0) });
  }
  recordSuccess(value: { rebuildDurationMs: number; sourceCollectionDurationMs: number; objectCreationDurationMs: number; relationshipCreationDurationMs: number; validationDurationMs: number; snapshotDurationMs: number; objectCount: number; relationshipCount: number; parityMismatchCount: number; profileSwitch: boolean }): void {
    this.patch({ successfulRebuilds: this.state.successfulRebuilds + 1, latestRebuildDurationMs: value.rebuildDurationMs, latestSourceCollectionDurationMs: value.sourceCollectionDurationMs, latestObjectCreationDurationMs: value.objectCreationDurationMs, latestRelationshipCreationDurationMs: value.relationshipCreationDurationMs, latestValidationDurationMs: value.validationDurationMs, latestSnapshotDurationMs: value.snapshotDurationMs, objectCount: value.objectCount, relationshipCount: value.relationshipCount, parityMismatchCount: value.parityMismatchCount, latestProfileSwitchRebuildDurationMs: value.profileSwitch ? value.rebuildDurationMs : this.state.latestProfileSwitchRebuildDurationMs });
  }
  snapshot(): TopologyGraphMetricsSnapshot { return immutableValue(structuredClone(this.state)); }
  reset(): TopologyGraphMetricsSnapshot { const next = new TopologyGraphMetrics(); this.state = next.state; return this.snapshot(); }
  private patch(value: Partial<TopologyGraphMetricsSnapshot>): void { this.state = { ...this.state, ...value }; }
}
