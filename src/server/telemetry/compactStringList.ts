import {randomUUID} from 'node:crypto';
import type {DomainPublication} from '../domainBrokers/EntityDomainBroker';

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
