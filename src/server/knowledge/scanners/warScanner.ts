import crypto from "crypto";
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { knowledgeId } from "../knowledgeRepository";
import { KnowledgeArtifact, KnowledgeFragment, ScannerResult } from "../types";

function sha256Buffer(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function extractPrintableStrings(buffer: Buffer): string[] {
  const text = buffer.toString("latin1");
  const matches = text.match(/[\x20-\x7E]{5,}/g) || [];
  return Array.from(new Set(matches.map((value) => value.trim()).filter(Boolean)));
}

function looksNotificationRelated(value: string) {
  return /(notification|alarm|warning|fault|disconnect|unavailable|trip|temperature|voltage|current|contactor|cgc|bpc|hvac)/i.test(value);
}

function endpointCandidates(value: string): string[] {
  const matches = value.match(/\/(?:api|rest|monitor|block|string|notification|notifications)[A-Za-z0-9_./?=&{}:-]*/gi) || [];
  return Array.from(new Set(matches));
}

export function scanWarFile(filePath: string): ScannerResult {
  const absolutePath = path.resolve(filePath);
  const bytes = fs.readFileSync(absolutePath);
  const stat = fs.statSync(absolutePath);
  const sourceHash = sha256Buffer(bytes);
  const now = new Date().toISOString();
  const sourceId = knowledgeId("KSRC", "war", absolutePath, sourceHash);
  const runId = knowledgeId("KRUN", sourceId, now);
  const zip = new AdmZip(bytes);
  const entries = zip.getEntries();
  const artifacts: KnowledgeArtifact[] = [];
  const fragments: KnowledgeFragment[] = [];

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const locator = entry.entryName;
    const data = entry.getData();
    const kind = locator.endsWith(".class") ? "class" : "resource";
    const artifactId = knowledgeId("KART", runId, locator);

    artifacts.push({
      id: artifactId,
      runId,
      sourceId,
      kind,
      locator,
      name: path.posix.basename(locator),
      sha256: sha256Buffer(data),
      metadata: { sizeBytes: data.length }
    });

    const isTextResource = /\.(properties|xml|json|csv|txt|html|js|jsp|yml|yaml)$/i.test(locator);
    if (!locator.endsWith(".class") && !isTextResource) continue;

    const strings = extractPrintableStrings(data);
    for (const value of strings) {
      if (looksNotificationRelated(value)) {
        fragments.push({
          id: knowledgeId("KFRG", runId, locator, "string", value),
          runId,
          sourceId,
          artifactId,
          field: "stringConstant",
          value,
          normalizedValue: value.toLowerCase(),
          confidence: locator.endsWith(".class") ? 0.72 : 0.9,
          observedAt: now,
          metadata: { locator }
        });
      }

      for (const endpoint of endpointCandidates(value)) {
        fragments.push({
          id: knowledgeId("KFRG", runId, locator, "endpoint", endpoint),
          runId,
          sourceId,
          artifactId,
          field: "endpointCandidate",
          value: endpoint,
          normalizedValue: endpoint.toLowerCase(),
          confidence: 0.7,
          observedAt: now,
          metadata: { locator }
        });
      }
    }
  }

  return {
    source: {
      id: sourceId,
      name: path.basename(absolutePath),
      kind: "war",
      sourcePath: absolutePath,
      sha256: sourceHash,
      sizeBytes: stat.size,
      firstSeenAt: now,
      lastScannedAt: now,
      metadata: { entryCount: entries.length }
    },
    run: {
      id: runId,
      sourceId,
      scanner: "war-scanner-v1",
      startedAt: now,
      completedAt: new Date().toISOString(),
      status: "complete",
      artifactCount: artifacts.length,
      fragmentCount: fragments.length,
      metadata: {
        entryCount: entries.length,
        classCount: artifacts.filter((item) => item.kind === "class").length
      }
    },
    artifacts,
    fragments
  };
}
