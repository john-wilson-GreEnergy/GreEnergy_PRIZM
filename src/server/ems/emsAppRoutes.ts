import { Router } from "express";
import { fetchLiveEmsApps } from "./emsAppsService";
import { setEmsApplicationEnabledStatus, SetAppStatusInput } from "./dragonAppControl";
import { getEffectiveCachePolicy, shouldFetchLive, buildCacheMetadata } from "../cache/prizmCache";
import { pollEmsTurtle } from "../emsTurtleClient";

const router = Router();

// GET /api/local/ems-apps/control-capabilities
router.get("/control-capabilities", async (req, res) => {
  const policy = getEffectiveCachePolicy(req.query.cache, req.query.noCache, req.query.refresh);
  const forceLive = shouldFetchLive(policy);

  let liveAttempted = false;
  if (forceLive || req.query.refresh === 'true') {
      liveAttempted = true;
      await pollEmsTurtle().catch(() => {});
  }

  const result = await fetchLiveEmsApps(true); // fast mode
  const wasCacheUsed = result.status === "cached_timeout" || (!liveAttempted && result.rawLastCall);
  const liveSucceeded = liveAttempted && result.cacheEntry?.source === "live";
  
  // Apply policy rules
  let finalApps = result.apps;
  if (policy === "live-only" && !liveSucceeded) {
       finalApps = []; // Return no data if live fails and live-only is requested.
  }
  
  // Try to find stationCode in rawLastCall
  let stationCode = "UNKNOWN";
  let blockIndex = 1;
  const activeIdentity = { activeProfileId: "unknown", emsBaseUrl: "unknown", stationCode: "UNKNOWN", blockIndex: 1 };
  if (result.rawLastCall) {
       const blockReport = result.rawLastCall.blockReport || result.rawLastCall;
       const topology = blockReport.topology || {};
       stationCode = topology.stationCode || blockReport.stationCode || "BHE0021";
       blockIndex = topology.blockIndex || blockReport.blockIndex || 1;
       activeIdentity.stationCode = stationCode;
       activeIdentity.blockIndex = blockIndex;
  } else {
       stationCode = "BHE0021";
  }
  
  const pCacheEntry = result.cacheEntry ? {
      dataClass: "live-control-state" as any,
      sourceUrl: "/tools/report/ems/lastCall.json",
      updatedAt: result.cacheEntry.lastUpdated,
      ageMs: 0,
      isStale: result.cacheEntry.staleData,
      createdFromLiveSession: result.cacheEntry.source === "live" || result.cacheEntry.source === "partial",
      profileId: activeIdentity.activeProfileId,
      emsBaseUrl: activeIdentity.emsBaseUrl
  } : null;
  
  const cacheMetadata = buildCacheMetadata(policy, !!wasCacheUsed, liveAttempted, liveSucceeded, pCacheEntry, activeIdentity);

  res.json({
    success: true,
    localControlEndpoint: "/turtle/tools/controls/ems/command",
    targetEndpointType: "BLOCK",
    confirmedPayloads: ["SetEMSApplicationEnabledStatus"],
    configWritesImplemented: false,
    appCount: finalApps.length,
    apps: finalApps,
    warnings: [
      "Power Control, Basic Op, and Scheduler are mapped from cloud but local config writes are pending.",
      "HCP0001 and BS00001 are read-only because no cloud interaction point was observed."
    ],
    ...cacheMetadata
  });
});

// POST /api/local/ems-apps/enabled-status
router.post("/enabled-status", async (req, res) => {
  try {
    const input: SetAppStatusInput = req.body;
    const result = await setEmsApplicationEnabledStatus(input);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: "INTERNAL_ERROR", message: err.message });
  }
});

export default router;
