import assert from "node:assert/strict";
import { normalizePcsRow } from "./pcsNormalizer";

const row = normalizePcsRow({
  arrayNumber: 3,
  pcsIndex: 2,
  isReady: true,
  rotationStatus: "OUT_OF_ROTATION",
  dcVoltageVolt: "1377.5",
  dcCurrentAmp: "-3",
  acRealPowerKW: "125.25",
  acReactivePowerKVAR: "-4.5",
  acFrequencyHz: "60.01",
  arrayPcsPhaseData: [
    { arrayPcsPhase: "PHASE_A", acVoltageVolt: 692, acCurrentAmp: 3 },
    { arrayPcsPhase: "PHASE_B", acVoltageVolt: 689, acCurrentAmp: 6 },
    { arrayPcsPhase: "PHASE_C", acVoltageVolt: 691, acCurrentAmp: 9 }
  ]
});

assert.equal(row.pcsId, "A3-PCS2");
assert.equal(row.communicating, true);
assert.equal(row.inRotation, false);
assert.equal(row.outRotation, true);
assert.equal(row.rotationStatus, "OUT_OF_ROTATION");
assert.equal(row.dcVoltage, 1377.5);
assert.equal(row.dcCurrent, -3);
assert.equal(row.acVoltageAB, 692);
assert.equal(row.acVoltageBC, 689);
assert.equal(row.acVoltageCA, 691);
assert.equal(row.acCurrent, 6);
assert.equal(row.acRealPowerKw, 125.25);
assert.equal(row.acReactivePowerKvar, -4.5);
assert.equal(row.frequencyHz, 60.01);

console.log("pcsNormalizer tests passed");
