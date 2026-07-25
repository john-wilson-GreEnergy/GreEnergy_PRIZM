import type { DataState, DiagnosticDefinition, HeatMapPoint, WorkspaceIssue, WorkspaceRole } from './types';

const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const array = (value: unknown): any[] => Array.isArray(value) ? value : [];
const number = (value: unknown): number | null => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const boolean = (value: unknown): boolean | null => value === true || value === 'true' || value === 'ONLINE' ? true : value === false || value === 'false' || value === 'OFFLINE' ? false : null;
export const display = (value: unknown, suffix = ''): string => value == null || value === '' || (typeof value === 'number' && !Number.isFinite(value)) ? 'Unavailable' : `${typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : String(value)}${suffix}`;

export function workspaceRoleFromLocation(search: string, stored: string | null): WorkspaceRole {
  const requested = new URLSearchParams(search).get('workspace'); const candidate = requested ?? stored;
  return candidate === 'operator' || candidate === 'technician' || candidate === 'engineering' ? candidate : 'legacy';
}

export function dataState(snapshot: unknown, error: unknown): DataState {
  if (error && !snapshot) return 'offline'; const root = record(snapshot); const status = record(root.liveStatus); if (!snapshot) return 'unknown';
  if (status.source === 'demo' || status.state === 'DEMO') return 'demo'; if (status.stale === true || status.state === 'CACHED') return 'stale'; if (status.state === 'OFFLINE') return 'offline'; return status.state === 'LIVE' || status.state === 'PARTIAL' ? 'live' : 'unknown';
}

export function normalizedStrings(snapshot: unknown, siteOperations?: unknown): any[] {
  const root = record(snapshot); const site = record(siteOperations); return array(root.normalized?.strings).length ? array(root.normalized?.strings) : array(site.stringSummary?.tableRows);
}

const severityRank = { critical: 0, alarm: 1, warning: 2, info: 3 } as const;
export function prioritizeOperatorIssues(snapshot: unknown, siteOperations?: unknown): WorkspaceIssue[] {
  const root = record(snapshot); const site = record(siteOperations); const issues: WorkspaceIssue[] = [];
  for (const item of [...array(site.activeIssueGroups), ...array(root.correctiveActions), ...array(root.normalized?.correctiveActions)]) {
    const severityText = String(item.severity ?? item.priority ?? item.level ?? 'info').toLowerCase(); const severity: WorkspaceIssue['severity'] = severityText.includes('critical') ? 'critical' : severityText.includes('alarm') || severityText.includes('fault') ? 'alarm' : severityText.includes('warn') ? 'warning' : 'info';
    issues.push({ id: String(item.id ?? item.code ?? `issue-${issues.length}`), severity, title: String(item.title ?? item.displayText ?? item.message ?? 'Operational issue'), location: String(item.location ?? item.enclosureLabel ?? item.canonicalKey ?? 'Site'), detail: String(item.detail ?? item.description ?? item.message ?? 'No additional detail'), source: String(item.source ?? 'PRIZM'), timestamp: item.timestamp ?? item.lastUpdated ?? null });
  }
  for (const row of normalizedStrings(snapshot, siteOperations)) { const alarms = number(row.alarmCount) ?? 0; const warnings = number(row.warningCount ?? row.warnCount) ?? 0; const communicating = boolean(row.communicating ?? row.connectionState); if (!alarms && !warnings && communicating !== false) continue; const arrayIndex = row.arrayIndex ?? row.arrayNumber ?? '?'; const stringIndex = row.stringIndex ?? row.stringNumber ?? '?'; issues.push({ id: `string-${arrayIndex}-${stringIndex}`, severity: alarms ? 'alarm' : communicating === false ? 'critical' : 'warning', title: alarms ? `${alarms} active alarm${alarms === 1 ? '' : 's'}` : communicating === false ? 'String communications lost' : `${warnings} active warning${warnings === 1 ? '' : 's'}`, location: `Array ${arrayIndex} · String ${stringIndex}`, detail: String(row.operationalState ?? row.connectionState ?? 'Attention required'), source: String(row.sourcePath ?? 'String telemetry'), timestamp: row.sourceTimestampUtc ?? row.timestampUtc ?? null }); }
  return issues.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.location.localeCompare(b.location)).filter((issue, index, values) => values.findIndex((candidate) => candidate.id === issue.id) === index);
}

export type HeatMetric = 'maxCellTemperature' | 'minCellTemperature' | 'temperatureDelta' | 'cellVoltage' | 'voltageDelta' | 'soc' | 'communications' | 'warnings' | 'alarms';
const metricValue = (row: any, metric: HeatMetric): number | null => {
  if (metric === 'maxCellTemperature') return number(row.maxCellTemperature ?? row.maxCellTempC ?? row.maxCellTemp);
  if (metric === 'minCellTemperature') return number(row.minCellTemperature ?? row.minCellTempC ?? row.minCellTemp);
  if (metric === 'temperatureDelta') return number(row.cellTemperatureDelta ?? row.deltaCellTempC ?? row.tempDelta);
  if (metric === 'cellVoltage') return number(row.avgCellVoltageMv ?? row.avgCellVoltage);
  if (metric === 'voltageDelta') return number(row.cellVoltageDeltaMv ?? row.cellVoltageDelta ?? row.voltageDelta);
  if (metric === 'soc') return number(row.socPct ?? row.soc);
  if (metric === 'communications') { const value = boolean(row.communicating ?? row.connectionState); return value == null ? null : value ? 1 : 0; }
  if (metric === 'warnings') return number(row.warningCount ?? row.warnCount); return number(row.alarmCount);
};
export function heatMapPoints(rows: readonly any[], metric: HeatMetric): HeatMapPoint[] {
  return rows.flatMap((row) => { const arrayIndex = Number(row.arrayIndex ?? row.arrayNumber); const stringIndex = Number(row.stringIndex ?? row.stringNumber); if (!Number.isSafeInteger(arrayIndex) || !Number.isSafeInteger(stringIndex)) return []; const energySegmentIndex = number(row.energySegmentNumber ?? row.energySegmentIndex ?? row.localEsNumber) ?? Math.ceil(stringIndex / 2); return [{ id: `${arrayIndex}:${stringIndex}`, arrayIndex, stringIndex, energySegmentIndex, canonicalKey: String(row.canonicalKey ?? row.identity?.canonicalKey ?? `array:${arrayIndex}:string:${stringIndex}`), value: metricValue(row, metric), threshold: String(row.threshold ?? 'Use configured engineering limits'), warningCount: number(row.warningCount ?? row.warnCount) ?? 0, alarmCount: number(row.alarmCount) ?? 0, communicating: boolean(row.communicating ?? row.connectionState), stale: Boolean(row.stale ?? row.staleData), source: String(row.sourcePath ?? row.metricSource ?? 'canonical string telemetry'), demo: false, raw: row }]; });
}

export function activeWorkflowState(snapshot: unknown, siteOperations?: unknown) { const root = record(snapshot); const site = record(siteOperations); const diagnostic = record(root.diagnosticSession ?? site.diagnosticSession); const simulation = record(root.hvacSimulation ?? site.hvacSimulation); const balancer = record(root.balancerTest ?? site.balancerTest); return { simulationActive: simulation.active === true, simulationLabel: String(simulation.target ?? simulation.controller ?? 'HVAC simulation'), testActive: diagnostic.active === true || balancer.active === true || balancer.running === true, testLabel: diagnostic.active ? 'Diagnostic session' : 'Balancer test', restoring: simulation.restoring === true, raw: { diagnostic, simulation, balancer } }; }

export function technicianShortcuts() { return [
  { id: 'fan', label: 'String Fan Test', safety: 'Communications and fan feedback required', legacyTab: 'feather-hvac' }, { id: 'hvac', label: 'HVAC Simulation', safety: 'Protected workflow and restore plan required', legacyTab: 'feather-hvac' },
  { id: 'heat', label: 'Thermal / Voltage Heat Maps', safety: 'Read-only telemetry', legacyTab: 'arrays-strings' }, { id: 'balancer', label: 'Balancer Test', safety: 'Authorized operator and idle BMS required', legacyTab: 'balancer-test' },
  { id: 'contactor', label: 'Contactor Test', safety: 'De-energized test plan required', legacyTab: 'arrays-strings' }, { id: 'io', label: 'I/O & Louver Validation', safety: 'Field observer required', legacyTab: 'site-health' },
  { id: 'modbus', label: 'Modbus Validation', safety: 'Read-only register validation', legacyTab: 'site-configuration' },
] as const; }

export function operatorRoutePolicy(): readonly string[] { return ['/api/local/workspaces/operator']; }
export function isDebugEndpoint(endpoint: string): boolean { return endpoint.includes('/debug/'); }

export function toggleNumericSelection(current: ReadonlySet<number>, value: number): Set<number> {
  const next = new Set(current); next.has(value) ? next.delete(value) : next.add(value); return next;
}

export function engineeringDiagnostics(): readonly DiagnosticDefinition[] { return [
  { id: 'topology', label: 'Topology lifecycle', endpoint: '/api/local/workspaces/engineering/topology', description: 'Compact graph, binding, and observation readiness.' },
  { id: 'performance', label: 'Runtime performance', endpoint: '/api/local/workspaces/engineering/performance', description: 'Compact coordinator, broker, provider, and stale-source evidence.' },
  { id: 'schedulers', label: 'Acquisition schedulers', endpoint: '/api/local/workspaces/engineering/schedulers', description: 'Compact StringViewer and Feather scheduler state.' },
  { id: 'modbus', label: 'Modbus mapping', endpoint: '/api/local/workspaces/engineering/modbus', description: 'Compact active profile and Modbus validation state.' },
  { id: 'parity', label: 'Canonical parity', endpoint: '/api/local/workspaces/engineering/parity', description: 'Compact graph, binding, and observation parity readiness.' },
] as const; }

export function diagnosticFetchPolicy(endpoint: string, requested: boolean): 'idle' | 'fetch' {
  return requested && endpoint.startsWith('/api/local/workspaces/engineering/') ? 'fetch' : 'idle';
}
