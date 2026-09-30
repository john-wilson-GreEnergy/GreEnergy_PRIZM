import React,{useEffect,useState,useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import {fleetStore} from './FleetStore';
import {fleetMetrics,metricKeys,type MetricKey} from '../core/fleet/model';
import {SiteOverview} from './SiteOverview';
import {PalettePicker} from './PalettePicker';
import './style.css';

const display=(value:number|null)=>value===null?'—':value.toLocaleString(undefined,{maximumFractionDigits:1});
const clock=(stamp:string|null)=>stamp?new Date(stamp).toLocaleTimeString():'No observation';
const topMetrics:MetricKey[]=['powerKw','targetKw','socPct','chargeKw','dischargeKw','strings','warnings','alarms'];
function App(){
  const state=useSyncExternalStore(fleetStore.subscribe,fleetStore.getSnapshot);
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[selected,setSelected]=useState<string|null>(null);
  useEffect(()=>{void fleetStore.start();return ()=>fleetStore.stop();},[]);
  useEffect(()=>{window.addEventListener('pointerdown',fleetStore.activity);window.addEventListener('keydown',fleetStore.activity);return ()=>{window.removeEventListener('pointerdown',fleetStore.activity);window.removeEventListener('keydown',fleetStore.activity);};},[]);
  useEffect(()=>{if(!state.session || (state.view && !state.view.sites.some(s=>s.siteId===selected)))setSelected(null);},[state.session,state.view,selected]);
  const site=state.view?.sites.find(s=>s.siteId===selected);
  return <div className="fleet-shell">
    <header><a className="brand" href="/" aria-label="PRIZM fleet home"><img src="/logo-transparent.svg" alt=""/><span>GreEnergy <strong>PRIZM</strong><small>FLEET WORKSPACE</small></span></a><div className="header-right"><PalettePicker/><span className="read-only">Read-only pilot</span>{state.session && <button onClick={()=>void fleetStore.logout()}>Sign out</button>}</div></header>
    {state.checking?<main><p>Checking access…</p></main>:!state.session?<main className="signin"><p className="eyebrow">LOCAL · OFFLINE ACCESS</p><h1>Sign in to your fleet.</h1><p>One workspace. Separate site collectors.</p><form onSubmit={event=>{event.preventDefault();void fleetStore.login(email,password);setPassword('');}}><label>Email<input type="email" autoComplete="username" required value={email} onChange={event=>setEmail(event.target.value)}/></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={event=>setPassword(event.target.value)}/></label><button className="primary" disabled={state.loading}>{state.loading?'Signing in…':'Sign in'}</button></form>{state.error && <p role="alert" className="notice">{state.error}</p>}<p className="fine">Access is assigned per site. Equipment controls are not enabled in this pilot.</p></main>:<main>
      {state.session.simulated && <div className="simulation">SIMULATED DATA · Local validation only · No equipment connected</div>}
      <div className="page-heading"><div><p className="eyebrow">OPERATIONS / FLEET</p><h1>{site?site.name:'Fleet overview'}</h1><p>{site?`${site.stationCode} · Block ${site.blockIndex}`:'Site-scoped visibility. Current totals with explicit coverage.'}</p></div><div className="asof">{state.session.email}<br/>{state.view?'Prepared '+clock(state.view.generatedAt):'Awaiting fleet data'}</div></div>
      {state.error && <div role="alert" className="notice">{state.error}</div>}
      {!state.view && !state.error && <p>Waiting for the first prepared summary…</p>}
      {state.view && <>
        <nav aria-label="Site selection"><button className={!site?'active':''} onClick={()=>setSelected(null)}>All permitted sites</button>{state.view.sites.map(row=><button className={selected===row.siteId?'active':''} key={row.siteId} onClick={()=>setSelected(row.siteId)}>{row.name}</button>)}</nav>
        {!state.view.sites.length?<div className="notice">No enrolled sites are permitted for this account. Ask the administrator to assign site access.</div>:<>
          {!site && <section className="metric-grid" aria-label="Fleet totals">{topMetrics.map(key=>{
            const total=state.view!.totals[key];
            return <article className="metric" key={key}><p>{fleetMetrics[key].label}</p><strong>{display(total.value)} <small>{fleetMetrics[key].unit}</small></strong><span className={total.complete?'ok':'caution'}>{`${total.contributors.length} of ${state.view!.sites.length} sites · ${total.complete?'complete':'partial / unknown'}`}</span></article>;
          })}</section>}
          <div className="site-stack">{(site?[site]:state.view.sites).map(row=><SiteOverview key={row.siteId} site={row} focused={Boolean(site)} onFocus={()=>{setSelected(row.siteId);window.scrollTo({top:0,behavior:'smooth'});}}/>)}</div>
          {!site && <details className="detail coverage-detail"><summary>Fleet totals & source coverage</summary><div className="table-wrap"><table><thead><tr><th>Metric</th><th>Total</th><th>Contributing sites</th><th>Not included</th></tr></thead><tbody>{metricKeys.map(key=>{const metric=state.view!.totals[key];const names=(ids:string[])=>ids.map(id=>state.view!.sites.find(s=>s.siteId===id)?.name).join(', ') || '—';return <tr key={key}><th>{fleetMetrics[key].label}</th><td>{display(metric.value)} {fleetMetrics[key].unit}</td><td>{names(metric.contributors)}</td><td className={metric.excluded.length?'caution':''}>{names(metric.excluded)}</td></tr>;})}</tbody></table></div></details>}
        </>}
      </>}
      <footer>Read-only workspace · Site networks remain separate. Unknown values are never counted as zero.<br/>SOC is weighted by installed capacity. Stored energy is withheld until a complete source is validated.</footer>
    </main>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
