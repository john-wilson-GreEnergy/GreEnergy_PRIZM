import type { Metadata } from '../../models';
import { createCanonicalObject, normalizeSiteIdentifier, positiveIndex } from '../CanonicalObject';
import type { CanonicalObject, ObjectCreationContext } from '../types';

export interface EmsControllerObject extends CanonicalObject { readonly kind: 'ems-controller'; readonly siteId: string; readonly deviceIp: string; readonly port: number; readonly turtlePath: string; }
export function emsCanonicalKey(siteId: string, deviceIp: string): string { const ip = deviceIp.trim().toLowerCase(); if (!ip) throw new Error('deviceIp must be non-empty'); return `ems:${normalizeSiteIdentifier(siteId)}:${ip}`; }
export function createEmsControllerObject(input: { siteId: string; deviceIp: string; port: number; turtlePath: string; displayName?: string; metadata?: Readonly<Metadata> }, context?: ObjectCreationContext): EmsControllerObject {
  const siteId = normalizeSiteIdentifier(input.siteId); const deviceIp = input.deviceIp.trim().toLowerCase(); const port = positiveIndex(input.port, 'port'); const turtlePath = input.turtlePath.trim(); if (!turtlePath) throw new Error('turtlePath must be non-empty');
  return createCanonicalObject<EmsControllerObject>({ kind: 'ems-controller', canonicalKey: emsCanonicalKey(siteId, deviceIp), displayName: input.displayName ?? `EMS ${deviceIp}`, metadata: input.metadata, properties: { siteId, deviceIp, port, turtlePath }, context });
}
