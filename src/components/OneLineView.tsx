import React, { useEffect, useMemo, useState } from "react";
import { BatteryCharging, Check, ChevronRight, CircleOff, Factory, RefreshCw, X } from "lucide-react";
import { useSiteData } from "../context/SiteDataContext";
import StringCommunicationIndicator, { stringCommunicationStatus } from "./StringCommunicationIndicator";

type Rotation = "IN" | "OUT" | "UNKNOWN";
const num = (...values: any[]) => { for (const value of values) { const n = Number(value); if (value !== null && value !== "" && Number.isFinite(n)) return n; } return null; };
const rotation = (row: any): Rotation => {
  const value = String(row?.rotationStatus ?? row?.rotationState ?? row?.stringRotationState ?? row?.rotation?.displayState ?? "").trim().toUpperCase();
  if (["IN", "IN_ROTATION", "IN ROTATION", "READY"].includes(value) || row?.inRotation === true || row?.outRotation === false) return "IN";
  if (["OUT", "OUT_OF_ROTATION", "OUT OF ROTATION", "DISABLED"].includes(value) || row?.outRotation === true || row?.inRotation === false) return "OUT";
  return "UNKNOWN";
};
const fmt = (value: any, suffix = "", digits = 1) => { const n = num(value); return n === null ? "--" : `${n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}${suffix}`; };
const colors: Record<Rotation, { border: string; line: string; text: string; label: string }> = {
  IN: { border: "border-emerald-400", line: "bg-emerald-400", text: "text-emerald-700", label: "In rotation" },
  OUT: { border: "border-amber-400", line: "bg-amber-400", text: "text-amber-700", label: "Out of rotation" },
  UNKNOWN: { border: "border-slate-300", line: "bg-slate-300", text: "text-slate-500", label: "Not reported" },
};

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-baseline justify-between gap-3 border-b border-slate-200 py-2 last:border-0"><span className="text-[10px] font-semibold text-slate-500">{label}</span><strong className="text-right font-mono text-[11px] text-slate-900">{value}</strong></div>;
}

export default function OneLineView({ active = true }: { active?: boolean }) {
  const { snapshot, refreshNow, lastUpdated } = useSiteData();
  const [arrayId, setArrayId] = useState<number | null>(null);
  const [stringId, setStringId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const strings = useMemo(() => snapshot?.normalized?.strings || snapshot?.rollups?.stringSummary?.tableRows || [], [snapshot]);
  const pcs = useMemo(() => snapshot?.normalized?.pcs || snapshot?.rollups?.pcsSummary || [], [snapshot]);
  const summaries = useMemo(() => snapshot?.rollups?.arraySummary || [], [snapshot]);
  const arrays = useMemo(() => {
    const ids = new Set<number>();
    [...strings, ...pcs, ...summaries].forEach((row: any) => { const id = num(row?.arrayNumber, row?.arrayIndex, row?.array); if (id && id > 0) ids.add(id); });
    return [...ids].sort((a,b) => a-b).map(id => {
      const rows = strings.filter((r:any) => num(r?.arrayNumber,r?.arrayIndex,r?.array) === id).sort((a:any,b:any)=>(num(a?.stringNumber,a?.stringIndex)||0)-(num(b?.stringNumber,b?.stringIndex)||0));
      const inverter = pcs.find((r:any) => num(r?.arrayNumber,r?.arrayIndex,r?.array) === id);
      const summary = summaries.find((r:any) => num(r?.arrayNumber,r?.arrayIndex,r?.array) === id);
      const soc = num(summary?.socPct,summary?.averageSocPct,summary?.avgSocPct,summary?.onlineSOC,rows.length ? rows.reduce((sum:number,r:any)=>sum+(num(r?.socPct,r?.soc)||0),0)/rows.length : null);
      return { id, rows, inverter, summary, soc, state: rotation(inverter) };
    });
  }, [strings, pcs, summaries]);
  const array = arrays.find(a => a.id === arrayId) || null;
  const string = array?.rows.find((r:any) => num(r?.stringNumber,r?.stringIndex) === stringId) || null;
  useEffect(() => { if (arrayId !== null && !arrays.some(a => a.id === arrayId)) { setArrayId(null); setStringId(null); } }, [arrays,arrayId]);
  useEffect(() => setStringId(null), [arrayId]);
  if (!active) return null;
  const system = () => { setArrayId(null); setStringId(null); };
  const refresh = async () => { setRefreshing(true); try { await refreshNow(true); } finally { setRefreshing(false); } };
  const avgSoc = arrays.length ? arrays.reduce((sum,a)=>sum+(a.soc||0),0)/arrays.length : null;

  return <div className="p-4 font-sans"><section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
      <nav className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        <button onClick={system} className={`rounded px-2 py-1.5 hover:bg-slate-100 ${arrayId===null?"text-emerald-700":"text-slate-600"}`}>System</button>
        {arrayId!==null && <><ChevronRight size={12}/><button onClick={()=>setStringId(null)} className={`rounded px-2 py-1.5 hover:bg-slate-100 ${stringId===null?"text-emerald-700":"text-slate-600"}`}>Array {arrayId}</button></>}
        {stringId!==null && <><ChevronRight size={12}/><span className="rounded bg-emerald-50 px-2 py-1.5 text-emerald-700">String {stringId}</span></>}
      </nav>
      <div className="flex items-center gap-3 text-[9px] font-semibold uppercase text-slate-400"><span>{lastUpdated?`Updated ${new Date(lastUpdated).toLocaleTimeString()}`:"Waiting for telemetry"}</span><button onClick={refresh} disabled={refreshing} className="flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={11} className={refreshing?"animate-spin":""}/>Refresh</button></div>
    </header>
    <div className="grid min-h-[690px] grid-cols-1 lg:grid-cols-[230px_minmax(480px,1fr)_290px]">
      <aside className="border-b border-slate-200 bg-slate-50 p-5 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2 border-b border-slate-200 pb-4"><div className="rounded-lg bg-slate-800 p-2 text-white"><Factory size={18}/></div><div><h2 className="text-sm font-extrabold text-slate-900">{string?`String ${arrayId} :: ${stringId}`:array?`Array ${arrayId}`:"System Details"}</h2><p className="text-[9px] uppercase tracking-wider text-slate-400">Live one-line context</p></div></div>
        <div className="mt-5">{!array ? <><Metric label="Arrays ready" value={`${arrays.filter(a=>a.state==="IN").length} / ${arrays.length||"--"}`}/><Metric label="Average SoC" value={fmt(avgSoc,"%",0)}/><Metric label="Strings monitored" value={strings.length||"--"}/><Metric label="Strings out" value={strings.filter((r:any)=>rotation(r)==="OUT").length}/></> : !string ? <><Metric label="PCS rotation" value={colors[array.state].label}/><Metric label="PCS state" value={array.inverter?.state||array.inverter?.status||"--"}/><Metric label="Array SoC" value={fmt(array.soc,"%",0)}/><Metric label="Strings" value={array.rows.length}/><Metric label="Online strings" value={array.summary?.onlineStringCount??"--"}/><Metric label="Measured power" value={fmt(array.inverter?.acRealPowerKW," kW")}/><Metric label="Commanded power" value={fmt(array.inverter?.acCmdRealPowerKW," kW")}/></> : <><Metric label="Rotation" value={colors[rotation(string)].label}/><Metric label="Communication" value={stringCommunicationStatus(string)==="unverified"?"Unverified (array totals)":string.communicating===true?"Communicating":string.communicating===false?"Not communicating":"Not reported"}/><Metric label="Contactors" value={[string.positiveContactorClosed,string.negativeContactorClosed].map(v=>v===true?"Closed":v===false?"Open":"?").join(" / ")}/><Metric label="Energy segment" value={string.energySegment??string.energySegmentNumber??string.segmentNumber??"--"}/><Metric label="Side" value={string.side||((stringId||0)%2?"A-side":"B-side")}/><Metric label="Controller IP" value={string.stringControllerIp||string.controllerIp||string.controllerIP||string.ipAddress||string.deviceIp||string.ip||"--"}/></>}</div>
      </aside>
      <main className="overflow-auto bg-[#f6f7f9] p-6"><div className="mx-auto max-w-[760px]">
        <div className="mb-5 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-full border-2 border-emerald-400 bg-white shadow-sm"><Factory size={20}/></div><div className="h-px flex-1 bg-slate-400"/><span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Block bus</span></div>
        {!array ? <div className="relative pl-8"><div className="absolute bottom-5 left-3 top-0 w-0.5 bg-emerald-400"/><div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">{arrays.map(a=><div key={a.id} className="relative border-t border-slate-400 pt-5 before:absolute before:-left-5 before:-top-px before:h-px before:w-5 before:bg-slate-400"><div className={`absolute left-5 top-0 h-5 w-0.5 ${colors[a.state].line}`}/><button onClick={()=>setArrayId(a.id)} className={`relative w-full rounded-md border-2 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${colors[a.state].border}`}><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><BatteryCharging size={18} className="text-slate-500"/>Array {a.id}</span>{a.state==="IN"?<Check size={19} strokeWidth={3} className="text-emerald-500"/>:<CircleOff size={18} className={colors[a.state].text}/>}</div><div className="mt-4 grid grid-cols-2 gap-3"><div><span className="block text-[9px] text-slate-400">PCS rotation</span><strong className="text-[11px] text-slate-700">{a.state==="IN"?"Ready":colors[a.state].label}</strong></div><div><span className="block text-[9px] text-slate-400">State of charge</span><strong className="font-mono text-[13px]">{fmt(a.soc,"%",0)}</strong></div></div>{a.rows.some((r:any)=>stringCommunicationStatus(r)==="lost")&&<span className="mt-3 block rounded bg-red-50 p-2 text-[10px] font-bold text-red-800">No communication: String {a.rows.filter((r:any)=>stringCommunicationStatus(r)==="lost").map((r:any)=>r.stringNumber??r.stringIndex).join(", ")}</span>}</button></div>)}</div></div>
        : <div className="relative pl-8"><div className="absolute bottom-6 left-3 top-0 w-0.5 bg-emerald-400"/><button onClick={()=>setStringId(null)} className={`relative mb-7 ml-4 w-[210px] rounded-md border-2 bg-white p-3 text-left shadow-sm ${colors[array.state].border}`}><strong>PCS {array.id}</strong><span className={`ml-3 text-[9px] font-bold ${colors[array.state].text}`}>{array.state==="IN"?"Ready":colors[array.state].label}</span></button><div className="ml-4 border-l border-dashed border-slate-400 pl-7"><h3 className="mb-5 flex items-center gap-2 text-xs font-extrabold text-slate-700"><BatteryCharging size={16}/>Array {array.id}<span className="font-normal text-slate-400">· {array.rows.length} strings</span></h3><div className="grid grid-cols-2 gap-x-8 gap-y-4">{array.rows.map((row:any)=>{const id=num(row?.stringNumber,row?.stringIndex)||0;const state=rotation(row);const commLost=stringCommunicationStatus(row)==="lost";return <div key={id} className="relative border-t border-slate-300 pt-3"><div className={`absolute left-5 top-0 h-3 w-0.5 ${colors[state].line}`}/><button onClick={()=>setStringId(id)} className={`w-full rounded-md border-2 bg-white px-3 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${commLost?"border-red-600":colors[state].border} ${id===stringId?"ring-2 ring-blue-400 ring-offset-2":""}`}><div className="flex items-center justify-between"><strong className="text-[11px]">{array.id} :: {id}</strong>{commLost?<span className="font-bold text-red-800">!</span>:state==="IN"?<Check size={14} strokeWidth={3} className="text-emerald-500"/>:<CircleOff size={13} className={colors[state].text}/>}</div><StringCommunicationIndicator row={row}/><div className="mt-2 flex items-center gap-2"><span className="text-[9px] text-slate-400">SoC</span><strong className="font-mono text-[10px]">{fmt(row?.socPct??row?.soc,"%",0)}</strong><div className="h-1 flex-1 rounded bg-slate-100"><div className="h-full rounded bg-sky-400" style={{width:`${Math.max(0,Math.min(100,num(row?.socPct,row?.soc)||0))}%`}}/></div></div></button></div>})}</div></div></div>}
      </div></main>
      <aside className="border-t border-slate-200 p-5 lg:border-l lg:border-t-0"><div className="flex items-center justify-between border-b border-slate-200 pb-3"><div><h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">{string?"String telemetry":array?"Array telemetry":"One-line guide"}</h3><p className="mt-1 text-[9px] text-slate-400">{string?`Array ${arrayId} · String ${stringId}`:array?`Array ${arrayId}`:"Select equipment to inspect"}</p></div>{array&&<button onClick={string?()=>setStringId(null):system} aria-label="Close details" className="rounded p-1 text-slate-400 hover:bg-slate-100"><X size={15}/></button>}</div>
        {!array?<div className="mt-5 space-y-4 text-[11px] leading-5 text-slate-500"><p>Select an array in the center diagram to reveal its PCS branch and every string.</p><p>Rotation color remains visible throughout the workflow.</p><div className="space-y-2 rounded-lg bg-slate-50 p-3 text-[9px] font-bold uppercase">{(["IN","OUT","UNKNOWN"] as Rotation[]).map(state=><span key={state} className={`flex items-center gap-2 ${colors[state].text}`}><i className={`h-2.5 w-2.5 rounded-full ${colors[state].line}`}/>{colors[state].label}</span>)}</div></div>
        :!string?<div className="mt-4"><Metric label="DC voltage" value={fmt(array.inverter?.dcVoltageVolt," V")}/><Metric label="DC current" value={fmt(array.inverter?.dcCurrentAmp," A")}/><Metric label="AC voltage" value={fmt(array.inverter?.acVoltageAB," V")}/><Metric label="Frequency" value={fmt(array.inverter?.frequencyHz??array.inverter?.acFrequencyHz," Hz",2)}/><Metric label="Strings in rotation" value={array.rows.filter((r:any)=>rotation(r)==="IN").length}/><Metric label="Strings out" value={array.rows.filter((r:any)=>rotation(r)==="OUT").length}/></div>
        :<div className="mt-4"><StringCommunicationIndicator row={string}/><Metric label="State of charge" value={fmt(string.socPct??string.soc,"%")}/><Metric label="Current" value={fmt(string.amps??string.currentAmp," A")}/><Metric label="Power" value={fmt(string.kw??string.powerKW," kW")}/><Metric label="Measured voltage" value={fmt(string.measuredVoltage??string.measuredVoltageV," V",0)}/><Metric label="Calculated voltage" value={fmt(string.calculatedVoltage??string.calculatedVoltageV," V",0)}/><Metric label="Bus voltage" value={fmt(string.busVoltage??string.busVoltageV," V",0)}/><h4 className="mb-1 mt-5 text-[9px] font-extrabold uppercase tracking-widest text-slate-400">Cell voltage</h4><Metric label="Minimum" value={fmt(string.minCellVoltageMv??string.minCellVoltage," mV",0)}/><Metric label="Average" value={fmt(string.avgCellVoltageMv??string.averageCellVoltage," mV",0)}/><Metric label="Maximum" value={fmt(string.maxCellVoltageMv??string.maxCellVoltage," mV",0)}/><h4 className="mb-1 mt-5 text-[9px] font-extrabold uppercase tracking-widest text-slate-400">Cell temperature</h4><Metric label="Minimum" value={fmt(string.minCellTempC??string.minTemperatureC," °C")}/><Metric label="Average" value={fmt(string.avgCellTempC??string.averageTemperatureC," °C")}/><Metric label="Maximum" value={fmt(string.maxCellTempC??string.maxTemperatureC," °C")}/></div>}
      </aside>
    </div>
  </section></div>;
}
