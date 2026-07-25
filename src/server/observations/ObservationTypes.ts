import type { CanonicalObjectKind } from '../../core/objectGraph';
import type { TelemetryBindingDomain } from '../telemetry/binding';

export type ObservationQuality = 'GOOD' | 'DEGRADED' | 'STALE' | 'MISSING' | 'INVALID' | 'RETAINED';
export type ObservationValueType = 'undefined' | 'null' | 'boolean' | 'number' | 'string' | 'array' | 'object';
export type ObservationMode = 'legacy' | 'hybrid' | 'observation';

export interface ObservationRecord {
  readonly observationId: string; readonly objectId: string; readonly objectKind: CanonicalObjectKind; readonly canonicalKey: string;
  readonly telemetryDomain: TelemetryBindingDomain; readonly metric: string; readonly value: unknown; readonly valueType: ObservationValueType; readonly unit: string | null;
  readonly observedAt: string | null; readonly acquiredAt: string | null; readonly normalizedAt: string | null; readonly boundAt: string; readonly publishedAt: string;
  readonly ageMs: number | null; readonly stale: boolean; readonly retainedLastKnownGood: boolean; readonly health: Readonly<Record<string, unknown>>;
  readonly confidence: number; readonly quality: ObservationQuality; readonly sourceProviderId: string | null; readonly sourceEndpoint: string | null;
  readonly sourceFingerprint: string; readonly authorityProviderId: string | null; readonly fallbackUsed: boolean; readonly graphFingerprint: string;
  readonly graphSourceFingerprint: string; readonly bindingFingerprint: string; readonly cycleId: number | null; readonly producingCycleId: number | null;
  readonly failureCycleId: number | null; readonly metadata: Readonly<Record<string, unknown>>;
}

export interface CurrentObjectState {
  readonly objectId: string; readonly objectKind: CanonicalObjectKind; readonly canonicalKey: string; readonly generatedAt: string; readonly cycleId: number | null;
  readonly graphFingerprint: string; readonly observationCount: number; readonly observationsByMetric: Readonly<Record<string, ObservationRecord>>;
  readonly healthSummary: Readonly<Record<string, number>>; readonly freshnessSummary: Readonly<Record<string, unknown>>; readonly latestObservedAt: string | null;
  readonly stale: boolean; readonly retainedLastKnownGood: boolean; readonly sourceSummary: Readonly<Record<string, unknown>>;
}

export interface ObservationReadiness { readonly ready: boolean; readonly blockers: readonly string[]; readonly expectedStates: number; readonly currentStates: number; readonly requiredMetrics: number; readonly missingMetrics: number; }
export interface ObservationIndexes {
  readonly byObservationId: Readonly<Record<string, ObservationRecord>>; readonly byObjectId: Readonly<Record<string, readonly string[]>>;
  readonly byCanonicalKey: Readonly<Record<string, readonly string[]>>; readonly byMetric: Readonly<Record<string, readonly string[]>>;
  readonly byDomain: Readonly<Record<string, readonly string[]>>; readonly byQuality: Readonly<Record<ObservationQuality, readonly string[]>>;
  readonly byArrayString: Readonly<Record<string, readonly string[]>>; readonly byEnergySegment: Readonly<Record<string, readonly string[]>>;
  readonly controllerHealthByObjectId: Readonly<Record<string, readonly string[]>>;
}

export interface ObservationSnapshot {
  readonly generatedAt: string; readonly cycleId: number | null; readonly graphFingerprint: string; readonly graphSourceFingerprint: string;
  readonly bindingFingerprint: string; readonly observationFingerprint: string; readonly observationSchemaVersion: string;
  readonly observations: readonly ObservationRecord[]; readonly currentStates: readonly CurrentObjectState[]; readonly countsByObjectKind: Readonly<Record<string, number>>;
  readonly countsByDomain: Readonly<Record<string, number>>; readonly countsByMetric: Readonly<Record<string, number>>; readonly countsByQuality: Readonly<Record<ObservationQuality, number>>;
  readonly staleObservationCount: number; readonly missingObservationCount: number; readonly retainedObservationCount: number; readonly duplicateObservationCount: number;
  readonly crossProfileObservationCount: number; readonly health: Readonly<Record<string, unknown>>; readonly sourceMetadata: readonly Readonly<Record<string, unknown>>[];
  readonly readiness: Readonly<Record<TelemetryBindingDomain, ObservationReadiness>>; readonly parity: Readonly<Record<string, unknown>>; readonly indexes: ObservationIndexes;
}
