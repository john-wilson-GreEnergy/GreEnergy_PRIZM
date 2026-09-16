import assert from "node:assert/strict";
import { analyzeContactorStates, isContactorClosePendingVoltageMatch } from "./correctiveActionsEngine";
import type { NormalizedContactorState } from "./contactorStateEngine";

function state(overrides: Partial<NormalizedContactorState> = {}): NormalizedContactorState {
  return {
    arrayNumber: 1,
    stringNumber: 37,
    stringKey: "A1-S37",
    positiveContactorClosed: false,
    negativeContactorClosed: false,
    contactorsCloseExpected: true,
    dcBusVoltage: 1373,
    stringVoltage: 1401,
    stringToBusDeltaVoltage: 28,
    requestedState: "closed",
    actualState: "open",
    source: "stringviewer-live",
    sourceUrl: "test",
    fetchedAt: new Date().toISOString(),
    quality: "live",
    error: null,
    ...overrides
  };
}

const voltageInterlocked = state();
assert.equal(isContactorClosePendingVoltageMatch(voltageInterlocked), true);
assert.equal(analyzeContactorStates([voltageInterlocked]).length, 0);

const failedClose = state({ stringToBusDeltaVoltage: 8 });
assert.equal(isContactorClosePendingVoltageMatch(failedClose), false);
assert.ok(analyzeContactorStates([failedClose]).some((finding) =>
  finding.id === "requested-closed-actual-open-A1-S37"
));

const partial = state({
  positiveContactorClosed: true,
  negativeContactorClosed: false,
  actualState: "partial"
});
assert.ok(analyzeContactorStates([partial]).some((finding) =>
  finding.id === "contactor-mismatch-A1-S37"
));

console.log("correctiveActionsEngine voltage-interlock tests passed");
