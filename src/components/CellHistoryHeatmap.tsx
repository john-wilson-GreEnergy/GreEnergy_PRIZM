import React from 'react';
import type {CellHistoryPoint, CellOverview} from '../core/cellHistory';

const format = (v: number | null | undefined) => v == null ? '—' : v.toLocaleString(undefined, {maximumFractionDigits: 1});
const time = (at: number) => new Date(at).toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'});

// A relative display scale, deliberately separate from operational alarm thresholds.
export function cellHeatColor(value: number | null | undefined, low: number, high: number): string {
  if (value == null || !Number.isFinite(value)) return '#e2e8f0';
  const position = high > low ? Math.max(0, Math.min(1, (value - low) / (high - low))) : 0.5;
  const stops = [[59, 130, 180], [94, 201, 178], [244, 217, 107], [221, 113, 77]];
  const index = Math.min(2, Math.floor(position * 3)), fraction = position * 3 - index;
  return `rgb(${stops[index].map((v, i) => Math.round(v + (stops[index + 1][i] - v) * fraction)).join(', ')})`;
}

export function CellHistoryHeatmap({points, arrays, unit, selectedAt, onSelect}: {
  points: CellHistoryPoint[]; arrays: number[]; unit: string; selectedAt: number | null; onSelect: (at: number) => void;
}) {
  const values = points.flatMap(p => p.arrays.map(a => a.statistics.average)).filter((v): v is number => v != null);
  const low = values.length ? Math.min(...values) : 0, high = values.length ? Math.max(...values) : 0;
  const selectedIndex = Math.max(0, points.findIndex(p => p.at === selectedAt));
  return <div className="cell-heatmap">
    <div className="cell-heatmap-key"><span>Array averages · {unit}</span><div><span>{values.length ? format(low) : '—'}</span><i className="cell-heatmap-gradient"/><span>{values.length ? format(high) : '—'}</span><i className="cell-heatmap-missing"/> No fresh data</div></div>
    <div className="cell-heatmap-rows" role="group" aria-label="Array average history heatmap">
      {arrays.map(array => <div className="cell-heatmap-row" key={array}><span>Array {array}</span><div className="cell-heatmap-cells">{points.map(point => {
        const stats = point.arrays.find(a => a.array === array)?.statistics;
        const label = `Array ${array} · ${time(point.at)} · Average ${format(stats?.average)} ${unit} · Min ${format(stats?.min)} · Max ${format(stats?.max)} · ${stats?.valid ?? 0}/${stats?.total ?? 0} fresh`;
        return <button type="button" tabIndex={-1} key={point.at} aria-label={label} title={label} aria-pressed={point.at === selectedAt} style={{background: cellHeatColor(stats?.average, low, high)}} onClick={() => onSelect(point.at)}/>;
      })}</div></div>)}
      <div className="cell-heatmap-axis"><span>{time(points[0].at)}</span><span>{time(points.at(-1)!.at)}</span></div>
    </div>
    <label className="cell-heatmap-scrubber">Inspect time<input aria-label="Inspect recorded snapshot" type="range" min={0} max={Math.max(0, points.length - 1)} value={selectedAt === null ? points.length - 1 : selectedIndex} onChange={e => onSelect(points[Number(e.target.value)].at)}/><span>{selectedAt === null ? 'Latest snapshot' : time(selectedAt)}</span></label>
    <p className="cell-history-note">Select a tile or slide through time to inspect the table. Colors compare array averages, not alarm severity. Check min / max / delta for cell outliers.</p>
  </div>;
}

export function CellHistoryTable({view, point, arrays, unit, onLatest}: {
  view: CellOverview | null; point?: CellHistoryPoint; arrays: number[]; unit: string; onLatest: () => void;
}) {
  const rows = point ? point.arrays : view?.arrays ?? [];
  return <div className="cell-history-detail-table">
    <div className="cell-history-card-heading"><h3>Array detail <small>{point ? `Recorded ${time(point.at)}` : 'Latest snapshot'} · {unit}</small></h3>{point && <button onClick={onLatest}>Back to latest</button>}</div>
    <div className="cell-history-table-wrap"><table><thead><tr><th>Array</th><th>Minimum</th><th>Average</th><th>Maximum</th><th>Delta</th><th>Fresh / total</th><th>Stale / missing / ignored</th></tr></thead><tbody>
      {arrays.map(array => { const s = rows.find(a => a.array === array)?.statistics; return <tr key={array}><th scope="row">Array {array}</th><td>{format(s?.min)}</td><td><strong>{format(s?.average)}</strong></td><td>{format(s?.max)}</td><td>{s?.min != null && s.max != null ? format(s.max - s.min) : '—'}</td><td>{s ? `${s.valid.toLocaleString()} / ${s.total.toLocaleString()}` : 'No frame'}</td><td>{s ? `${s.stale} / ${s.missing} / ${s.ignored}` : '—'}</td></tr>; })}
      {!arrays.length && <tr><td colSpan={7}>No recorded arrays yet.</td></tr>}
    </tbody></table></div>
  </div>;
}
