import { Router } from "express";
import { TROUBLESHOOTING_KB } from "./troubleshootingKnowledgeBase";
import { resolveTroubleshooting, formatAffectedTargetForDisplay, shouldShowTargetIp } from "./troubleshootingResolver";

export const troubleshootingRouter = Router();

// Retrieve all entries in the PRIZM troubleshooting knowledge base
troubleshootingRouter.get("/library", (req, res) => {
  try {
    res.json({
      success: true,
      count: TROUBLESHOOTING_KB.length,
      entries: TROUBLESHOOTING_KB
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
