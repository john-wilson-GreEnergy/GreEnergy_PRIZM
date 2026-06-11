import { Router } from "express";
import { getEmsCachedBlock, getEmsCachedStatus, getEmsCachedLastCall, getEmsCachedRawStrings, getEmsConnectionStatus, getEmsSourcesDebugInfo } from "./emsTurtleClient";

const router = Router();

router.get("/summary", (req, res) => {
    try {
        const block = getEmsCachedBlock().data || {};
        const status = getEmsCachedStatus().data || {};
        const lastCall = getEmsCachedLastCall().data || {};
        const stringsData = getEmsCachedRawStrings().data || [];
        const conn = getEmsConnectionStatus();

        // 1. Merge core lists from wherever they exist (blockviewer, status, or lastCall)
        const arrays = block.arrays || status.arrays || lastCall.arrays || [];
        const dragonApps = block.dragonApps || status.dragonApps || lastCall.dragonApps || [];
        // topology could be an array or an object { lineups: [] }, cloud summary treats it as topology[] array for blocks
        let topology = block.topology || status.topology || lastCall.topology || [];
        if (!Array.isArray(topology) && topology.lineups) {
            topology = topology.lineups; 
        }

        const sourceHealth = getEmsSourcesDebugInfo().map((d: any) => ({
            name: d.endpoint.split('/').pop() || d.endpoint,
            type: d.endpoint.includes('feather') ? 'Feather' : 'EMS',
            ok: d.success,
            error: d.lastError === "NONE" ? undefined : d.lastError
        }));

        res.json({
            site: {
               stationCode: conn.discoveredStationCode || conn.stationCode,
               activeProfileId: conn.activeProfileId,
               emsBaseUrl: conn.activeEmsBaseUrl,
               connectionState: conn.connectionState
            },
            sourceHealth,
            arrays,
            dragonApps,
            topology,
            recentEvents: []
        });
    } catch (err: any) {
        console.error("Summary aggregator error:", err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
