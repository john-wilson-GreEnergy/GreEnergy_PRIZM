import { Router } from "express";
import { fetchLiveEmsApps } from "./emsAppsService";

const router = Router();

// GET /api/local/ems-apps/control-capabilities
router.get("/control-capabilities", async (req, res) => {
  const result = await fetchLiveEmsApps(true); // fast mode
  
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
    appCount: result.apps.length,
    apps: result.apps,
    warnings: [
      "Power Control, Basic Op, and Scheduler are mapped from cloud but local config writes are pending.",
      "HCP0001 and BS00001 are read-only because no cloud interaction point was observed."
    ]
  });
});

export default router;
