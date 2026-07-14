import type { CanonicalObjectKind } from '../../../core/objectGraph';

export type TelemetryBindingDomain = 'string-telemetry' | 'controller-health';
export type TelemetryBindingMode = 'legacy' | 'hybrid' | 'bound';

export interface TelemetryObservationBinding<T = Readonly<Record<string, unknown>>> {
  readonly bindingId: string;
  readonly objectId: string;
  readonly objectKind: CanonicalObjectKind;
  readonly canonicalKey: string;
  readonly telemetryDomain: TelemetryBindingDomain;
  readonly value: T;
  readonly observedAt: string | null;
  readonly acquiredAt: string | null;
  readonly normalizedAt: string | null;
  readonly publishedAt: string;
  readonly ageMs: number | null;
  readonly stale: boolean;
  readonly retainedLastKnownGood: boolean;
  readonly sourceProviderId: string | null;
  readonly sourceEndpoint: string | null;
  readonly sourceFingerprint: string;
  readonly graphFingerprint: string;
  readonly graphSourceFingerprint: string;
  readonly cycleId: number | null;
  readonly producingCycleId: number | null;
  readonly failureCycleId: number | null;
  readonly authorityProviderId: string | null;
  readonly fallbackUsed: boolean;
  readonly health: Readonly<Record<string, unknown>>;
  readonly confidence: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface TelemetryBindingReadiness {
  readonly ready: boolean;
  readonly blockers: readonly string[];
  readonly expected: number;
  readonly bound: number;
  readonly stale: number;
}

export interface TelemetryBindingIndexes {
  readonly byBindingId: Readonly<Record<string, TelemetryObservationBinding>>;
  readonly byObjectId: Readonly<Record<string, readonly string[]>>;
  readonly byCanonicalKey: Readonly<Record<string, readonly string[]>>;
  readonly byDomain: Readonly<Record<TelemetryBindingDomain, readonly string[]>>;
  readonly stringByCoordinate: Readonly<Record<string, string>>;
  readonly stringsByEnergySegment: Readonly<Record<string, readonly string[]>>;
  readonly controllerHealthByObjectId: Readonly<Record<string, string>>;
}

export interface TelemetryBindingSnapshot {
  readonly generatedAt: string;
  readonly cycleId: number | null;
  readonly graphFingerprint: string;
  readonly graphSourceFingerprint: string;
  readonly bindingFingerprint: string;
  readonly bindingSourceFingerprint: string;
  readonly telemetrySnapshotVersion: string;
  readonly bindingSchemaVersion: string;
  readonly bindingsByDomain: Readonly<Record<TelemetryBindingDomain, readonly TelemetryObservationBinding[]>>;
  readonly countsByDomain: Readonly<Record<TelemetryBindingDomain, number>>;
  readonly missingIdentityCount: number;
  readonly missingTelemetryCount: number;
  readonly duplicateBindingCount: number;
  readonly staleBindingCount: number;
  readonly retainedBindingCount: number;
  readonly crossProfileBindingCount: number;
  readonly authoritySummary: Readonly<Record<string, unknown>>;
  readonly health: Readonly<Record<string, unknown>>;
  readonly sourceMetadata: readonly Readonly<Record<string, unknown>>[];
  readonly readinessByDomain: Readonly<Record<TelemetryBindingDomain, TelemetryBindingReadiness>>;
  readonly indexes: TelemetryBindingIndexes;
}
