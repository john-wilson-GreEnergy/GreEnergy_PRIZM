import assert from "assert";
import { setMockLastCall } from "../emsTurtleClient";
import { 
  buildSetEmsApplicationEnabledStatusCommand, 
  setEmsApplicationEnabledStatus, 
  SetAppStatusInput 
} from "./dragonAppControl";
import { getAppInteraction } from "./emsAppInteractionRegistry";
import { buildSetPowerControlCommand, parsePowerControlStatus } from "./powerControl";

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

  // Test 2: The native serializer works without Turtle's Java runtime/JARs.
  console.log("Test 2: Building native protobuf payload...");
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
    const built = await buildSetEmsApplicationEnabledStatusCommand(dummyInput);
    assert.ok(built.commandId.length > 20);
    assert.ok(built.commandBytes.length > 40);
    assert.ok(built.commandBytes.includes(Buffer.from("ADB0001")));
    assert.notStrictEqual(built.commandBytes.toString(), "DUMMY_PROTOBUF_BYTES");
    console.log(`  -> Passed! (${built.commandBytes.length} byte command)`);
  } catch (err: any) {
    assert.fail("Native protobuf payload should build. Err: " + err.message);
  }

  // Test 3: The five Kobold-observed application interactions stay mapped correctly.
  console.log("Test 3: Verifying EMS application control matrix...");
  for (const appCode of ["BP00001", "SSPC001", "ADB0001", "CTC0001"]) {
    const interaction = getAppInteraction(appCode);
    assert.strictEqual(interaction.interaction, "enableDisable", `${appCode} should use enable/disable control`);
    assert.strictEqual(interaction.supportedLocally, true, `${appCode} should be locally controllable`);
  }
  const powerControl = getAppInteraction("PC00001");
  assert.strictEqual(powerControl.interaction, "powerControl");
  assert.deepStrictEqual(powerControl.fields, ["enabled", "kW", "kVAr"]);
  assert.strictEqual(powerControl.supportedLocally, true, "Power Control payload is validated against StackOS command logging");
  const power = buildSetPowerControlCommand({ stationCode: "BHE0020", blockIndex: 1, priority: 40, realPowerkW: -5, reactivePowerkVAr: -1 });
  assert.ok(power.commandBytes.includes(Buffer.from("PC00001")));
  assert.ok(power.commandBytes.includes(Buffer.from('"realPowerkW":-5')));
  assert.deepStrictEqual(parsePowerControlStatus("Real Power: -5 kW\r\nReactive Power: -1 kVAr\r\nGrid Mode: GRID_FOLLOWING"), { realPowerkW: -5, reactivePowerkVAr: -1, gridMode: "GRID_FOLLOWING" });
  console.log("  -> Passed!");

  console.log("All DragonAppControl tests completed!");
}

runTests().catch(err => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
