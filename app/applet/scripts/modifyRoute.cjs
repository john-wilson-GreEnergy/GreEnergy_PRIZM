const fs = require('fs');
const originalCode = fs.readFileSync('src/server/siteOperations.ts', 'utf8');
const startStr = 'router.get("/summary", (req, res) => {';
const endStr = 'export default router;';
const start = originalCode.indexOf(startStr);
const end = originalCode.indexOf(endStr);
if (start === -1) {
  console.log("Not found summary router");
  process.exit(1);
}
const origInnerStart = originalCode.indexOf('    try {', start) + 9;
const origInnerEnd = originalCode.lastIndexOf('        res.json(', end);
const coreLogic = originalCode.slice(origInnerStart, origInnerEnd);

const newCacheLogic = `
import { pollEmsTurtle } from "./emsTurtleClient";

let siteOperationsRefreshInFlight: Promise<any> | null = null;
let lastSummaryCache: any = null;
let lastSummaryTime = 0;

export function buildSiteOperationsSummaryFromCache() {
    try {
${coreLogic}
        return responseData;
    } catch (err: any) {
        console.error("Summary aggregator error:", err);
        throw err;
    }
}

export async function refreshSiteOperationsSources() {
    if (siteOperationsRefreshInFlight) return siteOperationsRefreshInFlight;
    siteOperationsRefreshInFlight = (async () => {
        try {
            await pollEmsTurtle();
            const prizmCache = require('./cache/prizmCache');
            const data = buildSiteOperationsSummaryFromCache();
            if (data) {
                prizmCache.set('site-operations-summary', data, { ttlMs: 15000 });
                if (prizmCache.writeHistory) prizmCache.writeHistory('site-operations', data);
                lastSummaryCache = data;
                lastSummaryTime = Date.now();
            }
        } finally {
            siteOperationsRefreshInFlight = null;
        }
    })();
    return siteOperationsRefreshInFlight;
}

router.get("/summary", async (req, res) => {
    const tStart = Date.now();
    const preferCache = req.query.preferCache !== 'false';
    const forceRefresh = req.query.refresh === 'true';

    try {
        const prizmCache = require('./cache/prizmCache');
        let cachedEntry = prizmCache.get('site-operations-summary');
        
        if (!cachedEntry && lastSummaryCache && (Date.now() - lastSummaryTime < 15000)) {
            cachedEntry = { data: lastSummaryCache, ageMs: Date.now() - lastSummaryTime, isLive: true };
        }

        const tCacheRead = Date.now() - tStart;
        
        let shouldRefresh = forceRefresh || !cachedEntry || cachedEntry.ageMs > 15000;
        let responseData = cachedEntry ? cachedEntry.data : null;

        if (!responseData && !forceRefresh) {
            responseData = buildSiteOperationsSummaryFromCache();
            if (responseData) {
                prizmCache.set('site-operations-summary', responseData, { ttlMs: 15000 });
                lastSummaryCache = responseData;
                lastSummaryTime = Date.now();
            }
        }

        let cacheState = "UNAVAILABLE";
        if (responseData) cacheState = (siteOperationsRefreshInFlight || shouldRefresh) ? "STALE" : "LIVE";
        if (cachedEntry) cacheState = "CACHED";
        if (forceRefresh || shouldRefresh) cacheState = "REFRESHING";

        const tBuild = Date.now() - tStart;
        
        let refreshing = false;
        if (shouldRefresh) {
            refreshing = true;
            refreshSiteOperationsSources().catch(() => {});
        } else if (siteOperationsRefreshInFlight) {
            refreshing = true;
        }

        if (forceRefresh && !responseData) {
             const result = await Promise.race([
                 siteOperationsRefreshInFlight,
                 new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 3000))
             ]).catch(() => null);
             
             responseData = buildSiteOperationsSummaryFromCache();
             if (responseData) cacheState = "LIVE";
        }

        if (!responseData) responseData = {};

        responseData.cacheMeta = {
            cacheState,
            fetchedAt: cachedEntry ? cachedEntry.fetchedAt : new Date().toISOString(),
            ageMs: cachedEntry ? cachedEntry.ageMs : 0,
            ttlMs: 15000,
            sourceOk: true,
            refreshing
        };

        const totalMs = Date.now() - tStart;
        responseData.debug = {
             timings: { totalMs, cacheReadMs: tCacheRead, buildMs: tBuild - tCacheRead, sourceHealthMs: 0, refreshTriggered: shouldRefresh }
        };

        if (totalMs > 500) console.log(\`[SiteOps] Slow summary response: \${totalMs}ms\`);

        res.json(responseData);
    } catch (err: any) {
        console.error("Summary error:", err);
        res.status(500).json({ error: err.message });
    }
});
`;

fs.writeFileSync('src/server/siteOperations.ts', originalCode.slice(0, start) + newCacheLogic + '\n' + originalCode.slice(end));
console.log('REPLACED');
