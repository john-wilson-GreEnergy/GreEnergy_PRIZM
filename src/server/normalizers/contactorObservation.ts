export interface CanonicalContactorObservation {
  arrayNumber: number;
  stringNumber: number;
  source: 'last-call-explicit-polarity';
  observedAt: string;
  positiveContactorClosed: boolean;
  negativeContactorClosed: boolean;
  requestedState: 'open' | 'closed' | 'unknown';
}

export const telemetryObject = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

/** Atomic evidence from one identified string report; no acquisition-time fallback. */
export function normalizeContactorObservation(value: unknown, array: number, string: number): CanonicalContactorObservation | null {
  const entry = telemetryObject(value), data = telemetryObject(entry?.stringData) ?? entry;
  if (!entry || !data || !Number.isSafeInteger(array) || array < 1 || !Number.isSafeInteger(string) || string < 1 ||
      entry.arrayIndex !== array || entry.stringIndex !== string ||
      typeof data.positiveContactorClosed !== 'boolean' || typeof data.negativeContactorClosed !== 'boolean') return null;
  const rawStamp = entry.timeStamp;
  const observedAt = typeof rawStamp === 'number' ? rawStamp
    : typeof rawStamp === 'string' && /^\d+$/.test(rawStamp) ? Number(rawStamp) : NaN;
  if (!Number.isSafeInteger(observedAt) || observedAt <= 0 || observedAt > 8640000000000000) return null;
  return {
    arrayNumber: array, stringNumber: string, source: 'last-call-explicit-polarity',
    observedAt: new Date(observedAt).toISOString(),
    positiveContactorClosed: data.positiveContactorClosed, negativeContactorClosed: data.negativeContactorClosed,
    requestedState: typeof data.contactorsCloseExpected !== 'boolean' ? 'unknown' : data.contactorsCloseExpected ? 'closed' : 'open',
  };
}
