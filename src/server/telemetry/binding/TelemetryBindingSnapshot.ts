import { createHash } from 'node:crypto';
import { immutableValue } from '../../../core/objectGraph';

export const BINDING_SCHEMA_VERSION = '1.0.0';
export const TELEMETRY_SNAPSHOT_VERSION = '1.0.0';

export function stableBindingJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableBindingJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stableBindingJson(child)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

export function bindingFingerprint(value: unknown): string { return createHash('sha256').update(stableBindingJson(value)).digest('hex'); }
export function deterministicBindingId(domain: string, objectId: string): string { return `binding:${BINDING_SCHEMA_VERSION}:${domain}:${objectId}`; }
export function immutableBindingValue<T>(value: T): T { return immutableValue(structuredClone(value)); }

const OMIT_KEYS = new Set(['raw', 'rawResponse', 'rawPayload', 'sourcePayload', 'voltageMap', 'temperatureMap', 'timestampMap', 'balancingMap']);
const VOLATILE_FINGERPRINT_KEYS = new Set(['publishedAt', 'generatedAt', 'publicationTimestamp']);
export function compactTelemetryValue(value: unknown): any {
  if (Array.isArray(value)) return value.map(compactTelemetryValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !OMIT_KEYS.has(key)).map(([key, child]) => [key, compactTelemetryValue(child)]));
}
export function telemetryFingerprintValue(value: unknown): any {
  if (Array.isArray(value)) return value.map(telemetryFingerprintValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(compactTelemetryValue(value) as Record<string, unknown>).filter(([key]) => !VOLATILE_FINGERPRINT_KEYS.has(key)).map(([key, child]) => [key, telemetryFingerprintValue(child)]));
}
