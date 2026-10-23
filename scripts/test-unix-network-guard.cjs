// Offline integration tests only. Permit HTTP over a private fixture socket;
// block TCP/TLS/UDP, fetch and sockets outside the runner's temporary directory.
const fs = require('node:fs');
const path = require('node:path');
const {syncBuiltinESMExports} = require('node:module');
const http = require('node:http');
const originalRequest = http.request;
const net = require('node:net');
const originalConnect = net.Socket.prototype.connect;
const root = process.env.PRIZM_TEST_SOCKET_ROOT;
if (!root || !path.isAbsolute(root) || fs.realpathSync(root) !== root ||
    !path.basename(root).startsWith('prizm-offline-integration-')) throw Error('Private fixture directory required');
const stat = fs.statSync(root);
if (!stat.isDirectory() || (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) throw Error('Private fixture directory permissions required');
require('./test-network-guard.cjs');
let denied = 0;
const deny = () => { denied++; throw Error('Offline integration guard: only the private fixture Unix socket is permitted'); };
function permitted(socket) {
  return typeof socket === 'string' && path.isAbsolute(socket) &&
    path.relative(root,socket) !== '' && !path.relative(root,socket).startsWith('..') &&
    fs.realpathSync(path.dirname(socket)).startsWith(root + path.sep);
}
http.request = function(options,...rest) {
  if (!options || typeof options !== 'object' || !permitted(options.socketPath) || options.port || options.agent || options.createConnection) return deny();
  return originalRequest.call(this,options,...rest);
};
net.Socket.prototype.connect = function(...args) {
  const normalized=Array.isArray(args[0])?args[0]:args;
  const first=normalized[0];
  const socket=typeof first==='string'?first:first?.path;
  if (!permitted(socket)) return deny();
  // http.Agent adds a default port even for socketPath. Discard every option
  // except the verified Unix path so there is no possible TCP fallback.
  return originalConnect.call(this,{path:socket},...normalized.slice(1));
};
const listen=net.Server.prototype.listen;
net.Server.prototype.listen=function(...args){
  const first=args[0],socket=typeof first==='string'?first:first?.path;
  if (!permitted(socket) || first?.port) return deny();
  return listen.apply(this,args);
};
syncBuiltinESMExports();
process.on('exit',()=>{if(denied)process.exitCode=1;});
