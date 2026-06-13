import { Router } from "express";
import { setEmsApplicationEnabledStatus, SetAppStatusInput } from "./dragonAppControl";
import { fetchLiveEmsApps } from "./emsAppsService";

const router = Router();

// GET /api/local/ems-apps/control-capabilities
router.get("/control-capabilities", async (req, res) => {
  const result = await fetchLiveEmsApps(true); // fast mode
  let liveAppCount = result.apps.length;
  let controllableApps = result.apps.map(app => ({
    applicationTypeCode: app.appCode,
    applicationPriority: app.priority,
    enabled: app.enabled
  }));

  res.json({
    controlEndpoint: "/turtle/tools/controls/ems/command",
    confirmedPayload: "SetEMSApplicationEnabledStatus",
    targetEndpointType: "BLOCK",
    protobufAvailable: true, // we implement the java bridge
    liveAppCount,
    controllableApps,
    warning: "Config editing via SetEMSApplicationConfiguration is not implemented yet in this phase."
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
