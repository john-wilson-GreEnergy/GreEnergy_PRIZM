import assert from 'node:assert/strict';
import {mkdtemp, readFile, stat, rm} from 'node:fs/promises';
import {X509Certificate} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {provisionFleetTls, validateTlsPlan} from './provisionFleetTls.mjs';

const directory = await mkdtemp(path.join(os.tmpdir(), 'prizm-pki-test-'));
const plan = {fleetIp: '10.0.0.15', ss3Ip: '172.31.250.2', ss4Ip: '172.31.250.6'};
try {
  for (const bad of ['0.0.0.0', '127.0.0.1', '8.8.8.8', 'host.example', '10.0.0.15\nDNS:bad']) assert.throws(() => validateTlsPlan({...plan, ss3Ip: bad}));
  assert.throws(() => validateTlsPlan({...plan, ss3Ip: plan.ss4Ip}));
  assert.throws(() => validateTlsPlan({...plan, ignored: true}));
  await assert.rejects(provisionFleetTls('relative', plan));
  const output = path.join(directory, 'new-pki');
  const manifest = await provisionFleetTls(output, plan);
  assert.equal(manifest.status, 'prepared-not-installed');
  assert.equal(manifest.certificates.length, 3);
  assert.equal(new Set(manifest.certificates.map(c => c.sha256)).size, 3);
  const ca = new X509Certificate(await readFile(path.join(output, 'ca-cert.pem')));
  assert.equal(ca.ca, true);
  for (const leaf of manifest.certificates) {
    const cert = new X509Certificate(await readFile(path.join(output, leaf.name, 'cert.pem')));
    assert.equal(cert.ca, false); assert.equal(cert.checkIP(leaf.ip), leaf.ip);
    assert.equal(cert.checkIP('10.123.45.67'), undefined);
    assert.ok(cert.verify(ca.publicKey));
    assert.deepEqual(cert.keyUsage, ['1.3.6.1.5.5.7.3.1']);
    assert.ok(Date.parse(cert.validTo) > Date.now() + 360 * 86400000);
    assert.equal((await stat(path.join(output, leaf.name, 'key.pem'))).mode & 0o077, 0);
  }
  const original = await readFile(path.join(output, 'authority', 'ca-key.pem'));
  await assert.rejects(provisionFleetTls(output, plan), /EEXIST/);
  assert.deepEqual(await readFile(path.join(output, 'authority', 'ca-key.pem')), original);
  assert.equal(JSON.stringify(manifest).includes('PRIVATE KEY'), false);
  console.log('Fleet PKI: distinct keys, CA trust, exact IP SANs, server-only leaves, private files and no-overwrite passed');
} finally {await rm(directory, {recursive: true, force: true});}
