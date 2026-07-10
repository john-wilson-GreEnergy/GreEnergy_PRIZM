export interface RegistryStatistics {
  readonly totalObjects: number;
  readonly totalTypes: number;
  readonly typeCounts: Readonly<Record<string, number>>;
}
