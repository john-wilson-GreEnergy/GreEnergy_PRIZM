import type { ObjectGraphSnapshot, StringObject } from '../../../core/objectGraph';
import { compactTelemetryValue, immutableBindingValue } from './TelemetryBindingSnapshot';
import { TelemetryBindingResolver, type TelemetryBindingBuildInput } from './TelemetryBindingResolver';

export interface BindingParityRow {
  readonly canonicalKey: string;
  readonly arrayIndex: number;
  readonly energySegmentId: string;
  readonly stringIndex: number;
  readonly value: Readonly<Record<string, unknown>>;
}

export interface BindingParityMismatch {
  readonly row: string;
  readonly field: string;
  readonly legacy: unknown;
  readonly binding: unknown;
  readonly reason: 'identity' | 'missing' | 'extra' | 'value' | 'type';
}

export interface BindingParityReport {
  readonly generatedAt: string;
  readonly cycleId: number | null;
  readonly rows: { readonly legacy: number; readonly binding: number };
  readonly fieldsCompared: number;
  readonly exactMatches: number;
  readonly fieldMismatches: number;
  readonly identityMismatches: number;
  readonly missingRows: number;
  readonly extraRows: number;
  readonly duplicateRows: { readonly legacy: number; readonly binding: number };
  readonly byteIdenticalObjects: number;
  readonly semanticIdenticalObjects: number;
  readonly perFieldMismatchHistogram: Readonly<Record<string, number>>;
  readonly exampleMismatches: readonly BindingParityMismatch[];
  readonly ignoredFields: readonly string[];
  readonly pass: boolean;
}

export type BindingParityPipeline = (snapshot: Readonly<Record<string, unknown>>, graph: ObjectGraphSnapshot) => Promise<readonly BindingParityRow[]> | readonly BindingParityRow[];
export interface BindingParityHarnessInput {
  readonly brokerSnapshot: Readonly<Record<string, unknown>>;
  readonly graph: ObjectGraphSnapshot;
  readonly graphFingerprint: string;
  readonly graphSourceFingerprint: string;
  readonly legacyPipeline?: BindingParityPipeline;
  readonly bindingPipeline?: BindingParityPipeline;
}

const IGNORED_KEY = /^(?:generatedAt|publishedAt|capturedAt|observedAt|acquiredAt|normalizedAt|lastUpdated|lastUpdatedAt|timestamp|timestampUtc|datetime|cycleStartedAt|cycleFinishedAt|responseDuration|responseDurationMs)$/i;
const positive = (value: unknown): number | null => { const number = Number(value); return Number.isSafeInteger(number) && number > 0 ? number : null; };
const record = (value: unknown): Readonly<Record<string, unknown>> => value && typeof value === 'object' && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : {};
const sourceRows = (snapshot: Readonly<Record<string, unknown>>): readonly Readonly<Record<string, unknown>>[] => {
  const unified = record(snapshot.unified); const telemetry = record(unified.stringTelemetry); const rows = Array.isArray(telemetry.rows) ? telemetry.rows : [];
  return rows.map((row) => { const value = record(row); return Object.keys(record(value.raw)).length ? record(value.raw) : value; });
};
const stripIgnored = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripIgnored);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !IGNORED_KEY.test(key)).map(([key, child]) => [key, stripIgnored(child)]));
};
const semanticEncoding = (value: unknown): string => {
  if (value === undefined) return '[undefined]'; if (value === null) return '[null]';
  if (typeof value === 'number' && Number.isNaN(value)) return '[number:NaN]';
  if (Array.isArray(value)) return `[array:${value.map(semanticEncoding).join(',')}]`;
  if (typeof value === 'object') return `[object:${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${semanticEncoding(child)}`).join(',')}]`;
  return `[${typeof value}:${String(value)}]`;
};
const byteEncoding = (value: unknown): string => JSON.stringify(value, (_key, child) => child === undefined ? { __prizmUndefined: true } : child) ?? '';
const identityKey = (row: BindingParityRow): string => row.canonicalKey;
const duplicateCount = (rows: readonly BindingParityRow[]): number => rows.length - new Set(rows.map(identityKey)).size;

function graphStringMap(graph: ObjectGraphSnapshot): Map<string, StringObject> {
  return new Map(graph.objects.filter((object): object is StringObject => object.kind === 'string').map((object) => [`${object.arrayIndex}:${object.stringIndex}`, object]));
}

async function normalizedRowsFromSnapshot(snapshot: Readonly<Record<string, unknown>>): Promise<readonly Readonly<Record<string, unknown>>[]> {
  const { normalizeLocalStringRows } = await import('../../localStringsBrokerRoute');
  return normalizeLocalStringRows([...sourceRows(snapshot)], [], { source: 'same-cycle-parity', staleData: false, lastUpdated: null, activeEmsBaseUrl: null, activeProfileName: null, activeProfileId: null, stationCode: null, blockIndex: null, lastError: null, cacheProfileId: null, cacheEmsBaseUrl: null, cacheCreatedAt: null, cacheLastUpdatedAt: null }) as unknown as readonly Readonly<Record<string, unknown>>[];
}

export async function projectLegacyBindingParityRows(snapshot: Readonly<Record<string, unknown>>, graph: ObjectGraphSnapshot): Promise<readonly BindingParityRow[]> {
  const identities = graphStringMap(graph);
  return immutableBindingValue((await normalizedRowsFromSnapshot(snapshot)).flatMap((row) => {
    const arrayIndex = positive(row.arrayIndex ?? row.ArrayIndex ?? row.arrayNumber ?? row.array); const stringIndex = positive(row.stringIndex ?? row.StringIndex ?? row.stringNumber ?? row.string);
    const object = arrayIndex && stringIndex ? identities.get(`${arrayIndex}:${stringIndex}`) : undefined; if (!object) return [];
    return [{ canonicalKey: object.canonicalKey, arrayIndex: object.arrayIndex, energySegmentId: object.energySegmentId, stringIndex: object.stringIndex, value: stripIgnored(compactTelemetryValue(row)) as Readonly<Record<string, unknown>> }];
  }));
}

export async function projectGraphBindingParityRows(snapshot: Readonly<Record<string, unknown>>, graph: ObjectGraphSnapshot, graphFingerprint: string, graphSourceFingerprint: string): Promise<readonly BindingParityRow[]> {
  const authorities = record(snapshot.authorities); const health = record(snapshot.health); const cycleId = positive(snapshot.cycleId); const strings = await normalizedRowsFromSnapshot(snapshot);
  const input: TelemetryBindingBuildInput = { graph, graphFingerprint, graphSourceFingerprint, graphHealthy: true, graphCycleId: cycleId, profileIdentity: null, telemetryProfileIdentity: null, cycleId, capturedAt: null, strings, controllerHealth: null, authorities, providerHealth: health };
  const bound = await new TelemetryBindingResolver().build(input);
  return immutableBindingValue(bound.bindingsByDomain['string-telemetry'].map((binding) => ({ canonicalKey: binding.canonicalKey, arrayIndex: Number(binding.metadata.arrayIndex), energySegmentId: String(binding.metadata.energySegmentId), stringIndex: Number(binding.metadata.stringIndex), value: stripIgnored(binding.value) as Readonly<Record<string, unknown>> })));
}

export class BindingParityHarness {
  async run(input: BindingParityHarnessInput): Promise<BindingParityReport> {
    const frozen = immutableBindingValue(input.brokerSnapshot); const legacyPipeline = input.legacyPipeline ?? projectLegacyBindingParityRows; const bindingPipeline = input.bindingPipeline ?? ((snapshot, graph) => projectGraphBindingParityRows(snapshot, graph, input.graphFingerprint, input.graphSourceFingerprint));
    const legacy = await legacyPipeline(frozen, input.graph); const binding = await bindingPipeline(frozen, input.graph);
    const legacyByKey = new Map(legacy.map((row) => [identityKey(row), row])); const bindingByKey = new Map(binding.map((row) => [identityKey(row), row])); const histogram: Record<string, number> = {}; const examples: BindingParityMismatch[] = [];
    let fieldsCompared = 0; let exactMatches = 0; let fieldMismatches = 0; let identityMismatches = 0; let missingRows = 0; let extraRows = 0; let byteIdenticalObjects = 0; let semanticIdenticalObjects = 0;
    const mismatch = (entry: BindingParityMismatch) => { histogram[entry.field] = (histogram[entry.field] ?? 0) + 1; if (examples.length < 25) examples.push(immutableBindingValue(entry)); };
    for (let index = 0; index < Math.max(legacy.length, binding.length); index++) { const left = legacy[index]; const right = binding[index]; if (left && right && left.canonicalKey !== right.canonicalKey) { identityMismatches++; mismatch({ row: `${index}`, field: 'canonicalKey', legacy: left.canonicalKey, binding: right.canonicalKey, reason: 'identity' }); } }
    for (const [key, left] of legacyByKey) {
      const right = bindingByKey.get(key); if (!right) { missingRows++; mismatch({ row: key, field: '$row', legacy: left, binding: undefined, reason: 'missing' }); continue; }
      const leftComparable = { canonicalKey: left.canonicalKey, arrayIndex: left.arrayIndex, energySegmentId: left.energySegmentId, stringIndex: left.stringIndex, value: stripIgnored(left.value) }; const rightComparable = { canonicalKey: right.canonicalKey, arrayIndex: right.arrayIndex, energySegmentId: right.energySegmentId, stringIndex: right.stringIndex, value: stripIgnored(right.value) };
      if (byteEncoding(leftComparable) === byteEncoding(rightComparable)) byteIdenticalObjects++; if (semanticEncoding(leftComparable) === semanticEncoding(rightComparable)) semanticIdenticalObjects++;
      this.compareValue(key, '', leftComparable, rightComparable, { compared: () => fieldsCompared++, match: () => exactMatches++, mismatch: (field, legacyValue, bindingValue, reason) => { fieldMismatches++; mismatch({ row: key, field, legacy: legacyValue, binding: bindingValue, reason }); } });
    }
    for (const [key, right] of bindingByKey) if (!legacyByKey.has(key)) { extraRows++; mismatch({ row: key, field: '$row', legacy: undefined, binding: right, reason: 'extra' }); }
    const duplicateRows = { legacy: duplicateCount(legacy), binding: duplicateCount(binding) }; const pass = fieldMismatches === 0 && identityMismatches === 0 && missingRows === 0 && extraRows === 0 && duplicateRows.legacy === 0 && duplicateRows.binding === 0;
    return immutableBindingValue({ generatedAt: new Date().toISOString(), cycleId: positive(frozen.cycleId), rows: { legacy: legacy.length, binding: binding.length }, fieldsCompared, exactMatches, fieldMismatches, identityMismatches, missingRows, extraRows, duplicateRows, byteIdenticalObjects, semanticIdenticalObjects, perFieldMismatchHistogram: histogram, exampleMismatches: examples, ignoredFields: ['timestamps', 'publication times', 'generatedAt', 'cycle timestamps', 'response duration'], pass });
  }

  private compareValue(row: string, path: string, left: unknown, right: unknown, sink: { compared(): void; match(): void; mismatch(field: string, legacy: unknown, binding: unknown, reason: 'value' | 'type'): void }): void {
    const field = path || '$'; const leftType = Array.isArray(left) ? 'array' : left === null ? 'null' : typeof left; const rightType = Array.isArray(right) ? 'array' : right === null ? 'null' : typeof right;
    if (leftType !== rightType) { sink.compared(); sink.mismatch(field, left, right, 'type'); return; }
    if (leftType === 'array') { const leftArray = left as unknown[]; const rightArray = right as unknown[]; sink.compared(); if (leftArray.length === rightArray.length) sink.match(); else sink.mismatch(`${field}.length`, leftArray.length, rightArray.length, 'value'); for (let index = 0; index < Math.max(leftArray.length, rightArray.length); index++) this.compareValue(row, `${field}[${index}]`, leftArray[index], rightArray[index], sink); return; }
    if (leftType === 'object') { const keys = [...new Set([...Object.keys(left as object), ...Object.keys(right as object)])].sort(); for (const key of keys) this.compareValue(row, path ? `${path}.${key}` : key, (left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key], sink); return; }
    sink.compared(); if (Object.is(left, right)) sink.match(); else sink.mismatch(field, left, right, 'value');
  }
}
