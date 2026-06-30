export const SOURCE_PRIORITIES = {
  strings: 1,
  bpcDetails: 2,
  arrayRollups: 3,
  pcs: 4,
  feather: 5,
  sensors: 6,
  siteHealthGraphMetrics: 7
};

export function getSourcePriority(sourceName: string): number {
  if (sourceName in SOURCE_PRIORITIES) {
    return (SOURCE_PRIORITIES as any)[sourceName];
  }
  return 99;
}
