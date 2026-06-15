import { Router } from "express";
import * as prizmHistory from "./prizmHistory";
import * as hysteresisRules from "./hysteresisRules";
import { getHistoricalCacheSettings, setHistoricalCacheSettings, clear, CACHE_ROOT, HISTORY_ROOT } from "../cache/prizmCache";
import fs from "fs";
import path from "path";

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
    res.json({ success: true });
});

router.get("/rules", async (req, res) => {
    const { range } = req.query;
    const rules = await hysteresisRules.evaluateRules({ range });
    res.json(rules);
});

function getFolderSize(dirPath: string): number {
    let totalSize = 0;
    if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const file of files) {
            const filePath = path.join(dirPath, file.name);
            if (file.isDirectory()) {
                totalSize += getFolderSize(filePath);
            } else {
                totalSize += fs.statSync(filePath).size;
            }
        }
    }
    return totalSize;
}

function gatherHistoryCategories(sitesDir: string) {
    const categories: any[] = [];
    if (!fs.existsSync(sitesDir)) return { categories, count: 0 };
    const siteDirs = fs.readdirSync(sitesDir);
    let totalFilesCount = 0;
    
    // Simplistic gathering
    for (const siteFolder of siteDirs) {
        const p = path.join(sitesDir, siteFolder);
        if (fs.statSync(p).isDirectory()) {
            const files = fs.readdirSync(p);
            for (const f of files) {
                 if (f.endsWith('.jsonl')) {
                      const fp = path.join(p, f);
                      const stats = fs.statSync(fp);
                      categories.push({
                          name: f.replace('.jsonl', ''),
                          snapshotCount: "Unknown", // Would need to parse lines
                          bytes: stats.size,
                          oldestSnapshotAt: null,
                          newestSnapshotAt: null
                      });
                      totalFilesCount++;
                 }
            }
        }
    }
    return { categories, count: totalFilesCount };
}

router.get("/status", async (req, res) => {
    const settings = getHistoricalCacheSettings();
    const sitesDir = path.join(HISTORY_ROOT, "sites");
    const historyExists = fs.existsSync(sitesDir) && fs.readdirSync(sitesDir).length > 0;
    const totalBytes = historyExists ? getFolderSize(HISTORY_ROOT) : 0;
    
    const { categories, count } = gatherHistoryCategories(sitesDir);

    const status = {
        enabled: settings.historicalSnapshotLoggingEnabled,
        historyExists,
        historyPath: HISTORY_ROOT,
        totalBytes,
        totalSizeDisplay: (totalBytes / 1024 / 1024).toFixed(2) + " MB",
        snapshotCount: count, // Using file count approximation for now
        oldestSnapshotAt: null,
        newestSnapshotAt: null,
        lastWrittenAt: null,
        retentionPolicy: settings.retentionPolicy,
        categories
    };
    
    res.json(status);
});

router.post("/settings", async (req, res) => {
    const { enabled, retentionPolicy, snapshotFrequency } = req.body;
    const newSettings: any = getHistoricalCacheSettings();
    if (enabled !== undefined) newSettings.historicalSnapshotLoggingEnabled = !!enabled;
    if (retentionPolicy) newSettings.retentionPolicy = retentionPolicy;
    if (snapshotFrequency) newSettings.snapshotFrequency = snapshotFrequency;
    setHistoricalCacheSettings(newSettings);
    res.json({ success: true, settings: newSettings });
});

router.post("/clear", async (req, res) => {
    const sitesDir = path.join(HISTORY_ROOT, "sites");
    if (fs.existsSync(sitesDir)) {
        fs.rmSync(sitesDir, { recursive: true, force: true });
    }
    res.json({ success: true });
});

router.post("/current/clear", async (req, res) => {
    // Memory and disk clear for current snapshot cache
    clear();
    const sitesDir = path.join(CACHE_ROOT, "sites");
    if (fs.existsSync(sitesDir)) {
        for (const dir of fs.readdirSync(sitesDir)) {
            // Keep .jsonl (events) out of cache clear, but these shouldn't be in cache root
            // Just drop the json files
             const p = path.join(sitesDir, dir);
             if (fs.statSync(p).isDirectory()) {
                 const files = fs.readdirSync(p);
                 for (const f of files) {
                     if (f.endsWith('.json')) {
                         fs.rmSync(path.join(p, f), { force: true });
                     }
                 }
             }
        }
    }
    res.json({ success: true });
});

export default router;
