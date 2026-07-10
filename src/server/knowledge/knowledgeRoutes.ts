import express from "express";
import fs from "fs";
import path from "path";
import {
  getKnowledgeCatalog,
  getKnowledgeStorageInfo,
  listArtifactsForRun,
  listDiscoveryRuns,
  listFragmentsForRun,
  listKnowledgeSources,
  saveScannerResult,
  searchKnowledgeFragments
} from "./knowledgeRepository";
import { scanNotificationCsv } from "./scanners/csvNotificationScanner";
import { scanWarFile } from "./scanners/warScanner";

const router = express.Router();

function requireReadableFile(filePath: unknown, expectedExtensions: string[]) {
  if (typeof filePath !== "string" || !filePath.trim()) {
    throw new Error("A local filePath is required.");
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error(`File not found: ${resolved}`);
  if (!fs.statSync(resolved).isFile()) throw new Error(`Path is not a file: ${resolved}`);

  const extension = path.extname(resolved).toLowerCase();
  if (!expectedExtensions.includes(extension)) {
    throw new Error(`Unsupported file type ${extension}; expected ${expectedExtensions.join(", ")}`);
  }

  return resolved;
}

router.get("/status", (_req, res) => {
  const catalog = getKnowledgeCatalog();
  res.json({
    success: true,
    storage: getKnowledgeStorageInfo(),
    counts: {
      sources: catalog.sources.length,
      runs: catalog.runs.length,
      artifacts: catalog.artifacts.length,
      fragments: catalog.fragments.length
    }
  });
});

router.get("/sources", (_req, res) => {
  res.json({ success: true, sources: listKnowledgeSources() });
});

router.get("/runs", (req, res) => {
  const limit = Number(req.query.limit || 100);
  res.json({ success: true, runs: listDiscoveryRuns(limit) });
});

router.get("/runs/:runId", (req, res) => {
  res.json({
    success: true,
    runId: req.params.runId,
    artifacts: listArtifactsForRun(req.params.runId),
    fragments: listFragmentsForRun(req.params.runId)
  });
});

router.get("/search", (req, res) => {
  const query = String(req.query.q || "");
  const limit = Number(req.query.limit || 250);
  res.json({ success: true, query, fragments: searchKnowledgeFragments(query, limit) });
});

router.post("/scan/war", (req, res) => {
  try {
    const filePath = requireReadableFile(req.body?.filePath, [".war", ".jar"]);
    const result = scanWarFile(filePath);
    const catalog = saveScannerResult(result);
    res.json({
      success: true,
      source: result.source,
      run: result.run,
      catalogCounts: {
        sources: catalog.sources.length,
        runs: catalog.runs.length,
        artifacts: catalog.artifacts.length,
        fragments: catalog.fragments.length
      }
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || String(error) });
  }
});

router.post("/scan/notification-csv", (req, res) => {
  try {
    const filePath = requireReadableFile(req.body?.filePath, [".csv"]);
    const result = scanNotificationCsv(filePath);
    const catalog = saveScannerResult(result);
    res.json({
      success: true,
      source: result.source,
      run: result.run,
      catalogCounts: {
        sources: catalog.sources.length,
        runs: catalog.runs.length,
        artifacts: catalog.artifacts.length,
        fragments: catalog.fragments.length
      }
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || String(error) });
  }
});

export default router;
