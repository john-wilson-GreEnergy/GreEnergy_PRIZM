import type { StringViewerCacheEntry } from './StringViewerTypes';
import {normalizeSocPercent} from '../../../core/socPercent';

type Row = Record<string, unknown>;
const time = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const present = (value: unknown) => value !== null && value !== undefined && value !== '';

/** Cached detail must not roll back a newer baseline. Missing detail fields
 * remain available, with their own provenance, without changing row freshness.
 */
export function mergeMonitorFields(row: Row, sv: Row, entry?: Pick<StringViewerCacheEntry,'stale'|'success'>): void {
  const baselineAt = time(row.sourceTimestampUtc ?? row.timestampUtc);
  const detailAt = time(sv.reportTimestamp);
  const legacy = process.env.PRIZM_STRING_FRESHNESS_AUTHORITY === 'false';
  const authoritative = legacy || ((!entry || entry.success && !entry.stale) &&
    detailAt !== null && (baselineAt === null || detailAt >= baselineAt));
  const values: Row = {
    busVoltage:sv.dcBusVoltage, outRotation:sv.outRotation,
    positiveContactorClosed:sv.positiveContactorClosed, negativeContactorClosed:sv.negativeContactorClosed,
    contactorsCloseExpected:sv.contactorsCloseExpected, recloseCount:sv.recloseCount, badReport:sv.badReport,
    fanRequested:sv.lastFanCommand ?? sv.fanCommand ?? sv.requestedFanCommand ?? sv.stringFanRequested,
    fanActual:sv.fanActual ?? sv.fanState ?? sv.fanStatus ?? sv.fanSpeed ?? sv.fanSpeedRpm ?? sv.stringFanActual,
    socPct:normalizeSocPercent(sv.soc), measuredVoltage:sv.measuredStringVoltage, calculatedVoltage:sv.calculatedStringVoltage,
    minCellVoltage:sv.minCellGroupVoltage, maxCellVoltage:sv.maxCellGroupVoltage, avgCellVoltage:sv.avgCellGroupVoltage,
    minCellTemperature:sv.minCellGroupTemp, maxCellTemperature:sv.maxCellGroupTemp, avgCellTemperature:sv.avgCellGroupTemp,
    amps:sv.stringCurrent, bpcCount:sv.batteryPackCount, cellGroupCount:sv.cellGroupCount,
    operationalState:sv.stringConnectionState
  };
  const fallbackFields: string[] = [];
  for (const [key,value] of Object.entries(values)) {
    if (!present(value)) continue;
    if (authoritative) row[key] = value;
    else if (key !== 'socPct' && !present(row[key])) { row[key] = value; fallbackFields.push(key); }
  }
  // Do not make an older record fresh by replacing its observation timestamp.
  if (authoritative && detailAt !== null) row.timestampUtc = sv.reportTimestamp;
  row.stringViewerFreshness = {
    sourceTimestamp: typeof sv.reportTimestamp === 'string' ? sv.reportTimestamp : null,
    stale: entry?.stale === true || !authoritative,
    authority: authoritative ? 'newer-detail' : 'baseline-preserved', fallbackFields
  };
}
