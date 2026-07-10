import { Router } from "express";
import { TROUBLESHOOTING_KB } from "./troubleshootingKnowledgeBase";
import {
  deleteTroubleshootingOverride,
  getMergedTroubleshootingLibrary,
  readTroubleshootingOverrides,
  saveTroubleshootingOverride
} from "./troubleshootingOverrides";
import { resolveTroubleshooting, formatAffectedTargetForDisplay, shouldShowTargetIp } from "./troubleshootingResolver";
import knowledgeRouter from "../knowledge/knowledgeRoutes";

export const troubleshootingRouter = Router();

// PRIZM Phase 2 knowledge acquisition workspace API.
// Mounted at /api/local/troubleshooting/knowledge/* so existing server wiring remains stable.
troubleshootingRouter.use("/knowledge", knowledgeRouter);

// Retrieve all entries in the PRIZM troubleshooting knowledge base
troubleshootingRouter.get("/library", (req, res) => {
  try {
    const entries = getMergedTroubleshootingLibrary();
    const overrides = readTroubleshootingOverrides();

    res.json({
      success: true,
      count: entries.length,
      entries,
      overrideCount: Object.keys(overrides).length,
      overrides
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// Retrieve only admin overrides
troubleshootingRouter.get("/overrides", (req, res) => {
  try {
    const overrides = readTroubleshootingOverrides();
    res.json({
      success: true,
      count: Object.keys(overrides).length,
      overrides
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save or update one troubleshooting guidance override
troubleshootingRouter.post("/overrides/:id", (req, res) => {
  try {
    const { id } = req.params;
    const patch = req.body?.entry || req.body?.patch || req.body;

    if (!id) {
      return res.status(400).json({ success: false, error: "Override id is required." });
    }

    const saved = saveTroubleshootingOverride(id, patch || {});

    res.json({
      success: true,
      id,
      override: saved
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reset one troubleshooting guidance entry back to built-in PRIZM guidance
troubleshootingRouter.delete("/overrides/:id", (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ success: false, error: "Override id is required." });
    }

    const existed = deleteTroubleshootingOverride(id);

    res.json({
      success: true,
      id,
      removed: existed
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// Resolve a specific fault code or label
troubleshootingRouter.post("/resolve", (req, res) => {
  try {
    const { issue } = req.body;
    if (!issue) {
      return res.status(400).json({ success: false, error: "Issue object is required in request body." });
    }
    const resolved = resolveTroubleshooting(issue);
    res.json({
      success: true,
      resolved
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper for formatting a target
troubleshootingRouter.post("/format-target", (req, res) => {
  try {
    const { target, system, detailView } = req.body;
    if (!target) {
      return res.status(400).json({ success: false, error: "Target object is required." });
    }
    const formatted = formatAffectedTargetForDisplay(target, system, detailView);
    const showIp = shouldShowTargetIp(target, system, detailView);
    res.json({
      success: true,
      formatted,
      showIp
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
