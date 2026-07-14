import type { Metadata } from '../../models';
import { createCanonicalObject, normalizeSiteIdentifier, positiveIndex } from '../CanonicalObject';
import type { CanonicalObject, ObjectCreationContext } from '../types';

export interface PcsObject extends CanonicalObject { readonly kind: 'pcs'; readonly siteId: string; readonly arrayIndex: number; readonly pcsIndex: number; }
export function pcsCanonicalKey(siteId: string, arrayIndex: number, pcsIndex: number): string { return `pcs:${normalizeSiteIdentifier(siteId)}:${positiveIndex(arrayIndex, 'arrayIndex')}:${positiveIndex(pcsIndex, 'pcsIndex')}`; }
export function createPcsObject(input: { siteId: string; arrayIndex: number; pcsIndex: number; displayName?: string; metadata?: Readonly<Metadata> }, context?: ObjectCreationContext): PcsObject {
  const siteId = normalizeSiteIdentifier(input.siteId); const arrayIndex = positiveIndex(input.arrayIndex, 'arrayIndex'); const pcsIndex = positiveIndex(input.pcsIndex, 'pcsIndex');
  return createCanonicalObject<PcsObject>({ kind: 'pcs', canonicalKey: pcsCanonicalKey(siteId, arrayIndex, pcsIndex), displayName: input.displayName ?? `A${arrayIndex}-PCS${pcsIndex}`, metadata: input.metadata, properties: { siteId, arrayIndex, pcsIndex }, context });
}
