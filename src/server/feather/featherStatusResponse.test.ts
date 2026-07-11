import * as assert from "assert";
import { buildFeatherDeviceStatusResponse } from "./featherStatusResponse";

console.log("Running Feather status response diagnostics tests...");

function testDiagnosticsPresentWithFlag() {
  const diagnostics = {
    success: true,
    deviceIp: "10.0.1.3",
    endpoint: "http://10.0.1.3:8080/feather/status/internal.json",
    responseDurationMs: 21,
    diagnostics: { segmentType: 3, leadUnit: "HVAC1" },
    error: null,
  };

  const response = buildFeatherDeviceStatusResponse({
    deviceIp: "10.0.1.3",
    direct: { ip: "10.0.1.3", raw: { healthy: true } },
    existing: { entityKey: "feather-10.0.1.3" },
    includeDiagnostics: true,
    diagnostics,
    mergedFromSnapshot: true,
  }) as any;

  assert.strictEqual(response.success, true);
  assert.ok(response.device, "device payload should exist");
  assert.deepStrictEqual(response.device.diagnostics, diagnostics, "diagnostics should be attached under device");
  assert.strictEqual("diagnostics" in response, false, "top-level diagnostics should not be present");
  assert.deepStrictEqual(response.device.raw.directDiagnostics, diagnostics.diagnostics, "raw direct diagnostics should be present when diagnostics fetch succeeds");
}

function testDiagnosticsAbsentWithoutFlag() {
  const diagnostics = {
    success: true,
    deviceIp: "10.0.1.10",
    endpoint: "http://10.0.1.10:8080/feather/status/internal.json",
    responseDurationMs: 17,
    diagnostics: { segmentType: 5, leadUnit: "HVAC2" },
    error: null,
  };

  const response = buildFeatherDeviceStatusResponse({
    deviceIp: "10.0.1.10",
    direct: { ip: "10.0.1.10", raw: { healthy: true } },
    existing: { entityKey: "feather-10.0.1.10" },
    includeDiagnostics: false,
    diagnostics,
    mergedFromSnapshot: false,
  }) as any;

  assert.strictEqual(response.success, true);
  assert.ok(response.device, "device payload should exist");
  assert.strictEqual("diagnostics" in response.device, false, "device diagnostics should be absent when includeDiagnostics is false");
  assert.strictEqual("diagnostics" in response, false, "top-level diagnostics should be absent");
  assert.strictEqual("directDiagnostics" in response.device.raw, false, "raw direct diagnostics should be absent when includeDiagnostics is false");
}

function runTests() {
  testDiagnosticsPresentWithFlag();
  testDiagnosticsAbsentWithoutFlag();
  console.log("Feather status response diagnostics tests passed!");
}

runTests();
