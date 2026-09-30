// Unit-test preload only. Never load this in the production runtime.
// Tests must supply explicit mocks; an attempted real connection fails the run
// even when application code catches the resulting error.
const {syncBuiltinESMExports} = require('node:module');
let attempts = 0;
const blocked = (api) => function () {
  attempts++;
  const error = new Error(`[test-network-guard] Unmocked ${api} blocked; no request sent`);
  console.error(error.stack);
  throw error;
};
globalThis.fetch = blocked('fetch');
for (const moduleName of ['node:http', 'node:https']) {
  const api = require(moduleName);
  api.request = blocked(`${moduleName}.request`);
  api.get = blocked(`${moduleName}.get`);
}
const Socket = require('node:net').Socket;
const connect = Socket.prototype.connect;
Socket.prototype.connect = function (...args) {
  // tsx uses a local Unix-domain socket for compiler IPC, not a network port.
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const socketPath = typeof first === 'string' ? first : first?.path;
  if (typeof socketPath === 'string' && socketPath.startsWith('/') && !first?.port) {
    return connect.apply(this, args);
  }
  return blocked('TCP connect')();
};
require('node:tls').connect = blocked('TLS connect');
require('node:http2').connect = blocked('HTTP/2 connect');
require('node:dgram').Socket.prototype.send = blocked('UDP send');
syncBuiltinESMExports();
process.on('exit', () => {
  if (attempts) {
    console.error(`[test-network-guard] FAILED: ${attempts} unmocked network attempt(s)`);
    process.exitCode = 1;
  }
});
