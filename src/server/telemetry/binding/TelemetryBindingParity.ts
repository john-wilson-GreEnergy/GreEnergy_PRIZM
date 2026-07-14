import { immutableBindingValue } from './TelemetryBindingSnapshot';
import type { TelemetryBindingSnapshot } from './TelemetryBindingTypes';

export type TelemetryBindingRoute = 'GET /api/local/strings' | 'GET /api/local/strings/dashboard' | 'GET /api/local/site-operations/summary' | 'GET /api/local/connection';
export interface TelemetryBindingParityResult { readonly route: TelemetryBindingRoute; readonly comparedAt: string; readonly cycleId: number | null; readonly matches: number; readonly mismatches: number; readonly exact: boolean; readonly samples: readonly string[]; }

const positive = (value: unknown): number | null => { const number = Number(value); return Number.isSafeInteger(number) && number > 0 ? number : null; };
const rows = (payload: unknown): readonly Readonly<Record<string, unknown>>[] => {
  const root = payload as Record<string, unknown> | null; if (!root) return [];
  if (Array.isArray(root.data)) return root.data as Readonly<Record<string, unknown>>[];
  if (Array.isArray(root.strings)) return root.strings as Readonly<Record<string, unknown>>[];
  const summary = root.stringSummary as Record<string, unknown> | undefined;
  return Array.isArray(summary?.tableRows) ? summary.tableRows as Readonly<Record<string, unknown>>[] : [];
};
const aliases: readonly (readonly string[])[] = [
  ['soc', 'SOC', 'socPct', 'stringSoc'], ['power', 'kw', 'powerKw', 'activePower', 'stringPower'], ['current', 'amps', 'currentA', 'Current', 'stringCurrent'], ['voltage', 'Voltage', 'measuredVoltage', 'calculatedVoltage', 'stringVoltage'],
  ['maxCellVoltage', 'maximumCellVoltage', 'maxCellVoltageMv'], ['minCellVoltage', 'minimumCellVoltage', 'minCellVoltageMv'], ['maxTemperature', 'maximumTemperature', 'maxCellTemp', 'maxCellTemperature', 'maxTempC'], ['minTemperature', 'minimumTemperature', 'minCellTemp', 'minCellTemperature', 'minTempC'],
  ['contactorState', 'contactorStatus', 'contactors', 'contactorsClosed'], ['connectionState', 'communicating'], ['operationalState', 'state'], ['rotationStatus', 'rotation', 'outRotation'], ['warnings', 'warns', 'warningCount', 'warnCount'], ['alarms', 'alarmCount'], ['ipAddress', 'stringIp', 'controllerIp'],
  ['energySegmentNumber', 'energySegmentIndex', 'localEsNumber'], ['stringKey', 'StringKey'], ['connected', 'reachable', 'isReachable'], ['status', 'statusState'], ['lastCall', 'lastCallState'], ['controllerStatistics', 'statistics'], ['stale', 'staleData'], ['source', 'sourceProviderId'], ['cycleId', 'producingCycleId'],
];
const first = (row: Readonly<Record<string, unknown>>, names: readonly string[]): unknown => { for (const name of names) if (row[name] !== undefined) return row[name]; return undefined; };
const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export class TelemetryBindingParity {
  private history: TelemetryBindingParityResult[] = [];
  compare(route: TelemetryBindingRoute, payload: unknown, snapshot: TelemetryBindingSnapshot): TelemetryBindingParityResult {
    const routeRows = rows(payload); let matches = 0; let mismatches = 0; const samples: string[] = [];
    if (route === 'GET /api/local/connection') {
      const binding = snapshot.bindingsByDomain['controller-health'][0];
      if (!binding) { mismatches = 1; samples.push('controller-health binding missing'); }
      else { const root = payload && typeof payload === 'object' ? payload as Readonly<Record<string, unknown>> : {}; for (const names of aliases) { const left = first(root, names); const right = first(binding.value, names); if (left === undefined && right === undefined) continue; if (equal(left, right)) matches++; else { mismatches++; if (samples.length < 25) samples.push(`controller:${names[0]}`); } } }
    } else {
      const expected = snapshot.bindingsByDomain['string-telemetry'];
      const routeCoordinates = routeRows.map((row) => `${positive(row.arrayIndex ?? row.ArrayIndex ?? row.arrayNumber ?? row.array)}:${positive(row.stringIndex ?? row.StringIndex ?? row.stringNumber ?? row.string)}`); const duplicateCoordinates = routeCoordinates.length - new Set(routeCoordinates).size; if (duplicateCoordinates) { mismatches += duplicateCoordinates; samples.push(`duplicate-string-keys:${duplicateCoordinates}`); }
      if (routeRows.length !== expected.length) { mismatches += Math.abs(routeRows.length - expected.length) || 1; samples.push(`row-count:${routeRows.length}:${expected.length}`); }
      routeRows.forEach((row, index) => {
        const arrayIndex = positive(row.arrayIndex ?? row.ArrayIndex ?? row.arrayNumber ?? row.array); const stringIndex = positive(row.stringIndex ?? row.StringIndex ?? row.stringNumber ?? row.string); const bindingId = arrayIndex && stringIndex ? snapshot.indexes.stringByCoordinate[`${arrayIndex}:${stringIndex}`] : undefined; const binding = bindingId ? snapshot.indexes.byBindingId[bindingId] : undefined;
        if (!binding) { mismatches++; if (samples.length < 25) samples.push(`missing:${arrayIndex}:${stringIndex}`); return; }
        if (expected[index]?.bindingId === binding.bindingId) matches++; else { mismatches++; if (samples.length < 25) samples.push(`order:${arrayIndex}:${stringIndex}`); }
        const segmentIndex = Number(String(binding.metadata.energySegmentId ?? '').split(':').at(-1)) || undefined; const boundValue = { ...binding.value, energySegmentIndex: segmentIndex, stale: binding.stale, sourceProviderId: binding.sourceProviderId, producingCycleId: binding.producingCycleId };
        for (const names of aliases) { const left = first(row, names); const right = first(boundValue, names); if (left === undefined && right === undefined) continue; if (equal(left, right)) matches++; else { mismatches++; if (samples.length < 25) samples.push(`field:${arrayIndex}:${stringIndex}:${names[0]}`); } }
      });
    }
    const result = immutableBindingValue({ route, comparedAt: new Date().toISOString(), cycleId: snapshot.cycleId, matches, mismatches, exact: mismatches === 0, samples }); this.history.push(result); if (this.history.length > 100) this.history.splice(0, this.history.length - 100); return result;
  }
  report() { const byRoute: Record<string, { comparisons: number; matches: number; mismatches: number; exact: number }> = {}; let matches = 0; let mismatches = 0; let missingBindings = 0; let extraBindings = 0; let fieldMismatchCount = 0; for (const item of this.history) { const value = byRoute[item.route] ??= { comparisons: 0, matches: 0, mismatches: 0, exact: 0 }; value.comparisons++; value.matches += item.matches; value.mismatches += item.mismatches; if (item.exact) value.exact++; matches += item.matches; mismatches += item.mismatches; for (const sample of item.samples) { if (sample.startsWith('missing:')) missingBindings++; if (sample.startsWith('row-count:')) extraBindings++; if (sample.startsWith('field:') || sample.startsWith('controller:')) fieldMismatchCount++; } } const stringRoutes = Object.entries(byRoute).filter(([route]) => route !== 'GET /api/local/connection'); const controller = byRoute['GET /api/local/connection']; return immutableBindingValue({ generatedAt: new Date().toISOString(), comparisonTimestamp: this.history.at(-1)?.comparedAt ?? null, historyCount: this.history.length, comparisons: this.history.length, matches, mismatches, missingBindings, extraBindings, fieldMismatchCount, byRoute, byDomain: { 'string-telemetry': { comparisons: stringRoutes.reduce((sum, [, value]) => sum + value.comparisons, 0), mismatches: stringRoutes.reduce((sum, [, value]) => sum + value.mismatches, 0) }, 'controller-health': { comparisons: controller?.comparisons ?? 0, mismatches: controller?.mismatches ?? 0 } }, samples: this.history.flatMap((item) => item.samples.map((sample) => ({ route: item.route, sample }))).slice(-25), history: this.history }); }
  reset() { this.history = []; return this.report(); }
}
