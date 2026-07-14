import type { Metadata } from '../../models';
import { createCanonicalObject, normalizeSiteIdentifier, positiveIndex } from '../CanonicalObject';
import type { CanonicalObject, ObjectCreationContext } from '../types';

export interface EnergySegmentObject extends CanonicalObject { readonly kind: 'energy-segment'; readonly siteId: string; readonly arrayIndex: number; readonly energySegmentIndex: number; readonly lineupIndex: number | null; }
export function energySegmentCanonicalKey(siteId: string, arrayIndex: number, segmentIndex: number): string { return `energy-segment:${normalizeSiteIdentifier(siteId)}:${positiveIndex(arrayIndex, 'arrayIndex')}:${positiveIndex(segmentIndex, 'energySegmentIndex')}`; }
export function createEnergySegmentObject(input: { siteId: string; arrayIndex: number; energySegmentIndex: number; lineupIndex?: number; displayName?: string; metadata?: Readonly<Metadata> }, context?: ObjectCreationContext): EnergySegmentObject {
  const siteId = normalizeSiteIdentifier(input.siteId); const arrayIndex = positiveIndex(input.arrayIndex, 'arrayIndex'); const energySegmentIndex = positiveIndex(input.energySegmentIndex, 'energySegmentIndex');
  return createCanonicalObject<EnergySegmentObject>({ kind: 'energy-segment', canonicalKey: energySegmentCanonicalKey(siteId, arrayIndex, energySegmentIndex), displayName: input.displayName ?? `A${arrayIndex}-ES${energySegmentIndex}`, metadata: input.metadata, properties: { siteId, arrayIndex, energySegmentIndex, lineupIndex: input.lineupIndex == null ? null : positiveIndex(input.lineupIndex, 'lineupIndex') }, context });
}
