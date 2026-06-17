const fs = require('fs');
let appStr = fs.readFileSync('src/App.tsx', 'utf8');

const btnStr = `<div className="flex items-center gap-4">
            {manualRepollMessage && <span className="text-emerald-500 font-mono text-[10px] uppercase font-bold tracking-widest hidden sm:block mx-2">{manualRepollMessage}</span>}
            {manualRepollError && <span className="text-prizm-danger font-mono text-[10px] uppercase font-bold tracking-widest hidden sm:block mx-2">{manualRepollError}</span>}
            <button
              onClick={handleManualRepoll}
              disabled={manualRepolling}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-prizm-border bg-prizm-surface hover:bg-prizm-surface-strong text-prizm-primary font-mono text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={manualRepolling ? "animate-spin" : ""} />
              {manualRepolling ? "Repolling..." : "Repoll EMS"}
            </button>`;

if (!appStr.includes('Repoll EMS')) {
  appStr = appStr.replace('<div className="flex items-center gap-4">', btnStr);
  fs.writeFileSync('src/App.tsx', appStr);
}
