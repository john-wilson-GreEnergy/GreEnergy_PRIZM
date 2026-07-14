import type { Metadata } from '../models';
import type { CanonicalObject, CanonicalObjectKind, ObjectCreationContext } from './types';

export const OBJECT_GRAPH_VERSION = '1.0.0';

export function immutableValue<T>(value: T, seen = new WeakSet<object>()): T {
  if (value && typeof value === 'object' && !seen.has(value as object)) {
    seen.add(value as object);
    for (const child of Object.values(value as Record<string, unknown>)) immutableValue(child, seen);
    Object.freeze(value);
  }
  return value;
}

export function normalizeSiteIdentifier(siteId: string): string {
  const normalized = siteId.trim().toUpperCase().replace(/\s+/g, '-');
  if (!normalized) throw new Error('siteId must be non-empty');
  return normalized;
}

export function positiveIndex(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${field} must be a positive integer`);
  return value;
}

export function createCanonicalObject<T extends CanonicalObject>(args: {
  kind: CanonicalObjectKind;
  canonicalKey: string;
  displayName: string;
  aliases?: readonly string[];
  metadata?: Readonly<Metadata>;
  properties?: Record<string, unknown>;
  context?: ObjectCreationContext;
}): T {
  const timestamp = (args.context?.now ?? (() => new Date()))().toISOString();
  const aliases = [...new Set(args.aliases ?? [])].sort();
  return immutableValue({
    id: args.canonicalKey,
    type: args.kind,
    kind: args.kind,
    version: OBJECT_GRAPH_VERSION,
    canonicalKey: args.canonicalKey,
    displayName: args.displayName,
    aliases,
    sourceIds: [],
    tags: [],
    metadata: { ...(args.metadata ?? {}) },
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(args.properties ?? {}),
  } as unknown as T);
}
