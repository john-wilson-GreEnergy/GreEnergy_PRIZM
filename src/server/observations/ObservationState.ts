import { immutableBindingValue } from '../telemetry/binding';
import type { CurrentObjectState, ObservationRecord } from './ObservationTypes';

export function reduceCurrentStates(observations: readonly ObservationRecord[], generatedAt: string, cycleId: number | null, graphFingerprint: string): readonly CurrentObjectState[] {
  const grouped = new Map<string, ObservationRecord[]>(); for (const observation of observations) (grouped.get(observation.objectId) ?? (grouped.set(observation.objectId, []), grouped.get(observation.objectId)!)).push(observation);
  return immutableBindingValue([...grouped.values()].map((values) => {
    const first = values[0]; const observationsByMetric = Object.fromEntries(values.map((value) => [value.metric, value])); const healthSummary = Object.fromEntries(['GOOD', 'DEGRADED', 'STALE', 'MISSING', 'INVALID', 'RETAINED'].map((quality) => [quality, values.filter((value) => value.quality === quality).length]));
    const observed = values.map((value) => value.observedAt).filter((value): value is string => !!value).sort(); const providers = [...new Set(values.map((value) => value.sourceProviderId).filter(Boolean))];
    return { objectId: first.objectId, objectKind: first.objectKind, canonicalKey: first.canonicalKey, generatedAt, cycleId, graphFingerprint, observationCount: values.length, observationsByMetric, healthSummary, freshnessSummary: { staleCount: values.filter((value) => value.stale).length, minimumAgeMs: Math.min(...values.map((value) => value.ageMs ?? Infinity).filter(Number.isFinite), Infinity) === Infinity ? null : Math.min(...values.map((value) => value.ageMs ?? Infinity).filter(Number.isFinite)), maximumAgeMs: Math.max(...values.map((value) => value.ageMs ?? -1)) < 0 ? null : Math.max(...values.map((value) => value.ageMs ?? -1)) }, latestObservedAt: observed.at(-1) ?? null, stale: values.some((value) => value.stale), retainedLastKnownGood: values.some((value) => value.retainedLastKnownGood), sourceSummary: { providers, fallbackUsed: values.some((value) => value.fallbackUsed), sourceFingerprints: [...new Set(values.map((value) => value.sourceFingerprint))] } };
  }));
}
