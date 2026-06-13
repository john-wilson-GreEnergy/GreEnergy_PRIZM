import { Router } from "express";
import { buildSiteTopologyFromCachedSources } from "./siteTopology";
import { readSiteArtifact, writeSiteArtifact } from "../cache/prizmCache";
import { refreshSiteOperationsSources, buildSiteOperationsSummaryFromCache } from "../siteOperations";
import { getEmsConnectionStatus } from "../emsTurtleClient";

export const topologyRouter = Router();

topologyRouter.get("/site-topology", async (req, res) => {
    try {
        const refresh = req.query.refresh === 'true';
        let topology = readSiteArtifact('site-topology.json');

        if (!topology || refresh) {
            if (refresh) {
                // background refresh without waiting forever if timeout
                await refreshSiteOperationsSources().catch(() => {});
            }
            topology = buildSiteTopologyFromCachedSources();
        }

        res.json({
            topology,
            cacheMeta: topology?.cacheMeta,
            debug: { refreshed: refresh }
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
        const refresh = req.query.refresh === 'true';
        let master = readSiteArtifact('master-dataset.json');

        if (!master || refresh) {
            if (refresh) {
                await refreshSiteOperationsSources().catch(() => {});
            }
            
            const opsSummary = await buildSiteOperationsSummaryFromCache();
            const topology = readSiteArtifact('site-topology.json') || buildSiteTopologyFromCachedSources();

            master = {
                site: opsSummary?.site,
                topologyCounts: topology?.counts,
                bessFleetSummary: opsSummary?.bessFleetSummary,
                sourceHealth: opsSummary?.sourceHealth,
                cacheMeta: {
                    siteCacheKey: topology?.cacheMeta?.siteCacheKey,
                    lastBuiltAt: new Date().toISOString(),
                    refreshing: refresh,
                },
                opsSummary
            };

            writeSiteArtifact('master-dataset.json', master);
        }

        res.json(master);

    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
