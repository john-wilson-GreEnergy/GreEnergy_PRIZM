import { immutableValue, OBJECT_GRAPH_VERSION } from './CanonicalObject';
import { OBJECT_KINDS, RELATIONSHIP_TYPES } from './types';
import type { CanonicalObject, ObjectGraphSnapshot, ObjectRelationship } from './types';

export function createObjectGraphSnapshot(objects: readonly CanonicalObject[], relationships: readonly ObjectRelationship[], generatedAt = new Date().toISOString()): ObjectGraphSnapshot {
  const orderedObjects = [...objects].sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey));
  const orderedRelationships = [...relationships].sort((left, right) => left.id.localeCompare(right.id));
  const countsByKind = Object.fromEntries(OBJECT_KINDS.map((kind) => [kind, orderedObjects.filter((object) => object.kind === kind).length])) as ObjectGraphSnapshot['countsByKind'];
  const countsByRelationship = Object.fromEntries(RELATIONSHIP_TYPES.map((type) => [type, orderedRelationships.filter((relationship) => relationship.type === type).length])) as ObjectGraphSnapshot['countsByRelationship'];
  return immutableValue({ generatedAt, objects: orderedObjects, relationships: orderedRelationships, countsByKind, countsByRelationship, graphVersion: OBJECT_GRAPH_VERSION });
}
