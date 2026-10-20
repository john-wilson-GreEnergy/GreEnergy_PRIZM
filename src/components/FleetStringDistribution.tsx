import React, {useState} from 'react';
import {ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ReferenceLine} from 'recharts';
import type {DistributionPoint} from '../core/operatingCharts';

const metrics = {
  stringVoltageV: ['String voltage', 'Vdc'],
  temperatureF: ['Average cell temperature', '°F'],
  voltageMv: ['Average cell voltage', 'mV'],
  socPct: ['SOC', '%'],
  currentA: ['Current', 'A'],
  powerKw: ['Power', 'kW'],
} as const;
export type DistributionMetric = keyof typeof metrics;
const colors = ['#13795b', '#2667bc', '#8056ac', '#b86b23', '#168397', '#a34e73', '#637d27', '#516482'];
const format = (v: number | null) => v === null ? 'Not reported' : v.toLocaleString(undefined, {maximumFractionDigits: 1});

/** Presentation coordinates only; values and freshness remain collector-owned. */
export function distributionPlot(rows: DistributionPoint[], array: string, metric: DistributionMetric) {
  const ordered = [...rows].sort((a, b) => a.array - b.array || a.string - b.string);
  const indexed = ordered.map((row, index) => ({...row, siteIndex: index + 1}));
  const selected = indexed.filter(row => !array || String(row.array) === array);
  return {selected, points: selected.filter(row => row[metric] !== null)};
}

export function FleetStringDistribution({rows, stale, chartHeight}: {rows: DistributionPoint[]; stale: boolean; chartHeight?: number}) {
  const [array, setArray] = useState('');
  const [metric, setMetric] = useState<DistributionMetric>('stringVoltageV');
  const {selected, points} = distributionPlot(rows, array, metric);
  const arrays = [...new Set(rows.map(row => row.array))].sort((a, b) => a - b);
  const visibleArrays = arrays.filter(a => !array || String(a) === array);
  const [title, unit] = metrics[metric];
  return <div className="fleet-string-distribution">
    <div className="distribution-toolbar">
      <div><strong>String distribution</strong><p className="operating-chart-note">One point per string · Ordered by array, then string</p></div>
      <div className="operating-chart-controls">
        <label>Array<select value={array} onChange={e => setArray(e.target.value)}><option value="">All arrays</option>{arrays.map(a => <option key={a} value={a}>Array {a}</option>)}</select></label>
        <label>Metric<select value={metric} onChange={e => setMetric(e.target.value as DistributionMetric)}>{Object.entries(metrics).map(([key, labels]) => <option key={key} value={key}>{labels.join(' · ')}</option>)}</select></label>
      </div>
    </div>
    {stale ? <p>Waiting for fresh site distribution.</p> : !selected.length ? <p>No mapped strings reported.</p> : <>
      <p className="operating-chart-note" role="status">{points.length} / {selected.length} strings reporting · {selected.length - points.length} not reported for this metric</p>
      {points.length ? <ResponsiveContainer width="100%" height={chartHeight??350}>
        <ScatterChart margin={{top: 20, right: 20, bottom: 26, left: 12}}>
          <CartesianGrid stroke="#e1e9e5" strokeDasharray="3 3"/>
          <XAxis type="number" dataKey="siteIndex" name="Site string index" domain={[selected[0].siteIndex - 1, selected.at(-1)!.siteIndex + 1]} allowDecimals={false} minTickGap={35} label={{value: 'Site string index · Array / string order', position: 'bottom', offset: 8}}/>
          <YAxis type="number" dataKey={metric} name={title} width={72} domain={['auto', 'auto']} tickFormatter={v => format(v)} label={{value: unit, position: 'insideTopLeft', offset: -12}}/>
          <ZAxis range={[38, 38]}/>
          {visibleArrays.slice(1).map(a => <ReferenceLine key={a} x={selected.find(row => row.array === a)!.siteIndex - 0.5} stroke="#b9cbc1" strokeDasharray="4 4"/>)}
          <Tooltip cursor={{strokeDasharray: '3 3'}} content={({active, payload}) => {
            const row = payload?.[0]?.payload as DistributionPoint | undefined;
            return active && row ? <div className="distribution-tooltip"><strong>Array {row.array} · String {row.string}</strong><p>{title}: {format(row[metric])} {unit}</p><p>Source: {row.observedAt === null ? 'Not reported' : new Date(row.observedAt).toLocaleString()}</p></div> : null;
          }}/>
          {visibleArrays.map(a => <Scatter key={a} name={`Array ${a}`} data={points.filter(row => row.array === a)} fill={colors[arrays.indexOf(a) % colors.length]} stroke="#fff" strokeWidth={0.5} isAnimationActive={false}/>)}
        </ScatterChart>
      </ResponsiveContainer> : <p>No reported values for this metric. Missing readings are not plotted as zero.</p>}
      <div className="distribution-array-legend" aria-label="Array color key">{visibleArrays.map(a => <span key={a}><i style={{background: colors[arrays.indexOf(a) % colors.length]}}/>Array {a}</span>)}</div>
      <p className="operating-chart-note">Colors identify arrays, not alarm severity. Cell metrics are string averages, not individual cells or maximum cell temperature. Missing/stale values are omitted; source times may differ. Alarm thresholds are not supplied by this chart feed.</p>
      <details><summary>String readings · {selected.length} strings</summary><div className="operating-chart-table"><table><thead><tr><th>Site index</th><th>Array / String</th><th>{title} · {unit}</th><th>Source time</th></tr></thead><tbody>{selected.map(row => <tr key={`${row.array}:${row.string}`}><td>{row.siteIndex}</td><th>Array {row.array} · String {row.string}</th><td>{format(row[metric])}</td><td>{row.observedAt === null ? 'Not reported' : new Date(row.observedAt).toLocaleString()}</td></tr>)}</tbody></table></div></details>
    </>}
  </div>;
}
