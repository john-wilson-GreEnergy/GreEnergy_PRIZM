export type ExportMetric = {id: string; label: string; unit?: string};
export type ExportTarget = {
  source: "power" | "cells" | "hvac";
  id: string;
  label: string;
  array?: number;
  metrics: ExportMetric[];
  bpcs?: number;
  cells?: number;
};
export type ExportSelection = {
  source: ExportTarget["source"];
  target: string;
  metrics: string[];
  bpc?: number;
  cell?: number;
};

export type WindowPreset = "last-friday" | "yesterday" | "today" | "24-hours" | "7-days";
export type ExportMode = "snapshot" | "range";

export function toLocalInput(value: number | Date): string {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function presetWindow(preset: WindowPreset, now = new Date()): {from: Date; to: Date} {
  const end = new Date(now);
  if (preset === "24-hours") return {from: new Date(end.getTime() - 86_400_000), to: end};
  if (preset === "7-days") return {from: new Date(end.getTime() - 7 * 86_400_000), to: end};

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (preset === "today") return {from: start, to: end};
  if (preset === "yesterday") {
    start.setDate(start.getDate() - 1);
    const to = new Date(start);
    to.setDate(to.getDate() + 1);
    return {from: start, to};
  }

  // Use the most recent completed Friday, not a partial current Friday.
  let daysBack = (start.getDay() - 5 + 7) % 7;
  if (daysBack === 0) daysBack = 7;
  start.setDate(start.getDate() - daysBack);
  const to = new Date(start);
  to.setDate(to.getDate() + 1);
  return {from: start, to};
}

/** A snapshot keeps actual recorder timestamps inside a narrow evidence window. */
export function snapshotWindow(at: number, now = Date.now(), radiusMs = 60_000) {
  if (!Number.isFinite(at) || !Number.isFinite(now) || radiusMs < 1_000) throw new Error("Choose a valid snapshot time");
  const to = Math.min(now, at + radiusMs);
  const from = Math.max(0, Math.min(at - radiusMs, to - 1_000));
  return {from, to, at};
}

const commandMetric = (metric: ExportMetric) => {
  const text = `${metric.id} ${metric.label}`.toLowerCase();
  return text.includes("setpoint") || text.includes("power command") || text.includes("reported enabled") ||
    text.includes("application enabled");
};

const targetArray = (target: ExportTarget) => target.array ?? Number(/array\s+(\d+)/i.exec(target.label)?.[1]);
const inScope = (target: ExportTarget, arrays?: number[]) => !arrays || arrays.includes(targetArray(target));

export function powerCommandSelections(targets: ExportTarget[], arrays?: number[]): ExportSelection[] {
  return targets
    .filter(target => target.source === "power" && inScope(target, arrays))
    .map(target => ({
      source: "power" as const,
      target: target.id,
      metrics: target.metrics.filter(commandMetric).map(metric => metric.id),
    }))
    .filter(selection => selection.metrics.length > 0)
    .slice(0, 32);
}

export function powerMovementSelections(targets: ExportTarget[], arrays?: number[]): ExportSelection[] {
  return targets
    .filter(target => target.source === "power" && inScope(target, arrays))
    .map(target => ({
      source: "power" as const,
      target: target.id,
      metrics: target.metrics
        .filter(metric => ["kw", "kvar", "dcV", "dcA"].includes(metric.id))
        .map(metric => metric.id),
    }))
    .filter(selection => selection.metrics.length > 0)
    .slice(0, 32);
}

export function powerComparisonSelections(targets: ExportTarget[], arrays?: number[]): ExportSelection[] {
  return [...powerCommandSelections(targets, arrays), ...powerMovementSelections(targets, arrays)].slice(0, 32);
}
