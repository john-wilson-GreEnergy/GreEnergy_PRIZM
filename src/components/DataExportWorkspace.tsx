import React, {Fragment, useEffect, useRef, useState} from "react";
import {useSiteDataFields} from "../context/SiteDataContext";
import "./dataExport.css";
import {
  powerCommandSelections,
  powerComparisonSelections,
  presetWindow,
  toLocalInput,
  type ExportSelection,
  type ExportTarget,
  type WindowPreset,
} from "./dataExportUsability";

type Catalog = {
  identity: string;
  site: string;
  targets: ExportTarget[];
  notes: string[];
};
type Coverage = {
  id: string;
  label: string;
  metric: string;
  unit: string;
  rows: number;
  valid: number;
  first: number | null;
  last: number | null;
  largestGapMs: number;
};
type Preview = {
  ticket: string;
  expiresAt: number;
  bytes: number;
  rows: number;
  from: number;
  to: number;
  series: Coverage[];
  warnings: string[];
};
type SavedSelection = {name: string; selections: ExportSelection[]; hours: number};

const endpoint = "/api/local/site-data/data-export";

async function responseJson(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function DataExportWorkspaceKeyed() {
  const {siteIdentity} = useSiteDataFields(["siteIdentity"]);
  return <DataExportWorkspace key={JSON.stringify([
    siteIdentity?.activeProfileId,
    siteIdentity?.stationCode,
    siteIdentity?.blockIndex,
  ])} />;
}

function DataExportWorkspace() {
  const [reload, setReload] = useState(0);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<ExportTarget["source"]>("power");
  const [search, setSearch] = useState("");
  const [targetId, setTargetId] = useState("");
  const [metrics, setMetrics] = useState<string[]>([]);
  const [bpc, setBpc] = useState("");
  const [cell, setCell] = useState("");
  const [selections, setSelections] = useState<ExportSelection[]>([]);
  const initial = presetWindow("24-hours");
  const [from, setFrom] = useState(() => toLocalInput(initial.from));
  const [to, setTo] = useState(() => toLocalInput(initial.to));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saved, setSaved] = useState<SavedSelection[]>([]);
  const [saveName, setSaveName] = useState("");
  const [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    setLoading(true);
    setError("");
    const abort = new AbortController();
    fetch(endpoint + "/catalog", {signal: abort.signal})
      .then(responseJson)
      .then((next: Catalog) => {
        setCatalog(next);
        try {
          const parsed = JSON.parse(localStorage.getItem("prizm-data-export:" + next.identity) || "[]");
          if (Array.isArray(parsed)) setSaved(parsed.filter(validSavedSelection).slice(0, 12));
        } catch {
          setSaved([]);
        }
      })
      .catch(nextError => {
        if (!abort.signal.aborted) setError(nextError.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => {
      abort.abort();
      controller.current?.abort();
    };
  }, [reload]);

  const resetResult = () => {
    setPreview(null);
    setError("");
    setMessage("");
  };
  const applyWindow = (preset: WindowPreset) => {
    resetResult();
    const window = presetWindow(preset);
    setFrom(toLocalInput(window.from));
    setTo(toLocalInput(window.to));
  };
  const applyQuickStart = (kind: "commands" | "comparison") => {
    if (!catalog) return;
    const next = kind === "commands"
      ? powerCommandSelections(catalog.targets)
      : powerComparisonSelections(catalog.targets);
    if (!next.length) {
      setError("No retained power-command series are available for this site. Power history may not cover that source yet.");
      return;
    }
    resetResult();
    setSource("power");
    setSelections(next);
    applyWindow("last-friday");
    setMessage(kind === "commands"
      ? `Ready: ${next.length} recorded power-command source${next.length === 1 ? "" : "s"} for last Friday.`
      : `Ready: ${next.length} command and measured-power source${next.length === 1 ? "" : "s"} for last Friday.`);
  };

  if (loading) return <div className="data-export" role="status">Loading recorded measurement catalogue…</div>;

  const filteredTargets = catalog?.targets.filter(target =>
    target.source === source && target.label.toLowerCase().includes(search.toLowerCase())) ?? [];
  const target = catalog?.targets.find(item => item.source === source && item.id === targetId);

  const addSelection = () => {
    if (!target || !metrics.length) return;
    resetResult();
    const next: ExportSelection = {
      source,
      target: targetId,
      metrics,
      ...(source === "cells" && bpc ? {bpc: Number(bpc)} : {}),
      ...(source === "cells" && cell ? {cell: Number(cell)} : {}),
    };
    setSelections(current => [
      ...current.filter(item => item.source !== source || item.target !== targetId),
      next,
    ]);
  };

  const prepare = async () => {
    if (!catalog) return;
    resetResult();
    setBusy(true);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const result = await responseJson(await fetch(endpoint + "/query", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          identity: catalog.identity,
          from: Date.parse(from),
          to: Date.parse(to),
          selections,
        }),
        signal: abort.signal,
      }));
      if (!abort.signal.aborted) setPreview(result);
    } catch (nextError: any) {
      setError(abort.signal.aborted ? "Export cancelled." : nextError.message);
    } finally {
      setBusy(false);
      controller.current = null;
    }
  };

  const download = async () => {
    if (!preview) return;
    setBusy(true);
    setError("");
    const abort = new AbortController();
    controller.current = abort;
    try {
      const response = await fetch(endpoint + "/package?ticket=" + encodeURIComponent(preview.ticket), {
        signal: abort.signal,
      });
      if (!response.ok) {
        await responseJson(response);
        return;
      }
      if (!response.headers.get("Content-Type")?.includes("application/zip")) {
        throw new Error("Unexpected download response");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "prizm-selected-history-" + new Date(preview.from).toISOString().slice(0, 10) + ".zip";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setMessage("Downloaded CSV files and report.html. Open report.html to view the graphs offline.");
    } catch (nextError: any) {
      setError(abort.signal.aborted ? "Download cancelled." : nextError.message);
    } finally {
      setBusy(false);
      controller.current = null;
    }
  };

  const saveSelection = () => {
    if (!catalog || !saveName.trim() || !selections.length) return;
    const hours = (Date.parse(to) - Date.parse(from)) / 3_600_000;
    if (!Number.isFinite(hours) || hours <= 0 || hours > 168) {
      setError("Choose a valid time window before saving.");
      return;
    }
    const next = [{name: saveName.trim().slice(0, 80), selections, hours},
      ...saved.filter(item => item.name !== saveName.trim())].slice(0, 12);
    try {
      localStorage.setItem("prizm-data-export:" + catalog.identity, JSON.stringify(next));
      setSaved(next);
      setMessage("Selection saved in this browser. Telemetry is not saved in the preset.");
      setSaveName("");
    } catch {
      setError("This browser could not save the selection.");
    }
  };

  return <section className="data-export" aria-label="Data export workspace">
    <header><div><small>HISTORY & REPORTS</small><h1>Data export</h1>
      <p>{catalog?.site || "Recorded site history"} · Download CSV data and an offline graphed HTML report.</p>
    </div><span className="export-badge">Recorded data only</span></header>
    <p>Exports use existing history. No equipment reads or commands are triggered.</p>
    {error && <p role="alert" className="export-error">{error}</p>}
    {message && <p role="status" className="export-ready">{message}</p>}
    {!catalog && <button onClick={() => setReload(value => value + 1)}>Reload available measurements</button>}
    {catalog && <Fragment>
      <section className="export-quick-start" aria-labelledby="quick-export-heading">
        <small>QUICK EXPORT</small><h2 id="quick-export-heading">What do you need?</h2>
        <p>These shortcuts choose the recorded variables and the full previous Friday automatically. You can adjust them afterward.</p>
        <div className="export-quick-grid">
          <button className="export-quick-option" type="button" disabled={busy} onClick={() => applyQuickStart("commands")}>
            <strong>Power commands · last Friday</strong><span>Reported real and reactive power commands, exported as CSV and graphs.</span>
          </button>
          <button className="export-quick-option" type="button" disabled={busy} onClick={() => applyQuickStart("comparison")}>
            <strong>Commands + measured power · last Friday</strong><span>Compare recorded commands with PCS measured real power where available.</span>
          </button>
        </div>
      </section>

      <fieldset disabled={busy} className="export-grid">
        <section className="export-card"><h2>1. Choose data points</h2>
          <label>Data source<select value={source} onChange={event => {
            setSource(event.target.value as ExportTarget["source"]); setTargetId(""); setMetrics([]);
            setBpc(""); setCell(""); setSearch("");
          }}><option value="power">Power, PCS & reported commands</option><option value="cells">Cells & string context</option>
            <option value="hvac">HVAC & temperatures</option></select></label>
          <label>Find equipment<input type="search" value={search} onChange={event => setSearch(event.target.value)}
            placeholder="Power command, Array 1, String 40, HVAC…" /></label>
          <label>Equipment<select value={targetId} onChange={event => {
            setTargetId(event.target.value); setMetrics([]); setBpc(""); setCell("");
          }}><option value="">Select equipment</option>{filteredTargets.map(item =>
            <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
          {!filteredTargets.length && <p>No recorded equipment is available for this source or filter.</p>}
          {target && <Fragment><div className="export-metrics">{target.metrics.map(metric => <label key={metric.id}>
            <input type="checkbox" checked={metrics.includes(metric.id)} onChange={event => setMetrics(current =>
              event.target.checked ? [...current, metric.id] : current.filter(id => id !== metric.id))} />
            {metric.label}{metric.unit && ` (${metric.unit})`}</label>)}</div>
          {source === "cells" && <div className="export-pair"><label>BPC<select value={bpc} onChange={event => setBpc(event.target.value)}>
            <option value="">All BPCs</option>{Array.from({length: target.bpcs ?? 0}, (_, index) =>
              <option value={index + 1} key={index}>BPC {index + 1}</option>)}</select></label>
            <label>Cell group<select value={cell} onChange={event => setCell(event.target.value)}><option value="">All groups</option>
              {Array.from({length: target.cells ?? 0}, (_, index) => <option value={index + 1} key={index}>Group {index + 1}</option>)}</select></label></div>}
          <button type="button" onClick={addSelection} disabled={!metrics.length || selections.length >= 32 &&
            !selections.some(item => item.source === source && item.target === targetId)}>Add / replace selection</button></Fragment>}
        </section>

        <section className="export-card"><h2>2. Choose the dates</h2>
          <div className="export-actions">
            <button type="button" onClick={() => applyWindow("last-friday")}>Last Friday</button>
            <button type="button" onClick={() => applyWindow("yesterday")}>Yesterday</button>
            <button type="button" onClick={() => applyWindow("today")}>Today</button>
            <button type="button" onClick={() => applyWindow("24-hours")}>Last 24h</button>
            <button type="button" onClick={() => applyWindow("7-days")}>Last 7d</button>
          </div>
          <label>From · local time<input type="datetime-local" value={from} onChange={event => {resetResult(); setFrom(event.target.value);}} /></label>
          <label>To · local time<input type="datetime-local" value={to} onChange={event => {resetResult(); setTo(event.target.value);}} /></label>
          <p>Up to seven days, limited to retained history. Downloaded timestamps are UTC; missing periods appear in coverage.</p>
          <h3>Saved selections</h3><label>Load a selection<select value="" onChange={event => {
            if (event.target.value === "") return;
            const item = saved[Number(event.target.value)];
            if (item) {setSelections(item.selections); const window = presetWindow("24-hours");
              window.from = new Date(window.to.getTime() - item.hours * 3_600_000); setFrom(toLocalInput(window.from)); setTo(toLocalInput(window.to));}
          }}><option value="">Choose a saved selection</option>{saved.map((item, index) =>
            <option value={index} key={item.name}>{item.name}</option>)}</select></label>
          <label>Selection name<input maxLength={80} value={saveName} onChange={event => setSaveName(event.target.value)}
            placeholder="Charge/discharge investigation" /></label>
          <button type="button" onClick={saveSelection} disabled={!saveName.trim() || !selections.length}>Save selection</button>
          <small>Saved in this browser for this site; contains choices, not telemetry.</small>
        </section>
      </fieldset>

      <section className="export-card"><h2>Selected measurements · {selections.length} targets</h2>
        {selections.length ? <ul className="export-selection">{selections.map((selection, index) => {
          const selectedTarget = catalog.targets.find(item => item.source === selection.source && item.id === selection.target);
          return <li key={selection.source + selection.target}><div><strong>{selectedTarget?.label || selection.target}</strong>
            <p>{selection.metrics.map(id => selectedTarget?.metrics.find(metric => metric.id === id)?.label || id).join(" · ")}</p></div>
            <button disabled={busy} onClick={() => {resetResult(); setSelections(current => current.filter((_, position) => position !== index));}}
              aria-label={`Remove ${selectedTarget?.label || selection.target}`}>Remove</button></li>;
        })}</ul> : <p>Use a quick export above, or add equipment and measurements manually.</p>}
        <div className="export-actions"><button className="export-primary" onClick={prepare} disabled={busy || !selections.length}>
          Preview CSV + graph package</button>{busy && <Fragment><span role="status">Reading retained history and building the package…</span>
          <button onClick={() => controller.current?.abort()}>Cancel</button></Fragment>}</div>
        <p><small>Full-resolution CSV is never silently downsampled. Large requests fail visibly so you can narrow the dates or selections.</small></p>
      </section>

      {preview && <section className="export-card"><h2>3. Check coverage and download</h2>
        <p>{preview.rows.toLocaleString()} readings · {preview.series.length} graph series · {(preview.bytes / 1_048_576).toFixed(2)} MiB ZIP</p>
        <p>The ZIP contains CSV files plus <strong>report.html</strong> with graphs for the selected variables.</p>
        <button className="export-primary" onClick={download} disabled={busy || !preview.rows}>Download CSV + graphed HTML</button>
        {!preview.rows && <p>No retained readings matched. Try another date range or equipment target.</p>}
        <details><summary>Sources, resolution and limitations</summary><ul>{preview.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>
        <div className="export-table"><table><thead><tr><th>Equipment / measurement</th><th>Rows / live times</th>
          <th>First / last live source</th><th>Largest gap</th></tr></thead><tbody>{preview.series.map(series => <tr key={series.id}>
            <th>{series.label}<small>{series.metric} {series.unit}</small></th><td>{series.rows} / {series.valid}</td>
            <td>{series.first === null ? "No live data" : new Date(series.first).toLocaleString()}<small>{series.last === null ? "" : new Date(series.last).toLocaleString()}</small></td>
            <td>{(series.largestGapMs / 60_000).toFixed(1)} min</td></tr>)}</tbody></table></div>
      </section>}
      <details className="export-card"><summary>History availability</summary><ul>{catalog.notes.map(note => <li key={note}>{note}</li>)}</ul></details>
    </Fragment>}
  </section>;
}

function validSavedSelection(value: any): value is SavedSelection {
  return typeof value?.name === "string" && Array.isArray(value.selections) && value.selections.length <= 32 &&
    value.selections.every((selection: any) => selection && ["power", "cells", "hvac"].includes(selection.source) &&
      typeof selection.target === "string" && Array.isArray(selection.metrics) && selection.metrics.every((metric: any) => typeof metric === "string")) &&
    Number.isFinite(value.hours) && value.hours > 0 && value.hours <= 168;
}

export default DataExportWorkspaceKeyed;
