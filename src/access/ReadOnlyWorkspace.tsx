import React, {useEffect, useMemo, useState, useSyncExternalStore} from 'react';
import {AccessTelemetryStore, type AccessTelemetryView} from './AccessTelemetryStore';
import {readAccessTelemetry, readContactorReview, submitContactor, type AccessSession} from './accessClient';
import {ContactorWorkflow} from './ContactorWorkflow';
import {ContactorPanel} from './ContactorPanel';
import {listRecovery,reviewRecovery,recordRecovery} from './accessClient';
import {RecoveryWorkflow} from './RecoveryWorkflow';
import {RecoveryPanel} from './RecoveryPanel';

const display = (value: number | null | undefined, unit = '') => value == null ? '—' : `${value.toLocaleString(undefined,{maximumFractionDigits:1})}${unit}`;
export function ReadOnlyWorkspaceView({view,email,onLogout,busy,error,onControl,controlPanel}: {view: AccessTelemetryView;email: string;onLogout:()=>void;busy: boolean;error: string;onControl?:(array:number,string:number)=>void;controlPanel?:React.ReactNode}) {
  const [tab,setTab] = useState<'strings'|'issues'>('strings');
  const [array,setArray] = useState('all');
  const data = view.data;
  const arrays = [...new Set(data?.strings.map(row=>row.array) ?? [])];
  const rows = data?.strings.filter(row=>array === 'all' || String(row.array) === array) ?? [];
  return <main className="min-h-screen bg-slate-100 p-4 font-sans text-slate-900 sm:p-8">
    <header className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 border-b border-slate-300 pb-5">
      <img src="/logo-transparent.svg" alt="GreEnergy" className="h-10 w-10"/>
      <div><h1 className="text-xl font-bold">PRIZM <span className="font-normal">Site workspace</span></h1><p className="text-sm text-slate-600">{data ? `${data.site.name} · ${data.site.station} · Block ${data.site.block}` : 'Read-only access pilot'}</p></div>
      <div className="ml-auto flex items-center gap-4"><span className="text-sm">{email}</span><button onClick={onLogout} disabled={busy} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 font-semibold">{busy ? 'Signing out…' : 'Sign out'}</button></div>
    </header>
    <div className="mx-auto max-w-7xl space-y-5 py-5">
      <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">{onControl ? 'Restricted pilot · Single-string contactor controls require target review. All other equipment controls remain unavailable.' : 'Read-only pilot · Equipment controls and unreviewed pages remain unavailable.'}</p>
      <div role="status" className={`rounded-lg border p-4 ${view.stale || !data ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
        <strong>{view.loading ? 'Waiting for telemetry' : !data ? 'Telemetry unavailable' : view.stale ? 'Stale / incomplete telemetry' : 'Current cached telemetry'}</strong>
        <p className="mt-1 text-sm">{data?.capturedAt ? `Source timestamp: ${data.capturedAt} · Cycle ${data.cycle} · ${data.state}` : 'No verified source timestamp available.'} Background refresh: 4 seconds; does not keep your login active.</p>
        {(view.error || error) && <p role="alert" className="mt-2 text-sm text-red-800">{view.error || error}</p>}
      </div>
      {controlPanel}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{([['Arrays',data?.counts.arrays],['Strings',data?.counts.strings],['String warnings',data?.counts.warnings],['String alarms',data?.counts.alarms]] as const).map(([label,value])=><section key={label} className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-sm text-slate-600">{label}</h2><p className={`mt-2 text-3xl font-semibold ${label === 'String alarms' && value ? 'text-red-700' : ''}`}>{display(value)}</p></section>)}</div>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
          <nav aria-label="Read-only workspace views" className="flex gap-2">{(['strings','issues'] as const).map(value=><button key={value} onClick={()=>setTab(value)} aria-pressed={tab===value} className={`min-h-11 rounded-lg px-4 font-semibold ${tab===value ? 'bg-emerald-700 text-white' : 'bg-slate-100'}`}>{value==='strings' ? 'String status' : `Corrective actions (${data?.issues.length ?? '—'})`}</button>)}</nav>
          {tab==='strings' && <label className="ml-auto text-sm">Array <select value={array} onChange={event=>setArray(event.target.value)} className="ml-2 min-h-11 rounded-lg border border-slate-300 bg-white px-3"><option value="all">All arrays</option>{arrays.map(value=><option key={value} value={value}>Array {value}</option>)}</select></label>}
        </div>
        {tab==='strings' ? <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-sm"><thead className="bg-slate-50"><tr>{['Target','State','SOC','Voltage','Current','Power','Warnings','Alarms','Quality',...(onControl ? ['Control'] : [])].map(label=><th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={`${row.array}:${row.string}`} className="border-t border-slate-100"><th className="px-4 py-3 font-medium">Array {row.array} / String {row.string}</th><td className="px-4 py-3">{row.state ?? 'Unknown'}</td>{[display(row.soc,'%'),display(row.voltage,' V'),display(row.current,' A'),display(row.power,' kW'),display(row.warnings),display(row.alarms)].map((value,index)=><td key={index} className="px-4 py-3 tabular-nums">{value}</td>)}<td className="px-4 py-3">{view.stale || row.stale ? 'Stale / unavailable' : 'Snapshot'}</td>{onControl && <td className="px-4 py-3"><button id={`control-${row.array}-${row.string}`} aria-label={`Review contactors for Array ${row.array} String ${row.string}`} disabled={busy || view.stale || row.stale} onClick={()=>onControl(row.array,row.string)} className="min-h-11 rounded-lg border border-sky-300 px-3 font-semibold text-sky-900 disabled:opacity-40">Review control</button></td>}</tr>)}</tbody></table>{!rows.length && <p className="p-6 text-sm text-slate-600">No verified string rows available for this selection.</p>}</div> : <ul className="divide-y divide-slate-100">{data?.issues.map((issue,index)=><li key={index} className="p-4"><p className="text-sm font-semibold">{issue.severity.toUpperCase()} · {issue.location}</p><p className="mt-1 text-sm">{issue.title}</p></li>)}{!data?.issues.length && <li className="p-6 text-sm text-slate-600">{data ? 'No corrective-action entries in this snapshot; see string warning and alarm counts above.' : 'Corrective-action data unavailable.'}</li>}</ul>}
      </section>
      <p className="text-xs text-slate-600">Missing values display as —, never as zero. This pilot is not a replacement for the site’s safety displays.</p>
    </div>
  </main>;
}
export default function ReadOnlyWorkspace({session,onExpired,onLogout,busy,error}: {session: AccessSession;onExpired:()=>void;onLogout:()=>void;busy:boolean;error:string}) {
  const store = useMemo(()=>new AccessTelemetryStore(readAccessTelemetry,onExpired,()=>!document.hidden),[onExpired,session.email]);
  const view = useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);
  useEffect(()=>{store.start();return ()=>store.stop();},[store]);
  const workflow=useMemo(()=>new ContactorWorkflow({review:readContactorReview,submit:(intent,signal)=>submitContactor(intent,session.csrf,signal),id:()=>crypto.randomUUID(),
    fresh:target=>{
      const current=store.getSnapshot();
      return session.singleStringContactors===true && Date.now()<Math.min(session.expiresAt,session.idleExpiresAt) && !current.stale && !current.blocked &&
        !!current.data?.strings.some(row=>row.array===target.array && row.string===target.string && !row.stale);
    },
  }),[store,session.csrf,session.singleStringContactors,session.expiresAt,session.idleExpiresAt]);
  const control=useSyncExternalStore(workflow.subscribe,workflow.getSnapshot,workflow.getSnapshot);
  useEffect(()=>()=>workflow.stop(),[workflow]);
  const recovery=useMemo(()=>new RecoveryWorkflow({list:listRecovery,review:reviewRecovery,record:(intent,signal)=>recordRecovery(intent,session.csrf,signal)}),[session.csrf]);
  const recoveryView=useSyncExternalStore(recovery.subscribe,recovery.getSnapshot,recovery.getSnapshot);
  useEffect(()=>()=>recovery.stop(),[recovery]);
  const close=()=>{const target=control.target;workflow.close();if(target) document.getElementById(`control-${target.array}-${target.string}`)?.focus();};
  return <ReadOnlyWorkspaceView view={view} email={session.email} onLogout={onLogout} busy={busy} error={error}
    onControl={session.singleStringContactors ? (array,string)=>{void workflow.open({array,string});} : undefined}
    controlPanel={<>{session.singleStringContactors && <RecoveryPanel view={recoveryView} canSave={recovery.canSave()} disabled={busy||view.blocked} onOpen={()=>{void recovery.open();}} onClose={()=>recovery.close()} onSelect={id=>{void recovery.select(id);}} onSave={reason=>{void recovery.save(reason);}}/>}<ContactorPanel view={control} site={view.data ? `${view.data.site.name} · ${view.data.site.station} · Block ${view.data.site.block}` : 'Site unavailable'}
      canSend={!busy && workflow.canSend()} fresh={!view.stale && !view.blocked} onAction={action=>workflow.choose(action)} onReason={reason=>workflow.reason(reason)}
      onConfirm={()=>{if(!busy) void workflow.confirm();}} onRefresh={()=>{if(control.target) void workflow.open(control.target);}} onClose={close}/></>}/>;
}
