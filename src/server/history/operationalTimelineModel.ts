import type {BalancingSample, BalancingProgressReport} from "./balancingProgress";
// Canonical, source-separated observations. No acquisition and no control writes.
export type TimelineObservation = {
  entity: string; array: number; scope?: "block"; string?: number; label: string; stream: "electrical" | "pcs-status" | "string-state" | "ems-app" | "command";
  source: string; sourceAt: number | null; observedAt: number; quality: "live" | "unavailable";
  values: Record<string, number | string | null>;
  balancing?: BalancingSample;
};
export type TimelineBatch = {site: {id: string; label: string}; observations: TimelineObservation[]};
export type TimelineEvent = {at: number; label: string; source: string; message: string; kind?: "state" | "command"; string?: number; commandId?: string};
export type TimelineReport = {
  from: number; to: number; site: string; array: number; samples: number;
  events: TimelineEvent[]; eventsTruncated: boolean;
  points: {at: number; label: string; kw: number | null; kvar: number | null; dcV: number | null; dcA: number | null}[];
  coverage: {label: string; stream: string; coverage: string; longestGap: string}[];
  strings?: number[]; selectedString?: number | null;
  balancing?: BalancingProgressReport;
};
export const finiteReading = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
export function timelineChanges(previous: TimelineObservation | undefined, current: TimelineObservation): TimelineEvent[] {
  const event = (message: string): TimelineEvent => ({at: current.observedAt, label: current.label, source: current.source, message, kind: current.stream === "command" ? "command" : "state", string: current.string});
  if (current.stream === "command") return [{...event(String(current.values.Summary)), commandId: String(current.values.commandId)}];
  const baseline = () => current.quality === "live" && current.stream !== "electrical"
    ? [event(`Observed status: ${Object.entries(current.values).map(([key, value]) => `${key}: ${value ?? "Unknown"}`).join("; ")}`)] : [];
  if (!previous) return [event(`${current.stream}: first observation (${current.quality}); prior state unknown`), ...baseline()];
  if (previous.quality !== current.quality) return [event(`${current.stream}: ${current.quality === "live" ? "telemetry restored; intervening states unknown" : "telemetry unavailable"}`), ...baseline()];
  if (current.quality !== "live" || current.stream === "electrical") return [];
  if (current.source !== previous.source || current.observedAt - previous.observedAt > 120_000) return [event("Status observation resumed; intervening states unknown"), ...baseline()];
  return Object.entries(current.values).flatMap(([field, value]) => value !== previous.values[field]
    ? [event(`${field}: ${previous.values[field] ?? "Unknown"} → ${value ?? "Unknown"}`)] : []);
}
