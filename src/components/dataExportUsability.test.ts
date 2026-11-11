import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {
  powerCommandSelections,
  powerComparisonSelections,
  powerMovementSelections,
  presetWindow,
  snapshotWindow,
  toLocalInput,
  type ExportTarget,
} from "./dataExportUsability";

test("last Friday selects the full most recent completed Friday", () => {
  const {from, to} = presetWindow("last-friday", new Date(2026, 10, 10, 9, 30));
  assert.equal(toLocalInput(from), "2026-11-06T00:00");
  assert.equal(toLocalInput(to), "2026-11-07T00:00");
});

test("point-in-time mode uses a bounded evidence window", () => {
  assert.deepEqual(snapshotWindow(1_000_000, 2_000_000), {from: 940_000, to: 1_060_000, at: 1_000_000});
  assert.deepEqual(snapshotWindow(1_990_000, 2_000_000), {from: 1_930_000, to: 2_000_000, at: 1_990_000});
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
    array: 1,
    label: "Array 1 power control",
    metrics: [
      {id: "Reported setpoint kW", label: "EMS reported real-power command", unit: "kW"},
      {id: "Reported setpoint kVAR", label: "EMS reported reactive-power command", unit: "kVAR"},
      {id: "Reported enabled", label: "EMS reported application enabled"},
    ],
  }, {
    source: "power",
    id: "1:1|electrical",
    array: 1,
    label: "PCS 1 electrical",
    metrics: [
      {id: "kw", label: "PCS measured real power", unit: "kW"},
      {id: "kvar", label: "PCS measured reactive power", unit: "kVAR"},
      {id: "dcV", label: "PCS DC voltage", unit: "V"},
      {id: "dcA", label: "PCS DC current", unit: "A"},
    ],
  }];
  assert.deepEqual(powerCommandSelections(targets), [{
    source: "power",
    target: "ems-app:PC00001:1|ems-app",
    metrics: ["Reported setpoint kW", "Reported setpoint kVAR", "Reported enabled"],
  }]);
  assert.deepEqual(powerMovementSelections(targets), [{
    source: "power",
    target: "1:1|electrical",
    metrics: ["kw", "kvar", "dcV", "dcA"],
  }]);
  assert.deepEqual(powerComparisonSelections(targets), [{
    source: "power",
    target: "ems-app:PC00001:1|ems-app",
    metrics: ["Reported setpoint kW", "Reported setpoint kVAR", "Reported enabled"],
  }, {
    source: "power",
    target: "1:1|electrical",
    metrics: ["kw", "kvar", "dcV", "dcA"],
  }]);
  assert.deepEqual(powerComparisonSelections(targets, [2]), []);
});

test("embedded explorer renders authenticated report content from an isolated local document", () => {
  const source = readFileSync(new URL("./DataExportWorkspace.tsx", import.meta.url), "utf8");
  assert.match(source, /sandbox="allow-scripts"/);
  assert.match(source, /srcDoc=\{explorerHtml\}/);
  assert.doesNotMatch(source, /allow-same-origin/);
  assert.doesNotMatch(source, /explorerUrl/);
});
