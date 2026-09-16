import { strict as assert } from "node:assert";
import { discoverSiteProfile } from "./SiteProfileDiscovery";

const fixture = (lineupCount: number, segments: number) => ({
  siteIdentity: { stationCode: "TEST", blockIndex: 1, blockKey: "B1", emsBaseUrl: "http://ems", discoveredAt: "now", sourcePriority: [] },
  counts: { arrayCount: lineupCount, stringCount: lineupCount * segments * 2, pcsCount: 0, acBatteryCount: 0, featherDeviceCount: lineupCount * (segments + 1), modbusPointCount: 0 },
  arrays: Array.from({ length: lineupCount }, (_, a) => ({ arrayIndex: a + 1, stringCount: segments * 2, pcsCount: 0, sourcePath: "blockviewer" })),
  strings: Array.from({ length: lineupCount * segments * 2 }, (_, i) => { const lineup = Math.floor(i / (segments * 2)) + 1; const string = i % (segments * 2) + 1; return { arrayIndex: lineup, stringIndex: string, displayKey: `A${lineup}-S${string}`, sourcePath: "strings.csv", raw: { EnergySegmentIndex: Math.ceil(string / 2) } }; }),
  pcses: [], acBatteries: [], ipMap: [], stringIpMap: [], modbusMap: [],
  featherDevices: Array.from({ length: lineupCount * (segments + 1) }, (_, i) => { const lineup = Math.floor(i / (segments + 1)) + 1; const position = i % (segments + 1); return { ipAddress: `10.0.${lineup}.${position ? 5 + position * 5 : 3}`, arrayIndex: lineup, segmentLabel: position ? `ES ${position}` : "CS", sourcePath: "direct-feather" }; }),
  sourceHealth: { blockviewer: true, stringsCsv: true, ipMap: true, stringIpMap: true, lastCall: true, modbusMap: true, feather: true }, cacheMeta: { siteCacheKey: "test", topologyVersion: 1, lastBuiltAt: "now", sourceFiles: [] }
} as any);

for (const [lineups, segments] of [[8, 20], [4, 14]]) {
  const draft = discoverSiteProfile(fixture(lineups, segments));
  assert.equal(draft.lineups.length, lineups);
  assert.ok(draft.lineups.every(lineup => lineup.energySegmentCount === segments));
  assert.ok(draft.lineups.every(lineup => lineup.stringsPerEnergySegment === 2));
  assert.equal(draft.conflicts.length, 0);
  assert.equal(draft.unresolved.length, 0);
}

const partial = fixture(8, 20);
partial.expectedTopology = {
  blocks: [{ arrayStart: 1, arrayEnd: 8, basePrefix: "10.0", csSegment: 3, esSegmentStart: 10, esSegmentStep: 5, esCountPerArray: 20, includeCollectionSegment: true }]
};
partial.featherDevices = partial.featherDevices.filter((_: any, index: number) => index % 4 === 0);
partial.ipMap = Array.from({ length: 8 * 21 }, (_, index) => {
  const arrayIndex = Math.floor(index / 21) + 1;
  const position = index % 21;
  return { ipAddress: `10.0.${arrayIndex}.${position ? 5 + position * 5 : 3}`, arrayIndex, entityDescription: position ? `ES ${position}` : "Collection Segment", sourcePath: "ipMap" };
});
const partialDraft = discoverSiteProfile(partial);
assert.equal(partialDraft.lineups.length, 8);
assert.ok(partialDraft.lineups.every(lineup => lineup.energySegmentCount === 20));
assert.ok(partialDraft.lineups.every(lineup => lineup.stringsPerEnergySegment === 2));
assert.ok(partialDraft.lineups.every(lineup => Object.keys(lineup.featherByEnergySegment).length === 20));
assert.equal(partialDraft.conflicts.length, 0);
assert.equal(partialDraft.unresolved.length, 0);
console.log("SiteProfileDiscovery tests passed");
