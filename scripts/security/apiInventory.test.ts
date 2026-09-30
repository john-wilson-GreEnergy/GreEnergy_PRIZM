import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inventoryApi } from './apiInventory';

const directory = mkdtempSync(path.join(os.tmpdir(), 'prizm-inventory-test-'));
try {
  // Deliberately unexecutable source: scanning must never import it.
  writeFileSync(path.join(directory, 'entry.ts'), `
    import express from 'express';
    import { api as renamed } from './barrel';
    import { Router as createRouter } from 'express';
    throw new Error('NEVER EXECUTE APPLICATION SOURCE');
    const app = express();
    const local = createRouter();
    const unused = createRouter();
    unused.get('/not-mounted', handler);
    const alias = local;
    alias.get('/local', handler);
    app.use(['/api', '/alias'], renamed);
    app.use('/internal', local);
    if (process.env.DEMO) app.get('/mock', handler);
    app.use(middleware);
    app.get('setting');
    new Map().get('/not-a-route');
    app.route('/chain').get(handler).post(handler);
    app.get(['/a', '/b'], handler);
    app.get(dynamicPath, handler);
    app.post(/regex/, handler);
    app.use(dynamicMount, local);
  `);
  writeFileSync(path.join(directory, 'barrel.ts'), `export { default as api } from './router';`);
  writeFileSync(path.join(directory, 'router.ts'), `
    import express from 'express';
    import { leaf } from './leaf';
    const r = express.Router();
    r.use('/child', leaf);
    r.post('/write', handler);
    export default r;
  `);
  writeFileSync(path.join(directory, 'leaf.ts'), `
    import { Router } from 'express';
    export const leaf = Router();
    leaf.get('/read', handler);
    leaf.get('/duplicate', handler);
    leaf.get('/duplicate', otherHandler);
  `);
  const result = inventoryApi(path.join(directory, 'entry.ts'));
  assert.equal(result.routes.length, 14);
  const keys = result.routes.map(route => `${route.method} ${route.path}`);
  for (const route of ['GET /api/child/read', 'GET /alias/child/read', 'POST /api/write', 'POST /alias/write', 'GET /internal/local', 'GET /chain', 'POST /chain', 'GET /a', 'GET /b']) assert.ok(keys.includes(route), route);
  assert.equal(keys.filter(key => key === 'GET /api/child/duplicate').length, 2, 'Preserve duplicates for ordering review');
  assert.equal(result.findings.length, 3, 'Dynamic routes/mounts and regex paths must not silently disappear');
  assert.ok(result.findings.every(finding => finding.message.startsWith('Unresolved')));
  assert.equal(result.middleware.length, 1);
  assert.deepEqual(result.middleware[0].handlers, ['middleware']);
  assert.deepEqual(result.unmountedRouters.map(router => router.name), ['unused']);
  assert.deepEqual(result.routes.find(route => route.path === '/mock')?.registrationContext, ['if process.env.DEMO']);
  assert.ok(result.routes.every(route => route.review === 'required' && /^[a-f0-9]{64}$/.test(route.registrationHash)));
  assert.ok(result.routes.find(route => route.path === '/api/child/read')?.file === 'leaf.ts');
  const repeat = inventoryApi(path.join(directory, 'entry.ts'));
  assert.deepEqual(repeat, result, 'Deterministic inventory');
  writeFileSync(path.join(directory, 'empty.ts'), 'const notAnApp = new Map(); notAnApp.get("/fake");');
  assert.match(inventoryApi(path.join(directory, 'empty.ts')).findings[0].message, /No Express application/);
  console.log('API inventory: aliases, barrels, nested mounts, chains, duplicates, guards, unknown paths, non-execution and determinism passed.');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
