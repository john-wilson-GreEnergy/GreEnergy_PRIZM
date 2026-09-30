import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import DeveloperDiagnostics, { DeveloperDiagnosticsView } from './DeveloperDiagnostics';
import { DIAGNOSTIC_ENDPOINTS, loadDiagnostic, loadDiagnostics, isLegacyDiagnostics, type DiagnosticResults } from './developerDiagnosticsData';

const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
const ok = (data: unknown) => ({ state: 'available' as const, data, responseMs: 0, bytes: 0, retrievedAt: 'retrieval-time' });
const missing = { state: 'unavailable' as const, error: 'HTTP 503' };
let html = renderToStaticMarkup(<DeveloperDiagnosticsView results={{ status: missing, boot: missing, sources: missing, topology: missing }} />);
assert.match(html, /Unavailable/);
for (const fabricated of ['HEALTHY', 'OPERATIONAL', 'CACHE STABLE', 'LIVE DIRECT FEED', '4 ms', '245', 'BHE0020', 'SUCCESS']) assert(!html.includes(fabricated), fabricated);
const results: DiagnosticResults = {
  status: ok({ source: 'cached', staleData: true, lastUpdated: 'source-time', blockIndex: 0, activeProfileName: 'Actual profile' }),
  boot: ok({ phase: 'degraded', ready: false, preloadStatus: { modbusProfile: false, topology: true, unknown: null }, warnings: ['Real warning'], errors: ['Real error'] }),
  sources: ok([{ endpoint: '/actual-source', success: false, stale: true, lastDurationMs: 0, lastSuccessAt: 'original-success-time', fallbackUsed: true, lastError: 'timeout' }]),
  topology: ok({ data: [], source: 'disk', staleData: true, lastUpdated: 'topology-time' }),
};
html = renderToStaticMarkup(<DeveloperDiagnosticsView results={results} />);
for (const expected of ['0.0 ms', '0 bytes', 'Stale', 'source-time', 'degraded', 'Not ready', 'Not reported loaded', 'Reported loaded', 'Real warning', 'Real error', 'Failed', '0 ms', 'original-success-time', 'topology-time']) assert(html.includes(expected), expected);
assert(!html.includes('BHE0020'));
html = renderToStaticMarkup(<DeveloperDiagnosticsView results={{ status: ok({}), boot: ok({}), sources: ok([]), topology: ok({}) }} />);
assert(html.includes('Preload status unavailable'));
assert(html.includes('No source metrics reported'));
assert(!html.includes('None reported'));
assert.equal(isLegacyDiagnostics(''), false);
assert.equal(isLegacyDiagnostics('?diagnostics=legacy'), true);

let ticks = 0;
const result = await loadDiagnostic('status', new AbortController().signal, async () => json({ value: '温度', zero: 0, unknown: null }), () => ticks++ * 25);
assert.equal(result.state, 'available');
if (result.state === 'available') {
  assert.equal(result.responseMs, 25);
  assert.equal(result.bytes, Buffer.byteLength(JSON.stringify({ value: '温度', zero: 0, unknown: null })));
}
for (const response of [new Response('{}', { status: 503 }), new Response('login', { headers: { 'content-type': 'text/html' } }), new Response('{bad', { headers: { 'content-type': 'application/json' } }), json([]), json(null)]) {
  assert.equal((await loadDiagnostic('status', new AbortController().signal, async () => response)).state, 'unavailable');
}
assert.equal((await loadDiagnostic('sources', new AbortController().signal, async () => json({ blockviewer: { count: 24 } }))).state, 'unavailable');
const seen: string[] = [];
const batch = await loadDiagnostics(new AbortController().signal, async (url, options) => {
  seen.push(String(url));
  assert.equal(options?.method, 'GET'); assert.equal(options?.cache, 'no-store'); assert.equal(options?.credentials, 'same-origin'); assert(options?.signal);
  return String(url).endsWith('/status') ? new Response('{}', { status: 401 }) : json(String(url).endsWith('/sources') ? [] : {});
});
assert.deepEqual(seen.sort(), Object.values(DIAGNOSTIC_ENDPOINTS).sort());
assert.equal(batch.status.state, 'unavailable'); assert.equal(batch.boot.state, 'available');
const cancelled = new AbortController();
await assert.rejects(loadDiagnostic('boot', cancelled.signal, async () => { cancelled.abort(); return json({}); }));
const timedOut = await loadDiagnostic('status', new AbortController().signal, async () => { await new Promise(resolve => setTimeout(resolve, 20)); return json({}); }, undefined, 1);
assert.deepEqual(timedOut, { state: 'unavailable', error: 'Request timed out' });
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('No render-time request'); };
try { assert(renderToStaticMarkup(<DeveloperDiagnostics />).includes('Refresh diagnostics')); } finally { globalThis.fetch = originalFetch; }
console.log('Developer diagnostics contract, failure, zero, stale, cancellation, timeout, render and rollback tests passed');
