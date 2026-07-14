import assert from 'node:assert/strict';
import { ObjectGraph, ObjectGraphBuilder, arrayCanonicalKey, createArrayObject, createObjectRelationship, createSiteObject, energySegmentCanonicalKey, featherCanonicalKey, siteCanonicalKey, stringCanonicalKey } from './index';

const fixedNow = () => new Date('2026-07-13T00:00:00.000Z');
const context = { now: fixedNow };

const site = createSiteObject({ siteId: ' bhe0020 ', name: 'BHE 0020', aliases: ['BHE20'], metadata: { customer: { name: 'Utility' } } }, context);
assert.equal(site.id, 'site:BHE0020');
assert.equal(site.canonicalKey, 'site:BHE0020');
assert.equal(createSiteObject({ siteId: 'BHE0020', name: 'Renamed Display' }, context).id, site.id, 'display data does not affect identity');
assert.equal(createArrayObject({ siteId: 'bhe0020', arrayIndex: 1 }, context).canonicalKey, 'array:BHE0020:1');

const registration = new ObjectGraph();
registration.registerObject(site);
assert.equal(registration.hasObject(site.id), true);
assert.equal(registration.getByCanonicalKey(site.canonicalKey), site);
assert.equal(Object.isFrozen(registration.listObjects()), true);
assert.throws(() => registration.registerObject(site), /already registered/);
assert.throws(() => registration.registerRelationship(createObjectRelationship({ type: 'contains', sourceId: site.id, targetId: 'array:BHE0020:1' }, context)), /unregistered object/);

const graph = new ObjectGraphBuilder(context).build({
  site: { siteId: 'BHE0020', name: 'BHE 0020' },
  arrays: [{ arrayIndex: 1 }],
  energySegments: [{ arrayIndex: 1, energySegmentIndex: 1, lineupIndex: 1 }],
  strings: [
    { arrayIndex: 1, stringIndex: 1, energySegmentIndex: 1, controllerIp: '10.0.0.11' },
    { arrayIndex: 1, stringIndex: 2, energySegmentIndex: 1, controllerIp: '10.0.0.12' },
  ],
  batteryPacks: [
    { arrayIndex: 1, stringIndex: 1, batteryPackIndex: 1 },
    { arrayIndex: 1, stringIndex: 1, batteryPackIndex: 2 },
  ],
  featherControllers: [{ deviceIp: '10.0.1.10', arrayIndex: 1, energySegmentIndex: 1 }],
  pcsControllers: [{ arrayIndex: 1, pcsIndex: 1 }],
  emsController: { deviceIp: '10.0.0.3', port: 8080, turtlePath: '/turtle' },
});

const siteId = siteCanonicalKey('BHE0020');
const arrayId = arrayCanonicalKey('BHE0020', 1);
const segmentId = energySegmentCanonicalKey('BHE0020', 1, 1);
const string1Id = stringCanonicalKey('BHE0020', 1, 1);
const string2Id = stringCanonicalKey('BHE0020', 1, 2);
const featherId = featherCanonicalKey('BHE0020', '10.0.1.10');

assert.deepEqual(graph.getChildren(siteId, 'contains').map((object) => object.id), [arrayId]);
assert.deepEqual(graph.getChildren(arrayId, 'contains').map((object) => object.id), [segmentId]);
assert.deepEqual(graph.getChildren(segmentId, 'contains').map((object) => object.id), [string1Id, string2Id], 'two strings explicitly share one Energy Segment');
assert.deepEqual(graph.getParents(string1Id, 'contains').map((object) => object.id), [segmentId]);
assert.equal(graph.getChildren(string1Id, 'contains').length, 2, 'string contains battery packs');
assert.deepEqual(graph.getChildren(segmentId, 'monitored_by').map((object) => object.id), [featherId]);
assert.equal(graph.getChildren(arrayId, 'served_by')[0]?.kind, 'pcs');
assert.equal(graph.getChildren(siteId, 'controlled_by')[0]?.kind, 'ems-controller');
assert.ok(graph.getRelationshipsFor(segmentId).some((relationship) => relationship.type === 'monitored_by'));

const returned = graph.getObject(string1Id)!;
assert.equal(Object.isFrozen(returned), true);
assert.equal(Object.isFrozen(returned.metadata), true);
assert.throws(() => { (returned as any).displayName = 'mutated'; });
assert.throws(() => { (site.metadata.customer as any).name = 'mutated'; });

const snapshot = graph.snapshot('2026-07-13T01:00:00.000Z');
const secondSnapshot = graph.snapshot('2026-07-13T01:00:00.000Z');
assert.deepEqual(snapshot, secondSnapshot);
assert.equal(Object.isFrozen(snapshot), true);
assert.equal(Object.isFrozen(snapshot.objects), true);
assert.equal(Object.isFrozen(snapshot.relationships), true);
assert.equal(snapshot.graphVersion, '1.0.0');
assert.equal(snapshot.countsByKind.string, 2);
assert.equal(snapshot.countsByKind['battery-pack'], 2);
assert.equal(snapshot.countsByRelationship.contains, 6);
assert.equal(snapshot.countsByRelationship.monitored_by, 1);
assert.deepEqual(snapshot.objects.map((object) => object.canonicalKey), [...snapshot.objects.map((object) => object.canonicalKey)].sort());
assert.deepEqual(snapshot.relationships.map((relationship) => relationship.id), [...snapshot.relationships.map((relationship) => relationship.id)].sort());
assert.equal('soc' in returned, false, 'canonical identity does not own telemetry');

const duplicateRelationshipGraph = new ObjectGraphBuilder(context).build({ site: { siteId: 'BHE0021', name: 'BHE 0021' }, arrays: [{ arrayIndex: 1 }] });
const relationship = createObjectRelationship({ type: 'contains', sourceId: siteCanonicalKey('BHE0021'), targetId: arrayCanonicalKey('BHE0021', 1) }, context);
assert.throws(() => duplicateRelationshipGraph.registerRelationship(relationship), /already registered/);

console.log('Object graph foundation tests passed');
