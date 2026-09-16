import { Router } from "express";
import { thermalRouter } from "./thermal/thermalRoutes";
import {
getLatestSnapshot,
  getFastStringsView,
  getSiteDataStatusView,
  getBlockSummaryView,
  getStringsView,
  getPcsView,
  getFeatherView,
  getArraysView,
  getCorrectiveActionsView,
  getSourceHealthView,
  getSensorsView,
  requestRefresh
} from "./prizmDataCoordinator";
import {
  getSiteNotificationEngineView,
  getStringNotificationView,
  getNotificationRollupsView
} from "./notifications/siteNotificationEngine";
import { stringDomainBroker } from "./domainBrokers/stringDomainBroker";
import { getOperationalDomainBroker, operationalDomainBrokers } from "./domainBrokers/operationalDomainBrokers";

export const siteDataRouter = Router();
siteDataRouter.use("/thermal", thermalRouter);

siteDataRouter.use(async (req, res, next) => {
  if (req.query.refresh === "true") {
    console.log(`[Site Data Routes] Refresh parameter detected for ${req.path}, pulling live data...`);
    try {
      requestRefresh(`site-data:${req.path}:explicit-refresh`);
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
      requestRefresh("site-data:snapshot-warming");
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

siteDataRouter.get("/strings-fast", (_req, res) => {
  const view = getFastStringsView();
  if (view?.warming) return res.status(503).json(view);
  res.setHeader("Cache-Control", "no-store");
  res.json(view);
});

siteDataRouter.get("/strings-stream", (req, res) => {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  res.write(`event: ready\ndata: ${JSON.stringify({ version: stringDomainBroker.snapshot().version })}\n\n`);

  const unsubscribe = stringDomainBroker.subscribe((publication) => {
    res.write(`event: strings\ndata: ${JSON.stringify(publication)}\n\n`);
  });
  const heartbeat = setInterval(() => res.write(": keepalive\n\n"), 15_000);
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

siteDataRouter.get("/domains", (_req, res) => {
  res.json(Object.entries(operationalDomainBrokers).map(([name, broker]) => {
    const snapshot = broker.snapshot();
    return { name, version: snapshot.version, rowCount: snapshot.rows.length, capturedAt: snapshot.capturedAt };
  }));
});

siteDataRouter.get("/domains/:domain/snapshot", (req, res) => {
  const broker = getOperationalDomainBroker(req.params.domain);
  if (!broker) return res.status(404).json({ error: "Unknown operational domain" });
  res.setHeader("Cache-Control", "no-store");
  res.json(broker.snapshot());
});

siteDataRouter.get("/domains/:domain/stream", (req, res) => {
  const broker = getOperationalDomainBroker(req.params.domain);
  if (!broker) return res.status(404).json({ error: "Unknown operational domain" });
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  res.write(`event: ready\ndata: ${JSON.stringify({ domain: req.params.domain, version: broker.snapshot().version })}\n\n`);
  const unsubscribe = broker.subscribe((publication) => {
    res.write(`event: changes\ndata: ${JSON.stringify(publication)}\n\n`);
  });
  const heartbeat = setInterval(() => res.write(": keepalive\n\n"), 15_000);
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

siteDataRouter.get("/pcs", (req, res) => {
  try {
    const view = getPcsView();
    res.setHeader("Cache-Control", "no-store");
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
