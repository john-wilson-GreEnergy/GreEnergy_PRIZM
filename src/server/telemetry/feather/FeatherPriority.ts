import type { FeatherPriorityClass } from "./FeatherTypes";

export const FEATHER_PRIORITY_ORDER: Record<FeatherPriorityClass, number> = { ON_DEMAND: 0, HOT: 1, WARM: 2, COLD: 3 };

export function classifyFeatherPriority(signals: { requested?: boolean; visible?: boolean; activeIssue?: boolean; stale?: boolean; unhealthy?: boolean; neverSuccessful?: boolean; online?: boolean; stable?: boolean }): FeatherPriorityClass {
  if (signals.requested) return "ON_DEMAND";
  if (signals.visible || signals.activeIssue || signals.stale || signals.unhealthy || signals.neverSuccessful) return "HOT";
  if (signals.online !== false && !signals.stable) return "WARM";
  return "COLD";
}

export function ttlForFeatherPriority(priority: FeatherPriorityClass, config: { hotTtlMs: number; warmTtlMs: number; coldTtlMs: number }): number {
  if (priority === "ON_DEMAND" || priority === "HOT") return config.hotTtlMs;
  return priority === "WARM" ? config.warmTtlMs : config.coldTtlMs;
}
