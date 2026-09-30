import type { NormalizedContactorState } from "../contactorStateEngine";

/** A notification alone does not establish a failed close or a safe voltage wait. */
export function assessContactorOpen(state: NormalizedContactorState | undefined, now = Date.now(), hasActiveAlarm = false) {
  const age = state ? now - Date.parse(state.fetchedAt) : NaN;
  if (!state || state.quality !== "live" || !Number.isFinite(age) || age < 0 || age > 30_000)
    return { classification: "feedback-unavailable", actionable: true } as const;
  if (state.actualState !== "open") return { classification: "feedback-conflict", actionable: true } as const;
  if (hasActiveAlarm) return { classification: "open-with-active-alarm", actionable: true } as const;
  if (state.requestedState === "open") return { classification: "expected-open", actionable: false } as const;
  if (state.requestedState !== "closed") return { classification: "request-unknown", actionable: true } as const;
  const delta = state.stringToBusDeltaVoltage;
  if (typeof delta === "number" && Number.isFinite(delta) && delta > 10)
    return { classification: "waiting-for-voltage-alignment", actionable: false } as const;
  return { classification: "requested-closed-feedback-open", actionable: true } as const;
}
