import React, {useEffect, useRef, useState} from 'react';
import {ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend} from 'recharts';
import {Activity, RefreshCw, X} from 'lucide-react';
import {useSiteDataFields} from '../context/SiteDataContext';
import type {CellHistoryResult, CellMetric, CellOverview, CellStatistics} from '../core/cellHistory';
import './cellHistory.css';
import {CellHistoryHeatmap, CellHistoryTable} from './CellHistoryHeatmap';
import ArrayCellSnapshot from './ArrayCellSnapshot';
import {CellHistoryRefresh} from '../lib/cellHistoryRefresh';
import {usePresentation,useReviewTarget} from '../lib/workspacePreferences';

const endpoint = '/api/local/site-data/cells';
const colors = ['#2563eb', '#9333ea', '#ea580c', '#0891b2', '#be185d', '#4d7c0f', '#6366f1', '#a16207'];
const format = (v: number | null | undefined) => v === null || v === undefined ? '—' : v.toLocaleString(undefined, {maximumFractionDigits: 1});
async function read<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {signal}); const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to read cell history'); return data;
}
function Metrics({statistics: s, unit}: {statistics: CellStatistics; unit: string}) {
  return <div className="cell-history-metrics">
    {[['Minimum', s.min], ['Average', s.average], ['Maximum', s.max], ['Range', s.min !== null && s.max !== null ? s.max - s.min : null]].map(([label, value]) =>
      <div key={label}><span>{label}</span><strong>{format(value as number | null)} <small>{unit}</small></strong></div>)}
    <div><span>Fresh coverage</span><strong>{s.valid.toLocaleString()} <small>/ {s.total.toLocaleString()}</small></strong></div>
  </div>;
}
export default function CellHistoryWorkspace() {
  const {lastUpdated, siteIdentity} = useSiteDataFields(['lastUpdated', 'siteIdentity']);
  const siteKey = JSON.stringify([siteIdentity?.activeProfileId, siteIdentity?.stationCode, siteIdentity?.blockIndex]);
  const [metric, setMetric] = usePresentation<CellMetric>('cells-metric','millivolts');
  const [array, setArray] = usePresentation('cells-array','');
  const [arrayOptions, setArrayOptions] = useState<number[]>([]);
  const [graphMode, setGraphMode] = usePresentation<'cells' | 'heatmap' | 'trend'>('cells-mode','cells');
  const [selectedAt, setSelectedAt] = useState<number | null>(null);
  const [hours, setHours] = usePresentation('cells-hours',1);
  const [targets, setTargets] = usePresentation<string[]>('cells-overlays',[]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [view, setView] = useState<CellOverview | null>(null);
  const [history, setHistory] = useState<CellHistoryResult | null>(null);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [targetString, setTargetString] = usePresentation('cells-target-string','');
  const [bpc, setBpc] = usePresentation('cells-bpc',1), [group, setGroup] = usePresentation('cells-group',1);
  const reviewTarget=useReviewTarget();
  const lastRead = useRef({key: '', at: 0});
  const viewRequest = useRef<AbortController | null>(null);
  const historyRequest = useRef<CellHistoryRefresh<CellHistoryResult> | null>(null);
  const historyReady = !!view?.storage.enabled && !!view.acquiredAt;
  const historyVersion = String(view?.storage.lastSavedAt ?? view?.acquiredAt ?? '');
  const historyVersionRef = useRef(historyVersion); historyVersionRef.current = historyVersion;
  useEffect(() => {if (graphMode === 'cells' && !array && arrayOptions.length) setArray(String(arrayOptions[0]));}, [graphMode, array, arrayOptions]);
  useEffect(() => {if(array&&targetString&&!targetString.startsWith(array+':')){setTargetString('');setBpc(1);setGroup(1);}setView(null);}, [array]);
  useEffect(() => {setSelectedAt(null);}, [array, metric, hours, siteKey]);
  useEffect(() => {setHidden(new Set());setArrayOptions([]);setView(null);setHistory(null);lastRead.current.key='';}, [siteKey]);
  useEffect(()=>{if(reviewTarget){setArray(String(reviewTarget.array));setGraphMode('cells');setTargetString(reviewTarget.string?`${reviewTarget.array}:${reviewTarget.string}`:'');setBpc(reviewTarget.bpc||1);setGroup(1);}},[reviewTarget?.array,reviewTarget?.string,reviewTarget?.bpc]);
  useEffect(() => {
    const key = `${siteKey}:${metric}:${array}:${revision}`;
    if (key === lastRead.current.key && Date.now() - lastRead.current.at < 15_000) return;
    lastRead.current = {key, at: Date.now()};
    viewRequest.current?.abort(); const controller = new AbortController(); viewRequest.current = controller;
    setError('');
    read<CellOverview>(`${endpoint}?metric=${metric}${array ? `&array=${array}` : ''}`, controller.signal)
      .then(value => { if (!controller.signal.aborted) { setView(value); setArrayOptions([...new Set(value.targets.map(t => t.array))].sort((a, b) => a - b)); } })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
  }, [lastUpdated, siteKey, metric, array, revision]);
  useEffect(() => () => viewRequest.current?.abort(), []);
  useEffect(() => {
    setHistory(null); setHistoryError(''); setLoading(false);
    if (!historyReady) return;
    const request = new CellHistoryRefresh<CellHistoryResult>(signal => {
      const to = Date.now(), from = to - hours * 3_600_000;
      const query = new URLSearchParams({metric, from:String(from), to:String(to), ids:targets.join(',')});
      if (array) query.set('array', array);
      return read<CellHistoryResult>(`${endpoint}/history?${query}`, signal);
    }, value => {setHistory(value); setHistoryError('');}, setHistoryError, setLoading);
    historyRequest.current = request;
    request.refresh(historyVersionRef.current);
    return () => {request.dispose(); if (historyRequest.current === request) historyRequest.current = null;};
  }, [siteKey, metric, array, hours, targets, historyReady, revision]);
  useEffect(() => {historyRequest.current?.refresh(historyVersion);}, [historyVersion]);
  const unit = metric === 'temperatureF' ? '°F' : 'mV';
  const add = (id: string) => { setGraphMode('trend'); setTargets(previous => previous.includes(id) || previous.length >= 8 ? previous : [...previous, id]); };
  const string = view?.targets.find(t => `${t.array}:${t.string}` === targetString);
  const chart = history?.points.map(point => ({...point, ...point.values})) ?? [];
  const series = ['min', 'average', 'max', ...targets];
  const availableArrays = [...new Set([...arrayOptions, ...(history?.points.flatMap(p => p.arrays.map(a => a.array)) ?? [])])].sort((a, b) => a - b);
  const visibleArrays = array ? [Number(array)] : availableArrays;
  const selectedPoint = selectedAt === null ? undefined : history?.points.find(p => p.at === selectedAt);
  function toggle(id: string) { setHidden(previous => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
  return <section className="cell-history">
    <header className="cell-history-heading"><div><div className="cell-history-eyebrow">Battery analytics / Read only</div><h2><Activity size={22}/> Cell History</h2>
      <p>All reported cell groups · Existing EMS collection · No equipment commands</p></div>
      <button onClick={() => setRevision(r => r + 1)}><RefreshCw size={14}/> Refresh view</button></header>
    {error && <div role="alert" className="cell-history-warning">{error} Last displayed values may be outdated.</div>}
    {view && !view.storage.enabled && <div className="cell-history-warning">Recording is not enabled on this collector. Deployment and activation are required before history begins; no earlier history is available.</div>}
    {view?.storage.lastError && <div role="alert" className="cell-history-warning">Recorder: {view.storage.lastError}</div>}
    <div className="cell-history-toolbar">
      <label>Metric<select value={metric} onChange={e => { setMetric(e.target.value as CellMetric); setView(null); }}><option value="millivolts">Cell voltage · mV</option><option value="temperatureF">Cell temperature · °F</option></select></label>
      <label>History window<select value={hours} onChange={e => setHours(Number(e.target.value))}>{[1, 6, 24, 72, 168].map(h => <option key={h} value={h}>{h < 24 ? `${h} hour${h === 1 ? '' : 's'}` : `${h / 24} day${h === 24 ? '' : 's'}`}</option>)}</select></label>
      <div className="cell-history-meta">{view?.site ?? 'Waiting for collector'}<br/>{view?.acquiredAt ? `Snapshot ${new Date(view.acquiredAt).toLocaleString()}` : 'No recorded snapshot'}</div>
    </div>
    <nav className="cell-history-array-picker" aria-label="Array selection"><button aria-pressed={!array && graphMode !== 'cells'} onClick={() => {setArray(''); setGraphMode('heatmap');}}>All arrays</button>{availableArrays.map(a => <button key={a} aria-pressed={array === String(a)} onClick={() => setArray(String(a))}>Array {a}</button>)}</nav>
    {view && <><Metrics statistics={view.summary} unit={unit}/><p className="cell-history-note">Latest snapshot · {view.summary.stale.toLocaleString()} stale · {view.summary.missing.toLocaleString()} missing / invalid · {view.summary.ignored.toLocaleString()} ignored. Fresh readings only; gaps are never filled.</p></>}
    <div className="cell-history-card">
      <div className="cell-history-card-heading"><h3>{array ? `Array ${array}` : 'All arrays'} · {metric === 'millivolts' ? 'Cell voltage' : 'Cell temperature'}</h3><div className="cell-history-mode" role="group" aria-label="Graph display"><button aria-pressed={graphMode === 'cells'} onClick={() => setGraphMode('cells')}>All cells</button><button aria-pressed={graphMode === 'heatmap'} onClick={() => setGraphMode('heatmap')}>Array history</button><button aria-pressed={graphMode === 'trend'} onClick={() => setGraphMode('trend')}>Trend lines</button></div></div>
      {historyError && <p role="alert" className="cell-history-warning">{historyError}{history && ' Previously displayed history may be outdated.'}</p>}
      {loading && history && <p role="status" className="cell-history-note">Refreshing history… Previous graph remains visible until the update is ready.</p>}
      {graphMode === 'cells' ? (array ? <ArrayCellSnapshot key={`${siteKey}:${array}:${metric}:${hours}`} array={Number(array)} metric={metric} points={history?.points ?? []} siteKey={siteKey} revision={revision} acquiredAt={view?.acquiredAt} onGraph={add}/> : <div className="cell-history-empty">Waiting for a recorded array. Select an array to view every cell group.</div>) : loading && !history ? <div className="cell-history-empty" role="status">Reading recorded cell history…</div> : chart.length === 0 ? <div className="cell-history-empty">No cell history in this window. Recording starts after activation and the first successful report.</div> :
        graphMode === 'heatmap' ? <CellHistoryHeatmap points={history!.points} arrays={visibleArrays} unit={unit} selectedAt={selectedAt} onSelect={setSelectedAt}/> : <div className="cell-history-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={chart} margin={{top: 8, right: 16, left: 0, bottom: 4}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1"/><XAxis dataKey="at" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={v => new Date(v).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}/>
          <YAxis domain={['auto', 'auto']} width={65} tickFormatter={v => `${format(v)}`}/>
          <Tooltip labelFormatter={v => new Date(Number(v)).toLocaleString()} formatter={(v, name, item) => {
            const sourceTime = item.payload?.sourceTimes?.[String(item.dataKey)];
            return [`${format(Number(v))} ${unit}${sourceTime ? ` · measured ${new Date(sourceTime).toLocaleTimeString()}` : ''}`, name];
          }}/>
          <Legend onClick={entry => toggle(String(entry.dataKey))}/>
          {series.map((id, i) => <Line key={id} dataKey={id} name={id === 'average' ? 'Average' : id === 'min' ? 'Minimum' : id === 'max' ? 'Maximum' : id} stroke={i < 3 ? ['#94a3b8', '#059669', '#475569'][i] : colors[i - 3]} hide={hidden.has(id)} dot={chart.length < 3} strokeWidth={id === 'average' || i >= 3 ? 2 : 1} strokeDasharray={i === 0 || i === 2 ? '4 3' : undefined} connectNulls={false} isAnimationActive={false}/>) }
        </LineChart></ResponsiveContainer></div>}
      {graphMode === 'trend' && <div className="cell-history-trend-actions"><span>Click a legend label to hide or restore its line.</span><button onClick={() => setHidden(new Set())}>Show all lines</button></div>}
      {graphMode !== 'cells' && <CellHistoryTable view={view} point={selectedPoint} arrays={visibleArrays} unit={unit} onLatest={() => setSelectedAt(null)}/>}
      <p className="cell-history-note">{history ? `${history.sampledFrames} of ${history.matchedFrames} stored frames shown. ${history.sampled ? 'Sampled preview: narrow the window to inspect brief events.' : 'All stored frames in this window are shown.'} ${history.unreadableFrames ? `${history.unreadableFrames} unreadable frames shown as gaps.` : ''}` : ''} Measurements retain their source timestamps; a report receipt is not a new cell measurement.</p>
    </div>
    <details className="cell-history-card cell-history-inspect"><summary>Inspect individual cell groups <span>{targets.length} / 8 overlays selected</span></summary>
      <div className="cell-history-toolbar">
        <label>Array / string<select value={targetString} onChange={e => {setTargetString(e.target.value); setBpc(1); setGroup(1);}}><option value="">Choose a string</option>{view?.targets.filter(t => !array || t.array === Number(array)).map(t => <option key={`${t.array}:${t.string}`} value={`${t.array}:${t.string}`}>Array {t.array} / String {t.string}</option>)}</select></label>
        <label>BPC<select value={bpc} onChange={e => setBpc(Number(e.target.value))}>{Array.from({length: string?.bpcCount ?? 1}, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label>
        <label>Cell group<select value={group} onChange={e => setGroup(Number(e.target.value))}>{Array.from({length: string?.groupsPerBpc ?? 1}, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label>
        <button disabled={!string || targets.length >= 8} onClick={() => string && add(`A${string.array}-S${string.string}-B${bpc}-C${group}`)}>Add overlay</button>
      </div>
      <div className="cell-history-chips">{targets.map(id => <div key={id}><button title="Show only this cell group" onClick={() => setHidden(new Set(series.filter(s => s !== id)))}>{id} · Solo</button><button aria-label={`Remove ${id}`} onClick={() => setTargets(v => v.filter(t => t !== id))}><X size={13}/></button></div>)}</div>
      <div className="cell-history-outliers">{(['highest', 'lowest'] as const).map(key => <div key={key}><h4>{key === 'highest' ? 'Highest' : 'Lowest'} {unit} · Select to graph</h4>{view?.[key].slice(0, 6).map(t => <button key={t.id} disabled={targets.length >= 8 && !targets.includes(t.id)} onClick={() => add(t.id)}><span>{t.id}</span><strong>{format(t.value)}</strong></button>)}</div>)}</div>
    </details>
    <details className="cell-history-quality"><summary>How to read this data</summary><p className="cell-history-note">All cells shows every reported cell group for one array at a single snapshot time. Array history shows averages across sampled snapshots at equal column spacing—not a continuous time scale. Fresh = measured within 2 minutes of the snapshot (future tolerance 5 seconds). Latest statistics use current time; historical statistics use their recorded time. Coverage counts discovered cell-group channels, not independently verified installed inventory. Segments reporting no cells are excluded.</p></details>
    {view && <footer className="cell-history-note">Recording: {view.storage.enabled ? 'Enabled' : 'Disabled'} · At most one frame per minute · {view.storage.retentionDays}-day retention · {format(view.storage.maxBytes / 1024 ** 3)} GiB cap · {view.storage.saved} frames saved this process · {view.storage.dropped} busy skips · {view.storage.failures} failures. Missing history is never backfilled. Cell groups are reported channels, not necessarily independent physical sensors.</footer>}
    {!!view?.issues.length && <details className="cell-history-card"><summary>Data coverage notes ({view.issues.length})</summary><ul>{view.issues.map(issue => <li key={issue}>{issue}</li>)}</ul></details>}
  </section>;
}
