import assert from "node:assert/strict";
import { getHvacFeedbackProfile, supportsFanSpeedFeedback } from "./hvacFeedbackProfile";

assert.equal(getHvacFeedbackProfile("Bergstrom"), "bergstrom");
assert.equal(getHvacFeedbackProfile("BERGSTROM HVAC"), "bergstrom");
assert.equal(getHvacFeedbackProfile("Dometic"), "dometic");
assert.equal(getHvacFeedbackProfile(undefined), "unknown");
assert.equal(supportsFanSpeedFeedback("Bergstrom"), true);
assert.equal(supportsFanSpeedFeedback("Dometic"), false);
assert.equal(supportsFanSpeedFeedback("unknown"), false);

console.log("hvacFeedbackProfile tests passed");
