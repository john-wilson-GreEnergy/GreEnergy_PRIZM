import assert from "node:assert/strict";
import { buildBalancingCommandUrl, countActiveBalancingCells } from "./balancingControlService";

const base = "http://10.0.0.3:8080/turtle";

assert.equal(
  buildBalancingCommandUrl(base, {
    targetType: "string",
    targets: [{ array: 1, string: 2 }],
    mode: "avg",
    chargingDeadband: 7,
    dischargingDeadband: 12
  }, { array: 1, string: 2 }),
  `${base}/tools/controls/ems/array/1/string/2/balance/avg?chargingDeadband=7&dischargingDeadband=12`
);

assert.equal(
  buildBalancingCommandUrl(base, {
    targetType: "string",
    targets: [{ array: 1, string: 2 }],
    mode: "provided",
    providedMv: 3330,
    chargingDeadband: 4,
    dischargingDeadband: 9
  }, { array: 1, string: 2 }),
  `${base}/tools/controls/ems/array/1/string/2/balance/provided/3330?chargingDeadband=4&dischargingDeadband=9`
);

assert.equal(
  buildBalancingCommandUrl(base, {
    targetType: "string",
    targets: [{ array: 1, string: 2 }],
    mode: "stop"
  }, { array: 1, string: 2 }),
  `${base}/tools/controls/ems/array/1/string/2/balance/stop`
);

assert.throws(() => buildBalancingCommandUrl(base, {
  targetType: "array",
  targets: [{ array: 2, allStrings: true }],
  mode: "avg"
}, { array: 2, allStrings: true }), /charging deadband/);

assert.equal(countActiveBalancingCells({ stringViewerDataModel: {
  balancingMap: { batteryPacks: {
    1: { cellGroups: { 1: { value: "---" }, 2: { value: "3332" } } },
    2: { cellGroups: { 1: { value: "" }, 2: { value: "BAL" } } }
  } }
} }), 2);
assert.equal(countActiveBalancingCells({ stringViewerDataModel: { balancingMap: { batteryPacks: {} } } }), 0);
assert.equal(countActiveBalancingCells({ stringViewerDataModel: {} }), null);

console.log("balancing command URL tests passed");
