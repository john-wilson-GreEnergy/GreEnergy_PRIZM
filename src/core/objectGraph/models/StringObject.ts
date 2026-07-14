import type { Metadata } from '../../models';
import { createCanonicalObject, normalizeSiteIdentifier, positiveIndex } from '../CanonicalObject';
import { energySegmentCanonicalKey } from './EnergySegmentObject';
import type { CanonicalObject, ObjectCreationContext } from '../types';

export interface StringObject extends CanonicalObject { readonly kind: 'string'; readonly siteId: string; readonly arrayIndex: number; readonly stringIndex: number; readonly energySegmentId: string; readonly controllerIp: string | null; }
export function stringCanonicalKey(siteId: string, arrayIndex: number, stringIndex: number): string { return `string:${normalizeSiteIdentifier(siteId)}:${positiveIndex(arrayIndex, 'arrayIndex')}:${positiveIndex(stringIndex, 'stringIndex')}`; }
export function createStringObject(input: { siteId: string; arrayIndex: number; stringIndex: number; energySegmentIndex: number; controllerIp?: string; displayName?: string; metadata?: Readonly<Metadata> }, context?: ObjectCreationContext): StringObject {
  const siteId = normalizeSiteIdentifier(input.siteId); const arrayIndex = positiveIndex(input.arrayIndex, 'arrayIndex'); const stringIndex = positiveIndex(input.stringIndex, 'stringIndex'); const segmentIndex = positiveIndex(input.energySegmentIndex, 'energySegmentIndex');
  return createCanonicalObject<StringObject>({ kind: 'string', canonicalKey: stringCanonicalKey(siteId, arrayIndex, stringIndex), displayName: input.displayName ?? `A${arrayIndex}-S${stringIndex}`, metadata: input.metadata, properties: { siteId, arrayIndex, stringIndex, energySegmentId: energySegmentCanonicalKey(siteId, arrayIndex, segmentIndex), controllerIp: input.controllerIp?.trim() || null }, context });
}
