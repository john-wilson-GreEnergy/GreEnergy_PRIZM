import * as assert from "assert";
import { buildFeatherDeviceStatusRouteResponse } from "./featherStatusBrokerRoute";

console.log("Running Feather status broker migration tests...");

function mkDirect(ip: string) {
  return {
    ip,
    deviceIp: ip,
    reachable: true,
    hvacType: "RACK",
    segmentType: "battery-segment",
    thermostatStage: "stage-1",
    coolingSetpoint: 28,
    heatingSetpoint: 18,
    spaceTemperature: 24.1,
    avgCellTemperature: 23.5,
    supplyAirTemp: 19.2,
    alarmCount: 0,
    activeAlarms: [],
    raw: {
      segmentType: "battery-segment",
      nested: { ok: true },
    },
  };
}

function mkSnapshot(ip: string) {
  return {
    normalized: {
      feather: [{ deviceIp: ip, ip, thermostatStage: "stage-1", hvacType: "RACK" }],
    },
  };
}

const diagnosticsSuccess = {
  success: true,
  deviceIp: "10.0.1.3",
  endpoint: "http://10.0.1.3:8080/feather/status/internal.json",
  responseDurationMs: 12,
  diagnostics: { leadUnit: "HVAC1" },
  error: null,
};

function mkHealthyBrokerSnapshot(ip: string) {
  return {
    authorities: {
      "feather-hvac-telemetry": {
        chosenProviderId: "feather",
        stale: false,
      },
    },
    health: {
      feather: {
        healthy: true,
        stale: false,
      },
    },
    unified: {
      featherTelemetry: {
        devices: [
          {
            deviceIp: ip,
            reachable: true,
            raw: {
              deviceIp: ip,
              ip,
              thermostatStage: "stage-1",
              hvacType: "RACK",
              raw: { segmentType: "battery-segment", nested: { ok: true } },
            },
          },
        ],
      },
    },
  };
}

async function run() {
  const ip = "10.0.1.3";
  const snapshot = mkSnapshot(ip);
  const lastEnrichedCache = { devices: [] };
  const direct = mkDirect(ip);

  const brokerBacked = await buildFeatherDeviceStatusRouteResponse({
    deviceIp: ip,
    sourceMethod: "manual",
    includeDiagnostics: false,
    timeoutMs: 1000,
    snapshot,
    lastEnrichedCache,
    brokerSnapshot: mkHealthyBrokerSnapshot(ip),
    queryDeviceFn: async () => direct as any,
    queryDiagnosticsFn: async () => diagnosticsSuccess as any,
  });

  assert.strictEqual(brokerBacked.usingBroker, true);
  assert.strictEqual(brokerBacked.response.success, true);
  console.log("  -> broker-backed Feather response test passed");

  const legacy = await buildFeatherDeviceStatusRouteResponse({
    deviceIp: ip,
    sourceMethod: "manual",
    includeDiagnostics: false,
    timeoutMs: 1000,
    snapshot,
    lastEnrichedCache,
    forceLegacy: true,
    brokerSnapshot: mkHealthyBrokerSnapshot(ip),
    queryDeviceFn: async () => direct as any,
    queryDiagnosticsFn: async () => diagnosticsSuccess as any,
  });

  assert.deepStrictEqual(Object.keys(brokerBacked.response), Object.keys(legacy.response));
  assert.deepStrictEqual(Object.keys(brokerBacked.response.device).sort(), Object.keys(legacy.response.device).sort());
  console.log("  -> exact contract parity test passed");

  const withDiagnostics = await buildFeatherDeviceStatusRouteResponse({
    deviceIp: ip,
    sourceMethod: "manual",
    includeDiagnostics: true,
    timeoutMs: 1000,
    snapshot,
    lastEnrichedCache,
    brokerSnapshot: mkHealthyBrokerSnapshot(ip),
    queryDeviceFn: async () => direct as any,
    queryDiagnosticsFn: async () => diagnosticsSuccess as any,
  });

  assert.ok(withDiagnostics.response.device.diagnostics, "diagnostics should exist when requested");
  assert.ok(withDiagnostics.response.device.raw.directDiagnostics, "raw direct diagnostics should exist when requested");
  console.log("  -> diagnostics present with flag test passed");

  const withoutDiagnostics = await buildFeatherDeviceStatusRouteResponse({
    deviceIp: ip,
    sourceMethod: "manual",
    includeDiagnostics: false,
    timeoutMs: 1000,
    snapshot,
    lastEnrichedCache,
    brokerSnapshot: mkHealthyBrokerSnapshot(ip),
    queryDeviceFn: async () => direct as any,
    queryDiagnosticsFn: async () => diagnosticsSuccess as any,
  });

  assert.strictEqual("diagnostics" in withoutDiagnostics.response.device, false);
  assert.strictEqual("directDiagnostics" in (withoutDiagnostics.response.device.raw || {}), false);
  console.log("  -> diagnostics absent without flag test passed");

  const staleFallback = await buildFeatherDeviceStatusRouteResponse({
    deviceIp: ip,
    sourceMethod: "manual",
    includeDiagnostics: false,
    timeoutMs: 1000,
    snapshot,
    lastEnrichedCache,
    brokerSnapshot: {
      authorities: { "feather-hvac-telemetry": { chosenProviderId: "feather", stale: true } },
      health: { feather: { healthy: true, stale: true } },
      unified: { featherTelemetry: { devices: [] } },
    },
    queryDeviceFn: async () => direct as any,
    queryDiagnosticsFn: async () => diagnosticsSuccess as any,
  });

  assert.strictEqual(staleFallback.usingBroker, false);
  assert.strictEqual(staleFallback.fallbackUsed, true);
  console.log("  -> stale broker fallback test passed");

  const failedFallback = await buildFeatherDeviceStatusRouteResponse({
    deviceIp: ip,
    sourceMethod: "manual",
    includeDiagnostics: false,
    timeoutMs: 1000,
    snapshot,
    lastEnrichedCache,
    collectBrokerSnapshotFn: async () => {
      throw new Error("broker failure");
    },
    queryDeviceFn: async () => direct as any,
    queryDiagnosticsFn: async () => diagnosticsSuccess as any,
  });

  assert.strictEqual(failedFallback.usingBroker, false);
  assert.strictEqual(failedFallback.fallbackUsed, true);
  console.log("  -> failed broker fallback test passed");

  const brokerSnapshot = mkHealthyBrokerSnapshot(ip);
  await buildFeatherDeviceStatusRouteResponse({
    deviceIp: ip,
    sourceMethod: "manual",
    includeDiagnostics: false,
    timeoutMs: 1000,
    snapshot,
    lastEnrichedCache,
    brokerSnapshot,
    queryDeviceFn: async () => direct as any,
    queryDiagnosticsFn: async () => diagnosticsSuccess as any,
  });
  assert.strictEqual(brokerSnapshot.unified.featherTelemetry.devices[0].raw.raw.nested.ok, true);
  console.log("  -> no mutation of cached Feather data test passed");

  const forceLegacy = await buildFeatherDeviceStatusRouteResponse({
    deviceIp: ip,
    sourceMethod: "manual",
    includeDiagnostics: false,
    timeoutMs: 1000,
    snapshot,
    lastEnrichedCache,
    forceLegacy: true,
    brokerSnapshot: mkHealthyBrokerSnapshot(ip),
    queryDeviceFn: async () => direct as any,
    queryDiagnosticsFn: async () => diagnosticsSuccess as any,
  });

  const disableBroker = await buildFeatherDeviceStatusRouteResponse({
    deviceIp: ip,
    sourceMethod: "manual",
    includeDiagnostics: false,
    timeoutMs: 1000,
    snapshot,
    lastEnrichedCache,
    disableBroker: true,
    brokerSnapshot: mkHealthyBrokerSnapshot(ip),
    queryDeviceFn: async () => direct as any,
    queryDiagnosticsFn: async () => diagnosticsSuccess as any,
  });

  assert.strictEqual(forceLegacy.usingBroker, false);
  assert.strictEqual(disableBroker.usingBroker, false);
  console.log("  -> legacy rollback controls test passed");

  assert.strictEqual(brokerBacked.parity.reachableEqual, true);
  assert.strictEqual(brokerBacked.parity.deviceIpEqual, true);
  assert.strictEqual(brokerBacked.parity.hvacTypeEqual, true);
  assert.strictEqual(brokerBacked.parity.segmentTypeEqual, true);
  assert.strictEqual(brokerBacked.parity.thermostatStageEqual, true);
  assert.strictEqual(brokerBacked.parity.setpointsEqual, true);
  assert.strictEqual(brokerBacked.parity.environmentalEqual, true);
  assert.strictEqual(brokerBacked.parity.alarmsEqual, true);
  assert.strictEqual(typeof brokerBacked.parity.diagnosticsPresenceEqual, "boolean");
  console.log("  -> parity verification fields test passed");

  console.log("Feather status broker migration tests passed!");
}

run().catch((err) => {
  console.error("Feather status broker migration tests failed:", err);
  process.exit(1);
});
