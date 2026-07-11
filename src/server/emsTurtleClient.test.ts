import assert from "assert";
import { acquireEmsEndpointWithRestProvider, clearEmsTelemetryCache, getEmsSourcesDebugInfo } from "./emsTurtleClient";

const CONTROLLER_STATS_ENDPOINT = "/tools/report/ems/controllerStatistics.json";

function getControllerStatsDebugRow() {
  const row = getEmsSourcesDebugInfo().find((entry: any) => entry.endpoint === CONTROLLER_STATS_ENDPOINT);
  assert.ok(row, "controllerStatistics debug row should exist");
  return row;
}

async function runTests() {
  console.log("Running emsTurtleClient RestProvider tests...");

  const originalFetch = global.fetch;
  try {
    clearEmsTelemetryCache();
    global.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(JSON.stringify({ cycleClockTicks: 42 }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }) as typeof fetch;

    const successResult = await acquireEmsEndpointWithRestProvider(CONTROLLER_STATS_ENDPOINT, 1000);
    assert.strictEqual(successResult.success, true);
    assert.strictEqual(successResult.data?.cycleClockTicks, 42);

    const successDebug = getControllerStatsDebugRow();
    assert.strictEqual(successDebug.success, true);
    assert.strictEqual(successDebug.statusCode, 200);
    assert.strictEqual(successDebug.sourceUsed, "primary");
    assert.strictEqual(successDebug.fallbackUsed, false);
    assert.ok(successDebug.lastPollTime && successDebug.lastPollTime !== "NEVER");
    assert.ok(successDebug.durationMs >= 0);
    assert.strictEqual(successDebug.lastError, "NONE");
    console.log("  -> Success telemetry test passed");

    clearEmsTelemetryCache();
    global.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
      const target = String(input);
      if (target.includes("127.0.0.1:3000")) {
        return new Response(JSON.stringify({ cycleClockTicks: 84 }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      throw new Error("primary down");
    }) as typeof fetch;

    const fallbackResult = await acquireEmsEndpointWithRestProvider(CONTROLLER_STATS_ENDPOINT, 1000);
    assert.strictEqual(fallbackResult.success, true);
    assert.strictEqual(fallbackResult.data?.cycleClockTicks, 84);

    const fallbackDebug = getControllerStatsDebugRow();
    assert.strictEqual(fallbackDebug.success, true);
    assert.strictEqual(fallbackDebug.statusCode, 200);
    assert.strictEqual(fallbackDebug.fallbackUsed, true);
    assert.strictEqual(fallbackDebug.sourceUsed, "fallback-local-mock");
    assert.ok(typeof fallbackDebug.fallbackUrl === "string" && fallbackDebug.fallbackUrl.includes("127.0.0.1:3000"));
    assert.strictEqual(fallbackDebug.lastError, "NONE");
    console.log("  -> Fallback telemetry test passed");

    clearEmsTelemetryCache();
    global.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
      throw new Error("network down");
    }) as typeof fetch;

    const failureResult = await acquireEmsEndpointWithRestProvider(CONTROLLER_STATS_ENDPOINT, 1000);
    assert.strictEqual(failureResult.success, false);

    const failureDebug = getControllerStatsDebugRow();
    assert.strictEqual(failureDebug.success, false);
    assert.strictEqual(failureDebug.fallbackUsed, true);
    assert.strictEqual(failureDebug.sourceUsed, "fallback-local-mock");
    assert.ok(typeof failureDebug.lastError === "string" && failureDebug.lastError.toLowerCase().includes("network down"));
    assert.ok(failureDebug.lastPollTime && failureDebug.lastPollTime !== "NEVER");
    assert.ok(failureDebug.durationMs >= 0);
    console.log("  -> Failure telemetry test passed");
  } finally {
    global.fetch = originalFetch;
  }
}

runTests().catch((err) => {
  console.error("emsTurtleClient RestProvider test failed:", err);
  process.exit(1);
});
