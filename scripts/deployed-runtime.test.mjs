import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {applicationFile, inventory, releaseIds, safeRelative, verifyRuntime} from './deployed-runtime-lib.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prizm-runtime-reference-test-'));
try {
  const payload = path.join(tmp, 'payload');
  const manifest = {schema: 1, kind: 'dell-deployed-application-reference', releases: {}, dependencies: {}, entries: {}, liveVerifiedAt: 'synthetic'};
  for (const id of releaseIds) {
    const dir = path.join(payload, 'releases', id, 'dist');
    fs.mkdirSync(dir, {recursive: true});
    // Verification must only hash this file; executing it would fail the test.
    fs.writeFileSync(path.join(dir, 'server.cjs'), 'throw new Error("ARCHIVE MUST NOT EXECUTE");\r\n');
    manifest.releases[id] = {files: inventory(dir)};
  }
  const dep = path.join(payload, 'dependency-manifests');
  fs.mkdirSync(dep);
  for (const name of ['package.json', 'package-lock.json']) fs.writeFileSync(path.join(dep, name), '{}\n');
  manifest.dependencies = inventory(dep);
  manifest.entries.collector = `releases/${releaseIds[0]}/dist/server.cjs`;
  const manifestFile = path.join(tmp, 'manifest.json');
  const save = () => fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  save();
  assert.equal(verifyRuntime(tmp).files, 6);
  const target = path.join(payload, manifest.entries.collector), original = fs.readFileSync(target);
  fs.writeFileSync(target, 'tampered');
  assert.throws(() => verifyRuntime(tmp), /differs/);
  fs.unlinkSync(target);
  assert.throws(() => verifyRuntime(tmp), /differs/);
  fs.writeFileSync(target, original);
  const extra = path.join(dep, 'unexpected.json');
  fs.writeFileSync(extra, '{}');
  assert.throws(() => verifyRuntime(tmp), /differs/);
  fs.unlinkSync(extra);
  fs.symlinkSync(target, extra);
  assert.throws(() => verifyRuntime(tmp), /Symlink/);
  fs.unlinkSync(extra);
  for (const name of ['../escape.js', '/absolute.js', 'a/../b.js', 'a\\b.js', 'a//b.js']) assert.throws(() => safeRelative(name));
  for (const name of ['accounts.json', '.env', 'assets/.secret.js', 'server.cjs.map', 'cache/telemetry.json', 'settings.json']) assert.equal(applicationFile(name), false);
  assert.equal(applicationFile('assets/safety22-example.js'), true);
  manifest.releases[releaseIds[0]].files['../escape.js'] = '0'.repeat(64);
  save();
  assert.throws(() => verifyRuntime(tmp), /Unsafe/);
  console.log('PASS: offline verification; tampering, missing/extra files, symlinks, unsafe paths and non-code inputs rejected; archived code never executed.');
} finally {
  // Only this unique synthetic test directory is removed, never user/site data.
  fs.rmSync(tmp, {recursive: true, force: true});
}
