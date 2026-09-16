import React, { useEffect, useState } from 'react';
import { Contrast, LogOut, Palette, Sun, UserCog, Wrench } from 'lucide-react';
import App from '../App';
import { SiteDataProvider } from '../context/SiteDataContext';

type Portal = 'operator' | 'technician';
type PortalIdentity = { name: string; portal: Portal };
const identityKey = 'prizm_portal_identity';
const paletteKey = 'prizm_technician_palette';
type TechnicianPalette = 'current' | 'contrast' | 'daylight';

function readPalette(): TechnicianPalette {
  const saved = window.localStorage.getItem(paletteKey);
  return saved === 'contrast' || saved === 'daylight' ? saved : 'current';
}

function readIdentity(): PortalIdentity | null {
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      const value = JSON.parse(storage.getItem(identityKey) || 'null');
      if (value?.name && (value.portal === 'operator' || value.portal === 'technician')) return value;
    } catch { /* ignore invalid saved session data */ }
  }
  return null;
}

function setPortalQuery(portal?: Portal) {
  const url = new URL(window.location.href);
  url.searchParams.delete('workspace');
  url.searchParams.delete('legacyTab');
  if (portal) url.searchParams.set('portal', portal); else url.searchParams.delete('portal');
  window.history.replaceState(window.history.state, '', url);
}

function PortalEntry({ onEnter }: { onEnter: (identity: PortalIdentity, remember: boolean) => void }) {
  const [name, setName] = useState('');
  const [portal, setPortal] = useState<Portal>('technician');
  const [remember, setRemember] = useState(true);
  const enter = () => { const trimmed = name.trim(); if (trimmed) onEnter({ name: trimmed, portal }, remember); };
  return <main className="grid min-h-screen place-items-center bg-slate-100 p-4 text-slate-900"><section className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl">
    <div className="border-b border-slate-200 bg-slate-950 px-6 py-6 text-white sm:px-8"><p className="font-mono text-[10px] font-black uppercase tracking-[.25em] text-emerald-400">GreEnergy PRIZM</p><h1 className="mt-2 text-2xl font-black">Choose your portal</h1><p className="mt-2 text-sm text-slate-300">Both portals use the complete PRIZM interface. Your selection adjusts its organization and emphasis.</p></div>
    <div className="space-y-6 p-6 sm:p-8"><label className="block text-sm font-black">Name or technician identifier<input autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && enter()} placeholder="Enter your name or ID" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20" /></label>
      <div className="grid gap-4 md:grid-cols-2" role="radiogroup" aria-label="Portal selection"><button type="button" role="radio" aria-checked={portal === 'technician'} onClick={() => setPortal('technician')} className={`rounded-2xl border-2 p-5 text-left transition ${portal === 'technician' ? 'border-sky-500 bg-sky-50 shadow-md' : 'border-slate-200 hover:border-slate-400'}`}><Wrench size={22} className="text-sky-600"/><strong className="mt-4 block text-lg">Technician Portal</strong><span className="mt-2 block text-sm text-slate-600">The familiar PRIZM interface organized around field troubleshooting, device status, faults, and corrective actions.</span></button><button type="button" role="radio" aria-checked={portal === 'operator'} onClick={() => setPortal('operator')} className={`rounded-2xl border-2 p-5 text-left transition ${portal === 'operator' ? 'border-emerald-500 bg-emerald-50 shadow-md' : 'border-slate-200 hover:border-slate-400'}`}><UserCog size={22} className="text-emerald-600"/><strong className="mt-4 block text-lg">Operator Portal</strong><span className="mt-2 block text-sm text-slate-600">The familiar PRIZM interface emphasizing site controls, tests, reporting, configuration, and advanced tools.</span></button></div>
      <div className="flex flex-col gap-4 border-t border-slate-200 pt-5 sm:flex-row sm:items-center"><label className="flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="h-4 w-4"/>Remember this user and portal on this device</label><button type="button" disabled={!name.trim()} onClick={enter} className="min-h-12 rounded-xl bg-slate-950 px-6 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40 sm:ml-auto">Enter {portal === 'technician' ? 'Technician' : 'Operator'} Portal</button></div>
    </div>
  </section></main>;
}

export function WorkspacePreviewShell() {
  const [identity, setIdentity] = useState<PortalIdentity | null>(readIdentity);
  const [palette, setPalette] = useState<TechnicianPalette>(readPalette);
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const activePalette = identity?.portal === 'technician' && palette !== 'current' ? palette : undefined;
    if (activePalette) document.documentElement.dataset.prizmPalette = activePalette;
    else delete document.documentElement.dataset.prizmPalette;
    return () => { delete document.documentElement.dataset.prizmPalette; };
  }, [identity?.portal, palette]);
  const choosePalette = (next: TechnicianPalette) => { setPalette(next); window.localStorage.setItem(paletteKey, next); setPaletteOpen(false); };
  const enter = (next: PortalIdentity, remember: boolean) => { window.localStorage.removeItem(identityKey); window.sessionStorage.removeItem(identityKey); (remember ? window.localStorage : window.sessionStorage).setItem(identityKey, JSON.stringify(next)); setPortalQuery(next.portal); setIdentity(next); };
  const switchPortal = (portal: Portal) => { if (!identity) return; const next = { ...identity, portal }; const storage = window.localStorage.getItem(identityKey) ? window.localStorage : window.sessionStorage; storage.setItem(identityKey, JSON.stringify(next)); setPortalQuery(portal); setIdentity(next); window.dispatchEvent(new CustomEvent('prizm-portal-change', { detail: portal })); };
  const signOut = () => { window.localStorage.removeItem(identityKey); window.sessionStorage.removeItem(identityKey); setPortalQuery(); setIdentity(null); };
  if (!identity) return <PortalEntry onEnter={enter}/>;
  return <SiteDataProvider><div className="fixed bottom-4 right-4 z-[100] flex flex-wrap items-center justify-end gap-1 rounded-xl border border-prizm-border bg-prizm-surface/95 p-2 text-prizm-text shadow-xl" aria-label="Portal switcher">
    {identity.portal === 'technician' && <div className="relative"><button onClick={() => setPaletteOpen((open) => !open)} className="grid h-10 w-10 place-items-center rounded-lg border border-prizm-border hover:bg-prizm-surface-strong" title="Technician color palette" aria-label="Technician color palette" aria-expanded={paletteOpen}><Palette size={15}/></button>{paletteOpen && <div className="absolute bottom-12 right-0 w-56 rounded-xl border border-prizm-border bg-prizm-surface p-2 shadow-2xl"><p className="px-2 pb-2 font-mono text-[9px] font-black uppercase tracking-wider text-prizm-text-muted">Technician colors</p>{([
      ['current', Palette, 'Current PRIZM', 'Familiar neutral palette'],
      ['contrast', Contrast, 'High Contrast', 'Stronger borders and text'],
      ['daylight', Sun, 'Field Daylight', 'Bright teal-tinted surfaces'],
    ] as const).map(([value, Icon, label, detail]) => <button key={value} onClick={() => choosePalette(value)} aria-pressed={palette === value} className={`mb-1 flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left last:mb-0 ${palette === value ? 'border-prizm-primary bg-prizm-surface-strong' : 'border-transparent hover:bg-prizm-surface-strong'}`}><Icon size={15} className="shrink-0 text-prizm-primary"/><span><strong className="block text-[11px]">{label}</strong><small className="block text-[9px] text-prizm-text-muted">{detail}</small></span></button>)}</div>}</div>}
    <span className="px-2 font-mono text-[9px] font-black uppercase text-prizm-text-muted">{identity.name}</span><button aria-pressed={identity.portal === 'technician'} onClick={() => switchPortal('technician')} className={`min-h-10 rounded-lg px-3 text-[10px] font-black uppercase ${identity.portal === 'technician' ? 'bg-sky-500 text-white' : 'hover:bg-sky-50'}`}><Wrench size={13} className="mr-1 inline"/>Technician</button><button aria-pressed={identity.portal === 'operator'} onClick={() => switchPortal('operator')} className={`min-h-10 rounded-lg px-3 text-[10px] font-black uppercase ${identity.portal === 'operator' ? 'bg-emerald-600 text-white' : 'hover:bg-emerald-50'}`}><UserCog size={13} className="mr-1 inline"/>Operator</button><button onClick={signOut} className="grid h-10 w-10 place-items-center rounded-lg border border-prizm-border" title="Change user"><LogOut size={14}/></button></div><App/></SiteDataProvider>;
}
