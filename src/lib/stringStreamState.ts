type Row = Record<string, unknown>;
export type StringStreamView = Row & {transportEpoch: string; brokerVersion: number; strings: Row[]};
type Delta = {transportEpoch: string; version: number; capturedAt: string; metadata?: Row; changes: {key: string; row: Row; patch?: true; removed?: string[]}[]};
const validVersion = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const keyOf = (row: Row) => `${Number(row.arrayNumber ?? row.arrayIndex)}:${Number(row.stringNumber ?? row.stringIndex)}`;

/** Transport ordering only; never infers device state or changes source timestamps. */
export class StringStreamState {
  view: StringStreamView | null = null;
  recovering = true;
  private epoch: string | null = null;
  private minimumVersion = 0;
  private pending: Delta[] = [];
  constructor(private readonly maxPending = 100) {}

  ready(epoch: string, version: number): void {
    if (!epoch || !validVersion(version)) throw new Error('Invalid stream ready');
    this.epoch = epoch;
    this.minimumVersion = version;
    this.pending = [];
    this.recovering = true;
  }

  disconnected(): void { this.recovering = true; }

  delta(input: unknown): boolean {
    const delta = input as Delta;
    if (!delta || typeof delta.transportEpoch !== 'string' || !validVersion(delta.version) ||
        !Array.isArray(delta.changes) || delta.changes.some(change => !change || typeof change.key !== 'string' ||
          !change.row || typeof change.row !== 'object' || keyOf(change.row) !== change.key ||
          (change.patch !== undefined && change.patch !== true) ||
          (change.removed !== undefined && (!Array.isArray(change.removed) || change.removed.some(k=>typeof k!=='string'||['__proto__','constructor','prototype','arrayNumber','stringNumber','arrayIndex','stringIndex'].includes(k)))))) {
      this.recovering = true;
      return false;
    }
    if (this.epoch && this.epoch !== delta.transportEpoch) return false;
    if (!this.recovering && this.view) {
      if (delta.version <= this.view.brokerVersion) return true;
      if (delta.version === this.view.brokerVersion + 1) {
        const applied = this.apply(this.view, delta);
        if (!applied) {this.recovering = true; return false;}
        this.view = applied;
        return true;
      }
    }
    this.recovering = true;
    this.pending.push(delta);
    if (this.pending.length > this.maxPending) {
      this.minimumVersion = Math.max(this.minimumVersion, ...this.pending.map(entry => entry.version));
      this.pending = [];
    }
    return false;
  }

  snapshot(input: unknown): boolean {
    const next = input as StringStreamView;
    if (!next || typeof next.transportEpoch !== 'string' || !validVersion(next.brokerVersion) ||
        !Array.isArray(next.strings) || !next.strings.length ||
        next.strings.some(row => !row || typeof row !== 'object') ||
        (this.epoch && this.epoch !== next.transportEpoch) || next.brokerVersion < this.minimumVersion) return false;
    // A GET started before a command acknowledgement must not undo its streamed row.
    if (this.view?.transportEpoch === next.transportEpoch && this.view.brokerVersion > next.brokerVersion) return !this.recovering;
    let candidate = next;
    for (const delta of this.pending) {
      if (delta.transportEpoch !== next.transportEpoch || delta.version <= candidate.brokerVersion) continue;
      if (delta.version !== candidate.brokerVersion + 1) return false;
      const applied = this.apply(candidate, delta);
      if (!applied) return false;
      candidate = applied;
    }
    if (this.view?.transportEpoch === candidate.transportEpoch && this.view.brokerVersion === candidate.brokerVersion &&
        Number(this.view.cycleId) > Number(candidate.cycleId)) candidate = this.view;
    this.view = candidate;
    this.epoch = candidate.transportEpoch;
    this.pending = [];
    this.recovering = false;
    return true;
  }

  private apply(view: StringStreamView, delta: Delta): StringStreamView | null {
    const rows = new Map(view.strings.map(row => [keyOf(row), row]));
    for (const change of delta.changes) {
      if (change.patch) {
        const prior = rows.get(change.key);
        if (!prior) return null;
        const next = {...prior,...change.row};
        for (const key of change.removed || []) delete next[key];
        rows.set(change.key,next);
      } else rows.set(change.key, change.row);
    }
    // Only explicitly supported metadata can augment the view. Never let it
    // overwrite ordering, transport identity, timestamps or canonical rows.
    const metadata = delta.metadata && typeof delta.metadata === 'object' && !Array.isArray(delta.metadata)
      ? Object.fromEntries(['cycleId','summary','rollups','buckets','sourceHealth','durationMs']
          .filter(key => key in delta.metadata!).map(key => [key,delta.metadata![key]])) : {};
    return {...view, ...metadata, brokerVersion: delta.version, capturedAt: delta.capturedAt, strings: [...rows.values()]};
  }
}
