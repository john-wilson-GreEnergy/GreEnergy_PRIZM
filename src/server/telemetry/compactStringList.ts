import {randomUUID} from 'node:crypto';
import type {DomainPublication} from '../domainBrokers/EntityDomainBroker';
import type {EntityDomainBroker} from '../domainBrokers/EntityDomainBroker';

export const stringTransportEpoch = randomUUID();
type Row = Record<string, unknown>;
const object = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const balanceKeys = ['bpIndex','bpcNumber','mode','displayState','state','missingFromSource',
  'balancingCellGroup','isActive','balanceTelemetryPresent'] as const;

/** Lossless for all list consumers; original records remain in the broker. */
export function compactStringRow(row: Row): Row {
  const {raw, balancing, sourceDebug, balanceDetails, ...result} = row;
  const reason = object(object(sourceDebug).canonicalStringSnapshot).reason;
  if (reason !== undefined) result.sourceDebug = {canonicalStringSnapshot:{reason}};
  if (Array.isArray(balanceDetails)) result.balanceDetails = balanceDetails.map(value => {
    const source = object(value);
    return Object.fromEntries(balanceKeys.filter(key => key in source).map(key => [key,source[key]]));
  });
  else if (balanceDetails !== undefined) result.balanceDetails = balanceDetails;
  return result;
}
export function compactStringView<T extends {strings?: Row[]}>(view:T) {
  return {...view, transportEpoch:stringTransportEpoch, shape:'string-list-v1',
    strings:(view.strings || []).map(compactStringRow)};
}
export function compactStringPublication(publication:DomainPublication<Row>) {
  return {...publication,transportEpoch:stringTransportEpoch,
    changes:publication.changes.map(change=>({...change,row:compactStringRow(change.row)}))};
}

export const compactProjectionEnabled = () => process.env.PRIZM_COMPACT_STRING_PROJECTION !== 'false';

/** Same compact contract, without first cloning the full fleet's diagnostics. */
export function projectCompactStringView<T extends {strings?: Row[]; capturedAt?: string | null}>(
  view: T, broker: EntityDomainBroker<Row>, optimized = compactProjectionEnabled(),
) {
  const snapshot = optimized ? broker.projectSnapshot(compactStringRow) : broker.snapshot();
  const {strings: _strings, ...metadata} = view;
  const rows = snapshot.rows.length > 0 ? snapshot.rows : (view.strings || []).map(compactStringRow);
  if (!optimized) return compactStringView(structuredClone(snapshot.rows.length > 0
    ? {...view, brokerVersion: snapshot.version, capturedAt: snapshot.capturedAt || view.capturedAt, strings: snapshot.rows}
    : view));
  return {
    ...structuredClone(metadata),
    ...(snapshot.rows.length > 0 ? {brokerVersion: snapshot.version, capturedAt: snapshot.capturedAt || view.capturedAt} : {}),
    transportEpoch: stringTransportEpoch, shape: 'string-list-v1',
    strings: snapshot.rows.length > 0 ? rows : structuredClone(rows),
  };
}
