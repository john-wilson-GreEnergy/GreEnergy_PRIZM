import { immutableBindingValue } from './TelemetryBindingSnapshot';

export class TelemetryBindingMetrics {
  private state = { rebuildRequests: 0, coalescedRebuilds: 0, rebuildExecutions: 0, skippedUnchangedRebuilds: 0, successfulRebuilds: 0, failedRebuilds: 0, retainedLastKnownGoodUse: 0, latestRebuildDurationMs: null as number | null, latestGraphLookupDurationMs: null as number | null, latestTelemetryLookupDurationMs: null as number | null, latestBindingCreationDurationMs: null as number | null, latestIndexCreationDurationMs: null as number | null, latestValidationDurationMs: null as number | null, latestSnapshotDurationMs: null as number | null, bindingCountsByDomain: {} as Record<string, number>, missingIdentityCount: 0, missingTelemetryCount: 0, duplicateBindingCount: 0, staleBindingCount: 0, crossProfileRejectionCount: 0, parityComparisons: 0, parityMismatches: 0, boundRouteUses: 0, hybridRouteUses: 0, legacyRouteUses: 0, automaticFallbacks: 0, fallbackReasons: {} as Record<string, number> };
  request(coalesced: boolean): void { this.state.rebuildRequests++; if (coalesced) this.state.coalescedRebuilds++; }
  execution(): void { this.state.rebuildExecutions++; }
  unchanged(): void { this.state.skippedUnchangedRebuilds++; }
  success(value: Partial<typeof this.state>): void { this.state = { ...this.state, ...value, successfulRebuilds: this.state.successfulRebuilds + 1 }; }
  failure(retained: boolean): void { this.state.failedRebuilds++; if (retained) this.state.retainedLastKnownGoodUse++; }
  crossProfileRejection(): void { this.state.crossProfileRejectionCount++; }
  parity(mismatches: number): void { this.state.parityComparisons++; this.state.parityMismatches += mismatches; }
  route(mode: 'legacy' | 'hybrid' | 'bound'): void { if (mode === 'legacy') this.state.legacyRouteUses++; else if (mode === 'bound') this.state.boundRouteUses++; else this.state.hybridRouteUses++; }
  fallback(reason: string): void { this.state.automaticFallbacks++; this.state.fallbackReasons = { ...this.state.fallbackReasons, [reason]: (this.state.fallbackReasons[reason] ?? 0) + 1 }; }
  snapshot() { return immutableBindingValue(this.state); }
  reset() { this.state = new TelemetryBindingMetrics().state; return this.snapshot(); }
}
