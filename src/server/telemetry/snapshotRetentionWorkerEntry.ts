import {parentPort} from 'node:worker_threads';
import {deserialize, serialize} from 'node:v8';
import {normalizeCapturedSnapshot} from './normalizeCapturedSnapshot';

// Pure data copying only. No filesystem, acquisition, commands or networking.
parentPort!.on('message', (bytes: Uint8Array) => {
  try {
    const started = performance.now();
    // Preserve the existing JSON retention contract (nulls, dates, omitted
    // properties, non-finite numbers), not V8's different public data format.
    const captured = deserialize(bytes);
    const decodedAt = performance.now();
    const normalized = normalizeCapturedSnapshot(captured);
    const normalizedAt = performance.now();
    const batches: Uint8Array[] = [];
    const locations = new WeakMap<object, string[]>();
    const sizes = new WeakMap<object, number>();
    const budget = 8 * 1024 * 1024;
    // Capped size estimate (wire size is checked before emitting). Do not repeatedly serialize the
    // entire graph merely to discover that it needs splitting.
    function estimate(value: any): number {
      if (typeof value === 'string') return 8 + value.length * 2;
      if (value === null || typeof value === 'boolean') return 2;
      if (typeof value !== 'object') return 12;
      const known = sizes.get(value);
      if (known !== undefined) return known;
      let size = 32;
      for (const key of Object.keys(value)) {
        size += 8 + key.length * 2 + estimate(value[key]);
        if (size > budget) break;
      }
      sizes.set(value, size);
      return size;
    }
    let totalBytes = 0;
    function emit(part: unknown, encoded?: Uint8Array) {
      const buffer = Uint8Array.from(encoded || serialize(part));
      totalBytes += buffer.byteLength;
      if (totalBytes > 256 * 1024 * 1024 || batches.length >= 10000) throw new Error(`Retention handoff exceeds bounded capacity (${batches.length} batches, ${totalBytes} bytes)`);
      batches.push(buffer);
    }
    function split(value: any, path: string[]) {
      if (value !== null && typeof value === 'object') {
        const ref = locations.get(value);
        if (ref) {emit({path, ref}); return;}
        locations.set(value, path);
      }
      const size = estimate(value);
      if (size <= budget || value === null || typeof value !== 'object') {
        if (size > 8 * 1024 * 1024) throw new Error('Retention scalar exceeds bounded capacity');
        const encoded = serialize({path, value});
        if (encoded.byteLength <= 1024 * 1024 || value === null || typeof value !== 'object') {
          emit(null, encoded); return;
        }
      }
      emit({path, value: Array.isArray(value) ? new Array(value.length) : {}});
      // Order, including integer-like object keys, remains the JSON order.
      for (const key of Object.keys(value)) split(value[key], [...path, key]);
    }
    split(normalized, []);
    const timing = {decodeMs: decodedAt-started, normalizeMs: normalizedAt-decodedAt, splitMs: performance.now()-normalizedAt};
    parentPort!.postMessage({ok: true, batches, totalBytes, timing}, batches.map(b => b.buffer));
  } catch (error) {
    parentPort!.postMessage({ok: false, error: error instanceof Error ? error.message : String(error)});
  }
});
