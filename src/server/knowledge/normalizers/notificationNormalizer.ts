import {
  KnowledgeArtifact,
  KnowledgeCatalogSnapshot,
  KnowledgeFragment,
  KnowledgeSource
} from "../types";
import { knowledgeId } from "../knowledgeRepository";

export interface NotificationEvidence {
  sourceId: string;
  sourceKind: string;
  artifactId?: string;
  fragmentId: string;
  locator?: string;
  field: string;
  value: string;
  confidence: number;
}

export interface NotificationObservation {
  id: string;
  definitionId: string;
  sourceId: string;
  artifactId?: string;
  rowNumber?: number;
  entity?: string;
  notificationId?: string;
  notificationName?: string;
  notificationType?: string;
  notificationCategory?: string;
  notificationCluster?: string;
  triggerMessage?: string;
  timestamp?: string;
  evidenceFragmentIds: string[];
}

export interface NormalizedNotificationDefinition {
  id: string;
  nativeNotificationId?: string;
  code?: number;
  name: string;
  normalizedName: string;
  type?: string;
  category?: string;
  cluster?: string;
  aliases: string[];
  sourceIds: string[];
  artifactIds: string[];
  fragmentIds: string[];
  firstObservedAt: string;
  lastObservedAt: string;
  confidence: number;
  observationCount: number;
  distinctEntityCount: number;
  evidence: NotificationEvidence[];
}

export interface NotificationNormalizationResult {
  definitions: NormalizedNotificationDefinition[];
  observations: NotificationObservation[];
  stats: {
    csvRowsProcessed: number;
    definitionCount: number;
    observationCount: number;
    orphanRowCount: number;
  };
}

type CsvRow = {
  rowNumber?: number;
  sourceId: string;
  artifactId?: string;
  fragments: KnowledgeFragment[];
  fields: Record<string, string>;
};

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeIdentityText(value: unknown): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseNumericCode(...values: unknown[]): number | undefined {
  for (const value of values) {
    const text = normalizeText(value);
    const exact = text.match(/^\d{3,6}$/);
    if (exact) return Number(exact[0]);

    const embedded = text.match(/\b(\d{3,6})\b/);
    if (embedded) return Number(embedded[1]);
  }

  return undefined;
}

function isUsefulAlias(value: string): boolean {
  const normalized = normalizeText(value);

  if (!normalized) return false;
  if (/^["']?[01]["']?$/.test(normalized)) return false;
  if (/^(true|false|null|undefined)$/i.test(normalized)) return false;
  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) return false;

  return normalized.length >= 3;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map(normalizeText)
        .filter(isUsefulAlias)
    )
  );
}

function mergeRepresentativeEvidence(
  current: NotificationEvidence[],
  incoming: NotificationEvidence[],
  maximum = 25
): NotificationEvidence[] {
  const merged = new Map<string, NotificationEvidence>();

  for (const evidence of [...current, ...incoming]) {
    const key = [
      evidence.sourceId,
      evidence.field,
      normalizeIdentityText(evidence.value)
    ].join("|");

    if (!merged.has(key)) {
      merged.set(key, evidence);
    }

    if (merged.size >= maximum) break;
  }

  return Array.from(merged.values());
}

function groupCsvRows(
  catalog: KnowledgeCatalogSnapshot,
  sourcesById: Map<string, KnowledgeSource>
): CsvRow[] {
  const grouped = new Map<string, CsvRow>();

  for (const fragment of catalog.fragments) {
    const source = sourcesById.get(fragment.sourceId);
    if (source?.kind !== "csv") continue;

    const rowNumber = Number(fragment.metadata?.rowNumber);
    const groupingKey = [
      fragment.sourceId,
      fragment.artifactId || "",
      Number.isFinite(rowNumber) ? rowNumber : ""
    ].join("|");

    let row = grouped.get(groupingKey);
    if (!row) {
      row = {
        rowNumber: Number.isFinite(rowNumber) ? rowNumber : undefined,
        sourceId: fragment.sourceId,
        artifactId: fragment.artifactId,
        fragments: [],
        fields: {}
      };
      grouped.set(groupingKey, row);
    }

    row.fragments.push(fragment);
    row.fields[fragment.field] = normalizeText(fragment.value);
  }

  return Array.from(grouped.values()).sort((a, b) => {
    if (a.sourceId !== b.sourceId) return a.sourceId.localeCompare(b.sourceId);
    return Number(a.rowNumber || 0) - Number(b.rowNumber || 0);
  });
}

function chooseDefinitionIdentity(row: CsvRow): {
  definitionId: string;
  nativeNotificationId?: string;
  code?: number;
  name: string;
  normalizedName: string;
} | null {
  const nativeNotificationId = normalizeText(row.fields.notificationid) || undefined;
  const name =
    normalizeText(row.fields.notificationname) ||
    normalizeText(row.fields.triggermessage);

  if (!nativeNotificationId && !name) return null;

  const normalizedName = normalizeIdentityText(name || `Notification ${nativeNotificationId}`);
  const code = parseNumericCode(nativeNotificationId, name, row.fields.triggermessage);

  let identityKind: string;
  let identityValue: string;

  if (nativeNotificationId) {
    identityKind = "native-id";
    identityValue = nativeNotificationId;
  } else if (code !== undefined) {
    identityKind = "code";
    identityValue = String(code);
  } else {
    identityKind = "name";
    identityValue = normalizedName;
  }

  return {
    definitionId: knowledgeId("PRZM-NOT", identityKind, identityValue),
    nativeNotificationId,
    code,
    name: name || `Notification ${nativeNotificationId}`,
    normalizedName
  };
}

export function normalizeNotificationKnowledge(
  catalog: KnowledgeCatalogSnapshot
): NotificationNormalizationResult {
  const sourcesById = new Map(catalog.sources.map((source) => [source.id, source]));
  const artifactsById = new Map(
    catalog.artifacts.map((artifact: KnowledgeArtifact) => [artifact.id, artifact])
  );

  const rows = groupCsvRows(catalog, sourcesById);
  const definitions = new Map<string, NormalizedNotificationDefinition>();
  const observations: NotificationObservation[] = [];
  let orphanRowCount = 0;

  for (const row of rows) {
    const identity = chooseDefinitionIdentity(row);
    if (!identity) {
      orphanRowCount += 1;
      continue;
    }

    const artifact = row.artifactId
      ? artifactsById.get(row.artifactId)
      : undefined;

    const observedTimes = row.fragments
      .map((fragment) => fragment.observedAt)
      .filter(Boolean)
      .sort();

    const firstObservedAt =
      normalizeText(row.fields.timestamp) ||
      observedTimes[0] ||
      new Date().toISOString();

    const lastObservedAt =
      normalizeText(row.fields.timestamp) ||
      observedTimes[observedTimes.length - 1] ||
      firstObservedAt;

    const entity = normalizeText(row.fields.entity) || undefined;
    const notificationType = normalizeText(row.fields.notificationtype) || undefined;
    const notificationCategory =
      normalizeText(row.fields.notificationcategory) || undefined;
    const notificationCluster =
      normalizeText(row.fields.notificationcluster) || undefined;
    const triggerMessage = normalizeText(row.fields.triggermessage) || undefined;

    const evidence: NotificationEvidence[] = row.fragments.map((fragment) => ({
      sourceId: fragment.sourceId,
      sourceKind: sourcesById.get(fragment.sourceId)?.kind || "unknown",
      artifactId: fragment.artifactId,
      fragmentId: fragment.id,
      locator: fragment.artifactId
        ? artifactsById.get(fragment.artifactId)?.locator
        : undefined,
      field: fragment.field,
      value: fragment.value,
      confidence: fragment.confidence
    }));

    const observationId = knowledgeId(
      "PRZM-OBS",
      identity.definitionId,
      row.sourceId,
      row.rowNumber,
      entity,
      row.fields.timestamp,
      triggerMessage
    );

    observations.push({
      id: observationId,
      definitionId: identity.definitionId,
      sourceId: row.sourceId,
      artifactId: row.artifactId,
      rowNumber: row.rowNumber,
      entity,
      notificationId: identity.nativeNotificationId,
      notificationName: identity.name,
      notificationType,
      notificationCategory,
      notificationCluster,
      triggerMessage,
      timestamp: normalizeText(row.fields.timestamp) || undefined,
      evidenceFragmentIds: row.fragments.map((fragment) => fragment.id)
    });

    const existing = definitions.get(identity.definitionId);

    if (!existing) {
      definitions.set(identity.definitionId, {
        id: identity.definitionId,
        nativeNotificationId: identity.nativeNotificationId,
        code: identity.code,
        name: identity.name,
        normalizedName: identity.normalizedName,
        type: notificationType,
        category: notificationCategory,
        cluster: notificationCluster,
        aliases: uniqueStrings([identity.name]),
        sourceIds: [row.sourceId],
        artifactIds: row.artifactId ? [row.artifactId] : [],
        fragmentIds: row.fragments.map((fragment) => fragment.id),
        firstObservedAt,
        lastObservedAt,
        confidence: Math.max(...row.fragments.map((fragment) => fragment.confidence), 0.5),
        observationCount: 1,
        distinctEntityCount: entity ? 1 : 0,
        evidence: mergeRepresentativeEvidence([], evidence)
      });
      continue;
    }

    existing.nativeNotificationId =
      existing.nativeNotificationId || identity.nativeNotificationId;
    existing.code = existing.code ?? identity.code;
    existing.name = existing.name || identity.name;
    existing.normalizedName =
      existing.normalizedName || identity.normalizedName;
    existing.type = existing.type || notificationType;
    existing.category = existing.category || notificationCategory;
    existing.cluster = existing.cluster || notificationCluster;
    existing.aliases = uniqueStrings([
      ...existing.aliases,
      identity.name
    ]);
    existing.sourceIds = uniqueStrings([...existing.sourceIds, row.sourceId]);
    existing.artifactIds = uniqueStrings([
      ...existing.artifactIds,
      row.artifactId
    ]);
    existing.fragmentIds = uniqueStrings([
      ...existing.fragmentIds,
      ...row.fragments.map((fragment) => fragment.id)
    ]);
    existing.firstObservedAt =
      existing.firstObservedAt.localeCompare(firstObservedAt) <= 0
        ? existing.firstObservedAt
        : firstObservedAt;
    existing.lastObservedAt =
      existing.lastObservedAt.localeCompare(lastObservedAt) >= 0
        ? existing.lastObservedAt
        : lastObservedAt;
    existing.confidence = Math.max(
      existing.confidence,
      ...row.fragments.map((fragment) => fragment.confidence)
    );
    existing.observationCount += 1;
    existing.evidence = mergeRepresentativeEvidence(
      existing.evidence,
      evidence
    );
  }

  const entitySets = new Map<string, Set<string>>();

  for (const observation of observations) {
    if (!observation.entity) continue;
    if (!entitySets.has(observation.definitionId)) {
      entitySets.set(observation.definitionId, new Set());
    }
    entitySets.get(observation.definitionId)!.add(observation.entity);
  }

  for (const definition of definitions.values()) {
    definition.distinctEntityCount =
      entitySets.get(definition.id)?.size || 0;
  }

  const normalizedDefinitions = Array.from(definitions.values()).sort((a, b) => {
    const codeA = a.code ?? Number.MAX_SAFE_INTEGER;
    const codeB = b.code ?? Number.MAX_SAFE_INTEGER;
    if (codeA !== codeB) return codeA - codeB;
    return a.name.localeCompare(b.name);
  });

  observations.sort((a, b) => {
    if (a.definitionId !== b.definitionId) {
      return a.definitionId.localeCompare(b.definitionId);
    }
    return Number(a.rowNumber || 0) - Number(b.rowNumber || 0);
  });

  return {
    definitions: normalizedDefinitions,
    observations,
    stats: {
      csvRowsProcessed: rows.length,
      definitionCount: normalizedDefinitions.length,
      observationCount: observations.length,
      orphanRowCount
    }
  };
}
