import crypto from "crypto";
import fs from "fs";
import path from "path";
import {
  DiscoveryRun,
  KnowledgeArtifact,
  KnowledgeCatalogSnapshot,
  KnowledgeFragment,
  KnowledgeSource,
  ScannerResult
} from "./types";

const DATA_DIR = path.resolve(process.cwd(), ".prizm-data", "knowledge");
const CATALOG_PATH = path.join(DATA_DIR, "catalog.json");

const EMPTY_CATALOG: KnowledgeCatalogSnapshot = {
  schemaVersion: 1,
  sources: [],
  runs: [],
  artifacts: [],
  fragments: []
};

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readCatalogFile(): KnowledgeCatalogSnapshot {
  ensureDataDir();
  if (!fs.existsSync(CATALOG_PATH)) {
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(EMPTY_CATALOG, null, 2));
    return structuredClone(EMPTY_CATALOG);
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
    return {
      schemaVersion: 1,
      sources: Array.isArray(parsed?.sources) ? parsed.sources : [],
      runs: Array.isArray(parsed?.runs) ? parsed.runs : [],
      artifacts: Array.isArray(parsed?.artifacts) ? parsed.artifacts : [],
      fragments: Array.isArray(parsed?.fragments) ? parsed.fragments : []
    };
  } catch (error) {
    const corruptPath = `${CATALOG_PATH}.corrupt-${Date.now()}`;
    fs.copyFileSync(CATALOG_PATH, corruptPath);
    console.error("[KnowledgeRepository] Catalog was corrupt; preserved at", corruptPath, error);
    return structuredClone(EMPTY_CATALOG);
  }
}

function writeCatalogFile(catalog: KnowledgeCatalogSnapshot) {
  ensureDataDir();
  const tmpPath = `${CATALOG_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(catalog, null, 2));
  fs.renameSync(tmpPath, CATALOG_PATH);
}

export function knowledgeId(prefix: string, ...parts: unknown[]) {
  const digest = crypto
    .createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("\u001f"))
    .digest("hex")
    .slice(0, 20);
  return `${prefix}-${digest}`;
}

export function getKnowledgeCatalog(): KnowledgeCatalogSnapshot {
  return readCatalogFile();
}

export function saveScannerResult(result: ScannerResult): KnowledgeCatalogSnapshot {
  const catalog = readCatalogFile();

  const sourceIndex = catalog.sources.findIndex((item) => item.id === result.source.id);
  if (sourceIndex >= 0) {
    catalog.sources[sourceIndex] = {
      ...catalog.sources[sourceIndex],
      ...result.source,
      firstSeenAt: catalog.sources[sourceIndex].firstSeenAt
    };
  } else {
    catalog.sources.push(result.source);
  }

  catalog.runs.push(result.run);
  catalog.artifacts.push(...result.artifacts);
  catalog.fragments.push(...result.fragments);

  writeCatalogFile(catalog);
  return catalog;
}

export function listKnowledgeSources(): KnowledgeSource[] {
  return readCatalogFile().sources.slice().sort((a, b) => a.name.localeCompare(b.name));
}

export function listDiscoveryRuns(limit = 100): DiscoveryRun[] {
  return readCatalogFile().runs
    .slice()
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, Math.max(1, Math.min(limit, 1000)));
}

export function listArtifactsForRun(runId: string): KnowledgeArtifact[] {
  return readCatalogFile().artifacts.filter((item) => item.runId === runId);
}

export function listFragmentsForRun(runId: string): KnowledgeFragment[] {
  return readCatalogFile().fragments.filter((item) => item.runId === runId);
}

export function searchKnowledgeFragments(query: string, limit = 250): KnowledgeFragment[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return readCatalogFile().fragments
    .filter((fragment) => {
      const text = [
        fragment.field,
        fragment.value,
        fragment.normalizedValue,
        fragment.nativeId,
        JSON.stringify(fragment.metadata || {})
      ]
        .join(" ")
        .toLowerCase();
      return text.includes(q);
    })
    .slice(0, Math.max(1, Math.min(limit, 2000)));
}

export function getKnowledgeStorageInfo() {
  ensureDataDir();
  return {
    format: "json-catalog-v1",
    path: CATALOG_PATH,
    exists: fs.existsSync(CATALOG_PATH),
    sizeBytes: fs.existsSync(CATALOG_PATH) ? fs.statSync(CATALOG_PATH).size : 0,
    migrationTarget: "sqlite"
  };
}
