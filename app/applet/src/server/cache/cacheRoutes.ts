import { Router } from "express";
import * as prizmCache from "./prizmCache";
import fs from "fs";
import path from "path";

const router = Router();

router.get("/status", (req, res) => {
    res.json(prizmCache.getStatus());
});

router.post("/clear-active", (req, res) => {
    const p = prizmCache.getActiveSiteCachePath();
    if (fs.existsSync(p)) {
        try { fs.rmSync(p, { recursive: true, force: true }); } catch(e) {}
    }
    prizmCache.clear();
    res.json({ success: true, message: "Active cache cleared." });
});

router.post("/clear-site", (req, res) => {
    const siteKey = req.body.siteCacheKey;
    if (!siteKey) return res.status(400).json({ error: "siteCacheKey required" });
    const p = path.join(prizmCache.CACHE_ROOT, "sites", siteKey);
    if (fs.existsSync(p)) {
        try { fs.rmSync(p, { recursive: true, force: true }); } catch(e) {}
    }
    res.json({ success: true, message: `Cache cleared for ${siteKey}.` });
});

router.post("/clear-all", (req, res) => {
    if (req.body.confirm !== "CLEAR_ALL_PRIZM_CACHE") {
        return res.status(400).json({ error: "Missing confirmation: CLEAR_ALL_PRIZM_CACHE" });
    }
    const sitesDir = path.join(prizmCache.CACHE_ROOT, "sites");
    if (fs.existsSync(sitesDir)) {
        try { fs.rmSync(sitesDir, { recursive: true, force: true }); } catch(e) {}
    }
    prizmCache.clear();
    res.json({ success: true, message: "All prizm cache cleared." });
});

router.post("/refresh", (req, res) => {
    const keys = req.body.keys || req.body.cleared || [];
    const clearedKeys: string[] = [];
    if (Array.isArray(keys)) {
        keys.forEach(k => {
           prizmCache.clear(k);
           clearedKeys.push(k);
        });
    }
    res.json({
        success: true,
        cleared: clearedKeys,
        message: "Cache cleared. Next route request will fetch live data."
    });
});

router.post("/clear", (req, res) => {
    const key = req.body.key;
    prizmCache.clear(key);
    res.json({ success: true, cleared: key || "all" });
});

export default router;
