/** Success-only cadence for a fixed metadata allowlist, never live/safety data. */
export class MetadataCadence {
  private scope: string | null = null;
  private revision = 0;
  private completed = new Map<string, number>();
  private pending = new Map<string, Promise<void>>();
  constructor(private readonly intervalMs = 0, private readonly now = Date.now) {
    if (!Number.isFinite(intervalMs) || intervalMs < 0 || intervalMs > 300000) throw Error('Invalid metadata interval');
  }
  clear() { this.revision++; this.scope = null; this.completed.clear(); this.pending.clear(); }
  async run<T>(scope: string, key: 'ipMap' | 'stringIPMap', read: () => Promise<T>, apply: (data: T) => void): Promise<void> {
    if (scope !== this.scope) { this.clear(); this.scope = scope; }
    const revision = this.revision, previous = this.completed.get(key), now = this.now();
    if (previous !== undefined && now >= previous && now - previous < this.intervalMs) return;
    const pending = this.pending.get(key); if (pending) return pending;
    const work = Promise.resolve().then(read).then(data => {
      if (revision !== this.revision || scope !== this.scope) return;
      apply(data); this.completed.set(key, this.now());
    }).finally(() => { if (this.pending.get(key) === work) this.pending.delete(key); });
    this.pending.set(key, work); return work;
  }
  status() { return {intervalMs:this.intervalMs, trackedKeys:this.completed.size, inFlight:this.pending.size}; }
}
const interval = Number(process.env.PRIZM_EMS_METADATA_INTERVAL_MS ?? 0);
export const emsMetadataCadence = new MetadataCadence(interval);
