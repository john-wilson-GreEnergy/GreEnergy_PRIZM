var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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

// src/server/cells/cellHistoryWorker.ts
var import_node_worker_threads2 = require("node:worker_threads");

// src/server/cells/CellHistory.ts
var import_promises2 = __toESM(require("node:fs/promises"), 1);
var import_node_path2 = __toESM(require("node:path"), 1);
var import_node_crypto = require("node:crypto");
var import_node_zlib = require("node:zlib");
var import_node_util = require("node:util");
var import_promises3 = require("node:timers/promises");

// src/server/cells/CellQueryWorkerClient.ts
var import_node_worker_threads = require("node:worker_threads");
var import_node_path = __toESM(require("node:path"), 1);
var CellQueryWorkerClient = class {
  constructor(file = import_node_path.default.resolve(process.cwd(), "dist/cell-history-worker.cjs")) {
    this.file = file;
    this.worker = null;
    this.cancel = null;
  }
  run(directory, site, intervalMs, input, signal) {
    signal?.throwIfAborted();
    if (this.cancel) return Promise.reject(new Error("Cell history reader is busy"));
    if (!this.worker) {
      const created = new import_node_worker_threads.Worker(this.file, { resourceLimits: { maxOldGenerationSizeMb: 256 } });
      this.worker = created;
      const forget = () => {
        if (this.worker === created) this.worker = null;
      };
      created.on("error", forget);
      created.on("exit", forget);
    }
    const worker = this.worker;
    worker.ref();
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, result, discard = false) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", aborted);
        worker.removeListener("message", message);
        worker.removeListener("error", failed);
        worker.removeListener("exit", exited);
        this.cancel = null;
        if (discard) {
          this.worker = null;
          void worker.terminate();
        } else worker.unref();
        if (error) reject(error);
        else resolve(result);
      };
      const aborted = () => finish(new Error("Cell history request cancelled"), void 0, true);
      const failed = (error) => finish(error, void 0, true);
      const exited = () => failed(new Error("Cell history reader stopped; retry the request"));
      const message = (reply) => {
        if (reply.error || !reply.result) finish(new Error(reply.error || "Invalid cell history response"));
        else finish(void 0, reply.result);
      };
      const timer = setTimeout(() => finish(new Error("Cell history reader timed out; select a shorter window"), void 0, true), 35e3);
      this.cancel = aborted;
      worker.once("message", message);
      worker.once("error", failed);
      worker.once("exit", exited);
      signal?.addEventListener("abort", aborted, { once: true });
      worker.postMessage({ directory, site, intervalMs, input });
    });
  }
  async close() {
    const worker = this.worker;
    this.cancel?.();
    this.worker = null;
    if (worker) await worker.terminate();
  }
};

// src/server/cells/decodeCellReport.ts
var import_promises = require("node:timers/promises");
var object = (v) => v !== null && typeof v === "object" && !Array.isArray(v) ? v : {};
var list = (v) => Array.isArray(v) ? v : [];
function finiteNumber(v) {
  if (typeof v !== "number" && (typeof v !== "string" || !/^-?\d+(\.\d+)?$/.test(v))) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
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
    const array = positiveInt(arrayKey, 64);
    if (array === null) continue;
    const report = object(object(rawArray).cellGroupReportForArray);
    const volts = list(report.millivoltsLookup), temps = list(report.temperatureLookup), times = list(report.timeStampLookup);
    if (!volts.length || !temps.length || !times.length) {
      issue(`Array ${array}: indexed lookup tables unavailable`);
      continue;
    }
    for (const [stringKey, rawString] of Object.entries(object(report.condensedCellReportForString))) {
      const s = object(rawString), string = positiveInt(stringKey, 256);
      const bpcCount = positiveInt(s.batteryPackCount, 64), groupsPerBpc = positiveInt(s.cellGroupPerBatteryPackCount, 128);
      if (!string || !bpcCount || !groupsPerBpc) continue;
      if (finiteNumber(s.stringIndex) !== string) {
        issue(`Array ${array} string ${string}: identity mismatch`);
        continue;
      }
      const n = bpcCount * groupsPerBpc;
      if ((total += n) > 25e4) throw new Error("Cell report exceeds supported channel limit");
      const mv = list(s.millivolts), temp = list(s.temperatures), ts = list(s.timestamps);
      if ([mv, temp, ts].some((v) => v.length !== n)) issue(`Array ${array} string ${string}: incomplete channel coverage`);
      const ignored = /* @__PURE__ */ new Set();
      let validIgnoreList = Array.isArray(s.ignoredTempSensors);
      for (const rawIgnored of list(s.ignoredTempSensors)) {
        const entry = object(rawIgnored), b = positiveInt(entry.batteryPackIndex, bpcCount), c = positiveInt(entry.cellGroupIndex, groupsPerBpc);
        if (!b || !c) validIgnoreList = false;
        else ignored.add((b - 1) * groupsPerBpc + c - 1);
      }
      if (!validIgnoreList) issue(`Array ${array} string ${string}: unknown ignored-sensor encoding; temperatures withheld`);
      const row = { array, string, bpcCount, groupsPerBpc, observedAt: [], millivolts: [], temperatureF: [], ignoredTemperatures: [...ignored] };
      for (let i = 0; i < n; i++) {
        const v = lookup(mv, volts, i), t = lookup(temp, temps, i), time = lookup(ts, times, i);
        row.millivolts.push(v !== null && v >= 0 && v < 1e4 ? v : null);
        row.temperatureF.push(validIgnoreList && !ignored.has(i) && t !== null ? Math.round((t / 10 * 1.8 + 32) * 100) / 100 : null);
        row.observedAt.push(time !== null && Number.isSafeInteger(time) && time > 0 ? time : null);
      }
      frame.strings.push(row);
      await (0, import_promises.setImmediate)();
    }
  }
  if (!frame.strings.length) throw new Error("No verified indexed cell-group data in this report");
  return frame;
}

// src/server/cells/cellProjection.ts
var CELL_FRESH_MS = 12e4;
function cellId(row, i) {
  return `A${row.array}-S${row.string}-B${Math.floor(i / row.groupsPerBpc) + 1}-C${i % row.groupsPerBpc + 1}`;
}
function emptyStatistics() {
  return { total: 0, valid: 0, missing: 0, stale: 0, ignored: 0, min: null, average: null, max: null };
}
function freshCell(time, now) {
  return time !== null && time <= now + 5e3 && time >= now - CELL_FRESH_MS;
}
function projectCells(frame, metric, now, array, includeOutliers = true) {
  const summary = emptyStatistics(), arrays = /* @__PURE__ */ new Map();
  const highest = [], lowest = [];
  for (const row of frame?.strings ?? []) {
    if (array && row.array !== array) continue;
    const stats = arrays.get(row.array) ?? emptyStatistics();
    arrays.set(row.array, stats);
    const ignored = new Set(row.ignoredTemperatures);
    for (let i = 0; i < row.observedAt.length; i++) {
      const v = row[metric][i], ts = row.observedAt[i];
      for (const s of [summary, stats]) {
        s.total++;
        if (metric === "temperatureF" && ignored.has(i)) s.ignored++;
        else if (v === null || ts === null || ts > now + 5e3) s.missing++;
        else if (!freshCell(ts, now)) s.stale++;
        else {
          s.valid++;
          s.average = (s.average ?? 0) + v;
          s.min = s.min === null ? v : Math.min(s.min, v);
          s.max = s.max === null ? v : Math.max(s.max, v);
        }
      }
      if (includeOutliers && v !== null && freshCell(ts, now) && !(metric === "temperatureF" && ignored.has(i))) {
        if (highest.length < 12 || v > highest[highest.length - 1].value) {
          highest.push({ id: cellId(row, i), value: v, observedAt: ts });
          highest.sort((a, b) => b.value - a.value);
          highest.length = Math.min(12, highest.length);
        }
        if (lowest.length < 12 || v < lowest[lowest.length - 1].value) {
          lowest.push({ id: cellId(row, i), value: v, observedAt: ts });
          lowest.sort((a, b) => a.value - b.value);
          lowest.length = Math.min(12, lowest.length);
        }
      }
    }
  }
  for (const s of [summary, ...arrays.values()]) s.average = s.valid ? s.average / s.valid : null;
  return { summary, arrays: [...arrays].sort(([a], [b]) => a - b).map(([array2, statistics]) => ({ array: array2, statistics })), highest, lowest };
}
function historyPoint(frame, metric, ids, array) {
  const projection = projectCells(frame, metric, frame.acquiredAt, array, false), stats = projection.summary;
  const values = {}, sourceTimes = {};
  for (const id of ids) {
    const match = /^A(\d+)-S(\d+)-B(\d+)-C(\d+)$/.exec(id);
    const [, a, s, b, c] = match.map(Number);
    const row = frame.strings.find((row2) => row2.array === a && row2.string === s);
    const i = row ? (b - 1) * row.groupsPerBpc + c - 1 : -1;
    const inRange = row && b >= 1 && b <= row.bpcCount && c >= 1 && c <= row.groupsPerBpc;
    const time = inRange ? row.observedAt[i] : null;
    values[id] = inRange && freshCell(time, frame.acquiredAt) && !(metric === "temperatureF" && row.ignoredTemperatures.includes(i)) ? row[metric][i] : null;
    sourceTimes[id] = time;
  }
  return { at: frame.acquiredAt, min: stats.min, average: stats.average, max: stats.max, valid: stats.valid, total: stats.total, values, sourceTimes, arrays: projection.arrays };
}
function arrayCellSnapshot(frame, metric, array, now, historical) {
  const rows = frame.strings.filter((row) => row.array === array).sort((a, b) => a.string - b.string);
  if (!rows.length) throw new Error("No cell channels reported for this array in this snapshot");
  return {
    array,
    metric,
    acquiredAt: frame.acquiredAt,
    historical,
    statistics: projectCells(frame, metric, now, array).summary,
    strings: rows.map((row) => {
      const ignored = new Set(row.ignoredTemperatures);
      return {
        string: row.string,
        bpcCount: row.bpcCount,
        groupsPerBpc: row.groupsPerBpc,
        statistics: projectCells({ ...frame, strings: [row] }, metric, now).summary,
        cells: row.observedAt.map((observedAt, i) => {
          const quality = metric === "temperatureF" && ignored.has(i) ? "ignored" : row[metric][i] === null || observedAt === null || observedAt > now + 5e3 ? "missing" : freshCell(observedAt, now) ? "fresh" : "stale";
          return {
            bpc: Math.floor(i / row.groupsPerBpc) + 1,
            group: i % row.groupsPerBpc + 1,
            observedAt,
            quality,
            value: quality === "fresh" ? row[metric][i] : null
          };
        })
      };
    })
  };
}

// src/server/cells/snapshotIndex.ts
function validateSnapshotIndexQuery(input) {
  for (const key of ["from", "to", "after"]) {
    const value = input[key];
    if (value !== void 0 && (!Number.isSafeInteger(value) || value < 0)) throw new Error("Invalid snapshot timestamp");
  }
  if (input.from !== void 0 && input.to !== void 0 && input.from > input.to) throw new Error("Invalid snapshot range");
  const limit = input.limit ?? 500;
  if (!Number.isInteger(limit) || limit < 1 || limit > 1e3) throw new Error("Choose a snapshot page size from 1 to 1000");
  return { ...input, limit };
}
function selectSnapshotIndex(timestamps, site, input) {
  const q = validateSnapshotIndexQuery(input);
  const all = [...new Set(timestamps)].sort((a, b) => a - b).filter((at) => (q.from === void 0 || at >= q.from) && (q.to === void 0 || at <= q.to));
  const remaining = all.filter((at) => q.after === void 0 || at > q.after);
  const page = remaining.slice(0, q.limit);
  return { site, timestamps: page, total: all.length, oldestAt: all[0] ?? null, newestAt: all.at(-1) ?? null, nextAfter: remaining.length > page.length ? page.at(-1) : null, sampled: false };
}

// src/server/cells/CellHistory.ts
var compress = (0, import_node_util.promisify)(import_node_zlib.gzip);
var decompress = (0, import_node_util.promisify)(import_node_zlib.gunzip);
var DAY = 864e5;
var FRAME_LIMIT = 16 * 1024 * 1024;
var siteKey = (site) => (0, import_node_crypto.createHash)("sha256").update(JSON.stringify([site.stationCode, site.blockIndex, site.emsBaseUrl])).digest("hex");
function validateStoredFrame(frame) {
  let count = 0;
  const ids = /* @__PURE__ */ new Set();
  for (const row of frame.strings) {
    const n = row.bpcCount * row.groupsPerBpc, id = `${row.array}:${row.string}`;
    if (![row.array, row.string, row.bpcCount, row.groupsPerBpc].every((v) => Number.isInteger(v) && v > 0) || row.array > 64 || row.string > 256 || row.bpcCount > 64 || row.groupsPerBpc > 128 || ids.has(id) || (count += n) > 25e4 || ![row.millivolts, row.temperatureF, row.observedAt].every((values) => Array.isArray(values) && values.length === n && values.every((v) => v === null || typeof v === "number" && Number.isFinite(v))) || !Array.isArray(row.ignoredTemperatures) || row.ignoredTemperatures.some((i) => !Number.isInteger(i) || i < 0 || i >= n)) throw new Error("Invalid stored cell columns");
    ids.add(id);
  }
}
var CellHistory = class {
  constructor(options) {
    this.options = options;
    this.latest = null;
    this.scope = null;
    this.active = null;
    this.stopped = false;
    this.lastAttempt = -Infinity;
    this.lastSignature = "";
    this.querying = false;
    this.snapshotReading = false;
    this.queryFinished = Promise.resolve();
    this.waitingQuery = false;
    this.generation = 0;
    this.reader = null;
    this.pointCache = /* @__PURE__ */ new Map();
    this.counters = { saved: 0, dropped: 0, failures: 0, lastError: null, lastSavedAt: null };
    this.intervalMs = Math.max(6e4, options.intervalMs ?? 6e4);
    this.retentionDays = Math.min(30, Math.max(1, options.retentionDays ?? 7));
    this.maxBytes = Math.max(1024 * 1024, options.maxBytes ?? 8 * 1024 ** 3);
  }
  selectSite(site) {
    if ((this.scope ? siteKey(this.scope) : null) === (site ? siteKey(site) : null)) return;
    this.generation++;
    this.scope = site ? { ...site } : null;
    this.latest = null;
    this.pointCache.clear();
    this.lastAttempt = -Infinity;
    this.lastSignature = "";
    this.counters.lastSavedAt = null;
  }
  synchronizeSite() {
    if (this.options.currentSite) this.selectSite(this.options.currentSite());
  }
  /** Called only with an already acquired EMS report and its captured connection identity. */
  offer(raw, site, acquiredAt, stillCurrent = () => true) {
    if (!this.options.enabled || this.stopped) return;
    this.synchronizeSite();
    if (this.options.currentSite && (!this.scope || siteKey(site) !== siteKey(this.scope))) return;
    this.selectSite(site);
    if (this.active) {
      this.counters.dropped++;
      return;
    }
    if (acquiredAt >= this.lastAttempt && acquiredAt - this.lastAttempt < this.intervalMs) return;
    this.lastAttempt = acquiredAt;
    const key = siteKey(site), generation = this.generation;
    this.active = (async () => {
      const frame = await decodeCellReport(raw, site, acquiredAt);
      this.synchronizeSite();
      if (!stillCurrent() || generation !== this.generation || this.stopped) return;
      const incoming = new Set(frame.strings.map((row) => `${row.array}:${row.string}`));
      for (const previous of this.latest?.strings ?? []) {
        if (incoming.has(`${previous.array}:${previous.string}`)) continue;
        const n = previous.bpcCount * previous.groupsPerBpc;
        frame.strings.push({ ...previous, observedAt: Array(n).fill(null), millivolts: Array(n).fill(null), temperatureF: Array(n).fill(null), ignoredTemperatures: [] });
        if (frame.issues.length < 32) frame.issues.push(`Array ${previous.array} string ${previous.string}: missing from current report`);
      }
      validateStoredFrame(frame);
      this.latest = frame;
      const body = JSON.stringify(frame.strings);
      const signature = (0, import_node_crypto.createHash)("sha256").update(body).digest("hex");
      if (signature === this.lastSignature) return;
      const encoded = JSON.stringify(frame);
      if (Buffer.byteLength(encoded) > FRAME_LIMIT) throw new Error("Canonical cell frame exceeds storage limit");
      const compressed = await compress(encoded, { level: 1 });
      const directory = import_node_path2.default.join(this.options.directory, key);
      await import_promises2.default.mkdir(directory, { recursive: true, mode: 448 });
      await this.prune(acquiredAt, compressed.length);
      const capacity = await import_promises2.default.statfs(directory);
      if (capacity.bavail * capacity.bsize < (this.options.reserveBytes ?? 2 * 1024 ** 3) + compressed.length) throw new Error("Cell recorder paused: disk reserve reached");
      this.synchronizeSite();
      if (!stillCurrent() || generation !== this.generation || this.stopped) return;
      const filename = import_node_path2.default.join(directory, `${acquiredAt}.cells.json.gz`);
      const temporary = `${filename}.tmp`;
      try {
        await import_promises2.default.writeFile(temporary, compressed, { flag: "wx", mode: 384 });
        await import_promises2.default.rename(temporary, filename);
      } finally {
        await import_promises2.default.unlink(temporary).catch(() => {
        });
      }
      this.lastSignature = signature;
      this.counters.saved++;
      this.counters.lastSavedAt = acquiredAt;
      this.counters.lastError = null;
    })().catch((error) => {
      this.counters.failures++;
      this.counters.lastError = error instanceof Error ? error.message : "Cell recorder failed";
    }).finally(() => {
      this.active = null;
    });
  }
  async files() {
    const files = [];
    const directories = await import_promises2.default.readdir(this.options.directory, { withFileTypes: true }).catch((error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    for (const directory of directories) {
      if (!directory.isDirectory() || !/^[a-f0-9]{64}$/.test(directory.name)) continue;
      for (const entry of await import_promises2.default.readdir(import_node_path2.default.join(this.options.directory, directory.name), { withFileTypes: true })) {
        if (entry.isFile() && /^\d{13}\.cells\.json\.gz\.tmp$/.test(entry.name)) {
          const temporary = import_node_path2.default.join(this.options.directory, directory.name, entry.name);
          if ((await import_promises2.default.stat(temporary)).mtimeMs < Date.now() - 3e5) await import_promises2.default.unlink(temporary);
          continue;
        }
        const match = /^(\d{13})\.cells\.json\.gz$/.exec(entry.name);
        if (!entry.isFile() || !match) continue;
        const file = import_node_path2.default.join(this.options.directory, directory.name, entry.name), stat = await import_promises2.default.stat(file);
        files.push({ file, at: Number(match[1]), bytes: stat.size });
      }
    }
    return files.sort((a, b) => a.at - b.at);
  }
  async prune(now, incoming) {
    const files = await this.files();
    let bytes = files.reduce((sum, file) => sum + file.bytes, 0);
    for (const file of files) {
      if (file.at >= now - this.retentionDays * DAY && bytes + incoming <= this.maxBytes) break;
      await import_promises2.default.unlink(file.file);
      bytes -= file.bytes;
    }
    if (bytes + incoming > this.maxBytes) throw new Error("Cell frame cannot fit within configured disk cap");
  }
  view(metric, now = Date.now(), array) {
    this.synchronizeSite();
    return {
      site: this.scope ? `${this.scope.stationCode} / Block ${this.scope.blockIndex}` : null,
      acquiredAt: this.latest?.acquiredAt ?? null,
      metric,
      ...projectCells(this.latest, metric, now, array),
      targets: (this.latest?.strings ?? []).map(({ array: array2, string, bpcCount, groupsPerBpc }) => ({ array: array2, string, bpcCount, groupsPerBpc })),
      issues: this.latest?.issues ?? [],
      storage: { enabled: this.options.enabled, intervalMs: this.intervalMs, retentionDays: this.retentionDays, maxBytes: this.maxBytes, ...this.counters }
    };
  }
  async index(input = {}) {
    validateSnapshotIndexQuery(input);
    this.synchronizeSite();
    const scope = this.scope ? { ...this.scope } : null, generation = this.generation;
    const label = scope ? `${scope.stationCode} / Block ${scope.blockIndex}` : null;
    if (!scope || !this.options.enabled || this.stopped) return selectSnapshotIndex([], label, input);
    const entries = await import_promises2.default.readdir(import_node_path2.default.join(this.options.directory, siteKey(scope)), { withFileTypes: true }).catch((error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    this.synchronizeSite();
    if (generation !== this.generation) throw new Error("Active site changed; reload snapshot list");
    const timestamps = entries.filter((e) => e.isFile() && /^\d{13}\.cells\.json\.gz$/.test(e.name)).map((e) => Number(e.name.split(".")[0]));
    return selectSnapshotIndex(timestamps, label, input);
  }
  async snapshot(input, signal) {
    this.synchronizeSite();
    signal?.throwIfAborted();
    const { array, metric, at } = input;
    if (!Number.isInteger(array) || array < 1 || array > 64 || !["millivolts", "temperatureF"].includes(metric) || at !== void 0 && (!Number.isSafeInteger(at) || !/^\d{13}$/.test(String(at)))) throw new Error("Invalid array snapshot selection");
    if (!this.options.enabled || !this.scope) throw new Error("Cell recording is not enabled or no site is available");
    if (at === void 0) {
      if (!this.latest) throw new Error("No cell snapshot recorded yet");
      return arrayCellSnapshot(this.latest, metric, array, Date.now(), false);
    }
    if (this.snapshotReading) throw new Error("Another cell snapshot is loading; try again shortly");
    this.snapshotReading = true;
    const generation = this.generation, key = siteKey(this.scope);
    try {
      const file = import_node_path2.default.join(this.options.directory, key, `${at}.cells.json.gz`);
      if ((await import_promises2.default.lstat(file)).isSymbolicLink() || (await import_promises2.default.stat(file)).size > FRAME_LIMIT) throw new Error("Invalid frame file");
      const frame = JSON.parse((await decompress(await import_promises2.default.readFile(file), { maxOutputLength: FRAME_LIMIT })).toString());
      this.synchronizeSite();
      signal?.throwIfAborted();
      if (generation !== this.generation) throw new Error("Active site changed; reload snapshot");
      if (frame.schema !== 1 || siteKey(frame.site) !== key || frame.acquiredAt !== at || !Array.isArray(frame.strings)) throw new Error("Invalid frame identity");
      validateStoredFrame(frame);
      return arrayCellSnapshot(frame, metric, array, at, true);
    } catch (error) {
      if (error.code === "ENOENT") throw new Error("Recorded snapshot is unavailable or has expired");
      throw error;
    } finally {
      this.snapshotReading = false;
    }
  }
  async query(input, signal) {
    const started = performance.now();
    signal?.throwIfAborted();
    this.synchronizeSite();
    const { from, to, metric, ids, array } = input;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from || to - from > 7 * DAY || !["millivolts", "temperatureF"].includes(metric) || ids.length > 8 || new Set(ids).size !== ids.length || ids.some((id) => !/^A[1-9]\d{0,2}-S[1-9]\d{0,2}-B[1-9]\d?-C[1-9]\d{0,2}$/.test(id)) || array !== void 0 && (!Number.isInteger(array) || array < 1 || array > 64)) throw new Error("Select a valid window up to seven days and at most eight cell groups");
    if (this.querying) {
      const beforeWait = this.generation;
      if (this.waitingQuery) throw new Error("Another cell history query is running; try again shortly");
      this.waitingQuery = true;
      try {
        await this.queryFinished;
      } finally {
        this.waitingQuery = false;
      }
      signal?.throwIfAborted();
      this.synchronizeSite();
      if (beforeWait !== this.generation) throw new Error("Active site changed; reload history");
    }
    const result = { points: [], matchedFrames: 0, sampledFrames: 0, unreadableFrames: 0, intervalMs: this.intervalMs, sampled: false };
    if (!this.scope || !this.options.enabled || this.stopped) return result;
    this.querying = true;
    let finish;
    this.queryFinished = new Promise((resolve) => {
      finish = resolve;
    });
    const scope = { ...this.scope }, key = siteKey(scope), generation = this.generation;
    try {
      if (this.options.workerQueries) {
        this.reader ??= new CellQueryWorkerClient(this.options.workerFile);
        const output = await this.reader.run(this.options.directory, scope, this.intervalMs, input, signal);
        this.synchronizeSite();
        signal?.throwIfAborted();
        if (this.stopped || generation !== this.generation) throw new Error("Active site changed or history reader stopped; reload history");
        return output;
      }
      result.diagnostics = { elapsedMs: 0, framesRead: 0, cacheHits: 0 };
      const directory = import_node_path2.default.join(this.options.directory, key);
      const names = await import_promises2.default.readdir(directory).catch((error) => {
        if (error.code === "ENOENT") return [];
        throw error;
      });
      const frames = names.filter((name) => /^\d{13}\.cells\.json\.gz$/.test(name)).map((name) => ({ name, at: Number(name.split(".")[0]) })).filter((frame) => frame.at >= from && frame.at <= to).sort((a, b) => a.at - b.at);
      result.matchedFrames = frames.length;
      const selected = frames.length <= 180 ? frames : Array.from({ length: 180 }, (_, i) => frames[Math.round(i * (frames.length - 1) / 179)]);
      result.sampled = selected.length < frames.length;
      const nominalStep = Math.max(this.intervalMs, selected.length > 1 ? (selected[selected.length - 1].at - selected[0].at) / (selected.length - 1) : this.intervalMs);
      result.intervalMs = Math.round(nominalStep);
      const deadline = performance.now() + 3e4;
      for (const entry of selected) {
        signal?.throwIfAborted();
        if (performance.now() > deadline) throw new Error("History query exceeded its time budget; select a shorter window");
        this.synchronizeSite();
        if (generation !== this.generation) throw new Error("Active site changed; reload history");
        try {
          const file = import_node_path2.default.join(directory, entry.name);
          const stat = await import_promises2.default.lstat(file);
          if (!stat.isFile() || stat.isSymbolicLink() || stat.size > FRAME_LIMIT) throw new Error("Invalid frame file");
          const cacheKey = JSON.stringify([key, entry.at, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs, metric, array, ids]);
          let point = this.options.cacheQueries ? this.pointCache.get(cacheKey) : void 0;
          if (point) {
            result.diagnostics.cacheHits++;
            this.pointCache.delete(cacheKey);
            this.pointCache.set(cacheKey, point);
          } else {
            const frame = JSON.parse((await decompress(await import_promises2.default.readFile(file), { maxOutputLength: FRAME_LIMIT })).toString());
            if (frame.schema !== 1 || siteKey(frame.site) !== key || frame.acquiredAt !== entry.at || !Array.isArray(frame.strings)) throw new Error("Invalid frame identity");
            validateStoredFrame(frame);
            point = historyPoint(frame, metric, ids, array);
            result.diagnostics.framesRead++;
            if (this.options.cacheQueries) {
              this.pointCache.set(cacheKey, point);
              if (this.pointCache.size > 2048) this.pointCache.delete(this.pointCache.keys().next().value);
            }
          }
          const previous = result.points.at(-1);
          if (previous && point.at - previous.at > nominalStep * 2.5) result.points.push({ at: previous.at + nominalStep, min: null, average: null, max: null, valid: 0, total: 0, values: Object.fromEntries(ids.map((id) => [id, null])), sourceTimes: {}, arrays: [] });
          result.points.push(point);
          result.sampledFrames++;
        } catch {
          result.unreadableFrames++;
          result.points.push({ at: entry.at, min: null, average: null, max: null, valid: 0, total: 0, values: Object.fromEntries(ids.map((id) => [id, null])), sourceTimes: {}, arrays: [] });
        }
        await (0, import_promises3.setImmediate)();
      }
      this.synchronizeSite();
      if (generation !== this.generation) throw new Error("Active site changed; reload history");
      result.diagnostics.elapsedMs = Math.round(performance.now() - started);
      return result;
    } finally {
      this.querying = false;
      finish();
    }
  }
  async drain() {
    await this.active;
  }
  async close() {
    this.stopped = true;
    await this.reader?.close();
    this.pointCache.clear();
    await this.drain();
  }
};

// src/server/cells/cellHistoryWorker.ts
var reader;
var identity = "";
import_node_worker_threads2.parentPort.on("message", async (request) => {
  try {
    const key = JSON.stringify([request.directory, request.site, request.intervalMs]);
    if (key !== identity) {
      await reader?.close();
      identity = key;
      reader = new CellHistory({
        directory: request.directory,
        enabled: true,
        intervalMs: request.intervalMs,
        currentSite: () => request.site,
        cacheQueries: true
      });
    }
    import_node_worker_threads2.parentPort.postMessage({ result: await reader.query(request.input) });
  } catch (error) {
    import_node_worker_threads2.parentPort.postMessage({ error: error instanceof Error ? error.message : "Cell history reader failed" });
  }
});
//# sourceMappingURL=cell-history-worker.cjs.map
