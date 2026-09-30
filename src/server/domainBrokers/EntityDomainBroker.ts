export type DomainChange<T> = {
  key: string;
  row: T;
  updatedAt: string;
};

export type DomainPublication<T> = {
  domain: string;
  version: number;
  capturedAt: string;
  changes: DomainChange<T>[];
};

type StoredRow<T> = { row: T; updatedAtMs: number; updatedAt: string; fingerprint: string };

export class EntityDomainBroker<T extends Record<string, any>> {
  private rows = new Map<string, StoredRow<T>>();
  private listeners = new Set<(publication: DomainPublication<T>) => void>();
  private version = 0;

  constructor(readonly domain: string, private readonly keyOf: (row: T) => string | null) {}

  /** Revision metadata without copying all rows; never a telemetry read or poll. */
  getVersion(): number { return this.version; }

  /** One canonical row without copying the entire fleet. */
  read(key: string): T | null {
    const stored = this.rows.get(key);
    return stored ? structuredClone(stored.row) : null;
  }

  publish(rows: T[], capturedAt = new Date().toISOString()): DomainPublication<T> {
    const updatedAtMs = Date.parse(capturedAt) || Date.now();
    const changes: DomainChange<T>[] = [];
    for (const row of rows) {
      const key = this.keyOf(row);
      if (!key) continue;
      const previous = this.rows.get(key);
      if (previous && previous.updatedAtMs > updatedAtMs) continue;
      const fingerprint = JSON.stringify(row);
      if (previous?.fingerprint === fingerprint) continue;
      const stored = { row: structuredClone(row), updatedAtMs, updatedAt: capturedAt, fingerprint };
      this.rows.set(key, stored);
      changes.push({ key, row: structuredClone(stored.row), updatedAt: capturedAt });
    }
    return this.emit(changes, capturedAt);
  }

  patch(key: string, patch: Partial<T>, capturedAt = new Date().toISOString()): DomainPublication<T> {
    const previous = this.rows.get(key);
    if (!previous) return this.emit([], capturedAt);
    const updatedAtMs = Date.parse(capturedAt) || Date.now();
    if (previous.updatedAtMs > updatedAtMs) return this.emit([], capturedAt);
    return this.publish([{ ...previous.row, ...patch } as T], capturedAt);
  }

  snapshot(): { domain: string; version: number; capturedAt: string | null; rows: T[] } {
    return this.projectSnapshot(row => row);
  }

  /** Internal pure projection only. Copy the projection, not discarded payloads.
   * Projectors must never mutate input; returned rows remain defensive copies.
   */
  projectSnapshot<R>(project: (row: Readonly<T>) => R): { domain: string; version: number; capturedAt: string | null; rows: R[] } {
    const values = [...this.rows.values()];
    return {
      domain: this.domain,
      version: this.version,
      capturedAt: values.length ? new Date(Math.max(...values.map((value) => value.updatedAtMs))).toISOString() : null,
      rows: values.map((value) => structuredClone(project(value.row)))
    };
  }

  subscribe(listener: (publication: DomainPublication<T>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(changes: DomainChange<T>[], capturedAt: string): DomainPublication<T> {
    if (changes.length === 0) return { domain: this.domain, version: this.version, capturedAt, changes };
    const publication = { domain: this.domain, version: ++this.version, capturedAt, changes };
    this.listeners.forEach((listener) => listener(structuredClone(publication)));
    return publication;
  }
}
