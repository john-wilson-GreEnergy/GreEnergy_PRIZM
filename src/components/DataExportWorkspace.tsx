import React, {Fragment, useEffect, useRef, useState} from "react";
import {useSiteDataFields} from "../context/SiteDataContext";
import "./dataExport.css";
import {
  powerCommandSelections,
  powerComparisonSelections,
  powerMovementSelections,
  presetWindow,
  toLocalInput,
  type ExportMode,
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

export function DataExportWorkspace() {
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
  const [mode, setMode] = useState<ExportMode>("range");
  const [from, setFrom] = useState(() => toLocalInput(initial.from));
  const [to, setTo] = useState(() => toLocalInput(initial.to));
  const [singleDay, setSingleDay] = useState(() => toLocalInput(Date.now()).slice(0, 10));
  const [scope, setScope] = useState<"site" | "arrays">("site");
  const [selectedArrays, setSelectedArrays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7, 8]);
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
  const applyDay = (value: string) => {
    if (!value) return;
    resetResult();
    const start = new Date(`${value}T00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    setSingleDay(value);
    setFrom(toLocalInput(start));
    setTo(toLocalInput(end));
  };
  const addCommonMeasurements = (kind: "commands" | "movement" | "comparison") => {
    if (!catalog) return;
    const arrays = scope === "site" ? undefined : selectedArrays;
    if (arrays && !arrays.length) {
      setError("Select at least one array, or choose Entire site.");
      return;
    }
    const next = kind === "commands" ? powerCommandSelections(catalog.targets, arrays)
      : kind === "movement" ? powerMovementSelections(catalog.targets, arrays)
      : powerComparisonSelections(catalog.targets, arrays);
    if (!next.length) {
      setError("No retained power-command series are available for this site. Power history may not cover that source yet.");
      return;
    }
    resetResult();
    setSource("power");
    setSelections(current => {
      const ids = new Set(next.map(item => `${item.source}:${item.target}`));
      return [...current.filter(item => !ids.has(`${item.source}:${item.target}`)), ...next].slice(0, 32);
    });
    const scopeLabel = scope === "site" ? "the entire site" : `Array${selectedArrays.length === 1 ? "" : "s"} ${selectedArrays.join(", ")}`;
    setMessage(kind === "commands" ? `Added granular power-command data for ${scopeLabel}.`
      : kind === "movement" ? `Added granular power-movement data for ${scopeLabel}.`
      : `Added command and power-movement data for ${scopeLabel}.`);
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
      if (mode === "snapshot") {
        const response = await fetch(endpoint + "/site-snapshot", {method: "POST", signal: abort.signal});
        if (!response.ok) throw new Error((await response.json()).error || `Request failed (${response.status})`);
        if (!response.headers.get("Content-Type")?.includes("application/zip")) throw new Error("Unexpected Site Snapshot response");
        const url=URL.createObjectURL(await response.blob()),link=document.createElement("a");link.href=url;
        link.download=`prizm-site-snapshot-${new Date().toISOString().replace(/:/g,"-").slice(0,19)}.zip`;link.click();setTimeout(()=>URL.revokeObjectURL(url),30_000);
        setMessage("Site Snapshot downloaded with full retained cell-level evidence and published site data.");
        return;
      }
      const window = {from: Date.parse(from), to: Date.parse(to)};
      const result = await responseJson(await fetch(endpoint + "/query", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          identity: catalog.identity,
          from: window.from,
          to: window.to,
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
      const stamp = new Date(preview.from).toISOString().replace(/:/g, "-").slice(0, 19);
      link.download = `prizm-${mode === "snapshot" ? "point-in-time" : "selected-history"}-${stamp}.zip`;
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
      <p>{catalog?.site || "Recorded site history"} · Build a detailed Site Snapshot or export a granular time range.</p>
    </div><span className="export-badge">Recorded data only</span></header>
    <p>Exports use existing history. No equipment reads or commands are triggered.</p>
    {error && <p role="alert" className="export-error">{error}</p>}
    {message && <p role="status" className="export-ready">{message}</p>}
    {!catalog && <button onClick={() => setReload(value => value + 1)}>Reload available measurements</button>}
    {catalog && <Fragment>
      <fieldset disabled={busy} className="export-grid">
        <section className="export-card export-date-card"><small>STEP 1</small><h2>Choose export type</h2>
          <div className="export-mode" role="group" aria-label="Export type">
            <button type="button" className={mode === "snapshot" ? "selected" : ""} aria-pressed={mode === "snapshot"} onClick={() => {resetResult(); setMode("snapshot");}}>Site Snapshot</button>
            <button type="button" className={mode === "range" ? "selected" : ""} aria-pressed={mode === "range"} onClick={() => {resetResult(); setMode("range");}}>Time range</button>
          </div>
          {mode === "snapshot" ? <Fragment>
          <p className="export-help"><strong>Latest recorded Site Snapshot.</strong> Includes available site, array, string, BPC and cell-group evidence from the current retained frame. Every reading keeps its actual observation time, source time and quality. Missing readings remain blank.</p>
          </Fragment> : <Fragment>
          <label className="export-day-picker">Export one full day
            <input type="date" value={singleDay} onChange={event => applyDay(event.target.value)} />
          </label>
          <p className="export-or"><span>or choose an exact range</span></p>
          <div className="export-actions export-date-presets">
            <button type="button" onClick={() => applyWindow("yesterday")}>Yesterday</button>
            <button type="button" onClick={() => applyWindow("today")}>Today so far</button>
            <button type="button" onClick={() => applyWindow("24-hours")}>Last 24 hours</button>
            <button type="button" onClick={() => applyWindow("7-days")}>Last 7 days</button>
          </div>
          <div className="export-pair">
            <label>Start · local time<input type="datetime-local" value={from} onChange={event => {resetResult(); setFrom(event.target.value);}} /></label>
            <label>End · local time<input type="datetime-local" value={to} onChange={event => {resetResult(); setTo(event.target.value);}} /></label>
          </div>
          <p>Up to seven days, limited to retained history. Downloaded timestamps are UTC; missing periods appear in coverage.</p>
          </Fragment>}
        </section>

        <section className="export-card"><small>STEP 2</small><h2>Choose measurements</h2>
          <div className="export-common-measurements">
            <p><strong>Export scope</strong></p>
            <div className="export-scope-options">
              <label><input type="radio" name="export-scope" checked={scope === "site"} onChange={() => setScope("site")} />Entire site</label>
              <label><input type="radio" name="export-scope" checked={scope === "arrays"} onChange={() => setScope("arrays")} />Selected arrays</label>
            </div>
            {scope === "arrays" && <div className="export-array-picker" aria-label="Arrays to export">
              {Array.from({length: 8}, (_, index) => index + 1).map(array => <label key={array}>
                <input type="checkbox" checked={selectedArrays.includes(array)} onChange={event => setSelectedArrays(current =>
                  event.target.checked ? [...current, array].sort((a, b) => a - b) : current.filter(value => value !== array))} />
                Array {array}
              </label>)}
            </div>}
            <p><strong>Power data</strong></p>
            <div className="export-actions">
              <button type="button" onClick={() => addCommonMeasurements("commands")}>Power commands</button>
              <button type="button" onClick={() => addCommonMeasurements("movement")}>Power movement</button>
              <button type="button" className="export-primary" onClick={() => addCommonMeasurements("comparison")}>Commands + movement</button>
            </div>
            <small>Commands include real/reactive setpoints and application state. Movement includes PCS real/reactive power, DC voltage and DC current. Every retained point is exported; your date range stays unchanged.</small>
          </div>
          <details className="export-fine-tune" open><summary>Fine-tune equipment and variables</summary>
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
          </details>
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

      <section className="export-card"><small>STEP 3</small><h2>Review selections · {selections.length} targets</h2>
        {selections.length ? <ul className="export-selection">{selections.map((selection, index) => {
          const selectedTarget = catalog.targets.find(item => item.source === selection.source && item.id === selection.target);
          return <li key={selection.source + selection.target}><div><strong>{selectedTarget?.label || selection.target}</strong>
            <p>{selection.metrics.map(id => selectedTarget?.metrics.find(metric => metric.id === id)?.label || id).join(" · ")}</p></div>
            <button disabled={busy} onClick={() => {resetResult(); setSelections(current => current.filter((_, position) => position !== index));}}
              aria-label={`Remove ${selectedTarget?.label || selection.target}`}>Remove</button></li>;
        })}</ul> : <p>Add a common measurement group or choose equipment and variables above.</p>}
        <div className="export-actions"><button className="export-primary" onClick={prepare} disabled={busy || (mode === "range" && !selections.length)}>
          {mode === "snapshot" ? "Download Site Snapshot" : "Preview CSV + graph package"}</button>{busy && <Fragment><span role="status">Reading retained history and building the package…</span>
          <button onClick={() => controller.current?.abort()}>Cancel</button></Fragment>}</div>
        <p><small>Full-resolution CSV is never silently downsampled. Large requests fail visibly so you can narrow the dates or selections.</small></p>
      </section>

      {preview && <section className="export-card"><small>STEP 4</small><h2>Explore selected data</h2>
        <p>{preview.rows.toLocaleString()} readings · {preview.series.length} graph series · {(preview.bytes / 1_048_576).toFixed(2)} MiB ZIP</p>
        <p>Review and filter the generated graphs directly in PRIZM. Download remains optional when you need portable CSV files or an offline copy.</p>
        {preview.rows>0&&<iframe className="export-explorer" title="Selected data explorer" sandbox="allow-scripts allow-same-origin" src={`${endpoint}/explore?ticket=${encodeURIComponent(preview.ticket)}`} />}
        <button className="export-primary" onClick={download} disabled={busy || !preview.rows}>Download CSV + offline graphs</button>
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
