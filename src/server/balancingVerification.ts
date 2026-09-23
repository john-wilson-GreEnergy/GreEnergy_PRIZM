// Read-only verification: this module cannot dispatch or retry equipment commands.
export type SettingsRequest = {mode: "avg" | "provided" | "stop"; chargingDeadband?: number; dischargingDeadband?: number; providedMv?: number};
export type BpcSettings = {bpc: number; mode: string | null; chargeDeadband: number | null; dischargeDeadband: number | null; providedVoltageTarget: number | null};
export type StringVerification = {
  array: number; string: number; acceptedAt: number; expectedBpcs: number;
  status: "pending" | "matched" | "persisted" | "mismatch" | "changed" | "unavailable" | "not-accepted";
  detail: string; checkedAt?: number; sourceAt?: number; matchedAt?: number;
  bpcs?: BpcSettings[];
};
export type BalancingVerificationJob = {
  id: string; status: "pending" | "complete"; createdAt: number; updatedAt: number;
  request: SettingsRequest; strings: StringVerification[];
};
type Pack = {bpIndex?: unknown; batteryPackIndex?: unknown; timeStamp?: unknown; batteryPackData?: Record<string, unknown>; batteryPackBalancingConfiguration?: Record<string, unknown>; balancingConfiguration?: Record<string, unknown>};
type Report = {timeStamp?: unknown; batteryPackReportList?: Pack[]; stringData?: {batteryPackReportList?: Pack[]}};
function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value); return Number.isFinite(n) ? n : null;
}
export function extractBpcBalancingSettings(report: Report): BpcSettings[] {
  const packs = report?.batteryPackReportList ?? report?.stringData?.batteryPackReportList;
  if (!Array.isArray(packs)) return [];
  return packs.map((pack, index) => {
    const data = pack.batteryPackData ?? pack;
    const config = (data.batteryPackBalancingConfiguration ?? pack.batteryPackBalancingConfiguration ?? data.balancingConfiguration ?? pack.balancingConfiguration ?? {}) as Record<string, unknown>;
    return {bpc: Number(pack.bpIndex ?? pack.batteryPackIndex ?? index + 1), mode: config.balancingMode == null ? null : String(config.balancingMode),
      chargeDeadband: numberOrNull(config.chargeDeadband), dischargeDeadband: numberOrNull(config.dischargeDeadband), providedVoltageTarget: numberOrNull(config.providedVoltageTarget)};
  });
}
export function bpcSettingsMatchRequest(bpcs: BpcSettings[], req: SettingsRequest): boolean {
  if (req.mode === "stop" || !bpcs.length || !bpcs.every(b => b.chargeDeadband === req.chargingDeadband && b.dischargeDeadband === req.dischargingDeadband)) return false;
  if (req.mode === "provided") return bpcs.every(b => b.mode === "BALANCE_TO_PROVIDED" && b.providedVoltageTarget === req.providedMv);
  if (bpcs.every(b => b.mode === "BALANCE_TO_AVERAGE")) return true;
  // Average is resolved by EMS into Provided. A rolling update was observed
  // straddling adjacent integer-mV targets. This tolerance applies ONLY to avg;
  // it never loosens the commanded deadbands or an explicit provided target.
  const targets = bpcs.map(b => b.providedVoltageTarget);
  return bpcs.every(b => b.mode === "BALANCE_TO_PROVIDED" && b.providedVoltageTarget !== null && b.providedVoltageTarget >= 2500 && b.providedVoltageTarget <= 3800)
    && Math.max(...targets as number[]) - Math.min(...targets as number[]) <= 1;
}
export type SettingsObservation = {status: "matched" | "mismatch" | "unavailable"; detail: string; sourceAt?: number; bpcs?: BpcSettings[]};
export function assessBalancingReport(report: Report, req: SettingsRequest, row: StringVerification, now: number): SettingsObservation {
  const packs = report?.batteryPackReportList ?? report?.stringData?.batteryPackReportList ?? [];
  const bpcs = extractBpcBalancingSettings(report);
  const times = [report.timeStamp, ...packs.map(p => p.timeStamp)].map(numberOrNull);
  const sourceAt = times.every(t => t !== null) ? Math.min(...times as number[]) : undefined;
  if (!row.expectedBpcs || bpcs.length !== row.expectedBpcs || new Set(bpcs.map(b => b.bpc)).size !== bpcs.length || bpcs.some(b => !Number.isInteger(b.bpc) || b.bpc < 1 || b.bpc > row.expectedBpcs))
    return {status: "unavailable", detail: `Incomplete BPC coverage (${bpcs.length}/${row.expectedBpcs || "unknown"})`, bpcs, sourceAt};
  // A fresh HTTP response alone is not fresh equipment telemetry.
  if (sourceAt === undefined || sourceAt < row.acceptedAt || now - sourceAt > 30_000 || times.some(t => t! > now + 5000))
    return {status: "unavailable", detail: "Waiting for fresh post-command BPC timestamps", bpcs, sourceAt};
  if (bpcs.some(b => b.mode === null || b.chargeDeadband === null || b.dischargeDeadband === null))
    return {status: "unavailable", detail: "BPC settings are incomplete", bpcs, sourceAt};
  const matched = bpcSettingsMatchRequest(bpcs, req);
  const observed = [...new Set(bpcs.map(b => `${b.mode}: ${b.chargeDeadband}/${b.dischargeDeadband} mV`))].join("; ");
  return {status: matched ? "matched" : "mismatch", detail: matched ? "All BPC settings match; this does not prove active shunting" : `Observed ${observed}`, bpcs, sourceAt};
}
export function summarizeBalancingVerification(job: BalancingVerificationJob) {
  const count = (states: StringVerification["status"][]) => job.strings.filter(s => states.includes(s.status)).length;
  return {total: job.strings.length, verified: count(["matched", "persisted"]), persisted: count(["persisted"]), pending: count(["pending"]), unresolved: count(["mismatch", "changed", "unavailable", "not-accepted"])};
}
export const DEFAULT_VERIFICATION_TIMING = {settleMs: 180_000, persistenceMs: 65_000, recoveryMs: 30_000, intervalMs: 5000};
export function applySettingsObservation(row: StringVerification, observation: SettingsObservation, now: number, timing = DEFAULT_VERIFICATION_TIMING): void {
  Object.assign(row, {checkedAt: now, sourceAt: observation.sourceAt, bpcs: observation.bpcs, detail: observation.detail});
  if (observation.status === "matched") {
    row.matchedAt ??= now;
    // Persistence requires a later source observation, not the same cached match.
    row.status = now >= row.matchedAt + timing.persistenceMs && (observation.sourceAt ?? 0) >= row.matchedAt + timing.persistenceMs ? "persisted" : "matched";
    if (row.status === "matched" && now >= row.matchedAt + timing.persistenceMs + timing.recoveryMs) {
      row.status = "unavailable"; row.detail = "No new BPC sample for persistence confirmation";
    }
  } else {
    const deadline = row.matchedAt === undefined ? row.acceptedAt + timing.settleMs : row.matchedAt + timing.persistenceMs + timing.recoveryMs;
    row.status = now < deadline ? "pending" : observation.status === "unavailable" ? "unavailable" : row.matchedAt === undefined ? "mismatch" : "changed";
  }
}
export function createReadLimiter(limit = 4) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async function limited<T>(read: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>(resolve => waiting.push(resolve));
    else active++;
    try {return await read();} finally {const next = waiting.shift(); if (next) next(); else active--;}
  };
}
// Shared across jobs, so array fan-out cannot turn into 8 x 12 simultaneous reads.
export const limitBalancingRead = createReadLimiter(4);
export async function runBalancingVerification(job: BalancingVerificationJob, read: (row: StringVerification) => Promise<SettingsObservation>, options: {
  now?: () => number; wait?: (ms: number) => Promise<void>; timing?: typeof DEFAULT_VERIFICATION_TIMING;
} = {}) {
  const now = options.now ?? Date.now;
  const wait = options.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const timing = options.timing ?? DEFAULT_VERIFICATION_TIMING;
  while (job.status === "pending") {
    const remaining = job.strings.filter(row => row.status === "pending" || row.status === "matched");
    if (!remaining.length) {job.status = "complete"; break;}
    const due = remaining.filter(row => row.status !== "matched" || now() >= row.matchedAt! + timing.persistenceMs);
    // Bound scheduling as well as sockets. Do not queue hundreds of stale reads.
    for (let i = 0; i < due.length; i += 4) {
      await Promise.all(due.slice(i, i + 4).map(async row => {
        let observation: SettingsObservation;
        try {observation = await limitBalancingRead(() => read(row));}
        catch {observation = {status: "unavailable", detail: "BPC settings could not be read"};}
        applySettingsObservation(row, observation, now(), timing);
      }));
      job.updatedAt = now();
    }
    if (job.strings.every(row => !["pending", "matched"].includes(row.status))) job.status = "complete";
    else await wait(timing.intervalMs);
  }
  job.updatedAt = now();
}
