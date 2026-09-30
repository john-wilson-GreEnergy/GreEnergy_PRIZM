import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { inventoryApi, type Inventory } from './apiInventory';
import { routeClassifications, type FamilyClassification } from './routeClassifications';

export function assessClassifications(inventory: Inventory, families: readonly FamilyClassification[], hashFor: (file: string) => string | null) {
  const classified = new Set<number>();
  const reviewedRoutes: { method: string; path: string; file: string; capabilities: readonly string[]; effect: string; caveat: string }[] = [];
  const findings: string[] = [];
  const keys = new Set<string>();
  for (const family of families) {
    const current = hashFor(family.file);
    for (const route of family.routes) {
      const key = `${route.method} ${route.path}`;
      if (keys.has(key)) { findings.push(`Duplicate classification: ${key}`); continue; }
      keys.add(key);
      const matches = inventory.routes.flatMap((entry, index) => entry.method === route.method && entry.path === route.path ? [index] : []);
      if (matches.length !== 1 || inventory.routes[matches[0]]?.file !== family.file) {
        findings.push(`Missing, moved or ambiguous registration: ${key}`); continue;
      }
      if (current !== family.sha256) { findings.push(`Source changed/unavailable: ${key}`); continue; }
      classified.add(matches[0]);
      reviewedRoutes.push({ ...route, file: family.file, caveat: family.caveat });
    }
  }
  return {
    disposition: 'NOT A RELEASE APPROVAL',
    literalRegistrations: inventory.routes.length,
    handlerClassified: classified.size,
    reviewedRoutes,
    unclassified: inventory.routes.filter((_, index) => !classified.has(index)).map(route => ({ method: route.method, path: route.path, file: route.file, line: route.line })),
    findings,
    unresolvedRegistrations: inventory.findings,
    middlewareReviewRequired: inventory.middleware,
    unmountedRouters: inventory.unmountedRouters,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const entry = path.resolve(process.argv[2] ?? 'server.ts');
  const inventory = inventoryApi(entry);
  const result = assessClassifications(inventory, routeClassifications, file => {
    try { return createHash('sha256').update(readFileSync(path.resolve(path.dirname(entry), file))).digest('hex'); }
    catch { return null; }
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  // Middleware and unresolved paths are never silently considered reviewed.
  if (result.findings.length || result.unclassified.length || result.unresolvedRegistrations.length || result.middlewareReviewRequired.length || result.unmountedRouters.length) process.exitCode = 1;
}
