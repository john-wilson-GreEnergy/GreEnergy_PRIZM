import crypto from "crypto";
import fs from "fs";
import path from "path";
import { knowledgeId } from "../knowledgeRepository";
import { KnowledgeArtifact, KnowledgeFragment, ScannerResult } from "../types";

function sha256File(filePath: string) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows.filter((candidate) => candidate.some((value) => value.trim() !== ""));
}

function normalizeHeader(value: string) {
  return value.trim().replace(/^\uFEFF/, "").replace(/[^a-z0-9]+/gi, "").toLowerCase();
}

export function scanNotificationCsv(filePath: string): ScannerResult {
  const absolutePath = path.resolve(filePath);
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) throw new Error(`CSV source is not a file: ${absolutePath}`);

  const sourceHash = sha256File(absolutePath);
  const now = new Date().toISOString();
  const sourceId = knowledgeId("KSRC", "csv", absolutePath, sourceHash);
  const runId = knowledgeId("KRUN", sourceId, now);
  const artifactId = knowledgeId("KART", runId, absolutePath);
  const rows = parseCsv(fs.readFileSync(absolutePath, "utf8"));
  if (!rows.length) throw new Error("CSV contains no rows");

  const headers = rows[0].map(normalizeHeader);
  const artifacts: KnowledgeArtifact[] = [{
    id: artifactId,
    runId,
    sourceId,
    kind: "file",
    locator: absolutePath,
    name: path.basename(absolutePath),
    mimeType: "text/csv",
    sha256: sourceHash,
    metadata: { headers: rows[0], rowCount: Math.max(0, rows.length - 1) }
  }];

  const fragments: KnowledgeFragment[] = [];
  const notificationFields = new Set([
    "notificationid",
    "notificationname",
    "notificationtype",
    "notificationcategory",
    "notificationcluster",
    "entity",
    "triggermessage",
    "timestamp"
  ]);

  rows.slice(1).forEach((values, rowOffset) => {
    const rowNumber = rowOffset + 2;
    const rowArtifactId = knowledgeId("KART", runId, "row", rowNumber);
    artifacts.push({
      id: rowArtifactId,
      runId,
      sourceId,
      kind: "row",
      locator: `${absolutePath}#row=${rowNumber}`,
      parentArtifactId: artifactId,
      metadata: { rowNumber }
    });

    const nativeIdIndex = headers.indexOf("notificationid");
    const nativeId = nativeIdIndex >= 0 ? String(values[nativeIdIndex] || "").trim() || undefined : undefined;

    headers.forEach((header, index) => {
      const value = String(values[index] ?? "").trim();
      if (!value || !notificationFields.has(header)) return;
      fragments.push({
        id: knowledgeId("KFRG", runId, rowNumber, header, value),
        runId,
        sourceId,
        artifactId: rowArtifactId,
        field: header,
        value,
        normalizedValue: value.toLowerCase(),
        nativeId,
        confidence: 0.98,
        observedAt: now,
        metadata: { rowNumber, originalHeader: rows[0][index] }
      });
    });
  });

  return {
    source: {
      id: sourceId,
      name: path.basename(absolutePath),
      kind: "csv",
      sourcePath: absolutePath,
      sha256: sourceHash,
      sizeBytes: stat.size,
      firstSeenAt: now,
      lastScannedAt: now,
      metadata: { rowCount: Math.max(0, rows.length - 1) }
    },
    run: {
      id: runId,
      sourceId,
      scanner: "notification-csv-v1",
      startedAt: now,
      completedAt: new Date().toISOString(),
      status: "complete",
      artifactCount: artifacts.length,
      fragmentCount: fragments.length,
      metadata: { rowCount: Math.max(0, rows.length - 1) }
    },
    artifacts,
    fragments
  };
}
