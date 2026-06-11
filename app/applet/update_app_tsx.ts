const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

const replacement = `  // Fetch full telemetry, reports & alerts
  const [connectionStatus, setConnectionStatus] = useState<any>(null);
  const [showConnectionConfig, setShowConnectionConfig] = useState(false);

  const fetchAllData = async (silent = false) => {
    if (!silent && !connectionStatus) setLoading(true);
    try {
      const modeRes = await fetch('/api/local/ems/connection-status').catch(err => null);

      if (modeRes && modeRes.ok) {
        const mode = await modeRes.json().catch(() => null);
        if (mode) {
           setEmsMetadata(mode);
           setConnectionStatus(mode);
           
           if (!silent && !mode.reachable && (!mode.cacheSeedState || mode.cacheSeedState.percentComplete === 0)) {
               setShowConnectionConfig(true);
           }
        }
      }
    } catch (err) {
      console.log('[App Telemetry Info] Telemetry gateway offline standby:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };`;

content = content.replace(/  \/\/ Fetch full telemetry, reports & alerts[\s\S]*?  \/\/ Immediate fetch/m, replacement + '\n\n  // Immediate fetch');

content = content.replace(
  '{emsMetadata?.activeMode === "demo" && <span className="text-prizm-demo font-bold flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-prizm-demo animate-pulse"></span>DEMO</span>}\n            {emsMetadata?.activeMode === "offline" && <span className="text-prizm-danger font-bold flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-prizm-danger"></span>OFFLINE</span>}',
  `{connectionStatus?.status === 'LIVE' && <span className="text-emerald-400 font-bold flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>LIVE</span>}
            {connectionStatus?.status === 'PARTIAL' && <span className="text-prizm-warning font-bold flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-prizm-warning"></span>PARTIAL</span>}
            {connectionStatus?.status === 'DEMO' && <span className="text-prizm-demo font-bold flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-prizm-demo animate-pulse"></span>DEMO</span>}
            {(!connectionStatus || connectionStatus?.status === 'OFFLINE') && <span className="text-prizm-danger font-bold flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-prizm-danger"></span>OFFLINE</span>}
            {connectionStatus?.status === 'MISCONFIGURED' && <span className="text-prizm-danger font-bold flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-prizm-danger"></span>MISCONFIGURED</span>}`
);

content = content.replace(
  '{(emsMetadata?.discoveredStationCode || emsMetadata?.stationCode) && <span>SITE: {emsMetadata?.discoveredStationCode || emsMetadata?.stationCode}</span>}',
  `<span>SITE: {connectionStatus?.discoveredStationCode || connectionStatus?.stationCode || 'Unknown'}</span>
            {connectionStatus?.status === 'MISCONFIGURED' && <span className="ml-2 text-prizm-danger uppercase">| EMS Settings Required</span>}`
);

const modalCode = `
      {/* EMS Connection Modal */}
      {showConnectionConfig && connectionStatus && !connectionStatus.reachable && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[9999]">
            <div className="bg-prizm-surface-strong border border-prizm-border rounded-lg p-6 max-w-lg w-full">
                <div className="flex items-center gap-3 mb-6 relative">
                    <Network className="text-prizm-danger" size={24} />
                    <div>
                        <h2 className="text-lg font-bold text-prizm-danger uppercase tracking-widest font-mono">EMS Connection Not Detected</h2>
                        <p className="text-xs text-prizm-text-muted mt-1 font-mono">PRIZM could not reach the default EMS target</p>
                    </div>
                </div>

                <div className="bg-black/20 p-4 border border-prizm-border rounded font-mono text-sm mb-6">
                    <div className="mb-2"><strong>Target:</strong> <span className="text-prizm-primary">{connectionStatus.emsBaseUrl}</span></div>
                    {connectionStatus.failureReason && (
                        <div className="text-prizm-danger text-xs whitespace-pre-wrap break-all max-h-32 overflow-y-auto">{connectionStatus.failureReason}</div>
                    )}
                </div>

                <p className="text-prizm-text-muted text-sm mb-6">
                    Check your network connection or update EMS settings if the target has changed.
                </p>

                <div className="flex flex-col gap-3 font-mono">
                    <button
                        onClick={() => {
                            setShowConnectionConfig(false);
                            setActiveTab('settings');
                        }}
                        className="px-4 py-3 bg-prizm-primary/20 border border-prizm-primary/40 text-prizm-primary rounded font-bold hover:bg-prizm-primary/30 transition-colors uppercase tracking-widest text-[10px]"
                    >
                        Open Connection Settings
                    </button>
                    <button
                        onClick={async () => {
                            await fetch('/api/local/ems/retry-connection', { method: 'POST' });
                            fetchAllData(true);
                            if (connectionStatus?.reachable) setShowConnectionConfig(false);
                        }}
                        className="px-4 py-3 border border-prizm-border rounded text-prizm-text hover:bg-prizm-surface transition-colors uppercase tracking-widest text-[10px] font-bold"
                    >
                        Retry Connection
                    </button>
                    <button
                        onClick={() => setShowConnectionConfig(false)}
                        className="px-4 py-3 border border-prizm-border rounded text-prizm-text-muted hover:bg-prizm-surface transition-colors uppercase tracking-widest text-[10px] font-bold"
                    >
                        Continue Offline / Cached Mode
                    </button>
                </div>
            </div>
        </div>
      )}
`;

content = content.replace(
  '{/* MAIN CONTENT AREA */}',
  modalCode + '\n      {/* MAIN CONTENT AREA */}'
);

content = content.replace(
  'LINK: {emsMetadata?.activeEmsBaseUrl || "No site linked"} |',
  'LINK: {connectionStatus?.emsBaseUrl || "No site linked"} |'
);

content = content.replace(
  'LAST UPDATED: {emsMetadata?.lastSuccessfulPoll ? formatPrizmUtcTimestamp(emsMetadata.lastSuccessfulPoll) : "Never"}',
  'LAST UPDATED: {connectionStatus?.lastSuccessfulAt ? formatPrizmUtcTimestamp(connectionStatus.lastSuccessfulAt) : "Never"} {connectionStatus?.cacheSeedState?.running && <span> | CACHE SEEDING: {connectionStatus.cacheSeedState.percentComplete}% ({connectionStatus.cacheSeedState.completedKeys?.length} sources)</span>}'
);

fs.writeFileSync('src/App.tsx', content);
console.log('Updated App.tsx successfully');
