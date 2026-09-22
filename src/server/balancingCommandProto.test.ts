import assert from "node:assert/strict";
import { buildBalancingCommand, decodeBalancingCommand } from "./balancingCommandProto";

const command = buildBalancingCommand({
  stationCode: "BHE0020", blockIndex: 1, array: 1, string: 1,
  mode: "avg", chargingDeadband: 10, dischargingDeadband: 50,
  commandId: "offline-test", requestedBy: "offline-test"
});
const decoded = decodeBalancingCommand(command.buffer) as any;
const configuration = decoded.commandPayload.setStringBalancingConfiguration.defaultBatteryPackBalancingConfiguration;
assert.equal(decoded.commandTarget.endpointType, "STRING");
assert.equal(decoded.commandSource.endpointType, "GOBLIN");
assert.equal(decoded.commandTarget.arrayIndex, 1);
assert.equal(decoded.commandTarget.stringIndex, 1);
assert.equal(configuration.balancingMode, "BALANCE_TO_AVERAGE");
assert.equal(configuration.chargeDeadband, 10);
assert.equal(configuration.dischargeDeadband, 50);
assert.equal(configuration.chargeBalancingPermitted, true);
assert.equal(configuration.dischargeBalancingPermitted, true);
// Exact nested protobuf tags: field 5 = 0x28 and field 6 = 0x30.
assert.equal(command.buffer.includes(Buffer.from([0x28, 10, 0x30, 50])), true);

assert.throws(() => buildBalancingCommand({
  stationCode: "BHE0020", blockIndex: 1, array: 1, string: 1,
  mode: "avg", chargingDeadband: 1.5, dischargingDeadband: 50
}), /integer millivolts/);

console.log("balancing protobuf offline tests passed");
