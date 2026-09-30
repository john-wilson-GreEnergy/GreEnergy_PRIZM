import assert from 'node:assert/strict';
import { assessClassifications } from './checkRouteClassifications';
import type { Inventory } from './apiInventory';
import { routeClassifications, type FamilyClassification } from './routeClassifications';
const family: FamilyClassification = { file: 'routes.ts', sha256: 'reviewed', caveat: 'test only', routes: [
  { method: 'POST', path: '/control', capabilities: ['controls.balancing'], effect: 'fake' },
] };
const inventory: Inventory = { schemaVersion: 1, entry: 'server.ts', middleware: [], findings: [], unmountedRouters: [], routes: [
  { method: 'POST', path: '/control', file: 'routes.ts', line: 1, handlers: [], registrationHash: 'hash', review: 'required', registrationContext: [] },
] };
assert.equal(assessClassifications(inventory, [family], () => 'reviewed').handlerClassified, 1);
for (const hash of ['changed', null]) assert.equal(assessClassifications(inventory, [family], () => hash).handlerClassified, 0);
assert.equal(assessClassifications({ ...inventory, routes: [] }, [family], () => 'reviewed').findings.length, 1);
assert.equal(assessClassifications({ ...inventory, routes: [...inventory.routes, ...inventory.routes] }, [family], () => 'reviewed').handlerClassified, 0);
assert.equal(assessClassifications({ ...inventory, routes: [{ ...inventory.routes[0], file: 'moved.ts' }] }, [family], () => 'reviewed').handlerClassified, 0);
assert.equal(assessClassifications(inventory, [family, family], () => 'reviewed').findings.length, 1);
assert.equal(assessClassifications({ ...inventory, routes: [...inventory.routes, { ...inventory.routes[0], path: '/new' }] }, [family], () => 'reviewed').unclassified.length, 1);
const routeKeys = routeClassifications.flatMap(f => f.routes.map(r => `${r.method} ${r.path}`));
assert.equal(routeKeys.length, 25);
assert.equal(new Set(routeKeys).size, routeKeys.length);
assert.ok(routeClassifications.every(f => /^[a-f0-9]{64}$/.test(f.sha256)));
console.log('Route classification tests passed: drift, ambiguity, missing/new routes, duplicate entries and catalogue uniqueness.');
