import {Worker} from 'node:worker_threads';
import path from 'node:path';
import type {SnapshotTransfer} from './snapshotTransfer';

/** Single-job worker; AsyncCacheWriter owns ordering, coalescing and backpressure. */
export class SnapshotCacheWorker {
  private worker: Worker | null = null;
  private closed = false;
  private active: {reject: (error: Error) => void} | null = null;
  private serial = 0;
  private completed = 0;
  private lastEncodeMs: number | null = null;
  constructor(private file = path.resolve('dist/snapshot-cache-worker.cjs'), private timeoutMs = 25_000) {}

  async write(file: string, content: SnapshotTransfer): Promise<void> {
    if (this.closed) throw new Error('Snapshot worker is closed');
    if (this.active) throw new Error('Snapshot worker already has a job');
    if (!path.isAbsolute(file)) throw new Error('Snapshot destination must be absolute');
    let worker = this.worker;
    if (!worker) {
      worker = new Worker(this.file, {execArgv: [], resourceLimits: {maxOldGenerationSizeMb: 512}});
      this.worker = worker;
      // Idle worker failure must not become an unhandled error in the server.
      const clear = () => {if (this.worker === worker) this.worker = null;};
      worker.on('error', clear); worker.on('exit', clear);
    }
    worker.ref();
    const id = ++this.serial;
    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          worker.off('message', onMessage); worker.off('error', onError); worker.off('exit', onExit);
          this.active = null;
          if (error) reject(error); else resolve();
        };
        const onError = (error: Error) => finish(error);
        const onExit = (code: number) => finish(new Error(`Snapshot worker exited before completion (${code})`));
        const onMessage = (reply: {id: number; ok?: boolean; error?: string; encodeMs?: number}) => {
          if (reply.id !== id) return;
          if (!reply.ok) return finish(new Error(reply.error || 'Snapshot worker failed'));
          this.completed++;
          this.lastEncodeMs = reply.encodeMs ?? null;
          finish();
        };
        const timer = setTimeout(() => finish(new Error('Snapshot worker timed out; previous cache retained')), this.timeoutMs);
        this.active = {reject: finish};
        worker.on('message', onMessage); worker.once('error', onError); worker.once('exit', onExit);
        try {worker.postMessage({id, file, ...content}, [content.bytes.buffer as ArrayBuffer]);}
        catch (error) {finish(error instanceof Error ? error : new Error(String(error)));}
      });
      worker.unref();
    } catch (error) {
      this.worker = null;
      await worker.terminate();
      throw error;
    }
  }

  status() {return {active: !!this.active, completed: this.completed, lastEncodeMs: this.lastEncodeMs};}
  async close() {
    this.closed = true;
    this.active?.reject(new Error('Snapshot worker closed'));
    const worker = this.worker;
    this.worker = null;
    if (worker) await worker.terminate();
  }
}
