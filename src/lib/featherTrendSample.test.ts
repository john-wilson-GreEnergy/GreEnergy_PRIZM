import { strict as assert } from "node:assert";
import { appendSharedFeatherSample, createFeatherTrendSample } from "./featherTrendSample";

const device = { ip: "10.0.1.10", reachable: true, hvac1: { currentA: 2.5 }, hvac2: { currentA: 3 }, spaceTemperatureC: 30, avgCellTemperatureC: 25 };
const sample = createFeatherTrendSample(device, "2026-09-04T20:00:00.000Z");
assert.equal(sample.spaceTemp, 86);
assert.equal(sample.cellTemp, 77);
assert.equal(sample.hvac1Current, 2.5);
const once = appendSharedFeatherSample([], device, sample.timestamp);
assert.equal(appendSharedFeatherSample(once, device, sample.timestamp), once, "same shared snapshot is not recorded twice");
assert.equal(appendSharedFeatherSample(once, device, "2026-09-04T20:00:05.000Z").length, 2);
console.log("featherTrendSample tests passed");
