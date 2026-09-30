import type {EnrolledTelemetrySite} from '../../core/security/readOnlyTelemetry';
import {normalizeContactorObservation, telemetryObject, type CanonicalContactorObservation} from '../normalizers/contactorObservation';

const endpoint = '/tools/report/ems/lastCall.json';
interface RecoveryString {
  readonly arrayNumber: number;
  readonly stringNumber: number;
  readonly communicating: boolean;
  readonly contactorObservation: Readonly<CanonicalContactorObservation> | null;
}
interface RecoverySnapshot {
  readonly cycleId: number;
  readonly siteIdentity: Readonly<{activeProfileId: string; stationCode: string; blockIndex: number; emsBaseUrl: string}>;
  readonly liveStatus: Readonly<{state: 'LIVE'; stale: false; lastUpdated: string}>;
  readonly normalized: Readonly<{strings: readonly RecoveryString[]; correctiveActions: readonly never[]}>;
}
export interface RecoveryAcquisition {
  cycleId: number;
  startedAt: number;
  acquiredAt: number;
  site: EnrolledTelemetrySite | null;
  success: boolean;
  fallbackUsed: boolean;
  attemptUrl?: string;
  data: unknown;
}
const sameSite = (a: EnrolledTelemetrySite | null, b: EnrolledTelemetrySite | null): boolean =>
  !!a && !!b && a.profileId === b.profileId && a.stationCode === b.stationCode && a.blockIndex === b.blockIndex && a.emsBaseUrl === b.emsBaseUrl;
const validSite = (site: EnrolledTelemetrySite | null): site is EnrolledTelemetrySite => !!site &&
  !!site.profileId && !!site.stationCode && !!site.emsBaseUrl && Number.isSafeInteger(site.blockIndex) && site.blockIndex > 0;

/** In-memory publication only. No transport, polling, persistence, control or raw payload retention. */
export class RecoveryTelemetryBroker {
  private latestCycle = 0;
  private snapshot: RecoverySnapshot | null = null;

  publish(result: RecoveryAcquisition, currentSite: EnrolledTelemetrySite | null): boolean {
    if (!Number.isSafeInteger(result.cycleId) || result.cycleId <= this.latestCycle) return false;
    this.latestCycle = result.cycleId;
    this.snapshot = null; // Failure/malformed input cannot leave older evidence eligible.
    const site = result.site;
    if (!validSite(site) || !sameSite(site, currentSite) || !result.success || result.fallbackUsed ||
        result.attemptUrl !== site.emsBaseUrl + endpoint || !Number.isSafeInteger(result.acquiredAt) ||
        !Number.isSafeInteger(result.startedAt) || result.startedAt <= 0 || result.acquiredAt < result.startedAt || result.acquiredAt > 8640000000000000) return false;
    const arrays = telemetryObject(telemetryObject(telemetryObject(result.data)?.blockReport)?.arrayReport);
    if (!arrays) return false;
    const rows: RecoveryString[] = [];
    for (const [arrayKey, rawArray] of Object.entries(arrays)) {
      const array = Number(arrayKey), entry = telemetryObject(rawArray), reports = telemetryObject(entry?.stringReport);
      if (!/^[1-9]\d*$/.test(arrayKey) || !Number.isSafeInteger(array) || entry?.arrayIndex !== array || !reports) return false;
      for (const [stringKey, rawString] of Object.entries(reports)) {
        const string = Number(stringKey), report = telemetryObject(rawString), data = telemetryObject(report?.stringData);
        if (!/^[1-9]\d*$/.test(stringKey) || !Number.isSafeInteger(string) || report?.arrayIndex !== array || report?.stringIndex !== string || !data || rows.length >= 10000) return false;
        const observation = normalizeContactorObservation(report, array, string);
        rows.push(Object.freeze({arrayNumber: array, stringNumber: string,
          communicating: ['ONLINE','NEARLINE','OFFLINE'].includes(String(data.stringConnectionState)),
          contactorObservation: observation ? Object.freeze(observation) : null}));
      }
    }
    if (!rows.length) return false;
    rows.sort((a,b) => a.arrayNumber-b.arrayNumber || a.stringNumber-b.stringNumber);
    this.snapshot = Object.freeze({cycleId: result.cycleId,
      siteIdentity: Object.freeze({activeProfileId: site.profileId, stationCode: site.stationCode, blockIndex: site.blockIndex, emsBaseUrl: site.emsBaseUrl}),
      liveStatus: Object.freeze({state: 'LIVE', stale: false, lastUpdated: new Date(result.acquiredAt).toISOString()}),
      normalized: Object.freeze({strings: Object.freeze(rows), correctiveActions: Object.freeze([] as never[])}),
    });
    return true;
  }

  read(site: EnrolledTelemetrySite): RecoverySnapshot | null {
    const identity = this.snapshot?.siteIdentity;
    if (!identity || !sameSite(site, {profileId: identity.activeProfileId, stationCode: identity.stationCode, blockIndex: identity.blockIndex, emsBaseUrl: identity.emsBaseUrl})) return null;
    return this.snapshot;
  }

  /** Counts/timing only for existing diagnostics; no raw source or account data. */
  diagnostics(now = Date.now()) {
    const snapshot = this.snapshot;
    const publishedAt = snapshot?.liveStatus.lastUpdated ?? null;
    const publicationAgeMs = publishedAt ? now-Date.parse(publishedAt) : null;
    let eligible = 0, stale = 0, ambiguous = 0, unavailable = 0;
    const ages: number[] = [];
    for (const row of snapshot?.normalized.strings ?? []) {
      const observation = row.contactorObservation;
      if (!row.communicating || !observation) {unavailable++;continue;}
      const age = now-Date.parse(observation.observedAt);ages.push(age);
      if (!Number.isFinite(age) || age < 0 || age >= 15000 || publicationAgeMs === null || publicationAgeMs < 0 || publicationAgeMs >= 15000) stale++;
      else if (observation.positiveContactorClosed !== observation.negativeContactorClosed) ambiguous++;
      else eligible++;
    }
    return {available:!!snapshot, cycleId:snapshot?.cycleId ?? null,publishedAt,publicationAgeMs,
      strings:snapshot?.normalized.strings.length ?? 0,eligible,stale,ambiguous,unavailable,
      minObservationAgeMs:ages.length ? Math.min(...ages) : null,maxObservationAgeMs:ages.length ? Math.max(...ages) : null};
  }
}

export const recoveryTelemetryBroker = new RecoveryTelemetryBroker();

/** Rollback never disables authentication or relaxes any observation validation. */
export function recoveryTelemetrySource(mode: string | undefined, site: EnrolledTelemetrySite, legacy: () => unknown): unknown {
  return mode === 'false' ? legacy() : recoveryTelemetryBroker.read(site);
}
