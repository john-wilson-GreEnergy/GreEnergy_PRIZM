import { bootstrapEmsAndSeedCache, cacheSeedState } from "../emsTurtleClient";
import { Router } from "express";
import * as prizmCache from "./prizmCache";
import * as fs from "fs";
import * as path from "path";

const router = Router();

router.get("/status", (req, res) => {
    res.json(prizmCache.getStatus());
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


router.post("/seed", (req, res) => {
    
    if (cacheSeedState.running) {
        return res.json({ started: false, alreadyRunning: true, cacheState: cacheSeedState });
    }
    bootstrapEmsAndSeedCache().catch(() => {});
    res.json({ started: true, alreadyRunning: false, cacheState: cacheSeedState });
});

router.post("/clear-active", (req, res) => {
    prizmCache.clear();
    res.json({ success: true, message: "Active memory cache cleared", cleared: "all" });
});

router.post("/clear-all", (req, res) => {
    if (req.body.confirm !== "CLEAR_ALL_PRIZM_CACHE") {
        return res.status(400).json({ error: "Missing confirmation: CLEAR_ALL_PRIZM_CACHE" });
    }
    
    // Explicitly delete contents in .prizm-cache only
    const cacheDir = path.resolve(process.cwd(), '.prizm-cache');
    let clearedCount = 0;
    
    if (fs.existsSync(cacheDir) && fs.statSync(cacheDir).isDirectory()) {
        const files = fs.readdirSync(cacheDir);
        for (const file of files) {
            // never clear git stuff or go outside dir
            if (file !== '.git' && file !== '.gitignore') {
                const fp = path.join(cacheDir, file);
                try {
                    fs.rmSync(fp, { recursive: true, force: true });
                    clearedCount++;
                } catch(e) {}
            }
        }
    }
    
    prizmCache.clear();
    
    res.json({ success: true, message: "All prizm disk cache cleared", clearedCount });
});

export default router;
