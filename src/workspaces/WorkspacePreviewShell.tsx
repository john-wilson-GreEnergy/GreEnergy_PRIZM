import React, {useEffect, useState} from 'react';
import {Contrast, Palette, Sun} from 'lucide-react';
import App from '../App';
import {SiteDataProvider} from '../context/SiteDataContext';

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
  const [palette, setPalette] = useState<WorkspacePalette>(readPalette);
  const [paletteOpen, setPaletteOpen] = useState(false);
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
      <span className="px-2 text-xs text-amber-700" title="Legacy deployment: server-side sign-in has not been enabled.">Sign-in not enabled</span>
    </div>
    <App/>
  </SiteDataProvider>;
}
