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
  getSensorsView,
  triggerImmediatePoll
} from "./prizmDataCoordinator";
import {
  getSiteNotificationEngineView,
  getStringNotificationView,
  getNotificationRollupsView
} from "./notifications/siteNotificationEngine";

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
      console.log("[Site Data Routes] Snapshot not found, triggering immediate background poll...");
      triggerImmediatePoll().catch((err: any) => {
        console.error("[Site Data Routes] Immediate background poll failed", err.message);
      });
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


siteDataRouter.get("/notifications/site", (req, res) => {
  try {
    const filter = String(req.query.filter || "summaryDefault") as any;
    const view = getSiteNotificationEngineView({ filter });
    res.json(view);
  } catch (error: any) {
    console.error("[Notifications] site view failed", error);
    res.status(500).json({
      success: false,
      error: error?.message || "Failed to build site notification view"
    });
  }
});

siteDataRouter.get("/notifications/string/:arrayNumber/:stringNumber", (req, res) => {
  try {
    const arrayNumber = Number(req.params.arrayNumber);
    const stringNumber = Number(req.params.stringNumber);

    if (!Number.isFinite(arrayNumber) || !Number.isFinite(stringNumber)) {
      return res.status(400).json({
        success: false,
        error: "arrayNumber and stringNumber must be numeric"
      });
    }

    const view = getStringNotificationView(arrayNumber, stringNumber);
    res.json(view);
  } catch (error: any) {
    console.error("[Notifications] string view failed", error);
    res.status(500).json({
      success: false,
      error: error?.message || "Failed to build string notification view"
    });
  }
});

siteDataRouter.get("/notifications/rollups", (_req, res) => {
  try {
    const view = getNotificationRollupsView();
    res.json(view);
  } catch (error: any) {
    console.error("[Notifications] rollups failed", error);
    res.status(500).json({
      success: false,
      error: error?.message || "Failed to build notification rollups"
    });
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

siteDataRouter.get("/sensors", (req, res) => {
  try {
    const view = getSensorsView();
    res.json(view);
  } catch (err: any) {
    res.json({ warming: true, error: err.message });
  }
});
