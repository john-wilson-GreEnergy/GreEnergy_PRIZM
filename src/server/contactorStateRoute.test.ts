import assert from "node:assert/strict";
import express from "express";
import router from "./stringsDashboard";
import { stringDomainBroker } from "./domainBrokers/stringDomainBroker";
import { getContactorStateView } from "./domainBrokers/contactorStateView";

const app = express();
app.use("/strings", router);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>(resolve => server.once("listening", resolve));
const address = server.address();
assert.ok(address && typeof address !== "string");
const originalFetch = globalThis.fetch;
let deviceReads = 0;
globalThis.fetch = ((url, options) => {
  if (!String(url).startsWith(`http://127.0.0.1:${address.port}/strings/`)) { deviceReads++; throw new Error("Device acquisition is forbidden in this route test"); }
  return originalFetch(url, options);
}) as typeof fetch;
try {
  for (const query of ["", "?refresh=true&concurrency=99999&timeoutMs=1"]) {
    const response = await fetch(`http://127.0.0.1:${address.port}/strings/contactors/state${query}`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.refreshPolicy, "background-only");
    assert.equal(body.stale, true);
    assert.equal(body.summary.fetchedAt, null);
    assert.deepEqual(body.states, []);
  }
  assert.equal(deviceReads, 0);
  const now = Date.now();
  stringDomainBroker.publish([{arrayNumber:2,stringNumber:3,communicating:true,timestampUtc:new Date(now).toISOString(),positiveContactorClosed:false,negativeContactorClosed:false,contactorsCloseExpected:true,measuredStringVoltage:1300,dcBusVoltage:1280}]);
  const response = await fetch(`http://127.0.0.1:${address.port}/strings/contactors/state`);
  const body = await response.json();
  assert.equal(body.states.length,1);
  assert.equal(body.states[0].stringKey,"A2-S3");
  assert.equal(body.states[0].source,"canonical-string-broker");
  assert.equal(body.stale,false);
  assert.equal(body.states[0].stringToBusDeltaVoltage,20);
  assert.equal(getContactorStateView(now+31_000).stale,true,"publication cannot refresh an old row");
  assert.equal(deviceReads,0);
} finally { globalThis.fetch = originalFetch; await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
console.log("Contactor route: cached response, warming freshness and no device reads passed");
