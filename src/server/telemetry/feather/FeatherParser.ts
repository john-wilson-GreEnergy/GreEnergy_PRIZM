import { ProfileStore } from "../../profiles/profileStore";
import { normalizeDirectFeatherStatus } from "../../feather/deviceEnrichment";
import { mergeFeatherReadOnlyPayloads } from "../../feather/featherClient";
import { normalizeFeatherStatus } from "../../feather/featherNormalizer";
import { immutableClone } from "./FeatherCache";
import type { FeatherCandidate, FeatherParsedSnapshot, FeatherRawSnapshot } from "./FeatherTypes";

export const FEATHER_PARSER_VERSION = "1";

export class FeatherParser {
  private readonly parsed = new Map<string, FeatherParsedSnapshot>();
  constructor(private readonly now: () => number = Date.now, private readonly monotonicNow: () => number = () => performance.now()) {}

  parse(raw: FeatherRawSnapshot, candidate: FeatherCandidate): { snapshot: FeatherParsedSnapshot; reused: boolean } | null {
    if (!raw.combinedFingerprint || !raw.reportPayload) return null;
    const previous = this.parsed.get(raw.deviceIp);
    if (previous?.sourceFingerprint === raw.combinedFingerprint) {
      return { snapshot: immutableClone({ ...previous, cycleId: raw.cycleId, stale: raw.stale, provenance: { ...previous.provenance, sourceObservationAt: raw.sourceObservationAt } }), reused: true };
    }
    const profile = ProfileStore.getActiveProfile();
    const activeProfileId = profile?.id ?? "default-local-ems";
    const activeProfileName = profile?.profileName ?? "PRIZM Core Hardware Bess Profile";
    const activeEmsBaseUrl = profile ? `${profile.emsHost}:${profile.emsPort}` : "10.0.0.3:8080";
    const startedAt = this.monotonicNow();
    const merged = mergeFeatherReadOnlyPayloads(raw.reportPayload, raw.mainDataPayload);
    if (raw.mainDataPayload == null && raw.lastError) (merged as any)._mainDataError = raw.lastError;
    const normalized = normalizeFeatherStatus(raw.deviceIp, true, raw.totalLatencyMs, merged, null, activeProfileId, activeProfileName, activeEmsBaseUrl, candidate.sourceDiscoveryMethod, candidate);
    const enrichment = normalizeDirectFeatherStatus(raw.deviceIp, merged);
    const snapshot: FeatherParsedSnapshot = immutableClone({
      deviceIp: raw.deviceIp, parsedAt: new Date(this.now()).toISOString(), parseDurationMs: this.monotonicNow() - startedAt,
      parserVersion: FEATHER_PARSER_VERSION, sourceFingerprint: raw.combinedFingerprint, cycleId: raw.cycleId, stale: raw.stale,
      provenance: { source: "feather-scheduler", reportSourceUrl: raw.reportSourceUrl, mainDataSourceUrl: raw.mainDataSourceUrl, sourceObservationAt: raw.sourceObservationAt },
      normalized, enrichment,
    });
    this.parsed.set(raw.deviceIp, snapshot);
    return { snapshot: immutableClone(snapshot), reused: false };
  }
  get(deviceIp: string): FeatherParsedSnapshot | null { const value = this.parsed.get(deviceIp); return value ? immutableClone(value) : null; }
  getPrioritySignals(deviceIp: string): { activeIssue: boolean; reachable: boolean } | null {
    const value = this.parsed.get(deviceIp);
    return value ? { activeIssue: value.normalized.alarmCount > 0 || value.normalized.warningCount > 0, reachable: value.normalized.reachable } : null;
  }
  values(): FeatherParsedSnapshot[] { return [...this.parsed.values()].map(immutableClone); }
  clear(): void { this.parsed.clear(); }
  get size(): number { return this.parsed.size; }
}
