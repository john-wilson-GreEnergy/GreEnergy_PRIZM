import assert from 'node:assert/strict';
import { buildTopologyGraph, createTopologySourceSnapshot } from './LiveTopologyAdapter';
import { compareTopologyGraph } from './TopologyGraphParity';
import { TopologyGraphRuntime } from './TopologyGraphRuntime';
import { TopologyGraphMetrics } from './TopologyGraphMetrics';
import type { LiveTopologyInputs } from './LiveTopologyAdapter';
import type { SiteTopologyDevice, SiteTopologyProfile } from './siteTopologyEngine';

const topologyProfile: SiteTopologyProfile = {
  id: 'test-stack750', name: 'Test Stack 750', stationCode: 'BHE0020', blockIndex: 1, siteName: 'Test Site', customer: 'Test Customer', layoutFamily: 'stack750_800', equipmentModel: 'centipede', uiMode: 'lineup',
  assumptions: { arrayCount: 8, energySegmentsPerArray: 20, collectionSegmentsPerArray: 1, stringsPerEnergySegment: 2, pcsCount: 1, baseSubnet: '10.0.0.0/16' },
  ipPlan: { subnet: '10.0.0.0/16', arrayThirdOctetMode: 'array-index', stack750: { feather: { collectionSegmentLastOctet: 3, energySegmentStartLastOctet: 10, energySegmentStep: 5 } } },
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', source: 'user-configured',
};

function device(value: Partial<SiteTopologyDevice> & Pick<SiteTopologyDevice, 'id' | 'deviceType' | 'ip' | 'label'>): SiteTopologyDevice {
  return { stationCode: 'BHE0020', blockIndex: 1, layoutFamily: 'stack750_800', segmentType: 'NONE', expected: true, discovered: false, source: 'generated', capabilities: { hasStrings: false, hasCellVoltage: false, hasCellTemperature: false, hasHvac: false, hasOpenClosedDetectors: false, hasPcsTelemetry: false, hasBmsTelemetry: false, hasStackTelemetry: false, hasContainerTelemetry: false }, ...value };
}

function expectedDevices(): SiteTopologyDevice[] {
  const values: SiteTopologyDevice[] = [];
  for (let arrayIndex = 1; arrayIndex <= 8; arrayIndex += 1) {
    values.push(device({ id: `pcs_arr_${arrayIndex}_1`, deviceType: 'pcs', ip: `10.0.${arrayIndex}.1`, label: `A${arrayIndex} PCS`, arrayIndex }));
    values.push(device({ id: `cs_arr_${arrayIndex}`, deviceType: 'collection-segment-feather', ip: `10.0.${arrayIndex}.3`, label: `A${arrayIndex} CS`, arrayIndex, segmentType: 'CS' }));
    for (let energySegmentIndex = 1; energySegmentIndex <= 20; energySegmentIndex += 1) values.push(device({ id: `es_arr_${arrayIndex}_es_${energySegmentIndex}`, deviceType: 'energy-segment-feather', ip: `10.0.${arrayIndex}.${10 + ((energySegmentIndex - 1) * 5)}`, label: `A${arrayIndex} ES${energySegmentIndex}`, arrayIndex, energySegmentIndex, segmentType: 'ES' }));
  }
  return values;
}

function inputs(overrides: Partial<LiveTopologyInputs> = {}): LiveTopologyInputs {
  return { collectedAt: '2026-01-02T00:00:00.000Z', cycleId: 42, connectionProfile: { id: 'connection', profileName: 'Connection', siteName: 'Test Site', stationCode: 'BHE0020', emsHost: '10.0.0.3', emsPort: 8080, turtlePath: '/turtle', arrayCount: 8, stringsPerArray: 40, updatedAt: '2026-01-01T00:00:00.000Z' }, topologyProfile, expectedDevices: expectedDevices(), cachedStrings: [], stringIpMap: [], cachedFeathers: [], ...overrides };
}

async function run(): Promise<void> {
  const source = createTopologySourceSnapshot(inputs());
  const graph = buildTopologyGraph(source); const snapshot = graph.snapshot(source.generatedAt); const parity = compareTopologyGraph(source, snapshot, '2026-01-02T00:00:01.000Z');
  assert.equal(snapshot.countsByKind.site, 1); assert.equal(snapshot.countsByKind.array, 8); assert.equal(snapshot.countsByKind['energy-segment'], 160); assert.equal(snapshot.countsByKind.string, 320); assert.equal(snapshot.countsByKind['feather-controller'], 168); assert.equal(snapshot.countsByKind.pcs, 8); assert.equal(snapshot.countsByKind['ems-controller'], 1);
  assert.equal(new Set(snapshot.objects.filter((value) => value.kind === 'string').map((value) => value.canonicalKey)).size, 320);
  assert.equal(source.strings[0].energySegmentIndex, 1); assert.equal(source.strings[1].energySegmentIndex, 1); assert.equal(source.strings[2].energySegmentIndex, 2);
  assert.equal(parity.parityStatus, 'matched'); assert.deepEqual(parity.stringToEnergySegmentParity, { matched: 320, mismatched: 0 }); assert.deepEqual(parity.featherMappingParity, { matched: 160, mismatched: 0, intentionallyUnmapped: 8 }); assert.deepEqual(parity.pcsMappingParity, { matched: 8, mismatched: 0 }); assert.deepEqual(parity.emsMappingParity, { matched: 1, mismatched: 0 });
  assert.equal(source.cycleId, 42); assert.ok(Object.isFrozen(source)); assert.ok(Object.isFrozen(source.strings)); assert.ok(Object.isFrozen(snapshot)); assert.ok(Object.isFrozen(snapshot.objects));
  assert.equal('soc' in snapshot.objects[0], false); assert.equal('status' in snapshot.objects[0], false); assert.equal('alarms' in snapshot.objects[0], false);
  const sameDifferentTime = createTopologySourceSnapshot(inputs({ collectedAt: '2027-01-01T00:00:00.000Z' })); assert.equal(source.fingerprint, sameDifferentTime.fingerprint);
  const telemetryPayload = createTopologySourceSnapshot(inputs({ cachedStrings: [{ ArrayIndex: 1, StringIndex: 1, SOC: 10 }] }));
  const changedTelemetryPayload = createTopologySourceSnapshot(inputs({ cachedStrings: [{ ArrayIndex: 1, StringIndex: 1, SOC: 99 }] })); assert.equal(telemetryPayload.fingerprint, changedTelemetryPayload.fingerprint);
  const mutableInput = inputs({ cachedStrings: [{ ArrayIndex: 1, StringIndex: 1 }] }); const before = structuredClone(mutableInput); createTopologySourceSnapshot(mutableInput); assert.deepEqual(mutableInput, before);
  const duplicateSource = createTopologySourceSnapshot(inputs({ cachedStrings: [{ ArrayIndex: 1, StringIndex: 1 }, { ArrayIndex: 1, StringIndex: 1 }, { ArrayIndex: 9, StringIndex: 1 }] }));
  assert.equal(duplicateSource.diagnostics.duplicates[0].code, 'duplicate-cached-string'); assert.equal(duplicateSource.diagnostics.ambiguous[0].code, 'cached-string-outside-profile');
  let calls = 0; let current = source;
  const runtime = new TopologyGraphRuntime(async () => { calls += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return current; });
  const [first, coalesced] = await Promise.all([runtime.requestRebuild('first'), runtime.requestRebuild('second')]);
  assert.equal(calls, 1); assert.equal(first.graphFingerprint, coalesced.graphFingerprint); assert.equal(runtime.metrics.snapshot().coalescedRebuilds, 1);
  runtime.updateReadiness(true, true); const skipped = await runtime.requestRebuild('unchanged'); assert.equal(skipped.rebuilt, false); assert.equal(calls, 2); assert.equal(runtime.metrics.snapshot().unchangedSourceSkips, 1); assert.equal(runtime.getHealth().state, 'READY_GRAPH', 'unchanged rebuild preserves readiness');
  current = createTopologySourceSnapshot(inputs({ connectionProfile: { ...inputs().connectionProfile, emsHost: '10.0.0.4' } }));
  const changed = await runtime.requestRebuild('changed'); assert.equal(changed.rebuilt, true); assert.notEqual(changed.sourceFingerprint, first.sourceFingerprint); assert.equal(runtime.metrics.snapshot().sourceFingerprintChanges, 1);
  const profileA = source; const profileB = current; let selected = profileA; let profile = { fingerprint: profileA.profileFingerprint, identity: profileA.profileIdentity }; let profileCalls = 0; let blocked = false; let release: (() => void) | null = null;
  const uninitializedRuntime = new TopologyGraphRuntime(async () => profileA); uninitializedRuntime.updateReadiness(true, true); assert.equal(uninitializedRuntime.getHealth().state, 'UNINITIALIZED');
  const profileRuntime = new TopologyGraphRuntime(async () => { profileCalls += 1; if (blocked) await new Promise<void>((resolve) => { release = resolve; }); return selected; }, buildTopologyGraph, new TopologyGraphMetrics(), () => profile);
  const builtA = await profileRuntime.requestRebuild('profile-a'); const retainedA = profileRuntime.getLatestSnapshot(); assert.equal(profileRuntime.getHealth().state, 'READY_HYBRID');
  selected = profileB; profile = { fingerprint: profileB.profileFingerprint, identity: profileB.profileIdentity }; blocked = true;
  const switchToB = profileRuntime.ensureCurrent('profile-switch'); const coalescedSwitch = profileRuntime.ensureCurrent('profile-switch-concurrent'); await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(profileRuntime.getLatestSnapshot(), retainedA, 'profile A remains last-known-good during rebuild'); assert.match(profileRuntime.getHealth().invalidationReason ?? '', /profile-change/); assert.equal(profileRuntime.getHealth().graphOnlyReadiness, false); assert.equal(profileRuntime.metrics.snapshot().graphInvalidations, 1); release?.(); blocked = false; await Promise.all([switchToB, coalescedSwitch]);
  const builtB = profileRuntime.getHealth(); assert.equal(builtB.state, 'READY_HYBRID'); assert.notEqual(builtB.graphFingerprint, builtA.graphFingerprint); assert.equal(builtB.profileFingerprint, profileB.profileFingerprint); assert.equal(profileRuntime.metrics.snapshot().coalescedRebuilds, 1);
  const callsBeforeMetadata = profileCalls; const metadataOnly = createTopologySourceSnapshot(inputs({ topologyProfile: { ...topologyProfile, updatedAt: '2027-02-03T00:00:00.000Z' }, connectionProfile: { ...inputs().connectionProfile, emsHost: '10.0.0.4' } })); assert.equal(metadataOnly.profileFingerprint, profileB.profileFingerprint); await profileRuntime.ensureCurrent('unrelated-metadata'); assert.equal(profileCalls, callsBeforeMetadata, 'unrelated metadata does not rebuild');
  selected = profileA; profile = { fingerprint: profileA.profileFingerprint, identity: profileA.profileIdentity }; await profileRuntime.ensureCurrent('switch-back-a'); assert.equal(profileRuntime.getHealth().profileFingerprint, profileA.profileFingerprint); assert.equal(profileRuntime.metrics.snapshot().graphInvalidations, 2);
  selected = profileB; profile = { fingerprint: profileB.profileFingerprint, identity: profileB.profileIdentity };
  let failProfile = true; const failedProfileRuntime = new TopologyGraphRuntime(async () => { if (failProfile) return profileA; throw new Error('profile B failure'); }, buildTopologyGraph, new TopologyGraphMetrics(), () => profile);
  await failedProfileRuntime.requestRebuild('good-a'); failProfile = false; await failedProfileRuntime.ensureCurrent('failed-profile-switch'); assert.equal(failedProfileRuntime.getHealth().state, 'DEGRADED'); assert.equal(failedProfileRuntime.getLatestSnapshot()?.generatedAt, profileA.generatedAt); assert.equal(failedProfileRuntime.getHealth().graphOnlyReadiness, false);
  let fail = false; const retainedRuntime = new TopologyGraphRuntime(async () => { if (fail) throw new Error('synthetic failure'); return source; });
  await retainedRuntime.requestRebuild('good'); fail = true; const retained = await retainedRuntime.requestRebuild('failure', true); assert.equal(retained.retainedLastKnownGood, true); assert.equal(retainedRuntime.getHealth().status, 'retained-last-known-good'); assert.equal(retainedRuntime.metrics.snapshot().retainedLastKnownGoodUse, 1);
  const brokenSnapshot = { ...snapshot, relationships: snapshot.relationships.filter((value) => !value.id.startsWith('served_by:')) };
  const brokenParity = compareTopologyGraph(source, brokenSnapshot); assert.equal(brokenParity.pcsMappingParity.mismatched, 8); assert.equal(brokenParity.parityStatus, 'mismatch');
  assert.throws(() => graph.registerRelationship(Object.freeze({ id: 'contains:missing->also-missing', type: 'contains', relationshipType: 'contains', sourceId: 'missing', targetId: 'also-missing', from: 'missing', to: 'also-missing', confidence: 1, createdAt: source.generatedAt, metadata: Object.freeze({}) })), /unregistered object/);
  console.log('LiveTopologyAdapter tests passed');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
