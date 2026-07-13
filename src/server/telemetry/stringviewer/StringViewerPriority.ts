import { StringViewerPriorityClass, StringViewerPrioritySignals } from "./StringViewerTypes";

export const STRINGVIEWER_PRIORITY_ORDER: Record<StringViewerPriorityClass, number> = {
  ON_DEMAND: 0,
  HOT: 1,
  WARM: 2,
  COLD: 3,
};

export function classifyStringViewerPriority(signals: StringViewerPrioritySignals): StringViewerPriorityClass {
  if (signals.operatorRequested) return "ON_DEMAND";
  if (signals.visible || signals.activeAlarm) return "HOT";
  if (signals.communicating !== false || signals.activeWarning || signals.recentlyChanged || signals.recentlyFaulted) return "WARM";
  return "COLD";
}

export function ttlForPriority(priority: StringViewerPriorityClass, ttls: { hotTtlMs: number; warmTtlMs: number; coldTtlMs: number }): number {
  if (priority === "ON_DEMAND" || priority === "HOT") return ttls.hotTtlMs;
  if (priority === "WARM") return ttls.warmTtlMs;
  return ttls.coldTtlMs;
}
