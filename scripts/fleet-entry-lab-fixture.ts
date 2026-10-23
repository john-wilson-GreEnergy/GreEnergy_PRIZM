// Disposable synthetic HTTPS fixture. Called only by the isolated namespace lab.
import {readFile, writeFile, realpath} from 'node:fs/promises';
import {createServer} from 'node:https';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {hashLocalPassword} from '../src/server/security/localAccounts';
import {emptyMetrics} from '../src/core/fleet/model';

const [role, directory, site] = process.argv.slice(2);
if (!directory || !path.isAbsolute(directory) || !path.basename(directory).startsWith('prizm-entry-lab-') ||
  await realpath(directory) !== directory) throw new Error('Explicit temporary lab directory required');
const file = (name: string) => path.join(directory, name);
const sites = [3, 4].map(n => ({siteId: `lab-ss${n}`, blockId: '1', stationCode: `LAB-SS${n}`, blockIndex: 1, name: `Synthetic site ${n}`}));
if (role === 'prepare') {
  const password = randomBytes(24).toString('base64url');
  const collectors = sites.map((s, i) => ({...s, token: randomBytes(32).toString('base64url'), url: `https://172.31.250.${i ? 6 : 2}:9443/api/fleet/site-summary`}));
  const save = (name: string, data: unknown) => writeFile(file(name), JSON.stringify(data), {mode: 0o600});
  await save('accounts.json', [{id: 'fixture', email: 'fixture@example.invalid', disabled: false, version: 1, password: await hashLocalPassword(password),
    grants: sites.map(s => ({capability: 'telemetry.view', siteId: s.siteId, blockId: s.blockId, scope: {kind: 'block'}}))}]);
  await save('login.json', {email: 'fixture@example.invalid', password});
  await save('collectors.json', collectors);
  await save('fleet.json', {origin: 'https://10.0.0.15:3443', bindAddress: '0.0.0.0', accountsFile: file('accounts.json'),
    tlsKeyFile: file('key.pem'), tlsCertFile: file('cert.pem'), collectors});
  for (const n of [3, 4]) await save(`entry-${n}.json`, {bindAddress: '10.0.0.15', port: 3443, upstreamAddress: `172.31.250.${n === 3 ? 1 : 5}`, upstreamPort: 3443});
} else if (role === 'collector' && ['3', '4'].includes(site)) {
  const index = site === '3' ? 0 : 1;
  const enrolled = JSON.parse(await readFile(file('collectors.json'), 'utf8'))[index];
  const server = createServer({key: await readFile(file('key.pem')), cert: await readFile(file('cert.pem'))}, (req, res) => {
    if (req.method !== 'GET' || req.url !== '/api/fleet/site-summary') { res.writeHead(403); res.end(); return; }
    if (req.headers.authorization !== `Bearer ${enrolled.token}`) { res.writeHead(401); res.end(); return; }
    const stamp = new Date().toISOString(), metrics = emptyMetrics();
    metrics.powerKw = {value: index ? 720 : 1250, quality: 'live', source: 'Isolated synthetic fixture', observedAt: stamp};
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({...sites[index], schema: 'prizm-site-summary-v1', stale: false, observedAt: stamp, metrics}));
  });
  server.listen(9443, `172.31.250.${index ? 6 : 2}`);
  const stop = () => { server.closeAllConnections(); server.close(); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
} else throw new Error('Explicit fixture role required');
