import { createObjectGraphSnapshot } from './ObjectGraphSnapshot';
import type { CanonicalObject, CanonicalObjectKind, ObjectGraphOptions, ObjectGraphSnapshot, ObjectRelationship, ObjectRelationshipType } from './types';

export class ObjectGraph {
  private readonly objects = new Map<string, CanonicalObject>();
  private readonly canonicalKeys = new Map<string, string>();
  private readonly relationships = new Map<string, ObjectRelationship>();
  private readonly outgoing = new Map<string, Set<string>>();
  private readonly incoming = new Map<string, Set<string>>();
  private readonly allowDanglingRelationships: boolean;

  constructor(options: ObjectGraphOptions = {}) { this.allowDanglingRelationships = options.allowDanglingRelationships ?? false; }

  registerObject<T extends CanonicalObject>(object: T): Readonly<T> {
    if (this.objects.has(object.id)) throw new Error(`Object already registered: ${object.id}`);
    if (this.canonicalKeys.has(object.canonicalKey)) throw new Error(`Canonical key already registered: ${object.canonicalKey}`);
    if (!Object.isFrozen(object)) throw new Error(`Canonical objects must be immutable: ${object.id}`);
    this.objects.set(object.id, object); this.canonicalKeys.set(object.canonicalKey, object.id);
    return object;
  }

  registerRelationship(relationship: ObjectRelationship): Readonly<ObjectRelationship> {
    if (this.relationships.has(relationship.id)) throw new Error(`Relationship already registered: ${relationship.id}`);
    if (!this.allowDanglingRelationships && (!this.objects.has(relationship.sourceId) || !this.objects.has(relationship.targetId))) throw new Error(`Relationship contains an unregistered object: ${relationship.id}`);
    if (!Object.isFrozen(relationship)) throw new Error(`Relationships must be immutable: ${relationship.id}`);
    this.relationships.set(relationship.id, relationship);
    this.addIndex(this.outgoing, relationship.sourceId, relationship.id); this.addIndex(this.incoming, relationship.targetId, relationship.id);
    return relationship;
  }

  getObject<T extends CanonicalObject = CanonicalObject>(id: string): Readonly<T> | undefined { return this.objects.get(id) as Readonly<T> | undefined; }
  getByCanonicalKey<T extends CanonicalObject = CanonicalObject>(key: string): Readonly<T> | undefined { const id = this.canonicalKeys.get(key); return id ? this.getObject<T>(id) : undefined; }
  hasObject(id: string): boolean { return this.objects.has(id); }
  listObjects(kind?: CanonicalObjectKind): readonly Readonly<CanonicalObject>[] { return Object.freeze([...this.objects.values()].filter((object) => kind == null || object.kind === kind).sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey))); }

  getChildren(id: string, relationshipType?: ObjectRelationshipType): readonly Readonly<CanonicalObject>[] {
    return Object.freeze(this.relationshipsFrom(this.outgoing, id, relationshipType).flatMap((relationship) => this.objects.get(relationship.targetId) ?? []).sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey)));
  }

  getParents(id: string, relationshipType?: ObjectRelationshipType): readonly Readonly<CanonicalObject>[] {
    return Object.freeze(this.relationshipsFrom(this.incoming, id, relationshipType).flatMap((relationship) => this.objects.get(relationship.sourceId) ?? []).sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey)));
  }

  getRelationshipsFor(id: string): readonly Readonly<ObjectRelationship>[] {
    const relationshipIds = new Set([...(this.outgoing.get(id) ?? []), ...(this.incoming.get(id) ?? [])]);
    return Object.freeze([...relationshipIds].flatMap((relationshipId) => this.relationships.get(relationshipId) ?? []).sort((left, right) => left.id.localeCompare(right.id)));
  }

  snapshot(generatedAt?: string): ObjectGraphSnapshot { return createObjectGraphSnapshot(this.listObjects(), [...this.relationships.values()], generatedAt); }

  private addIndex(index: Map<string, Set<string>>, objectId: string, relationshipIdValue: string): void { const values = index.get(objectId) ?? new Set<string>(); values.add(relationshipIdValue); index.set(objectId, values); }
  private relationshipsFrom(index: Map<string, Set<string>>, id: string, type?: ObjectRelationshipType): ObjectRelationship[] { return [...(index.get(id) ?? [])].flatMap((relationshipIdValue) => this.relationships.get(relationshipIdValue) ?? []).filter((relationship) => type == null || relationship.type === type); }
}
