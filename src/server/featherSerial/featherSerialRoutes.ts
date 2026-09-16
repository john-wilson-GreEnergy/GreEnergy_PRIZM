import { Router } from "express";
import {
  applyFeatherSerialConnectionType,
  getFeatherSerialTargets,
  scanFeatherSerialInventory,
  SERIAL_CONNECTION_TYPES,
} from "./featherSerialService";

const router = Router();

router.get("/targets", (_req, res) => {
  const targets = getFeatherSerialTargets();
  res.json({ success: true, generatedAt: new Date().toISOString(), count: targets.length, targets });
});

router.post("/scan", async (req, res) => {
  try {
    const rows = await scanFeatherSerialInventory({
      username: req.body?.username || "moxa",
      sshPassword: req.body?.sshPassword || undefined,
    }, Array.isArray(req.body?.targetIps) ? req.body.targetIps : undefined);
    res.json({ success: true, scannedAt: new Date().toISOString(), count: rows.length, rows });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || String(error) });
  }
});

router.post("/apply", async (req, res) => {
  try {
    const desired = String(req.body?.desired || "").toLowerCase();
    const targetIps = Array.isArray(req.body?.targetIps) ? req.body.targetIps.map(String) : [];
    if (!SERIAL_CONNECTION_TYPES.includes(desired as any)) return res.status(400).json({ success: false, error: "desired must be rxtx, pjc, or rodbus" });
    if (req.body?.confirmed !== true) return res.status(400).json({ success: false, error: "Explicit confirmation is required." });
    const result = await applyFeatherSerialConnectionType({
      credentials: {
        username: req.body?.username || "moxa",
        sshPassword: req.body?.sshPassword || undefined,
        sudoPassword: req.body?.sudoPassword || undefined,
      },
      targetIps,
      desired: desired as any,
      requestedBy: req.body?.requestedBy || "local-prizm",
    });
    res.json({ success: result.results.every(row => row.success), ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || String(error) });
  }
});

export default router;
