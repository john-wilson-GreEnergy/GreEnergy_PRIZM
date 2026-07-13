import assert from "node:assert/strict";
import { buildFeatherDeviceStatusRouteResponse } from "../../feather/featherStatusBrokerRoute";
import { FeatherTelemetryProvider } from "../providers/FeatherTelemetryProvider";
import { FeatherRawCache } from "./FeatherCache";
import { FeatherParser } from "./FeatherParser";
import { classifyFeatherPriority } from "./FeatherPriority";
import { FeatherScheduler, getFeatherSchedulerConfig, shouldUseLegacyFeatherStatus, featherScheduler as singleton } from "./FeatherScheduler";
import type { FeatherAcquisitionResult, FeatherCandidate, FeatherSchedulerConfig } from "./FeatherTypes";

const config: FeatherSchedulerConfig = { mode: "scheduled", maxConcurrency: 2, maxRefreshesPerCycle: 10, hotTtlMs: 100, warmTtlMs: 100, coldTtlMs: 100, forceFullRefresh: false, timeoutMs: 1000 };
const candidate = (deviceIp: string, extra: Record<string, unknown> = {}): any => ({ deviceIp, sourceDiscoveryMethod: "topology-profile", entityName: `Feather ${deviceIp}`, ...extra });
const payload = (version = 1) => ({ turtleVersion: { fwVersionMajor: 1, fwVersionMinor: 2, fwVersionRevision: version }, operationalState: "NORMAL", thermalData: { spaceTemperature: 24, avgCellTemperature: 23, supplyAirTemp: 18, coolingSetpoint: 28, heatingSetpoint: 18, thermostatStage: "stage-1", HVAC1Controls: { valid: true }, HVAC1Data: { valid: true }, HVAC2Controls: { valid: true }, HVAC2Data: { valid: true } }, doors: { valid: true, batteryDoorsClosed: true }, fssSignals: { valid: true } });
const acquisition = (version = 1, ok = true): FeatherAcquisitionResult => ({
  report: { ok, status: ok ? 200 : 0, data: ok ? payload(version) : null, error: ok ? null : "offline", durationMs: 5, bytes: ok ? 100 : 0 },
  mainData: { ok, status: ok ? 200 : 0, data: ok ? { timestamp: "2026-07-13T00:00:00Z", thermal: { spaceTemperature: 24 } } : null, error: ok ? null : "skipped", durationMs: ok ? 4 : 0, bytes: ok ? 50 : 0 },
  startedAt: "2026-07-13T00:00:00.000Z", completedAt: "2026-07-13T00:00:00.010Z", totalLatencyMs: 10,
});

async function oneInflightAndCoalescing(): Promise<void> {
  let calls = 0; let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const scheduler = new FeatherScheduler(config, async () => { calls++; await gate; return acquisition(); });
  const first = scheduler.refreshController("10.0.1.3", "first", 1);
  const second = scheduler.refreshController("10.0.1.3", "second", 1);
  await Promise.resolve(); assert.equal(calls, 1);
  release(); const [a, b] = await Promise.all([first, second]);
  assert.deepEqual(a, b); assert.equal(scheduler.metrics.coalescedRequests, 1); assert.equal(scheduler.getSchedulerState().inFlight, 0);
}

async function boundedDeterministicAndNoStarvation(): Promise<void> {
  let active = 0; let maximum = 0; const order: string[] = [];
  const scheduler = new FeatherScheduler({ ...config, maxConcurrency: 2, maxRefreshesPerCycle: 3 }, async (value) => {
    order.push(value.deviceIp); active++; maximum = Math.max(maximum, active); await new Promise((resolve) => setTimeout(resolve, 2)); active--; return acquisition();
  });
  await scheduler.runCycle([candidate("10.0.1.20"), candidate("10.0.1.3"), candidate("10.0.1.10"), candidate("10.0.1.15", { excluded: true, excludeReason: "string-controller-or-inferred-es-host" })], 2);
  assert.equal(maximum, 2); assert.deepEqual(order, ["10.0.1.3", "10.0.1.10", "10.0.1.15"], "priority order is deterministic and cold receives a slot");
}

function prioritiesAndRollback(): void {
  assert.equal(classifyFeatherPriority({ requested: true }), "ON_DEMAND");
  assert.equal(classifyFeatherPriority({ stale: true }), "HOT");
  assert.equal(classifyFeatherPriority({ neverSuccessful: true }), "HOT");
  assert.equal(classifyFeatherPriority({ online: true }), "WARM");
  assert.equal(classifyFeatherPriority({ online: true, stable: true }), "COLD");
  assert.equal(getFeatherSchedulerConfig({}).mode, "legacy");
  assert.equal(getFeatherSchedulerConfig({}).maxConcurrency, 32);
  assert.equal(getFeatherSchedulerConfig({}).maxRefreshesPerCycle, 64);
  assert.equal(getFeatherSchedulerConfig({}).hotTtlMs, 60_000);
  assert.equal(getFeatherSchedulerConfig({}).warmTtlMs, 90_000);
  assert.equal(getFeatherSchedulerConfig({}).coldTtlMs, 300_000);
  assert.equal(getFeatherSchedulerConfig({ PRIZM_FEATHER_MODE: "scheduled" }).mode, "scheduled");
  assert.equal(shouldUseLegacyFeatherStatus({ queryLegacy: true, mode: "scheduled" }), true);
  assert.equal(shouldUseLegacyFeatherStatus({ forceLegacyEnv: true, mode: "scheduled" }), true);
  assert.equal(shouldUseLegacyFeatherStatus({ disableBrokerEnv: true, mode: "scheduled" }), true);
  assert.equal(shouldUseLegacyFeatherStatus({ mode: "scheduled" }), false);
  assert.equal(shouldUseLegacyFeatherStatus({ mode: "legacy" }), true);
}

async function freshnessParseReuseAndChange(): Promise<void> {
  let now = Date.parse("2026-07-13T00:00:00Z"); let calls = 0; let version = 1;
  const cache = new FeatherRawCache(() => now); const parser = new FeatherParser(() => now);
  const scheduler = new FeatherScheduler(config, async () => { calls++; return acquisition(version); }, undefined, cache, parser);
  await scheduler.runCycle([candidate("10.0.1.3")], 3); await scheduler.runCycle([candidate("10.0.1.3")], 4);
  assert.equal(calls, 1); assert.equal(scheduler.metrics.skippedFresh, 1); assert.equal(scheduler.metrics.parseMisses, 1);
  now += 101; await scheduler.runCycle([candidate("10.0.1.3")], 5);
  assert.equal(calls, 2); assert.equal(scheduler.metrics.parseHits, 1, "unchanged fingerprint reuses parse");
  version = 2; scheduler.requestRefresh("10.0.1.3", "changed"); await scheduler.runCycle([candidate("10.0.1.3")], 6);
  assert.equal(scheduler.metrics.parseMisses, 2, "changed fingerprint reparses"); assert.equal(scheduler.getControllerSnapshot("10.0.1.3")?.cycleId, 6);
}

async function retentionMissingRecoveryAndImmutability(): Promise<void> {
  let attempt = 0;
  const scheduler = new FeatherScheduler(config, async () => { attempt++; return acquisition(attempt, attempt !== 2); });
  await scheduler.refreshController("10.0.1.3", "initial", 7);
  scheduler.requestRefresh("10.0.1.3", "failure"); await scheduler.runCycle([candidate("10.0.1.3")], 8);
  const retained = scheduler.rawCache.get("10.0.1.3")!;
  assert.equal(retained.success, false); assert.equal(retained.stale, true); assert.equal(retained.retainedLastKnownGood, true); assert.equal(retained.cycleId, 7); assert.equal(retained.failureCycleId, 8);
  assert.ok(retained.reportPayload); assert.equal(Object.isFrozen(retained.reportPayload), true); assert.throws(() => { (retained.reportPayload as any).operationalState = "MUTATED"; });
  assert.equal(Object.isFrozen(scheduler.getControllerSnapshot("10.0.1.3")!), true);
  scheduler.requestRefresh("10.0.1.3", "recovery"); await scheduler.runCycle([candidate("10.0.1.3")], 9); assert.equal(scheduler.rawCache.get("10.0.1.3")?.success, true);

  const missing = new FeatherScheduler(config, async () => acquisition(1, false));
  assert.equal(await missing.refreshController("10.0.9.9", "missing", 10), null); assert.equal(missing.rawCache.get("10.0.9.9")?.retainedLastKnownGood, false);
}

async function reportOnlyParsePreservesImmutability(): Promise<void> {
  const reportOnly = acquisition();
  reportOnly.mainData = { ok: false, status: 0, data: null, error: "main unavailable", durationMs: 1, bytes: 0 };
  const scheduler = new FeatherScheduler(config, async () => reportOnly);
  const snapshot = await scheduler.refreshController("10.0.1.3", "report-only", 10);
  assert.ok(snapshot, "a valid status report remains publishable when optional main data is unavailable");
  assert.equal((snapshot!.normalized.rawResponse as any)._mainDataError, "main unavailable");
  assert.equal(Object.isFrozen(scheduler.rawCache.get("10.0.1.3")!.reportPayload), true);
}

async function diagnosticsScopeAndTopology(): Promise<void> {
  let diagnosticCalls = 0;
  const scheduler = new FeatherScheduler(config, async (value) => acquisition(1, value.deviceIp.endsWith(".3")), async (ip) => { diagnosticCalls++; return { success: true, deviceIp: ip, endpoint: `http://${ip}/internal`, responseDurationMs: 1, diagnostics: { secret: "diagnostic" }, error: null }; });
  await scheduler.runCycle([candidate("10.0.1.3"), candidate("10.0.1.10"), candidate("10.0.1.15", { excluded: true, excludeReason: "string-controller-or-inferred-es-host" })], 11);
  const before = scheduler.rawCache.size;
  const first = scheduler.requestDiagnostics("10.0.1.3", "test"); const second = scheduler.requestDiagnostics("10.0.1.3", "test");
  assert.deepEqual(await first, await second); assert.equal(diagnosticCalls, 1); assert.equal(scheduler.rawCache.size, before, "diagnostics never enter baseline cache");
  const topology = scheduler.getSchedulerState().topologyClassification;
  assert.ok(topology["expected-and-reachable"].includes("10.0.1.3")); assert.ok(topology["expected-but-unavailable"].includes("10.0.1.10")); assert.ok(topology["topology-derived-false-candidate"].includes("10.0.1.15"));
}

async function failedCandidateHonorsRetryTtl(): Promise<void> {
  let now = Date.parse("2026-07-13T00:00:00Z"); let calls = 0;
  const cache = new FeatherRawCache(() => now);
  const scheduler = new FeatherScheduler(config, async () => { calls++; return acquisition(1, false); }, undefined, cache);
  await scheduler.runCycle([candidate("10.0.1.10", { excluded: true, excludeReason: "string-controller-or-inferred-es-host" })], 12);
  await scheduler.runCycle([candidate("10.0.1.10", { excluded: true, excludeReason: "string-controller-or-inferred-es-host" })], 13);
  assert.equal(calls, 1, "failed candidate remains stale but does not retry before its priority TTL");
  now += 111;
  await scheduler.runCycle([candidate("10.0.1.10", { excluded: true, excludeReason: "string-controller-or-inferred-es-host" })], 14);
  assert.equal(calls, 2);
}

async function routeContractAndProvider(): Promise<void> {
  const ip = "10.0.1.3"; const direct = { deviceIp: ip, ip, reachable: true, thermostatStage: "stage-1", coolingSetpoint: 28, heatingSetpoint: 18, alarmCount: 0, activeAlarms: [] };
  const brokerSnapshot = { authorities: { "feather-hvac-telemetry": { chosenProviderId: "feather", stale: false } }, health: { feather: { healthy: true, stale: false } } };
  const legacy = await buildFeatherDeviceStatusRouteResponse({ deviceIp: ip, sourceMethod: "manual", includeDiagnostics: false, timeoutMs: 1, snapshot: { normalized: { feather: [direct] } }, lastEnrichedCache: null, forceLegacy: true, cacheOnly: true, scheduledDevice: direct, brokerSnapshot });
  const scheduled = await buildFeatherDeviceStatusRouteResponse({ deviceIp: ip, sourceMethod: "manual", includeDiagnostics: false, timeoutMs: 1, snapshot: { normalized: { feather: [direct] } }, lastEnrichedCache: null, cacheOnly: true, scheduledDevice: direct, brokerSnapshot });
  assert.deepEqual(Object.keys(scheduled.response), Object.keys(legacy.response)); assert.deepEqual(Object.keys(scheduled.response.device).sort(), Object.keys(legacy.response.device).sort()); assert.equal(scheduled.routeTriggeredNetworkCalls, 0);
  const diagnostics = await buildFeatherDeviceStatusRouteResponse({ deviceIp: ip, sourceMethod: "manual", includeDiagnostics: true, timeoutMs: 1, snapshot: { normalized: { feather: [direct] } }, lastEnrichedCache: null, cacheOnly: true, scheduledDevice: direct, brokerSnapshot, queryDiagnosticsFn: async () => ({ success: true, deviceIp: ip, endpoint: "internal", responseDurationMs: 1, diagnostics: { ok: true }, error: null }) });
  assert.ok(diagnostics.response.device.diagnostics); assert.equal(diagnostics.routeTriggeredNetworkCalls, 1);

  const oldMode = singleton.config.mode; (singleton.config as any).mode = "scheduled"; singleton.reset();
  const rawCandidate = { ...candidate(ip), priority: "HOT", topologyClassification: "expected-but-unavailable" } as FeatherCandidate;
  const raw = singleton.rawCache.record(rawCandidate, 12, acquisition()); singleton.parser.parse(raw, rawCandidate);
  const provider = await new FeatherTelemetryProvider().captureSnapshot();
  assert.equal(provider.provenance.source, "feather-scheduler"); assert.equal((provider.domains["feather-hvac-telemetry"] as any).devices.length, 1);
  singleton.reset(); (singleton.config as any).mode = oldMode;
}

async function resetShutdownMetrics(): Promise<void> {
  const scheduler = new FeatherScheduler({ ...config, forceFullRefresh: true, maxRefreshesPerCycle: 1 }, async () => acquisition());
  await scheduler.runCycle([candidate("10.0.1.3"), candidate("10.0.1.10")], 13); assert.equal(scheduler.metrics.attempts, 2); assert.equal(scheduler.metrics.successes, 2);
  scheduler.shutdown(); assert.equal((await scheduler.runCycle([candidate("10.0.1.15")], 14)).requested, 0);
  scheduler.reset(); assert.equal(scheduler.getSchedulerState().cacheSize, 0); assert.equal(scheduler.metrics.attempts, 0);
}

await oneInflightAndCoalescing(); await boundedDeterministicAndNoStarvation(); prioritiesAndRollback(); await freshnessParseReuseAndChange(); await retentionMissingRecoveryAndImmutability(); await reportOnlyParsePreservesImmutability(); await diagnosticsScopeAndTopology(); await failedCandidateHonorsRetryTtl(); await routeContractAndProvider(); await resetShutdownMetrics();
console.log("Feather scheduler tests passed");
