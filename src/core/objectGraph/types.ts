import type { Metadata, PrizmObject, Relationship } from '../models';

export const OBJECT_KINDS = ['site', 'array', 'energy-segment', 'string', 'battery-pack', 'feather-controller', 'ems-controller', 'pcs'] as const;
export type CanonicalObjectKind = typeof OBJECT_KINDS[number];

export const RELATIONSHIP_TYPES = ['contains', 'monitored_by', 'served_by', 'controlled_by'] as const;
export type ObjectRelationshipType = typeof RELATIONSHIP_TYPES[number];

export interface CanonicalObject extends PrizmObject {
  readonly kind: CanonicalObjectKind;
  readonly canonicalKey: string;
  readonly displayName: string;
  readonly aliases: readonly string[];
  readonly metadata: Readonly<Metadata>;
}

export interface ObjectRelationship extends Relationship {
  readonly id: string;
  readonly type: ObjectRelationshipType;
  readonly sourceId: string;
  readonly targetId: string;
  readonly metadata: Readonly<Metadata>;
}

export interface ObjectGraphSnapshot {
  readonly generatedAt: string;
  readonly objects: readonly CanonicalObject[];
  readonly relationships: readonly ObjectRelationship[];
  readonly countsByKind: Readonly<Record<CanonicalObjectKind, number>>;
  readonly countsByRelationship: Readonly<Record<ObjectRelationshipType, number>>;
  readonly graphVersion: string;
}

export interface ObjectGraphOptions { readonly allowDanglingRelationships?: boolean; }
export interface ObjectCreationContext { readonly now?: () => Date; }

export interface ObjectGraphBuilderInput {
  readonly site: { readonly siteId: string; readonly name: string; readonly customer?: string; readonly location?: string; readonly aliases?: readonly string[]; readonly metadata?: Readonly<Metadata> };
  readonly arrays?: readonly { readonly arrayIndex: number; readonly displayName?: string; readonly metadata?: Readonly<Metadata> }[];
  readonly energySegments?: readonly { readonly arrayIndex: number; readonly energySegmentIndex: number; readonly lineupIndex?: number; readonly displayName?: string; readonly metadata?: Readonly<Metadata> }[];
  readonly strings?: readonly { readonly arrayIndex: number; readonly stringIndex: number; readonly energySegmentIndex: number; readonly controllerIp?: string; readonly displayName?: string; readonly metadata?: Readonly<Metadata> }[];
  readonly batteryPacks?: readonly { readonly arrayIndex: number; readonly stringIndex: number; readonly batteryPackIndex: number; readonly displayName?: string; readonly metadata?: Readonly<Metadata> }[];
  readonly featherControllers?: readonly { readonly deviceIp: string; readonly arrayIndex?: number; readonly energySegmentIndex?: number; readonly displayName?: string; readonly metadata?: Readonly<Metadata> }[];
  readonly pcsControllers?: readonly { readonly arrayIndex: number; readonly pcsIndex: number; readonly displayName?: string; readonly metadata?: Readonly<Metadata> }[];
  readonly emsController?: { readonly deviceIp: string; readonly port: number; readonly turtlePath: string; readonly displayName?: string; readonly metadata?: Readonly<Metadata> };
}
