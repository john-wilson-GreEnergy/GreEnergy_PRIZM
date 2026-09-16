import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, LayoutGrid, Map, RefreshCw, Save } from "lucide-react";

type ArrayLayout = { arrayIndex: number; physicalLabel: string; zone: string; order: number };
type Presentation = { siteKey: string; updatedAt: string; columns: number; arrays: ArrayLayout[]; segmentLabels: Record<string, string>; energySegmentCount: number };

export default function SitePhysicalLayoutEditor() {
  const [profile, setProfile] = useState<Presentation | null>(null);
  const [selectedArray, setSelectedArray] = useState<number | null>(null);
  const [customerView, setCustomerView] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/local/topology/presentation");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Physical layout is unavailable.");
      setProfile(body);
      setSelectedArray(current => current && body.arrays.some((array: ArrayLayout) => array.arrayIndex === current) ? current : body.arrays[0]?.arrayIndex ?? null);
    } catch (error: any) { setMessage(error?.message || String(error)); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  const selected = useMemo(() => profile?.arrays.find(array => array.arrayIndex === selectedArray) || null, [profile, selectedArray]);
  const updateArray = (arrayIndex: number, update: Partial<ArrayLayout>) => setProfile(current => current ? ({ ...current, arrays: current.arrays.map(array => array.arrayIndex === arrayIndex ? { ...array, ...update } : array) }) : current);
  const moveArray = (arrayIndex: number, direction: -1 | 1) => setProfile(current => {
    if (!current) return current;
    const arrays = [...current.arrays];
    const index = arrays.findIndex(array => array.arrayIndex === arrayIndex);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= arrays.length) return current;
    [arrays[index], arrays[target]] = [arrays[target], arrays[index]];
    return { ...current, arrays: arrays.map((array, order) => ({ ...array, order })) };
  });
  const setSegmentLabel = (key: string, value: string) => setProfile(current => current ? ({ ...current, segmentLabels: { ...current.segmentLabels, [key]: value } }) : current);

  const save = async () => {
    if (!profile) return;
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/local/topology/presentation", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to save the physical layout.");
      setProfile(body); setMessage("Physical layout and labels saved.");
    } catch (error: any) { setMessage(error?.message || String(error)); }
    finally { setSaving(false); }
  };

  if (loading && !profile) return <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white p-8 text-xs text-slate-500"><RefreshCw size={16} className="animate-spin"/>Loading physical layout…</div>;
  if (!profile) return <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-xs text-amber-800">{message || "No discovered topology is available yet."}</div>;

  const segments = [{ key: `${selectedArray}:CS`, ems: "Collection Segment" }, ...Array.from({ length: profile.energySegmentCount || 20 }, (_, index) => ({ key: `${selectedArray}:ES:${index + 1}`, ems: `Energy Segment ${index + 1}` }))];
  return <div className="space-y-5">
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div><div className="flex items-center gap-2"><Map size={16} className="text-emerald-600"/><h3 className="text-sm font-bold uppercase">Physical Layout & Labels</h3></div><p className="mt-1 max-w-3xl text-xs text-slate-500">Adds customer-facing signage and geographical ordering without changing EMS identities, telemetry routes, IPs, or control targets.</p></div>
        <div className="flex flex-wrap items-center gap-2"><div className="flex rounded border border-slate-200 bg-slate-50 p-1 text-[10px] font-bold uppercase"><button onClick={() => setCustomerView(true)} className={`rounded px-3 py-1.5 ${customerView ? "bg-emerald-600 text-white" : "text-slate-500"}`}>Customer labels</button><button onClick={() => setCustomerView(false)} className={`rounded px-3 py-1.5 ${!customerView ? "bg-slate-700 text-white" : "text-slate-500"}`}>EMS labels</button></div><label className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-500">Columns<select aria-label="Layout columns" value={profile.columns} onChange={event => setProfile({ ...profile, columns: Number(event.target.value) })} className="rounded border border-slate-300 bg-white px-2 py-1.5">{[2,3,4,5,6,8].map(value => <option key={value}>{value}</option>)}</select></label><button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded bg-emerald-600 px-3 py-2 text-[10px] font-bold uppercase text-white disabled:opacity-50">{saving ? <RefreshCw size={13} className="animate-spin"/> : <Save size={13}/>}Save layout</button></div>
      </div>
      {message && <div className="mt-3 flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"><CheckCircle2 size={14} className="text-emerald-600"/>{message}</div>}
      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-100 p-4"><div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase text-slate-500"><LayoutGrid size={13}/>Overhead preview · click an array to edit its segments</div><div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${profile.columns}, minmax(150px, 1fr))` }}>{profile.arrays.map((array, index) => { const primary = customerView && array.physicalLabel ? array.physicalLabel : `Array ${array.arrayIndex}`; return <button key={array.arrayIndex} onClick={() => setSelectedArray(array.arrayIndex)} className={`min-h-28 rounded-lg border bg-white p-3 text-left shadow-sm transition ${selectedArray === array.arrayIndex ? "border-emerald-500 ring-2 ring-emerald-100" : "border-slate-200 hover:border-slate-400"}`}><div className="flex justify-between gap-2"><strong className="text-sm text-slate-800">{primary}</strong><span className="text-[9px] font-bold uppercase text-emerald-700">{index + 1}</span></div>{customerView && array.physicalLabel && <div className="mt-1 text-[10px] text-slate-500">EMS: Array {array.arrayIndex}</div>}{!customerView && array.physicalLabel && <div className="mt-1 text-[10px] text-slate-500">Site: {array.physicalLabel}</div>}<div className="mt-5 text-[10px] font-bold uppercase text-slate-400">{array.zone || "Zone not assigned"}</div></button>; })}</div></div>
    </section>

    {selected && <section className="grid gap-5 xl:grid-cols-[minmax(280px,0.7fr)_minmax(520px,1.3fr)]">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><h4 className="text-xs font-bold uppercase">Array {selected.arrayIndex} presentation</h4><div className="mt-4 space-y-3"><label className="block text-[10px] font-bold uppercase text-slate-500">Physical signage label<input value={selected.physicalLabel} onChange={event => updateArray(selected.arrayIndex, { physicalLabel: event.target.value })} placeholder={`Example: North Row ${selected.arrayIndex}`} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-xs normal-case"/></label><label className="block text-[10px] font-bold uppercase text-slate-500">Zone / geographical group<input value={selected.zone} onChange={event => updateArray(selected.arrayIndex, { zone: event.target.value })} placeholder="Example: North field" className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-xs normal-case"/></label><div className="flex gap-2 pt-2"><button onClick={() => moveArray(selected.arrayIndex, -1)} className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-slate-300 px-2 py-2 text-[10px] font-bold uppercase"><ArrowLeft size={12}/>Move earlier</button><button onClick={() => moveArray(selected.arrayIndex, 1)} className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-slate-300 px-2 py-2 text-[10px] font-bold uppercase">Move later<ArrowRight size={12}/></button></div><div className="rounded border border-blue-200 bg-blue-50 p-3 text-[10px] leading-relaxed text-blue-800"><strong>Control safeguard:</strong> these names are display aliases only. Every command continues to target EMS Array {selected.arrayIndex} and its canonical device identity.</div></div></div>
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 p-4"><h4 className="text-xs font-bold uppercase">Array {selected.arrayIndex} segment labels</h4><p className="mt-1 text-[10px] text-slate-500">Collection and energy segments remain distinct. Leave a label blank to use the EMS designation.</p></div><div className="max-h-[440px] overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="p-3">EMS identity</th><th className="p-3">Physical signage label</th><th className="p-3">Preview</th></tr></thead><tbody>{segments.map(segment => <tr key={segment.key} className="border-t border-slate-100"><td className="p-3 font-bold">{segment.ems}</td><td className="p-2"><input aria-label={`${segment.ems} physical label`} value={profile.segmentLabels[segment.key] || ""} onChange={event => setSegmentLabel(segment.key, event.target.value)} placeholder="Optional site label" className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"/></td><td className="p-3 text-[10px] text-slate-500">{customerView && profile.segmentLabels[segment.key] ? <><strong className="block text-slate-700">{profile.segmentLabels[segment.key]}</strong>EMS: {segment.ems}</> : <>{segment.ems}{profile.segmentLabels[segment.key] && <span className="block">Site: {profile.segmentLabels[segment.key]}</span>}</>}</td></tr>)}</tbody></table></div></div>
    </section>}
  </div>;
}
