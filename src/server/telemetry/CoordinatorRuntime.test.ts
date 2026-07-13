import assert from "node:assert/strict";
import { CoordinatorRuntime } from "./CoordinatorRuntime";
import { getTelemetryCycleId } from "./TelemetryCycleContext";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function turn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function run(): Promise<void> {
  console.log("Running coordinator runtime tests...");

  const releases: Array<ReturnType<typeof deferred<void>>> = [];
  const observedCycleIds: number[] = [];
  const observedContextIds: Array<number | null> = [];
  let executions = 0;
  let concurrency = 0;
  let maximumConcurrency = 0;

  const runtime = new CoordinatorRuntime<{ cycleId: number }>(async ({ cycleId }) => {
    executions += 1;
    concurrency += 1;
    maximumConcurrency = Math.max(maximumConcurrency, concurrency);
    observedCycleIds.push(cycleId);
    observedContextIds.push(getTelemetryCycleId());
    const release = deferred<void>();
    releases.push(release);
    await release.promise;
    concurrency -= 1;
    return { snapshot: { cycleId }, successful: true, acquisitionTimestamp: new Date().toISOString() };
  });

  runtime.requestRefresh("manual:first");
  await turn();
  assert.equal(executions, 1);
  assert.equal(runtime.getDebugState().state, "RUNNING");

  for (let index = 0; index < 100; index += 1) {
    runtime.requestRefresh(index % 2 === 0 ? "manual:burst-a" : "manual:burst-b");
  }
  assert.equal(executions, 1, "refresh bursts must not launch a concurrent cycle");
  assert.equal(runtime.getDebugState().refreshQueueDepth, 1, "pending work is represented by one coalesced refresh");
  assert.equal(runtime.getDebugState().pendingRefreshCount, 100);

  releases[0].resolve();
  await turn();
  assert.equal(executions, 2, "one queued cycle must run after the active cycle completes");
  releases[1].resolve();
  await runtime.waitForIdle();

  const debug = runtime.getDebugState();
  assert.equal(maximumConcurrency, 1);
  assert.equal(debug.maximumObservedConcurrency, 1);
  assert.equal(debug.refreshQueueDepth, 0);
  assert.equal(debug.coalescedRefreshCount, 100);
  assert.equal(debug.queuedRefreshCount, 100);
  assert.deepEqual(observedCycleIds, [1, 2], "cycle IDs must increase monotonically");
  assert.deepEqual(observedContextIds, observedCycleIds, "acquisition context must carry the producing cycle ID");
  assert.equal(runtime.getCurrentSnapshot()?.cycleId, 2);

  let retainedAttempt = 0;
  const retainedRuntime = new CoordinatorRuntime<{ cycleId: number; value: string }>(async ({ cycleId }) => {
    retainedAttempt += 1;
    if (retainedAttempt === 1) return { snapshot: { cycleId, value: "known-good" }, successful: true };
    return { snapshot: null, successful: false };
  });
  retainedRuntime.requestRefresh("initial");
  await retainedRuntime.waitForIdle();
  retainedRuntime.requestRefresh("failed-refresh");
  await retainedRuntime.waitForIdle();
  assert.deepEqual(retainedRuntime.getCurrentSnapshot(), { cycleId: 1, value: "known-good" });
  assert.equal(retainedRuntime.getDebugState().state, "FAILED");
  assert.deepEqual(retainedRuntime.getDebugState().cycleHistory.map((cycle) => cycle.cycleId), [1, 2]);
  assert.equal(retainedRuntime.getDebugState().cycleHistory[1].successful, false);

  console.log("Coordinator runtime tests passed!");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
