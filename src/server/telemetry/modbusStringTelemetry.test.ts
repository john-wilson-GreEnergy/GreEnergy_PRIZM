import assert from "node:assert/strict";
import { decodeStringContactorBitfield } from "./modbusStringTelemetry";

assert.deepEqual(decodeStringContactorBitfield([0, 3]), {
  positiveContactorClosed: true,
  negativeContactorClosed: true,
  actualState: "closed",
  rawBitfield: 3,
});
assert.deepEqual(decodeStringContactorBitfield([0, 0]), {
  positiveContactorClosed: false,
  negativeContactorClosed: false,
  actualState: "open",
  rawBitfield: 0,
});
assert.equal(decodeStringContactorBitfield([0, 1]).actualState, "partial");
assert.equal(decodeStringContactorBitfield([0, 2]).actualState, "partial");

console.log("modbusStringTelemetry tests passed");
