import {StringViewerScheduler, stringViewerScheduler} from './StringViewerScheduler';
import type {StringViewerCacheEntry} from './StringViewerTypes';

type Row = Record<string, unknown>;
export const useBackgroundStringViewer = (value: string | undefined): boolean => value !== 'false';

/** One owner for scheduled enrichment; no new timer, fan-out or published-row mutation. */
export class StringViewerBackground<T = unknown> {
  private scope: string | null = null;
  private requestedScope: string | null = null;
  private inFlight: Promise<void> | null = null;
  private stopped = false;
  private lastError: string | null = null;

  constructor(private readonly scheduler: StringViewerScheduler<T>) {}

  async read(rows: readonly Row[], cycleId: number | null, baseUrl: string, scope: string, background: boolean): Promise<ReadonlyMap<string, StringViewerCacheEntry<T>>> {
    if (this.stopped) return new Map();
    this.requestedScope = scope;
    if (scope !== this.scope) {
      // Never overlap old/new sites or expose old-site entries while draining.
      if (this.inFlight) return new Map();
      this.scheduler.reset();
      this.scope = scope;
    }
    if (!this.inFlight) {
      this.inFlight = this.scheduler.runCycle(rows, cycleId, baseUrl)
        .then(() => { this.lastError = null; })
        .catch((error: unknown) => { this.lastError = error instanceof Error ? error.message : String(error); })
        .finally(() => { this.inFlight = null; });
    }
    if (!background) await this.inFlight;
    return this.peek(rows, baseUrl, scope);
  }

  /** Read only: reuse this site's cache without scheduling or refreshing devices. */
  peek(rows: readonly Row[], baseUrl: string, scope: string): ReadonlyMap<string, StringViewerCacheEntry<T>> {
    if (this.stopped || this.scope !== scope || this.requestedScope !== scope) return new Map();
    const entries = new Map<string, StringViewerCacheEntry<T>>();
    for (const row of rows) {
      const array = Number(row.arrayNumber ?? row.arrayIndex), string = Number(row.stringNumber ?? row.stringIndex);
      const key = String(row.stringKey || row.canonicalKey || `A${array}-S${string}`);
      const entry = this.scheduler.getEntry(key);
      if (entry && entry.arrayIndex === array && entry.stringIndex === string &&
          entry.sourceUrl === `${baseUrl}/tools/monitor/ems/stringviewer/array/${array}/${string}/data`) entries.set(key, entry);
    }
    return entries;
  }

  diagnostics() { return {mode: useBackgroundStringViewer(process.env.PRIZM_STRINGVIEWER_BACKGROUND) ? 'background' : 'awaited', running: !!this.inFlight, stopped: this.stopped, lastError: this.lastError}; }
  stop(): void { this.stopped = true; this.scheduler.shutdown(); }
  async drain(): Promise<void> { await this.inFlight; }
}

export const stringViewerBackground = new StringViewerBackground(stringViewerScheduler);
