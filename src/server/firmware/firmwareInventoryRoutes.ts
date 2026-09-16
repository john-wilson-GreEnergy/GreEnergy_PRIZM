import { Router } from "express";
import { getFirmwareCaptureState, triggerFirmwareCapture } from "./firmwareInventoryService";
import { getFirmwareUpdateState, startFirmwareUpdate } from "./firmwareUpdateService";

const router = Router();

router.get("/", (_req, res) => res.json(getFirmwareCaptureState()));

router.post("/capture", async (req, res) => {
  try {
    const snapshot = await triggerFirmwareCapture({
      force: true,
      arrayIndex: req.body?.arrayIndex ? Number(req.body.arrayIndex) : undefined,
      stringIndex: req.body?.stringIndex ? Number(req.body.stringIndex) : undefined
    });
    res.json({ running: false, snapshot });
  } catch (error: any) {
    res.status(502).json({ error: error?.message || "Firmware capture failed." });
  }
});

router.get("/updates", (_req, res) => res.json(getFirmwareUpdateState()));

router.post("/updates", async (req, res) => {
  try {
    const result = await startFirmwareUpdate(req.body);
    res.status(result.accepted ? 202 : 502).json({ result, ...getFirmwareUpdateState() });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "Firmware update request failed.", ...getFirmwareUpdateState() });
  }
});

export default router;
