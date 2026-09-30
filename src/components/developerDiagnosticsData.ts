export const DIAGNOSTIC_ENDPOINTS = {
  status: '/api/local/status',
  boot: '/api/local/system/boot-status',
  sources: '/api/local/debug/sources',
  topology: '/api/local/snapshot/topology',
} as const;
export type DiagnosticKey = keyof typeof DIAGNOSTIC_ENDPOINTS;
export type DiagnosticResult =
  | { state: 'available'; data: unknown; responseMs: number; bytes: number; retrievedAt: string }
  | { state: 'unavailable'; error: string };
export type DiagnosticResults = Record<DiagnosticKey, DiagnosticResult>;
export function diagnosticObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function diagnosticText(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : 'Unavailable';
}
export function diagnosticBoolean(value: unknown, yes: string, no: string): string {
  return value === true ? yes : value === false ? no : 'Unavailable';
}
export function isLegacyDiagnostics(search: string): boolean {
  return new URLSearchParams(search).get('diagnostics') === 'legacy';
}

export async function loadDiagnostic(
  key: DiagnosticKey, signal: AbortSignal, fetcher: typeof fetch = fetch,
  now: () => number = () => performance.now(), timeoutMs = 15_000,
): Promise<DiagnosticResult> {
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
  try {
    const started = now();
    const response = await fetcher(DIAGNOSTIC_ENDPOINTS[key], {
      method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: bounded,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Expected JSON; sign-in or route may be unavailable');
    const text = await response.text();
    const responseMs = Math.max(0, now() - started);
    bounded.throwIfAborted();
    const data: unknown = JSON.parse(text);
    if (key === 'sources' ? !Array.isArray(data) : data === null || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Unexpected diagnostics response format');
    }
    return { state: 'available', data, responseMs, bytes: new TextEncoder().encode(text).byteLength, retrievedAt: new Date().toISOString() };
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    return { state: 'unavailable', error: bounded.aborted ? 'Request timed out' : error instanceof Error ? error.message : 'Request failed' };
  }
}
export async function loadDiagnostics(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<DiagnosticResults> {
  const entries = await Promise.all((Object.keys(DIAGNOSTIC_ENDPOINTS) as DiagnosticKey[]).map(async key => [key, await loadDiagnostic(key, signal, fetcher)] as const));
  signal.throwIfAborted();
  return Object.fromEntries(entries) as DiagnosticResults;
}
