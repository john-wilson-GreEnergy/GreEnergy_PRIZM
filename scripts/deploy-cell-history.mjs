/** Approved SS3/SS4 software rollout only. Fleet, networking and equipment stay unchanged. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const release = '/opt/prizm-fleet/releases/cell-history-20261001';
const backup = '/var/lib/prizm-fleet/cell-history-20261001';
const archive = '/home/ebc/prizm-cell-history-20261001.tgz';
const archiveHash = '6e52eb09659d5271a98a41ca758c0ecbb81237431c1b5727fd00fab19bd6f2eb';
const previousRelease = '/opt/prizm-fleet/releases/polling-tuned-20261001';
const ca = '/etc/prizm-fleet/fleet/ca-cert.pem';
const self = fileURLToPath(import.meta.url);
const run = (file, args, options = {}) => execFileSync(file, args, {encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024, ...options}).trim();
const present = file => {try {return fs.lstatSync(file);} catch (e) {if (e.code === 'ENOENT') return null; throw e;}};
const save = (file, value) => {fs.writeFileSync(file + '.new', JSON.stringify(value, null, 2), {mode: 0o600}); fs.renameSync(file + '.new', file);};
const plans = [
  {service: 'prizm', site: 'solar-star-3', station: 'BHE0020', worker: '/home/ebc/GreEnergy_PRIZM/dist'},
  {service: 'prizm-site@ss4', site: 'solar-star-4', station: 'BHE0021', worker: '/var/lib/prizm-sites/ss4/dist'},
].map(p => ({...p, override: `/etc/systemd/system/${p.service}.service.d/zzzz-cell-history.conf`}));
const overrideText = () => `[Service]\nExecStart=\nExecStart=/usr/bin/node ${release}/dist/server.cjs\nEnvironment=PRIZM_PUBLIC_DIRECTORY=${release}/dist\nEnvironment=PRIZM_CELL_HISTORY_ENABLED=true\nEnvironment=PRIZM_CELL_HISTORY_RETENTION_DAYS=7\nEnvironment=PRIZM_CELL_HISTORY_MAX_GIB=8\n`;
function switchLink(file, expected, target) {
  assert(present(file)?.isSymbolicLink() && fs.readlinkSync(file) === expected, 'Unexpected worker link');
  assert(!present(file + '.cells-next'), 'Temporary worker link already exists');
  fs.symlinkSync(target, file + '.cells-next'); fs.renameSync(file + '.cells-next', file);
}

async function probe(site, enabled) {
  const config = JSON.parse(fs.readFileSync('/etc/prizm-fleet/fleet/fleet.json', 'utf8'));
  const p = plans.find(p => p.site === site), c = config.collectors.find(c => c.siteId === site), w = config.workspaces.find(w => w.siteId === site);
  assert(p && c && w && c.stationCode === p.station);
  const get = async (url, token) => {
    const response = await fetch(url, {headers: {authorization: 'Bearer ' + token}, signal: AbortSignal.timeout(20000)});
    assert.equal(response.status, 200, 'Read-only verification HTTP status'); return response.json();
  };
  const summary = await get(c.url, c.token);
  assert.equal(summary.siteId, site); assert.equal(summary.stationCode, p.station); assert.equal(summary.stale, false);
  assert(Date.now() - Date.parse(summary.observedAt) < 30000, 'Site summary is stale');
  assert.equal(summary.details.arrays.length, 8); assert.equal(summary.metrics.strings.value, 320);
  const denied = await fetch(c.url, {signal: AbortSignal.timeout(10000)}); assert.equal(denied.status, 401); await denied.body?.cancel();
  const base = new URL(c.url).origin + '/api/fleet/workspace';
  const debug = await get(base + '/api/local/debug/coordinator', w.token);
  const result = {site, station: p.station, observedAt: summary.observedAt, strings: summary.metrics.strings.value,
    lastCompletedDuration: debug.lastCompletedDuration, metadataIntervalMs: debug.metadataCadence?.intervalMs};
  assert.equal(result.metadataIntervalMs, 60000, 'Existing polling tuning must remain enabled');
  if (!enabled) return result;
  const cells = await get(base + '/api/local/site-data/cells', w.token);
  assert.equal(cells.site, p.station + ' / Block 1'); assert.equal(cells.storage.enabled, true);
  assert.equal(cells.storage.retentionDays, 7); assert.equal(cells.storage.maxBytes, 8 * 1024 ** 3);
  assert.equal(cells.storage.lastError, null); assert(cells.storage.saved > 0, 'No saved cell frame yet');
  assert.equal(cells.arrays.length, 8); assert.equal(cells.targets.length, 320); assert.equal(cells.summary.total, 134400);
  assert(cells.summary.valid > 0, 'No fresh cell values'); assert(Date.now() - cells.acquiredAt < 180000, 'Recorder snapshot is stale');
  // Compare persisted and latest canonical frames using one exact timestamp, not a nearest substitute.
  const latest = await get(base + '/api/local/site-data/cells/snapshot?array=1&metric=millivolts', w.token);
  assert.equal(latest.strings.length, 40); assert.equal(latest.statistics.total, 16800);
  const recorded = await get(base + '/api/local/site-data/cells/snapshot?array=1&metric=millivolts&at=' + latest.acquiredAt, w.token);
  assert.equal(recorded.historical, true); assert.equal(recorded.acquiredAt, latest.acquiredAt);
  assert.deepEqual(recorded.strings.map(s => s.cells.map(c => [c.bpc, c.group, c.observedAt])), latest.strings.map(s => s.cells.map(c => [c.bpc, c.group, c.observedAt])));
  const temperature = await get(base + '/api/local/site-data/cells/snapshot?array=1&metric=temperatureF&at=' + latest.acquiredAt, w.token);
  assert.equal(temperature.metric, 'temperatureF'); assert.equal(temperature.statistics.total, 16800);
  const history = await get(base + '/api/local/site-data/cells/history?metric=millivolts&array=1&from=' + (latest.acquiredAt - 60000) + '&to=' + Date.now(), w.token);
  assert(history.points.some(point => point.at === latest.acquiredAt), 'Saved snapshot missing from history');
  const root = await fetch(base + '/', {headers: {authorization: 'Bearer ' + w.token}, signal: AbortSignal.timeout(10000)});
  assert.equal(root.status, 200); assert((await root.text()).includes('/assets/'), 'Workspace frontend missing');
  return {...result, cells: {site: cells.site, acquiredAt: cells.acquiredAt, summary: cells.summary, storage: cells.storage,
    issues: cells.issues, array1: {voltage: recorded.statistics, temperatureF: temperature.statistics}, historicalReadback: true}};
}
function isolatedProbe(site, enabled) {
  return JSON.parse(run('ip', ['netns', 'exec', 'prizm-fleet', process.execPath, self, '--probe', site, ...(enabled ? ['enabled'] : [])],
    {timeout: 90000, env: {...process.env, NODE_EXTRA_CA_CERTS: ca}}));
}
async function healthy(p, enabled) {
  const deadline = Date.now() + 240000; let last;
  do {
    try {assert.equal(run('systemctl', ['is-active', p.service]), 'active'); return isolatedProbe(p.site, enabled);}
    catch (error) {last = error; await new Promise(resolve => setTimeout(resolve, 5000));}
  } while (Date.now() < deadline);
  throw Error(p.service + ' failed readiness: ' + last.message.split('\n')[0]);
}
async function rollback(state) {
  for (const p of [...state.changed].reverse()) {
    if (p.restored) continue;
    console.log('Restoring ' + p.service);
    run('systemctl', ['stop', p.service]);
    if (present(p.override)) {assert.equal(fs.readFileSync(p.override, 'utf8'), overrideText()); fs.unlinkSync(p.override);}
    if (fs.readlinkSync(p.worker) === release + '/dist') switchLink(p.worker, release + '/dist', p.oldWorker);
    else assert.equal(fs.readlinkSync(p.worker), p.oldWorker);
    run('systemctl', ['daemon-reload']); run('systemctl', ['start', p.service]); await healthy(p, false);
    p.restored = true; save(backup + '/state.json', state);
  }
  state.rolledBack = true; save(backup + '/state.json', state);
  console.log('Previous software restored. Recorded cell frames retained; no equipment or network changes.');
}
async function apply() {
  assert(!present(release) && !present(backup), 'Release already staged/applied: do not rerun apply');
  assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'), archiveHash, 'Archive checksum mismatch');
  const entries = run('tar', ['-tzf', archive]).split('\n');
  assert(entries.every(p => p.startsWith('dist/') && !p.split('/').includes('..')), 'Unexpected archive contents');
  assert(Number(fs.statfsSync('/var/lib').bavail) * Number(fs.statfsSync('/var/lib').bsize) > 20 * 1024 ** 3, 'Insufficient disk reserve');
  const state = {at: new Date().toISOString(), changed: [], before: {}, after: {}};
  const fleetPid = run('systemctl', ['show', 'prizm-fleet', '-p', 'MainPID', '--value']);
  for (const p of plans) {
    assert(!present(p.override)); assert(present(p.worker)?.isSymbolicLink());
    p.oldWorker = fs.readlinkSync(p.worker); assert.equal(p.oldWorker, previousRelease + '/dist');
    assert(run('systemctl', ['show', p.service, '-p', 'ExecStart', '--value']).includes(previousRelease + '/dist/server.cjs'));
    state.before[p.service] = await healthy(p, false);
  }
  fs.mkdirSync(backup, {mode: 0o700}); save(backup + '/state.json', state); fs.copyFileSync(self, backup + '/deploy.mjs');
  fs.mkdirSync(release, {mode: 0o755}); run('tar', ['--no-same-owner', '-xzf', archive, '-C', release]);
  fs.symlinkSync('/opt/prizm-fleet/releases/workspaces-20261001/node_modules', release + '/node_modules');
  run('node', ['--check', release + '/dist/server.cjs']);
  try {
    for (const p of plans) {
      state.changed.push(p); save(backup + '/state.json', state);
      console.log('Updating ' + p.site + ' only; waiting for live cell recording...');
      run('systemctl', ['stop', p.service]); switchLink(p.worker, p.oldWorker, release + '/dist');
      fs.mkdirSync(path.dirname(p.override), {recursive: true}); fs.writeFileSync(p.override, overrideText(), {mode: 0o644, flag: 'wx'});
      run('systemctl', ['daemon-reload']); run('systemctl', ['start', p.service]);
      state.after[p.service] = await healthy(p, true); save(backup + '/state.json', state);
      console.log('PASS ' + p.site + ': 134,400 channels, 7-day recording and saved snapshot readback');
    }
    assert.equal(run('systemctl', ['show', 'prizm-fleet', '-p', 'MainPID', '--value']), fleetPid, 'Fleet process unexpectedly changed');
    state.completedAt = new Date().toISOString(); save(backup + '/state.json', state);
    const report = '/home/ebc/prizm-cell-history-result.json'; save(report, {at: state.completedAt, before: state.before, after: state.after});
    const owner = fs.statSync('/home/ebc'); fs.chownSync(report, owner.uid, owner.gid);
    console.log('Cell history deployment complete. Both sites verified; Fleet, equipment and networking unchanged.');
  } catch (error) {console.error('Readiness failed; rolling back changed collectors.'); await rollback(state); throw error;}
}
function selfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prizm-cell-rollback-')), file = path.join(dir, 'dist');
  fs.symlinkSync('/old/dist', file); switchLink(file, '/old/dist', '/new/dist');
  assert.equal(fs.readlinkSync(file), '/new/dist'); switchLink(file, '/new/dist', '/old/dist');
  assert.equal(fs.readlinkSync(file), '/old/dist'); assert.throws(() => switchLink(file, '/wrong', '/new/dist'));
  assert(overrideText().includes('PRIZM_CELL_HISTORY_RETENTION_DAYS=7'));
  assert(!overrideText().includes('WorkingDirectory='));
  assert.deepEqual(plans.map(p => p.service), ['prizm', 'prizm-site@ss4']);
  console.log('PASS worker rollback, target checks, collector-only scope and retention configuration. Fixture: ' + dir);
}
if (process.argv[2] === '--self-test') selfTest();
else {
  assert.equal(process.getuid(), 0, 'Run with sudo');
  if (process.argv[2] === '--probe') console.log(JSON.stringify(await probe(process.argv[3], process.argv[4] === 'enabled')));
  else if (process.argv[2] === 'apply') await apply();
  else if (process.argv[2] === 'rollback') await rollback(JSON.parse(fs.readFileSync(backup + '/state.json', 'utf8')));
  else throw Error('Use apply or rollback');
}
