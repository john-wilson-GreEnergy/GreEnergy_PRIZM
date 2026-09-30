import type {ReadOnlyTelemetry, ReadOnlyString, EnrolledTelemetrySite} from '../../core/security/readOnlyTelemetry';
import {AccessError} from './localSessions';
import type {RecoveryObservation} from '../../core/security/commandRecovery';

export type {EnrolledTelemetrySite} from '../../core/security/readOnlyTelemetry';
const object = (value: unknown): Record<string,unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : {};
const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.slice(0,1000) : null;
const count = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

/** Exact canonical contactor feedback only; ONLINE/rotation never imply switch position. */
export function recoveryObservation(source:unknown,enrolled:EnrolledTelemetrySite,array:number,string:number,now=Date.now()):RecoveryObservation {
  const view=readOnlyTelemetry(source,enrolled,now);
  if(view.stale || !view.strings.some(row=>row.array===array && row.string===string && !row.stale)) throw new AccessError(409,'Fresh target telemetry required');
  const rows=object(object(source).normalized).strings as unknown[];
  const row=object(rows.find(value=>{const item=object(value);return (item.arrayIndex ?? item.arrayNumber)===array && (item.stringIndex ?? item.stringNumber)===string;}));
  const canonical=Object.prototype.hasOwnProperty.call(row,'contactorObservation');
  const feedback=object(canonical ? row.contactorObservation : row.contactor);
  const capturedAt=Date.parse(String((canonical ? feedback.observedAt : feedback.fetchedAt) ?? ''));
  const pos=feedback.positiveContactorClosed,neg=feedback.negativeContactorClosed;
  const validSource=canonical ? feedback.source==='last-call-explicit-polarity' : feedback.quality==='live';
  if(!validSource || feedback.arrayNumber!==array || feedback.stringNumber!==string || !Number.isFinite(capturedAt) || capturedAt>now || now-capturedAt>=15000 ||
    typeof pos!=='boolean' || typeof neg!=='boolean' || pos!==neg || (!canonical && feedback.actualState!==(pos?'closed':'open'))) throw new AccessError(409,'Fresh unambiguous contactor feedback required');
  return {actual:pos?'closed':'open',requested:feedback.requestedState==='closed'?'closed':feedback.requestedState==='open'?'open':'unknown',capturedAt};
}

/** Pure allowlisted view of a canonical snapshot; never calls a device or exposes rawSources. */
export function readOnlyTelemetry(source: unknown, enrolled: EnrolledTelemetrySite, now = Date.now()): ReadOnlyTelemetry {
  const snapshot = object(source), identity = object(snapshot.siteIdentity), live = object(snapshot.liveStatus);
  if (!source) throw new AccessError(503,'Telemetry is warming');
  if (identity.activeProfileId !== enrolled.profileId || identity.stationCode !== enrolled.stationCode || identity.blockIndex !== enrolled.blockIndex || identity.emsBaseUrl !== enrolled.emsBaseUrl) throw new AccessError(409,'Telemetry site does not match enrollment');
  const normalized = object(snapshot.normalized);
  if (!Number.isSafeInteger(snapshot.cycleId) || Number(snapshot.cycleId) < 1 || !Array.isArray(normalized.strings) || !Array.isArray(normalized.correctiveActions) || normalized.strings.length > 10000 || normalized.correctiveActions.length > 10000) throw new AccessError(503,'Canonical telemetry unavailable');
  const stamp = text(live.lastUpdated), time = stamp ? Date.parse(stamp) : NaN;
  const ageMs = Number.isFinite(time) && time <= now ? now-time : null;
  const state = ['LIVE','PARTIAL','CACHED','OFFLINE'].includes(String(live.state)) ? live.state as ReadOnlyTelemetry['state'] : 'UNKNOWN';
  const stale = live.stale !== false || state !== 'LIVE' || ageMs === null || ageMs > 15000;
  const keys = new Set<string>();
  const strings: ReadOnlyString[] = normalized.strings.map(value => {
    const row = object(value), array = count(row.arrayIndex ?? row.arrayNumber), string = count(row.stringIndex ?? row.stringNumber);
    if (!array || !string || keys.has(`${array}:${string}`)) throw new AccessError(503,'Invalid canonical string identity');
    keys.add(`${array}:${string}`);
    return {array,string,state:text(row.connectionState ?? row.stringConnectionState ?? row.operationalState),
      soc:number(row.socPct ?? row.soc), voltage:number(row.measuredVoltageVdc ?? row.measuredStringVoltage ?? row.measuredVoltage),
      current:number(row.currentA ?? row.amps), power:number(row.powerKw ?? row.kw),
      warnings:count(row.warningCount ?? row.warnCount), alarms:count(row.alarmCount),
      stale:stale || row.stale === true || row.staleData === true || row.communicating === false};
  }).sort((a,b)=>a.array-b.array || a.string-b.string);
  const sum = (key: 'warnings'|'alarms') => strings.length && strings.every(row=>row[key] !== null) ? strings.reduce((total,row)=>total+row[key]!,0) : null;
  return {site:{name:text(identity.activeProfileName) ?? enrolled.stationCode,station:enrolled.stationCode,block:enrolled.blockIndex},
    cycle:Number(snapshot.cycleId),capturedAt:ageMs === null ? null : stamp,ageMs,state,stale,strings,
    counts:{strings:strings.length,arrays:new Set(strings.map(row=>row.array)).size,warnings:sum('warnings'),alarms:sum('alarms')},
    issues:normalized.correctiveActions.map(value=>{const row=object(value);return {severity:text(row.severity ?? row.priority) ?? 'unknown',title:text(row.title ?? row.displayText ?? row.message) ?? 'Unclassified issue',location:text(row.location ?? row.canonicalKey) ?? 'Site'};})};
}
