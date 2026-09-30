import { stringDomainBroker } from "./stringDomainBroker";
import { normalizeContactorStateFromStringviewer, summarize, type NormalizedContactorState } from "../contactorStateEngine";

/** Normalize the canonical row without renewing its observation timestamp. */
export function contactorStateFromCanonicalRow(row: any, now = Date.now()): NormalizedContactorState {
  const fetchedAt = row.contactor?.fetchedAt ?? row.timestampUtc ?? row.sourceTimestampUtc ?? "";
  const age = now - Date.parse(fetchedAt);
  const state = normalizeContactorStateFromStringviewer(Number(row.arrayNumber ?? row.arrayIndex), Number(row.stringNumber ?? row.stringIndex), "canonical-string-broker", row);
  return {...state, fetchedAt, source:"canonical-string-broker",
    quality: row.communicating === true && row.stale !== true && Number.isFinite(age) && age >= 0 && age <= 30_000 ? "live" : "failed"};
}

/** Cached canonical view only: requests never perform device acquisition. */
export function getContactorStateView(now = Date.now()) {
  const snapshot = stringDomainBroker.snapshot();
  const states = snapshot.rows.map(row => contactorStateFromCanonicalRow(row, now));
  const timestamps = states.map(state => Date.parse(state.fetchedAt));
  const oldest = timestamps.length && timestamps.every(Number.isFinite) ? Math.min(...timestamps) : null;
  return { success:true, states, summary:{...summarize(states),source:"canonical-string-broker",fetchedAt:oldest === null ? null : new Date(oldest).toISOString()},
    hasSnapshot:states.length > 0, ageMs:oldest === null ? null : now-oldest, fetchedAtMs:oldest,
    stale:states.length === 0 || states.some(state => state.quality !== "live"), brokerVersion:snapshot.version,
    refreshPolicy:"background-only" as const };
}
