/** Code-only archival checks. Never import or execute the archived application. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const releaseIds = [
  'safety-filtering-20261022',
  'safety-filtering-collector-20261022',
  'soc-strings-20261021',
  'workspaces-20261001',
];

export function safeRelative(name) {
  assert(typeof name === 'string' && name.length > 0, 'Missing relative path');
  assert(!name.includes('\\') && !path.posix.isAbsolute(name), 'Non-portable path');
  assert(name.split('/').every(p => p && p !== '.' && p !== '..'), 'Unsafe relative path');
  return name;
}

export function applicationFile(name) {
  safeRelative(name);
  if (name.split('/').some(p => p.startsWith('.')) || name.endsWith('.map')) return false;
  // No live configuration, account stores, logs, caches, telemetry or archives.
  return /^(?:assets\/[A-Za-z0-9_.-]+\.(?:js|css|svg)|[A-Za-z0-9_.-]+\.(?:cjs|html|svg))$/.test(name);
}

export function inventory(root) {
  assert(fs.lstatSync(root).isDirectory() && !fs.lstatSync(root).isSymbolicLink(), 'Expected real directory');
  const files = {};
  function walk(dir, prefix) {
    for (const name of fs.readdirSync(dir).sort()) {
      const relative = safeRelative(prefix + name), file = path.join(dir, name);
      const stat = fs.lstatSync(file);
      assert(!stat.isSymbolicLink(), `Symlink prohibited: ${relative}`);
      if (stat.isDirectory()) walk(file, relative + '/');
      else {
        assert(stat.isFile(), `Non-regular file: ${relative}`);
        files[relative] = sha256(fs.readFileSync(file));
      }
    }
  }
  walk(root, '');
  return files;
}

export function verifyRuntime(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.schema, 1);
  assert.equal(manifest.kind, 'dell-deployed-application-reference');
  assert.deepEqual(Object.keys(manifest.releases).sort(), releaseIds);
  const expected = {};
  for (const [id, record] of Object.entries(manifest.releases)) {
    for (const [name, digest] of Object.entries(record.files)) {
      assert(applicationFile(name), `Disallowed application file: ${name}`);
      assert(/^[a-f0-9]{64}$/.test(digest), 'Invalid hash');
      expected[`releases/${id}/dist/${name}`] = digest;
    }
  }
  assert.deepEqual(Object.keys(manifest.dependencies).sort(), ['package-lock.json', 'package.json']);
  for (const [name, digest] of Object.entries(manifest.dependencies)) {
    assert(/^[a-f0-9]{64}$/.test(digest), 'Invalid dependency hash');
    expected[`dependency-manifests/${name}`] = digest;
  }
  for (const entry of Object.values(manifest.entries)) {
    safeRelative(entry);
    assert(Object.hasOwn(expected, entry), `Entry is not in the snapshot: ${entry}`);
  }
  assert.deepEqual(inventory(path.join(root, 'payload')), expected, 'Runtime snapshot differs from its manifest');
  return {files: Object.keys(expected).length, releases: releaseIds.length, verifiedAt: manifest.liveVerifiedAt};
}
