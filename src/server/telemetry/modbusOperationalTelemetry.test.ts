import assert from "node:assert/strict";
import { groupOperationalModelReads, isPcsSwitchReadingStale, parseOperationalMap } from "./modbusOperationalTelemetry";

const rows = parseOperationalMap(`FIELDTYPE,MODBUSADDRESS,FIELDSIZE,FIELDNAME,VALUE,TYPE,MANDATORY,R/W,SF,UNIT,SERVERID
Header,70,1,"ID ""InverterThreePhase""",103,uint16,M,R,,,1
Fixed,84,1,Watts,,sint16,M,R,W_SF,W,1
Fixed,85,1,W_SF,,scalefactor,M,R,,,1`);
assert.equal(rows.length, 3);
assert.equal(rows[0].name, "ID InverterThreePhase");
assert.equal(rows[1].address, 84);
assert.equal(rows[1].scaleRef, "W_SF");

const grouped = groupOperationalModelReads([
  { address: 0, quantity: 100 },
  { address: 70, quantity: 50 },
  { address: 122, quantity: 50 },
  { address: 174, quantity: 50 },
  { address: 11730, quantity: 12 },
  { address: 11742, quantity: 12 },
  { address: 11928, quantity: 32 }
]);
assert.deepEqual(grouped, [
  { address: 0, quantity: 120, indexes: [0, 1] },
  { address: 122, quantity: 102, indexes: [2, 3] },
  { address: 11730, quantity: 24, indexes: [4, 5] },
  { address: 11928, quantity: 32, indexes: [6] }
]);
assert.throws(() => groupOperationalModelReads([{ address: 0, quantity: 126 }]), /Invalid Modbus model read/);
const sampleTime = Date.parse("2026-09-21T14:00:00.000Z");
assert.equal(isPcsSwitchReadingStale({ stale: false, capturedAt: new Date(sampleTime - 10_000).toISOString() }, sampleTime), false);
assert.equal(isPcsSwitchReadingStale({ stale: false, capturedAt: new Date(sampleTime - 21_000).toISOString() }, sampleTime), true);
assert.equal(isPcsSwitchReadingStale({ stale: false, capturedAt: null }, sampleTime), true);
assert.equal(isPcsSwitchReadingStale({ stale: true, capturedAt: new Date(sampleTime).toISOString() }, sampleTime), true);
console.log("modbusOperationalTelemetry tests passed");
