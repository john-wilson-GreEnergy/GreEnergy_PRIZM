import {Worker} from 'node:worker_threads';
import {serialize, deserialize} from 'node:v8';
import path from 'node:path';
import {setImmediate as nextTurn} from 'node:timers/promises';

/** Internal canonical snapshots only, like prepareSnapshotTransfer: JSON-derived
 * records/arrays plus Dates. Not an arbitrary class/custom-toJSON clone API.
 * Capture is synchronous so producer mutations cannot mix cycles. Normalization
 * runs off-thread and decoding yields between bounded batches. Nothing becomes
 * visible until the complete copy succeeds. One job, no queue, recycled heap.
 */
export class SnapshotRetentionWorker {
  private active = false;
  private completed = 0;
  private failed = 0;
  private lastError: string | null = null;
  private lastTiming: {captureMs: number; durationMs: number; maxDecodeMs: number; batches: number; bytes: number; background: unknown} | null = null;
  constructor(private file = path.join(typeof __dirname === 'string' ? __dirname : path.resolve('dist'), 'snapshot-retention-worker.cjs'), private timeoutMs = 8000) {}

  async clone<T>(snapshot: T): Promise<T> {
    if (this.active) throw new Error('Snapshot retention already active');
    this.active = true;
    const start = performance.now();
    let worker: Worker | null = null;
    let timer: NodeJS.Timeout | undefined;
    try {
      const bytes = Uint8Array.from(serialize(snapshot));
      if (bytes.byteLength > 128 * 1024 * 1024) throw new Error('Snapshot capture exceeds bounded capacity');
      const captureMs = performance.now() - start;
      worker = new Worker(this.file, {execArgv: [], resourceLimits: {maxOldGenerationSizeMb: 512}});
      const currentWorker = worker;
      let failure: Error | null = null;
      let rejectPending: (error: Error) => void = () => {};
      const fail = (error: Error) => {failure = error; rejectPending(error);};
      currentWorker.on('error', fail);
      currentWorker.on('exit', code => fail(new Error(`Snapshot retention worker exited (${code})`)));
      timer = setTimeout(() => fail(new Error('Snapshot retention timed out; previous publication retained')), this.timeoutMs);
      const reply = await new Promise<any>((resolve, reject) => {
        rejectPending = reject;
        currentWorker.once('message', resolve);
        currentWorker.postMessage(bytes, [bytes.buffer]);
      });
      if (!reply.ok) throw new Error(reply.error || 'Snapshot retention worker failed');
      if (!Array.isArray(reply.batches) || reply.batches.length === 0 || reply.batches.length > 10000 || reply.totalBytes > 256 * 1024 * 1024) throw new Error('Invalid retention handoff');
      let result: any;
      let maxDecodeMs = 0;
      for (const batch of reply.batches) {
        await nextTurn();
        if (failure) throw failure;
        const decodeStart = performance.now();
        const part = deserialize(batch);
        if (part.ref) {
          part.value = result;
          for (const key of part.ref) part.value = part.value[key];
        }
        if (part.path.length === 0) result = part.value;
        else {
          let target = result;
          for (const key of part.path.slice(0, -1)) target = target[key];
          Object.defineProperty(target, part.path.at(-1), {value: part.value, enumerable: true, configurable: true, writable: true});
        }
        maxDecodeMs = Math.max(maxDecodeMs, performance.now() - decodeStart);
      }
      if (failure) throw failure;
      this.completed++;
      this.lastError = null;
      this.lastTiming = {captureMs, durationMs: performance.now() - start, maxDecodeMs, batches: reply.batches.length, bytes: reply.totalBytes, background: reply.timing};
      return result as T;
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
  status() {return {active: this.active, completed: this.completed, failed: this.failed, lastError: this.lastError, lastTiming: this.lastTiming, recycled: true};}
}

export const snapshotRetentionWorker = new SnapshotRetentionWorker();
