import type { Metadata } from '../models';
import { immutableValue } from './CanonicalObject';
import type { ObjectCreationContext, ObjectRelationship, ObjectRelationshipType } from './types';

export function relationshipId(type: ObjectRelationshipType, sourceId: string, targetId: string): string {
  return `${type}:${sourceId}->${targetId}`;
}

export function createObjectRelationship(input: { type: ObjectRelationshipType; sourceId: string; targetId: string; metadata?: Readonly<Metadata> }, context?: ObjectCreationContext): ObjectRelationship {
  if (!input.sourceId || !input.targetId) throw new Error('Relationship sourceId and targetId must be non-empty');
  if (input.sourceId === input.targetId) throw new Error('Self-referential relationships are not supported');
  const createdAt = (context?.now ?? (() => new Date()))().toISOString();
  return immutableValue({ id: relationshipId(input.type, input.sourceId, input.targetId), type: input.type, relationshipType: input.type, sourceId: input.sourceId, targetId: input.targetId, from: input.sourceId, to: input.targetId, confidence: 1, metadata: { ...(input.metadata ?? {}) }, createdAt });
}
