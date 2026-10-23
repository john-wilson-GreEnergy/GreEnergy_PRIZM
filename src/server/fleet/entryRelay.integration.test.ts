// Explicit loopback-only integration test. Never contacts equipment.
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer as tcpServer, createConnection, type Socket} from 'node:net';
import {createServer, request} from 'node:https';
import {FleetBroker} from './FleetBroker';
import {createFleetApp} from './fleetApp';
import {LocalSessions} from '../security/localSessions';
import {hashLocalPassword, type LocalAccount} from '../security/localAccounts';
import {parseFleetEntryConfig, startFleetEntry} from './entryRelay';

const run = promisify(execFile);
const dir = await mkdtemp(path.join(tmpdir(), 'prizm-entry-test-'));
const keyFile = path.join(dir, 'key.pem'), certFile = path.join(dir, 'cert.pem');
const configFile = path.join(dir, 'cert.conf');
const relays: Awaited<ReturnType<typeof startFleetEntry>>[] = [];
const sockets: Socket[] = [];
async function freePort() {
  const s = tcpServer(); await new Promise<void>((resolve, reject) => { s.once('error', reject); s.listen(0, '127.0.0.1', resolve); });
  const p = (s.address() as {port: number}).port;
  await new Promise<void>(resolve => s.close(() => resolve())); return p;
}
const ports = [await freePort(), await freePort(), await freePort()];
assert.equal(new Set(ports).size, 3);
const origin = `https://localhost:${ports[0]}`;
let backend: ReturnType<typeof createServer> | undefined;
const waitFor = async (condition: () => boolean) => {
  for (let n = 0; n < 100; n++) { if (condition()) return; await new Promise(r => setTimeout(r, 20)); }
  assert.fail('Timed out waiting for connection cleanup');
};
try {
  await writeFile(configFile, '[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=localhost\n[ext]\nsubjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\nextendedKeyUsage=serverAuth\n', {mode: 0o600});
  await run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', keyFile, '-out', certFile, '-config', configFile]);
  const ca = await readFile(certFile);
  const accounts: LocalAccount[] = [{id: 'test', email: 'test@example.invalid', disabled: false, version: 1,
    password: await hashLocalPassword('Offline fixture password only'), grants: []}];
  const app = createFleetApp(new FleetBroker([{siteId: 'lab', blockId: '1', stationCode: 'LAB', blockIndex: 1, name: 'Synthetic fixture'}]), new LocalSessions(async () => accounts), {origin, publicDirectory: dir, audit: async () => {}});
  backend = createServer({key: await readFile(keyFile), cert: ca, minVersion: 'TLSv1.2'}, app);
  await new Promise<void>((resolve, reject) => { backend!.once('error', reject); backend!.listen(ports[2], '127.0.0.1', resolve); });
  for (const port of ports.slice(0, 2)) relays.push(await startFleetEntry(parseFleetEntryConfig({
    bindAddress: '127.0.0.1', upstreamAddress: '127.0.0.1', port, upstreamPort: ports[2], allowLoopbackTest: true,
    idleTimeoutMs: 1000, maxConnections: 2,
  })));
  const get = (index: number, route: string, options: {method?: string; headers?: Record<string, string>; body?: string; trusted?: boolean} = {}) =>
    new Promise<{status: number; body: string; cookies: string[]}>((resolve, reject) => {
      const req = request({hostname: '127.0.0.1', port: ports[index], servername: 'localhost', path: route,
        method: options.method ?? 'GET', ca: options.trusted === false ? undefined : ca,
        headers: {Host: new URL(origin).host, Connection: 'close', ...options.headers}}, res => {
        const chunks: Buffer[] = []; res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({status: res.statusCode!, body: Buffer.concat(chunks).toString(), cookies: res.headers['set-cookie'] ?? []}));
      });
      req.setTimeout(3000, () => req.destroy(new Error('Test request timed out')));
      req.on('error', reject); req.end(options.body);
    });
  for (let index = 0; index < 2; index++) {
    assert.equal((await get(index, '/api/fleet/summary')).status, 401);
    assert.equal((await get(index, '/api/ems/control', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'})).status, 403);
    assert.equal((await get(index, '/api/fleet/summary?target=http://10.0.0.3')).status, 403);
    assert.equal((await get(index, '/api/fleet/summary', {headers: {Host: 'wrong.example'}})).status, 403);
    await assert.rejects(get(index, '/api/fleet/summary', {trusted: false}), /certificate|self.signed/i);
  }
  const login = await get(0, '/api/fleet/login', {method: 'POST', headers: {Origin: origin, 'Content-Type': 'application/json'},
    body: JSON.stringify({email: 'test@example.invalid', password: 'Offline fixture password only'})});
  assert.equal(login.status, 200);
  assert.match(login.cookies[0], /Secure/);
  const cookie = login.cookies[0].split(';')[0];
  assert.equal((await get(1, '/api/fleet/session', {headers: {Cookie: cookie}})).status, 200, 'Both entries reach the same authenticated Fleet service');
  assert.equal((await get(1, '/api/fleet/summary', {headers: {Cookie: cookie}})).status, 200);
  await waitFor(() => relays.every(r => r.activeConnections() === 0));
  await assert.rejects(startFleetEntry(parseFleetEntryConfig({bindAddress: '127.0.0.1', upstreamAddress: '127.0.0.1', port: ports[0], upstreamPort: ports[2], allowLoopbackTest: true})), /EADDRINUSE/);
  // Idle and excess clients cannot accumulate unbounded open sockets.
  for (let n = 0; n < 3; n++) {
    const s = createConnection({host: '127.0.0.1', port: ports[0]}); sockets.push(s);
    s.on('error', () => {});
    await new Promise<void>(resolve => s.once('connect', resolve));
  }
  assert.ok(relays[0].activeConnections() <= 2);
  await waitFor(() => sockets.every(s => s.destroyed));
  await waitFor(() => relays[0].activeConnections() === 0);
  // An upstream outage closes clients; the relay does not fall back to another port.
  backend.closeAllConnections(); await new Promise<void>(resolve => backend!.close(() => resolve()));
  await assert.rejects(get(0, '/api/fleet/summary'));
  await waitFor(() => relays[0].activeConnections() === 0);
  await relays[0].stop(); await relays[0].stop();
  await assert.rejects(get(0, '/api/fleet/summary'));
  relays[0] = await startFleetEntry(parseFleetEntryConfig({bindAddress: '127.0.0.1', upstreamAddress: '127.0.0.1', port: ports[0], upstreamPort: ports[2], allowLoopbackTest: true}));
  console.log('Fleet HTTPS entries: two paths, verified TLS, shared sessions, denied controls, bounds, outage, cleanup and restart passed');
} finally {
  sockets.forEach(s => s.destroy());
  await Promise.all(relays.map(r => r.stop()));
  backend?.closeAllConnections(); await new Promise<void>(resolve => backend ? backend.close(() => resolve()) : resolve());
  await rm(dir, {recursive: true, force: true});
}
