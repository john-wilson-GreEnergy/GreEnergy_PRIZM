// Freshness belongs to the actual BlockViewer response, not the surrounding poll cycle.
// Weak references also detect local command-service mutations and retained app rows.
type AppRow = Record<string, unknown>;
type Provenance = {sourceTimestampUtc: string; sourceBaseUrl: string; signature: string; sourceLive: boolean};
const observations = new WeakMap<AppRow, Provenance>();
export function emsAppRows(payload: unknown): AppRow[] {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload)) return payload.filter((row): row is AppRow => !!row && typeof row === "object" && !Array.isArray(row));
  const data = payload as AppRow;
  for (const key of ["dragonApps", "apps", "emsApps"]) if (Array.isArray(data[key])) return emsAppRows(data[key]);
  return data.data && data.data !== payload ? emsAppRows(data.data) : [];
}
const signature = (row: AppRow) => JSON.stringify([row.appCode, row.applicationTypeCode, row.priority, row.applicationPriority,
  row.enabled, row.health, row.appStatus, row.healthMessage]);
export function stampEmsAppResponse(payload: unknown, sourceTimestampUtc: string, sourceBaseUrl: string, sourceLive: boolean) {
  for (const row of emsAppRows(payload)) observations.set(row, {sourceTimestampUtc, sourceBaseUrl, sourceLive, signature: signature(row)});
}
export function emsAppProvenance(row: AppRow) {
  const observation = observations.get(row);
  return {sourceTimestampUtc: observation?.sourceTimestampUtc ?? null, sourceBaseUrl: observation?.sourceBaseUrl ?? null,
    sourceLive: observation?.sourceLive === true && observation.signature === signature(row)};
}
