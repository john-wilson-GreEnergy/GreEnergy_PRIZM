import type {CellFrame, CellMetric, CellStatistics, CellStringFrame, CellTarget, CellHistoryPoint, ArrayCellSnapshot, CellQuality} from '../../core/cellHistory';

export const CELL_FRESH_MS = 120_000;
export function cellId(row: CellStringFrame, i: number): string {
  return `A${row.array}-S${row.string}-B${Math.floor(i / row.groupsPerBpc) + 1}-C${i % row.groupsPerBpc + 1}`;
}
export function emptyStatistics(): CellStatistics {
  return {total: 0, valid: 0, missing: 0, stale: 0, ignored: 0, min: null, average: null, max: null};
}
export function freshCell(time: number | null, now: number): boolean {
  return time !== null && time <= now + 5_000 && time >= now - CELL_FRESH_MS;
}
export function projectCells(frame: CellFrame | null, metric: CellMetric, now: number, array?: number, includeOutliers = true) {
  const summary = emptyStatistics(), arrays = new Map<number, CellStatistics>();
  const highest: CellTarget[] = [], lowest: CellTarget[] = [];
  for (const row of frame?.strings ?? []) {
    if (array && row.array !== array) continue;
    const stats = arrays.get(row.array) ?? emptyStatistics(); arrays.set(row.array, stats);
    const ignored = new Set(row.ignoredTemperatures);
    for (let i = 0; i < row.observedAt.length; i++) {
      const v = row[metric][i], ts = row.observedAt[i];
      for (const s of [summary, stats]) {
        s.total++;
        if (metric === 'temperatureF' && ignored.has(i)) s.ignored++;
        else if (v === null || ts === null || ts > now + 5_000) s.missing++;
        else if (!freshCell(ts, now)) s.stale++;
        else {
          s.valid++; s.average = (s.average ?? 0) + v;
          s.min = s.min === null ? v : Math.min(s.min, v); s.max = s.max === null ? v : Math.max(s.max, v);
        }
      }
      if (includeOutliers && v !== null && freshCell(ts, now) && !(metric === 'temperatureF' && ignored.has(i))) {
        if (highest.length < 12 || v > highest[highest.length - 1].value) {
          highest.push({id: cellId(row, i), value: v, observedAt: ts!}); highest.sort((a, b) => b.value - a.value); highest.length = Math.min(12, highest.length);
        }
        if (lowest.length < 12 || v < lowest[lowest.length - 1].value) {
          lowest.push({id: cellId(row, i), value: v, observedAt: ts!}); lowest.sort((a, b) => a.value - b.value); lowest.length = Math.min(12, lowest.length);
        }
      }
    }
  }
  for (const s of [summary, ...arrays.values()]) s.average = s.valid ? s.average! / s.valid : null;
  return {summary, arrays: [...arrays].sort(([a], [b]) => a - b).map(([array, statistics]) => ({array, statistics})), highest, lowest};
}
export function historyPoint(frame: CellFrame, metric: CellMetric, ids: string[], array?: number): CellHistoryPoint {
  const projection = projectCells(frame, metric, frame.acquiredAt, array, false), stats = projection.summary;
  const values: Record<string, number | null> = {}, sourceTimes: Record<string, number | null> = {};
  for (const id of ids) {
    const match = /^A(\d+)-S(\d+)-B(\d+)-C(\d+)$/.exec(id)!;
    const [, a, s, b, c] = match.map(Number);
    const row = frame.strings.find(row => row.array === a && row.string === s);
    const i = row ? (b - 1) * row.groupsPerBpc + c - 1 : -1;
    const inRange = row && b >= 1 && b <= row.bpcCount && c >= 1 && c <= row.groupsPerBpc;
    const time = inRange ? row.observedAt[i] : null;
    values[id] = inRange && freshCell(time, frame.acquiredAt) && !(metric === 'temperatureF' && row.ignoredTemperatures.includes(i)) ? row[metric][i] : null;
    sourceTimes[id] = time;
  }
  return {at: frame.acquiredAt, min: stats.min, average: stats.average, max: stats.max, valid: stats.valid, total: stats.total, values, sourceTimes, arrays: projection.arrays};
}

export function arrayCellSnapshot(frame: CellFrame, metric: CellMetric, array: number, now: number, historical: boolean): ArrayCellSnapshot {
  const rows = frame.strings.filter(row => row.array === array).sort((a, b) => a.string - b.string);
  if (!rows.length) throw new Error('No cell channels reported for this array in this snapshot');
  return {array, metric, acquiredAt: frame.acquiredAt, historical, statistics: projectCells(frame, metric, now, array).summary,
    strings: rows.map(row => {
      const ignored = new Set(row.ignoredTemperatures);
      return {string: row.string, bpcCount: row.bpcCount, groupsPerBpc: row.groupsPerBpc,
        statistics: projectCells({...frame, strings: [row]}, metric, now).summary,
        cells: row.observedAt.map((observedAt, i) => {
          const quality: CellQuality = metric === 'temperatureF' && ignored.has(i) ? 'ignored'
            : row[metric][i] === null || observedAt === null || observedAt > now + 5000 ? 'missing'
            : freshCell(observedAt, now) ? 'fresh' : 'stale';
          return {bpc: Math.floor(i / row.groupsPerBpc) + 1, group: i % row.groupsPerBpc + 1,
            observedAt, quality, value: quality === 'fresh' ? row[metric][i] : null};
        })};
    })};
}
