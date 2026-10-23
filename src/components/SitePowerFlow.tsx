import React,{useEffect,useState} from 'react';
import type {SitePowerFlow as Flow,PowerFlowReading,PowerFlowSoc,FlowDirection} from '../core/fleet/powerFlow';
import {rememberFlow} from './powerFlowPresentation';

function Icon({kind}:{kind:'grid'|'pcs'|'battery'}){
 return <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  {kind==='grid'?<><path d="M28 8h8l15 48H13L28 8ZM22 18h20M17 30h30M12 42h40M32 8V3M22 56l22-26M42 56 20 30M20 20 7 27M44 20l13 7"/><path d="M5 27v7m54-7v7"/></>:
   kind==='pcs'?<><rect x="9" y="7" width="46" height="50" rx="5"/><path d="m12 52 40-40M17 19h12M17 24h12m9 17c6-10 6 10 12 0M17 57v4m30-4v4"/></>:
   <><rect x="13" y="10" width="38" height="48" rx="5"/><path d="M25 10V5h14v5M21 22h22M21 32h22M21 42h22M21 51h22"/></>}
 </svg>;
}
const formatted=(v:number|null)=>v===null?'—':v.toLocaleString(undefined,{maximumFractionDigits:1});
function BatterySoc({soc,last}:{soc:PowerFlowSoc|undefined;last:PowerFlowSoc|undefined}){
 const fresh=soc?.quality==='live'&&!!soc.validUntil&&soc.validUntil>Date.now()&&soc.percent!==null;
 const connected=soc?.coverage?.connected!==0;
 const known=last?.percent!==null&&last?.percent!==undefined;
 const percent=fresh?soc.percent!:known?last.percent!:0;
 const label=fresh?`${formatted(percent)}%`:known?`Last ${formatted(percent)}%`:'—';
 const status=fresh?(connected?'Online SOC':'Reported SOC'):known?'SOC stale':'SOC not reported';
 return <div className={`pf-node pf-battery${known&&connected?'':' pf-soc-unavailable'}${!fresh&&known?' pf-soc-retained':''}`} title={`${last?.source??soc?.source??'EMS array online SOC'} · ${last?.observedAt?new Date(last.observedAt).toLocaleString():'No observation'}`}>
  <svg viewBox="0 0 80 70" role="img" aria-label={`Battery ${status}: ${label}`} fill="none">
   <rect x="13" y="12" width="54" height="52" rx="6" fill="#f4f8f7" stroke="currentColor" strokeWidth="2"/>
   <path d="M29 12V6h22v6" stroke="currentColor" strokeWidth="2"/>
   <rect className="pf-soc-fill" x="17" y={60-44*percent/100} width="46" height={44*percent/100} fill="#8dd4b6" visibility={known&&connected?'visible':'hidden'} data-soc-percent={fresh&&connected?percent:undefined} data-last-soc-percent={!fresh&&known?percent:undefined}/>
   <text x="40" y="43" textAnchor="middle" className="pf-soc-value">{label}</text>
  </svg>
  <span>{status}</span>
  <span className={`pf-string-coverage${fresh&&soc.coverage?.partial?' pf-coverage-partial':''}`}>
   {soc?.coverage?`${fresh?'':'Last: '}${soc.coverage.label}`:'String coverage unavailable'}
  </span>
 </div>;
}
function FlowLink({reverse,active}:{reverse:boolean;active:boolean}){
 return <div className={`pf-link${reverse?' pf-reverse':''}${active?' pf-moving':''}`} aria-hidden="true">
  <svg viewBox="0 0 24 60" preserveAspectRatio="none"><path className="pf-track" d="M12 0V60"/><path className="pf-pulse" d="M12 0V60"/></svg>
  {active&&<span className="pf-arrow">{reverse?'↑':'↓'}</span>}
 </div>;
}
const currentDirection=(r:PowerFlowReading):FlowDirection=>
 r.validUntil&&r.validUntil<=Date.now()?'stale':r.direction;
const moving=(d:FlowDirection)=>d==='charging'||d==='discharging';
const stateLabel=(r:PowerFlowReading,d:FlowDirection)=>d==='stale'?'Stale · flow withheld':r.label;
/** Rendering only: direction, deadband and freshness come from the server.
 * A local expiry timer stops visual motion even when a tab loses its data feed.
 */
export function SitePowerFlow({flow,siteName}:{flow:Flow|undefined;siteName:string}){
 // Missing model means disabled/invalid identity, not a refresh placeholder.
 // Unmounting and site/source keys prevent retained values crossing contexts.
 return flow?<PowerFlowDisplay key={`${siteName}\0${flow.source}`} flow={flow} siteName={siteName}/>:null;
}
function PowerFlowDisplay({flow,siteName}:{flow:Flow;siteName:string}){
 const [memory,setMemory]=useState(()=>({input:flow,display:rememberFlow(flow)}));
 let display=memory.display;
 if(memory.input!==flow){
  display=rememberFlow(flow,display);
  setMemory({input:flow,display});
 }
 const [paused,setPaused]=useState(false),[clock,setClock]=useState(0);
 useEffect(()=>{
  if(!flow)return;
  // Expire each branch independently, including after the net reading expires.
  const deadlines=[flow.net,...flow.arrays,...flow.arrays.flatMap(a=>a.soc?[a.soc]:[])].flatMap(r=>r.validUntil&&r.validUntil>Date.now()?[r.validUntil]:[]);
  if(!deadlines.length)return;
  const timer=setTimeout(()=>setClock(Date.now()),Math.max(1,Math.min(...deadlines)-Date.now()));
  return ()=>clearTimeout(timer);
 },[flow,clock]);
 if(!flow)return null;
 const net=flow.net,direction=currentDirection(net);
 // The server has already applied the per-array deadband. A site total must
 // never animate the shared connection when no current array is moving.
 const active=moving(direction)&&flow.arrays.some(a=>moving(currentDirection(a)));
 const reverse=direction==='discharging';
 const label=stateLabel(net,direction);
 const route=active?(reverse?'Batteries → Inverters → Grid':'Grid → Inverters → Batteries'):direction==='idle'?'No significant net power reported':moving(direction)?'Shared animation paused · no array above the display threshold':'Waiting for current measured power';
 const netDisplay=net.powerKw===null?display.net:net;
 return <section className={`power-flow pf-${direction} pf-tone-${display.tone}${paused?' pf-paused':''}`} aria-label={`${siteName} power flow`}>
  <div className="pf-heading"><div><span className="pf-eyebrow">{siteName} · POWER FLOW</span><h3>{label}</h3></div>
   <div className="pf-reading"><strong>{formatted(netDisplay?.powerKw??null)} <small>kW</small></strong><span>Net site · {direction==='stale'||direction==='unknown'?'last reported':'measured'}</span></div>
   <button className="pf-toggle" onClick={()=>setPaused(p=>!p)} aria-pressed={paused} aria-label={`${paused?'Resume':'Pause'} power-flow animation for ${siteName}`}>{paused?'Resume motion':'Pause motion'}</button>
  </div>
  <p className="pf-route">{route}</p>
  <div className="pf-grid-source">
   <div className="pf-node"><Icon kind="grid"/><strong>Grid</strong><span>Shared AC connection</span></div>
   <FlowLink reverse={display.tone==='discharging'} active={active}/>
  </div>
  <p className="pf-bus-label">Shared grid bus · {flow.arrays.length} arrays reported{flow.mixed?' · Mixed directions':''}{flow.partial?' · Partial coverage':''}</p>
  <div className="pf-branches" role="list" aria-label="Per-array measured power flow">
   {flow.arrays.map(a=>{
    const d=currentDirection(a),isActive=moving(d),isReverse=d==='discharging';
    const last=display.arrays.get(a.array),reading=a.powerKw===null?last?.power:a;
    return <div key={a.array} className={`pf-branch pf-${d} pf-tone-${last?.tone??'unknown'}`} role="listitem" aria-label={`Array ${a.array}: ${stateLabel(a,d)}, ${formatted(reading?.powerKw??null)} kW`}>
     <FlowLink reverse={last?.tone==='discharging'} active={isActive}/>
     <div className="pf-branch-card">
      <strong className="pf-array-title">Array {a.array}</strong>
      <div className="pf-node"><Icon kind="pcs"/><strong>Inverter {a.array}</strong></div>
      <span className="pf-branch-state">{stateLabel(a,d)}</span>
      <b className="pf-branch-kw">{(d==='stale'||d==='unknown')&&reading?.powerKw!==undefined&&reading?.powerKw!==null?'Last ':''}{formatted(reading?.powerKw??null)} <small>kW</small></b>
      <FlowLink reverse={last?.tone==='discharging'} active={isActive}/>
      <BatterySoc soc={a.soc} last={last?.soc}/>
      <span className="pf-branch-time">{reading?.observedAt?new Date(reading.observedAt).toLocaleTimeString():'No observation'}</span>
     </div>
    </div>;
   })}
  </div>
  {!flow.arrays.length&&<p className="pf-note">Array power is unavailable. No inverter flow is inferred from the site total.</p>}
  <p className="pf-legend"><span>↓ Negative kW · charging</span><span>↑ Positive kW · discharging</span><span>Idle / stale · no motion</span></p>
  <p className="pf-source">{flow.source} · {net.observedAt?new Date(net.observedAt).toLocaleTimeString():'No observation'}</p>
  <p className="pf-note">{flow.note}</p>
  <p className="pf-note">Electrons not to scale</p>
 </section>;
}
