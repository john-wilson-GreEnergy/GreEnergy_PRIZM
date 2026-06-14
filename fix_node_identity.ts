import fs from 'fs';
let file = fs.readFileSync('src/App.tsx', 'utf8');

file = file.replace(
/<span title=\{emsMetadata\?\.activeEmsBaseUrl \|\| "No site linked"\} className="truncate max-w-\[200px\]">NODE: \{emsMetadata \? \(emsMetadata\.activeProfileName \|\| "UNLINKED"\) : '\.\.\.'\}<\/span>\s*<span>SITE: \{connectionStatus\?\.discoveredStationCode \|\| connectionStatus\?\.stationCode \|\| 'Unknown'\}<\/span>/s,
`{(() => {
              const reachable = connectionStatus?.reachable || emsMetadata?.reachable;
              const nodeName = connectionStatus?.activeProfileName || connectionStatus?.profileName || emsMetadata?.activeProfileName || emsMetadata?.profileName || bootStatus?.activeProfileName || bootStatus?.profileName || (reachable ? "LOCAL EMS" : "UNLINKED");
              const stationCode = connectionStatus?.discoveredStationCode || connectionStatus?.stationCode || bootStatus?.stationCode || "UNKNOWN";
              return (
                  <>
                      <span title={emsMetadata?.activeEmsBaseUrl || "No site linked"} className="truncate max-w-[200px]">NODE: {nodeName}</span>
                      <span>SITE: {stationCode}</span>
                  </>
              );
            })()}`
);

fs.writeFileSync('src/App.tsx', file);
console.log('Fixed node identity');
