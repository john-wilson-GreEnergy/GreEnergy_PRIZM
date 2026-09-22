import React,{useEffect,useState} from "react";
import {defaultTargetFilters,parseSavedViews,type SavedThermalView,type ThermalSavedState,type TargetFilters} from "./thermalSavedViewState";
import type {ThermalMetric} from "../server/thermal/thermalMetrics";
type Props={siteKey:string|null;state:ThermalSavedState;onApply:(state:ThermalSavedState)=>void;onPreset:(metric:ThermalMetric,filters:TargetFilters)=>void};
const button="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-40";
export default function ThermalSavedViews({siteKey,state,onApply,onPreset}:Props){
  const [views,setViews]=useState<SavedThermalView[]>([]),[name,setName]=useState(""),[message,setMessage]=useState("");
  const key=siteKey?`prizm-thermal-views-v1:${siteKey}`:null;
  useEffect(()=>{setViews([]);setName("");setMessage("");if(key)try{setViews(parseSavedViews(localStorage.getItem(key)));}catch{setMessage("Browser storage unavailable; saved views cannot be loaded.");}},[key]);
  const save=()=>{if(!key||!name.trim())return;try{
    const next=[...views.filter(v=>v.name!==name.trim()),{name:name.trim(),state}];
    if(next.length>20){setMessage("20 saved views maximum. Reuse a name to update an existing view.");return;}
    localStorage.setItem(key,JSON.stringify({version:1,views:next}));setViews(next);setMessage(`Saved “${name.trim()}” in this browser for this site.`);
  }catch{setMessage("Unable to save: browser storage is unavailable or full.");}};
  return <details className="rounded-xl border border-slate-200 bg-white p-4 text-xs" aria-label="Saved thermal views"><summary className="cursor-pointer font-semibold">Saved views & quick filters</summary>
    <p className="my-3">Views restore targets, filters, both metrics, time range and hidden overlays. They never start, stop or modify recording. Stored only in this browser, separately for each site.</p>
    <div className="flex flex-wrap gap-2"><button className={button} onClick={()=>onPreset("current",{...defaultTargetFilters,topPerArray:"1"})}>Highest amperage per array</button><button className={button} onClick={()=>onPreset("cell",{...defaultTargetFilters,segmentType:"ES",topPerArray:"1"})}>Hottest energy segments</button><button className={button} onClick={()=>onPreset("space",{...defaultTargetFilters,segmentType:"CS"})}>Collection segments</button></div>
    <p className="my-2 text-slate-500">Quick filters open matching targets; use Add matching to include them in your graph. Existing selections and the overhead map stay unchanged.</p>
    <div className="my-3 flex flex-wrap gap-2"><input aria-label="Saved view name" className="rounded border p-2" maxLength={60} placeholder="Name this view" value={name} onChange={e=>setName(e.target.value)}/><button className={button} disabled={!key||!name.trim()} onClick={save}>{views.some(v=>v.name===name.trim())?"Update saved view":"Save current view"}</button></div>
    {!key&&<p>Waiting for site identity before loading or saving views.</p>}
    <div className="flex flex-wrap gap-2">{views.map(view=><button key={view.name} className={button} onClick={()=>{onApply(view.state);setName(view.name);setMessage(`Loaded “${view.name}”. Saved targets stay fixed; missing data is not replaced with other devices.`);}}>Load {view.name}</button>)}</div>
    {message&&<p role="status" className="mt-2">{message}</p>}
  </details>;
}
