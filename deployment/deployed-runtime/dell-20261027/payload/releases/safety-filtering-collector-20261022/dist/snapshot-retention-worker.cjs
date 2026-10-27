// src/server/telemetry/snapshotRetentionWorkerEntry.ts
var import_node_worker_threads = require("node:worker_threads");
var import_node_v8 = require("node:v8");

// src/server/telemetry/normalizeCapturedSnapshot.ts
function normalizeCapturedSnapshot(input) {
  const copied = /* @__PURE__ */ new WeakMap();
  const active = /* @__PURE__ */ new WeakSet();
  function visit(value) {
    if (value === null || typeof value === "string" || typeof value === "boolean" || value === void 0) return value;
    if (typeof value === "number") return Number.isFinite(value) ? value === 0 ? 0 : value : null;
    if (typeof value !== "object") throw new Error("Unsupported canonical snapshot value");
    if (active.has(value)) throw new Error("Circular canonical snapshot");
    if (copied.has(value)) return copied.get(value);
    if (value instanceof Date) return value.toJSON();
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) throw new Error("Unsupported canonical snapshot object");
    active.add(value);
    const result = value;
    copied.set(value, result);
    if (array) {
      for (const key of Object.keys(value)) if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) delete result[key];
      for (let i = 0; i < value.length; i++) result[i] = visit(value[i]) ?? null;
    } else {
      for (const key of Object.keys(value)) {
        const child = visit(value[key]);
        if (child === void 0) delete result[key];
        else {
          if (key === "__proto__") Object.defineProperty(result, key, { value: child, enumerable: true, writable: true, configurable: true });
          else result[key] = child;
        }
      }
    }
    active.delete(value);
    return result;
  }
  return visit(input);
}

// src/server/telemetry/snapshotRetentionWorkerEntry.ts
import_node_worker_threads.parentPort.on("message", (bytes) => {
  try {
    let estimate = function(value) {
      if (typeof value === "string") return 8 + value.length * 2;
      if (value === null || typeof value === "boolean") return 2;
      if (typeof value !== "object") return 12;
      const known = sizes.get(value);
      if (known !== void 0) return known;
      let size = 32;
      for (const key of Object.keys(value)) {
        size += 8 + key.length * 2 + estimate(value[key]);
        if (size > budget) break;
      }
      sizes.set(value, size);
      return size;
    }, emit = function(part, encoded) {
      const buffer = Uint8Array.from(encoded || (0, import_node_v8.serialize)(part));
      totalBytes += buffer.byteLength;
      if (totalBytes > 256 * 1024 * 1024 || batches.length >= 1e4) throw new Error(`Retention handoff exceeds bounded capacity (${batches.length} batches, ${totalBytes} bytes)`);
      batches.push(buffer);
    }, split = function(value, path) {
      if (value !== null && typeof value === "object") {
        const ref = locations.get(value);
        if (ref) {
          emit({ path, ref });
          return;
        }
        locations.set(value, path);
      }
      const size = estimate(value);
      if (size <= budget || value === null || typeof value !== "object") {
        if (size > 8 * 1024 * 1024) throw new Error("Retention scalar exceeds bounded capacity");
        const encoded = (0, import_node_v8.serialize)({ path, value });
        if (encoded.byteLength <= 1024 * 1024 || value === null || typeof value !== "object") {
          emit(null, encoded);
          return;
        }
      }
      emit({ path, value: Array.isArray(value) ? new Array(value.length) : {} });
      for (const key of Object.keys(value)) split(value[key], [...path, key]);
    };
    const started = performance.now();
    const captured = (0, import_node_v8.deserialize)(bytes);
    const decodedAt = performance.now();
    const normalized = normalizeCapturedSnapshot(captured);
    const normalizedAt = performance.now();
    const batches = [];
    const locations = /* @__PURE__ */ new WeakMap();
    const sizes = /* @__PURE__ */ new WeakMap();
    const budget = 8 * 1024 * 1024;
    let totalBytes = 0;
    split(normalized, []);
    const timing = { decodeMs: decodedAt - started, normalizeMs: normalizedAt - decodedAt, splitMs: performance.now() - normalizedAt };
    import_node_worker_threads.parentPort.postMessage({ ok: true, batches, totalBytes, timing }, batches.map((b) => b.buffer));
  } catch (error) {
    import_node_worker_threads.parentPort.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
