import { Router } from "express";
import { gzipSync } from "node:zlib";
import { thermalRouter } from "./thermal/thermalRoutes";
import {
  getSnapshotOrNull,
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
  publishedAt: string;
  etag: string;
}>();

const PUBLISHED_VIEW_INTERVAL_MS = Math.max(1_000, Number(process.env.PRIZM_PUBLISHED_VIEW_INTERVAL_MS || 4_000));
let publishedViewTimer: NodeJS.Timeout | null = null;
let publishedViewBuildInProgress = false;
const demandedViewKeys = new Map<string, number>();
const PUBLISHED_VIEW_DEMAND_TTL_MS = Math.max(10_000, Number(process.env.PRIZM_PUBLISHED_VIEW_DEMAND_TTL_MS || 30_000));

type PublishedViewDefinition = {
  key: string;
  heartbeatOnly?: boolean;
  includeArrayDetails?: boolean;
  includeStringDiagnostics?: boolean;
  includeStrings?: boolean;
};

const PUBLISHED_VIEW_DEFINITIONS: PublishedViewDefinition[] = [
  { key: "heartbeat", heartbeatOnly: true },
  { key: "standard:compact-strings:with-strings", includeStrings: true },
  { key: "details:compact-strings:with-strings", includeArrayDetails: true, includeStrings: true },
  { key: "details:string-diagnostics:with-strings", includeArrayDetails: true, includeStringDiagnostics: true, includeStrings: true },
  { key: "standard:compact-strings:without-strings", includeStrings: false }
];

function serializePublishedView(source: any, definition: PublishedViewDefinition) {
  const browserSnapshot = definition.heartbeatOnly
    ? buildHeartbeatSnapshot(source)
    : buildBrowserSnapshot(source, {
        includeArrayDetails: definition.includeArrayDetails,
        includeStringDiagnostics: definition.includeStringDiagnostics,
        includeStrings: definition.includeStrings
      });
  const json = JSON.stringify(browserSnapshot);
  const publishedAt = new Date().toISOString();
  const cycleId = Number(source?.cycleId || 0);
  return {
    source,
    json,
    gzip: gzipSync(json, { level: 1 }),
    publishedAt,
    etag: `W/\"prizm-${definition.key}-${cycleId}-${publishedAt}\"`
  };
}

/**
 * Prepare browser-ready, compressed views away from the HTTP request path.
 * A complete set is swapped in atomically so browsers never observe a mix of
 * old and new projections during a coordinator publication.
 */
export async function publishBrowserViews(): Promise<boolean> {
  if (publishedViewBuildInProgress) return false;
  // This is an internal read-only projection. Avoid getLatestSnapshot(), which
  // defensively clones the multi-megabyte canonical graph on every call.
  const source = getSnapshotOrNull();
  if (!source) return false;
  const now = Date.now();
  const desiredDefinitions = PUBLISHED_VIEW_DEFINITIONS.filter((definition) =>
    definition.key === "heartbeat" || (demandedViewKeys.get(definition.key) || 0) >= now - PUBLISHED_VIEW_DEMAND_TTL_MS
  );
  if (desiredDefinitions.every((definition) => cachedBrowserSnapshots.get(definition.key)?.source === source)) return false;

  publishedViewBuildInProgress = true;
  try {
    for (const definition of desiredDefinitions) {
      if (cachedBrowserSnapshots.get(definition.key)?.source === source) continue;
      cachedBrowserSnapshots.set(definition.key, serializePublishedView(source, definition));
      // Yield between large projections to keep command and Modbus requests responsive.
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    return true;
  } finally {
    publishedViewBuildInProgress = false;
  }
}

export function startPublishedViewCache(): void {
  if (publishedViewTimer) return;
  const refresh = () => publishBrowserViews().catch((error) => {
    console.warn("[Published Views] Background preparation failed", error?.message || error);
  });
  refresh();
  publishedViewTimer = setInterval(refresh, PUBLISHED_VIEW_INTERVAL_MS);
  publishedViewTimer.unref?.();
  console.log(`[Published Views] Browser projections publishing every ${PUBLISHED_VIEW_INTERVAL_MS}ms`);
}

export function stopPublishedViewCache(): void {
  if (publishedViewTimer) clearInterval(publishedViewTimer);
  publishedViewTimer = null;
}

export function getPublishedViewStatus() {
  const heartbeat = cachedBrowserSnapshots.get("heartbeat");
  return {
    ready: !!heartbeat,
    intervalMs: PUBLISHED_VIEW_INTERVAL_MS,
    publishedAt: heartbeat?.publishedAt || null,
    cycleId: heartbeat ? JSON.parse(heartbeat.json)?.cycleId ?? null : null,
    views: Array.from(cachedBrowserSnapshots.entries()).map(([key, value]) => ({
      key,
      bytes: Buffer.byteLength(value.json),
      gzipBytes: value.gzip.length,
      publishedAt: value.publishedAt
    }))
  };
}

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
    let snap = getSnapshotOrNull();
    if (!snap) {
      console.log("[Site Data Routes] Snapshot not found, triggering immediate background poll...");
      requestRefresh("site-data:snapshot-warming");
      snap = getSnapshotOrNull();
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
    demandedViewKeys.set(cacheKey, Date.now());
    let cached = cachedBrowserSnapshots.get(cacheKey);
    // Startup fallback only. During normal operation the four-second publisher
    // owns serialization and this route simply writes an immutable buffer.
    if (!cached) {
      const definition = PUBLISHED_VIEW_DEFINITIONS.find((entry) => entry.key === cacheKey) || {
        key: cacheKey, heartbeatOnly, includeArrayDetails, includeStringDiagnostics, includeStrings
      };
      cached = serializePublishedView(snap, definition);
      cachedBrowserSnapshots.set(cacheKey, cached);
    }
    // A view that has not been open recently may still have an older prepared
    // projection. Serve it immediately for a fast first paint, then refresh it
    // off the request path for the next browser poll.
    if (cached.source !== snap) void publishBrowserViews();

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Vary", "Accept-Encoding");
    res.setHeader("X-PRIZM-Snapshot-Bytes", String(Buffer.byteLength(cached.json)));
    res.setHeader("X-PRIZM-Snapshot-View", view);
    res.setHeader("X-PRIZM-Published-At", cached.publishedAt);
    res.setHeader("ETag", cached.etag);
    if (req.headers["if-none-match"] === cached.etag) return res.status(304).end();
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

siteDataRouter.get("/published-views/status", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(getPublishedViewStatus());
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
