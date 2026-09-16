import assert from "node:assert/strict";
import { getArrayLocalEnergySegmentNumber } from "./segmentNumbering";

assert.equal(getArrayLocalEnergySegmentNumber({ enclosureIndex: 15, energySegmentsPerArray: 14 }), 14);
assert.equal(getArrayLocalEnergySegmentNumber({ enclosureIndex: 16, energySegmentsPerArray: 14 }), "CS");
assert.equal(getArrayLocalEnergySegmentNumber({ energySegmentIndex: 15, energySegmentsPerArray: 14 }), null);
assert.equal(getArrayLocalEnergySegmentNumber({ energySegmentIndex: 20, energySegmentsPerArray: 20 }), 20);
assert.equal(getArrayLocalEnergySegmentNumber({ enclosureIndex: 14, energySegmentsPerArray: 14, includeCollectionSegment: false }), 14);

console.log("segmentNumbering tests passed");
