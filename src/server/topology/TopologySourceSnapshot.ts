import { immutableValue } from '../../core/objectGraph';

export interface TopologySourceMetadata {
  readonly name: string;
  readonly priority: number;
  readonly observedAt: string | null;
  readonly fingerprint: string;
  readonly available: boolean;
}

export interface TopologyIdentityDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly identities: readonly string[];
}

export interface TopologyStringSource {
  readonly arrayIndex: number;
  readonly stringIndex: number;
  readonly energySegmentIndex: number;
  readonly ipAddress: string | null;
  readonly source: string;
}

export interface TopologyFeatherSource {
  readonly deviceIp: string;
  readonly arrayIndex: number | null;
  readonly energySegmentIndex: number | null;
  readonly segmentType: 'CS' | 'ES' | 'UNKNOWN';
  readonly source: string;
}

export interface TopologyPcsSource {
  readonly arrayIndex: number;
  readonly pcsIndex: number;
  readonly ipAddress: string | null;
  readonly source: string;
}

export interface TopologyBatteryPackSource {
  readonly arrayIndex: number;
  readonly stringIndex: number;
  readonly batteryPackIndex: number;
  readonly source: string;
}

export interface TopologySourceSnapshot {
  readonly generatedAt: string;
  readonly cycleId: number | null;
  readonly fingerprint: string;
  readonly site: { readonly siteId: string; readonly name: string; readonly customer: string | null };
  readonly ems: { readonly deviceIp: string; readonly port: number; readonly turtlePath: string };
  readonly arrays: readonly { readonly arrayIndex: number }[];
  readonly energySegments: readonly { readonly arrayIndex: number; readonly energySegmentIndex: number }[];
  readonly strings: readonly TopologyStringSource[];
  readonly batteryPacks: readonly TopologyBatteryPackSource[];
  readonly feathers: readonly TopologyFeatherSource[];
  readonly pcs: readonly TopologyPcsSource[];
  readonly sources: readonly TopologySourceMetadata[];
  readonly diagnostics: {
    readonly missing: readonly TopologyIdentityDiagnostic[];
    readonly ambiguous: readonly TopologyIdentityDiagnostic[];
    readonly duplicates: readonly TopologyIdentityDiagnostic[];
  };
}

export type TopologySourceSnapshotInput = Omit<TopologySourceSnapshot, 'fingerprint'> & { readonly fingerprint?: string };

export function immutableTopologySourceSnapshot(input: TopologySourceSnapshotInput, fingerprint: string): TopologySourceSnapshot {
  return immutableValue(structuredClone({ ...input, fingerprint }));
}
