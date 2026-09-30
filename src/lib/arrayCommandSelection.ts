type SelectionTopology = {
  layoutFamily?: string;
  assumptions?: {arrayCount?: number; energySegmentsPerArray?: number; stringsPerEnergySegment?: number};
};

// Only the supported, configured topology can authorize widening a selection.
// Missing or different topology keeps commands at the explicitly selected strings.
export function configuredArraySelectionIsComplete(profile: SelectionTopology | null | undefined, array: number, strings: number[]): boolean {
  if (profile?.layoutFamily !== "stack750_800") return false;
  const {arrayCount, energySegmentsPerArray, stringsPerEnergySegment} = profile.assumptions ?? {};
  if (![arrayCount, energySegmentsPerArray, stringsPerEnergySegment].every(n => Number.isInteger(n) && n! > 0)) return false;
  if (!Number.isInteger(array) || array < 1 || array > arrayCount!) return false;
  const count = energySegmentsPerArray! * stringsPerEnergySegment!;
  const selected = [...new Set(strings)].sort((a, b) => a - b);
  return selected.length === count && selected.every((number, index) => number === index + 1);
}
