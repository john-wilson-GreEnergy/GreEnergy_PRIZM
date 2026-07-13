import { AsyncLocalStorage } from "node:async_hooks";
import { getTelemetryCycleId } from "../TelemetryCycleContext";
import { telemetryMetrics } from "../metrics";
import { calculateIdleDuration, calculateMaximumConcurrency, calculateWaitDuration, durationStats, renderAsciiTimeline } from "./CoordinatorTimeline";
import {
  CoordinatorCycleProfile,
  CoordinatorExecutionMode,
  CoordinatorParallelGroup,
  CoordinatorPhaseHandle,
  CoordinatorPhaseOptions,
  CoordinatorPhaseResult,
  CoordinatorPhaseStats,
  CoordinatorProfilerReport,
  CoordinatorTimelineEntry,
  CoordinatorWaitSummary,
} from "./CoordinatorProfilerTypes";

interface ActiveCycle extends CoordinatorCycleProfile {
  startedMonotonic: number;
  phaseSequence: number;
  groupSequence: number;
  declaredGroups: Map<string, { name: string; numberOfTasks: number; start: number }>;
}

interface PhaseContext {
  cycleId: number;
  parentPhaseId: string | null;
  parallelGroupId: string | null;
  executionMode: CoordinatorExecutionMode;
}

function emptyWaits(refreshWaitMs = 0, lockWaitMs = 0): CoordinatorWaitSummary {
  return { networkWaitMs: 0, parseWaitMs: 0, normalizationWaitMs: 0, cacheWaitMs: 0, idleWaitMs: 0, lockWaitMs, refreshWaitMs };
}

export function coordinatorPhaseNameForEndpoint(source: string, endpoint: string): string {
  if (source === "feather") {
    if (endpoint.includes("/feather/status/report.json")) return "Feather status/report.json";
    if (endpoint.includes("/feather/main/data")) return "Feather main/data";
    return `Feather ${endpoint}`;
  }
  if (endpoint.includes("strings.csv")) return "EMS strings.csv";
  if (endpoint.includes("controllerStatistics")) return "EMS controllerStatistics";
  if (endpoint.includes("lastCall")) return "EMS lastCall";
  if (endpoint.includes("blockviewer")) return "EMS blockviewer";
  if (/\/array\/\d+\/pcs\//.test(endpoint)) return "EMS PCS report";
  if (/\/array\/\d+\/report\.json/.test(endpoint)) return "EMS array report";
  if (endpoint.toLowerCase().includes("notification")) return "EMS array notification";
  if (endpoint.includes("firstresponder")) return "First Responder";
  if (endpoint.toLowerCase().includes("modbus")) return "Modbus";
  return `EMS ${endpoint}`;
}

export class CoordinatorProfiler {
  private readonly activeCycles = new Map<number, ActiveCycle>();
  private readonly history: CoordinatorCycleProfile[] = [];
  private readonly context = new AsyncLocalStorage<PhaseContext>();

  constructor(
    private readonly monotonicNow: () => number = () => performance.now(),
    private readonly wallNow: () => Date = () => new Date(),
    private readonly historyLimit = 100,
  ) {}

  startCycle(cycleId: number, waits: { refreshWaitMs?: number; lockWaitMs?: number } = {}): void {
    const startedAt = this.wallNow().toISOString();
    this.activeCycles.set(cycleId, {
      cycleId,
      startedAt,
      completedAt: null,
      cycleDuration: null,
      successful: null,
      timeline: [],
      parallelGroups: [],
      waits: emptyWaits(waits.refreshWaitMs, waits.lockWaitMs),
      asciiTimeline: "",
      startedMonotonic: this.monotonicNow(),
      phaseSequence: 0,
      groupSequence: 0,
      declaredGroups: new Map(),
    });
    this.mark("Cycle Begin", cycleId);
  }

  completeCycle(cycleId: number, successful: boolean): CoordinatorCycleProfile | null {
    const cycle = this.activeCycles.get(cycleId);
    if (!cycle) return null;
    this.mark("Cycle Complete", cycleId);
    const end = this.elapsed(cycle);
    for (const entry of cycle.timeline) {
      if (entry.end == null) this.finishEntry(cycle, entry, { success: false, error: "Phase did not complete before cycle end" }, end);
    }
    cycle.completedAt = this.wallNow().toISOString();
    cycle.cycleDuration = end;
    cycle.successful = successful;
    cycle.parallelGroups = [...cycle.declaredGroups.entries()].map(([parallelGroupId, group]) => this.summarizeGroup(cycle, parallelGroupId, group));
    cycle.waits.networkWaitMs = calculateWaitDuration(cycle.timeline, end, "NETWORK");
    cycle.waits.parseWaitMs = calculateWaitDuration(cycle.timeline, end, "PARSE");
    cycle.waits.normalizationWaitMs = calculateWaitDuration(cycle.timeline, end, "NORMALIZATION");
    cycle.waits.cacheWaitMs = calculateWaitDuration(cycle.timeline, end, "CACHE");
    cycle.waits.idleWaitMs = calculateIdleDuration(cycle.timeline, end);
    cycle.asciiTimeline = renderAsciiTimeline(cycle);
    const completed = this.publicCycle(cycle);
    this.history.push(completed);
    if (this.history.length > this.historyLimit) this.history.shift();
    this.activeCycles.delete(cycleId);
    return completed;
  }

  beginPhase(phase: string, options: CoordinatorPhaseOptions = {}): CoordinatorPhaseHandle {
    const cycleId = getTelemetryCycleId() ?? this.context.getStore()?.cycleId ?? null;
    if (cycleId == null) return { phaseId: null, finish: () => {} };
    const cycle = this.activeCycles.get(cycleId);
    if (!cycle) return { phaseId: null, finish: () => {} };
    const inherited = this.context.getStore();
    const phaseId = `${cycleId}:${++cycle.phaseSequence}`;
    const start = this.elapsed(cycle);
    const entry: CoordinatorTimelineEntry = {
      phaseId,
      phase,
      kind: options.kind ?? "PHASE",
      start,
      end: null,
      duration: null,
      startedAt: this.wallNow().toISOString(),
      completedAt: null,
      status: "RUNNING",
      executionMode: options.executionMode ?? inherited?.executionMode ?? "SERIAL",
      parallelGroupId: options.parallelGroupId ?? inherited?.parallelGroupId ?? null,
      parentPhaseId: options.parentPhaseId === undefined ? inherited?.parentPhaseId ?? null : options.parentPhaseId,
      waitState: options.waitState ?? "NONE",
      blocking: options.blocking ?? false,
      retries: 0,
      bytes: null,
      error: null,
      metadata: { ...(options.metadata ?? {}) },
    };
    cycle.timeline.push(entry);
    let finished = false;
    return { phaseId, finish: (result = {}) => {
      if (finished || entry.status !== "RUNNING") return;
      finished = true;
      this.finishEntry(cycle, entry, result, this.elapsed(cycle));
    } };
  }

  async withPhase<T>(phase: string, options: CoordinatorPhaseOptions, operation: () => Promise<T>, summarize?: (value: T) => CoordinatorPhaseResult): Promise<T> {
    const handle = this.beginPhase(phase, options);
    const cycleId = getTelemetryCycleId() ?? this.context.getStore()?.cycleId;
    const inherited = this.context.getStore();
    const context: PhaseContext | null = cycleId == null ? null : {
      cycleId,
      parentPhaseId: handle.phaseId,
      parallelGroupId: options.parallelGroupId ?? inherited?.parallelGroupId ?? null,
      executionMode: options.executionMode ?? inherited?.executionMode ?? "SERIAL",
    };
    try {
      const value = context ? await this.context.run(context, operation) : await operation();
      handle.finish(summarize ? summarize(value) : { success: true });
      return value;
    } catch (error) {
      handle.finish({ success: false, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  withSyncPhase<T>(phase: string, options: CoordinatorPhaseOptions, operation: () => T): T {
    const handle = this.beginPhase(phase, options);
    try {
      const value = operation();
      handle.finish({ success: true });
      return value;
    } catch (error) {
      handle.finish({ success: false, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async withParallelGroup<T>(name: string, numberOfTasks: number, operation: () => Promise<T>): Promise<T> {
    const cycleId = getTelemetryCycleId();
    const cycle = cycleId == null ? null : this.activeCycles.get(cycleId);
    if (!cycle) return operation();
    const parallelGroupId = `${cycleId}:group:${++cycle.groupSequence}`;
    const start = this.elapsed(cycle);
    cycle.declaredGroups.set(parallelGroupId, { name, numberOfTasks, start });
    return this.withPhase(name, { kind: "GROUP", executionMode: "PARALLEL", parallelGroupId, blocking: true }, operation);
  }

  mark(phase: string, explicitCycleId?: number): void {
    const cycleId = explicitCycleId ?? getTelemetryCycleId();
    const cycle = cycleId == null ? null : this.activeCycles.get(cycleId);
    if (!cycle) return;
    const at = this.elapsed(cycle);
    cycle.timeline.push({
      phaseId: `${cycleId}:${++cycle.phaseSequence}`,
      phase,
      kind: "MARKER",
      start: at,
      end: at,
      duration: 0,
      startedAt: this.wallNow().toISOString(),
      completedAt: this.wallNow().toISOString(),
      status: "SUCCESS",
      executionMode: "SERIAL",
      parallelGroupId: null,
      parentPhaseId: null,
      waitState: "NONE",
      blocking: false,
      retries: 0,
      bytes: null,
      error: null,
      metadata: {},
    });
  }

  getCurrentCycle(): CoordinatorCycleProfile | null {
    const cycle = [...this.activeCycles.values()].sort((a, b) => b.cycleId - a.cycleId)[0];
    if (!cycle) return null;
    const current = this.publicCycle(cycle);
    current.cycleDuration = this.elapsed(cycle);
    current.waits.networkWaitMs = calculateWaitDuration(current.timeline, current.cycleDuration, "NETWORK");
    current.waits.parseWaitMs = calculateWaitDuration(current.timeline, current.cycleDuration, "PARSE");
    current.waits.normalizationWaitMs = calculateWaitDuration(current.timeline, current.cycleDuration, "NORMALIZATION");
    current.waits.cacheWaitMs = calculateWaitDuration(current.timeline, current.cycleDuration, "CACHE");
    current.waits.idleWaitMs = calculateIdleDuration(current.timeline, current.cycleDuration);
    current.asciiTimeline = renderAsciiTimeline(current);
    return current;
  }

  getHistory(): CoordinatorCycleProfile[] { return structuredClone(this.history); }

  getReport(): CoordinatorProfilerReport {
    const cycleDurations = this.history.flatMap((cycle) => cycle.cycleDuration == null ? [] : [cycle.cycleDuration]);
    const totalCycleTime = cycleDurations.reduce((sum, value) => sum + value, 0);
    const phaseMap = new Map<string, CoordinatorTimelineEntry[]>();
    for (const cycle of this.history) {
      for (const phase of cycle.timeline) {
        if (phase.kind !== "PHASE" || phase.duration == null) continue;
        const entries = phaseMap.get(phase.phase) ?? [];
        entries.push(phase);
        phaseMap.set(phase.phase, entries);
      }
    }
    const phases: CoordinatorPhaseStats[] = [...phaseMap.entries()].map(([phase, entries]) => {
      const durations = entries.map((entry) => entry.duration as number);
      const stats = durationStats(durations);
      const cumulativeDuration = durations.reduce((sum, value) => sum + value, 0);
      return {
        phase,
        ...stats,
        failureCount: entries.filter((entry) => entry.status === "FAILED").length,
        retryCount: entries.reduce((sum, entry) => sum + entry.retries, 0),
        totalBytes: entries.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0),
        blockingCount: entries.filter((entry) => entry.blocking).length,
        cumulativeDuration,
        percentOfCycleTime: totalCycleTime > 0 ? (cumulativeDuration / totalCycleTime) * 100 : 0,
      };
    }).sort((a, b) => b.cumulativeDuration - a.cumulativeDuration);
    const waitAverage = (key: keyof CoordinatorWaitSummary) => this.history.length === 0 ? 0 : this.history.reduce((sum, cycle) => sum + cycle.waits[key], 0) / this.history.length;
    const latestCycle = this.history.at(-1) ?? null;
    return {
      generatedAt: this.wallNow().toISOString(),
      currentCycle: this.getCurrentCycle(),
      latestCycle: structuredClone(latestCycle),
      rolling: {
        retainedCycles: this.history.length,
        cycleDuration: durationStats(cycleDurations),
        phases,
        waits: {
          networkWaitMs: waitAverage("networkWaitMs"),
          parseWaitMs: waitAverage("parseWaitMs"),
          normalizationWaitMs: waitAverage("normalizationWaitMs"),
          cacheWaitMs: waitAverage("cacheWaitMs"),
          idleWaitMs: waitAverage("idleWaitMs"),
          lockWaitMs: waitAverage("lockWaitMs"),
          refreshWaitMs: waitAverage("refreshWaitMs"),
        },
      },
      slowestPhases: phases.slice().sort((a, b) => (b.p95 ?? 0) - (a.p95 ?? 0)).slice(0, 10),
      topBottlenecks: phases.slice(0, 10),
      timeline: structuredClone(latestCycle?.timeline ?? []),
      asciiTimeline: latestCycle?.asciiTimeline ?? "No completed coordinator cycles recorded.",
    };
  }

  reset(): void {
    this.activeCycles.clear();
    this.history.length = 0;
  }

  private elapsed(cycle: ActiveCycle): number { return Math.max(0, this.monotonicNow() - cycle.startedMonotonic); }

  private finishEntry(cycle: ActiveCycle, entry: CoordinatorTimelineEntry, result: CoordinatorPhaseResult, end: number): void {
    entry.end = end;
    entry.duration = Math.max(0, end - entry.start);
    entry.completedAt = this.wallNow().toISOString();
    entry.status = result.success === false ? "FAILED" : "SUCCESS";
    entry.retries = Math.max(0, result.retries ?? 0);
    entry.bytes = result.bytes ?? null;
    entry.blocking = result.blocking ?? entry.blocking;
    entry.error = result.error ?? null;
    telemetryMetrics.registry.recordCoordinatorPhase(entry.phase, {
      durationMs: entry.duration,
      failed: entry.status === "FAILED",
      retries: entry.retries,
      bytes: entry.bytes,
      blocking: entry.blocking,
    });
  }

  private summarizeGroup(cycle: ActiveCycle, parallelGroupId: string, group: { name: string; numberOfTasks: number; start: number }): CoordinatorParallelGroup {
    const groupEntry = cycle.timeline.find((entry) => entry.parallelGroupId === parallelGroupId && entry.kind === "GROUP");
    const tasks = cycle.timeline.filter((entry) =>
      entry.parallelGroupId === parallelGroupId
      && entry.parentPhaseId === groupEntry?.phaseId
      && entry.kind === "PHASE"
      && entry.waitState === "NETWORK"
      && entry.duration != null
    );
    const durations = tasks.map((entry) => entry.duration as number);
    const sorted = tasks.slice().sort((a, b) => (a.duration ?? 0) - (b.duration ?? 0));
    const end = groupEntry?.end ?? group.start;
    return {
      parallelGroupId,
      name: group.name,
      start: group.start,
      end,
      duration: Math.max(0, end - group.start),
      numberOfTasks: group.numberOfTasks,
      observedTaskCount: tasks.length,
      maxConcurrency: calculateMaximumConcurrency(tasks),
      averageTaskDuration: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0,
      slowestTask: sorted.length ? { phase: sorted[sorted.length - 1].phase, duration: sorted[sorted.length - 1].duration as number } : null,
      fastestTask: sorted.length ? { phase: sorted[0].phase, duration: sorted[0].duration as number } : null,
    };
  }

  private publicCycle(cycle: ActiveCycle): CoordinatorCycleProfile {
    const { startedMonotonic: _startedMonotonic, phaseSequence: _phaseSequence, groupSequence: _groupSequence, declaredGroups: _declaredGroups, ...value } = cycle;
    return structuredClone(value);
  }
}

export const coordinatorProfiler = new CoordinatorProfiler();
