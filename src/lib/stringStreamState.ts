type Row = Record<string, unknown>;
export type StringStreamView = Row & {transportEpoch: string; brokerVersion: number; strings: Row[]};
type Delta = {transportEpoch: string; version: number; capturedAt: string; changes: {key: string; row: Row}[]};
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
          !change.row || typeof change.row !== 'object' || keyOf(change.row) !== change.key)) {
      this.recovering = true;
      return false;
    }
    if (this.epoch && this.epoch !== delta.transportEpoch) return false;
    if (!this.recovering && this.view) {
      if (delta.version <= this.view.brokerVersion) return true;
      if (delta.version === this.view.brokerVersion + 1) {
        this.view = this.apply(this.view, delta);
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
      candidate = this.apply(candidate, delta);
    }
    if (this.view?.transportEpoch === candidate.transportEpoch && this.view.brokerVersion === candidate.brokerVersion &&
        Number(this.view.cycleId) > Number(candidate.cycleId)) candidate = this.view;
    this.view = candidate;
    this.epoch = candidate.transportEpoch;
    this.pending = [];
    this.recovering = false;
    return true;
  }

  private apply(view: StringStreamView, delta: Delta): StringStreamView {
    const rows = new Map(view.strings.map(row => [keyOf(row), row]));
    for (const change of delta.changes) rows.set(change.key, change.row);
    return {...view, brokerVersion: delta.version, capturedAt: delta.capturedAt, strings: [...rows.values()]};
  }
}
