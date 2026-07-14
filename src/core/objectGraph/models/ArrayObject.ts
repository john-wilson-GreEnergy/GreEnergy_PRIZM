import type { Metadata } from '../../models';
import { createCanonicalObject, normalizeSiteIdentifier, positiveIndex } from '../CanonicalObject';
import type { CanonicalObject, ObjectCreationContext } from '../types';

export interface ArrayObject extends CanonicalObject { readonly kind: 'array'; readonly siteId: string; readonly arrayIndex: number; }
export function arrayCanonicalKey(siteId: string, arrayIndex: number): string { return `array:${normalizeSiteIdentifier(siteId)}:${positiveIndex(arrayIndex, 'arrayIndex')}`; }
export function createArrayObject(input: { siteId: string; arrayIndex: number; displayName?: string; metadata?: Readonly<Metadata> }, context?: ObjectCreationContext): ArrayObject {
  const siteId = normalizeSiteIdentifier(input.siteId); const arrayIndex = positiveIndex(input.arrayIndex, 'arrayIndex');
  return createCanonicalObject<ArrayObject>({ kind: 'array', canonicalKey: arrayCanonicalKey(siteId, arrayIndex), displayName: input.displayName ?? `Array ${arrayIndex}`, metadata: input.metadata, properties: { siteId, arrayIndex }, context });
}
