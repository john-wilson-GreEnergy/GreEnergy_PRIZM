import assert from "node:assert/strict";
import { runInTelemetryCycle } from "../TelemetryCycleContext";
import { CoordinatorProfiler } from "./CoordinatorProfiler";
import { calculateMaximumConcurrency, durationStats, renderAsciiTimeline } from "./CoordinatorTimeline";

async function run(): Promise<void> {
  console.log("Running coordinator profiler tests...");
  let now = 0;
  let wall = Date.parse("2026-07-13T00:00:00.000Z");
  const profiler = new CoordinatorProfiler(() => now, () => new Date(wall), 100);

  profiler.startCycle(1, { refreshWaitMs: 7 });
  await runInTelemetryCycle(1, async () => {
    await profiler.withPhase("Serial A", { waitState: "NORMALIZATION", blocking: true }, async () => { now += 10; wall += 10; });
    await profiler.withPhase("Parent", { waitState: "NORMALIZATION", blocking: true }, async () => {
      now += 2;
      await profiler.withPhase("Nested", { waitState: "PARSE", blocking: true }, async () => { now += 3; wall += 3; });
      now += 5;
    });
    await profiler.withParallelGroup("Parallel", 2, async () => {
      await Promise.all([
        profiler.withPhase("Task A", { waitState: "NETWORK", blocking: true }, async () => { now += 5; await Promise.resolve(); now += 5; }),
        profiler.withPhase("Task B", { waitState: "NETWORK", blocking: true }, async () => { now += 5; await Promise.resolve(); now += 5; }),
      ]);
    });
  });
  now += 1;
  const completed = profiler.completeCycle(1, true);
  assert.ok(completed);
  assert.equal(completed.cycleDuration, 41, "cycle duration must use monotonic elapsed time");
  const ordered = completed.timeline.map((phase) => phase.start);
  assert.deepEqual(ordered, ordered.slice().sort((a, b) => a - b), "timeline must be ordered by start offset");

  const parent = completed.timeline.find((phase) => phase.phase === "Parent");
  const nested = completed.timeline.find((phase) => phase.phase === "Nested");
  assert.ok(parent && nested);
  assert.equal(nested.parentPhaseId, parent.phaseId, "nested phase must retain parent identity");
  assert.equal(nested.duration, 3);

  const parallel = completed.parallelGroups[0];
  assert.equal(parallel.numberOfTasks, 2);
  assert.equal(parallel.observedTaskCount, 2);
  assert.equal(parallel.maxConcurrency, 2);
  assert.ok(parallel.slowestTask);
  assert.ok(parallel.fastestTask);
  assert.equal(completed.waits.networkWaitMs, 20, "parallel network waits must be measured as wall-clock union time");
  assert.equal(completed.waits.normalizationWaitMs, 20, "nested normalization phases must not be double counted");
  assert.equal(completed.waits.parseWaitMs, 3);
  assert.equal(completed.waits.idleWaitMs, 1);

  const serialEntries = completed.timeline.filter((phase) => phase.phase.startsWith("Serial"));
  assert.equal(calculateMaximumConcurrency(serialEntries), 1, "serialized phases must not overlap");
  assert.match(completed.asciiTimeline, /Cycle 1/);
  assert.match(completed.asciiTimeline, /Serial A/);
  assert.match(renderAsciiTimeline(completed), /Idle/);

  const stats = durationStats(Array.from({ length: 20 }, (_, index) => index + 1));
  assert.equal(stats.min, 1);
  assert.equal(stats.max, 20);
  assert.equal(stats.median, 10.5);
  assert.equal(stats.p95, 19);

  for (let cycleId = 2; cycleId <= 105; cycleId += 1) {
    profiler.startCycle(cycleId);
    await runInTelemetryCycle(cycleId, async () => {
      await profiler.withPhase("Rolling", { executionMode: "SERIAL" }, async () => { now += 1; });
    });
    profiler.completeCycle(cycleId, true);
  }
  const history = profiler.getHistory();
  assert.equal(history.length, 100, "rolling history must retain exactly the latest 100 cycles");
  assert.equal(history[0].cycleId, 6);
  assert.equal(history[99].cycleId, 105);
  const report = profiler.getReport();
  assert.equal(report.rolling.retainedCycles, 100);
  assert.ok(report.rolling.phases.some((phase) => phase.phase === "Rolling"));

  console.log("Coordinator profiler tests passed!");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
