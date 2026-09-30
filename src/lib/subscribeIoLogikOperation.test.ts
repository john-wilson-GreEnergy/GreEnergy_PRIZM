import assert from 'node:assert/strict';
import { test } from 'node:test';
import { subscribeIoLogikOperation } from './subscribeIoLogikOperation';
test('shares one request loop and publishes only changed reports', async () => {
  const originalFetch = globalThis.fetch, originalSetTimeout = globalThis.setTimeout, originalClearTimeout = globalThis.clearTimeout;
  const callbacks: (() => void)[] = []; let calls = 0, published = 0;
  let snapshot = { operation: { id: 'previous-update', state: 'complete', results: [{ ip: '10.0.3.16', after: { do00Safe: '2' } }] }, activeTargets: [] as string[], scan: null as null | {state:string;completed:number}, inventory: [] as {ip:string;do00Safe:string}[] };
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify(snapshot)); };
  globalThis.setTimeout = ((callback: () => void) => { callbacks.push(callback); return callbacks.length; }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = (() => { }) as typeof clearTimeout;
  const flush = async () => { for (let i = 0;i < 20;i++)await Promise.resolve(); };
  try {
    const first = subscribeIoLogikOperation(() => published++), second = subscribeIoLogikOperation(() => published++);
    await flush(); assert.equal(calls, 1); assert.equal(published, 2); assert.equal(callbacks.length, 1);
    callbacks.shift()!(); await flush(); assert.equal(calls, 2); assert.equal(published, 2);
    snapshot = { ...snapshot, activeTargets: ['10.0.3.16'] };
    callbacks.shift()!(); await flush();
    assert.equal(published, 2, 'starting a scan must not replay the old operation');
    snapshot = { ...snapshot, activeTargets: [] };
    callbacks.shift()!(); await flush();
    assert.equal(published, 2, 'finishing a scan must not overwrite its fresh readback');
    snapshot = { ...snapshot, operation: { ...snapshot.operation, results: [{ ip: '10.0.3.16', after: { do00Safe: '0' } }] } };
    callbacks.shift()!(); await flush();
    assert.equal(published, 4, 'both subscribers receive genuinely changed operation results');
    snapshot={...snapshot,scan:{state:'running',completed:1},inventory:[{ip:'10.0.3.16',do00Safe:'0'}]};
    callbacks.shift()!();await flush();assert.equal(published,6,'partial scan inventory reaches both subscribers');
    callbacks.shift()!();await flush();assert.equal(published,6,'unchanged progress is not republished');
    snapshot={...snapshot,scan:{state:'complete',completed:1}};
    callbacks.shift()!();await flush();assert.equal(published,8,'completion is published even if rows have not changed');
    first(); second();
  } finally { globalThis.fetch = originalFetch; globalThis.setTimeout = originalSetTimeout; globalThis.clearTimeout = originalClearTimeout; }
});
