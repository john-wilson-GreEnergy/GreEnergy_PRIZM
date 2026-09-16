import { Router } from "express";
import {
  deployIoLogikConfiguration,
  deployIoLogikFirmware,
  discoverIoLogik,
  getIoLogikAssets,
  getIoLogikTopology,
  importIoLogikFirmware,
  scanIoLogikFirmware,
  updateIoLogikGoldenRule,
} from "./iologikFleetService";

const router = Router();
router.get("/targets", (_req, res) =>
  res.json({
    success: true,
    ...getIoLogikTopology(),
    assets: getIoLogikAssets(),
  }),
);
router.post("/discover", async (req, res) => {
  try {
    const rows = await discoverIoLogik(req.body?.targetIps);
    res.json({ success: true, scannedAt: new Date().toISOString(), rows });
  } catch (error: any) {
    res
      .status(400)
      .json({ success: false, error: error?.message || String(error) });
  }
});
router.post("/firmware/scan", async (req, res) => {
  try {
    const rows = await scanIoLogikFirmware({
      targetIps: req.body?.targetIps,
      password: req.body?.password,
    });
    res.json({ success: true, scannedAt: new Date().toISOString(), rows });
  } catch (error: any) {
    res
      .status(400)
      .json({ success: false, error: error?.message || String(error) });
  }
});
router.post("/firmware/import", (req, res) => {
  try {
    const firmware = importIoLogikFirmware({
      fileName: req.body?.fileName,
      base64: req.body?.base64,
    });
    res.json({ success: true, firmware, assets: getIoLogikAssets() });
  } catch (error: any) {
    res
      .status(400)
      .json({ success: false, error: error?.message || String(error) });
  }
});
router.post("/configuration/profile", (req, res) => {
  try {
    if (req.body?.confirmed !== true)
      return res
        .status(400)
        .json({ success: false, error: "Explicit confirmation is required." });
    const configurationProfile = updateIoLogikGoldenRule({
      watchdogSeconds: req.body?.watchdogSeconds,
    });
    res.json({
      success: true,
      configurationProfile,
      assets: getIoLogikAssets(),
    });
  } catch (error: any) {
    res
      .status(400)
      .json({ success: false, error: error?.message || String(error) });
  }
});
router.post("/configuration/apply", async (req, res) => {
  try {
    if (req.body?.confirmed !== true)
      return res
        .status(400)
        .json({ success: false, error: "Explicit confirmation is required." });
    const targetIps = Array.isArray(req.body?.targetIps)
      ? req.body.targetIps.map(String)
      : [];
    if (!targetIps.length)
      return res
        .status(400)
        .json({ success: false, error: "Select at least one target." });
    const results = await deployIoLogikConfiguration({
      targetIps,
      password: req.body?.password,
    });
    res.json({
      success: results.every((row) => row.success),
      completedAt: new Date().toISOString(),
      results,
    });
  } catch (error: any) {
    res
      .status(400)
      .json({ success: false, error: error?.message || String(error) });
  }
});
router.post("/firmware/apply", async (req, res) => {
  try {
    if (req.body?.confirmed !== true)
      return res
        .status(400)
        .json({ success: false, error: "Explicit confirmation is required." });
    const targetIps = Array.isArray(req.body?.targetIps)
      ? req.body.targetIps.map(String)
      : [];
    if (!targetIps.length)
      return res
        .status(400)
        .json({ success: false, error: "Select at least one target." });
    const result = await deployIoLogikFirmware({
      targetIps,
      password: req.body?.password,
    });
    res.json({
      success: result.results.every((row) => row.success),
      completedAt: new Date().toISOString(),
      ...result,
    });
  } catch (error: any) {
    res
      .status(400)
      .json({ success: false, error: error?.message || String(error) });
  }
});
export default router;
