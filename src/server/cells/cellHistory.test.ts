import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {decodeCellReport, finiteNumber} from './decodeCellReport';
import {cellId, historyPoint, projectCells, arrayCellSnapshot} from './cellProjection';
import {CellHistory} from './CellHistory';
import type {CellHistorySite} from '../../core/cellHistory';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {cellHeatColor, CellHistoryHeatmap, CellHistoryTable} from '../../components/CellHistoryHeatmap';
import {snapshotCellAt} from '../../components/ArrayCellSnapshot';
import CellStringOverlay, {overlayGeometry, nearestOverlayCell, stringColor} from '../../components/CellStringOverlay';

const now = 1790892000000;
const site = {stationCode: 'BHE0020', blockIndex: 1, emsBaseUrl: 'http://ems/turtle'};
function report(at = now, stationCode = site.stationCode) {
  return {blockReport: {stationCode, blockIndex: 1, timeStamp: String(at), arrayReport: {'1': {
    cellGroupReportForArray: {timeStampLookup: [String(at), String(at - 600_000)], millivoltsLookup: [3200, 3300, 3500], temperatureLookup: [200, 300, 400],
      condensedCellReportForString: {'1': {stringIndex: 1, batteryPackCount: 2, cellGroupPerBatteryPackCount: 2,
        timestamps: [0, 0, 0, 1], millivolts: [0, 1, 2, 0], temperatures: [0, 1, 2, 0], ignoredTempSensors: [{batteryPackIndex: 2, cellGroupIndex: 1}]}}}}}}};
}
assert.equal(finiteNumber(null), null); assert.equal(finiteNumber(''), null); assert.equal(finiteNumber(false), null);
const decoded = await decodeCellReport(report(), site, now);
assert.deepEqual(decoded.strings[0].millivolts, [3200, 3300, 3500, 3200]);
assert.deepEqual(decoded.strings[0].temperatureF, [68, 86, null, 68]);
assert.equal(cellId(decoded.strings[0], 2), 'A1-S1-B2-C1');
assert.deepEqual(projectCells(decoded, 'temperatureF', now).summary, {total: 4, valid: 2, missing: 0, stale: 1, ignored: 1, min: 68, average: 77, max: 86});
assert.equal(projectCells(decoded, 'millivolts', now).summary.valid, 3);
assert.equal(projectCells(decoded, 'millivolts', now + 180_000).summary.valid, 0);
assert.equal(projectCells(decoded, 'millivolts', now - 60_000).summary.valid, 0);
assert.equal(historyPoint(decoded, 'millivolts', ['A1-S1-B1-C1', 'A1-S1-B2-C2', 'A2-S1-B1-C1']).values['A1-S1-B2-C2'], null);
assert.equal(historyPoint(decoded, 'millivolts', ['A1-S1-B1-C1']).sourceTimes['A1-S1-B1-C1'], now);
assert.deepEqual(historyPoint(decoded, 'temperatureF', []).arrays, projectCells(decoded, 'temperatureF', now).arrays, 'Heatmap and table retain canonical quality and ignored counts');
const secondArray = {...decoded.strings[0], array: 2, millivolts: [3600, 3700, 3800, 3600]};
const twoArrays = {...decoded, strings: [...decoded.strings, secondArray]};
assert.equal(historyPoint(twoArrays, 'millivolts', []).arrays.length, 2);
assert.equal(historyPoint(twoArrays, 'millivolts', [], 2).arrays[0].statistics.average, 3700);
assert.deepEqual(historyPoint(twoArrays, 'millivolts', [], 2).arrays.map(a => a.array), [2], 'Array selection excludes other arrays');
assert.equal(historyPoint({...decoded, acquiredAt: now + 180_000}, 'millivolts', []).arrays[0].statistics.average, null, 'No fresh channels yields a gray gap, not zero');
assert.equal(cellHeatColor(null, 10, 20), '#e2e8f0');
assert.equal(cellHeatColor(NaN, 10, 20), '#e2e8f0');
assert.equal(cellHeatColor(0, 10, 20), cellHeatColor(10, 10, 20), 'Color scale clamps');
assert.doesNotMatch(cellHeatColor(10, 10, 10), /NaN/, 'Flat series has a stable midpoint color');
const point = historyPoint(twoArrays, 'millivolts', []);
const arraySnapshot = arrayCellSnapshot(decoded, 'temperatureF', 1, now, true);
assert.deepEqual(arraySnapshot.strings[0].cells.map(c => c.quality), ['fresh', 'fresh', 'ignored', 'stale']);
assert.deepEqual(arraySnapshot.strings[0].cells.map(c => c.value), [68, 86, null, null]);
assert.equal(arraySnapshot.strings[0].cells[2].bpc, 2); assert.equal(arraySnapshot.strings[0].cells[2].group, 1);
assert.throws(() => arrayCellSnapshot(decoded, 'millivolts', 2, now, true), /No cell/);
const wholeArray = {...decoded, strings: Array.from({length: 40}, (_, s) => ({array: 1, string: s + 1, bpcCount: 14, groupsPerBpc: 30,
  observedAt: Array(420).fill(now), millivolts: Array.from({length: 420}, (_, i) => 3200 + i), temperatureF: Array(420).fill(80), ignoredTemperatures: []}))};
const allCells = arrayCellSnapshot(wholeArray, 'millivolts', 1, now, true);
assert.equal(allCells.statistics.total, 16800); assert.equal(allCells.strings.length, 40);
assert.equal(allCells.strings.flatMap(s => s.cells).length, 16800, 'Every cell is returned, without decimation');
assert.deepEqual(allCells.strings[39].cells[419], {bpc: 14, group: 30, value: 3619, observedAt: now, quality: 'fresh'});
assert.deepEqual(snapshotCellAt(allCells, 1472, 72.1, 26.1), [0, 0]);
assert.deepEqual(snapshotCellAt(allCells, 1472, 1467, 26 + 39 * 14), [39, 419]);
assert.equal(snapshotCellAt(allCells, 1472, 10, 26), null); assert.equal(snapshotCellAt(allCells, 1472, 1472, 26), null);
const overlay = overlayGeometry(allCells);
assert.equal(overlay.series.length, 40);
assert.equal(overlay.series.reduce((sum, s) => sum + (s.path.match(/[ML]/g)?.length ?? 0), 0), 16800, 'Overlay plots every fresh cell without decimation');
assert.deepEqual(nearestOverlayCell(allCells, new Set(Array.from({length: 39}, (_, i) => i + 1)), overlay.x(14, 30), overlay.y(3619), overlay), [39, 419]);
assert.equal(nearestOverlayCell(allCells, new Set(allCells.strings.map(s => s.string)), overlay.x(1, 1), overlay.y(3200), overlay), null);
assert.equal(nearestOverlayCell(allCells, new Set(), 0, 0, overlay), null);
const gapSnapshot = {...arraySnapshot, strings: [{...arraySnapshot.strings[0], cells: [arraySnapshot.strings[0].cells[0], {...arraySnapshot.strings[0].cells[1], value: null}, {...arraySnapshot.strings[0].cells[2], quality: 'fresh' as const, value: 80}, arraySnapshot.strings[0].cells[3]]}]};
const gapGeometry = overlayGeometry(gapSnapshot);
assert.equal((gapGeometry.series[0].path.match(/M/g) ?? []).length, 2, 'Gap starts a new segment');
assert.doesNotMatch(gapGeometry.series[0].path, /L|NaN/, 'No interpolation over missing/ignored/stale values');
assert.equal(stringColor(40), stringColor(40)); assert.notEqual(stringColor(1), stringColor(2));
const overlayMarkup = renderToStaticMarkup(React.createElement(CellStringOverlay, {snapshot: allCells, selected: [39, 419], onSelect: () => {}}));
assert.match(overlayMarkup, /Isolate string 40/); assert.match(overlayMarkup, /Show all strings/); assert.match(overlayMarkup, /16[,.]?800|16800/);
assert.match(overlayMarkup, /snapshot, not time/); assert.match(overlayMarkup, /String 40/);
const emptyOverlay = overlayGeometry({...arraySnapshot, statistics: {...arraySnapshot.statistics, min: null, max: null}, strings: []});
assert.ok(Number.isFinite(emptyOverlay.y(0))); assert.equal(emptyOverlay.series.length, 0);
const heatmap = renderToStaticMarkup(React.createElement(CellHistoryHeatmap, {points: [point], arrays: [1, 2], unit: 'mV', selectedAt: now, onSelect: () => {}}));
assert.match(heatmap, /Inspect recorded snapshot/); assert.match(heatmap, /Array 2/); assert.match(heatmap, /not alarm severity/);
const detail = renderToStaticMarkup(React.createElement(CellHistoryTable, {view: null, point, arrays: [2], unit: 'mV', onLatest: () => {}}));
assert.match(detail, /3,700/); assert.match(detail, /Back to latest/); assert.doesNotMatch(detail, /Array 1/);
await assert.rejects(decodeCellReport(report(now, 'BHE0021'), site, now), /identity/);
const invalid = report(); invalid.blockReport.arrayReport['1'].cellGroupReportForArray.condensedCellReportForString['1'].millivolts[0] = 9999;
assert.equal((await decodeCellReport(invalid, site, now)).strings[0].millivolts[0], null);
const partial = report(); partial.blockReport.arrayReport['1'].cellGroupReportForArray.condensedCellReportForString['1'].timestamps.pop();
assert.equal((await decodeCellReport(partial, site, now)).strings[0].observedAt[3], null);
const noLookup = report(); noLookup.blockReport.arrayReport['1'].cellGroupReportForArray.temperatureLookup = [];
await assert.rejects(decodeCellReport(noLookup, site, now), /No verified/);
const badIgnored = report(); badIgnored.blockReport.arrayReport['1'].cellGroupReportForArray.condensedCellReportForString['1'].ignoredTempSensors = [{batteryPackIndex: 99, cellGroupIndex: 1}];
assert.ok((await decodeCellReport(badIgnored, site, now)).strings[0].temperatureF.every(t => t === null));

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'prizm-cells-test-'));
try {
  const options = {directory, enabled: true, reserveBytes: 0, maxBytes: 1024 * 1024};
  const history = new CellHistory(options);
  history.offer(report(), site, now); await history.drain();
  assert.equal(history.view('millivolts', now).storage.saved, 1);
  const recorded = await history.snapshot({array: 1, metric: 'millivolts', at: now});
  assert.equal(recorded.strings[0].cells.length, 4); assert.equal(recorded.strings[0].cells[0].value, 3200);
  assert.equal(recorded.historical, true);
  await assert.rejects(history.snapshot({array: 0, metric: 'millivolts', at: now}), /Invalid/);
  await assert.rejects(history.snapshot({array: 1, metric: 'millivolts', at: -1}), /Invalid/);
  await assert.rejects(history.snapshot({array: 1, metric: 'millivolts', at: now + 1}));
  const stopSnapshot = new AbortController(); stopSnapshot.abort();
  await assert.rejects(history.snapshot({array: 1, metric: 'millivolts', at: now}, stopSnapshot.signal));
  history.offer(report(now + 1000), site, now + 1000); await history.drain();
  assert.equal(history.view('millivolts', now).storage.saved, 1, 'Cadence gate prevents extra storage');
  history.offer(report(), site, now + 60_000); await history.drain();
  assert.equal(history.view('millivolts', now).storage.saved, 1, 'Identical source samples are not re-recorded');
  history.offer(report(now + 120_000), site, now + 120_000); await history.drain();
  assert.equal(history.view('millivolts', now).storage.saved, 2);
  const query = {from: now - 1, to: now + 180_000, metric: 'millivolts' as const, ids: ['A1-S1-B1-C1']};
  const result = await history.query(query);
  assert.equal(result.sampledFrames, 2); assert.equal(result.points[0].values['A1-S1-B1-C1'], 3200);
  // Production worker uses the same canonical projection, with compact cached results.
  let workerSite: CellHistorySite | null = site;
  const worker = new CellHistory({...options, currentSite:()=>workerSite, workerQueries:true});
  try {
    const cold = await worker.query(query), warm = await worker.query(query);
    assert.deepEqual(cold.points, result.points);
    assert.equal(cold.diagnostics?.framesRead, 2);
    assert.equal(warm.diagnostics?.framesRead, 0);
    assert.equal(warm.diagnostics?.cacheHits, 2);
    assert.deepEqual(warm.points, cold.points, 'Cached history retains exact quality and source timestamps');
    const tempQuery = {...query, metric:'temperatureF' as const};
    assert.deepEqual((await worker.query(tempQuery)).points, (await history.query(tempQuery)).points);
    const scopeQuery = {...query, array:2};
    assert.deepEqual((await worker.query(scopeQuery)).points, (await history.query(scopeQuery)).points);
    workerSite = {...site,stationCode:'OTHER'};
    assert.equal((await worker.query(query)).matchedFrames, 0, 'Worker never shares cache across sites');
    workerSite = site;
    const abort = new AbortController();
    const cancelledRead = worker.query(query, abort.signal); abort.abort();
    await assert.rejects(cancelledRead, /cancel/i);
    assert.deepEqual((await worker.query(query)).points, result.points, 'Worker recovers after cancellation');
    const changed = worker.query(query); workerSite = {...site,stationCode:'OTHER'};
    await assert.rejects(changed, /site changed/i, 'In-flight site change cannot publish an old-site result');
  } finally {await worker.close();}
  const missingWorker = new CellHistory({...options, currentSite:()=>site, workerQueries:true, workerFile:path.join(directory,'missing.cjs')});
  await assert.rejects(missingWorker.query(query), /Cannot find module/);
  await missingWorker.close();
  const incomplete = report(now + 240_000);
  incomplete.blockReport.arrayReport['1'].cellGroupReportForArray.condensedCellReportForString = {'2': {...incomplete.blockReport.arrayReport['1'].cellGroupReportForArray.condensedCellReportForString['1'], stringIndex: 2}} as never;
  history.offer(incomplete, site, now + 240_000); await history.drain();
  assert.equal(history.view('millivolts', now + 240_000).summary.total, 8, 'Known missing string remains in coverage');
  assert.equal(history.view('millivolts', now + 240_000).summary.missing, 4);
  await assert.rejects(history.query({...query, ids: ['../../etc/passwd']}), /valid window/);
  await assert.rejects(history.query({...query, from: 0}), /valid window/);
  await assert.rejects(history.query({...query, ids: Array(9).fill('A1-S1-B1-C1')}), /valid window/);
  const first = history.query(query), queued = history.query(query);
  await assert.rejects(history.query(query), /Another/); await Promise.all([first, queued]);
  const cancelled = new AbortController(); cancelled.abort(); await assert.rejects(history.query(query, cancelled.signal));
  const restart = new CellHistory({...options, currentSite: () => site});
  assert.equal((await restart.query(query)).sampledFrames, 2, 'History survives restart');
  await restart.close();
  const [folder] = await fs.readdir(directory);
  const cached = new CellHistory({...options, currentSite:()=>site, workerQueries:true});
  try {
    await cached.query(query);
    const filename = path.join(directory, folder, `${now}.cells.json.gz`), original = await fs.readFile(filename);
    await fs.writeFile(filename, 'corrupt');
    assert.equal((await cached.query(query)).unreadableFrames, 1, 'Changed file cannot reuse cached good values');
    await fs.unlink(filename);
    assert.equal((await cached.query(query)).matchedFrames, 1, 'Expired file does not reappear from cache');
    await fs.writeFile(filename, original);
    assert.deepEqual((await cached.query(query)).points, result.points);
  } finally {await cached.close();}
  await fs.writeFile(path.join(directory, folder, `${now + 60_000}.cells.json.gz`), 'invalid');
  assert.equal((await history.query(query)).unreadableFrames, 1);
  assert.deepEqual((await history.query(query)).points.find(p => p.at === now + 60_000)?.arrays, [], 'Unreadable frames cannot inherit array values');
  await fs.writeFile(path.join(directory, folder, `${now + 65_000}.cells.json.gz`), gzipSync(JSON.stringify({...decoded, acquiredAt: now + 65_000, site: {...site, stationCode: 'OTHER'}})));
  assert.equal((await history.query(query)).unreadableFrames, 2, 'Wrong-site frames rejected');
  await fs.writeFile(path.join(directory, folder, `${now + 66_000}.cells.json.gz`), gzipSync(JSON.stringify({...decoded, acquiredAt: now + 66_000, strings: [{...decoded.strings[0], millivolts: ['not a number', 1, 2, 3]}]})));
  assert.equal((await history.query(query)).unreadableFrames, 3, 'Corrupt columns become explicit gaps');
  let active: CellHistorySite | null = site;
  const scoped = new CellHistory({...options, currentSite: () => active});
  scoped.offer(report(), site, now); active = {...site, stationCode: 'BHE0021'};
  await scoped.drain(); assert.equal(scoped.view('millivolts', now).summary.total, 0);
  assert.equal((await scoped.query(query)).matchedFrames, 0, 'Site switch never returns previous site');
  active = null; assert.equal(scoped.view('millivolts', now).site, null); await scoped.close();
  const disabled = new CellHistory({...options, enabled: false}); disabled.offer(report(), site, now);
  await disabled.drain(); assert.equal(disabled.view('millivolts', now).storage.saved, 0); await disabled.close();
  const reserve = new CellHistory({...options, reserveBytes: Number.MAX_SAFE_INTEGER});
  reserve.offer(report(now + 300_000), site, now + 300_000); await reserve.drain();
  assert.match(reserve.view('millivolts', now).storage.lastError ?? '', /reserve/); await reserve.close();
  // Retention removes only generated frame files, not unrelated files in the same directory.
  await fs.writeFile(path.join(directory, folder, 'keep.txt'), 'untouched');
  history.offer(report(now + 8 * 86400_000), site, now + 8 * 86400_000); await history.drain();
  assert.equal(await fs.readFile(path.join(directory, folder, 'keep.txt'), 'utf8'), 'untouched');
  assert.equal((await history.query(query)).matchedFrames, 0); await history.close();
  // Bounded long-window projection includes both ends, without pretending to be full resolution.
  const many = new CellHistory({...options, currentSite: () => site});
  for (let i = 0; i < 181; i++) {
    const frame = await decodeCellReport(report(now + i * 60_000), site, now + i * 60_000);
    await fs.writeFile(path.join(directory, folder, `${frame.acquiredAt}.cells.json.gz`), gzipSync(JSON.stringify(frame)));
  }
  const sampled = await many.query({...query, to: now + 181 * 60_000});
  assert.equal(sampled.sampledFrames, 180); assert.equal(sampled.sampled, true);
  assert.equal(sampled.points[0].at, now); assert.equal(sampled.points.at(-1)?.at, now + 180 * 60_000);
  await many.close();
  // Enforce the disk cap without touching non-frame files.
  for (let i = 0; i < 5; i++) await fs.writeFile(path.join(directory, folder, `${now + i}.cells.json.gz`), Buffer.alloc(300_000, i));
  const capped = new CellHistory(options);
  capped.offer(report(now + 240 * 60_000), site, now + 240 * 60_000); await capped.drain();
  let bytes = 0;
  for (const name of await fs.readdir(path.join(directory, folder))) if (/\.cells\.json\.gz$/.test(name)) bytes += (await fs.stat(path.join(directory, folder, name))).size;
  assert.ok(bytes <= options.maxBytes, 'Generated frame bytes remain under the cap'); await capped.close();
} finally { await fs.rm(directory, {recursive: true, force: true}); }
console.log('Cell decoder, quality, persistence, isolation, retention, cancellation and rollback tests passed');
