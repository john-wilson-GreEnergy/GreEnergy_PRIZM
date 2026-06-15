import { Router } from "express";
import { buildSiteTopologyFromCachedSources } from "./siteTopology";
import { readSiteArtifact, writeSiteArtifact, getEffectiveCachePolicy, shouldFetchLive, buildCacheMetadata } from "../cache/prizmCache";
import { refreshSiteOperationsSources, buildSiteOperationsSummaryFromCache } from "../siteOperations";
import { getEmsConnectionStatus } from "../emsTurtleClient";

export const topologyRouter = Router();

topologyRouter.get("/site-topology", async (req, res) => {
    try {
        const policy = getEffectiveCachePolicy(req.query.cache, req.query.noCache, req.query.refresh);
        const forceLive = shouldFetchLive(policy);
        const allowCache = ["cache-first", "cache-only", "live-first"].includes(policy);

        let topology = null;
        let wasLiveAttempted = false;
        let wasLiveSucceeded = false;
        let wasCacheUsed = false;

        if (forceLive) {
            wasLiveAttempted = true;
            if (policy !== "live-first" || req.query.refresh === 'true') {
                 await refreshSiteOperationsSources().catch(() => {});
            }
            topology = buildSiteTopologyFromCachedSources();
            wasLiveSucceeded = !!topology?.siteIdentity?.stationCode || !!topology?.expectedTopology?.blocks?.length;
        }

        if (!wasLiveSucceeded && allowCache) {
            topology = readSiteArtifact('site-topology.json');
            if (!topology && policy !== "cache-only") {
                 topology = buildSiteTopologyFromCachedSources();
            }
            wasCacheUsed = !!topology;
        }

        if (policy === "live-only" && !wasLiveSucceeded) topology = null; // Enforce live-only output logic

        let sourceValue = wasCacheUsed ? "cache" : (wasLiveSucceeded ? "live-ems" : "unavailable");
        if (policy === "cache-only") sourceValue = wasCacheUsed ? "cache" : "unavailable";
        else if (policy === "live-only") sourceValue = wasLiveSucceeded ? "live-ems" : "unavailable";

        res.json({
            topology: topology || {},
            cacheMeta: topology?.cacheMeta,
            source: sourceValue,
            cacheUsed: policy === "live-only" ? false : wasCacheUsed,
            liveAttempted: wasLiveAttempted,
            liveSucceeded: wasLiveSucceeded,
            cachePolicy: policy,
            debug: { refreshed: forceLive }
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

topologyRouter.get("/site-topology/debug", async (req, res) => {
    res.json({
        cached: readSiteArtifact('site-topology.json'),
        connectionStatus: getEmsConnectionStatus()
    });
});

topologyRouter.get("/master-dataset", async (req, res) => {
    try {
        const policy = getEffectiveCachePolicy(req.query.cache, req.query.noCache, req.query.refresh);
        const forceLive = shouldFetchLive(policy);
        const allowCache = ["cache-first", "cache-only", "live-first"].includes(policy);

        let master = null;
        let wasLiveAttempted = false;
        let wasLiveSucceeded = false;
        let wasCacheUsed = false;

        if (forceLive) {
            wasLiveAttempted = true;
            if (policy !== "live-first" || req.query.refresh === 'true') {
                await refreshSiteOperationsSources().catch(() => {});
            }
            
            const opsSummary = await buildSiteOperationsSummaryFromCache();
            const topology = buildSiteTopologyFromCachedSources();
            
            if (opsSummary?.site?.stationCode) {
                 wasLiveSucceeded = true;
                 master = {
                     site: opsSummary?.site,
                     topologyCounts: topology?.counts,
                     bessFleetSummary: opsSummary?.bessFleetSummary,
                     sourceHealth: opsSummary?.sourceHealth,
                     opsSummary
                 };
                 writeSiteArtifact('master-dataset.json', master);
            }
        }

        if (!wasLiveSucceeded && allowCache) {
            master = readSiteArtifact('master-dataset.json');
            if (!master && policy !== "cache-only") {
                 const opsSummary = await buildSiteOperationsSummaryFromCache();
                 const topology = buildSiteTopologyFromCachedSources();
                 master = {
                     site: opsSummary?.site,
                     topologyCounts: topology?.counts,
                     bessFleetSummary: opsSummary?.bessFleetSummary,
                     sourceHealth: opsSummary?.sourceHealth,
                     opsSummary
                 };
            }
            wasCacheUsed = !!master;
        }

        if (policy === "live-only" && !wasLiveSucceeded) master = null;

        let sourceValue = wasCacheUsed ? "cache" : (wasLiveSucceeded ? "live-ems" : "unavailable");
        if (policy === "cache-only") sourceValue = wasCacheUsed ? "cache" : "unavailable";
        else if (policy === "live-only") sourceValue = wasLiveSucceeded ? "live-ems" : "unavailable";

        const output = master || {};
        
        res.json({
             ...output,
             source: sourceValue,
             cacheUsed: policy === "live-only" ? false : wasCacheUsed,
             liveAttempted: wasLiveAttempted,
             liveSucceeded: wasLiveSucceeded,
             cachePolicy: policy,
             cacheMeta: {
                  siteCacheKey: output.topologyCounts?.siteCacheKey || 'unknown',
                  lastBuiltAt: new Date().toISOString(),
                  refreshing: forceLive,
             }
        });

    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
