import assert from "node:assert/strict";
import { parseOperationalMap } from "./modbusOperationalTelemetry";

const rows = parseOperationalMap(`FIELDTYPE,MODBUSADDRESS,FIELDSIZE,FIELDNAME,VALUE,TYPE,MANDATORY,R/W,SF,UNIT,SERVERID
Header,70,1,"ID ""InverterThreePhase""",103,uint16,M,R,,,1
Fixed,84,1,Watts,,sint16,M,R,W_SF,W,1
Fixed,85,1,W_SF,,scalefactor,M,R,,,1`);
assert.equal(rows.length, 3);
assert.equal(rows[0].name, "ID InverterThreePhase");
assert.equal(rows[1].address, 84);
assert.equal(rows[1].scaleRef, "W_SF");
console.log("modbusOperationalTelemetry tests passed");
