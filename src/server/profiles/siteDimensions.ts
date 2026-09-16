import type { EmsProfile } from "./profileTypes";
import { ProfileStore } from "./profileStore";

export interface SiteDimensions {
  arrayIndices: number[];
  arrayStart: number;
  arrayEnd: number;
  arrayCount: number;
  energySegmentsPerArray: number;
  stringsPerEnergySegment: number;
  stringsPerArray: number;
  includeCollectionSegment: boolean;
  positionsPerArray: number;
}

const positiveInteger = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export function dimensionsFromProfile(profile?: EmsProfile | null): SiteDimensions {
  const topology = profile?.topologyModel;
  const blockRanges = (topology?.blocks || [])
    .map((block) => ({ start: positiveInteger(block.arrayStart, 1), end: positiveInteger(block.arrayEnd, 1) }))
    .filter((range) => range.end >= range.start);
  const arrayStart = blockRanges.length
    ? Math.min(...blockRanges.map((range) => range.start))
    : positiveInteger(topology?.arrayStart, 1);
  const configuredCount = positiveInteger(profile?.arrayCount, 8);
  const arrayEnd = blockRanges.length
    ? Math.max(...blockRanges.map((range) => range.end))
    : positiveInteger(topology?.arrayEnd, arrayStart + configuredCount - 1);
  const arrayIndices = blockRanges.length
    ? Array.from(new Set(blockRanges.flatMap((range) => Array.from({ length: range.end - range.start + 1 }, (_, index) => range.start + index)))).sort((a, b) => a - b)
    : Array.from({ length: Math.max(1, arrayEnd - arrayStart + 1) }, (_, index) => arrayStart + index);
  const stringsPerArray = positiveInteger(profile?.stringsPerArray, 40);
  const stringsPerEnergySegment = positiveInteger(profile?.capacityProfile?.stringsPerEnergySegment, 2);
  const energySegmentsPerArray = positiveInteger(topology?.esCountPerArray, Math.ceil(stringsPerArray / stringsPerEnergySegment));
  const includeCollectionSegment = topology?.includeCollectionSegment !== false;

  return {
    arrayIndices,
    arrayStart,
    arrayEnd,
    arrayCount: arrayIndices.length,
    energySegmentsPerArray,
    stringsPerEnergySegment,
    stringsPerArray,
    includeCollectionSegment,
    positionsPerArray: energySegmentsPerArray + (includeCollectionSegment ? 1 : 0),
  };
}

export function getActiveSiteDimensions(): SiteDimensions {
  return dimensionsFromProfile(ProfileStore.getActiveProfile());
}
