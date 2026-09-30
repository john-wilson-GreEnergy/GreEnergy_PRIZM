import React, { useEffect, useRef, useState } from 'react';
import { diagnosticBoolean as bool, diagnosticObject as object, diagnosticText as text, loadDiagnostics, type DiagnosticResults } from './developerDiagnosticsData';

const card = 'bg-prizm-surface-strong border border-prizm-border rounded-lg p-4 space-y-2';
function Field({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><dt className="text-prizm-text-muted">{label}</dt><dd className="text-right break-all">{value}</dd></div>;
}
export function DeveloperDiagnosticsView({ results }: { results: DiagnosticResults | null }) {
  if (!results) return <p>No diagnostics available yet.</p>;
  const data = (key: keyof DiagnosticResults) => object(results[key].state === 'available' ? results[key].data : null);
  const status = data('status'), boot = data('boot'), topology = data('topology');
  const sourcesResult = results.sources;
  const sources = sourcesResult.state === 'available' && Array.isArray(sourcesResult.data) ? sourcesResult.data.map(object) : [];
  const statusResult = results.status;
  return <div className="space-y-4 text-xs text-prizm-text">
    <p className="text-prizm-text-muted">Point-in-time diagnostics from PRIZM’s cached APIs. API availability does not confirm equipment health. Refresh to update these readings.</p>
    {Object.entries(results).map(([key, result]) => result.state === 'unavailable' && <p role="alert" className="text-amber-600" key={key}>{key}: Unavailable — {result.error}</p>)}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <section className={card}><h3 className="font-bold">PRIZM API</h3><dl className="space-y-2">
        <Field label="Status API" value={statusResult.state === 'available' ? 'Responded with JSON' : 'Unavailable'} />
        <Field label="API response time (not ping)" value={statusResult.state === 'available' ? `${statusResult.responseMs.toFixed(1)} ms` : 'Unavailable'} />
        <Field label="Status response (decoded)" value={statusResult.state === 'available' ? `${statusResult.bytes.toLocaleString()} bytes` : 'Unavailable'} />
        <Field label="Server uptime" value="Unavailable — not supplied by these APIs" />
        <Field label="Status retrieved at" value={statusResult.state === 'available' ? statusResult.retrievedAt : 'Unavailable'} />
      </dl></section>
      <section className={card}><h3 className="font-bold">EMS CACHE — SERVER REPORTED</h3><dl className="space-y-2">
        <Field label="Source" value={text(status.source)} />
        <Field label="Freshness flag" value={bool(status.staleData, 'Stale', 'Not marked stale')} />
        <Field label="Source last updated" value={text(status.lastUpdated)} />
        <Field label="EMS endpoint" value={text(status.activeEmsBaseUrl)} />
        <Field label="Last error" value={status.lastError === null ? 'None reported' : text(status.lastError)} />
      </dl></section>
      <section className={card}><h3 className="font-bold">ACTIVE PROFILE / TOPOLOGY</h3><dl className="space-y-2">
        <Field label="Profile" value={text(status.activeProfileName)} />
        <Field label="Site" value={text(status.siteName)} />
        <Field label="Station" value={text(status.stationCode)} />
        <Field label="Block" value={text(status.blockIndex)} />
        <Field label="Topology entities" value={Array.isArray(topology.data) ? String(topology.data.length) : 'Unavailable'} />
        <Field label="Topology source" value={text(topology.source)} />
        <Field label="Topology freshness flag" value={bool(topology.staleData, 'Stale', 'Not marked stale')} />
        <Field label="Topology last updated" value={text(topology.lastUpdated)} />
      </dl></section>
    </div>
    <section className={card}><h3 className="font-bold">BOOT / PRELOAD REPORT</h3>
      <dl className="space-y-2"><Field label="Reported phase" value={text(boot.phase)} /><Field label="Reported readiness" value={bool(boot.ready, 'Ready', 'Not ready')} /></dl>
      <p className="text-prizm-text-muted">Preload flags are not equipment tests or proof of current telemetry freshness.</p>
      {Object.keys(object(boot.preloadStatus)).length ? <dl className="space-y-2">{Object.entries(object(boot.preloadStatus)).map(([key, value]) => <Field key={key} label={key} value={bool(value, 'Reported loaded', 'Not reported loaded')} />)}</dl> : <p>Preload status unavailable.</p>}
      {(['warnings', 'errors'] as const).map(key => Array.isArray(boot[key]) && (boot[key] as unknown[]).map((message, index) => <p className="text-amber-600" key={`${key}-${index}`}>{key}: {text(message)}</p>))}
    </section>
    <section className={card}><h3 className="font-bold">SOURCE POLLING — LAST REPORTED RESULTS</h3>
      <p className="text-prizm-text-muted">Durations below are server-reported source request durations, separate from the API response time above.</p>
      {!sources.length ? <p>{sourcesResult.state === 'available' ? 'No source metrics reported.' : 'Source metrics unavailable.'}</p> : <div className="overflow-x-auto"><table className="w-full text-left text-[11px]"><thead><tr>{['Endpoint', 'Last result', 'Stale', 'Duration', 'Last success', 'Fallback', 'Last error'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{sources.map((source, index) => <tr key={`${text(source.endpoint)}-${index}`} className="border-t border-prizm-border">
        <td className="p-2 break-all">{text(source.endpoint)}</td><td className="p-2">{bool(source.success, 'Success', 'Failed')}</td><td className="p-2">{bool(source.stale, 'Yes', 'No')}</td>
        <td className="p-2">{typeof source.lastDurationMs === 'number' && Number.isFinite(source.lastDurationMs) && source.lastDurationMs >= 0 ? `${source.lastDurationMs} ms` : 'Unavailable'}</td>
        <td className="p-2">{text(source.lastSuccessAt)}</td><td className="p-2">{bool(source.fallbackUsed, 'Yes', 'No')}</td><td className="p-2">{source.lastError === null ? 'None reported' : text(source.lastError)}</td>
      </tr>)}</tbody></table></div>}
    </section>
  </div>;
}
export default function DeveloperDiagnostics() {
  const [results, setResults] = useState<DiagnosticResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  const refresh = async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setResults(null); setError(null); setLoading(true);
    try {
      const next = await loadDiagnostics(controller.signal);
      if (pending.current === controller && !controller.signal.aborted) setResults(next);
    } catch {
      if (pending.current === controller && !controller.signal.aborted) setError('Diagnostics unavailable. Try refreshing.');
    } finally {
      if (pending.current === controller && !controller.signal.aborted) setLoading(false);
    }
  };
  useEffect(() => { void refresh(); return () => { pending.current?.abort(); pending.current = null; }; }, []);
  return <div className="space-y-4" aria-busy={loading}>
    <button className="px-3 py-2 rounded border border-prizm-border text-prizm-primary disabled:opacity-50" disabled={loading} onClick={() => void refresh()}>Refresh diagnostics</button>
    {loading ? <p role="status">Reading cached PRIZM diagnostics…</p> : <DeveloperDiagnosticsView results={results} />}
    {error && <p role="alert">{error}</p>}
  </div>;
}
