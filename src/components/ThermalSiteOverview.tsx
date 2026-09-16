import React, {useMemo} from "react";
import {ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend} from "recharts";
import type {ThermalUnit} from "../server/thermal/thermalModel";
import {thermalMetrics, type ThermalMetric, type ThermalReadings} from "../server/thermal/thermalMetrics";

type Unit=ThermalUnit & {readings:ThermalReadings};
type SitePoint={position:number;value:number;id:string;label:string;text:string;unit:number;faults:string[]};
type Props={units:Unit[];metric:ThermalMetric;selected:string[];onChoose:(id:string)=>void;onRank:()=>void};
export default function ThermalSiteOverview({units,metric,selected,onChoose,onRank}:Props){
  const {points,labels,omitted}=useMemo(()=>{
    const positions=new Map<string,number>();const labels:string[]=[];const points:SitePoint[]=[];const omitted:Unit[]=[];
    units.forEach(u=>{
      const key=`${u.array}/${u.segment}`;
      if(!positions.has(key)){positions.set(key,labels.length);labels.push(`Array ${u.array} ${u.segment}`);}
      const reading=u.readings[metric];
      if(reading.state!=="Live"||reading.value===null){omitted.push(u);return;}
      points.push({position:positions.get(key)!,value:reading.value,id:u.id,label:u.label,text:reading.text,unit:u.unit,faults:u.faults});
    });return {points,labels,omitted};
  },[units,metric]);
  const shape=(props:unknown)=>{
    const {cx,cy,payload:p}=props as {cx:number;cy:number;payload:SitePoint};
    return <circle cx={cx} cy={cy} r={selected.includes(p.id)?6:4} fill={p.unit===1?"#0369a1":"#c2410c"} stroke={p.faults.length?"#a16207":selected.includes(p.id)?"#0f172a":"white"} strokeWidth={selected.includes(p.id)||p.faults.length?2:1} role="button" tabIndex={0} aria-label={`Graph ${p.label}: ${p.text}`} onClick={()=>onChoose(p.id)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onChoose(p.id);}}}/>;
  };
  return <section aria-label="Whole-site thermal overview" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-bold">Whole-site outlier overview · {thermalMetrics[metric].label}</h2><button className="rounded border px-3 py-2 text-xs font-semibold" onClick={onRank}>Show highest readings in results</button></div>
    <p className="mt-2 text-xs text-slate-600">Latest cached readings across all arrays, independent of the filters above. {points.length} of {units.length} HVAC units plotted. Click a point to add its segment to detailed history below. Each position is a segment, not a time sample.</p>
    <div className="mt-4 h-80">{points.length?<ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{top:10,right:15,bottom:25,left:10}}>
      <CartesianGrid strokeDasharray="3 3"/><XAxis type="number" dataKey="position" name="Segment" domain={[-0.5,Math.max(0.5,labels.length-0.5)]} ticks={labels.map((_,i)=>i)} interval="preserveStartEnd" minTickGap={20} tick={{fontSize:10}} tickFormatter={i=>labels[Number(i)]||""}/>
      <YAxis type="number" dataKey="value" name={thermalMetrics[metric].label} unit={` ${thermalMetrics[metric].unit}`} domain={["auto","auto"]} width={80} tick={{fontSize:10}}/>
      <Tooltip content={({active,payload})=>{const p=payload?.[0]?.payload as SitePoint|undefined;return active&&p?<div className="rounded border bg-white p-3 text-xs shadow"><strong>{p.label}</strong><p>{p.text}</p>{p.faults.map(f=><p className="text-amber-900" key={f}>{f}</p>)}</div>:null;}}/>
      <Legend wrapperStyle={{fontSize:11}}/>{[1,2].map(unit=><Scatter key={unit} name={`HVAC ${unit}`} data={points.filter(p=>p.unit===unit)} fill={unit===1?"#0369a1":"#c2410c"} shape={shape} isAnimationActive={false}/>)}
    </ScatterChart></ResponsiveContainer>:<p className="grid h-full place-items-center text-sm text-slate-500">No live readings reported for this metric.</p>}</div>
    {!!omitted.length&&<details className="mt-3 text-xs"><summary className="cursor-pointer font-semibold text-amber-900">{omitted.length} stale, unavailable or unreported readings excluded from the plot</summary><div className="mt-2 max-h-40 overflow-auto">{omitted.map(u=><button key={u.id} className="block py-1 text-left text-sky-800 underline" onClick={()=>onChoose(u.id)}>{u.label} · {u.readings[metric].state}</button>)}</div></details>}
    <p className="mt-2 text-xs text-slate-500">Visual comparison, not an automatic fault diagnosis. Shared segment temperatures may overlap. Detailed history remains limited to 8 units; this overview includes the entire site.</p>
  </section>;
}
