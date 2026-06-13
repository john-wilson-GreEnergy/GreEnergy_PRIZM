import { Router } from "express";
import { setEmsApplicationEnabledStatus, SetAppStatusInput } from "./dragonAppControl";
import { fetchLiveEmsApps } from "./emsAppsService";

const router = Router();

// GET /api/local/ems-apps/control-capabilities
router.get("/control-capabilities", async (req, res) => {
  const result = await fetchLiveEmsApps(true); // fast mode
  
  // Try to find stationCode in rawLastCall
  let stationCode = "UNKNOWN";
  if (result.rawLastCall) {
       const blockReport = result.rawLastCall.blockReport || result.rawLastCall;
       const topology = blockReport.topology || {};
       stationCode = topology.stationCode || blockReport.stationCode || "BHE0021";
  } else {
       stationCode = "BHE0021";
  }
  
  res.json({
    success: true,
    stationCode,
    blockIndex: 1,
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

// POST /api/local/ems-apps/enabled-status
router.post("/enabled-status", async (req, res) => {
  try {
    const input: SetAppStatusInput = req.body;
    
    // Quick structural validation
    if (!input.stationCode || input.blockIndex === undefined || !input.appCode || input.priority === undefined || input.enabled === undefined || !input.confirmationText) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const result = await setEmsApplicationEnabledStatus(input);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message, success: false });
  }
});

export default router;
