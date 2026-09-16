import assert from "node:assert/strict";
import { applyCanonicalStringSnapshot } from "./canonicalStringSnapshot";

const rows = Array.from({ length: 6 }, (_, index) => ({
  arrayNumber: 1,
  stringNumber: index + 1,
  communicating: true,
  outRotation: index === 3 || index === 5,
  inRotation: !(index === 3 || index === 5),
  rotationStatus: index === 3 || index === 5 ? "OUT" : "IN",
  positiveContactorClosed: index === 3 || index === 5 ? false : true,
  negativeContactorClosed: index === 3 || index === 5 ? false : true
}));

const result = applyCanonicalStringSnapshot(rows, {
  blockviewer: {
    arrays: [{ arrayIndex: 1, onlineStringCount: 4, nearlineStringCount: 0, offlineStringCount: 2, notCommunicationStringCount: 0, stringCount: 6 }]
  }
});

const offline = result.strings.filter(row => row.bucket === "offline");
assert.deepEqual(offline.map(row => row.stringNumber), [4, 6]);
assert.ok(offline.every(row => row.outRotation === true && row.inRotation === false && row.rotationStatus === "OUT"));
assert.equal(result.rollups.offline, 2);
assert.equal(result.rollups.online, 4);

const contactorResult = applyCanonicalStringSnapshot([
  {
    arrayNumber: 1,
    stringNumber: 1,
    positiveContactorClosed: true,
    negativeContactorClosed: true,
    stringContactorState: "OPEN",
    recloseCount: 6
  },
  {
    arrayNumber: 1,
    stringNumber: 2,
    positiveContactorClosed: true,
    negativeContactorClosed: true
  }
], {
  lastCall: {
    blockReport: {
      arrayReport: {
        1: {
          arrayData: { communicatingStackCount: 2, notCommunicatingStackCount: 0 },
          stringReport: {
            1: { stringData: { positiveContactorClosed: true, negativeContactorClosed: true, contactorsCloseExpected: true, recloseCount: 5, stringContactorState: "OPEN" } },
            2: { stringData: { positiveContactorClosed: false, negativeContactorClosed: false, contactorsCloseExpected: true, recloseCount: 4 } }
          }
        }
      }
    }
  }
});

const closedRow = contactorResult.strings[0];
assert.equal(closedRow.stringContactorState, "CLOSED");
assert.equal(closedRow.contactorStatus, "CLOSED");
assert.equal(closedRow.contactorMismatch, false);
assert.equal(closedRow.recloseCount, 5);
assert.equal(closedRow.actualContactorStateSource, "last-call-explicit-polarity");

const openRow = contactorResult.strings[1];
assert.equal(openRow.stringContactorState, "OPEN");
assert.equal(openRow.bothContactorsClosed, false);
assert.equal(openRow.contactorMismatch, true);
assert.equal(openRow.recloseCount, 4);

console.log("canonicalStringSnapshot rotation assignment tests passed");

// Regression: aggregate communication totals used to erase String 6-40's
// explicitly reported outRotation=false, leaving UNKNOWN after reconciliation.
for (const outRotation of [false, true]) {
  const snapshot = applyCanonicalStringSnapshot([
    { arrayNumber: 6, stringNumber: 39, communicating: true },
    { arrayNumber: 6, stringNumber: 40, communicating: true }
  ], { lastCall: { blockReport: { arrayReport: { 6: {
    arrayData: { communicatingStackCount: 1, notCommunicatingStackCount: 1 },
    stringReport: { 40: { stringData: { outRotation, stringConnectionState: "NEARLINE" } } }
  } } } } });
  const row = snapshot.strings.find(row => row.stringNumber === 40)!;
  assert.equal(row.rotationStatus, outRotation ? "OUT" : "IN");
  assert.equal(row.outRotation, outRotation);
  assert.equal(row.inRotation, !outRotation);
  assert.equal(row.rotation.displayState, row.rotationStatus);
  assert.equal(row.rotation.source, "last-call-explicit-rotation");
}
console.log("Explicit string rotation survives aggregate reconciliation");
