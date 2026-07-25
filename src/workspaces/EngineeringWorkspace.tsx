import React, { useState } from 'react';
import { Braces, Database, LoaderCircle, Network, Play, ShieldCheck } from 'lucide-react';
import type { DiagnosticState } from './types';
import type { WorkspacePreviewData } from './useWorkspacePreviewData';
import { diagnosticFetchPolicy, display, engineeringDiagnostics, normalizedStrings } from './workspaceModels';
import { DataStateBanner, Metric, Panel, StatusPill, Unknown } from './WorkspaceComponents';

const idle = (): DiagnosticState => ({ status: 'idle', data: null, error: null, loadedAt: null });

export function EngineeringWorkspace({ data }: { data: WorkspacePreviewData }) {
  const [diagnostics, setDiagnostics] = useState<Record<string, DiagnosticState>>({});
  const snapshot = data.snapshot;
  const strings = normalizedStrings(snapshot, data.siteOperations);

  const load = async (id: string, endpoint: string) => {
    if (diagnosticFetchPolicy(endpoint, true) !== 'fetch') return;
    setDiagnostics((current) => ({ ...current, [id]: { ...idle(), status: 'loading' } }));
    try {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload: unknown = await response.json();
      setDiagnostics((current) => ({ ...current, [id]: { status: 'ready', data: payload, error: null, loadedAt: new Date().toISOString() } }));
    } catch (error) {
      setDiagnostics((current) => ({ ...current, [id]: { status: 'error', data: null, error: error instanceof Error ? error.message : String(error), loadedAt: null } }));
    }
  };

  return <div className="space-y-4" data-workspace="engineering">
    <DataStateBanner state={snapshot ? 'live' : data.error ? 'offline' : 'unknown'} message={data.error ?? undefined}/>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Metric label="Cycle ID" value={snapshot?.cycleId ?? 'Unknown'} state="info"/>
      <Metric label="Canonical strings" value={strings.length || 'Unknown'}/>
      <Metric label="Graph version" value={display(snapshot?.graphVersion ?? snapshot?.topology?.graphVersion)}/>
      <Metric label="Debug requests" value={(Object.values(diagnostics) as DiagnosticState[]).filter((item) => item.status !== 'idle').length} detail="Explicit loads only"/>
    </div>
    <div className="grid gap-4 xl:grid-cols-[.72fr_1.28fr]">
      <Panel title="Canonical pipeline" eyebrow="Read-only system view">
        <div className="space-y-3 text-xs">
          {[['Provider acquisition', snapshot?.providerSnapshots ?? snapshot?.providers], ['Broker snapshot', snapshot], ['Graph identity', snapshot?.graphIdentity ?? snapshot?.identity], ['Canonical observations', snapshot?.observations], ['Route projection', data.siteOperations]].map(([label, value], index) => <div key={String(label)} className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-sky-500/10 font-mono font-black text-sky-500">{index + 1}</span><div className="flex-1"><b>{String(label)}</b><p className="text-slate-500">{value ? 'Present in loaded snapshot' : 'Not exposed in stable response'}</p></div><StatusPill state={value ? 'good' : 'neutral'}>{value ? 'seen' : 'unknown'}</StatusPill></div>)}
        </div>
      </Panel>
      <Panel title="Identity & source inspection" eyebrow="Dense telemetry context">
        <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
          <div><dt className="text-slate-500">Station</dt><dd className="font-mono font-bold">{display(snapshot?.siteIdentity?.stationCode)}</dd></div>
          <div><dt className="text-slate-500">Block</dt><dd className="font-mono font-bold">{display(snapshot?.siteIdentity?.blockIndex)}</dd></div>
          <div><dt className="text-slate-500">Generated</dt><dd className="font-mono font-bold">{display(snapshot?.generatedAt)}</dd></div>
          <div><dt className="text-slate-500">Authority</dt><dd className="font-mono font-bold">{display(snapshot?.authority ?? snapshot?.authoritySelected)}</dd></div>
          <div><dt className="text-slate-500">Strings stale</dt><dd className="font-mono font-bold">{strings.filter((row: any) => row.stale || row.staleData).length}</dd></div>
          <div><dt className="text-slate-500">Source health rows</dt><dd className="font-mono font-bold">{display(snapshot?.rollups?.sourceHealth?.length)}</dd></div>
        </dl>
        <div className="mt-4 max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-[10px] text-emerald-300"><pre>{JSON.stringify({ cycleId: snapshot?.cycleId, siteIdentity: snapshot?.siteIdentity, liveStatus: snapshot?.liveStatus, sourceHealthSummary: snapshot?.rollups?.sourceHealthSummary }, null, 2)}</pre></div>
      </Panel>
    </div>
    <Panel title="Diagnostics on demand" eyebrow="Never polled automatically" action={<StatusPill state="good"><ShieldCheck size={12} className="mr-1"/>read only</StatusPill>}>
      <p className="mb-4 text-xs text-slate-500">Each debug endpoint remains idle until its Load button is pressed. Responses are held only in this page session.</p>
      <div className="grid gap-3 lg:grid-cols-2">
        {engineeringDiagnostics().map((definition) => { const state = diagnostics[definition.id] ?? idle(); return <article key={definition.id} data-testid={`diagnostic-${definition.id}`} className="rounded-lg border border-slate-300 p-3 dark:border-slate-700"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black">{definition.label}</p><p className="mt-1 text-xs text-slate-500">{definition.description}</p><code className="mt-2 block text-[10px] text-sky-600 dark:text-sky-300">{definition.endpoint}</code></div><button type="button" disabled={state.status === 'loading'} onClick={() => load(definition.id, definition.endpoint)} className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-sky-500 px-3 text-xs font-black text-sky-600 disabled:opacity-50 dark:text-sky-300">{state.status === 'loading' ? <LoaderCircle size={14} className="animate-spin"/> : <Play size={14}/>}Load</button></div>{state.status === 'error' && <p className="mt-3 rounded bg-rose-500/10 p-2 text-xs text-rose-600">{state.error}</p>}{state.status === 'ready' && <div className="mt-3 max-h-64 overflow-auto rounded bg-slate-950 p-3"><pre className="whitespace-pre-wrap font-mono text-[10px] text-emerald-300">{JSON.stringify(state.data, null, 2)}</pre></div>}{state.status === 'idle' && <div className="mt-3 flex items-center gap-2 text-xs text-slate-500"><Database size={13}/>Not requested</div>}</article>; })}
      </div>
    </Panel>
    <div className="grid gap-4 md:grid-cols-3"><Panel title="Network" eyebrow="Acquisition"><Network size={18} className="text-sky-500"/><p className="mt-2 text-xs">Inspect request and duplicate evidence through the performance diagnostic.</p></Panel><Panel title="Payloads" eyebrow="Normalization"><Braces size={18} className="text-sky-500"/><p className="mt-2 text-xs">Canonical snapshot metadata is visible without exposing control paths.</p></Panel><Panel title="Raw access" eyebrow="Safety"><Unknown label="Load an approved diagnostic explicitly"/></Panel></div>
  </div>;
}
