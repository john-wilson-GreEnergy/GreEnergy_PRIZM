import type { IoLogikInventoryRow } from './iologikFleetService';
import type { IoLogikResult } from './nativeIoLogikFleet';
import { IoLogikScanStore, type IoLogikScanSnapshot } from './ioLogikScanStore';

/** Separate current inventory from the immutable last completed scan report. */
export class IoLogikInventory {
  constructor(private readonly store: IoLogikScanStore) {}

  read(scopeKey: string, lastScan: IoLogikScanSnapshot | null): IoLogikScanSnapshot | null {
    const saved = this.store.read(scopeKey);
    if (!saved || (lastScan && Date.parse(lastScan.scannedAt) > Date.parse(saved.scannedAt))) return lastScan;
    return saved;
  }

  recordVerified(scopeKey: string, lastScan: IoLogikScanSnapshot | null, result: IoLogikResult, observedAt: string) {
    if (!result.success || !result.after || !Number.isFinite(Date.parse(observedAt))) return;
    const current = this.read(scopeKey, lastScan);
    const rows = new Map((current?.rows || []).map(row => [row.ip, row]));
    const previous = rows.get(result.ip);
    if (previous && Date.parse(previous.observedAt || current!.scannedAt) >= Date.parse(observedAt)) return;
    rows.set(result.ip, {...result.after, observedAt, observationSource: 'verified-update'});
    this.store.save({schemaVersion: 1, scopeKey, kind: current?.kind || 'firmware',
      scannedAt: current?.scannedAt || observedAt, targetIps: [...rows.keys()], rows: [...rows.values()]});
  }
}

export type IoLogikScanProgress = {
  id: string; scopeKey: string; kind: 'discover' | 'firmware';
  state: 'running' | 'complete' | 'failed'; startedAt: string; completedAt?: string;
  targetIps: string[]; rows: IoLogikInventoryRow[]; error?: string;
};

/** Partial results are transient: failed scans never replace the saved inventory. */
export function projectIoLogikInventory(saved: IoLogikScanSnapshot | null, scan: IoLogikScanProgress | null) {
  const rows = new Map<string, IoLogikInventoryRow>((saved?.rows || []).map(row => [row.ip, {
    ...row, observedAt: row.observedAt || saved!.scannedAt, observationSource: row.observationSource || 'scan' as const,
  }]));
  if (scan?.state === 'running') scan.rows.forEach(row => rows.set(row.ip, row));
  return [...rows.values()];
}
