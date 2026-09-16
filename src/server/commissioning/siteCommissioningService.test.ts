import { strict as assert } from "node:assert";
import { buildCommissioningCandidates } from "./siteCommissioningService";
const candidates = buildCommissioningCandidates();
assert.ok(candidates.length >= 1);
assert.equal(new Set(candidates.map(row => `${row.host}:${row.port}${row.turtlePath}`)).size, candidates.length);
assert.ok(candidates.every(row => row.turtlePath.startsWith("/")));
console.log("site commissioning candidate tests passed");
