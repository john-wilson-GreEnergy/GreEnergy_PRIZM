export type CanonicalPublicationState = 'UNINITIALIZED' | 'PUBLISHING' | 'READY' | 'DEGRADED' | 'FAILED';
export type CanonicalStageName = 'topology' | 'telemetry' | 'binding' | 'observation' | 'projection' | 'validation' | 'publish';
export type CanonicalStageState = 'PENDING' | 'READY' | 'DEGRADED' | 'FAILED' | 'BLOCKED';

export interface CanonicalStageStatus {
  readonly stage: CanonicalStageName; readonly state: CanonicalStageState; readonly evaluatedCycleId: number;
  readonly producingCycleId: number | null; readonly failureCycleId: number | null; readonly durationMs: number; readonly skippedUnchanged: boolean;
  readonly retainedLastKnownGood: boolean; readonly fingerprint: string | null; readonly sourceFingerprint: string | null;
  readonly profileIdentity: string | null; readonly error: string | null;
}
export interface CanonicalPublicationStatus {
  readonly publicationCycleId: number | null; readonly startedAt: string | null; readonly completedAt: string | null;
  readonly durationMs: number | null; readonly state: CanonicalPublicationState; readonly activeStage: CanonicalStageName | null;
  readonly stages: Readonly<Record<CanonicalStageName, CanonicalStageStatus | null>>;
  readonly producingCycleIds: Readonly<Record<CanonicalStageName, number | null>>;
  readonly fingerprints: { readonly graph: string | null; readonly graphSource: string | null; readonly binding: string | null; readonly observation: string | null };
  readonly retainedLastKnownGoodStages: readonly CanonicalStageName[]; readonly degradedStages: readonly CanonicalStageName[];
  readonly failedStages: readonly CanonicalStageName[]; readonly errors: readonly string[]; readonly profileIdentity: string | null;
  readonly cycleAligned: boolean; readonly freshStartInitialized: boolean;
}
export interface CanonicalPublicationMetricsReport { readonly attempts: number; readonly successes: number; readonly degradedCompletions: number; readonly failures: number; readonly durationByStageMs: Readonly<Record<string, number>>; readonly skippedUnchangedStages: number; readonly lastKnownGoodStageReuse: number; readonly crossProfileRejections: number; readonly cycleAlignmentFailures: number; readonly recoveryEvents: number; readonly freshStartInitializationDurationMs: number | null }
