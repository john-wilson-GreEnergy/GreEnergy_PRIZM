import { createHash } from 'node:crypto';
import { ObjectGraph, ObjectGraphBuilder, type ObjectGraphBuilderInput } from '../../core/objectGraph';
import { stringNumberToEnergySegment } from '../../lib/stringToEsMapper';
import { getLatestSnapshot } from '../prizmDataCoordinator';
import { getEmsCachedRawStrings, getEmsStringIpMap } from '../emsTurtleClient';
import { getFeatherCache } from '../feather/featherClient';
import { ProfileStore } from '../profiles/profileStore';
import { generateExpectedDevices, getActiveTopologyProfile, type SiteTopologyDevice, type SiteTopologyProfile } from './siteTopologyEngine';
import { parseTurtleJsonOrLabeledSections } from './turtleParsers';
import { immutableTopologySourceSnapshot, type TopologyBatteryPackSource, type TopologyFeatherSource, type TopologyIdentityDiagnostic, type TopologyPcsSource, type TopologyProfileIdentity, type TopologySourceMetadata, type TopologySourceSnapshot, type TopologyStringSource } from './TopologySourceSnapshot';

export interface ConnectionTopologyInput {
  readonly id: string;
  readonly profileName: string;
  readonly siteName: string;
  readonly stationCode: string;
  readonly emsHost: string;
  readonly emsPort: number;
  readonly turtlePath: string;
  readonly arrayCount: number;
  readonly stringsPerArray: number;
  readonly updatedAt: string;
}

export interface CurrentTopologyProfileIdentity {
  readonly fingerprint: string;
  readonly identity: TopologyProfileIdentity;
}

export interface LiveTopologyInputs {
  readonly collectedAt?: string;
  readonly cycleId?: number | null;
  readonly connectionProfile: ConnectionTopologyInput;
  readonly topologyProfile: SiteTopologyProfile;
  readonly expectedDevices: readonly SiteTopologyDevice[];
  readonly cachedStrings?: readonly Record<string, unknown>[];
  readonly stringIpMap?: readonly Record<string, unknown>[];
  readonly cachedFeathers?: readonly Record<string, unknown>[];
  readonly sourceTimestamps?: Readonly<Record<string, string | null>>;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

export function topologyFingerprint(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

export function createTopologyProfileIdentity(connectionProfile: ConnectionTopologyInput, topologyProfile: SiteTopologyProfile, expectedDevices: readonly SiteTopologyDevice[]): CurrentTopologyProfileIdentity {
  const stringsPerEnergySegment = topologyProfile.assumptions.stringsPerEnergySegment ?? 2;
  const energySegmentsPerArray = topologyProfile.assumptions.energySegmentsPerArray ?? Math.ceil(connectionProfile.stringsPerArray / stringsPerEnergySegment);
  const identity: TopologyProfileIdentity = {
    connectionProfileId: connectionProfile.id,
    topologyProfileId: topologyProfile.id,
    siteId: topologyProfile.stationCode || connectionProfile.stationCode,
    ems: { host: connectionProfile.emsHost.toLowerCase(), port: connectionProfile.emsPort, turtlePath: connectionProfile.turtlePath },
    layout: { arrayCount: topologyProfile.assumptions.arrayCount || connectionProfile.arrayCount, stringsPerArray: energySegmentsPerArray * stringsPerEnergySegment, energySegmentsPerArray, stringsPerEnergySegment },
    featherExpectations: expectedDevices.filter((device) => device.deviceType.includes('feather')).map((device) => `${device.id}:${device.ip.toLowerCase()}:${device.arrayIndex ?? ''}:${device.energySegmentIndex ?? ''}:${device.segmentType}`).sort(),
    pcsExpectations: expectedDevices.filter((device) => device.deviceType === 'pcs').map((device) => `${device.id}:${device.ip.toLowerCase()}:${device.arrayIndex ?? ''}`).sort(),
  };
  return { fingerprint: topologyFingerprint(identity), identity };
}

export function collectCurrentTopologyProfileIdentity(): CurrentTopologyProfileIdentity {
  const connectionProfile = ProfileStore.getActiveProfile();
  const topologyProfile = getActiveTopologyProfile();
  return createTopologyProfileIdentity(connectionProfile, topologyProfile, generateExpectedDevices(topologyProfile));
}

function finitePositive(value: unknown): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function stringIdentity(row: Record<string, unknown>): { arrayIndex: number; stringIndex: number } | null {
  const arrayIndex = finitePositive(row.ArrayIndex ?? row.arrayIndex ?? row.arrayNumber ?? row.array ?? row.StringArrayIndex);
  const stringIndex = finitePositive(row.StringIndex ?? row.stringIndex ?? row.stringNumber ?? row.string);
  return arrayIndex && stringIndex ? { arrayIndex, stringIndex } : null;
}

function mappedIp(row: Record<string, unknown>): string | null {
  const value = row.ipAddress ?? row.ip ?? row.deviceIp;
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null;
}

function sourceMetadata(name: string, priority: number, value: unknown, observedAt: string | null): TopologySourceMetadata {
  const available = Array.isArray(value) ? value.length > 0 : value != null;
  return { name, priority, observedAt, fingerprint: topologyFingerprint(value), available };
}

function duplicateDiagnostics(keys: readonly string[], kind: string): TopologyIdentityDiagnostic[] {
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  const duplicates = [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key).sort();
  return duplicates.length ? [{ code: `duplicate-${kind}`, message: `Duplicate ${kind} identities were present in topology sources.`, identities: duplicates }] : [];
}

export function createTopologySourceSnapshot(input: LiveTopologyInputs): TopologySourceSnapshot {
  const generatedAt = input.collectedAt ?? new Date().toISOString();
  const profile = createTopologyProfileIdentity(input.connectionProfile, input.topologyProfile, input.expectedDevices);
  const assumptions = input.topologyProfile.assumptions;
  const arrayCount = assumptions.arrayCount || input.connectionProfile.arrayCount;
  const stringsPerEnergySegment = assumptions.stringsPerEnergySegment ?? 2;
  const energySegmentsPerArray = assumptions.energySegmentsPerArray ?? Math.ceil(input.connectionProfile.stringsPerArray / stringsPerEnergySegment);
  const stringsPerArray = energySegmentsPerArray * stringsPerEnergySegment;
  const arrays = Array.from({ length: arrayCount }, (_, index) => ({ arrayIndex: index + 1 }));
  const energySegments = arrays.flatMap(({ arrayIndex }) => Array.from({ length: energySegmentsPerArray }, (_, index) => ({ arrayIndex, energySegmentIndex: index + 1 })));

  const ipByString = new Map<string, string>();
  const rawMapKeys: string[] = [];
  for (const row of input.stringIpMap ?? []) {
    const identity = stringIdentity(row); const ip = mappedIp(row);
    if (!identity || !ip) continue;
    const key = `${identity.arrayIndex}:${identity.stringIndex}`; rawMapKeys.push(key);
    if (!ipByString.has(key)) ipByString.set(key, ip);
  }
  const cachedStringKeys: string[] = [];
  for (const row of input.cachedStrings ?? []) { const identity = stringIdentity(row); if (identity) cachedStringKeys.push(`${identity.arrayIndex}:${identity.stringIndex}`); }
  const strings: TopologyStringSource[] = arrays.flatMap(({ arrayIndex }) => Array.from({ length: stringsPerArray }, (_, index) => {
    const stringIndex = index + 1;
    const energySegmentIndex = stringNumberToEnergySegment(stringIndex);
    if (energySegmentIndex == null) throw new Error(`Unable to map string ${stringIndex} to an Energy Segment`);
    return { arrayIndex, stringIndex, energySegmentIndex, ipAddress: ipByString.get(`${arrayIndex}:${stringIndex}`) ?? null, source: ipByString.has(`${arrayIndex}:${stringIndex}`) ? 'stringIPMap+topology-profile' : 'topology-profile' };
  }));

  const expectedFeathers = input.expectedDevices.filter((device) => device.deviceType === 'feather' || device.deviceType === 'collection-segment-feather' || device.deviceType === 'energy-segment-feather');
  const cachedFeathersByIp = new Map((input.cachedFeathers ?? []).flatMap((row) => { const ip = mappedIp(row); return ip ? [[ip, row] as const] : []; }));
  const feathers: TopologyFeatherSource[] = expectedFeathers.map((device) => {
    const cached = cachedFeathersByIp.get(device.ip);
    const arrayIndex = device.arrayIndex ?? finitePositive(cached?.arrayIndex) ?? null;
    const energySegmentIndex = device.energySegmentIndex ?? null;
    const segmentType: TopologyFeatherSource['segmentType'] = device.segmentType === 'CS' || device.segmentType === 'ES' ? device.segmentType : 'UNKNOWN';
    return { deviceIp: device.ip.toLowerCase(), arrayIndex, energySegmentIndex, segmentType, source: cached ? 'topology-profile+feather-cache' : 'topology-profile' };
  }).sort((a, b) => a.deviceIp.localeCompare(b.deviceIp, undefined, { numeric: true }));

  const pcs: TopologyPcsSource[] = input.expectedDevices.filter((device) => device.deviceType === 'pcs' && device.arrayIndex != null).map((device) => ({ arrayIndex: device.arrayIndex!, pcsIndex: finitePositive(device.id.match(/(\d+)$/)?.[1]) ?? 1, ipAddress: device.ip || null, source: 'topology-profile' })).sort((a, b) => a.arrayIndex - b.arrayIndex || a.pcsIndex - b.pcsIndex);
  const batteryPacks: TopologyBatteryPackSource[] = input.expectedDevices.filter((device) => device.deviceType === 'bms-phoenix' && device.arrayIndex != null && device.stringIndex != null).map((device) => ({ arrayIndex: device.arrayIndex!, stringIndex: device.stringIndex!, batteryPackIndex: 1, source: 'topology-profile-explicit-device' }));

  const ambiguous: TopologyIdentityDiagnostic[] = [];
  const cachedKnown = new Set(strings.map((value) => `${value.arrayIndex}:${value.stringIndex}`));
  const unknownCachedStrings = [...new Set(cachedStringKeys.filter((key) => !cachedKnown.has(key)))].sort();
  if (unknownCachedStrings.length) ambiguous.push({ code: 'cached-string-outside-profile', message: 'Cached string identities fall outside the active topology profile.', identities: unknownCachedStrings });
  const missing: TopologyIdentityDiagnostic[] = [];
  if (!input.connectionProfile.stationCode) missing.push({ code: 'missing-site-identity', message: 'The active connection profile has no station code.', identities: [] });
  if (!feathers.length) missing.push({ code: 'missing-feather-mapping', message: 'No Feather identities are defined by the active topology profile.', identities: [] });

  const sources = [
    sourceMetadata('active-topology-profile', 1, { id: input.topologyProfile.id, stationCode: input.topologyProfile.stationCode, siteName: input.topologyProfile.siteName, customer: input.topologyProfile.customer, layoutFamily: input.topologyProfile.layoutFamily, assumptions: input.topologyProfile.assumptions, ipPlan: input.topologyProfile.ipPlan }, input.sourceTimestamps?.topologyProfile ?? input.topologyProfile.updatedAt),
    sourceMetadata('active-connection-profile', 2, { id: input.connectionProfile.id, stationCode: input.connectionProfile.stationCode, emsHost: input.connectionProfile.emsHost, emsPort: input.connectionProfile.emsPort, turtlePath: input.connectionProfile.turtlePath, arrayCount: input.connectionProfile.arrayCount, stringsPerArray: input.connectionProfile.stringsPerArray }, input.sourceTimestamps?.connectionProfile ?? input.connectionProfile.updatedAt),
    sourceMetadata('strings.csv-cache', 3, [...cachedStringKeys].sort(), input.sourceTimestamps?.strings ?? null),
    sourceMetadata('stringIPMap-cache', 4, [...ipByString.entries()].sort(([left], [right]) => left.localeCompare(right)), input.sourceTimestamps?.stringIpMap ?? null),
    sourceMetadata('feather-cache', 5, [...cachedFeathersByIp.keys()].sort(), input.sourceTimestamps?.feather ?? null),
  ];
  const duplicate = [
    ...duplicateDiagnostics(cachedStringKeys, 'cached-string'),
    ...duplicateDiagnostics(rawMapKeys, 'string-ip-map'),
    ...duplicateDiagnostics(feathers.map((value) => value.deviceIp), 'feather'),
    ...duplicateDiagnostics(pcs.map((value) => `${value.arrayIndex}:${value.pcsIndex}`), 'pcs'),
  ];
  const identity = {
    site: { siteId: input.topologyProfile.stationCode || input.connectionProfile.stationCode, name: input.topologyProfile.siteName || input.connectionProfile.siteName, customer: input.topologyProfile.customer ?? null },
    ems: { deviceIp: input.connectionProfile.emsHost, port: input.connectionProfile.emsPort, turtlePath: input.connectionProfile.turtlePath },
    arrays, energySegments, strings, batteryPacks, feathers, pcs, sources,
    diagnostics: { missing, ambiguous, duplicates: duplicate },
  };
  const fingerprint = topologyFingerprint({ site: identity.site, ems: identity.ems, arrays, energySegments, strings, batteryPacks, feathers, pcs, diagnostics: identity.diagnostics });
  return immutableTopologySourceSnapshot({ generatedAt, cycleId: input.cycleId ?? null, profileFingerprint: profile.fingerprint, profileIdentity: profile.identity, ...identity }, fingerprint);
}

function flattenedMap(value: unknown): Record<string, unknown>[] {
  return parseTurtleJsonOrLabeledSections(value).flattened.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
}

export async function collectLiveTopologySourceSnapshot(): Promise<TopologySourceSnapshot> {
  const connectionProfile = ProfileStore.getActiveProfile();
  const topologyProfile = getActiveTopologyProfile();
  const stringsResponse = getEmsCachedRawStrings();
  const stringIpResponse = getEmsStringIpMap();
  const featherCache = getFeatherCache();
  const coordinator = getLatestSnapshot();
  const rawStrings = Array.isArray(stringsResponse.data) ? stringsResponse.data : [];
  return createTopologySourceSnapshot({
    cycleId: coordinator?.cycleId ?? featherCache.cycleId ?? null,
    connectionProfile,
    topologyProfile,
    expectedDevices: generateExpectedDevices(topologyProfile),
    cachedStrings: rawStrings,
    stringIpMap: flattenedMap(stringIpResponse.data),
    cachedFeathers: featherCache.devices as unknown as Record<string, unknown>[],
    sourceTimestamps: { topologyProfile: topologyProfile.updatedAt, connectionProfile: connectionProfile.updatedAt, strings: coordinator?.liveStatus.lastUpdated ?? null, stringIpMap: coordinator?.liveStatus.lastUpdated ?? null, feather: featherCache.lastUpdatedAt },
  });
}

export function topologyBuilderInput(source: TopologySourceSnapshot): ObjectGraphBuilderInput {
  return {
    site: { siteId: source.site.siteId, name: source.site.name, customer: source.site.customer ?? undefined, metadata: { topologySourceFingerprint: source.fingerprint } },
    arrays: source.arrays,
    energySegments: source.energySegments,
    strings: source.strings.map((value) => ({ ...value, controllerIp: value.ipAddress ?? undefined, metadata: { identitySource: value.source } })),
    batteryPacks: source.batteryPacks,
    featherControllers: source.feathers.map((value) => ({ deviceIp: value.deviceIp, arrayIndex: value.arrayIndex ?? undefined, energySegmentIndex: value.energySegmentIndex ?? undefined, metadata: { identitySource: value.source, segmentType: value.segmentType } })),
    pcsControllers: source.pcs.map((value) => ({ arrayIndex: value.arrayIndex, pcsIndex: value.pcsIndex, metadata: { identitySource: value.source, ipAddress: value.ipAddress } })),
    emsController: { deviceIp: source.ems.deviceIp, port: source.ems.port, turtlePath: source.ems.turtlePath, metadata: { identitySource: 'active-connection-profile' } },
  };
}

export function buildTopologyGraph(sourceSnapshot: TopologySourceSnapshot): ObjectGraph {
  return new ObjectGraphBuilder({ now: () => new Date(sourceSnapshot.generatedAt) }).build(topologyBuilderInput(sourceSnapshot));
}

export function buildTopologyGraphWithTimings(sourceSnapshot: TopologySourceSnapshot): { graph: ObjectGraph; objectCreationDurationMs: number; relationshipCreationDurationMs: number } {
  return new ObjectGraphBuilder({ now: () => new Date(sourceSnapshot.generatedAt) }).buildWithTimings(topologyBuilderInput(sourceSnapshot));
}
