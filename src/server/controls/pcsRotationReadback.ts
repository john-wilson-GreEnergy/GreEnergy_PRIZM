import { normalizePcsRow } from '../normalizers/pcsNormalizer';

type Row = Record<string, unknown>;
const object = (value: unknown): Row | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : null;
export function pcsRowsFromBlock(payload: unknown): Row[] {
  const root = object(payload);
  const block = object(root?.blockReport) ?? root;
  if (!block || [root, block].some(value => value?.staleData === true || value?.source === 'demo' || value?.source === 'cached' || value?.source === 'offline')) return [];
  if (Array.isArray(block.arrayPcsList) && block.arrayPcsList.length) return block.arrayPcsList.map(object).filter((row): row is Row => !!row);
  if (!Array.isArray(block.arrays)) return [];
  return block.arrays.flatMap(value => {
    const array = object(value);
    const rows = array?.pcses ?? array?.pcs ?? array?.arrayPcs;
    if (!array || !Array.isArray(rows)) return [];
    return rows.flatMap(value => {
      const row = object(value);
      return row ? [{ ...row, arrayIndex: array.arrayIndex ?? array.arrayNumber ?? array.id,
        pcsIndex: row.arrayPcsIndex ?? row.pcsIndex ?? row.index ?? row.pcsNum }] : [];
    });
  });
}

/** The per-PCS report exposes explicit rotation; blockviewer only inventories PCS. */
export function pcsRowFromReport(payload: unknown, array: number, pcs: number): Row | null {
  const root = object(payload), data = object(root?.arrayPcsData);
  if (!root || !data || [root, data].some(r => r.staleData === true || r.badReport === true || r.source === 'cached' || r.source === 'demo' || r.source === 'offline')) return null;
  if ((data.arrayIndex !== undefined && Number(data.arrayIndex) !== array) ||
      (data.arrayPcsIndex !== undefined && Number(data.arrayPcsIndex) !== pcs)) return null;
  const rawTime = root.timeStamp ?? root.timestampUtc;
  const ms = typeof rawTime === 'number' || (typeof rawTime === 'string' && /^\d+$/.test(rawTime))
    ? Number(rawTime) : Date.parse(String(rawTime));
  if (!Number.isFinite(ms) || ms <= 0 || ms > Date.now() + 5000) return null;
  return {...data, arrayIndex: array, pcsIndex: pcs, sourceTimestampUtc: new Date(ms).toISOString()};
}

export function assessPcsRotation(rows: Row[], array: number, expectedIds: number[], action: 'in' | 'out', dispatchedAt: number): boolean | null {
  if (!expectedIds.length || expectedIds.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(expectedIds).size !== expectedIds.length) return null;
  const matches: (boolean | null)[] = expectedIds.map(id => {
    const found = rows.filter(row => Number(row.arrayIndex ?? row.arrayNumber) === array && Number(row.pcsIndex ?? row.arrayPcsIndex) === id);
    if (found.length !== 1) return null;
    const raw = found[0];
    if (raw.staleData === true || raw.badReport === true || raw.source === 'demo' || raw.source === 'cached') return null;
    const timestamp = raw.sourceTimestampUtc ?? raw.timestampUtc;
    if (timestamp !== undefined && (!Number.isFinite(Date.parse(String(timestamp))) || Date.parse(String(timestamp)) <= dispatchedAt || Date.parse(String(timestamp)) > Date.now() + 5000)) return null;
    const row = normalizePcsRow(raw);
    if (row.communicating === false || row.inRotation === null || row.inRotation === row.outRotation) return null;
    return row.inRotation === (action === 'in');
  });
  return matches.some(value => value === null) ? null : matches.every(Boolean);
}

export function rotationOutcome<T extends { accepted: boolean; readbackConfirmed: boolean | null }>(results: T[]) {
  const acceptedCount = results.filter(row => row.accepted).length;
  const verifiedCount = results.filter(row => row.accepted && row.readbackConfirmed === true).length;
  return { success: results.length > 0 && verifiedCount === results.length,
    accepted: results.length > 0 && acceptedCount === results.length,
    acceptedCount, verifiedCount, results };
}
