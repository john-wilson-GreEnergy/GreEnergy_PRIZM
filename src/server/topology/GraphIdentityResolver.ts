import { immutableValue, type ArrayObject, type CanonicalObject, type EmsControllerObject, type EnergySegmentObject, type FeatherControllerObject, type ObjectGraphSnapshot, type PcsObject, type StringObject } from '../../core/objectGraph';
import { ensureTopologyGraphCurrent, getLatestTopologyGraphSnapshot, getLatestTopologySourceSnapshot, getTopologyGraphFingerprint, getTopologyGraphHealth, topologyGraphRuntime } from './TopologyGraphRuntime';
import { GraphIdentityReadinessTracker, graphIdentityReadinessPolicy } from './GraphIdentityReadiness';

export type GraphIdentityMode = 'legacy' | 'hybrid' | 'graph';
export type GraphIdentityRoute = 'GET /api/local/strings' | 'GET /api/local/strings/dashboard' | 'GET /api/local/site-operations/summary';

export interface GraphIdentityLookup {
  readonly canonicalKey?: string;
  readonly objectId?: string;
  readonly stringKey?: string;
  readonly arrayIndex?: number;
  readonly stringIndex?: number;
  readonly energySegmentIndex?: number;
  readonly pcsIndex?: number;
  readonly controllerIp?: string;
}

interface TimingMetric { latestMs: number | null; minimumMs: number | null; maximumMs: number | null; averageMs: number | null; sampleCount: number; totalMs: number }
interface MutableTimingMetric { latestMs: number | null; minimumMs: number | null; maximumMs: number | null; sampleCount: number; totalMs: number }

export interface GraphIdentityMetricsReport {
  readonly mode: GraphIdentityMode;
  readonly configuredMode: GraphIdentityMode;
  readonly effectiveMode: GraphIdentityMode;
  readonly forceLegacy: boolean;
  readonly graphDisabled: boolean;
  readonly graphFingerprint: string | null;
  readonly graphCycleId: number | null;
  readonly graphLookups: number;
  readonly legacyLookups: number;
  readonly hybridComparisons: number;
  readonly graphHits: number;
  readonly graphMisses: number;
  readonly fallbackCount: number;
  readonly graphUsageCount: number;
  readonly graphOnlyUsageCount: number;
  readonly hybridUsageCount: number;
  readonly legacyUsageCount: number;
  readonly graphOnlyEligible: boolean;
  readonly identityMatches: number;
  readonly identityMismatches: number;
  readonly duplicateIdentities: number;
  readonly missingIdentities: number;
  readonly lookupLatency: TimingMetric;
  readonly graphLookupLatency: TimingMetric;
  readonly legacyLookupLatency: TimingMetric;
  readonly hybridComparisonLatency: TimingMetric;
  readonly routeIdentityLatency: TimingMetric;
  readonly routes: Readonly<Record<string, { requests: number; matches: number; mismatches: number; graphUses: number; legacyUses: number; fallbacks: number }>>;
  readonly mismatchSamples: readonly { route: string; kind: string; identity: string; reason: string }[];
}

interface IdentityIndexes {
  fingerprint: string;
  duplicateCount: number;
  byId: Map<string, CanonicalObject>;
  arrays: Map<number, ArrayObject>;
  strings: Map<string, StringObject>;
  energySegments: Map<string, EnergySegmentObject>;
  feathers: Map<string, FeatherControllerObject>;
  pcs: Map<string, PcsObject>;
  ems: Map<string, EmsControllerObject>;
}

export interface GraphIdentityRuntimeAccess {
  getSnapshot(): ObjectGraphSnapshot | null;
  getFingerprint(): string | null;
  getCycleId(): number | null;
  ensure(): Promise<void>;
  getSourceFingerprint?(): string | null;
  getRuntimeState?(): string;
  getRuntimeHealthy?(): boolean;
  getDiagnostics?(): { duplicates: number; missing: number; dangling: number };
  updateReadiness?(parityReady: boolean, graphOnlyReady: boolean): void;
  getLifecycle?(): unknown;
}

const defaultRuntimeAccess: GraphIdentityRuntimeAccess = {
  getSnapshot: getLatestTopologyGraphSnapshot,
  getFingerprint: getTopologyGraphFingerprint,
  getCycleId: () => getLatestTopologySourceSnapshot()?.cycleId ?? null,
  ensure: async () => { await ensureTopologyGraphCurrent('graph-identity:route-use'); },
  getSourceFingerprint: () => getLatestTopologySourceSnapshot()?.fingerprint ?? null,
  getRuntimeState: () => getTopologyGraphHealth().state,
  getRuntimeHealthy: () => ['READY_HYBRID', 'READY_GRAPH'].includes(getTopologyGraphHealth().state),
  getDiagnostics: () => { const source = getLatestTopologySourceSnapshot(); const parity = topologyGraphRuntime.getParity(); return { duplicates: source?.diagnostics.duplicates.length ?? 0, missing: source?.diagnostics.missing.length ?? 0, dangling: (parity?.mismatchedRelationships.length ?? 0) + (parity?.danglingRelationships.length ?? 0) }; },
  updateReadiness: (parityReady, graphOnlyReady) => topologyGraphRuntime.updateReadiness(parityReady, graphOnlyReady),
  getLifecycle: getTopologyGraphHealth,
};

const timing = (): MutableTimingMetric => ({ latestMs: null, minimumMs: null, maximumMs: null, sampleCount: 0, totalMs: 0 });
const numberOrNull = (value: unknown): number | null => { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null; };
const normalizeIp = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null;

function parseStringKey(value: unknown): { arrayIndex: number; stringIndex: number } | null {
  if (typeof value !== 'string') return null;
  const patterns = [/(?:^|[,:[_-])A(?:RRAY)?[:=\s-]*(\d+).*?(?:^|[,:[_-])S(?:TRING)?[:=\s-]*(\d+)/i, /array:(\d+):string:(\d+)/i, /string:[^:]+:(\d+):(\d+)/i];
  for (const pattern of patterns) { const match = value.match(pattern); if (match) return { arrayIndex: Number(match[1]), stringIndex: Number(match[2]) }; }
  return null;
}

function parseEmsIp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try { return new URL(value.includes('://') ? value : `http://${value}`).hostname.toLowerCase(); } catch { return normalizeIp(value); }
}

export class GraphIdentityResolver {
  private indexes: IdentityIndexes | null = null;
  private graphLookups = 0; private legacyLookups = 0; private hybridComparisons = 0; private graphHits = 0; private graphMisses = 0;
  private fallbackCount = 0; private graphUsageCount = 0; private legacyUsageCount = 0; private identityMatches = 0; private identityMismatches = 0; private duplicateIdentities = 0; private missingIdentities = 0;
  private lookupLatency = timing(); private graphLookupLatency = timing(); private legacyLookupLatency = timing(); private hybridComparisonLatency = timing(); private routeIdentityLatency = timing();
  private routeMetrics = new Map<string, { requests: number; matches: number; mismatches: number; graphUses: number; legacyUses: number; fallbacks: number }>();
  private mismatchSamples: { route: string; kind: string; identity: string; reason: string }[] = [];
  private readiness = new GraphIdentityReadinessTracker();
  private hybridUsageCount = 0; private graphOnlyUsageCount = 0; private automaticRollbacks = 0; private fallbackReasons = new Map<string, number>();

  constructor(private readonly runtime: GraphIdentityRuntimeAccess = defaultRuntimeAccess) {}

  get mode(): GraphIdentityMode { const value = process.env.PRIZM_GRAPH_IDENTITY_MODE?.trim().toLowerCase(); return value === 'legacy' || value === 'graph' ? value : 'hybrid'; }
  get forceLegacy(): boolean { return process.env.PRIZM_GRAPH_IDENTITY_FORCE_LEGACY?.trim().toLowerCase() === 'true'; }
  get graphDisabled(): boolean { return process.env.PRIZM_GRAPH_IDENTITY_DISABLE_GRAPH?.trim().toLowerCase() === 'true'; }

  async prepare(): Promise<void> {
    await this.runtime.ensure();
    const snapshot = this.runtime.getSnapshot(); const fingerprint = this.runtime.getFingerprint();
    if (!snapshot || !fingerprint) throw new Error('Canonical topology graph is unavailable');
    if (!this.indexes || this.indexes.fingerprint !== fingerprint) this.indexes = this.buildIndexes(snapshot, fingerprint);
  }

  resolveString(query: GraphIdentityLookup): Readonly<StringObject> | null { return this.resolve('string', query, () => {
    const direct = this.direct<StringObject>(query); if (direct?.kind === 'string') return direct;
    const parsed = parseStringKey(query.stringKey); const arrayIndex = numberOrNull(query.arrayIndex) ?? parsed?.arrayIndex ?? null; const stringIndex = numberOrNull(query.stringIndex) ?? parsed?.stringIndex ?? null;
    return arrayIndex && stringIndex ? this.indexes?.strings.get(`${arrayIndex}:${stringIndex}`) ?? null : null;
  }); }
  resolveEnergySegment(query: GraphIdentityLookup): Readonly<EnergySegmentObject> | null { return this.resolve('energy-segment', query, () => { const direct = this.direct<EnergySegmentObject>(query); if (direct?.kind === 'energy-segment') return direct; const arrayIndex = numberOrNull(query.arrayIndex); const es = numberOrNull(query.energySegmentIndex); return arrayIndex && es ? this.indexes?.energySegments.get(`${arrayIndex}:${es}`) ?? null : null; }); }
  resolveArray(query: GraphIdentityLookup): Readonly<ArrayObject> | null { return this.resolve('array', query, () => { const direct = this.direct<ArrayObject>(query); if (direct?.kind === 'array') return direct; const arrayIndex = numberOrNull(query.arrayIndex); return arrayIndex ? this.indexes?.arrays.get(arrayIndex) ?? null : null; }); }
  resolveFeather(query: GraphIdentityLookup): Readonly<FeatherControllerObject> | null { return this.resolve('feather-controller', query, () => { const direct = this.direct<FeatherControllerObject>(query); if (direct?.kind === 'feather-controller') return direct; const ip = normalizeIp(query.controllerIp); return ip ? this.indexes?.feathers.get(ip) ?? null : null; }); }
  resolvePCS(query: GraphIdentityLookup): Readonly<PcsObject> | null { return this.resolve('pcs', query, () => { const direct = this.direct<PcsObject>(query); if (direct?.kind === 'pcs') return direct; const arrayIndex = numberOrNull(query.arrayIndex); const pcsIndex = numberOrNull(query.pcsIndex) ?? 1; return arrayIndex ? this.indexes?.pcs.get(`${arrayIndex}:${pcsIndex}`) ?? null : null; }); }
  resolveEMS(query: GraphIdentityLookup): Readonly<EmsControllerObject> | null { return this.resolve('ems-controller', query, () => { const direct = this.direct<EmsControllerObject>(query); if (direct?.kind === 'ems-controller') return direct; const ip = normalizeIp(query.controllerIp); if (ip) return this.indexes?.ems.get(ip) ?? null; return this.indexes?.ems.values().next().value ?? null; }); }

  async applyRouteIdentity<T>(route: GraphIdentityRoute, payload: T): Promise<T> {
    const started = performance.now(); const metrics = this.route(route); metrics.requests += 1;
    if (this.forceLegacy || this.graphDisabled || this.mode === 'legacy') { this.measure(this.legacyLookupLatency, () => this.scanLegacy(payload)); this.legacyUsageCount += 1; metrics.legacyUses += 1; this.record(this.routeIdentityLatency, performance.now() - started); return payload; }
    try { await this.prepare(); } catch (error) {
      const reason = `graph-unavailable:${error instanceof Error ? error.message : String(error)}`; this.rollback(reason);
      this.fallbackCount += 1; this.legacyUsageCount += 1; metrics.fallbacks += 1; metrics.legacyUses += 1; this.sample(route, 'graph', 'unavailable', reason); this.record(this.routeIdentityLatency, performance.now() - started); return payload;
    }
    const legacyStarted = performance.now(); const entities = this.scanLegacy(payload, true); this.record(this.legacyLookupLatency, performance.now() - legacyStarted);
    const comparisonStarted = performance.now(); const result = this.compareAndApply(route, payload, entities); this.record(this.hybridComparisonLatency, performance.now() - comparisonStarted);
    const comparisonLatencyMs = performance.now() - comparisonStarted; this.hybridComparisons += entities.length;
    if (result.matches) { this.identityMatches += result.matches; metrics.matches += result.matches; }
    if (result.mismatches) { this.identityMismatches += result.mismatches; metrics.mismatches += result.mismatches; }
    const graphFingerprint = this.runtime.getFingerprint()!; const sourceFingerprint = this.runtime.getSourceFingerprint?.() ?? graphFingerprint; const diagnostics = this.runtime.getDiagnostics?.() ?? { duplicates: this.indexes?.duplicateCount ?? 0, missing: 0, dangling: 0 };
    this.readiness.record({ route, cycleId: numberOrNull((payload as any)?.cycleId), graphFingerprint, sourceFingerprint, matches: result.matches, mismatches: result.mismatches, missing: result.mismatches, duplicates: diagnostics.duplicates, fallback: result.mismatches > 0, graphUsed: false, legacyUsed: result.mismatches > 0, latencyMs: comparisonLatencyMs, mismatchSample: result.mismatches ? this.mismatchSamples.at(-1)?.reason ?? null : null });
    const eligibility = this.graphOnlyEligibility(); const policy = graphIdentityReadinessPolicy(); const effectiveMode: GraphIdentityMode = this.mode === 'graph' ? (eligibility.eligible ? 'graph' : 'hybrid') : (policy.promotionEnabled && eligibility.eligible ? 'graph' : 'hybrid');
    this.runtime.updateReadiness?.(eligibility.parityReady, eligibility.eligible);
    const useGraph = result.mismatches === 0;
    if (useGraph) { this.graphUsageCount += 1; metrics.graphUses += 1; if (effectiveMode === 'graph') this.graphOnlyUsageCount += 1; else this.hybridUsageCount += 1; }
    else { this.fallbackCount += 1; this.legacyUsageCount += 1; metrics.fallbacks += 1; metrics.legacyUses += 1; }
    if (this.mode === 'graph' && effectiveMode !== 'graph') this.rollback(`graph-only-blocked:${eligibility.blockers.join(',')}`);
    this.record(this.routeIdentityLatency, performance.now() - started);
    return useGraph ? result.payload as T : payload;
  }

  report(): GraphIdentityMetricsReport {
    const lifecycle = this.runtime.getLifecycle?.() as any; const tracked = { ...this.readiness.report(), previousGraphFingerprint: lifecycle?.previousGraphFingerprint ?? null, invalidationReason: lifecycle?.invalidationReason ?? null, lastInvalidatedAt: lifecycle?.lastInvalidatedAt ?? null, lastRebuildAt: lifecycle?.lastSuccessAt ?? null, lastRebuildFailure: lifecycle?.lastError ?? null, profileIdentity: lifecycle?.profileIdentity ?? null }; const eligibility = this.graphOnlyEligibility(); const policy = graphIdentityReadinessPolicy(); const effectiveMode: GraphIdentityMode = this.forceLegacy || this.graphDisabled ? 'legacy' : (this.mode === 'graph' || (this.mode === 'hybrid' && policy.promotionEnabled)) && eligibility.eligible ? 'graph' : 'hybrid';
    return immutableValue({ mode: this.mode, configuredMode: this.mode, effectiveMode, forceLegacy: this.forceLegacy, graphDisabled: this.graphDisabled, runtimeState: this.runtime.getRuntimeState?.() ?? 'READY_HYBRID', graphFingerprint: this.runtime.getFingerprint(), sourceFingerprint: this.runtime.getSourceFingerprint?.() ?? null, graphCycleId: this.runtime.getCycleId(), graphLookups: this.graphLookups, legacyLookups: this.legacyLookups, hybridComparisons: this.hybridComparisons, graphHits: this.graphHits, graphMisses: this.graphMisses, fallbackCount: this.fallbackCount, graphUsageCount: this.graphUsageCount, graphOnlyUsageCount: this.graphOnlyUsageCount, hybridUsageCount: this.hybridUsageCount, legacyUsageCount: this.legacyUsageCount, identityMatches: this.identityMatches, identityMismatches: this.identityMismatches, duplicateIdentities: this.duplicateIdentities, missingIdentities: this.missingIdentities, lookupLatency: this.timingReport(this.lookupLatency), graphLookupLatency: this.timingReport(this.graphLookupLatency), legacyLookupLatency: this.timingReport(this.legacyLookupLatency), hybridComparisonLatency: this.timingReport(this.hybridComparisonLatency), routeIdentityLatency: this.timingReport(this.routeIdentityLatency), routes: Object.fromEntries([...this.routeMetrics].map(([route, value]) => [route, { ...value }])), mismatchSamples: [...this.mismatchSamples], ...tracked, graphOnlyEligible: eligibility.eligible, graphOnlyBlockers: eligibility.blockers, automaticRollbacks: this.automaticRollbacks, fallbackReasons: Object.fromEntries(this.fallbackReasons), lifecycle: this.runtime.getLifecycle?.() ?? null });
  }
  resetParity(): GraphIdentityMetricsReport { this.readiness.reset(); this.runtime.updateReadiness?.(false, false); return this.report(); }
  resetMetrics(): GraphIdentityMetricsReport { this.graphLookups = this.legacyLookups = this.hybridComparisons = this.graphHits = this.graphMisses = this.fallbackCount = this.graphUsageCount = this.graphOnlyUsageCount = this.hybridUsageCount = this.legacyUsageCount = this.identityMatches = this.identityMismatches = this.duplicateIdentities = this.missingIdentities = this.automaticRollbacks = 0; this.lookupLatency = timing(); this.graphLookupLatency = timing(); this.legacyLookupLatency = timing(); this.hybridComparisonLatency = timing(); this.routeIdentityLatency = timing(); this.routeMetrics.clear(); this.mismatchSamples = []; this.fallbackReasons.clear(); this.readiness.reset(); return this.report(); }

  private buildIndexes(snapshot: ObjectGraphSnapshot, fingerprint: string): IdentityIndexes {
    const indexes: IdentityIndexes = { fingerprint, duplicateCount: 0, byId: new Map(), arrays: new Map(), strings: new Map(), energySegments: new Map(), feathers: new Map(), pcs: new Map(), ems: new Map() };
    const add = <T>(map: Map<string | number, T>, key: string | number, value: T) => { if (map.has(key)) { this.duplicateIdentities += 1; indexes.duplicateCount += 1; } else map.set(key, value); };
    for (const object of snapshot.objects) {
      add(indexes.byId, object.id, object);
      if (object.kind === 'array') add(indexes.arrays, (object as ArrayObject).arrayIndex, object as ArrayObject);
      if (object.kind === 'string') { const value = object as StringObject; add(indexes.strings, `${value.arrayIndex}:${value.stringIndex}`, value); }
      if (object.kind === 'energy-segment') { const value = object as EnergySegmentObject; add(indexes.energySegments, `${value.arrayIndex}:${value.energySegmentIndex}`, value); }
      if (object.kind === 'feather-controller') add(indexes.feathers, (object as FeatherControllerObject).deviceIp, object as FeatherControllerObject);
      if (object.kind === 'pcs') { const value = object as PcsObject; add(indexes.pcs, `${value.arrayIndex}:${value.pcsIndex}`, value); }
      if (object.kind === 'ems-controller') add(indexes.ems, (object as EmsControllerObject).deviceIp, object as EmsControllerObject);
    }
    return indexes;
  }
  private direct<T extends CanonicalObject>(query: GraphIdentityLookup): T | null { const key = query.objectId ?? query.canonicalKey; return key ? this.indexes?.byId.get(key) as T ?? null : null; }
  private resolve<T>(kind: string, _query: GraphIdentityLookup, operation: () => T | null): T | null { const started = performance.now(); this.graphLookups += 1; const value = operation(); if (value) this.graphHits += 1; else { this.graphMisses += 1; this.missingIdentities += 1; } const elapsed = performance.now() - started; this.record(this.graphLookupLatency, elapsed); this.record(this.lookupLatency, elapsed); return value; }
  private scanLegacy(payload: unknown, countMetrics = true): { kind: 'string' | 'array' | 'feather' | 'pcs' | 'ems'; value: any; container: any; index?: number }[] {
    const started = performance.now(); const root = payload as any; const entities: { kind: 'string' | 'array' | 'feather' | 'pcs' | 'ems'; value: any; container: any; index?: number }[] = [];
    const addArray = (kind: 'string' | 'array' | 'feather' | 'pcs', values: unknown) => { if (Array.isArray(values)) values.forEach((value, index) => { if (value && typeof value === 'object') entities.push({ kind, value, container: values, index }); }); };
    addArray('string', root?.data); addArray('string', root?.strings); addArray('string', root?.stringSummary?.tableRows); addArray('array', root?.arraySummary); addArray('array', root?.arrays); addArray('feather', root?.featherSummary?.devices); addArray('pcs', root?.pcsSummary);
    if (root?.site?.emsBaseUrl || root?.activeEmsBaseUrl) entities.push({ kind: 'ems', value: root.site ?? root, container: root });
    if (countMetrics) { this.legacyLookups += entities.length; this.record(this.lookupLatency, performance.now() - started); } return entities;
  }
  private compareAndApply(route: GraphIdentityRoute, payload: unknown, entities: ReturnType<GraphIdentityResolver['scanLegacy']>): { payload: unknown; matches: number; mismatches: number } {
    const root: any = { ...(payload as any) }; const replacements = new Map<any[], any[]>(); let matches = 0; let mismatches = 0;
    const replace = (entity: typeof entities[number], value: any) => { const original = entity.container as any[]; const cloned = replacements.get(original) ?? [...original]; cloned[entity.index!] = value; replacements.set(original, cloned); };
    for (const entity of entities) {
      if (entity.kind === 'string') {
        const value = entity.value; const arrayIndex = numberOrNull(value.arrayIndex ?? value.ArrayIndex ?? value.arrayNumber ?? value.array); const stringIndex = numberOrNull(value.stringIndex ?? value.StringIndex ?? value.stringNumber ?? value.string); const graph = this.resolveString({ arrayIndex: arrayIndex ?? undefined, stringIndex: stringIndex ?? undefined, stringKey: value.stringKey ?? value.StringKey ?? value.id });
        if (!graph || graph.arrayIndex !== arrayIndex || graph.stringIndex !== stringIndex) { mismatches += 1; this.sample(route, 'string', `${arrayIndex}:${stringIndex}`, graph ? 'coordinate mismatch' : 'missing graph identity'); continue; }
        const es = this.resolveEnergySegment({ canonicalKey: graph.energySegmentId }); if (!es) { mismatches += 1; this.sample(route, 'energy-segment', graph.energySegmentId, 'missing graph relationship target'); continue; }
        const legacyEs = numberOrNull(value.energySegmentNumber ?? value.identity?.localEsNumber); if (legacyEs != null && legacyEs !== es.energySegmentIndex) { mismatches += 1; this.sample(route, 'energy-segment', `${arrayIndex}:${legacyEs}`, `graph maps to ES${es.energySegmentIndex}`); continue; }
        matches += 1; const next = { ...value, arrayIndex: typeof value.arrayIndex === 'string' ? String(graph.arrayIndex) : graph.arrayIndex, stringIndex: typeof value.stringIndex === 'string' ? String(graph.stringIndex) : graph.stringIndex };
        if ('arrayNumber' in value) next.arrayNumber = graph.arrayIndex; if ('stringNumber' in value) next.stringNumber = graph.stringIndex; if ('energySegmentNumber' in value) next.energySegmentNumber = es.energySegmentIndex; if ('containerNumber' in value) next.containerNumber = es.energySegmentIndex;
        if (value.identity && typeof value.identity === 'object') { const feather = [...(this.indexes?.feathers.values() ?? [])].find((candidate) => candidate.arrayIndex === graph.arrayIndex && candidate.energySegmentIndex === es.energySegmentIndex); next.identity = { ...value.identity, arrayIndex: graph.arrayIndex, stringNumber: graph.stringIndex, localEsNumber: es.energySegmentIndex, displayName: graph.displayName, featherIp: feather?.deviceIp ?? value.identity.featherIp }; }
        replace(entity, next);
      } else if (entity.kind === 'array') {
        const arrayIndex = numberOrNull(entity.value.arrayIndex ?? entity.value.arrayNumber); const graph = this.resolveArray({ arrayIndex: arrayIndex ?? undefined }); if (!graph || graph.arrayIndex !== arrayIndex) { mismatches += 1; this.sample(route, 'array', String(arrayIndex), 'missing or mismatched graph identity'); } else { matches += 1; replace(entity, { ...entity.value, arrayIndex: graph.arrayIndex, ...('arrayNumber' in entity.value ? { arrayNumber: graph.arrayIndex } : {}) }); }
      } else if (entity.kind === 'feather') {
        const ip = normalizeIp(entity.value.deviceIp ?? entity.value.ipAddress ?? entity.value.ip); const graph = this.resolveFeather({ controllerIp: ip ?? undefined }); const arrayIndex = numberOrNull(entity.value.arrayIndex); const segmentIndex = numberOrNull(entity.value.energySegmentIndex ?? entity.value.stringIndex); if (!graph || graph.deviceIp !== ip || (arrayIndex != null && graph.arrayIndex !== arrayIndex) || (segmentIndex != null && graph.energySegmentIndex !== segmentIndex)) { mismatches += 1; this.sample(route, 'feather', ip ?? 'unknown', 'missing or mismatched graph identity'); } else { matches += 1; replace(entity, { ...entity.value, deviceIp: graph.deviceIp, arrayIndex: graph.arrayIndex, ...('energySegmentIndex' in entity.value ? { energySegmentIndex: graph.energySegmentIndex } : {}), ...('stringIndex' in entity.value ? { stringIndex: graph.energySegmentIndex } : {}) }); }
      } else if (entity.kind === 'pcs') {
        const arrayIndex = numberOrNull(entity.value.arrayIndex ?? entity.value.arrayNumber); const pcsIndex = numberOrNull(entity.value.pcsIndex ?? entity.value.arrayPcsIndex ?? entity.value.index) ?? 1; const graph = this.resolvePCS({ arrayIndex: arrayIndex ?? undefined, pcsIndex }); if (!graph || graph.arrayIndex !== arrayIndex || graph.pcsIndex !== pcsIndex) { mismatches += 1; this.sample(route, 'pcs', `${arrayIndex}:${pcsIndex}`, 'missing or mismatched graph identity'); } else { matches += 1; replace(entity, { ...entity.value, arrayIndex: graph.arrayIndex, pcsIndex: graph.pcsIndex }); }
      } else {
        const ip = parseEmsIp(entity.value.emsBaseUrl ?? entity.value.activeEmsBaseUrl); const graph = this.resolveEMS({ controllerIp: ip ?? undefined }); if (!graph || graph.deviceIp !== ip) { mismatches += 1; this.sample(route, 'ems', ip ?? 'unknown', 'missing or mismatched graph identity'); } else matches += 1;
      }
    }
    if (Array.isArray((payload as any)?.data) && replacements.has((payload as any).data)) root.data = replacements.get((payload as any).data);
    if (Array.isArray((payload as any)?.strings) && replacements.has((payload as any).strings)) root.strings = replacements.get((payload as any).strings);
    if (Array.isArray((payload as any)?.stringSummary?.tableRows) && replacements.has((payload as any).stringSummary.tableRows)) root.stringSummary = { ...(payload as any).stringSummary, tableRows: replacements.get((payload as any).stringSummary.tableRows) };
    if (Array.isArray((payload as any)?.arraySummary) && replacements.has((payload as any).arraySummary)) root.arraySummary = replacements.get((payload as any).arraySummary);
    if (Array.isArray((payload as any)?.arrays) && replacements.has((payload as any).arrays)) root.arrays = replacements.get((payload as any).arrays);
    if (Array.isArray((payload as any)?.featherSummary?.devices) && replacements.has((payload as any).featherSummary.devices)) root.featherSummary = { ...(payload as any).featherSummary, devices: replacements.get((payload as any).featherSummary.devices) };
    if (Array.isArray((payload as any)?.pcsSummary) && replacements.has((payload as any).pcsSummary)) root.pcsSummary = replacements.get((payload as any).pcsSummary);
    return { payload: root, matches, mismatches };
  }
  private sample(route: string, kind: string, identity: string, reason: string): void { if (this.mismatchSamples.length < 25) this.mismatchSamples.push({ route, kind, identity, reason }); }
  private route(route: string) { const current = this.routeMetrics.get(route) ?? { requests: 0, matches: 0, mismatches: 0, graphUses: 0, legacyUses: 0, fallbacks: 0 }; this.routeMetrics.set(route, current); return current; }
  private record(metric: MutableTimingMetric, value: number): void { metric.latestMs = value; metric.minimumMs = metric.minimumMs == null ? value : Math.min(metric.minimumMs, value); metric.maximumMs = metric.maximumMs == null ? value : Math.max(metric.maximumMs, value); metric.sampleCount += 1; metric.totalMs += value; }
  private measure<T>(metric: MutableTimingMetric, operation: () => T): T { const started = performance.now(); const value = operation(); this.record(metric, performance.now() - started); return value; }
  private timingReport(metric: MutableTimingMetric): TimingMetric { return { ...metric, averageMs: metric.sampleCount ? metric.totalMs / metric.sampleCount : null }; }
  private graphOnlyEligibility(): { eligible: boolean; parityReady: boolean; blockers: string[] } {
    const tracked = this.readiness.readiness(); const blockers = [...tracked.blockers]; const state = this.runtime.getRuntimeState?.();
    if (this.runtime.getRuntimeHealthy && !this.runtime.getRuntimeHealthy()) blockers.push(`runtime-state:${state ?? 'unhealthy'}`);
    const diagnostics = this.runtime.getDiagnostics?.(); if (diagnostics?.duplicates) blockers.push(`topology-duplicates:${diagnostics.duplicates}`); if (diagnostics?.missing) blockers.push(`topology-missing:${diagnostics.missing}`); if (diagnostics?.dangling) blockers.push(`dangling-relationships:${diagnostics.dangling}`);
    return { eligible: blockers.length === 0, parityReady: tracked.ready, blockers: [...new Set(blockers)] };
  }
  private rollback(reason: string): void { this.automaticRollbacks += 1; this.fallbackReasons.set(reason, (this.fallbackReasons.get(reason) ?? 0) + 1); }
}

export const graphIdentityResolver = new GraphIdentityResolver();
