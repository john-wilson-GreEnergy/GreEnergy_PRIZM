import React,{useMemo} from "react";
import type {ThermalMetric,ThermalDisplayValues} from "../server/thermal/thermalMetrics";
import {thermalMetrics} from "../server/thermal/thermalMetrics";
import type {ThermalPoint} from "../server/thermal/thermalModel";
type Sample={id:string;point:ThermalPoint;displayValues:ThermalDisplayValues;excluded?:boolean};
type Props={at:number;points:Sample[];selected:string[];metric:ThermalMetric;highlighted:string|null;label:(id:string)=>string;onChoose:(id:string)=>void;onClose:()=>void;isolated:boolean;onIsolate:(value:boolean)=>void};
export default function ThermalPointInspector({at,points,selected,metric,highlighted,label,onChoose,onClose,isolated,onIsolate}:Props){
  const groups=useMemo(()=>{
    const nearest=new Map<string,Sample>();
    for(const sample of points){const previous=nearest.get(sample.id);if(!previous||Math.abs(sample.point.at-at)<Math.abs(previous.point.at-at))nearest.set(sample.id,sample);}
    const result=new Map<string,{id:string;sample?:Sample}[]>();
    for(const id of selected){const sample=nearest.get(id),value=sample?.displayValues?.[metric];const key=sample&&!sample.excluded&&sample.point.quality==="Live"&&typeof value==="number"&&Number.isFinite(value)?`${value.toFixed(metric==="cellRate"?2:1)} ${thermalMetrics[metric].unit}`:"No valid reading";result.set(key,[...(result.get(key)||[]),{id,sample}]);}
    return [...result.entries()].sort(([a],[b])=>{
      if(a==="No valid reading")return b==="No valid reading"?0:1;
      if(b==="No valid reading")return -1;
      return Number.parseFloat(b)-Number.parseFloat(a);
    });
  },[at,points,selected,metric]);
  const order=groups.flatMap(([,rows])=>rows.map(r=>r.id));
  const step=(direction:number)=>{if(!order.length)return;const index=highlighted?order.indexOf(highlighted):-1;onChoose(order[(index+direction+order.length)%order.length]);};
  return <section aria-label="Devices at this point" tabIndex={0} onKeyDown={event=>{if(event.target!==event.currentTarget)return;if(event.key==="ArrowRight"||event.key==="ArrowLeft"){event.preventDefault();step(event.key==="ArrowRight"?1:-1);}}} className="my-3 rounded border border-sky-300 bg-sky-50 p-3 text-xs">
    <div className="flex flex-wrap items-center gap-3"><h3 className="font-bold">Devices at this point · {new Date(at).toLocaleString()}</h3><button onClick={()=>step(-1)}>Previous device</button><button onClick={()=>step(1)}>Next device</button><label><input type="checkbox" checked={isolated} disabled={!highlighted} onChange={e=>onIsolate(e.target.checked)}/> Show only this device</label><button onClick={onClose}>Unpin point</button></div>
    <p className="my-2">Closest returned observation per device, grouped by displayed value. Observation times below may differ from the pinned time, especially in summarized history. No interpolation. Focus this panel and use left/right arrow keys to switch devices.</p>
    <div className="max-h-64 space-y-2 overflow-auto">{groups.map(([value,rows])=><div key={value}><h4 className="font-semibold">{value} · {rows.length} devices</h4><div className="flex flex-wrap gap-1">{rows.map(({id,sample})=><button key={id} aria-pressed={highlighted===id} onClick={()=>onChoose(id)} className={`rounded border px-2 py-1 text-left ${highlighted===id?"border-sky-800 bg-sky-800 text-white":"border-slate-300 bg-white"}`}><span>{label(id)}</span><span className="block">{sample?new Date(sample.point.at).toLocaleString():"No observation in this range"}</span></button>)}</div></div>)}</div>
  </section>;
}
