import React, {useMemo, useState, useEffect} from "react";
import type {ThermalUnit} from "../server/thermal/thermalModel";
import type {HistoryDevice} from "../server/thermal/historyReview";
import {thermalMetrics, type ThermalMetric, type ThermalReadings} from "../server/thermal/thermalMetrics";
import type {TargetResult} from "../server/thermal/thermalTargets";
import type {TargetFilters} from "./thermalSavedViewState";

type Unit=ThermalUnit & {readings:ThermalReadings};
type Props={
  devices:HistoryDevice[]; units:Unit[]; metric:ThermalMetric; selected:string[];
  onMetricChange:(metric:ThermalMetric)=>void;
  restoreFilters?:TargetFilters; onFiltersChange?:(filters:TargetFilters)=>void;
  onSelection:(ids:string[])=>void; onInspect:(id:string)=>void;
  open:boolean; onOpenChange:(open:boolean)=>void; findTarget:string|null; error?:string;
};
const control="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 disabled:opacity-40";
export default function ThermalResults({devices,units,metric,onMetricChange,restoreFilters,onFiltersChange,selected,onSelection,onInspect,open,onOpenChange,findTarget,error}:Props){
  const [search,setSearch]=useState(""),[array,setArray]=useState("all"),[unit,setUnit]=useState("all");
  const [status,setStatus]=useState("all"),[sort,setSort]=useState("topology"),[page,setPage]=useState(0);
  const [segmentType,setSegmentType]=useState("all"),[topPerArray,setTopPerArray]=useState("0");
  useEffect(()=>{if(!restoreFilters)return;setSearch(restoreFilters.search);setArray(restoreFilters.array);setUnit(restoreFilters.unit);setStatus(restoreFilters.status);setSort(restoreFilters.sort);setSegmentType(restoreFilters.segmentType);setTopPerArray(restoreFilters.topPerArray);setPage(0);},[restoreFilters]);
  useEffect(()=>{onFiltersChange?.({search,array,unit,status,sort,segmentType,topPerArray});},[search,array,unit,status,sort,segmentType,topPerArray,onFiltersChange]);
  const [result,setResult]=useState<TargetResult|null>(null),[queryError,setQueryError]=useState(""),[loading,setLoading]=useState(false);
  const queryKey=JSON.stringify({metric,array,unit,segmentType,search,status,sort,topPerArray:Number(topPerArray),selected});
  const [resultKey,setResultKey]=useState("");
  const pending=loading||queryKey!==resultKey;
  // Follow the existing shared refresh signal; query cached telemetry only.
  useEffect(()=>{if(!open)return;const controller=new AbortController();
    const timer=setTimeout(async()=>{setLoading(true);try{
      const response=await fetch("/api/local/site-data/thermal/targets/query",{method:"POST",headers:{"Content-Type":"application/json"},body:queryKey,signal:controller.signal});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Target query failed");
      if(!controller.signal.aborted){setResult(data);setResultKey(queryKey);setQueryError("");}
    }catch(e){if(!controller.signal.aborted)setQueryError(String(e));}finally{if(!controller.signal.aborted)setLoading(false);}},200);
    return()=>{clearTimeout(timer);controller.abort();};
  },[open,queryKey,units]);
  const live=useMemo(()=>new Map((result?.units||[]).map(u=>[u.id,u])),[result]);
  useEffect(()=>{if(findTarget){setSearch(findTarget);setArray("all");setUnit("all");setStatus("all");setSegmentType("all");setTopPerArray("0");setPage(0);}},[findTarget]);
  const shown=queryKey===resultKey?result?.devices||[]:[];
  const pages=Math.max(1,Math.ceil(shown.length/12)),currentPage=Math.min(page,pages-1);
  const rows=shown.slice(currentPage*12,(currentPage+1)*12);
  const selectedDevices=devices.filter(d=>selected.includes(d.id));
  const setFilter=(setter:(value:string)=>void,value:string)=>{setter(value);setPage(0);};
  const shownIds=new Set(shown.map(d=>d.id));
  return <section aria-label="Thermal targets" className="rounded-xl border border-sky-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div><h2 className="text-sm font-bold">Targets <span className="ml-2 rounded-full bg-sky-100 px-2 py-1 text-sky-900">{selected.length} selected</span></h2>
      <p className="mt-2 text-xs text-slate-500">{new Set(selectedDevices.map(d=>d.array)).size} arrays · {new Set(selectedDevices.map(d=>`${d.array}:${d.segment}`)).size} segments · selection applies to trends and targeted recording</p></div>
      <div className="flex flex-wrap items-center gap-3"><label className="text-xs font-semibold">Targets &amp; trends metric <select aria-label="Targets and trends metric" className={control} value={metric} onChange={e=>{setPage(0);onMetricChange(e.target.value as ThermalMetric);}}>{Object.entries(thermalMetrics).map(([key,definition])=><option key={key} value={key}>{definition.label} ({definition.unit})</option>)}</select></label><button className={control} aria-expanded={open} aria-controls="thermal-target-list" onClick={()=>onOpenChange(!open)}>{open?"Done selecting":"Choose targets"}</button></div>
    </div>
    <p className="px-4 pb-3 text-xs text-slate-500">This metric controls target readings, highest-per-array rankings and trends. It does not change the overhead map or selected targets.</p>
    {open&&<div id="thermal-target-list" className="border-t border-slate-200 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="Search targets" className={control} placeholder="Array, segment, HVAC or IP" value={search} onChange={e=>setFilter(setSearch,e.target.value)}/>
        <select aria-label="Target array" className={control} value={array} onChange={e=>setFilter(setArray,e.target.value)}><option value="all">All arrays</option>{[...new Set(devices.map(d=>d.array))].sort((a,b)=>a-b).map(a=><option key={a} value={a}>Array {a}</option>)}</select>
        <select aria-label="Target segment type" className={control} value={segmentType} onChange={e=>setFilter(setSegmentType,e.target.value)}><option value="all">All segment types</option><option value="CS">Collection segments only</option><option value="ES">Energy segments only</option></select>
        <select aria-label="Target HVAC unit" className={control} value={unit} onChange={e=>setFilter(setUnit,e.target.value)}><option value="all">Both HVAC units</option><option value="1">HVAC 1</option><option value="2">HVAC 2</option></select>
        <select aria-label="Target status" className={control} value={status} onChange={e=>setFilter(setStatus,e.target.value)}><option value="all">All devices</option><option value="selected">Selected only</option><option value="faults">Reported faults</option><option value="stale">Stale / unavailable</option></select>
        <select aria-label="Target order" className={control} disabled={topPerArray!=="0"} value={sort} onChange={e=>setFilter(setSort,e.target.value)}><option value="topology">Topology order</option><option value="descending">Highest reading first</option><option value="ascending">Lowest reading first</option></select>
        <label className="text-xs">Per-array outliers <select aria-label="Highest per array" className={control} value={topPerArray} onChange={e=>setFilter(setTopPerArray,e.target.value)}><option value="0">Show all matches</option><option value="1">Highest 1 per array</option><option value="3">Highest 3 per array</option><option value="5">Highest 5 per array</option></select></label>
        <button className={control} onClick={()=>{setSearch("");setArray("all");setUnit("all");setStatus("all");setSegmentType("all");setTopPerArray("0");setPage(0);}}>Reset filters</button>
      </div>
      <div className="my-3 flex flex-wrap items-center gap-2 text-xs">
        <button className={control} disabled={pending||!!queryError||!shown.length} onClick={()=>onSelection([...new Set([...selected,...shown.map(d=>d.id)])])}>Add matching ({shown.length})</button>
        <button className={control} disabled={pending||!!queryError||!selected.some(id=>shownIds.has(id))} onClick={()=>onSelection(selected.filter(id=>!shownIds.has(id)))}>Remove matching</button>
        <button className={control} disabled={!selected.length} onClick={()=>onSelection([])}>Clear selection</button>
        <span className="text-slate-500">Bulk actions include all matching pages. More than 8 targets opens retained history; traces display in groups of 16.</span>
      </div>
      <p className="mb-3 text-xs text-slate-500">Collection segments have no cells: cell temperature and cell temperature rate are not applicable, including in retained history.</p>
      {topPerArray!=="0"&&result&&<p role="status" className="mb-3 text-xs text-sky-800">Highest {topPerArray} {result.rankBy==="unit"?"HVAC units":"segments"} per array by {thermalMetrics[metric].label.toLowerCase()}, within these filters. Shared temperatures rank once per segment; matching HVAC rows stay together. {result.excludedCount} stale, missing or inapplicable readings excluded. Ties use segment / unit order. Selection stays fixed when ranks change.</p>}
      {pending&&<p className="mb-2 text-xs">Updating target list…</p>}
      {(queryError||error||result?.warning)&&<p role="alert" className="mb-3 text-xs text-amber-800">{queryError||error||result?.warning}</p>}
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="bg-slate-50 text-slate-600"><tr>{["Select","Equipment",thermalMetrics[metric].label,"Mode","Current","Reading state","Faults",""].map((title,i)=><th key={i} className="p-2">{title}</th>)}</tr></thead>
      <tbody>{rows.map(device=>{const current=live.get(device.id),reading=current?.readings[metric];return <tr key={device.id} className={`border-t border-slate-100 ${selected.includes(device.id)?"bg-sky-50":""}`}>
        <td className="p-2"><input type="checkbox" disabled={pending||!!queryError} aria-label={`Select ${device.label}`} checked={selected.includes(device.id)} onChange={e=>onSelection(e.target.checked?[...selected,device.id]:selected.filter(id=>id!==device.id))}/></td>
        <td className="p-2"><span className="font-semibold">{result?.ranks[device.id]&&<span className="mr-2 rounded bg-sky-100 px-1.5 text-sky-900">#{result.ranks[device.id]}</span>}{device.label}</span><span className="block text-slate-500">{device.ip}</span></td>
        <td className="p-2 font-semibold tabular-nums">{reading?.text||"No current reading"}</td><td className="p-2">{current?.point.mode||"—"}</td><td className="p-2 tabular-nums">{current?.readings.current.text||"—"}</td>
        <td className="p-2"><span className={reading?.state==="Live"?"text-emerald-700":"text-amber-800"}>{reading?.state||"Recorded device"}</span>{current&&<span className="block text-[10px] text-slate-500">{new Date(current.point.at).toLocaleTimeString()}</span>}</td>
        <td className="max-w-48 p-2 text-amber-900">{current?current.faults.join("; ")||"None reported":"Unknown"}</td>
        <td className="p-2"><button className={control} disabled={!current} aria-label={`Inspect ${device.label}`} onClick={()=>onInspect(device.id)}>Inspect</button></td>
      </tr>;})}</tbody></table></div>
      {!pending&&!shown.length&&<p className="p-4 text-sm text-slate-500">No eligible targets match these filters. Existing selections are preserved.</p>}
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500"><span>{shown.length} matching · page {currentPage+1} of {pages}</span><div className="flex gap-2"><button className={control} disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Previous targets</button><button className={control} disabled={currentPage>=pages-1} onClick={()=>setPage(currentPage+1)}>Next targets</button></div></div>
    </div>}
  </section>;
}
