import { arrayCanonicalKey, batteryPackCanonicalKey, emsCanonicalKey, energySegmentCanonicalKey, featherCanonicalKey, pcsCanonicalKey, siteCanonicalKey, stringCanonicalKey, type CanonicalObjectKind, type ObjectGraphSnapshot } from '../../core/objectGraph';
import type { TopologySourceSnapshot } from './TopologySourceSnapshot';

export interface TopologyParityDifference {
  readonly category: string;
  readonly identity: string;
  readonly expected: string | null;
  readonly actual: string | null;
}

export interface TopologyGraphParityReport {
  readonly comparedAt: string;
  readonly sourceFingerprint: string;
  readonly parityStatus: 'matched' | 'warning' | 'mismatch';
  readonly matchedCounts: Readonly<Record<CanonicalObjectKind, number>>;
  readonly uniqueIdentities: number;
  readonly duplicateIdentities: readonly string[];
  readonly missingObjects: readonly TopologyParityDifference[];
  readonly extraObjects: readonly TopologyParityDifference[];
  readonly mismatchedRelationships: readonly TopologyParityDifference[];
  readonly ambiguousMappings: readonly string[];
  readonly danglingRelationships: readonly string[];
  readonly stringToEnergySegmentParity: { readonly matched: number; readonly mismatched: number };
  readonly stringIpParity: { readonly matched: number; readonly mismatched: number; readonly unavailable: number };
  readonly featherMappingParity: { readonly matched: number; readonly mismatched: number; readonly intentionallyUnmapped: number };
  readonly pcsMappingParity: { readonly matched: number; readonly mismatched: number };
  readonly emsMappingParity: { readonly matched: number; readonly mismatched: number };
  readonly mismatchCount: number;
}

const SAMPLE_LIMIT = 25;

function expectedObjectKeys(source: TopologySourceSnapshot): Map<string, CanonicalObjectKind> {
  const siteId = source.site.siteId;
  return new Map<string, CanonicalObjectKind>([
    [siteCanonicalKey(siteId), 'site'],
    [emsCanonicalKey(siteId, source.ems.deviceIp), 'ems-controller'],
    ...source.arrays.map((value) => [arrayCanonicalKey(siteId, value.arrayIndex), 'array'] as const),
    ...source.energySegments.map((value) => [energySegmentCanonicalKey(siteId, value.arrayIndex, value.energySegmentIndex), 'energy-segment'] as const),
    ...source.strings.map((value) => [stringCanonicalKey(siteId, value.arrayIndex, value.stringIndex), 'string'] as const),
    ...source.batteryPacks.map((value) => [batteryPackCanonicalKey(siteId, value.arrayIndex, value.stringIndex, value.batteryPackIndex), 'battery-pack'] as const),
    ...source.feathers.map((value) => [featherCanonicalKey(siteId, value.deviceIp), 'feather-controller'] as const),
    ...source.pcs.map((value) => [pcsCanonicalKey(siteId, value.arrayIndex, value.pcsIndex), 'pcs'] as const),
  ]);
}

function relationshipId(type: string, sourceId: string, targetId: string): string { return `${type}:${sourceId}->${targetId}`; }

export function compareTopologyGraph(source: TopologySourceSnapshot, graph: ObjectGraphSnapshot, comparedAt = new Date().toISOString()): TopologyGraphParityReport {
  const expected = expectedObjectKeys(source);
  const actual = new Map(graph.objects.map((object) => [object.canonicalKey, object]));
  const missingObjects = [...expected.entries()].filter(([key]) => !actual.has(key)).slice(0, SAMPLE_LIMIT).map(([identity, kind]) => ({ category: kind, identity, expected: kind, actual: null }));
  const extraObjects = [...actual.entries()].filter(([key]) => !expected.has(key)).slice(0, SAMPLE_LIMIT).map(([identity, object]) => ({ category: object.kind, identity, expected: null, actual: object.kind }));
  const relationshipIds = new Set(graph.relationships.map((relationship) => relationship.id));
  const objectIds = new Set(graph.objects.map((object) => object.id));
  const expectedRelationships: { category: string; id: string }[] = [];
  for (const value of source.arrays) expectedRelationships.push({ category: 'site-array', id: relationshipId('contains', siteCanonicalKey(source.site.siteId), arrayCanonicalKey(source.site.siteId, value.arrayIndex)) });
  for (const value of source.energySegments) expectedRelationships.push({ category: 'array-energy-segment', id: relationshipId('contains', arrayCanonicalKey(source.site.siteId, value.arrayIndex), energySegmentCanonicalKey(source.site.siteId, value.arrayIndex, value.energySegmentIndex)) });
  for (const value of source.strings) expectedRelationships.push({ category: 'string-energy-segment', id: relationshipId('contains', energySegmentCanonicalKey(source.site.siteId, value.arrayIndex, value.energySegmentIndex), stringCanonicalKey(source.site.siteId, value.arrayIndex, value.stringIndex)) });
  for (const value of source.feathers.filter((item) => item.arrayIndex != null && item.energySegmentIndex != null)) expectedRelationships.push({ category: 'feather-energy-segment', id: relationshipId('monitored_by', energySegmentCanonicalKey(source.site.siteId, value.arrayIndex!, value.energySegmentIndex!), featherCanonicalKey(source.site.siteId, value.deviceIp)) });
  for (const value of source.pcs) expectedRelationships.push({ category: 'pcs-array', id: relationshipId('served_by', arrayCanonicalKey(source.site.siteId, value.arrayIndex), pcsCanonicalKey(source.site.siteId, value.arrayIndex, value.pcsIndex)) });
  expectedRelationships.push({ category: 'ems-site', id: relationshipId('controlled_by', siteCanonicalKey(source.site.siteId), emsCanonicalKey(source.site.siteId, source.ems.deviceIp)) });
  const mismatchedRelationships = expectedRelationships.filter((value) => !relationshipIds.has(value.id)).slice(0, SAMPLE_LIMIT).map((value) => ({ category: value.category, identity: value.id, expected: value.id, actual: null }));
  const danglingRelationships = graph.relationships.filter((relationship) => !objectIds.has(relationship.sourceId) || !objectIds.has(relationship.targetId)).map((relationship) => relationship.id).slice(0, SAMPLE_LIMIT);
  const stringRelationshipMismatches = expectedRelationships.filter((value) => value.category === 'string-energy-segment' && !relationshipIds.has(value.id)).length;
  const featherRelationshipMismatches = expectedRelationships.filter((value) => value.category === 'feather-energy-segment' && !relationshipIds.has(value.id)).length;
  const pcsRelationshipMismatches = expectedRelationships.filter((value) => value.category === 'pcs-array' && !relationshipIds.has(value.id)).length;
  const emsRelationshipMismatches = expectedRelationships.filter((value) => value.category === 'ems-site' && !relationshipIds.has(value.id)).length;
  let stringIpMatched = 0; let stringIpMismatch = 0; let stringIpUnavailable = 0;
  for (const value of source.strings) {
    if (!value.ipAddress) { stringIpUnavailable += 1; continue; }
    const object = actual.get(stringCanonicalKey(source.site.siteId, value.arrayIndex, value.stringIndex)) as { controllerIp?: string | null } | undefined;
    if (object?.controllerIp === value.ipAddress) stringIpMatched += 1; else stringIpMismatch += 1;
  }
  const duplicateIdentities = source.diagnostics.duplicates.flatMap((value) => value.identities).slice(0, SAMPLE_LIMIT);
  const ambiguousMappings = source.diagnostics.ambiguous.flatMap((value) => value.identities.length ? value.identities : [value.message]).slice(0, SAMPLE_LIMIT);
  const matchedCounts = Object.fromEntries(Object.keys(graph.countsByKind).map((kind) => [kind, graph.objects.filter((object) => object.kind === kind && expected.has(object.canonicalKey)).length])) as Readonly<Record<CanonicalObjectKind, number>>;
  const mismatchCount = missingObjects.length + extraObjects.length + mismatchedRelationships.length + duplicateIdentities.length + ambiguousMappings.length + danglingRelationships.length + stringIpMismatch;
  return Object.freeze({
    comparedAt, sourceFingerprint: source.fingerprint, parityStatus: mismatchCount > 0 ? 'mismatch' : source.diagnostics.missing.length > 0 ? 'warning' : 'matched', matchedCounts,
    uniqueIdentities: actual.size, duplicateIdentities: Object.freeze(duplicateIdentities), missingObjects: Object.freeze(missingObjects), extraObjects: Object.freeze(extraObjects), mismatchedRelationships: Object.freeze(mismatchedRelationships), ambiguousMappings: Object.freeze(ambiguousMappings), danglingRelationships: Object.freeze(danglingRelationships),
    stringToEnergySegmentParity: { matched: source.strings.length - stringRelationshipMismatches, mismatched: stringRelationshipMismatches },
    stringIpParity: { matched: stringIpMatched, mismatched: stringIpMismatch, unavailable: stringIpUnavailable },
    featherMappingParity: { matched: source.feathers.filter((value) => value.energySegmentIndex != null).length - featherRelationshipMismatches, mismatched: featherRelationshipMismatches, intentionallyUnmapped: source.feathers.filter((value) => value.energySegmentIndex == null).length },
    pcsMappingParity: { matched: source.pcs.length - pcsRelationshipMismatches, mismatched: pcsRelationshipMismatches }, emsMappingParity: { matched: 1 - emsRelationshipMismatches, mismatched: emsRelationshipMismatches }, mismatchCount,
  });
}
