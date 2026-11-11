var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// <stdin>
var stdin_exports = {};
__export(stdin_exports, {
  adapters: () => adapters,
  install: () => install
});
module.exports = __toCommonJS(stdin_exports);
var import_promises = __toESM(require("node:fs/promises"));
var import_node_path2 = __toESM(require("node:path"));
var import_node_crypto2 = require("node:crypto");

// src/server/dataExport/model.ts
var exportLimits = { days: 7, selections: 32, series: 1024, rows: 12e4, readBytes: 256 * 1024 ** 2, outputBytes: 32 * 1024 ** 2, zipBytes: 16 * 1024 ** 2, ms: 25e3 };
var powerMetrics = [
  { id: "kw", label: "PCS measured real power", unit: "kW" },
  { id: "kvar", label: "PCS measured reactive power", unit: "kVAR" },
  { id: "dcV", label: "PCS DC voltage", unit: "V" },
  { id: "dcA", label: "PCS DC current", unit: "A" },
  { id: "Reported setpoint kW", label: "EMS reported real-power command", unit: "kW" },
  { id: "Reported setpoint kVAR", label: "EMS reported reactive-power command", unit: "kVAR" },
  { id: "Reported enabled", label: "EMS reported application enabled", unit: "" },
  { id: "Positive contactor", label: "Positive contactor", unit: "" },
  { id: "Negative contactor", label: "Negative contactor", unit: "" },
  { id: "EMS close request", label: "EMS close request", unit: "" },
  { id: "Rotation", label: "Rotation", unit: "" },
  { id: "Alarm count", label: "Active alarm count", unit: "count" },
  { id: "Warning count", label: "Active warning count", unit: "count" },
  { id: "Info count", label: "Active information count", unit: "count" },
  { id: "Active notifications", label: "Active notification set", unit: "" }
];
var hvacMetrics = [
  ...["space", "supply", "control", "outside", "cell", "cooling", "heating"].map((id) => ({ id, label: { space: "Enclosure temperature", supply: "Supply-air temperature", control: "Control temperature", outside: "Outside temperature", cell: "Average cell temperature", cooling: "Cooling setpoint", heating: "Heating setpoint" }[id], unit: "\xB0C" })),
  { id: "current", label: "Whole-unit supply current", unit: "A" },
  { id: "rpm", label: "Fan speed", unit: "RPM" },
  { id: "humidity", label: "Humidity", unit: "%" },
  ...["compressor", "electricHeat", "reversingValve", "fanLow", "fanHigh"].map((id) => ({ id: "command." + id, label: { compressor: "Compressor command", electricHeat: "Electric heat command", reversingValve: "Reversing valve command", fanLow: "Low fan command", fanHigh: "High fan command" }[id], unit: "0/1" }))
];
var cellMetrics = [{ id: "millivolts", label: "Cell voltage", unit: "mV" }, { id: "temperatureF", label: "Cell temperature", unit: "\xB0F" }, ...["currentA", "socPct", "connected", "inRotation", "positiveContactorClosed", "negativeContactorClosed", "balancing"].map((id) => ({ id: "operating." + id, label: { currentA: "String current", socPct: "String SOC", connected: "String connected", inRotation: "In rotation", positiveContactorClosed: "Positive contactor closed", negativeContactorClosed: "Negative contactor closed", balancing: "Balancing state" }[id], unit: id === "currentA" ? "A" : id === "socPct" ? "%" : id === "balancing" ? "" : "0/1" }))];

// src/server/dataExport/service.ts
var import_node_worker_threads = require("node:worker_threads");
var import_node_path = __toESM(require("node:path"), 1);
var import_node_crypto = require("node:crypto");
function validateRequest(raw, catalog, now = Date.now()) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("Invalid export selection");
  const r = raw;
  if (Object.keys(r).some((k) => !["identity", "from", "to", "selections"].includes(k)) || r.identity !== catalog.identity) throw Error("Site context changed. Reload available measurements.");
  if (!Number.isSafeInteger(r.from) || !Number.isSafeInteger(r.to) || r.from < 0 || r.to <= r.from || r.to > now + 1e3 || r.to - r.from > exportLimits.days * 864e5) throw Error("Choose a past time window of up to seven days.");
  if (!Array.isArray(r.selections) || !r.selections.length || r.selections.length > exportLimits.selections) throw Error("Select between 1 and 32 equipment targets.");
  const seen = /* @__PURE__ */ new Set();
  let count = 0;
  for (const s of r.selections) {
    if (!s || typeof s !== "object" || Object.keys(s).some((k) => !["source", "target", "metrics", "bpc", "cell"].includes(k))) throw Error("Invalid measurement selection");
    const t = catalog.targets.find((t2) => t2.source === s.source && t2.id === s.target), key = s.source + ":" + s.target;
    if (!t || seen.has(key)) throw Error("Equipment is unavailable or selected twice. Reload the catalogue.");
    seen.add(key);
    if (!Array.isArray(s.metrics) || !s.metrics.length || s.metrics.length > 32 || new Set(s.metrics).size !== s.metrics.length || s.metrics.some((m) => !t.metrics.some((d) => d.id === m))) throw Error("Select valid measurements for each target.");
    for (const [field, max] of [["bpc", t.bpcs], ["cell", t.cells]]) if (s[field] !== void 0 && (s.source !== "cells" || !Number.isInteger(s[field]) || s[field] < 1 || s[field] > max)) throw Error("Invalid BPC or cell selection");
    count += s.metrics.reduce((n, m) => n + (s.source === "cells" && !m.startsWith("operating.") ? (s.bpc ? 1 : t.bpcs) * (s.cell ? 1 : t.cells) : 1), 0);
  }
  if (count > exportLimits.series) throw Error("Select at most 1,024 data series. Narrow the BPC/cell selection.");
  return structuredClone(r);
}
function runExportWorker(job, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new import_node_worker_threads.Worker(import_node_path.default.join(__dirname, "data-export-worker.cjs"), { resourceLimits: { maxOldGenerationSizeMb: 256 } });
    let done = false;
    const finish = (error, result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      void worker.terminate();
      error ? reject(error) : resolve(result);
    };
    const abort = () => finish(Error("Export cancelled"));
    const timer = setTimeout(() => finish(Error("Export time limit reached. Select a shorter window.")), exportLimits.ms + 5e3);
    worker.once("error", (e) => finish(e));
    worker.once("exit", () => finish(Error("Export reader stopped before completion. Narrow the selection and retry.")));
    worker.once("message", (m) => m.error || !m.result ? finish(Error(m.error || "Invalid export response")) : finish(void 0, m.result));
    signal?.addEventListener("abort", abort, { once: true });
    worker.postMessage(job);
  });
}
var DataExportService = class {
  constructor(plans, run = runExportWorker, clock = Date.now) {
    this.plans = plans;
    this.run = run;
    this.clock = clock;
    this.busy = false;
    this.cache = null;
  }
  enabled() {
    if (process.env.PRIZM_DATA_EXPORT_ENABLED === "false") throw Error("Data exports are disabled");
  }
  describe(plans) {
    const keys = new Set(plans.map((p) => p.identity).filter(Boolean));
    if (keys.size > 1) throw Error("History sources are switching sites. Wait for matching site identity.");
    return {
      identity: (0, import_node_crypto.createHash)("sha256").update(JSON.stringify(plans.map((p) => [p.source, p.identity]))).digest("hex"),
      site: plans.find((p) => p.source === "cells" && p.site)?.site || plans.find((p) => p.site)?.site || "Site unavailable",
      targets: plans.flatMap((p) => p.targets),
      notes: plans.flatMap((p) => p.notes)
    };
  }
  async catalog() {
    this.enabled();
    return this.describe(await this.plans());
  }
  async preview(raw, signal) {
    this.enabled();
    if (this.busy) throw Error("An export is already being prepared. Try again shortly.");
    this.busy = true;
    try {
      const plans = await this.plans(), catalog = this.describe(plans), request = validateRequest(raw, catalog, this.clock());
      signal?.throwIfAborted();
      const result = await this.run({ request, site: catalog.site, plans }, signal);
      signal?.throwIfAborted();
      this.enabled();
      if ((await this.catalog()).identity !== catalog.identity) throw Error("Site changed during export. Reload the catalogue.");
      const archive = Buffer.from(result.archive);
      if (archive.length > exportLimits.zipBytes) throw Error("Package exceeds its size limit");
      const preview = { ticket: (0, import_node_crypto.randomUUID)(), expiresAt: this.clock() + 5 * 6e4, bytes: archive.length, rows: result.rows, site: catalog.site, from: request.from, to: request.to, series: result.coverage, warnings: result.warnings };
      clearTimeout(this.expiry);
      this.cache = { identity: catalog.identity, preview, archive };
      this.expiry = setTimeout(() => {
        this.cache = null;
      }, 5 * 6e4);
      this.expiry.unref();
      return preview;
    } finally {
      this.busy = false;
    }
  }
  async download(ticket) {
    this.enabled();
    const cache = this.cache;
    if (!cache || cache.preview.ticket !== ticket || cache.preview.expiresAt <= this.clock()) throw Error("Package expired or replaced by a newer export. Prepare it again.");
    if ((await this.catalog()).identity !== cache.identity) throw Error("Site changed; prepare a new package.");
    return cache.archive;
  }
};

// src/server/dataExport/routes.ts
var import_express = require("express");
function createDataExportRouter(service) {
  const router = (0, import_express.Router)();
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  router.get("/catalog", async (req, res) => {
    try {
      if (Object.keys(req.query).length) throw Error("Unexpected query");
      res.json(await service.catalog());
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  router.post("/query", async (req, res) => {
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    try {
      if (Object.keys(req.query).length) throw Error("Unexpected query");
      res.json(await service.preview(req.body, controller.signal));
    } catch (e) {
      if (!res.destroyed) res.status(400).json({ error: e.message });
    }
  });
  router.get("/package", async (req, res) => {
    try {
      if (Object.keys(req.query).join(",") !== "ticket" || typeof req.query.ticket !== "string" || !/^[a-f0-9-]{36}$/.test(req.query.ticket)) throw Error("Invalid package ticket");
      const archive = await service.download(req.query.ticket);
      res.type("application/zip");
      res.setHeader("Content-Disposition", 'attachment; filename="prizm-selected-history.zip"');
      res.send(archive);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  return router;
}

// <stdin>
var cells = /* @__PURE__ */ (() => {
  const siteKey = (site) => (0, import_node_crypto2.createHash)("sha256").update(JSON.stringify([site.stationCode, site.blockIndex, site.emsBaseUrl])).digest("hex");
  ;
  return async function() {
    this.synchronizeSite();
    const key = this.scope ? siteKey(this.scope) : "";
    const files = key ? await import_promises.default.readdir(import_node_path2.default.join(this.options.directory, key), { withFileTypes: true }).catch((e) => {
      if (e.code === "ENOENT") return [];
      throw e;
    }) : [];
    this.synchronizeSite();
    if (key !== (this.scope ? siteKey(this.scope) : "")) throw new Error("Site changed during export catalogue");
    return {
      source: "cells",
      identity: key,
      site: this.view("millivolts").site ?? "",
      targets: (this.latest?.strings ?? []).map((s) => ({ source: "cells", id: `A${s.array}-S${s.string}`, array: s.array, label: `Array ${s.array} \xB7 String ${s.string}`, bpcs: s.bpcCount, cells: s.groupsPerBpc, metrics: cellMetrics })),
      files: files.filter((f) => f.isFile() && /^\d{13}\.cells\.json\.gz$/.test(f.name)).map((f) => ({ path: import_node_path2.default.join(this.options.directory, key, f.name), at: Number(f.name.split(".")[0]) })),
      notes: ["Cell frames are recorded at most once per minute, with unchanged frames omitted. CSV includes every retained selected reading; intervening cell behavior cannot be reconstructed."]
    };
  };
})();
var power = /* @__PURE__ */ (() => {
  const siteKey = (id) => (0, import_node_crypto2.createHash)("sha256").update(id).digest("hex");
  const pattern = /^([a-f0-9]{64})-(\d{1,4})-(\d{13})\.jsonl$/;
  ;
  return async function() {
    const key = this.site ? siteKey(this.site.id) : "";
    const targets = (await this.exportObservations()).filter((o) => o.stream !== "command").map((o) => ({
      source: "power",
      id: o.entity + "|" + o.stream,
      label: o.label + " \xB7 " + o.stream,
      array: o.array,
      metrics: powerMetrics.filter((m) => o.stream === "electrical" ? ["kw", "kvar", "dcV", "dcA"].includes(m.id) : o.stream === "ems-app" ? m.id === "Reported enabled" || o.entity.startsWith("ems-app:PC00001:") && m.id.startsWith("Reported setpoint") : Object.hasOwn(o.values, m.id))
    })).filter((t) => t.metrics.length);
    return {
      source: "power",
      identity: key,
      site: this.site?.label ?? "",
      targets,
      files: [...this.files].filter(([name]) => name.startsWith(key + "-")).map(([name, bytes]) => ({ path: import_node_path2.default.join(this.directory, name), at: Number(pattern.exec(name)[3]), array: Number(pattern.exec(name)[2]), bytes })),
      notes: ["Operational history retains source observations, normally 10-second electrical and 60-second state checkpoints plus changes. Notification timestamps are PRIZM observation times; the EMS endpoint does not provide authoritative raised/cleared lifecycle timestamps. EMS reported setpoints and PCS measured power are separate evidence; neither proves a command was executed."]
    };
  };
})();
var hvac = /* @__PURE__ */ (() => {
  const hash = (text) => (0, import_node_crypto2.createHash)("sha256").update(text).digest("hex");
  const shardPattern = /^(\d{10,16})-([a-f0-9]{64})\.jsonl$/;
  ;
  return async function() {
    const devices = await this.historyDevices();
    const key = this.currentSite ? hash(this.currentSite.id) : "";
    if (this.config.siteKey && key !== this.config.siteKey) throw new Error("Waiting for matching thermal site identity");
    return {
      source: "hvac",
      identity: key,
      site: this.currentSite?.label ?? "",
      targets: devices.map((d) => ({ source: "hvac", id: d.id, label: d.label, array: d.array, metrics: hvacMetrics })),
      files: [...this.files].map(([name, bytes]) => ({ path: import_node_path2.default.join(this.directory, name), at: Number(shardPattern.exec(name)[1]), target: shardPattern.exec(name)[2], bytes })),
      notes: ["HVAC export uses retained whole-site history at its recorded resolution. Targeted recordings and the live buffer are not merged into it. " + (!this.config.enabled ? "Whole-site HVAC recording is currently disabled." : "")]
    };
  };
})();
function install(router, cellHistory, timeline, thermal) {
  const service = new DataExportService(async () => [await power.call(timeline()), await cells.call(cellHistory), await hvac.call(thermal().siteHistory)]);
  router.use("/data-export", createDataExportRouter(service));
  return service;
}
var adapters = { cells, power, hvac };
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  adapters,
  install
});
