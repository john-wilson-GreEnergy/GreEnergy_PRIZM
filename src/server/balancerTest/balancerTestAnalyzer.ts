import { BalancerTestResultRow, BalancerTestAnalysis } from "./balancerTestTypes";
import { formatStringEsLabel } from "../../lib/stringToEsMapper";

export function analyzeReports(testIds: number[], rows: BalancerTestResultRow[], endpointBase: string): BalancerTestAnalysis {
  const totalCellGroups = rows.length;
  const confirmedBalances = rows.filter(r => r.balanceConfirmedOn).length;
  const warningCount = rows.filter(r => r.warning).length;

  const durations = rows.map(r => r.durationSec);
  const sortedDurations = [...durations].sort((a, b) => a - b);

  const minDurationSec = sortedDurations.length > 0 ? sortedDurations[0] : null;
  const maxDurationSec = sortedDurations.length > 0 ? sortedDurations[sortedDurations.length - 1] : null;
  const sumDurationSec = sortedDurations.reduce((sum, val) => sum + val, 0);
  const avgDurationSec = sortedDurations.length > 0 ? Number((sumDurationSec / sortedDurations.length).toFixed(2)) : null;

  let p95DurationSec: number | null = null;
  if (sortedDurations.length > 0) {
    const p95Idx = Math.floor(0.95 * (sortedDurations.length - 1) + 0.5);
    p95DurationSec = sortedDurations[p95Idx];
  }

  // Group array average durations
  const arrayGroups: Record<number, { sum: number; count: number }> = {};
  for (const row of rows) {
    if (row.array !== null) {
      if (!arrayGroups[row.array]) {
        arrayGroups[row.array] = { sum: 0, count: 0 };
      }
      arrayGroups[row.array].sum += row.durationSec;
      arrayGroups[row.array].count += 1;
    }
  }

  const arrayAverageDurations = Object.keys(arrayGroups)
    .map(Number)
    .map(arrNum => ({
      array: arrNum,
      avgDurationSec: Number((arrayGroups[arrNum].sum / arrayGroups[arrNum].count).toFixed(2)),
      count: arrayGroups[arrNum].count
    }))
    .sort((a, b) => a.array - b.array);

  // Group cell warnings: only if row.warning is true and none of array, stringNumber, bpc, cell is null
  const cellWarningGroups: Record<string, {
    array: number;
    stringNumber: number;
    energySegmentNumber: number;
    bpc: number;
    cell: number;
    warningCount: number;
  }> = {};

  for (const row of rows) {
    if (row.warning && row.array !== null && row.stringNumber !== null && row.bpc !== null && row.cell !== null) {
      const key = `${row.array}:${row.stringNumber}:${row.bpc}:${row.cell}`;
      if (!cellWarningGroups[key]) {
        cellWarningGroups[key] = {
          array: row.array,
          stringNumber: row.stringNumber,
          energySegmentNumber: row.energySegmentNumber || 0,
          bpc: row.bpc,
          cell: row.cell,
          warningCount: 0
        };
      }
      cellWarningGroups[key].warningCount += 1;
    }
  }

  const cellWarningCounts = Object.values(cellWarningGroups).sort((a, b) => {
    if (a.array !== b.array) return a.array - b.array;
    if (a.stringNumber !== b.stringNumber) return a.stringNumber - b.stringNumber;
    if (a.bpc !== b.bpc) return a.bpc - b.bpc;
    return a.cell - b.cell;
  });

  // Group BPC warnings: only if row.warning is true and none of block, array, stringNumber, bpc are null/empty
  const bpcWarningGroups: Record<string, {
    site: string;
    block: string;
    array: number;
    stringNumber: number;
    energySegmentNumber: number;
    bpc: number;
    warningCount: number;
  }> = {};

  for (const row of rows) {
    if (row.warning && row.array !== null && row.stringNumber !== null && row.bpc !== null) {
      const key = `${row.site}:${row.block}:${row.array}:${row.stringNumber}:${row.bpc}`;
      if (!bpcWarningGroups[key]) {
        bpcWarningGroups[key] = {
          site: row.site,
          block: row.block,
          array: row.array,
          stringNumber: row.stringNumber,
          energySegmentNumber: row.energySegmentNumber || 0,
          bpc: row.bpc,
          warningCount: 0
        };
      }
      bpcWarningGroups[key].warningCount += 1;
    }
  }

  const bpcWarningSummary = Object.values(bpcWarningGroups).map(group => {
    const blockNum = isNaN(Number(group.block)) ? undefined : Number(group.block);
    const label = formatStringEsLabel({
      blockIndex: blockNum,
      arrayNumber: group.array,
      stringNumber: group.stringNumber,
      energySegmentNumber: group.energySegmentNumber,
      includeBlock: true,
      compact: false
    });
    return {
      ...group,
      label
    };
  }).sort((a, b) => {
    if (a.array !== b.array) return a.array - b.array;
    if (a.stringNumber !== b.stringNumber) return a.stringNumber - b.stringNumber;
    return a.bpc - b.bpc;
  });

  const warningRows = rows.filter(r => r.warning);

  return {
    source: {
      testIds,
      fetchedAt: new Date().toISOString(),
      endpointBase
    },
    summary: {
      totalCellGroups,
      confirmedBalances,
      warningCount,
      minDurationSec,
      avgDurationSec,
      p95DurationSec,
      maxDurationSec
    },
    arrayAverageDurations,
    cellWarningCounts,
    bpcWarningSummary,
    warningRows,
    rows
  };
}
export { formatStringEsLabel };
