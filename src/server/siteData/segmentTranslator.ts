import { buildSiteTopologyFromCachedSources } from "../topology/siteTopology";
import { getFeatherCache } from "../feather/featherClient";
import { getTelemetryCycleId } from "../telemetry/TelemetryCycleContext";

let topologyCycleId: number | null = null;
let topologyForCycle: ReturnType<typeof buildSiteTopologyFromCachedSources> | null = null;

function getTopologyForCurrentCycle(): ReturnType<typeof buildSiteTopologyFromCachedSources> {
  const cycleId = getTelemetryCycleId();
  if (cycleId == null) return buildSiteTopologyFromCachedSources();
  if (topologyCycleId !== cycleId || !topologyForCycle) {
    topologyCycleId = cycleId;
    topologyForCycle = buildSiteTopologyFromCachedSources();
  }
  return topologyForCycle;
}

export function getSegmentName(opts: {
  lineupId?: number | null;
  arrayIndex?: number | null;
  segmentId?: number | null;
  isCollectionSegment?: boolean;
  ipAddress?: string | null;
  enclosureName?: string | null;
  fallbackName?: string | null;
}): string {
  // 1. Prefer live firstresponder enclosureName if populated
  if (opts.enclosureName && opts.enclosureName.trim()) {
    return opts.enclosureName.trim();
  }

  // Align lineupId with arrayIndex mapping (lineupId = arrayIndex + 140)
  let arrIdx = opts.arrayIndex;
  if ((arrIdx === undefined || arrIdx === null) && opts.lineupId !== undefined && opts.lineupId !== null) {
    arrIdx = opts.lineupId - 140;
  }

  const isCS = !!opts.isCollectionSegment;
  const segId = opts.segmentId;

  // 2. Try looking up the display label in Cached site topology
  if (arrIdx !== null && arrIdx !== undefined && segId !== null && segId !== undefined) {
    try {
      const topology = getTopologyForCurrentCycle();
      if (isCS) {
        // Collect block Name if mapped in topology arrays
        const blockName = topology.arrays?.find(a => a.arrayIndex === arrIdx)?.displayKey || `Array ${arrIdx}`;
        return `${blockName} Collection Segment (CS)`;
      } else {
        const strings = topology.strings || [];
        // Match string index or segment raw mapping
        const match = strings.find(s => 
          s.arrayIndex === arrIdx && 
          (s.stringIndex === segId || (s.raw && (s.raw.segment === segId || s.raw.segmentId === segId)))
        );
        if (match && match.displayKey) {
          return match.displayKey;
        }
      }
    } catch (err) {}
  }

  // 3. Fallback to Feather description/IP matching if accessible
  if (opts.ipAddress) {
    try {
      const fCache = getFeatherCache();
      const match = (fCache.devices || []).find((d: any) => (d.ip || d.deviceIp) === opts.ipAddress) as any;
      if (match && (match.entityDescription || match.segmentLabel)) {
        return match.entityDescription || match.segmentLabel;
      }
    } catch (err) {}
  }

  // 4. Default dynamic layout formatting
  if (arrIdx !== null && arrIdx !== undefined) {
    if (isCS) {
      return `Array ${arrIdx} Collection Segment (CS)`;
    } else if (segId !== null && segId !== undefined) {
      // Reconstitute standard string indices if divisible by standard step
      const stringIdx = ((segId - 10) / 5) + 1;
      if (stringIdx > 0 && Number.isInteger(stringIdx)) {
        return `Array ${arrIdx} String ${stringIdx}`;
      }
      return `Array ${arrIdx} Segment ${segId}`;
    }
    return `Array ${arrIdx} Enclosure`;
  }

  if (opts.fallbackName) return opts.fallbackName;
  if (opts.lineupId !== undefined && opts.lineupId !== null && opts.segmentId !== undefined && opts.segmentId !== null) {
    return `Lineup ${opts.lineupId} Segment ${opts.segmentId}`;
  }
  return "Segment Enclosure";
}
