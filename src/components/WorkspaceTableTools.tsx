import React from 'react';
import {usePresentation} from '../lib/workspacePreferences';

export function TableDensity(){const [density,setDensity]=usePresentation('table-density','compact');return <label className="ops-density">Row spacing<select aria-label="Row spacing" value={density} onChange={e=>setDensity(e.target.value)}><option value="compact">Compact</option><option value="comfortable">Comfortable</option></select></label>;}
export function TableDisplay({kind}:{kind:'pcs'|'strings'}){
  const [electrical,setElectrical]=usePresentation(`${kind}-show-electrical`,true);
  const [extra,setExtra]=usePresentation(`${kind}-show-extra`,true);
  return <details className="ops-display"><summary>Display columns</summary><div><label><input type="checkbox" checked={electrical} onChange={e=>setElectrical(e.target.checked)}/> {kind==='pcs'?'DC / AC volts and amps':'String volts and amp-hours'}</label><label><input type="checkbox" checked={extra} onChange={e=>setExtra(e.target.checked)}/> {kind==='pcs'?'Reactive power and frequency':'Location and fan details'}</label><small>Identity, status and core operating values stay visible.</small></div></details>;
}
export function EquipmentToolbar({query,onQuery,array,onArray,arrays,count,onReset}:{query:string;onQuery:(v:string)=>void;array:string;onArray:(v:string)=>void;arrays:number[];count:number;onReset:()=>void}){
  return <div className="ops-equipment-toolbar"><label>Find equipment<input aria-label="Find equipment" placeholder="Search array, PCS or state…" value={query} onChange={e=>onQuery(e.target.value)}/></label><label>Array<select aria-label="Equipment array" value={array} onChange={e=>onArray(e.target.value)}><option value="all">All arrays</option>{arrays.map(a=><option key={a} value={a}>Array {a}</option>)}</select></label><span>{count} matching units</span><TableDisplay kind="pcs"/><TableDensity/><button className="ops-reset" onClick={onReset}>Reset filters</button></div>;
}
