/** Numeric presentation must not coerce missing telemetry or booleans to zero. */
export function pcsNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export type PcsReadingState = "live" | "stale" | "unavailable" | "unverified";
export interface PcsProcessReading {
  value: unknown;
  readingState?: PcsReadingState;
  ageMs?: number | null;
}

export function formatPcsProcessReading(point: PcsProcessReading | undefined, unit = "", digits = 1): string {
  const value = pcsNumber(point?.value);
  if (value === null || point?.readingState === "unavailable") return "Not reported";
  const reading = `${value.toFixed(digits)}${unit ? ` ${unit}` : ""}`;
  if (point?.readingState === "live") return reading;
  if (point?.readingState === "stale") return `${reading} · stale (${Math.round((point.ageMs || 0) / 1000)}s)`;
  return `${reading} · freshness unknown`;
}
