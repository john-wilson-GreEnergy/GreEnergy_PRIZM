import { Router } from "express";
import { getEmsCachedBlock, getEmsCachedStatus, getEmsCachedLastCall, getEmsCachedRawStrings, getEmsConnectionStatus, getEmsSourcesDebugInfo } from "./emsTurtleClient";
import fs from "fs";

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
        
        let dragonApps = block.dragonApps || status.dragonApps || lastCall.dragonApps || [];
        // Normalize dragon apps to include shortAppStatus and correctly interpret boolean 'enabled'
        if (Array.isArray(dragonApps)) {
            dragonApps = dragonApps.map((app: any) => ({
                ...app,
                hasShortAppStatus: !!app.shortAppStatus
            }));
        }

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

        // Searching for PCS in local EMS sources
        const pcsDebugKeys: string[] = [];
        const pcsSummary: any[] = [];
        const htsSummary: any[] = [];
        
        function dig(obj: any, path: string = "") {
            if (!obj || typeof obj !== 'object') return;
            if (Array.isArray(obj)) {
                 obj.forEach((o, i) => dig(o, `${path}[${i}]`));
            } else {
                 for (const [k, v] of Object.entries(obj)) {
                     const tl = k.toLowerCase();
                     if (tl.includes('pcs') || tl.includes('inverter') || tl.includes('converter')) {
                         pcsDebugKeys.push(`${path ? path + '.' : ''}${k}`);
                         if (Array.isArray(v)) {
                             pcsSummary.push(...v);
                         } else if (typeof v === 'object' && v !== null) {
                             pcsSummary.push(v);
                         }
                     }
                     if (tl === 'humiditytemperaturesensors' || tl === 'hts' || (tl.includes('humidity') && obj.temperature !== undefined)) {
                         if (Array.isArray(v)) htsSummary.push(...v);
                         else if (typeof v === 'object' && v !== null) htsSummary.push(v);
                         else if (tl.includes('humidity')) htsSummary.push(obj); // push parent if it is an object
                     }
                     dig(v, `${path ? path + '.' : ''}${k}`);
                 }
            }
        }
        dig(block, "block");
        dig(status, "status");
        dig(lastCall, "lastCall");

        let featherSummary: any[] = [];
        try {
            // Attempt to read feather output directly from memory or fetch? We shouldn't fetch in summary.
            // But we don't have a cache for it here, summary just needs returning fields.
            // If we don't have it, we'll just return empty arrays.
        } catch(e) {}

        const clearableFaults = Array.isArray(topology) ? topology.filter((t: any) => t.allowFaultReset === true) : [];

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
            humidityTemperatureSensors: htsSummary.filter((v,i,a) => a.findIndex(t=>(t.id === v.id))===i),
            pcsSummary: pcsSummary.filter((v,i,a) => a.findIndex(t=>(t.pcsIndex === v.pcsIndex || t.id === v.id))===i),
            pcsDebugKeys: Array.from(new Set(pcsDebugKeys)),
            pcsSourceHealth: "Searched block, status, lastCall",
            safetySummary: {
                clearableFaults
            },
            featherSummary,
            recentEvents: []
        });
    } catch (err: any) {
        console.error("Summary aggregator error:", err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
