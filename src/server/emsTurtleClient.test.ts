import assert from "assert";
import { acquireEmsEndpointWithRestProvider, clearEmsTelemetryCache, getEmsSourcesDebugInfo } from "./emsTurtleClient";

const LAST_CALL_ENDPOINT = "/tools/report/ems/lastCall.json";

function getEndpointDebugRow(endpoint: string) {
  const row = getEmsSourcesDebugInfo().find((entry: any) => entry.endpoint === endpoint);
  assert.ok(row, `debug row should exist for ${endpoint}`);
  return row;
}

function createAbortError(message: string): Error {
  const error = new Error(message);
  (error as any).name = "AbortError";
  return error;
}

async function runTests() {
  console.log("Running emsTurtleClient RestProvider tests...");

  const originalFetch = global.fetch;
  try {
    clearEmsTelemetryCache();
    global.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(JSON.stringify({ blockReport: { heartbeat: "ok" } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }) as typeof fetch;

    const successResult = await acquireEmsEndpointWithRestProvider(LAST_CALL_ENDPOINT, 1000);
    assert.strictEqual(successResult.success, true);
    assert.strictEqual(successResult.data?.blockReport?.heartbeat, "ok");

    const successDebug = getEndpointDebugRow(LAST_CALL_ENDPOINT);
    assert.strictEqual(successDebug.success, true);
    assert.strictEqual(successDebug.statusCode, 200);
    assert.strictEqual(successDebug.sourceUsed, "primary");
    assert.strictEqual(successDebug.fallbackUsed, false);
    assert.ok(successDebug.lastPollTime && successDebug.lastPollTime !== "NEVER");
    assert.ok(successDebug.lastAttemptAt && successDebug.lastAttemptAt !== "NEVER");
    assert.ok(successDebug.durationMs >= 0);
    assert.strictEqual(successDebug.lastError, "NONE");
    const firstAttemptAt = successDebug.lastAttemptAt;
    console.log("  -> lastCall success telemetry test passed");

    clearEmsTelemetryCache();
    global.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
      throw createAbortError("This operation was aborted");
    }) as typeof fetch;

    const timeoutResult = await acquireEmsEndpointWithRestProvider(LAST_CALL_ENDPOINT, 1000);
    assert.strictEqual(timeoutResult.success, false);

    const timeoutDebug = getEndpointDebugRow(LAST_CALL_ENDPOINT);
    assert.strictEqual(timeoutDebug.success, false);
    assert.strictEqual(timeoutDebug.fallbackUsed, true);
    assert.strictEqual(timeoutDebug.sourceUsed, "fallback-local-mock");
    assert.strictEqual(timeoutDebug.statusCode, 408);
    assert.ok(typeof timeoutDebug.lastError === "string" && timeoutDebug.lastError.toLowerCase().includes("aborted"));
    assert.ok(timeoutDebug.lastAttemptAt && timeoutDebug.lastAttemptAt !== "NEVER");
    assert.ok(timeoutDebug.durationMs >= 0);
    console.log("  -> lastCall timeout telemetry test passed");

    clearEmsTelemetryCache();
    global.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
      const target = String(input);
      if (target.includes("127.0.0.1:3000")) {
        return new Response(JSON.stringify({ blockReport: { heartbeat: "fallback" } }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      throw new Error("primary down");
    }) as typeof fetch;

    const fallbackResult = await acquireEmsEndpointWithRestProvider(LAST_CALL_ENDPOINT, 1000);
    assert.strictEqual(fallbackResult.success, true);
    assert.strictEqual(fallbackResult.data?.blockReport?.heartbeat, "fallback");

    const fallbackDebug = getEndpointDebugRow(LAST_CALL_ENDPOINT);
    assert.strictEqual(fallbackDebug.success, true);
    assert.strictEqual(fallbackDebug.statusCode, 200);
    assert.strictEqual(fallbackDebug.fallbackUsed, true);
    assert.strictEqual(fallbackDebug.sourceUsed, "fallback-local-mock");
    assert.ok(typeof fallbackDebug.fallbackUrl === "string" && fallbackDebug.fallbackUrl.includes("127.0.0.1:3000"));
    assert.ok(fallbackDebug.lastAttemptAt && fallbackDebug.lastAttemptAt !== "NEVER");
    assert.strictEqual(fallbackDebug.lastError, "NONE");
    assert.notStrictEqual(fallbackDebug.lastAttemptAt, firstAttemptAt);
    console.log("  -> lastCall fallback telemetry test passed");
  } finally {
    global.fetch = originalFetch;
  }
}

runTests().catch((err) => {
  console.error("emsTurtleClient RestProvider test failed:", err);
  process.exit(1);
});
