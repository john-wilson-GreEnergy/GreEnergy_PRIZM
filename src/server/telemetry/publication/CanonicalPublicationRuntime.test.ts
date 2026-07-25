import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CanonicalPublicationRuntime, type CanonicalPublicationStages } from './CanonicalPublicationRuntime';
import type { CanonicalStageStatus } from './CanonicalPublicationTypes';

type StageValue = Omit<CanonicalStageStatus, 'stage' | 'evaluatedCycleId' | 'durationMs'>;
const value = (cycleId: number, fingerprint: string | null, sourceFingerprint: string | null, extras: Partial<StageValue> = {}): StageValue => ({
  state: 'READY', producingCycleId: cycleId, failureCycleId: null, skippedUnchanged: false,
  retainedLastKnownGood: false, fingerprint, sourceFingerprint, profileIdentity: 'profile-a', error: null, ...extras,
});

function fixtures(log: string[], behavior: Partial<Record<keyof CanonicalPublicationStages, (cycleId: number) => Promise<StageValue>>> = {}): CanonicalPublicationStages {
  const stage = (name: keyof CanonicalPublicationStages, fingerprint: string | null, sourceFingerprint: string | null) => async (cycleId: number) => {
    log.push(`${name}:${cycleId}`);
    const override = behavior[name];
    return override ? override(cycleId) : value(cycleId, fingerprint, sourceFingerprint);
  };
  return {
    topology: stage('topology', 'graph-1', 'graph-source-1'),
    telemetry: stage('telemetry', null, null),
    binding: stage('binding', 'binding-1', 'graph-source-1'),
    observation: stage('observation', 'observation-1', 'binding-1'),
    projection: stage('projection', 'observation-1', 'binding-1'),
  };
}

console.log('Running canonical publication runtime tests...');
const order: string[] = [];
const runtime = new CanonicalPublicationRuntime(fixtures(order), 3);
const sourceOwned = { nested: { untouched: true } };
const first = await runtime.publish(11);
assert.equal(first.state, 'READY');
assert.equal(first.cycleAligned, true);
assert.equal(first.freshStartInitialized, true);
assert.deepEqual(order, ['topology:11', 'telemetry:11', 'binding:11', 'observation:11', 'projection:11']);
assert.deepEqual(Object.values(first.producingCycleIds).slice(0, 5), [11, 11, 11, 11, 11]);
assert.equal(Object.isFrozen(first), true);
assert.equal(Object.isFrozen(first.stages), true);
assert.equal(sourceOwned.nested.untouched, true, 'publication must not mutate source-owned values');

let release!: () => void;
const held = new Promise<void>((resolve) => { release = resolve; });
let topologyExecutions = 0;
const concurrentLog: string[] = [];
const concurrent = new CanonicalPublicationRuntime(fixtures(concurrentLog, { topology: async (cycleId) => { topologyExecutions++; await held; return value(cycleId, 'graph-1', 'graph-source-1'); } }));
const a = concurrent.publish(12); const b = concurrent.publish(12);
assert.strictEqual(a, b, 'concurrent publication must share one in-flight execution');
release(); await a; assert.equal(topologyExecutions, 1);

const failureLog: string[] = [];
let failBinding = false;
const recovering = new CanonicalPublicationRuntime(fixtures(failureLog, { binding: async (cycleId) => { if (failBinding) throw new Error('binding-test-failure'); return value(cycleId, `binding-${cycleId}`, 'graph-source-1'); }, observation: async (cycleId) => value(cycleId, `observation-${cycleId}`, `binding-${cycleId}`), projection: async (cycleId) => value(cycleId, `observation-${cycleId}`, `binding-${cycleId}`) }));
await recovering.publish(20); failBinding = true;
const failed = await recovering.publish(21);
assert.equal(failed.state, 'FAILED');
assert.equal(failed.stages.binding?.failureCycleId, 21);
assert.equal(failed.stages.binding?.producingCycleId, 20);
assert.equal(failed.stages.binding?.retainedLastKnownGood, true);
assert.equal(failed.stages.observation?.state, 'BLOCKED');
assert.equal(failed.stages.observation?.producingCycleId, 20);
assert.equal(failed.stages.projection?.retainedLastKnownGood, true);
failBinding = false;
const recovered = await recovering.publish(22);
assert.equal(recovered.state, 'READY');
assert.equal(recovering.metrics.report().recoveryEvents, 1);

const graphFailureLog: string[] = [];
const graphFailure = new CanonicalPublicationRuntime(fixtures(graphFailureLog, { topology: async () => { throw new Error('graph-failure'); } }));
const graphFailed = await graphFailure.publish(30);
assert.deepEqual(graphFailureLog, ['topology:30', 'telemetry:30']);
assert.equal(graphFailed.stages.binding?.state, 'BLOCKED');
assert.equal(graphFailed.stages.observation?.state, 'BLOCKED');
assert.equal(graphFailed.stages.projection?.state, 'BLOCKED');

for (const failedStage of ['observation', 'projection'] as const) {
  let fail = false;
  const stageRuntime = new CanonicalPublicationRuntime(fixtures([], {
    [failedStage]: async (cycleId) => {
      if (fail) throw new Error(`${failedStage}-failure`);
      return failedStage === 'observation' ? value(cycleId, 'observation-1', 'binding-1') : value(cycleId, 'observation-1', 'binding-1');
    },
  }));
  await stageRuntime.publish(31); fail = true;
  const stageFailure = await stageRuntime.publish(32);
  assert.equal(stageFailure.stages[failedStage]?.failureCycleId, 32);
  assert.equal(stageFailure.stages[failedStage]?.producingCycleId, 31);
  assert.equal(stageFailure.stages[failedStage]?.retainedLastKnownGood, true);
  if (failedStage === 'observation') assert.equal(stageFailure.stages.projection?.state, 'BLOCKED');
}

const crossProfile = new CanonicalPublicationRuntime(fixtures([], {
  binding: async (cycleId) => value(cycleId, null, 'graph-source-1', { state: 'DEGRADED', failureCycleId: cycleId, retainedLastKnownGood: true, error: 'cross-profile-binding:profile-b:profile-a' }),
}));
const rejected = await crossProfile.publish(33);
assert.equal(rejected.state, 'DEGRADED');
assert.equal(rejected.stages.observation?.state, 'BLOCKED');
assert.equal(crossProfile.metrics.report().crossProfileRejections, 1);

const mismatch = new CanonicalPublicationRuntime(fixtures([], { projection: async (cycleId) => value(cycleId - 1, 'observation-1', 'binding-1') }));
const mixed = await mismatch.publish(40);
assert.equal(mixed.state, 'DEGRADED');
assert.equal(mixed.cycleAligned, false);
assert.match(mixed.stages.validation?.error ?? '', /projection-cycle-misaligned/);

const skipped = new CanonicalPublicationRuntime(fixtures([], { topology: async () => value(9, 'graph-1', 'graph-source-1', { skippedUnchanged: true }) }));
const skippedResult = await skipped.publish(41);
assert.equal(skippedResult.state, 'READY', 'unchanged topology may retain its producing cycle');
assert.equal(skippedResult.stages.topology?.evaluatedCycleId, 41);
assert.equal(skippedResult.stages.topology?.producingCycleId, 9);
assert.equal(skipped.metrics.report().skippedUnchangedStages, 1);

for (const cycleId of [50, 51, 52, 53]) await runtime.publish(cycleId);
assert.equal(runtime.report().history.length, 3, 'publication history must remain bounded');
const copy = runtime.status() as any;
assert.throws(() => { copy.state = 'FAILED'; }, TypeError);

const workspaceSource = readFileSync(new URL('../../workspaceProjections/WorkspaceProjectionRuntime.ts', import.meta.url), 'utf8');
assert.match(workspaceSource, /async get\(kind: WorkspaceProjectionKind\) \{ if \(!this\.latest\)/);
assert.doesNotMatch(workspaceSource, /async get\(kind: WorkspaceProjectionKind\).*requestBuild/);
const topologyRoutes = readFileSync(new URL('../../topology/TopologyGraphRoutes.ts', import.meta.url), 'utf8');
const graphGetHandler = topologyRoutes.slice(topologyRoutes.indexOf("get('/graph'"), topologyRoutes.indexOf("get('/parity'"));
assert.doesNotMatch(graphGetHandler, /requestTopologyGraphRebuild/);

console.log('Canonical publication runtime tests passed!');
