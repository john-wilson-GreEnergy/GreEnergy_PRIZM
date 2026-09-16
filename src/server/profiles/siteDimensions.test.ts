import assert from "node:assert/strict";
import { dimensionsFromProfile } from "./siteDimensions";

const profile = (arrays: number, segments: number, strings: number) => ({
  arrayCount: arrays,
  stringsPerArray: strings,
  capacityProfile: { stringsPerEnergySegment: strings / segments },
  topologyModel: {
    arrayStart: 1,
    arrayEnd: arrays,
    esCountPerArray: segments,
    includeCollectionSegment: true,
    blocks: [],
  },
} as any);

const legacy = dimensionsFromProfile(profile(8, 20, 40));
assert.deepEqual(legacy.arrayIndices, [1, 2, 3, 4, 5, 6, 7, 8]);
assert.equal(legacy.positionsPerArray, 21);
assert.equal(legacy.stringsPerArray, 40);

const alternate = dimensionsFromProfile(profile(4, 14, 28));
assert.deepEqual(alternate.arrayIndices, [1, 2, 3, 4]);
assert.equal(alternate.energySegmentsPerArray, 14);
assert.equal(alternate.positionsPerArray, 15);
assert.equal(alternate.stringsPerArray, 28);

console.log("siteDimensions tests passed");
