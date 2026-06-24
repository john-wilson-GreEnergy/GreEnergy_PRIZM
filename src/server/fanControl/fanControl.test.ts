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

  // 2. Input validation: Rejects incorrect controller
  const resBadController = await FanControlService.startHold({
    controller: "invalid" as any,
    arrayNumber: 1,
    stringNumber: 1,
    fanSpeedPercent: 50,
    durationSeconds: 30,
    repeatIntervalSeconds: 10,
    sendStopAtEnd: true,
    confirmationPhrase: "HOLD FAN SPEED"
  });
  assert.strictEqual(resBadController.accepted, false);
  assert.ok(resBadController.message?.includes("controller required"));
  console.log("  -> Test Case 2: Rejected bad controller passed!");

  // 3. Input validation: Rejects invalid array/string index
  const resBadArray = await FanControlService.startHold({
    controller: "ems",
    arrayNumber: -1,
    stringNumber: 1,
    fanSpeedPercent: 50,
    durationSeconds: 30,
    repeatIntervalSeconds: 10,
    sendStopAtEnd: true,
    confirmationPhrase: "HOLD FAN SPEED"
  });
  assert.strictEqual(resBadArray.accepted, false);
  assert.ok(resBadArray.message?.includes("arrayNumber required"));
  console.log("  -> Test Case 3: Rejected negative arrayNumber passed!");

  // 4. Input validation: Rejects bad duration
  const resBadDuration = await FanControlService.startHold({
    controller: "ems",
    arrayNumber: 1,
    stringNumber: 1,
    fanSpeedPercent: 50,
    durationSeconds: 5, // Less than minimum 10s
    repeatIntervalSeconds: 3,
    sendStopAtEnd: true,
    confirmationPhrase: "HOLD FAN SPEED"
  });
  assert.strictEqual(resBadDuration.accepted, false);
  assert.ok(resBadDuration.message?.includes("durationSeconds required, minimum duration 10 seconds"));
  console.log("  -> Test Case 4: Rejected under-minimum duration passed!");

  // 5. Input validation: Rejects bad repeat interval (equal or greater than duration)
  const resBadRepeat = await FanControlService.startHold({
    controller: "ems",
    arrayNumber: 1,
    stringNumber: 1,
    fanSpeedPercent: 50,
    durationSeconds: 30,
    repeatIntervalSeconds: 35, // larger than duration
    sendStopAtEnd: true,
    confirmationPhrase: "HOLD FAN SPEED"
  });
  assert.strictEqual(resBadRepeat.accepted, false);
  assert.ok(resBadRepeat.message?.includes("repeatIntervalSeconds must be less than durationSeconds"));
  console.log("  -> Test Case 5: Rejected large repeatIntervalSeconds passed!");

  // 6. Input validation: Rejects missing confirmation phrase
  const resBadPhrase = await FanControlService.startHold({
    controller: "ems",
    arrayNumber: 1,
    stringNumber: 1,
    fanSpeedPercent: 50,
    durationSeconds: 30,
    repeatIntervalSeconds: 10,
    sendStopAtEnd: true,
    confirmationPhrase: "INVALID PHRASE"
  });
  assert.strictEqual(resBadPhrase.accepted, false);
  assert.ok(resBadPhrase.message?.includes("confirmationPhrase must equal HOLD FAN SPEED"));
  console.log("  -> Test Case 6: Rejected invalid confirmationPhrase passed!");

  // 7. Successful start flow: mocks fetch, clamping, and immediately fires first command
  const originalFetch = globalThis.fetch;
  const originalGlobalFetch = (global as any).fetch;

  let lastUrlCalled = "";
  const mockFetch = async (url: any) => {
    lastUrlCalled = url.toString();
    return {
      ok: true,
      status: 200,
      text: async () => "EMS command accepted by Turtle"
    } as any;
  };
  globalThis.fetch = mockFetch;
  (global as any).fetch = mockFetch;

  const resSuccess = await FanControlService.startHold({
    controller: "ems",
    arrayNumber: 2,
    stringNumber: 15,
    fanSpeedPercent: 43, // Clamps to 45
    durationSeconds: 60,
    repeatIntervalSeconds: 15,
    sendStopAtEnd: true,
    confirmationPhrase: "HOLD FAN SPEED",
    operator: "Test Tech"
  });

  assert.strictEqual(resSuccess.accepted, true);
  assert.ok(resSuccess.holdId);
  assert.strictEqual(resSuccess.fanSpeedPercent, 45); // Checked 43 clamped/rounded to nearest 5 is 45!
  assert.ok(lastUrlCalled.includes("controls/ems/array/2/string/15/fanCtlAll/45"));

  // Check in-memory status
  const holds = FanControlService.getActiveHolds();
  const active = holds.find(h => h.holdId === resSuccess.holdId);
  assert.ok(active);
  assert.strictEqual(active.state, "RUNNING");
  assert.strictEqual(active.commandCount, 1);
  assert.strictEqual(active.lastCommandOk, true);
  assert.strictEqual(active.lastCommandStatus, 200);
  console.log("  -> Test Case 7: Successful hold start, speed rounding, and first command dispatch passed!");

  // 8. Prevent duplicate active hold
  const resDuplicate = await FanControlService.startHold({
    controller: "ems",
    arrayNumber: 2,
    stringNumber: 15,
    fanSpeedPercent: 80,
    durationSeconds: 60,
    repeatIntervalSeconds: 15,
    sendStopAtEnd: true,
    confirmationPhrase: "HOLD FAN SPEED"
  });
  assert.strictEqual(resDuplicate.accepted, false);
  assert.ok(resDuplicate.message?.includes("Another active hold"));
  console.log("  -> Test Case 8: Rejection of overlapping duplicate active hold passed!");

  // 9. Stop hold flow and optional stop command dispatch
  let lastStopUrl = "";
  globalThis.fetch = async (url: any) => {
    lastStopUrl = url.toString();
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
  assert.ok(lastStopUrl.includes("controls/ems/array/2/string/15/fanCtlAll/0"));

  const holdsAfterStop = FanControlService.getActiveHolds();
  const stoppedHold = holdsAfterStop.find(h => h.holdId === resSuccess.holdId);
  assert.ok(stoppedHold);
  assert.strictEqual(stoppedHold.state, "STOPPED");
  console.log("  -> Test Case 9: Manual stop flow with immediate stop-cmd dispatch passed!");

  // 10. Verification that Audit file is logged with proper records
  assert.ok(fs.existsSync(auditPath));
  const fileLines = fs.readFileSync(auditPath, "utf-8").trim().split("\n");
  assert.ok(fileLines.length >= 4); // START rejection, START success, STOP success, etc.
  const auditRecords = fileLines.map(l => JSON.parse(l));

  const startRecord = auditRecords.find(r => r.action === "START" && r.accepted === true);
  assert.ok(startRecord);
  assert.strictEqual(startRecord.operator, "Test Tech");
  assert.strictEqual(startRecord.fanSpeedPercent, 45);

  const stopRecord = auditRecords.find(r => r.action === "STOP");
  assert.ok(stopRecord);
  assert.strictEqual(stopRecord.operator, "Test Tech Stop");
  console.log("  -> Test Case 10: File audit trail persistence and content verification passed!");

  // Restore fetch globals
  globalThis.fetch = originalFetch;
  (global as any).fetch = originalGlobalFetch;

  console.log("All fan control unit tests completed successfully!");
}

async function start() {
  try {
    await runTests();
  } catch (err: any) {
    console.error("Fan Control suite failed:", err);
    process.exit(1);
  }
}

start();
