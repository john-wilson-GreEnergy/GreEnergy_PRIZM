import React,{useState} from 'react';
import {ResponsiveContainer,LineChart,Line,XAxis,YAxis,CartesianGrid,Tooltip,Legend} from 'recharts';
import type {OperatingCharts as Data} from '../core/operatingCharts';
import {FleetStringDistribution} from './FleetStringDistribution';
const metrics={voltageMv:['Cell voltage','mV'],temperatureF:['Cell temperature','°F'],currentA:['Current','A'],powerKw:['Power','kW'],socPct:['SOC','%'],stringVoltageV:['String voltage','V'],busVoltageV:['Bus voltage','V'],energyKwh:['Stored energy','kWh']} as const;
type Metric=keyof typeof metrics;
const number=(v:unknown)=>typeof v==='number'?v.toLocaleString(undefined,{maximumFractionDigits:1}):'—';
const stamp=(v:number|null)=>v?new Date(v).toLocaleString():'Not reported';
/** Shared read-only presentation: no acquisition or browser-generated history. */
export function OperatingCharts({data,stale=false,distributionLayout='lines',chartHeight}:{data?:Data;stale?:boolean;distributionLayout?:'scatter'|'lines';chartHeight?:number}){
  const [layout,setLayout]=useState(distributionLayout);
  const [hours,setHours]=useState(1),[mode,setMode]=useState('real'),[array,setArray]=useState('');
  const [primary,setPrimary]=useState<Metric>('voltageMv'),[secondary,setSecondary]=useState<Metric|'none'>('currentA');
  if(!data)return <section className="operating-charts"><h3>Site distribution & power tracking</h3><p>Chart data has not been supplied by this collector. Older cell recordings do not contain power commands.</p></section>;
  const points=data.power.filter(p=>p.at>=data.capturedAt-hours*3600000),latest=data.power.at(-1);
  const outdated=stale||Date.now()-data.capturedAt>30000,rows=data.distribution.filter(d=>!array||String(d.array)===array);
  const second=secondary!=='none'&&secondary!==primary?secondary:null;
  const line={dot:false,isAnimationActive:false,connectNulls:false,strokeWidth:1.7};
  return <section className="operating-charts" aria-label={`${data.site} operating charts`}>
    {outdated&&<p role="alert">Collector unavailable or stale. Power samples are historical; live distribution is withheld.</p>}
    {data.recordingError&&<p role="alert">{data.recordingError}</p>}
    <article className="operating-chart-card"><header><div><h3>Command vs actual power</h3><p>{data.site} · Time trend</p></div><div className="operating-chart-controls">
      <label>Power<select value={mode} onChange={e=>setMode(e.target.value)}><option value="real">Real · kW</option><option value="reactive">Reactive · kVAR</option><option value="both">Real + reactive</option></select></label>
      <label>Window<select value={hours} onChange={e=>setHours(Number(e.target.value))}>{[1,6,24].map(h=><option key={h} value={h}>{h} hour{h>1?'s':''}</option>)}</select></label></div></header>
      <p className="operating-chart-note">Sum of canonical PCS AC reports—not the point-of-interconnection meter or EMS dispatch target. Each trace requires complete PCS coverage. Native signed readings.</p>
      {!!points.length&&!points.some(p=>mode==='real'?p.commandKw!==null||p.actualKw!==null:mode==='reactive'?p.commandKvar!==null||p.actualKvar!==null:p.commandKw!==null||p.actualKw!==null||p.commandKvar!==null||p.actualKvar!==null)&&<p role="status">No complete, fresh PCS totals in this window. Check the reporting coverage below; unavailable inverters are not counted as zero.</p>}
      {points.length?<ResponsiveContainer width="100%" height={chartHeight??280}><LineChart data={points} margin={{top:16,right:12,bottom:8,left:8}}>
        <CartesianGrid stroke="#e1e9e5" strokeDasharray="3 3"/><XAxis dataKey="at" type="number" domain={['dataMin','dataMax']} tickFormatter={v=>new Date(v).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} minTickGap={55}/>
        {mode!=='reactive'&&<YAxis yAxisId="real" width={65} tickFormatter={number} label={{value:'kW',position:'insideTopLeft',offset:-8}}/>}
        {mode!=='real'&&<YAxis yAxisId="reactive" orientation={mode==='both'?'right':'left'} width={65} tickFormatter={number} label={{value:'kVAR',position:'insideTopRight',offset:-8}}/>}
        <Tooltip labelFormatter={v=>stamp(Number(v))}/><Legend/>
        {mode!=='reactive'&&<><Line {...line} dot={points.length===1} yAxisId="real" dataKey="commandKw" name="Commanded real · kW" stroke="#2667bc" strokeDasharray="5 3"/><Line {...line} dot={points.length===1} yAxisId="real" dataKey="actualKw" name="Actual real · kW" stroke="#11805b"/></>}
        {mode!=='real'&&<><Line {...line} dot={points.length===1} yAxisId="reactive" dataKey="commandKvar" name="Commanded reactive · kVAR" stroke="#7952b3" strokeDasharray="5 3"/><Line {...line} dot={points.length===1} yAxisId="reactive" dataKey="actualKvar" name="Actual reactive · kVAR" stroke="#be602f"/></>}
      </LineChart></ResponsiveContainer>:<p>No power samples in this window yet.</p>}
      <p className="operating-chart-note">Latest sample {stamp(latest?.at??null)} · PCS reporting command / actual: real {latest?.reporting.commandKw??0} / {latest?.reporting.actualKw??0}, reactive {latest?.reporting.commandKvar??0} / {latest?.reporting.actualKvar??0}; expected {latest?.expected??0}. Oldest source {stamp(latest?.observedAt??null)}.</p>
      <p className="operating-chart-note">30-second cadence · 24-hour retention · Gaps are not filled. Available history starts {stamp(data.power[0]?.at??null)}; earlier power history is not backfilled.</p>
    </article>
    <article className="operating-chart-card"><header><div><h3>Site level distribution</h3><p>{data.site} · Current published string readings</p></div><div className="operating-chart-controls">
      {distributionLayout==='scatter'&&<label>Layout<select value={layout} onChange={e=>setLayout(e.target.value as 'scatter'|'lines')}><option value="scatter">String spread</option><option value="lines">Connected lines</option></select></label>}
      {layout==='lines'&&<>
      <label>Array<select value={array} onChange={e=>setArray(e.target.value)}><option value="">All arrays</option>{[...new Set(data.distribution.map(d=>d.array))].map(a=><option key={a} value={a}>Array {a}</option>)}</select></label>
      <label>Left axis<select value={primary} onChange={e=>setPrimary(e.target.value as Metric)}>{Object.entries(metrics).map(([id,m])=><option key={id} value={id}>{m.join(' · ')}</option>)}</select></label>
      <label>Right axis<select value={secondary} onChange={e=>setSecondary(e.target.value as Metric|'none')}><option value="none">None</option>{Object.entries(metrics).map(([id,m])=><option key={id} value={id}>{m.join(' · ')}</option>)}</select></label>
      </>}
    </div></header>
    {layout==='scatter'?<FleetStringDistribution rows={data.distribution} stale={outdated} chartHeight={chartHeight}/>:outdated?<p>Waiting for fresh site distribution.</p>:!rows.length?<p>No mapped strings reported.</p>:<>
      <ResponsiveContainer width="100%" height={chartHeight??300}><LineChart data={rows} margin={{top:16,right:12,bottom:12,left:8}}>
        <CartesianGrid stroke="#e1e9e5" strokeDasharray="3 3"/><XAxis dataKey="label" minTickGap={65}/><YAxis yAxisId="left" width={65} domain={['auto','auto']} tickFormatter={number} label={{value:metrics[primary][1],position:'insideTopLeft',offset:-8}}/>
        {second&&<YAxis yAxisId="right" orientation="right" width={65} domain={['auto','auto']} tickFormatter={number} label={{value:metrics[second][1],position:'insideTopRight',offset:-8}}/>}<Tooltip/><Legend/>
        <Line {...line} yAxisId="left" dataKey={primary} name={metrics[primary].join(' · ')} stroke="#7952b3"/>{second&&<Line {...line} yAxisId="right" dataKey={second} name={metrics[second].join(' · ')} stroke="#1689ad"/>}
      </LineChart></ResponsiveContainer>
      <p className="operating-chart-note">Cell voltage and temperature are string averages—not every cell. Open All cells in Site analytics for full-array cell snapshots. Different units use separate axes. Missing/stale values remain gaps; source times are not assumed simultaneous.</p>
      <details><summary>Plotted readings · {rows.length} strings</summary><div className="operating-chart-table"><table><thead><tr><th>Target</th><th>{metrics[primary].join(' · ')}</th>{second&&<th>{metrics[second].join(' · ')}</th>}<th>Source time</th></tr></thead><tbody>{rows.map(r=><tr key={`${r.array}:${r.string}`}><th>{r.label}</th><td>{number(r[primary])}</td>{second&&<td>{number(r[second])}</td>}<td>{stamp(r.observedAt)}</td></tr>)}</tbody></table></div></details>
    </>}
    </article>
  </section>;
}
