/**
 * Import a read-only Dell runtime capture into a versioned repository archive.
 *
 * The capture contains application release folders and limited service-state
 * evidence only. This importer rejects links and non-application files, omits
 * source maps and AppleDouble metadata, and never executes captured code.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {applicationFile, inventory} from './deployed-runtime-lib.mjs';

const [captureArg, outputArg] = process.argv.slice(2);
assert(captureArg && outputArg,
  'Usage: node scripts/import-current-dell-runtime.mjs <capture-folder> <output-folder>');

const capture = path.resolve(captureArg);
const output = path.resolve(outputArg);
assert(fs.statSync(capture).isDirectory(), 'Capture folder is missing');
assert(!fs.existsSync(output), 'Refusing to overwrite an existing runtime archive');

const releaseNames = [
  'power-display-collector-20261109-r2',
  'power-display-20261109-r2',
  'workspaces-20261001',
];
const releases = {};
const copies = [];

for (const release of releaseNames) {
  const source = path.join(capture, 'releases', release, 'dist');
  const captured = inventory(source);
  const liveHashes = new Map(
    fs.readFileSync(path.join(capture, 'evidence', `${release}.live.sha256`), 'utf8')
      .trim().split('\n').filter(Boolean)
      .map(line => {
        const match = line.match(/^([a-f0-9]{64})  \.\/(.+)$/);
        assert(match, `Invalid live checksum line for ${release}`);
        return [match[2], match[1]];
      }),
  );
  const liveOnly = [...liveHashes.keys()].filter(name => !Object.hasOwn(captured, name));
  assert(liveOnly.every(name => name.endsWith('.map') || path.basename(name).startsWith('._')),
    `Unexpected live-only file for ${release}`);
  for (const [name, digest] of Object.entries(captured)) {
    assert.equal(liveHashes.get(name), digest, `Live hash differs: ${release}/${name}`);
  }

  const files = {};
  const omittedMetadata = [];
  for (const [name, digest] of Object.entries(captured)) {
    if (!applicationFile(name)) {
      assert(name.endsWith('.map') || path.basename(name).startsWith('._'),
        `Unexpected non-application file: ${release}/${name}`);
      omittedMetadata.push(name);
      continue;
    }
    files[name] = digest;
    copies.push([path.join(source, name), path.join('payload', 'releases', release, 'dist', name)]);
  }
  releases[release] = {files, omittedMetadata};
}

const readService = unit => {
  const source = path.join(capture, 'evidence', `${unit}.show.txt`);
  const values = Object.fromEntries(
    fs.readFileSync(source, 'utf8').trim().split('\n').map(line => {
      const split = line.indexOf('=');
      return [line.slice(0, split), line.slice(split + 1)];
    }),
  );
  assert.equal(values.ActiveState, 'active', `${unit} was not active`);
  assert.equal(values.SubState, 'running', `${unit} was not running`);
  assert.equal(values.NRestarts, '0', `${unit} had automatic restarts`);
  return {
    active: values.ActiveState,
    subState: values.SubState,
    enabled: values.UnitFileState,
    restarts: Number(values.NRestarts),
    started: values.ExecMainStartTimestamp,
    entry: values.ExecStart.match(/argv\[\]=\/usr\/bin\/node ([^ ;]+)/)?.[1],
  };
};

const platform = Object.fromEntries(
  fs.readFileSync(path.join(capture, 'evidence', 'platform.txt'), 'utf8')
    .trim().split('\n').map(line => {
      const split = line.indexOf('=');
      return [line.slice(0, split), line.slice(split + 1)];
    }),
);
const services = {
  'prizm.service': readService('prizm.service'),
  'prizm-site@ss4.service': readService('prizm-site@ss4.service'),
  'prizm-fleet.service': readService('prizm-fleet.service'),
};
assert.equal(services['prizm.service'].entry, services['prizm-site@ss4.service'].entry,
  'SS3 and SS4 collector entries differ');

const manifest = {
  schema: 1,
  kind: 'dell-deployed-application-reference',
  label: 'Power Display 2026-11-09 r2',
  tag: 'dell-production-20261109-power-display-r2',
  capturedAt: platform.capturedAtUtc,
  liveVerifiedAt: platform.capturedAtUtc,
  platform: {
    hostname: platform.hostname,
    kernel: platform.kernel,
    node: platform.node,
  },
  entries: {
    collectors: 'releases/power-display-collector-20261109-r2/dist/server.cjs',
    fleet: 'releases/power-display-20261109-r2/dist/fleet-server.cjs',
    lan: 'releases/workspaces-20261001/dist/index.html',
  },
  services,
  currentSymlink: platform.currentSymlink,
  releases,
  boundaries: {
    sourceBuildEquivalence: 'PARTIAL_REVIEWED_ROLLOUT_RECIPES_ARCHIVED',
    siteConfigurationAndData: 'EXCLUDED',
    credentialsAccountsLogsTelemetryCaches: 'EXCLUDED',
    sourceMapsAndAppleDouble: 'EXCLUDED_NON_RUNTIME_METADATA',
    dellChangedDuringCapture: false,
    servicesRestartedDuringCapture: false,
    applicationExecutedDuringImport: false,
  },
};

fs.mkdirSync(output, {recursive: true});
for (const [source, relative] of copies) {
  const destination = path.join(output, relative);
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
}
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n',
  {flag: 'wx'});
console.log(JSON.stringify({
  output,
  releases: Object.keys(releases).length,
  files: copies.length,
  collectorsMatch: true,
}, null, 2));
