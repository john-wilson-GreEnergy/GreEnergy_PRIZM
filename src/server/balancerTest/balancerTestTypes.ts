export interface BalancerTestStatus {
  id: number;
  block: string;
  arrays: string[];
  direction: string;
  state: "PENDING" | "RUNNING" | "FINISHED" | "FAILED";
  progress: number;
  statusMessage: string;
  rawTargets: string;
  started: boolean;
  finished: boolean;
  raw: any;
}

export interface BalancerTestResultRow {
  durationSec: number;
  site: string;
  block: string;
  array: number | null;
  stringNumber: number | null;
  energySegmentNumber: number | null;
  bpc: number | null;
  cell: number | null;
  balanceConfirmedOn: boolean;
  warning: boolean;
  warningTriggerMessage?: string | null;
  warningTriggeredAfterBalance?: boolean;
  warningTriggeredTime?: string | null;
  cellGroupKey: string;
  balanceStart?: string;
  balanceEnd?: string;
  raw: any;
}

export interface BalancerTestAnalysis {
  source: {
    testIds: number[];
    fetchedAt: string;
    endpointBase: string;
  };
  summary: {
    totalCellGroups: number;
    confirmedBalances: number;
    warningCount: number;
    minDurationSec: number | null;
    avgDurationSec: number | null;
    p95DurationSec: number | null;
    maxDurationSec: number | null;
  };
  arrayAverageDurations: Array<{
    array: number;
    avgDurationSec: number;
    count: number;
  }>;
  cellWarningCounts: Array<{
    array: number;
    stringNumber: number;
    energySegmentNumber: number;
    bpc: number;
    cell: number;
    warningCount: number;
  }>;
  bpcWarningSummary: Array<{
    site: string;
    block: string;
    array: number;
    stringNumber: number;
    energySegmentNumber: number;
    bpc: number;
    warningCount: number;
    label: string;
  }>;
  warningRows: BalancerTestResultRow[];
  rows: BalancerTestResultRow[];
}
