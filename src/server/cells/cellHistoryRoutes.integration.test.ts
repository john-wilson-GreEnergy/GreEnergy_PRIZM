// Loopback-only integration; no equipment providers or production profiles are imported.
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {once} from 'node:events';
import type {AddressInfo} from 'node:net';
import {CellHistory} from './CellHistory';
import {createCellHistoryRouter} from './cellHistoryRoutes';
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'prizm-cell-route-'));
const history = new CellHistory({directory, enabled: false});
const app = express(); app.use('/cells', createCellHistoryRouter(history));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/cells`;
try {
  const view = await fetch(base); assert.equal(view.status, 200); assert.equal(view.headers.get('cache-control'), 'no-store');
  assert.equal((await view.json()).storage.enabled, false);
  assert.equal((await fetch(base + '?metric=amps')).status, 400);
  assert.equal((await fetch(base + '?array=-1')).status, 400);
  assert.equal((await (await fetch(base+'/index')).json()).total,0);
  for(const query of ['?limit=1001','?limit=-1','?after=oops','?path=../','?limit=1&limit=2','?from=3&to=2'])assert.equal((await fetch(base+'/index'+query)).status,400);
  assert.equal((await fetch(base+'/index',{method:'POST'})).status,404);
  assert.equal((await fetch(base + '/snapshot?array=1&metric=millivolts')).status, 400, 'Disabled recorder cannot expose cells');
  assert.equal((await fetch(base + '/snapshot?metric=millivolts')).status, 400);
  assert.equal((await fetch(base + '/snapshot?array=1&at=-1')).status, 400);
  assert.equal((await fetch(base + '/snapshot', {method: 'POST'})).status, 404);
  assert.equal((await fetch(base + '/history?metric=millivolts&from=1&to=2&ids=../secret')).status, 400);
  assert.equal((await fetch(base + '/history?metric=millivolts&from=1&to=2')).status, 200);
  assert.equal((await fetch(base, {method: 'POST'})).status, 404, 'No mutation endpoint exists');
} finally {server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await history.close(); await fs.rm(directory, {recursive: true, force: true});}
console.log('Cell history passive HTTP routes, validation, cache policy and disabled mode passed');
