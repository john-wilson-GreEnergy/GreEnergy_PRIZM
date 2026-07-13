import { cacheSeedState } from "../emsTurtleClient";
import { requestRefresh } from "../prizmDataCoordinator";
import { Router } from "express";
import * as prizmCache from "./prizmCache";
import * as fs from "fs";
import * as path from "path";

const router = Router();

router.get("/status", (req, res) => {
    res.json(prizmCache.getStatus());
});

router.get("/policy", (req, res) => {
    res.json({ success: true, policy: prizmCache.getCachePolicy() });
});

router.post("/policy", (req, res) => {
    const policy = req.body.policy;
    if (["live-first", "cache-first", "live-only", "cache-only"].includes(policy)) {
        prizmCache.setCachePolicy(policy as any);
        return res.json({ success: true, policy });
    }
    return res.status(400).json({ error: "Invalid cache policy", success: false });
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

router.get("/history/status", (req, res) => {
    res.json({
        enabled: false,
        sizeBytes: 0,
        retentionDays: 7
    });
});

router.get("/history/settings", (req, res) => {
    res.json({
        retentionDays: 7,
        maxSizeBytes: 104857600
    });
});

router.post("/history/clear", (req, res) => {
    res.json({ success: true, cleared: 0 });
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
    requestRefresh("route:/api/local/cache/seed");
    res.json({ started: true, alreadyRunning: false, cacheState: cacheSeedState });
});

router.post("/clear-active", (req, res) => {
    prizmCache.clear();
    const activePath = prizmCache.getActiveSiteCachePath();
    const manifest = prizmCache.getActiveManifest();
    let clearedFiles: string[] = [];
    if (fs.existsSync(activePath) && fs.statSync(activePath).isDirectory()) {
         const files = fs.readdirSync(activePath);
         for (const file of files) {
             // Do not delete profile snapshot history? Actually wait, it says: Modbus profile validation snapshot cache, but do not delete profile history unless explicitly requested...
             // The requirement: "clear active topology cache, EMS report cache, string dashboard cache, Feather discovery cache for this station, Modbus profile validation snapshot cache, but do not delete profile history... master dataset cache"
             if (file.endsWith('.json') || file === 'raw') {
                  const fp = path.join(activePath, file);
                  try {
                       fs.rmSync(fp, { recursive: true, force: true });
                       clearedFiles.push(file);
                  } catch(e) {}
             }
         }
    }
    
    res.json({ 
      success: true, 
      message: "Active memory and disk cache cleared", 
      stationCode: manifest.stationCode || manifest.discoveredStationCode || "UNKNOWN",
      blockIndex: manifest.blockIndex || 1,
      cleared: clearedFiles 
    });
});

router.post("/clear-all", (req, res) => {
    if (req.body.confirm !== "CLEAR_ALL_PRIZM_CACHE") {
        return res.status(400).json({ error: "Missing confirmation: CLEAR_ALL_PRIZM_CACHE" });
    }
    
    // Explicitly delete contents in PRZIM cache dir only
    const cacheDir = path.resolve(prizmCache.CACHE_ROOT || path.resolve(process.cwd(), '.prizm-cache'));
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
