import React, {useEffect, useRef, useState} from "react";
import {CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis} from "recharts";
import type {TimelineReport} from "../server/history/operationalTimelineModel";
import BalancingProgressReview from "./BalancingProgressReview";

type Status = {enabled: boolean; site: string | null; lastSaved: number | null; error: string | null; droppedBatches: number; droppedCommands?: number; retentionDays: number; pendingBatches?: number; pendingCommands?: number; lastDropReason?: string | null};
export function TimelineRecorderStatus({status}: {status: Status}) {
  return <p className="text-xs my-2">Recorder {status.enabled ? "enabled" : "disabled"} · last saved {status.lastSaved ? new Date(status.lastSaved).toLocaleString() : "not yet"} · telemetry batches pending: {status.pendingBatches ?? "unknown"} · command entries pending: {status.pendingCommands ?? "unknown"} · unsaved / incomplete telemetry batches: {status.droppedBatches} · unsaved command entries: {status.droppedCommands ?? 0}{status.lastDropReason ? ` · Last recording loss: ${status.lastDropReason}` : ""}{status.error ? ` · PAUSED: ${status.error}` : ""} · counters since server start</p>;
}
const metrics = {kw: "Real power (kW)", kvar: "Reactive power (kVAR)", dcV: "DC voltage (V)", dcA: "DC current (A)"};
export function TimelineResults({report}: {report: TimelineReport}) {
  const [metric, setMetric] = useState<keyof typeof metrics>("kw");
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [report]);
  return <>
    <p className="my-2 text-xs text-prizm-text-muted">{report.site} · Array {report.array} · {new Date(report.from).toLocaleString()} – {new Date(report.to).toLocaleString()} · {report.samples.toLocaleString()} observations</p>
    {!report.samples && <p className="p-3 border border-amber-300 bg-amber-50 text-amber-900">No saved observations in this window. Recording begins with this installation; earlier history is not backfilled.</p>}
    {report.selectedString && <p className="text-xs my-2">String {report.selectedString} selected; array-wide commands and PCS context remain included.</p>}
    <p className="text-xs my-2 text-prizm-text-muted">Block-wide EMS app states and power commands are included for every array. Reported app setpoints are settings, not measured site power.</p>
    <details className="my-3"><summary className="cursor-pointer text-xs font-bold">Observation coverage &amp; gaps · {report.coverage.length} streams</summary><div className="flex flex-wrap gap-3 my-3">{report.coverage.map(row => <div key={row.label + row.stream} className="rounded border border-prizm-border p-2 text-xs"><strong>{row.label} · {row.stream}</strong><div>Observed coverage: {row.coverage} · longest gap: {row.longestGap}</div></div>)}</div></details>
    {report.points.length > 0 && <>
      <label className="text-xs">Electrical trend <select aria-label="Timeline metric" className="border border-prizm-border rounded p-2 ml-2" value={metric} onChange={event => setMetric(event.target.value as keyof typeof metrics)}>{Object.entries(metrics).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <p className="text-xs text-prizm-text-muted my-2">One recorded observation per minute, shown as points without interpolation. These are not interval averages or captured peaks.</p>
      <div className="h-56 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={report.points} margin={{left: 16, right: 24, top: 12, bottom: 12}}>
        <CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="at" type="number" domain={[report.from, report.to]} tickFormatter={value => new Date(value).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})}/><YAxis domain={["auto", "auto"]}/><Tooltip labelFormatter={value => new Date(Number(value)).toLocaleString()}/>
        <Line name={metrics[metric]} dataKey={metric} stroke="#0284c7" strokeWidth={0} dot={{r: 2}} activeDot={{r: 5}} isAnimationActive={false} connectNulls={false}/>
      </LineChart></ResponsiveContainer></div>
    </>}
    {report.balancing && <BalancingProgressReview report={report.balancing} selectedString={report.selectedString}/>}
    <h3 className="font-bold text-sm mt-4">State changes &amp; recorded PRIZM commands</h3>
    <p className="text-xs text-prizm-text-muted mb-2">Observed changes are not command acknowledgments or fault diagnoses. Command results are labeled separately and do not prove causation. Commands issued through Kobold or other tools are not captured here. Unobserved transitions during gaps are unknown. Times use this browser’s local timezone.</p>
    {report.eventsTruncated && <p className="text-amber-800 text-xs">Showing the latest 300 events. Choose a shorter window for earlier detail.</p>}
    {report.samples > 0 && !report.events.length && <p className="text-xs">No recorded state changes in this window. Check coverage before concluding the equipment was unchanged.</p>}
    <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-xs text-left"><thead><tr><th className="p-2">Recorded at</th><th className="p-2">Target</th><th className="p-2">Evidence</th><th className="p-2">Source</th><th className="p-2">Detail</th></tr></thead><tbody>{report.events.slice(page * 20, (page + 1) * 20).map((event, i) => <tr key={i} className="border-t border-prizm-border align-top"><td className="p-2 whitespace-nowrap">{new Date(event.at).toLocaleString()}</td><td className="p-2 whitespace-nowrap">{event.label}</td><td className="p-2">{event.kind === "command" ? "COMMAND" : "OBSERVED"}</td><td className="p-2">{event.source}</td><td className="p-2 min-w-[260px]">{event.message}{event.commandId && <div className="text-prizm-text-muted mt-1 break-all">Command ID: {event.commandId}</div>}</td></tr>)}</tbody></table></div>
    {report.events.length > 20 && <div className="flex gap-3 items-center text-xs mt-3"><button disabled={!page} onClick={() => setPage(p => p - 1)}>Previous events</button><span>Page {page + 1} of {Math.ceil(report.events.length / 20)}</span><button disabled={(page + 1) * 20 >= report.events.length} onClick={() => setPage(p => p + 1)}>Next events</button></div>}
  </>;
}
export default function PcsOperationalTimeline({arrays}: {arrays: number[]}) {
  const [open, setOpen] = useState(false), [array, setArray] = useState(arrays[0] || 1), [hours, setHours] = useState(1);
  const [string, setString] = useState(0), [strings, setStrings] = useState<number[]>([]);
  const [status, setStatus] = useState<Status | null>(null), [report, setReport] = useState<TimelineReport | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {if (!arrays.includes(array) && arrays.length) {request.current?.abort(); setArray(arrays[0]); setString(0); setStrings([]); setReport(null);}}, [arrays.join(","), array]);
  async function load() {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(null); setReport(null);
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    try {
      const statusResponse = await fetch("/api/local/site-data/operational-timeline", {signal: controller.signal});
      if (!statusResponse.ok) throw new Error("Unable to read recorder status");
      const nextStatus: Status = await statusResponse.json(); setStatus(nextStatus);
      if (!nextStatus.enabled) throw new Error("Operational timeline is disabled on this installation");
      const response = await fetch(`/api/local/site-data/operational-timeline/review?array=${array}&hours=${hours}${string ? `&string=${string}` : ""}`, {signal: controller.signal});
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to load timeline");
      if (!controller.signal.aborted && request.current === controller) {setReport(data); setStrings(data.strings || []);}
    } catch (e) {if (request.current === controller) setError(e instanceof Error ? e.message : String(e));}
    finally {window.clearTimeout(timeout); if (request.current === controller) setBusy(false);}
  }
  function exportReport() {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], {type: "application/json"}));
    const link = document.createElement("a"); link.href = url; link.download = `prizm-history-array-${report.array}${report.selectedString ? `-string-${report.selectedString}` : ""}-${report.to}.json`; link.click(); URL.revokeObjectURL(url);
  }
  return <details className="rounded border border-prizm-border bg-white p-4 mb-5" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer font-bold text-sm">Operational history &amp; incident timeline</summary>
    {open && <div className="mt-3">
      <p className="text-xs text-prizm-text-muted mb-3">Seven-day local recording from existing telemetry. Review balancing progress, PCS readings, string contactor requests and feedback, rotation, EMS app states and power settings, and PRIZM command results. This review never sends equipment commands.</p>
      <p className="text-xs text-prizm-text-muted mb-3">Historical reviews refresh on request and may reuse a result for up to 30 seconds. Live telemetry above continues independently.</p>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label>Array <select disabled={busy} value={array} onChange={e => {setArray(Number(e.target.value)); setString(0); setStrings([]); setReport(null);}} className="border rounded p-2">{arrays.map(id => <option key={id} value={id}>Array {id}</option>)}</select></label>
        <label>Target <select disabled={busy} value={string} onChange={e => {setString(Number(e.target.value)); setReport(null);}} className="border rounded p-2"><option value={0}>All recorded targets</option>{strings.map(id => <option key={id} value={id}>String {id}</option>)}</select></label>
        <label>Window <select disabled={busy} value={hours} onChange={e => {setHours(Number(e.target.value)); setReport(null);}} className="border rounded p-2">{[1, 12, 24].map(h => <option key={h} value={h}>Last {h} hour{h > 1 ? "s" : ""}</option>)}</select></label>
        <button disabled={busy || !arrays.length} onClick={load} className="rounded border border-sky-500 text-sky-800 px-3 py-2 disabled:opacity-50">{busy ? "Building review…" : "Load / refresh review"}</button>
        {report && <button onClick={exportReport} className="border rounded px-3 py-2">Export review</button>}
      </div>
      <p className="text-xs my-2 text-prizm-text-muted">Load once to populate recorded string targets. Steady string states are sampled every minute; observed changes are saved sooner. Storage is capped at 2 GiB with a 5 GiB free-space reserve.</p>
      {status && <TimelineRecorderStatus status={status}/>}
      {error && <p role="alert" className="text-amber-900 bg-amber-50 border border-amber-300 rounded p-3 mt-3 text-xs">{error}</p>}
      {report && <TimelineResults report={report}/>}
    </div>}
  </details>;
}
