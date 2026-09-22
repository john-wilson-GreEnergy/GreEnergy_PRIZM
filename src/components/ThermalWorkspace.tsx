import React, { useEffect, useMemo, useState } from "react";
import { Wind, Circle, Download } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import ThermalTraceLegend from "./ThermalTraceLegend";
import ThermalComparison from "./ThermalComparison";
import ThermalCommandBands from "./ThermalCommandBands";
import ThermalSavedViews from "./ThermalSavedViews";
import {defaultTargetFilters,type TargetFilters,type ThermalSavedState} from "./thermalSavedViewState";
import {indexReviewSamples} from "./thermalReviewIndex";
import type {ReviewReading} from "../server/thermal/thermalReviewPresentation";
import {allTracesVisible,traceIsVisible,toggleTrace,retainTraceVisibility} from "./thermalTraceVisibility";
import { useSiteData } from "../context/SiteDataContext";
import type { ThermalUnit, ThermalPoint } from "../server/thermal/thermalModel";

import { thermalMetrics, type ThermalMetric, type ThermalReadings, type ThermalDisplayValues } from "../server/thermal/thermalMetrics";
import ThermalResults from "./ThermalResults";
import ThermalSiteOverview from "./ThermalSiteOverview";
import type {SiteStorageStatus} from "../server/thermal/siteHistory";
import ThermalHistoryReview from "./ThermalHistoryReview";
import ThermalHistoryTable from "./ThermalHistoryTable";
import type {HistoryDevice,HistoryFilters} from "../server/thermal/historyReview";
import ThermalPointInspector from "./ThermalPointInspector";
import ThermalStorageModal from "./ThermalStorageModal";
type Unit = ThermalUnit & { response:string; readings:ThermalReadings };
type Recording = { id:string; targets:string[]; labels:string[]; state:string; startedAt:number; endsAt:number; samples:number; error?:string };
type View = { reviewVersion?:number; siteStorage?:SiteStorageStatus; units:Unit[]; sessions:Recording[]; error:string|null };
type Point = {id:string;point:ThermalPoint;displayValues:ThermalDisplayValues;excluded?:boolean;review?:ReviewReading};
const api="/api/local/site-data/thermal";
const traceColors=["#0369a1","#c2410c","#7e22ce","#047857","#be185d","#334155","#a16207","#0e7490"];
const button="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40";
const metricNames=Object.fromEntries(Object.entries(thermalMetrics).map(([key,m])=>[key,`${m.label} (${m.unit})`]));
type Metric = ThermalMetric;
function initialSelection():string[]{try{const value=JSON.parse(localStorage.getItem("prizm-thermal-selection")||"[]");return Array.isArray(value)?value.filter(v=>typeof v==="string").slice(0,2048):[];}catch{return [];}}
async function json(url:string, options?:RequestInit){const r=await fetch(url,options);const d=await r.json();if(!r.ok)throw new Error(d.error||"Thermal request failed");return d;}

export default function ThermalWorkspace(){
  const {lastUpdated,siteIdentity}=useSiteData();
  const [view,setView]=useState<View>({units:[],sessions:[],error:null});
  const [selected,setSelected]=useState<string[]>(initialSelection);
  const [pinnedAt,setPinnedAt]=useState<number|null>(null);
  const [showCommands,setShowCommands]=useState(true);
  const [targetFilters,setTargetFilters]=useState<TargetFilters>(defaultTargetFilters);
  const [restoreTargetFilters,setRestoreTargetFilters]=useState<TargetFilters>();
  const savedSiteKey=siteIdentity?.stationCode&&siteIdentity?.blockIndex!==undefined?JSON.stringify([siteIdentity.activeProfileId,siteIdentity.stationCode,siteIdentity.blockIndex]):null;
  const [traceVisibility,setTraceVisibility]=useState(allTracesVisible);
  const [highlight,setHighlight]=useState<string|null>(null);
  const [tracePage,setTracePage]=useState(0);
  const [targetsOpen,setTargetsOpen]=useState(()=>initialSelection().length===0);
  const [findTarget,setFindTarget]=useState<string|null>(null);
  const [inspected,setInspected]=useState<string|null>(null);
  const [storageOpen,setStorageOpen]=useState(false);
  const [reviewFilters,setReviewFilters]=useState<HistoryFilters>({});
  const [recordedDevices,setRecordedDevices]=useState<HistoryDevice[]>([]);
  const [catalogError,setCatalogError]=useState("");
  const [historyDays,setHistoryDays]=useState(7);
  const [showSiteOverview,setShowSiteOverview]=useState(false);
  const [array,setArray]=useState("all");
  const [metric,setMetric]=useState<Metric>("space");
  const [overheadMetric,setOverheadMetric]=useState<Metric>("space");
  const [mapMode,setMapMode]=useState<"metric"|"mode">("metric");
  const [minutes,setMinutes]=useState(60);
  const [session,setSession]=useState(()=>initialSelection().length>8?"site":"");
  const [points,setPoints]=useState<Point[]>([]);
  const [plottedSelection,setPlottedSelection]=useState<string[]>([]);
  const [plottedMetric,setPlottedMetric]=useState<Metric>("space");
  const [plottedSession,setPlottedSession]=useState("");
  const [plottedFilters,setPlottedFilters]=useState<HistoryFilters>({});
  const [plottedWindow,setPlottedWindow]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(false);
  const [hours,setHours]=useState("1");
  const [revision,setRevision]=useState(0);
  useEffect(()=>{localStorage.setItem("prizm-thermal-selection",JSON.stringify(selected));},[selected]);
  // Cached projections follow the central refresh signal; selection only reloads history.
  useEffect(()=>{const controller=new AbortController();
    json(api,{signal:controller.signal}).then(v=>{
      if(controller.signal.aborted)return;
      if(!Array.isArray(v.units)||v.units.some((u:Unit)=>!u.readings))throw new Error("Restart the PRIZM server to load the updated thermal readings.");
      setView(v);
    })
      .catch(e=>{if(!controller.signal.aborted)setView(v=>({...v,error:e.message}));});
    return()=>controller.abort();
  },[lastUpdated,revision]);
  useEffect(()=>{if(view.reviewVersion!==1)return;const controller=new AbortController();
    json(`${api}/history-devices`,{signal:controller.signal}).then(d=>{if(!controller.signal.aborted){setRecordedDevices(d.devices);setCatalogError("");}}).catch(e=>{if(!controller.signal.aborted)setCatalogError(e.message);});return()=>controller.abort();
  },[revision,view.reviewVersion]);
  const historyMetric=metric;
  // Retained history is disk backed. Refresh it on selection/filter changes or
  // explicit request, rather than re-reading days of shards on every live poll.
  const historyRefresh=session==="site"?null:lastUpdated;

  useEffect(()=>{const controller=new AbortController();const timer=window.setTimeout(()=>{setLoading(true);
    const query=new URLSearchParams({ids:selected.join(","),from:String(session?0:Date.now()-minutes*60000)});
    if(session==="site"){query.set("from",String(Date.now()-historyDays*86400000));query.set("metric",metric);}else if(session)query.set("session",session);
    query.set("metric",metric);
    if(reviewFilters.from!==undefined)query.set("from",String(reviewFilters.from));
    if(reviewFilters.to!==undefined)query.set("to",String(reviewFilters.to));
    for(const key of ["minimum","maximum","mode","quality","faults"] as const){const value=reviewFilters[key];if(value!==undefined)query.set(key,String(value));}
    json(session==="site"?`${api}/site-history/query`:`${api}/history?${query}`,session==="site"?{signal:controller.signal,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...Object.fromEntries(query),ids:selected})}:{signal:controller.signal})
      .then(h=>{if(!controller.signal.aborted){setPoints(h.points);setPlottedSelection(selected);setPlottedMetric(metric);setPlottedSession(session);setPlottedFilters(reviewFilters);setPlottedWindow(`${historyDays}:${minutes}`);setError("");}})
      .catch(e=>{if(!controller.signal.aborted)setError(e.message);})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  },selected.length?200:0);return()=>{window.clearTimeout(timer);controller.abort();};
  },[historyRefresh,selected,minutes,session,revision,historyDays,historyMetric,reviewFilters]);
  const reviewDevices=useMemo(()=>[...new Map([...recordedDevices,...view.units].map(d=>[d.id,d])).values()],[recordedDevices,view.units]);
  const labelFor=(id:string)=>reviewDevices.find(d=>d.id===id)?.label||id;
  const setReviewSelection=(ids:string[])=>{const unique=[...new Set(ids)];if(unique.length>8)setSession("site");setSelected(unique);setTraceVisibility(state=>retainTraceVisibility(state,unique));setTracePage(0);setError("");};
  const inspectedUnit=view.units.find(u=>u.id===inspected);
  const active=view.sessions.find(s=>["Recording","Waiting for data"].includes(s.state));
  const groups=useMemo(()=>{
    const arrays=new Map<number,Map<string,Unit[]>>();
    view.units.filter(u=>array==="all"||u.array===Number(array)).forEach(u=>{
      if(!arrays.has(u.array))arrays.set(u.array,new Map());const segments=arrays.get(u.array)!;
      segments.set(u.segment,[...(segments.get(u.segment)||[]),u]);
    });return [...arrays.entries()];
  },[view.units,array]);
  const changeMetric=(value:Metric)=>{setMetric(value);setPinnedAt(null);setReviewFilters(f=>({...f,minimum:undefined,maximum:undefined}));};
  const savedState:ThermalSavedState={metric,overheadMetric,array,mapMode,selected,targetFilters,reviewFilters,session,minutes,historyDays,visibility:traceVisibility,showCommands,tracePage};
  const applySavedView=(state:ThermalSavedState)=>{
    setMetric(state.metric);setOverheadMetric(state.overheadMetric);setArray(state.array);setMapMode(state.mapMode);
    setReviewSelection(state.selected);setSession(state.selected.length>8&&state.session===""?"site":state.session);
    setReviewFilters(state.reviewFilters);setMinutes(state.minutes);setHistoryDays(state.historyDays);
    setTraceVisibility(retainTraceVisibility(state.visibility,state.selected));setTracePage(state.visibility.only?Math.max(0,Math.floor(state.selected.indexOf(state.visibility.only)/16)):state.tracePage??0);setShowCommands(state.showCommands);
    setTargetFilters(state.targetFilters);setRestoreTargetFilters({...state.targetFilters});setTargetsOpen(true);
    setFindTarget(null);setHighlight(null);setPinnedAt(null);
  };
  const applyPreset=(nextMetric:Metric,filters:TargetFilters)=>{changeMetric(nextMetric);setTargetFilters(filters);setRestoreTargetFilters({...filters});setFindTarget(null);setTargetsOpen(true);};
  const reviewIndex=useMemo(()=>indexReviewSamples(points),[points]);
  const graph=useMemo(()=>{
    const rows=new Map<number,Record<string,number|null>>();
    const set=(at:number,key:string,value:number|null)=>{const r=rows.get(at)||{at};r[key]=value;rows.set(at,r);};
    const selectedIds=new Set(plottedSelection);
    const byDevice=new Map<string,Point[]>();
    for(const item of points){if(!selectedIds.has(item.id))continue;const list=byDevice.get(item.id)||[];list.push(item);byDevice.set(item.id,list);}
    for(const [id,samples] of byDevice){let previous:ThermalPoint|undefined;
      samples.sort((a,b)=>a.point.at-b.point.at).forEach(({point:p,displayValues,excluded})=>{
        if(previous&&plottedSession!=="site"&&p.at-previous.at>120000)set(previous.at+1,id,null);
        set(p.at,id,!excluded&&p.quality==="Live"?(displayValues?.[plottedMetric]??null):null);previous=p;
      });
    }return [...rows.values()].sort((a,b)=>Number(a.at)-Number(b.at));
  },[points,plottedSelection,plottedMetric,plottedSession]);
  const graphDevices=useMemo(()=>new Set(points.filter(p=>!p.excluded&&p.point.quality==="Live"&&typeof p.displayValues?.[plottedMetric]==="number"&&Number.isFinite(p.displayValues[plottedMetric])).map(p=>p.id)),[points,plottedMetric]);
  const traceData=useMemo(()=>{const traces=new Map<string,typeof graph>();for(const id of plottedSelection)traces.set(id,[]);for(const row of graph)for(const id of Object.keys(row)){if(id!=="at")traces.get(id)?.push(row);}return traces;},[graph,plottedSelection]);
  const pendingPlot=loading||metric!==plottedMetric||session!==plottedSession||`${historyDays}:${minutes}`!==plottedWindow||JSON.stringify(reviewFilters)!==JSON.stringify(plottedFilters)||selected.length!==plottedSelection.length||selected.some((id,index)=>id!==plottedSelection[index]);
  const withData=plottedSelection.filter(id=>graphDevices.has(id)).length;
  const highlighted=highlight&&plottedSelection.includes(highlight)?highlight:null;
  const traceOrder=plottedSelection;
  const tracePages=Math.max(1,Math.ceil(traceOrder.length/16));
  const legendTraceIds=traceOrder.slice(Math.min(tracePage,tracePages-1)*16,(Math.min(tracePage,tracePages-1)+1)*16);
  const visibleTraceIds=legendTraceIds.filter(id=>traceIsVisible(traceVisibility,id));
  const restoreOverlays=()=>{setTraceVisibility(allTracesVisible());setHighlight(null);};
  const showOnlyTrace=(id:string)=>{setTraceVisibility(state=>({...state,only:id}));setHighlight(id);setTracePage(Math.max(0,Math.floor(plottedSelection.indexOf(id)/16)));};
  const highlightTrace=(id:string)=>{setHighlight(id);setTracePage(Math.max(0,Math.floor(plottedSelection.indexOf(id)/16)));setTraceVisibility(state=>({...state,hidden:state.hidden.filter(hidden=>hidden!==id),only:state.only?id:null}));};
  const visibleTraceSet=useMemo(()=>new Set(visibleTraceIds),[visibleTraceIds.join("|")]);
  const visibleGraph=useMemo(()=>graph.filter(row=>Object.keys(row).some(key=>key!=="at"&&visibleTraceSet.has(key))),[graph,visibleTraceSet]);
  const traceStats=useMemo(()=>visibleTraceIds.map(id=>{
    const values=(traceData.get(id)||[]).map(row=>row[id]).filter((value):value is number=>typeof value==="number"&&Number.isFinite(value));
    return {id,latest:values.at(-1)??null,min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null};
  }),[traceData,visibleTraceIds.join("|")]);
  const graphSpan=visibleGraph.length>1?Number(visibleGraph[visibleGraph.length-1].at)-Number(visibleGraph[0].at):0;
  const graphTimeLabel=(value:number)=>graphSpan>86400000?new Date(value).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric"}):new Date(value).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"});
  const transitions=useMemo(()=>plottedSelection.flatMap(id=>{
    let previous:ThermalPoint|undefined;const changes:{id:string;point:ThermalPoint;initial:boolean}[]=[];
    points.filter(p=>p.id===id&&!p.excluded).sort((a,b)=>a.point.at-b.point.at).forEach(p=>{
      if(!previous||p.point.mode!==previous.mode||p.point.quality!==previous.quality)changes.push({...p,initial:!previous});previous=p.point;
    });return changes;
  }).sort((a,b)=>b.point.at-a.point.at).slice(0,30),[points,plottedSelection]);
  const inspect=(id:string)=>{setFindTarget(null);setInspected(id);};
  const findInTargets=(id:string)=>{setFindTarget(id);setTargetsOpen(true);setInspected(null);requestAnimationFrame(()=>document.getElementById("thermal-targets")?.scrollIntoView({behavior:"smooth",block:"start"}));};
  const record=async(stopId?:string)=>{setBusy(true);setError("");try{
    await json(stopId?`${api}/recordings/${stopId}/stop`:`${api}/recordings`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({targets:selected,hours:Number(hours)})});
    setRevision(v=>v+1);
  }catch(e){setError(String(e));}finally{setBusy(false);}};
  const exportData=()=>{
    const blob=new Blob([JSON.stringify({units:{pointTemperatures:"°C",pointCellRate:"°C/min",displayTemperatures:"°F",displayCellRate:"°F/min"},devices:reviewDevices.filter(d=>plottedSelection.includes(d.id)).map(({id,label,ip})=>({id,label,ip})),session:plottedSession||null,metric:plottedMetric,filters:plottedFilters,summary:plottedSession==="site",points:points.filter(p=>!p.excluded)},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`prizm-thermal-${plottedSession||"live"}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <div className="space-y-4 p-4 text-slate-800">
    {storageOpen&&<ThermalStorageModal onClose={()=>setStorageOpen(false)} onChanged={()=>setRevision(v=>v+1)}/>}
    {inspectedUnit&&<div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" onClick={()=>setInspected(null)}><aside role="dialog" aria-modal="true" aria-label={`${inspectedUnit.label} details`} className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl" onClick={e=>e.stopPropagation()}><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{inspectedUnit.label}</h2><p className="text-xs text-slate-500">Array {inspectedUnit.array} · {inspectedUnit.segment} · HVAC {inspectedUnit.unit} · {inspectedUnit.ip}</p></div><button className={button} onClick={()=>setInspected(null)}>Close</button></div><p className="mt-5 rounded-lg bg-slate-50 p-3 text-sm">{inspectedUnit.point.mode} · {inspectedUnit.point.quality}<span className="mt-1 block text-xs text-slate-500">Last reading {new Date(inspectedUnit.point.at).toLocaleString()}</span></p><dl className="mt-4 grid grid-cols-2 gap-3 text-sm">{Object.entries(thermalMetrics).map(([key,definition])=><div className="rounded-lg border border-slate-200 p-3" key={key}><dt className="text-xs text-slate-500">{definition.label}</dt><dd className="mt-1 font-bold">{inspectedUnit.readings[key as Metric].text}</dd></div>)}</dl><h3 className="mt-5 text-sm font-bold">Reported faults</h3>{inspectedUnit.faults.length?inspectedUnit.faults.map(fault=><p key={fault} className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-900">{fault}</p>):<p className="mt-2 text-xs text-slate-500">None reported</p>}<button className={`${button} mt-5 w-full`} onClick={()=>findInTargets(inspectedUnit.id)}>Find in target list</button></aside></div>}
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-lg font-bold"><Wind className="text-sky-700"/>Thermal Controls</h1><p className="mt-1 text-xs text-slate-600">Site overview above. Choose targets once below to compare trends and review recordings.</p></div><div className="flex gap-2"><button className={button} onClick={()=>setStorageOpen(true)}>Site history storage</button><button className={button} onClick={()=>setRevision(v=>v+1)}>Refresh view</button></div></div>
      {view.siteStorage?.enabled&&<div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><span className="font-semibold">Whole-site recording: {view.siteStorage.pausedReason?`Paused — ${view.siteStorage.pausedReason}`:`enabled · ${view.siteStorage.retentionDays}-day rolling retention · ${(view.siteStorage.usedBytes/1024**3).toFixed(2)} GiB saved`}</span><button className="font-semibold text-sky-800 underline" onClick={()=>setStorageOpen(true)}>Change retention</button></div>}
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
        <strong>Site overhead</strong>
        <label>Show <select aria-label="Overhead array" className={button} value={array} onChange={e=>setArray(e.target.value)}><option value="all">All arrays</option>{[...new Set(view.units.map(u=>u.array))].map(a=><option key={a} value={a}>Array {a}</option>)}</select></label>
        <label>Overhead metric <select aria-label="Overhead metric" className={button} value={overheadMetric} onChange={e=>setOverheadMetric(e.target.value as Metric)}>{Object.entries(metricNames).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label>Map colors <select className={button} value={mapMode} onChange={e=>setMapMode(e.target.value as "metric"|"mode")}><option value="metric">Selected metric</option><option value="mode">Operating mode</option></select></label>
        <label><input type="checkbox" checked={showSiteOverview} onChange={e=>setShowSiteOverview(e.target.checked)}/> Outlier overview</label>
        <span className="text-slate-500">Click a segment to inspect its readings.</span>
      </div>
      <p className="mt-3 text-xs text-slate-600">{mapMode==="mode"?"Grey: idle · red: heating · blue: cooling · yellow: fault":overheadMetric==="space"?"Enclosure bands (°F): blue <70 · teal <75 · green <80 · yellow <85 · orange <90 · red ≥90":`Metric scale: green ${thermalMetrics[overheadMetric].min} → amber ${thermalMetrics[overheadMetric].max} ${thermalMetrics[overheadMetric].unit}; color saturates beyond range. Comparison scale, not alarm limits.`} · Dashed: stale/missing. Outlined units are selected in Targets below. Map metric is independent of targets and trends.</p>
      <div aria-label="Thermal overhead map" className="mt-4 w-full min-w-0 pb-2"><div className="w-full min-w-0 space-y-2">{groups.map(([a,segments])=><div key={a} data-thermal-array={a} className="flex min-w-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1"><h2 className="w-14 shrink-0 rounded border border-slate-200 bg-slate-100 px-2 py-2 text-center text-xs font-bold">Array {a}</h2><div className="grid min-w-0 flex-1 gap-0.5" style={{gridTemplateColumns:`repeat(${segments.size}, minmax(0, 1fr))`}}>{[...segments.entries()].map(([label,units])=><button type="button" key={label} data-thermal-segment={label} aria-label={`Inspect Array ${a} · ${label}`} onClick={()=>inspect(units[0].id)} title={`Inspect Array ${a} · ${label}`} className={`min-w-0 rounded border bg-white p-0.5 ${units.some(u=>selected.includes(u.id))?"border-sky-800 ring-2 ring-inset ring-sky-800":"border-slate-200 hover:border-sky-600"}`}><div className="mb-1 break-all text-center text-[10px] font-bold">{label}</div><div className="grid min-w-0 grid-cols-1 gap-1">{units.map(u=>{
        const tone=u.point.quality!=="Live"?"border-dashed border-slate-600 bg-white text-slate-700":u.faults.length?"border-yellow-500 bg-yellow-200 text-yellow-950":u.point.mode==="Heating"?"border-red-600 bg-red-600 text-white":u.point.mode==="Cooling"?"border-blue-600 bg-blue-600 text-white":"border-slate-300 bg-slate-200 text-slate-800";
        const reading=u.readings[overheadMetric];
        return <span style={mapMode==="metric"?{backgroundColor:reading.color,color:"#0f172a"}:undefined} key={u.id} title={`${u.label}\n${u.ip}\n${u.point.quality} · ${u.point.mode}\n${metricNames[overheadMetric]}: ${reading.text}\n${u.faults.join("\n")}`} className={`block min-h-12 min-w-0 rounded border-2 px-0 py-1 text-[10px] font-bold [overflow-wrap:anywhere] ${tone} ${reading.state!=="Live"?"border-dashed":""} ${selected.includes(u.id)?"ring-2 ring-sky-800 ring-offset-2":""}`}><span className="block">H{u.unit}</span>{(mapMode==="metric"||overheadMetric==="current")&&<span className="block text-[10px]">{reading.text}</span>}{!!u.faults.length&&<span className="block bg-yellow-200 text-[10px] text-yellow-950">⚠ {u.faults.length}</span>}</span>;
      })}</div></button>)}</div></div>)}</div></div>
      {!view.units.length&&<p className="py-6 text-sm">{loading?"Loading shared HVAC telemetry…":"No mapped HVAC telemetry available yet."}</p>}
    </section>
    {showSiteOverview&&<ThermalSiteOverview units={view.units} metric={metric} selected={selected} onChoose={inspect} onRank={()=>{setTargetsOpen(true);document.getElementById("thermal-targets")?.scrollIntoView({behavior:"smooth",block:"start"});}}/>}
    <ThermalSavedViews key={savedSiteKey??"unknown"} siteKey={savedSiteKey} state={savedState} onApply={applySavedView} onPreset={applyPreset}/>
    <div id="thermal-targets" className="scroll-mt-20"><ThermalResults devices={reviewDevices} units={view.units} metric={metric} onMetricChange={changeMetric} restoreFilters={restoreTargetFilters} onFiltersChange={setTargetFilters} selected={selected} onSelection={setReviewSelection} onInspect={inspect} open={targetsOpen} onOpenChange={setTargetsOpen} findTarget={findTarget} error={catalogError}/></div>
    {(error||view.error)&&<div role="alert" className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">{error||view.error}</div>}
    <section aria-label="Selected thermal graphs" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-base font-bold text-slate-900">Thermal trends</h2><p className="text-xs text-slate-500">Compare selected equipment across the same time window.</p></div><span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900">{metricNames[plottedMetric]} · {plottedSession==="site"?"retained history":plottedSession?"recording":"live buffer"}</span></div>
      {view.reviewVersion===1?<ThermalHistoryReview filters={reviewFilters} onApply={setReviewFilters} metric={metric}/>:<p className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">The history review update is ready. Restart PRIZM to enable the new device selector and recorded-data filters. Existing recording continues.</p>}
      <div className="my-4 flex flex-wrap items-center gap-3"><select aria-label="Recording to review" className={button} value={session} onChange={e=>setSession(e.target.value)}><option value="" disabled={selected.length>8}>Live buffer (up to 8 units)</option><option value="site">Whole-site retained history</option>{view.sessions.map(s=><option key={s.id} value={s.id}>{new Date(s.startedAt).toLocaleString()} · {s.state} · {s.targets.length} units</option>)}</select>{session==="site"&&<select aria-label="Site history range" className={button} value={historyDays} onChange={e=>{setHistoryDays(Number(e.target.value));setReviewFilters(f=>({...f,from:undefined,to:undefined}));}}><option value={1/24}>Last hour</option><option value={0.25}>Last 6 hours</option><option value={1}>Last 24 hours</option><option value={3}>Last 3 days</option><option value={7}>Last 7 days</option></select>}{!session&&<select aria-label="Time range" className={button} value={minutes} onChange={e=>setMinutes(Number(e.target.value))}><option value={15}>15 minutes</option><option value={60}>1 hour</option></select>}<button className={button} disabled={!points.some(p=>!p.excluded)} onClick={exportData}><Download size={13} className="mr-1 inline"/>Export shown data</button>{loading&&<span className="text-xs">Updating…</span>}</div>
      <p className="mb-3 text-xs text-slate-500">{session==="site"?"Retained site history: graph summaries preserve first/last values, extrema and quality gaps. Large selections use coarser summaries; use Refresh view for new readings. Narrow devices or the time range for detail; not every command transition is shown at this scale.":session?"Recorded history":"Live buffer resets on server restart; recordings persist."} · Temperature sensors are shared at segment level. Missing/stale samples and gaps over two minutes break the trace.</p>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs" aria-label="Graph data availability"><span role="status">{selected.length} selected · {pendingPlot?`Updating graph; showing previous ${plottedSelection.length} device(s)…`:`${withData} with data · ${plottedSelection.length-withData} without data`}</span><span>Counts reflect this metric, time range and filters. Equal readings overlap. Click the graph to pin a time and browse devices.</span><button className={button} disabled={!graph.length} onClick={()=>setPinnedAt(Number(graph[graph.length-1].at))}>Inspect latest point</button>{highlighted?<><strong>Highlighted: {labelFor(highlighted)}</strong><button className={button} onClick={()=>{setHighlight(null);setTraceVisibility(state=>({...state,only:null}));}}>Clear trace highlight</button></>:<span>Click a reading card below to highlight its trace.</span>}</div>
      {tracePages>1&&<div className="mb-2 flex items-center gap-2 text-xs"><span>Showing traces {Math.min(tracePage,tracePages-1)*16+1}–{Math.min((Math.min(tracePage,tracePages-1)+1)*16,traceOrder.length)} of {traceOrder.length}</span><button className={button} disabled={tracePage===0} onClick={()=>{setTracePage(page=>Math.max(0,page-1));setTraceVisibility(state=>({...state,only:null}));}}>Previous traces</button><button className={button} disabled={tracePage>=tracePages-1} onClick={()=>{setTracePage(page=>Math.min(tracePages-1,page+1));setTraceVisibility(state=>({...state,only:null}));}}>Next traces</button></div>}
      <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-3 shadow-inner sm:p-4"><div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500"><span className="font-semibold uppercase tracking-wide">{thermalMetrics[plottedMetric].label} trend</span><span>{visibleGraph.length?`${new Date(Number(visibleGraph[0].at)).toLocaleString()} → ${new Date(Number(visibleGraph[visibleGraph.length-1].at)).toLocaleString()}`:"No plotted time range"}</span></div><div className="h-80 sm:h-96" >{visibleGraph.length?<ResponsiveContainer width="100%" height="100%"><LineChart data={visibleGraph} onClick={state=>{const at=Number(state.activeLabel);if(state.activeLabel!==undefined&&Number.isFinite(at))setPinnedAt(at);}} margin={{top:12,right:18,left:0,bottom:8}}><CartesianGrid stroke="#e2e8f0" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="at" type="number" domain={["dataMin","dataMax"]} tickFormatter={graphTimeLabel} tick={{fontSize:11,fill:"#64748b"}} axisLine={{stroke:"#cbd5e1"}} tickLine={false} minTickGap={28}/><YAxis width={70} tick={{fontSize:11,fill:"#64748b"}} domain={["auto","auto"]} tickFormatter={value=>`${Number(value).toFixed(1)} ${thermalMetrics[plottedMetric].unit}`} axisLine={false} tickLine={false}/><Tooltip content={({active,label})=>active&&label!==undefined&&Number.isFinite(Number(label))?<div className="max-w-[600px] rounded-lg bg-white shadow-xl"><ThermalComparison compact at={Number(label)} ids={visibleTraceIds} index={reviewIndex} label={labelFor} summarized={plottedSession==="site"}/></div>:null}/>{visibleTraceIds.map(id=><Line key={id} data={traceData.get(id)||[]} dataKey={id} name={labelFor(id)} stroke={traceColors[plottedSelection.indexOf(id) % traceColors.length]} strokeOpacity={highlighted&&highlighted!==id?0.12:1} strokeWidth={highlighted===id?4:2} dot={false} activeDot={{r:5,stroke:"white",strokeWidth:2}} connectNulls={false} isAnimationActive={false}/>)}</LineChart></ResponsiveContainer>:<div className="grid h-full place-items-center rounded bg-slate-50 text-sm text-slate-500">{!visibleTraceIds.length&&legendTraceIds.length?"All overlays on this page are hidden. Restore them with the legend below.":selected.length?"No samples in this range yet. Recording does not backfill older data.":"Select equipment to view trends"}</div>}</div></div>
      {!!legendTraceIds.length&&<ThermalTraceLegend traces={legendTraceIds.map(id=>({id,label:labelFor(id),color:traceColors[plottedSelection.indexOf(id)%traceColors.length],visible:traceIsVisible(traceVisibility,id),hasData:graphDevices.has(id)}))} only={traceVisibility.only} hiddenCount={plottedSelection.filter(id=>traceVisibility.hidden.includes(id)).length} onToggle={id=>{setHighlight(null);setTraceVisibility(state=>toggleTrace(state,id,plottedSelection));}} onOnly={showOnlyTrace} onRestore={restoreOverlays}/>}
      {plottedMetric==="current"&&!!visibleGraph.length&&<><label className="mt-3 block text-xs"><input type="checkbox" checked={showCommands} onChange={e=>setShowCommands(e.target.checked)}/> Show recorded command bands</label>{showCommands&&<ThermalCommandBands ids={visibleTraceIds} index={reviewIndex} start={Number(visibleGraph[0].at)} end={Number(visibleGraph[visibleGraph.length-1].at)} label={labelFor} summarized={plottedSession==="site"}/>}</>}
      {pinnedAt!==null&&<ThermalComparison at={pinnedAt} ids={visibleTraceIds} index={reviewIndex} label={labelFor} summarized={plottedSession==="site"}/>}
      {!!traceStats.length&&<div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Visible trace summaries">{traceStats.map(({id,latest,min,max})=><button key={id} type="button" onClick={()=>highlightTrace(id)} className="rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-sky-400 hover:bg-sky-50" style={{borderLeftColor:traceColors[plottedSelection.indexOf(id)%traceColors.length],borderLeftWidth:4}}><span className="block truncate text-xs font-semibold text-slate-800" title={labelFor(id)}>{labelFor(id)}</span><span className="mt-1 block text-lg font-bold tabular-nums">{latest===null?"—":`${latest.toFixed(plottedMetric==="cellRate"?2:1)} ${thermalMetrics[plottedMetric].unit}`}</span><span className="block text-[11px] text-slate-500">Latest recorded · range {min===null?"—":min.toFixed(1)}–{max===null?"—":max.toFixed(1)}</span></button>)}</div>}
      <p className="mt-2 text-xs text-slate-600">{points.filter(p=>!p.excluded).length} shown samples · filtered observations are excluded from the table and export.</p>
      {pinnedAt!==null&&<ThermalPointInspector at={pinnedAt} points={points} selected={plottedSelection} metric={plottedMetric} highlighted={highlighted} label={labelFor} onChoose={highlightTrace} onClose={()=>{setPinnedAt(null);setTraceVisibility(state=>({...state,only:null}));}} isolated={traceVisibility.only!==null} onIsolate={value=>{if(value&&highlighted)showOnlyTrace(highlighted);else setTraceVisibility(state=>({...state,only:null}));}}/>}
      <ThermalHistoryTable points={points} metric={plottedMetric} label={labelFor}/>
      <details className="mt-4 rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer text-xs font-semibold">Observed mode / quality changes</summary>
        <div className="rounded-lg border border-slate-200 p-4"><h2 className="text-sm font-bold">Observed mode / quality changes</h2><div className="mt-2 max-h-52 overflow-auto text-xs">{transitions.map((t,i)=><p className="border-b py-2" key={`${t.id}-${t.point.at}-${i}`}><strong>{labelFor(t.id)}</strong><br/>{new Date(t.point.at).toLocaleString()} · {t.point.mode} · {t.point.quality}{t.initial?" (first observed)":""}</p>)}{!transitions.length&&<p>No observations in this range.</p>}</div></div>
      </details>
    </section>
    <details className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><summary className="cursor-pointer text-sm font-bold">Targeted recording{active?` · ${active.state}`:" · optional"}</summary><p className="mt-1 text-xs text-slate-600">Records up to 8 selected units. Use Site history storage to record entire arrays or the site. Recording targets remain fixed when graph selection changes. 64 MiB total storage cap; 5 GiB free-disk reserve. No automatic deletion.</p><div className="mt-3 flex flex-wrap items-center gap-3">{active?<><span className="text-sm"><Circle size={10} className="mr-1 inline text-red-600"/>{active.state} · {active.samples} saved samples · ends {new Date(active.endsAt).toLocaleString()}</span><button className={button} disabled={busy} onClick={()=>record(active.id)}>Stop recording</button><p className="w-full text-xs">Fixed targets: {active.labels.join("; ")}</p></>:<><label className="text-xs">Hours <input aria-label="Recording duration hours" className={`${button} w-20`} type="number" min="0.1" max="24" step="0.1" value={hours} onChange={e=>setHours(e.target.value)}/></label><button className={button} disabled={busy||!selected.length||selected.length>8||!!session} onClick={()=>record()}>Record these {selected.length} units</button></>}</div>{view.sessions.filter(s=>s.error).map(s=><p key={s.id} className="mt-2 text-xs text-red-800">Recording {new Date(s.startedAt).toLocaleString()}: {s.error}</p>)}</details>
  </div>;
}
