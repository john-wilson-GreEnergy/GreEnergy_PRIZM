import { Router } from "express";
import { fetchLiveEmsApps } from "./emsAppsService";
import { setEmsApplicationEnabledStatus, SetAppStatusInput } from "./dragonAppControl";
import { getEffectiveCachePolicy, shouldFetchLive } from "../cache/prizmCache";
import { pollEmsTurtle } from "../emsTurtleClient";

const router = Router();

// GET /api/local/ems-apps/control-capabilities
router.get("/control-capabilities", async (req, res) => {
  const policy = getEffectiveCachePolicy(req.query.cache, req.query.noCache, req.query.refresh);
  const forceLive = shouldFetchLive(policy);

  if (forceLive) {
      await pollEmsTurtle().catch(() => {});
  }

  const result = await fetchLiveEmsApps(true); // fast mode
  const wasCacheUsed = result.status === "cached_timeout" || (!forceLive && result.rawLastCall);
  const liveSucceeded = forceLive && result.status !== "cached_timeout";
  
  // Apply policy rules
  let finalApps = result.apps;
  if (policy === "live-only" && result.status === "cached_timeout") {
       finalApps = []; // Return no data if live fails and live-only is requested.
  }
  
  // Try to find stationCode in rawLastCall
  let stationCode = "UNKNOWN";
  let blockIndex = 1;
  if (result.rawLastCall) {
       const blockReport = result.rawLastCall.blockReport || result.rawLastCall;
       const topology = blockReport.topology || {};
       stationCode = topology.stationCode || blockReport.stationCode || "BHE0021";
       blockIndex = topology.blockIndex || blockReport.blockIndex || 1;
  } else {
       stationCode = "BHE0021";
  }
  
  res.json({
    success: true,
    stationCode,
    blockIndex,
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
    cacheUsed: policy === 'live-only' ? false : wasCacheUsed,
    liveAttempted: forceLive,
    liveSucceeded,
    cachePolicy: policy
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
