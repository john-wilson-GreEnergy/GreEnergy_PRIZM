import assert from 'node:assert/strict';
import { ObjectGraphBuilder, type ObjectGraphSnapshot } from '../../core/objectGraph';
import { GraphIdentityReadinessTracker, GRAPH_IDENTITY_ROUTES } from './GraphIdentityReadiness';
import { GraphIdentityResolver, type GraphIdentityRuntimeAccess } from './GraphIdentityResolver';

const ENV_KEYS = ['PRIZM_GRAPH_IDENTITY_MODE', 'PRIZM_GRAPH_IDENTITY_PROMOTION_ENABLED', 'PRIZM_GRAPH_IDENTITY_MIN_MATCHES', 'PRIZM_GRAPH_IDENTITY_MIN_CYCLES', 'PRIZM_GRAPH_IDENTITY_MIN_DURATION_MS', 'PRIZM_GRAPH_IDENTITY_MAX_MISMATCHES', 'PRIZM_GRAPH_IDENTITY_REQUIRE_ALL_ROUTES', 'PRIZM_GRAPH_IDENTITY_FORCE_LEGACY', 'PRIZM_GRAPH_IDENTITY_DISABLE_GRAPH'] as const;

async function withEnvironment(values: Partial<Record<typeof ENV_KEYS[number], string>>, operation: () => Promise<void>): Promise<void> {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) { const value = values[key]; if (value == null) delete process.env[key]; else process.env[key] = value; }
  try { await operation(); } finally { for (const key of ENV_KEYS) { const value = previous[key]; if (value == null) delete process.env[key]; else process.env[key] = value; } }
}

const graph = new ObjectGraphBuilder({ now: () => new Date('2026-01-01T00:00:00.000Z') }).build({
  site: { siteId: 'BHE0020', name: 'Test Site' }, arrays: [{ arrayIndex: 1 }], energySegments: [{ arrayIndex: 1, energySegmentIndex: 1 }], strings: [{ arrayIndex: 1, stringIndex: 1, energySegmentIndex: 1 }], featherControllers: [], pcsControllers: [], emsController: { deviceIp: '10.0.0.3', port: 8080, turtlePath: '/turtle' },
});
const snapshot = graph.snapshot('2026-01-01T00:00:00.000Z');

function access(value: ObjectGraphSnapshot = snapshot): GraphIdentityRuntimeAccess {
  return { getSnapshot: () => value, getFingerprint: () => 'graph-A', getSourceFingerprint: () => 'source-A', getCycleId: () => 1, ensure: async () => undefined, getRuntimeState: () => 'READY_HYBRID', getRuntimeHealthy: () => true, getDiagnostics: () => ({ duplicates: 0, missing: 0, dangling: 0 }) };
}

async function run(): Promise<void> {
  let now = new Date('2026-01-01T00:00:00.000Z'); const tracker = new GraphIdentityReadinessTracker(4, () => now);
  await withEnvironment({ PRIZM_GRAPH_IDENTITY_MIN_MATCHES: '6', PRIZM_GRAPH_IDENTITY_MIN_CYCLES: '2', PRIZM_GRAPH_IDENTITY_MIN_DURATION_MS: '1000', PRIZM_GRAPH_IDENTITY_REQUIRE_ALL_ROUTES: 'true' }, async () => {
    for (const route of GRAPH_IDENTITY_ROUTES) tracker.record({ route, cycleId: 1, graphFingerprint: 'graph-A', sourceFingerprint: 'source-A', matches: 1, mismatches: 0, missing: 0, duplicates: 0, fallback: false, graphUsed: false, legacyUsed: false, latencyMs: 1 });
    assert.equal(tracker.report().readiness.ready, false); now = new Date('2026-01-01T00:00:01.100Z');
    for (const route of GRAPH_IDENTITY_ROUTES) tracker.record({ route, cycleId: 2, graphFingerprint: 'graph-A', sourceFingerprint: 'source-A', matches: 1, mismatches: 0, missing: 0, duplicates: 0, fallback: false, graphUsed: true, legacyUsed: false, latencyMs: 2 });
    const ready = tracker.report(); assert.equal(ready.readiness.ready, true); assert.equal(ready.readiness.consecutiveSuccessfulCycles, 2); assert.equal(ready.readiness.sustainedParityDurationMs, 1100); assert.equal(ready.parityHistorySummary.retained, 4); assert.ok(Object.isFrozen(ready));
    tracker.record({ route: GRAPH_IDENTITY_ROUTES[0], cycleId: 3, graphFingerprint: 'graph-A', sourceFingerprint: 'source-A', matches: 0, mismatches: 1, missing: 1, duplicates: 0, fallback: true, graphUsed: false, legacyUsed: true, latencyMs: 3, mismatchSample: 'missing string' });
    assert.equal(tracker.report().readiness.ready, false); assert.equal(tracker.report().readiness.consecutiveSuccessfulCycles, 0);
    tracker.record({ route: GRAPH_IDENTITY_ROUTES[0], cycleId: 4, graphFingerprint: 'graph-B', sourceFingerprint: 'source-B', matches: 1, mismatches: 0, missing: 0, duplicates: 0, fallback: false, graphUsed: false, legacyUsed: false, latencyMs: 1 });
    assert.equal(Object.keys(tracker.report().parityByRoute).length, 1, 'fingerprint changes reset route readiness'); assert.ok(tracker.report().readinessResets >= 1);
    tracker.reset(); assert.equal(tracker.report().parityHistorySummary.retained, 0);
  });

  const payload = { cycleId: 1, data: [{ arrayIndex: 1, stringIndex: 1, soc: 50 }] };
  await withEnvironment({ PRIZM_GRAPH_IDENTITY_MODE: 'graph', PRIZM_GRAPH_IDENTITY_MIN_MATCHES: '1', PRIZM_GRAPH_IDENTITY_MIN_CYCLES: '1', PRIZM_GRAPH_IDENTITY_MIN_DURATION_MS: '0', PRIZM_GRAPH_IDENTITY_REQUIRE_ALL_ROUTES: 'false' }, async () => {
    const resolver = new GraphIdentityResolver(access()); const before = structuredClone(payload); const result = await resolver.applyRouteIdentity('GET /api/local/strings', payload); assert.deepEqual(result, before); assert.deepEqual(payload, before); assert.equal(resolver.report().effectiveMode, 'graph'); assert.equal(resolver.report().graphOnlyEligible, true); assert.equal(resolver.report().graphOnlyUsageCount, 1);
    process.env.PRIZM_GRAPH_IDENTITY_FORCE_LEGACY = 'true'; process.env.PRIZM_GRAPH_IDENTITY_DISABLE_GRAPH = 'false'; await resolver.applyRouteIdentity('GET /api/local/strings', payload); assert.equal(resolver.report().effectiveMode, 'legacy');
    process.env.PRIZM_GRAPH_IDENTITY_FORCE_LEGACY = 'false'; process.env.PRIZM_GRAPH_IDENTITY_DISABLE_GRAPH = 'true'; await resolver.applyRouteIdentity('GET /api/local/strings', payload); assert.equal(resolver.report().effectiveMode, 'legacy');
  });
  console.log('GraphIdentityHardening tests passed');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
