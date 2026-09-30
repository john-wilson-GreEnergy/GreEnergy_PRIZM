import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { EncodedJsonCache } from './EncodedJsonCache';
import { EntityDomainBroker } from '../domainBrokers/EntityDomainBroker';
import { fastStringsTransportEnabled, sendFastStringsResponse } from './fastStringsTransport';
import express from 'express';

const cache = new EncodedJsonCache();
const source = { cycleId: 1, capturedAt: 'original', strings: [{ raw: { value: 0 }, sourceDebug: { stale: true }, balanceDetails: [{ cellMv: null }], label: '温度' }] };
const before = structuredClone(source);
let builds = 0;
const build = () => { builds++; return source; };
const a = cache.read(source, 1, build), b = cache.read(source, 1, build);
assert.equal(a, b, 'Concurrent identical readers share encoding');
const encoded = await a;
assert.equal(builds, 1);
assert.equal(gunzipSync(encoded.gzip).toString(), JSON.stringify(source));
assert.equal(encoded.bytes, Buffer.byteLength(JSON.stringify(source)));
assert.deepEqual(source, before);
assert.equal(await cache.read(source, 1, build), encoded);
await cache.read(source, 2, build);
assert.equal(builds, 2, 'Post-command broker version invalidates within cycle');
await cache.read({ ...source }, 2, build);
assert.equal(builds, 3, 'Second fast publication invalidates even with same cycle and broker version');

const deferred: Array<(v: Buffer) => void> = [];
const racing = new EncodedJsonCache(() => new Promise(resolve => deferred.push(resolve)));
const old = racing.read(source, 1, build);
const newest = racing.read(source, 2, build);
deferred[1](Buffer.from('new')); await newest;
deferred[0](Buffer.from('old')); await old;
assert.equal(racing.read(source, 2, build), newest, 'Older completion cannot replace latest');
let attempt = 0;
const retry = new EncodedJsonCache(async () => { if (++attempt === 1) throw new Error('compression failed'); return Buffer.from('ok'); });
await assert.rejects(retry.read(source, 1, build), /compression failed/);
await retry.read(source, 1, build); assert.equal(attempt, 2);
assert.throws(() => cache.read({}, 3, () => undefined), /undefined/);
const broker = new EntityDomainBroker<{ id: string; value: number }>('test', row => row.id);
assert.equal(broker.getVersion(), 0);
broker.publish([{id: '1', value: 0}], '2026-09-25T00:00:00Z');
assert.equal(broker.getVersion(), 1);
broker.publish([{id: '1', value: 0}], '2026-09-25T00:00:01Z');
assert.equal(broker.getVersion(), 1);
broker.patch('1', {value: 1}, '2026-09-25T00:00:02Z'); assert.equal(broker.getVersion(), 2);

// Use Express's real negotiation, but no listener or network in tests.
for (const [accept, expected] of [['gzip', 'gzip'], ['gzip;q=0, identity', 'identity'], ['identity', 'identity'], ['', 'identity'], ['gzip;q=0,identity;q=0', 'none']]) {
  const req = Object.assign(Object.create(express.request), {headers: {'accept-encoding': accept}});
  const headers = new Map<string, string>(); let status = 200; let body: unknown;
  const res = {setHeader(k: string, v: string) { headers.set(k.toLowerCase(), v); }, status(n: number) {status = n; return this;}, end(data?: unknown) {body = data; return this;}};
  sendFastStringsResponse(req, res as unknown as express.Response, encoded);
  assert.equal(headers.get('cache-control'), 'no-store');
  assert.equal(headers.get('vary'), 'Accept-Encoding');
  if (expected === 'none') assert.equal(status, 406);
  else if (expected === 'gzip') {assert.equal(headers.get('content-encoding'), 'gzip'); assert.deepEqual(body, encoded.gzip);}
  else {assert.equal(headers.get('content-encoding'), undefined); assert.equal(body, encoded.json);}
}
const flag = process.env.PRIZM_FAST_STRINGS_TRANSPORT;
try {delete process.env.PRIZM_FAST_STRINGS_TRANSPORT; assert(fastStringsTransportEnabled()); process.env.PRIZM_FAST_STRINGS_TRANSPORT='false'; assert(!fastStringsTransportEnabled());} finally {if(flag===undefined) delete process.env.PRIZM_FAST_STRINGS_TRANSPORT; else process.env.PRIZM_FAST_STRINGS_TRANSPORT=flag;}

// Optional captured cached response for full fleet byte parity and timings.
if (process.argv[2]) {
  const live = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const replay = new EncodedJsonCache();
  const t = performance.now(); const first = await replay.read(live, 0, () => structuredClone(live));
  const initialMs = performance.now()-t;
  assert.deepEqual(JSON.parse(gunzipSync(first.gzip).toString()), live);
  const timings = [];
  for(let i=0;i<5;i++){const start=performance.now();await replay.read(live,0,()=>{throw Error('Must reuse');});timings.push(performance.now()-start);}
  console.log(JSON.stringify({rows:live.strings.length,bytes:first.bytes,gzipBytes:first.gzip.length,initialMs,reuseMs:timings}));
}
console.log('Fast string encoding: lossless parity, coalescing, revisions, races, errors, negotiation and rollback passed');
