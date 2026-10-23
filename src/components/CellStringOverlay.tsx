import React, {useMemo, useRef, useState} from 'react';
import type {ArrayCellSnapshot} from '../core/cellHistory';

type Selection = [number, number];
const plot = {left: 68, right: 984, top: 22, bottom: 320, width: 1000, height: 370};
export const stringColor = (string: number) => `hsl(${(string * 137.508) % 360}, 68%, 38%)`;
export function overlayGeometry(snapshot: ArrayCellSnapshot) {
  const bpcs = Math.max(1, ...snapshot.strings.map(s => s.bpcCount));
  const groups = Math.max(1, ...snapshot.strings.map(s => s.groupsPerBpc));
  const min = snapshot.statistics.min ?? 0, max = snapshot.statistics.max ?? min + 1;
  const pad = Math.max((max - min) * .08, .5);
  const low = min - pad, high = max + pad;
  const x = (bpc: number, group: number) => plot.left + ((bpc - 1) * groups + group - .5) / (bpcs * groups) * (plot.right - plot.left);
  const y = (value: number) => plot.bottom - (value - low) / (high - low) * (plot.bottom - plot.top);
  const series = snapshot.strings.map(s => {
    let connected = false;
    const path = s.cells.map(c => {
      if (c.value === null || !Number.isFinite(c.value) || c.quality !== 'fresh') {connected = false; return '';}
      const command = connected ? 'L' : 'M'; connected = true;
      // Tiny segment makes an isolated valid sample visible without joining gaps.
      return `${command}${x(c.bpc, c.group).toFixed(2)},${y(c.value).toFixed(2)}${command === 'M' ? 'l.01,0' : ''}`;
    }).join('');
    return {string: s.string, path};
  });
  return {bpcs, groups, low, high, x, y, series};
}

export function nearestOverlayCell(snapshot: ArrayCellSnapshot, hidden: ReadonlySet<number>, x: number, y: number, geometry = overlayGeometry(snapshot)): Selection | null {
  if (x < plot.left || x > plot.right || y < plot.top || y > plot.bottom) return null;
  const offset = Math.min(geometry.bpcs * geometry.groups - 1, Math.floor((x - plot.left) / (plot.right - plot.left) * geometry.bpcs * geometry.groups));
  const bpc = Math.floor(offset / geometry.groups) + 1, group = offset % geometry.groups + 1;
  let result: Selection | null = null, distance = Infinity;
  snapshot.strings.forEach((s, r) => {
    if (hidden.has(s.string)) return;
    const c = s.cells.findIndex(cell => cell.bpc === bpc && cell.group === group);
    const cell = s.cells[c];
    if (!cell || cell.value === null || cell.quality !== 'fresh') return;
    const delta = Math.abs(geometry.y(cell.value) - y);
    if (delta < distance) {distance = delta; result = [r, c];}
  });
  return result;
}

export default function CellStringOverlay({snapshot, selected, onSelect}: {
  snapshot: ArrayCellSnapshot; selected: Selection; onSelect: (selection: Selection) => void;
}) {
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [solo, setSolo] = useState<number | null>(null);
  const beforeSolo = useRef<Set<number>>(new Set());
  const geometry = useMemo(() => overlayGeometry(snapshot), [snapshot]);
  const unit = snapshot.metric === 'temperatureF' ? '°F' : 'mV';
  const activeString = snapshot.strings[selected[0]], activeCell = activeString?.cells[selected[1]];
  function toggle(string: number) {
    setSolo(null);
    setHidden(previous => {const next = new Set(previous); next.has(string) ? next.delete(string) : next.add(string); return next;});
  }
  function isolate(string: number) {
    if (solo === string) {setHidden(new Set(beforeSolo.current)); setSolo(null); return;}
    if (solo === null) beforeSolo.current = new Set(hidden);
    setSolo(string); setHidden(new Set(snapshot.strings.filter(s => s.string !== string).map(s => s.string)));
  }
  function inspect(event: React.MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const hit = nearestOverlayCell(snapshot, hidden, (event.clientX - rect.left) / rect.width * plot.width, (event.clientY - rect.top) / rect.height * plot.height, geometry);
    if (hit && (hit[0] !== selected[0] || hit[1] !== selected[1])) onSelect(hit);
  }
  return <div className="cell-string-overlay">
    <div className="cell-history-trend-actions"><span>{snapshot.strings.filter(s => !hidden.has(s.string)).length} / {snapshot.strings.length} strings shown · Full-array scale · {unit}</span><button onClick={() => {setHidden(new Set()); setSolo(null);}}>Show all strings</button></div>
    <div className="array-cell-canvas-wrap"><svg viewBox={`0 0 ${plot.width} ${plot.height}`} className="cell-string-plot" role="img" tabIndex={0}
      aria-label={`Array ${snapshot.array} string overlay. All ${snapshot.statistics.total} cell groups across ${snapshot.strings.length} strings. Horizontal axis BPC and cell group; vertical axis ${unit}. Arrow keys inspect cells and visible strings.`}
      onMouseMove={inspect} onClick={inspect} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const rows = snapshot.strings.map((s, i) => hidden.has(s.string) ? -1 : i).filter(i => i >= 0);
        if (!rows.length) return;
        const index = Math.max(0, rows.indexOf(selected[0]));
        const r = rows[Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0)))];
        const count = snapshot.strings[r].cells.length;
        onSelect([r, event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : Math.max(0, Math.min(count - 1, selected[1] + (event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0)))]);
      }}>
      {Array.from({length: 5}, (_, i) => {const value = geometry.low + (geometry.high - geometry.low) * i / 4, y = geometry.y(value); return <g key={i}><line x1={plot.left} x2={plot.right} y1={y} y2={y} stroke="#dde7e8"/><text x={plot.left - 9} y={y + 4} textAnchor="end">{value.toLocaleString(undefined, {maximumFractionDigits: 1})}</text></g>;})}
      {Array.from({length: geometry.bpcs}, (_, b) => <g key={b}><line x1={geometry.x(b + 1, .5)} x2={geometry.x(b + 1, .5)} y1={plot.top} y2={plot.bottom} stroke="#e6ecec"/><text x={geometry.x(b + 1, (geometry.groups + 1) / 2)} y={plot.bottom + 20} textAnchor="middle">BPC {b + 1}</text></g>)}
      <text x={15} y={14}>{unit}</text><text x={(plot.left + plot.right) / 2} y={plot.height - 5} textAnchor="middle">BPC / cell group · snapshot, not time</text>
      {geometry.series.filter(s => !hidden.has(s.string)).map(s => <path key={s.string} d={s.path} fill="none" stroke={stringColor(s.string)} strokeWidth={solo === s.string ? 1.8 : 1} strokeLinecap="round" vectorEffect="non-scaling-stroke"/>)}
      {activeCell?.value != null && activeCell.quality === 'fresh' && !hidden.has(activeString.string) && <>
        <circle cx={geometry.x(activeCell.bpc, activeCell.group)} cy={geometry.y(activeCell.value)} r={4} fill="white" stroke={stringColor(activeString.string)} strokeWidth={2}/>
        <text x={plot.right} y={12} textAnchor="end" fontWeight="bold">String {activeString.string} · BPC {activeCell.bpc} · Cell {activeCell.group} · {activeCell.value.toLocaleString(undefined, {maximumFractionDigits: 1})} {unit}</text>
      </>}
      {hidden.size === snapshot.strings.length && <text x={500} y={180} textAnchor="middle">All strings hidden · Select a legend label or Show all strings</text>}
      {snapshot.statistics.valid === 0 && <text x={500} y={160} textAnchor="middle">No fresh cell values in this snapshot</text>}
    </svg></div>
    <div className="cell-string-legend" aria-label="String visibility">{snapshot.strings.map(s => <div key={s.string}>
      <button aria-pressed={!hidden.has(s.string)} aria-label={`String ${s.string} visibility`} onClick={() => toggle(s.string)}><i style={{background: stringColor(s.string)}}/>String {s.string}</button>
      <button aria-label={`Isolate string ${s.string}`} aria-pressed={solo === s.string} onClick={() => isolate(s.string)}>{solo === s.string ? 'Restore' : 'Only'}</button>
    </div>)}</div>
    <p className="cell-history-note">Select a string label to hide/show it. Only isolates that string; Restore brings back the previous selection. Colors identify strings, not alarm severity. Every fresh cell is plotted; missing, stale and ignored readings break the line.</p>
  </div>;
}
