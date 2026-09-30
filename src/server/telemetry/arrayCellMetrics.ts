export interface CellMetricRange {
  average: number | null;
  minimum: number | null;
  maximum: number | null;
  delta: number | null;
  reportingStrings: number;
  expectedStrings: number;
  partial: boolean;
}

export interface ArrayCellMetrics {
  arrayNumber: number;
  temperatureC: CellMetricRange;
  voltageMv: CellMetricRange;
  averageBasis: 'mean-of-string-averages';
}

type Row = Record<string, unknown>;
const numeric = (value: unknown): number | null => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};
const identity = (...values: unknown[]) => values.map(numeric).find(n => n !== null && Number.isInteger(n) && n > 0);
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.filter(r => r && typeof r === 'object') : [];

/** Array-wide extrema, never the maximum of the individual string deltas.
 * Canonical explicit-unit fields only; no device reads or raw-payload fallback.
 * Averages are unweighted means of reporting string averages, not cell-weighted.
 */
export function buildArrayCellMetrics(strings: unknown, summaries: unknown): ArrayCellMetrics[] {
  const groups = new Map<number, Map<number, Row>>();
  const expected = new Map<number, number>();
  for (const row of rows(summaries)) {
    const id = identity(row.arrayNumber, row.arrayIndex, row.array);
    if (id === undefined) continue;
    groups.set(id, new Map());
    expected.set(id, Math.max(0, numeric(row.stringCount) ?? 0));
  }
  for (const row of rows(strings)) {
    const id = identity(row.arrayNumber, row.arrayIndex, row.array);
    const string = identity(row.stringNumber, row.stringIndex);
    if (id === undefined || string === undefined) continue;
    if (!groups.has(id)) groups.set(id, new Map());
    // The canonical snapshot owns identity and freshness; don't double-count a row.
    if (!groups.get(id)!.has(string)) groups.get(id)!.set(string, row);
  }
  return [...groups].sort(([a], [b]) => a - b).map(([arrayNumber, group]) => {
    const expectedStrings = Math.max(expected.get(arrayNumber) ?? 0, group.size);
    const eligible = [...group.values()].filter(r => r.communicating !== false && r.badReport !== true && r.stalePreserved !== true && r.stale !== true);
    const range = (minKey: string, avgKey: string, maxKey: string): CellMetricRange => {
      const values = eligible.flatMap(r => {
        const minimum = numeric(r[minKey]), average = numeric(r[avgKey]), maximum = numeric(r[maxKey]);
        if (minimum === null || average === null || maximum === null || minimum > average || average > maximum) return [];
        return [{minimum, average, maximum}];
      });
      const minimum = values.length ? Math.min(...values.map(v => v.minimum)) : null;
      const maximum = values.length ? Math.max(...values.map(v => v.maximum)) : null;
      return {
        average: values.length ? values.reduce((sum, v) => sum + v.average, 0) / values.length : null,
        minimum, maximum,
        delta: minimum !== null && maximum !== null ? maximum - minimum : null,
        reportingStrings: values.length, expectedStrings,
        partial: values.length < expectedStrings,
      };
    };
    return {arrayNumber, averageBasis: 'mean-of-string-averages',
      temperatureC: range('minCellTempC', 'avgCellTempC', 'maxCellTempC'),
      voltageMv: range('minCellVoltageMv', 'avgCellVoltageMv', 'maxCellVoltageMv')};
  });
}
