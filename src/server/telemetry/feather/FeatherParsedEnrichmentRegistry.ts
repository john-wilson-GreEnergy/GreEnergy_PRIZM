import type { FeatherHvacDevice } from "../../feather/deviceEnrichment";

const enrichmentByRawPayload = new WeakMap<object, Partial<FeatherHvacDevice>>();

export function registerFeatherParsedEnrichment(rawPayload: unknown, enrichment: Partial<FeatherHvacDevice>): void {
  if (rawPayload && typeof rawPayload === "object") enrichmentByRawPayload.set(rawPayload as object, enrichment);
}

export function getRegisteredFeatherParsedEnrichment(rawPayload: unknown): Partial<FeatherHvacDevice> | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  return enrichmentByRawPayload.get(rawPayload as object) ?? null;
}
