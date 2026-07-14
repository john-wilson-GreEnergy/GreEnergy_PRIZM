import { immutableValue, ObjectGraph, type ObjectGraphSnapshot } from '../../core/objectGraph';
import { buildTopologyGraphWithTimings, collectLiveTopologySourceSnapshot, topologyFingerprint } from './LiveTopologyAdapter';
import { TopologyGraphMetrics, type TopologyGraphMetricsSnapshot } from './TopologyGraphMetrics';
import { compareTopologyGraph, type TopologyGraphParityReport } from './TopologyGraphParity';
import type { TopologySourceSnapshot } from './TopologySourceSnapshot';

export interface TopologyGraphHealth {
  readonly status: 'uninitialized' | 'healthy' | 'retained-last-known-good' | 'failed';
  readonly lastAttemptAt: string | null;
  readonly lastSuccessAt: string | null;
  readonly lastFailureAt: string | null;
  readonly lastError: string | null;
  readonly lastReason: string | null;
  readonly sourceFingerprint: string | null;
  readonly graphFingerprint: string | null;
  readonly cycleId: number | null;
  readonly metrics: TopologyGraphMetricsSnapshot;
}

export interface TopologyRebuildResult {
  readonly rebuilt: boolean;
  readonly retainedLastKnownGood: boolean;
  readonly sourceFingerprint: string;
  readonly graphFingerprint: string;
  readonly snapshot: ObjectGraphSnapshot;
  readonly parity: TopologyGraphParityReport;
}

type SourceCollector = () => Promise<TopologySourceSnapshot>;
interface GraphBuildResult { readonly graph: ObjectGraph; readonly objectCreationDurationMs: number; readonly relationshipCreationDurationMs: number }
type GraphBuilder = (source: TopologySourceSnapshot) => ObjectGraph | GraphBuildResult;

function graphFingerprint(snapshot: ObjectGraphSnapshot): string {
  return topologyFingerprint({ graphVersion: snapshot.graphVersion, objects: snapshot.objects.map((object) => ({ key: object.canonicalKey, kind: object.kind })), relationships: snapshot.relationships.map((relationship) => ({ id: relationship.id, type: relationship.type })) });
}

export class TopologyGraphRuntime {
  private graph: ObjectGraph | null = null;
  private graphSnapshot: ObjectGraphSnapshot | null = null;
  private sourceSnapshot: TopologySourceSnapshot | null = null;
  private parity: TopologyGraphParityReport | null = null;
  private fingerprint: string | null = null;
  private inFlight: Promise<TopologyRebuildResult> | null = null;
  private healthState: Omit<TopologyGraphHealth, 'metrics'> = { status: 'uninitialized', lastAttemptAt: null, lastSuccessAt: null, lastFailureAt: null, lastError: null, lastReason: null, sourceFingerprint: null, graphFingerprint: null, cycleId: null };

  constructor(private readonly collectSource: SourceCollector = collectLiveTopologySourceSnapshot, private readonly buildGraph: GraphBuilder = buildTopologyGraphWithTimings, readonly metrics = new TopologyGraphMetrics()) {}

  requestRebuild(reason: string, force = false): Promise<TopologyRebuildResult> {
    this.metrics.recordRequest();
    if (this.inFlight) { this.metrics.recordCoalesced(); return this.inFlight; }
    this.inFlight = this.execute(reason, force).finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  getLatestGraph(): ObjectGraph | null { return this.graph; }
  getLatestSnapshot(): ObjectGraphSnapshot | null { return this.graphSnapshot; }
  getFingerprint(): string | null { return this.fingerprint; }
  getParity(): TopologyGraphParityReport | null { return this.parity; }
  getSourceSnapshot(): TopologySourceSnapshot | null { return this.sourceSnapshot; }
  getHealth(): TopologyGraphHealth { return immutableValue(structuredClone({ ...this.healthState, metrics: this.metrics.snapshot() })); }

  private async execute(reason: string, force: boolean): Promise<TopologyRebuildResult> {
    const started = performance.now(); const attemptAt = new Date().toISOString(); this.metrics.recordExecution();
    this.healthState = { ...this.healthState, lastAttemptAt: attemptAt, lastReason: reason };
    try {
      const sourceStarted = performance.now(); const source = await this.collectSource(); const sourceDuration = performance.now() - sourceStarted;
      if (!force && this.sourceSnapshot?.fingerprint === source.fingerprint && this.graphSnapshot && this.parity && this.fingerprint) {
        this.metrics.recordUnchangedSkip();
        this.healthState = { ...this.healthState, status: 'healthy', lastError: null, sourceFingerprint: source.fingerprint, cycleId: source.cycleId };
        return immutableValue({ rebuilt: false, retainedLastKnownGood: false, sourceFingerprint: source.fingerprint, graphFingerprint: this.fingerprint, snapshot: this.graphSnapshot, parity: this.parity });
      }
      if (this.sourceSnapshot && this.sourceSnapshot.fingerprint !== source.fingerprint) this.metrics.recordFingerprintChange();
      const buildStarted = performance.now(); const built = this.buildGraph(source); const buildDuration = performance.now() - buildStarted;
      const measured = built instanceof ObjectGraph ? { graph: built, objectCreationDurationMs: buildDuration, relationshipCreationDurationMs: 0 } : built;
      const graph = measured.graph;
      const snapshotStarted = performance.now(); const snapshot = graph.snapshot(source.generatedAt); const snapshotDuration = performance.now() - snapshotStarted;
      const validationStarted = performance.now(); const parity = compareTopologyGraph(source, snapshot); const validationDuration = performance.now() - validationStarted;
      const fingerprint = graphFingerprint(snapshot);
      this.graph = graph; this.graphSnapshot = snapshot; this.sourceSnapshot = source; this.parity = parity; this.fingerprint = fingerprint;
      this.healthState = { status: 'healthy', lastAttemptAt: attemptAt, lastSuccessAt: new Date().toISOString(), lastFailureAt: this.healthState.lastFailureAt, lastError: null, lastReason: reason, sourceFingerprint: source.fingerprint, graphFingerprint: fingerprint, cycleId: source.cycleId };
      this.metrics.recordSuccess({ rebuildDurationMs: performance.now() - started, sourceCollectionDurationMs: sourceDuration, objectCreationDurationMs: measured.objectCreationDurationMs, relationshipCreationDurationMs: measured.relationshipCreationDurationMs, validationDurationMs: validationDuration, snapshotDurationMs: snapshotDuration, objectCount: snapshot.objects.length, relationshipCount: snapshot.relationships.length, parityMismatchCount: parity.mismatchCount });
      return immutableValue({ rebuilt: true, retainedLastKnownGood: false, sourceFingerprint: source.fingerprint, graphFingerprint: fingerprint, snapshot, parity });
    } catch (error) {
      const retained = this.graphSnapshot != null && this.parity != null && this.fingerprint != null && this.sourceSnapshot != null;
      const message = error instanceof Error ? error.message : String(error);
      this.metrics.recordFailure(performance.now() - started, retained);
      this.healthState = { ...this.healthState, status: retained ? 'retained-last-known-good' : 'failed', lastFailureAt: new Date().toISOString(), lastError: message };
      if (retained) return immutableValue({ rebuilt: false, retainedLastKnownGood: true, sourceFingerprint: this.sourceSnapshot!.fingerprint, graphFingerprint: this.fingerprint!, snapshot: this.graphSnapshot!, parity: this.parity! });
      throw error;
    }
  }
}

const topologyGraphRuntime = new TopologyGraphRuntime();

export function getLatestTopologyGraph(): ObjectGraph | null { return topologyGraphRuntime.getLatestGraph(); }
export function getLatestTopologyGraphSnapshot(): ObjectGraphSnapshot | null { return topologyGraphRuntime.getLatestSnapshot(); }
export function getTopologyGraphFingerprint(): string | null { return topologyGraphRuntime.getFingerprint(); }
export function getTopologyGraphHealth(): TopologyGraphHealth { return topologyGraphRuntime.getHealth(); }
export function getTopologyGraphParity(): TopologyGraphParityReport | null { return topologyGraphRuntime.getParity(); }
export function getLatestTopologySourceSnapshot(): TopologySourceSnapshot | null { return topologyGraphRuntime.getSourceSnapshot(); }
export function requestTopologyGraphRebuild(reason: string, force = false): Promise<TopologyRebuildResult> { return topologyGraphRuntime.requestRebuild(reason, force); }
export { topologyGraphRuntime };
