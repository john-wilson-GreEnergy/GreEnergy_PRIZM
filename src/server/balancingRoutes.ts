import { Router } from "express";
import { executeBalancingWorkflow, getBalancingCapabilities, executePreflightCheck, getBalancingVerificationJob, BalancingPreflightRequest, BalancingExecuteRequest } from "./balancingControlService";
import { isDemoActive } from "./emsTurtleClient";

export const balancingRouter = Router();

balancingRouter.get('/verification/:id', (req, res) => {
    const job = getBalancingVerificationJob(String(req.params.id));
    if (!job) return res.status(404).json({ error: "Verification result is unavailable or expired" });
    res.json(job);
});

balancingRouter.get('/capabilities', async (req, res) => {
    try {
        const caps = await getBalancingCapabilities();
        res.json(caps);
    } catch (e: any) {
        res.status(500).json({ error: e.message || "Failed to get capabilities" });
    }
});

balancingRouter.post('/preflight', async (req, res) => {
    try {
        if (isDemoActive()) {
            return res.status(403).json({ error: "Cannot perform preflight checks while in Demo Mode." });
        }
        const result = await executePreflightCheck(req.body as BalancingPreflightRequest);
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message || "Failed to execute preflight" });
    }
});

balancingRouter.post('/execute', async (req, res) => {
    try {
        if (isDemoActive()) {
            return res.status(403).json({ error: "Cannot execute live balancing while in Demo Mode." });
        }
        const result = await executeBalancingWorkflow(req.body as BalancingExecuteRequest);
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message || "Failed to execute balancing workflow" });
    }
});
