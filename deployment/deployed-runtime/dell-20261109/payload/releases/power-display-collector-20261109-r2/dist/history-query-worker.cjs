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

// src/server/thermal/historyQueryWorker.ts
var import_node_worker_threads = require("node:worker_threads");

// src/server/thermal/historyQueryProjection.ts
var import_node_path = __toESM(require("node:path"), 1);
var import_node_crypto = require("node:crypto");

// src/server/thermal/thermalMetrics.ts
var thermalMetrics = {
  space: { label: "Enclosure temperature", unit: "\xB0F", min: 14, max: 104 },
  supply: { label: "Supply-air temperature", unit: "\xB0F", min: 14, max: 104 },
  cell: { label: "Average cell temperature", unit: "\xB0F", min: 14, max: 104 },
  control: { label: "Control temperature", unit: "\xB0F", min: 14, max: 104 },
  outside: { label: "Outside temperature", unit: "\xB0F", min: 14, max: 104 },
  current: { label: "HVAC amperage", unit: "A", min: 0, max: 20 },
  rpm: { label: "Fan speed", unit: "RPM", min: 0, max: 3e3 },
  cooling: { label: "Cooling setpoint", unit: "\xB0F", min: 14, max: 104 },
  heating: { label: "Heating setpoint", unit: "\xB0F", min: 14, max: 104 },
  humidity: { label: "Enclosure humidity", unit: "%", min: 0, max: 100 },
  cellRate: { label: "Cell temperature rate", unit: "\xB0F/min", min: -1.8, max: 1.8 }
};
function thermalDisplayValues(point) {
  return Object.fromEntries(Object.entries(thermalMetrics).map(([key, definition]) => {
    const raw = point.segmentType === "CS" && (key === "cell" || key === "cellRate") ? null : point[key];
    const value = typeof raw !== "number" || !Number.isFinite(raw) ? null : definition.unit === "\xB0F" ? raw * 9 / 5 + 32 : definition.unit === "\xB0F/min" ? raw * 9 / 5 : raw;
    return [key, value];
  }));
}

// src/server/thermal/historyReview.ts
function matchesHistory(point, metric, f) {
  if (f.from !== void 0 && point.at < f.from || f.to !== void 0 && point.at > f.to) return false;
  if (f.mode && f.mode !== "all" && point.mode !== f.mode || f.quality && f.quality !== "all" && point.quality !== f.quality) return false;
  if (f.faults === "with" && !point.faults?.length || f.faults === "without" && (!point.faults || point.faults.length > 0)) return false;
  if (f.minimum !== void 0 || f.maximum !== void 0) {
    const n = thermalDisplayValues(point)[metric];
    if (point.quality !== "Live" || n === null || f.minimum !== void 0 && n < f.minimum || f.maximum !== void 0 && n > f.maximum) return false;
  }
  return true;
}

// src/server/thermal/thermalReviewPresentation.ts
function reviewReading(point, metric, excluded = false) {
  const value = thermalDisplayValues(point)[metric];
  const applicable = !(point.segmentType === "CS" && (metric === "cell" || metric === "cellRate"));
  const status = excluded ? "Filtered" : !applicable ? "N/A \u2014 no cells" : point.quality !== "Live" ? point.quality : value === null ? "Not reported" : "Observed";
  const c = point.commands;
  const command = excluded || point.quality !== "Live" || !c ? "Unknown" : c.electricHeat === true ? "Heating" : c.compressor === true ? c.reversingValve === true ? "Heating" : c.reversingValve === false ? "Cooling" : "Unknown" : c.compressor === false && c.electricHeat === false ? "Idle" : "Unknown";
  const bit = (value2) => value2 === true ? "On" : value2 === false ? "Off" : "Unknown";
  return {
    valueText: status === "Observed" ? `${value.toFixed(metric === "cellRate" ? 2 : 1)} ${thermalMetrics[metric].unit}` : "\u2014",
    status,
    validUntil: point.at + 12e4,
    command,
    commandText: excluded ? "Filtered observation" : point.quality !== "Live" ? `${point.quality} command telemetry` : `Compressor ${bit(c?.compressor)} \xB7 Electric heat ${bit(c?.electricHeat)} \xB7 Reversing valve ${bit(c?.reversingValve)} \xB7 Fan low ${bit(c?.fanLow)} \xB7 Fan high ${bit(c?.fanHigh)}`
  };
}

// src/server/thermal/thermalModel.ts
function thermalSegmentType(label, declared) {
  if (declared === "CS" || declared === "ES") return declared;
  if (/\bCS(?:\s*\d+)?\b|\bCollection\s+Segment\b/i.test(label)) return "CS";
  if (/\bES(?:\s*\d+)?\b|\bEnergy\s+Segment\b/i.test(label)) return "ES";
  return "UNKNOWN";
}
function applicableThermalPoint(point, segmentType = point.segmentType) {
  return segmentType === "CS" ? { ...point, segmentType, cell: null, cellRate: null } : { ...point, segmentType };
}

// src/server/thermal/historyIo.ts
var import_node_fs = require("node:fs");
var fs = __toESM(require("node:fs/promises"), 1);
var import_node_readline = require("node:readline");
async function* readSiteSamples(file) {
  const stat = await fs.lstat(file).catch((e) => {
    if (e.code === "ENOENT") return null;
    throw e;
  });
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) return;
  const input = (0, import_node_fs.createReadStream)(file, { encoding: "utf8" });
  const lines = (0, import_node_readline.createInterface)({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line) continue;
      try {
        const sample = JSON.parse(line);
        if (typeof sample.id === "string" && Number.isFinite(sample.point?.at)) yield sample;
      } catch {
      }
    }
  } finally {
    lines.close();
    input.destroy();
  }
}
async function visitHistoryLines(file, consume, check = () => {
}) {
  const stat = await fs.lstat(file).catch((e) => {
    if (e.code === "ENOENT") return null;
    throw e;
  });
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) return;
  const input = (0, import_node_fs.createReadStream)(file, { encoding: "utf8" });
  let pending = "", count = 0;
  const visit = (line) => {
    if (!line) return;
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      return;
    }
    consume(value);
  };
  try {
    for await (const chunk of input) {
      check();
      pending += chunk;
      let start = 0, end;
      while ((end = pending.indexOf("\n", start)) !== -1) {
        visit(pending.slice(start, end));
        start = end + 1;
        if (++count % 256 === 0) {
          await new Promise((resolve) => setImmediate(resolve));
          check();
        }
      }
      pending = pending.slice(start);
    }
    check();
    visit(pending);
  } finally {
    input.destroy();
  }
}

// src/server/thermal/historyQueryProjection.ts
var HOUR = 36e5;
var shardPattern = /^(\d{10,16})-([a-f0-9]{64})\.jsonl$/;
var hash = (text) => (0, import_node_crypto.createHash)("sha256").update(text).digest("hex");
async function projectHistoryQuery(input, checkCancelled = () => {
}) {
  const { ids, start, end, metric, filters } = input;
  const bucketCount = Math.max(1, Math.min(240, Math.floor(1e4 / (Math.max(1, new Set(ids).size) * 5))));
  const width = Math.max(1, (end - start) / bucketCount);
  const uniqueIds = [...new Set(ids)];
  const deviceByHash = new Map(uniqueIds.map((id, index) => [hash(id), index]));
  const filesByDevice = uniqueIds.map(() => []);
  for (const file of input.files) {
    checkCancelled();
    const match = shardPattern.exec(file);
    if (!match) continue;
    const index = deviceByHash.get(match[2]);
    const hour = Number(match[1]);
    if (index !== void 0 && hour <= end && hour + HOUR >= start) filesByDevice[index].push(file);
  }
  const byDevice = new Array(uniqueIds.length);
  let nextId = 0;
  const scan = async () => {
    while (nextId < uniqueIds.length) {
      checkCancelled();
      const index = nextId++, id = uniqueIds[index];
      const output2 = [];
      const buckets = /* @__PURE__ */ new Map();
      const files = filesByDevice[index].sort();
      const value = (s) => {
        const n = s.point[metric];
        return matchesHistory(s.point, metric, filters) && s.point.quality === "Live" && typeof n === "number" && Number.isFinite(n) ? n : null;
      };
      const consume = (s) => {
        s = { ...s, point: applicableThermalPoint(s.point, thermalSegmentType(s.segment, s.point.segmentType)) };
        const key = Math.floor((s.point.at - start) / width), b = buckets.get(key), v = value(s);
        if (!b) {
          buckets.set(key, { first: s, last: s, min: s, max: s, ...v === null ? { gap: s } : {} });
          return;
        }
        b.last = s;
        if (v === null) {
          b.gap = s;
          return;
        }
        if (value(b.min) === null || v < value(b.min)) b.min = s;
        if (value(b.max) === null || v > value(b.max)) b.max = s;
      };
      let previous;
      const visit = (s) => {
        checkCancelled();
        if (s.id !== id || s.point.at < start || s.point.at > end) return;
        if (previous && s.point.at - previous.point.at > 12e4) consume({ ...previous, gap: true, point: { ...previous.point, at: previous.point.at + 1, quality: "Unavailable" } });
        consume(s);
        previous = s;
      };
      for (const file of files) {
        if (input.chunked === false) {
          for await (const sample of readSiteSamples(import_node_path.default.join(input.directory, file))) visit(sample);
        } else await visitHistoryLines(import_node_path.default.join(input.directory, file), (value2) => {
          const sample = value2;
          if (sample && typeof sample.id === "string" && Number.isFinite(sample.point?.at)) visit(sample);
        }, checkCancelled);
      }
      for (const b of buckets.values()) output2.push(...[b.first, b.min, b.max, ...b.gap ? [b.gap] : [], b.last]);
      byDevice[index] = output2;
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, uniqueIds.length) }, () => scan()));
  checkCancelled();
  const output = byDevice.flat();
  const unique = new Map(output.map((s) => [`${s.id}:${s.point.at}:${s.point.quality}`, s]));
  return { points: [...unique.values()].sort((a, b) => a.point.at - b.point.at).map((s) => {
    const excluded = !!s.gap || !matchesHistory(s.point, metric, filters);
    return { id: s.id, point: s.point, displayValues: thermalDisplayValues(s.point), excluded, review: reviewReading(s.point, metric, excluded) };
  }), summarized: true, from: start, to: end };
}

// src/server/thermal/historyQueryWorker.ts
void projectHistoryQuery(import_node_worker_threads.workerData).then(
  (result) => import_node_worker_threads.parentPort.postMessage({ result }),
  (error) => import_node_worker_threads.parentPort.postMessage({ error: String(error) })
);
//# sourceMappingURL=history-query-worker.cjs.map
