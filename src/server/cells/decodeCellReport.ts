import {setImmediate as yieldTurn} from 'node:timers/promises';
import type {CellFrame, CellHistorySite, CellStringFrame} from '../../core/cellHistory';

type RecordValue = Record<string, unknown>;
const object = (v: unknown): RecordValue => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as RecordValue : {};
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
export function finiteNumber(v: unknown): number | null {
  if (typeof v !== 'number' && (typeof v !== 'string' || !/^-?\d+(\.\d+)?$/.test(v))) return null;
  const n = Number(v); return Number.isFinite(n) ? n : null;
}
const positiveInt = (v: unknown, max: number): number | null => {
  const n = finiteNumber(v); return n !== null && Number.isInteger(n) && n > 0 && n <= max ? n : null;
};
function lookup(indices: unknown[], values: unknown[], i: number): number | null {
  const index = indices[i];
  return typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < values.length ? finiteNumber(values[index]) : null;
}
export function cellReportIdentityMatches(raw: unknown, site: CellHistorySite): boolean {
  const block = object(object(raw).blockReport);
  return block.stationCode === site.stationCode && finiteNumber(block.blockIndex) === site.blockIndex;
}

/** Only the verified indexed lastCall format is accepted. Never guess direct-value units. */
export async function decodeCellReport(raw: unknown, site: CellHistorySite, acquiredAt: number): Promise<CellFrame> {
  if (!cellReportIdentityMatches(raw, site)) throw new Error('Cell report site identity does not match the active connection');
  const block = object(object(raw).blockReport);
  const frame: CellFrame = {schema: 1, site: {...site}, acquiredAt, reportAt: finiteNumber(block.timeStamp), strings: [], issues: []};
  const issue = (s: string) => { if (frame.issues.length < 32) frame.issues.push(s); };
  let total = 0;
  for (const [arrayKey, rawArray] of Object.entries(object(block.arrayReport))) {
    const array = positiveInt(arrayKey, 64);
    if (array === null) continue;
    const report = object(object(rawArray).cellGroupReportForArray);
    const volts = list(report.millivoltsLookup), temps = list(report.temperatureLookup), times = list(report.timeStampLookup);
    if (!volts.length || !temps.length || !times.length) { issue(`Array ${array}: indexed lookup tables unavailable`); continue; }
    for (const [stringKey, rawString] of Object.entries(object(report.condensedCellReportForString))) {
      const s = object(rawString), string = positiveInt(stringKey, 256);
      const bpcCount = positiveInt(s.batteryPackCount, 64), groupsPerBpc = positiveInt(s.cellGroupPerBatteryPackCount, 128);
      // Collection segments with no installed cell groups never enter this dataset.
      if (!string || !bpcCount || !groupsPerBpc) continue;
      if (finiteNumber(s.stringIndex) !== string) { issue(`Array ${array} string ${string}: identity mismatch`); continue; }
      const n = bpcCount * groupsPerBpc;
      if ((total += n) > 250_000) throw new Error('Cell report exceeds supported channel limit');
      const mv = list(s.millivolts), temp = list(s.temperatures), ts = list(s.timestamps);
      if ([mv, temp, ts].some(v => v.length !== n)) issue(`Array ${array} string ${string}: incomplete channel coverage`);
      const ignored = new Set<number>();
      let validIgnoreList = Array.isArray(s.ignoredTempSensors);
      for (const rawIgnored of list(s.ignoredTempSensors)) {
        const entry = object(rawIgnored), b = positiveInt(entry.batteryPackIndex, bpcCount), c = positiveInt(entry.cellGroupIndex, groupsPerBpc);
        if (!b || !c) validIgnoreList = false;
        else ignored.add((b - 1) * groupsPerBpc + c - 1);
      }
      if (!validIgnoreList) issue(`Array ${array} string ${string}: unknown ignored-sensor encoding; temperatures withheld`);
      const row: CellStringFrame = {array, string, bpcCount, groupsPerBpc, observedAt: [], millivolts: [], temperatureF: [], ignoredTemperatures: [...ignored]};
      for (let i = 0; i < n; i++) {
        const v = lookup(mv, volts, i), t = lookup(temp, temps, i), time = lookup(ts, times, i);
        row.millivolts.push(v !== null && v >= 0 && v < 10000 ? v : null);
        row.temperatureF.push(validIgnoreList && !ignored.has(i) && t !== null ? Math.round((t / 10 * 1.8 + 32) * 100) / 100 : null);
        row.observedAt.push(time !== null && Number.isSafeInteger(time) && time > 0 ? time : null);
      }
      frame.strings.push(row);
      await yieldTurn();
    }
  }
  if (!frame.strings.length) throw new Error('No verified indexed cell-group data in this report');
  return frame;
}
