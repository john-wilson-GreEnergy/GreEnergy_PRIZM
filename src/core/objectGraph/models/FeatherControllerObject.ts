import type { Metadata } from '../../models';
import { createCanonicalObject, normalizeSiteIdentifier, positiveIndex } from '../CanonicalObject';
import type { CanonicalObject, ObjectCreationContext } from '../types';

export interface FeatherControllerObject extends CanonicalObject { readonly kind: 'feather-controller'; readonly siteId: string; readonly deviceIp: string; readonly arrayIndex: number | null; readonly energySegmentIndex: number | null; }
export function featherCanonicalKey(siteId: string, deviceIp: string): string { const ip = deviceIp.trim().toLowerCase(); if (!ip) throw new Error('deviceIp must be non-empty'); return `feather:${normalizeSiteIdentifier(siteId)}:${ip}`; }
export function createFeatherControllerObject(input: { siteId: string; deviceIp: string; arrayIndex?: number; energySegmentIndex?: number; displayName?: string; metadata?: Readonly<Metadata> }, context?: ObjectCreationContext): FeatherControllerObject {
  const siteId = normalizeSiteIdentifier(input.siteId); const deviceIp = input.deviceIp.trim().toLowerCase();
  return createCanonicalObject<FeatherControllerObject>({ kind: 'feather-controller', canonicalKey: featherCanonicalKey(siteId, deviceIp), displayName: input.displayName ?? `Feather ${deviceIp}`, metadata: input.metadata, properties: { siteId, deviceIp, arrayIndex: input.arrayIndex == null ? null : positiveIndex(input.arrayIndex, 'arrayIndex'), energySegmentIndex: input.energySegmentIndex == null ? null : positiveIndex(input.energySegmentIndex, 'energySegmentIndex') }, context });
}
