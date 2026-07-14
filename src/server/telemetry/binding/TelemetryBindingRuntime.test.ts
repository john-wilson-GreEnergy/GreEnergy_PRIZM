import assert from 'node:assert/strict';
import { ObjectGraphBuilder } from '../../../core/objectGraph';
import { bindingFingerprint } from './TelemetryBindingSnapshot';
import { TelemetryBindingResolver, telemetryBindingSourceFingerprint, type TelemetryBindingBuildInput } from './TelemetryBindingResolver';
import { TelemetryBindingRuntime } from './TelemetryBindingRuntime';

const arrays = Array.from({ length: 8 }, (_, index) => ({ arrayIndex: index + 1 }));
const energySegments = arrays.flatMap(({ arrayIndex }) => Array.from({ length: 8 }, (_, index) => ({ arrayIndex, energySegmentIndex: index + 1 })));
const strings = arrays.flatMap(({ arrayIndex }) => Array.from({ length: 40 }, (_, index) => ({ arrayIndex, stringIndex: index + 1, energySegmentIndex: Math.floor(index / 5) + 1 })));
const graph = new ObjectGraphBuilder({ now: () => new Date('2026-07-14T00:00:00.000Z') }).build({ site: { siteId: 'BHE0020', name: 'BHE 0020' }, arrays, energySegments, strings, emsController: { deviceIp: '10.0.0.3', port: 8080, turtlePath: '/turtle' } }).snapshot('2026-07-14T00:00:00.000Z');
const rows = strings.map((row) => ({ ...row, soc: row.stringIndex, current: 1.5, observedAt: '2026-07-14T00:00:00.000Z', raw: { large: true } }));
const baseInput = (): TelemetryBindingBuildInput => ({ graph, graphFingerprint: bindingFingerprint(graph), graphSourceFingerprint: 'source-1', graphHealthy: true, graphCycleId: 40, profileIdentity: 'profile-a', telemetryProfileIdentity: 'profile-a', cycleId: 41, capturedAt: '2026-07-14T00:00:01.000Z', strings: rows, controllerHealth: { connected: true, latencyMs: 12 }, authorities: { 'string-telemetry': { chosenProviderId: 'turtle', stale: false }, 'controller-health': { chosenProviderId: 'turtle', stale: false } }, providerHealth: { turtle: { healthy: true } } });

const input = baseInput(); const before = structuredClone(input.strings); const graphBefore = structuredClone(graph); const snapshot = await new TelemetryBindingResolver().build(input);
assert.equal(snapshot.countsByDomain['string-telemetry'], 320);
assert.equal(snapshot.countsByDomain['controller-health'], 1);
assert.equal(snapshot.cycleId, 41); assert.equal(snapshot.bindingsByDomain['string-telemetry'][0].producingCycleId, 41);
assert.equal(snapshot.readinessByDomain['string-telemetry'].ready, true); assert.equal(snapshot.readinessByDomain['controller-health'].ready, true);
assert.equal(Object.keys(snapshot.indexes.stringByCoordinate).length, 320); assert.equal(Object.keys(snapshot.indexes.stringsByEnergySegment).length, 64);
assert.equal(snapshot.bindingsByDomain['string-telemetry'][0].value.raw, undefined, 'raw source payload is excluded');
assert.deepEqual(input.strings, before, 'source payloads are not mutated'); assert.equal(Object.isFrozen(snapshot), true); assert.equal(Object.isFrozen(snapshot.indexes.stringByCoordinate), true);
assert.deepEqual(graph, graphBefore, 'graph objects are not mutated');
assert.equal(snapshot.bindingsByDomain['string-telemetry'][0].bindingId, (await new TelemetryBindingResolver().build(baseInput())).bindingsByDomain['string-telemetry'][0].bindingId, 'binding IDs are stable');
assert.equal(telemetryBindingSourceFingerprint(baseInput()), telemetryBindingSourceFingerprint(baseInput()), 'source fingerprint is deterministic');
assert.equal(telemetryBindingSourceFingerprint({ ...baseInput(), strings: rows.map((row) => ({ ...row, publishedAt: '2026-07-14T00:00:02Z' })) }), telemetryBindingSourceFingerprint({ ...baseInput(), strings: rows.map((row) => ({ ...row, publishedAt: '2026-07-14T00:00:03Z' })) }), 'publication timestamps are excluded from source fingerprints');
await assert.rejects(() => new TelemetryBindingResolver().build({ ...baseInput(), telemetryProfileIdentity: 'other-profile' }), /cross-profile-binding/);
const duplicate = await new TelemetryBindingResolver().build({ ...baseInput(), strings: [...rows, rows[0]] }); assert.equal(duplicate.duplicateBindingCount, 1); assert.equal(duplicate.readinessByDomain['string-telemetry'].ready, false);
const missing = await new TelemetryBindingResolver().build({ ...baseInput(), strings: rows.slice(1) }); assert.equal(missing.missingTelemetryCount, 1); assert.equal(missing.readinessByDomain['string-telemetry'].ready, false);

let calls = 0; let release: (() => void) | undefined;
const runtime = new TelemetryBindingRuntime({ collect: async () => { calls++; if (calls === 1) await new Promise<void>((resolve) => { release = resolve; }); return baseInput(); } });
const first = runtime.requestRebuild('one'); const second = runtime.requestRebuild('two'); release!(); const [firstSnapshot, secondSnapshot] = await Promise.all([first, second]);
assert.equal(calls, 1); assert.equal(firstSnapshot.bindingFingerprint, secondSnapshot.bindingFingerprint); assert.equal(runtime.metrics.snapshot().coalescedRebuilds, 1);
await runtime.requestRebuild('unchanged'); assert.equal(runtime.metrics.snapshot().skippedUnchangedRebuilds, 1);

let current = baseInput(); const changing = new TelemetryBindingRuntime({ collect: async () => current }); const good = await changing.requestRebuild('good'); current = { ...current, graphHealthy: false, cycleId: 42 }; const retained = await changing.requestRebuild('failure'); assert.equal(retained.bindingFingerprint, good.bindingFingerprint); assert.equal(changing.metrics.snapshot().retainedLastKnownGoodUse, 1); assert.equal(retained.bindingsByDomain['string-telemetry'][0].producingCycleId, 41); assert.equal(retained.bindingsByDomain['string-telemetry'][0].failureCycleId, 42); assert.equal(retained.bindingsByDomain['string-telemetry'][0].stale, true); assert.equal(retained.readinessByDomain['string-telemetry'].ready, false);
current = { ...baseInput(), cycleId: 43 }; const changed = await changing.requestRebuild('cycle-change'); assert.notEqual(changed.bindingSourceFingerprint, good.bindingSourceFingerprint);
changing.parity.compare('GET /api/local/strings', { data: rows.map(({ raw: _raw, ...row }) => row) }, changed); current = { ...baseInput(), cycleId: 44, graphFingerprint: 'changed-graph-fingerprint' }; const graphChanged = await changing.requestRebuild('graph-change'); assert.equal(graphChanged.graphFingerprint, 'changed-graph-fingerprint'); assert.equal(changing.parity.report().historyCount, 0, 'graph change resets parity history');

const originalMode = process.env.PRIZM_TELEMETRY_BINDING_MODE; const originalForce = process.env.PRIZM_TELEMETRY_BINDING_FORCE_LEGACY; const originalDisable = process.env.PRIZM_TELEMETRY_BINDING_DISABLE;
process.env.PRIZM_TELEMETRY_BINDING_MODE = 'bound'; process.env.PRIZM_TELEMETRY_BINDING_FORCE_LEGACY = 'true'; assert.equal(changing.effectiveMode, 'legacy'); process.env.PRIZM_TELEMETRY_BINDING_FORCE_LEGACY = 'false'; process.env.PRIZM_TELEMETRY_BINDING_DISABLE = 'true'; assert.equal(changing.effectiveMode, 'legacy'); delete process.env.PRIZM_TELEMETRY_BINDING_DISABLE; assert.equal(changing.effectiveMode, 'bound');
if (originalMode === undefined) delete process.env.PRIZM_TELEMETRY_BINDING_MODE; else process.env.PRIZM_TELEMETRY_BINDING_MODE = originalMode; if (originalForce === undefined) delete process.env.PRIZM_TELEMETRY_BINDING_FORCE_LEGACY; else process.env.PRIZM_TELEMETRY_BINDING_FORCE_LEGACY = originalForce; if (originalDisable === undefined) delete process.env.PRIZM_TELEMETRY_BINDING_DISABLE; else process.env.PRIZM_TELEMETRY_BINDING_DISABLE = originalDisable;

const routePayload = { data: rows.map(({ raw: _raw, ...row }) => row), cycleId: 41 }; const parityPayloadBefore = structuredClone(routePayload); await runtime.observeRoute('GET /api/local/strings', routePayload); assert.deepEqual(routePayload, parityPayloadBefore); assert.equal(runtime.parity.report().historyCount, 1); runtime.resetParity(); assert.equal(runtime.parity.report().historyCount, 0);
const controllerSnapshot = runtime.getLatestBindingSnapshot()!; const controllerValue = controllerSnapshot.bindingsByDomain['controller-health'][0].value; const controllerParity = runtime.parity.compare('GET /api/local/connection', { connected: controllerValue.connected, status: controllerValue.status }, controllerSnapshot); assert.equal(controllerParity.exact, true);
for (let index = 0; index < 105; index++) runtime.parity.compare('GET /api/local/connection', {}, controllerSnapshot); assert.equal(runtime.parity.report().historyCount, 100, 'parity history is bounded');

console.log('Telemetry binding runtime tests passed');
