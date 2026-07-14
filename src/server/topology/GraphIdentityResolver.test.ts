import assert from 'node:assert/strict';
import { ObjectGraphBuilder, type ObjectGraphSnapshot } from '../../core/objectGraph';
import { GraphIdentityResolver, type GraphIdentityRuntimeAccess } from './GraphIdentityResolver';

const graph = new ObjectGraphBuilder({ now: () => new Date('2026-01-01T00:00:00.000Z') }).build({
  site: { siteId: 'BHE0020', name: 'Test Site' }, arrays: [{ arrayIndex: 1 }], energySegments: [{ arrayIndex: 1, energySegmentIndex: 1 }],
  strings: [{ arrayIndex: 1, stringIndex: 1, energySegmentIndex: 1 }, { arrayIndex: 1, stringIndex: 2, energySegmentIndex: 1 }],
  featherControllers: [{ deviceIp: '10.0.1.10', arrayIndex: 1, energySegmentIndex: 1 }], pcsControllers: [{ arrayIndex: 1, pcsIndex: 1 }],
  emsController: { deviceIp: '10.0.0.3', port: 8080, turtlePath: '/turtle' },
});
const snapshot = graph.snapshot('2026-01-01T00:00:00.000Z');

function access(value: ObjectGraphSnapshot = snapshot): GraphIdentityRuntimeAccess {
  return { getSnapshot: () => value, getFingerprint: () => 'graph-fingerprint-test', getCycleId: () => 77, ensure: async () => undefined };
}

async function withMode<T>(mode: string | undefined, operation: () => Promise<T>): Promise<T> {
  const previous = process.env.PRIZM_GRAPH_IDENTITY_MODE;
  if (mode == null) delete process.env.PRIZM_GRAPH_IDENTITY_MODE; else process.env.PRIZM_GRAPH_IDENTITY_MODE = mode;
  try { return await operation(); } finally { if (previous == null) delete process.env.PRIZM_GRAPH_IDENTITY_MODE; else process.env.PRIZM_GRAPH_IDENTITY_MODE = previous; }
}

async function run(): Promise<void> {
  const resolver = new GraphIdentityResolver(access()); await resolver.prepare();
  assert.equal(resolver.resolveString({ arrayIndex: 1, stringIndex: 1 })?.canonicalKey, 'string:BHE0020:1:1');
  assert.equal(resolver.resolveString({ stringKey: 'S[ST:BHE0020,B:1,A:1,S:2]' })?.stringIndex, 2);
  assert.equal(resolver.resolveString({ canonicalKey: 'string:BHE0020:1:1' })?.stringIndex, 1);
  assert.equal(resolver.resolveEnergySegment({ arrayIndex: 1, energySegmentIndex: 1 })?.energySegmentIndex, 1);
  assert.equal(resolver.resolveArray({ arrayIndex: 1 })?.displayName, 'Array 1');
  assert.equal(resolver.resolveFeather({ controllerIp: '10.0.1.10' })?.energySegmentIndex, 1);
  assert.equal(resolver.resolvePCS({ arrayIndex: 1, pcsIndex: 1 })?.pcsIndex, 1);
  assert.equal(resolver.resolveEMS({ controllerIp: '10.0.0.3' })?.port, 8080);
  assert.ok(Object.isFrozen(resolver.resolveString({ arrayIndex: 1, stringIndex: 1 })), 'resolved identity is immutable');

  const routePayload = { cycleId: 77, data: [{ arrayIndex: 1, stringIndex: 1, stringKey: 'S[ST:BHE0020,B:1,A:1,S:1]', soc: 50 }] };
  await withMode(undefined, async () => {
    const hybrid = new GraphIdentityResolver(access()); const result = await hybrid.applyRouteIdentity('GET /api/local/strings', routePayload);
    assert.deepEqual(result, routePayload); assert.notEqual(result, routePayload, 'hybrid success uses graph-backed identity copy');
    const report = hybrid.report(); assert.equal(report.mode, 'hybrid'); assert.equal(report.routes['GET /api/local/strings'].matches, 1); assert.equal(report.graphUsageCount, 1); assert.equal(report.fallbackCount, 0); assert.equal(report.graphCycleId, 77); assert.equal(report.graphFingerprint, 'graph-fingerprint-test');
  });
  await withMode('hybrid', async () => {
    const dashboard = { cycleId: 77, strings: [{ id: 'A1-S1', arrayNumber: 1, stringNumber: 1, stringKey: 'A1-S1', arrayIndex: 1, stringIndex: 1, energySegmentNumber: 1, containerNumber: 1, socPct: 51, identity: { arrayIndex: 1, stringNumber: 1, canonicalKey: 'array:1:string:1', displayName: 'A1-S1', localEsNumber: 1, featherIp: '10.0.1.10' } }] };
    const siteOperations = { cycleId: 77, site: { stationCode: 'BHE0020', emsBaseUrl: 'http://10.0.0.3:8080/turtle' }, stringSummary: { tableRows: [{ arrayIndex: '1', stringIndex: '1', stringKey: 'S[ST:BHE0020,B:1,A:1,S:1]', soc: 52 }] }, arraySummary: [{ arrayIndex: 1, friendlyString: 'Array BHE0020:1:1' }], arrays: [{ arrayIndex: 1, friendlyString: 'Array BHE0020:1:1' }], featherSummary: { devices: [{ deviceIp: '10.0.1.10', arrayIndex: 1, stringIndex: 1, temperature: 25 }] }, pcsSummary: [{ arrayIndex: 1, pcsIndex: 1, kw: 100 }] };
    const routeResolver = new GraphIdentityResolver(access());
    assert.deepEqual(await routeResolver.applyRouteIdentity('GET /api/local/strings/dashboard', dashboard), dashboard, 'dashboard contract and telemetry remain unchanged');
    assert.deepEqual(await routeResolver.applyRouteIdentity('GET /api/local/site-operations/summary', siteOperations), siteOperations, 'site-operations contract and telemetry remain unchanged');
    assert.equal(routeResolver.report().routes['GET /api/local/strings/dashboard'].fallbacks, 0); assert.equal(routeResolver.report().routes['GET /api/local/site-operations/summary'].fallbacks, 0);
  });
  await withMode('hybrid', async () => {
    const hybrid = new GraphIdentityResolver(access()); const invalid = { data: [{ arrayIndex: 9, stringIndex: 1, soc: 50 }] }; const result = await hybrid.applyRouteIdentity('GET /api/local/strings', invalid);
    assert.equal(result, invalid, 'hybrid mismatch automatically rolls back to legacy payload'); assert.equal(hybrid.report().fallbackCount, 1); assert.equal(hybrid.report().identityMismatches, 1);
  });
  await withMode('graph', async () => {
    const graphOnly = new GraphIdentityResolver(access()); const result = await graphOnly.applyRouteIdentity('GET /api/local/strings', routePayload);
    assert.deepEqual(result, routePayload); assert.ok(graphOnly.report().legacyLookups > 0, 'guarded graph mode keeps parity comparison active'); assert.equal(graphOnly.report().graphUsageCount, 1); assert.equal(graphOnly.report().effectiveMode, 'hybrid');
  });
  await withMode('legacy', async () => {
    let ensured = 0; const legacy = new GraphIdentityResolver({ ...access(), getSnapshot: () => null, ensure: async () => { ensured += 1; } }); const result = await legacy.applyRouteIdentity('GET /api/local/strings', routePayload);
    assert.equal(result, routePayload); assert.equal(ensured, 0); assert.equal(legacy.report().graphLookups, 0); assert.equal(legacy.report().legacyUsageCount, 1);
  });

  const array = snapshot.objects.find((object) => object.kind === 'array')!;
  const duplicate = Object.freeze({ ...array, id: `${array.id}:duplicate`, canonicalKey: `${array.canonicalKey}:duplicate` });
  const duplicateSnapshot = { ...snapshot, objects: Object.freeze([...snapshot.objects, duplicate]) } as ObjectGraphSnapshot;
  const duplicateResolver = new GraphIdentityResolver(access(duplicateSnapshot)); await duplicateResolver.prepare(); assert.equal(duplicateResolver.report().duplicateIdentities, 1);
  assert.equal(resolver.resolveString({ arrayIndex: 9, stringIndex: 9 }), null); assert.ok(resolver.report().missingIdentities >= 1);
  console.log('GraphIdentityResolver tests passed');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
