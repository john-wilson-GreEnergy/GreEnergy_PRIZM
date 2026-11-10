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
  CellHealthMonitor: () => CellHealthMonitor,
  createCellHistoryRouter: () => createCellHistoryRouter,
  decodeCellReport: () => decodeCellReport
});
module.exports = __toCommonJS(stdin_exports);

// src/server/cellHealth/CellHealthMonitor.ts
var import_promises2 = require("node:timers/promises");

// src/core/cellHealth.ts
var CELL_HEALTH_LIMITS = {
  cellDeviationMv: 100,
  bpcDeviationMv: 75,
  clearCellMv: 60,
  clearBpcMv: 45,
  minSamples: 3,
  persistenceMs: 12e4,
  maxGapMs: 18e4,
  maxSkewMs: 3e4,
  restingSpreadMv: 80,
  restingClearMv: 60,
  restingPersistenceMs: 10 * 6e4,
  restingTrendMv: 10,
  idleAmps: 1,
  recoveryMs: 30 * 6e4,
  maxStrings: 512,
  maxActive: 64,
  preSamples: 10,
  maxSamples: 360,
  maxFiles: 256,
  maxBytes: 64 * 1024 ** 2,
  maxFileBytes: 1024 ** 2,
  reserveBytes: 2 * 1024 ** 3
};
function cellIncidentSummary({ samples: _samples, ...summary }) {
  return summary;
}

// src/server/cellHealth/CellHealthEngine.ts
var import_node_crypto = require("node:crypto");
var import_node_crypto2 = require("node:crypto");

// src/server/cellHealth/cellAssessment.ts
var assessments = {
  review: { label: "Review", meaning: "Persistent voltage separation was observed, or its recovery is still being confirmed.", nextStep: "Open the incident graph. Compare the affected cells or BPCs with the string median and check current, SOC and balancing context. Record recurring findings for maintenance review." },
  watch: { label: "Watching", meaning: "Voltage separation is visible, but persistence has not yet been established.", nextStep: "Watch subsequent distinct measurements. Check whether the same equipment stays separated through the operating cycle." },
  unavailable: { label: "Evidence unavailable", meaning: "Current measurements are missing, repeated, incomplete or too old to assess reliably.", nextStep: "Check the source time and coverage explanation. Revisit when fresh measurements arrive; do not interpret an empty result as healthy." },
  normal: { label: "No divergence detected", meaning: "The latest usable evidence does not show persistent divergence at the advisory thresholds.", nextStep: "Review trends across charge, discharge and recovery when assessing a concern. This result does not establish capacity or overall cell health." }
};
function describeCellAssessment(state) {
  return { state, ...assessments[state] };
}

// src/server/cells/cellProjection.ts
var CELL_FRESH_MS = 12e4;
function cellId(row, i) {
  return `A${row.array}-S${row.string}-B${Math.floor(i / row.groupsPerBpc) + 1}-C${i % row.groupsPerBpc + 1}`;
}
function freshCell(time, now) {
  return time !== null && time <= now + 5e3 && time >= now - CELL_FRESH_MS;
}

// src/server/cellHealth/evaluateCells.ts
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const i = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2;
}
function evaluateCells(row, at) {
  const total = row.bpcCount * row.groupsPerBpc;
  const cells = row.millivolts.flatMap((mv, i) => mv !== null && Number.isFinite(mv) && mv > 0 && mv < 1e4 && freshCell(row.observedAt[i], at) ? [{ i, mv, time: row.observedAt[i] }] : []);
  const times = cells.map((c) => c.time), sourceAt = times.length ? Math.min(...times) : null;
  const coherent = times.length > 0 && Math.max(...times) - sourceAt <= CELL_HEALTH_LIMITS.maxSkewMs;
  const reason = cells.length !== total || !total ? `Incomplete fresh voltage coverage: ${cells.length}/${total}` : !coherent ? "Cell timestamps are not aligned within 30 seconds" : null;
  const middle = cells.length ? median(cells.map((c) => c.mv)) : null;
  const outliers = cells.map((c) => ({ id: cellId(row, c.i), bpc: Math.floor(c.i / row.groupsPerBpc) + 1, group: c.i % row.groupsPerBpc + 1, mv: c.mv, deviationMv: c.mv - middle })).sort((a, b) => Math.abs(b.deviationMv) - Math.abs(a.deviationMv));
  const bpcs = Array.from({ length: row.bpcCount }, (_, i) => {
    const values = cells.filter((c) => Math.floor(c.i / row.groupsPerBpc) === i).map((c) => c.mv);
    return values.length === row.groupsPerBpc ? { bpc: i + 1, medianMv: median(values), deviationMv: median(values) - middle } : null;
  }).filter((v) => v !== null);
  const temps = row.temperatureF.filter((t, i) => t !== null && Number.isFinite(t) && freshCell(row.observedAt[i], at) && !row.ignoredTemperatures.includes(i));
  const context = row.operating;
  const contextFresh = context?.observedAt !== null && context?.observedAt !== void 0 && freshCell(context.observedAt, at) && sourceAt !== null && Math.abs(context.observedAt - sourceAt) <= CELL_HEALTH_LIMITS.maxSkewMs;
  const current = contextFresh ? context.currentA : null;
  const connected = contextFresh ? context.connected : null;
  const phase = current === null || connected === null ? "unknown" : Math.abs(current) <= CELL_HEALTH_LIMITS.idleAmps ? "idle" : connected !== true ? "unknown" : current < -CELL_HEALTH_LIMITS.idleAmps ? "charge" : "discharge";
  const min = cells.length ? Math.min(...cells.map((c) => c.mv)) : null, max = cells.length ? Math.max(...cells.map((c) => c.mv)) : null;
  const candidateTargets = [...outliers.filter((o) => Math.abs(o.deviationMv) >= CELL_HEALTH_LIMITS.cellDeviationMv).map((o) => `${o.id}:${o.deviationMv < 0 ? "low" : "high"}`), ...bpcs.filter((b) => Math.abs(b.deviationMv) >= CELL_HEALTH_LIMITS.bpcDeviationMv).map((b) => `A${row.array}-S${row.string}-B${b.bpc}:${b.deviationMv < 0 ? "low" : "high"}`)];
  return {
    candidateTargets,
    at,
    sourceAt,
    phase,
    currentA: current,
    inRotation: contextFresh ? context.inRotation : null,
    positiveContactorClosed: contextFresh ? context.positiveContactorClosed ?? null : null,
    negativeContactorClosed: contextFresh ? context.negativeContactorClosed ?? null : null,
    socPct: contextFresh ? context.socPct : null,
    connected,
    balancing: contextFresh ? context.balancing : "unknown",
    minMv: min,
    medianMv: middle,
    maxMv: max,
    spreadMv: min === null ? null : max - min,
    maxDeviationMv: outliers.length ? Math.abs(outliers[0].deviationMv) : null,
    maxBpcDeviationMv: bpcs.length ? Math.max(...bpcs.map((b) => Math.abs(b.deviationMv))) : null,
    minTempF: temps.length ? Math.min(...temps) : null,
    maxTempF: temps.length ? Math.max(...temps) : null,
    fresh: cells.length,
    total,
    reason,
    outliers: outliers.slice(0, 8),
    bpcs
  };
}

// src/server/cellHealth/restingWatch.ts
var RestingWatch = class {
  constructor() {
    this.since = null;
    this.count = 0;
    this.first = null;
  }
  reset() {
    this.since = null;
    this.count = 0;
    this.first = null;
  }
  update(p, lastActiveAt, enabled = true) {
    const result = { state: "insufficient", reason: "Fresh current and contactor feedback are required to assess resting imbalance", since: null, lastActiveAt, samples: 0, trend: "unknown", spreadChangeMv: null, trendSince: null };
    if (!enabled) {
      this.reset();
      return { ...result, state: "disabled", reason: "Resting voltage watch disabled" };
    }
    if (p.currentA === null || p.connected === null || p.sourceAt === null || p.spreadMv === null) {
      this.reset();
      return result;
    }
    if (Math.abs(p.currentA) > CELL_HEALTH_LIMITS.idleAmps) {
      this.reset();
      return { ...result, state: "loaded", reason: "Measured current is outside the resting band; resting watch is not qualifying" };
    }
    if (lastActiveAt !== null && p.sourceAt - lastActiveAt <= CELL_HEALTH_LIMITS.recoveryMs) {
      this.reset();
      return { ...result, state: "recovery", reason: "Within 30 minutes of observed charge/discharge; tracking recovery, not qualifying resting persistence" };
    }
    if (!this.first) this.first = { at: p.sourceAt, spread: p.spreadMv };
    const change = p.spreadMv - this.first.spread, elapsed = p.sourceAt - this.first.at;
    Object.assign(result, { trendSince: this.first.at, spreadChangeMv: change, trend: elapsed < CELL_HEALTH_LIMITS.restingPersistenceMs ? "unknown" : change >= CELL_HEALTH_LIMITS.restingTrendMv ? "growing" : change <= -CELL_HEALTH_LIMITS.restingTrendMv ? "shrinking" : "stable" });
    if (p.spreadMv < CELL_HEALTH_LIMITS.restingSpreadMv) {
      this.since = null;
      this.count = 0;
      return { ...result, state: "below-threshold", reason: "Resting spread is below the advisory watch threshold; this does not establish cell health" };
    }
    this.since ??= p.sourceAt;
    this.count++;
    const persistent = this.count >= CELL_HEALTH_LIMITS.minSamples && p.sourceAt - this.since >= CELL_HEALTH_LIMITS.restingPersistenceMs;
    return {
      ...result,
      state: persistent ? "persistent" : "watch",
      since: this.since,
      samples: this.count,
      reason: (persistent ? "Persistent resting voltage imbalance" : "Gathering resting spread evidence") + ` (${this.count} distinct measurements; at least 10 minutes required)` + (lastActiveAt === null ? "; last charge/discharge time was not observed" : "")
    };
  }
};

// src/server/cellHealth/CellHealthEngine.ts
var healthSiteId = (s) => (0, import_node_crypto2.createHash)("sha256").update(JSON.stringify([s.stationCode, s.blockIndex, s.emsBaseUrl])).digest("hex");
var CellHealthEngine = class {
  constructor(save, restingEnabled = true) {
    this.save = save;
    this.restingEnabled = restingEnabled;
    this.tracks = /* @__PURE__ */ new Map();
    this.siteId = null;
    this.siteLabel = null;
    this.lastFrameAt = null;
    this.warning = null;
  }
  selectSite(site) {
    const id = site ? healthSiteId(site) : null;
    if (this.siteId === id) return;
    this.finish("Site changed; subsequent condition unknown");
    this.tracks.clear();
    this.siteId = id;
    this.siteLabel = site ? `${site.stationCode} / Block ${site.blockIndex}` : null;
    this.lastFrameAt = null;
    this.warning = null;
  }
  ingestRow(row, at) {
    const id = `A${row.array}-S${row.string}`, { candidateTargets, ...point } = evaluateCells(row, at);
    let track = this.tracks.get(id);
    if (!track) {
      if (this.tracks.size >= CELL_HEALTH_LIMITS.maxStrings) {
        this.warning = "Tracked string limit reached; some strings are not evaluated";
        return;
      }
      track = {
        assessmentState: "normal",
        resting: new RestingWatch(),
        lastMaxTime: -Infinity,
        lastSource: -Infinity,
        lastActive: -Infinity,
        clearCount: 0,
        streaks: /* @__PURE__ */ new Map(),
        trail: [],
        incident: null,
        readiness: { id, array: row.array, string: row.string, ready: false, reason: "Waiting for evidence", qualifyingSamples: 0, point }
      };
      this.tracks.set(id, track);
    }
    const gap = point.sourceAt !== null && point.sourceAt - track.lastSource > CELL_HEALTH_LIMITS.maxGapMs;
    if (gap || point.reason) {
      track.streaks.clear();
      track.clearCount = 0;
      track.resting.reset();
      if (track.incident) this.end(track, "Evidence gap; condition not confirmed resolved");
      if (gap && track.trail.length) {
        track.trail.push({ ...point, sourceAt: null, minMv: null, medianMv: null, maxMv: null, spreadMv: null, currentA: null, maxDeviationMv: null, maxBpcDeviationMv: null, minTempF: null, maxTempF: null, socPct: null, outliers: [], bpcs: [], reason: "Evidence gap", phase: "unknown" });
      }
      track.trail = track.trail.slice(-CELL_HEALTH_LIMITS.preSamples);
      track.lastActive = -Infinity;
    }
    if (point.reason) {
      track.readiness = { ...track.readiness, point, ready: false, reason: point.reason, qualifyingSamples: 0 };
      return;
    }
    if (point.sourceAt === null || point.sourceAt <= track.lastMaxTime) {
      track.readiness = { ...track.readiness, ready: false, reason: "Waiting for a new coherent measurement; repeated or out-of-order cells are not counted" };
      return;
    }
    track.lastSource = point.sourceAt;
    track.lastMaxTime = Math.max(...row.observedAt.filter((t) => t !== null));
    if (point.phase === "charge" || point.phase === "discharge") track.lastActive = point.sourceAt;
    else if (point.phase === "idle" && point.sourceAt - track.lastActive <= CELL_HEALTH_LIMITS.recoveryMs) point.phase = "recovery";
    point.resting = track.resting.update(point, Number.isFinite(track.lastActive) ? track.lastActive : null, this.restingEnabled);
    const restingKey = `${id}:resting-spread`;
    const targets = [...candidateTargets, ...point.resting.state === "persistent" ? [restingKey] : []];
    const present = new Set(targets);
    for (const key of track.streaks.keys()) if (!present.has(key)) track.streaks.delete(key);
    for (const key of targets) {
      const prior = track.streaks.get(key);
      track.streaks.set(key, { since: prior?.since ?? point.sourceAt, count: (prior?.count ?? 0) + 1 });
    }
    const qualified = targets.filter((key) => {
      const s = track.streaks.get(key);
      return key === restingKey || s.count >= CELL_HEALTH_LIMITS.minSamples && point.sourceAt - s.since >= CELL_HEALTH_LIMITS.persistenceMs;
    }).sort((a, b) => Number(a.includes("-C")) - Number(b.includes("-C")));
    const count = Math.max(0, ...[...track.streaks.values()].map((s) => s.count));
    track.readiness = { ...track.readiness, point, ready: true, qualifyingSamples: count, reason: qualified.length ? "Persistent voltage divergence; review incident" : targets.length ? `Gathering persistence evidence (${count}/${CELL_HEALTH_LIMITS.minSamples} distinct samples; at least 2 minutes)` : "No persistent divergence at the advisory thresholds" };
    if (point.resting.state === "watch" || point.resting.state === "persistent" || point.resting.state === "recovery" || point.resting.state === "insufficient") track.readiness.reason += "; " + point.resting.reason;
    if (point.inRotation === false) track.readiness.reason += "; out of rotation";
    if (point.phase === "unknown") track.readiness.reason += "; operating phase unavailable";
    if (point.balancing === "active") track.readiness.reason += "; balancing active, root cause not established";
    if (!track.incident && qualified.length) {
      if ([...this.tracks.values()].filter((t) => t.incident).length >= CELL_HEALTH_LIMITS.maxActive) this.warning = "Active incident limit reached; findings remain visible but some graphs are not recorded";
      else track.incident = {
        version: 1,
        id: (0, import_node_crypto.randomUUID)(),
        siteId: this.siteId,
        siteLabel: this.siteLabel,
        array: row.array,
        string: row.string,
        startedAt: Math.min(...qualified.map((key) => key === restingKey ? point.resting.since : track.streaks.get(key).since)),
        detectedAt: point.sourceAt,
        updatedAt: point.at,
        endedAt: null,
        endReason: null,
        peakDeviationMv: 0,
        peakSpreadMv: 0,
        targets: qualified.slice(0, 72),
        confidence: point.phase === "unknown" ? "voltage evidence only" : "operating context available",
        kind: qualified.some((key) => key !== restingKey) ? "voltage-divergence" : "resting-imbalance",
        truncated: false,
        samples: track.trail.slice(-CELL_HEALTH_LIMITS.preSamples)
      };
    }
    if (track.incident?.kind === "resting-imbalance" && ["loaded", "recovery", "insufficient", "disabled"].includes(point.resting.state)) this.end(track, "Resting conditions no longer confirmed; imbalance not confirmed resolved");
    if (track.incident) {
      const incident = track.incident;
      incident.samples.push(point);
      incident.updatedAt = point.at;
      const evidence = incident.samples.filter((p) => p.sourceAt !== null && p.sourceAt >= incident.startedAt);
      incident.peakDeviationMv = Math.max(...evidence.map((p) => p.maxDeviationMv ?? 0));
      incident.peakSpreadMv = Math.max(...evidence.map((p) => p.spreadMv ?? 0));
      incident.targets = [.../* @__PURE__ */ new Set([...incident.targets, ...qualified])].slice(0, 72);
      if (qualified.some((key) => key !== restingKey)) incident.kind = "voltage-divergence";
      if (incident.samples.some((p) => p.phase === "unknown")) incident.confidence = "voltage evidence only";
      track.clearCount = (point.maxDeviationMv ?? Infinity) < CELL_HEALTH_LIMITS.clearCellMv && (point.maxBpcDeviationMv ?? Infinity) < CELL_HEALTH_LIMITS.clearBpcMv && (!incident.targets.includes(restingKey) || point.resting.state === "below-threshold" && (point.spreadMv ?? Infinity) < CELL_HEALTH_LIMITS.restingClearMv) ? track.clearCount + 1 : 0;
      if (track.clearCount >= CELL_HEALTH_LIMITS.minSamples) this.end(track, "Voltage divergence below recovery thresholds for three distinct samples");
      else if (incident.samples.length >= CELL_HEALTH_LIMITS.maxSamples) {
        incident.truncated = true;
        this.end(track, "Graph sample limit reached; condition may continue");
        track.streaks.clear();
        track.resting.reset();
      } else this.save(incident);
    }
    track.assessmentState = track.incident || qualified.length ? "review" : targets.length || point.resting.state === "watch" ? "watch" : "normal";
    track.trail.push(point);
    if (track.trail.length > CELL_HEALTH_LIMITS.preSamples) track.trail = track.trail.slice(-CELL_HEALTH_LIMITS.preSamples);
  }
  completeFrame(frame) {
    this.lastFrameAt = frame.acquiredAt;
    const present = new Set(frame.strings.map((r) => `A${r.array}-S${r.string}`));
    for (const [id, t] of this.tracks) if (!present.has(id)) {
      t.streaks.clear();
      t.clearCount = 0;
      t.resting.reset();
      t.lastActive = -Infinity;
      t.readiness = { ...t.readiness, ready: false, reason: "String absent from current publication", qualifyingSamples: 0 };
      if (t.incident) this.end(t, "String absent; condition unknown");
    }
  }
  end(track, reason) {
    if (!track.incident) return;
    track.incident.endedAt = track.incident.updatedAt;
    track.incident.endReason = reason;
    this.save(track.incident);
    track.incident = null;
  }
  finish(reason = "Monitoring stopped; condition unknown") {
    for (const t of this.tracks.values()) this.end(t, reason);
  }
  readiness(now) {
    return [...this.tracks.values()].map((t) => {
      const stale = t.readiness.point.sourceAt === null || now - t.readiness.point.sourceAt > CELL_HEALTH_LIMITS.maxGapMs;
      const row = stale ? { ...t.readiness, ready: false, reason: `Source stale or missing; current condition unknown. ${t.readiness.reason}`, qualifyingSamples: 0 } : t.readiness;
      const assessment = describeCellAssessment(row.ready ? t.assessmentState : "unavailable");
      if (row.ready && row.point.resting?.state === "watch" && t.assessmentState === "watch") Object.assign(assessment, { label: "Resting imbalance watch", meaning: "Total voltage spread exceeds the resting advisory threshold; persistence is still being gathered.", nextStep: "Compare the spread trend, affected cells, rotation status, contactors and last observed load time. Continue observing distinct measurements." });
      if (row.ready && row.point.resting?.state === "persistent" && (!t.incident || t.incident.kind === "resting-imbalance")) Object.assign(assessment, { label: "Review resting imbalance", meaning: "Total voltage spread persisted under measured low-current conditions. This is evidence for review, not a failed-cell diagnosis.", nextStep: "Open the incident graph and compare the divergent cells, BPCs, balancing and temperature. An unobserved last-load time remains unknown." });
      if (row.ready && t.assessmentState !== "review" && row.point.resting?.state === "insufficient" && (row.point.spreadMv ?? 0) >= CELL_HEALTH_LIMITS.restingSpreadMv) Object.assign(assessment, { state: "unavailable", label: "Resting evidence unavailable", meaning: "Voltage spread exceeds the resting watch threshold, but fresh operating context cannot confirm resting conditions.", nextStep: "Check current and contactor feedback freshness. The voltage readings remain available; do not infer resting persistence from them alone." });
      return { ...row, assessment, incidentId: t.incident?.id ?? null };
    });
  }
};

// src/server/cellHealth/CellHealthStore.ts
var import_promises = __toESM(require("node:fs/promises"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var validId = (id) => /^[a-f0-9-]{36}$/.test(id);
var CellHealthStore = class {
  constructor(directory, maxBytes = CELL_HEALTH_LIMITS.maxBytes, reserveBytes = CELL_HEALTH_LIMITS.reserveBytes) {
    this.directory = directory;
    this.maxBytes = maxBytes;
    this.reserveBytes = reserveBytes;
    this.index = /* @__PURE__ */ new Map();
    this.sizes = /* @__PURE__ */ new Map();
    this.pending = /* @__PURE__ */ new Map();
    this.tail = Promise.resolve();
    this.running = false;
    this.failed = false;
    this.warning = null;
    this.usedBytes = 0;
    this.ready = this.load().catch((e) => {
      this.failed = true;
      this.warning = `Cell-health storage unavailable; existing data preserved: ${String(e)}`;
    });
  }
  validate(i, id) {
    if (i.version !== 1 || i.id !== id || !validId(id) || !/^[a-f0-9]{64}$/.test(i.siteId) || !Array.isArray(i.samples) || i.samples.length > CELL_HEALTH_LIMITS.maxSamples || !Array.isArray(i.targets) || i.targets.length > 72 || !Number.isFinite(i.updatedAt)) throw new Error("Invalid incident file");
  }
  async load() {
    await import_promises.default.mkdir(this.directory, { recursive: true, mode: 448 });
    for (const entry of await import_promises.default.readdir(this.directory, { withFileTypes: true })) {
      const file = import_node_path.default.join(this.directory, entry.name), stat = await import_promises.default.lstat(file);
      this.usedBytes += stat.size;
      if (!entry.isFile() || stat.isSymbolicLink() || !entry.name.endsWith(".json") || !validId(entry.name.slice(0, -5))) continue;
      if (this.index.size >= CELL_HEALTH_LIMITS.maxFiles || stat.size > CELL_HEALTH_LIMITS.maxFileBytes) throw new Error("Incident file limit reached");
      const i = JSON.parse(await import_promises.default.readFile(file, "utf8"));
      this.validate(i, entry.name.slice(0, -5));
      if (i.endedAt === null) {
        i.endedAt = i.updatedAt;
        i.endReason = "Recording interrupted by restart; condition unknown";
      }
      this.index.set(i.id, cellIncidentSummary(i));
      this.sizes.set(i.id, stat.size);
    }
  }
  offer(i) {
    if (this.pending.size >= CELL_HEALTH_LIMITS.maxActive && !this.pending.has(i.id)) {
      this.warning = "Cell-health writer busy; checkpoint skipped";
      return;
    }
    this.pending.set(i.id, structuredClone(i));
    if (this.running) return;
    this.running = true;
    this.tail = (async () => {
      await this.ready;
      while (this.pending.size) {
        const [id, value] = this.pending.entries().next().value;
        this.pending.delete(id);
        if (this.failed) continue;
        try {
          await this.save(value);
        } catch (e) {
          this.warning = `Cell-health recording paused; existing data preserved: ${String(e)}`;
        }
      }
    })().finally(() => {
      this.running = false;
    });
  }
  async save(i) {
    this.validate(i, i.id);
    if (!this.index.has(i.id) && this.index.size >= CELL_HEALTH_LIMITS.maxFiles) throw new Error("256-incident cap reached");
    const body = JSON.stringify(i), bytes = Buffer.byteLength(body), previous = this.sizes.get(i.id) ?? 0;
    if (bytes > CELL_HEALTH_LIMITS.maxFileBytes || this.usedBytes + bytes > this.maxBytes) throw new Error("Storage cap reached");
    const capacity = await import_promises.default.statfs(this.directory);
    if (capacity.bavail * capacity.bsize - bytes < this.reserveBytes) throw new Error("Free-disk reserve reached");
    const file = import_node_path.default.join(this.directory, `${i.id}.json`), temporary = `${file}.tmp`;
    const handle = await import_promises.default.open(temporary, "wx", 384);
    this.usedBytes += bytes;
    try {
      await handle.writeFile(body);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await import_promises.default.rename(temporary, file);
    this.usedBytes -= previous;
    this.index.set(i.id, cellIncidentSummary(i));
    this.sizes.set(i.id, bytes);
  }
  async list(siteId) {
    await this.ready;
    return [...this.index.values()].filter((i) => i.siteId === siteId).sort((a, b) => b.startedAt - a.startedAt);
  }
  async get(id, siteId) {
    await this.ready;
    const summary = this.index.get(id);
    if (!validId(id) || !summary || summary.siteId !== siteId) throw new Error("Incident not found for current site");
    const file = import_node_path.default.join(this.directory, `${id}.json`), stat = await import_promises.default.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > CELL_HEALTH_LIMITS.maxFileBytes) throw new Error("Invalid incident file");
    const i = JSON.parse(await import_promises.default.readFile(file, "utf8"));
    this.validate(i, id);
    if (i.siteId !== siteId) throw new Error("Incident site mismatch");
    return { ...i, endedAt: summary.endedAt, endReason: summary.endReason };
  }
  async flush() {
    await this.ready;
    await this.tail;
  }
};

// src/server/cellHealth/reviewSummary.ts
function cellHealthReviewSummary(rows, incidents, siteId) {
  const saved = new Map(incidents.filter((i) => i.siteId === siteId && i.endedAt === null).map((i) => [i.id, i]));
  const result = { findings: [], watching: 0, unavailable: 0, assessed: rows.length };
  for (const row of rows) {
    const state = row.ready ? row.assessment?.state : "unavailable";
    if (state === "review") {
      const record2 = row.incidentId ? saved.get(row.incidentId) : null;
      result.findings.push({
        id: row.id,
        array: row.array,
        string: row.string,
        label: row.assessment.label,
        meaning: row.assessment.meaning,
        spreadMv: row.point.spreadMv,
        phase: row.point.phase,
        inRotation: row.point.inRotation ?? null,
        sourceAt: row.point.sourceAt,
        incidentId: record2 && record2.array === row.array && record2.string === row.string ? record2.id : null
      });
    } else if (state === "watch") result.watching++;
    else if (state !== "normal") result.unavailable++;
  }
  result.findings.sort((a, b) => a.array - b.array || a.string - b.string);
  return result;
}

// src/server/cellHealth/CellHealthMonitor.ts
var CellHealthMonitor = class {
  constructor(directory, enabled, currentSite, options = {}) {
    this.enabled = enabled;
    this.currentSite = currentSite;
    this.active = null;
    this.stopped = false;
    this.warning = null;
    this.store = enabled ? new CellHealthStore(directory, options.maxBytes, options.reserveBytes) : null;
    this.engine = new CellHealthEngine((i) => this.store?.offer(i), options.restingWatchEnabled ?? process.env.PRIZM_CELL_RESTING_WATCH_ENABLED !== "false");
  }
  sync() {
    this.engine.selectSite(this.currentSite());
  }
  offer(frame) {
    if (!this.enabled || this.stopped) return;
    this.sync();
    if (this.active) {
      this.warning = "Cell-health processing busy; publication skipped";
      return;
    }
    if (healthSiteId(frame.site) !== this.engine.siteId) return;
    this.active = (async () => {
      for (const row of frame.strings) {
        this.sync();
        if (this.stopped || healthSiteId(frame.site) !== this.engine.siteId) return;
        this.engine.ingestRow(row, frame.acquiredAt);
        await (0, import_promises2.setImmediate)();
      }
      this.sync();
      if (!this.stopped && healthSiteId(frame.site) === this.engine.siteId) this.engine.completeFrame(frame);
    })().catch((e) => {
      this.warning = `Cell-health analysis unavailable: ${String(e)}`;
    }).finally(() => {
      this.active = null;
    });
  }
  async status(now = Date.now()) {
    this.sync();
    const id = this.engine.siteId, incidents = await this.store?.list(id) ?? [];
    this.sync();
    if (id !== this.engine.siteId) throw new Error("Site changed; reload cell health");
    const readiness = this.engine.readiness(now);
    return {
      enabled: this.enabled,
      siteLabel: this.engine.siteLabel,
      lastFrameAt: this.engine.lastFrameAt,
      readiness,
      incidents,
      reviewSummary: cellHealthReviewSummary(readiness, incidents, id),
      warning: [this.warning, this.engine.warning, this.store?.warning].filter(Boolean).join(" ") || null,
      usedBytes: this.store?.usedBytes ?? 0,
      limits: CELL_HEALTH_LIMITS
    };
  }
  async incident(id) {
    this.sync();
    const scope = this.engine.siteId;
    if (!this.store) throw new Error("Cell-health monitoring disabled");
    const value = await this.store.get(id, scope);
    this.sync();
    if (scope !== this.engine.siteId) throw new Error("Site changed");
    return value;
  }
  async flush() {
    await this.active;
    await this.store?.flush();
  }
  async close() {
    this.stopped = true;
    await this.active;
    this.engine.finish();
    await this.store?.flush();
  }
};

// src/core/telemetryNumber.ts
function finiteNumber(v) {
  if (typeof v !== "number" && (typeof v !== "string" || !/^-?\d+(\.\d+)?$/.test(v))) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// src/server/cellHealth/operatingContext.ts
var record = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
var bool = (v) => typeof v === "boolean" ? v : null;
function cellOperatingContext(raw) {
  const entry = record(raw), data = record(entry.stringData);
  const packs = Array.isArray(entry.batteryPackReportList) ? entry.batteryPackReportList : [];
  const at = finiteNumber(entry.timeStamp);
  const states = packs.map((p) => {
    const pack = record(p), ts = finiteNumber(pack.timeStamp);
    if (at === null || ts === null || Math.abs(at - ts) > 3e4) return "unknown";
    const state = record(pack.batteryPackData).balancingState;
    return state === "BATTERY_PACK_DISCHARGE_BALANCING_ON" || state === "BATTERY_PACK_CHARGE_BALANCING_ON" ? "active" : state === "BATTERY_PACK_BALANCING_OFF" ? "off" : "unknown";
  });
  const positive = bool(data.positiveContactorClosed), negative = bool(data.negativeContactorClosed);
  const soc = finiteNumber(data.soc);
  return {
    observedAt: at,
    currentA: finiteNumber(data.stringCurrent),
    socPct: soc !== null && soc >= 0 && soc <= 100 ? soc : null,
    positiveContactorClosed: positive,
    negativeContactorClosed: negative,
    connected: positive === false || negative === false ? false : positive === true && negative === true ? true : null,
    inRotation: typeof data.outRotation === "boolean" ? !data.outRotation : null,
    balancing: states.includes("active") ? "active" : states.length && states.every((s) => s === "off") ? "off" : "unknown"
  };
}

// src/server/cells/decodeCellReport.ts
var import_promises3 = require("node:timers/promises");
var object = (v) => v !== null && typeof v === "object" && !Array.isArray(v) ? v : {};
var list = (v) => Array.isArray(v) ? v : [];
var positiveInt = (v, max) => {
  const n = finiteNumber(v);
  return n !== null && Number.isInteger(n) && n > 0 && n <= max ? n : null;
};
function lookup(indices, values, i) {
  const index = indices[i];
  return typeof index === "number" && Number.isInteger(index) && index >= 0 && index < values.length ? finiteNumber(values[index]) : null;
}
function cellReportIdentityMatches(raw, site) {
  const block = object(object(raw).blockReport);
  return block.stationCode === site.stationCode && finiteNumber(block.blockIndex) === site.blockIndex;
}
async function decodeCellReport(raw, site, acquiredAt) {
  if (!cellReportIdentityMatches(raw, site)) throw new Error("Cell report site identity does not match the active connection");
  const block = object(object(raw).blockReport);
  const frame = { schema: 1, site: { ...site }, acquiredAt, reportAt: finiteNumber(block.timeStamp), strings: [], issues: [] };
  const issue = (s) => {
    if (frame.issues.length < 32) frame.issues.push(s);
  };
  let total = 0;
  for (const [arrayKey, rawArray] of Object.entries(object(block.arrayReport))) {
    const array2 = positiveInt(arrayKey, 64);
    if (array2 === null) continue;
    const report = object(object(rawArray).cellGroupReportForArray);
    const volts = list(report.millivoltsLookup), temps = list(report.temperatureLookup), times = list(report.timeStampLookup);
    if (!volts.length || !temps.length || !times.length) {
      issue(`Array ${array2}: indexed lookup tables unavailable`);
      continue;
    }
    for (const [stringKey, rawString] of Object.entries(object(report.condensedCellReportForString))) {
      const s = object(rawString), string = positiveInt(stringKey, 256);
      const bpcCount = positiveInt(s.batteryPackCount, 64), groupsPerBpc = positiveInt(s.cellGroupPerBatteryPackCount, 128);
      if (!string || !bpcCount || !groupsPerBpc) continue;
      if (finiteNumber(s.stringIndex) !== string) {
        issue(`Array ${array2} string ${string}: identity mismatch`);
        continue;
      }
      const n = bpcCount * groupsPerBpc;
      if ((total += n) > 25e4) throw new Error("Cell report exceeds supported channel limit");
      const mv = list(s.millivolts), temp = list(s.temperatures), ts = list(s.timestamps);
      if ([mv, temp, ts].some((v) => v.length !== n)) issue(`Array ${array2} string ${string}: incomplete channel coverage`);
      const ignored = /* @__PURE__ */ new Set();
      let validIgnoreList = Array.isArray(s.ignoredTempSensors);
      for (const rawIgnored of list(s.ignoredTempSensors)) {
        const entry = object(rawIgnored), b = positiveInt(entry.batteryPackIndex, bpcCount), c = positiveInt(entry.cellGroupIndex, groupsPerBpc);
        if (!b || !c) validIgnoreList = false;
        else ignored.add((b - 1) * groupsPerBpc + c - 1);
      }
      if (!validIgnoreList) issue(`Array ${array2} string ${string}: unknown ignored-sensor encoding; temperatures withheld`);
      const row = { array: array2, string, bpcCount, groupsPerBpc, observedAt: [], millivolts: [], temperatureF: [], ignoredTemperatures: [...ignored] };
      for (let i = 0; i < n; i++) {
        const v = lookup(mv, volts, i), t = lookup(temp, temps, i), time = lookup(ts, times, i);
        row.millivolts.push(v !== null && v >= 0 && v < 1e4 ? v : null);
        row.temperatureF.push(validIgnoreList && !ignored.has(i) && t !== null ? Math.round((t / 10 * 1.8 + 32) * 100) / 100 : null);
        row.observedAt.push(time !== null && Number.isSafeInteger(time) && time > 0 ? time : null);
      }
      const entries = object(object(rawArray).stringReport);
      row.operating = cellOperatingContext(entries[String(string)] ?? entries[`string${string}`]);
      frame.strings.push(row);
      await (0, import_promises3.setImmediate)();
    }
  }
  if (!frame.strings.length) throw new Error("No verified indexed cell-group data in this report");
  return frame;
}

// src/server/cells/cellHistoryRoutes.ts
var import_express = require("express");
function metric(v) {
  if (v === "temperatureF" || v === "millivolts") return v;
  throw new Error("Invalid cell metric");
}
function array(v) {
  if (v === void 0) return void 0;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 64) throw new Error("Invalid array");
  return n;
}
function createCellHistoryRouter(cellHistory, health) {
  const router = (0, import_express.Router)();
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  router.get("/health", async (req, res) => {
    if (Object.keys(req.query).length) {
      res.status(400).json({ error: "No query parameters supported" });
      return;
    }
    if (!health) {
      res.status(503).json({ error: "Cell-health monitoring unavailable" });
      return;
    }
    try {
      res.json(await health.status());
    } catch {
      res.status(503).json({ error: "Cell-health status unavailable; retry after site selection settles" });
    }
  });
  router.get("/health/incident/:id", async (req, res) => {
    if (Object.keys(req.query).length) {
      res.status(400).json({ error: "No query parameters supported" });
      return;
    }
    try {
      if (!health) throw new Error("Unavailable");
      res.json(await health.incident(String(req.params.id)));
    } catch {
      res.status(404).json({ error: "Cell-health incident unavailable for this site" });
    }
  });
  router.get("/", (req, res) => {
    try {
      res.json(cellHistory.view(metric(req.query.metric ?? "millivolts"), Date.now(), array(req.query.array)));
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Cell view unavailable" });
    }
  });
  router.get("/history", async (req, res) => {
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    try {
      res.json(await cellHistory.query({
        from: Number(req.query.from),
        to: Number(req.query.to),
        metric: metric(req.query.metric),
        ids: String(req.query.ids ?? "").split(",").filter(Boolean),
        array: array(req.query.array)
      }, controller.signal));
    } catch (error) {
      if (!res.destroyed) res.status(400).json({ error: error instanceof Error ? error.message : "Cell history unavailable" });
    }
  });
  router.get("/index", async (req, res) => {
    try {
      if (Object.keys(req.query).some((key) => !["from", "to", "after", "limit"].includes(key)) || Object.values(req.query).some((v) => typeof v !== "string" || !/^\d+$/.test(v))) throw new Error("Invalid snapshot index query");
      const input = Object.fromEntries(Object.entries(req.query).map(([k, v]) => [k, Number(v)]));
      res.json(await cellHistory.index(input));
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Snapshot list unavailable" });
    }
  });
  router.get("/snapshot", async (req, res) => {
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    try {
      const selectedArray = array(req.query.array);
      if (selectedArray === void 0) throw new Error("Select an array");
      res.json(await cellHistory.snapshot({
        array: selectedArray,
        metric: metric(req.query.metric ?? "millivolts"),
        at: req.query.at === void 0 ? void 0 : Number(req.query.at)
      }, controller.signal));
    } catch (error) {
      if (!res.destroyed) res.status(400).json({ error: error instanceof Error ? error.message : "Cell snapshot unavailable" });
    }
  });
  return router;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CellHealthMonitor,
  createCellHistoryRouter,
  decodeCellReport
});
