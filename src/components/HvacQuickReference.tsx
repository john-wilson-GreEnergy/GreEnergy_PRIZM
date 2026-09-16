import React, { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, CircleOff, Wind } from "lucide-react";
import { getHvacFeedbackProfile, supportsFanSpeedFeedback } from "../lib/hvacFeedbackProfile";

type UnitState = "RUNNING" | "OFF" | "ATTENTION" | "OFFLINE" | "UNKNOWN";
type UnitMode = "IDLE" | "HEATING" | "COOLING" | "FAULT";
const n = (...values: any[]) => { for (const value of values) { const parsed=Number(value); if(value!==null&&value!==""&&Number.isFinite(parsed)) return parsed; } return null; };
const arrayOf = (d:any) => n(d?.arrayIndex,d?.arrayNumber,d?.topology?.arrayIndex,d?.topology?.arrayNumber,String(d?.ip||d?.deviceIp||"").split(".")[2]);
const segmentOf = (d:any) => {
  const label=String(d?.segmentLabel||d?.topology?.segmentLabel||d?.displayName||d?.entityDescription||"");
  if(/\bCS\b|collection/i.test(label)||Number(String(d?.ip||d?.deviceIp||"").split(".")[3])===3) return {order:0,label:"CS"};
  const match=label.match(/\bES\s*([0-9]+)/i); if(match) return {order:Number(match[1]),label:`ES${match[1]}`};
  const direct=n(d?.energySegmentIndex,d?.energySegmentNumber,d?.energySegment,d?.segmentIndex,d?.stringIndex,d?.topology?.segmentIndex);
  if(direct!==null) return {order:direct,label:`ES${direct}`};
  const host=Number(String(d?.ip||d?.deviceIp||"").split(".")[3]); const inferred=Math.round((host-5)/5);
  return inferred>0?{order:inferred,label:`ES${inferred}`}:{order:999,label:"Segment ?"};
};
const stateOf = (device:any,data:any,fallbackUseRpm=false):UnitState => {
  if(device?.reachable===false) return "OFFLINE"; if(!data) return "UNKNOWN";
  const commanded=!!(data.fanLowOn||data.fanHighOn||data.compressorOn||data.electricHeatOn||data.reversingValveOn);
  const reportedProfile=getHvacFeedbackProfile(device?.hvacType);
  const rpmSupported=reportedProfile==="unknown"?fallbackUseRpm:supportsFanSpeedFeedback(device?.hvacType);
  const active=(n(data.currentA)||0)>0.2||(rpmSupported&&(n(data.fanSpeedRpm)||0)>0);
  return commanded!==active?"ATTENTION":active?"RUNNING":"OFF";
};
const modeOf = (data:any,state:UnitState):UnitMode => {
  if(state==="ATTENTION"||state==="OFFLINE"||state==="UNKNOWN") return "FAULT";
  const reported=String(data?.mode||data?.operatingMode||"").toUpperCase();
  if(reported.includes("HEAT")) return "HEATING";
  if(reported.includes("COOL")) return "COOLING";
  if(data?.electricHeatOn||data?.reversingValveOn) return "HEATING";
  if(data?.compressorOn) return "COOLING";
  return "IDLE";
};
const modeTone:Record<UnitMode,string>={IDLE:"border-slate-300 bg-slate-300 text-slate-700",HEATING:"border-red-500 bg-red-500 text-white",COOLING:"border-blue-500 bg-blue-500 text-white",FAULT:"border-yellow-400 bg-yellow-300 text-yellow-950"};

export default function HvacQuickReference({devices=[],fallbackUseRpm=false}:{devices?:any[];fallbackUseRpm?:boolean}){
  const [selected,setSelected]=useState<number|null>(null);
  const groups=useMemo(()=>{const map=new Map<number,any[]>();for(const device of devices||[]){const array=arrayOf(device);if(!array)continue;const segment=segmentOf(device);const reportedProfile=getHvacFeedbackProfile(device?.hvacType);const rpmSupported=reportedProfile==="unknown"?fallbackUseRpm:supportsFanSpeedFeedback(device?.hvacType);const profileLabel=reportedProfile==="unknown"?(fallbackUseRpm?"Bergstrom (fallback)":"Dometic (fallback)"):(reportedProfile==="bergstrom"?"Bergstrom":"Dometic");const units=[1,2].map(unit=>{const data=unit===1?device?.hvac1:device?.hvac2;const state=stateOf(device,data,fallbackUseRpm);const mode=modeOf(data,state);const commanded=!!(data?.fanLowOn||data?.fanHighOn||data?.compressorOn||data?.electricHeatOn||data?.reversingValveOn);const active=(n(data?.currentA)||0)>0.2||(rpmSupported&&(n(data?.fanSpeedRpm)||0)>0);let issue="";if(state==="OFFLINE")issue="Feather controller is not reachable";else if(commanded&&!active)issue=rpmSupported?"Commanded on, but no current or fan activity detected":"Commanded on, but no current detected";else if(!commanded&&active)issue=rpmSupported?"Current or fan activity detected without an active command":"Current detected without an active command";else if(state==="UNKNOWN")issue="HVAC telemetry not reported";return{unit,data,state,mode,commanded,active,issue,ip:device?.ip||device?.deviceIp||"--",rpmSupported,profileLabel,...segment};});const rows=map.get(array)||[];rows.push({segment,...segment,units});map.set(array,rows);}return[...map.entries()].sort(([a],[b])=>a-b).map(([id,segments])=>({id,segments:segments.sort((a,b)=>a.order-b.order)}));},[devices,fallbackUseRpm]);
  const current=groups.find(g=>g.id===selected);
  const SegmentTile=({segment,large=false}:{segment:any;large?:boolean})=><div title={`${segment.label} · ${segment.units[0]?.ip||"--"}`} className={`rounded border border-slate-200 bg-white text-center ${large?"p-2":"p-1"}`}><strong className={`block truncate font-mono uppercase text-slate-600 ${large?"text-[9px]":"text-[7px]"}`}>{segment.label}</strong><div className={`mt-1 grid grid-cols-2 ${large?"gap-1.5":"gap-1"}`}>{segment.units.map((u:any)=><span key={u.unit} title={`${segment.label} · HVAC ${u.unit}\n${u.issue||u.mode}\nEquipment: ${u.profileLabel}\nCommand: ${u.commanded?"On":"Off"}\nCurrent: ${n(u.data?.currentA)?.toFixed(1)??"--"} A\nFan: ${n(u.data?.fanSpeedRpm)?.toFixed(0)??"--"} RPM${u.rpmSupported?" (feedback)":" (diagnostic only; ignored for state)"}\nIP: ${u.ip}`} className={`grid cursor-help place-items-center rounded border font-black ${modeTone[u.mode as UnitMode]} ${large?"h-8 text-[10px]":"h-4 text-[7px]"}`}>{u.unit}</span>)}</div></div>;
  return <section className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3"><div className="flex items-center gap-2"><div className="rounded-md bg-sky-50 p-2 text-sky-600"><Wind size={16}/></div><div><h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-900">Site HVAC Quick Reference</h3><p className="text-[8px] text-slate-500">Each segment tile shows HVAC 1 and HVAC 2 operating mode</p></div></div><div className="flex gap-3 text-[8px] font-bold uppercase"><span className="text-slate-500">■ Idle / Off</span><span className="text-red-600">■ Heating</span><span className="text-blue-600">■ Cooling</span><span className="text-yellow-600">■ Fault</span></div></div>
    {groups.length?<><div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">{groups.map(group=>{const units=group.segments.flatMap(s=>s.units),issues=units.filter(u=>u.mode==="FAULT").length,isSelected=selected===group.id;return <button key={group.id} onClick={()=>setSelected(isSelected?null:group.id)} className={`rounded-lg border p-3 text-left transition hover:shadow-sm ${isSelected?"border-sky-500 bg-sky-50/40 ring-2 ring-sky-100":issues?"border-yellow-400 bg-yellow-50/30":"border-slate-200 bg-slate-50/40"}`}><div className="mb-3 flex items-center justify-between"><strong className="text-[11px] uppercase text-slate-900">Array {group.id}</strong><span className="flex items-center gap-1 text-[8px] font-bold uppercase text-slate-500">{issues?`${issues} fault${issues===1?"":"s"}`:"Normal"}{isSelected?<ChevronDown size={12}/>:<ChevronRight size={12}/>}</span></div><div className="grid grid-cols-7 gap-1">{group.segments.map(segment=><SegmentTile key={segment.label} segment={segment}/>)}</div></button>})}</div>
    {current&&<div className="border-t border-slate-200 bg-slate-50 p-4"><div className="mb-3 flex items-center justify-between"><div><strong className="text-[11px] uppercase text-slate-900">Array {current.id} HVAC detail</strong><p className="mt-0.5 text-[8px] text-slate-500">Hover either numbered unit for command, amperage, RPM, IP, and fault detail</p></div><button onClick={()=>setSelected(null)} className="rounded border border-slate-200 bg-white px-3 py-1.5 text-[8px] font-bold uppercase text-slate-600">Close</button></div><div className="grid grid-cols-4 gap-2 sm:grid-cols-7 lg:grid-cols-11 xl:grid-cols-21">{current.segments.map(segment=><SegmentTile key={segment.label} segment={segment} large/>)}</div></div>}</>:<div className="p-5 text-center text-[10px] text-slate-500">HVAC telemetry has not been reported in the current snapshot.</div>}
  </section>;
}
