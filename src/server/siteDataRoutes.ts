import { Router } from "express";
import {
  getLatestSnapshot,
  getSiteDataStatusView,
  getBlockSummaryView,
  getStringsView,
  getPcsView,
  getFeatherView,
  getArraysView,
  getCorrectiveActionsView,
  getSourceHealthView,
  triggerImmediatePoll
} from "./prizmDataCoordinator";

export const siteDataRouter = Router();

siteDataRouter.use(async (req, res, next) => {
  if (req.query.refresh === "true") {
    console.log(`[Site Data Routes] Refresh parameter detected for ${req.path}, pulling live data...`);
    try {
      await triggerImmediatePoll();
    } catch (err: any) {
      console.error("[Site Data Routes] Immediate poll failed on refresh request", err.message);
    }
  }
  next();
});

siteDataRouter.get("/snapshot", async (req, res) => {
  try {
    let snap = getLatestSnapshot();
    if (!snap) {
      console.log("[Site Data Routes] Snapshot not found, triggering immediate poll...");
      await triggerImmediatePoll();
      snap = getLatestSnapshot();
    }
    if (!snap) {
      return res.json({ warming: true, message: "Site snapshot is currently warming or offline." });
    }
    res.json(snap);
  } catch (err: any) {
    res.json({ warming: true, error: err.message || "Failed to retrieve site snapshot" });
  }
});

siteDataRouter.get("/status", (req, res) => {
  try {
    const view = getSiteDataStatusView();
    res.json(view);
  } catch (err: any) {
    res.json({ warming: true, error: err.message });
  }
});

siteDataRouter.get("/block-summary", (req, res) => {
  try {
    const view = getBlockSummaryView();
    res.json(view);
  } catch (err: any) {
    res.json({ warming: true, error: err.message });
  }
});

siteDataRouter.get("/strings", (req, res) => {
  try {
    const view = getStringsView();
    res.json(view);
  } catch (err: any) {
    res.json({ warming: true, error: err.message });
  }
});

siteDataRouter.get("/pcs", (req, res) => {
  try {
    const view = getPcsView();
    res.json(view);
  } catch (err: any) {
    res.json({ warming: true, error: err.message });
  }
});

siteDataRouter.get("/feather", (req, res) => {
  try {
    const view = getFeatherView();
    res.json(view);
  } catch (err: any) {
    res.json({ warming: true, error: err.message });
  }
});

siteDataRouter.get("/corrective-actions", (req, res) => {
  try {
    const view = getCorrectiveActionsView();
    if (view && view.warming) {
      return res.json(view);
    }
    res.json({ success: true, correctiveActions: view || [] });
  } catch (err: any) {
    res.json({ warming: true, error: err.message });
  }
});

siteDataRouter.get("/arrays", (req, res) => {
  try {
    const view = getArraysView();
    res.json(view);
  } catch (err: any) {
    res.json({ warming: true, error: err.message });
  }
});

siteDataRouter.get("/source-health", (req, res) => {
  try {
    const view = getSourceHealthView();
    res.json(view);
  } catch (err: any) {
    res.json({ warming: true, error: err.message });
  }
});
