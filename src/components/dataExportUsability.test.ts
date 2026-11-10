import assert from "node:assert/strict";
import test from "node:test";
import {
  powerCommandSelections,
  powerComparisonSelections,
  presetWindow,
  toLocalInput,
  type ExportTarget,
} from "./dataExportUsability";

test("last Friday selects the full most recent completed Friday", () => {
  const {from, to} = presetWindow("last-friday", new Date(2026, 10, 10, 9, 30));
  assert.equal(toLocalInput(from), "2026-11-06T00:00");
  assert.equal(toLocalInput(to), "2026-11-07T00:00");
});

test("a current Friday selects the previous completed Friday", () => {
  const {from, to} = presetWindow("last-friday", new Date(2026, 10, 13, 14, 0));
  assert.equal(toLocalInput(from), "2026-11-06T00:00");
  assert.equal(toLocalInput(to), "2026-11-07T00:00");
});

test("power shortcuts select commands and optional measured power", () => {
  const targets: ExportTarget[] = [{
    source: "power",
    id: "ems-app:PC00001:1|ems-app",
    label: "Array 1 power control",
    metrics: [
      {id: "Reported setpoint kW", label: "EMS reported real-power command", unit: "kW"},
      {id: "Reported setpoint kVAR", label: "EMS reported reactive-power command", unit: "kVAR"},
    ],
  }, {
    source: "power",
    id: "1:1|electrical",
    label: "PCS 1 electrical",
    metrics: [{id: "kw", label: "PCS measured real power", unit: "kW"}],
  }];
  assert.deepEqual(powerCommandSelections(targets), [{
    source: "power",
    target: "ems-app:PC00001:1|ems-app",
    metrics: ["Reported setpoint kW", "Reported setpoint kVAR"],
  }]);
  assert.deepEqual(powerComparisonSelections(targets), [{
    source: "power",
    target: "ems-app:PC00001:1|ems-app",
    metrics: ["Reported setpoint kW", "Reported setpoint kVAR"],
  }, {
    source: "power",
    target: "1:1|electrical",
    metrics: ["kw"],
  }]);
});
