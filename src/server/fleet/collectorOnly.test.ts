import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {collectorOnlyEnabled, collectorOnlyGate, collectorLegacyBindAddress} from './collectorOnly';

assert.equal(collectorOnlyEnabled('true'), true);
assert.equal(collectorOnlyEnabled('false'), false);
assert.throws(() => collectorOnlyEnabled('yes'));
assert.equal(collectorLegacyBindAddress(true), '127.0.0.1');
assert.equal(collectorLegacyBindAddress(false), '0.0.0.0');
for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']) {
  let status=0, next=false, body:unknown;
  const response={set(){return this;},status(code:number){status=code;return this;},json(value:unknown){body=value;return this;}};
  collectorOnlyGate(true)({method} as never,response as never,()=>{next=true;});
  assert.equal(status,403);assert.equal(next,false);assert.ok(body);
  collectorOnlyGate(false)({method} as never,response as never,()=>{next=true;});assert.equal(next,true);
}
// All legacy routes, including GET aliases, must be behind the collector gate.
const server=readFileSync('server.ts','utf8');
assert.ok(server.indexOf('entry.use(collectorOnlyGate')<server.indexOf("const accessPilot ="));
assert.ok(server.indexOf('entry.use(app)')>server.indexOf('entry.use(collectorOnlyGate'));
assert.ok(server.includes('entry.listen(PORT, collectorLegacyBindAddress(collectorOnly)'));
console.log('PASS dedicated collector disables every legacy route and binds it only to loopback');
