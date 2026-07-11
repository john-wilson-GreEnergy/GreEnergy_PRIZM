import assert from "assert";
import { TelemetryBroker } from "./TelemetryBroker";
import { TelemetryAuthorityRegistry, TelemetryAuthorityRule } from "./TelemetryAuthority";
import { TelemetryProvider } from "./TelemetryProvider";

function isoNow() {
  return new Date().toISOString();
}

type ProviderInput = {
  id: string;
  domains: string[];
  healthy: boolean;
  stale: boolean;
  lastSuccessAt?: string | null;
  lastError?: string | null;
  payload?: any;
};

function makeProvider(input: ProviderInput): TelemetryProvider {
  const mutablePayload = input.payload || { value: input.id };
  return {
    id: input.id,
    domains: input.domains as any,
    async captureSnapshot() {
      return {
        providerId: input.id,
        capturedAt: isoNow(),
        domains: {
          "controller-health": input.domains.includes("controller-health")
            ? { source: input.id, payload: mutablePayload }
            : undefined,
          "string-telemetry": input.domains.includes("string-telemetry")
            ? { source: input.id, rows: [1] }
            : undefined,
          "feather-hvac-telemetry": input.domains.includes("feather-hvac-telemetry")
            ? { source: input.id, devices: [1] }
            : undefined,
          notifications: input.domains.includes("notifications")
            ? { source: input.id, list: [1] }
            : undefined,
          "first-responder-safety": input.domains.includes("first-responder-safety")
            ? { source: input.id, data: [1] }
            : undefined,
        },
        health: {
          providerId: input.id,
          healthy: input.healthy,
          stale: input.stale,
          latencyMs: 5,
          lastSuccessAt: input.lastSuccessAt ?? isoNow(),
          lastError: input.lastError ?? null,
          consecutiveFailures: input.healthy ? 0 : 1,
        },
        provenance: {
          source: input.id,
        },
      } as any;
    },
  };
}

async function runTests() {
  console.log("Running TelemetryBroker foundation tests...");

  const customRules: Record<any, TelemetryAuthorityRule> = {
    "controller-health": {
      domain: "controller-health",
      preferredSource: "turtle",
      fallbackSources: ["first-responder"],
      confidence: 0.9,
      freshnessTargetMs: 60000,
      continuity: "continuous",
    },
    "string-telemetry": {
      domain: "string-telemetry",
      preferredSource: "turtle",
      fallbackSources: ["feather"],
      confidence: 0.9,
      freshnessTargetMs: 60000,
      continuity: "continuous",
    },
    "feather-hvac-telemetry": {
      domain: "feather-hvac-telemetry",
      preferredSource: "feather",
      fallbackSources: ["turtle"],
      confidence: 0.9,
      freshnessTargetMs: 60000,
      continuity: "continuous",
    },
    notifications: {
      domain: "notifications",
      preferredSource: "turtle",
      fallbackSources: ["feather"],
      confidence: 0.9,
      freshnessTargetMs: 60000,
      continuity: "continuous",
    },
    "first-responder-safety": {
      domain: "first-responder-safety",
      preferredSource: "first-responder",
      fallbackSources: ["turtle"],
      confidence: 0.95,
      freshnessTargetMs: 60000,
      continuity: "on-demand",
    },
  };

  const broker = new TelemetryBroker(new TelemetryAuthorityRegistry(customRules as any));

  const turtle = makeProvider({
    id: "turtle",
    domains: ["controller-health", "string-telemetry", "notifications"],
    healthy: true,
    stale: false,
    payload: { deep: { value: 1 } },
  });
  const feather = makeProvider({
    id: "feather",
    domains: ["feather-hvac-telemetry", "notifications"],
    healthy: true,
    stale: false,
  });
  const firstResponder = makeProvider({
    id: "first-responder",
    domains: ["first-responder-safety", "controller-health"],
    healthy: true,
    stale: false,
  });

  broker.registerProvider(turtle);
  broker.registerProvider(feather);
  broker.registerProvider(firstResponder);

  assert.deepStrictEqual(broker.getProviderIds().sort(), ["feather", "first-responder", "turtle"]);
  console.log("  -> provider registration test passed");

  const authority = broker.getAuthorityRegistry();
  const resolution = authority.resolve("controller-health", {
    turtle: { providerId: "turtle", healthy: true, stale: false, latencyMs: 2, lastSuccessAt: isoNow(), lastError: null, consecutiveFailures: 0 },
    "first-responder": { providerId: "first-responder", healthy: true, stale: false, latencyMs: 2, lastSuccessAt: isoNow(), lastError: null, consecutiveFailures: 0 },
  } as any);
  assert.strictEqual(resolution.chosenProviderId, "turtle");
  assert.strictEqual(resolution.fallbackUsed, false);
  console.log("  -> authority resolution test passed");

  const fallbackResolution = authority.resolve("controller-health", {
    turtle: { providerId: "turtle", healthy: false, stale: true, latencyMs: 2, lastSuccessAt: null, lastError: "down", consecutiveFailures: 3 },
    "first-responder": { providerId: "first-responder", healthy: true, stale: false, latencyMs: 2, lastSuccessAt: isoNow(), lastError: null, consecutiveFailures: 0 },
  } as any);
  assert.strictEqual(fallbackResolution.chosenProviderId, "first-responder");
  assert.strictEqual(fallbackResolution.fallbackUsed, true);
  console.log("  -> fallback selection test passed");

  const stalePreferredResolution = authority.resolve("string-telemetry", {
    turtle: { providerId: "turtle", healthy: true, stale: true, latencyMs: 2, lastSuccessAt: null, lastError: "stale", consecutiveFailures: 1 },
    feather: { providerId: "feather", healthy: true, stale: false, latencyMs: 2, lastSuccessAt: isoNow(), lastError: null, consecutiveFailures: 0 },
  } as any);
  assert.strictEqual(stalePreferredResolution.chosenProviderId, "feather");
  assert.strictEqual(stalePreferredResolution.fallbackUsed, true);
  console.log("  -> stale preferred fallback test passed");

  const snapshot = await broker.collectSnapshot();
  assert.ok(snapshot.health.turtle);
  assert.ok(snapshot.health.feather);
  assert.ok(snapshot.health["first-responder"]);
  assert.strictEqual(typeof snapshot.health.turtle.healthy, "boolean");
  console.log("  -> provider health reporting test passed");

  assert.ok(snapshot.unified.controllerHealth);
  assert.ok(snapshot.unified.stringTelemetry);
  assert.ok(snapshot.unified.featherTelemetry);
  assert.ok(snapshot.unified.notifications);
  assert.ok(snapshot.unified.firstResponderSafety);
  console.log("  -> unified snapshot shape test passed");

  (snapshot.providers.turtle.domains as any)["controller-health"].payload.deep.value = 999;
  const freshSnapshot = await broker.collectSnapshot();
  const freshValue = (freshSnapshot.providers.turtle.domains as any)["controller-health"].payload.deep.value;
  assert.strictEqual(freshValue, 1);
  console.log("  -> no mutation of provider-owned data test passed");

  console.log("TelemetryBroker foundation tests passed!");
}

runTests().catch((err) => {
  console.error("TelemetryBroker foundation tests failed:", err);
  process.exit(1);
});
