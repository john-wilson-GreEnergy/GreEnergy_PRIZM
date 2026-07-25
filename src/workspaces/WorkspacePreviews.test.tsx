import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEMO_FAN_RESULTS, DEMO_HEAT_POINTS, DEMO_HVAC_SIMULATION } from './demoFixtures';
import { ActiveBanner, DataStateBanner, PreviewControl, Unknown } from './WorkspaceComponents';
import { activeWorkflowState, dataState, diagnosticFetchPolicy, engineeringDiagnostics, heatMapPoints, operatorRoutePolicy, prioritizeOperatorIssues, technicianShortcuts, toggleNumericSelection, workspaceRoleFromLocation } from './workspaceModels';

console.log('Running role workspace preview tests...');
assert.equal(workspaceRoleFromLocation('?workspace=operator', 'engineering'), 'operator');
assert.equal(workspaceRoleFromLocation('', 'technician'), 'technician');
assert.equal(workspaceRoleFromLocation('?workspace=invalid', null), 'legacy');

const issues = prioritizeOperatorIssues({ normalized: { strings: [
  { arrayIndex: 1, stringIndex: 2, warningCount: 1 }, { arrayIndex: 1, stringIndex: 1, communicating: false }, { arrayIndex: 1, stringIndex: 3, alarmCount: 1 },
] } });
assert.deepEqual(issues.map((issue) => issue.severity), ['critical', 'alarm', 'warning']);
assert.deepEqual(technicianShortcuts().map((item) => item.id), ['fan', 'hvac', 'heat', 'balancer', 'contactor', 'io', 'modbus']);

for (const definition of engineeringDiagnostics()) {
  assert.equal(diagnosticFetchPolicy(definition.endpoint, false), 'idle', `${definition.id} must be lazy`);
  assert.equal(diagnosticFetchPolicy(definition.endpoint, true), 'fetch', `${definition.id} must be an approved read`);
  assert.doesNotMatch(definition.endpoint, /(reset|refresh|apply|execute|clear|control)/i);
}
assert.equal(diagnosticFetchPolicy('/api/local/hvac-simulation/apply', true), 'idle');

const controls = renderToStaticMarkup(<PreviewControl reason="No execution">Start test</PreviewControl>);
assert.match(controls, /disabled=""/); assert.match(controls, /Preview only/);
assert.match(renderToStaticMarkup(<ActiveBanner kind="simulation" label="HVAC 1" restoring/>), /Active simulation/);
assert.match(renderToStaticMarkup(<ActiveBanner kind="test" label="Balancer"/>), /Active test/);
const workflow = activeWorkflowState({ diagnosticSession: { active: true }, hvacSimulation: { active: true, target: 'Feather 1', restoring: true } });
assert.equal(workflow.testActive, true); assert.equal(workflow.simulationActive, true); assert.equal(workflow.restoring, true);

const points = heatMapPoints([{ arrayIndex: 2, stringIndex: 4, maxCellTempC: 31.4, warningCount: 1, sourcePath: 'turtle' }], 'maxCellTemperature');
assert.equal(points[0].id, '2:4'); assert.equal(points[0].value, 31.4); assert.equal(points[0].source, 'turtle');
let selected = toggleNumericSelection(new Set<number>(), 4); assert.equal(selected.has(4), true); selected = toggleNumericSelection(selected, 4); assert.equal(selected.has(4), false);

assert.equal(dataState({ liveStatus: { state: 'CACHED', stale: true } }, null), 'stale');
assert.match(renderToStaticMarkup(<DataStateBanner state="stale"/>), /Stale/);
assert.match(renderToStaticMarkup(<DataStateBanner state="unknown"/>), /unknown/);
assert.match(renderToStaticMarkup(<Unknown/>), /Unavailable/);
assert.equal(DEMO_HEAT_POINTS.every((point) => point.demo), true);
assert.match(JSON.stringify({ DEMO_FAN_RESULTS, DEMO_HVAC_SIMULATION }), /DEMO/g);

const operatorEndpoints = operatorRoutePolicy();
assert.deepEqual(operatorEndpoints, ['/api/local/workspaces/operator']);
assert.equal(operatorEndpoints.some((endpoint) => endpoint.includes('/debug/') || /(control|apply|execute)/i.test(endpoint)), false);
console.log('Role workspace preview tests passed!');
