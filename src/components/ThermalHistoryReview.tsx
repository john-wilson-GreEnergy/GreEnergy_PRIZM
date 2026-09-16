import React,{useEffect,useMemo,useState} from "react";
import type {HistoryDevice,HistoryFilters} from "../server/thermal/historyReview";
import {thermalMetrics,type ThermalMetric} from "../server/thermal/thermalMetrics";
type Props={devices:HistoryDevice[];selected:string[];onSelection:(ids:string[])=>void;filters:HistoryFilters;onApply:(f:HistoryFilters)=>void;metric:ThermalMetric;error?:string};
const localTime=(at?:number)=>{if(at===undefined)return "";const d=new Date(at);return new Date(at-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
export default function ThermalHistoryReview({devices,selected,onSelection,filters,onApply,metric,error}:Props){
  const [search,setSearch]=useState(""),[array,setArray]=useState("all"),[unit,setUnit]=useState("all"),[selectedOnly,setSelectedOnly]=useState(false);
  const [minimum,setMinimum]=useState(""),[maximum,setMaximum]=useState(""),[mode,setMode]=useState("all"),[quality,setQuality]=useState("all"),[faults,setFaults]=useState("all"),[from,setFrom]=useState(""),[to,setTo]=useState(""),[formError,setFormError]=useState("");
  useEffect(()=>{setMinimum(filters.minimum===undefined?"":String(filters.minimum));setMaximum(filters.maximum===undefined?"":String(filters.maximum));setMode(filters.mode||"all");setQuality(filters.quality||"all");setFaults(filters.faults||"all");setFrom(localTime(filters.from));setTo(localTime(filters.to));},[filters]);
  const shown=useMemo(()=>devices.filter(d=>(array==="all"||d.array===Number(array))&&(unit==="all"||d.unit===Number(unit))&&(!selectedOnly||selected.includes(d.id))&&`${d.label} ${d.ip}`.toLowerCase().includes(search.toLowerCase())),[devices,array,unit,selectedOnly,selected,search]);
  const apply=()=>{const min=minimum===""?undefined:Number(minimum),max=maximum===""?undefined:Number(maximum),start=from?new Date(from).getTime():undefined,end=to?new Date(to).getTime():undefined;
    if([min,max,start,end].some(n=>n!==undefined&&!Number.isFinite(n))||min!==undefined&&max!==undefined&&min>max||start!==undefined&&end!==undefined&&start>end){setFormError("Minimum/start must not exceed maximum/end.");return;}
    setFormError("");onApply({minimum:min,maximum:max,mode,quality,faults,from:start,to:end});
  };
  const input="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs";
  return <div aria-label="History review controls" className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
    <h3 className="text-sm font-bold">Devices and recorded-data filters</h3><p className="mt-1 text-xs text-slate-600">Check individual H1/H2 devices, or use a segment tile to add both. Select entire arrays or the whole site; selections above 8 open retained history. These controls change the review only; whole-site recording continues.</p>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input aria-label="Find history devices" className={input} placeholder="Find segment, device or IP" value={search} onChange={e=>setSearch(e.target.value)}/>
      <select aria-label="History device array" className={input} value={array} onChange={e=>setArray(e.target.value)}><option value="all">All arrays</option>{[...new Set(devices.map(d=>d.array))].map(a=><option key={a} value={a}>Array {a}</option>)}</select>
      <select aria-label="History HVAC unit" className={input} value={unit} onChange={e=>setUnit(e.target.value)}><option value="all">H1 and H2</option><option value="1">HVAC 1</option><option value="2">HVAC 2</option></select>
      <label className="text-xs"><input type="checkbox" checked={selectedOnly} onChange={e=>setSelectedOnly(e.target.checked)}/> Selected devices only</label>
      <button className={input} onClick={()=>onSelection(devices.map(d=>d.id))}>Select whole site</button><button className={input} disabled={array==="all"} onClick={()=>onSelection(devices.filter(d=>d.array===Number(array)).map(d=>d.id))}>Select entire array</button><button className={input} onClick={()=>onSelection([...new Set([...selected,...shown.map(d=>d.id)])])}>Add shown devices</button><button className={input} onClick={()=>onSelection(selected.filter(id=>!shown.some(d=>d.id===id)))}>Remove shown devices</button><button className={input} onClick={()=>onSelection([])}>Clear devices</button>
    </div>
    <div className="mt-2 grid max-h-44 gap-1 overflow-auto sm:grid-cols-2 lg:grid-cols-3">{shown.map(d=><label key={d.id} className={`flex items-start gap-2 rounded border p-2 text-xs ${selected.includes(d.id)?"border-sky-600 bg-sky-50":"border-slate-200 bg-white"}`}><input aria-label={`Graph device ${d.label}`} type="checkbox" checked={selected.includes(d.id)} onChange={e=>onSelection(e.target.checked?[...selected,d.id]:selected.filter(id=>id!==d.id))}/><span>{d.label}<span className="block text-slate-500">{d.ip}</span></span></label>)}</div>
    <p className="mt-2 text-xs">{selected.length} selected · {shown.length} shown{!shown.length?" · No devices match this search":""}</p>
    <div className="mt-3 flex flex-wrap items-end gap-3 text-xs">
      <label>From (local time)<input aria-label="History start time" type="datetime-local" className={`${input} mt-1 block`} value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To (local time)<input aria-label="History end time" type="datetime-local" className={`${input} mt-1 block`} value={to} onChange={e=>setTo(e.target.value)}/></label>
      <label>Minimum ({thermalMetrics[metric].unit})<input aria-label="History minimum" type="number" step="any" className={`${input} mt-1 block w-24`} value={minimum} onChange={e=>setMinimum(e.target.value)}/></label><label>Maximum ({thermalMetrics[metric].unit})<input aria-label="History maximum" type="number" step="any" className={`${input} mt-1 block w-24`} value={maximum} onChange={e=>setMaximum(e.target.value)}/></label>
      <label>Recorded mode<select aria-label="History operating mode" className={`${input} mt-1 block`} value={mode} onChange={e=>setMode(e.target.value)}>{["all","Heating","Cooling","Idle","Unknown"].map(v=><option key={v} value={v}>{v==="all"?"All modes":v}</option>)}</select></label>
      <label>Recorded quality<select aria-label="History quality" className={`${input} mt-1 block`} value={quality} onChange={e=>setQuality(e.target.value)}>{["all","Live","Stale","Unavailable"].map(v=><option key={v} value={v}>{v==="all"?"All quality states":v}</option>)}</select></label>
      <label>Recorded faults<select aria-label="History fault filter" className={`${input} mt-1 block`} value={faults} onChange={e=>setFaults(e.target.value)}><option value="all">All observations</option><option value="with">With faults</option><option value="without">Without faults</option></select></label>
      <button className="rounded bg-sky-800 px-3 py-2 font-semibold text-white" onClick={apply}>Apply history filters</button><button className={input} onClick={()=>{onApply({});setFormError("");}}>Reset history filters</button>
    </div>
    <p className="mt-2 text-xs text-slate-500">Blank dates use the selected time window. Filtered observations break graph lines. Stale/missing measurements never match numeric bounds. Current-reading filters above do not filter this history.</p>
    {(formError||error)&&<p role="alert" className="mt-2 text-xs text-red-800">{formError||error}</p>}
  </div>;
}
