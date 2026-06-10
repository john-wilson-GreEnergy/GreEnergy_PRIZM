import { Router } from "express";
import * as prizmCache from "./prizmCache";

const router = Router();

router.get("/status", (req, res) => {
    res.json(prizmCache.getStatus());
});

router.post("/refresh", (req, res) => {
    const keys = req.body.keys;
    if (Array.isArray(keys)) {
        keys.forEach(k => prizmCache.clear(k));
    }
    res.json({ success: true, cleared: keys });
});

router.post("/clear", (req, res) => {
    const key = req.body.key;
    prizmCache.clear(key);
    res.json({ success: true, cleared: key || "all" });
});

export default router;
