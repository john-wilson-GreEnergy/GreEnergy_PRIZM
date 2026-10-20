import React,{useEffect,useRef,useState} from 'react';
import {ResponsiveContainer,ComposedChart,Line,Area,XAxis,YAxis,CartesianGrid,Tooltip} from 'recharts';
import {BarChart3,ChevronLeft,ChevronRight,Play,Pause,RefreshCw} from 'lucide-react';
import {useSiteDataFields} from '../context/SiteDataContext';
import {usePresentation} from '../lib/workspacePreferences';
import {frameAtOrAfter,loadSnapshotTimes} from '../lib/analyticsReplay';
import type {CellMetric,CellOverview,CellSnapshotIndex} from '../core/cellHistory';
import type {SiteAnalytics,AnalyticsMetric} from '../core/siteAnalytics';
import ArrayCellSnapshot from './ArrayCellSnapshot';
import {OperatingCharts} from './OperatingCharts';
import './operatingCharts.css';
import './cellHistory.css';
import './siteAnalytics.css';

const base='/api/local/site-data';
const format=(v:number|null|undefined)=>v==null?'—':v.toLocaleString(undefined,{maximumFractionDigits:1});
const stamp=(at:number|null|undefined)=>at?new Date(at).toLocaleString(): 'Not reported';
async function read<T>(path:string,signal:AbortSignal):Promise<T>{const response=await fetch(path,{signal});const value=await response.json();if(!response.ok)throw Error(value.error||'Analytics unavailable');return value;}
const categories=[['site','Site overview'],['cells','All cells'],['string','Strings'],['pcs','PCS'],['hvac','HVAC & environment']] as const;

export function AnalyticsComparison({metric,array}:{metric:AnalyticsMetric;array:string}){
  const rows=metric.rows.filter(r=>!array||String(r.array)===array);
  const arrays=[...new Set(rows.map(r=>r.array))];
  return <>
    <p className="cell-history-note">Equipment comparison, not a time trend. Dots represent reported readings; gaps mean stale or unavailable. Shaded bands show reported minimum–maximum where available.</p>
    {!rows.length&&<div className="cell-history-empty">No mapped equipment for this selection.</div>}
    <div className="analytics-grid">{arrays.map(a=><section className="analytics-panel" key={a}><h3>Array {a}<small>{metric.unit}</small></h3><ResponsiveContainer width="100%" height={210}><ComposedChart data={rows.filter(r=>r.array===a)} margin={{left:0,right:14,top:12,bottom:6}}>
      <CartesianGrid stroke="#e3ebe7"/><XAxis dataKey="position" type="number" domain={['dataMin','dataMax']} allowDecimals={false}/><YAxis width={60} domain={['auto','auto']} tickFormatter={format}/>
      <Tooltip labelFormatter={v=>`Equipment ${v}`} formatter={(v)=>[Array.isArray(v)?v.map(n=>`${format(Number(n))} ${metric.unit}`).join(' – '):`${format(Number(v))} ${metric.unit}`,metric.label]}/>
      <Area type="linear" dataKey={r=>r.low==null||r.high==null?null:[r.low,r.high]} stroke="none" fill="#c6e7db" name="Min–max" isAnimationActive={false} connectNulls={false}/>
      <Line dataKey="value" stroke="#178464" strokeWidth={1.5} dot={{r:2.5}} connectNulls={false} isAnimationActive={false}/>
    </ComposedChart></ResponsiveContainer><p>{metric.id.startsWith('string')?'String number':metric.id.startsWith('pcs')?'PCS number':'Segment number'} · source times in table below</p></section>)}</div>
    <div className="analytics-panel"><h3>Equipment detail <small>Same displayed dataset</small></h3><div className="analytics-table"><table><thead><tr><th>Array</th><th>Target</th><th>Reading · {metric.unit}</th><th>Min</th><th>Max</th><th>Quality</th><th>Source time</th><th>Source</th></tr></thead><tbody>{rows.map((r,i)=><tr key={`${r.array}:${r.target}:${i}`}><td>{r.array}</td><th scope="row">{r.target}</th><td>{format(r.value)}</td><td>{format(r.low)}</td><td>{format(r.high)}</td><td>{r.value===null&&r.quality==='fresh'?'Not reported':r.quality}</td><td>{stamp(r.observedAt)}</td><td>{r.source}</td></tr>)}</tbody></table></div></div>
  </>;
}

export default function SiteAnalyticsWorkspace(){
  const {lastUpdated,siteIdentity,error:connectionError,isPollingEnabled,isTerminated}=useSiteDataFields(['lastUpdated','siteIdentity','error','isPollingEnabled','isTerminated']);
  const siteKey=JSON.stringify([siteIdentity?.stationCode,siteIdentity?.blockIndex,siteIdentity?.activeProfileId]);
  const [category,setCategory]=usePresentation('analytics-category','site');
  const [array,setArray]=usePresentation('analytics-array','1');
  const [metric,setMetric]=usePresentation<CellMetric>('analytics-cell-metric','millivolts');
  const [comparison,setComparison]=usePresentation('analytics-comparison','string-soc');
  const [days,setDays]=useState(1),[revision,setRevision]=useState(0);
  const [view,setView]=useState<CellOverview|null>(null),[live,setLive]=useState<SiteAnalytics|null>(null);
  const [times,setTimes]=useState<number[]>([]),[at,setAt]=useState<number|null>(null),[playing,setPlaying]=useState(false),[loadedAt,setLoadedAt]=useState<number|null>(null);
  const [delay,setDelay]=useState(2),[jump,setJump]=useState(''),[jumpError,setJumpError]=useState('');
  const [error,setError]=useState(''),[indexError,setIndexError]=useState(''),[indexLoading,setIndexLoading]=useState(false);
  const [indexRevision,setIndexRevision]=useState(0);
  const lastFetch=useRef({key:'',at:0});const request=useRef<AbortController|null>(null);
  const stale=!!connectionError||!isPollingEnabled||isTerminated;
  useEffect(()=>{setView(null);setLive(null);setTimes([]);setAt(null);setPlaying(false);setLoadedAt(null);lastFetch.current.key='';},[siteKey]);
  useEffect(()=>{
    const key=`${siteKey}:${revision}:${metric}:${category}`;
    if(lastFetch.current.key===key&&Date.now()-lastFetch.current.at<15000)return;
    lastFetch.current={key,at:Date.now()};request.current?.abort();const c=new AbortController();request.current=c;
    Promise.all([category==='site'?Promise.resolve(null):read<CellOverview>(`${base}/cells?metric=${metric}`,c.signal),read<SiteAnalytics>(`${base}/analytics`,c.signal)])
      .then(([v,l])=>{if(!c.signal.aborted){if(v)setView(v);setLive(l);setError('');}}).catch(e=>{if(!c.signal.aborted)setError(e.message);});
  },[lastUpdated,siteKey,revision,metric,category]);
  useEffect(()=>()=>request.current?.abort(),[]);
  useEffect(()=>{
    if(category!=='cells'){setIndexLoading(false);return;}
    const c=new AbortController();setIndexLoading(true);setIndexError('');
    const to=Date.now(),from=days?to-days*86400000:undefined;
    loadSnapshotTimes(q=>read<CellSnapshotIndex>(`${base}/cells/index?${q}`,c.signal),from,to).then(result=>{
      if(c.signal.aborted)return;
      if(view?.site&&result.site!==view.site)throw Error('Recorder site does not match this workspace');
      setTimes(result.times);
    }).catch(e=>{if(!c.signal.aborted){setIndexError(e.message);setPlaying(false);}}).finally(()=>{if(!c.signal.aborted)setIndexLoading(false);});
    return ()=>c.abort();
  },[siteKey,days,indexRevision,view?.storage.lastSavedAt,category]);
  const index=at===null?times.length-1:times.indexOf(at);
  const choose=(value:number|null)=>{setPlaying(false);setLoadedAt(null);setAt(value);setJumpError('');};
  useEffect(()=>{
    if(!playing||at===null||loadedAt!==at||index<0)return;
    if(index>=times.length-1){setPlaying(false);return;}
    const timer=setTimeout(()=>{setLoadedAt(null);setAt(times[index+1]);},delay*1000);return ()=>clearTimeout(timer);
  },[playing,at,loadedAt,index,times,delay]);
  useEffect(()=>{setPlaying(false);setLoadedAt(null);},[category,array,metric,days]);
  const arrays=view?.arrays.map(a=>a.array)??[];
  const arrayNumber=Number(array)||arrays[0]||1;
  const selectedMetric=live?.metrics.find(m=>m.id===comparison&&m.id.startsWith(category))??live?.metrics.find(m=>m.id.startsWith(category));
  const replay=at!==null;
  return <section className="site-analytics cell-history">
    <header className="analytics-heading"><div><div className="cell-history-eyebrow">Engineering / Read-only analytics</div><h1><BarChart3 size={25}/> Site analytics</h1><p>See the whole array. Inspect an exact moment. Follow every retained snapshot.</p></div><span className={`analytics-mode ${replay?'is-replay':''}`}>{replay?'RECORDED SNAPSHOT':stale||error?'LIVE VIEW · CHECK SOURCE':'LIVE VIEW'}</span></header>
    {(error||stale)&&<p role="alert" className="cell-history-warning">{error||'Live connection is paused or unavailable.'} Retained live comparisons may be outdated. Historical replay remains labelled with its recorded time.</p>}
    <div className="analytics-controls">
      <div className="analytics-tabs" role="group" aria-label="Analytics category">{categories.map(([id,label])=><button key={id} aria-pressed={category===id} onClick={()=>{setCategory(id);if(id==='site')choose(null);}}>{label}</button>)}</div>
      {category!=='site'&&<div className="cell-history-toolbar">
        <label>Array<select aria-label="Analytics array" value={category==='cells'?String(arrayNumber):array} onChange={e=>setArray(e.target.value)}>{category!=='cells'&&<option value="">All arrays</option>}{arrays.map(a=><option key={a} value={a}>Array {a}</option>)}</select></label>
        <label>Metric{category==='cells'?<select aria-label="Analytics metric" value={metric} onChange={e=>setMetric(e.target.value as CellMetric)}><option value="millivolts">Cell voltage · mV</option><option value="temperatureF">Cell temperature · °F</option></select>:<select aria-label="Analytics metric" value={selectedMetric?.id??''} onChange={e=>setComparison(e.target.value)}>{live?.metrics.filter(m=>m.id.startsWith(category)).map(m=><option key={m.id} value={m.id}>{m.label} · {m.unit}</option>)}</select>}</label>
        <button onClick={()=>{setRevision(n=>n+1);setIndexRevision(n=>n+1);}}><RefreshCw size={14}/> Refresh view</button>
      </div>}
    </div>
    {category!=='site'&&<div className="analytics-timeline">
      <div className="analytics-time-heading"><div><strong>{replay?'Recorded':'Latest recorded cell frame'}</strong><time>{stamp(at??view?.acquiredAt)}</time><small>{Intl.DateTimeFormat().resolvedOptions().timeZone} · source measurement times are preserved</small></div><button className="analytics-live" onClick={()=>choose(null)} aria-pressed={!replay}>Go live</button></div>
      <div className="analytics-playback">
        <button aria-label="Previous recorded snapshot" disabled={!times.length||index<=0||category!=='cells'} onClick={()=>choose(times[index-1])}><ChevronLeft size={17}/></button>
        <button disabled={!times.length||category!=='cells'||indexLoading} onClick={()=>{if(playing)setPlaying(false);else {if(at===null||index<0||index===times.length-1){setAt(times[0]);setLoadedAt(null);}setPlaying(true);}}}>{playing?<Pause size={15}/>:<Play size={15}/>} {playing?'Pause':'Play replay'}</button>
        {!replay&&<button disabled={!times.length||category!=='cells'} onClick={()=>choose(times[times.length-1])}>Freeze latest</button>}
        <button aria-label="Next recorded snapshot" disabled={!times.length||index>=times.length-1||index<0||category!=='cells'} onClick={()=>choose(times[index+1])}><ChevronRight size={17}/></button>
        <label>Frame<input aria-label="Recorded frame number" type="number" min={1} max={times.length||1} value={index>=0?index+1:''} disabled={!times.length||category!=='cells'} onChange={e=>{const i=Number(e.target.value)-1;if(Number.isInteger(i)&&i>=0&&i<times.length)choose(times[i]);}}/></label><span>of {times.length.toLocaleString()}</span>
        <label>Step delay<select value={delay} onChange={e=>setDelay(Number(e.target.value))}><option value={1}>1 second</option><option value={2}>2 seconds</option><option value={5}>5 seconds</option></select></label>
        <label>Archive window<select value={days} onChange={e=>{choose(null);setTimes([]);setDays(Number(e.target.value));}}><option value={1}>24 hours</option><option value={7}>7 days</option><option value={0}>All retained</option></select></label>
      </div>
      <input className="analytics-scrubber" type="range" aria-label="Recorded snapshot timeline" min={0} max={Math.max(0,times.length-1)} value={Math.max(0,index)} disabled={!times.length||category!=='cells'} onChange={e=>choose(times[Number(e.target.value)])}/>
      <div className="analytics-jump"><span>{stamp(times[0])}</span><span>{stamp(times.at(-1))}</span></div>
      <div className="analytics-jump"><label>Jump to time<input type="datetime-local" aria-label="Jump to recorded time" value={jump} onChange={e=>setJump(e.target.value)} /></label><button disabled={!jump||!times.length||category!=='cells'} onClick={()=>{const found=frameAtOrAfter(times,new Date(jump).getTime());if(found===null)setJumpError('No recorded frame at or after that time in this window.');else choose(found);}}>Find next recorded frame</button></div>
      <p className="cell-history-note" role="status">{indexLoading?'Loading every retained timestamp…':`${times.length.toLocaleString()} recorded frames in this window · No sampling. Playback waits for each frame to load; it never skips frames to catch up.`}</p>
      {indexError&&<p role="alert" className="cell-history-warning">{indexError} The timestamp list may be out of date; refresh to retry.</p>}{jumpError&&<p role="alert">{jumpError}</p>}
      {replay&&index<0&&<p role="alert">This frame is no longer listed in the selected window. It may have expired. Select another frame or Go live.</p>}
    </div>}
    {category==='site'?<OperatingCharts data={live?.operatingCharts} stale={stale||!!error}/>:category==='cells'?<div className="analytics-panel">{view?.storage.enabled===false?<p>Cell recording is disabled on this collector.</p>:view?<ArrayCellSnapshot key={`${siteKey}:${arrayNumber}:${metric}`} array={arrayNumber} metric={metric} siteKey={siteKey} points={[]} revision={revision} acquiredAt={view.acquiredAt} controlledAt={at} onLoaded={setLoadedAt} onLoadError={()=>setPlaying(false)}/>:<div className="cell-history-empty">Loading recorded cell coverage…</div>}</div>
      :replay?<div className="analytics-panel cell-history-empty">This metric is not stored in the cell snapshot archive. Select All cells to continue replay, or Go live to review current equipment readings. Current values are never substituted into a historical frame.</div>
      :selectedMetric?<><div className="analytics-live-note"><strong>Current equipment comparison</strong> · {live?.site} · Prepared {stamp(live?.preparedAt)}<p>Historical cell replay does not include these metrics. Each row retains its own source time; readings are not assumed simultaneous.</p></div><AnalyticsComparison metric={selectedMetric} array={array}/></>:<p>Waiting for the existing telemetry publication…</p>}
    <footer className="cell-history-note">Read-only · No equipment commands or extra EMS polling · Cell archive: at most one frame per minute, {view?.storage.retentionDays??'—'}-day configured retention. Unrecorded and expired data cannot be reconstructed. Channels are reported cell groups, not necessarily independent physical sensors.</footer>
  </section>;
}
