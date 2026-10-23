// Offline full-site workload; temporary data is removed when the benchmark exits.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {CellHistory} from '../src/server/cells/CellHistory';
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'prizm-cell-benchmark-'));
const site = {stationCode: 'BENCHMARK', blockIndex: 1, emsBaseUrl: 'fixture://offline'};
const history = new CellHistory({directory, enabled: true, reserveBytes: 0});
const now = Date.now(), durations: number[] = [];
try {
  for (let sample = 0; sample < 30; sample++) {
    const at = now + sample * 60_000;
    const arrayReport = Object.fromEntries(Array.from({length: 8}, (_, a) => [String(a + 1), {cellGroupReportForArray: {
      timeStampLookup: [String(at)], millivoltsLookup: [3200 + sample, 3300 + sample], temperatureLookup: [240, 250],
      condensedCellReportForString: Object.fromEntries(Array.from({length: 40}, (_, s) => [String(s + 1), {
        stringIndex: s + 1, batteryPackCount: 14, cellGroupPerBatteryPackCount: 30, timestamps: Array(420).fill(0),
        millivolts: Array.from({length: 420}, (_, i) => i % 2), temperatures: Array(420).fill(0), ignoredTempSensors: [],
      }]))}}]));
    const start = performance.now(); history.offer({blockReport: {stationCode: site.stationCode, blockIndex: 1, timeStamp: String(at), arrayReport}}, site, at); await history.drain(); durations.push(performance.now() - start);
  }
  const start = performance.now();
  const query = await history.query({from: now - 1, to: now + 30 * 60_000, metric: 'millivolts', ids: ['A1-S1-B1-C1', 'A8-S40-B14-C30']});
  console.log(JSON.stringify({channels: history.view('millivolts', now + 29 * 60_000).summary.total, frames: query.sampledFrames,
    writeMeanMs: durations.reduce((sum, v) => sum + v, 0) / durations.length, writeMaxMs: Math.max(...durations),
    queryMs: performance.now() - start, responseBytes: Buffer.byteLength(JSON.stringify(query)), rssMiB: process.memoryUsage().rss / 1024 ** 2,
    failures: history.view('millivolts').storage.failures}, null, 2));
} finally {await history.close(); await fs.rm(directory, {recursive: true, force: true});}
