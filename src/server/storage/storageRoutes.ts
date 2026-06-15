import { Router, Request, Response } from "express";
import { getStorageStatus, runStorageCleanup, clearHistoricalTelemetry, clearRuntimeCache } from "./storageMaintenance";
import { loadStoragePolicy, saveStoragePolicy, validateAndSanitizePolicy } from "./storagePolicy";

const router = Router();

// GET /api/local/storage/status
router.get("/status", (req: Request, res: Response) => {
  try {
    const status = getStorageStatus();
    return res.json(status);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/local/storage/policy
router.get("/policy", (req: Request, res: Response) => {
  try {
    const policy = loadStoragePolicy();
    return res.json(policy);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/local/storage/policy
router.put("/policy", (req: Request, res: Response) => {
  try {
    const validated = validateAndSanitizePolicy(req.body);
    saveStoragePolicy(validated);
    return res.json({ success: true, policy: validated });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/local/storage/cleanup
router.post("/cleanup", (req: Request, res: Response) => {
  try {
    const summary = runStorageCleanup();
    return res.json({ success: true, summary });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/local/storage/history/clear
router.post("/history/clear", (req: Request, res: Response) => {
  try {
    const summary = clearHistoricalTelemetry();
    return res.json({ success: true, summary });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/local/storage/cache/clear
router.post("/cache/clear", (req: Request, res: Response) => {
  try {
    const summary = clearRuntimeCache();
    return res.json({ success: true, summary });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
