// <stdin>
import assert from "node:assert/strict";

// ../../../../../../Volumes/Dock_Storage/Projects/PRIZM_Utility/GreEnergy_PRIZM/src/core/powerEvidence.ts
function displayedPowerQuality(r, stale, now2 = Date.now()) {
  if (!r || r.valueKw === null) return "unavailable";
  const times = [r.observedFrom ?? r.receivedAt, r.receivedAt].map((t) => t ? Date.parse(t) : NaN);
  return stale || times.some((t) => !Number.isFinite(t) || now2 - t > 6e4 || now2 - t < -5e3) ? "stale" : r.quality;
}

// <stdin>
import { createRequire } from "node:module";
var { buildPowerEvidence, parseSunspecRequest, projectSunspecRequest, stampSunspecResponse, parsePowerEvidence } = createRequire(import.meta.url)("/Users/johnwilson/Documents/Codex/2026-08-31/in-app-browser-context-source-ambient/power-display-deployment-20261109/release/collector/power-evidence.cjs");
var now = Date.parse("2026-11-09T22:10:00Z");
var at = new Date(now).toISOString();
var status = "Recent AC Power Command received : \r\n23289.20 kW  / 0.00 kVAr ";
assert.deepEqual(parseSunspecRequest(status), { realKw: 23289.2, reactiveKvar: 0 });
assert.deepEqual(parseSunspecRequest("Recent AC Power Command received : -123.40 kW / -2.3 kVAr"), { realKw: -123.4, reactiveKvar: -2.3 });
assert.equal(parseSunspecRequest("Recent AC Power Command received : 0 kW / 0 kVAr")?.realKw, 0);
for (const invalid of [null, "", "Real Power: 23289.20 kW", "Recent AC Power Command received : 23 MW / 0 kVAr", "Recent AC Power Command received : NaN kW / 0 kVAr", status + status]) assert.equal(parseSunspecRequest(invalid), null);
var payload = () => ({ blockReport: { stationCode: "TEST", blockIndex: 1 }, dragonAppReport: { timestamp: String(now), dragonAppData: { dragonAppSlotData: [{ appCode: "SSPC001", priority: 50, enabled: true, appStatus: status }] } } });
var raw = payload();
assert.equal(projectSunspecRequest(raw, "TEST", 1, now).quality, "stale", "Disk seed lacks receipt evidence");
stampSunspecResponse(raw, at, true);
var request = projectSunspecRequest(raw, "TEST", 1, now);
assert.equal(request.valueKw, 23289.2);
assert.equal(request.quality, "live");
assert.equal(request.observedAt, at);
assert.equal(projectSunspecRequest(raw, "OTHER", 1, now).valueKw, null);
assert.equal(projectSunspecRequest(raw, "TEST", 2, now).valueKw, null);
assert.equal(projectSunspecRequest(raw, "TEST", 1, now + 61e3).quality, "stale");
assert.equal(projectSunspecRequest(raw, "TEST", 1, now - 6e3).quality, "stale");
raw.dragonAppReport.dragonAppData.dragonAppSlotData[0].appStatus = status.replace("23289.20", "100.00");
assert.equal(projectSunspecRequest(raw, "TEST", 1, now).quality, "stale", "Mutation cannot retain live provenance");
var disabled = payload();
disabled.dragonAppReport.dragonAppData.dragonAppSlotData[0].enabled = false;
stampSunspecResponse(disabled, at, true);
assert.equal(projectSunspecRequest(disabled, "TEST", 1, now).quality, "stale");
var duplicate = payload();
duplicate.dragonAppReport.dragonAppData.dragonAppSlotData.push({ ...duplicate.dragonAppReport.dragonAppData.dragonAppSlotData[0] });
stampSunspecResponse(duplicate, at, true);
assert.equal(projectSunspecRequest(duplicate, "TEST", 1, now).valueKw, null);
var fallback = payload();
stampSunspecResponse(fallback, at, false);
assert.equal(projectSunspecRequest(fallback, "TEST", 1, now).quality, "stale");
var row = (command, measured, stamp = now) => ({ ok: true, fetchedAt: at, data: { timeStamp: String(stamp), arrayPcsData: { acCmdRealPowerKW: command, acRealPowerKW: measured } } });
var input = {
  site: "TEST / Block 1",
  pcsReports: { 1: { 1: row(100, 98) }, 2: { 1: row(200, 197, now - 2e3) } },
  expectedPcs: 2,
  siteLive: true,
  now,
  emsApps: [{ appCode: "SSPC001", sunspecRequest: request }],
  modbus: { available: true, stale: false, capturedAt: at, block: { BasicOpTargetPower: 0 } }
};
var good = buildPowerEvidence(input);
assert.equal(good.readings.sunspecRequested.valueKw, 23289.2);
assert.equal(good.readings.pcsCommanded.valueKw, 300);
assert.equal(good.readings.pcsMeasured.valueKw, 295);
assert.equal(good.readings.basicOperationTarget.valueKw, 0);
assert.equal(good.readings.basicOperationTarget.observedAt, null);
assert.equal(good.readings.pcsMeasured.observedFrom, new Date(now - 2e3).toISOString());
assert.equal(good.readings.pcsMeasured.quality, "live");
assert.deepEqual(parsePowerEvidence(good), good);
assert.equal(parsePowerEvidence(void 0), void 0);
assert.throws(() => parsePowerEvidence({ ...good, readings: {} }));
assert.equal(buildPowerEvidence({ ...input, emsApps: [] }).readings.sunspecRequested.valueKw, null, "Do not substitute BasicOp or PCS");
for (const bad of [null, void 0, "", true, NaN, Infinity]) {
  const broken = buildPowerEvidence({ ...input, pcsReports: { 1: { 1: row(100, 98) }, 2: { 1: row(bad, 197) } } });
  assert.equal(broken.readings.pcsCommanded.valueKw, null, "Missing is not zero or partial sum");
  assert.equal(broken.readings.pcsMeasured.valueKw, 295, "Separate fields have separate coverage");
}
assert.equal(buildPowerEvidence({ ...input, expectedPcs: 3 }).readings.pcsMeasured.valueKw, null);
assert.equal(buildPowerEvidence({ ...input, siteLive: false }).readings.pcsMeasured.quality, "stale");
assert.equal(buildPowerEvidence({ ...input, pcsReports: { 1: { 1: row(100, 98) }, 2: { 1: row(200, 197, now - 61e3) } } }).readings.pcsMeasured.quality, "stale");
assert.equal(buildPowerEvidence({ ...input, pcsReports: { 1: { 1: row(0, 0) }, 2: { 1: row(0, 0) } } }).readings.pcsMeasured.valueKw, 0);
assert.equal(displayedPowerQuality(good.readings.pcsMeasured, false, now + 61e3), "stale");
assert.equal(displayedPowerQuality(good.readings.pcsMeasured, true, now), "stale");
assert.equal(displayedPowerQuality(good.readings.pcsMeasured, false, now), "live");
console.log("Power source separation, SunSpec grammar/provenance/identity, zero/missing, stale/future, coverage and Fleet validation passed");
