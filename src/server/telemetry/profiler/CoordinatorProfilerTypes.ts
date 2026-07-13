export type CoordinatorExecutionMode = "SERIAL" | "PARALLEL";
export type CoordinatorWaitState = "NETWORK" | "PARSE" | "NORMALIZATION" | "CACHE" | "IDLE" | "LOCK" | "REFRESH" | "NONE";
export type CoordinatorPhaseStatus = "RUNNING" | "SUCCESS" | "FAILED";
export type CoordinatorTimelineKind = "PHASE" | "GROUP" | "MARKER";

export interface CoordinatorPhaseResult {
  success?: boolean;
  retries?: number;
  bytes?: number | null;
  blocking?: boolean;
  error?: string | null;
}

export interface CoordinatorPhaseOptions {
  executionMode?: CoordinatorExecutionMode;
  waitState?: CoordinatorWaitState;
  blocking?: boolean;
  parallelGroupId?: string | null;
  parentPhaseId?: string | null;
  kind?: CoordinatorTimelineKind;
  metadata?: Record<string, unknown>;
}

export interface CoordinatorTimelineEntry {
  phaseId: string;
  phase: string;
  kind: CoordinatorTimelineKind;
  start: number;
  end: number | null;
  duration: number | null;
  startedAt: string;
  completedAt: string | null;
  status: CoordinatorPhaseStatus;
  executionMode: CoordinatorExecutionMode;
  parallelGroupId: string | null;
  parentPhaseId: string | null;
  waitState: CoordinatorWaitState;
  blocking: boolean;
  retries: number;
  bytes: number | null;
  error: string | null;
  metadata: Record<string, unknown>;
}

export interface CoordinatorParallelGroup {
  parallelGroupId: string;
  name: string;
  start: number;
  end: number;
  duration: number;
  numberOfTasks: number;
  observedTaskCount: number;
  maxConcurrency: number;
  averageTaskDuration: number;
  slowestTask: { phase: string; duration: number } | null;
  fastestTask: { phase: string; duration: number } | null;
}

export interface CoordinatorWaitSummary {
  networkWaitMs: number;
  parseWaitMs: number;
  normalizationWaitMs: number;
  cacheWaitMs: number;
  idleWaitMs: number;
  lockWaitMs: number;
  refreshWaitMs: number;
}

export interface CoordinatorCycleProfile {
  cycleId: number;
  startedAt: string;
  completedAt: string | null;
  cycleDuration: number | null;
  successful: boolean | null;
  timeline: CoordinatorTimelineEntry[];
  parallelGroups: CoordinatorParallelGroup[];
  waits: CoordinatorWaitSummary;
  asciiTimeline: string;
}

export interface CoordinatorDurationStats {
  count: number;
  min: number | null;
  max: number | null;
  average: number | null;
  median: number | null;
  p95: number | null;
}

export interface CoordinatorPhaseStats extends CoordinatorDurationStats {
  phase: string;
  failureCount: number;
  retryCount: number;
  totalBytes: number;
  blockingCount: number;
  cumulativeDuration: number;
  percentOfCycleTime: number;
}

export interface CoordinatorProfilerReport {
  generatedAt: string;
  currentCycle: CoordinatorCycleProfile | null;
  latestCycle: CoordinatorCycleProfile | null;
  rolling: {
    retainedCycles: number;
    cycleDuration: CoordinatorDurationStats;
    phases: CoordinatorPhaseStats[];
    waits: CoordinatorWaitSummary;
  };
  slowestPhases: CoordinatorPhaseStats[];
  topBottlenecks: CoordinatorPhaseStats[];
  timeline: CoordinatorTimelineEntry[];
  asciiTimeline: string;
}

export interface CoordinatorPhaseHandle {
  readonly phaseId: string | null;
  finish(result?: CoordinatorPhaseResult): void;
}
