import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Cpu, List, Network, RefreshCw, Search, Upload, X } from "lucide-react";

type InventoryRow = { deviceType: "TURTLE" | "BMS" | "SC" | "BPC" | "FEATHER"; arrayIndex?: number; stringIndex?: number; deviceIndex?: number; ipAddress?: string | null; version: string; status: "reported" | "missing" };

function versionText(versions: Record<string, number> = {}) {
  return Object.entries(versions).map(([version, count]) => `${version} (${count})`).join(", ") || "None reported";
}

function inventoryId(row: InventoryRow) {
  if (row.deviceType === "TURTLE") return "EMS-TURTLE";
  const array = `Array ${String(row.arrayIndex ?? 0).padStart(2, "0")}`;
  if (row.deviceType === "BMS") return `${array}-BMS-PHOENIX`;
  if (row.deviceType === "FEATHER") return `${array}-FEATHER-${String(row.deviceIndex ?? 0).padStart(2, "0")}`;
  const string = `S${String(row.stringIndex ?? 0).padStart(3, "0")}`;
  return row.deviceType === "SC" ? `${array}-${string}-SC` : `${array}-${string}-BPC${String(row.deviceIndex ?? 0).padStart(2, "0")}`;
}

export default function FirmwareInventoryPanel() {
  const [snapshot, setSnapshot] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [type, setType] = useState("ALL");
  const [array, setArray] = useState("all");
  const [version, setVersion] = useState("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"list" | "one-line">("list");
  const [updateState, setUpdateState] = useState<any>(null);
  const [updateType, setUpdateType] = useState<"SC" | "BPC">("BPC");
  const [updateVersion, setUpdateVersion] = useState("");
  const [updateScope, setUpdateScope] = useState<"array" | "string">("array");
  const [updateArray, setUpdateArray] = useState("1");
  const [updateString, setUpdateString] = useState("1");
  const [confirmingUpdate, setConfirmingUpdate] = useState(false);
  const [submittingUpdate, setSubmittingUpdate] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");

  const load = async () => {
    const response = await fetch("/api/local/firmware");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Firmware inventory is unavailable.");
    setSnapshot(body.snapshot || null); setRunning(!!body.running);
  };
  const loadUpdateState = async () => {
    const response = await fetch("/api/local/firmware/updates");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Firmware update options are unavailable.");
    setUpdateState(body);
  };
  useEffect(() => { load().catch(error => setError(error.message)); loadUpdateState().catch(error => setError(error.message)); }, []);

  const capture = async () => {
    setRunning(true); setError("");
    try {
      const response = await fetch("/api/local/firmware/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Firmware scan failed.");
      setSnapshot(body.snapshot);
    } catch (error: any) { setError(error?.message || "Firmware scan failed."); }
    finally { setRunning(false); }
  };

  const rows: InventoryRow[] = snapshot?.details || [];
  const arrays = useMemo(() => [...new Set(rows.map(row => row.arrayIndex).filter(Boolean))].sort((a: any, b: any) => a - b), [rows]);
  const versions = useMemo(() => [...new Set(rows.filter(row => type === "ALL" || row.deviceType === type).map(row => row.version))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [rows, type]);
  const shown = useMemo(() => rows.filter(row => {
    if (type !== "ALL" && row.deviceType !== type) return false;
    if (array !== "all" && Number(array) !== row.arrayIndex) return false;
    if (version !== "all" && row.version !== version) return false;
    if (status !== "all" && row.status !== status) return false;
    const text = `${inventoryId(row)} ${row.deviceType} ${row.arrayIndex || ""} ${row.stringIndex || ""} ${row.deviceIndex || ""} ${row.ipAddress || ""} ${row.version}`.toLowerCase();
    return text.includes(query.trim().toLowerCase());
  }), [rows, type, array, version, status, query]);
  const visibleRows = shown.slice(0, 500);
  const filtersActive = type !== "ALL" || array !== "all" || version !== "all" || status !== "all" || !!query;
  const clearFilters = () => { setType("ALL"); setArray("all"); setVersion("all"); setStatus("all"); setQuery(""); };
  const chooseVersion = (deviceType: string, selectedVersion: string) => {
    setView("list"); setType(deviceType); setVersion(selectedVersion); setStatus(selectedVersion === "Unknown" ? "missing" : "reported"); setArray("all"); setQuery("");
  };
  const chooseMissing = () => { setView("list"); setType("ALL"); setVersion("all"); setStatus("missing"); setArray("all"); setQuery(""); };

  const summaryGroups = [
    { label: "EMS", type: "TURTLE", values: snapshot?.summary?.turtleVersions || {} },
    { label: "BMS / Phoenix", type: "BMS", values: snapshot?.summary?.bmsVersions || {} },
    { label: "String Controllers", type: "SC", values: snapshot?.summary?.scVersions || {} },
    { label: "BPC", type: "BPC", values: snapshot?.summary?.bpcVersions || {} },
    { label: "Feather", type: "FEATHER", values: snapshot?.summary?.featherVersions || {} }
  ];
  const byArray = useMemo(() => arrays.map(arrayIndex => {
    const arrayRows = rows.filter(row => row.arrayIndex === arrayIndex);
    const summarize = (deviceType: string) => {
      const group: Record<string, number> = {};
      arrayRows.filter(row => row.deviceType === deviceType).forEach(row => { group[row.version] = (group[row.version] || 0) + 1; });
      return group;
    };
    return { arrayIndex, bms: summarize("BMS"), sc: summarize("SC"), bpc: summarize("BPC"), feather: summarize("FEATHER") };
  }), [arrays, rows]);
  const updateVersions: string[] = updateState?.catalog?.[updateType] || [];
  const stringsForArray = useMemo(() => [...new Set(rows.filter(row => row.arrayIndex === Number(updateArray) && row.stringIndex).map(row => row.stringIndex as number))].sort((a, b) => a - b), [rows, updateArray]);
  useEffect(() => {
    if (!updateVersions.includes(updateVersion)) setUpdateVersion(updateVersions[0] || "");
    setUpdateScope("array");
  }, [updateType, updateState]);

  const targetLabel = updateScope === "array" ? `every ${updateType} in Array ${updateArray}` : `every ${updateType} in Array ${updateArray}, String ${updateString}`;

  const submitUpdate = async () => {
    setSubmittingUpdate(true); setUpdateMessage(""); setError("");
    try {
      const response = await fetch("/api/local/firmware/updates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceType: updateType, version: updateVersion, scope: updateScope,
          arrayIndex: Number(updateArray),
          stringIndex: updateScope === "string" ? Number(updateString) : undefined,
          confirmed: true
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "EMS rejected the firmware update request.");
      setUpdateState(body);
      setUpdateMessage(`${body.result.targetLabel} accepted for ${body.result.deviceType} ${body.result.version}. Verification scan is scheduled.`);
      setConfirmingUpdate(false);
    } catch (error: any) { setError(error?.message || "Firmware update request failed."); }
    finally { setSubmittingUpdate(false); }
  };

  return <div className="animate-fade-in space-y-4 rounded-lg border border-prizm-border bg-prizm-surface p-5">
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div><h2 className="flex items-center gap-2 text-sm font-bold uppercase text-prizm-text"><Cpu size={16} className="text-prizm-primary"/>Site Firmware Inventory</h2><p className="mt-1 text-xs text-prizm-text-muted">Select any version or missing count to open its indexed device list.</p></div>
      <div className="flex gap-2">
        <div className="flex rounded border border-prizm-border bg-prizm-surface-strong p-0.5"><button onClick={() => setView("list")} className={`flex items-center gap-1 rounded px-3 py-1.5 text-[10px] font-bold uppercase ${view === "list" ? "bg-prizm-primary text-black" : "text-prizm-text-muted"}`}><List size={13}/>Inventory</button><button onClick={() => setView("one-line")} className={`flex items-center gap-1 rounded px-3 py-1.5 text-[10px] font-bold uppercase ${view === "one-line" ? "bg-prizm-primary text-black" : "text-prizm-text-muted"}`}><Network size={13}/>One-line</button></div>
        <button onClick={capture} disabled={running} className="flex items-center justify-center gap-2 rounded bg-prizm-primary px-4 py-2 text-xs font-bold uppercase text-black disabled:opacity-50"><RefreshCw size={14} className={running ? "animate-spin" : ""}/>{running ? "Scanning site…" : "Scan firmware"}</button>
      </div>
    </div>
    {error && <div className="rounded border border-red-400/40 bg-red-500/10 p-3 text-xs text-red-600">{error}</div>}
    {updateMessage && <div className="rounded border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs font-bold text-emerald-600">{updateMessage}</div>}
    {!snapshot && !running && <div className="rounded border border-dashed border-prizm-border p-8 text-center text-xs text-prizm-text-muted">The automatic firmware inventory has not completed yet. Select Scan Firmware to run it now.</div>}
    {snapshot && <>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {summaryGroups.map(group => <div key={group.type} className="rounded border border-prizm-border bg-prizm-surface-strong p-3"><button onClick={() => { setView("list"); setType(group.type); setVersion("all"); setStatus("all"); }} className="block text-left text-[10px] font-bold uppercase text-prizm-text-muted hover:text-prizm-primary">{group.label}</button><div className="mt-2 flex flex-wrap gap-1">{Object.entries(group.values).map(([itemVersion, count]) => <button key={itemVersion} onClick={() => chooseVersion(group.type, itemVersion)} className={`rounded border px-2 py-1 text-left font-mono text-xs font-bold ${itemVersion === "Unknown" ? "border-amber-500/50 bg-amber-500/10 text-amber-600" : "border-prizm-border bg-prizm-surface text-prizm-text hover:border-prizm-primary"}`}>{itemVersion} <span className="font-sans text-[10px] opacity-70">({String(count)})</span></button>)}</div></div>)}
        <button onClick={chooseMissing} className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-left hover:border-amber-500"><span className="block text-[10px] font-bold uppercase text-amber-700">Missing firmware</span><strong className="mt-2 block text-2xl text-amber-600">{snapshot?.summary?.missingCount ?? 0}</strong><span className="text-[10px] text-prizm-text-muted">View affected devices</span></button>
      </div>

      <div className="rounded border border-prizm-border bg-prizm-surface-strong p-4">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between"><div><h3 className="flex items-center gap-2 text-xs font-bold uppercase text-prizm-text"><Upload size={14} className="text-prizm-primary"/>Firmware Update</h3><p className="mt-1 text-[11px] text-prizm-text-muted">Choose from firmware versions already found on this site. EMS queues and performs the update; PRIZM schedules a shared inventory scan to verify it.</p></div>{updateState?.running && <span className="rounded bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase text-amber-600">Submitting update…</span>}</div>
        <div className="mt-4 grid gap-2 md:grid-cols-5">
          <label className="text-[10px] font-bold uppercase text-prizm-text-muted">Device type<select value={updateType} onChange={event => setUpdateType(event.target.value as any)} className="mt-1 w-full rounded border border-prizm-border bg-prizm-surface px-3 py-2 text-xs text-prizm-text"><option value="BPC">BPC</option><option value="SC">String Controller</option></select></label>
          <label className="text-[10px] font-bold uppercase text-prizm-text-muted">Site-observed version<select value={updateVersion} onChange={event => setUpdateVersion(event.target.value)} className="mt-1 w-full rounded border border-prizm-border bg-prizm-surface px-3 py-2 font-mono text-xs text-prizm-text"><option value="">Select version</option>{updateVersions.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
          <>
            <label className="text-[10px] font-bold uppercase text-prizm-text-muted">Scope<select value={updateScope} onChange={event => setUpdateScope(event.target.value as any)} className="mt-1 w-full rounded border border-prizm-border bg-prizm-surface px-3 py-2 text-xs text-prizm-text"><option value="array">Entire array</option><option value="string">Individual string</option></select></label>
            <label className="text-[10px] font-bold uppercase text-prizm-text-muted">Array<select value={updateArray} onChange={event => { setUpdateArray(event.target.value); setUpdateString("1"); }} className="mt-1 w-full rounded border border-prizm-border bg-prizm-surface px-3 py-2 text-xs text-prizm-text">{arrays.map((item: any) => <option key={item} value={item}>Array {item}</option>)}</select></label>
            {updateScope === "string" ? <label className="text-[10px] font-bold uppercase text-prizm-text-muted">String<select value={updateString} onChange={event => setUpdateString(event.target.value)} className="mt-1 w-full rounded border border-prizm-border bg-prizm-surface px-3 py-2 text-xs text-prizm-text">{stringsForArray.map(item => <option key={item} value={item}>String {item}</option>)}</select></label> : <div/>}
          </>
        </div>
        <div className="mt-3 flex justify-end"><button onClick={() => setConfirmingUpdate(true)} disabled={!updateVersion || submittingUpdate || updateState?.running} className="flex items-center gap-2 rounded bg-prizm-primary px-4 py-2 text-xs font-bold uppercase text-black disabled:opacity-40"><Upload size={14}/>Review update</button></div>
      </div>

      {view === "one-line" ? <div className="space-y-4 rounded border border-prizm-border bg-prizm-surface-strong p-4">
        <div className="flex flex-col items-center gap-2"><button onClick={() => { setView("list"); setType("TURTLE"); setVersion("all"); }} className="min-w-[240px] rounded border-2 border-prizm-primary bg-prizm-surface p-3 text-center"><span className="block text-[10px] font-bold uppercase text-prizm-text-muted">EMS / Turtle</span><strong className="font-mono text-sm text-prizm-text">{versionText(snapshot?.summary?.turtleVersions)}</strong></button><div className="h-5 w-px bg-prizm-border"/><div className="h-px w-3/4 bg-prizm-border"/></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{byArray.map(item => <button key={item.arrayIndex} onClick={() => { setView("list"); setArray(String(item.arrayIndex)); setType("ALL"); setVersion("all"); setStatus("all"); }} className="rounded border border-prizm-border bg-prizm-surface p-3 text-left hover:border-prizm-primary"><div className="mb-2 text-xs font-bold uppercase text-prizm-primary">Array {item.arrayIndex}</div><div className="grid gap-2 text-[11px]"><div><span className="font-bold text-prizm-text-muted">BMS / Phoenix</span><div className="font-mono text-prizm-text">{versionText(item.bms)}</div></div><div><span className="font-bold text-prizm-text-muted">Feathers</span><div className="font-mono text-prizm-text">{versionText(item.feather)}</div></div><div><span className="font-bold text-prizm-text-muted">String Controllers</span><div className="font-mono text-prizm-text">{versionText(item.sc)}</div></div><div><span className="font-bold text-prizm-text-muted">BPCs</span><div className="font-mono text-prizm-text">{versionText(item.bpc)}</div></div></div></button>)}</div>
        <p className="text-[10px] text-prizm-text-muted">Select an array to open its complete BMS, Feather, String Controller, and BPC inventory.</p>
      </div> : <>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1"><Search size={14} className="absolute left-3 top-2.5 text-prizm-text-muted"/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search index, IP, device, or version" className="w-full rounded border border-prizm-border bg-prizm-surface-strong py-2 pl-9 pr-3 text-xs text-prizm-text"/></div>
          <select value={type} onChange={event => { setType(event.target.value); setVersion("all"); }} className="rounded border border-prizm-border bg-prizm-surface-strong px-3 py-2 text-xs text-prizm-text"><option value="ALL">All device types</option><option value="TURTLE">EMS / Turtle</option><option value="BMS">BMS / Phoenix</option><option>SC</option><option>BPC</option><option>FEATHER</option></select>
          <select value={version} onChange={event => setVersion(event.target.value)} className="rounded border border-prizm-border bg-prizm-surface-strong px-3 py-2 text-xs text-prizm-text"><option value="all">All firmware versions</option>{versions.map(item => <option key={item} value={item}>{item}</option>)}</select>
          <select value={status} onChange={event => setStatus(event.target.value)} className="rounded border border-prizm-border bg-prizm-surface-strong px-3 py-2 text-xs text-prizm-text"><option value="all">All reporting states</option><option value="reported">Reported</option><option value="missing">Missing</option></select>
          <select value={array} onChange={event => setArray(event.target.value)} className="rounded border border-prizm-border bg-prizm-surface-strong px-3 py-2 text-xs text-prizm-text"><option value="all">All arrays</option>{arrays.map((item: any) => <option key={item} value={item}>Array {item}</option>)}</select>
          {filtersActive && <button onClick={clearFilters} className="flex items-center gap-1 rounded border border-prizm-border px-3 py-2 text-xs font-bold text-prizm-text"><X size={13}/>Clear</button>}
        </div>
        <div className="max-h-[58vh] overflow-auto rounded border border-prizm-border"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-prizm-surface-strong text-[10px] uppercase text-prizm-text-muted"><tr><th className="p-2">Inventory index</th><th className="p-2">Type</th><th className="p-2">Array</th><th className="p-2">String</th><th className="p-2">Device</th><th className="p-2">IP</th><th className="p-2">Firmware</th><th className="p-2">Status</th></tr></thead><tbody>{visibleRows.map(row => <tr key={inventoryId(row) + (row.ipAddress || "")} className="border-t border-prizm-border/60"><td className="whitespace-nowrap p-2 font-mono font-bold text-prizm-primary">{inventoryId(row)}</td><td className="p-2 font-bold">{row.deviceType}</td><td className="p-2">{row.arrayIndex ?? "—"}</td><td className="p-2">{row.stringIndex ?? "—"}</td><td className="p-2">{row.deviceIndex ?? "—"}</td><td className="p-2 font-mono">{row.ipAddress || "—"}</td><td className="p-2 font-mono font-bold">{row.version}</td><td className={`p-2 font-bold uppercase ${row.status === "reported" ? "text-emerald-500" : "text-amber-500"}`}>{row.status}</td></tr>)}</tbody></table></div>
        <p className="text-[10px] text-prizm-text-muted">{shown.length} of {rows.length} devices match · Showing {visibleRows.length}. Use filters to narrow large site inventories. · Captured {new Date(snapshot.capturedAt).toLocaleString()}</p>
      </>}
    </>}
    {confirmingUpdate && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><div role="dialog" aria-modal="true" aria-labelledby="firmware-confirm-title" className="w-full max-w-lg rounded-lg border border-amber-500/50 bg-prizm-surface p-5 shadow-2xl"><div className="flex items-start gap-3"><AlertTriangle size={22} className="mt-0.5 shrink-0 text-amber-500"/><div><h3 id="firmware-confirm-title" className="text-sm font-bold uppercase text-prizm-text">Start firmware update?</h3><p className="mt-2 text-xs text-prizm-text-muted">EMS will apply <strong className="font-mono text-prizm-text">{updateType} {updateVersion}</strong> to <strong className="text-prizm-text">{targetLabel}</strong>. Devices may restart or temporarily stop reporting while the update runs.</p><p className="mt-3 rounded bg-amber-500/10 p-2 text-[11px] text-amber-700">This version was observed on the active site. The request cannot be undone from this dialog.</p></div></div><div className="mt-5 flex justify-end gap-2"><button onClick={() => setConfirmingUpdate(false)} disabled={submittingUpdate} className="rounded border border-prizm-border px-4 py-2 text-xs font-bold text-prizm-text">Cancel</button><button onClick={submitUpdate} disabled={submittingUpdate} className="flex items-center gap-2 rounded bg-amber-500 px-4 py-2 text-xs font-bold text-black disabled:opacity-50"><Upload size={14}/>{submittingUpdate ? "Submitting…" : "Start update"}</button></div></div></div>}
  </div>;
}
