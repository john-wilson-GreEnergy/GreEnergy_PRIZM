import { Router } from "express";
import { BalancerTestService } from "./balancerTestService";

const router = Router();

// GET /api/local/balancer-test/status
router.get("/status", async (req, res) => {
  const refresh = req.query.refresh === "true";
  const totalCellGroups = req.query.totalCellGroups ? Number(req.query.totalCellGroups) : 30;

  try {
    const statuses = await BalancerTestService.getStatus(refresh, totalCellGroups);
    res.json(statuses);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/local/balancer-test/report?testId=...
router.get("/report", async (req, res) => {
  const testId = req.query.testId ? Number(req.query.testId) : null;
  if (testId === null || isNaN(testId)) {
    return res.status(400).json({ error: "Query parameter 'testId' is required and must be a number." });
  }

  try {
    const report = await BalancerTestService.getReport(testId);
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/local/balancer-test/analysis?testIds=1,2,3
router.get("/analysis", async (req, res) => {
  const testIdsStr = req.query.testIds as string;
  if (!testIdsStr) {
    return res.status(400).json({ error: "Query parameter 'testIds' is required (comma-separated numbers)." });
  }

  const testIds = testIdsStr.split(",").map(id => Number(id.trim())).filter(id => !isNaN(id));
  if (testIds.length === 0) {
    return res.status(400).json({ error: "Query parameter 'testIds' must contain at least one valid number." });
  }

  try {
    const analysis = await BalancerTestService.getAnalysis(testIds);
    res.json(analysis);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/local/balancer-test/analyze
router.post("/analyze", async (req, res) => {
  const testIds = req.body?.testIds;
  if (!Array.isArray(testIds) || testIds.length === 0) {
    return res.status(400).json({ error: "Body 'testIds' is required and must be a non-empty array of numbers." });
  }

  const cleanIds = testIds.map(Number).filter(id => !isNaN(id));
  if (cleanIds.length === 0) {
    return res.status(400).json({ error: "Body 'testIds' must contain valid numbers." });
  }

  try {
    const analysis = await BalancerTestService.getAnalysis(cleanIds);
    res.json(analysis);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/local/balancer-test/capabilities
router.get("/capabilities", (req, res) => {
  const caps = BalancerTestService.getCapabilities();
  res.json(caps);
});

// POST /api/local/balancer-test/deploy
router.post("/deploy", async (req, res) => {
  try {
    const deployReq = req.body;
    
    // Check capabilities first
    const caps = BalancerTestService.getCapabilities();
    if (!caps.deploySupported) {
      const deployRes = await BalancerTestService.deploy(deployReq);
      return res.status(501).json(deployRes);
    }

    // Validation
    let validationError = "";
    if (!deployReq || !deployReq.arrays || !Array.isArray(deployReq.arrays) || deployReq.arrays.length === 0) {
      validationError = "arrays must be non-empty";
    } else if (deployReq.arrays.some((a: any) => isNaN(Number(a)) || Number(a) < 1 || Number(a) > 8)) {
      validationError = "arrays must be between 1 and 8";
    } else if (deployReq.direction !== "charge" && deployReq.direction !== "discharge") {
      validationError = "direction must be charge or discharge";
    } else if (!deployReq.confirmationToken || deployReq.confirmationToken !== "START BALANCER TEST") {
      validationError = "missing or invalid confirmation phrase";
    }

    if (validationError) {
      const deployRes = await BalancerTestService.deploy(deployReq);
      return res.status(400).json(deployRes);
    }

    const deployRes = await BalancerTestService.deploy(deployReq);
    if (!deployRes.accepted) {
      return res.status(500).json(deployRes);
    }
    res.json(deployRes);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
