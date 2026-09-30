import React,{useEffect,useRef} from 'react';
import {contactorReasons,type ContactorView} from './ContactorWorkflow';

export function ContactorPanel({view,site,canSend,fresh,onAction,onReason,onConfirm,onRefresh,onClose}: {
  view:ContactorView;site:string;canSend:boolean;fresh:boolean;onAction:(action:'open'|'close')=>void;
  onReason:(reason:string)=>void;onConfirm:()=>void;onRefresh:()=>void;onClose:()=>void;
}) {
  const heading=useRef<HTMLHeadingElement>(null);
  const identity=view.target ? `${view.target.array}:${view.target.string}` : '';
  useEffect(()=>{if(identity) {heading.current?.focus();heading.current?.scrollIntoView({block:'center',behavior:'smooth'});}},[identity]);
  if(view.phase==='closed') return null;
  const target=`Array ${view.target?.array} / String ${view.target?.string}`;
  const reviewing=view.phase==='review',sending=view.phase==='sending',result=view.phase==='result'||view.phase==='unknown';
  return <section aria-labelledby="contactor-review-title" className="rounded-xl border-2 border-sky-600 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-wider text-sky-800">Single-string contactor control</p><h2 ref={heading} tabIndex={-1} id="contactor-review-title" className="mt-1 text-xl font-bold outline-none">{target}</h2><p className="mt-1 text-sm text-slate-600">{site}</p></div>
      <button onClick={onClose} disabled={sending} className="min-h-11 rounded-lg border border-slate-300 px-4 font-semibold disabled:opacity-50">{result ? 'Close details' : 'Cancel'}</button>
    </div>
    <p className="my-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">This sends a live equipment command. Electrical protections remain enabled. Signing out or closing the page cannot cancel a command already sent.</p>
    {(sending || result) && view.action && <p className="mb-3 text-sm font-semibold">Requested state: {view.action.toUpperCase()} · Reason: {view.reason}</p>}
    {view.phase==='loading' && <p role="status">Checking target permission and site freshness…</p>}
    {reviewing && <div className="space-y-4">
      <fieldset><legend className="mb-2 text-sm font-semibold">Choose the requested state</legend><div className="flex gap-3">{(['open','close'] as const).map(action=><label key={action} className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border px-4 ${view.action===action ? 'border-sky-600 bg-sky-50' : 'border-slate-300'}`}><input type="radio" name="contactor-action" checked={view.action===action} onChange={()=>onAction(action)}/>{action==='open' ? 'Open contactors' : 'Close contactors'}</label>)}</div></fieldset>
      <label className="block text-sm font-semibold">Reason<select value={view.reason} onChange={event=>onReason(event.target.value)} className="mt-2 block min-h-11 rounded-lg border border-slate-300 bg-white px-3">{contactorReasons.map(reason=><option key={reason}>{reason}</option>)}</select></label>
      <p className="text-sm text-slate-600">Only this string is targeted. No array-wide action or protection override will be sent.</p>
      {!fresh && <p role="alert" className="text-sm font-semibold text-amber-900">Telemetry is stale or your session is ending. Sending is disabled.</p>}
      <button onClick={onConfirm} disabled={!canSend} className="min-h-12 rounded-lg bg-sky-800 px-5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{view.action ? `Send ${view.action.toUpperCase()} — ${target}` : 'Choose Open or Close to continue'}</button>
    </div>}
    {view.message && <div role={result||sending ? 'status' : 'alert'} className={`mt-4 rounded-lg p-3 text-sm ${view.receipt?.success ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-950'}`}><strong>{sending ? 'Verification pending · ' : view.receipt?.success ? 'Verified · ' : result ? 'Not verified · ' : ''}</strong>{view.message}</div>}
    {(view.phase==='unavailable' || reviewing && view.message) && <button onClick={onRefresh} className="mt-3 min-h-11 rounded-lg border border-slate-300 px-4 font-semibold">Refresh review</button>}
    {view.commandId && <p className="mt-3 break-all text-xs text-slate-600">Command ID: <span className="font-mono">{view.commandId}</span></p>}
  </section>;
}
