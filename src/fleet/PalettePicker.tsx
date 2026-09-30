import React, {useEffect, useState} from 'react';

type Palette = 'current' | 'contrast' | 'daylight';
const key = 'prizm_technician_palette';

/** Display-only preference, using the same palette definitions as Block Summary. */
export function PalettePicker() {
  const [palette, setPalette] = useState<Palette>(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved === 'current' || saved === 'contrast' || saved === 'daylight') return saved;
    } catch { /* Offline browser storage can be disabled. */ }
    return 'daylight';
  });
  useEffect(() => {
    if (palette === 'current') delete document.documentElement.dataset.prizmPalette;
    else document.documentElement.dataset.prizmPalette = palette;
    return () => { delete document.documentElement.dataset.prizmPalette; };
  }, [palette]);
  return <label className="palette-control">Workspace colors
    <select value={palette} onChange={event => {
      const next = event.target.value as Palette;
      setPalette(next);
      try { localStorage.setItem(key, next); } catch { /* Keep the in-memory choice. */ }
    }}>
      <option value="current">Current PRIZM</option>
      <option value="daylight">Field Daylight</option>
      <option value="contrast">High Contrast</option>
    </select>
  </label>;
}
