import { BalancerTestResultRow, BalancerTestAnalysis, BalancerTestCorrelatedWarning } from "./balancerTestTypes";
import { formatStringEsLabel, stringNumberToEnergySegment } from "../../lib/stringToEsMapper";
import { getNormalizedStringFaults } from "../faults/normalizedFaultSource";

export function analyzeReports(testIds: number[], rows: BalancerTestResultRow[], endpointBase: string): BalancerTestAnalysis {
  const totalCellGroups = rows.length;
  const confirmedBalances = rows.filter(r => r.balanceConfirmedOn).length;
  const reportWarningCount = rows.filter(r => r.warning).length;

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

  // --- Add Live Notification / Corrective Action Correlation ---
  const correlatedWarnings: BalancerTestCorrelatedWarning[] = [];
  const targetArrays = Array.from(new Set(rows.map(r => r.array).filter((a): a is number => a !== null)));
  const targetBlocks = Array.from(new Set(rows.map(r => r.block).filter(Boolean)));

  const liveStringFaults = getNormalizedStringFaults();

  const balancerCodes = ["2073", "2074"];
  const bpcDisconnectCodes = ["1024", "2024"];

  let debugCurrentCorrectiveActionCount = 0;
  let debugMatchedWarningCodesCount = 0;
  let debugUnmatchedWarningCodesCount = 0;
  const matchedWarningCodes: string[] = [];
  const unmatchedWarningCodes: string[] = [];

  for (const f of liveStringFaults) {
    let inScope = false;
    let confidence: "high" | "medium" | "low" = "low";

    if (targetArrays.length > 0) {
      if (targetArrays.includes(f.arrayIndex)) {
        inScope = true;
        confidence = "high";
      }
    } else {
      if (targetBlocks.length > 0) {
        if (targetBlocks.includes(String(f.blockIndex))) {
          inScope = true;
          confidence = "low";
        }
      } else {
        inScope = true;
        confidence = "low";
      }
    }

    if (!inScope) {
      continue;
    }

    const allFaults = [
      ...f.rawWarnings.map(c => ({ code: c, type: "WARNING" as const })),
      ...f.rawAlarms.map(c => ({ code: c, type: "ALARM" as const }))
    ];

    debugCurrentCorrectiveActionCount += allFaults.length;

    for (const fault of allFaults) {
      const { code, type } = fault;
      const isBalancerCode = balancerCodes.includes(String(code));
      const isBpcDisconnectCode = bpcDisconnectCodes.includes(String(code));

      if (isBalancerCode || isBpcDisconnectCode) {
        debugMatchedWarningCodesCount++;
        matchedWarningCodes.push(String(code));

        let title = "";
        let reason = "";
        let severity: "WARNING" | "ALARM" | "INFO" = "WARNING";

        if (String(code) === "2074") {
          title = "CellGroup Charge Balancer Warning";
          reason = "CellGroup Charge Balancer Warning active on the string";
          severity = "WARNING";
        } else if (String(code) === "2073") {
          title = "CellGroup Discharge Balancer Warning";
          reason = "CellGroup Discharge Balancer Warning active on the string";
          severity = "WARNING";
        } else if (String(code) === "2024") {
          title = "BPC Disconnect Warning";
          reason = "BPC communication/disconnect issue detected in live site notifications on target array";
          severity = "WARNING";
        } else if (String(code) === "1024") {
          title = "BPC Disconnect Alarm";
          reason = "BPC communication/disconnect issue detected in live site notifications on target array";
          severity = "ALARM";
        }

        const label = formatStringEsLabel({
          blockIndex: f.blockIndex,
          arrayNumber: f.arrayIndex,
          stringNumber: f.stringIndex,
          energySegmentNumber: stringNumberToEnergySegment(f.stringIndex),
          includeBlock: true,
          compact: false
        });

        correlatedWarnings.push({
          source: isBalancerCode ? "live-notification" : "corrective-action",
          confidence,
          code: isNaN(Number(code)) ? code : Number(code),
          severity,
          title,
          rawMessage: `BESS status code ${code} active on String ${f.stringIndex}`,
          block: f.blockIndex ?? 1,
          arrayNumber: f.arrayIndex,
          stringNumber: f.stringIndex,
          energySegmentNumber: stringNumberToEnergySegment(f.stringIndex),
          bpc: null,
          cell: null,
          label,
          reason,
          testIds,
          detectedAt: f.sourceTimestamp || new Date().toISOString(),
          raw: f
        });
      } else {
        debugUnmatchedWarningCodesCount++;
        unmatchedWarningCodes.push(String(code));
      }
    }
  }

  // Debug outputs
  console.log(`[BalancerTestAnalyzer Debug] selected testIds: [${testIds.join(", ")}]`);
  console.log(`[BalancerTestAnalyzer Debug] selected target arrays: [${targetArrays.join(", ")}]`);
  console.log(`[BalancerTestAnalyzer Debug] native report warning count: ${reportWarningCount}`);
  console.log(`[BalancerTestAnalyzer Debug] current corrective action count: ${debugCurrentCorrectiveActionCount}`);
  console.log(`[BalancerTestAnalyzer Debug] correlated warning count: ${correlatedWarnings.length}`);
  console.log(`[BalancerTestAnalyzer Debug] matched warning codes: [${matchedWarningCodes.join(", ")}]`);
  console.log(`[BalancerTestAnalyzer Debug] unmatched warning codes: [${unmatchedWarningCodes.join(", ")}]`);

  const balancerCodeWarningCount = correlatedWarnings.filter(w => balancerCodes.includes(String(w.code))).length;
  const relatedBpcIssueCount = correlatedWarnings.filter(w => bpcDisconnectCodes.includes(String(w.code))).length;
  const warningCount = reportWarningCount + balancerCodeWarningCount + relatedBpcIssueCount;

  const combinedWarningRows = [
    ...warningRows.map(r => ({
      source: "balancer-report" as const,
      confidence: "high" as const,
      code: undefined,
      severity: "WARNING" as const,
      title: r.warningTriggerMessage || "Voltage gap too large",
      rawMessage: r.warningTriggerMessage || "Report warning message",
      block: r.block,
      arrayNumber: r.array,
      stringNumber: r.stringNumber,
      energySegmentNumber: r.energySegmentNumber,
      bpc: r.bpc,
      cell: r.cell,
      label: formatStringEsLabel({
        blockIndex: isNaN(Number(r.block)) ? undefined : Number(r.block),
        arrayNumber: r.array || undefined,
        stringNumber: r.stringNumber || undefined,
        energySegmentNumber: r.energySegmentNumber || undefined,
        includeBlock: true,
        compact: false
      }),
      reason: r.warningTriggerMessage || "Report warning message",
      testIds,
      detectedAt: r.warningTriggeredTime || null,
      raw: r
    })),
    ...correlatedWarnings
  ];

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
      reportWarningCount,
      correlatedWarningCount: balancerCodeWarningCount,
      balancerCodeWarningCount,
      relatedBpcIssueCount,
      minDurationSec,
      avgDurationSec,
      p95DurationSec,
      maxDurationSec
    },
    arrayAverageDurations,
    cellWarningCounts,
    bpcWarningSummary,
    warningRows,
    correlatedWarnings,
    combinedWarningRows,
    rows
  };
}

export { formatStringEsLabel };
