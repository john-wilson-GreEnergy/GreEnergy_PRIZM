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

// src/server/cache/snapshotCacheWorkerEntry.ts
var import_node_worker_threads = require("node:worker_threads");
var import_node_v8 = require("node:v8");
var import_node_crypto2 = require("node:crypto");

// src/server/cache/AsyncCacheWriter.ts
var fs = __toESM(require("node:fs/promises"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var import_node_crypto = require("node:crypto");
async function writeAtomicCache(file, content) {
  if (!import_node_path.default.isAbsolute(file)) throw new Error("Cache destination must be absolute");
  await fs.mkdir(import_node_path.default.dirname(file), { recursive: true });
  const previous = await fs.lstat(file).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (previous && !previous.isFile()) throw new Error("Cache destination is not a regular file");
  const temporary = `${file}.pending-${process.pid}-${(0, import_node_crypto.randomUUID)()}`;
  let handle;
  let created = false, renamed = false;
  try {
    handle = await fs.open(temporary, "wx", previous ? previous.mode & 511 : 384);
    created = true;
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    handle = void 0;
    await fs.rename(temporary, file);
    renamed = true;
  } finally {
    await handle?.close().catch(() => {
    });
    if (created && !renamed) await fs.unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

// src/server/cache/serializeTelemetryCache.ts
function serializeTelemetryCache(value, mode = process.env.PRIZM_COMPACT_TELEMETRY_CACHE) {
  return JSON.stringify(value, null, mode === "false" ? 2 : void 0);
}

// src/server/cache/snapshotCacheWorkerEntry.ts
import_node_worker_threads.parentPort.on("message", async (job) => {
  try {
    const start = performance.now();
    const json = serializeTelemetryCache((0, import_node_v8.deserialize)(job.bytes), job.compact ? "true" : "false");
    if (job.expectedHash && (0, import_node_crypto2.createHash)("sha256").update(json).digest("hex") !== job.expectedHash) {
      throw new Error("Snapshot worker JSON parity failed; previous disk cache retained");
    }
    const encodeMs = performance.now() - start;
    await writeAtomicCache(job.file, json);
    import_node_worker_threads.parentPort.postMessage({ id: job.id, ok: true, encodeMs });
  } catch (error) {
    import_node_worker_threads.parentPort.postMessage({ id: job.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
//# sourceMappingURL=snapshot-cache-worker.cjs.map
