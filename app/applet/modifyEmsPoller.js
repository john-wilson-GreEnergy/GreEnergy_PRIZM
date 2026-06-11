import fs from 'fs';

const content = fs.readFileSync('src/server/emsTurtleClient.ts', 'utf8');

const replacement = `
const EMS_FAST_TIMEOUT_MS = 2500;
const EMS_NORMAL_TIMEOUT_MS = 5000;
const EMS_SLOW_TIMEOUT_MS = 15000;

let lastSlowFetchTime = 0;

export async function pollEmsTurtle(): Promise<{ success: boolean; error: string | null }> {
  emsCache.hasAttemptedPoll = true;
  let overallError: string | null = null;
  let criticalEndpointsFailed = 0;
  let coreEndpointsSucceeded = 0;

  // 1. Critical Fetches
  const criticalFetches = Promise.allSettled([
    fetchAndRecord("/status", EMS_FAST_TIMEOUT_MS, 'json').then(d => { emsCache.status = { ...emsCache.status, ...d }; return d; }),
    fetchAndRecord("/tools/report/ems/status.json", EMS_FAST_TIMEOUT_MS, 'json').then(d => { emsCache.status = { ...emsCache.status, ...d }; return d; }),
    fetchAndRecord("/tools/monitor/ems/blockviewer/data", EMS_FAST_TIMEOUT_MS, 'json').then(d => { emsCache.block = d; return d; }),
    fetchAndRecord("/tools/report/ems/lastCall.json", EMS_FAST_TIMEOUT_MS, 'json').then(d => { emsCache.lastCall = d; return d; }),
    fetchAndRecord("/tools/report/ems/strings.csv", EMS_FAST_TIMEOUT_MS, 'text').then(text => { emsCache.strings = parseCsv(text); return text; })
  ]);

  const criticalResults = await criticalFetches;
  criticalResults.forEach(res => {
    if (res.status === 'fulfilled') {
      if (res.value) coreEndpointsSucceeded++;
    } else {
      overallError = res.reason?.message || String(res.reason);
      criticalEndpointsFailed++;
    }
  });

  // 2. Optional Fetches (Run in background)
  const optionalFetches = Promise.allSettled([
    fetchAndRecord("/tools/report/ems/controllerStatistics.json", EMS_NORMAL_TIMEOUT_MS, 'json').then(d => { emsCache.controllerStatistics = d; }),
    fetchAndRecord("/tools/report/ems/bessStatusCodes.json", EMS_NORMAL_TIMEOUT_MS, 'json').then(d => { emsCache.bessStatusCodes = d; }),
    fetchAndRecord("/tools/report/ems/ipMap.json", EMS_NORMAL_TIMEOUT_MS, 'text').then(text => {
      try { emsCache.ipMap = JSON.parse(text); } catch { emsCache.ipMap = text as any; }
    }).catch(async () => {
      const csv = await fetchAndRecord("/tools/report/ems/ipMap.csv", EMS_NORMAL_TIMEOUT_MS, 'text');
      try { emsCache.ipMap = JSON.parse(csv); } catch { emsCache.ipMap = csv as any; }
    }),
    fetchAndRecord("/tools/report/ems/stringIPMap.json", EMS_NORMAL_TIMEOUT_MS, 'text').then(text => {
      try { emsCache.stringIPMap = JSON.parse(text); } catch { emsCache.stringIPMap = text as any; }
    }).catch(async () => {
      const csv = await fetchAndRecord("/tools/report/ems/stringIPMap.csv", EMS_NORMAL_TIMEOUT_MS, 'text');
      try { emsCache.stringIPMap = JSON.parse(csv); } catch { emsCache.stringIPMap = csv as any; }
    }),
    fetchAndRecord("/firstresponder/data", EMS_NORMAL_TIMEOUT_MS, 'json').then(d => { 
      emsCache.firstResponder = { ...emsCache.firstResponder, v1: d }; 
    }),
    fetchAndRecord("/v2/firstresponder/data", EMS_NORMAL_TIMEOUT_MS, 'json').then(d => { 
      emsCache.firstResponder = { ...emsCache.firstResponder, v2: d }; 
    })
  ]);
  optionalFetches.catch(() => {});

  // 3. Slow Fetches (Run in background, less frequently - e.g., every 5 min)
  const now = Date.now();
  if (now - lastSlowFetchTime > 300000) {
    lastSlowFetchTime = now;
    fetchAndRecord("/modbus_map.csv", EMS_SLOW_TIMEOUT_MS, 'text').then(text => {
      emsCache.modbusMap = text;
    }).catch(() => {});
  }

  const rawUrl = getNormalizedBaseUrl();
  const activeRef = ProfileStore.getActiveProfile();
  const activeId = activeRef ? activeRef.id : "default-local-ems";

  if (!cacheCreatedAt || cacheProfileId !== activeId || cacheEmsBaseUrl !== rawUrl) {
    cacheCreatedAt = new Date().toISOString();
  }
  cacheLastUpdatedAt = new Date().toISOString();
  cacheProfileId = activeId;
  cacheEmsBaseUrl = rawUrl;

  let discovered = emsCache.discoveredStationCode;
  let source = emsCache.siteCodeSource;

  if (emsCache.status && emsCache.status.stationCode) {
    discovered = emsCache.status.stationCode;
    source = "status.json:stationCode";
  } else if (emsCache.strings && emsCache.strings.length > 0) {
    const firstStr = emsCache.strings[0];
    const stringKey = firstStr.StringKey || '';
    const stMatch = stringKey.match(/ST:([A-Z0-9_-]+)/i);
    if (stMatch) {
       discovered = stMatch[1];
       source = "strings.csv:StringKey";
    } else {
       const wordMatch = stringKey.match(/\\b(BHE\\d{4})\\b/i);
       if (wordMatch) {
          discovered = wordMatch[1];
          source = "strings.csv:StringKey";
       }
    }
  }

  if (discovered) {
    emsCache.discoveredStationCode = discovered;
    emsCache.siteCodeSource = source;
  }

  if (coreEndpointsSucceeded > 0 || criticalEndpointsFailed < 3) {
    emsCache.lastUpdated = cacheLastUpdatedAt;
    emsCache.lastError = overallError ? "partial: " + overallError : null;
    return { success: true, error: emsCache.lastError };
  } else {
    emsCache.lastUpdated = cacheLastUpdatedAt;
    emsCache.lastError = overallError || "Multiple critical EMS endpoints are unreachable";
    
    if (
      overallError && (
        overallError.includes("aborted") || 
        overallError.includes("fetch failed") || 
        overallError.includes("ENOTFOUND") ||
        overallError.includes("EHOSTUNREACH") ||
        overallError.includes("ECONNREFUSED")
      )
    ) {
      console.log(\`[EMS LAN Info] Base URL \${getNormalizedBaseUrl()} currently in offline standby state.\`);
    } else {
      console.log(\`[EMS LAN Info] Base URL check returned offline backup state: \${overallError}\`);
    }
    
    return { success: false, error: emsCache.lastError };
  }
}
`;

const lines = content.split('\\n');
const startIdx = lines.findIndex(l => l.includes('export async function pollEmsTurtle()'));
const endIdx = lines.findIndex((l, i) => i > startIdx && l === '}');

if (startIdx !== -1 && endIdx !== -1) {
    const newContent = lines.slice(0, startIdx).join('\\n') + '\\n' + replacement + '\\n' + lines.slice(endIdx + 1).join('\\n');
    fs.writeFileSync('src/server/emsTurtleClient.ts', newContent);
    console.log("Replaced pollEmsTurtle successfully.");
} else {
    console.log("Could not find pollEmsTurtle bounds.");
}
