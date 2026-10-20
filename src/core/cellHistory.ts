export type CellMetric = 'millivolts' | 'temperatureF';
export interface CellSnapshotIndex {
  site:string|null; timestamps:number[]; total:number; oldestAt:number|null; newestAt:number|null;
  nextAfter:number|null; sampled:false;
}
export interface CellHistorySite { stationCode: string; blockIndex: number; emsBaseUrl: string }
export interface CellStringFrame {
  array: number; string: number; bpcCount: number; groupsPerBpc: number;
  observedAt: (number | null)[];
  millivolts: (number | null)[];
  temperatureF: (number | null)[];
  ignoredTemperatures: number[];
}
export interface CellFrame {
  schema: 1; site: CellHistorySite; acquiredAt: number; reportAt: number | null;
  strings: CellStringFrame[]; issues: string[];
}
export interface CellStatistics {
  total: number; valid: number; missing: number; stale: number; ignored: number;
  min: number | null; average: number | null; max: number | null;
}
export interface CellTarget { id: string; value: number; observedAt: number }
export interface CellOverview {
  site: string | null; acquiredAt: number | null; metric: CellMetric;
  summary: CellStatistics;
  arrays: {array: number; statistics: CellStatistics}[];
  targets: {array: number; string: number; bpcCount: number; groupsPerBpc: number}[];
  highest: CellTarget[]; lowest: CellTarget[]; issues: string[];
  storage: {enabled: boolean; intervalMs: number; retentionDays: number; maxBytes: number;
    saved: number; dropped: number; failures: number; lastError: string | null; lastSavedAt: number | null};
}
export interface CellHistoryPoint {
  at: number; min: number | null; average: number | null; max: number | null;
  valid: number; total: number; values: Record<string, number | null>;
  sourceTimes: Record<string, number | null>;
  arrays: {array: number; statistics: CellStatistics}[];
}
export interface CellHistoryResult {
  diagnostics?: {elapsedMs:number; framesRead:number; cacheHits:number};
  points: CellHistoryPoint[]; matchedFrames: number; sampledFrames: number; unreadableFrames: number;
  intervalMs: number; sampled: boolean;
}
export type CellQuality = 'fresh' | 'stale' | 'missing' | 'ignored';
export interface ArrayCellSnapshot {
  array: number; metric: CellMetric; acquiredAt: number; historical: boolean;
  statistics: CellStatistics;
  strings: {string: number; bpcCount: number; groupsPerBpc: number; statistics: CellStatistics;
    cells: {bpc: number; group: number; value: number | null; observedAt: number | null; quality: CellQuality}[]}[];
}
