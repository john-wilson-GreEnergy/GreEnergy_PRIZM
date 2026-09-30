import { pcsNumber, type PcsReadingState } from "../../lib/pcsReading";

/** Independent PCS reads finish out of order. Keep a dense, identity-keyed
 * publication; array-index assignment creates holes that spread into undefined.
 */
export function mergePcsReading<T extends {arrayIndex: number}>(rows: readonly (T | null | undefined)[], reading: T): T[] {
  return [...rows.filter((row): row is T => row != null && row.arrayIndex !== reading.arrayIndex), reading]
    .sort((a, b) => a.arrayIndex - b.arrayIndex);
}

export function qualifyPcsProcessPoint<T extends { value: unknown; quality: unknown; timestamp: unknown; receivedAt?: number; isConfiguration?: boolean; id?: number }>(point: T, now = Date.now(), staleAfterMs = 120_000) {
  const stamp = pcsNumber(point.timestamp);
  // SMA web process timestamps are epoch seconds; accept explicit epoch ms too.
  const observedAtMs = stamp !== null && stamp > 0 ? (stamp < 100_000_000_000 ? stamp * 1000 : stamp) : null;
  // Configuration responses explicitly declare _isProcessData=false and omit
  // process quality/timestamps. Firmware identity is also static. Their freshness
  // is the successful read time, not the time the value last changed/rebooted.
  const metadata = point.isConfiguration === true || point.id === 4853;
  const freshnessAt = metadata ? pcsNumber(point.receivedAt) : observedAtMs;
  const ageMs = freshnessAt === null ? null : now - freshnessAt;
  const numeric = pcsNumber(point.value);
  let readingState: PcsReadingState = "live";
  if (numeric === null || (pcsNumber(point.quality) !== 0 && !(point.isConfiguration === true && point.quality == null))) readingState = "unavailable";
  else if (ageMs === null || ageMs < -30_000) readingState = "unverified";
  else if (ageMs > staleAfterMs) readingState = "stale";
  return { ...point, value: readingState === "unavailable" ? null : numeric, readingState, ageMs, freshnessBasis: metadata ? "retrieval" : "observation",
    observedAt: observedAtMs !== null && Number.isFinite(observedAtMs) && Math.abs(observedAtMs) < 8.64e15 ? new Date(observedAtMs).toISOString() : null };
}

export function pcsSourceLabel(emsModbus: boolean, directSource: string | null | undefined, directFresh: boolean, fallback?: string) {
  const sources = emsModbus ? ["EMS Modbus"] : [];
  if (directFresh && directSource === "SMA_WEB_PROCESS_DATA") sources.push("SMA HTTP");
  if (directFresh && directSource === "SMA_MODBUS") sources.push("direct PCS Modbus");
  return sources.join(" + ") || fallback || "No fresh PCS source";
}
