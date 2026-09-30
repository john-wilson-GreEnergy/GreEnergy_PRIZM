import React from 'react';
import type {RecoveryView} from './RecoveryWorkflow';
import type {RecoveryReason} from '../core/security/commandRecovery';
export function RecoveryPanel({view,canSave,disabled,onOpen,onClose,onSelect,onSave}:{view:RecoveryView;canSave:boolean;disabled:boolean;onOpen:()=>void;onClose:()=>void;onSelect:(id:string)=>void;onSave:(reason:RecoveryReason)=>void}) {
  const pending=['loading','reviewing','saving'].includes(view.phase),review=view.review;
  const button='min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40';
  return <section className="rounded-xl border border-slate-300 bg-white p-5" aria-label="Command recovery">
    <div className="flex flex-wrap items-center gap-3"><div className="mr-auto"><h2 className="font-semibold">Command recovery</h2><p className="text-sm text-slate-600">Your saved commands · historical evidence, not live status</p></div>
      <button className={button} disabled={disabled||pending} onClick={onOpen}>{view.phase==='closed'?'Review saved commands':'Refresh saved commands'}</button>
      {view.phase!=='closed' && <button className={button} disabled={pending} onClick={onClose}>Close recovery</button>}</div>
    {view.phase!=='closed' && <>
      <p className="my-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Saving a review does not retry, cancel or release a command. Even matching feedback cannot prove an earlier EMS request is no longer queued. Unresolved targets remain blocked.</p>
      <div role="status" aria-live="polite">{pending ? view.phase==='saving'?'Saving review…':'Reading saved commands and feedback…':view.message}</div>
      <ul className="my-3 space-y-2">{view.commands.map(command=><li key={command.commandId} className="rounded-lg border border-slate-200 p-3">
        <div className="flex flex-wrap items-center gap-3"><div className="mr-auto"><strong>Array {command.array} / String {command.string} · {command.action.toUpperCase()}</strong><p className="text-sm">{command.state==='verified'?'Historically verified':command.state==='reserved'?'Outcome unresolved':'Requested state not verified'} · {new Date(command.createdAt).toLocaleString()}</p><p className="break-all text-xs text-slate-600">{command.commandId}</p><p className="text-sm">Reason: {command.reason}</p></div>
          <button className={button} disabled={disabled||pending} onClick={()=>onSelect(command.commandId)}>Compare fresh feedback</button></div>
        {command.reviews.map((item,index)=><p key={index} className="mt-2 text-sm">Review {new Date(item.at).toLocaleString()}: {item.reason==='site-checked'?'Site checked':'Follow-up required'} · observed {item.observation.actual.toUpperCase()} · EMS request {item.observation.requested.toUpperCase()} · source {new Date(item.observation.capturedAt).toLocaleString()} · target not released</p>)}
      </li>)}</ul>
      {view.phase==='list' && !view.commands.length && <p className="text-sm">No saved commands for this account and site.</p>}
      {review && <div className="rounded-lg border border-sky-300 bg-sky-50 p-4">
        <h3 className="font-semibold">Review Array {review.command.array} / String {review.command.string}</h3>
        <p>Original command: {review.command.action.toUpperCase()} · Observed contactors: {review.observation.actual.toUpperCase()} · EMS request: {review.observation.requested.toUpperCase()}</p>
        <p className="mt-2 text-sm">Observation: {new Date(review.observation.capturedAt).toLocaleString()} · Review expires: {new Date(review.validUntil).toLocaleTimeString()}</p>
        <p className="my-2 text-sm">Choose only after reviewing site conditions. These buttons save a review record, not an equipment command or an unlock.</p>
        <div className="flex flex-wrap gap-2"><button className={button} disabled={disabled||!canSave} onClick={()=>onSave('site-checked')}>Record site checked — keep blocked</button><button className={button} disabled={disabled||!canSave} onClick={()=>onSave('follow-up-required')}>Record follow-up required</button><button className={button} disabled={disabled||pending} onClick={()=>onSelect(review.command.commandId)}>Refresh feedback</button></div>
      </div>}
    </>}
  </section>;
}
