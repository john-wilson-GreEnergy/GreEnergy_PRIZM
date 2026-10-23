// Disposable, loopback-only UI fixture. No EMS clients, profiles, credentials or controls.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import {build} from 'esbuild';
import {CellHistory} from '../src/server/cells/CellHistory';
import {createCellHistoryRouter} from '../src/server/cells/cellHistoryRoutes';
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'prizm-cell-preview-'));
const publicDirectory = path.join(directory, 'public'); await fs.mkdir(publicDirectory);
const site = {stationCode: 'SIMULATED', blockIndex: 1, emsBaseUrl: 'fixture://offline'};
const history = new CellHistory({directory: path.join(directory, 'data'), enabled: true, reserveBytes: 0, workerQueries:true});
const now = Date.now();
for (let sample = 0; sample < 60; sample++) {
  const at = now - (59 - sample) * 60_000;
  const arrayReport = Object.fromEntries(Array.from({length: 8}, (_, a) => [String(a + 1), {cellGroupReportForArray: {
    millivoltsLookup: Array.from({length: 128}, (_, i) => 3250 + a * 5 + i + Math.round(Math.sin(sample / 8) * 10)),
    temperatureLookup: Array.from({length: 128}, (_, i) => 240 + a * 10 + i + Math.round(Math.sin(sample / 8) * 10)),
    timeStampLookup: [String(a === 3 && sample >= 25 && sample <= 27 ? at - 600_000 : at)], condensedCellReportForString: Object.fromEntries(Array.from({length: 40}, (_, s) => s + 1).map(s => [String(s), {
      stringIndex: s, batteryPackCount: 14, cellGroupPerBatteryPackCount: 30,
      timestamps: Array(420).fill(0),
      millivolts: Array.from({length: 420}, (_, i) => (s === 18 ? (Math.floor(i / 30) === 6 ? 8 : Math.floor(i / 30) === 13 ? 16 : 100) : 72 + s % 9) + Math.round(Math.sin(i * .9 + s) * 2)),
      temperatures: Array.from({length: 420}, (_, i) => 30 + s % 8 + Math.round(Math.sin(i / 50) * 8)), ignoredTempSensors: [],
    }]))}}]));
  history.offer({blockReport: {...site, timeStamp: String(at), arrayReport}}, site, at); await history.drain();
}
await build({stdin: {contents: `import React from 'react';import {createRoot} from 'react-dom/client';import CellHistoryWorkspace from './src/components/CellHistoryWorkspace';import {SiteDataProvider} from './src/context/SiteDataContext';createRoot(document.getElementById('root')).render(<SiteDataProvider><div style={{background:'#fef3c7',padding:12,textAlign:'center',fontFamily:'sans-serif'}}>SIMULATED CELL HISTORY · No equipment connected</div><CellHistoryWorkspace/></SiteDataProvider>);`, resolveDir: process.cwd(), loader: 'tsx'}, bundle: true, platform: 'browser', format: 'esm', outfile: path.join(publicDirectory, 'preview.js')});
const app = express();
app.use('/api/local/site-data/cells', createCellHistoryRouter(history));
app.get('/api/local/site-data/snapshot', (_req, res) => res.json({siteIdentity: {stationCode: 'SIMULATED', blockIndex: 1}, normalized: {}, lastUpdated: new Date().toISOString()}));
app.get('/api/*', (_req, res) => res.json({}));
app.use(express.static(publicDirectory));
app.get('/', (_req, res) => res.send('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cell History Preview · SIMULATED</title><link rel="stylesheet" href="/preview.css"><style>body{margin:0;background:#f6f8fa;font-family:Arial,sans-serif}*{box-sizing:border-box}</style></head><body><div id="root"></div><script type="module" src="/preview.js"></script></body></html>'));
const port = Number(process.env.PRIZM_CELL_PREVIEW_PORT || 3198);
const server = app.listen(port, '127.0.0.1', () => console.log(`SIMULATED preview http://127.0.0.1:${port}/`));
async function stop() { server.closeAllConnections(); server.close(); await history.close(); await fs.rm(directory, {recursive: true, force: true}); process.exit(0); }
process.once('SIGTERM', stop); process.once('SIGINT', stop);
