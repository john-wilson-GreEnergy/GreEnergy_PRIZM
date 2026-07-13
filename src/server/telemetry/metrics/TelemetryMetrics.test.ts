import assert from "node:assert/strict";
import { TelemetryMetrics } from "./TelemetryMetrics";
import { TelemetryMetricsRegistry } from "./TelemetryMetricsRegistry";
import { runInTelemetryCycle } from "../TelemetryCycleContext";

function metricFor(registry: TelemetryMetricsRegistry, endpoint: string) {
  const metric = registry.getEndpoints().find((entry) => entry.endpoint === endpoint);
  assert.ok(metric, `expected metric for ${endpoint}`);
  return metric;
}

async function run(): Promise<void> {
  console.log("Running telemetry performance metrics tests...");

  let now = 0;
  const registry = new TelemetryMetricsRegistry(() => now);
  registry.registerEndpoint("ems-turtle", "/strings.csv");
  assert.equal(metricFor(registry, "/strings.csv").requestCount, 0, "registration must not count a request");

  const success = registry.beginEndpoint("ems-turtle", "/strings.csv");
  now = 10;
  success.finish({ success: true, responseBytes: 100, parseDurationMs: 2, normalizationDurationMs: 3, cacheWriteDurationMs: 1 });
  const failure = registry.beginEndpoint("ems-turtle", "/strings.csv");
  now = 40;
  failure.finish({ success: false, timeout: true, fallback: true });

  let endpoint = metricFor(registry, "/strings.csv");
  assert.equal(endpoint.requestCount, 2);
  assert.equal(endpoint.successCount, 1);
  assert.equal(endpoint.failureCount, 1);
  assert.equal(endpoint.timeoutCount, 1);
  assert.equal(endpoint.fallbackCount, 1);
  assert.equal(endpoint.minimumMs, 10);
  assert.equal(endpoint.maximumMs, 30);
  assert.equal(endpoint.rollingAverageMs, 20);
  assert.equal(endpoint.parseDuration.latestMs, 2);
  assert.equal(endpoint.normalizationDuration.latestMs, 3);
  assert.equal(endpoint.cacheWriteDuration.latestMs, 1);

  now = 50;
  const concurrentA = registry.beginEndpoint("feather", "/status/report.json");
  now = 51;
  const concurrentB = registry.beginEndpoint("feather", "/status/report.json");
  assert.equal(metricFor(registry, "/status/report.json").inFlightRequestCount, 2);
  assert.equal(metricFor(registry, "/status/report.json").maximumConcurrentRequests, 2);
  assert.equal(metricFor(registry, "/status/report.json").duplicateRequestCount, 1);
  now = 55;
  concurrentB.finish({ success: true });
  now = 60;
  concurrentA.finish({ success: true });
  assert.equal(metricFor(registry, "/status/report.json").inFlightRequestCount, 0);

  registry.recordRetainedLastKnownGood(2);
  registry.recordStaleDomainRetention(2);
  assert.equal(registry.getBroker().retainedLastKnownGoodUsageCount, 2);
  assert.equal(registry.getBroker().staleDomainRetentionCount, 2);
  registry.recordEndpointCoalesced("telemetry-runtime", "collectSnapshot");
  assert.equal(metricFor(registry, "collectSnapshot").coalescedRequestCount, 1);

  const sourcePayload = { timestamp: "2026-07-13T00:00:00.000Z", nested: { value: 7 } };
  const before = structuredClone(sourcePayload);
  const immutable = registry.beginEndpoint("first-responder", "/v2/firstresponder/data");
  immutable.finish({ success: true, sourceObservationTimestamp: sourcePayload.timestamp, acquisitionTimestamp: "2026-07-13T00:00:01.000Z" });
  assert.deepEqual(sourcePayload, before, "metrics accounting must not mutate source payloads");
  assert.equal(metricFor(registry, "/v2/firstresponder/data").calculatedDataAgeMs, 1000);

  runInTelemetryCycle(42, () => {
    const lineage = registry.beginEndpoint("ems-turtle", "/lineage.json");
    lineage.finish({ success: true });
    const provider = registry.beginProvider("lineage-provider");
    provider.finish(true);
    const broker = registry.beginBrokerCollection();
    broker.finish(true);
  });
  assert.equal(metricFor(registry, "/lineage.json").latestCycleId, 42);
  assert.equal(metricFor(registry, "/lineage.json").requestsByCycleId["42"], 1);
  assert.equal(registry.getProviders().find((provider) => provider.providerId === "lineage-provider")?.latestCycleId, 42);
  assert.equal(registry.getBroker().latestCycleId, 42);

  registry.recordCoordinatorPhase("EMS strings.csv", { durationMs: 12, retries: 1, bytes: 256, blocking: true });
  registry.recordCoordinatorPhase("EMS strings.csv", { durationMs: 28, failed: true, blocking: true });
  const phaseMetric = registry.getCoordinatorPhases().find((phase) => phase.phase === "EMS strings.csv");
  assert.ok(phaseMetric);
  assert.equal(phaseMetric.count, 2);
  assert.equal(phaseMetric.failureCount, 1);
  assert.equal(phaseMetric.retryCount, 1);
  assert.equal(phaseMetric.totalBytes, 256);
  assert.equal(phaseMetric.blockingCount, 2);
  assert.equal(phaseMetric.rollingAverageMs, 20);

  const metrics = new TelemetryMetrics(registry);
  const report = metrics.report();
  assert.equal(report.suspectedDuplicatePolls.length, 2);
  assert.ok(report.recommendations.length > 0);

  const preResetCoordinator = registry.beginCoordinatorCycle();
  const preResetBroker = registry.beginBrokerCollection();
  metrics.reset();
  preResetCoordinator.finish(true);
  preResetBroker.finish(true);
  assert.equal(registry.getEndpoints().length, 0);
  assert.equal(registry.getBroker().retainedLastKnownGoodUsageCount, 0);
  assert.equal(registry.getBroker().collectionCount, 0, "pre-reset broker completion must remain isolated");
  assert.equal(registry.getCoordinator().cycleCount, 0);
  assert.equal(registry.getCoordinator().completedCycleCount, 0, "pre-reset coordinator completion must remain isolated");
  assert.equal(registry.getCoordinatorPhases().length, 0);

  console.log("Telemetry performance metrics tests passed!");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
