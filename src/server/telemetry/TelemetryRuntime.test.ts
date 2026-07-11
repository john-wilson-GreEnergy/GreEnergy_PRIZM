import assert from "assert";
import { getTelemetryBroker, TelemetryRuntime } from "./TelemetryRuntime";
import { UnifiedTelemetrySnapshot } from "./TelemetryProvider";

function healthySnapshot(value: number): UnifiedTelemetrySnapshot {
  const now = new Date().toISOString();
  return {
    capturedAt: now,
    authorities: {
      "controller-health": { chosenProviderId: "turtle", stale: false },
      "string-telemetry": { chosenProviderId: "turtle", stale: false },
      "feather-hvac-telemetry": { chosenProviderId: "feather", stale: false },
      notifications: { chosenProviderId: "turtle", stale: false },
      "first-responder-safety": { chosenProviderId: "first-responder", stale: false },
    },
    health: {
      turtle: {
        providerId: "turtle",
        healthy: true,
        stale: false,
        latencyMs: 3,
        lastSuccessAt: now,
        lastError: null,
        consecutiveFailures: 0,
      },
      feather: {
        providerId: "feather",
        healthy: true,
        stale: false,
        latencyMs: 4,
        lastSuccessAt: now,
        lastError: null,
        consecutiveFailures: 0,
      },
      "first-responder": {
        providerId: "first-responder",
        healthy: true,
        stale: false,
        latencyMs: 5,
        lastSuccessAt: now,
        lastError: null,
        consecutiveFailures: 0,
      },
    },
    providers: {},
    unified: {
      controllerHealth: {
        connectionState: "connected",
        sourceMode: "live",
        stationCode: "TEST",
        activeProfileId: "profile-1",
        activeProfileName: "test",
        lastUpdatedAt: now,
        stale: false,
        lastError: null,
      },
      stringTelemetry: {
        rows: [{ arrayIndex: 1, stringIndex: 1, stringKey: "A1-S1", connectionState: "Online", socPct: value, voltageV: 900, currentA: 1 }],
        totalRows: 1,
      },
      featherTelemetry: { devices: [], totalDevices: 0, reachableDevices: 0, stale: false },
      notifications: { canonicalIdentityVersion: "v2", arrayNotifications: [], stringNotifications: [] },
      firstResponderSafety: { v1: {}, v2: {}, stale: false, lastUpdatedAt: now },
    },
  };
}

async function runTests() {
  console.log("Running TelemetryRuntime tests...");

  assert.strictEqual(getTelemetryBroker(), getTelemetryBroker());
  const providerIds = getTelemetryBroker().getProviderIds();
  assert.deepStrictEqual(providerIds.sort(), ["feather", "first-responder", "turtle"]);
  assert.strictEqual(new Set(providerIds).size, 3);
  console.log("  -> singleton identity and one-time provider registration tests passed");

  let resolveCollection: ((snapshot: UnifiedTelemetrySnapshot) => void) | undefined;
  let collectionCount = 0;
  const sharedSnapshot = healthySnapshot(55);
  const concurrentRuntime = new TelemetryRuntime({
    collectSnapshot: () => {
      collectionCount += 1;
      return new Promise<UnifiedTelemetrySnapshot>((resolve) => {
        resolveCollection = resolve;
      });
    },
  });
  const first = concurrentRuntime.collectSnapshot();
  const second = concurrentRuntime.collectSnapshot();
  assert.strictEqual(first, second);
  assert.strictEqual(collectionCount, 1);
  resolveCollection?.(sharedSnapshot);
  await Promise.all([first, second]);
  console.log("  -> concurrent callers share one collection test passed");

  const firstGood = healthySnapshot(61);
  const failed = healthySnapshot(99);
  failed.authorities["string-telemetry"] = {
    chosenProviderId: "turtle",
    stale: true,
    reason: "no-healthy-fresh-provider",
  };
  failed.health.turtle = {
    providerId: "turtle",
    healthy: false,
    stale: true,
    latencyMs: 12,
    lastSuccessAt: null,
    lastError: "turtle unavailable",
    consecutiveFailures: 1,
  };
  failed.unified.stringTelemetry = null;

  const snapshots = [firstGood, failed];
  const retentionRuntime = new TelemetryRuntime({
    collectSnapshot: async () => snapshots.shift() as UnifiedTelemetrySnapshot,
  });
  const retainedSource = healthySnapshot(61);
  await retentionRuntime.collectSnapshot();
  firstGood.unified.stringTelemetry!.rows[0].socPct = 5;
  const retained = await retentionRuntime.collectSnapshot();

  assert.strictEqual(retained.unified.stringTelemetry?.rows[0].socPct, 61);
  assert.strictEqual(retained.authorities["string-telemetry"].stale, true);
  assert.strictEqual(retained.health.turtle.healthy, false);
  assert.strictEqual(retained.health.turtle.stale, true);
  assert.strictEqual(retained.health.turtle.lastError, "turtle unavailable");
  assert.ok(retained.health.turtle.lastSuccessAt);
  assert.strictEqual(retained.health.turtle.consecutiveFailures, 1);
  console.log("  -> last-known-good retention and health/error update tests passed");

  const latest = retentionRuntime.getLatestSnapshot();
  latest!.unified.stringTelemetry!.rows[0].socPct = 0;
  assert.strictEqual(retentionRuntime.getLatestSnapshot()!.unified.stringTelemetry!.rows[0].socPct, 61);
  assert.strictEqual(retainedSource.unified.stringTelemetry!.rows[0].socPct, 61);
  console.log("  -> no mutation of provider-owned or retained snapshot data test passed");

  console.log("TelemetryRuntime tests passed!");
}

runTests().catch((error) => {
  console.error("TelemetryRuntime tests failed:", error);
  process.exit(1);
});
