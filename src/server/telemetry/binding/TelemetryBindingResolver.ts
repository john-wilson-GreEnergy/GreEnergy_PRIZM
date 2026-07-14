import type { EmsControllerObject, ObjectGraphSnapshot, StringObject } from '../../../core/objectGraph';
import { bindingFingerprint, compactTelemetryValue, deterministicBindingId, immutableBindingValue, telemetryFingerprintValue, BINDING_SCHEMA_VERSION, TELEMETRY_SNAPSHOT_VERSION } from './TelemetryBindingSnapshot';
import type { TelemetryBindingDomain, TelemetryBindingIndexes, TelemetryBindingReadiness, TelemetryBindingSnapshot, TelemetryObservationBinding } from './TelemetryBindingTypes';

export interface TelemetryBindingBuildInput {
  readonly graph: ObjectGraphSnapshot;
  readonly graphFingerprint: string;
  readonly graphSourceFingerprint: string;
  readonly graphHealthy: boolean;
  readonly graphCycleId: number | null;
  readonly profileIdentity: string | null;
  readonly telemetryProfileIdentity: string | null;
  readonly cycleId: number | null;
  readonly capturedAt: string | null;
  readonly strings: readonly Readonly<Record<string, unknown>>[];
  readonly controllerHealth: Readonly<Record<string, unknown>> | null;
  readonly authorities: Readonly<Record<string, unknown>>;
  readonly providerHealth: Readonly<Record<string, unknown>>;
  readonly retainedLastKnownGood?: boolean;
}

const positive = (value: unknown): number | null => { const number = Number(value); return Number.isSafeInteger(number) && number > 0 ? number : null; };
const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value : null;
const timestamp = (row: Readonly<Record<string, unknown>>, keys: readonly string[]): string | null => {
  for (const key of keys) { const value = row[key]; if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return new Date(value).toISOString(); }
  return null;
};
const authorityFor = (authorities: Readonly<Record<string, unknown>>, domain: TelemetryBindingDomain): Readonly<Record<string, unknown>> => {
  const value = authorities[domain]; return value && typeof value === 'object' ? value as Readonly<Record<string, unknown>> : {};
};
const readiness = (expected: number, bound: number, stale: number, blockers: string[]): TelemetryBindingReadiness => immutableBindingValue({ ready: blockers.length === 0 && expected === bound, blockers: [...new Set(blockers)], expected, bound, stale });

export function telemetryBindingSourceFingerprint(input: TelemetryBindingBuildInput): string {
  return bindingFingerprint({ schema: BINDING_SCHEMA_VERSION, graphFingerprint: input.graphFingerprint, graphSourceFingerprint: input.graphSourceFingerprint, cycleId: input.cycleId, profileIdentity: input.profileIdentity, telemetryProfileIdentity: input.telemetryProfileIdentity, strings: input.strings.map(telemetryFingerprintValue), controllerHealth: telemetryFingerprintValue(input.controllerHealth), authorities: telemetryFingerprintValue(input.authorities) });
}

export class TelemetryBindingResolver {
  async build(input: TelemetryBindingBuildInput): Promise<TelemetryBindingSnapshot> {
    if (!input.graphHealthy) throw new Error('topology-graph-not-ready');
    if (!input.graphFingerprint || !input.graphSourceFingerprint) throw new Error('topology-fingerprint-missing');
    const generatedAt = new Date().toISOString();
    const crossProfile = !!input.profileIdentity && !!input.telemetryProfileIdentity && input.profileIdentity !== input.telemetryProfileIdentity;
    if (crossProfile) throw new Error(`cross-profile-binding:${input.telemetryProfileIdentity}:${input.profileIdentity}`);

    const graphStrings = input.graph.objects.filter((object): object is StringObject => object.kind === 'string');
    const graphControllers = input.graph.objects.filter((object): object is EmsControllerObject => object.kind === 'ems-controller');
    const { GraphIdentityResolver } = await import('../../topology/GraphIdentityResolver');
    const identity = new GraphIdentityResolver({ getSnapshot: () => input.graph, getFingerprint: () => input.graphFingerprint, getSourceFingerprint: () => input.graphSourceFingerprint, getCycleId: () => input.graphCycleId, getRuntimeState: () => 'READY_HYBRID', getRuntimeHealthy: () => true, ensure: async () => {} });
    await identity.prepare();
    const seen = new Set<string>(); let missingIdentityCount = 0; let duplicateBindingCount = 0;
    const stringBindings: TelemetryObservationBinding[] = [];
    const stringAuthority = authorityFor(input.authorities, 'string-telemetry');
    for (const row of input.strings) {
      const arrayIndex = positive(row.arrayIndex ?? row.ArrayIndex ?? row.arrayNumber ?? row.array);
      const stringIndex = positive(row.stringIndex ?? row.StringIndex ?? row.stringNumber ?? row.string);
      const object = arrayIndex && stringIndex ? identity.resolveString({ arrayIndex, stringIndex }) ?? undefined : undefined;
      if (!object) { missingIdentityCount += 1; continue; }
      const bindingId = deterministicBindingId('string-telemetry', object.id);
      if (seen.has(bindingId)) { duplicateBindingCount += 1; continue; } seen.add(bindingId);
      stringBindings.push(this.binding(input, 'string-telemetry', object, row, stringAuthority, generatedAt, { arrayIndex: object.arrayIndex, stringIndex: object.stringIndex, energySegmentId: object.energySegmentId }));
    }

    const controllerBindings: TelemetryObservationBinding[] = [];
    const controllerAuthority = authorityFor(input.authorities, 'controller-health');
    const graphController = graphControllers.length === 1 ? identity.resolveEMS({ objectId: graphControllers[0].id }) : null;
    if (input.controllerHealth && graphController) controllerBindings.push(this.binding(input, 'controller-health', graphController, input.controllerHealth, controllerAuthority, generatedAt, { deviceIp: graphController.deviceIp }));
    else if (input.controllerHealth || graphControllers.length) missingIdentityCount += input.controllerHealth ? 1 : 0;

    const all = [...stringBindings, ...controllerBindings];
    const indexes = this.index(all);
    const staleBindingCount = all.filter((binding) => binding.stale).length;
    const retainedBindingCount = all.filter((binding) => binding.retainedLastKnownGood).length;
    const commonBlockers = duplicateBindingCount ? [`duplicate-bindings:${duplicateBindingCount}`] : [];
    const stringBlockers = [...commonBlockers]; if (graphStrings.length !== 320) stringBlockers.push(`canonical-string-count:${graphStrings.length}:expected-320`); if (missingIdentityCount) stringBlockers.push(`missing-identities:${missingIdentityCount}`);
    const controllerBlockers = [...commonBlockers];
    const missingTelemetryCount = Math.max(0, graphStrings.length - stringBindings.length) + Math.max(0, graphControllers.length - controllerBindings.length);
    if (graphStrings.length !== stringBindings.length) stringBlockers.push(`missing-telemetry:${graphStrings.length - stringBindings.length}`);
    if (graphControllers.length !== controllerBindings.length) controllerBlockers.push(`missing-telemetry:${graphControllers.length - controllerBindings.length}`);
    if (stringBindings.some((binding) => binding.stale)) stringBlockers.push(`stale-bindings:${stringBindings.filter((binding) => binding.stale).length}`);
    if (controllerBindings.some((binding) => binding.stale)) controllerBlockers.push(`stale-bindings:${controllerBindings.filter((binding) => binding.stale).length}`);
    if (!text(stringAuthority.chosenProviderId ?? stringAuthority.providerId)) stringBlockers.push('authority-provider-missing');
    if (!text(controllerAuthority.chosenProviderId ?? controllerAuthority.providerId)) controllerBlockers.push('authority-provider-missing');
    const bindingSourceFingerprint = telemetryBindingSourceFingerprint(input);
    const bindingsByDomain = immutableBindingValue({ 'string-telemetry': stringBindings, 'controller-health': controllerBindings });
    const bindingFingerprintValue = bindingFingerprint({ schema: BINDING_SCHEMA_VERSION, graph: input.graphFingerprint, source: bindingSourceFingerprint, bindings: all.map((binding) => ({ bindingId: binding.bindingId, sourceFingerprint: binding.sourceFingerprint, cycleId: binding.cycleId })) });
    return immutableBindingValue({ generatedAt, cycleId: input.cycleId, graphFingerprint: input.graphFingerprint, graphSourceFingerprint: input.graphSourceFingerprint, bindingFingerprint: bindingFingerprintValue, bindingSourceFingerprint, telemetrySnapshotVersion: TELEMETRY_SNAPSHOT_VERSION, bindingSchemaVersion: BINDING_SCHEMA_VERSION, bindingsByDomain, countsByDomain: { 'string-telemetry': stringBindings.length, 'controller-health': controllerBindings.length }, missingIdentityCount, missingTelemetryCount, duplicateBindingCount, staleBindingCount, retainedBindingCount, crossProfileBindingCount: 0, authoritySummary: input.authorities, health: input.providerHealth, sourceMetadata: [{ name: 'coordinator-normalized-strings', count: input.strings.length, cycleId: input.cycleId, capturedAt: input.capturedAt }, { name: 'telemetry-broker-controller-health', available: !!input.controllerHealth, cycleId: input.cycleId }], readinessByDomain: { 'string-telemetry': readiness(320, stringBindings.length, stringBindings.filter((value) => value.stale).length, stringBlockers), 'controller-health': readiness(1, controllerBindings.length, controllerBindings.filter((value) => value.stale).length, controllerBlockers) }, indexes });
  }

  private binding(input: TelemetryBindingBuildInput, domain: TelemetryBindingDomain, object: StringObject | EmsControllerObject, row: Readonly<Record<string, unknown>>, authority: Readonly<Record<string, unknown>>, publishedAt: string, metadata: Readonly<Record<string, unknown>>): TelemetryObservationBinding {
    const observedAt = timestamp(row, ['observedAt', 'sourceObservationTimestamp', 'lastUpdated', 'timestamp', 'Timestamp']);
    const acquiredAt = timestamp(row, ['acquiredAt', 'acquisitionTimestamp', 'capturedAt']) ?? input.capturedAt;
    const normalizedAt = timestamp(row, ['normalizedAt']) ?? input.capturedAt;
    const ageMs = observedAt ? Math.max(0, Date.now() - Date.parse(observedAt)) : null;
    const stale = Boolean(authority.stale ?? row.stale ?? row.staleData);
    const providerId = text(authority.chosenProviderId ?? authority.providerId);
    const value = compactTelemetryValue(row) as Readonly<Record<string, unknown>>;
    return immutableBindingValue({ bindingId: deterministicBindingId(domain, object.id), objectId: object.id, objectKind: object.kind, canonicalKey: object.canonicalKey, telemetryDomain: domain, value, observedAt, acquiredAt, normalizedAt, publishedAt, ageMs, stale, retainedLastKnownGood: Boolean(input.retainedLastKnownGood || authority.retainedLastKnownGood), sourceProviderId: providerId, sourceEndpoint: text(authority.sourceEndpoint ?? authority.endpoint), sourceFingerprint: bindingFingerprint({ domain, providerId, value: telemetryFingerprintValue(value) }), graphFingerprint: input.graphFingerprint, graphSourceFingerprint: input.graphSourceFingerprint, cycleId: input.cycleId, producingCycleId: input.cycleId, failureCycleId: positive(authority.failureCycleId), authorityProviderId: providerId, fallbackUsed: Boolean(authority.fallbackUsed ?? authority.fallback), health: providerId && input.providerHealth[providerId] && typeof input.providerHealth[providerId] === 'object' ? input.providerHealth[providerId] as Readonly<Record<string, unknown>> : {}, confidence: stale ? 0.5 : 1, metadata });
  }

  private index(bindings: readonly TelemetryObservationBinding[]): TelemetryBindingIndexes {
    const byBindingId: Record<string, TelemetryObservationBinding> = {}; const byObjectId: Record<string, string[]> = {}; const byCanonicalKey: Record<string, string[]> = {}; const byDomain: Record<TelemetryBindingDomain, string[]> = { 'string-telemetry': [], 'controller-health': [] }; const stringByCoordinate: Record<string, string> = {}; const stringsByEnergySegment: Record<string, string[]> = {}; const controllerHealthByObjectId: Record<string, string> = {};
    for (const binding of bindings) { byBindingId[binding.bindingId] = binding; (byObjectId[binding.objectId] ??= []).push(binding.bindingId); (byCanonicalKey[binding.canonicalKey] ??= []).push(binding.bindingId); byDomain[binding.telemetryDomain].push(binding.bindingId); if (binding.telemetryDomain === 'string-telemetry') { const coordinate = `${binding.metadata.arrayIndex}:${binding.metadata.stringIndex}`; stringByCoordinate[coordinate] = binding.bindingId; const segment = String(binding.metadata.energySegmentId); (stringsByEnergySegment[segment] ??= []).push(binding.bindingId); } else controllerHealthByObjectId[binding.objectId] = binding.bindingId; }
    return immutableBindingValue({ byBindingId, byObjectId, byCanonicalKey, byDomain, stringByCoordinate, stringsByEnergySegment, controllerHealthByObjectId });
  }
}
