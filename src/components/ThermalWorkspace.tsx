import React, { useEffect, useMemo, useState } from "react";
import { Wind, Circle, X, Download } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
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
type Point = {id:string;point:ThermalPoint;displayValues:ThermalDisplayValues;excluded?:boolean};
const api="/api/local/site-data/thermal";
const traceColors=["#0369a1","#c2410c","#7e22ce","#047857","#be185d","#334155","#a16207","#0e7490"];
const button="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40";
const metricNames=Object.fromEntries(Object.entries(thermalMetrics).map(([key,m])=>[key,`${m.label} (${m.unit})`]));
type Metric = ThermalMetric;
function initialSelection():string[]{try{const value=JSON.parse(localStorage.getItem("prizm-thermal-selection")||"[]");return Array.isArray(value)?value.filter(v=>typeof v==="string").slice(0,2048):[];}catch{return [];}}
async function json(url:string, options?:RequestInit){const r=await fetch(url,options);const d=await r.json();if(!r.ok)throw new Error(d.error||"Thermal request failed");return d;}

export default function ThermalWorkspace(){
  const {lastUpdated}=useSiteData();
  const [view,setView]=useState<View>({units:[],sessions:[],error:null});
  const [selected,setSelected]=useState<string[]>(initialSelection);
  const [pinnedAt,setPinnedAt]=useState<number|null>(null);
  const [isolated,setIsolated]=useState(false);
  const [highlight,setHighlight]=useState<string|null>(null);
  const [focus,setFocus]=useState<string|null>(null);
  const [storageOpen,setStorageOpen]=useState(false);
  const [reviewFilters,setReviewFilters]=useState<HistoryFilters>({});
  const [recordedDevices,setRecordedDevices]=useState<HistoryDevice[]>([]);
  const [reviewError,setReviewError]=useState("");
  const [catalogError,setCatalogError]=useState("");
  const [historyDays,setHistoryDays]=useState(7);
  const [showSiteOverview,setShowSiteOverview]=useState(false);
  const [array,setArray]=useState("all");
  const [metric,setMetric]=useState<Metric>("space");
  const [mapMode,setMapMode]=useState<"metric"|"mode">("metric");
  const [search,setSearch]=useState("");
  const [quality,setQuality]=useState("all");
  const [minimum,setMinimum]=useState("");
  const [maximum,setMaximum]=useState("");
  const [faultsOnly,setFaultsOnly]=useState(false);
  const [selectedOnly,setSelectedOnly]=useState(false);
  const [sort,setSort]=useState("topology");
  const [minutes,setMinutes]=useState(60);
  const [session,setSession]=useState(()=>initialSelection().length>8?"site":"");
  const [points,setPoints]=useState<Point[]>([]);
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
  useEffect(()=>{if(session!=="site"||view.reviewVersion!==1)return;const controller=new AbortController();
    json(`${api}/history-devices`,{signal:controller.signal}).then(d=>{if(!controller.signal.aborted){setRecordedDevices(d.devices);setCatalogError("");}}).catch(e=>{if(!controller.signal.aborted)setCatalogError(e.message);});return()=>controller.abort();
  },[session,lastUpdated,revision,view.reviewVersion]);
  const historyMetric=metric;
  const historyRefresh=reviewFilters.to===undefined&&selected.length<=8?lastUpdated:null;

  useEffect(()=>{const controller=new AbortController();setLoading(true);setPoints([]);
    const query=new URLSearchParams({ids:selected.join(","),from:String(session?0:Date.now()-minutes*60000)});
    if(session==="site"){query.set("from",String(Date.now()-historyDays*86400000));query.set("metric",metric);}else if(session)query.set("session",session);
    query.set("metric",metric);
    if(reviewFilters.from!==undefined)query.set("from",String(reviewFilters.from));
    if(reviewFilters.to!==undefined)query.set("to",String(reviewFilters.to));
    for(const key of ["minimum","maximum","mode","quality","faults"] as const){const value=reviewFilters[key];if(value!==undefined)query.set(key,String(value));}
    json(session==="site"?`${api}/site-history/query`:`${api}/history?${query}`,session==="site"?{signal:controller.signal,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...Object.fromEntries(query),ids:selected})}:{signal:controller.signal})
      .then(h=>{if(!controller.signal.aborted){setPoints(h.points);setError("");}})
      .catch(e=>{if(!controller.signal.aborted){setError(e.message);setPoints([]);}})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[historyRefresh,selected,minutes,session,revision,historyDays,historyMetric,reviewFilters]);
  const reviewDevices=useMemo(()=>[...new Map([...recordedDevices,...view.units].map(d=>[d.id,d])).values()],[recordedDevices,view.units]);
  const labelFor=(id:string)=>reviewDevices.find(d=>d.id===id)?.label||id;
  const setReviewSelection=(ids:string[])=>{const unique=[...new Set(ids)];if(unique.length>8)setSession("site");setReviewError("");setSelected(unique);setFocus(unique.at(-1)||null);};
  const picked=selected.map(id=>view.units.find(u=>u.id===id)).filter(Boolean) as Unit[];
  const detail=picked.find(u=>u.id===focus)||picked[0];
  const active=view.sessions.find(s=>["Recording","Waiting for data"].includes(s.state));
  const filtered=useMemo(()=>view.units.filter(u=>{
    const reading=u.readings[metric];
    return (array==="all"||u.array===Number(array)) &&
      (!search||`${u.label} ${u.ip}`.toLowerCase().includes(search.toLowerCase())) &&
      (quality==="all"||reading.state===quality) && (!faultsOnly||u.faults.length>0) &&
      (!selectedOnly||selected.includes(u.id)) &&
      (minimum===""||(reading.state==="Live"&&reading.value!==null&&reading.value>=Number(minimum))) &&
      (maximum===""||(reading.state==="Live"&&reading.value!==null&&reading.value<=Number(maximum)));
  }),[view.units,array,metric,search,quality,faultsOnly,selectedOnly,selected,minimum,maximum]);
  const results=useMemo(()=>sort==="topology"?filtered:[...filtered].sort((a,b)=>{
    const av=a.readings[metric],bv=b.readings[metric];
    if(av.state!=="Live")return bv.state!=="Live"?0:1;
    if(bv.state!=="Live")return -1;
    return sort==="ascending"?av.value!-bv.value!:bv.value!-av.value!;
  }),[filtered,sort,metric]);
  const visibleIds=useMemo(()=>new Set(filtered.map(u=>u.id)),[filtered]);
  const groups=useMemo(()=>{
    const arrays=new Map<number,Map<string,Unit[]>>();
    view.units.filter(u=>array==="all"||u.array===Number(array)).forEach(u=>{
      if(!arrays.has(u.array))arrays.set(u.array,new Map());const segments=arrays.get(u.array)!;
      segments.set(u.segment,[...(segments.get(u.segment)||[]),u]);
    });return [...arrays.entries()];
  },[view.units,array]);
  const changeMetric=(value:Metric)=>{setMetric(value);setMinimum("");setMaximum("");setReviewFilters(f=>({...f,minimum:undefined,maximum:undefined}));};
  const graph=useMemo(()=>{
    const rows=new Map<number,Record<string,number|null>>();
    const set=(at:number,key:string,value:number|null)=>{const r=rows.get(at)||{at};r[key]=value;rows.set(at,r);};
    selected.forEach(id=>{let previous:ThermalPoint|undefined;
      points.filter(p=>p.id===id).sort((a,b)=>a.point.at-b.point.at).forEach(({point:p,displayValues,excluded})=>{
        if(previous&&session!=="site"&&p.at-previous.at>120000)set(previous.at+1,id,null);
        set(p.at,id,!excluded&&p.quality==="Live"?(displayValues?.[metric]??null):null);previous=p;
      });
    });return [...rows.values()].sort((a,b)=>Number(a.at)-Number(b.at));
  },[points,selected,metric,session]);
  const graphDevices=useMemo(()=>new Set(points.filter(p=>!p.excluded&&p.point.quality==="Live"&&typeof p.displayValues?.[metric]==="number"&&Number.isFinite(p.displayValues[metric])).map(p=>p.id)),[points,metric]);
  const withData=selected.filter(id=>graphDevices.has(id)).length;
  const highlighted=highlight&&selected.includes(highlight)?highlight:null;
  const traceOrder=isolated&&highlighted?[highlighted]:highlighted?[...selected.filter(id=>id!==highlighted),highlighted]:selected;
  const transitions=useMemo(()=>selected.flatMap(id=>{
    let previous:ThermalPoint|undefined;const changes:{id:string;point:ThermalPoint;initial:boolean}[]=[];
    points.filter(p=>p.id===id&&!p.excluded).sort((a,b)=>a.point.at-b.point.at).forEach(p=>{
      if(!previous||p.point.mode!==previous.mode||p.point.quality!==previous.quality)changes.push({...p,initial:!previous});previous=p.point;
    });return changes;
  }).sort((a,b)=>b.point.at-a.point.at).slice(0,30),[points,selected]);
  const chooseSegment=(units:Unit[])=>{
    const ids=units.map(u=>u.id);
    const removing=ids.every(id=>selected.includes(id));
    const next=removing?selected.filter(id=>!ids.includes(id)):[...new Set([...selected,...ids])];
    if(next.length>8)setSession("site");
    setError("");setSelected(next);setFocus(removing?null:ids[0]);
  };
  const choose=(id:string)=>{
    const unit=view.units.find(u=>u.id===id);
    if(unit)chooseSegment(view.units.filter(u=>u.ip===unit.ip));
  };
  const record=async(stopId?:string)=>{setBusy(true);setError("");try{
    await json(stopId?`${api}/recordings/${stopId}/stop`:`${api}/recordings`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({targets:selected,hours:Number(hours)})});
    setRevision(v=>v+1);
  }catch(e){setError(String(e));}finally{setBusy(false);}};
  const exportData=()=>{
    const blob=new Blob([JSON.stringify({units:{pointTemperatures:"°C",pointCellRate:"°C/min",displayTemperatures:"°F",displayCellRate:"°F/min"},devices:reviewDevices.filter(d=>selected.includes(d.id)).map(({id,label,ip})=>({id,label,ip})),session:session||null,metric,filters:reviewFilters,summary:session==="site",points:points.filter(p=>!p.excluded)},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`prizm-thermal-${session||"live"}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <div className="space-y-4 p-4 text-slate-800">
    {storageOpen&&<ThermalStorageModal onClose={()=>setStorageOpen(false)} onChanged={()=>setRevision(v=>v+1)}/>}
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-lg font-bold"><Wind className="text-sky-700"/>Thermal Controls</h1><p className="mt-1 text-xs text-slate-600">Select equipment → inspect details → compare trends → record the same targets. Monitoring only; no HVAC commands.</p></div><div className="flex gap-2"><button className={button} onClick={()=>setStorageOpen(true)}>Site history storage</button><button className={button} onClick={()=>setRevision(v=>v+1)}>Refresh view</button></div></div>
      {view.siteStorage?.enabled&&<p className="mt-3 text-xs font-semibold">Whole-site recording: {view.siteStorage.pausedReason?`Paused — ${view.siteStorage.pausedReason}`:`enabled · ${view.siteStorage.retentionDays}-day rolling retention · ${(view.siteStorage.usedBytes/1024**3).toFixed(2)} GiB saved`}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs"><label>Array <select className={button} value={array} onChange={e=>setArray(e.target.value)}><option value="all">All arrays</option>{[...new Set(view.units.map(u=>u.array))].map(a=><option key={a} value={a}>{a}</option>)}</select></label><label className="flex items-center gap-2"><input type="checkbox" checked={showSiteOverview} onChange={e=>setShowSiteOverview(e.target.checked)}/>Show whole-site outlier graph</label><span>Click a segment to add both HVAC units; click again to remove. Larger selections open retained site history.</span><button className={button} disabled={!selected.length} onClick={()=>{setSelected([]);setFocus(null);setError("");}}>Clear graph selection</button><label>Map colors <select className={button} value={mapMode} onChange={e=>setMapMode(e.target.value as "metric"|"mode")}><option value="metric">Selected metric</option><option value="mode">Operating mode</option></select></label></div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <label>Metric <select aria-label="Map metric" className={button} value={metric} onChange={e=>changeMetric(e.target.value as Metric)}>{Object.entries(metricNames).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <input aria-label="Search equipment" className={button} placeholder="Search segment, HVAC or IP" value={search} onChange={e=>setSearch(e.target.value)}/>
        <select aria-label="Reading quality" className={button} value={quality} onChange={e=>setQuality(e.target.value)}>{["all","Live","Stale","Unavailable","Not reported"].map(q=><option key={q} value={q}>{q==="all"?"All reading states":q}</option>)}</select>
        <label>Min ({thermalMetrics[metric].unit}) <input aria-label="Minimum reading" type="number" step="any" className={`${button} w-24`} value={minimum} onChange={e=>setMinimum(e.target.value)}/></label>
        <label>Max ({thermalMetrics[metric].unit}) <input aria-label="Maximum reading" type="number" step="any" className={`${button} w-24`} value={maximum} onChange={e=>setMaximum(e.target.value)}/></label>
        <label><input type="checkbox" checked={faultsOnly} onChange={e=>setFaultsOnly(e.target.checked)}/> Faults only</label>
        <label><input type="checkbox" checked={selectedOnly} onChange={e=>setSelectedOnly(e.target.checked)}/> Selected only</label>
        <button className={button} onClick={()=>{setSearch("");setQuality("all");setMinimum("");setMaximum("");setFaultsOnly(false);setSelectedOnly(false);setArray("all");}}>Clear filters</button>
      </div>
      <p className="mt-3 text-xs text-slate-600">{mapMode==="mode"?"Grey: idle · red: heating · blue: cooling · yellow: fault":metric==="space"?"Enclosure bands (°F): blue <70 · teal <75 · green <80 · yellow <85 · orange <90 · red ≥90":`Metric scale: green ${thermalMetrics[metric].min} → amber ${thermalMetrics[metric].max} ${thermalMetrics[metric].unit}; color saturates beyond range. Comparison scale, not alarm limits.`} · Dashed: stale/missing. Fault badges remain visible. Dimmed tiles do not match filters; positions stay fixed.</p>
      <div aria-label="Thermal overhead map" className="mt-4 w-full min-w-0 pb-2"><div className="w-full min-w-0 space-y-2">{groups.map(([a,segments])=><div key={a} data-thermal-array={a} className="flex min-w-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1"><h2 className="w-14 shrink-0 rounded border border-slate-200 bg-slate-100 px-2 py-2 text-center text-xs font-bold">Array {a}</h2><div className="grid min-w-0 flex-1 gap-0.5" style={{gridTemplateColumns:`repeat(${segments.size}, minmax(0, 1fr))`}}>{[...segments.entries()].map(([label,units])=><button type="button" key={label} data-thermal-segment={label} aria-label={`Toggle Array ${a} · ${label}`} aria-pressed={units.every(u=>selected.includes(u.id))} onClick={()=>chooseSegment(units)} title={`Click to add or remove Array ${a} · ${label} and both HVAC units`} className={`min-w-0 rounded border bg-white p-0.5 ${units.some(u=>selected.includes(u.id))?"border-sky-800 ring-2 ring-inset ring-sky-800":"border-slate-200 hover:border-sky-600"}`}><div className="mb-1 break-all text-center text-[10px] font-bold">{label}</div><div className="grid min-w-0 grid-cols-1 gap-1">{units.map(u=>{
        const tone=u.point.quality!=="Live"?"border-dashed border-slate-600 bg-white text-slate-700":u.faults.length?"border-yellow-500 bg-yellow-200 text-yellow-950":u.point.mode==="Heating"?"border-red-600 bg-red-600 text-white":u.point.mode==="Cooling"?"border-blue-600 bg-blue-600 text-white":"border-slate-300 bg-slate-200 text-slate-800";
        const reading=u.readings[metric];
        return <span style={mapMode==="metric"?{backgroundColor:reading.color,color:"#0f172a"}:undefined} key={u.id} title={`${u.label}\n${u.ip}\n${u.point.quality} · ${u.point.mode}\n${metricNames[metric]}: ${reading.text}\n${u.faults.join("\n")}`} className={`block min-h-12 min-w-0 rounded border-2 px-0 py-1 text-[10px] font-bold [overflow-wrap:anywhere] ${tone} ${reading.state!=="Live"?"border-dashed":""} ${visibleIds.has(u.id)?"":"opacity-40"} ${selected.includes(u.id)?"ring-2 ring-sky-800 ring-offset-2":""}`}><span className="block">H{u.unit}</span>{(mapMode==="metric"||metric==="current")&&<span className="block text-[10px]">{reading.text}</span>}{!!u.faults.length&&<span className="block bg-yellow-200 text-[10px] text-yellow-950">⚠ {u.faults.length}</span>}</span>;
      })}</div></button>)}</div></div>)}</div></div>
      {!view.units.length&&<p className="py-6 text-sm">{loading?"Loading shared HVAC telemetry…":"No mapped HVAC telemetry available yet."}</p>}
    </section>
    {showSiteOverview&&<ThermalSiteOverview units={view.units} metric={metric} selected={selected} onChoose={choose} onRank={()=>{setArray("all");setSearch("");setQuality("Live");setMinimum("");setMaximum("");setFaultsOnly(false);setSelectedOnly(false);setSort("descending");}}/>}
    <ThermalResults units={results} metric={metric} selected={selected} onChoose={choose} sort={sort} onSort={setSort}/>
    <p className="text-xs text-slate-600">{selected.filter(id=>!visibleIds.has(id)).length} selected unit(s) outside these filters. Filters preserve selection, details and graphs.</p>
    {(error||view.error)&&<div role="alert" className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">{error||view.error}</div>}
    <section aria-label="Selected thermal graphs" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-bold">Selected segment graphs</h2>
      {view.reviewVersion===1?<ThermalHistoryReview devices={reviewDevices} selected={selected} onSelection={setReviewSelection} filters={reviewFilters} onApply={f=>{setReviewFilters(f);setReviewError("");}} metric={metric} error={reviewError||catalogError}/>:<p className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">The history review update is ready. Restart PRIZM to enable the new device selector and recorded-data filters. Existing recording continues.</p>}
      <div className="flex max-h-32 flex-wrap items-center gap-2 overflow-auto">{selected.map((id,i)=><span key={id} className="inline-flex items-center gap-2 rounded border px-2 py-1" style={{borderColor:traceColors[i % traceColors.length]}}><button aria-pressed={highlighted===id} title="Highlight this trace and show device details" onClick={()=>{setFocus(id);setHighlight(highlighted===id?null:id);}} className="text-xs font-semibold" style={{color:traceColors[i % traceColors.length]}}>{labelFor(id)}{!loading&&!graphDevices.has(id)?" · No plotted data":""}</button><button aria-label={`Remove ${id}`} onClick={()=>setSelected(selected.filter(v=>v!==id))}><X size={14}/></button></span>)}{!selected.length&&<p className="text-sm text-slate-500">Click segments above to add their HVAC 1 and HVAC 2 readings to the graph.</p>}</div>
      <div className="my-4 flex flex-wrap items-center gap-3"><select aria-label="Graph metric" className={button} value={metric} onChange={e=>changeMetric(e.target.value as Metric)}>{Object.entries(metricNames).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><select aria-label="Recording to review" className={button} value={session} onChange={e=>{setSession(e.target.value);if(e.target.value!=="site"&&selected.length>8)setSelected(selected.slice(0,8));const s=view.sessions.find(s=>s.id===e.target.value);if(s){setSelected(s.targets);setFocus(s.targets[0]);}}}><option value="">Live buffer (last hour)</option><option value="site">Whole-site retained history</option>{view.sessions.map(s=><option key={s.id} value={s.id}>{new Date(s.startedAt).toLocaleString()} · {s.state} · {s.targets.length} units</option>)}</select>{session==="site"&&<select aria-label="Site history range" className={button} value={historyDays} onChange={e=>{setHistoryDays(Number(e.target.value));setReviewFilters(f=>({...f,from:undefined,to:undefined}));}}><option value={1/24}>Last hour</option><option value={0.25}>Last 6 hours</option><option value={1}>Last 24 hours</option><option value={3}>Last 3 days</option><option value={7}>Last 7 days</option></select>}{!session&&<select aria-label="Time range" className={button} value={minutes} onChange={e=>setMinutes(Number(e.target.value))}><option value={15}>15 minutes</option><option value={60}>1 hour</option></select>}<button className={button} disabled={!points.some(p=>!p.excluded)} onClick={exportData}><Download size={13} className="mr-1 inline"/>Export shown data</button>{loading&&<span className="text-xs">Updating…</span>}</div>
      <p className="mb-3 text-xs text-slate-500">{session==="site"?"Retained site history: graph summaries preserve first/last values, extrema and quality gaps. Large selections use coarser summaries; use Refresh view for new readings. Narrow devices or the time range for detail; not every command transition is shown at this scale.":session?"Recorded history":"Live buffer resets on server restart; recordings persist."} · Temperature sensors are shared at segment level. Missing/stale samples and gaps over two minutes break the trace.</p>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs" aria-label="Graph data availability"><span role="status">{selected.length} selected · {loading?"Checking plotted data…":`${withData} with data · ${selected.length-withData} without data`}</span><span>Counts reflect this metric, time range and filters. Equal readings overlap. Click the graph to pin a time and browse devices.</span><button className={button} disabled={!graph.length} onClick={()=>setPinnedAt(Number(graph[graph.length-1].at))}>Inspect latest point</button>{highlighted?<><strong>Highlighted: {labelFor(highlighted)}</strong><button className={button} onClick={()=>setHighlight(null)}>Clear trace highlight</button></>:<span>Click a device label above to highlight its trace.</span>}</div>
      <div className="h-72" onClick={event=>{if(!graph.length)return;const bounds=event.currentTarget.getBoundingClientRect();const fraction=Math.max(0,Math.min(1,(event.clientX-bounds.left-75)/Math.max(1,bounds.width-80)));const start=Number(graph[0].at),end=Number(graph[graph.length-1].at);setPinnedAt(Math.round(start+fraction*(end-start)));}}>{graph.length?<ResponsiveContainer width="100%" height="100%"><LineChart data={graph}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="at" type="number" domain={["dataMin","dataMax"]} tickFormatter={v=>new Date(v).toLocaleTimeString()} tick={{fontSize:10}}/><YAxis width={70} tick={{fontSize:10}} domain={["auto","auto"]} tickFormatter={value=>`${Number(value).toFixed(1)} ${thermalMetrics[metric].unit}`}/><Tooltip formatter={(value)=>`${Number(value).toFixed(metric==="cellRate"?2:1)} ${thermalMetrics[metric].unit}`} labelFormatter={v=>new Date(Number(v)).toLocaleString()}/>{selected.length<=16&&<Legend wrapperStyle={{fontSize:11}}/>}{traceOrder.map(id=><Line key={id} data={graph.filter(row=>id in row)} dataKey={id} name={labelFor(id)} stroke={traceColors[selected.indexOf(id) % traceColors.length]} strokeOpacity={highlighted&&highlighted!==id?0.12:1} strokeWidth={highlighted===id?4:2} dot={highlighted===id?{r:3}:false} connectNulls={false} isAnimationActive={false}/>)}</LineChart></ResponsiveContainer>:<div className="grid h-full place-items-center rounded bg-slate-50 text-sm text-slate-500">{selected.length?"No samples in this range yet. Recording does not backfill older data.":"Select equipment to view trends"}</div>}</div>
      <p className="mt-2 text-xs text-slate-600">{points.filter(p=>!p.excluded).length} shown samples · filtered observations are excluded from the table and export.</p>
      {pinnedAt!==null&&<ThermalPointInspector at={pinnedAt} points={points} selected={selected} metric={metric} highlighted={highlighted} label={labelFor} onChoose={id=>{setHighlight(id);setFocus(id);}} onClose={()=>{setPinnedAt(null);setIsolated(false);}} isolated={isolated&&!!highlighted} onIsolate={setIsolated}/>}
      <ThermalHistoryTable points={points} metric={metric} label={labelFor}/>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-4"><h2 className="text-sm font-bold">{detail?.label||"Equipment details"} · Current readings</h2>{detail&&<><p className="my-2 text-xs">{detail.ip} · {detail.point.quality} · {detail.point.mode} · last success {new Date(detail.point.at).toLocaleTimeString()}</p><div className="mb-3 grid grid-cols-2 gap-2 text-xs">{view.units.filter(u=>u.ip===detail.ip).map(u=><p key={u.id}><strong>HVAC {u.unit} amperage</strong><br/>{u.readings.current.text}</p>)}</div><dl className="grid grid-cols-2 gap-2 text-xs">{Object.entries(thermalMetrics).map(([key,m])=><div key={key}><dt className="text-slate-500">{m.label}</dt><dd className="font-semibold">{detail.readings[key as Metric].text}</dd></div>)}</dl><p className="mt-3 text-xs font-semibold">Supply-air assessment: {detail.response}</p><p className="mt-2 text-xs text-slate-500">Command-based assessment, not proof of equipment performance. Thresholds ported from HVAC Intelligence.</p>{detail.faults.map(f=><p key={f} className="mt-2 rounded bg-yellow-100 p-2 text-xs text-yellow-950">{f}</p>)}</>}</div>
        <div className="rounded-lg border border-slate-200 p-4"><h2 className="text-sm font-bold">Observed mode / quality changes</h2><div className="mt-2 max-h-52 overflow-auto text-xs">{transitions.map((t,i)=><p className="border-b py-2" key={`${t.id}-${t.point.at}-${i}`}><strong>{labelFor(t.id)}</strong><br/>{new Date(t.point.at).toLocaleString()} · {t.point.mode} · {t.point.quality}{t.initial?" (first observed)":""}</p>)}{!transitions.length&&<p>No observations in this range.</p>}</div></div>
      </div>
    </section>
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-sm font-bold">Targeted recording</h2><p className="mt-1 text-xs text-slate-600">Records up to 8 selected units. Use Site history storage to record entire arrays or the site. Recording targets remain fixed when graph selection changes. 64 MiB total storage cap; 5 GiB free-disk reserve. No automatic deletion.</p><div className="mt-3 flex flex-wrap items-center gap-3">{active?<><span className="text-sm"><Circle size={10} className="mr-1 inline text-red-600"/>{active.state} · {active.samples} saved samples · ends {new Date(active.endsAt).toLocaleString()}</span><button className={button} disabled={busy} onClick={()=>record(active.id)}>Stop recording</button><p className="w-full text-xs">Fixed targets: {active.labels.join("; ")}</p></>:<><label className="text-xs">Hours <input aria-label="Recording duration hours" className={`${button} w-20`} type="number" min="0.1" max="24" step="0.1" value={hours} onChange={e=>setHours(e.target.value)}/></label><button className={button} disabled={busy||!selected.length||selected.length>8||!!session} onClick={()=>record()}>Record these {selected.length} units</button></>}</div>{view.sessions.filter(s=>s.error).map(s=><p key={s.id} className="mt-2 text-xs text-red-800">Recording {new Date(s.startedAt).toLocaleString()}: {s.error}</p>)}</section>
  </div>;
}
