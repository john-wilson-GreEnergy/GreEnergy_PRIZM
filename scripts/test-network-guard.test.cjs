const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const guard = path.join(__dirname, 'test-network-guard.cjs');
const cases = [
  "fetch('http://192.0.2.1/')",
  "require('node:http').get('http://192.0.2.1/')",
  "require('node:https').request('https://192.0.2.1/')",
  "new (require('node:net').Socket)().connect(502, '192.0.2.1')",
  "require('node:tls').connect(443, '192.0.2.1')",
  "require('node:http2').connect('https://192.0.2.1/')",
  "require('node:dgram').createSocket('udp4').send('test', 502, '192.0.2.1')",
];
for (const operation of cases) {
  const result = spawnSync(process.execPath, ['--require', guard, '-e', `try { ${operation}; process.exit(9); } catch (error) { if (!error.message.includes('no request sent')) process.exit(8); }`], {timeout:3000,encoding:'utf8'});
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /1 unmocked network attempt/);
}
const mocked = spawnSync(process.execPath, ['--require', guard, '-e', "globalThis.fetch = async () => new Response('fixture'); fetch('http://192.0.2.1/').then(r => r.text()).then(text => { if (text !== 'fixture') process.exit(2); });"], {timeout:3000,encoding:'utf8'});
assert.equal(mocked.status, 0, mocked.stderr);
console.log('Network guard: fetch, HTTP(S), TCP, TLS, HTTP/2 and UDP blocked; explicit mock allowed');
