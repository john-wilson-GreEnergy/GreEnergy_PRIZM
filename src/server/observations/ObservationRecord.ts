import { createHash } from 'node:crypto';
import { immutableBindingValue, stableBindingJson } from '../telemetry/binding';
import type { ObservationQuality, ObservationRecord, ObservationValueType } from './ObservationTypes';
import type { TelemetryObservationBinding } from '../telemetry/binding';

export const OBSERVATION_SCHEMA_VERSION = '1.0.0';
export const observationFingerprint = (value: unknown): string => createHash('sha256').update(stableBindingJson(value)).digest('hex');
export const deterministicObservationId = (objectId: string, domain: string, metric: string, producingCycleId: number | null, sourceFingerprint: string): string => `observation:${observationFingerprint({ objectId, domain, metric, producingCycleId, sourceFingerprint }).slice(0, 32)}`;
export const observationValueType = (value: unknown): ObservationValueType => value === undefined ? 'undefined' : value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : typeof value === 'string' ? 'string' : 'object';
export function observationQuality(binding: TelemetryObservationBinding, value: unknown, present: boolean): { quality: ObservationQuality; confidence: number } {
  if (!present || value === undefined) return { quality: 'MISSING', confidence: 0 };
  if ((typeof value === 'number' && !Number.isFinite(value)) || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') return { quality: 'INVALID', confidence: 0 };
  if (binding.retainedLastKnownGood) return { quality: 'RETAINED', confidence: Math.min(binding.confidence, 0.6) };
  if (binding.stale) return { quality: 'STALE', confidence: Math.min(binding.confidence, 0.5) };
  if (binding.fallbackUsed || binding.confidence < 1 || binding.health.healthy === false) return { quality: 'DEGRADED', confidence: Math.min(binding.confidence, 0.75) };
  return { quality: 'GOOD', confidence: 1 };
}
export function immutableObservation(value: ObservationRecord): ObservationRecord { return immutableBindingValue(value); }
