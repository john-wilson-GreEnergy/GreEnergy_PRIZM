import os from "node:os";
import { ProfileStore } from "../profiles/profileStore";
import { getDefaultTopologyModel } from "../profiles/profileStore";
import { buildSiteTopologyFromCachedSources } from "../topology/siteTopology";
import { discoverSiteProfile } from "../topology/SiteProfileDiscovery";
import { activateSiteProfileDraft, listSiteProfileDrafts, nextSiteProfileRevision, saveSiteProfileDraft } from "../topology/SiteProfileDraftStore";

export type CommissioningCandidate = { host: string; port: number; turtlePath: string; source: "active-profile" | "saved-profile" | "environment" | "local-interface" };
export type CommissioningProbe = CommissioningCandidate & { baseUrl: string; reachable: boolean; identityConfirmed: boolean; stationCode: string | null; blockIndex: number | null; durationMs: number; error?: string };
export type SiteCommissioningStatus = { state: "idle" | "probing" | "connected" | "reconciling" | "ready-for-review" | "ambiguous" | "offline"; startedAt: string | null; completedAt: string | null; selected: CommissioningProbe | null; probes: CommissioningProbe[]; profileUpdated: boolean; topologyDraftId?: string; controlsPermitted: false; message: string };

let status: SiteCommissioningStatus = { state: "idle", startedAt: null, completedAt: null, selected: null, probes: [], profileUpdated: false, controlsPermitted: false, message: "Automatic LAN commissioning has not run." };
const normalizePath = (value: string) => `/${String(value || "turtle").replace(/^\/+|\/+$/g, "")}`;
const validIpv4 = (value: string) => /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) && value.split(".").every(part => Number(part) >= 0 && Number(part) <= 255);

export function buildCommissioningCandidates(): CommissioningCandidate[] {
  const candidates: CommissioningCandidate[] = [];
  const profiles = ProfileStore.getProfiles();
  const active = ProfileStore.getActiveProfile();
  candidates.push({ host: active.emsHost, port: active.emsPort, turtlePath: active.turtlePath, source: "active-profile" });
  profiles.filter(item => item.id !== active.id).forEach(profile => candidates.push({ host: profile.emsHost, port: profile.emsPort, turtlePath: profile.turtlePath, source: "saved-profile" }));
  for (const item of String(process.env.PRIZM_EMS_CANDIDATES || "").split(",").map(value => value.trim()).filter(Boolean)) {
    try {
      const url = new URL(item.includes("://") ? item : `http://${item}`);
      candidates.push({ host: url.hostname, port: Number(url.port || 8080), turtlePath: normalizePath(url.pathname === "/" ? "/turtle" : url.pathname), source: "environment" });
    } catch { /* Ignore malformed operator-supplied candidates. */ }
  }
  for (const records of Object.values(os.networkInterfaces())) for (const record of records || []) {
    if (record.family !== "IPv4" || record.internal || !validIpv4(record.address)) continue;
    const octets = record.address.split(".");
    const privateLan = octets[0] === "10" || (octets[0] === "172" && Number(octets[1]) >= 16 && Number(octets[1]) <= 31) || (octets[0] === "192" && octets[1] === "168");
    if (privateLan) candidates.push({ host: `${octets[0]}.${octets[1]}.${octets[2]}.3`, port: 8080, turtlePath: "/turtle", source: "local-interface" });
  }
  const seen = new Set<string>();
  return candidates.filter(candidate => {
    const key = `${candidate.host}:${candidate.port}${normalizePath(candidate.turtlePath)}`;
    if (!validIpv4(candidate.host) || seen.has(key)) return false;
    seen.add(key); candidate.turtlePath = normalizePath(candidate.turtlePath); return true;
  });
}

function findIdentity(value: any): { stationCode: string | null; blockIndex: number | null } {
  const queue = [value]; let inspected = 0;
  while (queue.length && inspected++ < 500) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    const station = current.stationCode ?? current.StationCode ?? current.siteCode ?? current.SiteCode;
    const block = current.blockIndex ?? current.BlockIndex ?? current.blockNumber ?? current.BlockNumber;
    if (typeof station === "string" && station.trim()) {
      const parsedBlock = Number(block);
      return { stationCode: station.trim(), blockIndex: Number.isSafeInteger(parsedBlock) && parsedBlock > 0 ? parsedBlock : null };
    }
    Object.values(current).forEach(nested => { if (nested && typeof nested === "object") queue.push(nested); });
  }
  return { stationCode: null, blockIndex: null };
}

async function probeCandidate(candidate: CommissioningCandidate, timeoutMs: number): Promise<CommissioningProbe> {
  const baseUrl = `http://${candidate.host}:${candidate.port}${normalizePath(candidate.turtlePath)}`;
  const started = Date.now(); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/tools/report/ems/status.json`, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    let identity = findIdentity(await response.json());
    // Some Turtle status payloads identify the product but not the station. In
    // that case corroborate identity from the canonical StringKey report.
    if (!identity.stationCode) {
      const stringsResponse = await fetch(`${baseUrl}/tools/report/ems/strings.csv`, { signal: controller.signal });
      if (stringsResponse.ok) {
        const sample = (await stringsResponse.text()).slice(0, 65536);
        const match = sample.match(/(?:ST:|ST,|station(?:Code)?[=:])\s*([A-Z0-9_-]+).*?(?:B:|B,|block(?:Index)?[=:])\s*(\d+)/i);
        if (match) identity = { stationCode: match[1], blockIndex: Number(match[2]) };
      }
    }
    return { ...candidate, baseUrl, reachable: true, identityConfirmed: !!identity.stationCode, ...identity, durationMs: Date.now() - started };
  } catch (error: any) {
    return { ...candidate, baseUrl, reachable: false, identityConfirmed: false, stationCode: null, blockIndex: null, durationMs: Date.now() - started, error: error?.name === "AbortError" ? "timeout" : String(error?.message || error) };
  } finally { clearTimeout(timer); }
}

export function getSiteCommissioningStatus(): SiteCommissioningStatus { return { ...status, probes: [...status.probes] }; }

export async function runAutomaticSiteCommissioning(options: { timeoutMs?: number; updateProfile?: boolean } = {}): Promise<SiteCommissioningStatus> {
  status = { state: "probing", startedAt: new Date().toISOString(), completedAt: null, probes: [], selected: null, profileUpdated: false, controlsPermitted: false, message: "Probing bounded EMS candidates on the local LAN." };
  const timeoutMs = Math.max(250, Math.min(options.timeoutMs || 1800, 10000));
  const probes = await Promise.all(buildCommissioningCandidates().map(candidate => probeCandidate(candidate, timeoutMs)));
  const confirmed = probes.filter(probe => probe.reachable && probe.identityConfirmed);
  if (confirmed.length !== 1) {
    status = { ...status, state: confirmed.length > 1 ? "ambiguous" : "offline", completedAt: new Date().toISOString(), probes, message: confirmed.length > 1 ? "Multiple EMS identities responded; manual selection is required." : "No identity-confirmed EMS endpoint was found." };
    return getSiteCommissioningStatus();
  }
  const selected = confirmed[0]; let profileUpdated = false;
  if (options.updateProfile !== false) {
    const active = ProfileStore.getActiveProfile();
    const changed = active.emsHost !== selected.host || active.emsPort !== selected.port || normalizePath(active.turtlePath) !== selected.turtlePath || (selected.stationCode && active.stationCode !== selected.stationCode) || (selected.blockIndex && active.blockIndex !== selected.blockIndex);
    if (changed) {
      ProfileStore.updateProfile(active.id, { emsHost: selected.host, emsPort: selected.port, turtlePath: selected.turtlePath, modbusHost: selected.host, stationCode: selected.stationCode || active.stationCode, blockIndex: selected.blockIndex || active.blockIndex, notes: `${active.notes || ""}\nAuto-commissioned from identity-confirmed EMS ${selected.baseUrl} at ${new Date().toISOString()}.`.trim() });
      profileUpdated = true;
    }
  }
  status = { ...status, state: "connected", completedAt: new Date().toISOString(), probes, selected, profileUpdated, controlsPermitted: false, message: "Unique EMS identity found. Topology counts and endpoints must still reconcile before controls are commissioned." };
  return getSiteCommissioningStatus();
}

export function reconcileCommissionedSiteTopology(): SiteCommissioningStatus {
  status = { ...status, state: "reconciling", message: "Reconciling EMS topology, IP maps, and observed device counts." };
  const topology = buildSiteTopologyFromCachedSources();
  const preliminary = discoverSiteProfile(topology);
  const existing = listSiteProfileDrafts().find(item => item.siteKey === preliminary.siteKey && item.evidenceFingerprint === preliminary.evidenceFingerprint);
  const draft = existing || discoverSiteProfile(topology, nextSiteProfileRevision(preliminary.siteKey));
  if (!existing) saveSiteProfileDraft(draft);
  const allConfirmed = draft.lineups.length > 0 && draft.lineups.every(lineup => lineup.confidence === "confirmed");
  if (draft.conflicts.length || draft.unresolved.length || !allConfirmed) {
    status = { ...status, state: "ready-for-review", completedAt: new Date().toISOString(), topologyDraftId: draft.id, message: `Topology draft requires review (${draft.conflicts.length} conflicts, ${draft.unresolved.length} unresolved; all lineups confirmed: ${allConfirmed}).` };
    return getSiteCommissioningStatus();
  }
  const segmentCounts = [...new Set(draft.lineups.map(lineup => lineup.energySegmentCount))];
  const stringsPerSegment = [...new Set(draft.lineups.map(lineup => lineup.stringsPerEnergySegment))];
  if (segmentCounts.length !== 1 || !segmentCounts[0] || stringsPerSegment.length !== 1 || !stringsPerSegment[0]) {
    status = { ...status, state: "ready-for-review", completedAt: new Date().toISOString(), topologyDraftId: draft.id, message: "Observed lineups do not share one validated segment/string geometry." };
    return getSiteCommissioningStatus();
  }
  const active = ProfileStore.getActiveProfile();
  const existingModel = active.topologyModel || getDefaultTopologyModel();
  const arrayStart = Math.min(...draft.lineups.map(lineup => lineup.lineupIndex));
  const arrayEnd = Math.max(...draft.lineups.map(lineup => lineup.lineupIndex));
  const esCount = segmentCounts[0];
  ProfileStore.updateProfile(active.id, {
    arrayCount: draft.lineups.length,
    stringsPerArray: esCount * stringsPerSegment[0],
    topologyModel: {
      ...existingModel, type: "custom-manual", arrayStart, arrayEnd,
      segmentEnd: existingModel.esSegmentStart + (esCount - 1) * existingModel.esSegmentStep,
      esCountPerArray: esCount,
      blocks: existingModel.blocks.map((block, index) => index === 0 ? {
        ...block, stationCode: draft.stationCode || active.stationCode, emsHost: active.emsHost,
        emsPort: active.emsPort, turtlePath: active.turtlePath, modbusHost: active.modbusHost,
        arrayStart, arrayEnd, segmentEnd: block.esSegmentStart + (esCount - 1) * block.esSegmentStep,
        esCountPerArray: esCount
      } : block)
    }
  });
  activateSiteProfileDraft(draft.id);
  status = { ...status, state: "ready-for-review", completedAt: new Date().toISOString(), topologyDraftId: draft.id, profileUpdated: true, message: `Topology reconciled to ${draft.lineups.length} lineups, ${esCount} energy segments per lineup, and ${esCount * stringsPerSegment[0]} strings per lineup. Controls remain disabled pending commissioning approval.` };
  return getSiteCommissioningStatus();
}
