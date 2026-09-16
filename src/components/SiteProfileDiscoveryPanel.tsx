import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, RefreshCw } from "lucide-react";

export default function SiteProfileDiscoveryPanel({ onActivated }: { onActivated?: () => void }) {
  const [matrix, setMatrix] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [matrixResponse, draftsResponse] = await Promise.all([
        fetch("/api/local/topology/discovery/matrix"),
        fetch("/api/local/topology/discovery/drafts")
      ]);
      if (!matrixResponse.ok || !draftsResponse.ok) throw new Error("Site discovery services did not return a complete response.");
      const [matrixBody, draftsBody] = await Promise.all([matrixResponse.json(), draftsResponse.json()]);
      setMatrix(matrixBody.sources || []);
      setDrafts(draftsBody.drafts || []);
      setMessage(previous => previous === "Discovery profile data is unavailable." ? "" : previous);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load().catch(() => setMessage("Discovery profile data is unavailable.")); }, []);
  // Prefer the newest usable revision. A newer rejected draft remains preserved
  // for audit history, but must not displace the active/clean site layout.
  const latest = drafts.find(draft => draft.conflicts?.length === 0 && draft.unresolved?.length === 0) || drafts[0] || null;
  const clean = latest && latest.conflicts?.length === 0 && latest.unresolved?.length === 0;
  const availableSources = useMemo(() => matrix.filter(source => source.available === true).length, [matrix]);

  const generateDraft = async () => {
    setBusy(true); setMessage("Building a draft from the latest shared telemetry cache…");
    try {
      const response = await fetch("/api/local/topology/discovery/drafts", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Draft generation failed.");
      setMessage(body.unchanged ? `Evidence is unchanged; revision ${body.draft.revision} remains current.` : `Draft revision ${body.draft.revision} created. It is not active.`);
      await load();
    } catch (error: any) { setMessage(error?.message || String(error)); }
    finally { setBusy(false); }
  };

  const activate = async (draft: any) => {
    if (!window.confirm(`Activate discovered site profile revision ${draft.revision}? The current profile remains available by activating its earlier revision.`)) return;
    setBusy(true); setMessage("Activating reviewed site profile…");
    try {
      const response = await fetch(`/api/local/topology/discovery/drafts/${encodeURIComponent(draft.id)}/activate`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Activation failed.");
      setMessage(`Revision ${draft.revision} is active.`);
      await load(); onActivated?.();
    } catch (error: any) { setMessage(error?.message || String(error)); }
    finally { setBusy(false); }
  };

  return <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm space-y-4">
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div><h3 className="text-sm font-bold uppercase text-slate-800">Site discovery profiles</h3><p className="mt-1 text-xs text-slate-500">Builds versioned drafts from the telemetry PRIZM already collected. Draft creation does not poll equipment or change the active layout.</p></div>
      <button onClick={generateDraft} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded border border-emerald-600 bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><RefreshCw size={14} className={busy ? "animate-spin" : ""}/>Generate draft</button>
    </div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-xs">
      <div className="rounded border border-slate-200 bg-slate-50 p-3"><span className="block text-[10px] font-bold uppercase text-slate-400">Sources ready</span><strong>{loading && !matrix.length ? "Loading…" : `${availableSources}/${matrix.length || "–"}`}</strong></div>
      <div className="rounded border border-slate-200 bg-slate-50 p-3"><span className="block text-[10px] font-bold uppercase text-slate-400">Saved revisions</span><strong>{loading && !drafts.length ? "Loading…" : drafts.length}</strong></div>
      <div className="rounded border border-slate-200 bg-slate-50 p-3"><span className="block text-[10px] font-bold uppercase text-slate-400">Latest lineups</span><strong>{latest?.lineups?.length ?? "–"}</strong></div>
      <div className="rounded border border-slate-200 bg-slate-50 p-3"><span className="block text-[10px] font-bold uppercase text-slate-400">Review state</span><strong className={clean ? "text-emerald-600" : "text-amber-600"}>{latest ? (clean ? "Ready" : "Needs review") : "No draft"}</strong></div>
    </div>
    {message && <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">{message}</div>}
    {latest && <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4"><div className="flex items-center gap-2">{clean ? <CheckCircle2 size={16} className="text-emerald-600"/> : <AlertTriangle size={16} className="text-amber-600"/>}<strong className="text-xs">Revision {latest.revision} · {latest.status}</strong><span className="text-[10px] text-slate-500">{latest.evidenceFingerprint?.slice(0, 12)}</span></div><button onClick={() => activate(latest)} disabled={busy || !clean || latest.status === "active"} className="rounded border border-slate-300 px-3 py-1.5 text-[10px] font-bold uppercase text-slate-700 disabled:opacity-40">{latest.status === "active" ? "Active" : "Activate reviewed draft"}</button></div>
      <div className="overflow-x-auto rounded border border-slate-200"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="p-2">Array</th><th className="p-2">Collection Segment</th><th className="p-2">Energy Segments</th><th className="p-2">Strings</th><th className="p-2">Strings / ES</th><th className="p-2">ES Feathers Mapped</th><th className="p-2">Confidence</th></tr></thead><tbody>{latest.lineups?.map((lineup: any) => <tr key={lineup.lineupIndex} className="border-t border-slate-100"><td className="p-2 font-bold">Array {lineup.lineupIndex}</td><td className="p-2">{lineup.collectionSegmentDeviceIp ? <span><span className="font-bold text-emerald-700">CS</span><span className="ml-2 font-mono text-[10px] text-slate-500">{lineup.collectionSegmentDeviceIp}</span></span> : <span className="text-amber-700">Not mapped</span>}</td><td className="p-2">{lineup.energySegmentCount ?? "Unknown"}</td><td className="p-2">{lineup.stringIndices?.length ?? 0}</td><td className="p-2">{lineup.stringsPerEnergySegment ?? "Unknown"}</td><td className="p-2">{Object.keys(lineup.featherByEnergySegment || {}).length}</td><td className="p-2 capitalize">{lineup.confidence}</td></tr>)}</tbody></table></div>
      {[...(latest.conflicts || []), ...(latest.unresolved || [])].map((issue: any, index: number) => <div key={`${issue.code}-${index}`} className="flex gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800"><AlertTriangle size={14}/><span><strong>{issue.location}:</strong> {issue.message}</span></div>)}
    </div>}
    {!latest && <div className="flex items-center justify-center gap-2 rounded border border-dashed border-slate-300 p-6 text-xs text-slate-500">{loading ? <RefreshCw size={16} className="animate-spin"/> : <Database size={16}/>} {loading ? "Loading saved discovery revisions…" : "Generate a draft after the initial site telemetry cycle completes."}</div>}
  </div>;
}
