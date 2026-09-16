import assert from "node:assert/strict";
import { buildEmsContactorUrl, contactorReadbackMatches, contactorTargetKeysOverlap } from "./contactorControlService";
import { normalizeContactorStateFromStringviewer } from "./contactorStateEngine";

const url = new URL(buildEmsContactorUrl("http://10.0.0.3:8080/turtle/", { array: 2, string: 1 }, {
  action: "close", ignoreLowCgVoltAlarm: false, ignoreHighCgVoltAlarm: false,
  ignoreStringDcBusVoltageDeltaLimit: true, recloseCount: 6
}));
assert.equal(url.pathname, "/turtle/tools/controls/ems/array/2/string/1/contactors/close");
assert.equal(url.searchParams.get("closeExpected"), "true");
assert.equal(url.searchParams.get("recloseCount"), "6");
assert.equal(url.searchParams.get("ignoreStringDcBusVoltageDeltaLimit"), "true");
assert.equal(url.searchParams.has("ignoreLowCgVoltAlarm"), false);
assert.equal(url.searchParams.has("ignoreHighCgVoltAlarm"), false);

const arrayUrl = new URL(buildEmsContactorUrl("http://10.0.0.3:8080/turtle", { array: 2, allStrings: true }, {
  action: "open", ignoreLowCgVoltAlarm: false, ignoreHighCgVoltAlarm: false
}));
assert.equal(arrayUrl.pathname, "/turtle/tools/controls/ems/array/2/contactors/open");
assert.equal(arrayUrl.searchParams.get("closeExpected"), "false");
assert.equal(arrayUrl.searchParams.get("recloseCount"), "6");
assert.equal(arrayUrl.searchParams.get("ignoreStringDcBusVoltageDeltaLimit"), "false");

assert.equal(contactorReadbackMatches({ positiveContactorClosed: true, negativeContactorClosed: true }, "close"), true);
assert.equal(contactorReadbackMatches({ positiveContactorClosed: false, negativeContactorClosed: false }, "open"), true);
assert.equal(contactorReadbackMatches({ positiveContactorClosed: false, negativeContactorClosed: true }, "open"), false);
assert.equal(contactorReadbackMatches({ bothContactorsClosed: false }, "open"), null);
assert.equal(contactorReadbackMatches({ bothContactorsClosed: true }, "close"), true);
assert.equal(contactorTargetKeysOverlap("array:2:string:1", "array:2:string:1"), true);
assert.equal(contactorTargetKeysOverlap("array:2:*", "array:2:string:1"), true);
assert.equal(contactorTargetKeysOverlap("array:2:string:1", "array:2:*") , true);
assert.equal(contactorTargetKeysOverlap("array:2:string:1", "array:2:string:2"), false);
assert.equal(contactorTargetKeysOverlap("array:2:*", "array:3:string:1"), false);
const targetedState = normalizeContactorStateFromStringviewer(2, 1, "test", {
  stringViewerDataModel: { positiveContactorClosed: false, negativeContactorClosed: false, dcBusVoltage: 1398, measuredStringVoltage: 1411 }
});
assert.equal(targetedState.dcBusVoltage, 1398);
assert.equal(targetedState.stringVoltage, 1411);
assert.equal(targetedState.stringToBusDeltaVoltage, 13);
console.log("contactorControlService URL tests passed");
