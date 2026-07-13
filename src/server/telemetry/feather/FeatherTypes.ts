import type { FeatherHvacDevice } from "../../feather/deviceEnrichment";
import type { DiscoveryCandidate, FeatherNormalizedStatus } from "../../feather/featherTypes";

export type FeatherMode = "legacy" | "scheduled";
export type FeatherPriorityClass = "ON_DEMAND" | "HOT" | "WARM" | "COLD";
export type FeatherTopologyClassification = "expected-and-reachable" | "expected-but-unavailable" | "topology-derived-false-candidate" | "disabled-not-applicable" | "unknown";

export interface FeatherSchedulerConfig {
  mode: FeatherMode;
  maxConcurrency: number;
  maxRefreshesPerCycle: number;
  hotTtlMs: number;
  warmTtlMs: number;
  coldTtlMs: number;
  forceFullRefresh: boolean;
  timeoutMs: number;
}

export interface FeatherRawSnapshot {
  deviceIp: string;
  controllerIdentity: string;
  reportPayload: unknown | null;
  mainDataPayload: unknown | null;
  reportSourceUrl: string;
  mainDataSourceUrl: string;
  acquisitionStartedAt: string;
  acquisitionCompletedAt: string;
  sourceObservationAt: string | null;
  cacheUpdatedAt: string | null;
  reportLatencyMs: number | null;
  mainDataLatencyMs: number | null;
  totalLatencyMs: number;
  reportBytes: number | null;
  mainDataBytes: number | null;
  reportStatusCode: number | null;
  mainDataStatusCode: number | null;
  reportFingerprint: string | null;
  mainDataFingerprint: string | null;
  combinedFingerprint: string | null;
  cycleId: number | null;
  failureCycleId: number | null;
  success: boolean;
  stale: boolean;
  lastAttemptAt: string;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  failureCount: number;
  consecutiveFailureCount: number;
  retainedLastKnownGood: boolean;
  lastError: string | null;
}

export interface FeatherParsedSnapshot {
  deviceIp: string;
  parsedAt: string;
  parseDurationMs: number;
  parserVersion: string;
  sourceFingerprint: string;
  cycleId: number | null;
  stale: boolean;
  provenance: {
    source: "feather-scheduler";
    reportSourceUrl: string;
    mainDataSourceUrl: string;
    sourceObservationAt: string | null;
  };
  normalized: FeatherNormalizedStatus;
  enrichment: Partial<FeatherHvacDevice>;
}

export interface FeatherCandidate extends DiscoveryCandidate {
  priority: FeatherPriorityClass;
  topologyClassification: FeatherTopologyClassification;
}

export interface FeatherAcquisitionResult {
  report: { ok: boolean; status: number; data: unknown | null; error: string | null; durationMs: number; bytes?: number | null };
  mainData: { ok: boolean; status: number; data: unknown | null; error: string | null; durationMs: number; bytes?: number | null };
  startedAt: string;
  completedAt: string;
  totalLatencyMs: number;
}

export interface FeatherSchedulerCycleResult {
  cycleId: number | null;
  candidates: number;
  requested: number;
  refreshed: number;
  snapshots: readonly FeatherParsedSnapshot[];
}
