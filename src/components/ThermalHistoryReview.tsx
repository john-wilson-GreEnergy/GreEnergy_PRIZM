import React,{useEffect,useState} from "react";
import type {HistoryFilters} from "../server/thermal/historyReview";
import {thermalMetrics,type ThermalMetric} from "../server/thermal/thermalMetrics";
type Props={filters:HistoryFilters;onApply:(f:HistoryFilters)=>void;metric:ThermalMetric;error?:string};
const localTime=(at?:number)=>{if(at===undefined)return "";const d=new Date(at);return new Date(at-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
export default function ThermalHistoryReview({filters,onApply,metric,error}:Props){
  const [minimum,setMinimum]=useState(""),[maximum,setMaximum]=useState(""),[mode,setMode]=useState("all"),[quality,setQuality]=useState("all"),[faults,setFaults]=useState("all"),[from,setFrom]=useState(""),[to,setTo]=useState(""),[formError,setFormError]=useState("");
  useEffect(()=>{setMinimum(filters.minimum===undefined?"":String(filters.minimum));setMaximum(filters.maximum===undefined?"":String(filters.maximum));setMode(filters.mode||"all");setQuality(filters.quality||"all");setFaults(filters.faults||"all");setFrom(localTime(filters.from));setTo(localTime(filters.to));},[filters]);
  const apply=()=>{const min=minimum===""?undefined:Number(minimum),max=maximum===""?undefined:Number(maximum),start=from?new Date(from).getTime():undefined,end=to?new Date(to).getTime():undefined;
    if([min,max,start,end].some(n=>n!==undefined&&!Number.isFinite(n))||min!==undefined&&max!==undefined&&min>max||start!==undefined&&end!==undefined&&start>end){setFormError("Minimum/start must not exceed maximum/end.");return;}
    setFormError("");onApply({minimum:min,maximum:max,mode,quality,faults,from:start,to:end});
  };
  const input="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs";
  return <details aria-label="History review controls" className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
    <summary className="cursor-pointer text-xs font-semibold">Advanced history filters · dates, values, mode and quality</summary>
    <div className="mt-3 flex flex-wrap items-end gap-3 text-xs">
      <label>From (local time)<input aria-label="History start time" type="datetime-local" className={`${input} mt-1 block`} value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To (local time)<input aria-label="History end time" type="datetime-local" className={`${input} mt-1 block`} value={to} onChange={e=>setTo(e.target.value)}/></label>
      <label>Minimum ({thermalMetrics[metric].unit})<input aria-label="History minimum" type="number" step="any" className={`${input} mt-1 block w-24`} value={minimum} onChange={e=>setMinimum(e.target.value)}/></label><label>Maximum ({thermalMetrics[metric].unit})<input aria-label="History maximum" type="number" step="any" className={`${input} mt-1 block w-24`} value={maximum} onChange={e=>setMaximum(e.target.value)}/></label>
      <label>Recorded mode<select aria-label="History operating mode" className={`${input} mt-1 block`} value={mode} onChange={e=>setMode(e.target.value)}>{["all","Heating","Cooling","Idle","Unknown"].map(v=><option key={v} value={v}>{v==="all"?"All modes":v}</option>)}</select></label>
      <label>Recorded quality<select aria-label="History quality" className={`${input} mt-1 block`} value={quality} onChange={e=>setQuality(e.target.value)}>{["all","Live","Stale","Unavailable"].map(v=><option key={v} value={v}>{v==="all"?"All quality states":v}</option>)}</select></label>
      <label>Recorded faults<select aria-label="History fault filter" className={`${input} mt-1 block`} value={faults} onChange={e=>setFaults(e.target.value)}><option value="all">All observations</option><option value="with">With faults</option><option value="without">Without faults</option></select></label>
      <button className="rounded bg-sky-800 px-3 py-2 font-semibold text-white" onClick={apply}>Apply history filters</button><button className={input} onClick={()=>{onApply({});setFormError("");}}>Reset history filters</button>
    </div>
    <p className="mt-2 text-xs text-slate-500">Blank dates use the selected time window. Filtered observations break graph lines. Stale/missing measurements never match numeric bounds. Target-list filters only help find devices; they do not change recorded observations.</p>
    {(formError||error)&&<p role="alert" className="mt-2 text-xs text-red-800">{formError||error}</p>}
  </details>;
}
