import type {TimelineObservation} from "./operationalTimelineModel";
import {projectBalancingProgress, type BalancingString} from "./balancingProgress";
type CanonicalString = BalancingString & {
  arrayNumber?: number; arrayIndex?: number; stringNumber?: number; stringIndex?: number;
  positiveContactorClosed?: boolean | null; negativeContactorClosed?: boolean | null;
  contactorsCloseExpected?: boolean | null; inRotation?: boolean | null; communicating?: boolean | null;
  sourceTimestampUtc?: string; sourceDebug?: {stale?: boolean; sourceStatus?: string};
};
const state = (value: unknown, yes: string, no: string) => value === true ? yes : value === false ? no : null;
// Consume canonical rows only. A publication time is never substituted for missing source freshness.
export function projectStringTimeline(rows: CanonicalString[], observedAt: number, sourceLive = true): TimelineObservation[] {
  return rows.flatMap(row => {
    const array = row.arrayNumber ?? row.arrayIndex, string = row.stringNumber ?? row.stringIndex;
    if (!Number.isInteger(array) || !Number.isInteger(string) || array! < 1 || string! < 1) return [];
    const at = row.sourceTimestampUtc ? Date.parse(row.sourceTimestampUtc) : NaN;
    const balancing = process.env.PRIZM_BALANCING_PROGRESS_ENABLED === "false" ? undefined : projectBalancingProgress(row);
    return [{entity: `string:${array}:${string}`, array: array!, string: string!, label: `Array ${array} · String ${string}`, stream: "string-state",
      source: "Canonical EMS string telemetry", sourceAt: Number.isFinite(at) ? at : null, observedAt, balancing,
      quality: !sourceLive || row.sourceDebug?.stale === true || row.sourceDebug?.sourceStatus !== "live" || row.communicating !== true ? "unavailable" : "live",
      values: {"Positive contactor": state(row.positiveContactorClosed, "CLOSED", "OPEN"), "Negative contactor": state(row.negativeContactorClosed, "CLOSED", "OPEN"),
        "EMS close request": state(row.contactorsCloseExpected, "CLOSE", "OPEN"), "Rotation": state(row.inRotation, "IN", "OUT"),
        ...(balancing ? {"Balancing mode": row.balanceTelemetryAvailable === true && row.balanceMode !== "--" ? row.balanceMode ?? null : null,
          "Charge deadband": balancing.chargeDeadband, "Discharge deadband": balancing.dischargeDeadband} : {})}}];
  });
}
