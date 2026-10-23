import React, {useEffect, useRef, useState} from 'react';
import {ShieldAlert} from 'lucide-react';
import {remoteReadOnlyWorkspace} from '../lib/fleetWorkspace';
import {candidateBlockedReason, candidateSignature, clearSelectedSafetyFaults, selectedSafetyCandidates,
  type SafetyCandidate, type ClearOutcome} from '../lib/safetyFaultSelection';

export interface SafetyFaultCandidatesPanelProps {
  candidates: SafetyCandidate[];
  profileId?: string;
  stale?: boolean;
  unavailable?: boolean;
  readOnly?: boolean;
  onOpenDetails?: () => void;
}

export default function SafetyFaultCandidatesPanel({candidates, profileId, stale = false,
  unavailable = false, readOnly = remoteReadOnlyWorkspace(), onOpenDetails}: SafetyFaultCandidatesPanelProps) {
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [results, setResults] = useState<ClearOutcome[]>([]);
  const [processing, setProcessing] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  const latest = useRef({profileId, stale, unavailable, readOnly});
  latest.current = {profileId, stale, unavailable, readOnly};
  useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);
  useEffect(() => {setSelected({}); setResults([]);}, [profileId]);
  // A changed/disappearing fault loses its selection; new faults are never auto-selected.
  useEffect(() => {
    setSelected(previous => Object.fromEntries(selectedSafetyCandidates(candidates, previous)
      .map(c => [c.entityKeyToken, candidateSignature(c)])));
  }, [candidates]);
  const blocked = !profileId || stale || unavailable || readOnly;
  const sent = new Set(results.filter(r => ['queued', 'confirmed', 'unknown'].includes(r.state)).map(r => r.candidate.entityKeyToken));
  const eligible = candidates.filter(c => !candidateBlockedReason(c) && !sent.has(c.entityKeyToken));
  const chosen = selectedSafetyCandidates(eligible, selected);
  const allSelected = eligible.length > 0 && chosen.length === eligible.length;
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {if (selectAllRef.current) selectAllRef.current.indeterminate = chosen.length > 0 && !allSelected;}, [chosen.length, allSelected]);
  const clear = async () => {
    if (busy.current || blocked || !chosen.length) return;
    busy.current = true; setProcessing(true); setSelected({});
    const submittedProfile = profileId!;
    const targets = chosen.map(c => ({...c}));
    try {
      await clearSelectedSafetyFaults(submittedProfile, targets, fetch, result => {
        if (mounted.current && latest.current.profileId === submittedProfile) setResults(previous => [...previous, result]);
      }, () => mounted.current && latest.current.profileId === submittedProfile &&
        !latest.current.readOnly && !latest.current.stale && !latest.current.unavailable);
    } finally {busy.current = false; if (mounted.current) setProcessing(false);}
  };
  return <section aria-label="Safety fault candidates" className="w-full rounded-lg border-2 border-red-300 bg-prizm-surface text-prizm-text">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-red-200 bg-red-50 p-4">
      <div><h2 className="flex items-center gap-2 text-base font-bold text-red-800"><ShieldAlert size={20}/> Safety fault candidates <span className="rounded-full bg-red-100 px-2">{candidates.length}</span></h2>
        <p className="mt-1 text-xs text-slate-700">Review the issue and affected equipment before clearing. One selection per device; a reset may clear multiple faults on that device.</p></div>
      {onOpenDetails && <button type="button" onClick={onOpenDetails} className="rounded border border-red-300 px-3 py-2 text-xs font-bold text-red-800">Open Safety Clear</button>}
    </header>
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <label className="flex items-center gap-2 text-sm font-bold"><input ref={selectAllRef} type="checkbox" checked={allSelected}
        disabled={blocked || processing || !eligible.length} onChange={e => setSelected(e.target.checked ? Object.fromEntries(eligible.map(c => [c.entityKeyToken, candidateSignature(c)])) : {})}/> Select all eligible</label>
      <div className="flex items-center gap-3"><span className="text-sm" aria-live="polite">{chosen.length} selected</span>
        <button type="button" onClick={clear} disabled={blocked || processing || !chosen.length}
          className="rounded bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed">{processing ? 'Clearing selected…' : 'Clear selected'}</button></div>
    </div>
    <p className="px-4 pb-3 text-xs text-prizm-text-muted">Clear selected sends a manual reset for the selected devices only. Queued does not mean cleared. Confirm safe conditions using your site procedure.</p>
    {blocked && <p role="status" className="px-4 pb-3 font-bold text-amber-800">{readOnly ? 'Controls are locked for this user profile.' : stale || unavailable ? 'Safety data is stale or unavailable. Clearing is disabled.' : 'Site profile unavailable. Clearing is disabled.'}</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead className="bg-prizm-surface-strong"><tr>{['Select', 'Issue', 'Array / segment', 'Affected equipment / controller', 'Reset status'].map(label => <th scope="col" key={label} className="px-4 py-2">{label}</th>)}</tr></thead>
      <tbody>{candidates.map(c => {
        const reason = candidateBlockedReason(c);
        const result = [...results].reverse().find(r => r.candidate.entityKeyToken === c.entityKeyToken);
        return <tr key={c.entityKeyToken || c.displayKey} className="border-t border-prizm-border align-top">
          <td className="p-4"><input type="checkbox" aria-label={`Select ${c.displayKey || c.entityKeyToken}`} checked={chosen.some(item => item.entityKeyToken === c.entityKeyToken)}
            disabled={blocked || processing || !!reason || sent.has(c.entityKeyToken)} onChange={e => {const checked = e.target.checked; setSelected(previous => {const next = {...previous}; if (checked) next[c.entityKeyToken] = candidateSignature(c); else delete next[c.entityKeyToken]; return next;});}}/></td>
          <td className="p-4 whitespace-pre-wrap min-w-[220px]">{c.statusMessageText || c.statusMessage || 'Reset eligible; issue description unavailable'}</td>
          <td className="p-4"><div>{c.equipment?.array || 'Array not reported'}</div><div className="text-prizm-text-muted">{c.equipment?.segment || 'Segment not reported'}</div></td>
          <td className="p-4"><div className="font-bold">{c.displayKey || c.entityKey || c.entityKeyToken}</div><div>{c.equipment?.controller || c.entityType || 'Controller not reported'}</div><div className="mt-1 break-all text-xs text-prizm-text-muted">{c.entityKeyToken}</div></td>
          <td className="p-4">{result?.message || reason || 'Eligible for manual reset'}</td>
        </tr>;
      })}</tbody>
    </table></div>
    {!candidates.length && <p className="p-4 text-sm">{unavailable || stale ? 'No current safety candidates available.' : 'No clearable safety faults reported.'}</p>}
    {results.length > 0 && <div className="border-t border-prizm-border p-4" role="status" aria-live="polite"><h3 className="font-bold">Clear selected results</h3><ul className="mt-2 space-y-1 text-sm">{results.map((r, i) => <li key={i}><strong>{r.candidate.displayKey || r.candidate.entityKeyToken}:</strong> {r.message}</li>)}</ul></div>}
  </section>;
}
