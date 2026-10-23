import React, {useEffect, useRef, useState} from 'react';
import type {ArrayCellSnapshot as Snapshot, CellHistoryPoint, CellMetric} from '../core/cellHistory';
import {cellHeatColor} from './CellHistoryHeatmap';
import CellStringOverlay from './CellStringOverlay';
import {usePresentation,useReviewTarget} from '../lib/workspacePreferences';

const left = 72, top = 26, rowHeight = 14, bpcGap = 3;
const format = (v: number | null | undefined) => v == null ? '—' : v.toLocaleString(undefined, {maximumFractionDigits: 1});
export function snapshotCellAt(snapshot: Snapshot, width: number, x: number, y: number): [number, number] | null {
  const row = Math.floor((y - top) / rowHeight), string = snapshot.strings[row];
  if (!string || x < left || x >= width || y < top) return null;
  const bpcWidth = (width - left) / Math.max(...snapshot.strings.map(s => s.bpcCount));
  const bpc = Math.floor((x - left) / bpcWidth), within = (x - left) % bpcWidth;
  if (bpc >= string.bpcCount || within >= bpcWidth - bpcGap) return null;
  const group = Math.floor(within / (bpcWidth - bpcGap) * string.groupsPerBpc);
  return [row, bpc * string.groupsPerBpc + group];
}

export default function ArrayCellSnapshot({array, metric, points, siteKey, revision, acquiredAt, onGraph, controlledAt, onLoaded, onLoadError}: {
  array: number; metric: CellMetric; points: CellHistoryPoint[]; siteKey: string; revision: number;
  acquiredAt?: number | null; onGraph?: (id: string) => void;
  controlledAt?:number|null; onLoaded?:(at:number)=>void; onLoadError?:()=>void;
}) {
  const [at, setAt] = useState<number | null>(null), [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<[number, number]>([0, 0]);
  const [display, setDisplay] = usePresentation<'overlay' | 'heatmap'>('cells-snapshot-display','overlay');
  const reviewTarget=useReviewTarget();
  useEffect(()=>{if(!snapshot||!reviewTarget||reviewTarget.array!==array||!reviewTarget.string)return;const row=snapshot.strings.findIndex(s=>s.string===reviewTarget.string);if(row<0)return;const col=snapshot.strings[row].cells.findIndex(c=>c.bpc===(reviewTarget.bpc||1));if(col>=0)setSelected([row,col]);},[snapshot?.array,!!snapshot,reviewTarget?.array,reviewTarget?.string,reviewTarget?.bpc]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const loadCallbacks=useRef({onLoaded,onLoadError});loadCallbacks.current={onLoaded,onLoadError};
  const requestedAt=controlledAt===undefined?at:controlledAt;
  const liveVersion=requestedAt===null?acquiredAt:null;
  useEffect(() => {setAt(null); setSelected([0, 0]);}, [array, metric, siteKey]);
  useEffect(() => {
    const controller = new AbortController(); setSnapshot(null); setError(''); setLoading(true);
    const timer = setTimeout(() => {
      const query = new URLSearchParams({array: String(array), metric}); if (requestedAt !== null) query.set('at', String(requestedAt));
      void fetch(`/api/local/site-data/cells/snapshot?${query}`, {signal: controller.signal}).then(async response => {
        const value = await response.json(); if (!response.ok) throw new Error(value.error || 'Snapshot unavailable');
        if (value.array !== array || value.metric !== metric || (requestedAt !== null && value.acquiredAt !== requestedAt)) throw new Error('Snapshot selection mismatch; refresh and retry');
        if (!controller.signal.aborted) {setSnapshot(value);loadCallbacks.current.onLoaded?.(value.acquiredAt);}
      }).catch(e => {if (!controller.signal.aborted) {setError(e.message);loadCallbacks.current.onLoadError?.();}}).finally(() => {if (!controller.signal.aborted) setLoading(false);});
    }, 200);
    return () => {clearTimeout(timer); controller.abort();};
  }, [array, metric, siteKey, revision, liveVersion, requestedAt]);
  useEffect(() => {
    const element = canvas.current;
    if (!element || !snapshot) return;
    function draw() {
      const context = element!.getContext('2d'); if (!context) return;
      const width = element!.clientWidth, height = top + snapshot!.strings.length * rowHeight;
      const ratio = window.devicePixelRatio || 1;
      element!.width = width * ratio; element!.height = height * ratio;
      context.scale(ratio, ratio); context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height);
      const bpcCount = Math.max(...snapshot!.strings.map(s => s.bpcCount)), bpcWidth = (width - left) / bpcCount;
      context.font = '10px sans-serif'; context.fillStyle = '#35525b';
      for (let b = 0; b < bpcCount; b++) context.fillText(`BPC ${b + 1}`, left + b * bpcWidth + 2, 16);
      snapshot!.strings.forEach((string, r) => {
        const y = top + r * rowHeight; context.fillStyle = '#35525b'; context.fillText(`String ${string.string}`, 0, y + 10);
        const cellWidth = (bpcWidth - bpcGap) / string.groupsPerBpc;
        string.cells.forEach((cell, i) => {
          const x = left + (cell.bpc - 1) * bpcWidth + (cell.group - 1) * cellWidth;
          context.fillStyle = cellHeatColor(cell.value, snapshot!.statistics.min ?? 0, snapshot!.statistics.max ?? 0);
          context.fillRect(x, y, Math.max(.5, cellWidth - .25), rowHeight - 2);
          if (r === selected[0] && i === selected[1]) {context.strokeStyle = '#142f38'; context.lineWidth = 1; context.strokeRect(x, y, cellWidth, rowHeight - 2);}
        });
      });
    }
    draw(); const observer = new ResizeObserver(draw); observer.observe(element);
    return () => observer.disconnect();
  }, [snapshot, selected, display]);
  const unit = metric === 'temperatureF' ? '°F' : 'mV';
  const selectedString = snapshot?.strings[selected[0]], cell = selectedString?.cells[selected[1]];
  const id = cell && selectedString ? `A${array}-S${selectedString.string}-B${cell.bpc}-C${cell.group}` : null;
  const index = points.findIndex(p => p.at === at);
  const choose = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!snapshot) return; const rect = event.currentTarget.getBoundingClientRect();
    const hit = snapshotCellAt(snapshot, rect.width, event.clientX - rect.left, event.clientY - rect.top);
    if (hit) setSelected(previous => previous[0] === hit[0] && previous[1] === hit[1] ? previous : hit);
  };
  return <div className="array-cell-snapshot">
    <div className="cell-history-trend-actions"><strong>Array {array} · Every reported cell group</strong>{controlledAt===undefined&&<button onClick={() => setAt(null)} disabled={at === null}>Latest snapshot</button>}</div>
    {controlledAt===undefined&&!!points.length && <label className="cell-heatmap-scrubber">Snapshot time<input type="range" aria-label="Full array snapshot time" min={0} max={points.length - 1} value={at === null ? points.length - 1 : Math.max(0, index)} onChange={e => {setAt(points[Number(e.target.value)].at); setSelected([0, 0]);}}/><span>{at === null ? 'Latest' : new Date(at).toLocaleString()}</span></label>}
    {loading && <div className="cell-history-empty" role="status">Loading all cells for Array {array}…</div>}
    {error && <p role="alert" className="cell-history-warning">{error} No replacement snapshot has been substituted.</p>}
    {snapshot && <>
      <div className="cell-heatmap-key"><span>{snapshot.statistics.total.toLocaleString()} channels · {snapshot.strings.length} strings · {snapshot.statistics.valid.toLocaleString()} fresh · {new Date(snapshot.acquiredAt).toLocaleString()}{snapshot.historical ? ' · Recorded' : ' · Latest'}</span><div role="group" aria-label="Snapshot display"><button aria-pressed={display === 'overlay'} onClick={() => setDisplay('overlay')}>String overlay</button><button aria-pressed={display === 'heatmap'} onClick={() => setDisplay('heatmap')}>Cell heatmap</button></div></div>
      {display === 'overlay' ? <CellStringOverlay snapshot={snapshot} selected={selected} onSelect={setSelected}/> : <>
      <div className="cell-heatmap-key"><div>{format(snapshot.statistics.min)} {unit}<i className="cell-heatmap-gradient"/>{format(snapshot.statistics.max)} {unit}<i className="cell-heatmap-missing"/> No fresh value</div></div>
      <div className="array-cell-canvas-wrap"><canvas ref={canvas} style={{height: top + snapshot.strings.length * rowHeight}} tabIndex={0} role="img" aria-label={`All ${snapshot.statistics.total} reported cell groups in Array ${array}. Rows are strings; columns are BPCs and cell groups. Use arrow keys to inspect cells.`} onMouseMove={choose} onClick={choose} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); setSelected(([r, c]) => {
          const row = Math.max(0, Math.min(snapshot.strings.length - 1, r + (event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0)));
          const count = snapshot.strings[row].cells.length;
          return [row, event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : Math.max(0, Math.min(count - 1, c + (event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0)))];
        });
      }}/></div>
      <p className="cell-history-note">Every tile is one reported cell group; no cell averaging or sampling in this snapshot. Groups run left to right within each BPC. Relative colors are not alarm thresholds; gray includes stale, missing and ignored values.</p>
      </>}
      <div className="array-cell-inspector" role="status" aria-live="polite"><span><strong>{id ?? 'Select a cell'}</strong> {cell ? ` · ${format(cell.value)} ${unit} · ${cell.quality} · Measured ${cell.observedAt ? new Date(cell.observedAt).toLocaleString() : 'unknown'}` : ''}</span>{onGraph&&<button disabled={!id} onClick={() => id && onGraph(id)}>Graph this cell</button>}</div>
      <p className="cell-history-note">Hover, click, or use arrow keys to inspect exact cell readings. {onGraph&&'Graph this cell opens its recorded time history. '}The table includes all strings, even when their lines are hidden.</p>
      <div className="cell-history-detail-table"><h3>String detail <small>Same snapshot · {unit}</small></h3><div className="cell-history-table-wrap array-cell-table"><table><thead><tr><th>String</th><th>Min</th><th>Average</th><th>Max</th><th>Fresh / total</th><th>Stale / missing / ignored</th></tr></thead><tbody>{snapshot.strings.map(s => <tr key={s.string}><th scope="row">String {s.string}</th><td>{format(s.statistics.min)}</td><td>{format(s.statistics.average)}</td><td>{format(s.statistics.max)}</td><td>{s.statistics.valid} / {s.statistics.total}</td><td>{s.statistics.stale} / {s.statistics.missing} / {s.statistics.ignored}</td></tr>)}</tbody></table></div></div>
    </>}
  </div>;
}
