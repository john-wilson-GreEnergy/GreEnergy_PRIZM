import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { FanControlService } from "./fanControlService";
import { FanControlAudit } from "./fanControlAudit";

async function runTests() {
  console.log("Running Fan Control Hold unit tests...");

  // Reset/clean audit files before running tests
  const auditPath = path.join(process.cwd(), "data", "audit", "fan_control_hold_audit.jsonl");
  if (fs.existsSync(auditPath)) {
    try {
      fs.unlinkSync(auditPath);
    } catch (e) {}
  }

  // 1. Capabilities endpoint returns correct static data
  const caps = FanControlService.getCapabilities();
  assert.strictEqual(caps.turtleFanEndpointSupported, true);
  assert.strictEqual(caps.nativeDurationSupported, false);
  assert.strictEqual(caps.holdSchedulerSupported, true);
  assert.deepStrictEqual(caps.controllers, ["ems", "bms"]);
  console.log("  -> Test Case 1: Capabilities schema verification passed!");

  // 2. Input validation: Rejects incorrect controller in targets
  const resBadController = await FanControlService.startHold({
    targets: [{
      controller: "invalid" as any,
      arrayNumber: 1,
      stringNumber: 1
    }],
    fanSpeedPercent: 50,
    durationSeconds: 30,
    repeatIntervalSeconds: 10,
    sendStopAtEnd: true,
    confirmationPhrase: "HOLD FAN SPEED"
  });
  assert.strictEqual(resBadController.accepted, false);
  assert.ok(resBadController.message?.includes("Each target requires controller"));
  console.log("  -> Test Case 2: Rejected bad controller in targets passed!");

  // 3. Input validation: Rejects invalid array index in targets
  const resBadArray = await FanControlService.startHold({
    targets: [{
      controller: "ems",
      arrayNumber: 9, // Invalid array > 8
      stringNumber: 1
    }],
    fanSpeedPercent: 50,
    durationSeconds: 30,
    repeatIntervalSeconds: 10,
    sendStopAtEnd: true,
    confirmationPhrase: "HOLD FAN SPEED"
  });
  assert.strictEqual(resBadArray.accepted, false);
  assert.ok(resBadArray.message?.includes("valid arrayNumber (1 to 8)"));
  console.log("  -> Test Case 3: Rejected out of range arrayNumber passed!");

  // 4. Input validation: Rejects empty targets
  const resEmptyTargets = await FanControlService.startHold({
    targets: [],
    fanSpeedPercent: 50,
    durationSeconds: 30,
    repeatIntervalSeconds: 10,
    sendStopAtEnd: true,
    confirmationPhrase: "HOLD FAN SPEED"
  });
  assert.strictEqual(resEmptyTargets.accepted, false);
  assert.ok(resEmptyTargets.message?.includes("At least one target is required"));
  console.log("  -> Test Case 4: Rejected empty targets passed!");

  // 5. Successful start with multiple targets
  const originalFetch = globalThis.fetch;
  const originalGlobalFetch = (global as any).fetch;

  const urlsCalled: string[] = [];
  const mockFetch = async (url: any) => {
    urlsCalled.push(url.toString());
    return {
      ok: true,
      status: 200,
      text: async () => "EMS command accepted by Turtle"
    } as any;
  };
  globalThis.fetch = mockFetch;
  (global as any).fetch = mockFetch;

  const resSuccess = await FanControlService.startHold({
    targets: [
      { controller: "ems", arrayNumber: 2, stringNumber: 5 }, // maps to ES3
      { controller: "ems", arrayNumber: 2, stringNumber: 28 } // maps to ES14
    ],
    fanSpeedPercent: 82, // Clamps to 80
    durationSeconds: 60,
    repeatIntervalSeconds: 15,
    sendStopAtEnd: true,
    confirmationPhrase: "HOLD FAN SPEED",
    operator: "Test Tech Multi"
  });

  assert.strictEqual(resSuccess.accepted, true);
  assert.ok(resSuccess.holdId);
  assert.strictEqual(resSuccess.fanSpeedPercent, 80);
  assert.strictEqual(urlsCalled.length, 2);
  assert.ok(urlsCalled.some(u => u.includes("controls/ems/array/2/string/5/fanCtlAll/80")));
  assert.ok(urlsCalled.some(u => u.includes("controls/ems/array/2/string/28/fanCtlAll/80")));

  // Verify memory status and labels
  const holds = FanControlService.getActiveHolds();
  const active = holds.find(h => h.holdId === resSuccess.holdId);
  assert.ok(active);
  assert.strictEqual(active.state, "RUNNING");
  assert.strictEqual(active.targets.length, 2);

  const target1 = active.targets.find(t => t.stringNumber === 5);
  const target2 = active.targets.find(t => t.stringNumber === 28);
  assert.ok(target1);
  assert.ok(target2);
  assert.strictEqual(target1.energySegmentNumber, 3); // string 5 maps to ES3
  assert.strictEqual(target2.energySegmentNumber, 14); // string 28 maps to ES14
  assert.strictEqual(target1.label, "A2 / ES3 / S5");
  assert.strictEqual(target2.label, "A2 / ES14 / S28");
  console.log("  -> Test Case 5: Multi-target start, rounding, and energy segment mapping passed!");

  // 6. Verification logic testing
  const verifications = await FanControlService.getVerification(resSuccess.holdId, {
    warmupSeconds: 0 // Disable warmup to test error modes directly
  });
  assert.strictEqual(verifications.length, 2);
  const v1 = verifications.find(v => v.stringNumber === 5);
  assert.ok(v1);
  // In simulated environment, string 5 has no fan speed yet or it was created.
  // Since we populated CSV, it should match the mock CSV state.
  console.log("  -> Test Case 6: Verification retrieval passed! Result for String 5:", v1.result);

  // 7. Prevent overlapping target hold
  const resOverlap = await FanControlService.startHold({
    targets: [
      { controller: "ems", arrayNumber: 2, stringNumber: 5 } // overlap with active target!
    ],
    fanSpeedPercent: 50,
    durationSeconds: 45,
    repeatIntervalSeconds: 15,
    sendStopAtEnd: true,
    confirmationPhrase: "HOLD FAN SPEED"
  });
  assert.strictEqual(resOverlap.accepted, false);
  assert.ok(resOverlap.message?.includes("Overlapping target already has an active hold"));
  console.log("  -> Test Case 7: Prevent overlapping target hold passed!");

  // 8. Stop entire hold session and command 0% to all targets
  const stopUrls: string[] = [];
  globalThis.fetch = async (url: any) => {
    const urlStr = url.toString();
    if (urlStr.includes("fanCtl")) {
      stopUrls.push(urlStr);
    }
    return {
      ok: true,
      status: 200,
      text: async () => "OK"
    } as any;
  };
  (global as any).fetch = globalThis.fetch;

  const resStop = await FanControlService.stopHold({
    holdId: resSuccess.holdId,
    sendStopCommand: true,
    operator: "Test Tech Stop"
  });

  assert.strictEqual(resStop.stopped, true);
  assert.strictEqual(stopUrls.length, 2);
  assert.ok(stopUrls.some(u => u.includes("controls/ems/array/2/string/5/fanCtlAll/0")));
  assert.ok(stopUrls.some(u => u.includes("controls/ems/array/2/string/28/fanCtlAll/0")));

  const holdsAfterStop = FanControlService.getActiveHolds();
  const stoppedHold = holdsAfterStop.find(h => h.holdId === resSuccess.holdId);
  assert.ok(stoppedHold);
  assert.strictEqual(stoppedHold.state, "STOPPED");
  console.log("  -> Test Case 8: Stop entire multi-target hold session with stop-cmd dispatch passed!");

  // Restore fetch globals
  globalThis.fetch = originalFetch;
  (global as any).fetch = originalGlobalFetch;

  console.log("All fan control unit tests completed successfully!");
}

async function start() {
  try {
    await runTests();
    process.exit(0);
  } catch (err: any) {
    console.error("Fan Control suite failed:", err);
    process.exit(1);
  }
}

start();
