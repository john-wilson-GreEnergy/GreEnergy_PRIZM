import { Router } from "express";
import { 
  getHvacTargets, 
  applySimulation, 
  getSingleHvacReport, 
  getAuditLog 
} from "./hvacSimulationService";
import { validateHvacReport } from "./hvacSimulationValidation";
import { HvacSimulationMode } from "./hvacSimulationTypes";

const router = Router();

// 1. GET Capabilities
router.get("/capabilities", (req, res) => {
  res.json({
    success: true,
    executor: "direct-feather",
    supportedActions: [
      "cooling",
      "ldcool",
      "bcool",
      "heating",
      "dehumidification",
      "lowerTopCap",
      "leakAlarm",
      "acDoor",
      "emergencyVentilation",
      "clearAll"
    ],
    timeoutMinutes: {
      min: 30,
      max: 240,
      default: 30
    },
    verificationEndpoint: "/feather/status/report.json",
    defaultValidation: {
      fanCurrentMinA: 1.5,
      fanCurrentExpectedA: 2.0,
      compressorCurrentMinA: 12.0,
      responseGracePeriodSec: 20,
      pollIntervalSec: 3,
      staleReportMaxAgeSec: 15
    }
  });
});

// 2. GET Target candidates
router.get("/targets", (req, res) => {
  try {
    const targets = getHvacTargets();
    res.json({ success: true, count: targets.length, targets });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to load targets" });
  }
});

// 3. POST Apply Sim overrides
router.post("/apply", async (req, res) => {
  try {
    const {
      targetIps,
      timeoutMinutes = 30,
      mode,
      options = {},
      normalizeBeforeApply = true,
      verifyAfterApply = true,
      concurrency = 8
    } = req.body;

    // Validate IPs
    if (!Array.isArray(targetIps) || targetIps.length === 0) {
      return res.status(400).json({ success: false, error: "targetIps must be a non-empty array of strings" });
    }

    const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
    for (const ip of targetIps) {
      if (typeof ip !== "string" || !ipRegex.test(ip)) {
        return res.status(400).json({ success: false, error: `Invalid target IP format: ${ip}` });
      }
    }

    // Validate timeout range
    const timeoutNum = Number(timeoutMinutes);
    if (isNaN(timeoutNum) || timeoutNum < 30 || timeoutNum > 240) {
      return res.status(400).json({ success: false, error: "timeoutMinutes must be an integer between 30 and 240" });
    }

    // Validate mode
    const validModes: HvacSimulationMode[] = [
      "cooling", "ldcool", "bcool", "heating", "dehumidification", "lowerTopCap", "leakAlarm", "acDoor", "emergencyVentilation", "clearAll"
    ];
    if (!validModes.includes(mode)) {
      return res.status(400).json({ success: false, error: `Invalid simulation mode: ${mode}` });
    }

    const results = await applySimulation({
      targetIps,
      timeoutMinutes: timeoutNum,
      mode,
      options,
      normalizeBeforeApply,
      verifyAfterApply,
      concurrency
    });

    const successCount = results.filter(r => r.commanded).length;
    const failedCount = results.length - successCount;
    const warningCount = results.filter(r => r.status === "WARNING").length;

    res.json({
      success: true,
      mode,
      targetCount: targetIps.length,
      successCount,
      failedCount,
      warningCount,
      timeoutMinutes: timeoutNum,
      normalizeBeforeApply,
      results
    });

  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to apply simulations" });
  }
});

// 4. POST Clear simulation overrides
router.post("/clear", async (req, res) => {
  try {
    const { targetIps, verifyAfterApply = true } = req.body;

    if (!Array.isArray(targetIps) || targetIps.length === 0) {
      return res.status(400).json({ success: false, error: "targetIps must be a non-empty array" });
    }

    const results = await applySimulation({
      targetIps,
      timeoutMinutes: 30, // boilerplate minimum
      mode: "clearAll",
      options: {},
      normalizeBeforeApply: true,
      verifyAfterApply,
      concurrency: 8
    });

    res.json({
      success: true,
      mode: "clearAll",
      targetCount: targetIps.length,
      successCount: results.filter(r => r.commanded).length,
      failedCount: results.filter(r => !r.commanded).length,
      results
    });

  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to clear simulations" });
  }
});

// 5. POST Verify status
router.post("/verify", async (req, res) => {
  try {
    const { targetIps, mode = "clearAll", startedAt } = req.body;

    if (!Array.isArray(targetIps) || targetIps.length === 0) {
      return res.status(400).json({ success: false, error: "targetIps must be a non-empty array" });
    }

    const validations = await Promise.all(
      targetIps.map(async (ip) => {
        try {
          const report = await getSingleHvacReport(ip);
          return validateHvacReport(ip, report, mode, startedAt);
        } catch (e: any) {
          return validateHvacReport(ip, null, mode, startedAt);
        }
      })
    );

    res.json({ success: true, results: validations });

  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to run verify" });
  }
});

// 6. POST Live-verify alias
router.post("/live-verify", async (req, res) => {
  try {
    const { targetIps, mode = "clearAll", startedAt } = req.body;
    if (!Array.isArray(targetIps) || targetIps.length === 0) {
      return res.status(400).json({ success: false, error: "targetIps must be a non-empty array" });
    }

    const validations = await Promise.all(
      targetIps.map(async (ip) => {
        try {
          const report = await getSingleHvacReport(ip);
          return validateHvacReport(ip, report, mode, startedAt);
        } catch (e: any) {
          return validateHvacReport(ip, null, mode, startedAt);
        }
      })
    );

    res.json({ success: true, results: validations });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to live verify" });
  }
});

// 7. GET Audit log
router.get("/audit", (req, res) => {
  try {
    const log = getAuditLog();
    res.json({ success: true, log });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to load audit logs" });
  }
});

export default router;
