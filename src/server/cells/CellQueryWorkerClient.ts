import {Worker} from 'node:worker_threads';
import path from 'node:path';
import type {CellHistoryResult, CellHistorySite, CellMetric} from '../../core/cellHistory';

export interface CellQueryInput {from: number; to: number; metric: CellMetric; ids: string[]; array?: number}
/** One reusable, memory-bounded reader. It never imports equipment providers. */
export class CellQueryWorkerClient {
  private worker: Worker | null = null;
  private cancel: (() => void) | null = null;
  constructor(private file = path.resolve(process.cwd(), 'dist/cell-history-worker.cjs')) {}
  run(directory: string, site: CellHistorySite, intervalMs: number, input: CellQueryInput, signal?: AbortSignal): Promise<CellHistoryResult> {
    signal?.throwIfAborted();
    if (this.cancel) return Promise.reject(new Error('Cell history reader is busy'));
    if (!this.worker) {
      const created = new Worker(this.file, {resourceLimits: {maxOldGenerationSizeMb: 256}});
      this.worker = created;
      const forget = () => {if (this.worker === created) this.worker = null;};
      created.on('error', forget); created.on('exit', forget);
    }
    const worker = this.worker;
    worker.ref();
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error, result?: CellHistoryResult, discard = false) => {
        if (settled) return;
        settled = true; clearTimeout(timer); signal?.removeEventListener('abort', aborted);
        worker.removeListener('message', message); worker.removeListener('error', failed); worker.removeListener('exit', exited);
        this.cancel = null;
        if (discard) {this.worker = null; void worker.terminate();} else worker.unref();
        if (error) reject(error); else resolve(result!);
      };
      const aborted = () => finish(new Error('Cell history request cancelled'), undefined, true);
      const failed = (error: Error) => finish(error, undefined, true);
      const exited = () => failed(new Error('Cell history reader stopped; retry the request'));
      const message = (reply: {result?: CellHistoryResult; error?: string}) => {
        if (reply.error || !reply.result) finish(new Error(reply.error || 'Invalid cell history response'));
        else finish(undefined, reply.result);
      };
      const timer = setTimeout(() => finish(new Error('Cell history reader timed out; select a shorter window'), undefined, true), 35_000);
      this.cancel = aborted;
      worker.once('message', message); worker.once('error', failed); worker.once('exit', exited);
      signal?.addEventListener('abort', aborted, {once:true});
      worker.postMessage({directory, site, intervalMs, input});
    });
  }
  async close(): Promise<void> {
    const worker = this.worker;
    this.cancel?.(); this.worker = null;
    if (worker) await worker.terminate();
  }
}
