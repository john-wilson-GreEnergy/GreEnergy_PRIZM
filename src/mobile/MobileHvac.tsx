import React,{useEffect,useRef,useState} from 'react';
import type {MobileSite,MobileHvacUnit} from './hvacModel';
import {thermalMetrics} from '../server/thermal/thermalMetrics';

const stamp=(at:number)=>new Date(at).toLocaleString();
const tone=(u:MobileHvacUnit)=>u.quality!=='Live'?'unavailable':u.faults.length?'fault':u.mode.toLowerCase();
function HvacDetails({unit,onClose}:{unit:MobileHvacUnit|undefined;onClose:()=>void}) {
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const d=ref.current;d?.showModal();return()=>d?.close();},[]);
 return <dialog ref={ref} className="m-hvac-dialog" aria-labelledby="hvac-detail-title" onCancel={onClose}>
  <header><div><p className="m-eyebrow">READ-ONLY HVAC DETAIL</p><h2 id="hvac-detail-title">{unit?.label??'Reading unavailable'}</h2></div><button onClick={onClose} aria-label="Close HVAC details">Close</button></header>
  {!unit?<p className="m-notice">This unit is no longer in the current snapshot.</p>:<>
   <p className={'m-hvac-status '+tone(unit)}>{unit.quality==='Live'?'Commanded mode: '+unit.mode:'Last known command: '+unit.mode} · {unit.quality}<small>Source reading {stamp(unit.at)} · PRIZM thermal snapshot</small></p>
   <p className="m-muted">Commanded mode is not proof of operation. Review measured amperage below; fan RPM is diagnostic only where the equipment does not support fan-speed feedback.</p>
   <h3>HVAC {unit.unit} faults</h3>{unit.faults.length?unit.faults.map((f,i)=><p className="m-notice" key={i}>{f}</p>):<p className="m-muted">{unit.quality==='Live'?'No unit-specific faults reported':'Fault coverage is not current.'}</p>}
   {!!unit.controllerAlerts?.length&&<section><h3>Segment / controller alerts</h3><p className="m-muted">Shared with this segment—not faults assigned to HVAC {unit.unit}.</p>{unit.controllerAlerts.map((f,i)=><p className="m-notice" key={i}>{f}</p>)}</section>}
   <div className="m-hvac-readings">{Object.entries(thermalMetrics).map(([key,m])=><div key={key}><span>{m.label}</span><strong>{unit.readings[key as keyof typeof thermalMetrics].text}</strong></div>)}</div>
   <p className="m-muted">Reported readings only. No controls or setpoint changes are available.</p>
  </>}
 </dialog>;
}
export function MobileHvac({site}:{site:MobileSite}) {
 const [array,setArray]=useState('1'),[inspected,setInspected]=useState<string|null>(null);
 const data=site.mobileHvac,units=data?.units??[];
 const arrays=[...new Set(units.map(u=>u.array))];
 const chosen=array==='all'?'all':arrays.includes(Number(array))?array:String(arrays[0]??'1');
 return <section className="m-hvac" aria-label={`${site.name} HVAC map`}>
  <div className="m-section-heading"><h2>HVAC overhead</h2><label>Array <select aria-label={`${site.name} HVAC array`} value={chosen} onChange={e=>setArray(e.target.value)}><option value="all">All arrays</option>{arrays.map(a=><option key={a} value={a}>Array {a}</option>)}</select></label></div>
  <p className="m-muted">Commanded modes · Tap H1 / H2 for readings. Segment alerts are separate from HVAC faults.</p>
  <div className="m-hvac-legend">{[['cooling','Cooling'],['heating','Heating'],['idle','Idle'],['fault','Fault'],['unavailable','Stale / unavailable'],['unknown','Unknown']].map(([key,label])=><span key={key}><i className={key}/>{label}</span>)}</div>
  {(!data||data.error)&&<p className="m-notice">{data?.error??'HVAC detail has not been supplied by the preview server yet.'}</p>}
  {!units.length&&!data?.error&&<p className="m-notice">No mapped HVAC units reported. This does not mean the site is fault-free.</p>}
  {arrays.filter(a=>chosen==='all'||a===Number(chosen)).map(a=>{
   const rows=units.filter(u=>u.array===a),segments=[...new Set(rows.map(u=>u.segment))];
   return <section key={a} className="m-card m-hvac-array"><h3>Array {a}</h3><div className="m-hvac-segments">{segments.map(segment=>{
    const pair=rows.filter(u=>u.segment===segment),alerts=[...new Set(pair.flatMap(u=>u.controllerAlerts??[]))];
    return <div className="m-hvac-segment" key={segment}><strong>{segment}</strong><div className="m-hvac-pair">{pair.map(u=><button key={u.id} className={'m-hvac-unit '+tone(u)} onClick={()=>setInspected(u.id)} aria-label={`${u.label}: ${u.quality}, ${u.mode}${u.faults.length?', faults reported':''}. View details`}><b>H{u.unit}</b><span>{u.quality==='Live'?u.mode:u.quality}</span>{!!u.faults.length&&<small>⚠ {u.faults.length}</small>}</button>)}</div>{!!alerts.length&&<details className="m-segment-alerts"><summary aria-label={`Array ${a} ${segment}: ${alerts.length} segment alerts`}>⚠ {alerts.length} segment</summary><div>{alerts.map((alert,i)=><p key={i}>{alert}</p>)}</div></details>}</div>;
   })}</div></section>;
  })}
  {inspected&&<HvacDetails unit={units.find(u=>u.id===inspected)} onClose={()=>setInspected(null)}/>}
 </section>;
}
