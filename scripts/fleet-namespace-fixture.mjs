// Synthetic protocol fixture only. Never used as a production collector.
import {createServer} from 'node:http';

const [role, siteId] = process.argv.slice(2);
if (!['ems', 'collector'].includes(role) || !['LAB-SS3', 'LAB-SS4'].includes(siteId)) {
  throw new Error('Explicit lab role and synthetic site identity required');
}
let snapshot = null;
let pending = false;
async function prepare() {
  if (pending) return;
  pending = true;
  try {
    const response = await fetch('http://10.0.0.3:8080/identity', {signal: AbortSignal.timeout(1500)});
    if (!response.ok) throw new Error('Fixture source unavailable');
    const source = await response.json();
    snapshot = source.siteId === siteId ? {siteId, observedSite: source.siteId, simulated: true} : null;
  } catch { snapshot = null; }
  finally { pending = false; }
}
const server = createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json');
  if (request.method !== 'GET') { response.writeHead(403); return response.end('{}'); }
  const endpoint = role === 'ems' ? '/identity' : '/api/fleet/site-summary';
  if (request.url !== endpoint) { response.writeHead(404); return response.end('{}'); }
  const body = role === 'ems' ? {siteId, simulated: true} : snapshot;
  response.writeHead(body ? 200 : 503);
  response.end(JSON.stringify(body ?? {unavailable: true}));
});
server.requestTimeout = 3000;
server.headersTimeout = 3000;
const timer = role === 'collector' ? setInterval(() => void prepare(), 1000) : null;
if (role === 'collector') void prepare();
server.listen(role === 'ems' ? 8080 : 3000, '0.0.0.0');
function stop() { if (timer) clearInterval(timer); server.closeAllConnections(); server.close(); }
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
