import type { Metadata } from '../../models';
import { createCanonicalObject, normalizeSiteIdentifier, positiveIndex } from '../CanonicalObject';
import type { CanonicalObject, ObjectCreationContext } from '../types';

export interface BatteryPackObject extends CanonicalObject { readonly kind: 'battery-pack'; readonly siteId: string; readonly arrayIndex: number; readonly stringIndex: number; readonly batteryPackIndex: number; }
export function batteryPackCanonicalKey(siteId: string, arrayIndex: number, stringIndex: number, packIndex: number): string { return `battery-pack:${normalizeSiteIdentifier(siteId)}:${positiveIndex(arrayIndex, 'arrayIndex')}:${positiveIndex(stringIndex, 'stringIndex')}:${positiveIndex(packIndex, 'batteryPackIndex')}`; }
export function createBatteryPackObject(input: { siteId: string; arrayIndex: number; stringIndex: number; batteryPackIndex: number; displayName?: string; metadata?: Readonly<Metadata> }, context?: ObjectCreationContext): BatteryPackObject {
  const siteId = normalizeSiteIdentifier(input.siteId); const arrayIndex = positiveIndex(input.arrayIndex, 'arrayIndex'); const stringIndex = positiveIndex(input.stringIndex, 'stringIndex'); const batteryPackIndex = positiveIndex(input.batteryPackIndex, 'batteryPackIndex');
  return createCanonicalObject<BatteryPackObject>({ kind: 'battery-pack', canonicalKey: batteryPackCanonicalKey(siteId, arrayIndex, stringIndex, batteryPackIndex), displayName: input.displayName ?? `A${arrayIndex}-S${stringIndex}-BP${batteryPackIndex}`, metadata: input.metadata, properties: { siteId, arrayIndex, stringIndex, batteryPackIndex }, context });
}
