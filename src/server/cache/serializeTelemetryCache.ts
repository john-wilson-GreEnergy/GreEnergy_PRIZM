/** Machine cache format is unchanged; whitespace is not telemetry or provenance. */
export function serializeTelemetryCache(value: object, mode = process.env.PRIZM_COMPACT_TELEMETRY_CACHE): string {
  return JSON.stringify(value, null, mode === 'false' ? 2 : undefined);
}
