import assert from "node:assert/strict";
import { bpcSettingsMatchRequest, buildBalancingCommandUrl, countActiveBalancingCells, extractBpcBalancingSettings } from "./balancingControlService";

const base = "http://10.0.0.3:8080/turtle";

assert.throws(() =>
  buildBalancingCommandUrl(base, {
    targetType: "string",
    targets: [{ array: 1, string: 2 }],
    mode: "avg",
    chargingDeadband: 7,
    dischargingDeadband: 12
  }, { array: 1, string: 2 }),
  /discard deadbands/
);

assert.throws(() =>
  buildBalancingCommandUrl(base, {
    targetType: "string",
    targets: [{ array: 1, string: 2 }],
    mode: "provided",
    providedMv: 3330,
    chargingDeadband: 4,
    dischargingDeadband: 9
  }, { array: 1, string: 2 }),
  /discard deadbands/
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
}, { array: 2, allStrings: true }), /discard deadbands/);

assert.equal(countActiveBalancingCells({ stringViewerDataModel: {
  balancingMap: { batteryPacks: {
    1: { cellGroups: { 1: { value: "---" }, 2: { value: "3332" } } },
    2: { cellGroups: { 1: { value: "" }, 2: { value: "BAL" } } }
  } }
} }), 2);
assert.equal(countActiveBalancingCells({ stringViewerDataModel: { balancingMap: { batteryPacks: {} } } }), 0);
assert.equal(countActiveBalancingCells({ stringViewerDataModel: {} }), null);

assert.deepEqual(extractBpcBalancingSettings({ batteryPackReportList: [
  { bpIndex: 1, batteryPackData: { batteryPackBalancingConfiguration: { balancingMode: "BALANCE_TO_AVERAGE", chargeDeadband: 5, dischargeDeadband: 10 } } },
  { bpIndex: 2, batteryPackData: { batteryPackBalancingConfiguration: { chargeDeadband: 0, dischargeDeadband: 12 } } }
] }), [
  { bpc: 1, mode: "BALANCE_TO_AVERAGE", chargeDeadband: 5, dischargeDeadband: 10, providedVoltageTarget: null },
  { bpc: 2, mode: null, chargeDeadband: 0, dischargeDeadband: 12, providedVoltageTarget: null }
]);

assert.equal(bpcSettingsMatchRequest([
  { bpc: 1, mode: "BALANCE_TO_AVERAGE", chargeDeadband: 5, dischargeDeadband: 10, providedVoltageTarget: null }
], { mode: "avg", chargingDeadband: 5, dischargingDeadband: 10 }), true);
assert.equal(bpcSettingsMatchRequest([
  { bpc: 1, mode: "BALANCE_TO_PROVIDED", chargeDeadband: 5, dischargeDeadband: 10, providedVoltageTarget: 3330 }
], { mode: "avg", chargingDeadband: 5, dischargingDeadband: 10 }), true);
assert.equal(bpcSettingsMatchRequest([
  { bpc: 1, mode: "BALANCE_TO_PROVIDED", chargeDeadband: 5, dischargeDeadband: 10, providedVoltageTarget: 3330 },
  { bpc: 2, mode: "BALANCE_TO_PROVIDED", chargeDeadband: 5, dischargeDeadband: 10, providedVoltageTarget: 3331 }
], { mode: "avg", chargingDeadband: 5, dischargingDeadband: 10 }), true);
assert.equal(bpcSettingsMatchRequest([
  { bpc: 1, mode: "BALANCE_TO_AVERAGE", chargeDeadband: 5, dischargeDeadband: 5, providedVoltageTarget: null }
], { mode: "avg", chargingDeadband: 5, dischargingDeadband: 10 }), false);
assert.equal(bpcSettingsMatchRequest([
  { bpc: 1, mode: "BALANCE_TO_PROVIDED", chargeDeadband: 5, dischargeDeadband: 10, providedVoltageTarget: 3267 }
], { mode: "provided", providedMv: 3330, chargingDeadband: 5, dischargingDeadband: 10 }), false);
assert.equal(bpcSettingsMatchRequest([
  { bpc: 1, mode: "BALANCE_TO_PROVIDED", chargeDeadband: 5, dischargeDeadband: 10, providedVoltageTarget: 3330 }
], { mode: "provided", providedMv: 3330, chargingDeadband: 5, dischargingDeadband: 10 }), true);

console.log("balancing control tests passed");
