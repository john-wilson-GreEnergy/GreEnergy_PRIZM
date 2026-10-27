/** Import a locally captured, reviewed reference. No SSH, deployment or application execution. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {applicationFile, inventory, releaseIds, sha256, verifyRuntime} from './deployed-runtime-lib.mjs';

const [captureArg, recheckArg, outArg] = process.argv.slice(2);
assert(captureArg && recheckArg && outArg, 'Usage: node scripts/import-deployed-runtime.mjs <private-capture> <private-live-recheck.json> <new-output-folder>');
const capture = path.resolve(captureArg), out = path.resolve(outArg);
assert(!fs.existsSync(out), 'Never overwrite an existing reference');
const lock = JSON.parse(fs.readFileSync(path.join(capture, 'production-lock.json'), 'utf8'));
const recheck = JSON.parse(fs.readFileSync(path.resolve(recheckArg), 'utf8'));
assert.deepEqual(recheck.releases, lock.observed.releases, 'Live files changed since capture');
assert.deepEqual(Object.keys(lock.roots).sort(), releaseIds, 'Unexpected release set');
assert(recheck.services.length === 9 && recheck.services.every(s => s.active === 'active'), 'Application services not verified');
for (const service of recheck.services) {
  assert.equal(service.runningEntry, lock.observed.services.find(s => s.unit === service.unit)?.runningEntry, 'Service entry changed');
}

const manifest = {
  schema: 1,
  kind: 'dell-deployed-application-reference',
  capturedAt: lock.observed.capturedAt,
  liveVerifiedAt: recheck.verifiedAt,
  platform: {node: lock.observed.node, os: lock.observed.platform, arch: lock.observed.arch},
  entries: {
    collectors: 'releases/safety-filtering-collector-20261022/dist/server.cjs',
    fleet: 'releases/safety-filtering-20261022/dist/fleet-server.cjs',
    gateways: 'releases/workspaces-20261001/dist/fleet-entry.cjs',
  },
  workerFolderVerification: {primary: 'soc-strings-20261021', secondary: recheck.ss4Worker.unverified ? 'ADMIN_READ_REQUIRED' : recheck.ss4Worker.resolved.split('/').at(-2)},
  releases: {},
  dependencies: {},
  boundaries: {
    sourceBuildEquivalence: 'NOT_VERIFIED',
    installedDependencies: 'NOT_CAPTURED',
    siteConfigurationAndData: 'EXCLUDED',
    sourceMapsAndAppleDouble: 'EXCLUDED_NON_RUNTIME_METADATA',
    ravenswood: 'EXCLUDED',
    dellChanged: false,
    applicationExecutedDuringVerification: false,
  },
};
const copies = [];
for (const id of releaseIds) {
  const source = path.join(capture, 'production', id, 'dist');
  const actual = inventory(source), expected = lock.roots[id].files;
  assert.deepEqual(actual, expected, `Capture altered: ${id}`);
  const files = {}, omittedMetadata = [];
  for (const [name, digest] of Object.entries(actual)) {
    if (!applicationFile(name)) {
      assert(name.endsWith('.map') || path.basename(name).startsWith('._'), `Unreviewed non-code file: ${name}`);
      omittedMetadata.push(name);
      continue;
    }
    files[name] = digest;
    copies.push([path.join(source, name), `releases/${id}/dist/${name}`]);
  }
  manifest.releases[id] = {files, omittedMetadata};
}
for (const name of ['package.json', 'package-lock.json']) {
  const source = path.join(capture, 'production/dependency-manifests', name);
  const bytes = fs.readFileSync(source);
  JSON.parse(bytes.toString());
  manifest.dependencies[name] = sha256(bytes);
  copies.push([source, `dependency-manifests/${name}`]);
}
// All source inventories are checked before creating any output. Copies preserve bytes.
fs.mkdirSync(out, {recursive: true});
for (const [source, relative] of copies) {
  const dest = path.join(out, 'payload', relative);
  fs.mkdirSync(path.dirname(dest), {recursive: true});
  fs.copyFileSync(source, dest, fs.constants.COPYFILE_EXCL);
}
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {flag: 'wx'});
console.log(verifyRuntime(out));
