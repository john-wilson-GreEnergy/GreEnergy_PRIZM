import * as fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {setImmediate as nextTurn} from 'node:timers/promises';

/** Replace a cache only after its complete temporary file has been flushed.
 * The temporary file is on the same filesystem. Never unlink the destination
 * to work around a failed rename (including Windows sharing violations).
 */
export async function writeAtomicCache(file: string, content: string): Promise<void> {
  if (!path.isAbsolute(file)) throw new Error('Cache destination must be absolute');
  await fs.mkdir(path.dirname(file), {recursive: true});
  const previous = await fs.lstat(file).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (previous && !previous.isFile()) throw new Error('Cache destination is not a regular file');
  const temporary = `${file}.pending-${process.pid}-${randomUUID()}`;
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  let created = false, renamed = false;
  try {
    handle = await fs.open(temporary, 'wx', previous ? previous.mode & 0o777 : 0o600);
    created = true;
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(temporary, file);
    renamed = true;
  } finally {
    await handle?.close().catch(() => {});
    if (created && !renamed) await fs.unlink(temporary).catch(error => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

type Job<T> = {file: string; content: T; retainedBytes: number; sequence: number};
type Options<T> = {
  maxBytes?: number;
  maxJobs?: number;
  write?: (file: string, content: T) => Promise<void>;
  estimateBytes?: (content: T) => number;
  onError?: (message: string) => void;
};

/** Latest-value cache persistence only, never history/audit storage.
 * One in-flight write and a bounded map of pending, immutable serialized values.
 * New values replace a pending value for the same absolute path. Writes already
 * in progress finish first, so an older revision cannot overwrite a newer one.
 */
export class AsyncCacheWriter<T = string> {
  private readonly pending = new Map<string, Job<T>>();
  private active: Job<T> | null = null;
  private running: Promise<void> | null = null;
  private accepting = true;
  private pendingBytes = 0;
  private readonly failures = new Map<string, {message: string; sequence: number}>();
  private sequence = 0;
  private failureOverflow = false;
  private accepted = 0;
  private coalesced = 0;
  private completed = 0;
  private failed = 0;
  private rejected = 0;
  private lastCompletedAt: string | null = null;
  private lastWriteMs: number | null = null;
  private lastError: string | null = null;
  private readonly maxBytes: number;
  private readonly maxJobs: number;
  private readonly write: (file: string, content: T) => Promise<void>;

  constructor(private readonly options: Options<T> = {}) {
    this.maxBytes = options.maxBytes ?? 512 * 1024 * 1024;
    this.maxJobs = options.maxJobs ?? 8;
    this.write = options.write ?? (async (file, content) => {
      if (typeof content !== 'string') throw new Error('Non-text cache requires an explicit writer');
      await writeAtomicCache(file, content);
    });
  }

  enqueue(file: string, content: T): boolean {
    const sequence = ++this.sequence;
    // Conservative budget includes UTF-16 string storage and a UTF-8 write buffer.
    const retainedBytes = this.options.estimateBytes ? this.options.estimateBytes(content)
      : typeof content === 'string' ? content.length * 2 + Buffer.byteLength(content) : Infinity;
    const previous = this.pending.get(file);
    const bytes = this.pendingBytes - (previous?.retainedBytes ?? 0) + retainedBytes + (this.active?.retainedBytes ?? 0);
    const jobs = this.pending.size + (previous ? 0 : 1) + (this.active ? 1 : 0);
    if (!this.accepting || !path.isAbsolute(file) || !Number.isFinite(retainedBytes) || retainedBytes < 0 || bytes > this.maxBytes || jobs > this.maxJobs) {
      this.rejected++;
      this.recordFailure(file, !this.accepting ? 'Cache writer is closed' : 'Cache queue limit or invalid destination; previous disk cache retained', sequence);
      return false;
    }
    this.accepted++;
    if (previous) this.coalesced++;
    this.pendingBytes += retainedBytes - (previous?.retainedBytes ?? 0);
    this.pending.set(file, {file, content, retainedBytes, sequence});
    this.start();
    return true;
  }

  private start() {
    if (!this.running) {
      // Do not start converting/writing the large string on the publication stack.
      this.running = nextTurn().then(() => this.run()).finally(() => {
        this.running = null;
        if (this.pending.size) this.start();
      });
    }
  }

  recordPreparationFailure(file: string, error: unknown) {
    this.failed++;
    this.recordFailure(file, error instanceof Error ? error.message : String(error), ++this.sequence);
  }

  private recordFailure(file: string, message: string, sequence: number) {
    this.lastError = message.slice(0, 300);
    if (this.failures.has(file) || this.failures.size < 16) {
      if ((this.failures.get(file)?.sequence ?? 0) <= sequence) this.failures.set(file, {message: this.lastError, sequence});
    }
    else this.failureOverflow = true;
    try {this.options.onError?.(this.lastError);} catch { /* Diagnostics must not break telemetry. */ }
  }

  private async run() {
    while (this.pending.size) {
      const job = this.pending.values().next().value!;
      this.pending.delete(job.file);
      this.pendingBytes -= job.retainedBytes;
      this.active = job;
      const start = performance.now();
      try {
        await this.write(job.file, job.content);
        this.completed++;
        // A newer rejected enqueue must not be cleared by an older successful write.
        if ((this.failures.get(job.file)?.sequence ?? Infinity) <= job.sequence) this.failures.delete(job.file);
        this.lastCompletedAt = new Date().toISOString();
      } catch (error) {
        this.failed++;
        this.recordFailure(job.file, error instanceof Error ? error.message : String(error), job.sequence);
      } finally {
        this.lastWriteMs = performance.now() - start;
        this.active = null;
      }
    }
  }

  async drain() { while (this.running) await this.running; }

  async close() {
    this.accepting = false;
    await this.drain();
    if (this.failures.size || this.failureOverflow) throw new Error('Some telemetry caches could not be saved; inspect cachePersistence diagnostics');
  }

  status() {
    return {accepting: this.accepting, activeWrites: this.active ? 1 : 0, pendingWrites: this.pending.size,
      retainedBytes: this.pendingBytes + (this.active?.retainedBytes ?? 0), maxBytes: this.maxBytes, maxJobs: this.maxJobs,
      accepted: this.accepted, coalesced: this.coalesced, completed: this.completed, failed: this.failed, rejected: this.rejected,
      unresolvedFailures: this.failures.size, failureOverflow: this.failureOverflow, lastCompletedAt: this.lastCompletedAt,
      lastWriteMs: this.lastWriteMs, lastError: this.lastError};
  }
}
