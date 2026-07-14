import type { Metadata } from '../../models';
import { createCanonicalObject, normalizeSiteIdentifier } from '../CanonicalObject';
import type { CanonicalObject, ObjectCreationContext } from '../types';

export interface SiteObject extends CanonicalObject { readonly kind: 'site'; readonly siteIdentifier: string; readonly customer: string | null; readonly location: string | null; }
export function siteCanonicalKey(siteId: string): string { return `site:${normalizeSiteIdentifier(siteId)}`; }
export function createSiteObject(input: { siteId: string; name: string; customer?: string; location?: string; aliases?: readonly string[]; metadata?: Readonly<Metadata> }, context?: ObjectCreationContext): SiteObject {
  const siteIdentifier = normalizeSiteIdentifier(input.siteId);
  return createCanonicalObject<SiteObject>({ kind: 'site', canonicalKey: siteCanonicalKey(siteIdentifier), displayName: input.name, aliases: input.aliases, metadata: input.metadata, properties: { siteIdentifier, customer: input.customer ?? null, location: input.location ?? null }, context });
}
