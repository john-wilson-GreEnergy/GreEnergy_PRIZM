import { Router } from "express";
import { gzipSync } from "node:zlib";
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

const cachedBrowserSnapshots = new Map<string, {
  source: any;
  json: string;
  gzip: Buffer;
}>();

function withoutDiagnosticPayload(row: any, includeStringDiagnostics = false) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  const {
    raw: _raw,
    sourceDebug: _sourceDebug,
    balancing: _balancing,
    balanceDetails: _balanceDetails,
    ...clientRow
  } = row;
  if (includeStringDiagnostics) {
    if (_balancing !== undefined) clientRow.balancing = _balancing;
    if (_balanceDetails !== undefined) clientRow.balanceDetails = _balanceDetails;
  }
  return clientRow;
}

/**
 * The coordinator retains diagnostic and duplicated source data for server-side
 * reports. The browser only needs the normalized records and compact rollups.
 * Keeping those concerns separate prevents a full site poll from transferring
 * tens of megabytes every few seconds.
 */
export function buildBrowserSnapshot(snapshot: any, options: {
  includeArrayDetails?: boolean;
  includeStringDiagnostics?: boolean;
  includeStrings?: boolean;
} = {}) {
  if (!snapshot || typeof snapshot !== "object") return snapshot;

  const normalized = snapshot.normalized || {};
  const rollups = snapshot.rollups || {};
  const stringSummary = rollups.stringSummary || {};
  const featherSummary = rollups.featherSummary || {};
  const { enhanced: _enhanced, tableRows: _tableRows, ...compactStringSummary } = stringSummary;
  const { devices: _devices, ...compactFeatherSummary } = featherSummary;
  const normalizedStrings = options.includeStrings !== false && Array.isArray(normalized.strings)
    ? normalized.strings.map((row: any) => withoutDiagnosticPayload(row, options.includeStringDiagnostics))
    : [];

  const arrayDetailsByArray = options.includeArrayDetails
    ? Object.fromEntries(
        Object.entries(normalized.arrayDetailsByArray || {}).map(([key, value]: [string, any]) => {
          const { raw: _raw, ...arrayDetail } = value || {};
          return [key, {
            ...arrayDetail,
            strings: Array.isArray(arrayDetail.strings)
              ? arrayDetail.strings.map((row: any) => withoutDiagnosticPayload(row, options.includeStringDiagnostics))
              : arrayDetail.strings
          }];
        })
      )
    : {};

  return {
    ...snapshot,
    rawSources: undefined,
    normalized: {
      ...normalized,
      strings: normalizedStrings,
      arrays: Array.isArray(normalized.arrays) ? normalized.arrays.map(withoutDiagnosticPayload) : normalized.arrays,
      feather: Array.isArray(normalized.feather) ? normalized.feather.map(withoutDiagnosticPayload) : normalized.feather,
      pcs: Array.isArray(normalized.pcs) ? normalized.pcs.map(withoutDiagnosticPayload) : normalized.pcs,
      sensors: Array.isArray(normalized.sensors) ? normalized.sensors.map(withoutDiagnosticPayload) : normalized.sensors,
      arrayDetailsByArray
    },
    rollups: {
      ...rollups,
      stringSummary: compactStringSummary,
      featherSummary: compactFeatherSummary,
      arraySummary: Array.isArray(rollups.arraySummary) ? rollups.arraySummary.map(withoutDiagnosticPayload) : rollups.arraySummary
    }
  };
}

/**
 * Overview, PCS, and thermal pages acquire their operational data from compact
 * page-specific endpoints. Their shared provider only needs enough state for
 * the connection header and polling heartbeat; serializing the full central
 * snapshot here duplicates work and can block the Node event loop on small
 * deployments.
 */
export function buildHeartbeatSnapshot(snapshot: any) {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  const stringSummary = snapshot.rollups?.stringSummary || {};
  const {
    tableRows: _tableRows,
    rawStrings: _rawStrings,
    strings: _strings,
    enhanced: _enhanced,
    ...compactStringSummary
  } = stringSummary;
  return {
    cycleId: snapshot.cycleId,
    siteIdentity: snapshot.siteIdentity,
    liveStatus: snapshot.liveStatus,
    debug: {
      coordinatorStartedAt: snapshot.debug?.coordinatorStartedAt,
      lastPollStartedAt: snapshot.debug?.lastPollStartedAt,
      lastPollFinishedAt: snapshot.debug?.lastPollFinishedAt,
      lastPollDurationMs: snapshot.debug?.lastPollDurationMs,
      errors: snapshot.debug?.errors || []
    },
    normalized: { strings: [], arrays: [], pcs: [], feather: [], sensors: [], arrayDetailsByArray: {} },
    rollups: {
      stringSummary: compactStringSummary,
      sourceHealth: snapshot.rollups?.sourceHealth || [],
      sourceHealthSummary: snapshot.rollups?.sourceHealthSummary || null
    }
  };
}

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
    const view = String(req.query.view || "overview");
    const includeArrayDetails = view === "site-health" || view === "arrays-strings";
    const includeStringDiagnostics = view === "arrays-strings" || view === "balancer-test";
    // Only views that render individual strings need the full 320-row payload.
    // PCS, overview, thermal, and Feather pages use dedicated compact endpoints;
    // repeatedly transferring string rows there can starve the heartbeat request.
    const includeStrings = view === "arrays-strings" || view === "site-health" || view === "one-line";
    const heartbeatOnly = view === "overview" || view === "pcs-dashboard" || view === "thermal-controls";
    const cacheKey = heartbeatOnly
      ? "heartbeat"
      : `${includeArrayDetails ? "details" : "standard"}:${includeStringDiagnostics ? "string-diagnostics" : "compact-strings"}:${includeStrings ? "with-strings" : "without-strings"}`;
    let cached = cachedBrowserSnapshots.get(cacheKey);
    if (!cached || cached.source !== snap) {
      const browserSnapshot = heartbeatOnly
        ? buildHeartbeatSnapshot(snap)
        : buildBrowserSnapshot(snap, { includeArrayDetails, includeStringDiagnostics, includeStrings });
      const json = JSON.stringify(browserSnapshot);
      cached = { source: snap, json, gzip: gzipSync(json, { level: 1 }) };
      cachedBrowserSnapshots.set(cacheKey, cached);
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Vary", "Accept-Encoding");
    res.setHeader("X-PRIZM-Snapshot-Bytes", String(Buffer.byteLength(cached.json)));
    res.setHeader("X-PRIZM-Snapshot-View", view);
    if (/\bgzip\b/i.test(String(req.headers["accept-encoding"] || ""))) {
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Content-Length", String(cached.gzip.length));
      return res.end(cached.gzip);
    }
    res.setHeader("Content-Length", String(Buffer.byteLength(cached.json)));
    return res.end(cached.json);
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
