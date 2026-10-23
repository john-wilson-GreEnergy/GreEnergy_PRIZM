import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import Panel from './SafetyFaultCandidatesPanel';
import {candidateSignature, selectedSafetyCandidates, clearSelectedSafetyFaults, type SafetyCandidate, type ClearOutcome} from '../lib/safetyFaultSelection';
import {safetyFaultEquipment} from '../server/safetyFaultIdentity';

const first: SafetyCandidate = {entityKeyToken: 'A1', displayKey: 'Array 1 ES2 controller', resetEntityKey: 'raw-A1',
  statusMessage: 'Door interlock requires manual reset', allowFaultReset: true, enabled: true, communicating: true,
  equipment: {array: 'Array 1', segment: 'ES2', controller: 'Door controller'}};
const second = {...first, entityKeyToken: 'A2', displayKey: 'Array 2 ES2 controller'};
const offline = {...first, entityKeyToken: 'A3', communicating: false};
const conflicted = {...first, resetBlockedReason: 'Reset reports disagree or are incomplete; refresh and review before clearing.'};
const selected = Object.fromEntries([first, second, offline].map(c => [c.entityKeyToken, candidateSignature(c)]));
assert.deepEqual(selectedSafetyCandidates([first, second, offline, first], selected), [first, second]);
assert.equal(selectedSafetyCandidates([{...first, statusMessage: 'Different fault'}], selected).length, 0);
assert.equal(selectedSafetyCandidates([{...first, allowFaultReset: false}], selected).length, 0);
assert.equal(selectedSafetyCandidates([second], {[first.entityKeyToken]: candidateSignature(first)}).length, 0);
assert.deepEqual(safetyFaultEquipment({}, 'SK-ST:TEST-B:1-A:4-S:5', ''), {array:'Array 4',segment:'ES3 / String 5',controller:'Controller not reported'});
assert.equal(safetyFaultEquipment({}, 'OCDK-ST:BHE0020-B:1-OCD:7507', '').array, 'Array not reported');
assert.equal(safetyFaultEquipment({energySegmentIndex: 7, arrayIndex: 2, controllerName: 'ES controller'}, '', '').segment, 'ES7');
const html = renderToStaticMarkup(<Panel candidates={[first, offline]} profileId="fixture"/>);
for (const text of ['Safety fault candidates', 'Select all eligible', 'Clear selected', first.statusMessage, 'ES2', 'Door controller', 'Equipment not communicating']) assert(html.includes(text));
assert(!html.includes('Type confirmation'));
const conflictHtml = renderToStaticMarkup(<Panel candidates={[conflicted]} profileId="fixture"/>);
assert(conflictHtml.includes(conflicted.resetBlockedReason));
assert(conflictHtml.includes(first.statusMessage));
assert.match(conflictHtml, /disabled=""[^>]*>Clear selected/);
assert.equal(selectedSafetyCandidates([conflicted], selected).length, 0);
for (const props of [{readOnly:true}, {stale:true}, {unavailable:true}]) {
  const locked = renderToStaticMarkup(<Panel candidates={[first]} profileId="fixture" {...props}/>);
  assert.match(locked, /disabled=""[^>]*>Clear selected/);
}
const source = fs.readFileSync('src/components/SiteOperationsDashboard.tsx', 'utf8');
assert(source.indexOf('<SafetyFaultCandidatesPanel') < source.indexOf('<NotificationReviewPanel'));
assert(source.includes('legacySafetyView && <CollapsibleSection'));

const calls: string[] = [];
const outcomes: ClearOutcome[] = [];
let inFlight = 0;
const mock: typeof fetch = async (url, init) => {
  assert.equal(url, '/api/local/safety-fault-clear/execute');
  assert.equal(init?.method, 'POST');
  assert.equal(++inFlight, 1, 'commands must be sequential');
  const body = JSON.parse(String(init?.body)); calls.push(body.entityKeyToken);
  assert.equal(body.profileId, 'fixture'); assert.equal(body.confirmationText, 'CLEAR FAULT');
  assert.equal(body.expectedStatusMessage, first.statusMessage);
  await Promise.resolve(); inFlight--;
  return new Response(JSON.stringify({queued:true,verification:{appearsCleared:body.entityKeyToken==='A2'}}));
};
await clearSelectedSafetyFaults('fixture', [first, second, first, offline], mock, r => outcomes.push(r));
assert.deepEqual(calls, ['A1','A2']);
assert.deepEqual(outcomes.map(r=>r.state), ['queued','confirmed','rejected']);
for (const status of [401,403,409,423,500]) {
  let count = 0; const rows: ClearOutcome[] = [];
  await clearSelectedSafetyFaults('fixture', [first, second], async()=>{count++;return new Response(JSON.stringify({error:'Denied'}), {status});}, r=>rows.push(r));
  assert.equal(count,1); assert.equal(rows[1].state,'skipped'); assert.equal(rows[0].state,status===500?'unknown':'rejected');
}
let count = 0; const uncertain: ClearOutcome[] = [];
await clearSelectedSafetyFaults('fixture', [first,second], async()=>{count++;throw Error('connection lost');}, r=>uncertain.push(r));
assert.equal(count,1); assert.deepEqual(uncertain.map(r=>r.state),['unknown','skipped']);
await clearSelectedSafetyFaults('fixture',[first],async()=>{throw Error('Must not call');},()=>{},()=>false);
await clearSelectedSafetyFaults('',[first],async()=>{throw Error('Must not call');},()=>{});
let conflictRequests = 0;
const conflictOutcomes: ClearOutcome[] = [];
await clearSelectedSafetyFaults('fixture',[conflicted],async()=>{conflictRequests++;throw Error('Must not call');},r=>conflictOutcomes.push(r));
assert.equal(conflictRequests,0);
assert.equal(conflictOutcomes[0].state,'rejected');
console.log('Safety selection, rendering, identity, sequential dispatch and fail-closed tests passed (mock transport only).');
