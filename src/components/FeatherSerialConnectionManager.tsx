import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, RefreshCw, ServerCog, TriangleAlert } from "lucide-react";

type Target = { ip: string; arrayIndex: number | null; segmentIndex: number | null; label: string; source: string };
type CallHistory = { name: string; success: number; failed: number; total: number; lastSuccess: string | null; lastFailure: string | null };
type Row = Target & { reachable: boolean; serialConnectionType: string | null; parameterValid: boolean; tomcatStatus: string; tomcatRunning: boolean; tomcatActiveSince: string | null; tomcatUptimeSeconds: number | null; featherStatus?: { available: boolean; version: string | null; state: string | null; calls: CallHistory[]; fetchedAt: string; error: string | null }; error: string | null };

function formatDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return "Unknown";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return [days ? `${days}d` : "", hours || days ? `${hours}h` : "", `${minutes}m`].filter(Boolean).join(" ");
}

export default function FeatherSerialConnectionManager({ active }: { active: boolean }) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [username, setUsername] = useState("moxa");
  const [sshPassword, setSshPassword] = useState("");
  const [sudoPassword, setSudoPassword] = useState("");
  const [desired, setDesired] = useState("rxtx");
  const [busy, setBusy] = useState<"targets" | "scan" | "apply" | null>(null);
  const [message, setMessage] = useState<any>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const loadTargets = async () => {
    setBusy("targets"); setMessage(null);
    try {
      const response = await fetch("/api/local/feather-serial/targets");
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Unable to load Feather targets.");
      setTargets(data.targets || []);
    } catch (error: any) { setMessage({ error: error.message }); }
    finally { setBusy(null); }
  };

  useEffect(() => { if (active) loadTargets(); }, [active]);
  useEffect(() => () => { setSshPassword(""); setSudoPassword(""); }, []);

  const scan = async () => {
    setBusy("scan"); setMessage(null);
    try {
      const response = await fetch("/api/local/feather-serial/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, sshPassword, targetIps: selected.size ? Array.from(selected) : undefined }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Scan failed.");
      setRows(data.rows || []);
      setMessage({ ok: true, text: `Scanned ${data.count} Feather targets.` });
    } catch (error: any) { setMessage({ error: error.message }); }
    finally { setBusy(null); }
  };

  const apply = async () => {
    setBusy("apply"); setMessage(null);
    try {
      const response = await fetch("/api/local/feather-serial/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, sshPassword, sudoPassword, desired, targetIps: Array.from(selected), confirmed: true, requestedBy: "local-prizm" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Apply failed.");
      setRows(data.verification || []);
      const changed = (data.results || []).filter((row: any) => row.action === "changed").length;
      const skipped = (data.results || []).filter((row: any) => row.action === "skipped").length;
      const failed = (data.results || []).filter((row: any) => !row.success).length;
      setMessage({ ok: failed === 0, error: failed ? `${failed} target(s) failed verification.` : null, text: `${changed} changed · ${skipped} skipped · ${failed} failed` });
    } catch (error: any) { setMessage({ error: error.message }); }
    finally { setBusy(null); setSudoPassword(""); }
  };

  const arrays = useMemo<number[]>(() => Array.from(new Set<number>(targets.flatMap(target => target.arrayIndex === null ? [] : [target.arrayIndex]))).sort((a, b) => a - b), [targets]);
  const toggle = (ips: string[]) => setSelected(current => { const next = new Set(current); const all = ips.every(ip => next.has(ip)); ips.forEach(ip => all ? next.delete(ip) : next.add(ip)); return next; });
  const selectAll = () => setSelected(new Set(targets.map(target => target.ip)));
  const deselectAll = () => setSelected(new Set());
  const toggleDetails = (ip: string) => setExpanded(current => { const next = new Set(current); next.has(ip) ? next.delete(ip) : next.add(ip); return next; });

  return <div className="space-y-4 font-sans">
    <div className="rounded-lg border border-prizm-border bg-prizm-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><ServerCog size={18} className="text-prizm-primary"/><h2 className="font-bold text-prizm-text">Feather Serial Connection Inventory</h2></div><p className="mt-1 text-xs text-prizm-text-muted">Inspect feather.xml and Tomcat 8, then safely update selected Collection or Energy Segment Feathers.</p></div><button onClick={loadTargets} disabled={!!busy} className="rounded border border-prizm-border px-3 py-2 text-xs font-bold"><RefreshCw size={13} className={`inline mr-2 ${busy === "targets" ? "animate-spin" : ""}`}/>Reload IP Map</button></div>
    </div>

    <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
      <div className="space-y-4 rounded-lg border border-prizm-border bg-prizm-surface p-4">
        <div className="grid gap-3"><label className="text-xs font-bold">SSH username<input value={username} onChange={event => setUsername(event.target.value)} className="mt-1 w-full rounded border border-prizm-border bg-white p-2 text-prizm-text"/></label><label className="text-xs font-bold">SSH login password <span className="font-normal text-prizm-text-muted">(memory only; password authentication)</span><input type="password" value={sshPassword} onChange={event => setSshPassword(event.target.value)} className="mt-1 w-full rounded border border-prizm-border bg-white p-2 text-prizm-text"/></label></div>
        <button onClick={scan} disabled={!!busy || targets.length === 0} className="w-full rounded bg-prizm-primary px-3 py-2 text-xs font-bold text-black">{busy === "scan" ? "Scanning…" : selected.size ? `Scan ${selected.size} selected` : `Scan all ${targets.length}`}</button>
        <div><div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase text-prizm-text-muted"><span>Select scope · {selected.size} selected</span><span className="flex gap-2"><button type="button" onClick={selectAll} disabled={!targets.length} className="text-prizm-primary disabled:opacity-40">Select all</button><button type="button" onClick={deselectAll} disabled={!selected.size} className="text-prizm-danger disabled:opacity-40">Deselect all</button></span></div><button onClick={() => toggle(targets.map(target => target.ip))} className="mb-2 w-full rounded border border-prizm-border p-2 text-left text-xs font-bold">Entire site ({targets.length})</button><div className="grid grid-cols-2 gap-2">{arrays.map(array => { const ips = targets.filter(target => target.arrayIndex === array).map(target => target.ip); return <button key={array} onClick={() => toggle(ips)} className={`rounded border p-2 text-xs font-bold ${ips.length && ips.every(ip => selected.has(ip)) ? "border-prizm-primary bg-prizm-info/10 text-prizm-primary" : "border-prizm-border"}`}>Array {array} ({ips.length})</button>; })}</div></div>
        <div className="border-t border-prizm-border pt-4"><label className="text-xs font-bold">New serial connection type<select value={desired} onChange={event => setDesired(event.target.value)} className="mt-1 w-full rounded border border-prizm-border bg-white p-2"><option value="rxtx">rxtx</option><option value="pjc">pjc</option><option value="rodbus">rodbus</option></select></label><label className="mt-3 block text-xs font-bold">Sudo password <span className="font-normal text-prizm-text-muted">(cleared after run)</span><input type="password" value={sudoPassword} onChange={event => setSudoPassword(event.target.value)} className="mt-1 w-full rounded border border-prizm-border bg-white p-2"/></label><p className="mt-3 text-[11px] text-prizm-text-muted">The command skips devices already set to <strong>{desired}</strong>, restarts Tomcat only where a change is made, and waits up to 90 seconds for recovery.</p><button onClick={apply} disabled={busy !== null || !selected.size} className="mt-3 w-full rounded bg-prizm-danger px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{busy === "apply" ? "Applying and verifying…" : `Apply ${desired} to ${selected.size} target${selected.size === 1 ? "" : "s"}`}</button></div>
      </div>

      <div className="overflow-hidden rounded-lg border border-prizm-border bg-prizm-surface"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-prizm-border p-3"><span className="text-xs font-bold uppercase">Inventory ({rows.length || targets.length}) · {selected.size} selected</span><div className="flex items-center gap-3"><button type="button" onClick={selectAll} disabled={!targets.length} className="rounded border border-prizm-primary px-2 py-1 text-[10px] font-bold uppercase text-prizm-primary disabled:opacity-40">Select all</button><button type="button" onClick={deselectAll} disabled={!selected.size} className="rounded border border-prizm-border px-2 py-1 text-[10px] font-bold uppercase text-prizm-text-muted disabled:opacity-40">Deselect all</button><span className="text-[10px] text-prizm-text-muted">CS = segment 0 · values: rxtx / pjc / rodbus</span></div></div><div className="max-h-[650px] overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-prizm-surface-strong"><tr><th className="p-2">Select</th><th className="p-2">Array / Segment</th><th className="p-2">IP</th><th className="p-2">serialConnectionType</th><th className="p-2">Tomcat 8</th><th className="p-2">Result</th></tr></thead><tbody>{(rows.length ? rows : targets).map((item: any) => <tr key={item.ip} className="border-t border-prizm-border"><td className="p-2"><input type="checkbox" checked={selected.has(item.ip)} onChange={() => toggle([item.ip])}/></td><td className="p-2 font-bold">A{item.arrayIndex ?? "?"} / {item.segmentIndex === 0 ? "CS" : `ES${item.segmentIndex ?? "?"}`}</td><td className="p-2 font-mono">{item.ip}</td><td className="p-2 font-bold">{item.serialConnectionType || "Not scanned"}</td><td className={`p-2 font-bold ${item.tomcatRunning ? "text-emerald-600" : item.tomcatStatus ? "text-prizm-danger" : "text-prizm-text-muted"}`}>{item.tomcatStatus || "Not scanned"}</td><td className="max-w-xs p-2 text-prizm-text-muted">{item.error || (item.reachable ? "OK" : "—")}</td></tr>)}</tbody></table></div></div>
    </div>
    {rows.length > 0 && <div className="overflow-hidden rounded-lg border border-prizm-border bg-prizm-surface">
      <div className="border-b border-prizm-border p-3"><h3 className="text-xs font-bold uppercase">Tomcat uptime & Feather call history</h3><p className="mt-1 text-[11px] text-prizm-text-muted">Select a scanned controller to inspect the device families reported by its live /feather/status page.</p></div>
      <div className="divide-y divide-prizm-border">{rows.map(item => {
        const calls = item.featherStatus?.calls || [];
        const failures = calls.reduce((sum, call) => sum + call.failed, 0);
        return <div key={item.ip}>
          <button type="button" onClick={() => toggleDetails(item.ip)} className="grid w-full grid-cols-[auto_1fr] items-center gap-2 p-3 text-left hover:bg-prizm-surface-strong md:grid-cols-[auto_160px_150px_1fr_170px]">
            {expanded.has(item.ip) ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}<strong>A{item.arrayIndex ?? "?"} / {item.segmentIndex === 0 ? "CS" : `ES${item.segmentIndex ?? "?"}`}</strong><span className="font-mono text-[11px]">{item.ip}</span><span><strong className={item.tomcatRunning ? "text-emerald-600" : "text-prizm-danger"}>{item.tomcatStatus}</strong><span className="ml-2 text-prizm-text-muted">uptime {formatDuration(item.tomcatUptimeSeconds)}</span></span><span className={failures ? "font-bold text-amber-600" : "text-emerald-600"}>{calls.length} call groups · {failures.toLocaleString()} failures</span>
          </button>
          {expanded.has(item.ip) && <div className="border-t border-prizm-border bg-prizm-surface-strong/50 p-3">
            <div className="mb-3 grid gap-3 md:grid-cols-3"><div><div className="text-[10px] font-bold uppercase text-prizm-text-muted">Tomcat active since</div><div className="mt-1 text-xs">{item.tomcatActiveSince || "Not reported"}</div></div><div><div className="text-[10px] font-bold uppercase text-prizm-text-muted">Feather version</div><div className="mt-1 text-xs font-bold">{item.featherStatus?.version || "Unknown"}</div></div><div><div className="text-[10px] font-bold uppercase text-prizm-text-muted">Current state</div><div className="mt-1 text-xs">{item.featherStatus?.state || item.featherStatus?.error || "Unavailable"}</div></div></div>
            {calls.length ? <div className="max-h-[360px] overflow-auto rounded border border-prizm-border"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-prizm-surface"><tr><th className="p-2">Device call</th><th className="p-2">Success</th><th className="p-2">Failed</th><th className="p-2">Total</th><th className="p-2">Last success</th><th className="p-2">Last failure</th></tr></thead><tbody>{calls.map(call => <tr key={call.name} className="border-t border-prizm-border"><td className="p-2 font-bold">{call.name}</td><td className="p-2 text-emerald-600">{call.success.toLocaleString()}</td><td className={`p-2 ${call.failed ? "font-bold text-amber-600" : "text-prizm-text-muted"}`}>{call.failed.toLocaleString()}</td><td className="p-2">{call.total.toLocaleString()}</td><td className="p-2 font-mono text-[10px]">{call.lastSuccess || "—"}</td><td className="p-2 font-mono text-[10px]">{call.lastFailure || "—"}</td></tr>)}</tbody></table></div> : <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">{item.featherStatus?.error || "No call-history records were reported."}</div>}
          </div>}
        </div>;
      })}</div>
    </div>}
    {message && <div className={`flex items-center gap-2 rounded border p-3 text-xs font-bold ${message.error ? "border-prizm-danger/40 bg-prizm-danger/10 text-prizm-danger" : "border-emerald-400/40 bg-emerald-50 text-emerald-700"}`}>{message.error ? <TriangleAlert size={15}/> : <CheckCircle2 size={15}/>} {message.error || message.text}</div>}
  </div>;
}
