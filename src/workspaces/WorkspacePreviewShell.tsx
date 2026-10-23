import React, {useCallback,useEffect, useState} from 'react';
import {Contrast, Palette, Sun} from 'lucide-react';
import App from '../App';
import {SiteDataProvider} from '../context/SiteDataContext';
import {getFleetWorkspace,refreshFleetWorkspace} from '../lib/fleetWorkspace';
import {ShiftSessionBanner} from '../components/ShiftSessionBanner';
import {operationsLayoutEnabled,isLocalOperationsReview} from '../lib/operationsReview';

type WorkspacePalette = 'current' | 'contrast' | 'daylight';
const paletteKey = 'prizm_technician_palette'; // Preserve existing display preferences.
function readPalette(): WorkspacePalette {
  try {
    const saved = window.localStorage.getItem(paletteKey);
    return saved === 'contrast' || saved === 'daylight' ? saved : 'current';
  } catch {return 'current';}
}

/** Legacy mode only. The server never serves this workspace in the restricted access pilot. */
export function WorkspacePreviewShell() {
  const operations=operationsLayoutEnabled();
  const localReview=isLocalOperationsReview();
  const [palette, setPalette] = useState<WorkspacePalette>(readPalette);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const workspace=getFleetWorkspace();
  const [accessEnded,setAccessEnded]=useState(false);
  const [resumeError,setResumeError]=useState('');
  const ended=useCallback(()=>setAccessEnded(true),[]);
  useEffect(()=>{const ended=()=>setAccessEnded(true);window.addEventListener('prizm-workspace-access-ended',ended);return ()=>window.removeEventListener('prizm-workspace-access-ended',ended);},[]);
  useEffect(() => {
    // The old name/role chooser was a preference, never a verified identity.
    for (const storage of [window.localStorage, window.sessionStorage]) {
      try {storage.removeItem('prizm_portal_identity');} catch { /* Browser storage may be disabled. */ }
    }
  }, []);
  useEffect(() => {
    if (palette !== 'current') document.documentElement.dataset.prizmPalette = palette;
    else delete document.documentElement.dataset.prizmPalette;
    return () => {delete document.documentElement.dataset.prizmPalette;};
  }, [palette]);
  const choosePalette = (next: WorkspacePalette) => {
    setPalette(next); setPaletteOpen(false);
    try {window.localStorage.setItem(paletteKey, next);} catch { /* In-memory preference still works. */ }
  };
  return <SiteDataProvider>
    {workspace && !operations && <div className="fixed inset-x-0 top-0 z-[110] flex h-11 items-center justify-between gap-3 border-b border-prizm-border bg-prizm-header px-4 text-prizm-text" aria-label="Active site workspace"><a className="font-bold text-prizm-primary underline" href={workspace.fleetUrl}>← Back to Fleet</a><strong>{workspace.siteName} · {workspace.stationCode} · Block {workspace.blockIndex}</strong><span className="text-xs">Authenticated workspace · Site connection locked</span></div>}
    {accessEnded&&workspace&&<main className="p-10 mt-11"><h1>Site access ended</h1><p>Your selected view is retained. If a command was in progress, verify its outcome before retrying.</p><a href={workspace.fleetUrl} target="_blank" rel="noreferrer">Sign in to Fleet in another tab</a><button onClick={()=>{void refreshFleetWorkspace().then(()=>{setAccessEnded(false);setResumeError('');}).catch(e=>setResumeError(e.message));}}>Resume this view after signing in</button>{resumeError&&<p role="alert">{resumeError}</p>}</main>}
    <div className="fixed bottom-4 right-4 z-[100] flex items-center gap-2 rounded-xl border border-prizm-border bg-prizm-surface/95 p-2 text-prizm-text shadow-xl" aria-label="Workspace settings">
      <div className="relative">
        <button onClick={() => setPaletteOpen(open => !open)} className="grid h-10 w-10 place-items-center rounded-lg border border-prizm-border" aria-label="Workspace color palette" aria-expanded={paletteOpen}><Palette size={15}/></button>
        {paletteOpen && <div className="absolute bottom-12 right-0 w-56 rounded-xl border border-prizm-border bg-prizm-surface p-2 shadow-2xl">
          <p className="px-2 pb-2 text-xs font-bold">Workspace colors</p>
          {([
            ['current', Palette, 'Current PRIZM'], ['contrast', Contrast, 'High Contrast'], ['daylight', Sun, 'Field Daylight'],
          ] as const).map(([value, Icon, label]) => <button key={value} onClick={() => choosePalette(value)} aria-pressed={palette === value} className={palette === value ? 'mb-1 flex w-full items-center gap-3 rounded-lg border border-prizm-primary bg-prizm-surface-strong px-3 py-2 text-left' : 'mb-1 flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-left hover:bg-prizm-surface-strong'}><Icon size={15}/><span className="text-xs">{label}</span></button>)}
        </div>}
      </div>
      {workspace?<span className="px-2 text-xs text-prizm-primary">{workspace.email}</span>:localReview?<span className="px-2 text-xs">Read-only local review</span>:<span className="px-2 text-xs text-amber-700" title="Legacy deployment: server-side sign-in has not been enabled.">Sign-in not enabled</span>}
    </div>
    <div hidden={accessEnded} style={workspace&&!operations?{paddingTop:44}:undefined}>{workspace&&!accessEnded&&workspace.fullControl&&<ShiftSessionBanner workspace csrf={workspace.csrf} onExpired={ended}/>}<App/></div>
  </SiteDataProvider>;
}
