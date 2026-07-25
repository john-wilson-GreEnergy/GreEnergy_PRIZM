import type { ProjectionBuildMetrics, WorkspaceProjectionKind } from './WorkspaceProjectionTypes';

export class WorkspaceProjectionMetrics {
  private value: ProjectionBuildMetrics = this.empty();
  private empty(): ProjectionBuildMetrics { return { buildRequests: 0, coalescedBuilds: 0, skippedUnchangedBuilds: 0, successfulBuilds: 0, failedBuilds: 0, lastKnownGoodUses: 0, crossProfileRejections: 0, targetedDetailUses: 0, routeUses: {}, buildDurationMs: {}, serializedBytes: {}, routeLatencyMs: {}, sourceReadDurationMs: null, lastError: null }; }
  requested(coalesced: boolean) { this.value.buildRequests++; if (coalesced) this.value.coalescedBuilds++; }
  skipped() { this.value.skippedUnchangedBuilds++; }
  success(durations: Record<WorkspaceProjectionKind, number>, bytes: Record<WorkspaceProjectionKind, number>, sourceReadDurationMs: number) { this.value.successfulBuilds++; this.value.buildDurationMs = durations; this.value.serializedBytes = { ...this.value.serializedBytes, ...bytes }; this.value.sourceReadDurationMs = sourceReadDurationMs; this.value.lastError = null; }
  failure(error: string, retained: boolean, crossProfile: boolean) { this.value.failedBuilds++; this.value.lastError = error; if (retained) this.value.lastKnownGoodUses++; if (crossProfile) this.value.crossProfileRejections++; }
  route(route: string, latencyMs: number, bytes: number) { this.value.routeUses[route] = (this.value.routeUses[route] ?? 0) + 1; this.value.routeLatencyMs[route] = latencyMs; this.value.serializedBytes[route] = bytes; }
  detail() { this.value.targetedDetailUses++; }
  report() { return structuredClone(this.value); }
  reset() { this.value = this.empty(); return this.report(); }
}
