import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IoLogikInventoryRow } from './iologikFleetService';

export type IoLogikScanSnapshot = {
  schemaVersion: 1; scopeKey: string; kind: 'discover' | 'firmware';
  scannedAt: string; targetIps: string[]; rows: IoLogikInventoryRow[];
};
/** One completed scan, atomically replaced. No credentials or raw device exports. */
export class IoLogikScanStore {
  constructor(private readonly file: string) {}
  read(scopeKey: string): IoLogikScanSnapshot | null {
    try {
      const value = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (value.schemaVersion !== 1 || value.scopeKey !== scopeKey || !['discover', 'firmware'].includes(value.kind) ||
          typeof value.scannedAt !== 'string' || !Number.isFinite(Date.parse(value.scannedAt)) ||
          !Array.isArray(value.rows) || !Array.isArray(value.targetIps) || value.rows.length !== value.targetIps.length ||
          new Set(value.targetIps).size !== value.targetIps.length ||
          value.rows.some((r: IoLogikInventoryRow, i: number) => !r || r.ip !== value.targetIps[i] || typeof r.label !== 'string' || typeof r.result !== 'string')) return null;
      return value;
    } catch { return null; }
  }
  save(snapshot: IoLogikScanSnapshot): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    // Explicit field selection prevents request credentials from entering persisted rows.
    const rows = snapshot.rows.map(({ip,arrayIndex,segmentIndex,label,pingOk,httpOk,reachable,firmware,firmwareRaw,result,do00Safe,do00PeerSafe,watchdogSeconds,configurationStatus,configurationDetail,observedAt,observationSource}) =>
      ({ip,arrayIndex,segmentIndex,label,pingOk,httpOk,reachable,firmware,firmwareRaw,result,do00Safe,do00PeerSafe,watchdogSeconds,configurationStatus,configurationDetail,observedAt,observationSource}));
    try {
      fs.writeFileSync(temporary, JSON.stringify({schemaVersion:1,scopeKey:snapshot.scopeKey,kind:snapshot.kind,scannedAt:snapshot.scannedAt,targetIps:rows.map(r=>r.ip),rows}), { mode: 0o600, flag: 'wx' });
      fs.renameSync(temporary, this.file);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
}
