import { strict as assert } from "node:assert";
import { parseTurtleJsonOrLabeledSections } from "./turtleParsers";

const joined = 'Phoenix 1 :\n[ { "ipAddress": "10.0.1.12" } ]Phoenix 2 :\n[ { "ipAddress": "10.0.2.12" } ]';
const parsed = parseTurtleJsonOrLabeledSections(joined);
assert.equal(parsed.kind, "labeled-sections");
assert.equal(parsed.sections.length, 2);
assert.equal(parsed.flattened.length, 2);
assert.deepEqual(parsed.flattened.map(row => row.ipAddress), ["10.0.1.12", "10.0.2.12"]);
console.log("Turtle labeled-section parser tests passed");
