import { Router } from "express";
import * as prizmHistory from "./prizmHistory";
import * as hysteresisRules from "./hysteresisRules";

const router = Router();

router.get("/series", async (req, res) => {
    const { entityKey, metric, range, limit } = req.query;
    const result = await prizmHistory.querySeries({ entityKey, metric, range, limit });
    res.json(result);
});

router.get("/events", async (req, res) => {
    const { entityKey, range, limit } = req.query;
    const result = await prizmHistory.queryEvents({ entityKey, range, limit });
    res.json(result);
});

router.post("/capture/string-detail", async (req, res) => {
    // stub logic for capturing explicit string detail snapshots
    res.json({ success: true });
});

router.get("/rules", async (req, res) => {
    const { range } = req.query;
    const rules = await hysteresisRules.evaluateRules({ range });
    res.json(rules);
});

export default router;
