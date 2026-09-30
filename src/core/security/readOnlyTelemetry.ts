export interface EnrolledTelemetrySite {profileId: string; stationCode: string; blockIndex: number; emsBaseUrl: string}
export interface ReadOnlyString {
  array: number; string: number; state: string | null; soc: number | null;
  voltage: number | null; current: number | null; power: number | null;
  warnings: number | null; alarms: number | null; stale: boolean;
}
export interface ReadOnlyIssue {severity: string; title: string; location: string}
export interface ReadOnlyTelemetry {
  site: {name: string; station: string; block: number};
  cycle: number; capturedAt: string | null; ageMs: number | null;
  state: 'LIVE' | 'PARTIAL' | 'CACHED' | 'OFFLINE' | 'UNKNOWN'; stale: boolean;
  strings: ReadOnlyString[]; issues: ReadOnlyIssue[];
  counts: {strings: number; arrays: number; warnings: number | null; alarms: number | null};
}
