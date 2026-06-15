import { Router } from "express";
import { 
  getHvacTargets, 
  applySimulation, 
  getSingleHvacReport, 
  getAuditLog,
  getActiveOverrides
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

// 8. POST Scan Active Simulations
router.post("/scan-active", async (req, res) => {
  try {
    const targets = getHvacTargets();
    const overrides = getActiveOverrides();
    const results: any[] = [];
    for (const t of targets) {
      const override = overrides.get(t.ip);
      if (override) {
        let rawReport = null;
        try {
          rawReport = await getSingleHvacReport(t.ip);
        } catch (e) {}
        const validation = validateHvacReport(t.ip, rawReport, override.mode, override.startedAt);
        results.push({
          ip: t.ip,
          arrayIndex: t.arrayIndex,
          stringIndex: t.stringIndex,
          entityName: t.entityName,
          status: validation.status,
          mode: override.mode,
          message: validation.message,
          remainingMinutes: validation.simulationRemainingMinutes ?? override.timeoutMinutes,
          timestamp: new Date().toISOString()
        });
      }
    }
    res.json({ success: true, count: results.length, activeSimulations: results });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to scan active" });
  }
});

// 9. POST Deploy Simulated Override (Alias of Apply)
router.post("/deploy", async (req, res) => {
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

    if (!Array.isArray(targetIps) || targetIps.length === 0) {
      return res.status(400).json({ success: false, error: "targetIps must be a non-empty array of strings" });
    }

    const results = await applySimulation({
      targetIps,
      timeoutMinutes: Number(timeoutMinutes),
      mode,
      options,
      normalizeBeforeApply,
      verifyAfterApply,
      concurrency
    });

    res.json({
      success: true,
      mode,
      targetCount: targetIps.length,
      successCount: results.filter(r => r.commanded).length,
      failedCount: results.length - results.filter(r => r.commanded).length,
      results
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to deploy simulation" });
  }
});

// 10. POST Clear Selected
router.post("/clear-selected", async (req, res) => {
  try {
    const { targetIps } = req.body;
    if (!Array.isArray(targetIps) || targetIps.length === 0) {
      return res.status(400).json({ success: false, error: "targetIps is required" });
    }
    const results = await applySimulation({
      targetIps,
      timeoutMinutes: 30,
      mode: "clearAll",
      normalizeBeforeApply: true,
      verifyAfterApply: true
    });
    res.json({ success: true, results });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to clear selected" });
  }
});

// 11. POST Clear Array
router.post("/clear-array", async (req, res) => {
  try {
    const { arrayIndex } = req.body;
    if (arrayIndex === undefined || arrayIndex === null) {
      return res.status(400).json({ success: false, error: "arrayIndex is required" });
    }
    const targets = getHvacTargets().filter(t => t.arrayIndex === Number(arrayIndex));
    if (targets.length === 0) {
      return res.json({ success: true, clearedCount: 0, results: [] });
    }
    const targetIps = targets.map(t => t.ip);
    const results = await applySimulation({
      targetIps,
      timeoutMinutes: 30,
      mode: "clearAll",
      normalizeBeforeApply: true,
      verifyAfterApply: true
    });
    res.json({ success: true, clearedCount: targetIps.length, results });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to clear array" });
  }
});

// 12. POST Clear All Active
router.post("/clear-all-active", async (req, res) => {
  try {
    const overrides = getActiveOverrides();
    const targetIps = Array.from(overrides.keys());
    if (targetIps.length === 0) {
      return res.json({ success: true, clearedCount: 0, results: [] });
    }
    const results = await applySimulation({
      targetIps,
      timeoutMinutes: 30,
      mode: "clearAll",
      normalizeBeforeApply: true,
      verifyAfterApply: true
    });
    res.json({ success: true, clearedCount: targetIps.length, results });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to clear all active" });
  }
});

// 13. GET Report
router.get("/report", async (req, res) => {
  try {
    const targetsQuery = req.query.targets as string;
    if (!targetsQuery) {
      return res.status(400).json({ success: false, error: "targets query parameter is required" });
    }
    const targetIps = targetsQuery.split(",");
    const overrides = getActiveOverrides();
    const results = await Promise.all(
      targetIps.map(async (ip) => {
        try {
          const override = overrides.get(ip);
          const rawReport = await getSingleHvacReport(ip);
          return validateHvacReport(ip, rawReport, override?.mode || "clearAll", override?.startedAt);
        } catch (e: any) {
          return validateHvacReport(ip, null, "clearAll", undefined);
        }
      })
    );
    res.json({ success: true, results });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to fetch report" });
  }
});

// 14. GET Timeseries Data
router.get("/timeseries", (req, res) => {
  try {
    const targetsQuery = req.query.targets as string;
    if (!targetsQuery) {
      return res.status(400).json({ success: false, error: "targets query parameter is required" });
    }
    const targetIps = targetsQuery.split(",");
    const data: Record<string, any[]> = {};
    const ticks = Array.from({ length: 10 }).map((_, idx) => {
      const d = new Date(Date.now() - (10 - idx) * 3000);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    });

    targetIps.forEach(ip => {
      data[ip] = ticks.map(t => ({
        time: t,
        hvac1Current: 14.2 + (Math.random() - 0.5) * 0.5,
        hvac2Current: 14.0 + (Math.random() - 0.5) * 0.5,
        spaceTemp: 23.5 + (Math.random() - 0.5) * 0.2,
        supplyTemp: 18.2 + (Math.random() - 0.5) * 0.2,
        cellTemp: 21.4 + (Math.random() - 0.5) * 0.1,
        spaceHumidity: 45 + (Math.random() - 0.5) * 2,
        outsideHumidity: 50 + (Math.random() - 0.5) * 2,
        remainingMinutes: 30
      }));
    });
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to fetch timeseries" });
  }
});

export default router;
