import assert from "node:assert/strict";
import { mergeStringViewerMonitorFields } from "../../stringsDashboard";
import { StringViewerCache } from "./StringViewerCache";
import { classifyStringViewerPriority } from "./StringViewerPriority";
import { getStringViewerConfig, StringViewerScheduler } from "./StringViewerScheduler";
import { StringViewerFetchResult, StringViewerSchedulerConfig } from "./StringViewerTypes";

const config: StringViewerSchedulerConfig = { mode: "scheduled", maxConcurrency: 2, batchBudget: 10, hotTtlMs: 100, warmTtlMs: 100, coldTtlMs: 100, forceFullRefresh: false };
const row = (arrayNumber: number, stringNumber: number, extra: Record<string, unknown> = {}) => ({ arrayNumber, stringNumber, stringKey: `A${arrayNumber}-S${stringNumber}`, communicating: true, warningCount: 0, alarmCount: 0, ...extra });
const success = (value: unknown, latencyMs = 1): StringViewerFetchResult<unknown> => ({ success: true, value, latencyMs, sourceUrl: "http://ems/stringviewer" });

async function coalescing(): Promise<void> {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const scheduler = new StringViewerScheduler(config, async () => { calls += 1; await gate; return success({ stringViewerDataModel: { soc: 50 } }); });
  const first = scheduler.runCycle([row(1, 1)], 1, "http://ems");
  const second = scheduler.runCycle([row(1, 1)], 1, "http://ems");
  await Promise.resolve();
  assert.equal(calls, 1, "one in-flight acquisition per identity");
  release();
  await Promise.all([first, second]);
  assert.equal(scheduler.metrics.coalescedRequests, 1);
  assert.equal(scheduler.getDebugState().inFlight, 0);
}

async function boundedAndDeterministic(): Promise<void> {
  let active = 0;
  let maximum = 0;
  const order: string[] = [];
  const scheduler = new StringViewerScheduler({ ...config, maxConcurrency: 2 }, async (candidate) => {
    order.push(candidate.stringKey); active += 1; maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 2)); active -= 1;
    return success({ key: candidate.stringKey });
  });
  await scheduler.runCycle([row(2, 2), row(1, 2), row(1, 1), row(2, 1)], 2, "http://ems");
  assert.equal(maximum, 2, "bounded concurrency");
  assert.deepEqual(order.slice(0, 2), ["A1-S1", "A1-S2"], "deterministic ordering");
}

function priorities(): void {
  assert.equal(classifyStringViewerPriority({ operatorRequested: true }), "ON_DEMAND");
  assert.equal(classifyStringViewerPriority({ visible: true }), "HOT");
  assert.equal(classifyStringViewerPriority({ activeAlarm: true }), "HOT");
  assert.equal(classifyStringViewerPriority({ communicating: true }), "WARM");
  assert.equal(classifyStringViewerPriority({ communicating: false }), "COLD");
}

async function starvationAndDemand(): Promise<void> {
  const order: string[] = [];
  const scheduler = new StringViewerScheduler({ ...config, batchBudget: 2, maxConcurrency: 1 }, async (candidate) => { order.push(candidate.stringKey); return success({ key: candidate.stringKey }); });
  const rows = [row(1, 1, { alarmCount: 1 }), row(1, 2, { alarmCount: 1 }), row(1, 3, { communicating: false })];
  await scheduler.runCycle(rows, 3, "http://ems");
  assert.deepEqual(order, ["A1-S1", "A1-S3"], "cold work receives a reserved slot");
  scheduler.requestRefresh("A1-S2", "detail-page");
  await scheduler.runCycle(rows, 4, "http://ems");
  assert.equal(scheduler.getDebugState().refreshesByPriority.ON_DEMAND, 1);
}

async function freshness(): Promise<void> {
  let now = 1_000;
  let calls = 0;
  const cache = new StringViewerCache<unknown>(() => now);
  const scheduler = new StringViewerScheduler(config, async () => { calls += 1; return success({ version: calls }); }, cache);
  await scheduler.runCycle([row(1, 1)], 5, "http://ems");
  await scheduler.runCycle([row(1, 1)], 6, "http://ems");
  assert.equal(calls, 1, "fresh entry skipped");
  assert.equal(scheduler.metrics.skippedFresh, 1);
  now += 101;
  await scheduler.runCycle([row(1, 1)], 7, "http://ems");
  assert.equal(calls, 2, "stale entry refreshed");
  assert.equal(scheduler.getEntry("A1-S1")?.cycleId, 7, "cycleId propagated");
}

async function retentionAndRecovery(): Promise<void> {
  let attempt = 0;
  const scheduler = new StringViewerScheduler(config, async () => {
    attempt += 1;
    return attempt === 2 ? { success: false, latencyMs: 2, sourceUrl: "http://ems/stringviewer", error: "offline" } : success({ stringViewerDataModel: { soc: attempt } });
  });
  await scheduler.runCycle([row(1, 1)], 8, "http://ems");
  scheduler.requestRefresh("A1-S1", "failure");
  await scheduler.runCycle([row(1, 1)], 9, "http://ems");
  const failed = scheduler.getEntry("A1-S1")!;
  assert.equal(failed.success, false); assert.equal(failed.stale, true);
  assert.deepEqual(failed.value, { stringViewerDataModel: { soc: 1 } }, "failed refresh retains last-known-good");
  assert.equal(failed.cycleId, 8, "retained payload retains producing cycleId");
  scheduler.requestRefresh("A1-S1", "recovery");
  await scheduler.runCycle([row(1, 1)], 10, "http://ems");
  assert.equal(scheduler.getEntry("A1-S1")?.success, true); assert.equal(scheduler.getEntry("A1-S1")?.consecutiveFailureCount, 0);
}

function immutableAndParity(): void {
  const cache = new StringViewerCache<any>(() => 10_000);
  const identity = { arrayIndex: 1, stringIndex: 1, stringKey: "A1-S1", controllerIp: "10.0.0.1" };
  const source = { nested: { value: 1 } };
  cache.record(identity, 11, success(source));
  const entry = cache.get(identity)!;
  assert.equal(Object.isFrozen(entry), true); assert.equal(Object.isFrozen(entry.value.nested), true); assert.notEqual(entry.value, source); assert.equal(Object.isFrozen(source), false);
  assert.throws(() => { entry.value.nested.value = 2; });
  assert.deepEqual(source, { nested: { value: 1 } }, "source payload not mutated");

  const payload = { stringViewerDataModel: { dcBusVoltage: 1000, soc: 55, stringCurrent: 2, minCellGroupTemp: 20, maxCellGroupTemp: 30, positiveContactorClosed: true } };
  const before = structuredClone(payload);
  const target: any = { busVoltage: 900, socPct: 1, amps: 0, minCellTemperature: 0, maxCellTemperature: 0, positiveContactorClosed: false };
  mergeStringViewerMonitorFields(target, payload);
  assert.deepEqual(payload, before);
  assert.deepEqual([target.busVoltage, target.socPct, target.amps, target.minCellTemperature, target.maxCellTemperature, target.positiveContactorClosed], [1000, 55, 2, 20, 30, true], "legacy merge semantics preserved");
}

async function rollbackSweepCleanup(): Promise<void> {
  assert.equal(getStringViewerConfig({}).mode, "legacy", "safe default rollback mode");
  let calls = 0;
  const scheduler = new StringViewerScheduler({ ...config, forceFullRefresh: true, batchBudget: 1 }, async () => { calls += 1; return success({ calls }); });
  const rows = [row(1, 1), row(1, 2), row(1, 3)];
  await scheduler.runCycle(rows, 12, "http://ems"); await scheduler.runCycle(rows, 13, "http://ems");
  assert.equal(calls, 6, "forced full fan-out ignores scheduled budget and freshness");
  const debugState = scheduler.getDebugState();
  assert.deepEqual(debugState.fullRefreshProgress, { completed: 3, total: 3 });
  assert.equal(Object.hasOwn(debugState.oldestEntry ?? {}, "value"), false, "debug summaries never expose cached source payloads");
  assert.equal(scheduler.getDebugState().queueDepth, 0); assert.equal(scheduler.getDebugState().inFlight, 0);
  scheduler.shutdown(); assert.equal((await scheduler.runCycle([row(1, 4)], 14, "http://ems")).requested, 0);
  scheduler.reset(); assert.equal(scheduler.getDebugState().cacheSize, 0); assert.equal(scheduler.getDebugState().requestsAttempted, 0);
}

await coalescing(); await boundedAndDeterministic(); priorities(); await starvationAndDemand(); await freshness(); await retentionAndRecovery(); immutableAndParity(); await rollbackSweepCleanup();
console.log("StringViewer scheduler tests passed");
