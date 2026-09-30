import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import RawTelemetryInspector from './RawTelemetryInspector';
import { RAW_TELEMETRY_SOURCES, RAW_PREVIEW_LIMIT, buildRawTelemetryPayload, loadRawTelemetryPayload, isLegacyRawDebug } from './rawTelemetryPayload';

let requests = 0;
assert.equal(isLegacyRawDebug(''), false);
assert.equal(isLegacyRawDebug('?tab=safety-advanced&rawDebug=legacy'), true);
assert.equal(isLegacyRawDebug('?rawDebug=compact'), false);
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { requests++; throw new Error('No eager fetch permitted'); };
try {
  const html = renderToStaticMarkup(<RawTelemetryInspector />);
  assert.equal(requests, 0);
  assert.match(html, /No payload loaded/);
  for (const source of RAW_TELEMETRY_SOURCES) assert(html.includes(`Load ${source.label}`));
  assert(!html.includes('<pre'), 'No large preformatted DOM until requested');
  assert(!html.includes('Download complete JSON'), 'No misleading download before success');
} finally { globalThis.fetch = originalFetch; }

for (const text of ['{"value":0,"unknown":null,"sourceTimestamp":"2026-09-25T14:00:00Z","label":"温度 °F"}', JSON.stringify({ raw: 'x'.repeat(100_000), lastField: 'must survive export' })]) {
  const result = buildRawTelemetryPayload(text);
  assert.equal(await result.blob.text(), text, 'Download must preserve full response, not only preview');
  assert.equal(result.blob.size, Buffer.byteLength(text));
  assert(result.preview.length <= RAW_PREVIEW_LIMIT);
  assert.equal(result.truncated, text.length > RAW_PREVIEW_LIMIT);
  if (!result.truncated) assert.deepEqual(JSON.parse(result.preview), JSON.parse(text));
}
const responseText = '{"cycleId":7,"stale":true,"value":null}';
for (const source of RAW_TELEMETRY_SOURCES) {
  const abort = new AbortController();
  let calls = 0;
  const fakeFetch: typeof fetch = async (url, options) => {
    calls++;
    assert.equal(url, source.url);
    assert.equal(options?.method, 'GET');
    assert.equal(options?.signal, abort.signal);
    assert.equal(options?.credentials, 'same-origin');
    assert(!source.url.includes('refresh='));
    return new Response(responseText, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  };
  const payload = await loadRawTelemetryPayload(source, abort.signal, fakeFetch);
  assert.equal(calls, 1, 'One request for the chosen source only');
  assert.equal(await payload.blob.text(), responseText);
}
const source = RAW_TELEMETRY_SOURCES[3];
await assert.rejects(loadRawTelemetryPayload(source, new AbortController().signal, async () => new Response('{}', { status: 503 })), /HTTP 503/);
await assert.rejects(loadRawTelemetryPayload(source, new AbortController().signal, async () => new Response('<html>Sign in</html>', { headers: { 'Content-Type': 'text/html' } })), /Expected a JSON/);
const obsolete = new AbortController();
await assert.rejects(loadRawTelemetryPayload(source, obsolete.signal, async () => {
  obsolete.abort();
  return Response.json({ staleRequest: true });
}), { name: 'AbortError' });
console.log('Raw inspector: idle UI, bounded preview, lossless Unicode/full download, one cached GET per choice, HTTP/content errors and cancellation passed.');
