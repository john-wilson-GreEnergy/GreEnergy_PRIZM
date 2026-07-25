export type WorkspaceProjectionKind = 'operator' | 'technician' | 'engineering';
export type WorkspaceProjectionHealth = 'healthy' | 'degraded' | 'unavailable';

export interface WorkspaceProjectionEnvelope<T> {
  readonly generatedAt: string;
  readonly cycleId: number | null;
  readonly producingCycleId: number | null;
  readonly failureCycleId: number | null;
  readonly graphFingerprint: string | null;
  readonly bindingFingerprint: string | null;
  readonly observationFingerprint: string | null;
  readonly sourceMode: string;
  readonly stale: boolean;
  readonly retainedLastKnownGood: boolean;
  readonly health: WorkspaceProjectionHealth;
  readonly data: T;
}

export interface CompactStringDiagnostic {
  readonly canonicalIdentity: string;
  readonly publicDisplayKey: string;
  readonly arrayIndex: number;
  readonly stringIndex: number;
  readonly energySegment: number | null;
  readonly controllerIp: string | null;
  readonly connectionState: string | null;
  readonly soc: number | null;
  readonly measuredVoltage: number | null;
  readonly minVoltage: number | null;
  readonly maxVoltage: number | null;
  readonly voltageDelta: number | null;
  readonly minTemperature: number | null;
  readonly maxTemperature: number | null;
  readonly temperatureDelta: number | null;
  readonly power: number | null;
  readonly current: number | null;
  readonly warningCount: number;
  readonly alarmCount: number;
  readonly stale: boolean;
  readonly quality: string;
  readonly cycleId: number | null;
}

export interface WorkspaceProjectionInput {
  readonly snapshot: Readonly<Record<string, unknown>>;
  readonly coordinator: Readonly<Record<string, unknown>>;
  readonly telemetry: Readonly<Record<string, unknown>> | null;
  readonly graphHealth: Readonly<Record<string, unknown>>;
  readonly graphFingerprint: string | null;
  readonly graphProfileId: string | null;
  readonly binding: Readonly<Record<string, unknown>> | null;
  readonly bindingHealth: Readonly<Record<string, unknown>>;
  readonly observation: Readonly<Record<string, unknown>> | null;
  readonly observationHealth: Readonly<Record<string, unknown>>;
  readonly activeProfile: Readonly<Record<string, unknown>> | null;
  readonly stringViewer: Readonly<Record<string, unknown>>;
  readonly featherScheduler: Readonly<Record<string, unknown>>;
  readonly modbusProfile: Readonly<Record<string, unknown>> | null;
  readonly modbusValidation: Readonly<Record<string, unknown>> | null;
}

export interface ProjectionBuildMetrics {
  buildRequests: number; coalescedBuilds: number; skippedUnchangedBuilds: number; successfulBuilds: number;
  failedBuilds: number; lastKnownGoodUses: number; crossProfileRejections: number; targetedDetailUses: number;
  routeUses: Record<string, number>; buildDurationMs: Record<string, number | null>; serializedBytes: Record<string, number>;
  routeLatencyMs: Record<string, number | null>; sourceReadDurationMs: number | null; lastError: string | null;
}
