import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import SafetyFaultCandidatesPanel from '../components/SafetyFaultCandidatesPanel';
import type {SafetyCandidate} from '../lib/safetyFaultSelection';
import '../index.css';
const candidates: SafetyCandidate[] = [
  {entityKeyToken:'fixture-door',displayKey:'ES3 door controller',statusMessage:'Battery door interlock latched — manual reset required',allowFaultReset:true,enabled:true,communicating:true,equipment:{array:'Array 2',segment:'ES3',controller:'Door interlock controller'}},
  {entityKeyToken:'fixture-hydrogen',displayKey:'ES7 hydrogen sensor',statusMessage:'Hydrogen alarm latched — verify safe atmosphere before reset',allowFaultReset:true,enabled:true,communicating:true,equipment:{array:'Array 4',segment:'ES7',controller:'Hydrogen sensor controller'}},
  {entityKeyToken:'fixture-offline',displayKey:'Collection segment controller',statusMessage:'Safety interlock latched; controller is offline',allowFaultReset:true,enabled:true,communicating:false,equipment:{array:'Array 1',segment:'Collection segment',controller:'Safety controller'}},
];
function Preview() {
  const [mode,setMode] = useState('normal');
  return <main className="min-h-screen bg-slate-100 p-4 sm:p-8 text-slate-900"><div className="mx-auto max-w-6xl space-y-5">
    <div className="rounded border border-blue-200 bg-blue-50 p-4"><strong>SIMULATION ONLY — no equipment connected</strong><p className="mt-1 text-sm">Summary page placement and selection workflow. Reset responses below are simulated, not live.</p></div>
    <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Block summary · SS4 example</h1><label>Preview state <select aria-label="Preview state" value={mode} onChange={e=>setMode(e.target.value)}><option value="normal">Normal</option><option value="stale">Stale data</option><option value="locked">Controls locked</option><option value="empty">No faults</option></select></label></div>
    <SafetyFaultCandidatesPanel key={mode} candidates={mode==='empty'?[]:candidates} profileId="synthetic-safety-preview" stale={mode==='stale'} readOnly={mode==='locked'}/>
    <section className="rounded-lg border border-slate-300 bg-white p-5"><h2 className="text-lg font-bold">Notifications & corrective actions</h2><p className="text-sm text-slate-600">The safety panel sits immediately above the existing notifications and corrective actions tile.</p></section>
  </div></main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
