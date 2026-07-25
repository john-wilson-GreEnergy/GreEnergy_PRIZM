export type WorkspaceRole = 'legacy' | 'operator' | 'technician' | 'engineering';
export type WorkspaceTheme = 'daylight' | 'dark';
export type DataState = 'live' | 'stale' | 'offline' | 'unknown' | 'demo';

export interface WorkspaceIssue {
  readonly id: string; readonly severity: 'critical' | 'alarm' | 'warning' | 'info'; readonly title: string;
  readonly location: string; readonly detail: string; readonly source: string; readonly timestamp: string | null;
}
export interface HeatMapPoint {
  readonly id: string; readonly arrayIndex: number; readonly stringIndex: number; readonly energySegmentIndex: number | null;
  readonly canonicalKey: string; readonly value: number | null; readonly threshold: string; readonly warningCount: number;
  readonly alarmCount: number; readonly communicating: boolean | null; readonly stale: boolean; readonly source: string; readonly demo: boolean;
  readonly raw: Readonly<Record<string, unknown>>;
}
export interface DiagnosticDefinition { readonly id: string; readonly label: string; readonly endpoint: string; readonly description: string }
export interface DiagnosticState { readonly status: 'idle' | 'loading' | 'ready' | 'error'; readonly data: unknown; readonly error: string | null; readonly loadedAt: string | null }
