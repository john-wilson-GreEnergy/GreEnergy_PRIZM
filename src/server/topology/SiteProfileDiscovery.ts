import crypto from "crypto";
import { PrizmSiteTopology } from "./siteTopology";

export type EvidenceConfidence = "confirmed" | "corroborated" | "inferred";

export interface DiscoveredLineupProfile {
  lineupIndex: number;
  energySegmentCount: number | null;
  energySegmentIndices: number[];
  stringIndices: number[];
  stringsPerEnergySegment: number | null;
  collectionSegmentDeviceIp: string | null;
  featherByEnergySegment: Record<string, string>;
  confidence: EvidenceConfidence;
}

export interface DiscoveredSiteProfileDraft {
  schemaVersion: 1;
  id: string;
  revision: number;
  status: "draft" | "active" | "superseded";
  siteKey: string;
  stationCode: string | null;
  blockIndex: number | null;
  createdAt: string;
  evidenceFingerprint: string;
  lineups: DiscoveredLineupProfile[];
  conflicts: Array<{ code: string; location: string; message: string }>;
  unresolved: Array<{ code: string; location: string; message: string }>;
  sourceSummary: Record<string, number>;
}

const finitePositive = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
};

function explicitSegmentIndex(value: any, topology?: PrizmSiteTopology): number | null {
  for (const candidate of [value?.energySegmentIndex, value?.segmentIndex, value?.raw?.energySegmentIndex, value?.raw?.EnergySegmentIndex]) {
    const number = finitePositive(candidate);
    if (number) return number;
  }
  const label = String(value?.segmentLabel ?? value?.enclosureLabel ?? value?.entityDescription ?? value?.raw?.displayName ?? "");
  const match = label.match(/\bES\s*[-_ ]?(\d+)\b/i);
  if (match) return finitePositive(match[1]);
  const ip = String(value?.ipAddress ?? value?.ip ?? value?.deviceIp ?? "");
  const parts = ip.split(".").map(Number);
  const lineup = finitePositive(value?.arrayIndex) ?? (parts.length === 4 ? finitePositive(parts[2]) : null);
  const block = topology?.expectedTopology?.blocks?.find(candidate => lineup != null && lineup >= candidate.arrayStart && lineup <= candidate.arrayEnd && ip.startsWith(`${candidate.basePrefix}.`));
  if (block && parts.length === 4) {
    const offset = parts[3] - block.esSegmentStart;
    if (offset >= 0 && offset % block.esSegmentStep === 0) {
      const derived = offset / block.esSegmentStep + 1;
      if (derived >= 1 && derived <= block.esCountPerArray) return derived;
    }
  }
  return null;
}

function isCollectionSegment(value: any, topology?: PrizmSiteTopology): boolean {
  if (/(^|\b)(CS|collection segment)(\b|$)/i.test(String(value?.segmentLabel ?? value?.enclosureLabel ?? value?.entityDescription ?? ""))) return true;
  const ip = String(value?.ipAddress ?? value?.ip ?? value?.deviceIp ?? "");
  const parts = ip.split(".").map(Number);
  const lineup = finitePositive(value?.arrayIndex) ?? (parts.length === 4 ? finitePositive(parts[2]) : null);
  const block = topology?.expectedTopology?.blocks?.find(candidate => lineup != null && lineup >= candidate.arrayStart && lineup <= candidate.arrayEnd && ip.startsWith(`${candidate.basePrefix}.`));
  return !!block && parts.length === 4 && parts[3] === block.csSegment;
}

function lineupIndexFor(value: any): number | null {
  const explicit = finitePositive(value?.arrayIndex ?? value?.array ?? value?.raw?.arrayIndex ?? value?.raw?.array);
  if (explicit) return explicit;
  const ip = String(value?.ipAddress ?? value?.ip ?? value?.deviceIp ?? "");
  const parts = ip.split(".").map(Number);
  return parts.length === 4 ? finitePositive(parts[2]) : null;
}

function expectedBlockFor(topology: PrizmSiteTopology, lineupIndex: number) {
  return topology.expectedTopology?.blocks?.find(block => lineupIndex >= block.arrayStart && lineupIndex <= block.arrayEnd) ?? null;
}

export function discoverSiteProfile(topology: PrizmSiteTopology, revision = 1, now = new Date().toISOString()): DiscoveredSiteProfileDraft {
  const observedStrings = topology.strings.filter(row => row.sourcePath !== "expected_topology");
  const observedArrays = topology.arrays.filter(row => row.sourcePath !== "expected_topology");
  const lineupIndices = new Set<number>();
  observedStrings.forEach(row => lineupIndices.add(row.arrayIndex));
  observedArrays.forEach(row => lineupIndices.add(row.arrayIndex));
  topology.featherDevices.forEach(row => { const index = lineupIndexFor(row); if (index) lineupIndices.add(index); });
  topology.ipMap.forEach(row => { const index = lineupIndexFor(row); if (index) lineupIndices.add(index); });

  // An active profile is a geometry guardrail, not proof by itself. Once any live
  // source corroborates a configured block, include the complete configured array
  // range so a partial telemetry cycle cannot shrink the discovered site.
  for (const block of topology.expectedTopology?.blocks ?? []) {
    const blockHasEvidence = [...lineupIndices].some(index => index >= block.arrayStart && index <= block.arrayEnd);
    if (blockHasEvidence) for (let index = block.arrayStart; index <= block.arrayEnd; index += 1) lineupIndices.add(index);
  }

  const conflicts: DiscoveredSiteProfileDraft["conflicts"] = [];
  const unresolved: DiscoveredSiteProfileDraft["unresolved"] = [];
  const sortedLineupIndices = [...lineupIndices].sort((a, b) => a - b);
  if (sortedLineupIndices.length && sortedLineupIndices.length !== sortedLineupIndices[sortedLineupIndices.length - 1] - sortedLineupIndices[0] + 1) {
    conflicts.push({ code: "LINEUP_NUMBERING_GAP", location: "site", message: `Observed lineup IDs ${sortedLineupIndices.join(", ")} contain a numbering gap.` });
  }
  const lineups = sortedLineupIndices.map(lineupIndex => {
    const strings = observedStrings.filter(row => row.arrayIndex === lineupIndex);
    const expectedBlock = expectedBlockFor(topology, lineupIndex);
    const feathers = topology.featherDevices.filter(row => lineupIndexFor(row) === lineupIndex);
    const mappedControllers = topology.ipMap.filter(row => lineupIndexFor(row) === lineupIndex && (explicitSegmentIndex(row, topology) != null || isCollectionSegment(row, topology)));
    const controllerCandidates = [...feathers, ...mappedControllers];
    const explicitSegments = new Set<number>();
    [...strings, ...controllerCandidates].forEach(row => { const index = explicitSegmentIndex(row, topology); if (index) explicitSegments.add(index); });
    const observedSegmentIndices = [...explicitSegments].sort((a, b) => a - b);
    const expectedSegmentCount = expectedBlock && Number.isSafeInteger(expectedBlock.esCountPerArray) && expectedBlock.esCountPerArray > 0
      ? expectedBlock.esCountPerArray
      : null;
    const segmentCount = expectedSegmentCount ?? (observedSegmentIndices.length ? Math.max(...observedSegmentIndices) : null);
    const segmentIndices = segmentCount ? Array.from({ length: segmentCount }, (_, index) => index + 1) : observedSegmentIndices;
    const stringIndices = [...new Set(strings.map(row => row.stringIndex))].sort((a, b) => a - b);
    const featherByEnergySegment: Record<string, string> = {};
    for (const feather of controllerCandidates) {
      const segment = explicitSegmentIndex(feather, topology);
      if (!segment) continue;
      if (featherByEnergySegment[String(segment)] && featherByEnergySegment[String(segment)] !== feather.ipAddress) {
        conflicts.push({ code: "DUPLICATE_SEGMENT_CONTROLLER", location: `lineup:${lineupIndex}:segment:${segment}`, message: `Multiple Feather IPs claim ES ${segment}.` });
      } else featherByEnergySegment[String(segment)] = feather.ipAddress;
    }
    const collectionIps = [...new Set(controllerCandidates.filter(row => isCollectionSegment(row, topology)).map(row => row.ipAddress))];
    if (collectionIps.length > 1) conflicts.push({ code: "DUPLICATE_COLLECTION_SEGMENT", location: `lineup:${lineupIndex}`, message: "Multiple collection-segment Feather devices were discovered." });
    if (!segmentCount) unresolved.push({ code: "SEGMENT_COUNT_UNKNOWN", location: `lineup:${lineupIndex}`, message: "No explicit energy-segment identities were supplied by observed sources." });
    if (!expectedSegmentCount && segmentCount && observedSegmentIndices.length !== segmentCount) conflicts.push({ code: "SEGMENT_NUMBERING_GAP", location: `lineup:${lineupIndex}`, message: `Observed ${observedSegmentIndices.length} of ES 1-${segmentCount}.` });
    if (expectedSegmentCount && observedSegmentIndices.some(index => index > expectedSegmentCount)) conflicts.push({ code: "SEGMENT_OUTSIDE_PROFILE", location: `lineup:${lineupIndex}`, message: `A source reported an energy segment beyond configured ES ${expectedSegmentCount}.` });
    const stringsPerEnergySegment = segmentCount && stringIndices.length && stringIndices.length % segmentCount === 0 ? stringIndices.length / segmentCount : null;
    if (segmentCount && stringIndices.length && !stringsPerEnergySegment) conflicts.push({ code: "STRING_SEGMENT_COUNT_MISMATCH", location: `lineup:${lineupIndex}`, message: `${stringIndices.length} strings cannot be evenly assigned across ${segmentCount} explicit segments.` });
    if (expectedSegmentCount && !stringIndices.length && !observedSegmentIndices.length) unresolved.push({ code: "LINEUP_NOT_CORROBORATED", location: `lineup:${lineupIndex}`, message: "The configured lineup has not yet appeared in live strings or the IP map." });
    const confidence: EvidenceConfidence = segmentCount && Object.keys(featherByEnergySegment).length === segmentCount && (!expectedBlock?.includeCollectionSegment || collectionIps.length === 1)
      ? "confirmed"
      : segmentCount && strings.length && observedSegmentIndices.length ? "corroborated" : "inferred";
    return { lineupIndex, energySegmentCount: segmentCount, energySegmentIndices: segmentIndices, stringIndices, stringsPerEnergySegment, collectionSegmentDeviceIp: collectionIps[0] ?? null, featherByEnergySegment, confidence };
  });

  if (!lineups.length) unresolved.push({ code: "NO_LINEUPS", location: "site", message: "No observed lineup identifiers are available yet." });
  const fingerprintInput = JSON.stringify({ stationCode: topology.siteIdentity.stationCode, blockIndex: topology.siteIdentity.blockIndex, lineups });
  const evidenceFingerprint = crypto.createHash("sha256").update(fingerprintInput).digest("hex");
  const siteKey = `${topology.siteIdentity.stationCode || "unknown"}:block:${topology.siteIdentity.blockIndex || "unknown"}`;
  return {
    schemaVersion: 1, id: `${siteKey.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-r${revision}`, revision, status: "draft", siteKey,
    stationCode: topology.siteIdentity.stationCode, blockIndex: topology.siteIdentity.blockIndex, createdAt: now, evidenceFingerprint, lineups, conflicts, unresolved,
    sourceSummary: { lineups: lineups.length, strings: observedStrings.length, featherDevices: topology.featherDevices.length, ipMapEntries: topology.ipMap.length, stringIpMapEntries: topology.stringIpMap.length }
  };
}
