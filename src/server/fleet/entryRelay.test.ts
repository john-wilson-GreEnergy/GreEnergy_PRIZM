import assert from 'node:assert/strict';
import {parseFleetEntryConfig} from './entryRelay';

const good = {bindAddress: '10.0.0.15', upstreamAddress: '172.31.250.1'};
for(const port of [3444,3445]){
  assert.throws(()=>parseFleetEntryConfig({...good,port,upstreamPort:port}));
  assert.equal(parseFleetEntryConfig({...good,port,upstreamPort:port,workspaceEntry:true}).port,port);
}
assert.throws(()=>parseFleetEntryConfig({...good,port:3444,upstreamPort:3445,workspaceEntry:true}));
assert.throws(()=>parseFleetEntryConfig({...good,port:3000,upstreamPort:3000,workspaceEntry:true}));
assert.deepEqual(parseFleetEntryConfig(good), {...good, port: 3443, upstreamPort: 3443, maxConnections: 64, connectTimeoutMs: 3000, idleTimeoutMs: 30000});
for (const address of ['0.0.0.0', '::', '8.8.8.8', 'localhost', '10.0.0.3/16', '172.32.0.1', '127.0.0.1']) {
  assert.throws(() => parseFleetEntryConfig({...good, bindAddress: address}));
  assert.throws(() => parseFleetEntryConfig({...good, upstreamAddress: address}));
}
for (const port of [0, 22, 502, 3000, 8080, 65536, '3443']) assert.throws(() => parseFleetEntryConfig({...good, upstreamPort: port}));
for (const value of [0, 257, 1.5, '64', null]) assert.throws(() => parseFleetEntryConfig({...good, maxConnections: value}));
for (const value of [0, 10001, '3000']) assert.throws(() => parseFleetEntryConfig({...good, connectTimeoutMs: value}));
for (const value of [0, 120001, '30000']) assert.throws(() => parseFleetEntryConfig({...good, idleTimeoutMs: value}));
assert.throws(() => parseFleetEntryConfig({...good, upstreamAddress: good.bindAddress}));
assert.throws(() => parseFleetEntryConfig({...good, destinationUrl: 'http://10.0.0.3'}));
assert.throws(() => parseFleetEntryConfig({...good, allowLoopbackTest: true}));
assert.throws(() => parseFleetEntryConfig({...good, allowLoopbackTest: 'true'}));
assert.throws(() => parseFleetEntryConfig({bindAddress: '127.0.0.1', upstreamAddress: '10.0.0.3', allowLoopbackTest: true}));
assert.equal(parseFleetEntryConfig({bindAddress: '127.0.0.1', upstreamAddress: '127.0.0.1', port: 13443, upstreamPort: 13444, allowLoopbackTest: true}).port, 13443);
console.log('Fleet entry config: fixed private endpoints, bounds, no wildcard/DNS, no equipment ports, isolated test mode passed');
