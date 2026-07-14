import { immutableValue, ObjectGraph, type ObjectGraphSnapshot } from '../../core/objectGraph';
import { buildTopologyGraphWithTimings, collectCurrentTopologyProfileIdentity, collectLiveTopologySourceSnapshot, topologyFingerprint, type CurrentTopologyProfileIdentity } from './LiveTopologyAdapter';
import { TopologyGraphMetrics, type TopologyGraphMetricsSnapshot } from './TopologyGraphMetrics';
import { compareTopologyGraph, type TopologyGraphParityReport } from './TopologyGraphParity';
import type { TopologyProfileIdentity, TopologySourceSnapshot } from './TopologySourceSnapshot';

export type TopologyGraphLifecycleState = 'UNINITIALIZED' | 'BUILDING' | 'VALIDATING' | 'READY_HYBRID' | 'READY_GRAPH' | 'INVALIDATED' | 'DEGRADED' | 'FAILED';

export interface TopologyGraphHealth {
  readonly status: 'uninitialized' | 'healthy' | 'retained-last-known-good' | 'failed';
  readonly state: TopologyGraphLifecycleState;
  readonly lastAttemptAt: string | null;
  readonly lastSuccessAt: string | null;
  readonly lastFailureAt: string | null;
  readonly lastError: string | null;
  readonly lastReason: string | null;
  readonly sourceFingerprint: string | null;
  readonly graphFingerprint: string | null;
  readonly previousGraphFingerprint: string | null;
  readonly profileFingerprint: string | null;
  readonly profileIdentity: TopologyProfileIdentity | null;
  readonly cycleId: number | null;
  readonly lastInvalidatedAt: string | null;
  readonly invalidationReason: string | null;
  readonly rebuildPending: boolean;
  readonly parityReadiness: boolean;
  readonly graphOnlyReadiness: boolean;
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
type ProfileCollector = () => CurrentTopologyProfileIdentity;
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
  private previousGraphFingerprint: string | null = null;
  private inFlight: Promise<TopologyRebuildResult> | null = null;
  private pendingProfileFingerprint: string | null = null;
  private healthState: Omit<TopologyGraphHealth, 'metrics'> = {
    status: 'uninitialized', state: 'UNINITIALIZED', lastAttemptAt: null, lastSuccessAt: null, lastFailureAt: null, lastError: null, lastReason: null,
    sourceFingerprint: null, graphFingerprint: null, previousGraphFingerprint: null, profileFingerprint: null, profileIdentity: null, cycleId: null,
    lastInvalidatedAt: null, invalidationReason: null, rebuildPending: false, parityReadiness: false, graphOnlyReadiness: false,
  };

  constructor(
    private readonly collectSource: SourceCollector = collectLiveTopologySourceSnapshot,
    private readonly buildGraph: GraphBuilder = buildTopologyGraphWithTimings,
    readonly metrics = new TopologyGraphMetrics(),
    private readonly collectProfile: ProfileCollector = collectCurrentTopologyProfileIdentity,
  ) {}

  requestRebuild(reason: string, force = false): Promise<TopologyRebuildResult> {
    this.metrics.recordRequest();
    if (this.inFlight) { this.metrics.recordCoalesced(); return this.inFlight; }
    this.healthState = { ...this.healthState, rebuildPending: true };
    this.inFlight = this.execute(reason, force).finally(() => { this.inFlight = null; this.pendingProfileFingerprint = null; this.healthState = { ...this.healthState, rebuildPending: false }; });
    return this.inFlight;
  }

  async ensureCurrent(reason: string): Promise<void> {
    if (!this.graphSnapshot) { await this.requestRebuild(reason, false); return; }
    const current = this.collectProfile();
    if (current.fingerprint === this.sourceSnapshot?.profileFingerprint) return;
    if (this.pendingProfileFingerprint !== current.fingerprint) {
      this.pendingProfileFingerprint = current.fingerprint;
      this.invalidate('profile-change');
    }
    await this.requestRebuild(`${reason}:profile-change`, true);
  }

  invalidate(reason: string): void {
    const now = new Date().toISOString();
    this.metrics.recordInvalidation(reason);
    this.healthState = { ...this.healthState, status: this.graphSnapshot ? 'retained-last-known-good' : 'uninitialized', state: 'INVALIDATED', lastInvalidatedAt: now, invalidationReason: reason, parityReadiness: false, graphOnlyReadiness: false, rebuildPending: this.inFlight != null };
  }

  updateReadiness(parityReady: boolean, graphOnlyReady: boolean): void {
    if (this.healthState.state !== 'READY_HYBRID' && this.healthState.state !== 'READY_GRAPH') return;
    if (graphOnlyReady && !this.healthState.graphOnlyReadiness && this.healthState.lastInvalidatedAt) this.metrics.recordGraphReadiness(Math.max(0, Date.now() - new Date(this.healthState.lastInvalidatedAt).getTime()));
    this.healthState = { ...this.healthState, parityReadiness: parityReady, graphOnlyReadiness: graphOnlyReady, state: graphOnlyReady ? 'READY_GRAPH' : 'READY_HYBRID' };
  }

  getLatestGraph(): ObjectGraph | null { return this.graph; }
  getLatestSnapshot(): ObjectGraphSnapshot | null { return this.graphSnapshot; }
  getFingerprint(): string | null { return this.fingerprint; }
  getParity(): TopologyGraphParityReport | null { return this.parity; }
  getSourceSnapshot(): TopologySourceSnapshot | null { return this.sourceSnapshot; }
  getHealth(): TopologyGraphHealth { return immutableValue(structuredClone({ ...this.healthState, metrics: this.metrics.snapshot() })); }

  private async execute(reason: string, force: boolean): Promise<TopologyRebuildResult> {
    const started = performance.now(); const attemptAt = new Date().toISOString(); const previousState = this.healthState.state; const previousParityReadiness = this.healthState.parityReadiness; const previousGraphOnlyReadiness = this.healthState.graphOnlyReadiness; const wasInvalidated = previousState === 'INVALIDATED'; this.metrics.recordExecution();
    this.healthState = { ...this.healthState, state: 'BUILDING', lastAttemptAt: attemptAt, lastReason: reason, rebuildPending: true };
    try {
      const sourceStarted = performance.now(); const source = await this.collectSource(); const sourceDuration = performance.now() - sourceStarted;
      if (!force && this.sourceSnapshot?.fingerprint === source.fingerprint && this.graphSnapshot && this.parity && this.fingerprint) {
        this.metrics.recordUnchangedSkip();
        this.healthState = { ...this.healthState, status: 'healthy', state: previousState === 'READY_GRAPH' ? 'READY_GRAPH' : 'READY_HYBRID', lastError: null, sourceFingerprint: source.fingerprint, profileFingerprint: source.profileFingerprint, profileIdentity: source.profileIdentity, cycleId: source.cycleId, parityReadiness: previousParityReadiness, graphOnlyReadiness: previousGraphOnlyReadiness };
        return immutableValue({ rebuilt: false, retainedLastKnownGood: false, sourceFingerprint: source.fingerprint, graphFingerprint: this.fingerprint, snapshot: this.graphSnapshot, parity: this.parity });
      }
      if (this.sourceSnapshot && this.sourceSnapshot.fingerprint !== source.fingerprint) this.metrics.recordFingerprintChange();
      const buildStarted = performance.now(); const built = this.buildGraph(source); const buildDuration = performance.now() - buildStarted;
      const measured = built instanceof ObjectGraph ? { graph: built, objectCreationDurationMs: buildDuration, relationshipCreationDurationMs: 0 } : built;
      const snapshotStarted = performance.now(); const snapshot = measured.graph.snapshot(source.generatedAt); const snapshotDuration = performance.now() - snapshotStarted;
      this.healthState = { ...this.healthState, state: 'VALIDATING' };
      const validationStarted = performance.now(); const parity = compareTopologyGraph(source, snapshot); const validationDuration = performance.now() - validationStarted;
      const fingerprint = graphFingerprint(snapshot);
      this.previousGraphFingerprint = this.fingerprint;
      this.graph = measured.graph; this.graphSnapshot = snapshot; this.sourceSnapshot = source; this.parity = parity; this.fingerprint = fingerprint;
      const healthy = parity.mismatchCount === 0;
      this.healthState = { ...this.healthState, status: healthy ? 'healthy' : 'retained-last-known-good', state: healthy ? 'READY_HYBRID' : 'DEGRADED', lastSuccessAt: new Date().toISOString(), lastError: healthy ? null : `Topology parity has ${parity.mismatchCount} mismatches`, sourceFingerprint: source.fingerprint, graphFingerprint: fingerprint, previousGraphFingerprint: this.previousGraphFingerprint, profileFingerprint: source.profileFingerprint, profileIdentity: source.profileIdentity, cycleId: source.cycleId, parityReadiness: false, graphOnlyReadiness: false };
      this.metrics.recordSuccess({ rebuildDurationMs: performance.now() - started, sourceCollectionDurationMs: sourceDuration, objectCreationDurationMs: measured.objectCreationDurationMs, relationshipCreationDurationMs: measured.relationshipCreationDurationMs, validationDurationMs: validationDuration, snapshotDurationMs: snapshotDuration, objectCount: snapshot.objects.length, relationshipCount: snapshot.relationships.length, parityMismatchCount: parity.mismatchCount, profileSwitch: wasInvalidated });
      if (wasInvalidated && healthy && this.healthState.lastInvalidatedAt) this.metrics.recordHybridReadiness(Math.max(0, Date.now() - new Date(this.healthState.lastInvalidatedAt).getTime()));
      return immutableValue({ rebuilt: true, retainedLastKnownGood: false, sourceFingerprint: source.fingerprint, graphFingerprint: fingerprint, snapshot, parity });
    } catch (error) {
      const retained = this.graphSnapshot != null && this.parity != null && this.fingerprint != null && this.sourceSnapshot != null;
      const message = error instanceof Error ? error.message : String(error);
      this.metrics.recordFailure(performance.now() - started, retained);
      this.healthState = { ...this.healthState, status: retained ? 'retained-last-known-good' : 'failed', state: retained ? 'DEGRADED' : 'FAILED', lastFailureAt: new Date().toISOString(), lastError: message, parityReadiness: false, graphOnlyReadiness: false };
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
export function ensureTopologyGraphCurrent(reason: string): Promise<void> { return topologyGraphRuntime.ensureCurrent(reason); }
export function invalidateTopologyGraph(reason: string): void { topologyGraphRuntime.invalidate(reason); }
export { topologyGraphRuntime };
