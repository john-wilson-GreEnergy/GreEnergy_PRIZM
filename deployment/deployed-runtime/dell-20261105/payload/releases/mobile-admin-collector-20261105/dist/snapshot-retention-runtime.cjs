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

// src/server/telemetry/SnapshotRetentionWorker.ts
var SnapshotRetentionWorker_exports = {};
__export(SnapshotRetentionWorker_exports, {
  SnapshotRetentionWorker: () => SnapshotRetentionWorker,
  snapshotRetentionWorker: () => snapshotRetentionWorker
});
module.exports = __toCommonJS(SnapshotRetentionWorker_exports);
var import_node_worker_threads = require("node:worker_threads");
var import_node_v8 = require("node:v8");
var import_node_path = __toESM(require("node:path"), 1);
var import_promises = require("node:timers/promises");
var SnapshotRetentionWorker = class {
  constructor(file = import_node_path.default.join(typeof __dirname === "string" ? __dirname : import_node_path.default.resolve("dist"), "snapshot-retention-worker.cjs"), timeoutMs = 8e3) {
    this.file = file;
    this.timeoutMs = timeoutMs;
    this.active = false;
    this.completed = 0;
    this.failed = 0;
    this.lastError = null;
    this.lastTiming = null;
  }
  async clone(snapshot) {
    if (this.active) throw new Error("Snapshot retention already active");
    this.active = true;
    const start = performance.now();
    let worker = null;
    let timer;
    try {
      const bytes = Uint8Array.from((0, import_node_v8.serialize)(snapshot));
      if (bytes.byteLength > 128 * 1024 * 1024) throw new Error("Snapshot capture exceeds bounded capacity");
      const captureMs = performance.now() - start;
      worker = new import_node_worker_threads.Worker(this.file, { execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 512 } });
      const currentWorker = worker;
      let failure = null;
      let rejectPending = () => {
      };
      const fail = (error) => {
        failure = error;
        rejectPending(error);
      };
      currentWorker.on("error", fail);
      currentWorker.on("exit", (code) => fail(new Error(`Snapshot retention worker exited (${code})`)));
      timer = setTimeout(() => fail(new Error("Snapshot retention timed out; previous publication retained")), this.timeoutMs);
      const reply = await new Promise((resolve, reject) => {
        rejectPending = reject;
        currentWorker.once("message", resolve);
        currentWorker.postMessage(bytes, [bytes.buffer]);
      });
      if (!reply.ok) throw new Error(reply.error || "Snapshot retention worker failed");
      if (!Array.isArray(reply.batches) || reply.batches.length === 0 || reply.batches.length > 1e4 || reply.totalBytes > 256 * 1024 * 1024) throw new Error("Invalid retention handoff");
      let result;
      let maxDecodeMs = 0;
      for (const batch of reply.batches) {
        await (0, import_promises.setImmediate)();
        if (failure) throw failure;
        const decodeStart = performance.now();
        const part = (0, import_node_v8.deserialize)(batch);
        if (part.ref) {
          part.value = result;
          for (const key of part.ref) part.value = part.value[key];
        }
        if (part.path.length === 0) result = part.value;
        else {
          let target = result;
          for (const key of part.path.slice(0, -1)) target = target[key];
          Object.defineProperty(target, part.path.at(-1), { value: part.value, enumerable: true, configurable: true, writable: true });
        }
        maxDecodeMs = Math.max(maxDecodeMs, performance.now() - decodeStart);
      }
      if (failure) throw failure;
      this.completed++;
      this.lastError = null;
      this.lastTiming = { captureMs, durationMs: performance.now() - start, maxDecodeMs, batches: reply.batches.length, bytes: reply.totalBytes, background: reply.timing };
      return result;
    } catch (error) {
      this.failed++;
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      clearTimeout(timer);
      if (worker) await worker.terminate();
      this.active = false;
    }
  }
  status() {
    return { active: this.active, completed: this.completed, failed: this.failed, lastError: this.lastError, lastTiming: this.lastTiming, recycled: true };
  }
};
var snapshotRetentionWorker = new SnapshotRetentionWorker();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SnapshotRetentionWorker,
  snapshotRetentionWorker
});
