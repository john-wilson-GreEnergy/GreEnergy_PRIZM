import assert from 'node:assert/strict';
import { ObjectGraphBuilder } from '../../../core/objectGraph';
import { BindingParityHarness, projectGraphBindingParityRows, projectLegacyBindingParityRows, type BindingParityPipeline, type BindingParityRow } from './BindingParityHarness';

const graph = new ObjectGraphBuilder({ now: () => new Date('2026-07-15T00:00:00.000Z') }).build({
  site: { siteId: 'BHE0020', name: 'BHE 0020' },
  arrays: [{ arrayIndex: 1 }], energySegments: [{ arrayIndex: 1, energySegmentIndex: 1 }],
  strings: [1, 2, 3].map((stringIndex) => ({ arrayIndex: 1, stringIndex, energySegmentIndex: 1 })),
}).snapshot('2026-07-15T00:00:00.000Z');
const brokerSnapshot = { cycleId: 71, capturedAt: '2026-07-15T00:00:00.000Z', authorities: { 'string-telemetry': { chosenProviderId: 'turtle', stale: false } }, health: { turtle: { healthy: true } }, unified: { stringTelemetry: { rows: [1, 2, 3].map((stringIndex) => ({ raw: { arrayIndex: 1, stringIndex, stringKey: `A1-S${stringIndex}`, soc: 50 + stringIndex, voltage: 900 + stringIndex, temperature: 30 + stringIndex, current: stringIndex, warnings: [], alarms: [], contactor: true, rotation: 'in', status: 'online', state: null, timestamp: `2026-07-15T00:00:0${stringIndex}.000Z`, optional: undefined } })) } } };
const harness = new BindingParityHarness(); const base = { brokerSnapshot, graph, graphFingerprint: 'graph-1', graphSourceFingerprint: 'source-1' };

let legacyInput: unknown; let bindingInput: unknown;
const observeLegacy: BindingParityPipeline = (snapshot, value) => { legacyInput = snapshot; assert.equal(Object.isFrozen(snapshot), true); assert.equal(Object.isFrozen((snapshot.unified as object)), true); return projectLegacyBindingParityRows(snapshot, value); };
const observeBinding: BindingParityPipeline = (snapshot, value) => { bindingInput = snapshot; return projectGraphBindingParityRows(snapshot, value, 'graph-1', 'source-1'); };
const identical = await harness.run({ ...base, legacyPipeline: observeLegacy, bindingPipeline: observeBinding });
assert.equal(legacyInput, bindingInput, 'both pipelines receive the exact same frozen snapshot object'); assert.equal(identical.pass, true); assert.equal(identical.rows.legacy, 3); assert.equal(identical.byteIdenticalObjects, 3); assert.deepEqual(identical.perFieldMismatchHistogram, {});

const change = (field: string, value: unknown): BindingParityPipeline => async (snapshot, objectGraph) => { const rows = await projectGraphBindingParityRows(snapshot, objectGraph, 'graph-1', 'source-1'); return rows.map((row, index) => index === 0 ? { ...row, value: { ...row.value, [field]: value } } : row); };
const temperature = await harness.run({ ...base, bindingPipeline: change('temperature', 99) }); assert.equal(temperature.pass, false); assert.equal(temperature.perFieldMismatchHistogram['value.temperature'], 1);
const voltage = await harness.run({ ...base, bindingPipeline: change('voltage', 999) }); assert.equal(voltage.pass, false); assert.equal(voltage.perFieldMismatchHistogram['value.voltage'], 1);
const missing = await harness.run({ ...base, bindingPipeline: async (snapshot, objectGraph) => (await projectGraphBindingParityRows(snapshot, objectGraph, 'graph-1', 'source-1')).slice(1) }); assert.equal(missing.missingRows, 1); assert.equal(missing.pass, false);
const duplicate = await harness.run({ ...base, bindingPipeline: async (snapshot, objectGraph) => { const rows = await projectGraphBindingParityRows(snapshot, objectGraph, 'graph-1', 'source-1'); return [...rows, rows[0]]; } }); assert.equal(duplicate.duplicateRows.binding, 1); assert.equal(duplicate.pass, false);
const identity = await harness.run({ ...base, bindingPipeline: async (snapshot, objectGraph) => { const rows = [...await projectGraphBindingParityRows(snapshot, objectGraph, 'graph-1', 'source-1')]; return [{ ...rows[0], canonicalKey: 'string:BHE0020:9:9' }, ...rows.slice(1)] as BindingParityRow[]; } }); assert.ok(identity.identityMismatches > 0); assert.equal(identity.pass, false);
const timestampOnly = await harness.run({ ...base, legacyPipeline: () => [{ canonicalKey: 'string:BHE0020:1:1', arrayIndex: 1, energySegmentId: 'energy-segment:BHE0020:1:1', stringIndex: 1, value: { soc: 51, timestamp: '2026-07-15T00:00:01Z', generatedAt: 'one' } }], bindingPipeline: () => [{ canonicalKey: 'string:BHE0020:1:1', arrayIndex: 1, energySegmentId: 'energy-segment:BHE0020:1:1', stringIndex: 1, value: { soc: 51, timestamp: '2026-07-15T00:00:02Z', generatedAt: 'two' } }] }); assert.equal(timestampOnly.pass, true, 'timestamp-only changes are ignored');

console.log('Binding parity harness tests passed');
