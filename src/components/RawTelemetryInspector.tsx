import React, { useEffect, useRef, useState } from 'react';
import { RAW_TELEMETRY_SOURCES, RAW_PREVIEW_LIMIT, loadRawTelemetryPayload, type RawTelemetryPayload, type RawTelemetrySource } from './rawTelemetryPayload';

export default function RawTelemetryInspector() {
  const [selected, setSelected] = useState<RawTelemetrySource | null>(null);
  const [payload, setPayload] = useState<RawTelemetryPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, []);
  useEffect(() => {
    if (!payload) { setDownloadUrl(null); return; }
    const url = URL.createObjectURL(payload.blob);
    setDownloadUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [payload]);

  async function load(source: RawTelemetrySource) {
    pending.current?.abort();
    const request = new AbortController();
    pending.current = request;
    setSelected(source); setPayload(null); setDownloadUrl(null); setError(null); setLoading(true);
    try {
      const result = await loadRawTelemetryPayload(source, request.signal);
      if (pending.current === request && !request.signal.aborted) setPayload(result);
    } catch (cause) {
      if (pending.current === request && !request.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load this payload.');
    } finally {
      if (pending.current === request) { pending.current = null; setLoading(false); }
    }
  }

  return <section className="space-y-4" aria-label="Raw telemetry inspector">
    <p className="text-prizm-text-muted">Load only the cached payload you need. No device refresh or command is sent. Raw files may contain sensitive site information; share only with authorized recipients.</p>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {RAW_TELEMETRY_SOURCES.map(source => <div key={source.id} className="bg-prizm-surface-strong border border-prizm-border rounded-lg p-4 space-y-2">
        <h3 className="font-bold text-prizm-text">{source.label}</h3>
        <p className="text-prizm-text-muted">{source.detail}</p>
        <button type="button" className="px-3 py-2 border border-prizm-border rounded text-prizm-primary disabled:opacity-50" disabled={loading && selected?.id === source.id} onClick={() => void load(source)}>
          {loading && selected?.id === source.id ? 'Loading…' : `Load ${source.label}`}
        </button>
      </div>)}
    </div>
    <div aria-live="polite" aria-busy={loading} className="space-y-3">
      {!selected && <p>No payload loaded. Choose a source above to inspect or download it.</p>}
      {selected && <h3 className="font-bold">{selected.label}</h3>}
      {loading && <p>Loading cached payload…</p>}
      {error && <p role="alert" className="text-prizm-danger">{error}</p>}
      {payload && <>
        <p>{payload.blob.size.toLocaleString()} bytes · Retrieved {payload.receivedAt}. Retrieval time is not the device observation time.</p>
        {downloadUrl && <a className="inline-block px-3 py-2 border border-prizm-border rounded text-prizm-primary" href={downloadUrl} download={`prizm-${selected!.id}.json`}>Download complete JSON</a>}
        <p>{payload.truncated ? `Preview truncated to ${RAW_PREVIEW_LIMIT.toLocaleString()} characters. The download contains the complete response.` : 'Complete payload shown below.'}</p>
        <pre className="text-prizm-primary text-[10px] bg-prizm-surface-strong border border-prizm-border p-3 rounded max-h-[400px] overflow-auto whitespace-pre-wrap break-all">{payload.preview}</pre>
      </>}
    </div>
  </section>;
}
