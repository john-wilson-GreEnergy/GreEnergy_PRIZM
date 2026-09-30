import {finiteReading, type TimelineObservation} from "./operationalTimelineModel";

export type BalancingSample = {
  spreadMv: number | null; minMv: number | null; maxMv: number | null; averageMv: number | null;
  currentA: number | null; activeBpcs: number | null; activity: string;
  chargeDeadband: string; dischargeDeadband: string; target: string; activeCells: string;
};
type Bpc = {bpIndex?: number; bpcNumber?: number; balanceTelemetryPresent?: boolean; missingFromSource?: boolean;
  state?: string; chargeDeadband?: number | null; dischargeDeadband?: number | null; providedVoltageTarget?: number | null;
  balancingCellGroup?: number | null; activeCellVoltage?: number | null};
export type BalancingString = {minCellVoltageMv?: number | null; maxCellVoltageMv?: number | null; avgCellVoltageMv?: number | null;
  currentA?: number | null; balanceTelemetryAvailable?: boolean; balanceDetails?: Bpc[]; balanceMode?: string};
const nonnegative = (value: unknown) => {const n = finiteReading(value); return n !== null && n >= 0 ? n : null;};
const setting = (rows: Bpc[], key: "chargeDeadband" | "dischargeDeadband" | "providedVoltageTarget") => {
  const values = rows.map(row => row.missingFromSource || !row.balanceTelemetryPresent ? null : nonnegative(row[key]));
  if (!values.length || values.some(value => value === null)) return "Unknown / incomplete";
  return new Set(values).size === 1 ? `${values[0]} mV` : "Mixed";
};
// Only canonical, explicitly mV fields. Never infer an active cell's voltage from the target or string average.
export function projectBalancingProgress(row: BalancingString): BalancingSample {
  const minMv = nonnegative(row.minCellVoltageMv), maxMv = nonnegative(row.maxCellVoltageMv);
  const bpcs = row.balanceTelemetryAvailable === true ? (row.balanceDetails || []).slice(0, 64) : [];
  const active = bpcs.filter(b => b.balanceTelemetryPresent && !b.missingFromSource && ["Charging", "Discharging"].includes(b.state || ""));
  const complete = bpcs.length > 0 && bpcs.every(b => b.balanceTelemetryPresent && !b.missingFromSource && ["Charging", "Discharging", "Off"].includes(b.state || ""));
  return {minMv, maxMv, averageMv: nonnegative(row.avgCellVoltageMv),
    spreadMv: minMv !== null && maxMv !== null && maxMv >= minMv ? Number((maxMv - minMv).toFixed(3)) : null,
    currentA: finiteReading(row.currentA), activeBpcs: complete ? active.length : null,
    activity: active.length ? `Activity observed on ${active.length} BPC(s)${complete ? "" : "; other BPC states unknown"}` : complete ? "No activity observed — not a failure diagnosis" : "Activity telemetry incomplete",
    chargeDeadband: setting(bpcs, "chargeDeadband"), dischargeDeadband: setting(bpcs, "dischargeDeadband"), target: setting(bpcs, "providedVoltageTarget"),
    activeCells: active.map(b => `BPC ${b.bpcNumber ?? b.bpIndex ?? "?"} / cell ${b.balancingCellGroup ?? "?"}: ${b.state}, ${nonnegative(b.activeCellVoltage) === null ? "voltage unavailable" : `${b.activeCellVoltage} mV`}`).join("; ") || "No active cells observed / unavailable"};
}
export type BalancingProgressReport = {
  rows: {string: number; at: number | null; fresh: boolean; mode: string; rotation: string; sample: BalancingSample | null;
    trend: string; baselineAt: number | null; baselineMv: number | null; changeMv: number | null}[];
  points: {at: number; spreadMv: number | null}[];
  adb: string;
};
type Run = {latest: TimelineObservation; first: TimelineObservation; count: number};
export class BalancingProgressReview {
  private runs = new Map<number, Run>();
  private points = new Map<number, BalancingProgressReport["points"][number]>();
  private adb = new Map<string, TimelineObservation>();
  constructor(private now: number, private selectedString: number | null) {}
  add(o: TimelineObservation) {
    if (o.stream === "ems-app" && o.entity.startsWith("ems-app:ADB0001:")) {
      const prev = this.adb.get(o.entity);
      if (!prev || o.observedAt > prev.observedAt) this.adb.set(o.entity, o);
    }
    if (o.stream !== "string-state" || !o.string || !o.balancing) return;
    const prior = this.runs.get(o.string);
    if (prior && o.observedAt <= prior.latest.observedAt) return;
    const valid = o.quality === "live" && o.sourceAt != null && o.balancing.spreadMv !== null;
    const signature = (r: TimelineObservation) => JSON.stringify([r.values.Rotation, r.values["Balancing mode"], r.balancing?.chargeDeadband, r.balancing?.dischargeDeadband, r.balancing?.target]);
    const continuous = valid && prior?.latest.quality === "live" && prior.latest.balancing?.spreadMv != null
      && o.source === prior.latest.source && o.sourceAt! > prior.latest.sourceAt! && o.sourceAt! - prior.latest.sourceAt! <= 120_000 && signature(o) === signature(prior.latest);
    this.runs.set(o.string, {latest: o, first: continuous ? prior!.first : o, count: continuous ? prior!.count + 1 : 1});
    if (o.string === this.selectedString) this.points.set(Math.floor(o.observedAt / 60_000), {at: valid ? o.sourceAt! : o.observedAt, spreadMv: valid ? o.balancing.spreadMv : null});
  }
  finish(): BalancingProgressReport {
    const fresh = (o: TimelineObservation) => o.quality === "live" && o.sourceAt != null && this.now - o.sourceAt <= 120_000 && o.sourceAt <= this.now + 30_000;
    const apps = [...this.adb.values()];
    const adb = !apps.length || apps.some(o => !fresh(o) || !["ENABLED", "DISABLED"].includes(String(o.values["Reported enabled"]))) ? "Unknown / stale" : apps.some(o => o.values["Reported enabled"] === "ENABLED") ? "Enabled" : "Disabled";
    const rows = [...this.runs.entries()].sort(([a], [b]) => a - b).map(([string, run]) => {
      const {latest, first, count} = run, sample = latest.balancing!;
      const usable = fresh(latest), compared = usable && count >= 3 && latest.sourceAt! - first.sourceAt! >= 120_000 && sample.spreadMv !== null;
      const changeMv = compared ? Number((sample.spreadMv! - first.balancing!.spreadMv!).toFixed(3)) : null;
      return {string, at: latest.sourceAt, fresh: usable, mode: String(latest.values["Balancing mode"] ?? "Unknown"), rotation: String(latest.values.Rotation ?? "Unknown"), sample: usable ? sample : null,
        trend: !usable ? "Telemetry unavailable / stale" : changeMv === null ? "Collecting comparable observations" : changeMv < 0 ? "Spread decreased" : changeMv > 0 ? "Spread increased" : "Spread unchanged",
        baselineAt: compared ? first.sourceAt : null, baselineMv: compared ? first.balancing!.spreadMv : null, changeMv};
    });
    return {rows, points: [...this.points.values()].sort((a, b) => a.at - b.at), adb};
  }
}
