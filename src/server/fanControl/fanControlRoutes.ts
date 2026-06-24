import { Router } from "express";
import { FanControlService } from "./fanControlService";

const router = Router();

// GET /api/local/fan-control/capabilities
router.get("/capabilities", (req, res) => {
  const caps = FanControlService.getCapabilities();
  res.json(caps);
});

// POST /api/local/fan-control/hold/start
router.post("/hold/start", async (req, res) => {
  try {
    const result = await FanControlService.startHold(req.body);
    if (!result.accepted) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "An unexpected error occurred during startHold." });
  }
});

// POST /api/local/fan-control/hold/stop
router.post("/hold/stop", async (req, res) => {
  try {
    const result = await FanControlService.stopHold(req.body);
    if (!result.stopped) {
      return res.status(404).json(result);
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "An unexpected error occurred during stopHold." });
  }
});

// GET /api/local/fan-control/hold/status
router.get("/hold/status", async (req, res) => {
  try {
    const holds = FanControlService.getActiveHolds();
    const settings = {
      warmupSeconds: req.query.warmupSeconds ? Number(req.query.warmupSeconds) : undefined,
      tolerancePercent: req.query.tolerancePercent ? Number(req.query.tolerancePercent) : undefined,
      staleTelemetryMs: req.query.staleTelemetryMs ? Number(req.query.staleTelemetryMs) : undefined,
      requireAllFansRunning: req.query.requireAllFansRunning === "true"
    };
    const verification = await FanControlService.getVerification(undefined, settings);
    res.json({ activeHolds: holds, verification });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "An unexpected error occurred during hold status query." });
  }
});

// GET /api/local/fan-control/hold/verification
router.get("/hold/verification", async (req, res) => {
  try {
    const holdId = req.query.holdId as string | undefined;
    const settings = {
      warmupSeconds: req.query.warmupSeconds ? Number(req.query.warmupSeconds) : undefined,
      tolerancePercent: req.query.tolerancePercent ? Number(req.query.tolerancePercent) : undefined,
      staleTelemetryMs: req.query.staleTelemetryMs ? Number(req.query.staleTelemetryMs) : undefined,
      requireAllFansRunning: req.query.requireAllFansRunning === "true"
    };
    const verification = await FanControlService.getVerification(holdId, settings);
    res.json({ verification });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "An unexpected error occurred during hold verification." });
  }
});

// GET /api/local/fan-control/runs
router.get("/runs", (req, res) => {
  try {
    const runs = FanControlService.getSavedRuns();
    res.json(runs);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to retrieve saved runs." });
  }
});

// POST /api/local/fan-control/runs/save
router.post("/runs/save", async (req, res) => {
  try {
    const { holdId, state, operator } = req.body;
    if (!holdId) {
      return res.status(400).json({ error: "holdId is required to save a run." });
    }
    const run = await FanControlService.saveHoldRun(holdId, state, operator);
    if (!run) {
      return res.status(404).json({ error: "Active hold session not found." });
    }
    res.json({ success: true, run });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to save hold run." });
  }
});

// DELETE /api/local/fan-control/runs/:runId
router.delete("/runs/:runId", (req, res) => {
  try {
    const success = FanControlService.deleteSavedRun(req.params.runId);
    if (!success) {
      return res.status(404).json({ error: "Saved run not found." });
    }
    res.json({ success: true, message: "Saved run deleted successfully." });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete saved run." });
  }
});

// POST /api/local/fan-control/runs/clear
router.post("/runs/clear", (req, res) => {
  try {
    FanControlService.clearSavedRuns();
    res.json({ success: true, message: "All saved runs cleared successfully." });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to clear saved runs." });
  }
});

export default router;
