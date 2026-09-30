import assert from "node:assert/strict";
import { assessContactorOpen } from "./contactorOpenAssessment";
import { normalizeContactorStateFromStringviewer } from "../contactorStateEngine";
const now = Date.now();
const state = {...normalizeContactorStateFromStringviewer(1, 1, "fixture", {
  positiveContactorClosed:false, negativeContactorClosed:false, contactorsCloseExpected:true,
  measuredStringVoltage:1300, dcBusVoltage:1280
}), fetchedAt:new Date(now).toISOString()};
assert.deepEqual(assessContactorOpen(state, now), {classification:"waiting-for-voltage-alignment",actionable:false});
assert.equal(assessContactorOpen({...state,stringToBusDeltaVoltage:10},now).actionable,true);
assert.equal(assessContactorOpen({...state,stringToBusDeltaVoltage:null},now).actionable,true);
assert.equal(assessContactorOpen({...state,requestedState:"open"},now).classification,"expected-open");
assert.equal(assessContactorOpen({...state,requestedState:"unknown"},now).actionable,true);
assert.equal(assessContactorOpen({...state,actualState:"partial"},now).actionable,true);
assert.equal(assessContactorOpen({...state,actualState:"closed"},now).actionable,true);
assert.equal(assessContactorOpen({...state,quality:"failed"},now).actionable,true);
assert.equal(assessContactorOpen(state,now+30_001).actionable,true);
assert.equal(assessContactorOpen(state,now-1).actionable,true);
assert.equal(assessContactorOpen(undefined,now).actionable,true);
assert.equal(assessContactorOpen(state,now,true).classification,"open-with-active-alarm");
console.log("Contactor classification: expected, voltage wait, mismatch, stale and alarm tests passed");
