export type TopologyDomain = "site" | "lineups" | "segments" | "strings" | "devices" | "pcs" | "safety" | "registers";

export interface TopologyIngestionSource {
  id: string;
  endpoint: string;
  provider: "ems-turtle" | "feather";
  acquisition: "core-cycle" | "optional-cycle" | "slow-cycle" | "candidate-validation";
  authority: "primary" | "corroborating" | "validation";
  domains: TopologyDomain[];
  blockingForInitialDraft: boolean;
  cost: "small" | "medium" | "large" | "per-device";
  fallbackEndpoint?: string;
}

export const TOPOLOGY_INGESTION_MATRIX: readonly TopologyIngestionSource[] = [
  { id: "ems-status", endpoint: "/tools/report/ems/status.json", provider: "ems-turtle", acquisition: "core-cycle", authority: "primary", domains: ["site"], blockingForInitialDraft: true, cost: "small" },
  { id: "blockviewer", endpoint: "/tools/monitor/ems/blockviewer/data", provider: "ems-turtle", acquisition: "core-cycle", authority: "primary", domains: ["site", "lineups", "devices", "pcs"], blockingForInitialDraft: true, cost: "medium" },
  { id: "strings", endpoint: "/tools/report/ems/strings.csv", provider: "ems-turtle", acquisition: "core-cycle", authority: "primary", domains: ["lineups", "strings"], blockingForInitialDraft: true, cost: "medium" },
  { id: "ip-map", endpoint: "/tools/report/ems/ipMap.json", fallbackEndpoint: "/tools/report/ems/ipMap.csv", provider: "ems-turtle", acquisition: "optional-cycle", authority: "corroborating", domains: ["devices", "lineups", "segments", "pcs"], blockingForInitialDraft: false, cost: "small" },
  { id: "string-ip-map", endpoint: "/tools/report/ems/stringIPMap.json", fallbackEndpoint: "/tools/report/ems/stringIPMap.csv", provider: "ems-turtle", acquisition: "optional-cycle", authority: "corroborating", domains: ["lineups", "segments", "strings", "devices"], blockingForInitialDraft: false, cost: "small" },
  { id: "controller-statistics", endpoint: "/tools/report/ems/controllerStatistics.json", provider: "ems-turtle", acquisition: "optional-cycle", authority: "validation", domains: ["devices"], blockingForInitialDraft: false, cost: "medium" },
  { id: "last-call", endpoint: "/tools/report/ems/lastCall.json", provider: "ems-turtle", acquisition: "optional-cycle", authority: "corroborating", domains: ["lineups", "segments", "strings", "devices"], blockingForInitialDraft: false, cost: "large" },
  { id: "array-report", endpoint: "/tools/report/ems/array/{lineup}/report.json", provider: "ems-turtle", acquisition: "optional-cycle", authority: "validation", domains: ["lineups", "segments", "pcs"], blockingForInitialDraft: false, cost: "per-device" },
  { id: "pcs-report", endpoint: "/tools/report/ems/array/{lineup}/pcs/{pcs}/report.json", provider: "ems-turtle", acquisition: "optional-cycle", authority: "validation", domains: ["pcs"], blockingForInitialDraft: false, cost: "per-device" },
  { id: "first-responder-v2", endpoint: "/v2/firstresponder/data", provider: "ems-turtle", acquisition: "optional-cycle", authority: "validation", domains: ["safety", "segments", "devices"], blockingForInitialDraft: false, cost: "medium", fallbackEndpoint: "/firstresponder/data" },
  { id: "modbus-map", endpoint: "/tools/report/ems/modbus_map.csv", provider: "ems-turtle", acquisition: "slow-cycle", authority: "validation", domains: ["devices", "registers"], blockingForInitialDraft: false, cost: "large" },
  { id: "feather-report", endpoint: "http://{device}:8080/feather/status/report.json", provider: "feather", acquisition: "candidate-validation", authority: "primary", domains: ["segments", "devices", "safety"], blockingForInitialDraft: false, cost: "per-device" },
  { id: "feather-main", endpoint: "http://{device}:8080/feather/main/data", provider: "feather", acquisition: "candidate-validation", authority: "corroborating", domains: ["segments", "devices", "safety"], blockingForInitialDraft: false, cost: "per-device" }
] as const;

export function topologyIngestionMatrixReport(endpointHealth: Array<{ endpoint?: string; success?: boolean; lastSuccessAt?: string | null; lastError?: string | null }> = []) {
  return TOPOLOGY_INGESTION_MATRIX.map(source => {
    const health = endpointHealth.find(row => row.endpoint === source.endpoint || row.endpoint === source.fallbackEndpoint);
    return { ...source, available: health ? health.success === true : null, lastSuccessAt: health?.lastSuccessAt ?? null, lastError: health?.lastError ?? null };
  });
}
