export type KnowledgeSourceKind =
  | "war"
  | "csv"
  | "rest"
  | "firmware"
  | "modbus"
  | "manual"
  | "runtime"
  | "unknown";

export type KnowledgeArtifactKind =
  | "class"
  | "resource"
  | "endpoint"
  | "string"
  | "notification"
  | "row"
  | "file"
  | "unknown";

export interface KnowledgeSource {
  id: string;
  name: string;
  kind: KnowledgeSourceKind;
  sourcePath?: string;
  sha256?: string;
  sizeBytes?: number;
  version?: string;
  firstSeenAt: string;
  lastScannedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface DiscoveryRun {
  id: string;
  sourceId: string;
  scanner: string;
  startedAt: string;
  completedAt?: string;
  status: "running" | "complete" | "failed";
  artifactCount: number;
  fragmentCount: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeArtifact {
  id: string;
  runId: string;
  sourceId: string;
  kind: KnowledgeArtifactKind;
  locator: string;
  name?: string;
  mimeType?: string;
  parentArtifactId?: string;
  sha256?: string;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeFragment {
  id: string;
  runId: string;
  sourceId: string;
  artifactId?: string;
  field: string;
  value: string;
  normalizedValue?: string;
  nativeId?: string;
  confidence: number;
  observedAt: string;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeCatalogSnapshot {
  schemaVersion: 1;
  sources: KnowledgeSource[];
  runs: DiscoveryRun[];
  artifacts: KnowledgeArtifact[];
  fragments: KnowledgeFragment[];
}

export interface ScannerResult {
  source: KnowledgeSource;
  run: DiscoveryRun;
  artifacts: KnowledgeArtifact[];
  fragments: KnowledgeFragment[];
}
