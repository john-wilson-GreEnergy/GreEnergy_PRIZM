export const RAW_TELEMETRY_SOURCES = [
  { id: 'ems-snapshot', label: 'EMS snapshot', url: '/api/local/snapshot', detail: 'Complete published site snapshot. This can be a large download.' },
  { id: 'strings', label: 'String dashboard', url: '/api/local/strings/dashboard?cache=cache-only', detail: 'String telemetry and balancing details from the existing cached view.' },
  { id: 'feather', label: 'Feather cache', url: '/api/local/feather/devices', detail: 'Published Feather device telemetry and diagnostics.' },
  { id: 'site-operations', label: 'Site operations summary', url: '/api/local/site-operations/summary?cache=cache-only', detail: 'Complete summary, including detailed HVAC and sensor data.' },
] as const;
export type RawTelemetrySource = typeof RAW_TELEMETRY_SOURCES[number];
export function isLegacyRawDebug(search: string): boolean {
  return new URLSearchParams(search).get('rawDebug') === 'legacy';
}
export const RAW_PREVIEW_LIMIT = 12_000;
export type RawTelemetryPayload = { blob: Blob; preview: string; truncated: boolean; receivedAt: string };

export function buildRawTelemetryPayload(text: string): RawTelemetryPayload {
  // Do not parse/pretty-print multi-megabyte payloads just to render a preview.
  let display = text;
  if (text.length <= RAW_PREVIEW_LIMIT) {
    try { display = JSON.stringify(JSON.parse(text), null, 2); } catch { /* Preserve original text. */ }
  }
  return {
    blob: new Blob([text], { type: 'application/json' }),
    preview: display.slice(0, RAW_PREVIEW_LIMIT),
    truncated: display.length > RAW_PREVIEW_LIMIT,
    receivedAt: new Date().toISOString(),
  };
}

export async function loadRawTelemetryPayload(source: RawTelemetrySource, signal: AbortSignal, fetcher: typeof fetch = fetch) {
  const response = await fetcher(source.url, { method: 'GET', signal, credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error(`Payload unavailable (HTTP ${response.status}). Try again after checking connection and access.`);
  if (!(response.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
    throw new Error('Expected a JSON response. Check sign-in and server availability.');
  }
  const text = await response.text();
  signal.throwIfAborted();
  return buildRawTelemetryPayload(text);
}
