import type {TimelineObservation} from "./operationalTimelineModel";

type NotificationTarget = {
  arrayIndex?: unknown;
  stringIndex?: unknown;
  batteryPackIndex?: unknown;
  bpcIndex?: unknown;
  cellGroupIndex?: unknown;
  cgIndex?: unknown;
};

const integer = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const text = (value: unknown, fallback: string) => {
  const result = String(value ?? "").trim();
  return result || fallback;
};

/**
 * Projects the canonical corrective-action publication into observed notification
 * sets. A changed set records raises and clears without inventing native EMS
 * lifecycle timestamps that the current endpoint does not supply.
 */
export function projectNotificationTimeline(actions: unknown, observedAt: number, arrayIndices: number[] = []): TimelineObservation[] {
  const byArray = new Map<number, {alarms: string[]; warnings: string[]; info: string[]}>();
  const block = {alarms: [] as string[], warnings: [] as string[], info: [] as string[]};
  for (const action of Array.isArray(actions) ? actions : []) {
    const row = action as Record<string, unknown>;
    const severityText = text(row.severity ?? row.level, "info").toLowerCase();
    const severity = severityText.includes("alarm") || severityText.includes("critical") || severityText.includes("fault")
      ? "alarms" : severityText.includes("warn") ? "warnings" : "info";
    const code = text(row.code ?? row.rawCode ?? row.faultCode, "unknown");
    const name = text(row.faultName ?? row.faultLabel ?? row.name ?? row.title, `Code ${code}`);
    const targets = Array.isArray(row.affectedTargets) ? row.affectedTargets
      : Array.isArray(row.affected) ? row.affected : [row];
    for (const candidate of targets) {
      const target = (candidate && typeof candidate === "object" ? candidate : {}) as NotificationTarget;
      const array = integer(target.arrayIndex ?? row.arrayIndex);
      const string = integer(target.stringIndex ?? row.stringIndex);
      const bpc = integer(target.batteryPackIndex ?? target.bpcIndex ?? row.batteryPackIndex);
      const cell = integer(target.cellGroupIndex ?? target.cgIndex ?? row.cellGroupIndex);
      const identity = [code, name, array ? `A${array}` : "site", string ? `S${string}` : "", bpc ? `B${bpc}` : "", cell ? `C${cell}` : ""].filter(Boolean).join(" · ");
      block[severity].push(identity);
      if (array) {
        const bucket = byArray.get(array) ?? {alarms: [], warnings: [], info: []};
        bucket[severity].push(identity);
        byArray.set(array, bucket);
      }
    }
  }
  const observation = (array: number, scope: "block" | undefined, label: string, values: typeof block): TimelineObservation => {
    const unique = (items: string[]) => [...new Set(items)].sort();
    const alarms = unique(values.alarms), warnings = unique(values.warnings), info = unique(values.info);
    return {
      entity: array ? `notifications:array:${array}` : "notifications:block",
      array, scope, label, stream: "notifications", source: "Canonical EMS notifications",
      sourceAt: observedAt, observedAt, quality: "live",
      values: {
        "Alarm count": alarms.length,
        "Warning count": warnings.length,
        "Info count": info.length,
        "Active notifications": JSON.stringify([...alarms, ...warnings, ...info]),
      },
    };
  };
  const arrays = [...new Set([...arrayIndices.filter(value => Number.isInteger(value) && value > 0), ...byArray.keys()])].sort((a, b) => a - b);
  return [observation(0, "block", "Site notifications", block),
    ...arrays.map(array => observation(array, undefined, `Array ${array} notifications`, byArray.get(array) ?? {alarms: [], warnings: [], info: []}))];
}
