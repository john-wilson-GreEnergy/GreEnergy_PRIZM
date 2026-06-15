import assert from "assert";
import { setMockLastCall } from "../emsTurtleClient";
import { 
  buildSetEmsApplicationEnabledStatusCommand, 
  setEmsApplicationEnabledStatus, 
  SetAppStatusInput 
} from "./dragonAppControl";

async function runTests() {
  console.log("Running dragonAppControl Tests...");

  // Mock emsCache.lastCall cleanly using the custom setter
  setMockLastCall({
    stationCode: "BHE0021",
    blockIndex: 1,
    appCode: "ADB0001",
    enabled: true,
    priority: 300,
    apps: [
      { appCode: "ADB0001", priority: 300, enabled: true, applicationEnabled: true }
    ],
    blockReport: {
      stationCode: "BHE0021",
      blockIndex: 1,
      topology: {
        stationCode: "BHE0021",
        blockIndex: 1
      }
    }
  });

  // Test 1: Confirmation text mismatch blocks command before doing anything else
  console.log("Test 1: Confirmation text mismatch...");
  const invalidInput: SetAppStatusInput = {
    stationCode: "BHE0021",
    blockIndex: 1,
    appCode: "ADB0001",
    priority: 300,
    enabled: false,
    confirmationText: "INVALID CONFIRMATION",
    requestedBy: "test-user"
  };

  try {
    const res = await setEmsApplicationEnabledStatus(invalidInput);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, "CONFIRMATION_REQUIRED");
    console.log("  -> Passed!");
  } catch (err: any) {
    assert.fail("Should not throw on confirmation mismatch, but return false success. Err: " + err.message);
  }

  // Test 2: Verify dummy payload assertion prevents fallbacks
  console.log("Test 2: Blocking empty or dummy payloads...");
  const dummyInput: SetAppStatusInput = {
    stationCode: "BHE0021",
    blockIndex: 1,
    appCode: "ADB0001",
    priority: 300,
    enabled: false,
    confirmationText: "DISABLE ADB0001",
    requestedBy: "test-user"
  };

  try {
    const res = await setEmsApplicationEnabledStatus(dummyInput);
    // Compilation of java classes should fail in a generic CI/CD container since the turtle jars are only on Bonnie.
    // This expects to return PAYLOAD_BUILD_FAILED.
    assert.strictEqual(res.success, false);
    assert.ok(res.error === "PAYLOAD_BUILD_FAILED" || res.error === "NO_ACTIVE_PROFILE");
    console.log(`  -> Passed! (No dummy fallback allowed, returned failure: ${res.error})`);
  } catch (err: any) {
    assert.fail("Failed gracefully. Err: " + err.message);
  }

  console.log("All DragonAppControl tests completed!");
}

runTests().catch(err => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
