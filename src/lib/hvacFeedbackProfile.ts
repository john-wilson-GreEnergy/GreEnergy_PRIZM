export type HvacFeedbackProfile = "bergstrom" | "dometic" | "unknown";

export function getHvacFeedbackProfile(hvacType: unknown): HvacFeedbackProfile {
  const normalized = String(hvacType ?? "").trim().toLowerCase();
  if (normalized.includes("bergstrom")) return "bergstrom";
  if (normalized.includes("dometic")) return "dometic";
  return "unknown";
}

export function supportsFanSpeedFeedback(hvacType: unknown): boolean {
  return getHvacFeedbackProfile(hvacType) === "bergstrom";
}
